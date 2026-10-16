import { z } from "zod";

const optionalDatabaseUrl = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  z
    .string()
    .url()
    .regex(/^postgres(?:ql)?:\/\//, "DATABASE_URL must use PostgreSQL")
    .optional(),
);

const optionalDataDirectory = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().min(1).optional(),
);

const serverEnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  DATABASE_URL: optionalDatabaseUrl,
  PGLITE_DATA_DIR: optionalDataDirectory,
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function readServerEnv(
  environment: Record<string, string | undefined> = process.env,
): ServerEnv {
  const result = serverEnvSchema.safeParse({
    NODE_ENV: environment.NODE_ENV,
    DATABASE_URL: environment.DATABASE_URL,
    PGLITE_DATA_DIR: environment.PGLITE_DATA_DIR,
  });

  if (!result.success) {
    throw new Error("Invalid server environment configuration");
  }

  return result.data;
}

export function readInvitePepper(
  environment: Record<string, string | undefined> = process.env,
): string {
  const result = z.string().min(32).safeParse(environment.INVITE_PEPPER);
  if (!result.success) {
    throw new Error("Invalid invitation configuration");
  }
  return result.data;
}
