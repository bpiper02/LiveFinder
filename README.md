# LiveFinder

A $0, local-first artist submission router for Nero review queues.

## Current MVP
- Save reusable song profiles in browser localStorage.
- Add Nero reviewers by URL only; no manual reviewer name entry.
- Select a saved song and launch a Nero submission.
- Chrome/Edge extension automatically follows the free Nero path: link submission, details, terms, queue screen, and "I'll wait".
- Paid skips are never selected automatically.
- Queue position and completion status are reflected back into the dashboard.
- Delete saved songs, reviewers, individual history rows, or clear submission history.
- No server, database, AI API, or paid infrastructure.

## Run locally

```bat
cd C:\Users\brent\Desktop\LiveFinder
npm install
npm run qa
npm run dev
```

Open the local Vite URL, normally `http://localhost:5173`.

## Install the extension
1. Open `chrome://extensions` or `edge://extensions`.
2. Enable Developer mode.
3. Click **Load unpacked**.
4. Select the repo's `extension` folder.
5. After updating extension code, reload the extension and then refresh the LiveFinder dashboard before testing.

## QA

```bat
npm run qa
npm run build
```

GitHub Actions runs the same syntax/build checks on pushes and pull requests to `main`.

## Safety rules
- LiveFinder only takes the free Nero submission path.
- It never selects Skip, Super Skip, Throne, or other paid priority options automatically.
- Unknown required reviewer fields are not guessed.

## Next phase
1. Discover Nero reviewer/session URLs automatically.
2. Normalize and deduplicate the reviewer pool.
3. Classify sessions as live now, not live but accepting submissions, closed, or unknown.
4. Sort live reviewers first while preserving early-entry opportunities for upcoming streams.
5. Let users submit a saved song directly from the discovered pool.
6. Add an extension-only mode that recognizes a Nero page the user opens manually and offers to autofill from saved LiveFinder songs.
