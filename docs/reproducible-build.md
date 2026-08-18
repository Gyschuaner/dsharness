# DSH 可复现构建

## 一、目标与范围

`dsharness` 不复制 DeepSeek Harness 的全部上游源码，而是记录官方基线提交、按顺序应用的本地补丁、工具链版本和最终源码树校验值。新电脑只要能访问 GitHub 与 npm registry，就可以从这些材料构建与当前主干相同的 DSH。

个人运行状态不属于可复现构建范围。安装脚本不会读取或复制 `~/.dsh` 下的凭据、会话、附件和个人设置；这些数据由新电脑首次启动后独立生成。AI Relay Key 也应由管理员按设备或使用人单独分发。

## 二、锁定内容

`upstream.lock.json` 是构建事实来源，当前锁定内容包括：

- DeepSeek Harness 官方基线 `99f6f02`，版本 `0.1.0-rc.7`；
- Node `24.11.1` 与 pnpm `11.7.0`；
- `upstream-patches/` 中按顺序应用的 DSH-009 流式活动保活补丁、DSH-012
  Qwen 原生 Agent preset 补丁与 BUG-B0EE8D2D Think 伪工具调用恢复补丁，以及
  各自的 SHA-256；
- 应用补丁后的 Git tree `4eecae3b5622163d57685b4a4b45958a99e1bf65`。

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

2026-08-18 为 BUG-B0EE8D2D 增加第三个上游补丁。补丁只识别“正常 stop、仅含私有
reasoning、且包含 Qwen 风格工具标签”的窄场景，不解释标签内容；标准重试策略只恢复
一次，并在重试请求临时追加结构化工具调用提醒。相关 Agent loop、重试策略与 UI
折叠回归共 992 条测试通过，TypeScript 类型检查、lint、完整 Host/Client/Web 构建及
3092 端口浏览器冒烟通过；最终锁定 tree 为
`4eecae3b5622163d57685b4a4b45958a99e1bf65`。
