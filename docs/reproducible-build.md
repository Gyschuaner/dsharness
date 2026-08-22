# DSH 可复现构建

## 一、目标与范围

`dsharness` 不复制 DeepSeek Harness 的全部上游源码，而是记录官方基线提交、按顺序应用的本地补丁、工具链版本和最终源码树校验值。新电脑只要能访问 GitHub 与 npm registry，就可以从这些材料构建与当前主干相同的 DSH。

个人运行状态不属于可复现构建范围。安装脚本不会读取或复制 `~/.dsh` 下的凭据、会话、附件和个人设置；这些数据由新电脑首次启动后独立生成。AI Relay Key 也应由管理员按设备或使用人单独分发。

## 二、锁定内容

`upstream.lock.json` 是构建事实来源，当前锁定内容包括：

- DeepSeek Harness 官方标签 `dsh-v0.1.1-rc.2`，提交 `b150a55`；
- Node `24.11.1` 与 pnpm `11.7.0`；
- `upstream-patches/` 中按顺序应用的 DSH-009 流式活动保活补丁、DSH-012
  Qwen 原生 Agent preset 补丁、BUG-B0EE8D2D Think 伪工具调用持久历史恢复与
  重试流 JSDoc 补丁、DSH-011 Compact 32K 摘要预算补丁、DSH-014 工具调用即时
  进度反馈补丁、BUG-449804CF 工具耗时与行内状态布局修复、BUG-5F3BF25D 快速工具
  运行态可感知性修复、亚秒耗时毫秒精度展示、DSH-015 Code 子工具计划提前展示、
  DSH-016 Think 独立计时和工具活动状态布局、DSH-018 输出 token 上限自动持续续跑，
  DSH-019 的 0.1.1 兼容调整、BUG-C393119A 静态门禁修复，以及 DSH-005 可选视觉桥
  及其发布门禁和 `vision_inspect` 专属视觉工具呈现，并包含各自的 SHA-256；
- 应用补丁后的 Git tree `2f2d1e7033499d5e2d7b7e2d66450b69df117741`。

脚本同时校验补丁哈希和最终源码树。上游提交相同但补丁被修改、漏应用或顺序变化时，构建会在安装依赖前停止。

DSH-012 的 `qwen-native` 是构建产物中的系统级 preset，不存放在个人
`~/.dsh/.agent-presets`。因此新电脑重新拉取本仓库并执行安装脚本后会自动包含它；
该 preset 不会被设为默认，安装流程也不会读取或修改 `~/.dsh/settings.yaml` 中的
模型、推理强度或 preset 默认值。

## 三、新电脑安装

新电脑需要先安装 Git 和 Node `24.11.1`。随后克隆本仓库并执行：

```powershell
git clone https://github.com/Gyschuaner/dsharness.git
cd dsharness
.\dev\install-dsh-source.ps1 -StartWeb
```

默认源码目录是与 `dsharness` 同级的 `deepseek-harness`。需要放到其他位置时显式指定：

```powershell
.\dev\install-dsh-source.ps1 -SourceDirectory D:\Pythonproject\deepseek-harness -StartWeb
```

脚本依次完成源码拉取、补丁应用、`pnpm install --frozen-lockfile`、完整构建、全局 `dsh` 注册和可选的 Web 启动。构建时通过 Corepack 读取上游仓库的 `packageManager`，实际 pnpm 版本必须与锁文件一致。

## 四、安全行为与异常处理

安装脚本不会对既有目录执行 `reset`、清空或覆盖操作。目标目录只有以下两种状态可以继续：

- 空路径，由脚本新建并拉取锁定源码；
- 工作区干净，且 Git tree 已经等于官方基线或最终锁定结果。

目录不是 Git 仓库、存在未提交修改或源码树不匹配时，脚本直接停止。保留原目录，改用新的 `-SourceDirectory` 即可，不需要删除已有文件。

## 五、验证与更新

安装结束后可以独立执行：

```powershell
.\dev\verify-dsh-source.ps1 -RequireWeb
```

升级官方 DSH 或新增上游补丁时，需要同步更新 `upstream.lock.json` 中的基线提交、补丁哈希和最终 tree，并从空目录重新执行安装脚本。只有干净构建、完整构建和 Web 冒烟都通过后，新的锁定结果才能合入 `main`。

2026-08-17 已在一条全新目录链路上完成验证：官方源码浅拉取、DSH-009 补丁应用、923 个锁定依赖安装和完整 `build:lib + build:web` 均通过，总耗时约 166 秒；补丁涉及的 `adapter.spec.ts` 与 `convert.spec.ts` 共 119 条测试全部通过。随后直接使用新源码树启动 3083 验证实例，首页返回 HTTP 200；验证完成后仅关闭该实例，现有 3080 运行环境未被修改。

2026-08-18 为 DSH-012 在全新 worktree 从官方基线按锁定顺序回放 DSH-009 与
DSH-012 补丁，得到与锁文件一致的 tree
`85d75ae8df920229dccd8f6b2a93a5a7ac541ad3`。锁定依赖安装与完整
`build:lib + build:web` 通过；Qwen preset 聚焦单元测试 16 条、CLI 组合测试 30 条、
Web preset 浏览器测试 13 条全部通过，相关 TypeScript 文件 lint 通过。

2026-08-19 更新 BUG-B0EE8D2D 的第三个上游补丁。补丁只识别“正常 stop、仅含私有
reasoning、且包含 Qwen 风格工具标签”的窄场景，不解释标签内容；标准重试策略只恢复
一次。无效输出会先作为 assistant 消息持久化，并省略不可信的提供方 replay state；
随后持久追加一条 user-role `<system-reminder>`，明确说明没有工具被执行。纠错请求复用
原 system、tools 与 prompt assembly，在新步骤中读取“原历史 + 失败 Think + reminder”，
这些内容也会继续进入后续轮次。Chat 投影保留失败 Think，不再用重试结果覆盖它。

相关 Agent loop、LLM 适配、重试策略和 Chat 投影专项回归 165 条通过；全量 817 个测试
文件中 808 个通过、9 个跳过，共 13,518 条测试通过、112 条跳过。TypeScript 类型检查、
全仓 lint、中英配对、Markdown 换行与链接检查，以及 Host/Client/Web 完整构建通过。
随后从官方基线在全新 worktree 顺序回放三个补丁（第三个补丁内含两次 BUG 修复提交），
得到并锁定 tree `9f48dcf0fd3f10bf0566eb0256a4a65770776dd3`。

同日将本机 `D:\Pythonproject\deepseek-harness` 从第一个补丁后的干净中间 tree
顺序更新到该最终 tree，重新执行 frozen install 与完整构建。安装脚本现在会识别
已经指向同一 `apps/cli` 的全局 npm junction，跳过会触发 npm 11.6.2 reify 异常的
重复 `npm link`，同时仍校验 `dsh --version`。3080 已从该源码目录的构建产物重启，
首页返回 HTTP 200、Skill Manager apiVersion 为 6，应用内浏览器完成插件加载且控制台
无 error。

2026-08-19 为 DSH-011 从官方基线 `99f6f02` 在全新目录依次回放五个补丁，最终
tree 为 `caba0a03e3c151008951082a3485ee1972d48dc0`。安装 923 个锁定依赖后，完整
`build:lib + build:web` 通过；Compact 配置聚焦测试 80 条全部通过，目标配置文件覆盖率
为 100%，全仓 lint 与 TypeScript 类型检查通过。文档同步门禁 27/28 通过，唯一未通过项
是当前 Windows 环境无符号链接创建权限，测试夹具在 `symlinkSync` 处报 EPERM；JSDoc、
中英配对与文档构建均通过。验证脚本同时检查源码和构建产物中的默认摘要预算均为
32768 tokens。本次使用 `-SkipRegister`，没有更新全局 `dsh`，也没有启动或重启 Web
服务；现有 3080 运行环境保持不变。

2026-08-19 合并 BUG-B0EE8D2D 持久历史恢复后，保留主干已有的重试流 JSDoc 与
DSH-011 Compact 32K 补丁，从官方基线依次回放五个补丁并锁定最终 tree
`50da9c5101642d62baf200cb29449617737cd8f5`。Node `24.11.1` / pnpm `11.7.0`
下 frozen install 与 Host/Client/Web 完整构建通过；Agent loop、pi-ai、重试、Chat
投影及 Compact 7 个测试文件共 265 条回归通过。随后在持久 macOS 构建目录完成相同
tree 的完整重建，并从该目录重启 3080；首页恢复，Skill Manager apiVersion 为 6。

2026-08-20 为 DSH-014 增加第六个上游补丁。工具调用从首个参数增量开始展示普通
工具行、灰色计时器、`ing` 和 Think 同款扫描光；正式结束后计时冻结并隐藏状态词，
悬停或键盘聚焦时显示 `Done`。补丁保留正式工具事件的历史排序，只继承首个增量的
计时起点，并覆盖并行调用、空调用 ID、重试清理与回放。Node `24.11.1` / pnpm
`11.7.0` 下 Host/Client/Web 完整构建通过；GUI 274 个测试文件共 3792 条用例通过，
Web 回放 75 个测试文件共 253 条用例通过。最终 tree 锁定为
`b481531a81fa688c4367368cc448ae1ca14ce27f`，未部署或重启现有运行环境。

2026-08-20 为 BUG-449804CF 增加第七个上游补丁。正耗时不足一秒的工具调用显示为
`<1s`，避免嵌套工具普遍显示 `0s`；计时和 `ing/Done` 改为紧跟工具标题或摘要，
不再占据行尾独立列，并使用与工具标题一致的 14px 字号、保留灰色弱化。Node
`24.11.1` / pnpm `11.7.0` 下 Host/Client/Web 完整构建通过；GUI 274 个测试文件共
3795 条用例通过，Web 工具行专项回放 5 条用例通过，并在本地 3081 实际页面确认
历史子工具显示、布局与字号。最终 tree 锁定为
`bc31435a3eb8ed9b000562207db21cb1628ef148`。

2026-08-20 为 BUG-5F3BF25D 增加第八个上游补丁。Session 日志证明实际 Write
子调用仅耗时 8-12 ms、Read 仅 3 ms，开始与结束事件会落入浏览器同一次绘制；
展示层因此为这类快速结算保留从真实开始时间计算的至少 600 ms `ing` 与扫描光，
但不延迟工具执行，也不修改冻结后的真实耗时。Node `24.11.1` / pnpm `11.7.0`
下 Client/Web 构建通过；GUI 274 个测试文件共 3796 条用例、Code Mode 浏览器回放
6 条及工具行滚动回放 5 条均通过，翻译配对与 Agent Note 格式门禁通过。最终 tree
锁定为 `6dd55f428bd50bdea594886d5de84dc12bce0a1b`，本地 3081 已更新供复测。

2026-08-20 为 BUG-449804CF 增加第九个上游补丁，将不足一秒的真实工具耗时从统一
`<1s` 调整为整数毫秒，1000 ms 起继续使用秒。ui-tool 16 个测试文件共 232 条用例
通过，Web 前端和 ui-tool 动态模块构建通过；本地 3081 历史回放确认 Bash 显示
`16ms` / `21ms`、Read 显示 `3ms`、Write 显示 `8ms` / `12ms`，父级 Code 秒数不变。
最终 tree 锁定为 `ec315d1fb86ed652d27e2fadaeffc512e09158aa`。

2026-08-20 为 DSH-015 增加第十个上游补丁。`run_code` 新增位于 `code` 前的有序
`plannedTools`，模型参数流每完成一个名称就投影一条无计时器的 `ing` 子工具预览；
真实 `tool/code-dispatch-start` 到达后按序替换预览并开始计时。旧记录通过保守静态扫描
直接 `tools.name(...)` 调用兼容，字符串、注释和间接引用不会产生误报。相关 48 个测试
文件共 787 条用例、Host/Client/Web 完整构建、文档同步门禁和真实 PTC 浏览器验证均
通过；浏览器确认 Read、Bash 在执行前先出现且无计时器，随后分别按真实 dispatch
计时。最终 tree 锁定为 `5318e889f9b40cef8d3c1d3c8ae4b44a1a43a525`。

2026-08-20 为 DSH-016 增加第十一个上游补丁。每个 Think 块从首个流式 reasoning
增量独立计时，运行态显示 `Think ing <耗时>`，完成后只保留耗时且悬停不显示
`Done`；Code 与其他工具把 `ing` 紧跟标题、耗时放在摘要后，完成悬停时在预留槽中
显示 `Done`，亚秒耗时继续使用整数毫秒。相关 Client 68 个测试文件共 1196 条用例、
Web 关键回放 16 个文件共 75 条用例、TypeScript、lint、文档同步门禁和 Host/Client/Web
完整构建均通过；本地 3081 实际页面确认 Think 首帧 `ing` 与毫秒计时、Code 首个调用
意图即时出现、完成工具的 `Done` 悬停不造成位移。滚动契约浏览器套件因测试会话搜索
索引在入口阶段持续为空而未进入本次断言，保留为 SIT 前环境复验项。最终 tree 锁定为
`7ce3a3665ab6845ad2852389736fcbbb19d29493`。

2026-08-20 为 DSH-017 将官方基线升级到 `dsh-v0.1.0-rc.8` 提交 `141eb6f`。
RC8 将 normal provider retry 默认预算从两次提高到五次，并新增图片渲染与 Home
路径缩写等接口；补丁迁移保留这些上游变化，同时继续把 malformed tool call 限制为
一次纠错恢复。原 BUG-B0EE8D2D 双提交补丁拆成两个独立补丁文件，整条补丁链共
12 个可校验文件，最终 tree 为 `9fd6590c3056bc9b07ce575bf23f82b20419a9a5`。

全新目录从官方 RC8 基线回放补丁后精确命中该 tree，935 个锁定依赖完成 frozen
install，Host/Client/Web 完整构建通过。Agent loop、重试、pi-ai、Compact、Think
计时和工具活动 15 个测试文件共 409 条用例通过；lint、990 组中英配对、584 份
Agent Note 格式及工具目录门禁通过。三组 Playwright Web 回放未完成：RC8 对应的
Chromium 尚未下载，Skill fixture 另受 Windows 路径反斜杠未转义影响；本机 3080
切换后使用应用内真实浏览器补充运行时冒烟。

2026-08-20 为 DSH-018 增加第十二个编号补丁（整条链第十三个文件）。当一轮以
`max-tokens` 结束时，Host 先记录续跑意图，待同一 Agent 回到 idle 且没有已排队的人类
下一轮后，持久追加精确的 `system-reminder` 并唤醒下一轮；连续触顶默认不设轮数上限。
错误、正常结束、插件卸载或竞争输入会停止自动续跑，系统不解析也不执行截断文本中的
工具调用。界面截断提示同步删除“发送继续”的手工操作文案。

新包 4 条 Agent loop 测试、UI 52 条测试和发布组合 1 条测试通过；TypeScript、全仓
lint、workspace constraints、227 份包不变式及 Host/Client/Web 完整构建通过。文档同步
27/28 通过，唯一失败仍是当前 Windows 会话无符号链接创建权限，临时目录 symlink
安全测试在 `symlinkSync` 处报 EPERM。最终 tree 锁定为
`ae9a489ce67185e057510f54709a127d60a89f83`；验证过程使用隔离源码和端口，不修改 3080。

2026-08-21 为 DSH-019 将官方基线升级到 `dsh-v0.1.1-rc.2` 提交 `b150a55`。
现有 13 个本地补丁完整重放到新基线，并新增第十四个兼容补丁：同步 Qwen 原生 preset
与新版标准 preset 的非 persona 内容、修正中文文档配对链接并刷新 advanced toolchain
快照。迁移后的 26 个相关测试文件共 756 条用例、TypeScript 类型检查、全仓 lint、
1009 组中英配对以及 Host/Client/Web 完整构建均通过。最终 tree 锁定为
`166fe87aab17ec96848909d136d03dc57744966d`。

2026-08-22 新增第十五、十六个补丁。BUG-C393119A 把
`dsh-max-token-continuation` 包版本对齐到 `0.1.1-rc.2`，并把仅限包内使用的
malformed-tool-call reminder 常量取消导出，使 workspace constraints 与 knip 恢复
通过。DSH-005 新增默认关闭的 `@deepseek-ai/dsh-vision-bridge`：纯文本主模型只接收
持久 reminder 与结构化 `vision_inspect` 结果，图片通过当前会话授权后交给视觉子模型。
部署覆盖固定走 `https://ai.chuansgu.top/v1`、凭据引用 `DPGATEWAY_API_KEY` 和模型
`Qwen3.6-35B-A3B`，不允许直连模型机。

视觉桥、Host 图片准入与 ACP 的 3 个测试文件共 24 条用例通过。随后从空目录拉取官方
基线、顺序回放全部 16 个补丁、frozen install 936 个依赖并完成 Host/Client/Web 全构建，
精确命中锁定 tree。静态门禁 35/37 通过；剩余两项均为文档站环境问题：Windows 无符号链接权限导致安全
fixture 在 `symlinkSync` 报 EPERM，VitePress MPA 的原始 Markdown twin 与已生成
`index.md` 发生基线碰撞。DP Gateway 当前 `/v1/models` 尚未暴露目标模型，因此真实
视觉集成与 SIT 保持阻塞，不启用 profile，也不改动 3080。最终 tree 锁定为
`479d568bd1c79c32e67dff5707cc536f13a271c3`。

同日新增第十八个补丁，为 `vision_inspect` 提供与插件同启同停的浏览器 half：专属
取景框眼睛图标和 `Vision` 标题替换通用 Tool call，运行后缀、计时器及扫光动效与
Think 行保持一致，并保留完整 IN/OUT disclosure 和 Inspect 入口。Host/Client 类型检查、
全仓 lint、Host/Client/Web 完整构建、37 条视觉桥聚焦用例和 100% 语句/分支/函数/行
覆盖均通过。最终 tree 更新为
`2f2d1e7033499d5e2d7b7e2d66450b69df117741`。
