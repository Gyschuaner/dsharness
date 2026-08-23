# dsh-skill-manager

DeepSeek Harness 的扩展管理插件：在 Web GUI **侧边栏底部**新增「扩展」一级入口，
点开全页「扩展」视图，统一管理 DSH 的扩展能力（DSH-006；SKILL 管理中心 V1 重构 DSH-008）。

- **SKILL 分区**（DSH-008 V1）：两个子页面 ——
  - **项目管理**（默认）：按项目启用/禁用 Skill、批量启停、一键精简、
    保存/应用自定义预设（替换/合并预览）、全局标签、项目选择器（复用 DSH 工作区 + 手动添加本地项目）。
  - **统一资源库**：全部 DSH 支持目录中的 Skill 同名合并为一个身份，
    详情列出全部来源，当前项目可显式选择来源。
  - 运行中的 host 尚未加载 apiVersion 6（未重启 `dsh web`）时，自动降级为
    旧版单页界面（见下方「旧版功能」）并显示提示条。
- **MCP / Plugin 分区**（一期占位）：显示「建设中」占位页，规划能力见「规划」。
- 设置页内旧「Skills 技能管理」入口已移除（build 11，DSH-006）。

## 页面结构（build 15 / DSH-008 V1）

- **入口**：侧边栏底部 `sidebar.footer.action` 插槽（增量式，与 Cordis 面板行同区），
  宽态为图标 +「扩展」文案行，收起态为 36px 圆形图标（与「设置」同区域同行为）。
- **全页视图**：fixed 全屏覆盖（z-index 200，位于侧边浮动面板(30)之上、Modal(1000)/toast(1100)
  之下，SKILL 分区内的导入/删除确认弹窗仍正常浮于其上）。顶栏标题 + 关闭按钮；
  左导航 SKILL / MCP / Plugin（建设中带徽标）；右内容区。Esc 或关闭按钮退出
  （弹窗打开时 Esc 优先给弹窗；详情抽屉打开时 Esc 先关抽屉）。
- **SKILL 分区（V1）**：`项目管理 / 统一资源库` 两个子页签。
  - **项目管理**：顶部项目控制栏固定展示当前项目、完整路径、当前工作区标记、
    已启用/总数与「仅影响此项目」说明；历史选择不会覆盖当前会话工作区，切换菜单仍包含
    最近使用的工作区与添加本地项目；推荐预设与保存预设保留为次级动作；应用预设弹窗使用
    「模式选择 → 影响摘要 → 分组变更列表 → 操作区」的固定层级，保存预设弹窗使用常驻字段标签、
    字数计数、保存摘要和右对齐主操作，避免长列表与底部按钮挤压换行；
    工具栏为 搜索 / 带数量的全部·已启用·未启用 / 全部标签 / 批量管理 / 一键精简；
    默认行 = 图标 + 名称 + 项目特化/来源×N/未启用 徽标 + 完整描述 + 标签 + 启用开关；
    进入显式「批量管理」模式后才显示全选与行复选框，同时隐藏单项开关，避免两个控件都被理解为启停；
    勾选多行后在底部固定操作栏明确「在本项目启用/停用」，成功后自动退出批量模式；
    空状态提供查看全部或应用推荐预设；底部说明「项目配置保存于 …/.dsh/skill-manager.json，
    仅在本机使用且不提交 Git；启停在下一轮对话生效」。
  - **统一资源库**：同名 Skill 合并为一行（「来源 ×N」徽标），搜索/标签筛选，
    点击行打开右侧详情抽屉切换来源；默认优先级 项目专属 > DSH 用户级 > 其他全局 > 内置。
  - **详情抽屉**：启用此 Skill 开关、完整描述、当前来源、可选来源（radio，
    含「默认（按优先级自动选择）」、损坏/已修改/来源有更新徽标）、标签编辑
    （全局，跨项目共享）、更新状态（V1 不检测远端更新，不伪造数据）、
    「为此项目特化」（V1.2 能力，只读展示 + 禁用按钮）、高级折叠（路径/格式/附属文件）。
    详情从最新 catalog 派生，不再与列表保存重复快照；窄窗口改为覆盖式抽屉。
- **SKILL 分区（旧版降级）**：host 未加载 apiVersion 6 时渲染
  `SkillManagerSection`（build 11 功能，见下），顶部显示重启提示条。

## DSH-008 V1 核心机制

- **项目配置是本机唯一真相**：`<项目根>/.dsh/skill-manager.json`（apiVersion 6，
  原子写入，由仓库 `.gitignore` 精确忽略）。记录本机的已启用 Skill 身份集合、
  显式来源选择、最近应用的预设，避免不同电脑的 Skill 集合和偏好相互覆盖。
  文件级开关（frontmatter 标志 / 派生开关文件）只是可重建的派生产物。
- **新项目默认不暴露**：项目配置不存在时启用集合为空；`reconcile` 会为每个
  「非项目来源且默认会被 DSH 自动选中」的 Skill 生成带稳定 marker 的派生开关文件
  `<项目根>/.dsh/skills/__smgr-shadow-<name>.md`（`disable-model-invocation: true` +
  描述前缀 `[skill-manager] 本项目禁用开关`），使模型自动候选为空；
  `user-invocable` 的 `/skill-name` 手动调用不受影响，下一轮对话生效、无需重启。
  产品默认来源在 DSH rank 上输给更低 rank 的健康来源时（如用户级 400 输给
  `~/.codex/skills` 300），reconcile 会把它物化为**受管副本**（rank 100）让项目
  实际使用产品默认；该登记不带 `source` 字段（不是显式选择）。
- **启停三机制**（按 Skill 自动归类）：
  - `self`：项目原生 Skill（含用户已修改的受管副本）——原子改写其自身
    frontmatter 标志（字节保真，永不加 `user-invocable`）。
  - `copy`：未修改的受管副本——改副本标志并刷新登记的 `copyHash`。
  - `original`：用户/全局/内置来源——生成/删除 marker 验证的派生开关文件。
- **受管副本安全边界**：副本只凭 配置登记 + 精确 `copyHash`/`originHash` 识别，
  永不凭路径/文件名猜测；内容被用户修改过的副本（`copyHash` 不一致）视为项目文件：
  保留不动、来源切换报 409；`originHash` 不一致时行上显示「来源有更新」。
  来源选择到 rank 更高的来源 = 纯记录（删除冗余的已验证副本）；rank 更低的来源 =
  物化受管副本 + 删除被取代的 marker 开关。选择来源时开关状态同步进副本标志。
- **一键精简**：存在默认精简预设（`defaultSlim`，至多一个）时按该预设替换；
  否则关闭全部启用（两者都先出 diff 预览）。
- **预设**：全局存储（`~/.dsh/skill-manager.json` 的 `presets`），跨项目复用；
  只保存 Skill 身份 + 所选通用来源（不锁版本、不带项目特化内容）；
  应用必须先预览 diff，可选 替换 / 合并。
- **全局标签**：`~/.dsh/skill-manager.json` 的 `tags`（Skill 身份级，跨项目共享），
  列表与资源库页均可按标签筛选；单个 32 字符上限、每 Skill 20 个上限。
- **旧开关文件识别**：带 marker 的派生开关文件被明确识别；孤儿开关
  （同名 Skill 已不存在）自动清理，外来同名文件永不触碰；旧版
  `globalDefaultOff` 策略保持可用并协同（策略已处理的用户级 Skill 不重复生成开关）。
- **可更新**：`updateInfo` 恒为 `null`（V1 不做远端更新检测）；UI 只在存在
  真实更新数据时才显示浅红「可更新」标签。

## 旧版功能（host < apiVersion 6 时的降级界面）

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
| 策略状态 | `~/.dsh/skill-manager.json` | 全局默认关闭开关（旧版）+ 全局标签 + 自定义预设（V1） |
| 项目配置（V1） | `<项目根>/.dsh/skill-manager.json` | 本机私有的启用集合 / 来源选择 / 最近预设（不提交 Git） |
| 派生开关（V1） | `<项目根>/.dsh/skills/__smgr-shadow-<name>.md` | marker 验证的禁用开关（可重建，不提交 Git） |
| 受管副本（V1） | `<项目根>/.dsh/skills/<name>(.md | /SKILL.md)` | 来源选择的生效载体（可重建，改过即成项目文件） |

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

- **Host 半**（`lib/index.js` + `lib/state.js` + `lib/catalog.js`）：在 `webServer`
  上注册 JSON 路由 `/api/skill-manager`，零裸依赖（只用 `node:` 内置模块），
  自带最小 frontmatter 解析器和 store-only ZIP 打包器（UTF-8 文件名，CRC32 校验）。
  - 旧版操作（保持兼容）：`list / read / save / delete / import / exportZip /
    setStatus / getPolicy / setPolicy`。
  - V1 操作（apiVersion 6，DSH-008）：
    - `capabilities`：轻量返回 apiVersion 与功能清单，Client 进入 SKILL 时不再用完整 catalog 做能力探测。
    - `catalog`：合并身份目录（同名来源合并、优先级排序、reconcile 后重扫），
      返回 `identities`（每行含 `sources[]`、`defaultSourceKey`、`sourceKey`、
      `effectiveSourceKey`、`specialized`、`enabled`、`tags`、`updateInfo:null`）+ `allTags`。
    - `projectState`：项目配置 + 最近 reconcile 报告。
    - `setEnabled` / `setMany`：单项/批量启停（返回更新后的 identity 行）。
    - `setSource`：显式来源选择 / 重置默认（必要时物化受管副本）。
    - `setTags`：全局标签（空数组 = 清除）。
    - `presets.list / save / delete / setDefault / preview / apply`：
      预设管理；preview 返回精确 diff（toEnable / toDisable / sourceChanges / finalEnabled）。
    - `slim.preview / slim.apply`：一键精简（默认精简预设或全部关闭）。
  - 响应信封统一 `{ ok:true, value }` / `{ ok:false, error:{ message } }`；
    业务错误用 `ApiError` 携带 4xx（400 参数 / 404 不存在 / 409 冲突）。
    `list` 响应带 `apiVersion`（当前 6），旧 client 据此判断 host 能力。
  - 内置 skill 列表来自 `agentPresets` 服务；策略执行（`enforceGlobalPolicy`）每次
    `list` 幂等运行（旧版兼容）；Windows 文件锁问题由 tmp+rename 原子写入规避。
- **Host 测试**（`test/skill-manager.test.js`，`node --test`）：49 用例覆盖
  状态模型（含损坏降级）、发现与合并、新项目默认关闭的 marker 物化、
  三机制启停回环、孤儿清理与外来文件保护、来源选择/受管副本/409 保护、
  标签、预设 diff/应用、一键精简、旧版兼容与只读根 403；并覆盖并发写、
  配置前向兼容、原始字节哈希、50MB 边界、来源消失、文件副作用回滚与
  多来源预设冲突。
- **Client DOM 测试**（`test/client.dom.test.js`，`node --test`）：4 用例直接执行
  真实 classic-script bundle 并用 React 18 + JSDOM 挂载 Slot，覆盖双页面、
  完整 description、可更新徽标、抽屉/来源/标签/预设/Esc，以及项目切换时
  丢弃过期 catalog、mutation、preset preview 响应和旧 Host 降级。
- **热更新边界**（实测）：client bundle 由进程按请求从磁盘读取 —— 改 client 刷新页面即生效；
  host 代码没有模块级 HMR（组合树中 hmr 服务 `disabled: true`）—— 改 host 需要重启 `dsh web`
  （会话持久化在磁盘，重启后原会话可恢复，仅进行中的轮次会中断）。
  重启前：client 探测到 `catalog` 为未知操作，自动降级旧版界面并提示重启。
- **Client 半**（`lib/client.js`）：classic-script bundle（`window.__ModuleLoader__.load`），
  只 require 壳内 seed 词（`react`、`@deepseek-ai/dsh-client-ui-primitives`），无 JSX/TS/构建；
  build 12 起 SKILL 分区为 V1 双子页 + 详情抽屉（`SkillCenterV1`），
  项目选择器复用 `ctx.get('sessions')` 当前工作区与 `ctx.get('workspaces')`
  （`list.getSnapshot()` / `pickDirectory()` / `create({path})`），能力缺失时安全降级；
  build 15 按 Product Design 方案 3 重构预设应用/保存弹窗；主题只用
  `--dsw-alias-*` / `--dsw-static-*` 令牌，图标用官方 `Icon*Outline*` 组件。
  入口仍在 `sidebar.footer.action` slot（build 10 及以前的 `settings.section` 注册已移除）。
- 路径安全：所有写入/删除都限定在 4 个可编辑根目录或 preset skills 目录内，
  目标路径做包含性校验；内置根一律只读（save/delete 返回 403）；
  V1 派生产物只增删 marker 验证过的文件，外来同名文件永不触碰。

## 规划（二期待立项）

- **MCP 分区**：列出 web profile cordis 配置中的 `dsh-mcp-client` 服务器
  （serverName、stdio/HTTP 传输、命令/URL）与连接状态、工具清单；
  支持新增/编辑/删除（回写 profile 配置，利用 MCP 客户端原生 HMR 热加载，无需重启）。
- **Plugin 分区**：列出已安装到 web profile 的 DSH 插件（名称、版本、来源、启用状态），
  支持启用/停用（组合树挂回/摘除）。
