# 本地启动说明

这份说明适用于第一次在自己的电脑上启动。无需配置云数据库或 S3。建议先由熟悉终端的人协助安装 Node.js 22 和 pnpm 11.25.0；确认版本：

```bash
node --version
pnpm --version
```

第一条应显示 `v22.x.x`，第二条应显示 `11.25.0`。如果你已经使用 nvm 和 Corepack，可使用 `nvm install 22`、`nvm use 22`、`corepack enable` 和 `corepack prepare pnpm@11.25.0 --activate`。不要用 Node.js 24 替代项目指定版本。

在项目文件夹打开终端，第一次复制配置模板：

```bash
cp .env.example .env.local
openssl rand -base64 32
```

如果 `.env.local` 已存在，保留原文件，不要重复复制覆盖。用文本编辑器打开 `.env.local`，把随机文本填在 `INVITE_PEPPER=` 后面，整行保存为 `INVITE_PEPPER=你生成的随机文本`，不要保留模板占位文字。这个值是服务器私密配置；请保存到密码管理器，之后不要随意更换，否则原邀请码将无法验证。

本地其余配置保留：`APP_URL=http://localhost:3000`、`DATABASE_URL=`（空值）、`PGLITE_DATA_DIR=.data/pglite`、`SESSION_COOKIE_SECURE=false`、`STORAGE_DRIVER=local`、`LOCAL_STORAGE_DIR=.data/uploads`。S3 相关项保持空值。使用浏览器时也保持 `localhost:3000`，混用 `127.0.0.1` 或其他端口会因来源保护导致提交被拒绝。

然后依次执行：

```bash
pnpm install
pnpm invite:create --uses 1 --days 30
pnpm dev
```

邀请命令会自动建立数据库目录并应用 `drizzle/` 中的迁移，然后生成一张可用一次、有效三十天的邀请码。终端中的 `Invite code:` 后面就是邀请码原文，只显示一次；不要将终端截图、邀请码或配置文件发到公开频道。原文无法找回，丢失时重新生成。密码、邀请码和会话令牌在数据库中只保存哈希。

服务启动后打开 [http://localhost:3000](http://localhost:3000)。选择创建账号，填写邀请码、邮箱、10–128 个字符的密码和昵称。随后填写城市、发长、发质和第一个衣柜名称，点击“开启我的衣橱”。完成后可以浏览衣橱、搭配、灵感和我的四页；在“我的”退出并重新登录，可检查资料是否保留。

停止服务时在它所在的终端按 `Ctrl+C`。下次进入同一项目文件夹运行 `pnpm dev` 即可，不用再次复制配置或生成邀请。需要邀请其他人时，先停止服务，再运行 `pnpm invite:create --uses 1 --days 30`，最后重新启动。PGlite 本地目录只能由一个应用进程使用，不要同时启动两份开发服务或在服务运行时用另一个命令打开相同数据库。

`.data/pglite/` 保存账号与资料，`.data/uploads/` 保存本地文件。删除 `.data/` 会丢失本地数据。备份时先停止服务，将 `.data/` 和 `.env.local` 安全备份到私有位置；恢复时一起恢复。它们已被 Git 忽略。自动测试只会重置 `.data/e2e/`，不要把自己的文件放进这个子目录。

开发模式不会自动注册 Service Worker。PWA 的生产版自动验证见[验证说明](phase-1-verification.md)。手机上正式安装需要可信 HTTPS；iPhone Safari 使用分享菜单中的“添加到主屏幕”，Android Chrome 在满足浏览器安装条件后显示安装入口。电脑 Chromium 自动测试不能代替真实 iPhone 和 Android 的人工检查。

## 正式部署的限制

现在可用于本地试用，尚未完成上线验收。正式环境需要把 `APP_URL` 改为真实 HTTPS 来源，将 `SESSION_COOKIE_SECURE` 设为 `true`，配置 PostgreSQL 的 `DATABASE_URL`，在单独维护步骤中应用同一套 Drizzle 迁移，并安全保存服务器配置。公开网络上不能使用本地开发的非安全 Cookie 配置。

存储层已实现本地文件和 S3 兼容接口。正式环境应设置 `STORAGE_DRIVER=s3`，配置私有桶、区域、服务器访问密钥；兼容服务另需 `S3_ENDPOINT`。还需要为实际网站来源配置桶的浏览器 CORS，允许签名 PUT 及所需请求头，并实测上传、完成、重复上传保护和跨用户权限隔离。自动测试使用本地文件和可控替身，尚未向真实云桶写入或完成浏览器跨域上传验收。不要将 S3 长期密钥交给浏览器，也不要把桶改成公开读取来绕过权限。

本阶段没有对真实云 PostgreSQL、真实 S3、证书、备份恢复或手机设备完成部署验证。正式发布前必须完成这些步骤；构建成功只说明应用能生成生产程序。
