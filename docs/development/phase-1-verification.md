# 第一阶段验证说明

先按[本地启动说明](local-setup.md)准备 Node.js 22、pnpm 11.25.0 和依赖。以下命令均在项目根目录执行。测试使用虚构账号，不需要复制真实配置到测试目录，也不要在命令中填写自己的密码或邀请码。

首次运行浏览器测试前安装项目指定的 Chromium：

```bash
pnpm exec playwright install chromium
```

依次执行，每条结束后再执行下一条；成功时终端退出码为 0：

```bash
pnpm test
pnpm test:e2e
pnpm typecheck
pnpm lint
pnpm build
node --test tests/build/upload-tracing.test.mjs
E2E_PRODUCTION=1 pnpm test:e2e
git diff --check
git status --short
```

`pnpm test` 检查邀请额度、哈希、事务、会话、资料、用户数据隔离、上传限制、页面组件和 Service Worker 策略。PGlite 初始化较重，因此默认同时使用两个工作进程。它也检查第一次生成邀请能在全新数据库上成功。

`pnpm test:e2e` 会占用 `127.0.0.1:3109`，拒绝复用已有服务，启动前删除并重建精确的 `.data/e2e/` 目录。数据库位于 `.data/e2e/database/`，测试上传目录为 `.data/e2e/uploads/`，Next 构建输出为 `.next-e2e/`。不能同时运行两份端到端测试；端口被占用时，先找出并停止你自己启动的对应进程，再重试。不要用批量杀进程命令。测试完成或按 `Ctrl+C` 中止时，Playwright 会停止它启动的服务器。

清理程序固定从脚本位置解析项目根目录，拒绝其他数据库地址、额外命令参数和指向外部的符号链接。真实 `.env.local` 中的数据库、来源、邀请码密钥和存储配置会被测试专用值覆盖；测试不会修改配置文件。启动脚本通过内存和进程环境传递测试邀请，不保存原文文件或打印邀请码，入库走与正式邀请命令相同的服务。失败时 Playwright 的诊断可能包含测试表单内容，因此不要在测试中使用真实凭据。

浏览器流程验证邀请码注册、首次设置、衣橱空状态、退出、匿名访问跳转和再次登录，同时验证已用尽的一次性邀请码不能再注册。移动测试分别在 320、390、480 像素宽、844 像素高下实际点击四个 Tab，检查只有当前页带 `aria-current="page"`，四个触控区域至少 44×44 像素且可见，整页没有横向溢出。测试会保存不含登录凭据的页面截图到 `output/playwright/`，该目录不会提交到 Git。

`E2E_PRODUCTION=1 pnpm test:e2e` 额外在独立 `.next-e2e/` 目录构建并启动生产程序，只运行 PWA 测试：检查 Manifest、图标、页面自动注册的 Service Worker、缓存只含离线页和公共图标、断网公共导航显示离线页、私有 API 不返回离线缓存。该 localhost 测试不会登录真实账户；正式认证仍需要可信 HTTPS。浏览器自身是否展示安装按钮受设备和安装条件影响，此测试不声称完成所有平台的安装验收。

如需亲眼观察 Chromium 执行账号流程，可运行：

```bash
pnpm test:e2e --headed
```

检查手机外观时请同时确认纸色背景、鼠尾草绿、柔和玫瑰色、标题字体、卡片留白和底部悬浮 Tab。实际 iPhone Safari、Android Chrome、系统文字放大和屏幕安全区域仍需设备人工检查。

发布前还需检查 `pnpm build` 生成的部署文件、PostgreSQL 迁移、私有 S3、浏览器 CORS 和 HTTPS 配置，见[本地说明](local-setup.md)。第一阶段验证通过不代表衣物 AI、搭配生成或完整 MVP 已实现。
