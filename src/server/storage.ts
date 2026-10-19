import "server-only";
import { LocalStorageProvider } from "@/features/storage/local-storage-provider";
import { S3StorageProvider } from "@/features/storage/s3-storage-provider";
import { createUploadHandlers, type UploadRouteDependencies } from "@/features/storage/upload-routes";
import type { StorageProvider } from "@/features/storage/storage-provider";
import { getProductionAuthRouteDependencies } from "./auth";
import { getDb } from "./db/client";
import { DrizzleStorageRepository } from "./db/drizzle-storage-repository";
import { apiError } from "./http/json";

export function createStorageProvider(environment: Record<string, string | undefined> = process.env): StorageProvider {
  const driver = environment.STORAGE_DRIVER ?? "local";
  if (driver === "local") {
    const directory = environment.LOCAL_STORAGE_DIR ?? ".data/uploads";
    if (!directory.trim()) throw new Error("Invalid storage configuration");
    return new LocalStorageProvider(directory);
  }
  if (driver !== "s3") throw new Error("Invalid storage configuration");
  return new S3StorageProvider({ endpoint: environment.S3_ENDPOINT || undefined, region: environment.S3_REGION ?? "auto",
    bucket: environment.S3_BUCKET ?? "", accessKeyId: environment.S3_ACCESS_KEY_ID ?? "", secretAccessKey: environment.S3_SECRET_ACCESS_KEY ?? "" });
}
export function getProductionUploadDependencies(): UploadRouteDependencies {
  const auth = getProductionAuthRouteDependencies();
  return { appUrl: auth.appUrl, authRepository: auth.repository, now: auth.now,
    repository: new DrizzleStorageRepository(getDb()), provider: createStorageProvider() };
}
export function bindProductionUploadHandler(action: "create" | "put" | "complete") {
  return async (request: Request, context?: { params: Promise<{ uploadId: string }> }): Promise<Response> => {
    try {
      const handlers = createUploadHandlers(getProductionUploadDependencies());
      const uploadId = context ? (await context.params).uploadId : undefined;
      return await handlers[action](request, uploadId);
    } catch { return apiError("INTERNAL_ERROR", 500, "The request could not be completed."); }
  };
}
