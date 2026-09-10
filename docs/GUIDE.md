# Memo

单用户、单密码的个人备忘录。支持标题／标签／正文搜索、原文一键复制、创建编辑删除，以及桌面、平板和手机布局。无用户名、注册、富文本或离线存储。

## 变量模板

在备忘录页进入「模板库」，保存带 `{{task_name}}` 的标题、标签或正文，填写变量并预览后创建独立备忘录。支持模板搜索、编辑和删除；已有数据库启动时自动升级。详见 [变量模板使用与 API](TEMPLATES.md)。

## Architecture

React 19 + TypeScript + Vite 8 + Ant Design 6 + TanStack Query 5 + React Router 8 构建静态 SPA，通过 GitHub Actions 部署到 EdgeOne Pages。独立 Go 1.27 API 使用 chi 和 pure-Go SQLite，FTS5 trigram 全文索引由数据库 trigger 维护。后端不读取或嵌入任何前端文件。

认证使用 Argon2id 单密码、256-bit 随机会话 Token、SQLite 中的 SHA-256 Token 摘要，以及安全的 host-only Cookie。会话有效期为 30 天，剩余不足 7 天时通过有 CSRF 防护的 POST 续期。协议细节及规范冲突处理见 [SPEC.md](SPEC.md)，完整要求见 [PLAN.md](PLAN.md)。

## Requirements

- Go 1.27.1（go.mod 固定；允许 Go 自动下载工具链）。
- Node.js 24.14+，pnpm 10.32.1。
- 生产环境需要两个同站点 HTTPS 域名，如 `memo.example.com` 和 `memo-api.example.com`。
- 无需 CGO、sqlite3 CLI、迁移 CLI 或独立数据库服务。

## Backend development / 初始化

```bash
cd backend
go run ./cmd/memo-api init
go run ./cmd/memo-api serve
```

`init` 自动创建数据库并运行嵌入的 SQL migration，在终端隐藏读取并确认密码。已有密码时拒绝覆盖。密码不得通过命令参数、URL 或环境变量提供。未初始化密码时 `serve` 拒绝启动并提示先运行 init。

默认数据库为工作目录内 `memo.db`；SQLite 使用 WAL、synchronous=NORMAL、foreign_keys=ON、busy_timeout=5000，每个连接都应用设置，最多 4 个连接。迁移有版本表，启动时事务执行，重复启动不会重建已完成迁移。

## Frontend development

另开终端：

```bash
cd frontend
cp .env.example .env
pnpm install --frozen-lockfile
pnpm dev
```

访问 `http://localhost:5173`。API 为 `http://localhost:8080`。开发时前后端都使用 `localhost`，不要混用 `127.0.0.1`。Cookie 始终带 Secure；浏览器若不接受 HTTP localhost 的 Secure Cookie，请在本地反向代理配置受信任 HTTPS。生产必须使用 HTTPS。

Ctrl/Cmd+K 聚焦搜索，Ctrl/Cmd+N 新建，Esc 关闭抽屉。搜索和标签条件写入 URL，150ms 防抖；TanStack Query 通过 AbortSignal 取消过期请求。复制直接使用已加载正文，不发 API 请求。

## Environment variables

后端只有三个运行时配置：

| 变量 | 默认值 | 说明 |
|---|---|---|
| MEMO_LISTEN_ADDR | 127.0.0.1:8080 | API 监听地址 |
| MEMO_DATABASE_PATH | memo.db | SQLite 文件 |

前端必填构建变量 `VITE_API_BASE_URL`：开发 `http://localhost:8080`，生产 `https://memo-api.example.com`，不带尾斜杠。该变量编译进入静态资源，修改后需要重启开发服务器或重新构建。支持末尾斜杠，客户端会自动移除；不要追加 `/api/v1`。未配置或地址格式不合法时 Vite 会明确报错，不再回退到写死的 localhost。

后端始终允许任意来源和预检请求头，回显请求的 Origin，并返回 `Access-Control-Allow-Credentials: true` 和 `Vary: Origin`，以兼容 Cookie 请求。401 等应用错误响应也包含跨域头。`MEMO_FRONTEND_ORIGIN` 已移除，遗留配置会被忽略。POST/PUT/DELETE 仍要求 JSON Content-Type 和 `X-Memo-CSRF: 1`，不再校验 Origin。

允许任意跨域来源不改变 Cookie 的 `Secure` / `SameSite=Strict` 属性。跨 origin、同 site 的部署可携带登录 Cookie；不同 site 的部署仍受浏览器 Cookie 策略限制。

## Production build

```bash
cd frontend
pnpm install --frozen-lockfile
VITE_API_BASE_URL=https://memo-api.example.com pnpm build
cd ../backend
go test ./...
CGO_ENABLED=0 go build -trimpath -o memo-api ./cmd/memo-api
```

前端输出 `frontend/dist/`，后端输出 `backend/memo-api`。两者可独立构建和发布。

## EdgeOne Pages 自动部署

[deploy-frontend.yml](../.github/workflows/deploy-frontend.yml) 已替代原 `.cnb.yml`。任意分支或标签的 push 都会触发构建并部署到 `light-memo` 项目的 production 环境；不按路径过滤，也支持手动运行。新 push 会取消同项目较早的进行中工作流。

在仓库 **Settings → Secrets and variables → Actions → Secrets** 添加 `EDGEONE_API_TOKEN` 即可。默认 API 地址沿用原流水线的 `https://memo-api.altasci.com`；如需修改，在同一页面的 **Variables** 添加 `VITE_API_BASE_URL`，然后重新触发工作流。

使用 GitHub 托管的 Ubuntu 24.04 runner、Node.js 24.14.0，以及 `frontend/package.json` 指定的 pnpm 版本。依赖安装使用 `pnpm install --frozen-lockfile`，构建使用 `pnpm build`，缓存以 `frontend/pnpm-lock.yaml` 为依据。部署密钥只注入部署步骤，不写入 Vite 环境或构建产物。

部署命令：

```bash
npx --yes edgeone pages deploy ./frontend/dist/ -n light-memo -t "$EDGEONE_API_TOKEN" -e production
```

命令及密钥用法见 [EdgeOne Pages 官方 GitHub Actions 指南](https://pages.edgeone.ai/document/use-github-actions)。本工作流独立于后端 Release 工作流，不上传前端文件到 GitHub Release。

## Cloudflare Pages 手动部署（可选）

Pages 项目根目录设为 `frontend`，构建命令 `pnpm install --frozen-lockfile && pnpm build`，输出目录 `dist`，配置 Node 24 与 `VITE_API_BASE_URL`。为前端绑定自定义域名 `memo.example.com`；不要使用与 API 不同 site 的 pages.dev 域名进行生产认证。

`public/_redirects` 提供 SPA fallback。构建时根据 `config/headers.template` 生成 `dist/_headers`，设置安全头、CSP、HTML no-cache、hashed assets 一年 immutable。CSP 的 `connect-src` 自动取自 `VITE_API_BASE_URL` 的 Origin，无需另改域名。不加载第三方字体、脚本或 analytics。

## Backend deployment / systemd / Nginx

Linux 示例（先准备有效 TLS 证书）：

```bash
sudo useradd --system --home /var/lib/memo --shell /usr/sbin/nologin memo
sudo install -d -m 0700 -o memo -g memo /var/lib/memo
sudo install -m 0755 backend/memo-api /usr/local/bin/memo-api
sudo -u memo env MEMO_DATABASE_PATH=/var/lib/memo/memo.db /usr/local/bin/memo-api init
sudo install -m 0644 backend/deploy/memo-api.service /etc/systemd/system/memo-api.service
sudo systemctl daemon-reload
sudo systemctl enable --now memo-api
```

安装并按域名与证书路径调整 [Nginx 示例](../backend/deploy/nginx.conf)，通过 `nginx -t` 后重载 Nginx。API 仅监听本机，由代理提供 HTTPS，并传递 Host、X-Forwarded-Proto。应用自行处理认证、CORS 和 CSRF。限制服务账号权限，不对外开放 8080。

`GET /healthz` 返回数据库可达状态。`journalctl -u memo-api` 查看 JSON 请求日志：request_id、method、path、status、duration。日志不包含请求正文、搜索参数或 Cookie。Nginx 示例关闭访问日志，避免记录搜索词。

SIGINT/SIGTERM 触发最多 10 秒 graceful shutdown，然后关闭数据库。systemd 停止超时 15 秒。

## Backup database

简单可靠的备份方式是暂停服务，复制整个数据库目录（包括可能存在的 WAL/SHM），再启动：

```bash
sudo systemctl stop memo-api
sudo cp -a /var/lib/memo /srv/backups/memo-2026-09-09
sudo systemctl start memo-api
```

先准备仅管理员可访问的备份目录。备份包含敏感正文、密码哈希和有效会话摘要，需妥善保护。不要在运行时只复制 `.db` 而忽略 WAL。如需不停机备份，可使用 SQLite online backup API 的工具。

恢复时停止服务，将备份目录恢复到原路径并设定 memo 用户所有权与 0700 目录权限，再启动。

## Upgrade

先备份，构建并测试新版本，再停止 API、替换可执行文件、启动服务。新增迁移按递增数字命名，自动事务执行。前端独立重新发布。遇到不兼容数据库变更时，回滚必须同时恢复旧二进制与升级前备份。

## Testing

```bash
cd backend
go test ./...
go test -race ./...
go vet ./...
go build ./cmd/memo-api
cd ../frontend
pnpm test
VITE_API_BASE_URL=https://memo-api.example.com pnpm build
```

后端使用临时 SQLite 数据库，覆盖 CRUD、分页、标签聚合、FTS 中文／Unicode／substring、短词 literal LIKE、trigger 更新删除、认证、会话过期与续期、密码修改、限流、CORS、CSRF、输入校验与迁移。

前端使用 Vitest + React Testing Library，覆盖登录、未登录跳转、列表、防抖搜索、新建编辑删除、复制、手机抽屉、API 401。Clipboard 和网络使用 mock，不写入浏览器存储。生产构建有 Settings lazy chunk。

## 登录失败排查

首次访问主页面时，会话检查返回 401 或未认证状态会进入密码页。网络、跨域或服务端异常也会进入密码页，同时显示检查失败原因并提供“重试连接”，不会阻止用户输入密码。登录页会持续显示错误，不会把密码错误当作会话过期。只有登录成功后再次查询 `/api/v1/auth/session` 确认浏览器会话有效，才进入备忘录页。

- `POST /api/v1/auth/login` 返回 401、错误码 `INVALID_PASSWORD`：当前后端数据库的密码不匹配。确认 `init` 与 `serve` 使用同一个 `MEMO_DATABASE_PATH`（默认路径相对于启动目录），以及前端 API 地址指向预期后端。
- 登录返回 204，但随后会话请求返回 401：密码已验证，Cookie 未被浏览器保存或发送。当前 Cookie 使用 `Secure`、`HttpOnly`、`SameSite=Strict` 和 `__Host-` 前缀。生产环境使用同站点 HTTPS 前后端；本地开发统一使用 `localhost`，不要混用 `localhost`、`127.0.0.1` 或局域网 IP。任意来源 CORS 不会覆盖浏览器的 Cookie 限制。
- API 地址通过 `VITE_API_BASE_URL` 在启动或构建时加载，修改后需要重启开发服务或重新构建。更新后端二进制后也需重启后端进程。

修改密码时，当前密码错误同样返回 `INVALID_PASSWORD`，保留现有会话供重新输入。

若代理直接返回 502 或拦截 OPTIONS，响应没有经过后端，应用的跨域配置无法生效。请检查代理上游连通性、OPTIONS 转发，并避免代理覆盖或重复添加应用的 CORS 响应头。
