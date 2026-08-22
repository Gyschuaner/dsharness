# DSH Web 插件台账

本文件登记 `~/.dsh/profiles/web`（DSH Web GUI，127.0.0.1:3080）上安装的所有插件，
作为版本与回退的唯一本地事实来源。新增/更新插件时同步维护本表，并在 DP（DSH 项目）
登记对应需求或 Bug。

宿主环境：

- **Windows（主开发机，chuansgu，2026-08-22）**：`@deepseek-ai/dsh` 0.1.1-rc.2
  （`D:\Pythonproject\deepseek-harness` 源码构建，`dsh` 全局命令链接到
  `apps/cli`），Node v24.11.1，源码构建使用 pnpm 11.7.0。当前源码与补丁由
  `upstream.lock.json` 锁定；`~/.dsh/profiles/web` 继续作为独立运行配置维护。
- **macOS（gys MacBook，2026-08-17）**：`@deepseek-ai/dsh` 0.1.0-rc.6
  （npm 预构建包，npx 缓存启动 `npm exec @deepseek-ai/dsh@latest web`），
  Node v22.15.0，pnpm 11.19.0。同为裸环境起步（零插件），相关插件
  均已于 2026-08-17 安装（见变更日志与宿主差异）。

## 插件清单

| 插件 | 版本 | 来源 | 安装通道 | 挂载方式 | 关联 DP | 备注 |
|---|---|---|---|---|---|---|
| dsh-skill-manager | 0.1.0（build 10） | 本仓库 `plugins/skill-manager` | `link:` 依赖 + junction | cordis.patch.yml insert（手动） | DSH-001/002/003 | 本地持续开发；`~/.dsh/plugins/skill-manager` 为指向本仓库的 junction |
| dsh-better-sidebar | 0.12.3 | github.com/omdsh-dev/DSH-better-sidebar（v0.12.3，提交 f391566，MIT） | **npm 官方通道** `dsh plugin --profile web add dsh-better-sidebar@latest` | bundle 对账（`dsh.profile.bundles` 自动追加 + 插件自带 `dsh.bundle.patch` insert） | DSH-007 | VSCode 风格侧边栏 + 底部面板（文件/编辑/终端/Git/浏览器/后台任务）；`ctx.betterSidebar` 服务化 |
| dsh-better-sidebar-smooth | 0.1.0 | 本仓库 `plugins/better-sidebar-smooth` | `link:` 依赖 + 符号链接 | cordis.patch.yml insert（手动，BUG-1E130940 注释段） | BUG-1E130940 / DSH-007 | 仅 client：注入 1 条 CSS（session header `padding-right` 过渡与 300ms 布局动画同步），修复侧面板开合时 Session log 胶囊先跳 50px 再滑动的撕裂；上游修复后移除 |

`@deepseek-ai/dsh-vision-bridge` 已进入 DSH-005 锁定源码和 base bundle，但 base 行默认
`disabled: true`，不属于当前 3080 已启用插件。DP Gateway 暴露
`Qwen3.6-35B-A3B` 并完成健康检查后，才按
[`DSH-005-vision-bridge.md`](DSH-005-vision-bridge.md) 合入 profile 覆盖。

## 宿主差异（2026-08-17）

- **Windows**：skill-manager 与 better-sidebar 已安装；skill-manager 为 junction 指向本仓库
  checkout（拉到 main 后即 DSH-006 build 11 扩展页）。better-sidebar-smooth
  未安装（该胶囊动画撕裂在 Windows 宿主同样存在，需要时按 macOS 同法接入）。
- **macOS**：历史上安装过 image-context-guard；同步 DSH-022 后应移除该依赖和挂载。
  skill-manager / better-sidebar-smooth 为 link 通道，`~/.dsh/plugins/<name>` 符号链接 →
  本仓库 `plugins/<name>`（macOS 下的 junction 等价物，
  `dev/setup-plugin-junction.ps1` 仅 Windows 可用，手工 `ln -sfn` 建链）；
  better-sidebar 0.12.3 走 npm 官方通道（与 Windows 同版本）。

## 安装 / 更新 / 回退约定

- **npm 通道插件**（如 dsh-better-sidebar）：
  - 更新：`dsh plugin --profile web add dsh-better-sidebar@latest` → 重启 dsh web。
  - 回退：`dsh plugin --profile web remove <name>`，若 `dsh.profile.bundles` 有残留
    手工删除该条目，重启生效。
  - 版本事实以 profile `package.json` 的依赖声明 + npm 包内容为准；本表登记上游提交便于追溯。
- **本仓库 link 插件**（skill-manager）：按 DSH-003 流程
  （junction + 逐文件哈希校验），见 `dev/setup-plugin-junction.ps1` 与 README「快速开始」。
- **node-pty 前置**：pnpm 默认拦截构建脚本，需白名单放行（DSH-007 添加，
  better-sidebar 终端所需）：pnpm 10 用 `onlyBuiltDependencies: [node-pty]`，
  **pnpm 11 改名为 `allowBuilds: { node-pty: true }`**（macOS 机实测，
  旧键名在 11 下不生效且 pnpm 会在文件里留占位行）。node-pty 1.1.0 自带
  in-tree prebuilds（含 darwin-arm64/pty.node），无需编译器。
  重装依赖后若终端报「node-pty 加载失败」：`pnpm rebuild node-pty` → 重启 dsh web。
- **pnpm 11 供应链门禁（minimumReleaseAge）**：发布不足一定龄期的版本会被
  `@latest` 解析跳过（macOS 机实测：0.12.3 发布次日 `@latest` 仍解析到
  0.12.2）。显式 `add <name>@<版本>` 可绕过，pnpm 自动把该版本写入
  `minimumReleaseAgeExclude`。
- **双挂载检查**：`~/.dsh/profiles/web/cordis.patch.yml` 中不得出现与 npm 通道插件
  重复的手工 insert 行（better-sidebar 无手工行；skill-manager 为 link 通道，
  手工行是唯一挂载点）。
- **重启边界**：host 半变化（新插件、bundle 变更、host 代码更新）需重启 dsh web
  （`.\restart-dsh-web.ps1`，会话持久化在磁盘、可恢复）；client 半变化硬刷新浏览器即可。

## 变更日志

- **2026-08-22（DSH-022）**：Windows 生产 profile 移除 `dsh-image-context-guard`
  依赖和 `cordis.patch.yml` 挂载，恢复 0.1.1 原生图片准入；视觉桥单次调用上限同步为
  20 张。旧插件源码仅保留历史回溯，不再属于已安装插件。

- **2026-08-17（macOS 宿主装 better-sidebar-smooth，BUG-1E130940）**：
  本地 CSS 补丁插件修复 better-sidebar 0.12.3 侧面板开合时 Session log
  胶囊动画撕裂（根因：session header `padding-right` 78px↔28px 翻转无
  过渡，与 `#root` margin 300ms 动画失步；GUI 实测确认两态数值与
  `transition: all` 0s）。插件仅 client 半（1 条 CSS，host 半 no-op），
  走 link 通道 + cordis.patch.yml insert；用户层热监听，**无需重启**，
  刷新页面即生效（离线树无警告、bundle HTTP 200、boot manifest 已含
  插件行）。待上游修复后整体移除。
- **2026-08-17（macOS 宿主装 better-sidebar，DSH-007）**：macOS 宿主安装
  dsh-better-sidebar 0.12.3（npm 官方通道，与 Windows 同版本；显式指定版本
  绕过 pnpm 11 minimumReleaseAge 门禁，见约定节）。pnpm-workspace.yaml
  添加 `allowBuilds: { node-pty: true }`（pnpm 11 键名）；`pnpm rebuild
  node-pty` 走 in-tree darwin-arm64 prebuild，`require('node-pty')` 实测
  加载成功。bundles 对账后 `dsh.profile.bundles` = base / web-app /
  dsh-better-sidebar；`--dump-config` 离线树含 better-sidebar bundle 层、
  无警告；双挂载检查通过（cordis.patch.yml 无其手工行）。
  **bundle 层变更不热加载**（用户层 cordis.patch.yml 才热监听），需重启
  dsh web 生效——macOS 无 restart 脚本，手动 Ctrl+C 后重跑
  `npm exec @deepseek-ai/dsh@latest web`。
- **2026-08-17（macOS 宿主接入，DSH-007 台账维护 / DSH-001 / DSH-004）**：
  macOS 宿主安装 dsh-skill-manager 0.1.0（build 11）与 dsh-image-context-guard
  0.1.0。通道：`~/.dsh/plugins/<name>` 符号链接 → 本仓库 +
  `dsh plugin --profile web add`（`link:` 依赖，零拷贝）+ `cordis.patch.yml`
  手工 insert（`- insert:` 形式；rc.6 patch 引擎对无 `insert` 的顶层条目按
  覆义查找处理、找不到即静默跳过，README 旧写法不可用）。用户层热监听，
  **未重启即生效**：`/api/skill-manager` getPolicy/list 返回 200（apiVersion 5、
  4 roots、policy 在），client bundle 已注入所服务页面（`/plugins/dsh-skill-manager/client.js`），
  `dsh --profile web --dump-config` 离线树两行齐备、无警告。
  image-context-guard 无 HTTP 面，加载由同一热加载路径完成（进程健康、
  无 host 报错）；其 9 张上限逻辑以仓库内 8 项自动化测试为证。
- **2026-08-17（DSH-007）**：安装 dsh-better-sidebar 0.12.3（npm 官方通道）；
  修复 node-pty 原生缺失（onlyBuiltDependencies + rebuild，预编译 conpty
  1.23.251008001）；验证 spawn（powershell.exe / cmd.exe 绝对路径）与 shell 解析链
  （pwsh 7.6.4 in PATH → powershell.exe 回退）。运行态验证（重启后）见 DSH-007 测试计划。
