#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/../../.." && pwd)"
RUNTIME_DIR="${SUE_LR_RUNTIME_DIR:-${REPO_ROOT}/../runtime}"
DATA_DIR="${SUE_LR_DATA_DIR:-${RUNTIME_DIR}/data}"
APP_DIR="${SUE_LR_APP_DIR:-${RUNTIME_DIR}/app}"
COMPOSE_SOURCE="${SCRIPT_DIR}/compose.yaml"
COMPOSE_TARGET="${RUNTIME_DIR}/compose.yaml"
NGINX_SOURCE="${SCRIPT_DIR}/studio.suelr.com.nginx.conf"
NGINX_TARGET="${SUE_LR_NGINX_TARGET:-/etc/nginx/sites-available/studio.suelr.com}"
NGINX_ENABLED_DIR="${SUE_LR_NGINX_ENABLED_DIR:-/etc/nginx/sites-enabled}"
NGINX_ENABLED_LINK="${NGINX_ENABLED_DIR}/studio.suelr.com"
RELEASE_DIR="${REPO_ROOT}/.server-web-release"
RELEASE_APP_SOURCE="${RELEASE_DIR}/app"

log() {
  printf '[server-web:install] %s\n' "$*"
}

fail() {
  printf '[server-web:install] ERROR: %s\n' "$*" >&2
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

require_command docker
require_command nginx
require_command node

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
log "app dir: ${APP_DIR}"

mkdir -p "${RUNTIME_DIR}"
mkdir -p "${DATA_DIR}"
mkdir -p "${APP_DIR}"

node "${REPO_ROOT}/scripts/build-server-web-release.mjs"
[ -d "${RELEASE_APP_SOURCE}" ] || fail "release app source not found: ${RELEASE_APP_SOURCE}"

rm -rf "${APP_DIR}"
mkdir -p "${APP_DIR}"
cp -R "${RELEASE_APP_SOURCE}/." "${APP_DIR}/"
log "synced release app directory to ${APP_DIR}"

cp "${COMPOSE_SOURCE}" "${COMPOSE_TARGET}"
log "copied compose file to ${COMPOSE_TARGET}"

run_as_root mkdir -p "$(dirname -- "${NGINX_TARGET}")"
run_as_root mkdir -p "${NGINX_ENABLED_DIR}"
run_as_root cp "${NGINX_SOURCE}" "${NGINX_TARGET}"
run_as_root ln -sfn "${NGINX_TARGET}" "${NGINX_ENABLED_LINK}"
log "installed nginx site config at ${NGINX_TARGET}"

"${DOCKER_COMPOSE[@]}" -f "${COMPOSE_TARGET}" up -d --build
log "docker compose deployment started"

run_as_root nginx -t
run_as_root systemctl reload nginx
log "nginx reloaded"

log "install complete"
