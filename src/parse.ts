// Parser for "Liftoscript Workouts", the text format the Liftosaur API uses for history records.
// Format reference: src/liftohistory/liftohistorySerializer.ts in github.com/astashov/liftosaur.
//
//   // workout notes
//   2026-03-01 10:00:00 +00:00 / program: "5/3/1" / dayName: "Squat Day" / week: 1 / dayInWeek: 1 / duration: 3600s / exercises: {
//     // exercise notes
//     Squat / 3x5 185lb, 1x3 185lb @8 / warmup: 1x5 95lb / target: 3x5 185lb 120s
//     Dumbbell Row, Cable / 3x10|10 50lb
//   }

export type WeightUnit = "kg" | "lb";

export interface Weight {
  value: number;
  unit: WeightUnit;
}

export interface LoggedSet {
  reps: number;
  /** Left side reps of a unilateral set; `reps` is then the right side. */
  repsLeft?: number;
  weight?: Weight;
  rpe?: number;
}

export interface LoggedExercise {
  /** Name as Liftosaur prints it; non-default equipment is appended, e.g. "Bench Press, Dumbbell". */
  name: string;
  notes?: string;
  sets: LoggedSet[];
  warmupSets: LoggedSet[];
}

export interface Workout {
  id: number;
  start: Date;
  /** Workout time without pauses, as recorded by Liftosaur. */
  durationSec?: number;
  program?: string;
  dayName?: string;
  week?: number;
  dayInWeek?: number;
  day?: number;
  notes?: string;
  exercises: LoggedExercise[];
}

const DATE_RE = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2}(?:\.\d+)?) ?(Z|[+-]\d{2}:\d{2})/;
const EXERCISES_OPEN_RE = /\s*\/\s*exercises:\s*\{\s*$/;
// Liftosaur doesn't escape quotes, so a quoted value ends at the `"` that is followed by the next ` / key:`.
const FIELD_RE = /\s*\/\s*([A-Za-z_]\w*):\s*("(?:[^"]|"(?!\s*(?:\/\s*[A-Za-z_]\w*:|$)))*"|[^\s/]+)/y;
// "3x8", "1x10|9" (unilateral right|left); a target range "3x8-12" has no space, unlike "1x5 -10kg".
const SET_GROUP_RE = /^(\d+)\s*x\s*(\d+)(?:\|(\d+)|-\d+)?\+?(.*)$/;
const WEIGHT_RE = /(^|\s)([+-]?\d+(?:\.\d+)?)\s*(kg|lb)\+?(?=\s|$)/;
const RPE_RE = /@\s*(\d+(?:\.\d+)?)/;

export function parseWorkout(record: { id: number; text: string }): Workout {
  const lines = record.text.split(/\r?\n/);
  const notes: string[] = [];
  let i = 0;
  for (; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (line.startsWith("//")) {
      notes.push(commentText(line));
    } else if (line !== "") {
      break;
    }
  }

  const workout = parseHeader(record.id, lines[i]?.trim() ?? "");
  if (notes.length > 0) {
    workout.notes = notes.join("\n");
  }

  let exerciseNotes: string[] = [];
  let closed = false;
  for (i++; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (line === "}") {
      closed = true;
      break;
    } else if (line.startsWith("//")) {
      exerciseNotes.push(commentText(line));
    } else if (line !== "") {
      const exercise = parseExerciseLine(line);
      if (exerciseNotes.length > 0) {
        exercise.notes = exerciseNotes.join("\n");
      }
      workout.exercises.push(exercise);
      exerciseNotes = [];
    }
  }
  if (!closed) {
    throw new Error(`Workout ${record.id}: missing closing "}"`);
  }
  return workout;
}

function commentText(line: string): string {
  return line.replace(/^\/\/ ?/, "");
}

function parseHeader(id: number, header: string): Workout {
  const date = DATE_RE.exec(header);
  const open = EXERCISES_OPEN_RE.exec(header);
  if (!date || !open) {
    throw new Error(`Workout ${id}: unrecognized header "${header}"`);
  }
  const start = new Date(`${date[1]}T${date[2]}${date[3]}`);
  if (Number.isNaN(start.getTime())) {
    throw new Error(`Workout ${id}: invalid date "${date[0]}"`);
  }
  const workout: Workout = { id, start, exercises: [] };

  // Unknown or malformed trailing fields are ignored: they're metadata, the sets are what matter.
  const fields = header.slice(date[0].length, open.index);
  FIELD_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = FIELD_RE.exec(fields))) {
    const key = match[1]!;
    const raw = match[2]!;
    const value = raw.startsWith('"') ? raw.slice(1, -1) : raw;
    switch (key) {
      case "program":
        workout.program = value;
        break;
      case "dayName":
        workout.dayName = value;
        break;
      case "week":
      case "dayInWeek":
      case "day":
        workout[key] = Number.parseInt(value, 10);
        break;
      case "duration":
        workout.durationSec = Number.parseInt(value, 10);
        break;
    }
  }
  return workout;
}

function parseExerciseLine(line: string): LoggedExercise {
  const parts = line.split(/\s+\/\s+/);
  // Custom equipment names aren't sanitized and may contain " / ", so the name runs up to the first
  // part that looks like sets ("3x5 …") or a section ("warmup: …").
  const firstSection = parts.findIndex((part, i) => i > 0 && /^(\d+\s*x\s*\d|[A-Za-z_]\w*:)/.test(part));
  // Liftosaur only prints exercises with completed sets, so a line without any is a format we don't know.
  if (firstSection < 0) {
    throw new Error(`No sets found in "${line}"`);
  }
  const exercise: LoggedExercise = { name: parts.slice(0, firstSection).join(" / ").trim(), sets: [], warmupSets: [] };
  for (const section of parts.slice(firstSection)) {
    const keyword = /^([A-Za-z_]\w*):\s*/.exec(section);
    if (!keyword) {
      exercise.sets.push(...parseSets(section));
    } else if (keyword[1] === "warmup") {
      exercise.warmupSets.push(...parseSets(section.slice(keyword[0].length)));
    }
    // `target:` holds the programmed sets, which aren't what was actually lifted.
  }
  return exercise;
}

function parseSets(section: string): LoggedSet[] {
  const sets: LoggedSet[] = [];
  // Set labels, e.g. "(paused)", carry no data we need and may contain commas.
  for (const group of section.replace(/\([^)]*\)/g, " ").split(",")) {
    const text = group.trim();
    if (text === "") {
      continue;
    }
    const match = SET_GROUP_RE.exec(text);
    if (!match) {
      throw new Error(`Unrecognized set "${text}" in "${section}"`);
    }
    const set: LoggedSet = { reps: Number(match[2]) };
    if (match[3] != null) {
      set.repsLeft = Number(match[3]);
    }
    const rest = match[4]!;
    const weight = WEIGHT_RE.exec(rest);
    if (weight) {
      set.weight = { value: Number(weight[2]), unit: weight[3] as WeightUnit };
    }
    const rpe = RPE_RE.exec(rest);
    if (rpe) {
      set.rpe = Number(rpe[1]);
    }
    for (let n = Number(match[1]); n > 0; n--) {
      sets.push({ ...set });
    }
  }
  return sets;
}
