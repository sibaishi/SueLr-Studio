#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/../../.." && pwd)"
RUNTIME_DIR="${SUE_LR_RUNTIME_DIR:-${REPO_ROOT}/../runtime}"
DATA_DIR="${SUE_LR_DATA_DIR:-${RUNTIME_DIR}/data}"
COMPOSE_SOURCE="${SCRIPT_DIR}/compose.image.yaml"
COMPOSE_TARGET="${RUNTIME_DIR}/compose.yaml"
NGINX_SOURCE="${SCRIPT_DIR}/studio.suelr.com.nginx.conf"
NGINX_TARGET="${SUE_LR_NGINX_TARGET:-/etc/nginx/sites-available/studio.suelr.com}"
NGINX_ENABLED_DIR="${SUE_LR_NGINX_ENABLED_DIR:-/etc/nginx/sites-enabled}"
NGINX_ENABLED_LINK="${NGINX_ENABLED_DIR}/studio.suelr.com"
PULL_SOURCE="${SUE_LR_PULL_SOURCE:-0}"

log() {
  printf '[server-web:update-image] %s\n' "$*"
}

fail() {
  printf '[server-web:update-image] ERROR: %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "missing required command: $1"
}

run_as_root() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
  elif command -v sudo >/dev/null 2>&1; then
    sudo "$@"
  else
    fail "root privileges are required to run: $*"
  fi
}

[ -n "${SUE_LR_IMAGE:-}" ] || fail "SUE_LR_IMAGE is required"

require_command git
require_command docker
require_command nginx

if [ "${PULL_SOURCE}" = "1" ]; then
  require_command git
  GIT_REMOTE="${SUE_LR_GIT_REMOTE:-origin}"
  GIT_REF="${SUE_LR_GIT_REF:-${SUE_LR_GIT_BRANCH:-$(git -C "${REPO_ROOT}" branch --show-current)}}"
  git -C "${REPO_ROOT}" rev-parse --is-inside-work-tree >/dev/null 2>&1 || fail "repo root is not a git work tree: ${REPO_ROOT}"
fi

if docker compose version >/dev/null 2>&1; then
  DOCKER_COMPOSE=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  DOCKER_COMPOSE=(docker-compose)
else
  fail "missing docker compose support"
fi

[ -f "${COMPOSE_SOURCE}" ] || fail "compose source not found: ${COMPOSE_SOURCE}"
[ -f "${NGINX_SOURCE}" ] || fail "nginx config source not found: ${NGINX_SOURCE}"

log "repo root: ${REPO_ROOT}"
log "runtime dir: ${RUNTIME_DIR}"
log "image: ${SUE_LR_IMAGE}"

if [ "${PULL_SOURCE}" = "1" ]; then
  log "pulling ${GIT_REMOTE}/${GIT_REF}"
  git -C "${REPO_ROOT}" fetch "${GIT_REMOTE}" "${GIT_REF}"
  git -C "${REPO_ROOT}" pull --ff-only "${GIT_REMOTE}" "${GIT_REF}"
else
  log "skipping source checkout pull; set SUE_LR_PULL_SOURCE=1 to pull before updating"
fi

mkdir -p "${RUNTIME_DIR}"
mkdir -p "${DATA_DIR}"

cp "${COMPOSE_SOURCE}" "${COMPOSE_TARGET}"
log "copied image compose file to ${COMPOSE_TARGET}"

run_as_root mkdir -p "$(dirname -- "${NGINX_TARGET}")"
run_as_root mkdir -p "${NGINX_ENABLED_DIR}"
run_as_root cp "${NGINX_SOURCE}" "${NGINX_TARGET}"
run_as_root ln -sfn "${NGINX_TARGET}" "${NGINX_ENABLED_LINK}"
log "installed nginx site config at ${NGINX_TARGET}"

"${DOCKER_COMPOSE[@]}" --project-directory "${RUNTIME_DIR}" -f "${COMPOSE_TARGET}" pull
"${DOCKER_COMPOSE[@]}" --project-directory "${RUNTIME_DIR}" -f "${COMPOSE_TARGET}" up -d --no-build
log "docker compose updated from prebuilt image"

run_as_root nginx -t
run_as_root systemctl reload nginx
log "nginx reloaded"

log "update complete"
