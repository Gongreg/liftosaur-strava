#!/bin/sh
# Fills in this machine's paths in the plist template and loads it as a LaunchAgent.
set -e
dir=$(cd "$(dirname "$0")/.." && pwd)
node=${NODE:-$(node -p process.execPath)}  # the real binary, not a version manager's per-shell shim
label=local.liftosaur-strava
target="$HOME/Library/LaunchAgents/$label.plist"

mkdir -p "$dir/data" "$HOME/Library/LaunchAgents"
launchctl bootout "gui/$(id -u)/$label" 2>/dev/null || true
sed -e "s#__NODE__#$node#" -e "s#__DIR__#$dir#g" "$dir/launchd/$label.plist" > "$target"
launchctl bootstrap "gui/$(id -u)" "$target"
echo "Installed $target (node: $node)"
