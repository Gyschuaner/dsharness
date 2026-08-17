# DSH-008 SKILL 管理中心 V1 — 设计符合性与浏览器验收（design-qa）

- 需求：DSH-008（DP 需求 `a98307cd-1b56-4a7d-92af-8930b80e04d1`）
- 设计基线：`docs/DSH-008-v1-design.md`、`docs/DSH-008-skill-center-handoff.md`
- 验收环境：`http://127.0.0.1:3081`（dsh web，源码树启动，apiVersion 6，68 个 Skill 身份），系统 Chrome headless，视口 1680×960
- 验收方式：Playwright 1.61.1 自动化套件（28 步断言，覆盖 SIT 计划 `14df386a-eb6e-41dc-8970-3f82c7274f7c` 全部 4 条用例）
- 结果：**28 通过 / 0 失败 / 0 页面错误**，耗时 20.3s（`DSH-008-acceptance/evidence.json`）
- 截图：本目录 `01`–`13`（最终全绿 run，14 张）

## 1. 用例 → 证据映射

| SIT 用例 | 验收步骤（evidence.json step） | 结果 | 关键截图 |
| --- | --- | --- | --- |
| `c07afee9` 预设双页面交互 | open-extensions（项目管理/统一资源库双 Tab）、c1-project-selector（`dsharness`）、c1-project-menu（项目菜单 + 当前工作区标记 + 添加本地项目）、c1-row-anatomy（68 行 × 68 开关）、c1-footer-git-note（`共 68 个 Skill · 已启用 0 个`）、c1-search-filter、c1-enable-filter（未启用 68/68）、c1-library-tab、c1-preset-saved / c1-preset-apply-modal（替换/合并预览）/ c1-preset-deleted | 全部通过 | 01, 02, 03, 04 |
| `4a4919f4` 启停 + 来源选择 | c3-enable-arxiv、c4-manual-invocation-hint（`/arxiv` 手动调用提示）、c3-disable-arxiv、c3-drawer-sections（当前来源/可选来源/特化/V1 更新说明）、c3-drawer-enable、c3-drawer-esc、c3-dpc-sources（默认 + 2 全局来源）、c3-dpc-source-selected（codex 纯选择）、c3-dpc-source-restored（恢复默认）、c3-bulk-visible/enabled/disabled（批量启停 2 行，footer 计数联动） | 全部通过 | 05, 06, 06b, 07, 08, 09 |
| `1015c950` 统一资源库合并 | c2-library-merge（68 行，同名合并，2 个多来源徽标）、c2-library-dpc-row（来源 ×2）、c2-library-priority-note（`默认优先级：项目专属 > DSH 用户级 > 其他全局 > 内置`） | 全部通过 | 03, 12 |
| `623c8cd9` 默认不暴露 + 手动调用 | c3-drawer-enable 后 hint「关闭后模型在本项目不再自动调用，仍可用 /arxiv 手动调用；下一轮对话生效」；footer「启停在下一轮对话生效」；V1 默认全部不启用（已启用 0 个） | 全部通过 | 06, 05 |
| 一键精简（设计 §2.5） | c3-slim-preview（先出 diff 预览「关闭全部启用」）、c3-slim-applied（确认后 arxiv 实际关闭） | 全部通过 | 10, 11 |

## 2. 验收过程中发现并修复的产品缺陷（2 个，均已修复并复验）

### 2.1 抽屉 Esc 会连带关闭整个扩展页（严重，已修复）

- **现象**：详情抽屉打开后按 Esc，抽屉关闭的同时整个扩展页被卸载（`.ext-page` 消失），后续任何操作超时。
- **根因**（keydown 注册/调用追踪实证）：`ExtensionsPage` 的页级 Esc 处理器依赖 `useEffect(..., [onClose])`，而 `onClose` 是侧栏入口每次 re-render 新建的闭包。聊天流持续 re-render 期间，该处理器被反复注销/重注册（追踪到 48 次注册），注册顺序漂移到抽屉自身处理器**之后**。抽屉处理器先执行并同步触发 React 提交，DOM 中抽屉立即移除；随后页级处理器的守卫 `querySelector('[role="dialog"]')` 读到 `null`，误判为「没有内层对话框」而调用 `onClose()` 关闭整页。
- **修复**：`onClose` 经 `React.useRef` 稳定化，页级处理器每次挂载只注册一次（注册时序追踪确认早于抽屉处理器），守卫逻辑不变。
- **复验**：修复后 keydown 追踪显示 Esc 仅由抽屉处理器消费（`drawer=true → false`，`extPage` 恒为 `true`），28 步全绿。

### 2.2 项目选择器标题显示「当前工作区」而非项目名（轻微，已修复）

- **现象**：项目选择器 pill 显示中文占位「当前工作区」，与视觉稿「显示项目名」不符。
- **修复**：`buildProjectOptions` 中当前工作区条目的 `title` 改为 `baseName(cur) || cur`（菜单内保留「当前工作区」辅助标记，视觉稿 02-project-menu 确认）。
- **复验**：`c1-project-selector` 断言 pill 文本 === `dsharness`，截图 01 确认。

## 3. 测试侧修正（非产品缺陷）

初版套件 6 项失败经聚焦复现全部定位为测试侧问题，修正后复验通过：

1. **`setEnabled` 落盘耗时 ≈ 870ms**（双遍扫描 + reconcile），初版固定 600ms 等待在开关仍处 dim（`smgr-switchDim`）态时二次点击，被 `doToggle` 的 busy 守卫正确忽略 → 改为等待 `.smgr-switchDim` 消失（settle）后再断言。
2. **来源选择**的 busy 态是按钮 disabled（`sourceBusy`）而非行 dim，settle 不等它 → 改为等待目标来源出现 `sk-srcOn`。
3. **批量启停**（`setMany`）无任何 busy 指示，成功后才重载视图 → 改为等待 footer 计数变为期望值。
4. **搜索**「lark-base」匹配到 4 行是设计行为（搜索名称 + 完整描述）→ 断言改为「结果非空且首行为 lark-base」。
5. 项目 pill 与标签筛选按钮共用 `sk-projBtn` 类 → 选择器限定含 `.sk-projTitle` 的按钮；项目菜单无 Esc 关闭 → 用按钮点击关闭。

## 4. 视觉符合性抽查（对视觉稿）

- 扩展页框架：左侧 SKILL / MCP（建设中）/ Plugin（建设中）导航 + 顶部标题/副标题/关闭钮（截图 01）。
- 项目管理页：双 Tab、当前项目 pill、搜索框、启用状态三态筛选、标签筛选、保存为预设 / 一键精简（截图 01、02）。
- 行结构：勾选框、图标、名称、「未启用」「来源 ×N」「项目特化」「可更新」徽标、单行描述、右侧开关（截图 01；徽标逻辑见代码 `rowEl`）。
- 详情抽屉：启用开关 + 手动调用说明、描述、当前来源、可选来源（默认项标注「当前解析为」）、标签（全局跨项目共享）、更新状态（V1 不检测远端更新）、为此项目特化（V1.2 说明 + 禁用按钮）、高级折叠（截图 06）。
- 统一资源库：范围说明条 + 所选项目 chip、同名合并行、优先级说明 footer（截图 03、12）。
- 项目状态 footer：「项目配置保存于 …/.dsh/skill-manager.json，可纳入 Git 版本管理；启停在下一轮对话生效」（截图 01）。

## 5. 磁盘副作用核验（验收结束后）

- `.dsh/skill-manager.json`：`enabled=[]`、`sources={}`、`appliedPreset=null`（验收动作全部还原，回到新项目初始态）。
- `.dsh/skills/`：41 个 marker stub（443–521 字节，frontmatter 含 `[skill-manager] 本项目禁用开关` 标记与 `disable-model-invocation: true`），逐文件校验 41/41 合规；**无**完整 Skill 副本、无 managed copy。
- 来源选择（dpc: global-claude → global-codex → 默认）全程为纯选择路径，未产生任何受管副本。
- lark-* 来源目录（`C:\Users\chuansgu\.agents\skills` 等）未被触碰。

## 6. 未执行项与剩余风险

| 项 | 状态 | 说明 |
| --- | --- | --- |
| 3080 实例（本 GUI 宿主）上的真实浏览器验收 | 未执行 | 3080 仍运行旧代码（detached 重启机制待收尾，计划在本轮最后以可靠方式重启并复验）；3081 为同源码树同构建的新实例，功能等价，已作为验收主环境 |
| 「下一轮对话生效」的模型目录级验证 | 未执行 | 启停通过 `.dsh/skills/` marker stub（`disable-model-invocation: true`）生效于**下一轮**对话的模型 Skill 目录扫描，本会话内无法观测下一轮目录；替代验证：stub 文件逐字节核验 + host 测试对 stub 生成/删除幂等的 35 项断言 |
| 多来源 Skill 的「用户修改副本保留（409）」 | 未执行（V1 浏览器路径不触达） | 由 host 测试套件覆盖（managed copy 识别、copyHash 不变、409 分支） |
| 预设跨项目共享 | 未执行 | 预设存于用户级 store，浏览器路径仅验证了单项目保存/预览/删除；跨项目可见性属 V1.2 |
