# PUSH.HYPERTROPHY — Training Tracker

A modern, premium, dark-theme-first Progressive Web App (PWA) designed for tracking a **Push Hypertrophy Training Program** on mobile. Built with React, Vite, Recharts, and Workbox, the application operates **100% offline**, storing all logs and customizations securely in your phone's local storage.

🚀 **Live App**: [https://martil2105.github.io/fervent-babbage/](https://martil2105.github.io/fervent-babbage/)

---

## Key Features

### 1. Weekly Set Count & Muscle Groupings
- Counts **hard sets** per muscle group (Chest, Shoulders, Triceps, Lats, Back, Legs, Abs, Other) per calendar week (Monday–Sunday).
- Highlights set counts against evidence-based hypertrophy targets (**10–20 hard sets** per week):
  - 🟡 **Amber**: Under target (< 10 sets)
  - 🟢 **Green**: Optimal target (10–20 sets)
  - 🔴 **Red**: Excessive volume (> 20 sets)
- Excludes sets flagged as warm-ups from weekly volume and set counts to prevent "junk volume" pollution.

### 2. RPE / RIR Intensity Logging
- Select your preferred logging scale in Settings: **RPE** (Rate of Perceived Exertion, scale 6–10) or **RIR** (Reps in Reserve, scale 0–5).
- Toggles sets between **Warm-up** and **Working (Working sets)** styles.
- **Upgraded Progression Helper**: Suggests weight increases next session *only* if all working sets hit the top of the rep range **AND** the last set's difficulty was moderate (RPE $\le 9$ / RIR $\ge 1$). Otherwise, it advises to hold the weight or add reps.

### 3. Persistent Rest Timer
- Checking off a set automatically launches a countdown rest timer.
- Pulls prescribed rest times configured per exercise (defaults to **120s for compounds**, **90s for isolation**).
- **Refreshes and crash recovery**: The countdown endpoint uses absolute timestamps stored in `localStorage`, meaning it continues accurately even if the browser page is closed or refreshed.
- Sends a physical vibration warning (`navigator.vibrate`) and flashes screen borders at zero. Includes `+30s` extend and `Skip` controls.

### 4. Interactive Volume Trends
- Aggregates and plots total working volume over time using a premium Recharts `AreaChart` with linear opacity fills.
- Compares current weekly volume load against the previous week, displaying trend percentage arrow badges (Up, Flat, Down).

### 5. History & Records
- Expandable logs detailing set-by-set weight, reps, and RPE/RIR ratings for every workout.
- Automatically tracks **Personal Records (PBs)**: maximum weight lifted (single set) and maximum single-session volume for each exercise.

### 6. Standalone PWA Installation
- Complies with PWA standards: registers a service worker (`sw.js`) utilizing Workbox to precache resources for true offline utility.
- Supports backup exports/imports as a single `.json` file.

---

## 📱 iPhone 15 Pro hardware & iOS Safari Optimizations

- **OLED Black Display Theme (`#000000`)**: Designed to completely turn off the pixels on your iPhone's Super Retina XDR screen. This creates infinite contrast and extends battery life during workouts.
- **iOS Zoom Prevention**: Set sizes of all log inputs and selector dropdowns to **`16px`** to bypass iOS Safari's default screen auto-zooming.
- **Dynamic Island & Swipe Bar Safe Areas**: Integrated top safe areas (`env(safe-area-inset-top)`) on the header and bottom safe areas (`env(safe-area-inset-bottom)`) on the tab bar to fit beneath screen cutouts.
- **Locked App Shell**: Disabled global page elastic scrolling boundaries. Swiping lists handles momentum inertia scrolling (`-webkit-overflow-scrolling: touch`) inside the log view, matching native iOS feel.

---

## Getting Started

### Prerequisites
- **Node.js**: v20.17.0+
- **npm**: v10.8.2+

### Local Development
1. Clone the repository and navigate into it:
   ```bash
   git clone https://github.com/martil2105/fervent-babbage.git
   cd fervent-babbage
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the host server:
   ```bash
   npm run dev -- --host
   ```
4. Access the server on your local network using the IP displayed (e.g., `http://192.168.1.55:5173`) from your iPhone's Safari browser.

### Compiling Production Builds
To test the PWA packaging output:
```bash
npm run build
```
The static files compile into the `dist/` directory, including PWA registrations (`sw.js` and `manifest.webmanifest`).

---

## 📥 How to Install on iOS

1. Open Safari on your iPhone and go to: **[https://martil2105.github.io/fervent-babbage/](https://martil2105.github.io/fervent-babbage/)**
2. Tap the **Share** button in the bottom utility bar.
3. Tap **Add to Home Screen**.
4. Name the application (e.g. **PushTrack**) and tap **Add**.
5. Launch the app from your Home Screen. It will load instantly, hide the browser navigation bar, respect all system safe areas, and operate **100% offline**.
