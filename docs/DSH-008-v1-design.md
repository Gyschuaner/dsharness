# DSH-008 SKILL 管理中心 V1 设计与实现计划

> 需求：DSH-008「SKILL 管理中心重构：项目启用与统一资源库」（P1，in_development）
> 分支：`codex/feat/DSH-008-skill-center`（基线 origin/main + handoff 提交）
> 上游 handoff：`docs/DSH-008-skill-center-handoff.md`（产品定论以它为准）
> 视觉稿：见 handoff §6（Linear + Notion，紧凑行 + 轻量分隔线，非卡片墙）
> 版本边界：只做 V1；V1.1（安装/更新/删除）、V1.2（AI 编辑/特化/兼容性）、二期（市场）一律不实现，只保留数据/接口上的扩展位。

## 1. 大需求切分（小需求清单）

每个小需求可独立验证；编号即执行顺序。

| 编号 | 小需求 | 交付物 | 验证方式 |
| --- | --- | --- | --- |
| S0 | 开发环境对齐 | junction 指向本分支仓库；测试脚手架 | 文件哈希一致；`node --test` 可跑 |
| S1 | Host 数据模型与持久化 | `lib/state.js`：项目配置（`<projectRoot>/.dsh/skill-manager.json`）+ 全局配置（`~/.dsh/skill-manager.json` 扩展）读写、schema、原子写、路径 canonicalize/穿越防护、只读根拒绝写 | 单测：读写往返、损坏文件降级、路径穿越、只读根、schema 迁移 |
| S2 | Skill 扫描与同名来源合并 | `lib/catalog.js`：全根扫描（项目 2 根 + 全局 2 根 + 用户 2 根 + preset 内置）、按 name 合并为单一身份、来源列表与默认来源优先级（项目 > 用户 > 其他全局 > 内置）、附属文件清单 | 单测：多来源合并、优先级、损坏文件、junction 目录、内置分组 |
| S3 | 项目启用状态与派生开关 | reconcile 引擎：enabled 集合为唯一真相；派生产物（marker 禁用开关 stub / 项目原生 skill 的 frontmatter 标志 / 来源选择副本）幂等物化与精确清理；新项目默认 0 启用但 `/name` 可手动调用 | 单测：默认全关、单项/批量启停、marker 校验删除、孤儿清理、不碰普通文件、手动调用标志不被破坏 |
| S4 | 全局标签 | 全局配置 `tags`（按 skill 身份）；catalog 行携带；两子页面同步展示与筛选 | 单测 + DOM 测试：持久化、两页同步 |
| S5 | 自定义预设 | 全局配置 `presets`（只存 skill 身份 + 所选通用来源，不锁版本、不携特化）；保存/删除/预览（准确 diff）/应用（替换或合并）；「一键精简」= 应用默认精简预设（无默认预设时 = 全关预览） | 单测：diff 正确性、替换/合并语义、默认精简集唯一性 |
| S6 | Host API v6 与兼容 | 保留全部旧 op（list/read/save/delete/import/exportZip/setStatus/getPolicy/setPolicy 行为不变）；新增 `catalog / projectState / setEnabled / setMany / setSource / setTags / presets.list / presets.save / presets.delete / presets.preview / presets.apply / slim.preview / slim.apply`；apiVersion 5→6 | 单测：旧 op 回归 + 新 op 契约 + 旧 Client 字段兼容 |
| S7 | Client 项目管理页 | 单页项目管理；列表（搜索/已启用/未启用/全部标签/批量精简/批量启停）；行（图标、名称、项目特化/可更新/来源数徽标、标签、完整 description、开关）；覆盖式右抽屉（描述、当前来源、全部可选来源、标签编辑、启用状态、附属文件、特化=后续能力）；旧 Host（apiVersion<6）降级为原 UI | DOM 集成测试：渲染、筛选、开关、抽屉、预设预览、事件隔离、布局类不变 |
| S8 | Client 来源合并 | 全来源在项目管理单页合并为身份列表（来源数徽标）；抽屉列出全部真实来源 + 当前项目来源选择；标签筛选/编辑；搜索；不再提供重复的统一资源库子页面 | DOM 集成测试 |
| S9 | 验证与 QA | 全部 `node --test` 通过；client bundle 语法检查；重启 dsh web 验证 apiVersion 6；HTTP 冒烟；视觉对照（可执行部分）；`design-qa.md` | 测试报告 + HTTP 响应 + 截图对照（用户侧） |
| S10 | 回写与交付 | DP 任务/用例执行/SIT 流转；飞书技术文档 + `dp document ensure`；Obsidian 研发记录；Git 提交（含 DSH-008） | DP 查询验证 |

**明确不做（V1 边界）**：Skill 市场入口（不建假入口）；安装（目录/ZIP/Git/URL）；更新检测与 `可更新` 真实数据（接口保留 `updateInfo` 展示位，无数据不显示）；删除来源与回退；AI 创建/编辑；项目特化编辑（抽屉展示「配置特化」但标注后续能力、不可点）；版本历史；兼容性检查。

## 2. 关键设计决策

### 2.1 数据边界（handoff §9.1）

- **项目配置 = 本机唯一真相**：`<projectRoot>/.dsh/skill-manager.json`

  ```json
  {
    "schema": "dsh-skill-manager/project",
    "apiVersion": 6,
    "enabled": ["skill-a"],
    "sources": { "skill-c": { "source": "user-dsh", "contentHash": "sha256:...", "generated": true } },
    "appliedPreset": null,
    "updatedAt": "..."
  }
  ```

  - `enabled`：进入本项目模型自动候选的 skill 身份（name）集合。文件缺失 = 空集合 = 全关（新项目默认）。
  - `sources`：显式来源选择 + 已生成副本登记（`generated:true` + 内容哈希，作为副本的「可验证 marker」：覆盖/删除前必须配置条目存在且内容哈希与来源一致，绝不按路径猜测删除）。
  - 该文件是本机私有状态，由项目 `.gitignore` 精确忽略；真实项目 Skill 仍可正常提交。
  - 不迁移旧版启停状态；不迁移全局 `globalDefaultOff`（兼容保留）。
- **全局配置**：`~/.dsh/skill-manager.json`（保留 `globalDefaultOff`，扩展）

  ```json
  {
    "schema": "dsh-skill-manager/global",
    "apiVersion": 6,
    "globalDefaultOff": false,
    "tags": { "skill-a": ["测试", "流程"] },
    "presets": { "测试研发精简集": { "name": "测试研发精简集", "defaultSlim": true,
      "skills": { "skill-a": { "source": "user-dsh" }, "skill-b": {} }, "updatedAt": "..." } }
  }
  ```

- 所有写操作：tmp + rename 原子替换；项目路径 canonicalize（`realpath`/`resolve` 后校验前缀）防穿越；项目根不可写时写操作返回 409 明确错误。
- **损坏配置（P2-2）**：`.dsh/skill-manager.json` 为 JSON 无法解析时，`readProjectConfig` 降级为**可见空配置**（`view.configCorrupt:true`），**不**按空配置 reconcile（否则会为每个身份物化 stub / 覆盖真相文件）；所有项目变更 op（setEnabled/setMany/setSource/presets.apply/slim.apply 等）在 `mutateProject` 前置检测并返回 409 明确错误（「项目配置已损坏…未修改任何文件；请修复或删除该文件后重试」），不 reconcile、不写盘。client 顶部红色 banner 展示并禁用写操作。
- **未来版本配置（P2-1）**：配置 `apiVersion` 高于当前 host 支持的 `PROJECT_API_VERSION` 时，读仍按归一化展示但 `view.configFuture:true` 标记只读；所有写操作拒绝（409「保护未来版本数据，升级 host 后重试」），`writeProjectConfig` 拒绝以旧 host 覆盖新字段。
- **未知字段兼容（P2-1）**：`writeProjectConfig` 接受调用方回传的 `raw`（`readProjectConfig` 的磁盘对象），顶层与每个 `sources[name]` 条目中 host 不识别的字段原样 round-trip，避免未来版本字段被静默丢弃；未回传 `raw` 时写前重读磁盘对象合并。
- **并发写串行化（P1-1）**：同一配置的 `read → compute → persist → reconcile → view` 在 `withConfigLock(projectLockKey(projectRoot))` 下整体串行，`mutateProject` 在锁内重读真相文件，保证等待锁期间提交的并发变更可见后再计算。
- **文件副作用事务（P1-4）**：派生产物（stub/副本）的增删改经 `createLedger()` 记录 `undo` + `cleanup`；`mutateProject` 成功则 `commit()`（清理备份），`fn` 或持久化失败则 `rollback()`（逆序撤销、恢复被替换副本），杜绝失败留下未登记副本或丢失已校验副本。
- **目标失败可见（P2-3）**：reconcile/文件副作用对**目标 skill** 自身失败或冲突时，op 返回非 2xx（ApiError 500/409 + 原因），client 停止并展示真实状态；其他 skill 的失败/冲突在响应中以 `partial:true` + `report.failed/conflicts` 返回，client 持久化警告并刷新。

### 2.2 来源模型（handoff §4.3）

- **来源 key**：`project-dsh` / `project-agents` / `global-codex` / `global-claude` / `user-dsh` / `user-agents` / `bundled:<presetId>`。
- **默认来源优先级（产品展示）**：1 项目专属（project-dsh → project-agents）→ 2 DSH 用户级（user-dsh → user-agents）→ 3 其他全局（global-codex → global-claude）→ 4 内置（bundled）。显式选择覆盖默认。
- 与 DSH rank（custom 300 压 user 400）不一致的唯一场景：同名 skill 同时存在于全局根与用户根。此时按产品优先级物化一个**用户来源的生成副本**（rank 100）使其生效——这是默认路径下唯一需要写盘的情况；显式选择非 DSH-winner 的来源时同理物化副本。
- **安全覆盖规则**（handoff §9.3）：只允许覆盖「配置登记 + generated + 内容哈希与来源一致」的副本；用户改过的副本拒绝覆盖并返回冲突（该副本自此视为用户文件/项目特化状态）。
- 生成副本**不**标记为「项目特化」；特化 = 用户已修改内容的状态（V1 只展示、不可编辑，属 V1.2）。

### 2.3 启用/禁用机制（handoff §4.2/§9.2，全部走 DSH 原生）

对每个身份（name），reconcile 按以下顺序物化（幂等）：

1. **项目原生 skill**（项目根内真实文件，非生成副本、非开关 stub）→ 直接改其 frontmatter `disable-model-invocation`（enabled=去掉标志，disabled=加标志；CRLF/字节保真，复用现有 `patchInvocationFlag`）。
2. **生成来源副本**（配置登记且哈希一致）→ 同法改副本自身标志。
3. **其余**（用户/全局/内置）→ 开关 stub `<projectRoot>/.dsh/skills/<name>.md`（rank 100、`disable-model-invocation: true`、description 带既有 `[skill-manager] 本项目禁用开关` marker）。stub 存在 = disabled；缺失 = 默认启用状态。
   - **新项目默认全关** = reconcile 为每个「第 3 类且 DSH-winner 可被模型调用」的身份创建 stub（一次性、幂等；后续 list 不再重复写）。
   - **启用项可调用性修复（BUG-D12CCE97）**：如果 enabled 身份的目标原始来源自身带有 `disable-model-invocation`，仅删除 stub 仍无法进入模型目录；如果目标来源来自其他 preset 的 bundled 根，当前 preset 也未必扫描它。两种情况都必须物化为 rank-100 受管项目副本，并移除副本上的禁用标志。默认来源生成的登记不写 `source`，显式来源继续保留 `source`；原文件不修改，停用时只给受管副本恢复禁用标志。
   - **Windows 大目录安全发布（BUG-D12CCE97）**：受管目录先完整复制并校验到 `<projectRoot>/.dsh/.skill-manager-swap/`（不在 skill watcher 根内）；发布目标时先写附属文件，最后写 `SKILL.md` 作为 provider 可见的提交点，随后验证整目录哈希。目标已有旧副本时仍先移入事务备份，失败可回滚；不用对被 watcher 占用的完整目录做最终 rename，规避 Windows `EPERM`。
   - 全局 `globalDefaultOff` 开启且用户级原件已带全局标志时，该身份的禁用已由原件表达，stub 冗余 → 不创建（与旧 `enforceGlobalPolicy` 的清理规则协同，避免互相删除）。
- `user-invocable` 默认 true 不受任何机制影响 → `/skill-name` 手动调用永远可用（验收 3/12）。
- 清理规则：stub 仅在（a）配置声明该身份 enabled，或（b）对应原件已不存在（孤儿）时删除，且删除前必须 `isShadowFile` marker 验证；普通 skill 文件、用户修改的副本永不被删除/覆盖。
- 物化时机：`catalog` / `projectState` / `setEnabled` / `setMany` / `setSource` 等读项目状态的 op 触发一次幂等 reconcile（单文件失败不阻断、记日志、下轮自愈，与现行政策执行一致）。
- 热加载：stub/副本/标志写入后 DSH 的 chokidar watcher 使 skill provider 失效 → **下一轮对话生效，无需重启 DSH**（skill-filesystem `watch:true`，已核实）。
- **stub 保留前缀 + Git 精确区分（P2-4 / BUG-548E4FF4）**：开关 stub 一律落在保留前缀 `<projectRoot>/.dsh/skills/__smgr-shadow-<name>.md`（前缀 `__smgr-shadow-`），与真实项目 Skill / 生成副本的标准路径（`<name>.md`、`<name>/`）区分。三态精确区分：真实项目 Skill = 标准路径、无配置登记；生成副本 = 标准路径 + 本机配置 `sources[name].generated:true` + `copyHash` 与来源一致；stub = `__smgr-shadow-` 前缀 + marker。`isShadowFile`/`hasStub`/`removeMarkerStub` 同时识别保留前缀与旧 `<name>.md` 两个位置，旧 legacy stub 在 reconcile 时按 marker 校验迁移到保留前缀名。`.gitignore` 精确忽略 `.dsh/skill-manager.json`、`.dsh/skills/__smgr-shadow-*.md`（stub 运行时产物，由配置重建）与 `.dsh/skills/.*`（点号暂存/备份目录），**不**用 `.dsh/skills/**` 整目录忽略（会误伤需要版本控制的项目专属 Skill）。Git 只跟踪真实项目 Skill 与生成副本，不跟踪本机配置或 stub。配置持久化时仍剥离 `projectRoot`，避免项目在本机移动后保留失效的绝对路径。

### 2.4 「项目特化」与「可更新」徽标（handoff §4.4/§4.5）

- `specialized=true`：当前生效来源 scope 为 project，且不是 marker stub、也不是哈希一致的生成副本（即用户自有项目 skill 或用户改过的副本）。V1 只读展示。
- `updateInfo`：catalog 行预留字段；**V1 恒为 null**（不做远端检测、不伪造）；Client 仅在 `updateInfo != null` 时渲染浅红 `可更新` 徽标（紧跟名称/特化徽标，不占列）。

### 2.5 一键精简（产品决策，handoff 未定论项的落地选择）

「批量精简」按钮 = 应用**默认精简预设**（`presets.*.defaultSlim=true`，至多一个）：打开预览弹窗展示准确 diff（将启用/将停用/来源变更）+ 选择「替换当前配置 / 合并到当前配置」后确认。无默认精简预设时 = 预览「停用当前项目全部已启用 skill」（仅替换语义）。预设左栏列表显示「默认」徽标；kebab 菜单：应用（同预览流程）/ 设为默认精简集 / 删除。预设只保存 skill 身份 + 所选通用来源，不锁版本、不携带特化内容。

### 2.6 Host API（apiVersion 6，handoff §9.4）

- 旧 op 全部保留且行为不变（旧 Client 兼容）；`list` 响应保留全部旧字段并附加 `catalogReady:true`。
- 新 op（均为 POST `/api/skill-manager`，`{op, cwd, ...}`，无损 JSON）：
  - `catalog {cwd} → {apiVersion, projectRoot, identities:[{name, description, tags, sources:[{key,label,scope,rank,modelInvocable,format,files[],mtimeMs,generated,modified}], defaultSourceKey, sourceKey, effectiveSourceKey, specialized, enabled, updateInfo}]}`
  - `projectState {cwd} → 项目配置 + reconcile 报告 {conflicts[], created[], removed[]}`
  - `setEnabled {cwd,name,enabled}`、`setMany {cwd,names,enabled}`（批量）
  - `setSource {cwd,name,source|null}`（null=恢复默认；冲突返回 409 + 原因）
  - `setTags {cwd?,name,tags[]}`（cwd 仅用于校验 name 存在；标签是全局的）
  - `presets.list / presets.save {name,skills,description?} / presets.delete {name} / presets.setDefault {name|null} / presets.preview {name,mode} / presets.apply {name,mode}`
  - `slim.preview / slim.apply {mode?}`（一键精简）
- 名称一律走现有 `NAME_RE`（safeName）校验；所有响应可 JSON 序列化，不含 Host 活对象。

### 2.7 Client（handoff §9.5 + 视觉稿）

- 入口不变：`sidebar.footer.action`「扩展」全页；SKILL 直接进入项目管理单页，来源合并/切换内聚到列表与详情；MCP/Plugin 占位不变。左侧扩展类型导航可收起为 64px 图标栏并记住浏览器本地状态。
- 状态：`selectedProject / selectedSkill / search / enableFilter / tagFilter / selectedRows / presetPreview / slimPreview / drawer`；项目/抽屉切换清理无效选中；行点击与开关点击 `stopPropagation` 防串扰；description 完整多行、不截断不翻译。
- **项目切换与过期响应丢弃（P1-5）**：`genRef`（单调递增 view 代）+ `projectRef`（当前项目 ref）。`chooseProject` 切换项目时递增 `genRef` 并清空 `view/viewError/drawer/selectedRows/toggling/sourceBusy/presetModal/slimModal` + `viewBusy`；`loadView` 捕获 `gen` 与 `cwd`，仅当代号一致时落地结果，慢 catalog 永不覆盖新项目的 view。所有写操作（`doToggle`/`doBulk`/`doSource`/`doTags`/`applyPreset`/`doSlimApply`）在发起时捕获 `proj` 快照与 `gen`，响应到达当代号不一致（项目已切换）则丢弃（不 patch、不刷新），一致才应用 + `partial` 警告 + `loadView(proj)`；`viewBusy`/`configCorrupt`/`configFuture` 期间写操作禁用。
- 项目选择：`ctx.get('sessions')` 当前会话 cwd 为默认项目；`ctx.get('workspaces').list.getSnapshot()` 提供最近打开（`items` 按 `updatedAt` 降序，按 projectRoot 去重）；「添加本地项目」优先 `workspaces.pickDirectory()` + `workspaces.create({path})`，能力缺失/取消时降级为手动路径输入（能力不存在时安全降级，handoff §9.5）。
- 旧 Host 降级：`apiVersion < 6` → 渲染原 `SkillManagerSection`（保留为 legacy 组件）+ 顶部「重启 dsh web 后启用新版」提示条。
- 视觉：仅用 `--dsw-alias-*` / `--dsw-static-*` 令牌与官方 `ic_ds_*` 图标（IconSkillOutline16、IconSearchOutline16、IconPlusOutline16、IconFolderOpenOutline16、IconChevronDownOutline14、IconCheckOutline14、IconCloseOutline16、IconEllipsisOutline16 等）；紧凑 13px 行 + 1px 分隔线；`可更新` = `color-mix(in srgb, var(--dsw-alias-state-error-primary) 12%, transparent)` 底 + 红字；明暗主题走令牌自动适配。
- Client 仍为 classic-script bundle：无 JSX/TS/import，`React.createElement`，只 require 壳内 seed 词。

### 2.8 测试策略

- **Host**：`test/skill-manager.test.js`（node:test + 临时目录 + homedir 注入，不碰真实 `~/.dsh`），覆盖 handoff §12 自动化清单全部条目 + 旧 op 回归。
- **Client**：`test/client.dom.test.js`（jsdom + 上游 node_modules 的 React 18.3.1 + fetch 桩 + `__ModuleLoader__` 桩）加载真实 `client.js` bundle，断言真实渲染/交互：单页项目管理、可收起导航及重开持久化、项目选择、搜索/筛选、开关写盘、覆盖式抽屉/来源选择/标签编辑、预设预览 diff、旧 Host 降级、事件隔离。
- **运行时**：重启后 `POST /api/skill-manager` 验证 apiVersion 6；client bundle 伺服内容 = 仓库文件（逐字节）。
- **浏览器**：在内置浏览器直接验收 `http://127.0.0.1:3080/`；确认扩展 Slot 实际挂载、项目管理单页、完整 description、Cordis 两个 Skill、详情来源区与 V1.2 特化占位、抽屉打开前后列表几何尺寸不变，以及左导航收起/刷新保留/展开，检查 console 无新增页面错误。写操作与乱序响应由可重复的 Client DOM 套件覆盖。

## 3. 执行顺序与依赖

```
S0 环境对齐 ─┬─> S1 数据模型 ─> S2 扫描合并 ─> S3 启停/reconcile ─> S4 标签 ─> S5 预设 ─> S6 API v6
             └─────────────────────────────────────────────> S7 项目管理页 ─> S8 资源库页
S6+S7+S8 ─> 全部测试 ─> README ─> Git 提交 ─> 重启 apiVersion 验证 ─> 浏览器验收 ─> design-qa.md
S9/S10 贯穿：DP 任务描述随进度更新；用例执行记录在验证证据齐后回写；飞书文档以本文为底稿
```

## 4. 风险与边界说明

1. **重启会中断正在运行的轮次**（会话持久化、浏览器可重连恢复）；本次使用仓库 `restart-dsh-web.command` 重新启动 3080，并由脚本和 HTTP 验证 apiVersion 6。
2. **真实 UI 写操作会改项目 Skill 状态**：本轮 3080 实机验收只做导航与详情读取，未改用户项目配置；启停、来源、标签和预设写操作由 48 个 Host 测试及 3 个真实 bundle DOM 测试覆盖。
3. **`pickDirectory` 依赖目录选择器插件**：不可用时降级手动路径输入（不阻塞 V1 验收 2）。
4. 全局 `globalDefaultOff` 旧策略与新项目配置共存：语义已在 §2.3 对齐（冗余 stub 不创建、互不删除）。

## 5. 2026-08-23 build 13：逐项目启停体验优化

- 项目上下文改为**当前会话 cwd 优先**，历史 `localStorage` 只在没有当前项目时兜底；项目卡同时展示名称、规范路径、当前工作区/已选择项目状态和 `已启用 / 总数`，明确提示更改范围与生效时机。
- 项目列表增加带计数的全部/已启用/未启用筛选、启用/未启用分组、全选当前结果和固定批量操作条；搜索、状态、标签或项目变化时清空失效选择，避免跨结果集误操作。（启用/未启用自动分组已在 build 17 移除，见 §6。）
- 抽屉从最新 catalog 派生，不再保存陈旧行副本；标签变更会立即刷新全局标签集合。详情按钮、开关、来源选择补齐 button/switch/radiogroup/radio 语义和项目范围标签。
- `capabilities` 成为 apiVersion 6 的轻量探测操作，正常路径不再为了识别 V1 重复拉取完整 catalog；旧 host 继续通过 `catalog` unknown-op 安全降级。
- 布局改为页面骨架固定、Skill 列表单独滚动，抽屉和批量条不会随长列表滚出视口；760/600/375 px 均无横向溢出，600 px 以下隐藏左侧扩展导航，375 px 隐藏顶部副标题。
- 自动化：55 项，51 pass / 0 fail / 4 skip（Windows 权限/符号链接约束）；运行时 3080 `apiVersion 6`，实机切项目验证项目配置与下一轮 `skill-catalog` 一致，浏览器无页面脚本 error。
- Product Design 对照与响应式证据记录在仓库根 `design-qa.md`，最终结论 `passed`。本轮仅选择、筛选、打开详情，不执行真实启停写操作。

## 6. 2026-08-23 build 17：稳定连续启停的浏览位置

- 对应 DP Bug `BUG-41D93211`：默认「全部」视图按启用状态分组时，单项开关会让刚操作的 Skill 立刻移动到另一分组，破坏用户连续浏览和启用多个 Skill 的空间记忆。
- 默认列表改为严格沿用 catalog 顺序，不再渲染「已启用 / 未启用」分组标题；单项启停只 patch 当前行状态，行序和列表滚动位置保持不变。
- 已启用行使用品牌蓝与页面模块底色混合得到的淡蓝底色，并继续保留 `switch`、项目卡已启用数量和带数量的状态筛选，避免只依赖颜色传达状态。
- 「已启用 / 未启用」保留为用户主动选择的可选筛选，不再在「全部」视图中强制形成两个工作区；批量管理、预设、来源和逐项目配置语义保持不变。
- Client DOM 回归新增交错启用状态的顺序、连续启用、滚动位置、淡蓝状态样式及开关状态断言。

## 7. 2026-08-23 build 18：单页信息架构与不挤压详情

- 对应 DP Bug `BUG-3BB3965F`：实机审计确认“统一资源库”与项目管理使用同一份合并 catalog、相同搜索/标签能力，唯一有价值的来源选择已存在于详情，因此移除重复子页签，直接进入项目 Skill 管理。
- 详情抽屉在所有桌面宽度下改为 `position:absolute` 的 400px 覆盖层；不再给 `.sk-content` 添加会触发项目卡片换行的 drawer 状态类，也不再作为 flex 子项压缩列表。
- 左侧扩展类型导航使用官方 Skill、Link、Cordis Plugin 与 Chevron 图标，支持 208px 完整态和 64px 图标态；按钮保留 `aria-label`/`title`，收起状态通过 `smgr.ext.navCollapsed` 在浏览器本地保存。
- 内置浏览器 1252×900 实测：抽屉打开前后列表、项目卡片、工具栏均保持 `997.33px` 宽且 x 坐标同为 `232px`；Cordis Skill 详情仍展示 3 个来源单选项；导航刷新后保持 64px 收起态，展开后恢复 208px。
- 自动化：56 项，52 pass / 0 fail / 4 skip；新增单页结构、覆盖式 CSS/稳定布局类、导航图标、收起/重开持久化与展开回归。截图见 `artifacts/design-qa/skill-manager-build18/`。
- 测试用例 `56a9d807-3e49-4596-85f1-063c87d6c278` 已加入计划 `d53a9a04-0c07-4142-a01a-d866207d56d4`；`dp testplan execute` 仍命中平台既有“用例号校验失败”，本次追踪号 `7265b026-901a-4411-9bf3-8763d7c14a47`，因此只保留可复验的自动化与浏览器证据，不伪造 DP passed 执行记录。
