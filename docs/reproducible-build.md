# DSH 可复现构建

## 一、目标与范围

`dsharness` 不复制 DeepSeek Harness 的全部上游源码，而是记录官方基线提交、按顺序应用的本地补丁、工具链版本和最终源码树校验值。新电脑只要能访问 GitHub 与 npm registry，就可以从这些材料构建与当前主干相同的 DSH。

个人运行状态不属于可复现构建范围。安装脚本不会读取或复制 `~/.dsh` 下的凭据、会话、附件和个人设置；这些数据由新电脑首次启动后独立生成。AI Relay Key 也应由管理员按设备或使用人单独分发。

## 二、锁定内容

`upstream.lock.json` 是构建事实来源，当前锁定内容包括：

- DeepSeek Harness 官方基线 `99f6f02`，版本 `0.1.0-rc.7`；
- Node `24.11.1` 与 pnpm `11.7.0`；
- `upstream-patches/` 中按顺序应用的 DSH-009 流式活动保活补丁、DSH-012
  Qwen 原生 Agent preset 补丁、BUG-B0EE8D2D Think 伪工具调用持久历史恢复与
  重试流 JSDoc 补丁、DSH-011 Compact 32K 摘要预算补丁、DSH-014 工具调用即时
  进度反馈补丁、BUG-449804CF 工具耗时与行内状态布局修复、BUG-5F3BF25D 快速工具
  运行态可感知性修复、亚秒耗时毫秒精度展示、DSH-015 Code 子工具计划提前展示及
  各自的 SHA-256；
- 应用补丁后的 Git tree `5318e889f9b40cef8d3c1d3c8ae4b44a1a43a525`。

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
