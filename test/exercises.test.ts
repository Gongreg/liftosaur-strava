import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { builtInExercises, loadExerciseMap, resolveExercise } from "../src/exercises.ts";
import { STRAVA_EXERCISE_TYPES } from "../src/stravaExerciseTypes.ts";

const none = new Map<string, string>();

describe("resolveExercise", () => {
  it("only uses exercise types Strava accepts", () => {
    for (const [name, types] of builtInExercises()) {
      for (const type of types) {
        assert.ok(STRAVA_EXERCISE_TYPES.has(type), `${name}: ${type}`);
      }
    }
  });

  it("maps built-in exercises by default and by explicit equipment", () => {
    assert.deepEqual(resolveExercise("Bench Press", none), { type: "BARBELL_BENCH_PRESS", source: "built-in" });
    assert.deepEqual(resolveExercise("Bench Press, Dumbbell", none), { type: "DUMBBELL_BENCH_PRESS", source: "built-in" });
    assert.deepEqual(resolveExercise("Shoulder Press, Leverage Machine", none), {
      type: "MACHINE_SEATED_SHOULDER_PRESS",
      source: "built-in",
    });
    assert.deepEqual(resolveExercise("Standing Row Rear Delt, Horizontal, With Rope", none), {
      type: "FACE_PULL",
      source: "built-in",
    });
  });

  it("falls back to the default variant for custom equipment", () => {
    assert.deepEqual(resolveExercise("Deadlift, Hex Bar", none), { type: "BARBELL_DEADLIFT", source: "guess" });
  });

  it("matches custom exercises named like Strava exercise types", () => {
    assert.deepEqual(resolveExercise("Pendulum Squat", none), { type: "PENDULUM_SQUAT", source: "name match" });
    assert.deepEqual(resolveExercise("Row, Landmine", none), { type: "LANDMINE_ROW", source: "name match" });
    assert.deepEqual(resolveExercise("Goblet Squat, Dumbbell", none), {
      type: "DUMBBELL_GOBLET_SQUATS",
      source: "built-in",
    });
  });

  it("guesses a category from keywords and gives up on the rest", () => {
    assert.deepEqual(resolveExercise("Hammer Strength Row", none), { type: "ROW_GENERIC", source: "guess" });
    assert.deepEqual(resolveExercise("Glute Kickback Machine Thing", none), {
      type: "HIP_STABILITY_GENERIC",
      source: "guess",
    });
    assert.equal(resolveExercise("Landmine 180", none), undefined);
  });

  it("prefers exercise-map.json, case-insensitively", () => {
    const map = new Map([
      ["bench press", "PAUSED_BENCH_PRESS"],
      ["cycling", "SKIP"],
    ]);
    assert.deepEqual(resolveExercise("Bench Press", map), { type: "PAUSED_BENCH_PRESS", source: "exercise-map.json" });
    assert.deepEqual(resolveExercise("Bench Press, Dumbbell", map), { type: "DUMBBELL_BENCH_PRESS", source: "built-in" });
    assert.deepEqual(resolveExercise("Cycling", map), { type: "SKIP", source: "exercise-map.json" });
  });
});

describe("loadExerciseMap", () => {
  const write = (content: string): string => {
    const path = join(mkdtempSync(join(tmpdir(), "exercise-map-")), "exercise-map.json");
    writeFileSync(path, content);
    return path;
  };

  it("reads mappings, skips comment keys and warns about unknown types", () => {
    const path = write('{"//": "comment", "Landmine 180": "chop_generic", "Foo": "NOT_A_TYPE"}');
    const { map, warnings } = loadExerciseMap(path);
    assert.deepEqual([...map], [
      ["landmine 180", "CHOP_GENERIC"],
      ["foo", "NOT_A_TYPE"],
    ]);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0]!, /NOT_A_TYPE/);
  });

  it("treats a missing file as empty and rejects malformed ones", () => {
    assert.equal(loadExerciseMap("/nonexistent/exercise-map.json").map.size, 0);
    assert.throws(() => loadExerciseMap(write("{ nope")), /not valid JSON/);
    assert.throws(() => loadExerciseMap(write('{"Squat": 5}')), /must be a string/);
  });
});
