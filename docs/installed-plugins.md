# DSH Web 插件台账

本文件登记 `~/.dsh/profiles/web`（DSH Web GUI，127.0.0.1:3080）上安装的所有插件，
作为版本与回退的唯一本地事实来源。新增/更新插件时同步维护本表，并在 DP（DSH 项目）
登记对应需求或 Bug。

宿主环境（2026-08-17）：`@deepseek-ai/dsh` 0.1.0-rc.6（npm 预构建包），
Node v24.11.1，pnpm 10.22.0（`~/.dsh/profiles/web` 为 hoisted linker，
`autoInstallPeers: false`，原生构建脚本经 `onlyBuiltDependencies` 白名单放行）。

## 插件清单

| 插件 | 版本 | 来源 | 安装通道 | 挂载方式 | 关联 DP | 备注 |
|---|---|---|---|---|---|---|
| dsh-skill-manager | 0.1.0（build 10） | 本仓库 `plugins/skill-manager` | `link:` 依赖 + junction | cordis.patch.yml insert（手动） | DSH-001/002/003 | 本地持续开发；`~/.dsh/plugins/skill-manager` 为指向本仓库的 junction |
| dsh-image-context-guard | 0.1.0 | 本仓库分支 `fix/BUG-3E5CFD04-image-context-guard`（提交 aa85d62） | `link:` 指向 `~/.dsh/plugin-cache/image-context-guard-aa85d62` | cordis.patch.yml insert（手动，DSH-004 注释段） | DSH-004 / BUG-3E5CFD04 | 模型请求图片上限 9 张；cache 目录名 = 源提交短哈希 |
| dsh-better-sidebar | 0.12.3 | github.com/omdsh-dev/DSH-better-sidebar（v0.12.3，提交 f391566，MIT） | **npm 官方通道** `dsh plugin --profile web add dsh-better-sidebar@latest` | bundle 对账（`dsh.profile.bundles` 自动追加 + 插件自带 `dsh.bundle.patch` insert） | DSH-007 | VSCode 风格侧边栏 + 底部面板（文件/编辑/终端/Git/浏览器/后台任务）；`ctx.betterSidebar` 服务化 |

## 安装 / 更新 / 回退约定

- **npm 通道插件**（如 dsh-better-sidebar）：
  - 更新：`dsh plugin --profile web add dsh-better-sidebar@latest` → 重启 dsh web。
  - 回退：`dsh plugin --profile web remove <name>`，若 `dsh.profile.bundles` 有残留
    手工删除该条目，重启生效。
  - 版本事实以 profile `package.json` 的依赖声明 + npm 包内容为准；本表登记上游提交便于追溯。
- **本仓库 link 插件**（skill-manager / image-context-guard）：按 DSH-003 流程
  （junction + 逐文件哈希校验），见 `dev/setup-plugin-junction.ps1` 与 README「快速开始」。
- **node-pty 前置**：pnpm 10 默认拦截构建脚本；profile `pnpm-workspace.yaml` 已有
  `onlyBuiltDependencies: [node-pty]`（DSH-007 添加，better-sidebar 终端所需）。
  重装依赖后若终端报「node-pty 加载失败」：`pnpm rebuild node-pty` → 重启 dsh web。
- **双挂载检查**：`~/.dsh/profiles/web/cordis.patch.yml` 中不得出现与 npm 通道插件
  重复的手工 insert 行（better-sidebar 无手工行；skill-manager / image-context-guard
  为 link 通道，手工行是唯一挂载点）。
- **重启边界**：host 半变化（新插件、bundle 变更、host 代码更新）需重启 dsh web
  （`.\restart-dsh-web.ps1`，会话持久化在磁盘、可恢复）；client 半变化硬刷新浏览器即可。

## 变更日志

- **2026-08-17（DSH-007）**：安装 dsh-better-sidebar 0.12.3（npm 官方通道）；
  修复 node-pty 原生缺失（onlyBuiltDependencies + rebuild，预编译 conpty
  1.23.251008001）；验证 spawn（powershell.exe / cmd.exe 绝对路径）与 shell 解析链
  （pwsh 7.6.4 in PATH → powershell.exe 回退）。运行态验证（重启后）见 DSH-007 测试计划。
