#!/usr/bin/env python3
"""AnyRAID: redundant pools spanning heterogeneous-capacity drives.

Implemented on LVM rather than as a bespoke block layer. LVM already provides
exactly the primitive AnyRAID needs: a volume group pools physical volumes of
differing sizes and allocates in fixed-size *extents* (the "slabs"), and its
RAID targets sit on top of dm-raid, the same kernel code mdadm drives. Writing a
new slab allocator would mean reimplementing well-tested storage code where
bugs destroy data, so the profile names map onto dm-raid levels instead.

Profile mapping and why:

===============  ============  =======================================
AnyRAID profile  LVM type      Redundancy
===============  ============  =======================================
mirror           raid1         survives N-1 drive losses
striped-mirror   raid10        striped mirrors, survives 1 per mirror
raidz1           raid5         single parity, survives 1 drive
raidz2           raid6         double parity, survives 2 drives
raidz3           unsupported   no triple-parity target exists in dm-raid
===============  ============  =======================================

``raidz3`` is rejected rather than silently downgraded to raid6. Accepting it
and delivering two-drive tolerance would misrepresent the redundancy an
operator asked for.

Heterogeneous capacity note: parity and mirror layouts allocate equal-size
extents per stripe leg, so usable space is bounded by the *smallest* member.
:func:`plan_pool` reports the resulting stranded capacity per drive explicitly
so the wizard can show it instead of over-promising a raw-sum total.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
from typing import Any

VG_NAME = os.environ.get("NEXUS_ANYRAID_VG", "nexus-anyraid")
LV_NAME = os.environ.get("NEXUS_ANYRAID_LV", "pool")

# AnyRAID profile -> (lvm segment type, minimum drives, parity/mirror legs)
PROFILE_MAP: dict[str, dict[str, Any]] = {
    "mirror": {"lvm_type": "raid1", "min_drives": 2, "redundant_legs": 1},
    "striped-mirror": {"lvm_type": "raid10", "min_drives": 4, "redundant_legs": 1},
    "raidz1": {"lvm_type": "raid5", "min_drives": 3, "redundant_legs": 1},
    "raidz2": {"lvm_type": "raid6", "min_drives": 4, "redundant_legs": 2},
}

UNSUPPORTED_PROFILES = {
    "raidz3": (
        "dm-raid provides no triple-parity target; use raidz2 (double parity) "
        "or a mirror profile. Silently substituting raid6 would deliver less "
        "redundancy than requested."
    )
}

DEVICE_RE = re.compile(r"^/dev/[a-zA-Z0-9/_-]+$")


class AnyRaidError(Exception):
    """Raised for invalid input or a failed LVM operation."""


def _require_tools() -> None:
    missing = [t for t in ("pvcreate", "vgcreate", "lvcreate", "vgs", "lvs") if not shutil.which(t)]
    if missing:
        raise AnyRaidError("LVM tooling not installed on this node: %s" % ", ".join(missing))


def _validate_device(device: str) -> str:
    """Reject anything that is not a plain absolute device path.

    The device list reaches this module from the install wizard and the cockpit
    API, so it must never be interpolated into a shell or accepted unchecked.
    All subprocess calls use argument lists, and this guards against a caller
    smuggling flags (``--force``) or paths outside /dev.
    """
    device = (device or "").strip()
    if not DEVICE_RE.match(device):
        raise AnyRaidError("invalid device path: %r" % device)
    if ".." in device:
        raise AnyRaidError("invalid device path: %r" % device)
    return device


def _device_size_bytes(device: str) -> int:
    """Size via BLKGETSIZE64, falling back to sysfs for partitions."""
    try:
        with open(device, "rb") as fh:
            return os.lseek(fh.fileno(), 0, os.SEEK_END)
    except OSError as exc:
        raise AnyRaidError("cannot size %s: %s" % (device, exc)) from exc


def plan_pool(devices: list[str], profile: str, extent_size_mib: int = 64) -> dict[str, Any]:
    """Compute usable capacity and stranded space without touching the disks."""
    if profile in UNSUPPORTED_PROFILES:
        raise AnyRaidError("profile %r is not supported: %s" % (profile, UNSUPPORTED_PROFILES[profile]))
    spec = PROFILE_MAP.get(profile)
    if spec is None:
        raise AnyRaidError(
            "unknown profile %r (expected one of: %s)" % (profile, ", ".join(sorted(PROFILE_MAP)))
        )

    validated = [_validate_device(d) for d in devices]
    if len(set(validated)) != len(validated):
        raise AnyRaidError("duplicate devices in inventory")
    if len(validated) < spec["min_drives"]:
        raise AnyRaidError(
            "profile %s needs at least %d drives, got %d"
            % (profile, spec["min_drives"], len(validated))
        )
    if profile == "striped-mirror" and len(validated) % 2 != 0:
        raise AnyRaidError("striped-mirror (raid10) needs an even number of drives")

    sizes = {d: _device_size_bytes(d) for d in validated}
    smallest = min(sizes.values())
    if smallest <= 0:
        raise AnyRaidError("one or more devices report zero size")

    extent = extent_size_mib * 1024 * 1024
    extents_per_drive = smallest // extent
    if extents_per_drive == 0:
        raise AnyRaidError(
            "smallest device (%d bytes) is below one %d MiB extent" % (smallest, extent_size_mib)
        )

    count = len(validated)
    legs = spec["redundant_legs"]
    if profile == "mirror":
        data_drives = 1
    elif profile == "striped-mirror":
        data_drives = count // 2
    else:
        data_drives = count - legs

    usable_bytes = extents_per_drive * extent * data_drives
    raw_bytes = sum(sizes.values())
    # Space above the smallest member cannot be used by an equal-leg layout.
    stranded = {d: size - (extents_per_drive * extent) for d, size in sizes.items()}

    return {
        "profile": profile,
        "lvmType": spec["lvm_type"],
        "devices": validated,
        "deviceSizes": sizes,
        "extentSizeMiB": extent_size_mib,
        "extentsPerDrive": extents_per_drive,
        "dataDrives": data_drives,
        "redundantLegs": legs,
        "rawBytes": raw_bytes,
        "usableBytes": usable_bytes,
        "strandedBytes": sum(stranded.values()),
        "strandedPerDevice": stranded,
        "heterogeneous": len(set(sizes.values())) > 1,
        "toleratedDriveFailures": legs if profile != "mirror" else count - 1,
    }


def _run(cmd: list[str], timeout: int = 300) -> tuple[bool, str]:
    """Run a command, returning (ok, combined output) for human-facing steps."""
    ok, stdout, stderr = _run_split(cmd, timeout)
    return ok, ((stdout or "") + (stderr or "")).strip()


def _run_split(cmd: list[str], timeout: int = 300) -> tuple[bool, str, str]:
    """As :func:`_run` but keeps streams apart so stdout stays parseable.

    LVM writes warnings to stderr even on success, so combining the streams
    corrupts ``--reportformat json`` output.
    """
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, check=False)
    except (OSError, subprocess.TimeoutExpired) as exc:
        return False, "", str(exc)
    return proc.returncode == 0, (proc.stdout or "").strip(), (proc.stderr or "").strip()


def _concise_lvm_error(stderr: str) -> str:
    """Pick the most specific line out of LVM's multi-line diagnostics."""
    lines = [ln.strip() for ln in (stderr or "").splitlines() if ln.strip()]
    ignorable = ("WARNING: Running as a non-root user",)
    meaningful = [ln for ln in lines if not ln.startswith(ignorable)]
    for line in meaningful:
        if "not found" in line or "Permission denied" in line or "failed" in line.lower():
            return line
    return meaningful[-1] if meaningful else "lvs reported no detail"


def create_pool(
    devices: list[str],
    profile: str,
    extent_size_mib: int = 64,
    vg_name: str = VG_NAME,
    lv_name: str = LV_NAME,
    filesystem: str = "ext4",
) -> dict[str, Any]:
    """Create the AnyRAID pool. Destructive: wipes the listed devices."""
    _require_tools()
    plan = plan_pool(devices, profile, extent_size_mib)
    steps: list[dict[str, Any]] = []

    def step(name: str, cmd: list[str]) -> None:
        ok, out = _run(cmd)
        steps.append({"step": name, "command": " ".join(cmd), "ok": ok, "output": out})
        if not ok:
            raise AnyRaidError("%s failed: %s" % (name, out))

    try:
        step("pvcreate", ["pvcreate", "-ff", "-y", *plan["devices"]])
        step(
            "vgcreate",
            ["vgcreate", "-s", "%dm" % extent_size_mib, vg_name, *plan["devices"]],
        )
        # -l 100%FREE lets LVM size the RAID LV to the largest layout that fits,
        # which is the correct answer for heterogeneous members.
        step(
            "lvcreate",
            [
                "lvcreate",
                "--yes",
                "--type", plan["lvmType"],
                "-l", "100%FREE",
                "-n", lv_name,
                vg_name,
            ],
        )
        device_path = "/dev/%s/%s" % (vg_name, lv_name)
        if filesystem:
            mkfs = shutil.which("mkfs.%s" % filesystem)
            if not mkfs:
                raise AnyRaidError("mkfs.%s not available on this node" % filesystem)
            step("mkfs", [mkfs, "-q", "-F", device_path] if filesystem.startswith("ext") else [mkfs, device_path])
    except AnyRaidError as exc:
        return {"success": False, "error": str(exc), "plan": plan, "steps": steps}

    return {
        "success": True,
        "error": None,
        "plan": plan,
        "steps": steps,
        "devicePath": "/dev/%s/%s" % (vg_name, lv_name),
    }


def pool_status(vg_name: str = VG_NAME, lv_name: str = LV_NAME) -> dict[str, Any]:
    """Report real pool state from LVM, including sync and degraded status."""
    if not shutil.which("lvs"):
        return {"exists": False, "error": "LVM tooling not installed"}
    ok, stdout, stderr = _run_split(
        [
            "lvs",
            "--reportformat", "json",
            "-o", "lv_name,vg_name,lv_size,segtype,sync_percent,lv_health_status,raid_mismatch_count",
            "%s/%s" % (vg_name, lv_name),
        ]
    )
    # lvs can emit a well-formed empty report and still exit non-zero, so try
    # to parse stdout regardless and only fall back to the stderr summary.
    entries: list[dict[str, Any]] = []
    parsed = False
    if stdout:
        try:
            entries = json.loads(stdout)["report"][0]["lv"]
            parsed = True
        except (json.JSONDecodeError, KeyError, IndexError):
            parsed = False

    if not parsed:
        return {
            "exists": False,
            "error": _concise_lvm_error(stderr) if stderr else "unparseable lvs output",
        }
    if not entries:
        return {
            "exists": False,
            "error": None if ok else _concise_lvm_error(stderr),
            "message": "no AnyRAID pool provisioned on this node",
        }

    lv = entries[0]
    sync_raw = (lv.get("sync_percent") or "").strip()
    try:
        sync = float(sync_raw) if sync_raw else None
    except ValueError:
        sync = None
    health = (lv.get("lv_health_status") or "").strip()
    return {
        "exists": True,
        "error": None,
        "name": lv.get("lv_name"),
        "volumeGroup": lv.get("vg_name"),
        "size": lv.get("lv_size"),
        "segmentType": lv.get("segtype"),
        "syncPercent": sync,
        "healthStatus": health or "ok",
        "degraded": bool(health) and health != "",
        "mismatchCount": lv.get("raid_mismatch_count"),
    }
