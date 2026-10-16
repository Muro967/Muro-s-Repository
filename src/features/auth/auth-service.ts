import { AuthError } from "./auth-errors";
import {
  hashInviteCode,
  hashPassword,
  hashSessionToken,
  verifyPassword,
} from "./crypto";
import type { AuthRepository } from "./auth-repository";
import type {
  AuthDependencies,
  AuthResult,
  LoginInput,
  RegisterInput,
  SessionUser,
} from "./auth-types";

const sessionLifetimeMilliseconds = 30 * 24 * 60 * 60 * 1_000;
const dummyPassword = "not-a-real-account-password";
let dummyPasswordHash: Promise<string> | undefined;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function validatePassword(password: string): void {
  const length = Array.from(password).length;
  if (length < 10 || length > 128) {
    throw new AuthError("INVALID_PASSWORD");
  }
}

function newSession(dependencies: AuthDependencies) {
  const sessionToken = dependencies.createSessionToken();
  if (!/^[A-Za-z0-9_-]{40,}$/.test(sessionToken)) {
    throw new Error("Session token generator returned an invalid token");
  }
  const sessionExpiresAt = new Date(
    dependencies.now().getTime() + sessionLifetimeMilliseconds,
  );
  return {
    sessionToken,
    sessionHash: hashSessionToken(sessionToken),
    sessionExpiresAt,
  };
}

async function verifyUnknownUserPassword(password: string): Promise<void> {
  dummyPasswordHash ??= hashPassword(dummyPassword);
  await verifyPassword(await dummyPasswordHash, password);
}

export async function registerWithInvite(
  input: RegisterInput,
  dependencies: AuthDependencies,
): Promise<AuthResult> {
  validatePassword(input.password);
  const email = normalizeEmail(input.email);
  const now = dependencies.now();
  const passwordHash = await hashPassword(input.password);
  const { sessionToken, sessionHash, sessionExpiresAt } = newSession({
    ...dependencies,
    now: () => now,
  });
  const user = await dependencies.repository.register({
    inviteHash: hashInviteCode(input.inviteCode, dependencies.invitePepper),
    email,
    passwordHash,
    name: input.name.trim(),
    sessionHash,
    sessionExpiresAt,
    now,
  });

  return { user, sessionToken, sessionExpiresAt };
}

export async function loginWithPassword(
  input: LoginInput,
  dependencies: AuthDependencies,
): Promise<AuthResult> {
  const user = await dependencies.repository.findUserByEmail(
    normalizeEmail(input.email),
  );
  if (!user) {
    await verifyUnknownUserPassword(input.password);
    throw new AuthError("INVALID_CREDENTIALS");
  }

  if (!(await verifyPassword(user.passwordHash, input.password))) {
    throw new AuthError("INVALID_CREDENTIALS");
  }

  const sessionUser: SessionUser = {
    id: user.id,
    email: user.email,
    name: user.name,
    onboardingComplete: user.onboardingComplete,
  };
  const { sessionToken, sessionHash, sessionExpiresAt } = newSession(dependencies);
  await dependencies.repository.createSession(
    user.id,
    sessionHash,
    sessionExpiresAt,
  );

  return { user: sessionUser, sessionToken, sessionExpiresAt };
}

export async function logoutSession(
  rawToken: string,
  repository: AuthRepository,
): Promise<void> {
  await repository.deleteSession(hashSessionToken(rawToken));
}

export async function readSession(
  rawToken: string,
  repository: AuthRepository,
  now: Date,
): Promise<SessionUser | null> {
  return repository.findSession(hashSessionToken(rawToken), now);
}
