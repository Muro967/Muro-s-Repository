import "server-only";

import { z } from "zod";

import type { StorageProvider } from "../storage/storage-provider";
import { verifyCompletedImage } from "../storage/verified-image";
import {
  InspirationError,
  type InspirationRepository,
} from "./inspiration-repository";
import {
  parseEditableInspiration,
  parseInspirationPatch,
} from "./inspiration-validation";

const expectedVersionSchema = z.number().int().min(1);
const identifierSchema = z.uuid();

function record(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new InspirationError("INVALID_INPUT");
  }
  return input as Record<string, unknown>;
}

function parseCreate(input: unknown) {
  const value = record(input);
  const uploadId = identifierSchema.safeParse(value.uploadId);
  if (!uploadId.success) throw new InspirationError("INVALID_INPUT");
  const { uploadId: _uploadId, ...editable } = value;
  void _uploadId;
  try {
    return { uploadId: uploadId.data, editable: parseEditableInspiration(editable) };
  } catch {
    throw new InspirationError("INVALID_INPUT");
  }
}

function parseUpdate(input: unknown) {
  const value = record(input);
  const expectedVersion = expectedVersionSchema.safeParse(value.expectedVersion);
  if (!expectedVersion.success) throw new InspirationError("INVALID_INPUT");
  const { expectedVersion: _expectedVersion, ...editable } = value;
  void _expectedVersion;
  try {
    return {
      expectedVersion: expectedVersion.data,
      patch: parseInspirationPatch(editable),
    };
  } catch {
    throw new InspirationError("INVALID_INPUT");
  }
}

function parseDelete(input: unknown) {
  const parsed = z.strictObject({
    expectedVersion: expectedVersionSchema,
  }).safeParse(input);
  if (!parsed.success) throw new InspirationError("INVALID_INPUT");
  return parsed.data;
}

export function inspirationResourceId(id: string) {
  if (!identifierSchema.safeParse(id).success) throw new InspirationError("NOT_FOUND");
  return id;
}

export type InspirationServiceDependencies = {
  repository: InspirationRepository;
  provider: StorageProvider;
  now: () => Date;
};

export function createInspirationService({
  repository,
  provider,
  now,
}: InspirationServiceDependencies) {
  return {
    list(userId: string) {
      return repository.list(userId);
    },

    async read(userId: string, id: string) {
      const inspiration = await repository.find(userId, inspirationResourceId(id));
      if (!inspiration) throw new InspirationError("NOT_FOUND");
      return inspiration;
    },

    async create(userId: string, input: unknown) {
      const parsed = parseCreate(input);
      const upload = await repository.findCompletedUpload(userId, parsed.uploadId);
      if (!upload) throw new InspirationError("NOT_FOUND");
      const image = await verifyCompletedImage(upload, provider).catch(() => {
        throw new InspirationError("INVALID_IMAGE");
      });
      return repository.create(userId, parsed.uploadId, image, parsed.editable);
    },

    update(userId: string, id: string, input: unknown) {
      const parsed = parseUpdate(input);
      return repository.update(
        userId,
        inspirationResourceId(id),
        parsed.expectedVersion,
        parsed.patch,
      );
    },

    async remove(userId: string, id: string, input: unknown) {
      const parsed = parseDelete(input);
      await repository.softDelete(
        userId,
        inspirationResourceId(id),
        parsed.expectedVersion,
        now(),
      );
    },

    findPrivateImage(userId: string, id: string) {
      return repository.findPrivateImage(userId, inspirationResourceId(id));
    },
  };
}
