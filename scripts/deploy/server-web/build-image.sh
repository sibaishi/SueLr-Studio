#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/../../.." && pwd)"
IMAGE="${SUE_LR_IMAGE:-}"
PUSH_IMAGE="${SUE_LR_PUSH:-0}"
RELEASE_DIR="${REPO_ROOT}/.server-web-release/app"

log() {
  printf '[server-web:build-image] %s\n' "$*"
}

fail() {
  printf '[server-web:build-image] ERROR: %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "missing required command: $1"
}

[ -n "${IMAGE}" ] || fail "SUE_LR_IMAGE is required, for example git.suelr.com/sueadmin/suelr-studio:server-web"

require_command node
require_command docker

log "repo root: ${REPO_ROOT}"
log "image: ${IMAGE}"

node "${REPO_ROOT}/scripts/build-server-web-release.mjs"

docker build \
  -t "${IMAGE}" \
  -f "${RELEASE_DIR}/scripts/deploy/server-web/Dockerfile" \
  "${RELEASE_DIR}"

log "built ${IMAGE}"

if [ "${PUSH_IMAGE}" = "1" ]; then
  docker push "${IMAGE}"
  log "pushed ${IMAGE}"
fi
