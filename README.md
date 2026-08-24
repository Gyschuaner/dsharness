# dsharness

DeepSeek Harness（DSH）本地统一开发仓库。

把原本散落在 `~/.dsh/plugins/` 下、未纳入版本控制的 DSH 插件源码集中到 Git，
和开发工具、部署/重启脚本放在一处开发，保留完整提交历史。

## 目录结构

```
dsharness/
├── AGENTS.md                 # 项目协作规则（DP / 飞书 / Git 工作流约定）
├── restart-dsh-web.bat       # Windows 一键重启 dsh web（调用同目录 ps1）
├── restart-dsh-web.ps1       # 从本地源码隐藏启动 127.0.0.1:3080，记录日志并验证运行时
├── upstream.lock.json        # 官方源码、工具链、补丁与最终 tree 锁定
├── upstream-patches/         # 需要应用到官方源码的本地补丁
├── plugins/
│   ├── extension-manager/    # 通用“扩展”全页壳与业务分区 Slot
│   ├── skill-manager/        # SKILL 管理业务分区与 Host API
│   ├── mcp-manager/          # MCP 服务器管理与精选 GitHub 市场（DSH-026/028）
│   │   ├── src/              # TypeScript Host、状态与 Client 源码（唯一源码真相）
│   │   ├── lib/              # tsc 生成的运行时 JS、声明与 source map
│   │   └── test/             # TypeScript 状态机、安全边界与真实 bundle DOM 测试
│   ├── plugin-manager/       # 本地插件管理 + GitHub 插件市场（DSH-027）
│   │   ├── src/              # TypeScript Host、导入事务与 Client 源码
│   │   ├── lib/              # tsc 生成的运行时产物
│   │   └── test/             # TypeScript Host 事务与 Client DOM 回归
│   └── better-sidebar-smooth/ # better-sidebar 会话头动画修复（仅 client）
├── dev/
│   ├── install-dsh-source.ps1     # 拉取、打补丁、构建并注册 dsh
│   ├── verify-dsh-source.ps1      # 校验工具链、源码 tree、补丁和 Web
│   └── setup-plugin-junction.ps1  # 把 ~/.dsh/plugins/<name> 指向本仓库的 junction
└── docs/
    ├── dev-setup.md          # 本地 DSH 开发链路说明
    ├── DSH-005-vision-bridge.md # 视觉桥与 DP Gateway 部署覆盖
    ├── reproducible-build.md # 新电脑可复现构建与更新方法
    └── installed-plugins.md  # web profile 已安装插件台账（版本/通道/回退，DSH-007）
```

## 这个仓库解决什么问题

DSH 的官方源码和本地插件原来分散在不同目录，本机能运行，但另一台电脑无法只靠
Git 还原相同构建。`dsharness` 现在同时管理两类内容：仓库内直接维护插件源码；
通过锁文件和补丁编排官方 `deepseek-harness` 源码。个人凭据、会话、附件和设置仍
保留在各自电脑的 `~/.dsh`，不进入 Git。

本仓库把这类"本地实际在改的代码"收进来：

- 插件源码纳入 Git，有提交历史、可回滚、可多人协作；
- 通过 **junction**（目录联接）把 `~/.dsh/plugins/<name>` 指到本仓库对应目录，
  使"仓库内开发"与"运行时加载"是同一份文件，无需改 profile 的 `link:` 路径，
  也无需重启即可让当前运行实例继续工作；
- 开发工具（重启脚本）随仓库版本化。
- 官方源码基线、Node/pnpm 版本、本地补丁和最终源码 tree 有明确校验值；
- 新电脑可从空目录完成 frozen install、完整构建和 `dsh` 命令注册。

`image-context-guard` 已由 DSH-022 退役，并已从仓库与本机 web profile 清理。0.1.1
原生附件服务负责图片准入、持久存储和模型投影：默认单条消息最多 20 张、单图最多
20 MiB、单条消息合计最多 200 MiB。

DSH-005 的视觉桥作为上游源码补丁交付，当前 Windows web profile 默认通过 DP Gateway
启用；其余仓库插件也默认挂载。纯文本主模型的视觉调用按
[`docs/DSH-005-vision-bridge.md`](docs/DSH-005-vision-bridge.md) 走 DP Gateway，
DSH 不直连视觉模型机。

## 快速开始（构建 DSH）

新电脑安装 Git 与 Node `24.11.1` 后执行：

```powershell
git clone https://github.com/Gyschuaner/dsharness.git
cd dsharness
.\dev\install-dsh-source.ps1 -StartWeb
```

脚本不会复制原电脑的 `~/.dsh`。安装与校验细节见
[`docs/reproducible-build.md`](docs/reproducible-build.md)。

## 接入一个新插件到本仓库

1. 把插件源码放到 `plugins/<name>/src/*.ts`，并保持 `package.json`、插件级
   `tsconfig.json` 与根 TypeScript project references；`lib/` 是构建产物，不直接编辑。
2. 运行 junction 脚本，把运行时的 `~/.dsh/plugins/<name>` 指向仓库：
   ```powershell
   .\dev\setup-plugin-junction.ps1 -PluginName skill-manager
   ```
   （脚本会先把原件备份为 `<name>.bak-<时间戳>` 再建 junction，可随时回退。）
3. 提交：
   ```powershell
   git add plugins/<name>
   git commit -m "feat(<DP编号>): 接入 <name> 插件"
   git push
   ```

## 本地插件构建与验证

仓库内所有自维护插件源码和测试统一使用 TypeScript；DSH 运行时继续从各插件的
`lib/*.js` 加载，因此生成物随源码一并提交。Node 与 pnpm 就绪后执行：

```powershell
pnpm install --frozen-lockfile
pnpm run verify
```

`verify` 会依次执行严格生产源码类型检查、测试源码检查、运行时构建、全量回归，
并确认不存在手写 `.js`，且每个 `src/*.ts` 都有对应的 `lib/*.js`。新增插件时也要把
它加入根 `tsconfig.json` 的 project references。

## 上游源码（deepseek-harness）

当前锁定官方标签 `dsh-v0.1.1-rc.2` 提交 `b150a55`，随后依次应用 DSH-009 的
流式活动保活补丁、DSH-012 的 Qwen 原生 Agent preset 补丁，以及
BUG-B0EE8D2D 的 Think 伪工具调用恢复与 JSDoc 补丁、DSH-011 的 Compact 32K
摘要预算补丁、DSH-014 的工具调用即时进度反馈补丁，以及 BUG-449804CF 的工具耗时
与行内状态布局修复、BUG-5F3BF25D 的快速工具运行态可感知性修复、亚秒耗时的毫秒
精度展示修复、DSH-015 的 Code 子工具计划提前展示，以及 DSH-016 的 Think 独立计时
和工具活动状态布局，再叠加 DSH-018 的输出 token 上限自动持续续跑，以及 DSH-019
针对 0.1.1 新结构的兼容调整、BUG-C393119A 静态门禁修复和 DSH-005 可选视觉桥。
视觉桥的后续补丁补齐发布门禁，并为 `vision_inspect` 增加专属眼睛图标、`Look ing`
标题、Think 同款运行计时，以及可回放但不进入模型消息的流式视觉进度；正式
`tool/call` 与 `tool/result` 在运行态交接和页面刷新后保持同一条持久记录。第 20 个
补丁让 Looking 行只复用 Tool 外层的一层扫光，并像 Think 一样在流式期间持续跟随最新
文字尾部；第 21 个补丁让 summary 结束后继续投影最新 observation，并在 Look 已拥有
内联计时时隐藏外层重复时长；第 22 个补丁退役 9 图裁剪，并把视觉桥默认调用上限与
0.1.1 原生单消息上限统一为 20；第 23 个补丁允许同一个 `vision_inspect` 同时接收
本会话附件 ID 与本地图片路径，路径会先经原生附件服务准入并持久化为本会话附件。
第 24 个补丁为上传图片生成只属于当前会话的稳定、带扩展名只读路径，并把路径写入
同一条持久 `system-reminder`；视觉子模型与 `vision_inspect` 改为直接流式返回
Markdown，不再强制 JSON、region 或 confidence。第 25 个补丁把 DSH-015 的 Code
子工具识别从模型声明的 `plannedTools` 迁移到流式源码，首次识别 `tools.name(...)`
时即显示子工具并沿用同一感知计时起点。最终源码 tree 为
`56611cffc170612bc5defd0c6040f6beca8a14db`。
`dev/install-dsh-source.ps1`
只接受官方基线或最终锁定 tree，不会覆盖其他源码目录或未提交修改。完整机制见
[`docs/reproducible-build.md`](docs/reproducible-build.md)。

DSH-012 随构建交付系统级 `qwen-native`（界面名称“Qwen 原生模式”）。它完整继承
标准模式的工具与工作流，只替换 Qwen3.8 定向 persona；安装脚本不会把它设为默认，
也不会改写 `~/.dsh/settings.yaml`。重新拉取本仓库并执行安装构建后即可在 Agent 预设
列表中选择，无需复制原电脑的个人 preset。

BUG-B0EE8D2D 的恢复逻辑不解析或执行 Think 中的 XML。仅当一次正常结束的响应只含
私有推理且出现 Qwen 风格工具标签时，Agent 才通过现有重试策略恢复一次，并仅在该次
重试临时加入 `system-reminder`；再次只返回推理时会显式报格式错误，避免假完成。

DSH-018 在一轮因 `max-tokens` 结束后等待 Agent 回到 idle，再通过持久消息加入精确的
`system-reminder` 并启动下一轮；连续触顶会默认一直续跑。已排队的人类输入优先，
错误、正常结束和插件卸载不会续跑，也不会解析或执行被截断的工具调用文本。

## 开发约定

- 分支：功能/修复用 `feat/<DP编号>-<短描述>`、`fix/<DP编号>-<短描述>`；主干为 `main`。
- 提交信息带 DP 编号（如 `feat(DSH-003): ...`）。
- 需求/任务/测试/Bug/文档关联统一登记在 DP 平台（DSH 项目）。
