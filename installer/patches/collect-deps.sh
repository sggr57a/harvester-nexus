#!/bin/bash -e
# Patched harvester-installer/scripts/collect-deps.sh for Nexus ISO builds.
#
# Upstream starts a privileged Rancher container and docker cp's index.yaml
# after 10s. That fails in two common cases:
#   • index.yaml is not synced yet
#   • Docker-in-Docker (iso-builder container): inner --privileged is ignored
#     and Rancher exits with "must be ran with the --privileged flag"
#
# This patch never starts the Rancher server. It reads index.yaml from the
# image filesystem, or falls back to rancher/rancher build.yaml versions.

output_file=$1

TOP_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." &> /dev/null && pwd )"
SCRIPTS_DIR="${TOP_DIR}/scripts"
WORKING_DIR=$(mktemp -d)
trap 'rm -rf "$WORKING_DIR"' EXIT

source ${SCRIPTS_DIR}/version-rancher

app_version_from_chart() {
  local chart=$1
  if [[ "$chart" =~ \+up(.+)$ ]]; then
    echo "${BASH_REMATCH[1]}"
  else
    echo "$chart"
  fi
}

update_chart_app_versions()
{
  local index_file=$1
  local name=$2
  local min_version=$3
  local output_file=$4
  local chart_version
  local app_version

  local versions
  versions=$(mktemp)

  yq e ".entries.${name}[].version" "$index_file" > "$versions"
  echo "$min_version" >> "$versions"
  chart_version="$(sort -V -r "$versions" | head -n1)"
  app_version="$(CHART_VERSION=$chart_version yq e ".entries.${name}[] | select(.version == strenv(CHART_VERSION)) | .appVersion" "$index_file")"

  yq e ".rancherDependencies.$name.chart = \"$chart_version\"" -i "$output_file"
  yq e ".rancherDependencies.$name.app = \"$app_version\"" -i "$output_file"
}

update_rancher_deps_from_build_yaml() {
  local output_file=$1
  local fleet_chart=$2
  local webhook_chart=$3
  local fleet_app webhook_app

  fleet_app=$(app_version_from_chart "$fleet_chart")
  webhook_app=$(app_version_from_chart "$webhook_chart")

  printf '[collect-deps] using build.yaml fleet=%s webhook=%s (no index.yaml)\n' \
    "$fleet_chart" "$webhook_chart" >&2

  yq e ".rancherDependencies.fleet.chart = \"$fleet_chart\"" -i "$output_file"
  yq e ".rancherDependencies.fleet.app = \"$fleet_app\"" -i "$output_file"
  yq e ".rancherDependencies.fleet-crd.chart = \"$fleet_chart\"" -i "$output_file"
  yq e ".rancherDependencies.fleet-crd.app = \"$fleet_app\"" -i "$output_file"
  yq e ".rancherDependencies.rancher-webhook.chart = \"$webhook_chart\"" -i "$output_file"
  yq e ".rancherDependencies.rancher-webhook.app = \"$webhook_app\"" -i "$output_file"
}

read_index_from_image() {
  local rancher_image=$1
  local repo_index=$2
  local repo_hash=$3

  docker run --rm --entrypoint=/bin/bash "$rancher_image" -c "
    set -euo pipefail
    paths=(
      /var/lib/rancher-data/local-catalogs/v2/rancher-charts/${repo_hash}/index.yaml
      /var/lib/rancher/data/local-catalogs/v2/rancher-charts/${repo_hash}/index.yaml
    )
    for f in \"\${paths[@]}\"; do
      if [[ -f \"\$f\" && -s \"\$f\" ]]; then
        cat \"\$f\"
        exit 0
      fi
    done
    found=\$(find /var/lib -path '*/rancher-charts/*/index.yaml' -type f -size +0 2>/dev/null | head -1 || true)
    if [[ -n \"\$found\" ]]; then
      cat \"\$found\"
      exit 0
    fi
    exit 1
  " > "$repo_index"
}

discover_repo_hash() {
  local rancher_image=$1
  docker run --rm --entrypoint=/bin/bash "$rancher_image" -c \
    'for base in /var/lib/rancher-data/local-catalogs/v2/rancher-charts /var/lib/rancher/data/local-catalogs/v2/rancher-charts; do
       if [[ -d "$base" ]]; then ls "$base" | head -n1 && exit 0; fi
     done
     exit 1'
}

extract_rancher_charts_index() {
  local rancher_image=$1
  local repo_index=$2

  local repo_hash
  repo_hash=$(discover_repo_hash "$rancher_image")
  printf '[collect-deps] rancher image=%s repo_hash=%s\n' "$rancher_image" "$repo_hash" >&2

  if read_index_from_image "$rancher_image" "$repo_index" "$repo_hash" && [[ -s "$repo_index" ]]; then
    printf '[collect-deps] read rancher-charts index from image filesystem (%s bytes)\n' \
      "$(wc -c < "$repo_index")" >&2
    return 0
  fi

  rm -f "$repo_index"
  printf '[collect-deps] index.yaml not present in image; will use build.yaml versions\n' >&2
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

  printf '[collect-deps] ensuring %s is available locally\n' "$rancher_image" >&2
  docker pull "$rancher_image" >/dev/null

  if extract_rancher_charts_index "$rancher_image" "$repo_index"; then
    update_chart_app_versions "$repo_index" fleet "$CATTLE_FLEET_MIN_VERSION" "$output_file"
    update_chart_app_versions "$repo_index" fleet-crd "$CATTLE_FLEET_MIN_VERSION" "$output_file"
    update_chart_app_versions "$repo_index" rancher-webhook "$CATTLE_RANCHER_WEBHOOK_MIN_VERSION" "$output_file"
  else
    update_rancher_deps_from_build_yaml "$output_file" \
      "$CATTLE_FLEET_MIN_VERSION" "$CATTLE_RANCHER_WEBHOOK_MIN_VERSION"
  fi
}

if [ ! -e "$output_file" ]; then
  touch "$output_file"
fi

update_rancher_deps "$RANCHER_VERSION" "$output_file"
