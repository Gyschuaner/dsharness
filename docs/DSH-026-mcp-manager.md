# DSH-026 / DSH-028 MCP Manager 技术实现

## 结论

`dsh-mcp-manager` 作为独立动态 Cordis 插件实现，extension-manager 仅保留通用全页壳和
Plugin 占位。插件覆盖 MCP 服务器配置、运行态投影、工具清单和精选市场；不修改 DSH
原生 `@deepseek-ai/dsh-mcp-client`，也不创建第二套 MCP 连接器。

## 组合边界

```text
dsh-extension-manager
└─ extension.manager.section (list, root)
   └─ mcp ← dsh-mcp-manager client

dsh-mcp-manager host
├─ /api/mcp-manager
├─ pluginInventory.list() ── Loader 行 / enabled / fiberPhase
├─ tools.schemas() ───────── mcp__<serverName>__* 工具投影
├─ GitHub REST API ───────── 仓库元数据 / avatar / release
├─ MCP Registry v0.1 ─────── server.json / 可信图标
└─ web/cordis.patch.yml ──── 唯一受管区块
```

## Host API

所有请求使用 `POST /api/mcp-manager`，请求体最大 128 KiB，响应为
`{ ok, value }` 或 `{ ok: false, error: { code, message } }`。

| op | 用途 |
|---|---|
| `capabilities` | API 版本与功能协商 |
| `list` | 当前 profile、服务器、真实状态和工具投影 |
| `create` / `update` | 校验并写入服务器配置 |
| `setEnabled` | 启停配置；启用前检查 requiredEnv |
| `reconnect` | 触碰 revision，借助 Cordis patch HMR 重载 |
| `delete` | 从受管区块删除服务器行 |
| `marketplace` | 5 个精选仓库的去噪首页数据 |
| `marketplace.detail` | GitHub/Registry/Release 详情 |
| `marketplace.install` | 导入经审阅配置，默认停用 |

## 配置写入

- Manager 只拥有 `# mcp-manager:servers:start` 与 `# mcp-manager:servers:end` 之间的内容。
- 每行通过 `# mcp-manager:server <JSON>` 保存无密钥、可回读的规范模型；运行行由模型生成。
- 采用同目录临时文件 + rename 原子替换；写入失败时原文件保持不变。
- 标记损坏、元数据损坏、重复 ID/名称、非法 URL、相对 cwd 或非法环境变量引用均拒绝写入。
- 只允许 HTTPS 远程端点；`localhost` / `127.0.0.1` / `::1` 可使用 HTTP。
- stdio 参数以数组写入 MCP client 配置，不经过 Manager shell 拼接。

## 凭据与供应链边界

- UI 和 API 只接收环境变量名；header/env 生成 `!!js process.env.NAME`，不保存秘密值。
- 安装按钮只写入停用配置，不执行 `npx`、Docker 或任何第三方程序。
- 一个仓库含多个服务器、无法确定唯一启动配置时不提供一键安装。
- Registry 图标只接受受信主机上的 HTTPS PNG/JPEG/WebP；拒绝 SVG。无图标时回退 GitHub
  owner avatar，仍不可用时使用 DSH primitives 的通用链接图标。
- GitHub 与 Registry 元数据缓存 10 分钟；刷新失败时显示旧缓存并标记 stale，不影响本地服务器管理。

## 状态语义

MCP client 当前没有暴露“最后检测”“重试次数”或结构化握手错误。因此页面只展示可验证事实：

- 未启用配置：`disabled`
- requiredEnv 缺失：`needs-environment`
- Loader `loading/pending`：`connecting`
- Loader `failed`：`failed`
- Loader `unloading`：`disconnecting`
- Loader `active` 且有工具：`connected`
- Loader `active` 且无工具：`connected-empty`
- 找不到运行行：`not-loaded`

工具清单只读取 `tools.schemas()` 中以 `mcp__<serverName>__` 开头的 schema。

## UI 决策

- 延续 Skill Manager 的轻量 DSH 风格：188 px 类型导航、扁平列表、低饱和选中态、400 px 右抽屉。
- 服务器页保留状态、传输、工具数和启停，不显示无可靠来源的列。
- 市场首页只保留搜索、真实图标、仓库名和一句描述；GitHub/Registry 字段放入抽屉。
- 桌面端抽屉打开时为主内容预留 400 px，表格列不会被覆盖；窄屏抽屉改为覆盖式。
- 操作图标全部使用 `@deepseek-ai/dsh-client-ui-primitives`，无内联 SVG 或 CSS 图标。

## 验证记录（2026-08-24）

- `node --check`：extension-manager client 与 mcp-manager 4 个运行文件通过。
- 基于最新 `origin/main`（含 Plugin Manager）全量插件测试：94 tests，90 passed，
  4 skipped（Windows 权限/符号链接条件），0 failed。
- MCP Manager 自有测试：11/11 passed，覆盖路由、受管配置、原子写、安全校验、状态投影、
  环境变量门禁、图标优先级、缓存、停用安装和真实 bundle DOM 交互。
- 隔离 `DSH_HOME` Cordis 解析：extension-manager、mcp-manager 和 disabled mcp-client 行解析成功；
  `!!js process.env.MCP_DOCS_AUTHORIZATION` 保持表达式，未出现秘密值。
- in-app Browser：1488×1058 两轮来源对比；市场详情、真实图标、安装回写、环境变量失败、
  服务器详情、900/720/640 响应式均通过；fresh tab console 0 error / 0 warn。
- 变基到最新 `origin/main` 后，隔离 profile 同时加载 extension-manager、skill-manager、
  mcp-manager 与 plugin-manager；左导航只出现三个真实业务分区，MCP 市场与 GitHub 详情
  再次冒烟通过，fresh tab console 仍为 0 error / 0 warn。
- 视觉报告：[design-qa.md](../design-qa.md)，`final result: passed`。

## 发布边界

本次只在隔离 profile 的 3180 端口完成本地验证。未改动用户的 web profile，未合并 `sit`
或 `main`，未部署生产。正式接入需安装 `dsh-mcp-manager` link 依赖、插入独立 Cordis 行并
重启一次 web Host；之后服务器区块更新由 Cordis HMR 生效。
