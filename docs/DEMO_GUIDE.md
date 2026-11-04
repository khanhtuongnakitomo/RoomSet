# Roomset: run it and demonstrate it

This guide covers the local demo on Windows. On macOS or Linux, use `make phone` and `make stop` instead of the Windows scripts. The dependable presentation is the measured-room flow. Photo-derived room drafts are a separate experimental feature and must pass a real Modal run before being presented as working.

## Start, open on a phone, and stop

From the repository folder, double-click `scripts\phone.cmd`. It builds the frontend, applies database migrations, starts the backend on localhost, then starts ngrok with traffic inspection disabled. Both processes run in the background.

Or run in PowerShell:

```powershell
& ".\scripts\phone.cmd"
```

The terminal prints the current HTTPS demo address. The same address is saved in `.run\url.txt`; its QR code is `.run\phone-demo-qr.png`. Open the address on your phone, or scan the QR code with the phone camera. If ngrok shows a free-service warning page, select **Visit Site**. The phone may use Wi-Fi or mobile data. Keep the laptop awake and connected to the internet.

The local address is [http://127.0.0.1:8000/demo](http://127.0.0.1:8000/demo). For a demo without a public tunnel:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\phone.ps1 -LocalOnly
```

To stop the server and tunnel, double-click `scripts\stop.cmd`. The stop script only stops the recorded processes if their process ID, start time and executable still match. Restarting `phone.cmd` also replaces the previous tracked demo processes. Logs are in `.run`; credentials are not stored there.

## The 60-second demonstration

Open `/demo` and select **Open the 60-second demo**. This deliberately uses a prepared 240 × 280 cm corner and a 250 × 92 × 84 cm sofa. The screen labels it as a sample.

1. **Show the problem.** Point to “10 cm too wide.” Explain: “This particular sofa is wider than the usable wall length when placed in this orientation.” The model also warns when the footprint extends outside the modeled area.
2. **Try a genuine alternative.** Select **Try another size or appearance**. Change the name to “Demo sofa — 210 cm” and width to **210 cm**. Keep depth **92 cm** and height **84 cm**. In a real shopping session, these values must come from an actual product variant or a custom order.
3. **Show the model.** Change the base, cushions, arms, material or color. Drag the preview to inspect it. The model is an approximation of the shape; its outer dimensions match the confirmed values.
4. **Compare in the same room.** Select **Confirm variant and compare in my room**. The room and saved furniture position stay intact. The panel now shows **30 cm total length remaining** along wall A for the unrotated sofa. This is not a walking-route measurement.
5. **Show an obstruction.** Select the **Top** view button, then drag the sofa over the amber door-clearance area. The panel names the overlap. You can also tap the down-arrow six times to move it forward in 10 cm steps and demonstrate that conflict.
6. **Save a better arrangement.** Move it away from the amber area, rotate if useful, and select **Save layout**. Reload the page: the selected variant and saved placement return. Leave some space behind the sofa before rotating, because its corners can otherwise cross wall A.

Suggested narration:

> “A product listing gives us dimensions, but deciding where it belongs is still hard. Roomset brings the sofa into a room model at that size. This 250 cm option exceeds the usable wall length. The 210 cm variant leaves 30 cm of total length, but I still need to keep this door area clear. I can test the arrangement, see the conflict, and save a better position.”

## The full journey with your own room

Start from `/demo` and choose **Start with my own sofa and room**. This creates a separate plan; it does not delete the previous one.

**Product input.** Paste a listing link, upload a product screenshot, or enter the dimensions manually. A live integration check successfully read [this IKEA LINANÄS listing](https://www.ikea.com/ie/en/p/linanaes-3-seat-sofa-vissle-dark-grey-40512249/): width 197 cm, depth 80.5 cm, height 76 cm. Store pages can change or block automated access, so keep a screenshot and the measurements available when presenting.

The image is retained privately for that session. Muse on Baseten can suggest the template and appearance. A written description can also drive the **Let Muse suggest the appearance** button. Review the result, then confirm all three dimensions yourself. The application keeps the original extraction evidence separately from your confirmation or correction.

**Photo capture.** Take three to six photos of one corner. Include the floor and both wall-floor edges. Stand back for the first, move sideways for the next two, and keep recognizable details overlapping between views. Avoid motion blur, reflections dominating the view, and furniture covering every floor edge. On a phone, **Take photo** opens the camera picker. You can also upload images or extract frames from a short video.

**Room confirmation.** In measured-room mode, the photographs provide visual context and AI clarification; they do not determine the wall lengths. Measure wall A, which the back of the sofa faces, and wall B, which meets it. Enter the usable lengths in meters. The top-view diagram updates as you type. Select whether you actually measured or estimated those values.

Add fixed objects and rectangular keep-clear areas. Enter their width, depth, height, and center position. **x** is the center's distance from wall B; **z** is its distance from wall A. A door zone is a conservative rectangular area, not a simulated swinging door. Missing objects are not included in collision checks.

**Build and arrange.** Build the room, drag the sofa, switch between 3D and top view, use the 10 cm arrow controls, rotate, and save. **Correct room measurements and obstacles** returns to the editable room inputs. **Try another size or appearance** preserves the room; previously tried sofa sizes are listed for reuse.

## What to say about the technology

| Part | What it does in this demo |
|---|---|
| Muse on Baseten | Interprets product text/images into validated fields and appearance parameters; reviews room photos for clarification |
| CPU geometry builder | Creates approximate sofa templates at the confirmed width, depth and height, plus the room and obstacles |
| Browser editor | Moves and rotates the model and calculates footprint conflicts locally; gestures do not call a model |
| Local database and private storage | Save session inputs, product evidence, layouts, references, generated assets and job status |
| ngrok | Provides an HTTPS address for the local app so a phone can reach it |
| Modal + Meta/Oxford VGGT | Optional photo-depth experiment described below; kept off until a real GPU run is verified |

The sofa and measured-room builders need neither Blender nor a local GPU. This avoids GPU startup delays in the core demonstration. The separate Blender worker remains available in the repository for future export work.

The current phone demo runs on this laptop with SQLite and local artifact storage. Vercel, Render and a hosted database have not been deployed as part of this change.

## Experimental photo-derived corner

At the time of this implementation, Modal authentication worked but the GPU access check was rejected because the workspace required a payment method. The application therefore advertises `reconstruction: assisted` and keeps the experimental action hidden. Do not claim that a real room reconstruction has succeeded based on synthetic math tests or code being present.

The implemented experimental path is deliberately assisted:

1. Upload three to six views, choose one reference photograph, and mark the floor corner plus the far floor endpoint of each wall.
2. Provide the measured distance between the corner and the wall A endpoint.
3. VGGT on a Modal L4 estimates depth and camera geometry. The server reads the three predicted floor points, checks their angle, and scales the corner using the real reference length.
4. Review the proposed wall B length with a second, independent tape measurement. A near-right angle and a single scale value do not prove metric accuracy.
5. Confirm or correct the dimensions and add obstacles. Large corrections switch the provenance back to a room built from confirmed measurements.

Jobs have persisted IDs and statuses. A restart makes an interrupted job retryable, and stale job results are discarded. The local single-instance server admits one GPU job at a time, defaults to three attempts per session and three jobs per UTC day, and retains the usage count across restarts. This GPU limit is separate from the existing model API spending guard.

The worker runs as an ephemeral Modal app. Model weights are cached in a Modal volume; loading the weights onto a GPU can still take time on a new container. The initial image build and download may take several minutes. Prepare and validate it before a presentation. The original VGGT-1B checkpoint is for a non-commercial prototype; a commercial release needs an appropriately licensed checkpoint. See the [VGGT repository](https://github.com/facebookresearch/vggt) and [Modal GPU documentation](https://modal.com/docs/guide/gpu).

After GPU access is ready, the next verification is one real photo set through the worker, followed by independent measurement checks. Only then should `RECONSTRUCTION_ENABLED=true` be set for the running demo. The implementation is in `backend/app/providers/modal_reconstruction.py`, with the user flow under the room confirmation screen.

## What the demonstration does not establish

- No overlap means clear of the modeled geometry. It does not establish delivery access, comfort, walking-route suitability, or the absence of unmodeled objects.
- A dimensioned sofa is an approximate shape, not a photogrammetric reconstruction or an exact upholstery texture match.
- The existing `/ar` page uses catalog assets. It does not place this newly generated custom sofa in native phone AR.
- Phone viewport testing verifies the responsive web flow. Camera-picker behavior and native AR still need testing on the actual phone used for presenting.
- Plans return in the same browser at the same origin. Private browsing, clearing browser storage, or changing the tunnel address can lose the locally saved access token. The configured retention period is seven days.

## Rehearsal checklist and recovery

Charge the laptop and phone, keep the laptop awake, open the HTTPS address, and rehearse the short demo once. Keep a screenshot of the product listing and a tape measure available for the full flow. Prefer the short demo if the event Wi-Fi or a model provider is slow.

If the page is unreachable, open the localhost address first and check `.run` logs. If localhost works, restart `phone.cmd` and use the current `.run\url.txt`. If a shop blocks the link, upload its screenshot or enter the dimensions. If an AI call fails, the manual controls remain available. If a model build fails, the app retains its inputs and offers a retry.

Stop with `scripts\stop.cmd` after the demonstration so the laptop is no longer reachable through this tunnel.
