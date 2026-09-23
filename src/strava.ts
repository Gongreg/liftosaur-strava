import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { FatalError, readJson, requireSetting, writeJson, type Config } from "./config.ts";

// https://developers.strava.com/docs/authentication/ and https://developers.strava.com/docs/uploads/

interface Tokens {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  athlete?: { id: number; firstname?: string; lastname?: string };
}

export interface Upload {
  id_str: string;
  error: string | null;
  status: string;
  activity_id: number | null;
}

export interface UploadRequest {
  /** Contents of a Strava JSON strength-training file. */
  file: string;
  externalId: string;
  name?: string;
  description: string;
}

const REDIRECT_PORT = 8723;

function tokensPath(config: Config): string {
  return join(config.dataDir, "strava-tokens.json");
}

/** Runs the OAuth flow in the browser and stores the tokens. */
export async function connectStrava(config: Config): Promise<Tokens> {
  const clientId = requireSetting(config.stravaClientId, "STRAVA_CLIENT_ID");
  requireSetting(config.stravaClientSecret, "STRAVA_CLIENT_SECRET");
  const state = randomBytes(16).toString("hex");
  const redirectUri = `http://127.0.0.1:${REDIRECT_PORT}/callback`;
  const authorizeUrl = `${config.stravaOAuthBase}/authorize?${new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    approval_prompt: "auto",
    scope: "activity:write",
    state,
  })}`;

  const code = await new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => {
      server.close();
      reject(new Error("Timed out after 5 minutes waiting for Strava authorization."));
    }, 5 * 60_000);
    const server = createServer((request, response) => {
      const url = new URL(request.url ?? "/", redirectUri);
      if (url.pathname !== "/callback") {
        response.writeHead(404).end();
        return;
      }
      const params = url.searchParams;
      let error: string | undefined;
      if (params.get("state") !== state) {
        error = "State mismatch, please start `npm run auth` again.";
      } else if (params.get("error")) {
        error = `Strava authorization failed: ${params.get("error")}`;
      } else if (!(params.get("scope") ?? "").split(/[\s,]+/).includes("activity:write")) {
        error = 'Strava didn\'t grant upload permission. Run `npm run auth` again and keep "Upload your activities" checked.';
      }
      response
        .writeHead(error ? 400 : 200, { "Content-Type": "text/plain; charset=utf-8", Connection: "close" })
        .end(error ?? "Connected to Strava. You can close this tab.");
      clearTimeout(timeout);
      server.close();
      if (error) {
        reject(new Error(error));
      } else {
        resolve(params.get("code") ?? "");
      }
    });
    server.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    server.listen(REDIRECT_PORT, "127.0.0.1", () => {
      console.log(`Opening Strava in your browser. If nothing happens, open:\n\n  ${authorizeUrl}\n`);
      openBrowser(authorizeUrl);
    });
  });

  const tokens = await requestToken(config, { grant_type: "authorization_code", code });
  writeJson(tokensPath(config), tokens, 0o600);
  return tokens;
}

function openBrowser(url: string): void {
  const command = process.platform === "darwin" ? "open" : process.platform === "linux" ? "xdg-open" : undefined;
  if (command) {
    spawn(command, [url], { stdio: "ignore", detached: true })
      .on("error", () => {})
      .unref();
  }
}

/** A valid access token, refreshed (and persisted, since Strava rotates refresh tokens) when about to expire. */
export async function getAccessToken(config: Config): Promise<string> {
  const tokens = readJson<Tokens>(tokensPath(config));
  if (!tokens) {
    throw new FatalError("Strava isn't connected yet. Run `npm run auth` first.");
  }
  if (tokens.expires_at * 1000 > Date.now() + 5 * 60_000) {
    return tokens.access_token;
  }
  let refreshed: Tokens;
  try {
    refreshed = await requestToken(config, { grant_type: "refresh_token", refresh_token: tokens.refresh_token });
  } catch (error) {
    throw new FatalError(`${(error as Error).message}\nIf you revoked access, run \`npm run auth\` again.`);
  }
  writeJson(tokensPath(config), { ...tokens, ...refreshed }, 0o600);
  return refreshed.access_token;
}

async function requestToken(config: Config, params: Record<string, string>): Promise<Tokens> {
  const response = await fetch(`${config.stravaOAuthBase}/token`, {
    method: "POST",
    body: new URLSearchParams({
      client_id: requireSetting(config.stravaClientId, "STRAVA_CLIENT_ID"),
      client_secret: requireSetting(config.stravaClientSecret, "STRAVA_CLIENT_SECRET"),
      ...params,
    }),
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Strava token request failed with ${response.status}: ${body}`);
  }
  return JSON.parse(body) as Tokens;
}

export async function createUpload(config: Config, upload: UploadRequest): Promise<Upload> {
  const form = new FormData();
  form.set("file", new Blob([upload.file], { type: "application/json" }), `${upload.externalId}.json`);
  form.set("data_type", "json");
  form.set("sport_type", "WeightTraining");
  form.set("external_id", upload.externalId);
  form.set("description", upload.description);
  if (upload.name) {
    form.set("name", upload.name);
  }
  return readUpload(await stravaRequest(config, "/uploads", { method: "POST", body: form }));
}

/** Undefined when Strava doesn't know the upload (anymore), e.g. after connecting a different account. */
export async function getUpload(config: Config, uploadId: string): Promise<Upload | undefined> {
  const response = await stravaRequest(config, `/uploads/${uploadId}`);
  if (response.status === 403 || response.status === 404) {
    await response.body?.cancel();
    return undefined;
  }
  return readUpload(response);
}

async function readUpload(response: Response): Promise<Upload> {
  const body = await response.text();
  if (response.ok) {
    const upload = JSON.parse(body) as Upload;
    if (!upload.error && upload.activity_id == null && /deleted/i.test(upload.status)) {
      upload.error = upload.status;
    }
    return upload;
  }
  if (response.status === 401 || response.status === 403) {
    throw new FatalError(`Strava refused the request (${response.status}: ${body}). Run \`npm run auth\` again.`);
  }
  if (response.status < 500) {
    // Strava rejected this particular file; report it like a processing error.
    return { id_str: "", error: describeError(body), status: `HTTP ${response.status}`, activity_id: null };
  }
  throw new Error(`Strava ${new URL(response.url).pathname} failed with ${response.status}: ${body}`);
}

function describeError(body: string): string {
  try {
    const json = JSON.parse(body) as {
      error?: string;
      message?: string;
      errors?: { resource?: string; field?: string; code?: string }[];
    };
    const details = (json.errors ?? []).map((e) => [e.resource, e.field, e.code].filter(Boolean).join(" ")).join(", ");
    return json.error ?? ([json.message, details].filter(Boolean).join(": ") || body);
  } catch {
    return body;
  }
}

async function stravaRequest(config: Config, path: string, init: RequestInit = {}): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    // Fetched for every attempt, because a rate-limit wait can outlast the access token.
    const accessToken = await getAccessToken(config);
    const response = await fetch(`${config.stravaApiBase}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (response.status !== 429) {
      return response;
    }
    await response.body?.cancel();
    const delay = rateLimitDelayMs(response.headers, new Date());
    if (delay === undefined || attempt > 4) {
      throw new FatalError("Strava's API request limit is used up. The next run will continue.");
    }
    console.log(`  Strava rate limit reached, waiting ${Math.ceil(delay / 60_000)} min…`);
    await sleep(delay);
  }
}

/**
 * How long to wait after a 429. Strava's 15-minute limits reset at each quarter hour; once a daily limit
 * is used up there's no point waiting (returns undefined).
 */
export function rateLimitDelayMs(headers: Headers, now: Date): number | undefined {
  for (const prefix of ["x-ratelimit", "x-readratelimit"]) {
    const dailyLimit = Number(headers.get(`${prefix}-limit`)?.split(",")[1]);
    const dailyUsage = Number(headers.get(`${prefix}-usage`)?.split(",")[1]);
    if (dailyUsage >= dailyLimit) {
      return undefined;
    }
  }
  const quarterHour = 15 * 60_000;
  return quarterHour - (now.getTime() % quarterHour) + 5_000;
}
