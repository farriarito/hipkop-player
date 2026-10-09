# Playback integration contract

The persistent player is `public/player.js`. Load it before `app.js`, add `<aside id="miniPlayer" hidden aria-label="正在试听"></aside>` outside `#view`. It builds its controls and appends hidden `<audio id="hipkopAudio">` once.

APIs:
- `window.HipkopPlayer.playQueue(items)` / `playItem(item or id)` hydrate real `/api/albums/:id` tracks, skip unavailable previews and duplicates, and start real HTMLAudioElement playback. Album queues resolve at most six album entries; no synthetic sound.
- `toggle()` / `pause()` / `next()` / `previous()`.
- `setFeatured(items)` and `toggleFeatured()`.
- `snapshot()` / `on(listener)` (returns unsubscribe).
- `window` event `hipkop:player`: `event.detail` has `status`, `item`, `id`, `title`, `artist`, `cover`, `currentTime`, `duration`, `queue`, `index`, `externalUrl`, `message`.
- Real `playing` event alone changes state to `playing`. An error or missing preview must NOT animate the sculpture as playing.
- `audio` readonly reference, also `document.getElementById('hipkopAudio')`, available for QA.

Player CSS hooks: `.mini-player-art`, `.mini-player-copy`, `.mini-player-toggle`, `.mini-player-external`, `.mini-player-progress > i`, `.has-player`, `[data-status="playing"]`. Actual CSS lives in `public/exhibition.css`; `[hidden]` is explicitly respected.
All controls have aria-label and real button actions. The cover falls back to the real logo. Platform link uses HTTPS provider link, `target="_blank"` with noopener.
Audio progress updates only on browser timeupdate events. Page navigation does not create new audio, loops, intervals or event subscriptions.

Production:
- `node scripts/build.js` creates `dist/server.js`, `dist/src`, `dist/public`, minimal `dist/package.json`, no local secrets/database.
- Deployment: `HIPKOP_DB_PATH`, `HIPKOP_MEDIA_DIR`, `node --env-file-if-exists=.env dist/server.js`.
- `/hipkop` and `/hipkop/` serve actual SPA index, absolute assets work unchanged.
- `tsconfig.json` checks ALL `public/*.js`, not vendored GSAP.
- TypeScript 5.9.3 is a locked devDependency. `npm run build` runs syntax checks, all front-end JS typechecking, then the native production packaging script.

Actual media evidence: `/api/albums/itunes-album-6817200688` returns Quavo's `Backwards`, `itunes-track-6817200690`, real Apple AAC preview. Provider HEAD returned HTTP 200, Content-Type audio/x-m4p, 1,032,826 bytes. Browser playback still must be verified; this HEAD is not proof of play.

Confirmed browser playback: system Chrome headless, the real remote Apple preview decoded successfully. `playItem('itunes-album-6817200688')` returned true; actual media element `paused=false`, duration 30.001995, currentTime advanced to 0.965086; following `pause()` resulted in state paused and media paused=true. Zero page errors. Evidence saved to `docs/ui-verification/real-player-report.json`.

Confirmed `node --test tests/player.test.js`: six lifecycle / hydration / deduplication / next & previous / no-preview / play failure / subscription assertions pass. Confirmed built-server `/hipkop` gives HTTP 200 and actual HIPKOP HTML.

Baseline type errors are fixed: tabbar uses `getAttribute`, lastDetail keeps its real navigation shape, delegated pointer events guard Element targets, and the playback event has a CustomEvent type. No `@ts-nocheck` or omitted application files are used.

`exhibition.js` synchronizes the stage labels / pressed state independently of GSAP. `motion.js` subscribes within its page context and rotates only on real `playing`; observer, visibility and matchMedia cleanup stop offscreen / inactive work. `npm run test:ui` checks actual playback and pause synchronization against the running catalog.
