# Memo

单用户个人备忘录：中文响应式界面、全文搜索、原文复制与编辑、变量模板。
前端使用 React + Ant Design，后端使用 Go + SQLite，独立部署。

## 快速启动

需要 Go 1.27.1、Node.js 24.14+ 和 pnpm 10.32.1。

**后端**

```bash
cd backend
go run ./cmd/memo-api init   # 仅首次运行，交互设置密码
go run ./cmd/memo-api serve
```

默认监听 `127.0.0.1:8080`，数据库为 `memo.db`，始终允许任意跨域来源，无需配置来源白名单。

**前端**

```bash
cd frontend
cp .env.example .env
# 编辑 .env 中的 VITE_API_BASE_URL，设为后端地址
pnpm install --frozen-lockfile
pnpm dev
```

访问 `http://localhost:5173`。API 地址修改后需重启开发服务或重新构建；构建时 CSP 自动同步。

## 文档

- [使用、配置、部署与测试](docs/GUIDE.md)
- [自动打标签与后端发版](docs/RELEASE.md)
- [变量模板使用与 API](docs/TEMPLATES.md)
- [当前实现约定](docs/SPEC.md)
- [初始设计方案](docs/PLAN.md)
