# B-SIDE Player

A Progressive Web App (PWA) to listen to the **B-SIDE** podcast by Alessio Bertallot on Radio Capital.

![B-SIDE Player](icon-192.png)

## Features

### Audio Player
- Stream episodes by date
- Playback controls: play/pause, -30s, +30s
- Quick navigation between days with ◀ ▶ arrows
- Episode segments: jump to each quarter with the 1-2-3-4 buttons
- Progress bar with elapsed and remaining time
- Volume control with mute/unmute
- Toast notifications for playback errors

### Shuffle Mode
- Tap the shuffle button to toggle an endless, radio-like mode. It picks a random weekday episode (Sep 1, 2025 – Jun 26, 2026, weekends excluded) and a random quarter of the show (1-4), then streams from there; when the section finishes it automatically jumps to a new random episode + part
- If something is already playing, shuffle takes over at the end of the current section instead of interrupting
- While shuffle is active, the prev/next buttons next to play navigate the shuffle: **next** jumps to a new random episode + part, **previous** goes back through history (or restarts the current section when at the start)
- If an episode is unavailable, it warns and automatically moves on to a new pick (stops after several consecutive failures)
- Shuffle turns off on a second tap, or when you manually pick an episode
- Date range configured in `js/config.js`

### Favorites
- Save favorite episodes
- Quick access from favorites list
- Persistent across sessions

### Sleep Timer
- Auto-stop after 5, 15, 30, 45, or 60 minutes
- Real-time countdown display
- Automatically pauses playback

### Connection Management
- Automatic reconnection on network interruption
- Retry with exponential backoff
- Online/offline detection
- Playback resumes from interruption point
- Position saved every 5 seconds

### PWA
- Installable on Android, iOS, and desktop
- Works offline (interface, with offline navigation fallback)
- Lockscreen and notification controls
- Bluetooth headphones compatible
- Custom home screen icon

### Theme
- Light and dark mode
- Preference saved automatically and applied before first paint (no flash on load)
- System theme color adaptation

## Installation

### On Android smartphone
1. Open [https://marcomauro.github.io/bside-player/](https://marcomauro.github.io/bside-player/) with Chrome
2. Tap menu ⋮ → "Add to Home screen"
3. The app will appear on your home screen with the B-SIDE icon

### On iOS
1. Open the site with Safari
2. Tap Share → "Add to Home Screen"
3. Confirm installation

### On desktop
1. Open the site with Chrome
2. Click the install icon in the address bar
3. Confirm installation

## Project Structure

```
bside-player/
├── index.html          # Main HTML structure
├── manifest.json       # PWA manifest
├── sw.js               # Service Worker (caching)
├── icon-192.png        # Icon 192x192
├── icon-512.png        # Icon 512x512
├── css/
│   ├── variables.css   # CSS custom properties (themes)
│   ├── base.css        # Reset and global styles
│   ├── layout.css      # Player layout structure
│   ├── components.css  # UI components (buttons, popups, etc.)
│   └── responsive.css  # Media queries
└── js/
    ├── config.js       # Constants and configuration
    ├── utils.js        # Utility functions
    ├── engine.js       # Global state management
    ├── storage.js      # LocalStorage handling
    ├── network.js      # Network monitoring and recovery
    ├── audio.js        # Audio events and playback
    ├── ui.js           # UI interactions
    ├── theme.js        # Theme management
    ├── favorites.js    # Favorites system
    ├── sleep.js        # Sleep timer
    ├── random.js       # Random episode playback
    ├── mediasession.js # Media Session API (lockscreen)
    ├── install.js      # PWA installation and Service Worker registration
    ├── info.js         # Info popup (version, credits)
    ├── toast.js        # Toast notifications
    └── app.js          # App initialization
```

## Technologies

- HTML5 / CSS3 / JavaScript (ES6 Modules) — no build step, no external dependencies, system font stack
- Media Session API (lockscreen controls)
- Service Worker (cache and installation)
- Web App Manifest (PWA)
- Connection API (network quality detection, where supported)

### Service Worker caching strategies

- **Audio streams**: network-only, never cached (returns a controlled 503 when offline)
- **Static assets** (HTML, CSS, JS, icons): stale-while-revalidate, same-origin GET requests only
- **Navigation requests**: fall back to the cached `index.html` app shell when offline
- Cache is versioned via `CACHE_NAME` in `sw.js`: bump it whenever a static asset changes, otherwise users keep receiving stale files

## Local Development

To test locally, you need a local server (ES6 modules require HTTP):

```bash
# With Python
python3 -m http.server 8000

# With Ruby
ruby -run -ehttpd . -p8000
```

Then open `http://localhost:8000`

There are no automated tests: verify changes manually in the browser (playback, seeking, day navigation, offline behavior, PWA install).

## Conventions

- Code comments and documentation are written in English
- App version lives in `js/config.js` (`APP_VERSION`)

## Author

Developed by Marco Mauro

## License

This project is released under the MIT License.

---

🎧 Enjoy listening!
