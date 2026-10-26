// @vitest-environment node

import { DrizzleProcessingJobRepository } from "@/server/db/drizzle-processing-job-repository";
import { inspirationFixture } from "../../helpers/inspiration-fixture";

vi.mock("server-only", () => ({}));

test("deduplicates queued work and merges analysis without overwriting confirmed fields", async () => {
  const f = await inspirationFixture();
  try {
    const upload = await f.upload();
    const inspiration = await f.service.create(f.user.id, { uploadId: upload.id, colorNames: ["人工米白"], confirmedFields: ["colorNames"] });
    const repository = new DrizzleProcessingJobRepository(f.database);
    const now = new Date("2026-10-20T00:00:00.000Z");
    const first = await repository.enqueue(f.user.id, inspiration.id, "openai", now);
    expect((await repository.enqueue(f.user.id, inspiration.id, "openai", now)).id).toBe(first.id);
    const claim = await repository.claim(first.id, now);
    expect(claim).toMatchObject({ attempts: 1, status: "running", inputVersion: 1 });
    await repository.succeed(first.id, "openai", { styleTags: ["极简"], colorNames: ["AI 灰色"], silhouettes: [], keyItems: [], combinations: [], formality: null }, now);
    expect(await f.repository.find(f.user.id, inspiration.id)).toMatchObject({ styleTags: ["极简"], colorNames: ["人工米白"], analysisStatus: "ready", analysisSource: "openai", version: 2 });
  } finally { await f.client.close(); }
});
