#!/usr/bin/env bash
# Recurring MySQL -> Postgres sync for AGC2, called by deploy/agc2-sync.service (systemd timer).
# Chains: sync-mysql.ts (extract/clean/upsert) then ingest-data.ts (incremental embed).
# Both scripts are idempotent: upsert-on-source_id + content_hash incremental re-embed, so a
# nightly run only touches new/changed cases. See docs/vm-deployment.md Step 8 and
# docs/on-prem-migration.md "DECIDE AT VM SETUP" item 5 for the known gaps
# (no source-side change-detection, no deletion propagation).
set -euo pipefail

# --- EDIT THIS to the repo path on the VM ---
APP_DIR="/opt/agc2"

LOCKFILE="/tmp/agc2-sync.lock"
LOGFILE="${APP_DIR}/sync.log"

cd "$APP_DIR"

# Prevent overlapping runs (a slow full embed must not collide with the next timer fire).
exec 9>"$LOCKFILE"
if ! flock -n 9; then
  echo "$(date -Is) sync already running — skipping this fire" >>"$LOGFILE"
  exit 0
fi

{
  echo "===== $(date -Is) sync start ====="
  npx tsx scripts/sync-mysql.ts
  npx tsx scripts/ingest-data.ts
  echo "===== $(date -Is) sync done ====="
} >>"$LOGFILE" 2>&1
