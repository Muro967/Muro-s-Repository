# AI Wardrobe

穿你所有，爱你所穿。

目前已提供第二阶段的手动衣橱：邀请码注册、登录与首次设置、多衣柜与分区管理、私有照片上传、衣物草稿与入库、分类/风格浏览与文字搜索、移动、回收站恢复，以及闲置观察和六种处置记录。闲置与收入统计来自真实保存的数据，穿着日期由用户手动填写。搭配和灵感页仍是空状态，AI 识别、抠图与穿着日志尚未开放。

首次使用请按[本地启动说明](docs/development/local-setup.md)操作。需要 Node.js 22 和 pnpm 11.25.0。项目根目录是包含 `package.json` 的文件夹，所有终端命令都在这里执行。

```bash
cp .env.example .env.local
openssl rand -base64 32
pnpm install
pnpm invite:create --uses 1 --days 30
pnpm dev
```

第二条命令生成的随机文本必须先填入 `.env.local` 的 `INVITE_PEPPER`，再执行后续命令。看到终端的本地地址后，用浏览器打开 [http://localhost:3000](http://localhost:3000)，选择创建账号，填写刚生成的邀请码。

邀请码原文只在生成时显示一次，请通过私人方式交给使用者；项目不保存可供找回的原文。账号和本地图片会留在 `.data/`，关闭程序不会删除。`.env.local` 和 `.data/` 不得提交到 Git，也不要放进公开共享目录。生成新邀请码时先停止开发服务，完成后再启动，以免两个进程同时操作本地数据库。

开发验证、闲置规则与已知限制见[第二阶段验证说明](docs/development/phase-2-verification.md)，基础认证与 PWA 背景见[第一阶段验证说明](docs/development/phase-1-verification.md)。自动测试使用 `.data/e2e/`、`.next-e2e/` 和端口 3109（生产模式另用内部端口 3110），启动前仅重置测试数据；它不会使用你的账号数据库。开发与生产浏览器套件都会验证注册、登录、衣物与闲置旅程；生产套件通过本机测试 HTTPS 验证 Secure Cookie，并另外验证 PWA，需要可调用的 OpenSSL。一次只运行一个端到端测试命令。

正式发布需要 HTTPS、PostgreSQL、私有对象存储及部署验收。S3 适配器已有代码和自动测试，真实桶的权限、浏览器跨域设置和上传链路还需部署验证。详情见本地说明中的部署限制。
