# Task 7 production build fix

The production upload handler binder now has separate overloads for collection and item routes. `POST /api/uploads` exposes only its request argument and therefore satisfies Next's generated `params: Promise<{}>` route contract. The content and completion handlers retain `params: Promise<{ uploadId: string }>`.

The local provider's temporary object file is created from a runtime-generated path. The supported `turbopackIgnore` annotation on that `open` path prevents Turbopack from treating the runtime filename as a deployment asset glob. The existing object-key validation, canonical root checks, symlink rejection, `O_NOFOLLOW`, and restrictive file mode remain in force.

Regression coverage is in `tests/types/upload-route-types.ts` and `tests/build/upload-tracing.test.mjs`. The type contract is included in `pnpm typecheck`; the trace test checks each production route manifest for unrelated docs, tests, private data, project configuration, and source files while allowing the six storage modules used by every route.

A runtime review found that Next invokes the static collection handler with `{ params: undefined }` despite its request-only exported signature. The binder now branches on `action === "create"` before reading route params. The production-bound integration test invokes that exact context shape and verifies creation reaches HTTP 201; missing or malformed params for the dynamic handlers return the sanitized internal error response.

Verification used Node 22.17.0 with the bundled pnpm 11.25.0 CLI:

- `pnpm test tests/unit/storage tests/integration/storage` — 46 tests passed.
- `pnpm typecheck` — passed.
- `pnpm lint` — passed.
- `pnpm build` — passed with Next.js 16.4.1 and Turbopack; generated route validators accepted all three handlers.
- `node --test tests/build/upload-tracing.test.mjs` — all three route traces passed; no docs, tests, `.data`, unrelated source, or project configuration were present.
- `git diff --check` — passed.

`next-env.d.ts` was restored to its tracked generated form and is not part of this fix.
