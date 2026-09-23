// Runs `sync` against a local stand-in for the Liftosaur and Strava APIs.
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, beforeEach, describe, it, mock } from "node:test";
import { loadConfig, readJson, writeJson, type Config } from "../src/config.ts";
import { defaultSince, sync, type SyncOptions } from "../src/sync.ts";

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();

function record(daysAgo: number, body: string, header = ""): { id: number; text: string } {
  const id = now - daysAgo * DAY;
  const date = new Date(id).toISOString().replace(/\.\d+Z$/, "Z");
  return { id, text: `${date}${header} / exercises: {\n${body}\n}` };
}

interface ReceivedUpload {
  fields: Record<string, string>;
  file: { sets: { exercise_type: string }[] };
}

// What the fake APIs serve, and what they received. Reset before each test.
const api = {
  history: [] as { id: number; text: string }[],
  duplicates: new Set<number>(), // workouts Strava reports as duplicates
  stuck: new Set<number>(), // workouts whose upload stays "processing"
  uploads: [] as ReceivedUpload[],
  polls: new Map<string, number>(),
  historyRequests: [] as string[],
  tokenRequests: [] as URLSearchParams[],
};

/** The Liftosaur workout id inside an external_id like "liftosaur-1790073106143-mfv3k2a1". */
function workoutOf(externalId: string | undefined): number {
  return Number(/^liftosaur-(\d+)-[0-9a-z]+$/.exec(externalId ?? "")?.[1]);
}

async function body(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://localhost");
  const json = (status: number, data: unknown): void => {
    response.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify(data));
  };

  if (url.pathname === "/api/v1/history") {
    assert.equal(request.headers.authorization, "Bearer lftsk_test");
    api.historyRequests.push(url.search);
    // Newest first, ids below the cursor, pages of at most two so the client has to follow the cursor.
    const cursor = url.searchParams.get("cursor");
    const newestFirst = [...api.history].sort((a, b) => b.id - a.id);
    const rest = cursor ? newestFirst.filter((r) => r.id < Number(cursor)) : newestFirst;
    const records = rest.slice(0, Math.min(2, Number(url.searchParams.get("limit") ?? 50)));
    const hasMore = rest.length > records.length;
    return json(200, { data: { records, hasMore, ...(hasMore ? { nextCursor: records.at(-1)!.id } : {}) } });
  }

  if (url.pathname === "/oauth/token") {
    api.tokenRequests.push(new URLSearchParams((await body(request)).toString()));
    return json(200, { access_token: "fresh", refresh_token: "rotated", expires_at: Math.floor(now / 1000) + 21600 });
  }

  assert.equal(request.headers.authorization, "Bearer fresh");
  if (url.pathname === "/api/v3/uploads" && request.method === "POST") {
    const form = await new Request("http://localhost", {
      method: "POST",
      headers: { "content-type": request.headers["content-type"]! },
      body: new Uint8Array(await body(request)),
    }).formData();
    const file = form.get("file") as File;
    const fields = Object.fromEntries([...form].filter(([key]) => key !== "file")) as Record<string, string>;
    // Like Strava, a reused external_id gets the earlier upload back, whose activity we treat as deleted.
    const earlier = api.uploads.findIndex((upload) => upload.fields.external_id === fields.external_id);
    if (earlier >= 0) {
      const status = "The created activity has been deleted.";
      return json(201, { id_str: String(1001 + earlier), error: null, status, activity_id: null });
    }
    api.uploads.push({ fields: { ...fields, fileName: file.name }, file: JSON.parse(await file.text()) });
    const uploadId = String(1000 + api.uploads.length);
    return json(201, { id_str: uploadId, error: null, status: "Your activity is still being processed.", activity_id: null });
  }

  const poll = /^\/api\/v3\/uploads\/(\d+)$/.exec(url.pathname);
  if (poll) {
    const uploadId = poll[1]!;
    const externalId = api.uploads[Number(uploadId) - 1001]?.fields.external_id;
    if (!externalId) {
      return json(404, { message: "Record Not Found" });
    }
    const count = (api.polls.get(uploadId) ?? 0) + 1;
    api.polls.set(uploadId, count);
    if (count < 2 || api.stuck.has(workoutOf(externalId))) {
      return json(200, { id_str: uploadId, error: null, status: "Your activity is still being processed.", activity_id: null });
    }
    if (api.duplicates.has(workoutOf(externalId))) {
      const error = `${externalId}.json duplicate of <a href='/activities/777' target='_blank'>activity 777</a>`;
      return json(200, { id_str: uploadId, error, status: "There was an error processing your activity.", activity_id: null });
    }
    return json(200, { id_str: uploadId, error: null, status: "Your activity is ready.", activity_id: 5000 + Number(uploadId) });
  }

  json(404, { error: "not found" });
});

let base = "";
const output: string[] = [];

before(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  for (const method of ["log", "error", "warn"] as const) {
    mock.method(console, method, (...args: unknown[]) => output.push(args.join(" ")));
  }
});

after(() => {
  mock.restoreAll();
  server.close();
});

beforeEach(() => {
  api.history = [];
  api.duplicates.clear();
  api.stuck.clear();
  api.uploads = [];
  api.polls.clear();
  api.historyRequests = [];
  api.tokenRequests = [];
  output.length = 0;
});

/** A fresh data directory, with an expired access token so the first Strava call refreshes it. */
function setup(): Config {
  const dir = mkdtempSync(join(tmpdir(), "liftosaur-strava-e2e-"));
  const config: Config = {
    ...loadConfig({}),
    liftosaurApiKey: "lftsk_test",
    liftosaurApiBase: `${base}/api/v1`,
    stravaClientId: "123",
    stravaClientSecret: "secret",
    stravaApiBase: `${base}/api/v3`,
    stravaOAuthBase: `${base}/oauth`,
    dataDir: join(dir, "data"),
    exerciseMapPath: join(dir, "exercise-map.json"),
    pollIntervalMs: 1,
    uploadTimeoutMs: 50,
  };
  const tokens = { access_token: "stale", refresh_token: "original", expires_at: Math.floor(now / 1000) - 60 };
  writeJson(join(config.dataDir, "strava-tokens.json"), tokens, 0o600);
  return config;
}

function run(config: Config, options: Partial<SyncOptions> = {}) {
  return sync(config, { since: defaultSince(config), dryRun: false, force: false, retryFailed: false, ...options });
}

interface State {
  lastRunAt?: string;
  records: Record<string, { status: string; activityId?: number; uploadId?: string }>;
}

function state(config: Config): State {
  return readJson<State>(join(config.dataDir, "state.json"))!;
}

const landmine = record(1, "  Landmine 180 / 3x10 20kg");
const gzclp = record(
  2,
  "  Squat / 5x3 100kg\n  Bench Press, Dumbbell / 3x10 30kg",
  ' / program: "GZCLP" / dayName: "A1" / week: 1 / dayInWeek: 1 / duration: 3000s'
);
const deadlift = record(3, "  Deadlift / 1x5 140kg");
const old = record(30, "  Deadlift / 1x5 130kg");

describe("sync end to end", () => {
  it("dry run writes the files without touching Strava or the state", async () => {
    api.history = [landmine, gzclp, deadlift, old];
    const config = setup();
    assert.deepEqual(await run(config, { dryRun: true }), { uploaded: 0, alreadySynced: 0, problems: 1 });
    assert.equal(api.uploads.length, 0);
    assert.equal(api.tokenRequests.length, 0);
    assert.equal(readJson<{ name: string }>(join(config.dataDir, "dry-run", `${gzclp.id}.json`))?.name, "GZCLP - A1");
    assert.equal(readJson(join(config.dataDir, "state.json")), undefined);
  });

  it("uploads new workouts, recognises duplicates and reports unmapped exercises", async () => {
    api.history = [landmine, gzclp, deadlift, old];
    api.duplicates.add(deadlift.id);
    const config = setup();
    assert.deepEqual(await run(config), { uploaded: 1, alreadySynced: 1, problems: 1 });

    // Followed the cursor, and stopped after the page that went past `since`.
    assert.deepEqual(api.historyRequests, ["?limit=50", `?limit=50&cursor=${gzclp.id}`]);

    // Refreshed the expired token once and kept the rotated refresh token.
    assert.equal(api.tokenRequests.length, 1);
    assert.equal(api.tokenRequests[0]!.get("refresh_token"), "original");
    assert.equal(readJson<{ refresh_token: string }>(join(config.dataDir, "strava-tokens.json"))?.refresh_token, "rotated");

    // Oldest first: the deadlift (a duplicate on Strava), then GZCLP. The Landmine workout never went out.
    assert.equal(api.uploads.length, 2);
    const { external_id, fileName, ...fields } = api.uploads[1]!.fields;
    assert.equal(workoutOf(external_id), gzclp.id);
    assert.equal(fileName, `${external_id}.json`);
    assert.deepEqual(fields, {
      data_type: "json",
      sport_type: "WeightTraining",
      description: "Synced from Liftosaur",
      name: "GZCLP - A1",
    });
    assert.deepEqual(
      api.uploads[1]!.file.sets.map((set) => set.exercise_type),
      [...Array(5).fill("BARBELL_BACK_SQUAT"), ...Array(3).fill("DUMBBELL_BENCH_PRESS")]
    );
    const { records } = state(config);
    assert.equal(records[gzclp.id]?.activityId, 6002);
    assert.equal(records[deadlift.id]?.activityId, 777);
    assert.equal(records[landmine.id]?.status, "blocked");
    assert.ok(output.some((line) => line.includes('no Strava exercise type for "Landmine 180"')));

    // Nothing is uploaded twice; the Landmine workout goes out once its exercise is mapped.
    assert.deepEqual(await run(config), { uploaded: 0, alreadySynced: 2, problems: 1 });
    writeFileSync(config.exerciseMapPath, JSON.stringify({ "Landmine 180": "CHOP_GENERIC" }));
    assert.deepEqual(await run(config), { uploaded: 1, alreadySynced: 2, problems: 0 });
    assert.equal(api.uploads.length, 3);
    assert.deepEqual(api.uploads[2]!.file.sets.map((set) => set.exercise_type), Array(3).fill("CHOP_GENERIC"));
    assert.equal(api.uploads[2]!.fields.name, undefined);
  });

  it("keeps a blocked workout in the look-back window until it's synced", async () => {
    const unmapped = record(30, "  Landmine 180 / 3x10 20kg");
    api.history = [gzclp, unmapped];
    const config = setup();
    assert.deepEqual(await run(config, { since: new Date(now - 60 * DAY) }), { uploaded: 1, alreadySynced: 0, problems: 1 });

    // A narrow --since neither loses it nor moves the window forward.
    assert.deepEqual(await run(config, { since: new Date(now - DAY) }), { uploaded: 0, alreadySynced: 0, problems: 0 });
    assert.ok(defaultSince(config).getTime() <= unmapped.id);

    writeFileSync(config.exerciseMapPath, JSON.stringify({ "Landmine 180": "CHOP_GENERIC" }));
    assert.deepEqual(await run(config), { uploaded: 1, alreadySynced: 1, problems: 0 });
    assert.equal(state(config).records[unmapped.id]?.status, "synced");
    assert.ok(defaultSince(config).getTime() > now - 8 * DAY, "the window closes again once everything is synced");
  });

  it("syncs a single workout with --id", async () => {
    api.history = [gzclp, deadlift, old];
    const config = setup();
    assert.deepEqual(await run(config, { recordId: old.id }), { uploaded: 1, alreadySynced: 0, problems: 0 });
    assert.equal(workoutOf(api.uploads[0]!.fields.external_id), old.id);
    assert.deepEqual(api.historyRequests, [`?limit=1&cursor=${old.id + 1}`]);
    await assert.rejects(run(config, { recordId: old.id + 5 }), /no Liftosaur workout with id/);

    // After deleting the activity on Strava, --force uploads it again under a new external_id.
    assert.deepEqual(await run(config, { recordId: old.id, force: true }), { uploaded: 1, alreadySynced: 0, problems: 0 });
    assert.equal(workoutOf(api.uploads[1]!.fields.external_id), old.id);
    assert.notEqual(api.uploads[1]!.fields.external_id, api.uploads[0]!.fields.external_id);
  });

  it("checks a pending upload before uploading a changed workout again", async () => {
    api.history = [deadlift];
    api.stuck.add(deadlift.id);
    const config = setup();
    assert.deepEqual(await run(config), { uploaded: 0, alreadySynced: 0, problems: 0 });
    assert.equal(state(config).records[deadlift.id]?.status, "pending");

    // The workout changes (a mapping is pinned) while Strava is still processing the first upload.
    writeFileSync(config.exerciseMapPath, JSON.stringify({ Deadlift: "CONVENTIONAL_DEADLIFTS" }));
    api.stuck.clear();
    assert.deepEqual(await run(config), { uploaded: 1, alreadySynced: 0, problems: 0 });
    assert.equal(api.uploads.length, 1);
    assert.ok(output.some((line) => line.includes("Changes made since aren't on Strava")));
  });

  it("uploads again when Strava no longer knows a pending upload", async () => {
    api.history = [gzclp, deadlift];
    const config = setup();
    const start = new Date(deadlift.id).toISOString();
    writeJson(join(config.dataDir, "state.json"), {
      records: { [deadlift.id]: { status: "pending", uploadId: "999", hash: "x", start, at: start } },
    });
    assert.deepEqual(await run(config), { uploaded: 2, alreadySynced: 0, problems: 0 });
    assert.deepEqual(
      api.uploads.map((upload) => workoutOf(upload.fields.external_id)),
      [deadlift.id, gzclp.id]
    );
  });

  it("skips while another sync holds the lock", async () => {
    api.history = [deadlift];
    const config = setup();
    writeFileSync(join(config.dataDir, "sync.lock"), String(process.pid));
    assert.deepEqual(await run(config), { uploaded: 0, alreadySynced: 0, problems: 0 });
    assert.equal(api.historyRequests.length, 0);

    // A lock left behind by a crashed run is taken over.
    writeFileSync(join(config.dataDir, "sync.lock"), "999999999");
    assert.deepEqual(await run(config), { uploaded: 1, alreadySynced: 0, problems: 0 });
  });
});
