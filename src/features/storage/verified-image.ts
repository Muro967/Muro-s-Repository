import "server-only";

import sharp from "sharp";

import {
  MAX_UPLOAD_BYTES,
  type StorageProvider,
  type UploadContentType,
} from "./storage-provider";

export type CompletedImageUpload = {
  id: string;
  objectKey: string;
  contentType: UploadContentType;
  sizeBytes: number;
};

export type VerifiedImage = CompletedImageUpload & {
  width: number;
  height: number;
};

export class ImageVerificationError extends Error {
  constructor() {
    super("INVALID_IMAGE");
    this.name = "ImageVerificationError";
  }
}

function assertStaticPng(bytes: Buffer): void {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!bytes.subarray(0, 8).equals(signature)) throw new ImageVerificationError();
  let offset = 8;
  let ended = false;
  while (offset < bytes.length) {
    const remaining = bytes.length - offset;
    if (remaining < 12) throw new ImageVerificationError();
    const length = bytes.readUInt32BE(offset);
    if (length > remaining - 12) throw new ImageVerificationError();
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    if (type === "acTL" || type === "fcTL" || type === "fdAT") {
      throw new ImageVerificationError();
    }
    offset += length + 12;
    if (ended) throw new ImageVerificationError();
    if (type === "IEND") {
      if (length !== 0) throw new ImageVerificationError();
      ended = true;
    }
  }
  if (!ended) throw new ImageVerificationError();
}

export async function verifyCompletedImage(
  upload: CompletedImageUpload,
  provider: StorageProvider,
): Promise<VerifiedImage> {
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const stream = await provider.openObject(upload.objectKey);
    reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_UPLOAD_BYTES || size > upload.sizeBytes) {
        throw new ImageVerificationError();
      }
      chunks.push(value);
    }
    if (size !== upload.sizeBytes) throw new ImageVerificationError();
    const bytes = Buffer.concat(chunks);
    if (upload.contentType === "image/png") assertStaticPng(bytes);
    const options = {
      limitInputPixels: 40_000_000,
      failOn: "warning" as const,
      animated: true,
    };
    const metadata = await sharp(bytes, options).metadata();
    const mime = {
      jpeg: "image/jpeg",
      png: "image/png",
      webp: "image/webp",
    }[metadata.format as string];
    if (
      !mime
      || mime !== upload.contentType
      || !metadata.width
      || !metadata.height
      || metadata.width > 12_000
      || metadata.height > 12_000
      || metadata.width * metadata.height > 40_000_000
      || (metadata.pages ?? 1) !== 1
    ) {
      throw new ImageVerificationError();
    }
    await sharp(bytes, options).raw().toBuffer();
    return { ...upload, width: metadata.width, height: metadata.height };
  } catch {
    throw new ImageVerificationError();
  } finally {
    if (reader) {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  }
}
