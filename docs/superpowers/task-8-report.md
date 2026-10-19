# Task 8 Implementation Report

Status: DONE_WITH_CONCERNS

Implemented the PWA manifest, generic offline page, production-only Service Worker registration, Android install prompt, and iOS Safari home-screen guidance with guarded local-storage dismissal. The Service Worker precaches only `/offline` and the three approved PNG icons. Its fetch policy skips private/auth routes, API paths, uploads and images, cross-origin requests, cookie-credentialed requests, and non-GET requests; it only applies offline fallback to public navigations and never writes fetched responses to cache. Activation deletes only older caches owned by this app.

Added the paper/sage wardrobe mark as an SVG source and a Sharp generator. Generated and verified `icon-192.png` (192×192), `icon-512.png` (512×512), and `apple-touch-icon.png` (180×180). The install prompt uses accessible labels, visible focus treatment, and safe-area-aware spacing.

TDD evidence: the initial PWA test run failed because the manifest, worker, and installation UI were absent. The behavioral tests execute `public/sw.js` in a worker harness and verify exact precache contents, private-route bypass, network fallback, absence of runtime cache writes, and safe cache cleanup.

Verification:

- PWA tests: 16 passed.
- Full suite: 32 files, 214 tests passed (`--maxWorkers=4 --testTimeout=15000`).
- ESLint: passed.
- `git diff --check`: passed.
- TypeScript initially passed before Next generated production route validators; it now fails on the existing `/api/uploads` handler type in `src/server/storage.ts`, which gives the collection route a context requiring `params.uploadId`.
- Production build compiled the app, then failed on that same pre-existing Next route type validation. The build also reports an existing dynamic filesystem tracing warning from `src/features/storage/local-storage-provider.ts`.

The requested `.superpowers/sdd/2026-10-16-phase-1-foundation/task-8-brief.md` was not present in this checkout. Implementation followed Task 8 in `docs/superpowers/plans/2026-10-16-phase-1-foundation.md` and the approved design specification. The unrelated upload route typing issue remains for the phase owner to address.
