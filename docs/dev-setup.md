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
  会话持久化在磁盘，浏览器重连后恢复）。脚本启动前会校验 `upstream.lock.json` 的源码
  tree、Node/pnpm 版本，执行 `pnpm install --frozen-lockfile` 和完整 `pnpm run build`，
  再校验 alpha1 的 Gateway/Session Controller/ACP/attachment-local 原生图片链路、
  vision-bridge `imageInputBridge` provider 和 web profile 默认启用 vision-bridge，
  最后才使用同级 `deepseek-harness\apps\cli\lib\bin.js` 启动。标准输出、错误输出、
  构建元数据和最新 PID 元数据写入 `~/.dsh/logs`。如源码目录不在默认位置，传入
  `-DshSourceDirectory <路径>`；排障时直接查看日志文件，不需要保留承载服务的终端窗口。
- `list` 响应的 `apiVersion` 是插件 host 的能力版本，client 用它判断运行中的 host
  是否已加载较新操作；升级 host 功能后应递增并在 client 侧处理兼容。

## 5. 上游源码（@deepseek-ai/dsh 完整仓库）

DSH-003 已把上游源码接入方式改为可复现构建：

- `upstream.lock.json` 锁定官方 `dsh-v0.1.2-alpha.1` 提交 `cd5ef81`、DSH `0.1.2-alpha.1`、
  Node `24.11.1`、pnpm `11.7.0`、本地补丁哈希和最终源码 tree；
- `upstream-patches/` 保存需要叠加到官方源码的本地改动，当前 active chain 为
  `0027-feat-DSH-034-port-vision-bridge-to-alpha1.patch`，负责把视觉桥及其
  progress/Look 展示迁移到 alpha1 的新 Remote/Attachment API；旧 RC2 补丁文件
  保留为历史审计材料，不再参与 alpha1 构建；
- `dev/install-dsh-source.ps1` 在空目录拉取源码、应用补丁、执行 frozen install、
  完整构建并注册 `dsh`；
- `dev/verify-dsh-source.ps1` 独立校验工具链、源码 tree、补丁、alpha1 原生图片链路、
  CLI/profile 版本和 Web 冒烟；Web 门禁要求匿名 401、标准重启记录的认证 200、插件 API
  版本、监听 PID 和构建目录全部一致。

新电脑不再依赖 tarball 快照，也不用复制现有 `~/.dsh`。安装与升级锁定版本的
完整方法见 [`reproducible-build.md`](reproducible-build.md)。本仓库插件继续通过
junction 接入运行时；是否安装和启用某个插件属于每台电脑的新运行配置。

## 6. 原生图片策略

DSH-022 已取消 DSH-004 的 9 图临时裁剪，`image-context-guard` 已从仓库和本机 profile
清理，不再安装或加载。
图片由 0.1.2-alpha.1 原生附件服务准入和持久化：单条消息默认最多 20 张、单图 20 MiB、合计
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
