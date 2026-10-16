import { hash, verify } from "@node-rs/argon2";
import type { Algorithm } from "@node-rs/argon2";
import { createHash, createHmac, randomBytes } from "node:crypto";

const argon2Options = {
  algorithm: 2 as Algorithm,
  memoryCost: 19_456,
  timeCost: 2,
  outputLen: 32,
  parallelism: 1,
} as const;

export async function hashPassword(password: string): Promise<string> {
  return hash(password, argon2Options);
}

export async function verifyPassword(
  passwordHash: string,
  password: string,
): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

export function hashInviteCode(inviteCode: string, pepper: string): string {
  return createHmac("sha256", pepper).update(inviteCode).digest("hex");
}

export function newSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}
