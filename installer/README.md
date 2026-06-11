# Harvester-Nexus ISO

> **Full install guide:** step-by-step instructions for building the ISO on **Ubuntu 24.10+**, installing on bare metal, and testing in KVM are in the top-level [`README.md`](../README.md#installation).

This directory holds everything needed to produce **`harvester-nexus-<version>.iso`** — a single bootable image that installs:

- **Base Harvester** (SLE Micro + K3s/RKE2 + KubeVirt + Longhorn + Multus + Rancher) from the upstream `harvester-installer` repo.
- **The full Nexus cockpit** — every dashboard, widget, theme, wizard, and view documented in the top-level `README.md`.
- **Built-in XDR / MDR platform** — 12 FOSS sensors (Falco, Tetragon, Wazuh, Suricata, Hubble, Trivy, Polaris, kube-bench, OpenSearch, Grype, Syft) + 18 Sigma detection rules + 10 free intel feeds + 10 automated response actions.
- **AnyRAID CSI driver** — slab-based RAID over heterogeneous-capacity drives.
- **First-boot wizard** with Nexus-specific questions on top of Harvester's mandatory mode / network / VIP / NTP set.
- **Default cockpit credentials of `admin` / `admin`** with **forced password change on first login** so unattended installs work out of the box without leaving the cluster with weak credentials.

## What's in this directory

```
installer/
├── README.md                         (this file)
├── VERSION                           "1.0.0+nexus.1"
├── Dockerfile                        ISO builder image (BCI golang + Dapper toolchain + Node 20)
├── Makefile                          overlay / simulate / iso-builder / iso / clean / tests
├── build-iso.sh                      6-stage build pipeline
│
├── overlay/                          files merged into the squashfs root
│   ├── etc/nexus/config.yaml         install-time config (admin/admin, themes, XDR profile, ...)
│   ├── etc/systemd/system/           nexus-bootstrap.service + nexus-cockpit.service
│   ├── usr/bin/                      nexus-bootstrap, nexus-cockpit, nexus-postinstall
│   ├── usr/share/nexus-cockpit/      cockpit bundle + bootstrap manifests
│   └── usr/lib/nexus/                serve-cockpit.py
│
├── manifests/                        applied by nexus-bootstrap on first boot
│   ├── 00-nexus-namespace.yaml       3 namespaces (nexus-system / nexus-xdr / nexus-cockpit)
│   ├── 10-default-admin.yaml         admin SA + ClusterRoleBinding + credentials Secret
│   ├── 20-xdr-stack.yaml             12 FOSS XDR sensors as DaemonSets/Deployments/CronJobs
│   ├── 30-anyraid-csi.yaml           AnyRAID CSIDriver + DaemonSet + StorageClass
│   ├── 40-cockpit-service.yaml       cockpit Deployment + Service + Ingress
│   └── 99-nexus-features.yaml        feature-flag ConfigMap consumed by the cockpit
│
├── installer-config/
│   └── nexus-wizard-questions.yaml   16 extra questions injected into the Harvester wizard
│
├── simulator/
│   └── simulate.mjs                  end-to-end dry-run that validates the whole pipeline
│
└── tests/
    └── installer.test.ts             27 vitest contract tests
```

## Quick reference

### Build the cockpit overlay only (no Docker — ~6 seconds on a laptop)

```bash
cd installer
make overlay
```

Produces `build/nexus-overlay/` with the systemd units, scripts, cockpit production bundle, bootstrap manifests, and `/etc/nexus/config.yaml` all staged where they'll live on the installed system.

### Run the install simulator (no Docker — proves the install would succeed)

```bash
cd installer
make simulate
```

The simulator:
1. Parses `/etc/nexus/config.yaml`, validates the schema, confirms `admin / admin` is the seeded credential pair with `forcePasswordChange` set.
2. Renders every manifest under `installer/manifests/`, verifies each has `apiVersion + kind + metadata.name`, and that every workload image references a real upstream registry (`docker.io/`, `quay.io/`, `ghcr.io/`, `gcr.io/`, `registry.k8s.io/`).
3. Applies the manifests against an in-memory mock kube-apiserver, verifies the admin user / cockpit Deployment / XDR sensors / AnyRAID CSI / feature ConfigMap all reconcile.
4. Calls the cockpit's `isDemoLogin('admin', 'admin')` function, verifies it returns a token with `forcePasswordChange: true` and `cluster-admin` capability, and rejects unknown users / wrong passwords.
5. Writes a structured report at `build/install-simulation-report.yaml`.

Exit code is 0 on success, non-zero on any failure. The latest verified run reports **59 / 59 checks passed · 26 Kubernetes objects reconciled · admin / admin login verified**.

### Build the full ISO (needs Docker on native Ubuntu 24.10+ · ~30 minutes · ~25 GB free disk)

The iso-builder image installs **Go 1.26** from go.dev (required by upstream `harvester-installer`) on top of `registry.suse.com/bci/golang:1.26`, with the same
xorriso / squashfs / Helm / **Docker 29 CLI** toolchain Harvester upstream uses — **not**
`rancher/harvester-installer:<tag>`, which is a `FROM scratch` image containing only
the `/usr/bin/harvester-installer` binary and no shell. The zypper `docker` package is
deliberately omitted (API 1.42); a current static CLI is installed instead. The `elemental`
binary copied from `rancher/harvester-os` embeds moby client API 1.42 as well, so the
builder image sets `DOCKER_API_VERSION=1.44` for Docker 29+ host daemons.

```bash
cd installer
make iso-builder        # builds harvester-nexus-iso-builder:<version>-go1.26
make iso                # produces dist/harvester-nexus-<version>.iso
```

If `make iso` fails with `go.mod requires go >= 1.26 (running go 1.25…)`, you are using a **stale iso-builder image**. Run `make iso-builder` again (the image tag includes `-go1.26` so old tags are not reused).

The `make iso` target runs `build-iso.sh` inside the `harvester-nexus-iso-builder` container, which:

1. Builds the cockpit production bundle (`npm run build`).
2. Stages the overlay tree at `/build/nexus-overlay`.
3. Clones `harvester-installer` (master) and merges the overlay into **`package/harvester-os/files/`** (the path upstream `COPY files/ /` uses — not `iso/rootfs/`).
4. Copies `nexus-wizard-questions.yaml` into `/etc/nexus/installer/` as reference defaults (the stock Harvester install TUI does not yet surface these questions).
5. Replaces `scripts/collect-deps.sh` with a Nexus patch that waits for the Rancher `rancher-charts` catalog `index.yaml` (upstream only sleeps 10s).
6. Runs `harvester-installer/scripts/ci` to produce the squashfs + bootable ISO.
7. Copies the artifact to `dist/harvester-nexus-<version>.iso` with a `.sha256` next to it.

### Automated ISO on every `main` push (GitHub Actions)

Pushes to **`main`** trigger [`.github/workflows/build-iso.yml`](../.github/workflows/build-iso.yml):

1. **Validate** — `npm test`, stage overlay, run install simulator
2. **Build ISO** — `make iso-builder` + `make iso` with version `$(installer/VERSION).main.<run>.<sha>`
3. **Publish** — GitHub Release `iso-main-<run>` (pre-release) + workflow artifact (14-day retention)

Download the latest build from the repo **Releases** tab (look for `Main ISO build #…`) or from the **Actions** run artifacts. If the raw ISO exceeds GitHub’s 2 GiB asset limit, the workflow also uploads a `.iso.zst` — decompress with `zstd -d harvester-nexus-*.iso.zst`.

Manual re-run: **Actions → Build install ISO → Run workflow**.

CI stores heavy ISO build artifacts under `/var/lib/docker/nexus-ci/` on the expanded runner volume (not the small root disk).

### Install + verify (real ISO on bare metal or QEMU)

```bash
# QEMU example — needs ~16 GB RAM + 200 GB disk on the host
qemu-system-x86_64 \
  -enable-kvm -m 16384 -smp 8 -cpu host \
  -drive file=harvester-nexus.qcow2,if=virtio,size=200G \
  -cdrom dist/harvester-nexus-1.0.0+nexus.1.iso \
  -boot d \
  -netdev user,id=net0,hostfwd=tcp::8443-:8443,hostfwd=tcp::8080-:8080 -device virtio-net,netdev=net0
```

On boot the operator sees the **base Harvester wizard** (mode / network / VIP / NTP / cluster token / OS password). Nexus defaults are baked into `/etc/nexus/config.yaml`. After install, open **`https://<node-ip>:8443`** for the Nexus cockpit (not `https://<vip>:443`, which is the stock Harvester dashboard).

### Default credentials

After install completes the cockpit accepts:

| Field    | Value   |
|----------|---------|
| Username | `admin` |
| Password | `admin` |

On first login the cockpit **forces the operator to pick a new password** before any privileged action is permitted. The legacy `admin / demo` password is still accepted as a backwards-compat alias so the existing demo walkthroughs continue to work.

## Tests

```bash
npm run test -- installer       # 27 contract tests for the installer
npm run test                    # 237 total tests across the whole repo
```

The contract tests lock in:

- `config.yaml` has `apiVersion=nexus.io/v1`, `kind=NexusInstallConfig`, `admin.username=admin`, `admin.password=admin`, `admin.forcePasswordChangeOnFirstLogin=true`, a default theme + XDR profile + launch variant from the documented enums, and every documented storage backend.
- Each manifest file has a valid lexical-ordered prefix (00- / 10- / 20- / 30- / 40- / 99-) and every doc inside has `apiVersion + kind + metadata.name`.
- The XDR stack ships Falco, Tetragon, Wazuh agent + manager, Suricata, Hubble relay, Trivy operator, OpenSearch, Polaris, kube-bench, Grype, and Syft.
- Every workload image references a real upstream FOSS registry — no placeholder or private registries.
- The wizard question schema exposes every install-time setting the cockpit checks at boot.
- The systemd units order correctly (`nexus-bootstrap` after `k3s/rke2`; `nexus-cockpit` after `network-online.target`).
- Every helper script under `overlay/usr/bin/` is present and starts with a bash shebang. Assets must not live under `/usr/local/` — Elemental mounts that path as persistent storage and hides squashfs files baked there.
