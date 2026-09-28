# liftosaur-strava

Uploads finished [Liftosaur](https://www.liftosaur.com) workouts to Strava as Weight Training activities, with every
set's exercise, reps and weight. Strava then shows the exercise list, volume, total sets/reps and the muscle map.

It reads your history through the [Liftosaur REST API](https://www.liftosaur.com/doc/api) and uploads it with
[Strava's JSON strength-training upload format](https://developers.strava.com/docs/uploads/) (added May 2026). Both APIs
need a premium subscription. It runs on plain Node.js (22.18+, runs the TypeScript directly) and has no runtime
dependencies. Machines without Node, such as an Unraid server, can run it in Docker (see
[Running it on Unraid](#running-it-on-unraid)).

## Setup

1. **Liftosaur API key**: in the Liftosaur app, go to Settings → API Keys → Create API Key (starts with `lftsk_`).
2. **Strava API app**: create one at <https://www.strava.com/settings/api>. The name and website can be anything; set
   *Authorization Callback Domain* to `localhost` and upload `assets/icon.png` (124×124) as the icon.
3. `cp .env.example .env` and fill in `LIFTOSAUR_API_KEY`, `STRAVA_CLIENT_ID` and `STRAVA_CLIENT_SECRET`.
4. `npm run auth` opens Strava in the browser. Approve it and keep "Upload your activities" checked. Tokens are
   stored in `data/strava-tokens.json` and refreshed automatically.
5. `npm run exercises` shows how every exercise in the last 90 days of history maps to a Strava exercise (see below).
6. `npm run sync -- --dry-run` shows what would be uploaded and writes each Strava file to `data/dry-run/`.
7. `npm run sync` uploads. To try a single workout first: `npm run sync -- --id <id>`, where the id is the file name
   from the dry run.

By default `sync` looks back 7 days (`LOOKBACK_DAYS`). It looks further back when the last run was longer ago, or when
an older workout couldn't be synced yet (e.g. an unmapped exercise). For a backfill, use
`npm run sync -- --since 2026-01-01`.

> If Strava already gets these workouts from elsewhere (e.g. a watch recording the session), you'll get two activities.
> Strava rejects uploads it sees as duplicates; those are recorded as "already on Strava" and not retried.

## Exercise mapping

Strava only accepts exercises from [its own list](https://developers.strava.com/docs/uploads/) (about 650), so each
Liftosaur exercise has to be mapped to one. `npm run exercises` shows where each mapping comes from:

| source | meaning |
| --- | --- |
| `built-in` | Liftosaur's ~210 built-in exercises, per equipment (`src/exercises.ts`) |
| `name match` | a custom exercise named like a Strava exercise, e.g. "Pendulum Squat" → `PENDULUM_SQUAT` |
| `guess` | a keyword guess for other custom exercises ("… Row" → `ROW_GENERIC`), or a built-in exercise with custom equipment |
| `exercise-map.json` | your own mapping, which always wins |
| `UNMAPPED` | no idea: workouts with this exercise wait until you map it, then go out on the next sync |

To fix or pin a mapping, add the name exactly as `npm run exercises` prints it to `exercise-map.json`:

```json
{
  "Pendlay Row": "BENT_OVER_BARBELL_ROW",
  "Landmine 180": "CHOP_GENERIC",
  "Cycling": "SKIP"
}
```

`SKIP` leaves an exercise out of the Strava activity. `npm run types -- row machine` lists the Strava types containing
both words.

## Running it on a schedule (macOS)

`launchd/local.liftosaur-strava.plist` runs `sync` every hour and at login, logging to `data/sync.log`. It's a
template: `npm run schedule` fills in the absolute paths to `node` and this folder (launchd can't expand `~` or
`$HOME`), copies it to `~/Library/LaunchAgents/` and loads it. Re-run it if either path moves.

```sh
npm run schedule                                           # install (or reinstall) and load
launchctl kickstart gui/$(id -u)/local.liftosaur-strava    # run now
launchctl bootout gui/$(id -u)/local.liftosaur-strava      # stop and unload
```

When a scheduled run can't sync a workout (e.g. an unmapped exercise), it shows a macOS notification. Run
`npm run sync` to see why.

## Running it on Unraid

Unraid doesn't have Node.js, so `unraid/run.sh` runs the commands in the official Node.js Docker image
(`node:24-alpine`), with this folder mounted into it: `.env`, `exercise-map.json` and `data/` are the same files. It
takes what `npm run` takes, so `npm run sync -- --dry-run` becomes `unraid/run.sh sync -- --dry-run`. There's no image
to build, and it works on any machine with Docker.

1. Copy this folder to the server, e.g. to `/mnt/user/appdata/liftosaur-strava`:

   ```sh
   rsync -a --exclude node_modules --exclude data ./ root@tower:/mnt/user/appdata/liftosaur-strava/
   ```

   To move an existing setup, leave out `--exclude data` so the Strava connection and the sync state come along, and
   stop syncing on the old machine. Otherwise both upload the same workouts. To update the code later, copy just
   `src` and `unraid`.
2. Fill in `.env` (see [Setup](#setup)) and add your time zone, e.g. `TZ=Europe/Vilnius`. Containers run on UTC, which
   would put your workouts at the wrong time on Strava, so `sync` stops until `TZ` is set.
3. Connect Strava, unless you copied `data/`. Strava sends the browser back to `127.0.0.1:8723`, so run `auth` through
   an SSH tunnel from the computer with the browser, and open the link it prints there:

   ```sh
   ssh -t -L 8723:127.0.0.1:8723 root@tower /mnt/user/appdata/liftosaur-strava/unraid/run.sh auth
   ```
4. On the server, in that folder: `unraid/run.sh exercises`, `unraid/run.sh sync -- --dry-run`, then
   `unraid/run.sh sync`.
5. Schedule it with the User Scripts plugin (from Community Applications): add a script with this content and set it
   to *Scheduled Hourly*.

   ```sh
   #!/bin/bash
   /mnt/user/appdata/liftosaur-strava/unraid/sync.sh
   ```

   `unraid/sync.sh` appends every run to `data/sync.log`. When a workout can't be synced, it sends an Unraid
   notification with the reason.

## Behaviour

- Weights are sent in kg; Strava shows them in your preferred units. Bodyweight and assisted (negative weight) sets
  are sent without weight. Unilateral sets (`10|9`) count both sides, like Liftosaur's volume. Sets with 0 reps are
  dropped.
- Warmup sets are left out unless `INCLUDE_WARMUPS=true`. The description is "Synced from Liftosaur", plus the
  workout notes if `INCLUDE_NOTES=true`. They're off by default because notes can be personal.
- The activity is named "Program - Day". Ad-hoc workouts are left for Strava to name ("Evening Weight Training").
  Activities get your default Strava privacy setting.
- Elapsed time is Liftosaur's workout duration. Liftosaur's API doesn't expose per-set timestamps, so sets carry no
  start times.
- Synced workouts are tracked in `data/state.json`. Editing a workout after it was uploaded doesn't update Strava,
  because Strava's API can't replace an activity. Delete the activity on Strava, then run
  `npm run sync -- --id <id> --force`. The id is the workout's key in `data/state.json`.
- If Strava rejects a workout, it's reported once and then skipped. After fixing the cause, run
  `npm run sync -- --id <id> --retry-failed`.
- When Strava's 15-minute rate limit is hit, the sync waits for the next window. Once the daily limit is used up, it
  stops and the next run continues.
- A sync that starts while another one is running (say, a manual run during the scheduled one) skips. A run that
  was killed outright (say, by a power cut) holds up the next ones for at most 5 minutes.
- Strava is moving its API to `https://api-v3.strava.com` (available from 2027-01-04). Set `STRAVA_API_BASE` in
  `.env` to switch before the old URL goes away.

## Development

```sh
npm test            # node:test, including an end-to-end run against a fake Liftosaur/Strava server
npm install && npm run typecheck
```
