# 本地 DSH 开发链路说明

> 适用：在本机开发 DSH Web GUI 的**插件**（如 skill-manager）。
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

DSH-003 已把上游源码接入方式改为可复现构建：

- `upstream.lock.json` 锁定官方 `dsh-v0.1.1-rc.2` 提交 `b150a55`、DSH `0.1.1-rc.2`、
  Node `24.11.1`、pnpm `11.7.0`、本地补丁哈希和最终源码 tree；
- `upstream-patches/` 保存需要叠加到官方源码的本地改动，当前包含 DSH-009
  流式活动保活、DSH-012 Qwen 原生 preset、BUG-B0EE8D2D 无效 Think 工具调用的
  持久历史恢复与重试流 JSDoc、DSH-011 Compact 32K 摘要预算，以及 DSH-014
  工具调用即时进度反馈、BUG-449804CF 工具耗时与行内状态布局修复，以及
  BUG-5F3BF25D 快速工具运行态可感知性修复、亚秒耗时毫秒精度展示、DSH-015
  Code 子工具计划提前展示、DSH-016 Think 独立计时和工具活动状态布局，以及
  DSH-018 输出 token 上限自动持续续跑、DSH-019 的 0.1.1 兼容调整、
  BUG-C393119A 静态门禁修复，以及默认关闭的 DSH-005 视觉桥、发布门禁和
  `vision_inspect` 专属工具图标与 Think 同款计时；
- `dev/install-dsh-source.ps1` 在空目录拉取源码、应用补丁、执行 frozen install、
  完整构建并注册 `dsh`；
- `dev/verify-dsh-source.ps1` 独立校验工具链、源码 tree、补丁、CLI 版本和 Web
  冒烟。

新电脑不再依赖 tarball 快照，也不用复制现有 `~/.dsh`。安装与升级锁定版本的
完整方法见 [`reproducible-build.md`](reproducible-build.md)。本仓库插件继续通过
junction 接入运行时；是否安装和启用某个插件属于每台电脑的新运行配置。

## 6. 原生图片策略

DSH-022 已取消 DSH-004 的 9 图临时裁剪，`plugins/image-context-guard` 不再安装或加载。
图片由 0.1.1 原生附件服务准入和持久化：单条消息默认最多 20 张、单图 20 MiB、合计
200 MiB。纯文本主模型启用视觉桥时，`vision_inspect` 同样默认最多读取当前会话内
20 张唯一图片；未知或跨会话引用仍在读取字节前整批拒绝。完整迁移和回退边界见
[`DSH-022-native-image-policy.md`](DSH-022-native-image-policy.md)。

## 7. 相关路径速查

| 用途 | 路径 |
| --- | --- |
| 本仓库 | `D:\Pythonproject\dsharness` |
| 运行时插件目录（junction） | `C:\Users\<user>\.dsh\plugins\<name>` |
| web profile 依赖声明 | `C:\Users\<user>\.dsh\profiles\web\package.json` |
| web profile 用户层补丁 | `C:\Users\<user>\.dsh\profiles\web\cordis.patch.yml` |
| 插件加载符号链接 | `C:\Users\<user>\.dsh\profiles\web\node_modules\dsh-<name>` |
| 宿主进程 | `dsh web --host 127.0.0.1 --port 3080`（命令链接到锁定源码构建） |
| 策略状态（skill-manager） | `C:\Users\<user>\.dsh\skill-manager.json` |
