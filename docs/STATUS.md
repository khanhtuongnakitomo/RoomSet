# Status

Last updated 4 Nov 2026. Add a line here when a real provider call or job first succeeds. Do not claim an integration that is not listed as verified.

## Verified

| Behavior | How |
|---|---|
| Full manual flow on a phone viewport: sofa, photos, questions, build, touch drag, rotate, save, reload, delete | Chromium browser run against the production bundle |
| Planner screens at desktop and phone widths, with no keys set | Same browser run. Screenshots reviewed |
| Phone layouts on every page at 320, 375, 390 and 412 wide and held sideways: no sideways scroll, tap targets, 16 px inputs | Chromium device profiles, plus page loads in the WebKit engine |
| Touch in the studio: tap to select, drag only a selected piece, finger orbit, sheets that swipe | Simulated touch in Chromium |
| Install files, and the sample apartment and start page opening offline after one visit | Chromium with the network switched off |
| AR at true size on iPhone: one converted catalog model opened in AR Quick Look and placed on a real floor | Opened by the owner on an iPhone 15 Pro through an ngrok tunnel, 3 Nov 2026 |
| All 19 catalog models converted to USDZ within 3% of their catalog size; `/ar` and the studio link to them | `tools/usdz/build_usdz.py` size check, and a Chromium run with AR Quick Look support simulated |
| Three room sets (8, 7 and 8 pieces) built as single USDZ scenes from the sample layouts, with name and size shown in the AR Quick Look banner | Converter output and a Chromium run with AR Quick Look support simulated. Not yet opened on the iPhone |
| Same flow in the Docker image, with Postgres and S3 API, at 512 MB and 0.5 CPU | Local containers; S3 was the moto emulator |
| Sofa GLB outer size equals confirmed dimensions; node scale stays 1 | Automated tests on trimesh output |
| Blender builders match the same geometry contract | Run locally with `bpy` 4.2, not on Modal. They still output a box-style sofa; the CPU builder now outputs the parametric sofa |
| Fit demo with no server at `/demo/sample`: 250 and 210 cm sofas in a prebuilt sample room, with placement checks in the browser | Chromium at phone and desktop sizes, under the same routing rules as Vercel |
| Parametric sofa, product preview, size variants, keep-clear areas, room diagram, Windows scripts | Automated tests (91 backend, 44 frontend at merge). PR #7 records the phone demo over ngrok and one live IKEA listing read |
| Landing page at `/`, Try button to the `/start` page, which leads to the studio and the planner, curtain transition | Chromium browser run against the production bundle |
| Demo film on the landing page: silent autoplay in view, pause out of view, one sound button, loaded only when reached | Chrome at phone and desktop sizes against the production bundle. Not opened on a real iPhone |
| AI architect endpoint asks Muse Spark for `reasoning_effort="minimal"`, which fixed empty replies shown as "not switched on" | Real call while recording the film, plus an updated test |
| Studio at `/studio`, opening on the whole apartment: 3D rooms with real photos projected on them, room, model and top-down views, drag kept on the measured floor, add, remove, reset, numbers per piece, rule-based review | Chromium browser run and unit tests; drag tested with a mouse |
| Muse Spark on Baseten, live: the AI architect endpoint (7.6 s), and a photo plus a Vietnamese question with the assistant's prompt (10.8 s, answered in Vietnamese, suggestions all from the catalog, no sizes invented) | Real calls on 3 Nov 2026 from the dev machine |
| Muse Image, live: one style preview from a screenshot (13.7 s) | Real call on 3 Nov 2026. The test image included the app's interface, which the model redrew with misspelt text; the app sends only the 3D view |
| Voice assistant on `/ar`, live in Vietnamese and English: AssemblyAI heard both and detected the language; Muse Spark answered in the same language from a camera photo; the answer was read aloud with a matching voice | Real calls on 3 Nov 2026, including a phone browser through the ngrok tunnel with a recorded Vietnamese question: question on screen after 5.5 s, full answer after 12 to 13.6 s. Before tuning it took 23 to 34 s. Muse Spark varies from about 5 s to over 30 s on Baseten's side. Speech came from macOS text to speech, not a person, and no real iPhone yet |
| Spending cap: every paid call reserves a cautious estimate first and stops at $10 in total, with daily call limits; ledger kept in `backend/data/spend.json` | Automated tests; the three live calls above were recorded at $0.08 |
| One session cannot read another's data; uploads strip metadata; bad files fail safely | Automated tests |
| Private addresses, redirects and DNS tricks are blocked by the URL guard | Automated tests with a mock network |

## Written but not verified against the real service

| Piece | Note |
|---|---|
| Real listing fetch over the internet | One live IKEA read recorded in `docs/DEMO_GUIDE.md`. Otherwise tested with a mock network. Shops may block it |
| Photo corner draft with VGGT on Modal (`RECONSTRUCTION_ENABLED`, off by default) | Never run on a real GPU job. Tested with a mock. Modal compute is outside the spending cap, limited only to 3 jobs a day |
| `SCENE_BUILDER=modal` and `worker/modal_app.py` | Never run on Modal |
| Render and Supabase | Never deployed. Supabase's S3 endpoint is untested |
| Vercel | The project builds with the Vercel CLI from the files Vercel receives, and pages were tested against a stand-in for its routing rules. The hosted site itself has not been tested after this update |
| Short-video capture | Code exists; not exercised in the browser run |
| Scene Viewer AR on Android | Links are generated; never opened on an Android phone |
| Camera and real-phone behavior | Touch was simulated in Chromium. No real iPhone or Android, so GPU memory, frame rate, home screen install and pinch are unconfirmed |

## Not built

| Item | Owner per issues | Note |
|---|---|---|
| Fully automatic room reconstruction | Benedict, #4 | Rooms come from the user's measurements. The photo corner draft above is an unverified experiment. The app labels each room by how it was made |
| Geometric photo overlap evidence | Benedict, #4 | `overlap` reports `not_measured` |
| Meta SAM call | Benedict, #4 | The docs page read did not include the output format or point prompts |
| Reference-distance calibration | Benedict, #4 | Today: "did you measure with a tape?" sets calibrated or estimated |
| Original-photo camera view in the editor | Benedict, #4 | Needs camera poses from reconstruction |
| Second-corner accuracy measurement and real timing | Shared | Needs real rooms |
| Submission text and final video | Tường, #3 | |

## Known limits

- Photos are required and checked, but in the assisted path they do not change the geometry. Say so in the demo unless VGGT lands.
- One instance only. Build jobs and rate limits live in that process.
- The sofa is a parametric model at the confirmed size. It is not the listed product, and the app says shape and materials may differ.
- The studio is a sample. Its three rooms are one real room photographed in three finishes, placed side by side on a made-up plan. Size comes from fitting a box to the photo and a 2.05 m door, so it is close, not surveyed.
- Studio rooms are boxes with the photo projected on them. Things in the photo, such as curtains, are flat on the walls, and detail softens away from the capture point.
- User rooms in `/app` are still simple modelled geometry, and the planner builds sofas only. The studio and AR cover 19 catalog pieces across seating, tables, beds, storage and accents.
- `Agent.MD` is now gitignored locally and untracked on this branch, but it remains in git history and in the upstream public repo.
