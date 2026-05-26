#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/../../.." && pwd)"
RUNTIME_DIR="${SUE_LR_RUNTIME_DIR:-${REPO_ROOT}/../runtime}"
APP_DIR="${SUE_LR_APP_DIR:-${RUNTIME_DIR}/app}"
COMPOSE_SOURCE="${SCRIPT_DIR}/compose.yaml"
COMPOSE_TARGET="${RUNTIME_DIR}/compose.yaml"
NGINX_SOURCE="${SCRIPT_DIR}/studio.suelr.com.nginx.conf"
NGINX_TARGET="${SUE_LR_NGINX_TARGET:-/etc/nginx/sites-available/studio.suelr.com}"
NGINX_ENABLED_DIR="${SUE_LR_NGINX_ENABLED_DIR:-/etc/nginx/sites-enabled}"
NGINX_ENABLED_LINK="${NGINX_ENABLED_DIR}/studio.suelr.com"
GIT_REMOTE="${SUE_LR_GIT_REMOTE:-origin}"
GIT_BRANCH="${SUE_LR_GIT_BRANCH:-$(git -C "${REPO_ROOT}" branch --show-current)}"

log() {
  printf '[server-web:update] %s\n' "$*"
}

fail() {
  printf '[server-web:update] ERROR: %s\n' "$*" >&2
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

require_command git
require_command docker
require_command nginx

[ -f "${REPO_ROOT}/index.html" ] || fail "frontend entry not found: ${REPO_ROOT}/index.html"
[ -d "${REPO_ROOT}/src" ] || fail "frontend sources not found: ${REPO_ROOT}/src"
[ -f "${REPO_ROOT}/vite.config.ts" ] || fail "vite config not found: ${REPO_ROOT}/vite.config.ts"
[ -f "${REPO_ROOT}/tsconfig.json" ] || fail "tsconfig not found: ${REPO_ROOT}/tsconfig.json"
[ -d "${REPO_ROOT}/backend/src" ] || fail "backend sources not found: ${REPO_ROOT}/backend/src"
[ -f "${REPO_ROOT}/scripts/deploy/server-web/app.dockerignore" ] || fail "server-web dockerignore not found: ${REPO_ROOT}/scripts/deploy/server-web/app.dockerignore"

sync_release_tree() {
  copy_entry() {
    local source_relative="$1"
    local target_relative="$2"
    local source_path="${REPO_ROOT}/${source_relative}"
    local target_path="${APP_DIR}/${target_relative}"

    [ -e "${source_path}" ] || fail "missing release source: ${source_relative}"
    mkdir -p "$(dirname -- "${target_path}")"
    cp -R "${source_path}" "${target_path}"
  }

  rm -rf "${APP_DIR}"
  mkdir -p "${APP_DIR}"
  copy_entry "index.html" "index.html"
  copy_entry "package.json" "package.json"
  copy_entry "package-lock.json" "package-lock.json"
  copy_entry "tsconfig.json" "tsconfig.json"
  copy_entry "vite.config.ts" "vite.config.ts"
  copy_entry "src" "src"
  copy_entry "backend/package.json" "backend/package.json"
  copy_entry "backend/package-lock.json" "backend/package-lock.json"
  copy_entry "backend/server.js" "backend/server.js"
  copy_entry "backend/src" "backend/src"
  copy_entry "scripts/deploy/server-web/app.dockerignore" ".dockerignore"
  copy_entry "scripts/deploy/server-web/Dockerfile" "scripts/deploy/server-web/Dockerfile"
}

if docker compose version >/dev/null 2>&1; then
  DOCKER_COMPOSE=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  DOCKER_COMPOSE=(docker-compose)
else
  fail "missing docker compose support"
fi

git -C "${REPO_ROOT}" rev-parse --is-inside-work-tree >/dev/null 2>&1 || fail "repo root is not a git work tree: ${REPO_ROOT}"
[ -f "${COMPOSE_SOURCE}" ] || fail "compose source not found: ${COMPOSE_SOURCE}"
[ -f "${NGINX_SOURCE}" ] || fail "nginx config source not found: ${NGINX_SOURCE}"

log "repo root: ${REPO_ROOT}"
log "runtime dir: ${RUNTIME_DIR}"
log "app dir: ${APP_DIR}"
log "pulling ${GIT_REMOTE}/${GIT_BRANCH}"
git -C "${REPO_ROOT}" fetch "${GIT_REMOTE}" "${GIT_BRANCH}"
git -C "${REPO_ROOT}" pull --ff-only "${GIT_REMOTE}" "${GIT_BRANCH}"

mkdir -p "${RUNTIME_DIR}"
mkdir -p "${APP_DIR}"

sync_release_tree
log "synced release app directory to ${APP_DIR}"

cp "${COMPOSE_SOURCE}" "${COMPOSE_TARGET}"
log "copied compose file to ${COMPOSE_TARGET}"

run_as_root mkdir -p "$(dirname -- "${NGINX_TARGET}")"
run_as_root mkdir -p "${NGINX_ENABLED_DIR}"
run_as_root cp "${NGINX_SOURCE}" "${NGINX_TARGET}"
run_as_root ln -sfn "${NGINX_TARGET}" "${NGINX_ENABLED_LINK}"
log "installed nginx site config at ${NGINX_TARGET}"

"${DOCKER_COMPOSE[@]}" --project-directory "${RUNTIME_DIR}" -f "${COMPOSE_TARGET}" up -d --build
log "docker compose updated"

run_as_root nginx -t
run_as_root systemctl reload nginx
log "nginx reloaded"

log "update complete"
