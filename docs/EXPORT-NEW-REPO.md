# Export Harvester Nexus Unified to a new repository

Use this when you want a **separate GitHub/GitLab repo** for the unified edition instead of a branch inside `harvester-nexus`.

## Option A — New repo from the unified branch (recommended)

```bash
# Clone only the unified branch
git clone --branch harvester-nexus-unified --single-branch \
  https://github.com/sggr57a/harvester-nexus.git \
  harvester-nexus-unified

cd harvester-nexus-unified

# Point at your new empty repository
git remote remove origin
git remote add origin https://github.com/YOUR_ORG/harvester-nexus-unified.git

# Push as the default branch
git push -u origin harvester-nexus-unified:main
```

On GitHub: create an empty repo first (no README/license) at `https://github.com/YOUR_ORG/harvester-nexus-unified`.

### After export — build ISO

```bash
cd installer
make iso-builder
make iso BUILD_VERSION="$(./ci-version.sh)"
```

See [HARVESTER-NEXUS-UNIFIED.md](./HARVESTER-NEXUS-UNIFIED.md) for VM testing steps.

## Option B — Mirror with full history

```bash
git clone --branch harvester-nexus-unified \
  https://github.com/sggr57a/harvester-nexus.git \
  harvester-nexus-unified

cd harvester-nexus-unified
git remote add new-origin https://github.com/YOUR_ORG/harvester-nexus-unified.git
git push new-origin harvester-nexus-unified:main --tags
```

## Option C — Fresh repo without git history

```bash
git clone --branch harvester-nexus-unified --depth 1 \
  https://github.com/sggr57a/harvester-nexus.git \
  harvester-nexus-unified

cd harvester-nexus-unified
rm -rf .git
git init
git add -A
git commit -m "Initial import: Harvester Nexus Unified edition"
git branch -M main
git remote add origin https://github.com/YOUR_ORG/harvester-nexus-unified.git
git push -u origin main
```

## CI in the new repo

Copy `.github/workflows/build-iso.yml` from this branch. It is already configured to build ISOs on pushes to `harvester-nexus-unified`. In a new repo where `main` **is** the unified edition, edit the workflow trigger:

```yaml
on:
  push:
    branches: [main]
  workflow_dispatch:
```

And set `GITHUB_REF_NAME` checks in `installer/ci-version.sh` to treat `main` as the product branch (already supported).

## What you get

- Full React cockpit with Harvester + Nexus surfaces
- `platform/harvester/` upstream platform source
- `installer/` ISO pipeline (Harvester base + Nexus overlay)
- XDR stack, AnyRAID CSI, bootstrap manifests
- No dependency on `harvester-nexus` `main` branch
