import { FatalError, requireSetting, type Config } from "./config.ts";
import { parseWorkout, type Workout } from "./parse.ts";

// https://www.liftosaur.com/doc/api
export interface HistoryRecord {
  id: number;
  text: string;
}

interface HistoryPage {
  records: HistoryRecord[];
  hasMore: boolean;
  nextCursor?: number;
}

export type ParsedRecord = { record: HistoryRecord; workout: Workout } | { record: HistoryRecord; error: Error };

async function get<T>(config: Config, path: string): Promise<T> {
  const apiKey = requireSetting(config.liftosaurApiKey, "LIFTOSAUR_API_KEY");
  const response = await fetch(`${config.liftosaurApiBase}${path}`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
  });
  const body = await response.text();
  if (!response.ok) {
    let message = body;
    try {
      message = (JSON.parse(body) as { error?: { message?: string } }).error?.message ?? body;
    } catch {}
    if (response.status === 401) {
      throw new Error(`Liftosaur rejected the API key (${message}). Check LIFTOSAUR_API_KEY.`);
    }
    if (response.status === 403) {
      throw new Error(`Liftosaur API access needs an active premium subscription (${message}).`);
    }
    throw new Error(`Liftosaur GET ${path} failed with ${response.status}: ${message}`);
  }
  return (JSON.parse(body) as { data: T }).data;
}

/**
 * Finished workouts that started at or after `since`, oldest first.
 *
 * Pages newest-first with the cursor instead of using `startDate`, because the API ignores the cursor
 * when `startDate` is set. Record dates can be edited in the app, so paging stops only once a whole
 * page is older than `since`.
 */
export async function fetchWorkoutsSince(config: Config, since: Date): Promise<ParsedRecord[]> {
  const results: ParsedRecord[] = [];
  let cursor: number | undefined;
  for (;;) {
    const query = new URLSearchParams({ limit: "50" });
    if (cursor != null) {
      query.set("cursor", String(cursor));
    }
    const page = await get<HistoryPage>(config, `/history?${query}`);
    let inRange = 0;
    for (const record of page.records) {
      const parsed = parseRecord(record);
      if (startOf(parsed) >= since.getTime()) {
        results.push(parsed);
        inRange++;
      }
    }
    if (!page.hasMore || page.nextCursor == null || inRange === 0) {
      break;
    }
    cursor = page.nextCursor;
  }
  return results.sort((a, b) => startOf(a) - startOf(b));
}

export async function fetchWorkout(config: Config, id: number): Promise<ParsedRecord> {
  // The documented GET /history/:id isn't implemented (404), but the list returns ids below the cursor.
  const page = await get<HistoryPage>(config, `/history?limit=1&cursor=${id + 1}`);
  const record = page.records[0];
  if (record?.id !== id) {
    throw new FatalError(`There's no Liftosaur workout with id ${id}.`);
  }
  return parseRecord(record);
}

function parseRecord(record: HistoryRecord): ParsedRecord {
  try {
    return { record, workout: parseWorkout(record) };
  } catch (error) {
    return { record, error: error as Error };
  }
}

// Record ids are the workout start time in ms, which is the best guess when the text doesn't parse.
function startOf(parsed: ParsedRecord): number {
  return "workout" in parsed ? parsed.workout.start.getTime() : parsed.record.id;
}
