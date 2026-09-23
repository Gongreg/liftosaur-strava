import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";
import { loadConfig, type Config } from "./config.ts";
import { STRAVA_EXERCISE_TYPES } from "./stravaExerciseTypes.ts";
import { connectStrava } from "./strava.ts";
import { defaultSince, formatLocal, listExercises, sync } from "./sync.ts";

const USAGE = `Sync Liftosaur workouts to Strava.

Usage: npm run <command> [-- options]

  auth                  Connect your Strava account (opens the browser)
  sync                  Upload finished Liftosaur workouts that aren't on Strava yet
      --since DATE        Look back to this date (default: LOOKBACK_DAYS ago, or further if needed)
      --id ID             Sync one Liftosaur history record, whatever its date
      --dry-run           Only show what would be uploaded; writes the files to data/dry-run/
      --retry-failed      Retry workouts Strava rejected before
      --force             Upload even if the workout was synced before
  exercises             Show how the exercises in your history map to Strava
      --since DATE        (default: 90 days ago)
  types [WORD...]       List Strava exercise types, e.g. \`npm run types -- row machine\``;

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      since: { type: "string" },
      id: { type: "string" },
      "dry-run": { type: "boolean", default: false },
      "retry-failed": { type: "boolean", default: false },
      force: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  const [command, ...words] = positionals;
  const config = loadConfig();

  if (values.help || command === undefined || command === "help") {
    console.log(USAGE);
  } else if (command === "auth") {
    const tokens = await connectStrava(config);
    const who = [tokens.athlete?.firstname, tokens.athlete?.lastname].filter(Boolean).join(" ");
    console.log(`Connected to Strava${who ? ` as ${who}` : ""}. Next: npm run sync -- --dry-run`);
  } else if (command === "sync") {
    const since = values.since ? parseDate(values.since) : defaultSince(config);
    const recordId = values.id === undefined ? undefined : Number(values.id);
    if (recordId !== undefined && !Number.isInteger(recordId)) {
      throw new Error(`--id must be a Liftosaur history record id, got "${values.id}"`);
    }
    console.log(
      `${formatLocal(new Date())} · ${recordId !== undefined ? `workout ${recordId}` : `workouts since ${formatLocal(since)}`}` +
        (values["dry-run"] ? " (dry run)" : "")
    );
    const result = await sync(config, {
      since,
      recordId,
      dryRun: values["dry-run"],
      force: values.force,
      retryFailed: values["retry-failed"],
    });
    console.log(
      `Done: ${result.uploaded} uploaded, ${result.alreadySynced} already on Strava` +
        (result.problems > 0 ? `, ${result.problems} need attention` : "")
    );
    if (result.problems > 0) {
      process.exitCode = 1;
      notify(`${result.problems} workout(s) couldn't be synced. Run \`npm run sync\` to see why.`);
    }
  } else if (command === "exercises") {
    const since = values.since ? parseDate(values.since) : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    await printExercises(config, since);
  } else if (command === "types") {
    const filters = words.map((word) => word.toUpperCase());
    const matches = [...STRAVA_EXERCISE_TYPES].filter((type) => filters.every((filter) => type.includes(filter)));
    console.log(matches.length > 0 ? matches.join("\n") : "No matching Strava exercise types.");
  } else {
    console.error(`Unknown command "${command}".\n\n${USAGE}`);
    process.exitCode = 1;
  }
}

async function printExercises(config: Config, since: Date): Promise<void> {
  const { workouts, exercises, warnings } = await listExercises(config, since);
  for (const warning of warnings) {
    console.warn(`! ${warning}`);
  }
  console.log(`Exercises in ${workouts} workouts since ${formatLocal(since)}:\n`);
  const order = ["guess", "name match", "exercise-map.json", "built-in"];
  exercises.sort(
    (a, b) =>
      (a.mapping ? order.indexOf(a.mapping.source) + 1 : 0) - (b.mapping ? order.indexOf(b.mapping.source) + 1 : 0) ||
      b.count - a.count
  );
  const width = Math.max(0, ...exercises.map((e) => `${e.name} (${e.count}×)`.length));
  for (const { name, count, mapping } of exercises) {
    const source = (mapping?.source ?? "UNMAPPED").padEnd(18);
    console.log(`  ${source} ${`${name} (${count}×)`.padEnd(width)}  ${mapping ? `→ ${mapping.type}` : ""}`.trimEnd());
  }
  console.log(
    `\n"guess" and "name match" are inferred. To set or change a mapping, add it to exercise-map.json:\n` +
      `  "Liftosaur exercise name": "STRAVA_EXERCISE_TYPE" (or "SKIP" to leave it out); \`npm run types -- WORD\` searches types.`
  );
}

function parseDate(value: string): Date {
  // A plain date means local midnight, not UTC.
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const date = day ? new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3])) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date "${value}", use YYYY-MM-DD`);
  }
  return date;
}

/** Surfaces failures of unattended (launchd) runs as a macOS notification. */
function notify(message: string): void {
  if (process.platform === "darwin" && !process.stdout.isTTY) {
    spawnSync("osascript", ["-e", `display notification ${JSON.stringify(message)} with title "Liftosaur → Strava"`]);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error: ${message}`);
  notify(message.split("\n")[0]!);
  process.exitCode = 1;
});
