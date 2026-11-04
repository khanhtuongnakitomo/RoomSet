# Testing Roomset

Two ways to try it. The hosted preview takes a minute and needs no setup. The local run adds the planner for your own room.

| | Hosted preview | Local run |
|---|---|---|
| Landing page, 3D sample apartment | Yes | Yes |
| AR at true size on a phone | Yes | Through a tunnel: `make phone` |
| Fit demo in a prepared room | Yes | Yes |
| Planning your own sofa and room | No, it needs the server | Yes |
| AI features | No | With your own keys |

## Hosted preview

The link is in the Website field of this repository's About panel. Use a phone if you can.

| Try this | You should see |
|---|---|
| Open the link, press **Try Roomset**, choose **Try the fit demo**, then **Open the 60-second demo** | "10 cm too wide": a 250 cm sofa against a 240 cm wall |
| Tap **210 cm** | "30 cm to spare", in the same room |
| Open the top view and drag the sofa onto the amber area | A warning that it overlaps the door clearance |
| Go back and choose **Enter the apartment** | A 3D apartment with three furnished rooms |
| Tap a room, then tap a piece of furniture | Its size, floor share and clear space in front |
| Open **In your room** on an iPhone or iPad and tap a piece | It stands on your real floor through the camera, at true size |

The fit demo and the apartment are samples and are labelled as such. Sizes in the apartment are close estimates.

## Local run

You need Python 3.11, Node 22 or newer, [uv](https://docs.astral.sh/uv/) and make. On Windows, see [DEMO_GUIDE.md](DEMO_GUIDE.md).

```bash
git clone https://github.com/khanhtuongnakitomo/RoomSet.git
cd RoomSet
cp .env.example .env
make setup
make dev        # http://localhost:5173
```

No keys are needed. `make test` runs the automated tests, and `make stop` stops everything.

To open it on a phone, install [ngrok](https://ngrok.com/download), add your authtoken, and run `make phone`. It prints the link.

| Try this at `/start`, **Start a plan** | You should see |
|---|---|
| Enter a sofa name and size, then confirm | The photo step |
| Upload 3 to 6 photos of one corner | Each photo checked for blur, darkness and duplicates |
| Enter the two wall lengths and whether you used a tape | A built room; estimates are labelled as estimates |
| Add a fixed object, such as a radiator | It appears in the room, and dragging the sofa onto it gives a warning |
| Drag, rotate, save, then reload the page | The saved layout comes back |
| **Try another size or appearance** | A new sofa in the same room, at the same position |
| **Delete this plan and start over** | The plan and its files are gone |

### AI features

These are optional and use your own accounts, so they cost money. Add keys to `.env`, then restart.

| Key | Turns on |
|---|---|
| `BASETEN_API` | Reading listings and screenshots, the AI architect in the apartment |
| `MUSE_API` | Style previews |
| `ASSEMBLYAI_API`, with `BASETEN_API` | **Ask Roomset**, the voice assistant on `/ar` |

Paid calls stop at `SPEND_LIMIT_USD`, $10 by default, tracked in `backend/data/spend.json`. Check it with `cd backend && .venv/bin/python -m app.core.budget`. Modal GPU jobs are not counted in this limit, and photo reconstruction is off by default.

## What not to expect

- Your photos are checked but do not shape the room. Your measurements do, and the room says so. Photo reconstruction is an experiment that has not run on a real GPU.
- The sofa is a simple model at the size you confirm. Its shape and materials differ from the real product.
- AI answers describe and suggest. They do not measure your room.
- Only iPhone AR has been tried on a real device. Android AR has not.

The full record is in [STATUS.md](STATUS.md).

## Reporting a problem

Open an issue with your device and browser, the page address, what you did, what you expected, and a screenshot. Never include an API key.
