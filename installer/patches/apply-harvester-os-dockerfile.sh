#!/usr/bin/env bash
# Insert cockpit tarball extraction after COPY files/ / in harvester-os/Dockerfile.
set -euo pipefail

dockerfile=${1:?usage: apply-harvester-os-dockerfile.sh <path/to/Dockerfile>}
mark="HARVESTER_NEXUS_COCKPIT_DIST_EXTRACT"

grep -q "${mark}" "${dockerfile}" && exit 0

tmp=$(mktemp)
awk -v mark="${mark}" '
  /^COPY files\/ \// {
    print
    print ""
    print "# " mark
    print "RUN if [ -f /usr/share/nexus-cockpit/dist.tar.gz ]; then \\"
    print "      mkdir -p /usr/share/nexus-cockpit/dist && \\"
    print "      tar -xzf /usr/share/nexus-cockpit/dist.tar.gz -C /usr/share/nexus-cockpit/dist && \\"
    print "      rm -f /usr/share/nexus-cockpit/dist.tar.gz; \\"
    print "    fi"
    next
  }
  { print }
' "${dockerfile}" > "${tmp}"
mv "${tmp}" "${dockerfile}"
