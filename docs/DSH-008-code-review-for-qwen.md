# DSH-008 V1 Code Review 与 Qwen 修复交接

> Review 日期：2026-08-18
>
> Review 对象：`main` @ `e74e668a8198783684fc164c7d40194ba0fd7196`
>
> 对照范围：`1e3a2b5..e74e668`
>
> DP 需求：`DSH-008`（真实 ID：`a98307cd-1b56-4a7d-92af-8930b80e04d1`）
>
> DP Bug：`BUG-3710B9A5`（V1 Code Review 阻断项，major/confirmed）
>
> 结论：**暂不建议发布 V1**。现有 37 个 Host 测试全部通过，但仍有 5 个 P1 级并发、来源选择或数据安全问题未覆盖。

## 1. 给 Qwen 的任务边界

请只修复本文列出的 V1 Review 问题，不实现 V1.1、V1.2 或市场能力。

- V1.1 安装、更新、差异、删除回退不在本轮范围。
- V1.2 AI 编辑、项目特化、版本历史、兼容性检测不在本轮范围。
- 保留现有扩展外壳、`apiVersion 6` 降级路径以及无需重启 DSH 的语义。
- 不直接合并 `main` 或部署生产；修复完成后先走本地测试、浏览器验证和 DP 状态同步。

当前共享工作区存在用户未提交内容，**不要暂存、覆盖或提交**以下内容：

- `README.md`
- `.dsh/skill-manager.json`
- `.dsh/skills/**` 的删除与新增
- 根目录 `review.md`
- `stash@{0}`（删除旧 DSH-010 分支前创建的安全备份，不要 pop/drop）

建议从 `codex/feat/DSH-008-skill-center` @ `99ac5da` 建独立 worktree 和 `fix/DSH-008-v1-review-blockers` 分支。`99ac5da` 相比 `main` 只增加 DSH-010 的 macOS 启动器改动，`plugins/skill-manager/**` 与 `e74e668` 完全一致。

## 2. Review 总结

### 阻断发布的 P1

1. 并发写项目配置会丢更新，并频繁撞同一个临时文件。
2. 同 rank 来源的默认顺序错误，显式来源选择只改 UI/配置、不一定改变 DSH 实际来源。
3. 目录 Skill 的二进制附属文件按 UTF-8 字符串哈希，可漏掉真实内容变化，破坏“修改后不覆盖/不删除”的安全边界。
4. 来源副本替换和配置提交不是事务，失败时可能丢旧副本或留下未登记、却会遮蔽其他来源的项目文件。
5. Client 切换项目时没有隔离异步请求；旧列表、旧预览或旧响应可作用到新项目。

### P2 与交付缺口

6. 项目配置不保留未知字段，也不校验 schema/apiVersion，和代码注释中的前向兼容承诺不符。
7. 配置读取权限错误被当成“损坏配置 = 空配置”，随后 reconcile 可能按全关状态修改项目文件。
8. reconcile 失败仍返回 200，Client 忽略 `report.failed/conflicts`，页面可能显示“已启用”但模型实际未生效。
9. `main` 跟踪了 41 个可重建 marker stub 和含 Windows 绝对路径的运行时配置，跨机器打开页面即污染工作区。
10. 设计声明的 `test/client.dom.test.js` 实际不存在，关键 UI 竞态没有可重复自动化保护。

## 3. 详细问题与修复验收

### P1-1：并发 mutation 丢更新，临时文件名发生碰撞

位置：

- `plugins/skill-manager/lib/state.js:96-105`
- `plugins/skill-manager/lib/index.js:339-368`
- `plugins/skill-manager/lib/client.js:1237-1273`

原因：

- `mutateProject()` 是“读配置 → 修改内存 → 写配置”，没有按 canonical `projectRoot` 串行化或版本比较。
- UI 只阻止同一行重复点击，不阻止两个不同 Skill 同时发起 `setEnabled`。
- `atomicWriteFile()` 使用 `pid + Date.now()` 作为临时文件名；同一进程同一毫秒写同一路径会共用临时文件。原子 rename 只能防止半截 JSON，不能防止读改写丢更新。
- 全局 tags/presets 也采用无锁读改写，存在同类覆盖问题。

隔离复现结果：并发启用 `race-a` 与 `race-b` 20 次，**20/20 最终只保留一个 enabled，18/20 至少一个请求返回 500**。

修复要求：

1. 为项目配置建立按 canonical 配置路径分组的异步队列/互斥锁，锁住完整的“读取、计算、落盘、reconcile、返回新视图”事务。
2. 全局配置使用独立的全局队列，避免 tags、preset、policy 互相覆盖。
3. 临时文件名使用真正唯一的后缀（例如 `randomUUID()`），并保留同目录 rename。
4. 如需支持多进程同时运行，增加 revision/CAS 或 lock-file；至少先保证单 Host 进程内正确。
5. 新增测试：两个不同 `setEnabled` 并发后 enabled 为并集且均返回 200；并发 `setTags`/`presets.save` 不丢另一方字段。

### P1-2：同 rank 来源选择没有真实生效

位置：

- `plugins/skill-manager/lib/catalog.js:328-347`
- `plugins/skill-manager/lib/catalog.js:484-514`
- `plugins/skill-manager/lib/catalog.js:856-875`

原因：

- 产品顺序明确为 `global-codex → global-claude`，但 `sourceRank()` 找不到这两个具体 key，二者都回退到 bundled rank，再按 key 字母排序，结果变成 `global-claude → global-codex`。
- `applySourceSelection()` 只在存在 `other.rank < selected.rank` 时物化项目副本。相同 rank 的两个来源无论选择哪个，都只写 `skill-manager.json`。
- DSH 的 Skill 解析器不读取这份来源选择配置；没有项目副本时，显式选择不能覆盖 DSH 自己的 tie-breaker。
- `classifyIdentity()` 又把配置中的显式来源直接报告成 `effectiveSourceKey`，因此 UI 会显示“已切换”，即使磁盘和 DSH 实际来源没有变化。

隔离复现：同名 Skill 同时放在 `~/.codex/skills` 和 `~/.claude/skills` 后，catalog 返回：

```json
{
  "sourceOrder": ["global-claude", "global-codex"],
  "defaultSourceKey": "global-claude",
  "generated": false
}
```

依次显式选择 Codex、Claude，接口都报告所选项为 effective，但两次都 `generated:false`，磁盘上没有任何能改变 DSH 解析结果的副本。

修复要求：

1. 使用明确、稳定的产品顺序表，不用 scope + 字母排序推导：`project-dsh`、`project-agents`、`user-dsh`、`user-agents`、`global-codex`、`global-claude`、bundled。
2. 单独建模 DSH 的真实 winner 顺序（rank + 根注册顺序/tie-breaker）。
3. 只要“用户选择的来源身份”不是 DSH 实际 winner，就物化 rank 100 的受管副本，包括相同 rank 的情况。
4. `effectiveSourceKey` 必须反映实际生效来源，不能只回显配置意图。
5. 新增同 rank 测试：默认来源、选择另一个来源、刷新后真实内容、恢复默认；再覆盖两个 bundled preset 同名的稳定顺序。

### P1-3：二进制附属文件的 hash 会漏变化

位置：`plugins/skill-manager/lib/state.js:329-368`。

原因：目录 bundle 读取 `Buffer` 后先 `toString('utf8')`，再由 `sha256Hex()` 以 UTF-8 字符串哈希。不同的非法 UTF-8 字节可能都变成同一个替换字符 `U+FFFD`。

已复现：把附属文件从单字节 `0x80` 改成 `0x81`，前后 `hashSkillSource()` 返回完全相同的 SHA-256。

影响：用户改过图片、压缩包、数据库或其他二进制附件后，系统仍可能判定副本“未修改”，随后自动覆盖或删除，违反最关键的数据保护约束。

修复要求：

1. `sha256Hex()` 支持 `Buffer/Uint8Array`，文件内容直接 `createHash().update(data)`，不得先转字符串。
2. 目录总 hash 继续包含规范化相对路径与每个文件的 byte hash；最好同时包含文件长度，避免组合格式歧义。
3. 增加非法 UTF-8 字节变化、NUL 字节、常见 PNG/ZIP fixture 的测试。

### P1-4：来源副本与配置提交不是事务

位置：

- `plugins/skill-manager/lib/catalog.js:354-391`
- `plugins/skill-manager/lib/catalog.js:773-816`
- `plugins/skill-manager/lib/catalog.js:827-889`
- `plugins/skill-manager/lib/index.js:345-368`

原因：

- 目录复制在检查 50MB 上限前先 `rm(destDir)`；复制到一半超限或读写失败时，旧副本已经丢失。
- 替换旧受管副本时，`ensureManagedCopy()` 先删旧副本，再复制新来源。
- `applySourceSelection()` 在 `mutateProject()` 写配置之前就创建/删除磁盘副本。若后续配置写失败，新副本会变成“未登记的项目原生 Skill”；它的 rank 100 会持续遮蔽通用来源。
- 预设会连续应用多个来源；中途任一来源 409，前面已经发生的文件副作用不会回滚，但项目配置不会提交。

修复要求：

1. 先把完整新副本写到同一父目录下的唯一 staging 路径，完成文件数/总大小、frontmatter 与 hash 校验后再替换目标。
2. 替换已有目录时使用 backup + rename + rollback；兼顾 Windows 无法直接 rename 覆盖非空目录的行为。
3. 在 P1-1 的项目锁内协调配置和文件提交；任何失败都不得留下未登记副本或删除最后一个可恢复副本。
4. 预设应用必须具备全量预检查与回滚，或先生成无副作用执行计划，再统一提交。
5. 新增故障注入测试：超过 50MB、源文件中途消失、rename/write 失败、预设第二个来源冲突；断言旧副本和旧配置均保持不变。

### P1-5：项目切换存在跨项目 UI 竞态

位置：

- `plugins/skill-manager/lib/client.js:1142-1178`
- `plugins/skill-manager/lib/client.js:1200-1208`
- `plugins/skill-manager/lib/client.js:1237-1377`

原因与风险：

- `loadView()` 没有 AbortController、请求序号或 cwd 校验。先请求 A、再请求 B，A 较晚返回时会覆盖 B 的页面。
- 切换项目时没有立即清空旧 `view`，`viewBusy` 也没有禁用列表操作。项目已经变为 B、列表仍显示 A 时，点击开关会把 A 行的意图发送给 B。
- A 的 `setEnabled/setSource` 响应返回后会直接 `patchRow()` 到 B 的 view；同名 Skill 可把 A 的描述、来源和 enabled 状态写进 B 的当前 UI。
- 切换项目没有关闭或绑定 preset/slim modal。A 的 preview 返回后，`applyPreset()` 使用当前 `project.cwd`，可能把 A 的预览应用到 B。

修复要求：

1. 每个 catalog 请求带单调递增 generation，成功/失败回调仅在 `requestedCwd === currentSelectedCwd` 且 generation 最新时更新状态；可同时使用 AbortController。
2. 切项目立即清空旧 view、selection、drawer、busy、错误和所有项目相关 modal，加载完成前禁用写操作。
3. 每个 mutation 和 preview 在创建时绑定 cwd；回调和确认应用时再次核对 cwd，不匹配就丢弃/关闭。
4. 增加真实 Client DOM 测试，用可控 deferred fetch 覆盖 A/B 乱序返回、切换中点击、旧 mutation 返回、预览后切项目。

### P2-1：项目配置并未前向兼容

位置：`plugins/skill-manager/lib/state.js:10-19, 114-190`。

代码注释声称 unknown fields 会 round-trip 保留，但 `normalizeProjectConfig()` 只保留当前已知字段，`writeProjectConfig()` 又重新构造固定对象；未知顶层字段与来源扩展字段都会丢失。schema/apiVersion 也没有验证，未来版本配置会被当作 V1 读取，并在下一次 mutation 中静默降级为 v6。

修复要求：

- read 同时保留 raw；write 以 raw + normalized patch 合并，和 global config 做法一致。
- 对未来 `apiVersion > 6` 返回明确的只读/升级提示，禁止旧代码覆盖。
- 为旧版本建立显式迁移函数；增加 unknown 字段保留与 future-version 拒写测试。

### P2-2：不可读配置不应等同于损坏 JSON

位置：`plugins/skill-manager/lib/state.js:114-127`、`plugins/skill-manager/lib/catalog.js:902-924`。

除 ENOENT 外的所有错误，包括 EACCES、I/O 错误和 JSON 语法错误，都降级为空配置。随后 catalog 会执行 reconcile，可能按“全关”修改项目 Skill 或生成大量 stub。

修复要求：只对明确 JSON/schema 损坏走可见的 corrupt 降级；权限和 I/O 错误应停止 reconcile，并向 UI 返回可操作错误。不得在无法读取真相文件时按空配置改磁盘。

### P2-3：reconcile 失败被 UI 当作成功

位置：`plugins/skill-manager/lib/index.js:345-368`、`plugins/skill-manager/lib/client.js:1237-1377`。

Host 把单文件失败放进 `report.failed` 后仍返回 200；Client 对 `setEnabled/setMany/setSource/preset/slim` 的成功分支不检查 report。这样 config.enabled 已变化、真实 Skill 文件未变化时，页面仍显示成功。

修复要求：至少在 Client 显示持久错误/警告并刷新真实状态；对目标操作本身失败的情况，Host 应返回非 2xx 或明确 `partial:true`，不能只写日志。新增不可写 Skill 目录和部分批量失败测试。

### P2-4：`.dsh` 验收运行时产物不应原样留在 Git

`main` 当前跟踪 `.dsh/skill-manager.json` 与 41 个 marker stub。配置内写死 `D:\\Pythonproject\\dsharness`；在 macOS 首次扫描后就会改成 Mac 绝对路径，41 个旧 stub 也会随本机 Skill 集变化而删除/新增。当前共享工作区已经真实出现这种大规模 dirty 状态。

结论与要求：

- 41 个 marker stub 是设计明确声明“可重建”的派生产物，应从仓库移除。
- 项目配置可继续纳入 Git，但 `projectRoot` 不应存绝对路径；运行时从配置所在目录推导，或持久化 `.`。
- **不要直接 `.gitignore /.dsh/skills/**`**，否则会误伤真正需要版本控制的项目专属 Skill。请先设计能精确区分 generated stub/managed copy 与真实项目 Skill 的策略，再改 ignore/目录布局。
- 不要把当前工作区里用户的 `.dsh` 删除、新增或 Mac 配置顺手提交。

### P2-5：Client 自动化交付缺口

`docs/DSH-008-v1-design.md:121` 明确声明存在 `plugins/skill-manager/test/client.dom.test.js`，实际 `plugins/skill-manager/test/` 只有 `skill-manager.test.js`。现有 13 张截图与 `evidence.json` 是验收证据，不是可重复执行的 Client 回归套件。

修复要求：补真实 bundle 的 DOM 集成测试，至少覆盖双页切换、完整 description、项目切换竞态、单项/批量 busy、抽屉与 Esc、来源选择、tags、preset preview/apply、`apiVersion < 6` 降级和更新徽标条件渲染。

## 4. 已通过或方向正确的部分

- 37 个 Host 测试与 image-context-guard 8 个回归测试在锁定的 Node `24.11.1` 下通过。
- `plugins/skill-manager/lib/*.js` 全部通过 `node --check`。
- Skill name 校验、目标路径 containment、bundled/global 只读错误语义基本清晰。
- marker stub 删除前会校验固定 description marker，不会仅按文件名删除普通文件。
- 项目启停不修改 `user-invocable`，保留 `/skill-name` 手动调用语义。
- 目录扫描、同名 identity 合并、损坏来源隔离、junction 识别、default-off 和 legacy op 回归已有 Host 测试。
- Esc 页级 handler 使用 `useRef` 稳定化的修复方向正确。
- V1 `updateInfo` 恒为 null，只有存在真实值时才渲染浅红“可更新”，没有伪造更新状态。
- 列表和抽屉均展示完整 description，符合产品要求。

## 5. 修复后的最低验证矩阵

请不要只让原有 37 个测试继续绿；至少新增以下用例后再交付：

| 领域 | 必测场景 |
| --- | --- |
| 项目并发 | 两个 setEnabled 并发；setMany 与 setEnabled 交叉；均 200 且无丢状态 |
| 全局并发 | tags 与 preset 并发保存，不覆盖无关字段 |
| 来源 tie | Codex/Claude 同名同 rank 的默认顺序与双向显式选择 |
| hash | 非法 UTF-8 二进制、PNG/ZIP 内容变更必定改变 hash |
| 事务失败 | >50MB、读失败、rename 失败、配置写失败、预设中途 409 均不破坏旧状态 |
| 配置版本 | unknown 字段保留；future apiVersion 拒写；EACCES 不 reconcile |
| Client 竞态 | A/B catalog 乱序、切换中点击、旧 mutation 响应、preview 后切项目 |
| Client 兼容 | apiVersion 6 正常；旧 Host 降级；Esc 只关最内层 |
| 跨平台 | Node 24.11.1；macOS + Windows 路径、chmod/rename 差异 |

建议命令：

```sh
NODE=/Users/guyisheng/.cache/dsharness/toolchains/node-v24.11.1-darwin-arm64/bin/node
"$NODE" --test plugins/skill-manager/test/
"$NODE" --test plugins/image-context-guard/test/image-context-guard.test.js
for f in plugins/skill-manager/lib/*.js; do "$NODE" --check "$f"; done
```

前端修复后还必须在实际 DSH 页面完成：快速切换两个项目、连续切换多个 Skill、来源切换、预设 preview 后切项目、Esc 层级和无需重启下一轮生效验证，并保存可复核证据。

## 6. DP 与 Git 交付要求

1. 开始修复前按仓库 `AGENTS.md` 检查 DP，确认当前项目为 DSH，读取 `DSH-008` 和关联 Bug 的 `allowed_transitions`。
2. 本文 P1 已登记为 DP `BUG-3710B9A5`；开始修复时先按其 `allowed_transitions` 推进。原需求当前是 `ready_for_release`，未修复前不要转 `released`。
3. 提交信息包含 `DSH-008` 或关联 Bug 编号。
4. 只提交本轮修复和新增测试；不要混入共享工作区的 `.dsh`、README、`review.md` 或启动器之外变更。
5. 修复后回写 DP 测试证据、剩余风险和真实状态；未经用户授权不合并 main、不部署生产。

## 7. Review 输入中的一处勘误

根目录 `review.md` 把需求 ID 写成了：

`a98307cd-1b56-4a7d-92af-92af-8930b80e04d1`

中间重复了一段 `92af`。DP 返回的真实 ID 是：

`a98307cd-1b56-4a7d-92af-8930b80e04d1`
