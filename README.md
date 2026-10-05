# Matchday Clock

An installable, offline-first football match clock. It runs entirely in the
browser, stores match data on the current device, and needs no account or
backend.

> Made with AI

## Features

- Installable PWA for Android and Apple devices, with portrait and landscape
  layouts.
- Configurable duration for each regulation half and, optionally, each of two
  extra-time periods.
- Cumulative match time: a 45-minute first half shows `48:05` in red at 3:05
  stoppage time; the second half starts at `45:00`. Period lengths are
  configurable for shorter-format leagues.
- A combined start/pause control, period stop, and confirmed reset. Stop
  advances to the next configured period and starts an optional break timer;
  stopping the final period leaves its final time visible.
- Correct the displayed time at any point, including while running.
- A pause log with the period, match time, and duration of each between-period
  break and manual pause, available from Settings.
- Optional hold-to-track control that measures time lost separately without
  stopping the match clock.
- Optional screen wake lock while running and best-effort running notifications.
- Locally saved, named match presets for commonly used period lengths.
- An install banner with a browser install prompt where supported and
  platform-specific instructions otherwise.
- Localized interface in 24 languages, with device-language detection and
  English (UK) as the fallback.
- Light, dark, and OLED themes, with device appearance selected by default and
  optional manual overrides.
- Local storage and a service worker cache for use after the first successful
  load.

The clock uses the locally bundled DSEG7 LCD font. It is distributed under the
SIL Open Font License 1.1; the required notice is included at
`public/licenses/DSEG-OFL-1.1.txt` and in the built webfiles.

## Run locally

Requirements: Node.js 22.12 or newer and npm.

```sh
npm ci
npm run dev
```

Run the focused clock-model tests and production build with:

```sh
npm test
npm run build
npm run preview
```

## Install on a phone or tablet

Serve the app over HTTPS (or `localhost` for development), then open it in the
browser. The app shows an install banner outside standalone/PWA mode:

- **Android:** use Chrome's Install app / Add to Home screen option.
- **iPhone or iPad:** open the site in Safari, choose Share, then Add to Home
  Screen.

The first visit needs a network connection so the browser can download the app
shell. After that, the service worker caches the app files and the clock works
offline. Match setup and match data are saved only in that browser's local
storage; they are not synced to other devices and can be removed by clearing
the browser's site data.

## Language and appearance

The app supports English (US), English (UK), German, Spanish, Portuguese
(Portugal and Brazil), French, Dutch, Swedish, Danish, Italian, Polish,
Norwegian, Finnish, Croatian, Japanese, Korean, Turkish, Serbian (Latin),
Bosnian, Ukrainian, Russian, Simplified Chinese, and Georgian (Kartuli). By
default it follows the device language; unsupported languages fall back to
English (UK). The language can be changed in **Settings**.

Appearance follows the device setting by default. Choose light, dark, or OLED
in **Settings** to override it; OLED uses a pure-black app background.
Language and appearance preferences are saved locally with the match data.
The app fetches only the selected language
at runtime. The service worker caches each language the first time it is
selected, so the installed app stays small; a language that has not yet been
cached still needs a connection the first time it is chosen. Previously
selected languages remain available offline.

## Phone background and notification limits

The displayed clock is calculated from saved timestamps rather than depending
on a JavaScript interval to count seconds. When the app becomes visible again,
it recalculates the time, so throttling while switching apps or locking the
screen does not make the match clock drift.

Browsers can suspend or terminate a PWA while it is in the background, and a
web app cannot guarantee execution after it is closed. The screen wake lock is
best-effort and only works while supported by the browser; it can be disabled
in Settings. Running notifications also depend on browser permission and
platform support, and are not a guaranteed persistent background service. Use
**Stop** at the end of each period to advance the match and optionally start
the break timer. After the final period, the clock stays at its final time; use
**Reset** to clear the match and return to the setup choices. If the operating
system later reopens a saved running match, its clock is recovered from its
last saved timestamp.

## Self-host with Docker

The image serves the static PWA with Nginx on port 80. Put it behind an HTTPS
reverse proxy so mobile browsers can install it and grant wake-lock or
notification permissions.

```sh
docker build -t matchday-clock .
docker run --rm -p 8080:80 matchday-clock
```

Then open `http://localhost:8080` (or the HTTPS hostname configured in your
reverse proxy).

## GitHub releases

Pushing a version tag such as `v1.0.0` runs
`.github/workflows/release.yml`. The workflow tests and builds the app, creates
a GitHub Release with `matchday-clock-static-webfiles.tar.gz` attached, and
publishes a multi-architecture container image to GitHub Container Registry:

```text
ghcr.io/thisguystan/matchday-clock:v1.0.0
ghcr.io/thisguystan/matchday-clock:latest
```

The created release includes a direct link to the GHCR package as well as the
downloadable static webfiles.
