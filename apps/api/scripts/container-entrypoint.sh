#!/bin/sh
set -eu

# Railway mounts persistent volumes as root. Initialize the mount, then
# run both the API and worker as the image's unprivileged node user.
if [ "$(id -u)" = "0" ]; then
  evidence_path="${EVIDENCE_STORAGE_PATH:-/app/var/evidence}"
  mkdir -p "$evidence_path"
  chown node:node "$evidence_path"
  chmod 700 "$evidence_path"
  exec su-exec node "$@"
fi

exec "$@"
