# HYPERTROPHY.LOG — Training Tracker

A Progressive Web App for logging hypertrophy training on a phone. Built with React, Vite, Dexie (IndexedDB), Recharts and Workbox. It runs **100% offline**: every workout, exercise and setting lives in your browser's IndexedDB on the device, never on a server.

🚀 **Live app**: [https://martil2105.github.io/fervent-babbage/](https://martil2105.github.io/fervent-babbage/)

---

## What it does

### Sessions
- Workouts are organised into **sessions** (routines) — Push and Legs out of the box. A session is an ordered list of exercises from a shared library; an exercise can belong to more than one.
- Starting a session prefills every set from your **all-time best** for that exercise (the heaviest weight you've completed, with the reps you did at it). If that best is more than **21 days** old — after illness or a holiday — it falls back to what you last actually lifted, so the target never strands you at a weight you can no longer move.
- Only **ticked** sets count. Unticked sets are saved as skipped and are ignored everywhere: volume, records, "last time" and next session's prefill. Finishing with sets still open asks first; finishing with nothing ticked offers to discard instead of saving an empty session.
- During a workout you can **reorder**, **add** or **remove** exercises. Those changes are for today only; the saved session order is changed in Settings. An **empty workout** starts with nothing and you add exercises as you go.
- Every exercise comes from **one list**, so a lift keeps its history however you type it: "incline chestpress", "Incline Chest-Press" and "incline chest presses" all find *Incline Chest Press*, and a near-miss typo offers "Did you mean". Duplicates that already exist can be **merged** (Settings, or from the exercise's page).
- Tap an exercise name for its **page**: best set, estimated 1RM and every session it was in.
- An exercise with every set ticked **folds to one line**, so the next one moves up.

### Logging a set
- Weight in half-kilo steps (for 2.5 kg dumbbells and microplates). The − / + buttons jump by each exercise's own **weight step**; typing accepts `27.5` or `27,5`.
- Tap the set number to mark a **warm-up** (shown as "W"; not counted).
- Effort as **RPE** (6–10) or **RIR** (0–5) — pick one in Settings.
- Ticking a set starts the **rest timer** for that exercise's rest duration. It survives reloads and the app being closed, vibrates when rest ends (Android), can send a notification if you've switched apps (opt-in), and counts down in the header while you're on another tab.

### Progress
- **Last time** on every exercise: what you did, the rep to beat per set, your best, and an accretion strip of recent sessions with the record in brass.
- **Progression helper**: suggests adding weight (by that exercise's step) only when every working set hit the top of the rep range at RPE ≤ 9 / RIR ≥ 1; otherwise hold, or chase reps.
- **Summary**: this week's working volume against the *same point* last week, the days you trained, weekly volume trend, hard sets per muscle group against the 10–20 sets/week guideline (Quads and Hamstrings counted separately), and what to aim for next time.
- **Progress**: lifetime totals, week streak, per-exercise strength progression (top set + estimated 1RM), volume load, a 12-week consistency heatmap, effort trend, and 4-week muscle balance.
- **History**: every session, editable after the fact (sets, date, duration) or deletable; personal bests per exercise.

### Keeping your data
- Everything is on the device only, so **back up**. Export saves a `.json` file — on iPhone through the share sheet (choose *Save to Files*). The Summary warns when your last backup is more than a week old.
- On desktop Chrome/Edge you can pick a folder once and a backup is written there automatically after workouts.
- Import shows what the backup contains, and how many workouts on the device it doesn't have, before replacing anything.
- The app asks the browser for **persistent storage** so the data isn't evicted when the disk runs low.

---

## Design

- **Light and dark**, following the phone's setting. Both are designed rather than inverted; dark mode uses a true-black background, which an OLED iPhone switches off.
- One accent, **brass**, used only for what you earned: ticked sets, records, progress. Everything else is neutral.
- Figures (kg, reps, times) are set in condensed, tabular **Archivo**, self-hosted so it works offline.
- Progress is drawn as **graduations**: the session's sets across the top of a workout, the rest timer as marks that go out one by one, a week of training days, sets per muscle against the 10–20 band.
- Colours, type and spacing live in `src/theme/tokens.css`; component styles in `src/index.css`.

---

## iPhone notes

- Install it to the Home Screen (below) — it then runs full-screen and offline.
- Inputs are 16px or larger so iOS doesn't zoom the page when you tap a field.
- Header and tab bar respect the Dynamic Island and home-indicator safe areas; the page itself doesn't rubber-band, only the content scrolls.
- If iOS closes the app in the background mid-workout, reopening it goes straight back to the open session.

---

## Getting started

### Prerequisites
- **Node.js** 22 (Vite 8 needs 20.19+ or 22.12+)

### Local development
```bash
git clone https://github.com/martil2105/fervent-babbage.git
cd fervent-babbage
npm install
npm run dev -- --host
```
Open the network URL it prints (e.g. `http://192.168.1.55:5173/fervent-babbage/`) in Safari on your phone.

### Checks
```bash
npm run lint   # ESLint, including the React Compiler purity rules
npm test       # Vitest unit tests for the pure logic in src/utils and src/db
npm run build  # production build + service worker into dist/
```

### Deploying
Pushing to `master` runs `.github/workflows/deploy.yml`: lint, test, build, then publish `dist/` to the `gh-pages` branch that GitHub Pages serves.

---

## 📥 Install on iOS

1. Open Safari on your iPhone and go to **[https://martil2105.github.io/fervent-babbage/](https://martil2105.github.io/fervent-babbage/)**.
2. Tap **Share**, then **Add to Home Screen**.
3. Keep the name (**HypLog**) or change it, and tap **Add**.
4. Launch it from the Home Screen — full-screen, offline, with your data kept on the phone.
