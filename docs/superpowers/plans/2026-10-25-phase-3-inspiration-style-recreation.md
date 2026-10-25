# AI Wardrobe 第三阶段实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** 交付可运行的灵感墙、可编辑风格说明书和只使用用户现有衣物的灵感复刻，并为 OpenAI GPT、通义千问和未来 ChatGPT 登录保留可替换 AI 边界。

**Architecture:** 在现有 Next.js 全栈 PWA 中新增 inspiration、style-profile、recreation 和 ai 四个清晰边界。所有持久化操作通过带 userId 的服务与仓储完成，图片继续使用私有上传 Provider；无 Key 时运行确定性规则，配置 AI_PROVIDER 后由服务端适配器处理真实识图与建议，业务层永远再次校验模型返回的编号。

**Tech Stack:** Next.js 16.4 App Router、React 19、TypeScript 6、Drizzle ORM、PostgreSQL/PGlite、Zod、Sharp、Vitest、Testing Library、Playwright、原生 fetch。

## Global Constraints

- 界面语言使用简体中文；品牌保持 AI Wardrobe，标语保持“穿你所有，爱你所穿”。
- 视觉必须沿用 docs/references/ai-wardrobe-sketch 中的米白、灰绿、豆沙色方案和两列灵感瀑布流。
- 主要验收宽度是 390 CSS 像素，并支持 320 至 480 CSS 像素；触控目标至少 44×44 CSS 像素，键盘焦点可见。
- 灵感图只接受 JPEG、PNG、WebP，最大 15 MB；继续明确说明 HEIC 暂不支持。
- 五张有效灵感之前只显示还差几张，不生成百分比画像。
- 规则预览必须明确标识，绝不能冒充 AI 看图结果。
- 复刻只可使用当前用户、status=active、deletedAt=null 的真实衣物；草稿、观察中、已处置、回收站和其他账号衣物全部排除。
- API Key、对象存储键、图片二进制、邮箱、邀请码、会话和私密备注不得进入浏览器数据或普通日志。
- AI_PROVIDER 未明确配置时必须保持 none，不因检测到某个 Key 而自动发起收费调用。
- OpenAI 与通义千问适配器返回同一领域结构；模型名属于部署配置，不硬编码“最新模型”。
- “通过 ChatGPT 登录”只保留扩展边界，不作为本阶段验收条件，也不得读取用户既有 ChatGPT 对话或记忆。
- 用户人工确认的灵感字段和人工编辑的风格说明书不得被异步结果静默覆盖。
- GET 私有数据不缓存；写请求继续验证登录、同源和资源归属。
- 每个任务使用测试驱动方式完成，保持零 ESLint 警告，并在任务边界创建本地 Git 提交。

## 文件结构

新领域代码分别放在 src/features/inspiration、src/features/style、src/features/recreation 和 src/features/ai。领域类型、校验和纯规则不依赖 Next.js；带数据库、密钥、对象存储和模型调用的模块使用 server-only。生产依赖组装继续放在 src/server，Drizzle 实现在 src/server/db，App Router 的 route.ts 只负责绑定生产处理器。

页面使用以下稳定路径：

- /app/inspiration：灵感墙
- /app/inspiration/new：添加灵感
- /app/inspiration/[inspirationId]：灵感详情与编辑
- /app/inspiration/style：风格说明书
- /app/inspiration/[inspirationId]/recreate：发起复刻
- /app/inspiration/[inspirationId]/recreate/[recreationId]：复刻结果

API 使用以下稳定路径：

- /api/inspirations
- /api/inspirations/[inspirationId]
- /api/inspirations/[inspirationId]/image
- /api/inspirations/[inspirationId]/analysis
- /api/style-profile
- /api/style-rules
- /api/style-rules/[ruleId]
- /api/inspirations/[inspirationId]/recreations
- /api/recreations/[recreationId]

---

### Task 1: 第三阶段数据库结构与无损升级

**Files:**
- Modify: src/server/db/schema.ts
- Create: drizzle/0002_inspiration_style.sql
- Create: drizzle/meta/0002_snapshot.json
- Modify: drizzle/meta/_journal.json
- Create: tests/integration/db/phase-3-schema.test.ts
- Create: tests/integration/db/phase-3-upgrade.test.ts

**Interfaces:**
- Produces: inspirations、styleProfiles、styleRules、inspirationRecreations、inspirationRecreationItems、processingJobs 六张表及其 Drizzle 导出。
- Consumes: users、uploads、items 已有的 userId+id 唯一键和租户复合外键模式。

- [ ] **Step 1: 写数据库边界失败测试**

在 phase-3-schema.test.ts 建立两个用户、各自上传和衣物，覆盖以下断言：

~~~ts
await expect(sql("insert inspiration A with user B upload")).rejects.toThrow(/foreign key constraint/);
await expect(sql("insert recreation item A with user B item")).rejects.toThrow(/foreign key constraint/);
await expect(sql("bind one upload to a second inspiration")).rejects.toThrow(/unique constraint/);
await expect(sql("insert analysis status unknown")).rejects.toThrow(/check constraint/);
await expect(sql("insert style rule type unknown")).rejects.toThrow(/check constraint/);
await expect(sql("insert processing job attempts 3")).rejects.toThrow(/check constraint/);
~~~

同时验证 inspirations 的 JSON 字段只能为数组、version 从 1 开始、删除记录仍保留图片关系，以及删除用户会级联清理第三阶段数据。

- [ ] **Step 2: 运行数据库测试并确认失败**

Run: pnpm vitest run tests/integration/db/phase-3-schema.test.ts tests/integration/db/phase-3-upgrade.test.ts

Expected: FAIL，因为第三阶段表和迁移尚不存在。

- [ ] **Step 3: 在 Drizzle schema 中定义稳定枚举和表**

使用下列稳定值，并为每个枚举添加数据库 check：

~~~ts
export const inspirationAnalysisStatuses = ["manual", "queued", "running", "ready", "failed"] as const;
export const inspirationAnalysisSources = ["openai", "qwen"] as const;
export const styleRuleTypes = ["color", "style", "fit", "material", "formality", "text"] as const;
export const recreationModes = ["rules", "openai", "qwen"] as const;
export const processingJobStatuses = ["queued", "running", "succeeded", "failed"] as const;
~~~

inspirations 保存 uploadId、名称、styleTags、colorNames、silhouettes、keyItems、combinations、formality、notes、confirmedFields、analysisStatus、analysisSource、analysisErrorCode、analysisAttempts、version、deletedAt 和时间戳。uploadId 使用 userId+uploadId 复合外键并唯一。

styleProfiles 以 userId 为主键，保存 preferredColors、preferredSilhouettes、commonCombinations、formalityTendency、likedExamples、source、inputVersion、manuallyEdited、pendingSuggestion 和时间戳。styleRules 使用 userId+id 唯一键。

inspirationRecreations 使用 userId+inspirationId 复合外键；子表使用 userId+recreationId 和 userId+itemId 两个复合外键。processingJobs 保存 targetInspirationId、inputVersion、status、attempts、nextAttemptAt、leaseExpiresAt、errorCode 和时间戳，并限制 attempts 在 0 至 2。

- [ ] **Step 4: 生成并检查前向迁移**

Run: pnpm exec drizzle-kit generate --name inspiration_style

将生成文件规范化为 drizzle/0002_inspiration_style.sql，确认迁移只新增对象，不改写或删除已有账号、衣柜、衣物、处置或上传数据。

- [ ] **Step 5: 验证从第二阶段数据库升级**

phase-3-upgrade.test.ts 先只应用 0000 和 0001，插入现有用户、衣物和 inspiration 类型上传，再应用完整迁移两次。断言旧数据原样保留、新表为空、同一数据库重复启动不重复写入。

Run: pnpm vitest run tests/integration/db/phase-3-schema.test.ts tests/integration/db/phase-3-upgrade.test.ts

Expected: PASS。

- [ ] **Step 6: 运行既有数据库回归并提交**

Run: pnpm vitest run tests/integration/db tests/integration/items tests/integration/idle

Expected: PASS。

~~~bash
git add src/server/db/schema.ts drizzle tests/integration/db
git commit -m "feat: add inspiration and style schema"
~~~

### Task 2: 灵感领域类型、校验与人工内容保护

**Files:**
- Create: src/features/inspiration/inspiration-types.ts
- Create: src/features/inspiration/inspiration-validation.ts
- Create: src/features/inspiration/inspiration-analysis.ts
- Create: tests/unit/inspiration/inspiration-validation.test.ts
- Create: tests/unit/inspiration/inspiration-analysis.test.ts

**Interfaces:**
- Produces: InspirationDetail、EditableInspiration、InspirationAnalysis、parseInspirationPatch、isValidInspiration、mergeAnalysis。
- Consumes: Task 1 的稳定枚举值。

- [ ] **Step 1: 写字段边界和合并失败测试**

测试名称最长 80 个字符、备注最长 1000 个字符、标签和颜色去空白去重、styleTags 限制 3 个、其余数组限制 12 个、confirmedFields 只能引用允许字段。

~~~ts
expect(isValidInspiration({ deletedAt: null, uploadReady: true, styleTags: ["法式"], colorNames: [] })).toBe(true);
expect(isValidInspiration({ deletedAt: null, uploadReady: true, styleTags: [], colorNames: [] })).toBe(false);
expect(mergeAnalysis(currentWithConfirmedColors, incoming).colorNames).toEqual(currentWithConfirmedColors.colorNames);
expect(mergeAnalysis(currentVersion2, analysisStartedAtVersion1).applied).toBe(false);
~~~

- [ ] **Step 2: 运行单元测试并确认失败**

Run: pnpm vitest run tests/unit/inspiration/inspiration-validation.test.ts tests/unit/inspiration/inspiration-analysis.test.ts

Expected: FAIL，因为领域模块尚不存在。

- [ ] **Step 3: 实现公开类型和严格 Zod schema**

公开给客户端的 InspirationDetail 不包含 userId、objectKey、provider 原始响应或内部错误详情，只包含 imageUrl=/api/inspirations/{id}/image、可编辑字段、状态、来源、版本和时间。

~~~ts
export type InspirationField =
  | "name" | "styleTags" | "colorNames" | "silhouettes"
  | "keyItems" | "combinations" | "formality";

export type InspirationAnalysis = {
  styleTags: string[];
  colorNames: string[];
  silhouettes: string[];
  keyItems: string[];
  combinations: string[];
  formality: string | null;
};
~~~

parseInspirationPatch 使用 strictObject 拒绝 status、source、version、userId、uploadId、deletedAt 等受保护字段。

- [ ] **Step 4: 实现有效计数与版本安全合并**

isValidInspiration 仅在未删除、上传完成且 styleTags 或 colorNames 至少一项非空时返回 true。mergeAnalysis 先比较 startedVersion，再只写入未出现在 confirmedFields 的字段；写入成功后 version+1，并返回 appliedFields，便于 API 不泄露内部对象。

- [ ] **Step 5: 运行测试并提交**

Run: pnpm vitest run tests/unit/inspiration

Expected: PASS。

~~~bash
git add src/features/inspiration tests/unit/inspiration
git commit -m "feat: define inspiration domain rules"
~~~

### Task 3: 私密灵感图片、仓储和人工 CRUD 服务

**Files:**
- Create: src/features/storage/verified-image.ts
- Modify: src/features/items/item-service.ts
- Create: src/features/inspiration/inspiration-repository.ts
- Create: src/features/inspiration/inspiration-service.ts
- Create: src/server/db/drizzle-inspiration-repository.ts
- Create: tests/helpers/inspiration-fixture.ts
- Create: tests/unit/inspiration/inspiration-service.test.ts
- Create: tests/integration/inspiration/drizzle-inspiration-repository.test.ts

**Interfaces:**
- Produces: InspirationRepository、createInspirationService。
- Consumes: StorageProvider、Task 2 校验器、Task 1 表。

- [ ] **Step 1: 写服务与仓储失败测试**

覆盖完成的 inspiration 上传可绑定、pending 上传拒绝、wardrobe-original 上传拒绝、损坏或动画图片拒绝、跨用户上传返回 NOT_FOUND、同一上传重复绑定返回 ASSET_CONFLICT、列表不返回软删除记录、人工更新递增 version、删除幂等。

~~~ts
const created = await service.create(user.id, { uploadId, name: "秋日通勤" });
expect(created.imageUrl).toBe("/api/inspirations/" + created.id + "/image");
await expect(service.create(other.id, { uploadId })).rejects.toMatchObject({ code: "NOT_FOUND" });
~~~

- [ ] **Step 2: 运行测试并确认失败**

Run: pnpm vitest run tests/unit/inspiration/inspiration-service.test.ts tests/integration/inspiration/drizzle-inspiration-repository.test.ts

Expected: FAIL，因为服务和仓储尚不存在。

- [ ] **Step 3: 提取共用图片验证**

把 item-service.ts 中读取流、15 MB/40MP/12000 边长限制、静态 PNG、单帧、完整解码逻辑移到 server-only 的 verifyCompletedImage(upload, provider)。衣物服务和灵感服务都调用这一函数，保持原有 ItemError 映射，同时让灵感服务映射为 INVALID_IMAGE。

Run: pnpm vitest run tests/unit/items/item-service.test.ts tests/integration/storage/private-image-routes.test.ts

Expected: PASS，证明提取没有改变衣物行为。

- [ ] **Step 4: 实现仓储接口和事务**

仓储接口必须明确 userId：

~~~ts
export interface InspirationRepository {
  list(userId: string): Promise<InspirationDetail[]>;
  find(userId: string, id: string): Promise<InspirationDetail | null>;
  findCompletedUpload(userId: string, uploadId: string): Promise<CompletedUpload | null>;
  create(userId: string, uploadId: string, image: VerifiedImage, input: EditableInspiration): Promise<InspirationDetail>;
  update(userId: string, id: string, expectedVersion: number, patch: EditableInspirationPatch): Promise<InspirationDetail>;
  softDelete(userId: string, id: string, expectedVersion: number, now: Date): Promise<void>;
  findPrivateImage(userId: string, id: string): Promise<CompletedUpload | null>;
}
~~~

Drizzle 写事务锁定用户、上传和灵感，验证 kind=inspiration、status=completed、completedAt 非空、图片元数据一致、版本一致，并把唯一约束映射成领域错误。

- [ ] **Step 5: 实现服务并过滤输出**

create、update、remove、read、list 均先校验 UUID 和输入。更新要求客户端提交 expectedVersion，冲突返回 VERSION_CONFLICT；列表只返回未删除记录并按 createdAt desc、id desc 稳定排序。

- [ ] **Step 6: 运行服务与回归测试并提交**

Run: pnpm vitest run tests/unit/inspiration tests/integration/inspiration tests/unit/items/item-service.test.ts

Expected: PASS。

~~~bash
git add src/features/storage/verified-image.ts src/features/items/item-service.ts src/features/inspiration src/server/db/drizzle-inspiration-repository.ts tests/helpers/inspiration-fixture.ts tests/unit/inspiration tests/integration/inspiration
git commit -m "feat: persist private inspirations"
~~~

### Task 4: 灵感 API、私密图片读取与生产绑定

**Files:**
- Create: src/features/inspiration/inspiration-routes.ts
- Create: src/features/inspiration/private-inspiration-image-route.ts
- Create: src/server/inspiration.ts
- Create: src/app/api/inspirations/route.ts
- Create: src/app/api/inspirations/[inspirationId]/route.ts
- Create: src/app/api/inspirations/[inspirationId]/image/route.ts
- Create: tests/integration/inspiration/inspiration-routes.test.ts
- Create: tests/integration/inspiration/private-inspiration-image.test.ts
- Modify: tests/integration/architecture/server-runtime-boundary.test.ts

**Interfaces:**
- Produces: GET/POST /api/inspirations、GET/PATCH/DELETE /api/inspirations/:id、GET /api/inspirations/:id/image。
- Consumes: Task 3 服务和仓储。

- [ ] **Step 1: 写路由契约失败测试**

覆盖匿名 401、写请求无合法 Origin 为 403、非法 JSON 为 400、跨用户和未知 UUID 同样 404、版本冲突 409、成功创建 201、私密图返回精确 MIME 和安全头。

~~~ts
expect(image.headers.get("cache-control")).toBe("private, no-store");
expect(image.headers.get("x-content-type-options")).toBe("nosniff");
expect(await foreignImage.status).toBe(404);
~~~

- [ ] **Step 2: 运行测试并确认失败**

Run: pnpm vitest run tests/integration/inspiration/inspiration-routes.test.ts tests/integration/inspiration/private-inspiration-image.test.ts

Expected: FAIL，因为路由尚不存在。

- [ ] **Step 3: 实现可注入处理器**

沿用 item-routes 的 authenticated 包装，但返回中文界面可映射的稳定错误码：INVALID_INPUT、NOT_FOUND、INVALID_IMAGE、ASSET_CONFLICT、VERSION_CONFLICT、UNAUTHORIZED、ORIGIN_MISMATCH、INTERNAL_ERROR。

GET 图片不要求 Origin，只检查会话、UUID 和归属。任何匿名、跨用户、软删除、未完成上传或存储失败都返回相同 NOT_FOUND，响应中不出现 objectKey。

- [ ] **Step 4: 绑定 App Router**

每个 route.ts 声明 runtime=nodejs，并使用 Next 16 的异步 context.params。生产依赖由 src/server/inspiration.ts 组装，不让 route.ts 直接导入数据库或环境密钥。

- [ ] **Step 5: 运行边界和路由测试并提交**

Run: pnpm vitest run tests/integration/inspiration tests/integration/architecture

Expected: PASS。

~~~bash
git add src/features/inspiration src/server/inspiration.ts src/app/api/inspirations tests/integration/inspiration tests/integration/architecture
git commit -m "feat: expose private inspiration APIs"
~~~

### Task 5: 添加灵感、灵感墙与详情编辑界面

**Files:**
- Modify: src/features/items/item-upload-client.ts
- Modify: src/features/items/photo-picker.tsx
- Create: src/features/inspiration/inspiration-client.ts
- Create: src/features/inspiration/inspiration-photo-picker.tsx
- Create: src/features/inspiration/inspiration-editor.tsx
- Create: src/features/inspiration/inspiration-wall.tsx
- Create: src/features/inspiration/inspiration.module.css
- Modify: src/app/(app)/app/inspiration/page.tsx
- Create: src/app/(app)/app/inspiration/new/page.tsx
- Create: src/app/(app)/app/inspiration/[inspirationId]/page.tsx
- Create: tests/unit/inspiration/inspiration-client.test.ts
- Create: tests/unit/inspiration/inspiration-photo-picker.test.tsx
- Create: tests/unit/inspiration/inspiration-editor.test.tsx
- Create: tests/unit/inspiration/inspiration-wall.test.tsx

**Interfaces:**
- Produces: uploadPrivateImage(file, kind, callbacks)、InspirationWall、InspirationEditor。
- Consumes: Task 4 API。

- [ ] **Step 1: 写客户端和组件失败测试**

覆盖上传会话可从 PUT 或 complete 阶段恢复、上传成功后才创建灵感记录、本地预览立即出现、卸载时 revokeObjectURL、相册/相机/粘贴三种入口、HEIC/超限拒绝、空状态、两列卡片、五张门槛文案、保存失败保留表单。

~~~tsx
expect(screen.getByText("再添加 3 张，就能形成你的风格说明书")).toBeVisible();
expect(screen.queryByText(/%/)).not.toBeInTheDocument();
expect(screen.getByText("尚未连接 AI，可手动整理")).toBeVisible();
~~~

- [ ] **Step 2: 运行组件测试并确认失败**

Run: pnpm vitest run tests/unit/inspiration/inspiration-client.test.ts tests/unit/inspiration/inspiration-photo-picker.test.tsx tests/unit/inspiration/inspiration-editor.test.tsx tests/unit/inspiration/inspiration-wall.test.tsx

Expected: FAIL，因为客户端与页面组件尚不存在。

- [ ] **Step 3: 泛化已有上传客户端**

把 uploadOriginal 的传输状态机抽成 uploadPrivateImage(file, kind, callbacks)，kind 只接受 wardrobe-original、inspiration、wear-photo。uploadOriginal 保持原签名并委托共用函数，确保既有衣物测试无变化。

- [ ] **Step 4: 实现图片选择与粘贴**

InspirationPhotoPicker 复用相机和相册校验，并监听组件范围内的 paste 事件，从 ClipboardEvent.clipboardData.files 读取第一张图片。无图片时显示“剪贴板里没有可用图片”，不请求全局剪贴板权限，不读取文本内容。

- [ ] **Step 5: 实现墙、添加页和详情页**

InspirationWall 从 GET /api/inspirations 加载真实记录，显示数量、有效门槛和两列瀑布流。InspirationEditor 分离 upload、create、save 三个状态；输入字段提供可见 label，数组字段使用可删除 chip，不依赖 placeholder 作为名称。

AI 角标只显示在 analysisSource=openai 或 qwen 且该字段未被人工确认时。规则预览和手动输入使用普通标签。

- [ ] **Step 6: 验证可访问性、响应式和回归**

Run: pnpm vitest run tests/unit/inspiration tests/unit/items/item-upload-client.test.ts tests/unit/items/photo-picker.test.tsx tests/unit/app/tab-pages.test.tsx

Expected: PASS。

- [ ] **Step 7: 提交**

~~~bash
git add src/features/items/item-upload-client.ts src/features/items/photo-picker.tsx src/features/inspiration src/app/\(app\)/app/inspiration tests/unit/inspiration tests/unit/items
git commit -m "feat: add inspiration wall and editor"
~~~

### Task 6: 风格说明书聚合、规则和 API

**Files:**
- Create: src/features/style/style-types.ts
- Create: src/features/style/style-aggregation.ts
- Create: src/features/style/style-repository.ts
- Create: src/features/style/style-service.ts
- Create: src/features/style/style-routes.ts
- Create: src/server/db/drizzle-style-repository.ts
- Create: src/server/style.ts
- Create: src/app/api/style-profile/route.ts
- Create: src/app/api/style-rules/route.ts
- Create: src/app/api/style-rules/[ruleId]/route.ts
- Create: tests/unit/style/style-aggregation.test.ts
- Create: tests/unit/style/style-service.test.ts
- Create: tests/integration/style/style-routes.test.ts

**Interfaces:**
- Produces: StyleProfileDraft、StyleSuggestionInput、aggregateStyleProfile、StyleRepository、createStyleService、style profile/rule API。
- Consumes: Task 1 表与 Task 2 的有效灵感定义。

- [ ] **Step 1: 写聚合和人工版本保护失败测试**

使用固定灵感集合验证计数、去重、稳定排序和五张门槛：

~~~ts
expect(aggregateStyleProfile(fourValid).status).toEqual({ kind: "insufficient", remaining: 1 });
expect(aggregateStyleProfile(fiveValid).profile.preferredColors).toEqual(["米白", "灰绿", "豆沙"]);
expect(updatedManual.manuallyEdited).toBe(true);
expect(afterNewInspiration.current).toEqual(updatedManual);
expect(afterNewInspiration.pendingSuggestion).not.toBeNull();
~~~

同票时按最近人工确认时间再按稳定文字排序；相同输入必须产生相同 inputVersion。

- [ ] **Step 2: 运行测试并确认失败**

Run: pnpm vitest run tests/unit/style tests/integration/style

Expected: FAIL，因为风格模块尚不存在。

- [ ] **Step 3: 实现确定性聚合**

aggregateStyleProfile 统计色系、廓形和组合，最多返回每类 5 项；正式程度按出现次数选择一个倾向；likedExamples 选择最近确认的 3 张有效灵感编号。inputVersion 使用有效灵感 id、version 的稳定排序后计算 SHA-256，不包含私密备注。

~~~ts
export type StyleProfileDraft = {
  preferredColors: string[];
  preferredSilhouettes: string[];
  commonCombinations: string[];
  formalityTendency: string | null;
  likedExamples: string[];
};

export type StyleSuggestionInput = {
  inspirations: Array<Pick<InspirationDetail,
    "id" | "version" | "styleTags" | "colorNames" | "silhouettes" |
    "keyItems" | "combinations" | "formality">>;
  enabledRules: StyleRuleInput[];
};
~~~

- [ ] **Step 4: 实现仓储与服务**

read(userId) 返回 validCount、remaining、current、pendingSuggestion 和 rules。regenerate(userId) 在不足五张时返回门槛状态；未人工编辑时 upsert current，已人工编辑时只写 pendingSuggestion。updateProfile 只允许六个公开部分并设置 manuallyEdited=true。acceptSuggestion 显式把 pendingSuggestion 变为 current。

规则输入为：

~~~ts
type StyleRuleInput = {
  type: "color" | "style" | "fit" | "material" | "formality" | "text";
  value: string;
  enabled: boolean;
};
~~~

结构化规则值限制 1 至 80 字符，自由文字限制 1 至 240 字符；所有更新带 expectedUpdatedAt 防止静默覆盖。

- [ ] **Step 5: 实现 API 和错误映射**

GET/PUT/POST /api/style-profile 分别读取、保存当前说明书和重新聚合；POST /api/style-rules 创建规则，PATCH/DELETE /api/style-rules/:id 更新或删除。所有写请求验证 Origin 和登录。

- [ ] **Step 6: 运行测试并提交**

Run: pnpm vitest run tests/unit/style tests/integration/style

Expected: PASS。

~~~bash
git add src/features/style src/server/db/drizzle-style-repository.ts src/server/style.ts src/app/api/style-profile src/app/api/style-rules tests/unit/style tests/integration/style
git commit -m "feat: build editable style manual"
~~~

### Task 7: 风格说明书界面与真实灵感统计

**Files:**
- Create: src/features/style/style-manual.tsx
- Create: src/features/style/style-manual.module.css
- Create: src/app/(app)/app/inspiration/style/page.tsx
- Modify: src/features/inspiration/inspiration-wall.tsx
- Modify: src/features/idle/profile-summary.tsx
- Modify: src/features/idle/idle-repository.ts
- Modify: src/server/db/drizzle-idle-repository.ts
- Create: tests/unit/style/style-manual.test.tsx
- Modify: tests/unit/profile/profile-summary.test.tsx
- Modify: tests/unit/inspiration/inspiration-wall.test.tsx

**Interfaces:**
- Produces: StyleManual UI 和 profile 中真实 inspirationCount。
- Consumes: Task 6 API。

- [ ] **Step 1: 写说明书 UI 和统计失败测试**

覆盖不足五张状态、六部分表单、保存、重新整理提示、采纳建议、创建/停用/删除“不喜欢”规则，以及“我的”页面显示真实灵感数量而非准备中文案。

- [ ] **Step 2: 运行测试并确认失败**

Run: pnpm vitest run tests/unit/style/style-manual.test.tsx tests/unit/profile/profile-summary.test.tsx tests/unit/inspiration/inspiration-wall.test.tsx

Expected: FAIL，因为说明书页面和统计尚未连接。

- [ ] **Step 3: 实现风格说明书页面**

不足五张时只显示 remaining 和返回灵感墙入口。达到门槛时使用独立分区编辑偏爱色系、偏爱廓形、常用组合、正式程度、喜欢示例和“不喜欢”。pendingSuggestion 只显示“有新的整理建议”，必须由用户点击“采用建议”才覆盖。

- [ ] **Step 4: 更新灵感墙入口和个人统计**

灵感墙达到门槛后显示“查看风格说明书”；未达到时入口仍可打开门槛页。“我的”仓储统计增加未删除 inspirations 的 count，并移除“搭配与灵感还在准备中”中关于灵感的部分，继续诚实说明搭配尚未开放。

- [ ] **Step 5: 运行测试并提交**

Run: pnpm vitest run tests/unit/style tests/unit/profile tests/unit/inspiration tests/integration/idle

Expected: PASS。

~~~bash
git add src/features/style src/app/\(app\)/app/inspiration/style src/features/inspiration/inspiration-wall.tsx src/features/idle tests/unit/style tests/unit/profile tests/unit/inspiration
git commit -m "feat: add style manual experience"
~~~

### Task 8: 确定性复刻引擎、持久化和 API

**Files:**
- Create: src/features/recreation/recreation-types.ts
- Create: src/features/recreation/recreation-engine.ts
- Create: src/features/recreation/recreation-repository.ts
- Create: src/features/recreation/recreation-service.ts
- Create: src/features/recreation/recreation-routes.ts
- Create: src/server/db/drizzle-recreation-repository.ts
- Create: src/server/recreation.ts
- Create: src/app/api/inspirations/[inspirationId]/recreations/route.ts
- Create: src/app/api/recreations/[recreationId]/route.ts
- Create: tests/unit/recreation/recreation-engine.test.ts
- Create: tests/unit/recreation/recreation-service.test.ts
- Create: tests/integration/recreation/recreation-routes.test.ts

**Interfaces:**
- Produces: AiRecreationInput、AiRecreationDraft、buildRuleRecreation、RecreationRepository、createRecreationService、创建与读取复刻 API。
- Consumes: InspirationDetail、StyleRule、现有 ItemDetail。

- [ ] **Step 1: 写候选排除和组合失败测试**

测试 active 且未删除衣物进入候选；draft、watching、disposed、deleted 和其他用户全部排除。结构化规则必须在评分前排除。结果满足上装+下装或裙装/连体，并只在可用时加入鞋、外套、包和配饰。

~~~ts
expect(result.items.every((entry) => entry.userId === user.id)).toBe(true);
expect(result.items.every((entry) => entry.status === "active" && entry.deletedAt === null)).toBe(true);
expect(result.items.some((entry) => entry.colorNames.includes("亮红"))).toBe(false);
expect(result.missing).toEqual(["鞋履"]);
~~~

- [ ] **Step 2: 运行测试并确认失败**

Run: pnpm vitest run tests/unit/recreation tests/integration/recreation

Expected: FAIL，因为复刻模块尚不存在。

- [ ] **Step 3: 实现可解释评分**

每个候选按关键品类匹配、颜色、风格、版型、长度、材质、正式程度加权评分；相同分数按 updatedAt desc、id asc 稳定排序。关键单品名称只用于槽位和文字相似，不进行模糊生成。结构化“不喜欢”规则为硬排除，自由文字规则只进入结果说明。

buildRuleRecreation 返回：

~~~ts
export type RecreationInputSnapshot = {
  inspiration: Pick<InspirationDetail,
    "id" | "version" | "styleTags" | "colorNames" | "silhouettes" |
    "keyItems" | "combinations" | "formality">;
  styleProfileInputVersion: string | null;
  enabledRuleIds: string[];
  candidateVersions: Array<{ itemId: string; updatedAt: string }>;
};

type RecreationDraft = {
  mode: "rules";
  items: Array<{ itemId: string; slot: string; score: number }>;
  similarities: string[];
  missing: string[];
  inputSnapshot: RecreationInputSnapshot;
};

export type AiRecreationInput = {
  inspiration: RecreationInputSnapshot["inspiration"];
  styleProfile: StyleProfileDraft | null;
  enabledRules: StyleRuleInput[];
  candidates: Array<{ token: string; slot: string; description: string }>;
};

export type AiRecreationDraft = {
  selections: Array<{ token: string; slot: string }>;
  similarities: string[];
  missing: string[];
};
~~~

- [ ] **Step 4: 实现事务仓储和服务二次校验**

仓储只查询 userId、status=active、deletedAt is null 的衣物。保存前在同一事务重新锁定所有编号并重复状态、归属和规则检查；任何已变化衣物都触发一次重新组合，第二次仍不足则返回 CANDIDATES_CHANGED。

自由文字说明不写日志；inputSnapshot 只保存来源灵感公开字段、风格说明书版本、规则编号和值以及衣物公开描述，不保存私密备注、图片地址或对象键。

- [ ] **Step 5: 实现 API**

POST /api/inspirations/:id/recreations 创建规则预览并返回 201；GET /api/recreations/:id 返回已过滤结果。未知和跨用户来源统一 404；候选不足仍保存带 missing 的结果并返回 201，不推荐购买。

- [ ] **Step 6: 运行测试并提交**

Run: pnpm vitest run tests/unit/recreation tests/integration/recreation tests/integration/idle

Expected: PASS。

~~~bash
git add src/features/recreation src/server/db/drizzle-recreation-repository.ts src/server/recreation.ts src/app/api/inspirations src/app/api/recreations tests/unit/recreation tests/integration/recreation
git commit -m "feat: add rule-based inspiration recreation"
~~~

### Task 9: 复刻发起页和结果页

**Files:**
- Create: src/features/recreation/recreation-client.ts
- Create: src/features/recreation/recreation-builder.tsx
- Create: src/features/recreation/recreation-result.tsx
- Create: src/features/recreation/recreation.module.css
- Create: src/app/(app)/app/inspiration/[inspirationId]/recreate/page.tsx
- Create: src/app/(app)/app/inspiration/[inspirationId]/recreate/[recreationId]/page.tsx
- Modify: src/features/inspiration/inspiration-editor.tsx
- Create: tests/unit/recreation/recreation-builder.test.tsx
- Create: tests/unit/recreation/recreation-result.test.tsx

**Interfaces:**
- Produces: 用户可见的“用我的衣服复刻”完整规则预览流程。
- Consumes: Task 8 API。

- [ ] **Step 1: 写页面失败测试**

覆盖已保存灵感才显示复刻按钮、创建中禁用重复提交、规则预览标签、真实衣物图片和名称、相似点、缺失项、返回衣柜入口、网络失败重试，以及没有购买推荐或不可用后续按钮。

- [ ] **Step 2: 运行测试并确认失败**

Run: pnpm vitest run tests/unit/recreation/recreation-builder.test.tsx tests/unit/recreation/recreation-result.test.tsx tests/unit/inspiration/inspiration-editor.test.tsx

Expected: FAIL，因为页面尚不存在。

- [ ] **Step 3: 实现发起和结果组件**

RecreationBuilder 调用 POST 后 router.replace 到稳定结果 URL，防止刷新重复创建。RecreationResult 使用横向 Look 卡片和现有衣物私密图片 URL；每项链接回衣物详情。缺失项文案为“衣柜中暂时没有接近的鞋履”，按钮为“返回衣柜补充资料”，不出现“购买”。

- [ ] **Step 4: 验证响应式与可访问性**

在 320、390、480 宽度下卡片不横向溢出；图片有衣物名 alt；结果标签和错误使用文本而非仅颜色；减少动态效果时不使用持续动画。

- [ ] **Step 5: 运行测试并提交**

Run: pnpm vitest run tests/unit/recreation tests/unit/inspiration

Expected: PASS。

~~~bash
git add src/features/recreation src/features/inspiration/inspiration-editor.tsx src/app/\(app\)/app/inspiration tests/unit/recreation tests/unit/inspiration
git commit -m "feat: add recreation result experience"
~~~

### Task 10: OpenAI、通义千问适配器与可恢复分析任务

**Files:**
- Modify: .env.example
- Modify: src/server/runtime/env.ts
- Create: src/features/ai/ai-types.ts
- Create: src/features/ai/ai-provider.ts
- Create: src/features/ai/openai-provider.ts
- Create: src/features/ai/qwen-provider.ts
- Create: src/features/ai/processing-job-repository.ts
- Create: src/features/ai/inspiration-analysis-job.ts
- Create: src/server/db/drizzle-processing-job-repository.ts
- Create: src/server/ai.ts
- Create: src/app/api/inspirations/[inspirationId]/analysis/route.ts
- Modify: src/features/inspiration/inspiration-routes.ts
- Modify: src/features/inspiration/inspiration-editor.tsx
- Modify: src/features/style/style-service.ts
- Modify: src/features/recreation/recreation-service.ts
- Create: tests/unit/ai/ai-env.test.ts
- Create: tests/unit/ai/openai-provider.test.ts
- Create: tests/unit/ai/qwen-provider.test.ts
- Create: tests/unit/ai/inspiration-analysis-job.test.ts
- Create: tests/integration/ai/processing-jobs.test.ts
- Create: tests/integration/ai/analysis-route.test.ts

**Interfaces:**
- Produces: AiProvider、createAiProvider、enqueue/claim/run analysis job、真实 AI 的分析/风格建议/复刻路径。
- Consumes: Tasks 2、6、8 的领域输入输出。

- [ ] **Step 1: 写环境与 Provider 失败测试**

覆盖 AI_PROVIDER=none 默认、openai/qwen 缺 Key 或模型时报配置错误、存在 Key 但 AI_PROVIDER 未选仍为 none、密钥不出现在错误文本、两种适配器把不同原始响应转换为同一 Zod 结构。

~~~ts
expect(readAiEnv({ OPENAI_API_KEY: "secret" }).provider).toBe("none");
expect(() => readAiEnv({ AI_PROVIDER: "openai" })).toThrow("Invalid AI configuration");
expect(JSON.stringify(publicStatus)).not.toContain("secret");
~~~

- [ ] **Step 2: 运行测试并确认失败**

Run: pnpm vitest run tests/unit/ai tests/integration/ai

Expected: FAIL，因为 AI 模块尚不存在。

- [ ] **Step 3: 实现专用服务端环境读取**

.env.example 增加：

~~~dotenv
AI_PROVIDER=none
AI_MODEL=
AI_API_KEY=
AI_BASE_URL=
~~~

readAiEnv 只在 server-only 工厂中使用。openai 默认基础地址为 https://api.openai.com/v1，并向规范化后的 baseUrl/responses 发请求；qwen 要求显式 AI_BASE_URL，并向规范化后的 baseUrl/chat/completions 发请求。两者都要求 AI_MODEL 和 AI_API_KEY。客户端只得到 available:boolean 和 label，不得到模型、地址或 Key。

- [ ] **Step 4: 实现统一 Provider 契约**

~~~ts
export interface AiProvider {
  readonly kind: "openai" | "qwen";
  analyzeInspiration(input: { image: Uint8Array; mimeType: string }): Promise<InspirationAnalysis>;
  suggestStyleProfile(input: StyleSuggestionInput): Promise<StyleProfileDraft>;
  recreate(input: AiRecreationInput): Promise<AiRecreationDraft>;
}
~~~

OpenAI 适配器使用官方 Responses API、store=false、图片输入和 JSON schema；通义千问适配器使用配置的 OpenAI 兼容 chat/completions URL 和等价 JSON schema。两者使用 AbortSignal.timeout 限时、原生 fetch、响应大小上限和 Zod 校验，不记录请求图片或原始响应。

Provider 单元测试注入 fake fetch，验证 Authorization 只发往精确允许的 HTTPS origin、重定向关闭、错误映射安全、畸形 JSON 只触发一次格式修复重试。

- [ ] **Step 5: 实现数据库任务租约**

enqueue 对相同 userId+targetInspirationId+inputVersion 返回现有未结束任务。claim 使用原子 update，只领取 queued 或租约过期 running 任务，设置短租约并 attempts+1。run 读取私密图、调用 Provider、通过 mergeAnalysis 应用结果；版本过期时任务成功但只保留建议，不覆盖人工内容。

网络、额度、超时和格式错误映射为 AI_UNAVAILABLE、AI_RATE_LIMITED、AI_TIMEOUT、AI_INVALID_RESPONSE。attempts 达到 2 后标记 failed；用户再次点击可为新输入版本建新任务。

- [ ] **Step 6: 使用 Next after 启动响应后处理**

POST /api/inspirations/:id/analysis 验证同源、登录、AI 可用和资源归属，入队后返回 202，并在 route handler 中调用：

~~~ts
after(() => runProductionAnalysisJob(job.id));
return jsonResponse({ jobId: job.id, status: "queued" }, 202);
~~~

任务状态写回 inspiration，详情客户端按递增间隔轮询自己的灵感详情；页面离开后轮询停止。进程中断留下的租约任务可由用户再次点击安全重领。

- [ ] **Step 7: 接入风格建议与 AI 复刻**

style-service 在明确请求 AI 且 provider 可用时调用 suggestStyleProfile，仍遵守五张门槛和人工版本保护。recreation-service 先由服务器筛选候选，再把临时编号和最少公开描述交给 provider.recreate；返回后逐一验证 userId、status、deletedAt、硬规则和组合完整性，不合法结果不保存并返回 AI_INVALID_RESPONSE。

无 Provider 时原有规则聚合和规则复刻保持不变。真实结果 mode 分别保存 openai 或 qwen，并在页面显示“AI 分析/AI 复刻”。

- [ ] **Step 8: 运行 AI、安全边界和完整回归并提交**

Run: pnpm vitest run tests/unit/ai tests/integration/ai tests/unit/inspiration tests/unit/style tests/unit/recreation tests/integration/inspiration tests/integration/style tests/integration/recreation tests/integration/architecture

Expected: PASS；测试不访问公网、不需要真实 Key。

~~~bash
git add .env.example src/server/runtime/env.ts src/features/ai src/server/ai.ts src/server/db/drizzle-processing-job-repository.ts src/app/api/inspirations src/features/inspiration src/features/style src/features/recreation tests/unit/ai tests/integration/ai
git commit -m "feat: add replaceable AI providers"
~~~

### Task 11: 端到端旅程、阶段文档与最终验收

**Files:**
- Create: tests/e2e/inspiration-style-recreation.spec.ts
- Modify: tests/e2e/helpers/inventory.ts
- Modify: tests/e2e/helpers/inventory-seed.ts
- Modify: tests/e2e/auth-onboarding.spec.ts
- Modify: tests/e2e/mobile-shell.spec.ts
- Modify: README.md
- Modify: docs/development/local-setup.md
- Create: docs/development/phase-3-verification.md

**Interfaces:**
- Produces: 从注册到规则复刻的浏览器验收证据和第三阶段操作说明。
- Consumes: Tasks 1–10 的完整产品。

- [ ] **Step 1: 写无 Key 完整旅程**

Playwright 使用真实 UI 完成：

1. 邀请码注册与首次设置。
2. 添加上装、下装、裙装、鞋和一件会被“不喜欢”规则排除的衣物。
3. 从 JPEG、PNG、WebP 上传五张灵感并手动标注。
4. 验证前四张只显示剩余数量，第五张出现风格说明书入口。
5. 编辑说明书并添加颜色硬规则。
6. 从一张灵感发起规则复刻。
7. 验证结果只引用 active 且未删除衣物，不含被规则排除的衣物。
8. 验证跨账号灵感、图片、规则和复刻结果均返回与未知编号相同的 404。

- [ ] **Step 2: 增加移动端和隐私断言**

在 320、390、480 宽度保存灵感墙、详情、说明书和复刻结果证据；断言没有横向滚动、焦点轮廓可见、图片自然尺寸非零、私密图片响应具有 private,no-store 和 nosniff。

- [ ] **Step 3: 更新诚实文档**

README 把灵感、风格说明书和规则复刻移到“已提供”，继续说明日常搭配、收藏、反馈和穿着日志尚未开放。

local-setup.md 先讲无 Key 模式；再列出可选 AI_PROVIDER、AI_MODEL、AI_API_KEY、AI_BASE_URL，并明确 Key 只放 .env.local、不提交 Git、不粘贴到客户端页面。说明 ChatGPT 订阅与普通 API 计费分开，“通过 ChatGPT 登录”尚不是当前可用入口。

phase-3-verification.md 记录规则算法、五张门槛、人工内容保护、隐私边界、AI mock 验证、精确命令、已知限制和下一阶段范围。

- [ ] **Step 4: 运行完整自动化验证**

Run:

~~~bash
node --version
pnpm --version
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm test:e2e
~~~

Expected:

- Node 显示 v22.x，pnpm 显示 11.25.0。
- 全部 Vitest 测试通过。
- TypeScript 无错误。
- ESLint 零警告。
- 生产构建成功。
- 开发模式 Playwright 全部通过。

- [ ] **Step 5: 运行生产 HTTPS 浏览器套件**

沿用现有 phase-2 的本机 HTTPS 启动与 Playwright 配置，验证 Secure Cookie、PWA、私密灵感图、无 Key 规则路径。一次只运行一个 E2E 套件，避免共享 PGlite 写入器。

Expected: 所有生产模式浏览器测试通过；不访问公网 AI。

- [ ] **Step 6: 检查仓库和提交**

Run:

~~~bash
git status --short
git diff --check
git log --oneline -12
~~~

确认没有 .env.local、.data、测试图片、API Key、对象键或未解释生成物进入 Git。

~~~bash
git add tests/e2e README.md docs/development
git commit -m "test: verify inspiration and recreation journey"
~~~

## 计划自检结论

- 规格覆盖：灵感上传与编辑、五张门槛、风格说明书、不喜欢规则、规则复刻、OpenAI/通义适配、人工覆盖保护、私密图片、错误恢复、移动端与文档均有对应任务。
- 阶段边界：每日天气搭配、三套生成、替换、换一批、反馈、收藏、穿着日志、衣物识别和抠图没有混入本计划。
- 类型一致性：InspirationAnalysis、StyleProfileDraft、RecreationDraft 在首次产生任务中定义，后续任务只消费这些稳定接口。
- 无占位步骤：每个任务均给出文件、接口、失败测试、实现边界、验证命令和提交边界。
