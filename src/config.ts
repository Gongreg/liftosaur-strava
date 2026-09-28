import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const ROOT = join(import.meta.dirname, "..");

export interface Config {
  liftosaurApiKey: string;
  liftosaurApiBase: string;
  stravaClientId: string;
  stravaClientSecret: string;
  stravaApiBase: string;
  stravaOAuthBase: string;
  dataDir: string;
  exerciseMapPath: string;
  lookbackDays: number;
  includeWarmups: boolean;
  includeNotes: boolean;
  pollIntervalMs: number;
  uploadTimeoutMs: number;
}

/** Errors that make the whole run pointless (bad credentials, exhausted limits), as opposed to one workout failing. */
export class FatalError extends Error {}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const envFile = join(ROOT, ".env");
  if (env === process.env && existsSync(envFile)) {
    process.loadEnvFile(envFile);
  }
  return {
    liftosaurApiKey: env.LIFTOSAUR_API_KEY ?? "",
    liftosaurApiBase: env.LIFTOSAUR_API_BASE ?? "https://www.liftosaur.com/api/v1",
    stravaClientId: env.STRAVA_CLIENT_ID ?? "",
    stravaClientSecret: env.STRAVA_CLIENT_SECRET ?? "",
    // Strava announced https://api-v3.strava.com as the new base URL, available from 2027-01-04.
    stravaApiBase: env.STRAVA_API_BASE ?? "https://www.strava.com/api/v3",
    stravaOAuthBase: env.STRAVA_OAUTH_BASE ?? "https://www.strava.com/oauth",
    dataDir: env.DATA_DIR ?? join(ROOT, "data"),
    exerciseMapPath: env.EXERCISE_MAP ?? join(ROOT, "exercise-map.json"),
    lookbackDays: Number(env.LOOKBACK_DAYS ?? 7),
    includeWarmups: env.INCLUDE_WARMUPS === "true",
    includeNotes: env.INCLUDE_NOTES === "true",
    pollIntervalMs: 2000,
    uploadTimeoutMs: 60_000,
  };
}

export function requireSetting(value: string, name: string): string {
  if (!value) {
    throw new FatalError(`${name} is not set. Add it to ${join(ROOT, ".env")} (see .env.example).`);
  }
  return value;
}

/**
 * Strava shows each workout at the UTC offset of this machine's time zone. Docker containers run on UTC unless TZ is
 * set, and a misspelled TZ means UTC too, which would shift every workout.
 */
export function requireTimeZone(
  env: NodeJS.ProcessEnv = process.env,
  // Undefined when TZ names a zone Node doesn't know.
  zone: string | undefined = Intl.DateTimeFormat().resolvedOptions().timeZone
): void {
  const known = zone !== undefined && zone !== "Etc/Unknown";
  if (env.TZ && !known) {
    throw new FatalError(`TZ=${env.TZ} isn't a time zone. Use one like Europe/Vilnius in ${join(ROOT, ".env")}.`);
  }
  if (!env.TZ && (!known || zone === "UTC" || zone === "Etc/UTC")) {
    throw new FatalError(
      `This machine's time zone is UTC, so Strava would show your workouts at the wrong time. ` +
        `Add yours to ${join(ROOT, ".env")}, e.g. TZ=Europe/Vilnius (or TZ=UTC if UTC is right).`
    );
  }
}

export function readJson<T>(path: string): T | undefined {
  if (!existsSync(path)) {
    return undefined;
  }
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

// Write-then-rename, so an interrupted run never leaves a truncated state or token file behind.
export function writeJson(path: string, data: unknown, mode = 0o644): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, { mode });
  renameSync(tmp, path);
}
