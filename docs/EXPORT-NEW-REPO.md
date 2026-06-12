# Export Harvester Nexus Unified to a new repository

Use this when you want a **separate GitHub/GitLab repo** for the unified edition instead of a branch inside `harvester-nexus`.

> **You do not need a new repo** if the branch `harvester-nexus-unified` in `sggr57a/harvester-nexus` is enough. Clone that branch and build the ISO — see [HARVESTER-NEXUS-UNIFIED.md](./HARVESTER-NEXUS-UNIFIED.md).

## Step 0 — Create the empty GitHub repository first

`git push` **cannot** create the remote repository. You must create it on GitHub **before** pushing.

### Via GitHub website

1. Open https://github.com/new
2. **Owner:** `sggr57a`
3. **Repository name:** `harvester-nexus-unified`
4. **Visibility:** Public or Private
5. **Do not** add a README, license, or `.gitignore` (leave the repo empty)
6. Click **Create repository**

### Via GitHub CLI (logged in as `sggr57a`)

```bash
gh auth login   # if needed — must be the sggr57a account
gh repo create sggr57a/harvester-nexus-unified --public --description "Harvester Nexus Unified edition"
```

Only after the repo exists should you run `git push`.

## Option A — New repo from the unified branch (recommended)

```bash
# Clone only the unified branch
git clone --branch harvester-nexus-unified --single-branch \
  https://github.com/sggr57a/harvester-nexus.git \
  harvester-nexus-unified

cd harvester-nexus-unified

# Point at your new empty repository (must exist — see Step 0)
git remote remove origin
git remote add origin https://github.com/sggr57a/harvester-nexus-unified.git

# Push as the default branch
git push -u origin harvester-nexus-unified:main
```

If you see `repository ... not found`, the repo was not created in Step 0, or the URL owner/name is wrong.

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
git remote add origin https://github.com/sggr57a/harvester-nexus-unified.git
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
