# dsh-skill-manager

DeepSeek Harness 的 SKILL 业务管理插件（DSH-008）。它独立拥有
`/api/skill-manager` Host API，并向 `dsh-extension-manager` 声明的
`extension.manager.section` Slot 注册 SKILL 页面；不再拥有主页“扩展”入口或通用页面壳。

- **SKILL 分区**（DSH-008 V1）：单一项目管理页面，按项目启用/禁用 Skill、批量启停、
  一键精简、保存/应用自定义预设（替换/合并预览）、全局标签和项目选择器；全部支持目录
  中的同名 Skill 仍合并为一个身份，详情列出全部来源并允许当前项目显式选择来源。
  顶部提供与 MCP / Plugin 一致的「本地 Skill / Skill 市场」页签；市场从 Host 侧读取受控
  GitHub 清单，支持综合、GitHub 热度、仓库最新推送排序，以及真实仓库元数据、详情、安装前预览和安全安装。
  - 运行中的 host 尚未加载 apiVersion 6（未重启 `dsh web`）时，不再挂载旧版页面，
    只显示明确的升级/重试状态。
- 通用“扩展”入口、左导航以及 MCP / Plugin 占位由独立的
  [`dsh-extension-manager`](../extension-manager/README.md) 负责。
- 设置页内旧「Skills 技能管理」入口已移除（build 11，DSH-006）。

## 页面结构（build 26 / DSH-008 V1.1）

- **视觉规格（build 27）**：页面宽度、标题与一级页签节奏、38px 工具栏、72px
  扁平分隔列表行和 400px 固定详情抽屉与 MCP / Plugin 共用同一套页面骨架；Skill 独有的项目
  统计、启停、来源选择、标签和真实市场能力保持不变。

- **组合入口**：Client 只通过 `slots.inject('extension.manager.section', ...)` 注册
  `id: skill` 的业务分区。`dsh-extension-manager` 独立注册 `sidebar.footer.action`，
  声明分区 Slot，并拥有全页框架、导航收起状态、Esc/关闭行为和 MCP / Plugin 占位。
- **SKILL 分区（V1）**：不再使用重复的子页签，直接进入项目管理单页。
  - 当前项目名称与已启用/总数收进页头右上角的紧凑项目按钮，与「预设」组成下拉组；
    完整路径只放在标题和详情的按需信息中，历史选择不会覆盖当前会话工作区，切换菜单仍包含
    最近使用的工作区与添加本地项目；推荐预设与保存预设合并进「预设」菜单；应用预设弹窗使用
    「模式选择 → 影响摘要 → 分组变更列表 → 操作区」的固定层级，保存预设弹窗使用常驻字段标签、
    字数计数、保存摘要和右对齐主操作，避免长列表与底部按钮挤压换行；
    工具栏只常驻 搜索 / 带数量的全部·已启用·未启用 / 筛选 / 更多；标签筛选在「筛选」菜单中，
    批量管理和一键精简收进「更多」菜单；
    「全部」视图始终沿用 catalog 顺序，不再按启用状态自动分组或移动行；已启用行保持原位并使用
    与未启用行一致的白色/透明底色，只由蓝色开关与数量表达状态，状态筛选只在用户主动选择时收窄结果；
    默认行 = 名称 + 必要的项目特化/可更新/来源×N 徽标 + description 第一句 + 启用开关；
    不再重复显示通用图标、未启用徽标与标签，完整 description 和标签保留在详情；
    进入显式「批量管理」模式后才显示全选与行复选框，同时隐藏单项开关，避免两个控件都被理解为启停；
    勾选多行后在底部固定操作栏明确「在本项目启用/停用」，成功后自动退出批量模式；
    空状态提供查看全部或应用推荐预设；页面不再重复展示底部统计和项目配置路径。
    同名 Skill 合并为一行（「来源 ×N」徽标）；点击行在详情中切换来源，默认优先级为
    项目专属 > DSH 用户级 > 其他全局 > 内置。
  - **Skill 市场（V1.1）**：与 MCP / Plugin 使用相同的页面标题和一级页签；Host 合并内置精选
    与可信远程 Skill Registry（当前为 Anthropic 官方 marketplace），并保留任意公开 GitHub
    仓库/目录的发现入口；远程索引失败时回退到缓存与精选条目。
    详情抽屉展示来源、文件和安全校验；安装必须经过预览，拒绝路径穿越、符号链接、不合法
    frontmatter、超大文件和覆盖未受管/已修改的项目 Skill。安装只复制 Markdown/资源文件，
    不执行 scripts、依赖安装或第三方生命周期脚本，默认停用并写入项目私有来源登记。
  - **详情抽屉**：启用此 Skill 开关、完整描述、当前来源摘要；可选来源默认折叠，点击「更改来源」
    后展示 radio（
    含「默认（按优先级自动选择）」、损坏/已修改/来源有更新徽标）、一体化标签编辑器
    （全局、跨项目共享；默认只显示已有标签与「添加标签」，输入器按需展开，支持回车添加、
    重复/20 个上限提示和请求期防重复提交）、
    更新状态、项目配置路径、附属文件和「为此项目特化」后续说明都收进「更多信息」，不再常驻
    或展示不可用按钮；V1 仍不伪造远端更新数据。
    详情从最新 catalog 派生，不再与列表保存重复快照；所有桌面宽度均使用 400px 覆盖式抽屉，
    不改变项目卡片、工具栏或列表的宽度与换行，窄窗口最多占满可用宽度。
- **首次加载态**：首次进入 SKILL 页、catalog 尚未返回时，居中展示官方 Skill 图标、呼吸光环、
  扫描光和「正在扫描 Skill / 整理项目配置与可用来源」状态文案；`prefers-reduced-motion` 下退化为静态状态。
- **旧版页面清理**：apiVersion 6 以下的 host 只得到升级/重试状态；旧版页面、技能包列表
  和旧版浏览器端辅助逻辑不再进入 client bundle。Host API 的旧操作仍保留为兼容接口，
  不承担页面渲染。

## DSH-008 V1 核心机制

- **项目配置是本机唯一真相**：`<项目根>/.dsh/skill-manager.json`（apiVersion 6，
  原子写入，由仓库 `.gitignore` 精确忽略）。记录本机的已启用 Skill 身份集合、
  显式来源选择、最近应用的预设，避免不同电脑的 Skill 集合和偏好相互覆盖。
  文件级开关（frontmatter 标志 / 派生开关文件）只是可重建的派生产物。
- **读取零副作用（BUG-0AA85F45）**：`catalog`、`projectState` 和 `validate` 只扫描与报告，
  不运行 reconcile、不写配置/frontmatter、不生成开关，也不删除孤儿。项目尚无 sidecar 时，
  页面按磁盘的真实可调用状态展示；第一次明确写操作会先快照该真实基线，再应用目标变更，
  避免操作一个 Skill 时误改其他 Skill。
- **项目策略显式落盘**：项目配置存在后，未列入 enabled 的身份视为关闭；显式启停/来源/预设操作
  才运行 reconcile。需要关闭「非项目来源且默认会被 DSH 自动选中」的 Skill 时，会生成带稳定 marker 的
  派生开关文件
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
- **单项启停快速路径（build 20）**：`catalog` 完成后按项目缓存身份快照；单项 `setEnabled`
  只校验项目来源目录签名、目标 Skill 的来源配置与 `SKILL.md` mtime，再对目标身份执行一次
  reconcile 和一次配置写入，不再为 68 个身份重复全量扫描/对账。项目原生 Skill、未修改的
  受管副本和普通可调用来源均可走快速路径；目录、来源选择或目标文件发生变化时自动退回完整
  reconcile。Client 点击后先在本地更新行底色、开关和计数并显示安静的「保存中」状态，失败时
  精确恢复点击前行状态。
- **启用必须等于会话可调用**：若项目启用的原始来源自身带有
  `disable-model-invocation`（例如旧全局默认关闭策略留下的用户 Skill），或来源只存在于
  另一个 Agent preset 的 bundled 根，reconcile 会生成去除禁用标志的 rank-100 受管项目副本。
  因此管理页的 enabled 集合可在任一 preset 的下一轮 `skill-catalog` 中真实出现，且不会修改
  全局原文件；停用时保留副本并重新写入禁用标志。
- **受管副本安全边界**：副本只凭 配置登记 + 精确 `copyHash`/`originHash` 识别，
  永不凭路径/文件名猜测；内容被用户修改过的副本（`copyHash` 不一致）视为项目文件：
  保留不动、来源切换报 409；`originHash` 不一致时行上显示「来源有更新」。
  来源选择到 rank 更高的来源 = 纯记录（删除冗余的已验证副本）；rank 更低的来源 =
  物化受管副本 + 删除被取代的 marker 开关。选择来源时开关状态同步进副本标志。
- **哈希格式公开**：当前平面文件为 `sha256:<原始字节数>:<sha256hex>`；目录按相对路径排序，
  将每个文件编码为 `rel:字节数:sha256hex` 行，拼接后再输出同格式哈希；忽略点文件，最大深度 8。
  旧受管副本 `sha256:<64hex>` 只用于兼容验证，不再新写。远端安装包使用独立的
  `originBundleHash`，格式为 `sha256:<64hex>`，按远端相对路径排序后拼接
  `path=sha256(file)` 再哈希，不与受管副本 `originHash` 混用。`validate` 响应同步返回这些 schema。
- **Windows 目录发布**：完整 Skill 目录先复制并校验到不受 watcher 监听的
  `<项目根>/.dsh/.skill-manager-swap/`；发布时先写 references/scripts/assets 等附属文件，
  最后写 `SKILL.md` 作为目录可见性提交点，再做整目录哈希校验。这样既规避 Windows 下
  被 watcher 占用目录导致的 `EPERM` rename，也不会让 provider 扫到半成品 Skill。
- **一键精简**：存在默认精简预设（`defaultSlim`，至多一个）时按该预设替换；
  否则关闭全部启用（两者都先出 diff 预览）。
- **预设**：全局存储（`~/.dsh/skill-manager.json` 的 `presets`），跨项目复用；
  只保存 Skill 身份 + 所选通用来源（不锁版本、不带项目特化内容）；
  应用必须先预览 diff，可选 替换 / 合并。
- **全局标签**：`~/.dsh/skill-manager.json` 的 `tags`（Skill 身份级，跨项目共享），
  单页列表可按标签筛选；单个 32 字符上限、每 Skill 20 个上限。
- **旧开关文件识别**：带 marker 的派生开关文件被明确识别；孤儿清理默认关闭，只有显式维护流程
  才可请求 marker/hash 验证后的清理；未知来源、缺失哈希、用户修改过的文件一律保留并报告。外来同名文件
  永不触碰；旧版
  `globalDefaultOff` 策略保持可用并协同（策略已处理的用户级 Skill 不重复生成开关）。
- **可更新**：`updateInfo` 恒为 `null`（V1 不做远端更新检测）；UI 只在存在
  真实更新数据时才显示浅红「可更新」标签。

## 兼容性说明

- 当前 client 只挂载 apiVersion 6 的项目管理页。旧 Host 不再渲染历史 Skill Manager 页面，
  而是显示升级/重试状态。
- `/api/skill-manager` 的 `list / read / save / delete / import / exportZip / setStatus /
  getPolicy / setPolicy` 仍保留，供旧客户端或外部调用兼容使用；它们不是当前页面的渲染路径。
- 项目配置、来源合并、启停、标签、预设、精简和市场能力均走 V1 API。

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

1. 分别将 `plugins/extension-manager` 和 `plugins/skill-manager` 通过 junction/link
   挂到 `~/.dsh/plugins/`。
2. 用官方命令将 `dsh-extension-manager`、`dsh-skill-manager` 两个依赖装入 web profile。
3. `~/.dsh/profiles/web/cordis.patch.yml`（profile 用户层，热监听）按顺序加入：
   ```yaml
   - insert:
     - id: extension-manager
       name: 'dsh-extension-manager'
   - insert:
     - id: skill-manager
       name: 'dsh-skill-manager'
   ```
   该层对 web profile 的所有会话、所有 preset 生效 —— 所以无需切换 preset，刷新页面即可见。

## 卸载

```powershell
# 1) 从用户层移除 skill-manager 插件行；若没有其他分区再移除 extension-manager
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
    - `catalog`：只读合并身份目录（同名来源合并、优先级排序，不 reconcile），
      返回 `identities`（每行含 `sources[]`、`defaultSourceKey`、`sourceKey`、
      `effectiveSourceKey`、`specialized`、`enabled`、`tags`、`updateInfo:null`）+ `allTags`。
    - `projectState`：只读返回项目配置和状态报告。
    - `validate`：只读 dry-run；返回配置/磁盘漂移、不可验证来源、保留动作及公开的哈希 schema，
      明确声明 `willWrite:false / willDelete:false`。
    - `setEnabled` / `setMany`：单项/批量启停（返回更新后的 identity 行）。
    - `setSource`：显式来源选择 / 重置默认（必要时物化受管副本）。
    - `setTags`：全局标签（空数组 = 清除）。
    - `presets.list / save / delete / setDefault / preview / apply`：
      预设管理；preview 返回精确 diff（toEnable / toDisable / sourceChanges / finalEnabled）。
    - `slim.preview / slim.apply`：一键精简（默认精简预设或全部关闭）。
    - `marketplace`：返回精选 GitHub 市场条目及当前项目安装状态。
    - `marketplace.detail`：读取仓库元数据和 Skill 文件树，并返回安全校验结果。
    - `marketplace.preview / marketplace.install`：安装前预览与受控项目安装。
    - `github.inspect / github.preview / github.install`：输入任意公开 GitHub 仓库或 Skill 目录 URL，
      发现一个或多个 `SKILL.md`，选择目录后复用市场的路径/大小/frontmatter/冲突/原子回滚校验；
      GitHub REST 受限时回退到只读 codeload tarball（仍执行路径、大小、文件数和 symlink 限制）；
      安装记录 `originType/repository/path/ref/revision/originBundleHash/url`，可安全识别、更新和追溯外部来源。
  - 响应信封统一 `{ ok:true, value }` / `{ ok:false, error:{ message } }`；
    业务错误用 `ApiError` 携带 4xx（400 参数 / 404 不存在 / 409 冲突）。
    `list` 响应带 `apiVersion`（当前 6），旧 client 据此判断 host 能力。
  - 内置 skill 列表来自 `agentPresets` 服务；策略执行（`enforceGlobalPolicy`）每次
    `list` 幂等运行（旧版兼容）；配置文件用 tmp+rename 原子写入，目录副本使用受监控根外
    暂存、附属文件优先、`SKILL.md` 最后发布并整目录哈希复核。
- **Host + Client 测试**（`test/*.test.ts`，`tsx --test`）：75 用例覆盖
  状态模型（含损坏降级）、发现与合并、新项目只读基线与首次显式写入、
  三机制启停回环、显式孤儿清理与外来文件保护、来源选择/受管副本/409 保护、
  标签、预设 diff/应用、一键精简、旧版兼容与只读根 403；并覆盖并发写、
  配置前向兼容、原始字节哈希、50MB 边界、来源消失、文件副作用回滚与
  多来源预设冲突，以及已全局关闭的用户 Skill / 其他 preset bundled Skill 在项目启用后
  物化为真实可调用副本；并验证单项快速路径、缓存失效安全回退、配置写入失败时文件与配置回滚。
- **Client DOM 测试**（`test/client.dom.test.ts`，`tsx --test`）：12 用例直接执行
  真实 classic-script bundle 并用 React 18 + JSDOM 挂载 Slot，覆盖单页信息架构、可收起导航、
  完整 description、可更新徽标、抽屉/来源/标签/预设/Esc，以及项目切换时
  丢弃过期 catalog、mutation、preset preview 响应、单项启停乐观更新/失败回滚、任意 GitHub
  inspect/preview/install、扫描加载态和旧 Host 升级态。
- **热更新边界**（实测）：client bundle 由进程按请求从磁盘读取 —— 改 client 刷新页面即生效；
  host 代码没有模块级 HMR（组合树中 hmr 服务 `disabled: true`）—— 改 host 需要重启 `dsh web`
  （会话持久化在磁盘，重启后原会话可恢复，仅进行中的轮次会中断）。
  重启前：client 探测到 `catalog` 为未知操作，只显示升级/重试状态并提示重启，不再挂载旧版界面。
- **Client 半**（`lib/client.js`）：classic-script bundle（`window.__ModuleLoader__.load`），
  只 require 壳内 seed 词（`react`、`@deepseek-ai/dsh-client-ui-primitives`），无 JSX/TS/构建；
  build 12 起 SKILL 分区使用 `SkillCenterV1`，build 18 收敛为项目管理单页 + 覆盖式详情抽屉，
  项目选择器复用 `ctx.get('sessions')` 当前工作区与 `ctx.get('workspaces')`
  （`list.getSnapshot()` / `pickDirectory()` / `create({path})`），能力缺失时显示明确升级态；
  build 15 按 Product Design 方案 3 重构预设应用/保存弹窗，build 16 将详情标签区重构为
  同一设计语言的一体化编辑面板，build 17 移除默认列表的启用/未启用自动分组并以淡蓝底色标记
  保持原位的已启用行，build 18 移除重复资源库入口并加入可持久化的左导航收起态，build 19
  将项目上下文压为单行、低频动作收进菜单、列表 description 收为第一句并按需展开来源与技术信息，build 20
  为单项启停加入乐观更新、安静保存态与失败回滚，build 21 为首次 catalog 加入居中的 Skill 扫描加载态，
  build 22 将通用扩展壳拆到独立插件并仅贡献 SKILL 分区，build 23 加入与 MCP / Plugin 对齐的
  本地 / 市场一级页签和真实 Host 市场接口，build 24 统一 MCP / Plugin 的页面宽度、工具栏、
  扁平列表行和固定详情抽屉几何，build 25 加入任意公开 GitHub 仓库安装入口、目录发现和安全预览，
  build 26 移除 apiVersion <6 的旧版页面、包列表与浏览器端辅助逻辑，build 27 移除重复的
  “Web 配置”与独立项目摘要卡，将项目切换、启用统计和预设控制收进页头右上角下拉组，build 28
  移除已启用行的常驻蓝灰底色，只保留蓝色开关作为行内状态强调，
  加载态保持无底板的光学聚焦动画：
  三颗非对称粒子在首秒依次汇入官方 Skill 图标，`Skill Finding` 同步由雾灰聚焦为墨色并带短蓝色焦点游标，
  同时提供 `prefers-reduced-motion` 静态降级；主题只用
  `--dsw-alias-*` / `--dsw-static-*` 令牌，图标用官方 `Icon*Outline*` 组件。
  Skill 页面注册在 `extension.manager.section`；本插件中不再出现 `sidebar.footer.action` 或 `.ext-*` 壳样式。
- 路径安全：所有写入/删除都限定在 4 个可编辑根目录或 preset skills 目录内，
  目标路径做包含性校验；内置根一律只读（save/delete 返回 403）；
  V1 派生产物只增删 marker 验证过的文件，外来同名文件永不触碰。

## 规划（二期待立项）

- 分区壳与占位已归 `dsh-extension-manager`；后续 MCP / Plugin 业务应分别实现为新的
  `extension.manager.section` 贡献插件，而不是继续写回 `skill-manager`。
- **MCP 分区**：列出 web profile cordis 配置中的 `dsh-mcp-client` 服务器
  （serverName、stdio/HTTP 传输、命令/URL）与连接状态、工具清单；
  支持新增/编辑/删除（回写 profile 配置，利用 MCP 客户端原生 HMR 热加载，无需重启）。
- **Plugin 分区**：列出已安装到 web profile 的 DSH 插件（名称、版本、来源、启用状态），
  支持启用/停用（组合树挂回/摘除）。
