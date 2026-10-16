export type AuthErrorCode =
  | "INVALID_INVITE"
  | "EMAIL_ALREADY_REGISTERED"
  | "INVALID_PASSWORD"
  | "INVALID_CREDENTIALS";

export class AuthError extends Error {
  readonly code: AuthErrorCode;

  constructor(code: AuthErrorCode) {
    super(code);
    this.name = "AuthError";
    this.code = code;
  }
}
