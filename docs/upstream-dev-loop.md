# 上游源码本地开发链路（已验证）

> 日期：2026-08-17。需求 DSH-003 跟进项。
> 本文记录上游 `deepseek-harness` 源码树在本机的已验证开发链路。
> 当前锁定版本和新电脑安装方法以 `reproducible-build.md` 为准。

## 1. 关键结论（为什么插件"天然"接入）

- `dsh web` 是 `--profile web` 的别名，profile 从 `$DSH_HOME/profiles/web` 加载；
  `DSH_HOME` 未设置时默认 `~/.dsh`（`packages/util/home-paths` 的解析顺序：
  显式配置 > `$DSH_HOME` > `~/.dsh`）。
- 因此**源码树构建出的 `dsh web` 与 npm 运行时加载的是同一个 profile**，
  profile 里 `link:` 依赖 + `cordis.patch.yml` 用户层不变，
  junction 指向本仓库的插件（skill-manager 等）在两条链路里是**同一份文件**。
- 插件不需要动上游源码、不需要加进上游 workspace 即可在两条链路同时生效。
  若要随上游版本化，再把插件包放入上游 `packages/<domain>/<name>`
  （`dsh.client` 声明 + `scripts/dev-web.ts` 会自动发现并 watch 构建）。

## 2. 已验证步骤（2026-08-17 实测）

```powershell
cd D:\Pythonproject\dsharness

# 从 dsharness 锁文件恢复上游源码、补丁和工具链
.\dev\install-dsh-source.ps1 -SourceDirectory D:\Pythonproject\deepseek-harness

cd D:\Pythonproject\deepseek-harness

# 安装脚本已完成 frozen install 与完整构建；需要隔离冒烟时使用次端口
node apps/cli/lib/bin.js web --host 127.0.0.1 --port 3081
```

### 冒烟结果（3081 源码树实例）

| 检查 | 结果 |
| --- | --- |
| `GET /`（Web 壳） | HTTP 200，12231 字节 HTML |
| `POST /api/skill-manager {op:list}` | apiVersion=5、policy `{globalDefaultOff:false}`、skill 行正常 → **junction 插件在源码树加载** |
| `GET /plugins/dsh-skill-manager/client.js` 与仓库文件逐字节比对 | 一致（`served == repo: True`）→ client 半也是经 junction 从 `D:\Pythonproject\dsharness` 提供 |
| 3080 npm 运行时对照 | apiVersion=5，不受影响 |

## 3. 日常开发分工

| 改什么 | 在哪改 | 生效方式 |
| --- | --- | --- |
| 插件（skill-manager 等） | 本仓库 `plugins/<name>/`（junction 透传到 profile） | client 半刷新页面；host 半重启对应实例 |
| 上游包（`packages/<domain>/<name>`） | `D:\Pythonproject\deepseek-harness` | node 侧重跑 `pnpm build:lib`；client 侧 `pnpm dev:web`（watch 构建 + `dsh web` stat-poll 广播 rebuilt） |
| 前端壳（apps/web） | 上游 `apps/web` | `pnpm --filter @deepseek-ai/dsh-web-frontend run build` |

- `pnpm dev:web` 只 watch 上游 `packages/*/*` 中声明 `dsh.client`（platform web）
  的包；外部 junction 插件是纯 JS 直接伺服，不需要它。
- 两个实例（3080 npm / 3081 源码树）共用 `~/.dsh`：会话按 workspace/ID 隔离，
  不要在两边同时操作同一个会话。
- 停 3081 实例：`Get-NetTCPConnection -LocalPort 3081 -State Listen` 找 PID
  后 `Stop-Process`；`restart-dsh-web.ps1` 杀进程时也会把它一并停掉。

## 4. 当前限制

- 构建锁定的是确定源码树，不复制个人 `~/.dsh`；新电脑需要重新配置模型凭据和
  选择需要启用的本地插件。
- Node 版本必须精确为 `24.11.1`。脚本发现版本不符时停止，不自动安装或替换
  系统 Node。
- 升级官方 DSH 或调整补丁后必须更新 `upstream.lock.json`，并从空目录重跑完整
  构建和 Web 冒烟。
