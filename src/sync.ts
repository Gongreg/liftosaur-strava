import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { FatalError, readJson, writeJson, type Config } from "./config.ts";
import { loadExerciseMap, resolveExercise, SKIP, type ExerciseMap, type Mapping } from "./exercises.ts";
import { fetchWorkout, fetchWorkoutsSince } from "./liftosaur.ts";
import type { LoggedSet, Workout } from "./parse.ts";
import { createUpload, getUpload, type Upload } from "./strava.ts";

const LB_TO_KG = 0.45359237;
const DAY_MS = 24 * 60 * 60 * 1000;

// https://developers.strava.com/docs/uploads/ ("JSON - Strength Training")
export interface StravaSet {
  exercise_type: string;
  repetitions: number;
  /** kg */
  weight?: number;
}

export interface StravaStrengthFile {
  version: "1.0";
  start_time: string;
  utc_offset: number;
  elapsed_time: number;
  creator: { name: string };
  sets: StravaSet[];
}

export interface Activity {
  name?: string;
  description: string;
  file: StravaStrengthFile;
  exerciseCount: number;
  /** Exercises whose Strava type was inferred rather than configured; worth a glance. */
  inferred: { name: string; mapping: Mapping }[];
}

export type BuildResult = { activity: Activity } | { unmapped: string[] } | { empty: true };

export interface BuildOptions {
  includeWarmups: boolean;
  includeNotes: boolean;
}

export function buildActivity(workout: Workout, exerciseMap: ExerciseMap, options: BuildOptions): BuildResult {
  const sets: StravaSet[] = [];
  const unmapped = new Set<string>();
  const inferred = new Map<string, Mapping>();
  let exerciseCount = 0;
  for (const exercise of workout.exercises) {
    const mapping = resolveExercise(exercise.name, exerciseMap);
    if (!mapping) {
      unmapped.add(exercise.name);
      continue;
    }
    const logged = [...(options.includeWarmups ? exercise.warmupSets : []), ...exercise.sets].filter(
      (set) => totalReps(set) > 0
    );
    if (mapping.type === SKIP || logged.length === 0) {
      continue;
    }
    if (mapping.source === "guess" || mapping.source === "name match") {
      inferred.set(exercise.name, mapping);
    }
    exerciseCount++;
    for (const set of logged) {
      sets.push(toStravaSet(mapping.type, set));
    }
  }
  if (unmapped.size > 0) {
    return { unmapped: [...unmapped] };
  }
  if (sets.length === 0) {
    return { empty: true };
  }

  const notes = options.includeNotes && workout.notes ? [workout.notes, ""] : [];
  return {
    activity: {
      name: activityName(workout),
      description: [...notes, "Synced from Liftosaur"].join("\n"),
      exerciseCount,
      inferred: [...inferred].map(([name, mapping]) => ({ name, mapping })),
      file: {
        version: "1.0",
        start_time: workout.start.toISOString().replace(/\.\d+Z$/, "Z"),
        utc_offset: -workout.start.getTimezoneOffset() * 60,
        // Older records may lack a duration; assume ~2.5 minutes per set including rest.
        elapsed_time: workout.durationSec || Math.max(sets.length * 150, 15 * 60),
        creator: { name: "Liftosaur" },
        sets,
      },
    },
  };
}

/** Undefined for ad-hoc workouts, so Strava names them itself ("Evening Weight Training"). */
export function activityName(workout: Workout): string | undefined {
  const { program, dayName } = workout;
  if (program && dayName && dayName !== program) {
    return `${program} - ${dayName}`;
  }
  return program || dayName || undefined;
}

function toStravaSet(exerciseType: string, set: LoggedSet): StravaSet {
  const kg = !set.weight ? 0 : set.weight.unit === "kg" ? set.weight.value : set.weight.value * LB_TO_KG;
  // Bodyweight and assisted (negative weight) sets carry no weight.
  return { exercise_type: exerciseType, repetitions: totalReps(set), ...(kg > 0 ? { weight: round(kg, 3) } : {}) };
}

// Unilateral sets count both sides, like Liftosaur's own volume calculation.
function totalReps(set: LoggedSet): number {
  return set.reps + (set.repsLeft ?? 0);
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

type RecordState =
  | { status: "synced"; activityId: number; at: string }
  // Uploaded, but Strava hadn't finished processing it.
  | { status: "pending"; uploadId: string; hash: string; start: string; at: string }
  // Rejected by Strava; retried if it changes while in the look-back window, or with --retry-failed.
  | { status: "failed"; error: string; hash: string; at: string }
  // Not uploaded yet: unmapped exercise, unreadable record, network trouble…
  | { status: "blocked"; reason: string; start: string; at: string };

interface State {
  /** Start of the last run that covered the default look-back; the next run looks back at least this far. */
  lastRunAt?: string;
  /** Keyed by Liftosaur history record id. */
  records: Record<string, RecordState>;
}

function statePath(config: Config): string {
  return join(config.dataDir, "state.json");
}

function readState(config: Config): State {
  return readJson<State>(statePath(config)) ?? { records: {} };
}

/**
 * Default look-back: LOOKBACK_DAYS, extended back to the last run (e.g. after a week offline) and to every
 * workout that is still blocked or pending, so nothing drops out of the window before it's on Strava.
 */
export function defaultSince(config: Config, now = new Date()): Date {
  const state = readState(config);
  const times = [now.getTime() - config.lookbackDays * DAY_MS];
  if (state.lastRunAt) {
    times.push(Date.parse(state.lastRunAt) - DAY_MS);
  }
  for (const record of Object.values(state.records)) {
    if (record.status === "blocked" || record.status === "pending") {
      times.push(Date.parse(record.start));
    }
  }
  return new Date(Math.min(...times));
}

export interface SyncOptions {
  since: Date;
  /** Sync just this Liftosaur history record, whatever its date. */
  recordId?: number;
  dryRun: boolean;
  force: boolean;
  retryFailed: boolean;
}

export interface SyncResult {
  uploaded: number;
  alreadySynced: number;
  problems: number;
}

export async function sync(config: Config, options: SyncOptions): Promise<SyncResult> {
  const result: SyncResult = { uploaded: 0, alreadySynced: 0, problems: 0 };
  const unlock = options.dryRun ? () => {} : lock(config);
  if (!unlock) {
    console.log("Another sync is running, skipping this one.");
    return result;
  }
  try {
    await run(config, options, result);
  } finally {
    unlock();
  }
  return result;
}

async function run(config: Config, options: SyncOptions, result: SyncResult): Promise<void> {
  const startedAt = new Date();
  // Only a run that covered the whole default window may move that window forward.
  const coversDefaultWindow =
    options.recordId == null && options.since.getTime() <= defaultSince(config, startedAt).getTime();
  const { map: exerciseMap, warnings } = loadExerciseMap(config.exerciseMapPath);
  for (const warning of warnings) {
    console.warn(`! ${warning}`);
  }
  const state = readState(config);
  const save = (): void => {
    if (!options.dryRun) {
      writeJson(statePath(config), state);
    }
  };
  const now = (): string => new Date().toISOString();

  const records =
    options.recordId != null
      ? [await fetchWorkout(config, options.recordId)]
      : await fetchWorkoutsSince(config, options.since);

  // Blocked or pending workouts that were deleted from Liftosaur don't need syncing anymore.
  if (options.recordId == null) {
    const fetched = new Set(records.map(({ record }) => String(record.id)));
    for (const [id, entry] of Object.entries(state.records)) {
      const outstanding = entry.status === "blocked" || entry.status === "pending";
      if (outstanding && Date.parse(entry.start) >= options.since.getTime() && !fetched.has(id)) {
        delete state.records[id];
      }
    }
  }

  const block = (id: string, start: Date, label: string, reason: string): void => {
    console.error(`✗ ${label}: ${reason}`);
    result.problems++;
    // A pending upload stays pending, so the next run checks on it rather than uploading again, and a
    // workout that is already on Strava (a --force run) stays synced.
    const status = state.records[id]?.status;
    if (status !== "pending" && status !== "synced") {
      state.records[id] = { status: "blocked", reason, start: start.toISOString(), at: now() };
    }
    save();
  };

  const settle = (id: string, label: string, upload: Upload, hash: string, activity: Activity, start: Date): void => {
    const duplicateOf = upload.error ? duplicateActivityId(upload.error) : undefined;
    const activityId = upload.activity_id ?? duplicateOf;
    if (activityId != null) {
      state.records[id] = { status: "synced", activityId, at: now() };
      if (duplicateOf !== undefined) {
        console.log(`= ${label}: already on Strava, https://www.strava.com/activities/${activityId}`);
        result.alreadySynced++;
      } else {
        console.log(`✓ ${label} (${summary(activity)}) → https://www.strava.com/activities/${activityId}`);
        printInferred(activity);
        result.uploaded++;
      }
    } else if (upload.error) {
      const error = upload.error.replace(/<[^>]*>/g, "").trim();
      state.records[id] = { status: "failed", error, hash, at: now() };
      console.error(`✗ ${label}: Strava rejected the upload: ${error}`);
      result.problems++;
    } else {
      state.records[id] = { status: "pending", uploadId: upload.id_str, hash, start: start.toISOString(), at: now() };
      console.log(`… ${label}: Strava is still processing it; the next run will check again`);
    }
    save();
  };

  const syncWorkout = async (id: string, workout: Workout, label: string): Promise<void> => {
    const previous = state.records[id];
    const built = buildActivity(workout, exerciseMap, config);
    if ("unmapped" in built) {
      const names = built.unmapped.map((name) => `"${name}"`).join(", ");
      block(id, workout.start, label, `no Strava exercise type for ${names}. Add it to exercise-map.json (npm run exercises).`);
      return;
    }
    if ("empty" in built) {
      console.log(`- ${label}: nothing to upload`);
      if (previous?.status === "blocked") {
        delete state.records[id];
        save();
      }
      return;
    }
    const { activity } = built;
    const hash = createHash("sha256")
      .update(JSON.stringify([activity.name, activity.description, activity.file]))
      .digest("hex")
      .slice(0, 16);
    if (previous?.status === "failed" && previous.hash === hash && !options.retryFailed && !options.force) {
      // Already reported when it failed.
      console.log(`- ${label}: skipped, Strava rejected it before (${previous.error}). Use --retry-failed to retry.`);
      return;
    }
    if (options.dryRun) {
      const file = join(config.dataDir, "dry-run", `${id}.json`);
      writeJson(file, { name: activity.name, description: activity.description, file: activity.file });
      console.log(`• ${label} (${summary(activity)}) would be uploaded, see ${file}`);
      printInferred(activity);
      return;
    }

    // An earlier upload that was still processing is checked first, even if the workout changed since,
    // so the workout doesn't end up on Strava twice.
    if (previous?.status === "pending") {
      const earlier = await getUpload(config, previous.uploadId);
      if (earlier) {
        const upload = await waitForUpload(config, earlier);
        const rejected = upload.error != null && duplicateActivityId(upload.error) === undefined;
        if (!rejected || previous.hash === hash) {
          settle(id, label, upload, previous.hash, activity, workout.start);
          if (previous.hash !== hash && state.records[id]?.status === "synced") {
            console.log(`    Changes made since aren't on Strava. To replace it, delete the activity and run: npm run sync -- --id ${id} --force`);
          }
          return;
        }
        // Rejected, but the workout has changed since: upload the new version.
      }
    }

    const upload = await createUpload(config, {
      file: JSON.stringify(activity.file),
      // Unique per upload: Strava ties an external_id to its first upload, so reusing one after that activity
      // was deleted only returns "The created activity has been deleted." Double uploads are prevented by the
      // state file and the lock instead.
      externalId: `liftosaur-${id}-${Date.now().toString(36)}`,
      name: activity.name,
      description: activity.description,
    });
    if (upload.id_str && !upload.error) {
      // Remembered right away, so an interrupted run checks on it instead of uploading again.
      state.records[id] = { status: "pending", uploadId: upload.id_str, hash, start: workout.start.toISOString(), at: now() };
      save();
    }
    settle(id, label, await waitForUpload(config, upload), hash, activity, workout.start);
  };

  for (const parsed of records) {
    const id = String(parsed.record.id);
    if (state.records[id]?.status === "synced" && !options.force) {
      result.alreadySynced++;
      continue;
    }
    if ("error" in parsed) {
      block(id, new Date(parsed.record.id), `Liftosaur record ${id}`, parsed.error.message);
      continue;
    }
    const label = `${formatLocal(parsed.workout.start)} ${activityName(parsed.workout) ?? "Workout"}`;
    try {
      await syncWorkout(id, parsed.workout, label);
    } catch (error) {
      if (error instanceof FatalError) {
        throw error;
      }
      // Only this workout is affected (e.g. a network hiccup); it's retried next run.
      block(id, parsed.workout.start, label, (error as Error).message);
    }
  }

  if (!options.dryRun && coversDefaultWindow) {
    state.lastRunAt = startedAt.toISOString();
    save();
  }
}

/** Keeps a manual run and the scheduled one from uploading the same workout. Undefined while another run holds it. */
function lock(config: Config): (() => void) | undefined {
  const path = join(config.dataDir, "sync.lock");
  mkdirSync(config.dataDir, { recursive: true });
  for (;;) {
    try {
      writeFileSync(path, String(process.pid), { flag: "wx" });
      return () => rmSync(path, { force: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        throw error;
      }
    }
    const pid = Number(readFileSync(path, "utf8"));
    if (pid > 0 && isRunning(pid)) {
      return undefined;
    }
    // Left behind by a run that crashed.
    rmSync(path, { force: true });
  }
}

function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

function summary(activity: Activity): string {
  return `${plural(activity.exerciseCount, "exercise")}, ${plural(activity.file.sets.length, "set")}`;
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function printInferred(activity: Activity): void {
  for (const { name, mapping } of activity.inferred) {
    console.log(`    ~ ${name} → ${mapping.type} (${mapping.source}; pin it in exercise-map.json if that's wrong)`);
  }
}

async function waitForUpload(config: Config, upload: Upload): Promise<Upload> {
  const deadline = Date.now() + config.uploadTimeoutMs;
  while (!upload.error && upload.activity_id == null && Date.now() < deadline) {
    await sleep(config.pollIntervalMs);
    const next = await getUpload(config, upload.id_str);
    if (!next) {
      return { ...upload, error: "Strava lost track of the upload" };
    }
    upload = next;
  }
  return upload;
}

/** "… duplicate of <a href='/activities/123'>activity 123</a>" → 123 */
export function duplicateActivityId(error: string): number | undefined {
  const match = /duplicate of[^0-9]*?activit(?:y|ies)[^0-9]*(\d+)/i.exec(error);
  return match ? Number(match[1]) : undefined;
}

export function formatLocal(date: Date): string {
  return new Intl.DateTimeFormat("sv-SE", { dateStyle: "short", timeStyle: "short" }).format(date);
}

/** Every exercise name in the history since `since`, with how it maps to Strava. */
export async function listExercises(
  config: Config,
  since: Date
): Promise<{ workouts: number; exercises: { name: string; count: number; mapping?: Mapping }[]; warnings: string[] }> {
  const { map: exerciseMap, warnings } = loadExerciseMap(config.exerciseMapPath);
  const counts = new Map<string, number>();
  let workouts = 0;
  for (const parsed of await fetchWorkoutsSince(config, since)) {
    if ("error" in parsed) {
      warnings.push(`Liftosaur record ${parsed.record.id}: ${parsed.error.message}`);
      continue;
    }
    workouts++;
    for (const exercise of parsed.workout.exercises) {
      counts.set(exercise.name, (counts.get(exercise.name) ?? 0) + 1);
    }
  }
  const exercises = [...counts].map(([name, count]) => ({ name, count, mapping: resolveExercise(name, exerciseMap) }));
  return { workouts, exercises, warnings };
}
