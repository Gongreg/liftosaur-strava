import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { loadConfig, writeJson } from "../src/config.ts";
import { parseWorkout } from "../src/parse.ts";
import { rateLimitDelayMs } from "../src/strava.ts";
import { buildActivity, defaultSince, duplicateActivityId } from "../src/sync.ts";

process.env.TZ = "Europe/Vilnius";

const options = { includeWarmups: false, includeNotes: false };
const none = new Map<string, string>();

function workout(body: string, header = '2026-09-23 15:30:00 +00:00 / program: "L/S/U" / dayName: "Upper"'): string {
  return `// Heavy day\n${header} / duration: 2625s / exercises: {\n${body}\n}`;
}

describe("buildActivity", () => {
  it("builds a Strava strength file in kg with unilateral reps summed", () => {
    const parsed = parseWorkout({
      id: 1,
      text: workout(
        [
          "  Bench Press / 2x5 185lb / warmup: 1x5 45lb",
          "  Chest-Supported Row, Dumbbell / 1x10|9 22.5kg",
          "  Pull Up / 1x8, 1x0, 1x5 -10kg",
        ].join("\n")
      ),
    });
    const result = buildActivity(parsed, none, options);
    assert.ok("activity" in result);
    assert.equal(result.activity.name, "L/S/U - Upper");
    assert.equal(result.activity.description, "Synced from Liftosaur");
    assert.equal(result.activity.exerciseCount, 3);
    assert.deepEqual(result.activity.file, {
      version: "1.0",
      start_time: "2026-09-23T15:30:00Z",
      utc_offset: 3 * 3600,
      elapsed_time: 2625,
      creator: { name: "Liftosaur" },
      sets: [
        { exercise_type: "BARBELL_BENCH_PRESS", repetitions: 5, weight: 83.915 },
        { exercise_type: "BARBELL_BENCH_PRESS", repetitions: 5, weight: 83.915 },
        { exercise_type: "CHEST_SUPPORTED_ROW", repetitions: 19, weight: 22.5 },
        { exercise_type: "PULL_UP_GENERIC", repetitions: 8 },
        { exercise_type: "PULL_UP_GENERIC", repetitions: 5 },
      ],
    });
  });

  it("optionally includes warmups and notes", () => {
    const parsed = parseWorkout({ id: 1, text: workout("  Squat / 1x5 100kg / warmup: 1x5 60kg") });
    const result = buildActivity(parsed, none, { includeWarmups: true, includeNotes: true });
    assert.ok("activity" in result);
    assert.deepEqual(
      result.activity.file.sets.map((set) => set.weight),
      [60, 100]
    );
    assert.equal(result.activity.description, "Heavy day\n\nSynced from Liftosaur");
  });

  it("leaves ad-hoc workouts for Strava to name and estimates a missing duration", () => {
    const parsed = parseWorkout({ id: 1, text: "2026-09-23T15:30:00Z / exercises: {\n  Squat / 3x5 100kg\n}" });
    const result = buildActivity(parsed, none, options);
    assert.ok("activity" in result);
    assert.equal(result.activity.name, undefined);
    assert.equal(result.activity.file.elapsed_time, 15 * 60);
  });

  it("reports unmapped exercises and skips SKIP-mapped or empty ones", () => {
    const text = workout("  Landmine 180 / 3x10 20kg\n  Cycling / 1x20\n  Squat / 1x0 100kg");
    assert.deepEqual(buildActivity(parseWorkout({ id: 1, text }), none, options), { unmapped: ["Landmine 180"] });
    const map = new Map([
      ["landmine 180", "SKIP"],
      ["cycling", "SKIP"],
    ]);
    assert.deepEqual(buildActivity(parseWorkout({ id: 1, text }), map, options), { empty: true });
  });

  it("lists inferred mappings", () => {
    const parsed = parseWorkout({ id: 1, text: workout("  Pendulum Squat / 3x8 80kg\n  Hammer Strength Row / 3x8 50kg") });
    const result = buildActivity(parsed, none, options);
    assert.ok("activity" in result);
    assert.deepEqual(
      result.activity.inferred.map(({ name, mapping }) => [name, mapping.type, mapping.source]),
      [
        ["Pendulum Squat", "PENDULUM_SQUAT", "name match"],
        ["Hammer Strength Row", "ROW_GENERIC", "guess"],
      ]
    );
  });
});

describe("duplicateActivityId", () => {
  it("finds the existing activity in Strava's duplicate error", () => {
    assert.equal(duplicateActivityId("liftosaur-1758641400000.json duplicate of activity 21234316"), 21234316);
    assert.equal(
      duplicateActivityId("x.json duplicate of <a href='/activities/15500000000' target='_blank'>activity 15500000000</a>"),
      15500000000
    );
    assert.equal(duplicateActivityId("There was an error processing your activity."), undefined);
  });
});

describe("rateLimitDelayMs", () => {
  it("waits for the next quarter hour, unless the daily limit is spent", () => {
    const now = new Date("2026-09-24T10:07:30Z");
    const headers = new Headers({ "x-ratelimit-limit": "200,2000", "x-ratelimit-usage": "201,900" });
    assert.equal(rateLimitDelayMs(headers, now), 7.5 * 60_000 + 5_000);
    headers.set("x-ratelimit-usage", "201,2000");
    assert.equal(rateLimitDelayMs(headers, now), undefined);
  });
});

describe("defaultSince", () => {
  it("looks back LOOKBACK_DAYS, or further to the last run and to workouts not on Strava yet", () => {
    const dataDir = mkdtempSync(join(tmpdir(), "liftosaur-strava-"));
    const config = { ...loadConfig({}), dataDir, lookbackDays: 7 };
    const now = new Date("2026-09-24T12:00:00Z");
    const since = (): string => defaultSince(config, now).toISOString();
    assert.equal(since(), "2026-09-17T12:00:00.000Z");
    writeJson(join(dataDir, "state.json"), { lastRunAt: "2026-09-23T12:00:00.000Z", records: {} });
    assert.equal(since(), "2026-09-17T12:00:00.000Z");
    writeJson(join(dataDir, "state.json"), { lastRunAt: "2026-09-01T12:00:00.000Z", records: {} });
    assert.equal(since(), "2026-08-31T12:00:00.000Z");
    writeJson(join(dataDir, "state.json"), {
      lastRunAt: "2026-09-23T12:00:00.000Z",
      records: {
        "1": { status: "blocked", reason: "unmapped", start: "2026-08-01T08:00:00.000Z", at: "" },
        "2": { status: "failed", error: "nope", hash: "", at: "" },
      },
    });
    assert.equal(since(), "2026-08-01T08:00:00.000Z");
  });
});
