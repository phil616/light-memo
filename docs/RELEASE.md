# 自动发布后端

工作流位于 [release.yml](../.github/workflows/release.yml)。

## 触发与版本

- 推送 `backend/**` 或发布工作流的修改到 `main` 时自动运行；合并 PR 到 `main` 同样适用。
- 也可在 GitHub Actions 中选择 **Release Linux amd64 backend → Run workflow**，分支选 `main`。其他分支不会发布。
- 首次版本为 `v0.1.0`。之后读取仓库最大的正式 `v主版本.次版本.补丁版本` 标签，递增补丁号；忽略预发布及其他格式标签。
- 标签固定指向触发工作流的提交。重复运行同一提交复用现有正式标签，不重复创建版本。
- 工作流串行发布且不取消正在运行的发布，避免同时计算版本。高频推送时 GitHub 可能替换尚未开始的排队运行。

## 唯一上传产物

`memo-api-linux-amd64`：Linux x86-64 静态二进制，设置 `GOOS=linux`、`GOARCH=amd64`、`CGO_ENABLED=0`。

不安装 Node.js，不构建前端，不构建其他架构或操作系统，不上传压缩包、校验文件或 Actions 构建附件。GitHub 自动显示的 Source code ZIP/TAR 是平台提供的源码下载，不是工作流构建或上传的产物。

发布前执行后端 `go test ./...` 和 `go vet ./...`。Go 版本读取 `backend/go.mod`。检查和构建成功后才推送标签；先创建草稿并上传二进制，再公开 Release。失败后重新运行可复用标签和草稿，已公开的 Release 不会被覆盖。

## 权限与使用

使用仓库自带 `GITHUB_TOKEN`，工作流声明 `contents: write`，无需添加个人访问令牌。仓库或组织规则须允许工作流创建标签和 Release。工作流直接完成打标签与发布，不依赖标签推送触发第二个工作流。

下载发布附件后：

```bash
chmod +x memo-api-linux-amd64
./memo-api-linux-amd64 init   # 仅首次初始化
./memo-api-linux-amd64 serve
```

已有数据库无需重新初始化。保持相同工作目录或显式设置 `MEMO_DATABASE_PATH`。

发布步骤使用 GitHub CLI 的 [release create](https://cli.github.com/manual/gh_release_create) 创建草稿和自动生成说明，再上传附件并公开。
