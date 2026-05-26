#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/../../.." && pwd)"
RUNTIME_DIR="${SUE_LR_RUNTIME_DIR:-${REPO_ROOT}/../runtime}"
DATA_DIR="${SUE_LR_DATA_DIR:-${RUNTIME_DIR}/data}"
APP_DIR="${SUE_LR_APP_DIR:-${RUNTIME_DIR}/app}"
COMPOSE_TARGET="${RUNTIME_DIR}/compose.yaml"
NGINX_TARGET="${SUE_LR_NGINX_TARGET:-/etc/nginx/sites-available/studio.suelr.com}"
NGINX_ENABLED_DIR="${SUE_LR_NGINX_ENABLED_DIR:-/etc/nginx/sites-enabled}"
NGINX_ENABLED_LINK="${NGINX_ENABLED_DIR}/studio.suelr.com"
REMOVE_DATA="${SUE_LR_REMOVE_DATA:-0}"
REMOVE_RUNTIME_DIR="${SUE_LR_REMOVE_RUNTIME_DIR:-0}"

log() {
  printf '[server-web:uninstall] %s\n' "$*"
}

fail() {
  printf '[server-web:uninstall] ERROR: %s\n' "$*" >&2
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

if docker compose version >/dev/null 2>&1; then
  DOCKER_COMPOSE=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  DOCKER_COMPOSE=(docker-compose)
else
  fail "missing docker compose support"
fi

log "runtime dir: ${RUNTIME_DIR}"

if [ -f "${COMPOSE_TARGET}" ]; then
  "${DOCKER_COMPOSE[@]}" -f "${COMPOSE_TARGET}" down --remove-orphans || true
  log "docker compose stack stopped"
else
  log "compose file missing, skipping docker compose down"
fi

if [ -L "${NGINX_ENABLED_LINK}" ] || [ -e "${NGINX_ENABLED_LINK}" ]; then
  run_as_root rm -f "${NGINX_ENABLED_LINK}"
  log "removed nginx enabled link"
fi

if [ -f "${NGINX_TARGET}" ]; then
  run_as_root rm -f "${NGINX_TARGET}"
  log "removed nginx site config"
fi

run_as_root nginx -t
run_as_root systemctl reload nginx
log "nginx reloaded"

if [ -f "${COMPOSE_TARGET}" ]; then
  rm -f "${COMPOSE_TARGET}"
  log "removed runtime compose file"
fi

if [ -d "${APP_DIR}" ]; then
  rm -rf "${APP_DIR}"
  log "removed runtime app directory"
fi

if [ "${REMOVE_DATA}" = "1" ] && [ -d "${DATA_DIR}" ]; then
  rm -rf "${DATA_DIR}"
  log "removed runtime data directory"
fi

if [ "${REMOVE_RUNTIME_DIR}" = "1" ] && [ -d "${RUNTIME_DIR}" ]; then
  rmdir "${RUNTIME_DIR}" 2>/dev/null || true
  log "attempted to remove runtime directory"
fi

log "uninstall complete"
