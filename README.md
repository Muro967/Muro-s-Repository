# AI Wardrobe

穿你所有，爱你所穿。

目前已提供第三阶段的可用衣橱：邀请码注册、登录与首次设置、多衣柜与分区、私有照片、衣物草稿与入库、搜索、移动与回收站，以及闲置观察和六种处置记录。现在还可以上传灵感图、维护可编辑的风格说明书与“不喜欢”规则，并只用自己衣橱中“在用”的衣物复刻灵感。默认规则模式不需要 AI Key；OpenAI GPT 与通义千问是可选接口，未配置或不可用时不会影响手动衣橱、灵感墙和规则复刻。日常搭配、收藏、反馈、自动穿着日志和抠图仍未开放。

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

开发验证、AI 配置与已知限制见[第三阶段验证说明](docs/development/phase-3-verification.md)，闲置规则见[第二阶段验证说明](docs/development/phase-2-verification.md)，基础认证与 PWA 背景见[第一阶段验证说明](docs/development/phase-1-verification.md)。自动测试使用 `.data/e2e/`、`.next-e2e/` 和端口 3109（生产模式另用内部端口 3110），启动前仅重置测试数据；它不会使用你的账号数据库。开发浏览器套件会验证注册、衣物、闲置、五张灵感门槛、风格说明书与规则复刻；生产套件还通过本机测试 HTTPS 验证 Secure Cookie 和 PWA，需要可调用的 OpenSSL。测试不会调用真实 AI 服务。一次只运行一个端到端测试命令。

正式发布需要 HTTPS、PostgreSQL、私有对象存储及部署验收。S3 适配器已有代码和自动测试，真实桶的权限、浏览器跨域设置和上传链路还需部署验证。详情见本地说明中的部署限制。
