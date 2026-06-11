# Testing each main build in a VM

Every push to **`main`** triggers a fresh install ISO. Use this flow to download and boot it in a virtual machine.

## 1. Get the ISO

After your change lands on `main`:

1. Open **GitHub → Actions → Build install ISO** and wait for the green check (~30–90 minutes).
2. Download from either:
   - **Releases → `iso-latest`** (always the newest successful build), or
   - **Releases → `Main ISO build #…`** (numbered build with full notes), or
   - **Actions → latest run → Artifacts** (14-day retention).

Verify checksum:

```bash
sha256sum -c harvester-nexus-*.iso.sha256
# or for compressed builds:
sha256sum -c harvester-nexus-*.iso.zst.sha256
```

If you downloaded `.iso.zst`:

```bash
zstd -d harvester-nexus-*.iso.zst
```

## 2. Create a VM disk (one time)

```bash
qemu-img create -f qcow2 harvester-nexus.qcow2 200G
```

Minimum recommended: **16 GB RAM**, **8 vCPU**, **200 GB** disk.

## 3. Boot the ISO

```bash
qemu-system-x86_64 \
  -enable-kvm -m 16384 -smp 8 -cpu host \
  -drive file=harvester-nexus.qcow2,if=virtio \
  -cdrom dist/harvester-nexus-*.iso \
  -boot d \
  -netdev user,id=net0,hostfwd=tcp::8443-:8443,hostfwd=tcp::443-:443 \
  -device virtio-net,netdev=net0
```

Use your actual ISO path instead of `dist/harvester-nexus-*.iso`.

## 4. Install

Follow the Harvester installer on the virtual console:

- Install mode (create / join)
- Management network + VIP
- Disks + cluster token
- OS password

## 5. Open Nexus cockpit

On the VM host (with port forwards above):

- **Nexus cockpit:** https://127.0.0.1:8443  
- Default login: `admin` / `admin` (forced password change on first login)

Stock Harvester UI (if needed): https://127.0.0.1:443

## Workflow for every change

```
feature branch → PR → merge to main → ISO build starts automatically → download iso-latest → boot VM
```

To rebuild without a new commit: **Actions → Build install ISO → Run workflow**.

## Local ISO build (optional)

If CI is slow or unavailable:

```bash
cd installer
make iso-builder   # rebuild after Dockerfile changes (requires Go 1.26 in the builder image)
make iso
```

If `make iso` fails with `go.mod requires go >= 1.26 (running go 1.25…)`:

1. `git pull` (ensure you have the latest `installer/build-iso.sh` — it bootstraps Go 1.26 automatically).
2. Force a fresh builder image:

```bash
cd installer
make iso-rebuild
make iso
```

The build script also downloads Go 1.26 at runtime if the cached iso-builder image is still on 1.25.

Output: `dist/harvester-nexus-*.iso`
