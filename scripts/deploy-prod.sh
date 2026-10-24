#!/usr/bin/env bash
# Redeploys the production stack at one commit. The deploy-backend-production workflow streams this script
# over SSH; run it by hand with an older SHA to roll back (see docs/production-deploy.md).
set -euo pipefail

sha="${1:?Usage: deploy-prod.sh <40-character commit SHA>}"
if [[ ! "$sha" =~ ^[0-9a-f]{40}$ ]]; then
  echo 'The argument must be a full lowercase commit SHA.' >&2
  exit 2
fi

root="${NUSGO_DEPLOY_ROOT:-/opt/navus}"
repo="$root/repo"
compose=(docker compose --project-name navus --env-file "$root/compose.env" -f "$repo/docker-compose.prod.yml")

git -C "$repo" fetch --prune origin main
git -C "$repo" checkout --detach "$sha"

# The frontend build embeds the same SHA as VITE_DATA_VERSION; the two must match.
export NUSGO_DATA_VERSION="$sha"
"${compose[@]}" up -d --build --remove-orphans

container_state() {
  docker inspect --format "$2" "$("${compose[@]}" ps -q "$1")" 2>/dev/null || true
}

for _ in $(seq 1 30); do
  [[ "$(container_state api '{{if .State.Health}}{{.State.Health.Status}}{{end}}')" == healthy ]] && break
  sleep 2
done

if [[ "$(container_state api '{{if .State.Health}}{{.State.Health.Status}}{{end}}')" != healthy ]]; then
  echo 'The API did not become healthy within 60 seconds. Recent API logs:' >&2
  "${compose[@]}" logs --tail 50 api >&2
  exit 1
fi

# cloudflared shares the API's network namespace, so it must be recreated whenever the API is.
if [[ "$(container_state cloudflared '{{.State.Running}}')" != true ]]; then
  echo 'cloudflared is not running. Recent tunnel logs:' >&2
  "${compose[@]}" logs --tail 50 cloudflared >&2
  exit 1
fi

docker image prune -f >/dev/null
"${compose[@]}" ps
echo "Deployed $sha"
