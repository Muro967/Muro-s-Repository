// @vitest-environment node

import sharp from "sharp";

import { createInspirationService } from "@/features/inspiration/inspiration-service";
import {
  InspirationError,
  type CompletedInspirationUpload,
  type InspirationRepository,
} from "@/features/inspiration/inspiration-repository";
import type {
  EditableInspiration,
  EditableInspirationPatch,
  InspirationDetail,
} from "@/features/inspiration/inspiration-types";
import { FakeStorageProvider } from "../../helpers/fake-storage-provider";

vi.mock("server-only", () => ({}));

const userId = "10000000-0000-4000-8000-000000000001";
const uploadId = "20000000-0000-4000-8000-000000000001";
const inspirationId = "30000000-0000-4000-8000-000000000001";

function detail(overrides: Partial<InspirationDetail> = {}): InspirationDetail {
  return {
    id: inspirationId,
    imageUrl: `/api/inspirations/${inspirationId}/image`,
    name: "",
    styleTags: [],
    colorNames: [],
    silhouettes: [],
    keyItems: [],
    combinations: [],
    formality: null,
    notes: null,
    confirmedFields: [],
    analysisStatus: "manual",
    analysisSource: null,
    analysisErrorCode: null,
    version: 1,
    createdAt: "2026-10-19T00:00:00.000Z",
    updatedAt: "2026-10-19T00:00:00.000Z",
    ...overrides,
  };
}

class FakeRepository implements InspirationRepository {
  upload: CompletedInspirationUpload | null = null;
  saved = detail();
  list = vi.fn(async () => [this.saved]);
  find = vi.fn(async () => this.saved);
  findCompletedUpload = vi.fn(async () => this.upload);
  create = vi.fn(async (_userId: string, _uploadId: string, _image: unknown, input: EditableInspiration) => {
    this.saved = detail({ ...input });
    return this.saved;
  });
  update = vi.fn(async (_userId: string, _id: string, _version: number, patch: EditableInspirationPatch) => {
    this.saved = detail({ ...this.saved, ...patch, version: this.saved.version + 1 });
    return this.saved;
  });
  softDelete = vi.fn(async () => {});
  findPrivateImage = vi.fn(async () => this.upload);
}

async function setup() {
  const bytes = await sharp({
    create: { width: 2, height: 3, channels: 3, background: "gray" },
  }).jpeg().toBuffer();
  const provider = new FakeStorageProvider();
  const repository = new FakeRepository();
  repository.upload = {
    id: uploadId,
    objectKey: "private/inspiration.jpg",
    contentType: "image/jpeg",
    sizeBytes: bytes.length,
  };
  provider.objects.set(repository.upload.objectKey, bytes);
  return {
    bytes,
    provider,
    repository,
    service: createInspirationService({
      repository,
      provider,
      now: () => new Date("2026-10-19T00:00:00.000Z"),
    }),
  };
}

test("creates only after a completed owned image passes a full decode", async () => {
  const f = await setup();
  await expect(f.service.create(userId, {
    uploadId,
    name: "  秋日通勤  ",
    styleTags: [" 法式 ", "法式"],
  })).resolves.toMatchObject({
    id: inspirationId,
    imageUrl: `/api/inspirations/${inspirationId}/image`,
    name: "秋日通勤",
    styleTags: ["法式"],
  });
  expect(f.repository.create).toHaveBeenCalledWith(
    userId,
    uploadId,
    expect.objectContaining({ width: 2, height: 3 }),
    expect.objectContaining({ name: "秋日通勤" }),
  );
});

test("hides missing, pending, wrong-kind and foreign upload identities", async () => {
  const f = await setup();
  f.repository.upload = null;
  await expect(f.service.create(userId, { uploadId })).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(f.repository.create).not.toHaveBeenCalled();
});

test("rejects corrupt, animated and metadata-mismatched images before persistence", async () => {
  const f = await setup();
  const animated = await sharp(
    Buffer.concat([Buffer.alloc(12), Buffer.alloc(12, 255)]),
    { raw: { width: 2, height: 4, channels: 3, pageHeight: 2 } },
  ).webp({ loop: 0 }).toBuffer();

  for (const [data, contentType] of [
    [Buffer.from("not-an-image"), "image/jpeg"],
    [animated, "image/webp"],
    [f.bytes, "image/png"],
  ] as const) {
    f.repository.upload = {
      id: uploadId,
      objectKey: "private/invalid",
      contentType,
      sizeBytes: data.length,
    };
    f.provider.objects.set("private/invalid", data);
    await expect(f.service.create(userId, { uploadId })).rejects.toMatchObject({ code: "INVALID_IMAGE" });
  }
  expect(f.repository.create).not.toHaveBeenCalled();
});

test("validates ids, strict input and expected versions before repository calls", async () => {
  const f = await setup();
  for (const operation of [
    () => f.service.create(userId, { uploadId: "bad" }),
    () => f.service.create(userId, { uploadId, analysisStatus: "ready" }),
    () => f.service.update(userId, "bad", { expectedVersion: 1, name: "A" }),
    () => f.service.update(userId, inspirationId, { expectedVersion: 0, name: "A" }),
    () => f.service.update(userId, inspirationId, { expectedVersion: 1, userId }),
    () => f.service.remove(userId, inspirationId, { expectedVersion: 1, extra: true }),
  ]) {
    await expect((async () => { await operation(); })()).rejects.toMatchObject({
      name: InspirationError.name,
      code: expect.stringMatching(/INVALID_INPUT|NOT_FOUND/),
    });
  }
});

test("passes normalized patches, versioned deletes and private lookups through", async () => {
  const f = await setup();
  await expect(f.service.list(userId)).resolves.toEqual([f.repository.saved]);
  await expect(f.service.read(userId, inspirationId)).resolves.toEqual(f.repository.saved);
  await f.service.update(userId, inspirationId, {
    expectedVersion: 1,
    colorNames: [" 米白 ", "米白"],
  });
  expect(f.repository.update).toHaveBeenCalledWith(
    userId,
    inspirationId,
    1,
    { colorNames: ["米白"] },
  );
  await f.service.remove(userId, inspirationId, { expectedVersion: 2 });
  expect(f.repository.softDelete).toHaveBeenCalledWith(
    userId,
    inspirationId,
    2,
    new Date("2026-10-19T00:00:00.000Z"),
  );
  await expect(f.service.findPrivateImage(userId, inspirationId)).resolves.toEqual(f.repository.upload);
});
