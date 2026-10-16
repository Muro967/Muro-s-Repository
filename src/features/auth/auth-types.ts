export type RegisterInput = {
  inviteCode: string;
  email: string;
  password: string;
  name: string;
};

export type LoginInput = {
  email: string;
  password: string;
};

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  onboardingComplete: boolean;
};

export type AuthResult = {
  user: SessionUser;
  sessionToken: string;
  sessionExpiresAt: Date;
};

export type AuthDependencies = {
  repository: import("./auth-repository").AuthRepository;
  invitePepper: string;
  now: () => Date;
  createSessionToken: () => string;
};
