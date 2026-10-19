import type { StorageProvider, UploadTargetInput } from "@/features/storage/storage-provider";

export class FakeStorageProvider implements StorageProvider {
  readonly objects = new Map<string, Uint8Array>();
  async createUploadTarget(input: UploadTargetInput) {
    return { method: "PUT" as const, url: `/api/uploads/${input.uploadId}/content`, headers: { "content-type": input.contentType, "content-length": String(input.sizeBytes) } };
  }
  async verifyObject(key: string, size: number) { return this.objects.get(key)?.byteLength === size; }
  async openObject(key: string) {
    const value = this.objects.get(key);
    if (!value) throw new Error("UPLOAD_NOT_FOUND");
    return new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(value); controller.close(); } });
  }
  async deleteObject(key: string) { this.objects.delete(key); }
}
