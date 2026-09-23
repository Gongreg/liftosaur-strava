import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseWorkout } from "../src/parse.ts";

describe("parseWorkout", () => {
  it("parses a program workout as the Liftosaur serializer prints it", () => {
    const text = [
      "// Felt strong today",
      "// second line",
      '2026-09-23 15:30:00 +00:00 / program: "L/S/U" / dayName: "Upper" / week: 2 / dayInWeek: 1 / duration: 2625s / exercises: {',
      "  // elbow a bit sore",
      "  Bench Press / 3x8 60kg, 1x6 60kg @9 / warmup: 1x10 20kg, 1x5 40kg / target: 4x8 60kg 120s",
      "  Chest-Supported Row, Dumbbell / 3x10|9 22.5kg (paused) / target: 3x8-12 22.5kg",
      "  Pull Up / 3x8, 1x5 -10kg",
      "  Lateral Raise / 2x15 15lb / target: 2x15+ 15lb+ @8+ 60s",
      "}",
    ].join("\n");

    const workout = parseWorkout({ id: 1758641400000, text });

    assert.equal(workout.id, 1758641400000);
    assert.equal(workout.start.toISOString(), "2026-09-23T15:30:00.000Z");
    assert.equal(workout.program, "L/S/U");
    assert.equal(workout.dayName, "Upper");
    assert.equal(workout.week, 2);
    assert.equal(workout.dayInWeek, 1);
    assert.equal(workout.durationSec, 2625);
    assert.equal(workout.notes, "Felt strong today\nsecond line");
    assert.deepEqual(workout.exercises, [
      {
        name: "Bench Press",
        notes: "elbow a bit sore",
        sets: [
          { reps: 8, weight: { value: 60, unit: "kg" } },
          { reps: 8, weight: { value: 60, unit: "kg" } },
          { reps: 8, weight: { value: 60, unit: "kg" } },
          { reps: 6, weight: { value: 60, unit: "kg" }, rpe: 9 },
        ],
        warmupSets: [
          { reps: 10, weight: { value: 20, unit: "kg" } },
          { reps: 5, weight: { value: 40, unit: "kg" } },
        ],
      },
      {
        name: "Chest-Supported Row, Dumbbell",
        sets: [
          { reps: 10, repsLeft: 9, weight: { value: 22.5, unit: "kg" } },
          { reps: 10, repsLeft: 9, weight: { value: 22.5, unit: "kg" } },
          { reps: 10, repsLeft: 9, weight: { value: 22.5, unit: "kg" } },
        ],
        warmupSets: [],
      },
      {
        name: "Pull Up",
        sets: [{ reps: 8 }, { reps: 8 }, { reps: 8 }, { reps: 5, weight: { value: -10, unit: "kg" } }],
        warmupSets: [],
      },
      {
        name: "Lateral Raise",
        sets: [
          { reps: 15, weight: { value: 15, unit: "lb" } },
          { reps: 15, weight: { value: 15, unit: "lb" } },
        ],
        warmupSets: [],
      },
    ]);
  });

  it("parses the ISO date format from the API docs", () => {
    const text =
      '2026-03-01T10:00:00Z / program: "5/3/1" / dayName: "Squat Day" / week: 1 / dayInWeek: 1 / duration: 3600s / exercises: {\n' +
      "  Squat, Barbell / 3x5 185lb / warmup: 1x5 95lb, 1x3 135lb / target: 3x5 185lb 120s\n" +
      "  Leg Press / 3x10 200lb / target: 3x10 200lb 90s\n" +
      "}";
    const workout = parseWorkout({ id: 1, text });
    assert.equal(workout.start.toISOString(), "2026-03-01T10:00:00.000Z");
    assert.equal(workout.program, "5/3/1");
    assert.deepEqual(
      workout.exercises.map((e) => [e.name, e.sets.length, e.warmupSets.length]),
      [
        ["Squat, Barbell", 3, 2],
        ["Leg Press", 3, 0],
      ]
    );
  });

  it("parses an ad-hoc workout without program or duration", () => {
    const workout = parseWorkout({ id: 2, text: "2026-02-28T10:30:00.000Z / exercises: {\n}" });
    assert.equal(workout.start.toISOString(), "2026-02-28T10:30:00.000Z");
    assert.equal(workout.program, undefined);
    assert.equal(workout.durationSec, undefined);
    assert.deepEqual(workout.exercises, []);
  });

  it("handles local offsets, single-week program days and odd program names", () => {
    const text = '2026-01-05 07:00:00 +02:00 / program: "Upper / Lower "Pro"" / day: 3 / exercises: {\n  Squat / 1x5 100kg\n}';
    const workout = parseWorkout({ id: 3, text });
    assert.equal(workout.start.toISOString(), "2026-01-05T05:00:00.000Z");
    assert.equal(workout.program, 'Upper / Lower "Pro"');
    assert.equal(workout.day, 3);
    assert.equal(workout.exercises[0]?.sets[0]?.reps, 5);
  });

  it("keeps commas that are part of the exercise name", () => {
    const text = "2026-01-05T07:00:00Z / exercises: {\n  Standing Row Rear Delt, Horizontal, With Rope / 3x12 20kg\n}";
    assert.equal(parseWorkout({ id: 4, text }).exercises[0]?.name, "Standing Row Rear Delt, Horizontal, With Rope");
  });

  it("keeps slashes in custom equipment names, which Liftosaur doesn't sanitize", () => {
    const text = "2026-01-05T07:00:00Z / exercises: {\n  Bench Press, Hammer Strength / Plate / 1x5 100kg / warmup: 1x5 60kg\n}";
    const [exercise] = parseWorkout({ id: 8, text }).exercises;
    assert.equal(exercise?.name, "Bench Press, Hammer Strength / Plate");
    assert.deepEqual(exercise?.sets, [{ reps: 5, weight: { value: 100, unit: "kg" } }]);
    assert.equal(exercise?.warmupSets.length, 1);
  });

  it("reads a quoted value up to the quote that precedes the next field", () => {
    const text = '2026-01-05T07:00:00Z / program: "A" / B" / dayName: "Push" / exercises: {\n}';
    const workout = parseWorkout({ id: 9, text });
    assert.equal(workout.program, 'A" / B');
    assert.equal(workout.dayName, "Push");
  });

  it("rejects text it doesn't understand", () => {
    assert.throws(() => parseWorkout({ id: 5, text: "2026-01-05T07:00:00Z / exercises: {\n  Squat / 1x5 100kg\n" }), /closing/);
    assert.throws(() => parseWorkout({ id: 6, text: "yesterday / exercises: {\n}" }), /header/);
    assert.throws(() => parseWorkout({ id: 7, text: "2026-01-05T07:00:00Z / exercises: {\n  Squat / five 100kg\n}" }), /set/);
  });
});
