#!/bin/sh
# Runs a command in a throwaway Node.js container, for machines without Node such as Unraid. Takes the same arguments
# as `npm run`: `npm run sync -- --dry-run` becomes `unraid/run.sh sync -- --dry-run`. This folder is mounted into the
# container, so .env, exercise-map.json and data/ are the same files. NODE_IMAGE picks another image (Node 22.18+).
dir=$(cd "$(dirname "$0")/.." && pwd)

# Like npm, drop the `--` before the options: the CLI takes options after a lone `--` as plain words.
if [ "${2:-}" = "--" ]; then
  command=$1
  shift 2
  set -- "$command" "$@"
fi

# `auth` waits for Strava to send the browser back to 127.0.0.1:8723. On the host's network that's the server's own
# 127.0.0.1, which an SSH tunnel can reach (see README.md).
network=bridge
if [ "${1:-}" = auth ]; then
  network=host
fi

exec docker run --rm --init --network "$network" -v "$dir:/app" -w /app "${NODE_IMAGE:-node:24-alpine}" \
  node src/cli.ts "$@"
