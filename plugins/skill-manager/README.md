# dsh-skill-manager

DeepSeek Harness 的扩展管理插件：在 Web GUI **侧边栏底部**新增「扩展」一级入口，
点开全页「扩展」视图，统一管理 DSH 的扩展能力（DSH-006）。

- **SKILL 分区**（一期）：原「Skills 技能管理」页面整体迁入，功能不变（见下方功能列表）。
- **MCP / Plugin 分区**（一期占位）：显示「建设中」占位页，规划能力见「规划」。
- 设置页内旧「Skills 技能管理」入口已移除（build 11，DSH-006）。

## 页面结构（build 11 / DSH-006）

- **入口**：侧边栏底部 `sidebar.footer.action` 插槽（增量式，与 Cordis 面板行同区），
  宽态为图标 +「扩展」文案行，收起态为 36px 圆形图标（与「设置」同区域同行为）。
- **全页视图**：fixed 全屏覆盖（z-index 200，位于侧边浮动面板(30)之上、Modal(1000)/toast(1100)
  之下，SKILL 分区内的导入/删除确认弹窗仍正常浮于其上）。顶栏标题 + 关闭按钮；
  左导航 SKILL / MCP / Plugin（建设中带徽标）；右内容区。Esc 或关闭按钮退出
  （SKILL 分区内弹窗打开时 Esc 优先给弹窗）。
- **SKILL 分区**：直接复用 `SkillManagerSection` 组件与既有 `/api/skill-manager`
  host API（apiVersion 5），零 host 改动、零行为变化。

## 功能

- **浏览 / 搜索 / 详情**：列出全部 skill（项目级 2 个根 + 用户级 2 个根 + 各 preset 内置只读分组），
  关键词搜索，点开看完整文件内容；同名 skill 显示「被 … 遮蔽」提示。
- **编辑**：UI 入口已移除（build 8，详情页为只读查看）。host 的 `save` 操作
  仍保留（frontmatter 校验 + 原子写入），可供直接调 API 使用，但页面上
  不再有编辑按钮。
- **删除**：二次确认后删除磁盘文件（目录型 skill 连同目录删除）。
- **导入**：粘贴内容或选择 `.md` 文件，写入所选根目录（目录型 `<name>/SKILL.md`），重名报 409。
- **导出**：下载当前 skill 为 `<name>.md`。
- **全局默认关闭**（build 6+，host apiVersion 5）：页面顶部一个主开关。
  - 开启后，所有**用户级** skill（`~/.dsh/skills`、`~/.agents/skills`）自动带上
    `disable-model-invocation: true` 标志 —— 模型在任何项目里都不再自动调用它们；
    内置（preset）skill 与外部工具根（Codex/Claude）文件一律不动（如 cordis 的内置
    skill 保持启用）。每次 `list` 都会幂等地重新执行策略，所以之后新增的用户级 skill
    也会自动默认关闭。
  - 关闭策略**不会**移除已加的标志（防止误恢复），需要时用各行滑块逐个恢复。
  - 策略开启时，某项目里想启用某个用户级 skill = 在该项目生成**本地副本**
    `<项目根>/.dsh/skills/<name>`（去掉标志，rank 100 压过全局关闭的原文件；
    目录型 skill 连同 `references/` 等附属文件一起复制，50MB 上限）；
    再把副本关回去 = 副本原地加标志（内容永不删除）。副本可编辑、可删除。
  - 策略状态存在 `~/.dsh/skill-manager.json`（`{ globalDefaultOff }`，原子写入）。
  - 策略开启期间，为「全局已关闭的用户级 skill」生成的旧版开关文件是冗余的，
    执行策略时自动清理（孤儿开关——原文件已不存在——保留不动）。
- **按项目启用/禁用**（build 5+）：每行一个小滑块（拨动无 toast，滑块本身即反馈）。
  关掉 = 该 skill 在**本项目**的会话中不再被模型自动调用（仍可手动调用），其他项目不受影响。
  实现方式全部走 DSH 原生机制：
  - 项目自己的 skill：原子改写其 frontmatter 标志 `disable-model-invocation`（CRLF/字节保真）。
  - 用户级/内置 skill（策略关闭时）：在项目根生成一个**开关文件**
    `<项目根>/.dsh/skills/<name>.md`（rank 100 压制用户 400/500 与内置 600；
    带 `disable-model-invocation: true`；文件内带生成标记，UI 上显示「禁用开关」徽标）。
    拨回或删除该文件即恢复。开关文件行在 UI 里默认隐藏，所在分区标题显示
    「禁用开关 ×N」，搜索可列出。
  - 用户级 skill（策略开启时）：见上方「全局默认关闭」的副本机制。
  - 内置/外部根 skill 始终走开关文件机制（其文件不可修改）。
  - 项目根按 DSH 的 `findProjectRoot` 语义解析（向上找 `.git`，找不到就取 cwd）。
  - 安全：若项目里已有同名 skill（非本插件生成的开关），拒绝生成并提示 409。
  - 包行支持「全部禁用/全部启用」批量开关。
- **技能包**（build 3+）：同一前缀（第一个连字符之前的部分）≥3 个的 skill 自动折叠为一个包
  （如 lark-* 27 个 → 1 行），默认折叠、状态记忆在浏览器 localStorage；
  搜索命中成员时包自动展开；包行显示名可自定义（仅存本机浏览器）。
  视觉上与普通 skill 行区分（build 9+）：淡品牌色底（color-mix 派生，旧引擎回退）
  + 左侧 3px 品牌色强调条 + 行首包图标；各分区内包行排在最前面，散行随后。
  - **整包导出 zip**：含每个成员的全部附属文件（`references/` 等），一次下载一个压缩包。
  - **整包删除**：二次确认（列出全部成员）后逐个删除。
  - 只读（内置）成员混在包里时，包级删除按钮自动隐藏，导出仍可用。
  - 开关文件不参与技能包分组（只作独立行，默认隐藏、搜索可列出）。
- **徽标精简**（build 8+）：「只读」「被 … 遮蔽」徽标已移除（置灰状态与
  分区归属已表达同样信息）；保留「已禁用」（实心琥珀色）、「禁用开关」、
  「格式损坏」。
- **状态可见性**（build 7+）：工具栏「全部 / 已禁用 N / 已启用」筛选器（N 为实时统计，
  只数真实 skill，不重复数开关文件）；被禁用的行标题与描述置灰、
  「已禁用」徽标为实心琥珀色；技能包成员全部禁用时整行置灰；筛选器与搜索可叠加。
- 导入/删除后 DSH 的 skill watcher 自动热加载，**无需重启**。

## 管理的存储位置

| 根 | 路径 | 生效范围 |
| --- | --- | --- |
| 项目 · `.dsh/skills` | `<项目根>/.dsh/skills` | 仅当前项目 |
| 项目 · `.agents/skills` | `<项目根>/.agents/skills` | 仅当前项目 |
| 全局 · `~/.codex/skills` | `C:\Users\<你>\.codex\skills` | 只读列表（外部工具共用） |
| 全局 · `~/.claude/skills` | `C:\Users\<你>\.claude\skills` | 只读列表（外部工具共用） |
| 用户 · `~/.dsh/skills` | `C:\Users\<你>\.dsh\skills` | 所有项目 |
| 用户 · `~/.agents/skills` | `C:\Users\<你>\.agents\skills` | 所有项目 |
| 内置（只读） | 各 agent preset 的 `skills/` 目录 | 部署自带，升级会覆盖 |
| 策略状态 | `~/.dsh/skill-manager.json` | 全局默认关闭开关 |

> 项目根按 DSH 的 `findProjectRoot` 解析（向上找 `.git`，找不到取 cwd），与 DSH
> 实际扫描的目录一致；项目级「启用」生成的本地副本落在 `<项目根>/.dsh/skills`。

skill 文件格式（与 DSH 发现规则一致）：目录型 `<name>/SKILL.md` 或扁平 `<name>.md`，
YAML frontmatter 必须含 `name`（kebab-case）与 `description`。

## 安装方式（本机已装）

1. 插件源码：`C:\Users\chuansgu\.dsh\plugins\skill-manager\`
2. 已用官方命令装入 web profile：`dsh plugin --profile web add <源码目录>`
   （登记进 `~/.dsh/profiles/web/package.json` 依赖，包落在 `~/.dsh/profiles/node_modules/`）
3. `~/.dsh/profiles/web/cordis.patch.yml`（profile 用户层，热监听）加了一行：
   ```yaml
   - id: skill-manager
     name: 'dsh-skill-manager'
   ```
   该层对 web profile 的所有会话、所有 preset 生效 —— 所以无需切换 preset，刷新页面即可见。

## 卸载

```powershell
# 1) 从用户层移除插件行（编辑 ~/.dsh/profiles/web/cordis.patch.yml，删掉那一行）
# 2) 移除 profile 依赖
dsh plugin --profile web remove dsh-skill-manager
# 3) 删除源码目录
Remove-Item -Recurse -Force $env:USERPROFILE\.dsh\plugins\skill-manager
```

## 技术说明

- **Host 半**（`lib/index.js`）：在 `webServer` 上注册 JSON 路由 `/api/skill-manager`
  （`list / read / save / delete / import / exportZip / setStatus / getPolicy / setPolicy`），
  零裸依赖（只用 `node:` 内置模块），自带最小 frontmatter 解析器和 store-only ZIP 打包器
  （UTF-8 文件名，CRC32 校验）。`list` 响应带 `apiVersion`（当前 5）与 `policy`，
  client 用它判断运行中的 host 是否已加载较新操作，未加载时对应按钮/滑块置灰并给出提示。
  内置 skill 列表来自 `agentPresets` 服务。策略执行（`enforceGlobalPolicy`）每次 `list`
  幂等运行：给用户级 skill 补标志（带有限重试，单文件失败不阻断列表并记日志）、
  清理冗余的旧版开关文件；Windows 上刚创建/修改的文件可能被 watcher 短暂占用，
  故写入走 tmp+rename 原子替换并最多重试 3 次。
- **热更新边界**（实测）：client bundle 由进程按请求从磁盘读取 —— 改 client 刷新页面即生效；
  host 代码没有模块级 HMR（组合树中 hmr 服务 `disabled: true`）—— 改 host 需要重启 `dsh web`
  （会话持久化在磁盘，重启后原会话可恢复，仅进行中的轮次会中断）。
  重启前：分组/包 UI 可用，zip 导出与按项目滑块置灰；重启后全部功能启用。
- **Client 半**（`lib/client.js`）：classic-script bundle（`window.__ModuleLoader__.load`），
  只 require 壳内 seed 词（`react`、`@deepseek-ai/dsh-client-ui-primitives`），
  build 11 起在 `sidebar.footer.action` slot 注册「扩展」入口 + 全页视图
  （build 10 及以前的 `settings.section` 注册已移除）；通过同源 `fetch` 调 host 路由。
- 路径安全：所有写入/删除都限定在 4 个可编辑根目录或 preset skills 目录内，
  目标路径做包含性校验；内置根一律只读（save/delete 返回 403）。

## 规划（二期待立项）

- **MCP 分区**：列出 web profile cordis 配置中的 `dsh-mcp-client` 服务器
  （serverName、stdio/HTTP 传输、命令/URL）与连接状态、工具清单；
  支持新增/编辑/删除（回写 profile 配置，利用 MCP 客户端原生 HMR 热加载，无需重启）。
- **Plugin 分区**：列出已安装到 web profile 的 DSH 插件（名称、版本、来源、启用状态），
  支持启用/停用（组合树挂回/摘除）。
