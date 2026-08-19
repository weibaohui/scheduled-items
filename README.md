# dsh-plugin-scheduled-items

DeepSeek Harness 插件：**cron 定时事项**。每个事项包含标题、提示词、croner 表达式，可绑定一个工作区；定时或立即执行时，在一个全新的 agent 会话中提交提示词（绑定工作区时会话跑在该工作区目录下并挂到该工作区分组）。带全屏管理界面（列表 + 增删改查 + 立即执行）。

## 安装

### 通过 `dsh plugin add`（推荐，GitHub 或 npm）

```bash
dsh plugin --profile web add github:<你的账号>/dsh-plugin-scheduled-items
```

或发布到 npm 后：

```bash
dsh plugin --profile web add dsh-plugin-scheduled-items
```

`dsh plugin` 会在 profile 目录转发给 pnpm，并将包调和进 profile 的 bundle 列表（`dsh.profile.bundles`）。包内 `cordis.patch.yml`（经 `package.json` 的 `dsh.bundle.patch` 声明）随后把插件行插入宿主组合；`dsh.client` 声明则让 web 外壳加载 `client/bundle.js` 作为管理界面。

### 作为组合插件（持久化，手动）

在你的 profile 的宿主组合（`cordis.patch.yml`）中添加：

```yaml
- insert:
    - id: scheduled-items
      name: 'dsh-plugin-scheduled-items'
```

或不安装包、以相对路径指向本仓库。本插件属于 **Host 平面**：它读取 Host 的 `storageDomain`、`workspaceRegistry`、`agents`、`agentDefaultModel`、`webServer` 服务，并注册设置页与全屏管理界面，因此应放在**宿主组合**中，而不是某个 agent preset 内。

### 作为动态插件（开发 / 会话级）

`code.host` 的函数体即 `src/index.js` 去掉 `module.exports` 包装；`code.client` 的函数体即 `client/index.js` 去掉包装。

## 功能

- **事项 CRUD**：标题、提示词、cron 表达式、启用开关、绑定工作区。
- **立即执行 / 定时执行**：执行时新建 agent 会话并提交提示词（croner 调度）。
- **工作区归属**：绑定工作区的事项，执行会话 cwd = 工作区路径，且 `workspace.attachSession()` 挂到该工作区分组。
- **持久化**：走 storage-domain（domain `scheduled_items`）；web 组合可将其路由到 SQLite 后端。
- **管理界面**：侧边栏底部「定时事项」按钮打开全屏管理页；设置页也有同一管理面。

## HTTP API

Host 半端在 `/scheduled-items/api` 注册一个 prefix route：

| 方法 | 路径 | body | 返回 |
|---|---|---|---|
| GET | `/scheduled-items/api` | — | `{ items }` |
| POST | `/scheduled-items/api` | `{ title, prompt, cron, enabled, workspaceId? }` | `{ item }` |
| PATCH | `/scheduled-items/api` | `{ id, ...patch }` | `{ item }` |
| DELETE | `/scheduled-items/api` | `{ id }` | `{ removed: true }` |
| POST | `/scheduled-items/api/run` | `{ id }` | `{ item }` |

## 开发

```bash
npm install
npm run check    # 语法检查两个半端
npm test         # 离线测试套件
npm run build:client   # 从 client/index.js 构建 client/bundle.js
```

## 依赖

运行时只依赖普通 npm 包：`croner`（调度）、`zod`（记录 schema）。不依赖任何 `@deepseek-ai/dsh-*` 包——Host 半端通过 `ctx.*` 运行时服务访问 harness 能力，因此不受 npm 上 dsh 包发布进度影响。

## License

MIT
