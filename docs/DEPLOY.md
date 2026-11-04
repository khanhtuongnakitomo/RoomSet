# Deploying

## Quick preview on Vercel (free)

Good for letting people try the landing page, the fit demo, the 3D sample apartment and AR. These are static files, including a prebuilt sample room for the fit demo (`tools/static_demo/build.py`).

1. Vercel → Add New → Project → import this repository, and pick the branch to deploy.
2. Leave the build settings alone, and leave Root Directory empty. `vercel.json` already sets the build, and a Root Directory of `frontend` also works. Deploy.
3. If you deploy a branch other than the repository's default, make it the project's production branch, then redeploy. Share the production domain: on new projects, Standard Protection asks for a Vercel login on preview and generated URLs.
4. Open the link in a private window to confirm it opens without a login.

What does not run there: planning your own room (`/app`), the AI architect and the voice assistant. Without a server, the start page sends people to the fit demo instead, and the assistant button stays hidden. They need the FastAPI server, whose build jobs run in background threads and write files, which does not fit serverless functions as written. `/app` says so and points to the fit demo; the architect's review falls back to its built-in rules.

To add them later, deploy the server as below, then add this as the first entry in `rewrites` in `vercel.json`:

```json
{ "source": "/api/:path*", "destination": "https://YOUR-APP.onrender.com/api/:path*" }
```

The Hobby plan is free and limited to non-commercial, personal use.

## Testing on a phone through ngrok

Run `make phone` (or `./scripts/phone.sh`). It builds the app, starts the server on port 8000, opens an ngrok tunnel and prints the link to open on the phone. Run it again after changing code: it stops the previous run first. `make stop` (or `./scripts/stop.sh`) stops everything the project started, including `make dev`, and leaves other programs alone. Logs go to `.run/`.

You need ngrok with an authtoken (`brew install ngrok`, then `ngrok config add-authtoken <token>`). The tunnel points at the production build, not the Vite dev server, because the dev server sends hundreds of unbundled files and pages hung through the tunnel. The page caches files, so pull to refresh on the phone after a new run.

## The full app

| Piece | Service | Free-tier limit to expect |
|---|---|---|
| App container | Render free web service | 512 MB RAM. Sleeps after 15 idle minutes; waking takes about a minute. Disk is wiped on restart |
| Database and files | Supabase free project | About 500 MB database. Pauses after a week idle |
| Heavy jobs (optional) | Modal credits | Bills while a machine runs |

These limits come mostly from third-party summaries read on 2 Nov 2026. Check [render.com/docs/free](https://render.com/docs/free) and [supabase.com/pricing](https://supabase.com/pricing) when you sign up.

The container was measured at about 115 MB of RAM during a full session, with a 512 MB limit and 0.5 CPU.

## 1. Supabase

1. Create a project in the region nearest your users.
2. **Database:** Connect → copy the **Session pooler** URI. This is `DATABASE_URL`. Use the session pooler rather than the direct or transaction URL: the direct one may be IPv6-only and the transaction one can conflict with prepared statements.
3. **Storage:** create a bucket named `roomset`, and leave **Public** off.
4. **Storage → S3:** enable the S3 connection and generate an access key. Copy the endpoint, region, key id and secret.

## 2. Render

1. Push the branch you want to deploy. `render.yaml` points at `test`; change `branch` if you deploy another.
2. Render → New → Blueprint → choose this repo.
3. Fill in the values it asks for:

| Variable | Value |
|---|---|
| `DATABASE_URL` | Supabase session pooler URI |
| `S3_ENDPOINT_URL` | Supabase S3 endpoint |
| `S3_REGION` | Supabase region |
| `S3_BUCKET` | `roomset` |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Supabase S3 key |
| `BASETEN_API` | Optional. Enables AI reading |
| `MUSE_API` | Optional. Enables style previews, $0.01 each on Meta credits |
| `SPEND_LIMIT_USD` | Hard cap on all paid model calls, $10 by default. The ledger lives in `backend/data/spend.json`; on Render it resets when the disk does, so keep the cap low there |
| `ASSEMBLYAI_API` | Optional. With `BASETEN_API`, turns on the voice assistant on `/ar`. Each question is one transcription and one Muse Spark call, capped at 6 a minute per person and 60 an hour in total |

4. Deploy. Migrations run on start. Then check:

```bash
curl https://YOUR-APP.onrender.com/readyz          # {"database":"ok","storage":"ok"}
curl https://YOUR-APP.onrender.com/api/capabilities
```

5. Open the URL on a real phone and finish one session, including a reload. Camera capture needs HTTPS, which Render provides.

## 3. Blender on Modal (optional)

The free CPU builder already produces the demo's GLBs. Use this when you want Blender output, then VGGT.

```bash
pip install modal && modal setup
modal deploy worker/modal_app.py
```

On Render, set `SCENE_BUILDER=modal`, `MODAL_TOKEN_ID` and `MODAL_TOKEN_SECRET`. The image must also include the SDK: change the Dockerfile install to add `modal`.

## Before the demo

- Open the app a few minutes ahead, because a sleeping service takes about a minute to wake.
- A restart while building marks the job failed and offers a retry. Inputs are kept.
- A paused Supabase project makes `/readyz` fail. Restore it from the dashboard.
- For an always-awake app during judging, Render's paid instance is the simple route, at about $7 a month.

## Privacy

Uploaded photos are re-encoded to strip location data, kept in a private bucket, and read only with the session's token. Sessions and files are deleted after `RETENTION_DAYS` (7 by default), or at once with "Delete this plan and start over". Logs hold route templates, never ids, keys or photos. While free Meta credits are in use, Meta may use the content sent to it for product improvement, so tell testers before enabling `MUSE_API`.
