# Task 4 Report

Status: DONE

## Commit

`d589965f454cd2c192413c2ec131c7f394429762` — `feat: add invite-only authentication domain`

## Files changed

- `src/features/auth/auth-types.ts`, `auth-errors.ts`, `auth-repository.ts`, `auth-service.ts`, `crypto.ts`: authentication contracts, stable errors, registration/login/session flows, Argon2id password hashing, HMAC-SHA256 invite hashing, random 32-byte session tokens, and SHA-256 session-token storage.
- `src/server/db/drizzle-auth-repository.ts`: PostgreSQL/PGlite repository with atomic guarded invite consumption and one transaction for user, empty settings, `我的衣柜`, and session creation.
- `src/server/runtime/env.ts`: CLI-safe `INVITE_PEPPER` validation without echoing configuration values.
- `scripts/create-invite.ts`, `package.json`, `pnpm-lock.yaml`: working `pnpm invite:create --uses 1 --days 30` command and `@node-rs/argon2` dependency.
- `tests/helpers/in-memory-auth-repository.ts`: serialized in-memory repository implementing the same invite contract for domain tests.
- `tests/unit/auth/*`: crypto, registration, login, logout, and session tests.
- `tests/integration/auth/*`: real PGlite transaction/concurrency/error-sanitization coverage and a spawned Node/tsx CLI persistence smoke test.

## RED evidence

1. `pnpm test tests/unit/auth` failed in all three suites because `@/features/auth/crypto`, `auth-errors`, and `auth-service` did not exist.
2. `pnpm test tests/integration/auth` failed because `drizzle-auth-repository.ts` and `scripts/create-invite.ts` did not exist.
3. The email-enumeration regression test failed because the in-memory repository returned `EMAIL_ALREADY_REGISTERED` before validating the exhausted invite; validation order was corrected.
4. The real PGlite duplicate-email test failed with a raw `DrizzleQueryError`; nested PostgreSQL/PGlite constraint errors are now mapped to `EMAIL_ALREADY_REGISTERED`, and the invite update rolls back.
5. The transaction and standalone-session sanitization tests failed because Drizzle errors exposed bound session hashes. Repository errors now return generic messages without query parameters, and the rollback assertions pass.

All commands used `/usr/local/bin/node` 22.17.0 with the bundled pnpm 11.25.0 CLI.

## GREEN and verification evidence

- Focused auth tests: 5 files, 29 tests passed.
- Full `pnpm test`: 13 files, 48 tests passed.
- `pnpm typecheck`: passed.
- `pnpm lint`: passed with zero warnings.
- `git diff --check`: passed.
- CLI smoke test: spawned Node 22 with `tsx`, created a two-use/five-day invite in a migrated persistent PGlite database, observed the raw 24-character code exactly once, and verified that only its HMAC was stored.

## Self-review

- Password bounds are inclusive at 10 and 128 Unicode code points. Passwords use Argon2id with 19 MiB memory, two passes, 32-byte output, and one lane; malformed hashes fail closed.
- Unknown-email login performs a real Argon2 verification against a lazily created dummy hash and returns the same `INVALID_CREDENTIALS` error as a wrong password.
- Invite validity covers unknown, expired, revoked, and exhausted codes. The database uses a guarded atomic update, which takes the PostgreSQL row lock while validating and consuming the invite. Real concurrent PGlite registration proves that a single-use invite creates exactly one account.
- Duplicate emails are normalized before persistence. A valid duplicate maps to `EMAIL_ALREADY_REGISTERED` and rolls back invite consumption; callers without a valid invite do not learn whether an email exists.
- Registration creates the user, empty settings, default wardrobe, and session in one transaction. Tests force late transaction failures and prove all writes roll back.
- Raw invitation codes are generated from 18 random bytes and printed once. Raw session tokens are generated from 32 random bytes and only SHA-256 hashes cross the repository boundary.
- No code logs passwords, password hashes, peppers, raw session tokens, session hashes, or full invite codes. Database errors capable of containing bound authentication values are sanitized before they can reach framework logs.

## Concerns

None at the original Task 4 implementation review.

## Follow-up fix round 1

Status: DONE

### Changes

- `scripts/create-invite.ts` now loads project environment files through Next's `@next/env` loader before reading configuration. The loader uses the standard Next.js precedence and a silent logger so configuration values are not logged.
- Invite creation now requires either `DATABASE_URL` or `PGLITE_DATA_DIR` before generating a raw code or connecting to the database. This prevents accidental creation in the default in-memory PGlite instance.
- The CLI regression now runs the documented `pnpm invite:create --uses ... --days ...` command from isolated temporary projects. One case gets its database path and pepper only from `.env.local` and verifies the stored HMAC by reopening the file-backed PGlite database. Another supplies only the pepper and verifies failure before a raw code is printed.
- `@next/env` is declared directly because the CLI imports its loader.

### RED evidence

The new CLI regressions first failed against the baseline: the config-only `.env.local` invocation exited unsuccessfully, and the pepper-only invocation did not fail with the durable-database requirement. The failures reproduced the missing env-file loading and in-memory fallback paths.

### GREEN and verification evidence

- Focused CLI regression: 2 tests passed.
- Full suite: 13 files, 49 tests passed.
- `pnpm typecheck`: passed.
- `pnpm lint`: passed with zero warnings.
- `git diff --check`: passed.
- Commands used Node `v22.17.0` and bundled pnpm `11.25.0`. The local pnpm runner emitted an out-of-sync warning about `enableGlobalVirtualStore`; the requested test, typecheck, and lint commands all completed successfully.
