#!/bin/sh
# The scheduled sync for Unraid's User Scripts plugin (see README.md). Runs `sync`, appends its output to
# data/sync.log and sends an Unraid notification when a workout couldn't be synced.
dir=$(cd "$(dirname "$0")/.." && pwd)
mkdir -p "$dir/data"
output=$("$dir/unraid/run.sh" sync 2>&1)
status=$?
printf '%s\n' "$output" | tee -a "$dir/data/sync.log"

notify=/usr/local/emhttp/webGui/scripts/notify
if [ "$status" -ne 0 ] && [ -x "$notify" ]; then
  problem=$(printf '%s\n' "$output" | grep -m 1 -E '^(✗|Error)')
  "$notify" -i warning -e "Liftosaur → Strava" -s "Sync needs attention" -d "${problem:-See $dir/data/sync.log}"
fi
exit "$status"
