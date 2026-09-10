> 历史初始设计。后续实现约定见 [SPEC.md](SPEC.md)，当前启动与配置说明见 [GUIDE.md](GUIDE.md)。2026-09-10 已按用户要求改为默认允许任意跨域 Origin；前端 API 地址与 CSP 由环境变量统一生成，覆盖本文原有的固定域名／跨域限制。

# Memo 单用户备忘录系统技术设计与实现规范

## 0. Codex 执行要求

本文档是本项目的**确定性实现规范**。

Codex 必须：

* 直接完成整个项目；
* 不重新进行技术选型；
* 不替换本文指定的核心框架；
* 不增加多用户、RBAC、OAuth、JWT、Redis、Elasticsearch 等未要求能力；
* 前后端必须完全独立；
* 前端必须可作为纯静态资源部署到 CDN；
* 后端不得依赖前端文件；
* 优先使用成熟框架和组件，不自行重新实现 UI 控件；
* 完成数据库迁移、测试、构建、部署示例和 README；
* 所有代码必须能够实际编译运行；
* 禁止只生成接口、TODO、伪代码或空实现。

最终仓库必须能够通过：

```bash
cd frontend
pnpm install
pnpm build

cd ../backend
go test ./...
go build ./cmd/memo-api
```

---

# 1. 项目目标

Memo 是一个**单用户、单密码、快速访问型个人备忘录系统**。

每个 Memo 只有三个核心业务字段：

```text
标题
标签列表
正文
```

核心体验：

1. 打开网页后长期保持登录；
2. 快速搜索全部 Memo；
3. 搜索范围同时包含标题、标签、正文；
4. 从搜索结果或 Memo 列表直接复制正文；
5. 编辑 Memo 的操作尽可能少；
6. Desktop / Tablet / Mobile 全响应式；
7. 前端静态部署到 CDN；
8. 后端使用独立 API 域名；
9. 单用户，不存在 username；
10. 不实现用户管理系统。

生产域名按照：

```text
Frontend:
https://memo.example.com

Backend:
https://memo-api.example.com
```

设计。

---

# 2. 最终技术架构

```text
                  Internet
                     │
        ┌────────────┴─────────────┐
        │                          │
        ▼                          ▼
memo.example.com           memo-api.example.com
        │                          │
        │                          │
Cloudflare Pages/CDN          HTTPS Reverse Proxy
        │                          │
        ▼                          ▼
React Static SPA               Go API
                                   │
                                   ▼
                              SQLite
                                   │
                    ┌──────────────┼─────────────┐
                    ▼              ▼             ▼
                  memos         FTS5          sessions
```

前端和后端之间只通过：

```text
HTTPS + JSON REST API
```

通信。

禁止：

```text
Go embed React
SSR
Next.js
React Server Components
WebSocket
GraphQL
Redis
独立全文搜索服务
```

---

# 3. 固定技术栈

## 3.1 前端

使用：

| 项目              | 技术                |
| --------------- | ----------------- |
| Language        | TypeScript        |
| Framework       | React 19          |
| Build           | Vite 8            |
| UI              | Ant Design 6      |
| Data Fetching   | TanStack Query 5  |
| Router          | React Router 8    |
| Icons           | @ant-design/icons |
| Package Manager | pnpm              |
| Production      | Static CDN        |

创建项目时基于当前稳定版本固定依赖。

本文编写时核心版本：

```text
React               19.2.8
Vite                 8.2.2
@vitejs/plugin-react  6.1.1
TypeScript            7.0.2
Ant Design            6.6.3
TanStack Query        5.102.8
React Router          8.3.1
```

React 当前主版本为 19，Vite 8.2 为当前受支持分支；Ant Design 6.6.3 是 2026-09-07 发布的稳定版本。

必须提交：

```text
pnpm-lock.yaml
```

禁止使用 floating dependencies。

---

## 3.2 UI 框架

所有主要 UI 必须使用：

```text
Ant Design
```

Ant Design 官方定位即为面向 Web 应用的 enterprise-class React UI 库，并原生提供响应式 Grid。

必须优先使用：

```text
Layout
Flex
Grid
Card
List
Input
Input.TextArea
Input.Password
Select
Tag
Button
FloatButton
Drawer
Modal
Form
Dropdown
Tooltip
Typography
Empty
Spin
Skeleton
Alert
Popconfirm
Result
App
message
notification
```

禁止自行实现：

```text
Button
Modal
Dropdown
Tooltip
Tag
Input
Drawer
Form control
Toast
Notification
Loading spinner
Confirm dialog
```

允许少量 CSS，仅用于：

* 页面宽高；
* Sticky 布局；
* Overflow；
* 响应式容器；
* Memo 正文换行；
* 列表高度；
* 必要的间距修正。

不要引入：

```text
Tailwind CSS
Bootstrap
Material UI
Chakra UI
shadcn/ui
```

避免第二套设计系统。

---

# 4. 后端固定技术栈

使用：

```text
Go 1.27
net/http
github.com/go-chi/chi/v5
github.com/go-chi/cors
modernc.org/sqlite
golang.org/x/crypto/argon2
crypto/rand
crypto/sha256
```

当前基准：

```text
Go                  1.27.1
chi                 v5.3.2
go-chi/cors         v1.2.2
modernc.org/sqlite  v1.58.0
```

Go 1.27 于 2026-08-19 正式发布，1.27.1 于 2026-09-01 发布。

HTTP Router 固定使用 chi。chi 与标准 `net/http` 完全兼容，并针对模块化 REST API 和中间件设计。

SQLite Driver 固定：

```text
modernc.org/sqlite
```

理由：

* Pure Go；
* 无 CGO；
* 方便 Linux / Windows / macOS 编译；
* 直接使用 SQLite；
* 单文件数据库；
* 无独立数据库服务。

`modernc.org/sqlite` 官方包说明其为 CGo-free SQLite3 实现。

---

# 5. Repository 结构

必须使用 monorepo，但前后端完全解耦：

```text
memo/
├── README.md
├── SPEC.md
│
├── frontend/
│   ├── package.json
│   ├── pnpm-lock.yaml
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── index.html
│   │
│   ├── public/
│   │   ├── _headers
│   │   └── _redirects
│   │
│   └── src/
│       ├── main.tsx
│       ├── app/
│       │   ├── App.tsx
│       │   ├── router.tsx
│       │   └── query-client.ts
│       │
│       ├── api/
│       │   ├── client.ts
│       │   ├── auth.ts
│       │   └── memos.ts
│       │
│       ├── pages/
│       │   ├── LoginPage.tsx
│       │   ├── MemoPage.tsx
│       │   └── SettingsPage.tsx
│       │
│       ├── features/
│       │   ├── auth/
│       │   └── memo/
│       │
│       ├── components/
│       │   └── layout/
│       │
│       ├── types/
│       └── styles/
│
└── backend/
    ├── go.mod
    ├── go.sum
    │
    ├── cmd/
    │   └── memo-api/
    │       └── main.go
    │
    ├── internal/
    │   ├── app/
    │   ├── auth/
    │   ├── config/
    │   ├── database/
    │   ├── httpapi/
    │   ├── memo/
    │   └── session/
    │
    ├── migrations/
    │   └── 001_initial.sql
    │
    └── deploy/
        ├── memo-api.service
        └── nginx.conf
```

不要创建复杂的 DDD/Clean Architecture 层级。

项目规模很小，应保持：

```text
handler
service
repository
database
```

即可。

---

# 6. Memo 数据模型

业务模型：

```ts
interface Memo {
  id: number
  title: string
  tags: string[]
  content: string
  createdAt: string
  updatedAt: string
}
```

限制：

```text
title:
1 ~ 200 Unicode 字符

tags:
最多 20 个

单个 tag:
1 ~ 32 Unicode 字符

content:
最大 128 KiB UTF-8
```

标签：

* trim 前后空白；
* 空标签删除；
* 同一 Memo 内标签去重；
* 标签大小写保留；
* 不允许空字符串。

正文：

* 纯文本；
* 保留换行；
* 不实现富文本；
* 不实现 Markdown 渲染器；
* 不转义或修改用户实际保存的正文。

这是为了保证：

```text
复制出来的内容 == 用户保存的原始正文
```

---

# 7. SQLite Schema

## 7.1 memos

```sql
CREATE TABLE memos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    title TEXT NOT NULL,
    tags TEXT NOT NULL DEFAULT '[]',
    content TEXT NOT NULL,

    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE INDEX idx_memos_updated_at
ON memos(updated_at DESC);
```

`tags` 保存 JSON：

```json
["Cloudflare", "TLS", "PKI"]
```

时间统一保存：

```text
Unix milliseconds UTC
```

API 输出 ISO 8601 UTC。

---

# 8. 全文搜索

全文搜索固定使用：

```text
SQLite FTS5
```

禁止：

```text
Elasticsearch
OpenSearch
Meilisearch
Typesense
PostgreSQL FTS
Redis Search
```

---

## 8.1 FTS5 索引

建立：

```sql
CREATE VIRTUAL TABLE memos_fts USING fts5(
    title,
    tags,
    content,
    content='memos',
    content_rowid='id',
    tokenize='trigram'
);
```

使用 external-content FTS table。

SQLite FTS5 官方支持 external-content table，并推荐通过 trigger 保持业务表和全文索引同步。

---

## 8.2 Trigger

必须由数据库保证索引一致性，而不是依赖 Go 业务代码手工更新。

```sql
CREATE TRIGGER memos_ai AFTER INSERT ON memos BEGIN
    INSERT INTO memos_fts(rowid, title, tags, content)
    VALUES (
        new.id,
        new.title,
        new.tags,
        new.content
    );
END;
```

删除：

```sql
CREATE TRIGGER memos_ad AFTER DELETE ON memos BEGIN
    INSERT INTO memos_fts(
        memos_fts,
        rowid,
        title,
        tags,
        content
    )
    VALUES (
        'delete',
        old.id,
        old.title,
        old.tags,
        old.content
    );
END;
```

更新：

```sql
CREATE TRIGGER memos_au AFTER UPDATE ON memos BEGIN

    INSERT INTO memos_fts(
        memos_fts,
        rowid,
        title,
        tags,
        content
    )
    VALUES (
        'delete',
        old.id,
        old.title,
        old.tags,
        old.content
    );

    INSERT INTO memos_fts(
        rowid,
        title,
        tags,
        content
    )
    VALUES (
        new.id,
        new.title,
        new.tags,
        new.content
    );

END;
```

迁移完成后执行：

```sql
INSERT INTO memos_fts(memos_fts) VALUES('rebuild');
```

---

# 9. 搜索规则

用户输入：

```text
q
```

搜索：

```text
title
tags
content
```

全部 Memo。

---

## 9.1 三字符以上

Unicode 字符数：

```text
>= 3
```

使用 FTS5 trigram。

`trigram` 的目的就是支持任意位置的 substring 搜索，而不要求用户完整输入单词。

例如正文：

```text
Authenticated Origin Pulls
```

以下可以匹配：

```text
Origin
gin Pul
Pulls
```

---

## 9.2 一到两个字符

FTS5 trigram 对小于三个 Unicode 字符的查询无法正常提供对应匹配，因此：

```text
1~2 Unicode chars
```

固定退化为：

```sql
SELECT ...
FROM memos
WHERE title LIKE ?
   OR tags LIKE ?
   OR content LIKE ?
ORDER BY updated_at DESC
LIMIT ? OFFSET ?;
```

参数：

```text
%query%
```

必须使用 SQL 参数，不允许字符串拼接。

---

# 10. 搜索排序

FTS 搜索采用 BM25。

权重固定：

```text
title   6.0
tags    3.0
content 1.0
```

查询结构：

```sql
SELECT
    m.id,
    m.title,
    m.tags,
    m.content,
    m.created_at,
    m.updated_at,
    bm25(memos_fts, 6.0, 3.0, 1.0) AS rank
FROM memos_fts
JOIN memos m
    ON m.id = memos_fts.rowid
WHERE memos_fts MATCH ?
ORDER BY
    rank ASC,
    m.updated_at DESC
LIMIT ?
OFFSET ?;
```

FTS query 必须以**literal phrase**形式安全构造。

不要直接把用户输入作为完整 FTS query language 执行。

---

# 11. SQLite 运行参数

数据库连接初始化必须执行：

```sql
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
PRAGMA foreign_keys=ON;
PRAGMA busy_timeout=5000;
```

设置连接池：

```go
db.SetMaxOpenConns(4)
db.SetMaxIdleConns(4)
```

这是一个单实例 SQLite 服务，不设计多节点共享数据库。

---

# 12. 数据库 Migration

使用项目自身 migration runner。

Migration SQL 使用：

```go
//go:embed
```

编译进 Go executable。

增加：

```sql
CREATE TABLE schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at INTEGER NOT NULL
);
```

程序启动时：

```text
Open DB
→ PRAGMA
→ migration
→ start HTTP
```

禁止要求用户安装：

```text
golang-migrate CLI
sqlite3 CLI
```

才能启动应用。

---

# 13. 登录模型

项目只有：

```text
一个密码
```

不存在：

```text
username
email
user id
role
permission
organization
```

登录页面只有：

```text
Password
Unlock
```

---

# 14. 密码存储

数据库：

```sql
CREATE TABLE auth_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),

    password_hash TEXT NOT NULL,

    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);
```

只允许：

```text
id = 1
```

密码使用：

```text
Argon2id
```

不得使用：

```text
明文
MD5
SHA1
SHA256(password)
bcrypt
```

Go 使用：

```text
golang.org/x/crypto/argon2
```

该包直接提供 Argon2 和 Argon2id 派生功能。

Hash 必须包含：

```text
algorithm
version
memory
iterations
parallelism
salt
hash
```

编码为标准自描述字符串。

---

# 15. 首次设置密码

后端必须提供 CLI：

```bash
memo-api init
```

执行：

```text
检测数据库
↓
若 password_hash 已存在
    拒绝覆盖

否则
↓
从终端读取 Password
↓
再次确认
↓
Argon2id
↓
写入 SQLite
```

密码不得出现在：

```text
Shell argument
command history
URL
log
```

正常启动：

```bash
memo-api serve
```

如果没有初始化密码：

```text
启动失败
明确提示：
Run "memo-api init" first.
```

---

# 16. Session 模型

不使用 JWT。

使用：

```text
opaque random session token
```

浏览器 Cookie：

```text
256-bit random token
```

生成：

```go
crypto/rand
```

编码：

```text
base64url without padding
```

数据库不保存原 Token。

只保存：

```text
SHA-256(token)
```

---

# 17. sessions 数据表

```sql
CREATE TABLE sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    token_hash BLOB NOT NULL UNIQUE,

    created_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
);

CREATE INDEX idx_sessions_expires_at
ON sessions(expires_at);
```

认证：

```text
Cookie Token
     │
     ▼
SHA-256
     │
     ▼
sessions.token_hash
```

---

# 18. 30 天免密登录

Session：

```text
30 天 sliding expiration
```

满足至少 14 天免密要求。

Cookie：

```http
Set-Cookie:
__Host-memo_session=<token>;
Path=/;
Max-Age=2592000;
Secure;
HttpOnly;
SameSite=Strict
```

不得设置：

```text
Domain
```

因此 Cookie 是：

```text
memo-api.example.com
```

Host-only Cookie。

`__Host-` Cookie 要求 Secure、`Path=/` 且不能声明 Domain，这可以防止其他子域覆盖该 Session Cookie。

---

# 19. Sliding Session

每次认证时：

```text
remaining session lifetime
```

如果：

```text
< 7 days
```

则：

```text
expires_at = now + 30 days
last_seen_at = now
重新发送 30 天 Cookie
```

因此经常使用 Memo 的设备：

```text
基本保持长期登录
```

连续 30 天未使用：

```text
自动退出
```

---

# 20. 禁止 LocalStorage 保存认证数据

禁止：

```text
localStorage.password
localStorage.session
localStorage.token
localStorage.jwt
sessionStorage.token
```

OWASP 明确建议不要把认证 Token、Session ID、JWT 或 refresh token 存放在 Web Storage，并推荐 HttpOnly/Secure/SameSite Cookie。

LocalStorage 只允许保存 UI 配置：

```text
theme
sidebarCollapsed
lastSelectedTag
listDensity
```

---

# 21. 前后端跨域认证

这里必须正确处理：

```text
https://memo.example.com

↓

https://memo-api.example.com
```

二者：

```text
cross-origin
same-site
```

前端所有 API 请求必须：

```ts
fetch(url, {
    credentials: "include"
})
```

MDN 明确指出跨 Origin Fetch 要发送 Cookie 必须设置 `credentials: "include"`。

统一封装：

```text
src/api/client.ts
```

其他代码禁止直接散落调用 `fetch()`。

---

# 22. CORS

Backend CORS 固定：

```text
AllowedOrigin:
https://memo.example.com

AllowCredentials:
true
```

Methods：

```text
GET
POST
PUT
DELETE
OPTIONS
```

Allowed Headers：

```text
Content-Type
X-Memo-CSRF
```

不得：

```http
Access-Control-Allow-Origin: *
```

Credentialed CORS 中，服务器必须返回明确 Origin，而不能使用 wildcard。

---

# 23. CSRF 防御

即使使用 SameSite Cookie，也必须增加 CSRF 防御。

OWASP指出 SameSite 应视为 defense-in-depth，而不能普遍替代 CSRF 防御。

所有：

```text
POST
PUT
DELETE
```

请求必须同时满足：

```http
Origin: https://memo.example.com
Content-Type: application/json
X-Memo-CSRF: 1
```

前端 API Client 对 mutation 自动加入：

```http
X-Memo-CSRF: 1
```

后端 middleware 必须验证：

```text
Origin == configuredFrontendOrigin
```

否则：

```text
403 Forbidden
```

所有：

```text
GET
HEAD
```

严格禁止修改服务器状态。

---

# 24. Login Brute Force 防护

`POST /api/v1/auth/login`

必须限流：

```text
10 requests / minute
```

采用全局内存 limiter。

因为整个应用只有一个用户，不建立复杂分布式 Rate Limit。

返回：

```text
429 Too Many Requests
```

不得在响应中区分：

```text
password 不存在
hash 不存在
用户不存在
```

只返回：

```text
Invalid password
```

---

# 25. API

Base：

```text
/api/v1
```

---

## 25.1 Health

```http
GET /healthz
```

无需登录。

响应：

```json
{
  "status": "ok"
}
```

---

## 25.2 Login

```http
POST /api/v1/auth/login
```

Request：

```json
{
  "password": "..."
}
```

成功：

```http
204 No Content
```

同时：

```text
Set-Cookie
```

失败：

```http
401
```

---

## 25.3 Session 状态

```http
GET /api/v1/auth/session
```

登录：

```json
{
  "authenticated": true
}
```

未登录：

```http
401
```

---

## 25.4 Logout

```http
POST /api/v1/auth/logout
```

行为：

```text
删除当前 session
清除 Cookie
```

成功：

```http
204
```

---

# 26. Memo API

## 获取 Memo

```http
GET /api/v1/memos
```

Query：

```text
q
tag
limit
offset
```

默认：

```text
limit = 30
offset = 0
```

最大：

```text
limit = 100
```

---

## 无搜索词

```text
q empty
```

按照：

```text
updated_at DESC
```

排序。

---

## 有搜索词

自动：

```text
1~2 chars → LIKE
>=3 chars → FTS5
```

---

## Response

```json
{
  "items": [
    {
      "id": 12,
      "title": "Cloudflare mTLS",
      "tags": [
        "Cloudflare",
        "PKI"
      ],
      "content": "ssl_client_certificate ...",
      "createdAt": "2026-09-09T10:00:00Z",
      "updatedAt": "2026-09-09T11:00:00Z"
    }
  ],
  "pagination": {
    "limit": 30,
    "offset": 0,
    "hasMore": false
  }
}
```

为了满足**一键即时复制**：

> Memo 列表和搜索响应直接包含完整正文。

点击复制时不得再次请求 API。

---

# 27. 创建 Memo

```http
POST /api/v1/memos
```

Request：

```json
{
  "title": "Example",
  "tags": [
    "Go",
    "DNS"
  ],
  "content": "example content"
}
```

Response：

```http
201 Created
```

返回完整 Memo。

---

# 28. 获取单个 Memo

```http
GET /api/v1/memos/{id}
```

Response：

```text
200
404
```

---

# 29. 更新 Memo

```http
PUT /api/v1/memos/{id}
```

整体更新：

```json
{
  "title": "Example",
  "tags": [
    "Go"
  ],
  "content": "..."
}
```

Response：

```text
200
```

---

# 30. 删除 Memo

```http
DELETE /api/v1/memos/{id}
```

Response：

```http
204
```

前端必须使用：

```text
Popconfirm
```

确认。

---

# 31. Tag API

增加：

```http
GET /api/v1/tags
```

返回：

```json
{
  "items": [
    {
      "name": "Cloudflare",
      "count": 12
    },
    {
      "name": "Go",
      "count": 8
    }
  ]
}
```

排序：

```text
count DESC
name ASC
```

使用 SQLite：

```text
json_each(tags)
```

聚合。

不建立独立 Tags 数据表。

---

# 32. Error 格式

所有业务错误统一：

```json
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "Invalid request."
  }
}
```

常见 code：

```text
INVALID_REQUEST
UNAUTHORIZED
FORBIDDEN
NOT_FOUND
RATE_LIMITED
CONTENT_TOO_LARGE
INTERNAL_ERROR
```

不要向前端暴露：

```text
SQL error
stack trace
database path
Argon2 internal errors
Go panic
```

---

# 33. HTTP Middleware 顺序

固定：

```text
Request ID
↓
Recoverer
↓
Security Headers
↓
CORS
↓
Body Size Limit
↓
Router
↓
Auth middleware
↓
CSRF middleware where required
↓
Handler
```

Body 最大：

```text
256 KiB
```

---

# 34. 前端整体页面

整个系统只有三个主要页面：

```text
/login
/
/settings
```

Memo 新建和编辑不需要独立传统页面。

使用：

```text
/
```

完成主要操作。

---

# 35. Login 页面

必须极简。

Desktop：

```text
┌──────────────────────────────────────────────┐
│                                              │
│                  Memo                        │
│                                              │
│          ┌────────────────────┐              │
│          │ Password           │              │
│          └────────────────────┘              │
│                                              │
│              [ Unlock ]                      │
│                                              │
└──────────────────────────────────────────────┘
```

使用：

```text
Card
Form
Input.Password
Button
```

Enter：

```text
提交
```

登录成功：

```text
navigate("/")
```

---

# 36. 主界面核心布局

Desktop：

```text
┌─────────────────────────────────────────────────────────────────────┐
│ Memo      [ Search all memos................ ]   [+ New] [Settings] │
├──────────────┬───────────────────────┬──────────────────────────────┤
│              │                       │                              │
│   Tags       │      Memo List        │        Memo Detail           │
│              │                       │                              │
│ All          │  Cloudflare TLS       │ Cloudflare TLS               │
│ Cloudflare   │  Go DNS               │ [Cloudflare] [TLS]           │
│ Go           │  Docker               │                              │
│ Linux        │                       │ ssl_client_certificate...    │
│              │                       │                              │
│              │                       │              [Copy] [Edit]   │
│              │                       │                              │
└──────────────┴───────────────────────┴──────────────────────────────┘
```

这是 Desktop 标准布局。

---

# 37. 响应式规则

使用：

```text
Ant Design Grid.useBreakpoint()
```

不要自行定义另一套 breakpoint 系统。

---

## >= 1200px

三栏：

```text
Tags       220px
Memo List  360px
Detail     remaining
```

---

## 768px ~ 1199px

两栏：

```text
Memo List
Memo Detail
```

Tags 进入：

```text
Drawer
```

---

## < 768px

单栏。

默认：

```text
Search
Memo List
```

点击 Memo：

```text
Full-screen Drawer
```

显示正文。

编辑：

```text
Full-screen Drawer
```

不要在手机屏幕强制保留多栏。

---

# 38. Header

Header 包含：

```text
Logo / Memo
Search
New Memo
Tag filter button
Settings
```

搜索框：

Desktop：

```text
center / flexible width
max-width: 720px
```

Mobile：

```text
占据独立一行
width: 100%
```

---

# 39. 全局搜索交互

搜索框：

```text
Ctrl + K
Cmd + K
```

直接聚焦。

输入：

```text
150 ms debounce
```

最少：

```text
1 character
```

即搜索。

流程：

```text
onChange
↓
150ms debounce
↓
queryKey = ["memos", q, tag, offset]
↓
TanStack Query
↓
GET /api/v1/memos?q=...
```

TanStack Query 用于异步查询缓存、共享和 refetch。

新搜索词出现时：

```text
取消旧请求
```

API Client 必须支持：

```text
AbortSignal
```

---

# 40. 搜索状态必须进入 URL

例如：

```text
/?q=cloudflare
```

标签：

```text
/?tag=Cloudflare
```

组合：

```text
/?q=certificate&tag=PKI
```

这样支持：

```text
刷新页面
浏览器前进后退
收藏 URL
```

---

# 41. Memo List

使用：

```text
Ant Design List
```

每项显示：

```text
Title
Tags
正文前 2~3 行
Updated time
Copy button
```

Copy 必须始终可见。

Desktop hover 可额外显示：

```text
Edit
Delete
```

Mobile 使用：

```text
Dropdown / More
```

不要塞大量按钮。

---

# 42. Copy

必须使用浏览器：

```ts
navigator.clipboard.writeText(memo.content)
```

成功：

```text
message.success("Copied")
```

失败：

```text
message.error("Copy failed")
```

Clipboard 操作：

```text
不得请求服务器
不得转换内容
不得添加标题
不得添加换行
```

复制内容必须严格：

```text
memo.content
```

---

# 43. Memo Detail

使用：

```text
Typography
Tag
Button
Flex
```

正文：

```css
white-space: pre-wrap;
overflow-wrap: anywhere;
```

必须支持：

* 长 URL；
* JSON；
* Shell command；
* 多行代码；
* 中文；
* Unicode；
* Windows / Linux 换行。

显示不进行 Markdown 渲染。

---

# 44. Memo Editor

编辑使用：

```text
Drawer
```

Desktop：

```text
width ≈ 640px
```

Mobile：

```text
width = 100%
```

字段：

```text
Title
Tags
Content
```

组件：

```text
Form
Input
Select mode="tags"
Input.TextArea
```

Content TextArea：

```text
autoSize:
minRows = 12
maxRows = 32
```

按钮：

```text
Cancel
Save
```

新建和编辑使用同一个 Editor。

---

# 45. 创建 Memo

点击：

```text
+ New
```

立即打开 Editor。

如果当前搜索结果为空：

```text
Empty
+ Create Memo
```

---

# 46. 保存行为

点击 Save：

```text
TanStack Query mutation
↓
POST / PUT
↓
成功
↓
update/invalidate memo query
↓
update/invalidate tags query
↓
关闭 Drawer
↓
message.success
```

不要整页刷新。

---

# 47. 删除行为

点击 Delete：

```text
Popconfirm
↓
DELETE
↓
invalidate list
↓
invalidate tags
↓
清空当前 selection
```

---

# 48. Loading 状态

首次加载：

```text
Skeleton
```

搜索：

不要用全屏 Spin。

旧结果保留，并使用轻量：

```text
loading indicator
```

避免每次敲键盘页面闪烁。

---

# 49. Empty State

无 Memo：

```text
Empty
Create first memo
```

搜索无结果：

```text
No memos found
```

必须区分：

```text
数据库为空
搜索无结果
API 失败
```

---

# 50. TanStack Query 配置

统一 QueryClient：

```text
staleTime = 30 seconds
gcTime = 10 minutes
retry = 1
refetchOnWindowFocus = true
```

Auth Query：

```text
retry = false
```

401：

```text
清理 React Query cache
navigate("/login")
```

---

# 51. 前端 API Client

固定：

```ts
const API_BASE_URL =
    import.meta.env.VITE_API_BASE_URL;
```

Production：

```env
VITE_API_BASE_URL=https://memo-api.example.com
```

统一：

```ts
credentials: "include"
```

Mutation 自动：

```http
Content-Type: application/json
X-Memo-CSRF: 1
```

不得保存 Session Token。

---

# 52. Authentication Bootstrap

App 启动：

```text
React
↓
GET /api/v1/auth/session
↓
200
    ↓
render app

401
    ↓
/login
```

不得：

```text
检查 localStorage token
读取 document.cookie
```

HttpOnly Cookie 本来就不应被 React 读取。

---

# 53. Settings

Settings 页面保持极简：

```text
Change password
Logout
```

Change Password：

```text
Current Password
New Password
Confirm New Password
```

Endpoint：

```http
PUT /api/v1/auth/password
```

修改成功：

```text
删除全部 Sessions
清除当前 Cookie
跳转 /login
```

这是唯一需要的账户设置。

---

# 54. Security Headers

Frontend CDN：

```http
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
X-Frame-Options: DENY
```

CSP：

```text
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data:;
font-src 'self' data:;
connect-src https://memo-api.example.com;
object-src 'none';
base-uri 'none';
frame-ancestors 'none';
form-action 'self';
```

因为 Ant Design 使用 CSS-in-JS：

```text
style-src 'unsafe-inline'
```

允许。

不加载：

```text
Google Fonts
第三方 JS CDN
远程 analytics
```

---

# 55. API Cache

所有认证和 Memo API：

```http
Cache-Control: no-store
```

CDN、代理和浏览器不得缓存 Memo 内容。

---

# 56. Frontend CDN Cache

Vite 生成的 hashed assets：

```text
/assets/*
```

设置：

```http
Cache-Control:
public, max-age=31536000, immutable
```

HTML：

```text
index.html
```

设置：

```http
Cache-Control: no-cache
```

---

# 57. Cloudflare Pages

前端生产环境固定按照：

```text
Cloudflare Pages
```

兼容部署。

Build：

```bash
pnpm install --frozen-lockfile
pnpm build
```

Output：

```text
dist/
```

`public/_redirects`：

```text
/* /index.html 200
```

保证 React Router SPA fallback。

---

# 58. Backend 部署

Go Backend：

```text
systemd
+
reverse proxy
```

默认监听：

```text
127.0.0.1:8080
```

环境变量：

```text
MEMO_LISTEN_ADDR=127.0.0.1:8080
MEMO_DATABASE_PATH=/var/lib/memo/memo.db
MEMO_FRONTEND_ORIGIN=https://memo.example.com
```

只有这些 runtime config。

密码不通过环境变量提供。

---

# 59. systemd

项目提供：

```text
backend/deploy/memo-api.service
```

基本行为：

```text
User=memo
Group=memo

ExecStart=/usr/local/bin/memo-api serve

Restart=on-failure
RestartSec=3
```

Data：

```text
/var/lib/memo/
```

数据库：

```text
/var/lib/memo/memo.db
```

服务用户不得拥有不必要系统权限。

---

# 60. Nginx

API：

```text
memo-api.example.com
```

Reverse proxy：

```text
HTTPS
↓
127.0.0.1:8080
```

必须传：

```text
Host
X-Forwarded-Proto
```

Nginx 不承担应用认证。

---

# 61. Logging

Go 使用：

```text
log/slog
```

JSON logging。

字段：

```text
time
level
request_id
method
path
status
duration
```

禁止记录：

```text
password
Cookie
session token
完整 Authorization
Memo content
```

搜索关键词也默认不记录。

---

# 62. Graceful Shutdown

Go server 必须捕获：

```text
SIGINT
SIGTERM
```

流程：

```text
stop accepting new HTTP requests
↓
HTTP Server Shutdown
↓
close database
↓
exit
```

Shutdown timeout：

```text
10 seconds
```

---

# 63. Frontend Error Boundary

React 根组件必须存在：

```text
Error Boundary
```

严重 UI exception：

使用 Ant Design：

```text
Result
```

显示：

```text
Something went wrong
Reload
```

---

# 64. Accessibility

依赖 Ant Design 自身可访问组件。

另外保证：

```text
所有 icon-only Button 有 aria-label
Form 使用 label
Tab navigation 可用
Enter 可以登录
Esc 可以关闭 Drawer
```

不要通过 div 模拟按钮。

---

# 65. Keyboard Shortcuts

实现：

```text
Ctrl/Cmd + K
→ Search

Ctrl/Cmd + N
→ New Memo

Esc
→ Close active drawer/modal
```

不要拦截输入框正常：

```text
Ctrl+C
Ctrl+V
Ctrl+A
Ctrl+Z
```

---

# 66. Performance 目标

典型数据库：

```text
10,000 Memos
```

应保持良好响应。

目标：

### Search API

Warm DB：

```text
P95 < 100 ms
```

### UI

搜索 debounce：

```text
150 ms
```

### Copy

已加载 Memo：

```text
无网络请求
```

### Initial JS

使用 Vite production build：

```text
tree shaking
code splitting
hashed assets
```

Settings page 使用 lazy route。

---

# 67. 不做前端离线数据库

禁止：

```text
IndexedDB 完整复制服务器数据库
LocalStorage Memo cache
Service Worker 离线数据库同步
```

TanStack Query 可以进行内存缓存。

页面刷新以后重新通过 API 获取数据。

原因：

```text
避免双数据库
避免同步冲突
避免敏感 Memo 长期复制到 Browser Storage
```

---

# 68. Backend Validation

后端始终是最终可信边界。

即使前端已经 Form validation，Go 仍然验证：

```text
title length
tag count
tag length
content size
JSON correctness
ID validity
pagination bounds
search length
```

Frontend validation 只负责 UX。

---

# 69. SQL 安全

所有数据库请求使用：

```text
prepared/parameterized SQL
```

禁止：

```go
"SELECT ... " + input
fmt.Sprintf("... WHERE title = '%s'", input)
```

FTS 用户输入也不得作为 SQL 语句拼接。

---

# 70. Test

## Backend

必须使用：

```bash
go test ./...
```

至少覆盖：

### Memo

```text
create
read
update
delete
pagination
```

### Search

```text
title search
tag search
content search
trigram substring
1-char fallback
2-char fallback
中文
Unicode
update index
delete index
```

### Auth

```text
correct password
wrong password
session
expired session
logout
sliding expiration
```

### Security

```text
allowed Origin
invalid Origin
missing X-Memo-CSRF
invalid Content-Type
CORS
unauthorized request
```

---

# 71. Frontend Test

使用：

```text
Vitest
React Testing Library
```

至少覆盖：

```text
Login
Auth redirect
Memo list
Search input debounce
Create memo
Edit memo
Delete memo
Copy
Mobile drawer behavior
API 401 redirect
```

Clipboard 使用 mock。

---

# 72. README

Codex 最终必须编写完整：

```text
README.md
```

包含：

```text
项目简介
Architecture
Requirements
Frontend development
Backend development
Database initialization
Password initialization
Production build
Cloudflare Pages deployment
Backend deployment
systemd
Nginx
Environment variables
Backup database
Upgrade
Testing
```

---

# 73. 开发环境

Frontend：

```bash
cd frontend
pnpm install
pnpm dev
```

默认：

```text
http://localhost:5173
```

Backend：

```bash
cd backend
go run ./cmd/memo-api init
go run ./cmd/memo-api serve
```

开发环境：

```text
MEMO_FRONTEND_ORIGIN=http://localhost:5173
```

Production：

```text
https://memo.example.com
```

只能配置**一个允许的 Frontend Origin**。

不要：

```text
allow *
allow arbitrary regex origin
```

---

# 74. 完整请求流程

登录：

```text
memo.example.com
      │
      │ password
      ▼
memo-api.example.com
      │
      ├── Argon2id verify
      │
      ├── crypto/rand 256-bit
      │
      ├── SHA256(token) → SQLite
      │
      └── Set-Cookie
              │
              ▼
        Browser Cookie Jar
```

以后：

```text
React
 │
 │ credentials: include
 ▼
memo-api.example.com
 │
 │ Cookie
 ▼
session middleware
 │
 ├── SHA256
 ├── SQLite lookup
 ├── expiry
 └── authenticated
```

---

# 75. 搜索完整流程

```text
User types "cloudflare"
        │
        ▼
React Search Input
        │
        ▼
150ms debounce
        │
        ▼
TanStack Query
        │
        ▼
GET /api/v1/memos?q=cloudflare
        │
        ▼
Go
        │
        ├── Unicode char count
        │
        ├── >=3
        │
        ▼
SQLite FTS5 trigram
        │
        ▼
BM25
        │
        ▼
JSON
        │
        ▼
Ant Design List
```

---

# 76. Copy 完整流程

```text
User presses Copy
       │
       ▼
memo.content
       │
       ▼
navigator.clipboard.writeText()
       │
       ├── success
       │      ↓
       │  "Copied"
       │
       └── failure
              ↓
          "Copy failed"
```

整个流程：

```text
0 API requests
```

---

# 77. 明确禁止实现的功能

本版本禁止 Codex擅自实现：

```text
多用户
用户名
注册
忘记密码邮件
OAuth
OIDC
Google Login
GitHub Login
RBAC
管理员
JWT
Refresh Token
Redis
WebSocket
Collaborative Editing
Markdown Editor
Rich Text Editor
File Attachment
Image Upload
AI
Embedding
Vector Search
Semantic Search
Elasticsearch
Meilisearch
Comments
Memo history
Version control
Sharing links
Public Memo
Offline mode
PWA
Service Worker
Mobile native app
```

这些都不属于第一版本。

---

# 78. 最终产品范围

最终应用只解决五件事情：

```text
登录
↓
找到 Memo
↓
查看 Memo
↓
复制 Memo
↓
创建 / 修改 / 删除 Memo
```

核心原则：

> 搜索、复制和访问速度优先于功能数量。

---

# 79. 最终架构结论

整个系统最终固定为：

```text
Frontend
React 19
TypeScript
Vite 8
Ant Design 6
TanStack Query 5
React Router 8
        │
        │ HTTPS / CORS / Cookie
        ▼
Backend
Go 1.27
chi
        │
        ▼
SQLite
├── memos
├── memos_fts
├── auth_config
├── sessions
└── schema_migrations
```

认证：

```text
Single Password
+
Argon2id
+
Opaque Session
+
HttpOnly Host-only Cookie
+
30-day Sliding Expiration
```

搜索：

```text
SQLite FTS5
+
trigram
+
BM25
+
1~2 char LIKE fallback
```

前端：

```text
Static SPA
+
Cloudflare Pages/CDN
```

部署：

```text
https://memo.example.com
        +
https://memo-api.example.com
```

这是本项目的最终实现方案。

Codex 应根据本文档直接创建一个能够运行、测试、构建和部署的完整项目，而不是继续输出设计讨论。
