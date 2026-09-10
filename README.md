# Nero Router MVP

A $0, local-first artist submission router for Nero review queues.

## Current slice
- Save reusable song profiles in browser localStorage.
- Save Nero reviewer URLs.
- Select a song for a reviewer.
- Open the Nero creator page carrying the song payload.
- Chrome/Edge extension detects likely Nero fields and fills artist name, track title, email, song URL, and optional note.
- No server, database, AI API, or paid infrastructure.

## Run it
No build step.

Windows:
```bat
cd nero-router
python -m http.server 5173
```
Then open `http://localhost:5173`.

## Install extension
1. Chrome: `chrome://extensions` or Edge: `edge://extensions`
2. Enable Developer mode.
3. Click Load unpacked.
4. Select this repo's `extension` folder.

## Test
1. Save a song profile.
2. Add a Nero creator URL, e.g. `https://www.nero.fan/username`.
3. Pick the song from that creator's dropdown.
4. The Nero page opens and the extension tries to populate visible submission fields.
5. Review the values and choose the free/Standard option manually.

## Why final submit is manual in v0
Nero creators can make Standard paid, restrict free submissions, or require creator-specific questions. We should only automate the final submit once the adapter can prove the submission is free and all required fields are satisfied.

## Next slice
1. Automatic Nero creator/session discovery.
2. Live/open/free filters.
3. Deterministic free-only final submission.
4. Capture confirmation and queue position.
5. Queue polling + desktop notification when <=5 songs away.
