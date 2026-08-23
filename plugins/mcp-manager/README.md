# dsh-mcp-manager

DeepSeek Harness 的 MCP 服务器管理与精选市场插件（DSH-026 / DSH-028）。插件向
`dsh-extension-manager` 的 `extension.manager.section` 注册 `mcp` 页面，并通过独立
Host 路由 `/api/mcp-manager` 管理 web profile 中的 MCP 服务器行。

## 页面能力

- **服务器**：查看配置、Loader 运行阶段、真实投影的工具清单和启停状态；新增、编辑、
  删除或触发 Cordis 热重载。
- **市场**：以去噪的 GitHub 仓库列表展示 5 个精选入口；详情抽屉按需读取 GitHub 与
  MCP Registry 元数据，包括项目图标、作者、语言、许可证、Stars/Forks、Topics 和最新发布。
- 图标优先级是 MCP Registry 的可信 HTTPS 位图、GitHub owner avatar、通用链接图标。
  SVG 和非可信远程域不会直接渲染。

## 配置所有权

运行配置仍以 `~/.dsh/profiles/web/cordis.patch.yml` 为唯一事实来源。Manager 只改写
以下标记之间的区块，区块外内容逐字保留：

```yaml
# mcp-manager:servers:start
- insert:
  # mcp-manager:server {"id":"mcp-manager-example",...}
  - id: 'mcp-manager-example'
    name: '@deepseek-ai/dsh-mcp-client'
    disabled: true
    config:
      serverName: 'example'
      transport: 'streamable-http'
      url: 'https://example.com/mcp'
      headers:
        'Authorization': !!js process.env.EXAMPLE_AUTHORIZATION
      toolCallTimeoutMs: 60000
      failOnStartupError: false
# mcp-manager:servers:end
```

写入使用同目录临时文件 + 原子替换；受管区块不完整或元数据损坏时拒绝继续写入。

## 状态口径

页面不会虚构 MCP client 尚未暴露的数据：

- Cordis `pluginInventory` 提供配置行、启用状态和 `fiberPhase`。
- `tools.schemas()` 中 `mcp__<serverName>__*` 的条目构成该服务器工具清单。
- `active` 且有工具显示“已连接”；`active` 且无工具显示“已加载 · 无工具”。
- Loader 的 `loading` / `pending` / `failed` / `unloading` 分别映射为连接中、加载失败和断开中。
- 当前版本不展示重试次数、最后探测时间或 MCP 协议握手错误，因为 Host 没有可靠来源。

## 密钥边界

表单只接收环境变量**名称**，不接收或持久化秘密值。stdio 的 `env` 和 HTTP 的
`headers` 都生成为 `!!js process.env.NAME`。启用带 `requiredEnv` 的配置前，Host 会
检查当前进程环境；缺失时拒绝启用并指出变量名。

市场“安装”只是导入经过审阅的配置，且一律默认停用；点击安装不会运行 `npx`、Docker
或其他第三方程序。一个仓库包含多个 Server、无法安全推导单一配置时，只允许跳转 GitHub。

## 本地挂载

先确保 `dsh-extension-manager` 已挂载，然后安装本插件：

```powershell
.\dev\setup-plugin-junction.ps1 -PluginName mcp-manager
dsh plugin --profile web add "link:D:\Pythonproject\dsharness\plugins\mcp-manager" --ignore-scripts
```

再向 web profile 的 `cordis.patch.yml` 插入独立能力行：

```yaml
- insert:
  - id: mcp-manager
    name: 'dsh-mcp-manager'
```

首次新增 Host 插件需要重启 `dsh web`；之后服务器配置写入由用户层 patch 热加载。

## 验证

```powershell
node --check plugins/mcp-manager/lib/index.js
node --check plugins/mcp-manager/lib/state.js
node --check plugins/mcp-manager/lib/client.js
node --test plugins/mcp-manager/test/*.test.js
dsh --profile web --dump-config
```

DOM 测试使用 DSH 源码树中的真实 React、React DOM 和 JSDOM 依赖；默认查找与本仓库
同级的 `deepseek-harness`，也可通过 `DSH_SOURCE_DIR` 指定。
