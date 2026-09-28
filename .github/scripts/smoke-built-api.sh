#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/../.."

# Schema setup and startup seeding must never touch a development or live database.
node --input-type=module <<'NODE'
const { DATABASE_URL, NODE_ENV, REPLIT_DEPLOYMENT } = process.env;
if (!DATABASE_URL || NODE_ENV !== "test" || REPLIT_DEPLOYMENT) {
  throw new Error("API smoke check requires a test database outside a deployment.");
}
const url = new URL(DATABASE_URL);
if (url.protocol !== "postgresql:" || url.hostname !== "127.0.0.1" ||
    url.username !== "roster_ci" || url.pathname !== "/roster_ci" ||
    url.search || url.hash) {
  throw new Error("API smoke check must use the disposable local roster_ci database.");
}
NODE

smoke_port="${API_SMOKE_PORT:-19095}"
if [[ ! "$smoke_port" =~ ^[0-9]+$ ]] || (( smoke_port < 1 || smoke_port > 65535 )); then
  echo "Invalid API smoke port." >&2
  exit 1
fi

# Fail before schema setup if another service owns the port; otherwise a
# response from that service could be mistaken for the new API process.
node --input-type=module - "$smoke_port" <<'NODE'
import { createServer } from "node:net";
const server = createServer();
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(Number(process.argv[2]), "127.0.0.1", resolve);
});
await new Promise((resolve) => server.close(resolve));
NODE

pnpm --filter @workspace/db run push

smoke_dir="$(mktemp -d)"
server_pid=""
cleanup() {
  local status=$?
  trap - EXIT INT TERM
  if [[ -n "$server_pid" ]]; then
    kill "$server_pid" 2>/dev/null || true
    for _ in {1..20}; do
      if ! kill -0 "$server_pid" 2>/dev/null; then break; fi
      sleep 0.1
    done
    kill -KILL "$server_pid" 2>/dev/null || true
    wait "$server_pid" 2>/dev/null || true
  fi
  if (( status != 0 )); then
    echo "Built API smoke check failed. Server output:" >&2
    cat "$smoke_dir/server.log" >&2 || true
  fi
  rm -rf "$smoke_dir"
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# Fabricated keys prevent inherited development/production Clerk credentials from
# being used. The health endpoint requires no sign-in and makes no Clerk API calls.
PORT="$smoke_port" \
CLERK_PUBLISHABLE_KEY="pk_test_Y2xlcmsuZXhhbXBsZS5jb20k" \
CLERK_SECRET_KEY="sk_test_ci_smoke_placeholder" \
node --enable-source-maps artifacts/api-server/dist/index.mjs \
  >"$smoke_dir/server.log" 2>&1 &
server_pid=$!
echo "Built API smoke server PID: $server_pid" >&2

ready=false
for _ in {1..45}; do
  if ! kill -0 "$server_pid" 2>/dev/null; then
    echo "Built API exited before becoming ready." >&2
    exit 1
  fi
  if curl --noproxy '*' --fail --silent --max-time 2 \
    "http://127.0.0.1:${smoke_port}/api/health" \
    >"$smoke_dir/response.json"; then
    ready=true
    break
  fi
  sleep 1
done

if [[ "$ready" != true ]] || ! kill -0 "$server_pid" 2>/dev/null; then
  echo "Built API did not become ready within 45 attempts." >&2
  exit 1
fi

node --input-type=module - "$smoke_dir/response.json" <<'NODE'
import { readFileSync } from "node:fs";
const response = JSON.parse(readFileSync(process.argv[2], "utf8"));
if (response.status !== "ok" || response.database !== "connected") {
  throw new Error(`Unexpected API health response: ${JSON.stringify(response)}`);
}
console.log("Built API answered /api/health with a connected test database.");
NODE