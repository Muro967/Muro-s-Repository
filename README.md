# AI Wardrobe

穿你所有，爱你所穿。

目前是第一阶段的可运行基础：邀请码注册、邮箱密码登录、首次资料设置、四个手机页面，以及安装到主屏幕的 PWA 外壳。衣物录入、AI 识别、搭配推荐和灵感管理还没有开放；页面中的空状态是当前真实进度。

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

开发验证的完整步骤见[第一阶段验证说明](docs/development/phase-1-verification.md)。自动测试使用 `.data/e2e/`、`.next-e2e/` 和端口 3109，启动前仅重置测试数据；它不会使用你的账号数据库。一次只运行一个端到端测试命令。

正式发布需要 HTTPS、PostgreSQL、私有对象存储及部署验收。S3 适配器已有代码和自动测试，真实桶的权限、浏览器跨域设置和上传链路还需部署验证。详情见本地说明中的部署限制。
