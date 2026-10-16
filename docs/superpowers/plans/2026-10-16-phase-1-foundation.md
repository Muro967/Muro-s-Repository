# AI Wardrobe Phase 1 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a runnable, installable AI Wardrobe PWA foundation with the approved visual system, invite-only email/password accounts, isolated user data, onboarding, PostgreSQL-compatible persistence, and object-storage upload contracts.

**Architecture:** Use one Next.js 16 App Router application with server-rendered protected routes and route handlers. Domain logic is isolated from Next.js and persistence behind small service and repository interfaces; local development and tests use PGlite, while production uses PostgreSQL through the same Drizzle schema. The first phase intentionally stops before garment recognition, inspiration analysis, outfit generation, and idle/disposal behavior.

**Tech Stack:** Node.js 22, pnpm 11, Next.js 16, React 19, TypeScript 5, CSS Modules and global CSS tokens, Drizzle ORM, PostgreSQL/PGlite, Zod, `@node-rs/argon2`, AWS S3-compatible object storage, Vitest, Testing Library, and Playwright.

## Global Constraints

- Source design: `docs/superpowers/specs/2026-10-16-ai-wardrobe-pwa-mvp-design.md`.
- Visual references: `docs/references/ai-wardrobe-sketch/`.
- Browser floor: Safari 16.4+, Chrome 111+, Edge 111+, and Firefox 111+.
- Primary layout width: 390 CSS pixels; supported mobile width: 320–480 CSS pixels.
- UI language: Simplified Chinese. Brand name: `AI Wardrobe`. Tagline: `穿你所有，爱你所穿`.
- Public registration is disabled. Registration requires a valid invitation code, email, and password.
- Password length is 10–128 Unicode characters. Passwords are hashed with Argon2id.
- Session cookies are HTTP-only, same-site `lax`, secure in production, and expire after 30 days.
- AI provider keys, invitation codes, passwords, session tokens, and private image URLs must never appear in client bundles or logs.
- Authenticated HTML, API responses, and user images must never be stored in the Service Worker cache.
- Generated framework configuration and generated icon binaries are the only test-first exceptions. Every behavior change follows red-green-refactor.
- Use CSS derived from the approved tokens; do not introduce Tailwind or a generic component library.

---

## File Map

The phase creates these responsibility boundaries:

- `src/app/`: routes, layouts, route handlers, manifest, and offline page only.
- `src/components/brand/`: brand header and logo treatment.
- `src/components/navigation/`: mobile app shell and bottom tabs.
- `src/components/pwa/`: Service Worker registration and installation guidance.
- `src/features/auth/`: invite registration, login, logout, password/session primitives, and auth UI.
- `src/features/onboarding/`: profile setup and first wardrobe creation.
- `src/features/storage/`: upload authorization, local adapter, and S3-compatible adapter.
- `src/server/db/`: Drizzle schema, migrations, database factory, and repository implementations.
- `src/server/http/`: same-origin checks and typed JSON response helpers.
- `src/styles/`: approved tokens, global reset, typography, and shared surface styles.
- `tests/`: unit, integration, component, and end-to-end tests.

---

### Task 1: Establish the Next.js and Test Baseline

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `.npmrc`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `next.config.ts`
- Create: `tsconfig.json`
- Create: `eslint.config.mjs`
- Create: `vitest.config.ts`
- Create: `vitest.setup.ts`
- Create: `playwright.config.ts`
- Create: `src/app/layout.tsx`
- Create: `src/app/page.tsx`
- Test: `tests/unit/app/root-page.test.tsx`

**Interfaces:**
- Produces: scripts `dev`, `build`, `start`, `lint`, `typecheck`, `test`, `test:watch`, and `test:e2e`.
- Produces: import alias `@/*` → `src/*`.
- Produces: a root page that renders the approved brand name and tagline.

- [ ] **Step 1: Add package and tool configuration**

Create a manual Next.js setup without Tailwind. Use this package shape and let pnpm write exact resolved versions to `pnpm-lock.yaml`:

```json
{
  "name": "ai-wardrobe",
  "version": "0.1.0",
  "private": true,
  "packageManager": "pnpm@11.25.0",
  "engines": { "node": ">=22 <23" },
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint . --max-warnings=0",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test"
  }
}
```

Install runtime packages:

```bash
pnpm add next@latest react@latest react-dom@latest zod
```

Install development packages:

```bash
pnpm add -D typescript @types/node @types/react @types/react-dom eslint eslint-config-next vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event @playwright/test
```

Set `.env.example` to:

```dotenv
APP_URL=http://localhost:3000
DATABASE_URL=
PGLITE_DATA_DIR=.data/pglite
INVITE_PEPPER=replace-with-at-least-32-random-characters
SESSION_COOKIE_SECURE=false
STORAGE_DRIVER=local
LOCAL_STORAGE_DIR=.data/uploads
S3_ENDPOINT=
S3_REGION=auto
S3_BUCKET=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
```

- [ ] **Step 2: Write the failing root-page test**

```tsx
import { render, screen } from "@testing-library/react";
import RootPage from "@/app/page";

test("shows the approved brand and tagline", () => {
  render(<RootPage />);
  expect(screen.getByRole("heading", { name: "AI Wardrobe" })).toBeInTheDocument();
  expect(screen.getByText("穿你所有，爱你所穿")).toBeInTheDocument();
});
```

- [ ] **Step 3: Run the test and verify RED**

Run:

```bash
pnpm test tests/unit/app/root-page.test.tsx
```

Expected: FAIL because `@/app/page` does not exist.

- [ ] **Step 4: Implement the smallest root layout and page**

```tsx
// src/app/layout.tsx
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "AI Wardrobe",
  description: "穿你所有，爱你所穿",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#F2EEE8",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
```

```tsx
// src/app/page.tsx
export default function RootPage() {
  return (
    <main>
      <h1>AI Wardrobe</h1>
      <p>穿你所有，爱你所穿</p>
    </main>
  );
}
```

- [ ] **Step 5: Verify the baseline**

Run:

```bash
pnpm test tests/unit/app/root-page.test.tsx
pnpm typecheck
pnpm lint
```

Expected: all commands exit 0 without warnings.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc .gitignore .env.example next.config.ts tsconfig.json eslint.config.mjs vitest.config.ts vitest.setup.ts playwright.config.ts src/app tests/unit/app
git commit -m "build: establish Next.js test baseline"
```

---

### Task 2: Build the Approved Visual System and Mobile Shell

**Files:**
- Create: `src/styles/tokens.css`
- Create: `src/styles/global.css`
- Create: `src/components/brand/brand-header.tsx`
- Create: `src/components/brand/brand-header.module.css`
- Create: `src/components/navigation/app-shell.tsx`
- Create: `src/components/navigation/app-shell.module.css`
- Create: `src/components/navigation/bottom-tabs.tsx`
- Create: `src/components/navigation/bottom-tabs.module.css`
- Create: `src/components/icons/app-icons.tsx`
- Modify: `src/app/layout.tsx`
- Modify: `src/app/page.tsx`
- Test: `tests/unit/components/brand-header.test.tsx`
- Test: `tests/unit/components/bottom-tabs.test.tsx`

**Interfaces:**
- Produces: `BrandHeader({ actions? })`.
- Produces: `BottomTabs({ activeTab })` with tab ids `wardrobe | outfits | inspiration | profile`.
- Produces: `AppShell({ activeTab, children })` with iPhone safe-area spacing.

- [ ] **Step 1: Write failing brand and navigation tests**

```tsx
import { render, screen } from "@testing-library/react";
import { BrandHeader } from "@/components/brand/brand-header";

test("renders the approved two-line brand lockup", () => {
  render(<BrandHeader />);
  expect(screen.getByRole("heading", { name: "AI Wardrobe" })).toBeInTheDocument();
  expect(screen.getByText("穿你所有，爱你所穿")).toBeInTheDocument();
});
```

```tsx
import { render, screen } from "@testing-library/react";
import { BottomTabs } from "@/components/navigation/bottom-tabs";

test("marks exactly one of the four tabs as current", () => {
  render(<BottomTabs activeTab="wardrobe" />);
  expect(screen.getAllByRole("link")).toHaveLength(4);
  expect(screen.getByRole("link", { name: "衣橱" })).toHaveAttribute("aria-current", "page");
  expect(screen.getByRole("link", { name: "搭配" })).not.toHaveAttribute("aria-current");
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run:

```bash
pnpm test tests/unit/components/brand-header.test.tsx tests/unit/components/bottom-tabs.test.tsx
```

Expected: FAIL because both components are missing.

- [ ] **Step 3: Add the exact visual tokens**

```css
/* src/styles/tokens.css */
:root {
  --paper: #f2eee8;
  --card: #fbf9f6;
  --ink: #3e3a36;
  --ink-2: #857d75;
  --line: #e4ddd3;
  --sage-dark: #6e7b6a;
  --sage: #9caa97;
  --rose: #c9a8a1;
  --rose-light: #ebdcd7;
  --mist: #a4b4be;
  --mist-light: #dce3e7;
  --clay: #b8977f;
  --oat: #e8e0d4;
  --butter: #d9c9a3;
  --radius-card: 24px;
  --radius-item: 18px;
  --radius-pill: 999px;
  --content-max: 480px;
  --tab-height: 64px;
}
```

`global.css` must set `box-sizing: border-box`, a `#F2EEE8` page, `#3E3A36` text, a Chinese system fallback, visible `:focus-visible`, 44-pixel minimum interactive targets, and reduced-motion overrides. Use `next/font/google` to bundle Cormorant Garamond, Noto Serif SC, and Noto Sans SC at build time.

- [ ] **Step 4: Implement the components**

```tsx
// src/components/brand/brand-header.tsx
import type { ReactNode } from "react";
import styles from "./brand-header.module.css";

export function BrandHeader({ actions }: { actions?: ReactNode }) {
  return (
    <header className={styles.header}>
      <div>
        <h1 className={styles.title}><span>AI</span> <em>Wardrobe</em></h1>
        <p className={styles.tagline}>穿你所有，爱你所穿</p>
      </div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </header>
  );
}
```

```tsx
// src/components/navigation/bottom-tabs.tsx
import Link from "next/link";

const tabs = [
  ["wardrobe", "/app/wardrobe", "衣橱"],
  ["outfits", "/app/outfits", "搭配"],
  ["inspiration", "/app/inspiration", "灵感"],
  ["profile", "/app/profile", "我的"],
] as const;

export type TabId = (typeof tabs)[number][0];

export function BottomTabs({ activeTab }: { activeTab: TabId }) {
  return (
    <nav aria-label="主要页面">
      {tabs.map(([id, href, label]) => (
        <Link key={id} href={href} aria-current={id === activeTab ? "page" : undefined}>
          <span aria-hidden="true" data-icon={id} />
          <span>{label}</span>
        </Link>
      ))}
    </nav>
  );
}
```

Derive the CSS sizes, spacing, radii, and active-state colors from screenshots `01-ward.png`, `11-look.png`, `15-insp.png`, and `17-me.png`. Keep the signature floating translucent tab capsule and do not reproduce the fake 9:41 status bar.

- [ ] **Step 5: Verify tests, responsive constraints, and reduced motion**

Run:

```bash
pnpm test tests/unit/components/brand-header.test.tsx tests/unit/components/bottom-tabs.test.tsx
pnpm typecheck
pnpm lint
```

Expected: PASS with no warnings.

- [ ] **Step 6: Commit**

```bash
git add src/styles src/components src/app tests/unit/components
git commit -m "feat: add AI Wardrobe visual system and shell"
```

---

### Task 3: Add the PostgreSQL-Compatible Data Foundation

**Files:**
- Create: `drizzle.config.ts`
- Create: `src/server/env.ts`
- Create: `src/server/db/schema.ts`
- Create: `src/server/db/client.ts`
- Create: `src/server/db/migrate.ts`
- Create: `src/server/db/types.ts`
- Create: `drizzle/0000_foundation.sql`
- Test: `tests/integration/db/foundation-schema.test.ts`

**Interfaces:**
- Produces: `getDb(): AppDatabase`.
- Produces tables: `users`, `invite_codes`, `sessions`, `user_settings`, `wardrobes`, `uploads`.
- Produces: `migrateDatabase(db)` for app startup scripts and test setup.

- [ ] **Step 1: Install database dependencies**

```bash
pnpm add drizzle-orm postgres @electric-sql/pglite
pnpm add -D drizzle-kit
```

- [ ] **Step 2: Write the failing schema integration test**

```ts
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { users, inviteCodes, sessions, wardrobes } from "@/server/db/schema";

test("creates auth and first-wardrobe records in Postgres", async () => {
  const client = new PGlite();
  const db = drizzle({ client });
  await migrate(db, { migrationsFolder: "drizzle" });
  expect(users).toBeDefined();
  expect(inviteCodes).toBeDefined();
  expect(sessions).toBeDefined();
  expect(wardrobes).toBeDefined();
  await client.close();
});
```

- [ ] **Step 3: Run the test and verify RED**

Run:

```bash
pnpm test tests/integration/db/foundation-schema.test.ts
```

Expected: FAIL because the schema and migration do not exist.

- [ ] **Step 4: Implement and migrate the schema**

Use UUID primary keys and timezone-aware timestamps. The central declarations must include:

```ts
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  onboardingComplete: boolean("onboarding_complete").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("users_email_unique").on(table.email)]);

export const inviteCodes = pgTable("invite_codes", {
  id: uuid("id").defaultRandom().primaryKey(),
  codeHash: text("code_hash").notNull(),
  maxUses: integer("max_uses").notNull().default(1),
  useCount: integer("use_count").notNull().default(0),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("invite_codes_hash_unique").on(table.codeHash)]);

export const sessions = pgTable("sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("sessions_token_hash_unique").on(table.tokenHash)]);
```

`user_settings` must contain `userId`, `city`, `hairLength`, and `hairTexture`. `wardrobes` must contain `userId`, `name`, and `sortOrder`. `uploads` must contain `userId`, `objectKey`, `contentType`, `sizeBytes`, `status`, `createdAt`, and `completedAt`. Add foreign keys with cascade deletion for user-owned phase-one records.

The database factory uses PGlite when `DATABASE_URL` is empty and `postgres` when it is set. Cache the connection on `globalThis` in development to survive hot reload.

- [ ] **Step 5: Verify the migration**

Run:

```bash
pnpm exec drizzle-kit generate
pnpm test tests/integration/db/foundation-schema.test.ts
pnpm typecheck
```

Expected: the migration test passes and Drizzle reports no schema drift.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml drizzle.config.ts drizzle src/server/env.ts src/server/db tests/integration/db
git commit -m "feat: add PostgreSQL-compatible data foundation"
```

---

### Task 4: Implement Invitation, Password, and Session Domain Logic

**Files:**
- Create: `src/features/auth/auth-types.ts`
- Create: `src/features/auth/auth-errors.ts`
- Create: `src/features/auth/crypto.ts`
- Create: `src/features/auth/auth-repository.ts`
- Create: `src/features/auth/auth-service.ts`
- Create: `src/server/db/drizzle-auth-repository.ts`
- Create: `scripts/create-invite.ts`
- Modify: `package.json`
- Create: `tests/helpers/in-memory-auth-repository.ts`
- Test: `tests/unit/auth/crypto.test.ts`
- Test: `tests/unit/auth/register.test.ts`
- Test: `tests/unit/auth/login.test.ts`

**Interfaces:**
- Produces: `registerWithInvite(input, deps): Promise<AuthResult>`.
- Produces: `loginWithPassword(input, deps): Promise<AuthResult>`.
- Produces: `logoutSession(rawToken, repo): Promise<void>`.
- Produces: `readSession(rawToken, repo, now): Promise<SessionUser | null>`.
- Produces: CLI `pnpm invite:create --uses 1 --days 30`.

- [ ] **Step 1: Install password and script dependencies**

```bash
pnpm add @node-rs/argon2
pnpm add -D tsx
```

Add this script:

```json
"invite:create": "tsx scripts/create-invite.ts"
```

- [ ] **Step 2: Write failing crypto and registration tests**

```ts
import { hashPassword, verifyPassword, hashInviteCode, newSessionToken } from "@/features/auth/crypto";

test("hashes secrets without storing their plaintext", async () => {
  const passwordHash = await hashPassword("wardrobe-pass-2026");
  expect(passwordHash).not.toContain("wardrobe-pass-2026");
  expect(await verifyPassword(passwordHash, "wardrobe-pass-2026")).toBe(true);
  expect(hashInviteCode("invite-raw", "pepper-value-with-32-characters")).not.toContain("invite-raw");
  expect(newSessionToken()).toMatch(/^[A-Za-z0-9_-]{40,}$/);
});
```

```ts
test("consumes one valid invite and returns a session", async () => {
  const pepper = "pepper-value-with-at-least-32-chars";
  const repo = new InMemoryAuthRepository({
    invite: {
      codeHash: hashInviteCode("valid", pepper),
      maxUses: 1,
      useCount: 0,
      expiresAt: new Date("2026-11-01T00:00:00Z"),
    },
  });
  const result = await registerWithInvite(
    { inviteCode: "valid", email: "MURO@example.com", password: "wardrobe-pass-2026", name: "Muro" },
    {
      repository: repo,
      invitePepper: pepper,
      now: () => new Date("2026-10-16T12:00:00Z"),
      createSessionToken: () => "fixed_session_token_with_more_than_40_characters_123",
    },
  );
  expect(result.user.email).toBe("muro@example.com");
  expect(result.sessionToken).toMatch(/^[A-Za-z0-9_-]{40,}$/);
  expect(repo.inviteUseCount).toBe(1);
});
```

Add separate tests that reject an expired invite, a revoked invite, an exhausted invite, duplicate email, password shorter than 10 characters, password longer than 128 characters, incorrect login password, and expired session.

- [ ] **Step 3: Run tests and verify RED**

```bash
pnpm test tests/unit/auth
```

Expected: FAIL because the auth modules do not exist.

- [ ] **Step 4: Implement minimal domain logic**

Use these types:

```ts
export type RegisterInput = {
  inviteCode: string;
  email: string;
  password: string;
  name: string;
};

export type AuthResult = {
  user: { id: string; email: string; name: string; onboardingComplete: boolean };
  sessionToken: string;
  sessionExpiresAt: Date;
};

export interface AuthRepository {
  register(input: {
    inviteHash: string;
    email: string;
    passwordHash: string;
    name: string;
    sessionHash: string;
    sessionExpiresAt: Date;
    now: Date;
  }): Promise<AuthResult["user"]>;
  findUserByEmail(email: string): Promise<(AuthResult["user"] & { passwordHash: string }) | null>;
  createSession(userId: string, tokenHash: string, expiresAt: Date): Promise<void>;
  findSession(tokenHash: string, now: Date): Promise<AuthResult["user"] | null>;
  deleteSession(tokenHash: string): Promise<void>;
}

export type AuthDependencies = {
  repository: AuthRepository;
  invitePepper: string;
  now: () => Date;
  createSessionToken: () => string;
};
```

Hash invitation codes with HMAC-SHA256 and `INVITE_PEPPER`. Generate a 32-byte random session token and store only its SHA-256 hash. `DrizzleAuthRepository.register` must lock and consume the invite, create the user, create empty settings, create a default wardrobe named `我的衣柜`, and create the session inside one transaction.

The test helper implements `AuthRepository` in memory, performs the same invite validity checks as the repository contract, and exposes `inviteUseCount` for assertions. The invite CLI generates 18 random bytes as base64url, stores only the HMAC hash, and prints the raw invite once together with its expiration and use limit.

- [ ] **Step 5: Verify auth behavior**

```bash
pnpm test tests/unit/auth
pnpm typecheck
pnpm lint
```

Expected: all auth tests pass without logging secrets.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml src/features/auth src/server/db/drizzle-auth-repository.ts scripts/create-invite.ts tests/helpers/in-memory-auth-repository.ts tests/unit/auth
git commit -m "feat: add invite-only authentication domain"
```

---

### Task 5: Expose Secure Auth Routes and Session Cookies

**Files:**
- Create: `src/server/http/origin.ts`
- Create: `src/server/http/json.ts`
- Create: `src/features/auth/session-cookie.ts`
- Create: `src/features/auth/current-user.ts`
- Create: `src/app/api/auth/register/route.ts`
- Create: `src/app/api/auth/login/route.ts`
- Create: `src/app/api/auth/logout/route.ts`
- Create: `src/app/api/auth/session/route.ts`
- Create: `tests/helpers/http-request.ts`
- Create: `tests/helpers/test-auth-route-deps.ts`
- Test: `tests/unit/http/origin.test.ts`
- Test: `tests/integration/auth/auth-routes.test.ts`

**Interfaces:**
- `POST /api/auth/register` accepts `{ inviteCode, email, password, name }`.
- `POST /api/auth/login` accepts `{ email, password }`.
- `POST /api/auth/logout` clears the session.
- `GET /api/auth/session` returns `{ user }` or HTTP 401.
- Produces: `getCurrentUser(): Promise<SessionUser | null>` for server components.
- Produces handler factories `createRegisterHandler`, `createLoginHandler`, `createLogoutHandler`, and `createSessionHandler`; route exports bind them to production dependencies.

- [ ] **Step 1: Write failing same-origin and route tests**

```ts
test("rejects a state-changing request from another origin", () => {
  const request = new Request("https://wardrobe.example/api/auth/logout", {
    method: "POST",
    headers: { origin: "https://attacker.example", host: "wardrobe.example" },
  });
  expect(() => assertSameOrigin(request)).toThrow("ORIGIN_MISMATCH");
});
```

```ts
test("registers with an invite and sets an http-only cookie", async () => {
  const postRegister = createRegisterHandler(testAuthRouteDeps());
  const response = await postRegister(jsonRequest("/api/auth/register", {
    inviteCode: "valid-code",
    email: "muro@example.com",
    password: "wardrobe-pass-2026",
    name: "Muro",
  }), testRouteDeps());
  expect(response.status).toBe(201);
  expect(response.headers.get("set-cookie")).toContain("HttpOnly");
  expect(response.headers.get("set-cookie")).toContain("SameSite=Lax");
});
```

Add route tests for invalid JSON, wrong password, invalid invite, duplicate email, logout, and session lookup.

- [ ] **Step 2: Run tests and verify RED**

```bash
pnpm test tests/unit/http/origin.test.ts tests/integration/auth/auth-routes.test.ts
```

Expected: FAIL because route handlers and helpers are absent.

- [ ] **Step 3: Implement request validation and cookies**

Use Zod at every boundary. Return this stable error shape:

```ts
export type ApiErrorBody = {
  error: {
    code: "INVALID_INPUT" | "INVALID_INVITE" | "EMAIL_IN_USE" | "INVALID_CREDENTIALS" | "UNAUTHORIZED" | "ORIGIN_MISMATCH";
    message: string;
    fields?: Record<string, string>;
  };
};
```

Cookie options:

```ts
export const sessionCookie = {
  name: "aiw_session",
  options: {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.SESSION_COOKIE_SECURE === "true",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  },
};
```

Every POST handler calls `assertSameOrigin` before reading credentials. Responses never echo invitation codes, password fields, password hashes, or session tokens in JSON.

`jsonRequest(path, body)` creates a same-origin Request at `http://localhost:3000${path}` with JSON headers. `testAuthRouteDeps()` returns the in-memory repository, fixed clock, deterministic session-token function, and `APP_URL=http://localhost:3000`, so route tests do not use global mutable state.

- [ ] **Step 4: Verify route security**

```bash
pnpm test tests/unit/http/origin.test.ts tests/integration/auth/auth-routes.test.ts
pnpm typecheck
pnpm lint
```

Expected: all tests pass and snapshots contain no secret values.

- [ ] **Step 5: Commit**

```bash
git add src/server/http src/features/auth/session-cookie.ts src/features/auth/current-user.ts src/app/api/auth tests/helpers/http-request.ts tests/helpers/test-auth-route-deps.ts tests/unit/http tests/integration/auth
git commit -m "feat: add secure authentication routes"
```

---

### Task 6: Build Registration, Login, Onboarding, and Protected Tabs

**Files:**
- Create: `src/features/auth/auth-form.tsx`
- Create: `src/features/auth/auth-form.module.css`
- Create: `src/features/auth/auth-client.ts`
- Create: `src/features/onboarding/onboarding-form.tsx`
- Create: `src/features/onboarding/onboarding-service.ts`
- Create: `src/app/(auth)/login/page.tsx`
- Create: `src/app/(auth)/register/page.tsx`
- Create: `src/app/(app)/app/layout.tsx`
- Create: `src/app/(onboarding)/app/onboarding/page.tsx`
- Create: `src/app/(app)/app/wardrobe/page.tsx`
- Create: `src/app/(app)/app/outfits/page.tsx`
- Create: `src/app/(app)/app/inspiration/page.tsx`
- Create: `src/app/(app)/app/profile/page.tsx`
- Create: `src/app/api/onboarding/route.ts`
- Modify: `src/app/page.tsx`
- Test: `tests/unit/auth/auth-form.test.tsx`
- Test: `tests/unit/onboarding/onboarding-form.test.tsx`
- Test: `tests/integration/onboarding/onboarding-route.test.ts`

**Interfaces:**
- Registration success redirects to `/app/onboarding`.
- Login success redirects to `/app/wardrobe` or `/app/onboarding` according to `onboardingComplete`.
- Protected app layout redirects anonymous users to `/login`.
- Completing onboarding stores `name`, `city`, `hairLength`, `hairTexture`, renames the default wardrobe, and marks onboarding complete.

- [ ] **Step 1: Write failing form behavior tests**

```tsx
test("shows actionable registration errors beside their fields", async () => {
  const user = userEvent.setup();
  render(<AuthForm mode="register" submit={async () => ({
    ok: false,
    error: { code: "INVALID_INVITE", message: "邀请码无效或已过期", fields: { inviteCode: "请检查邀请码" } },
  })} />);
  await user.type(screen.getByLabelText("邀请码"), "wrong");
  await user.type(screen.getByLabelText("邮箱"), "muro@example.com");
  await user.type(screen.getByLabelText("密码"), "wardrobe-pass-2026");
  await user.type(screen.getByLabelText("昵称"), "Muro");
  await user.click(screen.getByRole("button", { name: "创建账号" }));
  expect(await screen.findByText("请检查邀请码")).toBeInTheDocument();
});
```

```tsx
test("requires the four onboarding values", async () => {
  render(<OnboardingForm submit={vi.fn()} defaultName="Muro" />);
  expect(screen.getByLabelText("常用城市")).toBeRequired();
  expect(screen.getByLabelText("发长")).toBeRequired();
  expect(screen.getByLabelText("发质")).toBeRequired();
  expect(screen.getByLabelText("第一个衣柜名称")).toHaveValue("我的衣柜");
});
```

- [ ] **Step 2: Run tests and verify RED**

```bash
pnpm test tests/unit/auth/auth-form.test.tsx tests/unit/onboarding/onboarding-form.test.tsx tests/integration/onboarding/onboarding-route.test.ts
```

Expected: FAIL because the forms and route are missing.

- [ ] **Step 3: Implement the account screens and onboarding**

Use a shared card layout styled from the approved palette. Registration fields are `邀请码`, `邮箱`, `密码`, and `昵称`. Login fields are `邮箱` and `密码`. Buttons read `创建账号` and `登录`.

Onboarding fields use controlled select values:

```ts
export const hairLengths = ["短发", "中短发", "中长发", "长发"] as const;
export const hairTextures = ["偏直", "微卷", "卷发", "自然蓬松"] as const;
```

The four protected tab pages use `AppShell` and show honest empty states:

- 衣橱: `衣橱还是空的` / `下一阶段会在这里添加衣物`.
- 搭配: `还没有可搭配的衣物`.
- 灵感: `还没有灵感图`.
- 我的: show the current name, city, cloud sync state `已连接`, and a logout button.

The onboarding page has its own server layout that requires a session but allows incomplete profiles. The protected four-tab layout checks `getCurrentUser()` on the server, redirects anonymous requests to `/login`, and redirects incomplete users to `/app/onboarding`.

- [ ] **Step 4: Verify the UI and route behavior**

```bash
pnpm test tests/unit/auth/auth-form.test.tsx tests/unit/onboarding/onboarding-form.test.tsx tests/integration/onboarding/onboarding-route.test.ts
pnpm typecheck
pnpm lint
```

Expected: all tests pass; no page exposes the session token.

- [ ] **Step 5: Commit**

```bash
git add src/features/auth src/features/onboarding src/app tests/unit/auth tests/unit/onboarding tests/integration/onboarding
git commit -m "feat: add invite registration and onboarding UI"
```

---

### Task 7: Add User-Owned Object Storage Upload Contracts

**Files:**
- Create: `src/features/storage/storage-provider.ts`
- Create: `src/features/storage/local-storage-provider.ts`
- Create: `src/features/storage/s3-storage-provider.ts`
- Create: `src/features/storage/storage-service.ts`
- Create: `src/features/storage/storage-repository.ts`
- Create: `src/server/db/drizzle-storage-repository.ts`
- Create: `tests/helpers/fake-storage-provider.ts`
- Create: `src/app/api/uploads/route.ts`
- Create: `src/app/api/uploads/[uploadId]/content/route.ts`
- Create: `src/app/api/uploads/[uploadId]/complete/route.ts`
- Modify: `.gitignore`
- Test: `tests/unit/storage/storage-service.test.ts`
- Test: `tests/integration/storage/upload-routes.test.ts`

**Interfaces:**
- `POST /api/uploads` accepts `{ kind, contentType, sizeBytes }` and returns `{ uploadId, method, url, headers }`.
- `PUT /api/uploads/:uploadId/content` is enabled only for the local driver.
- `POST /api/uploads/:uploadId/complete` verifies the object and returns `{ uploadId, status: "completed" }`.
- `StorageProvider` exposes `createUploadTarget`, `verifyObject`, `openObject`, and `deleteObject`.

- [ ] **Step 1: Install S3-compatible dependencies**

```bash
pnpm add @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

- [ ] **Step 2: Write failing ownership and validation tests**

```ts
test("creates a private upload key scoped to the current user", async () => {
  const result = await createUpload(
    { kind: "wardrobe-original", contentType: "image/jpeg", sizeBytes: 1_200_000 },
    { userId: "user-a", provider: fakeProvider, repository: fakeRepository },
  );
  expect(result.objectKey).toMatch(/^users\/user-a\/wardrobe-original\//);
  expect(result.url).not.toContain("S3_SECRET_ACCESS_KEY");
});

test("rejects unsupported or oversized files", async () => {
  await expect(createUpload(
    { kind: "wardrobe-original", contentType: "application/pdf", sizeBytes: 20_000_000 },
    { userId: "user-a", provider: fakeProvider, repository: fakeRepository },
  )).rejects.toThrow("UNSUPPORTED_UPLOAD");
});
```

Add a route test proving `user-b` receives HTTP 404 when completing `user-a`'s upload.

- [ ] **Step 3: Run tests and verify RED**

```bash
pnpm test tests/unit/storage/storage-service.test.ts tests/integration/storage/upload-routes.test.ts
```

Expected: FAIL because storage contracts do not exist.

- [ ] **Step 4: Implement both providers and routes**

```ts
export type UploadKind = "wardrobe-original" | "inspiration" | "wear-photo";

export interface StorageProvider {
  createUploadTarget(input: {
    uploadId: string;
    objectKey: string;
    contentType: "image/jpeg" | "image/png" | "image/webp";
    sizeBytes: number;
  }): Promise<{ method: "PUT"; url: string; headers: Record<string, string> }>;
  verifyObject(objectKey: string, expectedSizeBytes: number): Promise<boolean>;
  openObject(objectKey: string): Promise<ReadableStream<Uint8Array>>;
  deleteObject(objectKey: string): Promise<void>;
}
```

Accept only JPEG, PNG, and WebP, with a 15 MB original file limit. Generate object keys as `users/{userId}/{kind}/{yyyy}/{mm}/{uuid}.{ext}`. The local provider writes beneath `.data/uploads` after resolving the final path and rejecting path traversal. The S3 provider returns a five-minute presigned PUT URL and uses private objects only.

The completion route loads the upload with both `uploadId` and current `userId`, verifies object size, and changes status from `pending` to `completed`. Repeating completion is idempotent.

- [ ] **Step 5: Verify storage security**

```bash
pnpm test tests/unit/storage/storage-service.test.ts tests/integration/storage/upload-routes.test.ts
pnpm typecheck
pnpm lint
```

Expected: supported files pass; oversized, unsupported, traversal, and cross-user cases fail with stable error codes.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml .gitignore src/features/storage src/server/db/drizzle-storage-repository.ts src/app/api/uploads tests/helpers/fake-storage-provider.ts tests/unit/storage tests/integration/storage
git commit -m "feat: add private object upload foundation"
```

---

### Task 8: Make the App Installable Without Caching Private Data

**Files:**
- Create: `src/app/manifest.ts`
- Create: `src/app/offline/page.tsx`
- Create: `src/components/pwa/service-worker-registration.tsx`
- Create: `src/components/pwa/install-guidance.tsx`
- Create: `src/components/pwa/install-guidance.module.css`
- Create: `public/sw.js`
- Create: `public/icons/source.svg`
- Create: `scripts/generate-icons.mjs`
- Create: `public/icons/icon-192.png`
- Create: `public/icons/icon-512.png`
- Create: `public/apple-touch-icon.png`
- Modify: `src/app/layout.tsx`
- Modify: `package.json`
- Test: `tests/unit/pwa/manifest.test.ts`
- Test: `tests/unit/pwa/service-worker-policy.test.ts`

**Interfaces:**
- Produces manifest `display: standalone`, `start_url: /`, and `theme_color: #F2EEE8`.
- Produces an offline page that never displays private cached data.
- Produces Android install prompt support and iOS “添加到主屏幕” instructions.

- [ ] **Step 1: Write failing manifest and cache-policy tests**

```ts
import manifest from "@/app/manifest";

test("declares a standalone AI Wardrobe app", () => {
  const value = manifest();
  expect(value.name).toBe("AI Wardrobe");
  expect(value.display).toBe("standalone");
  expect(value.theme_color).toBe("#F2EEE8");
  expect(value.icons).toEqual(expect.arrayContaining([
    expect.objectContaining({ sizes: "192x192" }),
    expect.objectContaining({ sizes: "512x512" }),
  ]));
});
```

```ts
test("service worker never caches API or authenticated app routes", async () => {
  const source = await readFile("public/sw.js", "utf8");
  expect(source).toContain("request.mode === 'navigate'");
  expect(source).toContain("url.pathname.startsWith('/app')");
  expect(source).toContain("url.pathname.startsWith('/api')");
});
```

- [ ] **Step 2: Run tests and verify RED**

```bash
pnpm test tests/unit/pwa
```

Expected: FAIL because the manifest and Service Worker are absent.

- [ ] **Step 3: Implement the privacy-preserving PWA layer**

The Service Worker install event caches only `/offline`, `/icons/icon-192.png`, `/icons/icon-512.png`, and `/apple-touch-icon.png`. Its fetch handler follows these rules:

```js
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/app')) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/offline')));
  }
});
```

Do not cache authenticated routes, API responses, image uploads, or database data. `ServiceWorkerRegistration` registers `/sw.js` only in production. `InstallGuidance` uses `beforeinstallprompt` where supported; on iOS standalone-capable Safari it explains `分享 → 添加到主屏幕` and remembers dismissal in local storage.

Generate the three PNG assets from a source SVG containing a simple sage wardrobe-door mark on the paper background. Use `sharp` only in the icon-generation script:

```bash
pnpm add -D sharp
node scripts/generate-icons.mjs
```

- [ ] **Step 4: Verify installability rules**

```bash
pnpm test tests/unit/pwa
pnpm build
```

Expected: tests pass, build succeeds, and no private route appears in the static cache list.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml src/app/manifest.ts src/app/offline src/components/pwa src/app/layout.tsx public scripts/generate-icons.mjs tests/unit/pwa
git commit -m "feat: add privacy-preserving PWA installation"
```

---

### Task 9: Add End-to-End Proof and Developer Handoff

**Files:**
- Create: `tests/e2e/auth-onboarding.spec.ts`
- Create: `tests/e2e/mobile-shell.spec.ts`
- Create: `tests/e2e/helpers/create-invite.ts`
- Create: `scripts/reset-e2e-db.ts`
- Create: `README.md`
- Create: `docs/development/local-setup.md`
- Create: `docs/development/phase-1-verification.md`
- Modify: `playwright.config.ts`

**Interfaces:**
- Proves: invite registration → onboarding → protected wardrobe shell → logout → login.
- Proves: unauthenticated protected-route access redirects to login.
- Proves: the 390-pixel mobile shell has four tabs and no horizontal overflow.

- [ ] **Step 1: Write the failing end-to-end flow**

```ts
test("registers by invitation and returns to the wardrobe after login", async ({ page }) => {
  const inviteCode = await createInvite({ uses: 1, days: 1 });
  await page.goto("/register");
  await page.getByLabel("邀请码").fill(inviteCode);
  await page.getByLabel("邮箱").fill("muro@example.com");
  await page.getByLabel("密码").fill("wardrobe-pass-2026");
  await page.getByLabel("昵称").fill("Muro");
  await page.getByRole("button", { name: "创建账号" }).click();
  await expect(page).toHaveURL(/\/app\/onboarding$/);
  await page.getByLabel("常用城市").fill("纽约");
  await page.getByLabel("发长").selectOption("中长发");
  await page.getByLabel("发质").selectOption("偏直");
  await page.getByLabel("第一个衣柜名称").fill("我的衣柜");
  await page.getByRole("button", { name: "开始使用" }).click();
  await expect(page.getByText("衣橱还是空的")).toBeVisible();
});
```

- [ ] **Step 2: Run the test and verify RED**

```bash
pnpm exec playwright install chromium
pnpm test:e2e tests/e2e/auth-onboarding.spec.ts
```

Expected: FAIL until the test database setup, invite helper, and app startup wiring are complete.

- [ ] **Step 3: Add isolated test startup and documentation**

Configure Playwright to start the app with:

```ts
webServer: {
  command: "pnpm exec tsx scripts/reset-e2e-db.ts && PGLITE_DATA_DIR=.data/e2e pnpm dev",
  url: "http://127.0.0.1:3000",
  reuseExistingServer: false,
}
```

`scripts/reset-e2e-db.ts` resolves the exact project-local `.data/e2e` directory, refuses any path outside `.data`, removes only that directory, and recreates it. The test helper inserts an invite through the same invite service used by `pnpm invite:create`; it must not hard-code a bypass. Add a second test using a 390×844 viewport that asserts `document.documentElement.scrollWidth === 390`, four navigation links are visible, and only the current tab has `aria-current="page"`.

Document these exact local commands:

```bash
cp .env.example .env.local
openssl rand -base64 32
pnpm install
pnpm invite:create --uses 1 --days 30
pnpm dev
```

Explain that the generated secret is placed in `INVITE_PEPPER`, raw invitations are shown once, PGlite data stays under `.data/`, and `.data/` must never be committed.

- [ ] **Step 4: Run the full phase-one verification**

```bash
pnpm test
pnpm test:e2e
pnpm typecheck
pnpm lint
pnpm build
git status --short
```

Expected: all checks pass, the build completes, and Git shows only the intended documentation and test artifacts before commit.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e scripts/reset-e2e-db.ts playwright.config.ts README.md docs/development
git commit -m "test: verify phase one account and PWA foundation"
```

---

## Phase 1 Completion Gate

Phase 1 is complete only when all of these are true:

- A fresh local checkout installs and builds on Node.js 22 with pnpm.
- A generated invitation can create exactly the allowed number of accounts.
- Passwords, invitation codes, and session tokens are never persisted in plaintext.
- Anonymous users cannot open protected tabs or another user's uploads.
- Registration, login, onboarding, logout, and returning login pass end to end.
- The UI matches the approved paper/sage/rose visual language at 390 pixels and remains usable from 320 to 480 pixels.
- The app has a valid manifest, icons, offline fallback, and production Service Worker registration.
- The Service Worker does not cache authenticated HTML, API data, or user images.
- PGlite local development and production PostgreSQL use the same Drizzle schema and migrations.
- The full test, typecheck, lint, end-to-end, and production build commands exit 0.

