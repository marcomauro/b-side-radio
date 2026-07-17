# B-SIDE Radio

A Progressive Web App (PWA) that turns the **B-SIDE** podcast by Alessio Bertallot (Radio Capital) into a **non-stop radio**: an endless shuffle across dates and sections of the show.

![B-SIDE Radio](icon-192.png)

## What it is

B-SIDE Radio is a derivative of the [`bside-player`](https://github.com/marcomauro/bside-player) PWA. Where the player lets you browse and play episodes by date, the radio strips that down to a single idea: **press play and listen forever.** There is no date picker and no episode browsing — the radio picks a random weekday episode and a random quarter of the show, streams from there, and jumps to a new random episode + section when the current one ends.

## How it works

- **Shuffle is the default and only mode.** On load the radio pre-selects a random episode + section (paused, ready). The first **play** starts it; from then on it flows continuously.
- **Continuous flow.** Each episode is split into four quarters. When a quarter (or the whole episode) ends, the radio auto-advances to a fresh random pick and keeps playing.
- **Transport arrows navigate the shuffle:**
  - **▶︎ next** — jump to a new random episode + section
  - **◀︎ previous** — go back through history, or restart the current section when at the start of history
- **Resilient.** If an episode is unavailable it warns and moves on to a new pick, pausing the radio after several consecutive failures.
- **Random range** (weekdays only, weekends excluded) is configured in `js/config.js` (`RANDOM_RANGE_START` / `RANDOM_RANGE_END`).

### Controls kept

Play/pause · skip −30s / +30s · previous / next (shuffle navigation) · sleep timer · light/dark theme · info · volume.

### Controls removed vs. the player

Date picker · day-by-day navigation bar · favorites · per-section (1-2-3-4) buttons.

## PWA

- Installable on Android, iOS, and desktop
- Works offline (interface shell; audio is always streamed)
- Lockscreen and notification controls (Media Session API)
- Bluetooth headphones compatible

## Theme

- Light and dark mode with its own teal/cyan accent (distinct from the player's indigo/purple)
- Preference saved and applied before first paint (no flash on load)

## Installation

### On Android
1. Open the published URL with Chrome
2. Tap menu ⋮ → "Add to Home screen"

### On iOS
1. Open the site with Safari
2. Tap Share → "Add to Home Screen"

### On desktop
1. Open the site with Chrome
2. Click the install icon in the address bar

## Governance of the shared core

B-SIDE Radio and B-SIDE Player **share git history** (this repo was seeded from `bside-player/main`) and, deliberately, a set of **shared core modules**. The rule keeps future maintenance cheap:

> **Core fixes are born in the player and travel to the radio via cherry-pick — never the other way around.**

```bash
git remote add player https://github.com/marcomauro/bside-player.git
git fetch player
git cherry-pick <sha>   # port a core fix from the player into the radio
```

### Shared core modules (keep API-stable)

`engine.js` · `audio.js` · `network.js` · `storage.js` · `mediasession.js` · `utils.js` · `config.js`

These are the audio/streaming engine. Do **not** diverge their public API here — if you need to change engine behavior, do it in the player first, then cherry-pick. `storage.js` and `config.js` are kept byte-identical to the player on purpose (they still export favorites/date-range helpers the radio no longer calls, so a port stays a clean cherry-pick).

### Divergence from the player (the radio's own layer)

These files are radio-specific and are expected to differ:

- `random.js` — rewritten: shuffle is the default mode, boots via `startRadio()`, and owns the transport-arrow navigation.
- `app.js` — no favorites/segment/date wiring; boots the radio after init.
- `ui.js` — trimmed DOM map; `updateNav`/`updateActiveSegment` are safe no-ops for the removed controls.
- `index.html`, `manifest.json`, `sw.js`, `css/variables.css` — branding, accent, and the trimmed layout.
- `favorites.js` — removed.

`audio.js` is core but required a minimal, well-scoped divergence: the `favorites.js` import was dropped and `initPlayerControls` was trimmed to the controls the radio keeps. The **audio pipeline** (event handlers, `updatePlayer`, position tracking, lifecycle, recovery, `handlePlayPause`) is unchanged, so engine cherry-picks touching those regions still apply cleanly.

> **Same-origin note:** both apps are GitHub Pages *project* sites under `marcomauro.github.io`, so they share `localStorage` and must **not** share a Service Worker cache — hence `CACHE_NAME = 'bsideradio-cache-v1'` in `sw.js`, distinct from the player's.

## Shuffle-injection wiring (gotchas)

- `audio.js` exposes `setShuffleNavigator()`; the prev/next arrows defer to it. The dependency is one-way (`audio.js` never imports `random.js`).
- **Order matters:** `initAudioEvents()` must run before `initRandom()` in `app.js` — the shuffle's `ended`/`error` listeners register after the engine's and rely on that order.
- An `advancing` guard (cleared on the new source's `loadedmetadata`) prevents a double-jump at the section boundary while the `src` is being swapped.

## Project Structure

```
b-side-radio/
├── index.html          # Main HTML structure
├── manifest.json       # PWA manifest
├── sw.js               # Service Worker (caching)
├── icon-192.png        # Icon 192x192
├── icon-512.png        # Icon 512x512
├── css/
│   ├── variables.css   # CSS custom properties (radio accent + themes)
│   ├── base.css        # Reset and global styles
│   ├── layout.css      # Player layout structure
│   ├── components.css  # UI components (buttons, popups, etc.)
│   └── responsive.css  # Media queries
├── js/
│   ├── config.js       # Constants and configuration (shared core)
│   ├── utils.js        # Utility functions (shared core)
│   ├── engine.js       # Global state management (shared core)
│   ├── storage.js      # LocalStorage handling (shared core)
│   ├── network.js      # Network monitoring and recovery (shared core)
│   ├── audio.js        # Audio events and playback (shared core)
│   ├── mediasession.js # Media Session API / lockscreen (shared core)
│   ├── ui.js           # UI interactions
│   ├── theme.js        # Theme management
│   ├── sleep.js        # Sleep timer
│   ├── random.js       # Shuffle radio engine (default mode)
│   ├── install.js      # PWA install + Service Worker registration
│   ├── info.js         # Info popup (version, credits)
│   ├── toast.js        # Toast notifications
│   └── app.js          # App initialization
└── test/
    └── shuffle-mode-test.mjs  # Playwright headless smoke test
```

## Local Development

ES6 modules require HTTP, so serve the folder:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

### Automated test

A headless Playwright smoke test lives in `test/shuffle-mode-test.mjs`. It serves a synthetic WAV (with HTTP Range → 206 support), disables the Service Worker, and drives the radio through boot, play, next/previous, and the error cap.

```bash
npm install            # installs playwright (Chromium is provided by the environment)
node test/shuffle-mode-test.mjs
```

## Technologies

- HTML5 / CSS3 / JavaScript (ES6 Modules) — no build step, no external runtime dependencies
- Media Session API · Service Worker · Web App Manifest · Connection API

## Author

Developed by Marco Mauro, with the support of Claude AI.

## License

Released under the MIT License.

---

📻 Non-stop B-SIDE. Press play.
