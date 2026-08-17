# 本地 DSH 开发链路说明

> 适用：在本机开发 DSH Web GUI 的**插件**（如 skill-manager、image-context-guard）。
> 目标：让"仓库内开发"与"运行时加载"是同一份文件，保留 Git 历史，不破坏正在运行的 Web GUI。

## 1. 运行时的加载链

```
dsh web 宿主进程（node .../@deepseek-ai/dsh/lib/bin.js web）
  └─ 加载 profile：~/.dsh/profiles/web
       ├─ package.json 的 dsh.profile.bundles（@deepseek-ai/* 官方 bundle）
       ├─ package.json 的 dependencies（"dsh-<name>": "link:<插件目录>"）
       └─ cordis.patch.yml（用户层 insert，把插件挂进组合树）
            └─ ~/.dsh/profiles/web/node_modules/dsh-<name>（pnpm 符号链接）
                 └─ <插件目录>/lib/{index.js, client.js}
```

关键点：`link:` 指向的是**目录**，pnpm 在其下建符号链接。只要这个目录
（或其指向）不变，加载链就稳定。**junction 正是利用这一点**——把目录换成指向
仓库的联接，链接路径不变、加载链不变，文件内容则来自仓库。

## 2. 热更新边界（实测，来自插件 README）

- **client 半**（`lib/client.js`）：进程按请求从磁盘读取，**改后刷新页面即生效**。
- **host 半**（`lib/index.js`）：无模块级 HMR，**改后需重启 `dsh web`**。
- **依赖/link 路径变化**（如把 `link:` 改成新目录）：需重启。
- **junction 切换**（本方案）：对"正在运行"的实例**无感**（host 已在内存、client 内容一致）；
  下次冷启动自然从仓库加载。因此本方案**不需要重启**，不打断当前会话。

## 3. 接入一个插件到本仓库（标准步骤）

```powershell
# 在 dsharness 仓库根目录
cd D:\Pythonproject\dsharness

# a) 放入源码（保持 package.json + lib/ 结构）
#    首次：从 ~/.dsh/plugins/<name> 复制进来
robocopy "$env:USERPROFILE\.dsh\plugins\<name>" ".\plugins\<name>" /E

# b) 校验 + 建 junction（自动备份原件、逐文件哈希比对、失败中止）
.\dev\setup-plugin-junction.ps1 -PluginName <name> -DryRun   # 先演练
.\dev\setup-plugin-junction.ps1 -PluginName <name>

# c) 提交
git add plugins/<name>
git commit -m "feat(<DP编号>): 接入 <name> 插件"
git push
```

回退（万一把仓库版本当新代码、需要恢复原件）：

```powershell
.\dev\setup-plugin-junction.ps1 -PluginName <name> -Restore "$env:USERPROFILE\.dsh\plugins\<name>.bak-<时间戳>"
```

## 4. 日常开发

- 在 `plugins/<name>/` 下改代码 = 改运行时加载的文件（junction 透传）。
- 改 **client**：保存后浏览器刷新页面即可看到。
- 改 **host**：保存后运行 `.\restart-dsh-web.ps1` 重启（会短暂打断当前 Web GUI，
  会话持久化在磁盘，浏览器重连后恢复）。
- `list` 响应的 `apiVersion` 是插件 host 的能力版本，client 用它判断运行中的 host
  是否已加载较新操作；升级 host 功能后应递增并在 client 侧处理兼容。

## 5. 上游源码（@deepseek-ai/dsh 完整仓库）

已落到本地（DSH-003 跟进项，2026-08-17）：

- `D:\Pythonproject\deepseek-harness`：上游 master 的 **tarball 快照**
  （codeload，13.11MB），已 `git init` 并建基线提交（无上游 remote），
  本地对它的改动从此可 diff/回滚。
  - 快照版本 **0.1.0-rc.5**，本机 npm 运行时为 **0.1.0-rc.6**——差一个发布。
    要改上游源码前，先确认要对齐哪一边（把快照升级到 rc.6+，或把 npm 运行时
    降到与快照一致）。
  - 本机文件过滤导致少数 `CLAUDE.md` 与 `examples/` 下 2 个 `AGENTS.md`
    未解压成功（不影响代码开发；真克隆后自然补全）。
  - 仓库形态：pnpm monorepo——`packages/<domain>/<pkg>`（两级目录，如
    `packages/skill/skill-filesystem`）+ `apps/cli`（`dsh` bin）+ `apps/web`
    （前端）。开发脚本：根目录 `pnpm dev:web`（`tsx scripts/dev-web.ts --poll`）。
  - 完整 git 历史（约 114MB）待网络稳定后拉取：
    ```powershell
    git clone --depth 1 https://github.com/deepseek-ai/deepseek-harness.git D:\Pythonproject\deepseek-harness-clone
    ```
    快照目录已是 git 仓库，可与克隆结果 diff 校验完整性，然后替换快照目录、
    配置上游 remote。
- 本仓库 `plugins/<name>` 如何并入上游构建/加载链路：插件零裸依赖、自包含，
  短期走 junction（§3）独立开发即可；若要随上游版本化，把插件包作为
  workspace 成员放入上游 `packages/` 并走其 `dsh.client` 声明机制（见上游
  `.agents/notes/implemented/architecture/2026-07-23-client-plugin-loading-model.md`）。
- **上游源码树已在本机跑通（2026-08-17 实测：install/build/3081 冒烟全过，
  junction 插件在源码树加载）**：完整已验证链路见 `docs/upstream-dev-loop.md`。

## 6. 图片上下文短期保护

`plugins/image-context-guard` 对应 DP `DSH-004` / `BUG-3E5CFD04`。它通过 `llm/stream` host 插件在模型适配器调用前生成安全副本，按“最新消息优先、消息内保持原顺序”保留最多 9 张图片。持久化会话、附件引用和前端历史不被改写。

该插件是本地短期保护，不替代 DP `DSH-005` 中的长期方案（附件存储、视觉摘要、工具截图消费后退出上下文、按附件 ID 重注入）。接入步骤和 profile 配置见 `plugins/image-context-guard/README.md`。

## 7. 相关路径速查

| 用途 | 路径 |
| --- | --- |
| 本仓库 | `D:\Pythonproject\dsharness` |
| 运行时插件目录（junction） | `C:\Users\<user>\.dsh\plugins\<name>` |
| web profile 依赖声明 | `C:\Users\<user>\.dsh\profiles\web\package.json` |
| web profile 用户层补丁 | `C:\Users\<user>\.dsh\profiles\web\cordis.patch.yml` |
| 插件加载符号链接 | `C:\Users\<user>\.dsh\profiles\web\node_modules\dsh-<name>` |
| 宿主进程 | `node .../npm/node_modules/@deepseek-ai/dsh/lib/bin.js web --host 127.0.0.1 --port 3080` |
| 策略状态（skill-manager） | `C:\Users\<user>\.dsh\skill-manager.json` |
