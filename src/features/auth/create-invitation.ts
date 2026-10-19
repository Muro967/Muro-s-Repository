import { randomBytes } from "node:crypto";
import { hashInviteCode } from "./crypto";

export async function createInvitation(
  input: { uses: number; days: number },
  dependencies: {
    repository: { createInvite(input: { codeHash: string; maxUses: number; expiresAt: Date }): Promise<void> };
    pepper: string;
    now?: Date;
    generateCode?: () => string;
  },
): Promise<string> {
  const code = dependencies.generateCode?.() ?? randomBytes(18).toString("base64url");
  try {
    await dependencies.repository.createInvite({
      codeHash: hashInviteCode(code, dependencies.pepper),
      maxUses: input.uses,
      expiresAt: new Date((dependencies.now ?? new Date()).getTime() + input.days * 86_400_000),
    });
  } catch {
    throw new Error("Invitation creation failed");
  }
  return code;
}
