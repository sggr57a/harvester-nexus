#!/bin/bash -e
# Patched copy of harvester-installer/scripts/collect-deps.sh.
#
# Upstream sleeps 10s then docker cp's rancher-charts/index.yaml from a
# privileged Rancher container. On many build hosts the catalog index is
# not ready in time (or Rancher writes under /var/lib/rancher/data/…),
# which yields:
#   Could not find the file …/rancher-charts/<hash>/index.yaml
#
# This version:
#   1. Tries to copy index.yaml from the image filesystem (docker create).
#   2. Falls back to a running Rancher with a poll loop (up to 6 minutes).
#   3. Checks both rancher-data and rancher/data path prefixes.

output_file=$1

TOP_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." &> /dev/null && pwd )"
SCRIPTS_DIR="${TOP_DIR}/scripts"
WORKING_DIR=$(mktemp -d)
trap 'rm -rf "$WORKING_DIR"' EXIT

source ${SCRIPTS_DIR}/version-rancher

update_chart_app_versions()
{
  local index_file=$1
  local name=$2
  local min_version=$3
  local output_file=$4
  local chart_version
  local app_version

  local versions=$(mktemp)

  yq e ".entries.${name}[].version" $index_file > $versions
  echo $min_version >> $versions
  chart_version="$(sort -V -r $versions | head -n1)"
  app_version="$(CHART_VERSION=$chart_version yq e ".entries.${name}[] | select(.version == strenv(CHART_VERSION)) | .appVersion" $index_file)"

  yq e ".rancherDependencies.$name.chart = \"$chart_version\"" -i $output_file
  yq e ".rancherDependencies.$name.app = \"$app_version\"" -i $output_file
}

catalog_paths_for_hash() {
  local repo_hash=$1
  printf '%s\n' \
    "/var/lib/rancher-data/local-catalogs/v2/rancher-charts/${repo_hash}/index.yaml" \
    "/var/lib/rancher/data/local-catalogs/v2/rancher-charts/${repo_hash}/index.yaml"
}

discover_repo_hash() {
  local rancher_image=$1
  docker run --rm --entrypoint=/bin/bash "$rancher_image" -c \
    'for base in /var/lib/rancher-data/local-catalogs/v2/rancher-charts /var/lib/rancher/data/local-catalogs/v2/rancher-charts; do
       if [[ -d "$base" ]]; then ls "$base" | head -n1 && exit 0; fi
     done
     exit 1'
}

try_copy_index_from_container() {
  local cid=$1
  local repo_index=$2
  shift 2
  local path
  for path in "$@"; do
    if docker cp "${cid}:${path}" "$repo_index" 2>/dev/null && [[ -s "$repo_index" ]]; then
      return 0
    fi
  done
  return 1
}

extract_rancher_charts_index() {
  local rancher_image=$1
  local repo_index=$2

  local repo_hash
  repo_hash=$(discover_repo_hash "$rancher_image")
  mapfile -t catalog_paths < <(catalog_paths_for_hash "$repo_hash")

  printf '[collect-deps] rancher image=%s repo_hash=%s\n' "$rancher_image" "$repo_hash" >&2

  # Fast path — index.yaml is often already baked into the image layers.
  local static_cid
  static_cid=$(docker create "$rancher_image")
  if try_copy_index_from_container "$static_cid" "$repo_index" "${catalog_paths[@]}"; then
    docker rm -f "$static_cid" >/dev/null
    printf '[collect-deps] copied rancher-charts index from image filesystem\n' >&2
    return 0
  fi
  docker rm -f "$static_cid" >/dev/null

  # Slow path — start Rancher and wait for catalog sync.
  local cid_file="${WORKING_DIR}/rancher-cid"
  docker run --privileged -d --cidfile="$cid_file" "$rancher_image"
  local running_cid
  running_cid=$(<"$cid_file")
  printf '[collect-deps] waiting for Rancher catalog index in container %s\n' "$running_cid" >&2

  local attempt=0
  local max_attempts=72   # 6 minutes @ 5s
  while (( attempt < max_attempts )); do
    if ! docker ps -q --no-trunc | grep -q "^${running_cid}$"; then
      printf '[collect-deps] Rancher container exited early; logs:\n' >&2
      docker logs "$running_cid" 2>&1 | tail -80 >&2 || true
      docker rm -f "$running_cid" >/dev/null 2>&1 || true
      return 1
    fi
    if try_copy_index_from_container "$running_cid" "$repo_index" "${catalog_paths[@]}"; then
      docker stop "$running_cid" >/dev/null
      docker rm "$running_cid" >/dev/null
      printf '[collect-deps] copied rancher-charts index after %ds\n' "$((attempt * 5))" >&2
      return 0
    fi
    sleep 5
    attempt=$((attempt + 1))
  done

  printf '[collect-deps] timed out waiting for rancher-charts index.yaml; logs:\n' >&2
  docker logs "$running_cid" 2>&1 | tail -80 >&2 || true
  docker stop "$running_cid" >/dev/null || true
  docker rm "$running_cid" >/dev/null || true
  return 1
}

update_rancher_deps()
{
  local rancher_version=$1
  local output_file=$2

  local repo_index="${WORKING_DIR}/rancher-charts.yaml"
  local rancher_build_yaml="${WORKING_DIR}/rancher-build.yaml"
  local rancher_image="rancher/rancher:$rancher_version"

  curl -sfL "https://raw.githubusercontent.com/rancher/rancher/${rancher_version}/build.yaml" -o "$rancher_build_yaml"
  CATTLE_FLEET_MIN_VERSION=$(yq e .fleetVersion "$rancher_build_yaml")
  CATTLE_RANCHER_WEBHOOK_MIN_VERSION=$(yq e .webhookVersion "$rancher_build_yaml")

  printf '[collect-deps] pulling %s (needed for catalog index extraction)\n' "$rancher_image" >&2
  docker pull "$rancher_image"

  extract_rancher_charts_index "$rancher_image" "$repo_index"

  update_chart_app_versions "$repo_index" fleet "$CATTLE_FLEET_MIN_VERSION" "$output_file"
  update_chart_app_versions "$repo_index" fleet-crd "$CATTLE_FLEET_MIN_VERSION" "$output_file"
  update_chart_app_versions "$repo_index" rancher-webhook "$CATTLE_RANCHER_WEBHOOK_MIN_VERSION" "$output_file"
}

if [ ! -e "$output_file" ]; then
  touch "$output_file"
fi

update_rancher_deps "$RANCHER_VERSION" "$output_file"
