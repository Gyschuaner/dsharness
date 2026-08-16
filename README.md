# dsharness

DeepSeek Harness（DSH）本地统一开发仓库。

把原本散落在 `~/.dsh/plugins/` 下、未纳入版本控制的 DSH 插件源码集中到 Git，
和开发工具、部署/重启脚本放在一处开发，保留完整提交历史。

## 目录结构

```
dsharness/
├── AGENTS.md                 # 项目协作规则（DP / 飞书 / Git 工作流约定）
├── restart-dsh-web.bat       # Windows 一键重启 dsh web（调用同目录 ps1）
├── restart-dsh-web.ps1       # 重启 127.0.0.1:3080 的 dsh web 并验证 skill-manager
├── plugins/
│   └── skill-manager/        # skill 文件管理插件（DSH Web GUI 设置页）
│       ├── package.json      #  包名 dsh-skill-manager，零裸依赖
│       ├── lib/
│       │   ├── index.js      #  host 半：注册 /api/skill-manager JSON 路由
│       │   └── client.js     #  client 半：settings.section 页面
│       └── README.md         #  插件功能 / 安装 / 技术说明
├── dev/
│   └── setup-plugin-junction.ps1  # 把 ~/.dsh/plugins/<name> 指向本仓库的 junction
└── docs/
    └── dev-setup.md          # 本地 DSH 开发链路说明
```

## 这个仓库解决什么问题

DSH Web GUI 的宿主进程运行的是 **npm 安装的预构建包**
`@deepseek-ai/dsh`（`lib/` 为 bundle 产物、无 `.git`），上游源码仓库
`github.com/deepseek-ai/deepseek-harness` 在本机没有克隆。而真正在本地
持续开发、且未版本控制的代码是 **插件**（如 skill-manager），它原先直接放在
`~/.dsh/plugins/skill-manager`，靠 `link:` 依赖挂进 web profile。

本仓库把这类"本地实际在改的代码"收进来：

- 插件源码纳入 Git，有提交历史、可回滚、可多人协作；
- 通过 **junction**（目录联接）把 `~/.dsh/plugins/<name>` 指到本仓库对应目录，
  使"仓库内开发"与"运行时加载"是同一份文件，无需改 profile 的 `link:` 路径，
  也无需重启即可让当前运行实例继续工作；
- 开发工具（重启脚本）随仓库版本化。

## 快速开始（接入一个新插件到本仓库）

1. 把插件源码复制到 `plugins/<name>/`（保持 `package.json` + `lib/` 结构）。
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

## 上游源码（deepseek-harness）

已落到本地（DSH-003 跟进项，2026-08-17）：`D:\Pythonproject\deepseek-harness`
是上游 master 的 **tarball 快照**（pnpm monorepo，版本 0.1.0-rc.5；本机 npm
运行时为 rc.6，差一个发布）。快照已建 git 基线（无上游 remote），本地改动可
追溯；少数 `CLAUDE.md` 因本机文件过滤未解压。完整 git 历史（约 114MB）待网络
稳定后克隆替换。插件零裸依赖、自包含，可独立开发；源码树已在本机跑通
（install/build/次端口冒烟全过，插件双链路生效），详见 `docs/upstream-dev-loop.md`
与 `docs/dev-setup.md` §5。

## 开发约定

- 分支：功能/修复用 `feat/<DP编号>-<短描述>`、`fix/<DP编号>-<短描述>`；主干为 `main`。
- 提交信息带 DP 编号（如 `feat(DSH-003): ...`）。
- 需求/任务/测试/Bug/文档关联统一登记在 DP 平台（DSH 项目）。
