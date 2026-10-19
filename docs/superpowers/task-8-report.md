# Task 8 Implementation Report

Status: DONE

Implemented the PWA manifest, generic offline page, production-only Service Worker registration, Android install prompt, and iOS Safari home-screen guidance with guarded local-storage dismissal. The Service Worker precaches only `/offline` and the three approved PNG icons. It skips private/auth routes, API paths, uploads and images, cross-origin requests, and non-GET requests. Eligible public navigations use network-first fetch with `cache: "no-store"`, then fall back only to the generic offline page; fetched responses are never written to a Service Worker cache. Activation deletes only older caches owned by this app.

Round 1 review fixes: real browser navigation requests with `credentials: "include"` now take the public navigation path, preserving the generic offline fallback without runtime caching. Private/app/auth/API paths with included credentials remain bypassed. Manifest icons now advertise both `purpose: "any"` and `purpose: "maskable"` for 192px and 512px assets so Chromium can select a general-purpose install icon.

Added the paper/sage wardrobe mark as an SVG source and a Sharp generator. Generated and verified `icon-192.png` (192×192), `icon-512.png` (512×512), and `apple-touch-icon.png` (180×180). The install prompt uses accessible labels, visible focus treatment, and safe-area-aware spacing.

TDD evidence: initial PWA tests failed because the manifest, worker, and installation UI were absent. Round 1 tests then failed because include-credential navigations were not intercepted and the manifest had only maskable icons. The behavioral tests execute `public/sw.js` in a worker harness and verify exact precache contents, include-credential public navigation with `no-store`, generic offline fallback, private-route bypass, absence of runtime cache writes, and safe cache cleanup.

Verification:

- PWA tests: 16 passed.
- Full suite: 32 files, 214 tests passed (`--maxWorkers=4 --testTimeout=15000`).
- ESLint: passed.
- `git diff --check`: passed.
- TypeScript: passed.
- Production build: passed after the concurrent Task 7 upload-route typing fix was present in the shared worktree; that change is outside this Task 8 commit.

The requested `.superpowers/sdd/2026-10-16-phase-1-foundation/task-8-brief.md` was not present in this checkout. Implementation followed Task 8 in `docs/superpowers/plans/2026-10-16-phase-1-foundation.md` and the approved design specification.
