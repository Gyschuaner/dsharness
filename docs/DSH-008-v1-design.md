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
| S7 | Client 项目管理页 | 双页导航（项目管理默认/统一资源库）；左栏（当前项目下拉、最近打开、添加本地项目、自定义预设）；列表（搜索/已启用/未启用/全部标签/批量精简/批量启停）；行（图标、名称、项目特化/可更新徽标、标签、完整 description、开关）；右抽屉（描述、当前来源、可选来源、标签编辑、启用状态、附属文件、特化=后续能力）；旧 Host（apiVersion<6）降级为原 UI | DOM 集成测试：渲染、筛选、开关、抽屉、预设预览、事件隔离 |
| S8 | Client 统一资源库页 | 全来源合并身份列表（来源数徽标）；抽屉列出全部真实来源 + 当前项目来源选择；标签筛选/编辑；搜索 | DOM 集成测试 |
| S9 | 验证与 QA | 全部 `node --test` 通过；client bundle 语法检查；重启 dsh web 验证 apiVersion 6；HTTP 冒烟；视觉对照（可执行部分）；`design-qa.md` | 测试报告 + HTTP 响应 + 截图对照（用户侧） |
| S10 | 回写与交付 | DP 任务/用例执行/SIT 流转；飞书技术文档 + `dp document ensure`；Obsidian 研发记录；Git 提交（含 DSH-008） | DP 查询验证 |

**明确不做（V1 边界）**：Skill 市场入口（不建假入口）；安装（目录/ZIP/Git/URL）；更新检测与 `可更新` 真实数据（接口保留 `updateInfo` 展示位，无数据不显示）；删除来源与回退；AI 创建/编辑；项目特化编辑（抽屉展示「配置特化」但标注后续能力、不可点）；版本历史；兼容性检查。

## 2. 关键设计决策

### 2.1 数据边界（handoff §9.1）

- **项目配置 = 唯一真相**：`<projectRoot>/.dsh/skill-manager.json`

  ```json
  {
    "schema": "dsh-skill-manager/project",
    "apiVersion": 6,
    "projectRoot": "C:/abs/project",
    "enabled": ["skill-a"],
    "sources": { "skill-c": { "source": "user-dsh", "contentHash": "sha256:...", "generated": true } },
    "appliedPreset": null,
    "updatedAt": "..."
  }
  ```

  - `enabled`：进入本项目模型自动候选的 skill 身份（name）集合。文件缺失 = 空集合 = 全关（新项目默认）。
  - `sources`：显式来源选择 + 已生成副本登记（`generated:true` + 内容哈希，作为副本的「可验证 marker」：覆盖/删除前必须配置条目存在且内容哈希与来源一致，绝不按路径猜测删除）。
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
   - 全局 `globalDefaultOff` 开启且用户级原件已带全局标志时，该身份的禁用已由原件表达，stub 冗余 → 不创建（与旧 `enforceGlobalPolicy` 的清理规则协同，避免互相删除）。
- `user-invocable` 默认 true 不受任何机制影响 → `/skill-name` 手动调用永远可用（验收 3/12）。
- 清理规则：stub 仅在（a）配置声明该身份 enabled，或（b）对应原件已不存在（孤儿）时删除，且删除前必须 `isShadowFile` marker 验证；普通 skill 文件、用户修改的副本永不被删除/覆盖。
- 物化时机：`catalog` / `projectState` / `setEnabled` / `setMany` / `setSource` 等读项目状态的 op 触发一次幂等 reconcile（单文件失败不阻断、记日志、下轮自愈，与现行政策执行一致）。
- 热加载：stub/副本/标志写入后 DSH 的 chokidar watcher 使 skill provider 失效 → **下一轮对话生效，无需重启 DSH**（skill-filesystem `watch:true`，已核实）。

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

- 入口不变：`sidebar.footer.action`「扩展」全页；SKILL tab 内变为两个一级子页面（项目管理默认 / 统一资源库），MCP/Plugin 占位不变。
- 状态：`activePage / selectedProject / selectedSkill / search / enableFilter / tagFilter / selectedRows / presetPreview / slimPreview / drawer`；页面/项目/抽屉切换清理无效选中；行点击与开关点击 `stopPropagation` 防串扰；description 完整多行、不截断不翻译。
- 项目选择：`ctx.get('sessions')` 当前会话 cwd 为默认项目；`ctx.get('workspaces').list.getSnapshot()` 提供最近打开（`items` 按 `updatedAt` 降序，按 projectRoot 去重）；「添加本地项目」优先 `workspaces.pickDirectory()` + `workspaces.create({path})`，能力缺失/取消时降级为手动路径输入（能力不存在时安全降级，handoff §9.5）。
- 旧 Host 降级：`apiVersion < 6` → 渲染原 `SkillManagerSection`（保留为 legacy 组件）+ 顶部「重启 dsh web 后启用新版」提示条。
- 视觉：仅用 `--dsw-alias-*` / `--dsw-static-*` 令牌与官方 `ic_ds_*` 图标（IconSkillOutline16、IconSearchOutline16、IconPlusOutline16、IconFolderOpenOutline16、IconChevronDownOutline14、IconCheckOutline14、IconCloseOutline16、IconEllipsisOutline16 等）；紧凑 13px 行 + 1px 分隔线；`可更新` = `color-mix(in srgb, var(--dsw-alias-state-error-primary) 12%, transparent)` 底 + 红字；明暗主题走令牌自动适配。
- Client 仍为 classic-script bundle：无 JSX/TS/import，`React.createElement`，只 require 壳内 seed 词。

### 2.8 测试策略

- **Host**：`test/skill-manager.test.js`（node:test + 临时目录 + homedir 注入，不碰真实 `~/.dsh`），覆盖 handoff §12 自动化清单全部条目 + 旧 op 回归。
- **Client**：`test/client.dom.test.js`（jsdom + 上游 node_modules 的 React 18.3.1 + fetch 桩 + `__ModuleLoader__` 桩）加载真实 `client.js` bundle，断言真实渲染/交互：双页切换、项目选择、搜索/筛选、开关写盘、抽屉打开/来源选择/标签编辑、预设预览 diff、旧 Host 降级、事件隔离。
- **运行时**：重启后 `POST /api/skill-manager` 验证 apiVersion 6；client bundle 伺服内容 = 仓库文件（逐字节）。
- **浏览器**：DOM 集成测试 + HTTP 冒烟为替代证据；GUI 内最终视觉/交互验收与截图对照由用户在 GUI 侧确认（见 §4 风险）。

## 3. 执行顺序与依赖

```
S0 环境对齐 ─┬─> S1 数据模型 ─> S2 扫描合并 ─> S3 启停/reconcile ─> S4 标签 ─> S5 预设 ─> S6 API v6
             └─────────────────────────────────────────────> S7 项目管理页 ─> S8 资源库页
S6+S7+S8 ─> 全部测试 ─> README ─> Git 提交 ─> 调度重启 ─> (下一轮) apiVersion 验证 + 浏览器验收 + design-qa.md
S9/S10 贯穿：DP 任务描述随进度更新；用例执行记录在验证证据齐后回写；飞书文档以本文为底稿
```

## 4. 风险与边界说明

1. **重启会中断本 GUI 宿主进程**（进行中的轮次中断，会话持久化、浏览器重连恢复）：重启以完全分离的延迟进程在最终消息发出后 ~45s 执行，使用与当前一致的源码树命令 `node D:\Pythonproject\deepseek-harness\apps\cli\lib\bin.js web --host 127.0.0.1 --port 3080`。
2. **origin push 不可用**（本机到 github.com 的 TLS 握手失败）：提交仅落本地；push 待网络恢复，属剩余风险。
3. **GUI 侧真实视觉验收**：agent 无法驱动自身 GUI 截图，DOM 集成测试 + 令牌级 CSS 校验为替代证据；`design-qa.md` 中未截图项如实标注，由用户在 GUI 确认。
4. **`pickDirectory` 依赖目录选择器插件**：不可用时降级手动路径输入（不阻塞 V1 验收 2）。
5. 全局 `globalDefaultOff` 旧策略与新项目配置共存：语义已在 §2.3 对齐（冗余 stub 不创建、互不删除）。
