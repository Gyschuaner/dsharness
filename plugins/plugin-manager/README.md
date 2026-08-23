# dsh-plugin-manager

DeepSeek Harness 的独立 Plugin 管理分区（DSH-027）。它向
`dsh-extension-manager` 声明的 `extension.manager.section` Slot 注册 `id: plugin`，
并通过 `/api/plugin-manager` 提供本地插件清单、受保护的启停、插件导入，以及按需加载
GitHub 详情的受控插件市场。

## 边界

- `dsh-extension-manager` 只拥有主页“扩展”入口、全页壳和分区导航。
- `dsh-plugin-manager` 独立拥有 Plugin 页面与 Host API。
- `dsh-skill-manager` 不提供 Plugin 入口、占位或业务。
- 页面管理的是 `web` profile 的直接 DSH 插件依赖，不把 Cordis 内部基础行伪装成用户插件。

## 本地插件

本地列表以 `~/.dsh/profiles/web/package.json` 的直接依赖为安装事实，并读取依赖的
`package.json`、`dsh.client` / `dsh.bundle` 声明以及组合行 id。`cordis.patch.yml` 是挂载
事实。启停不会重写用户原有 YAML，而只维护文件末尾两个有明确边界的受管块：

- `plugin-manager:overrides`：按组合行 id 写 `disabled` 覆盖；
- `plugin-manager:mounts`：为没有 `dsh.bundle.patch` 的已导入插件补充显式挂载行。

写入使用同目录临时文件再原子替换，并在 Host 生命周期内串行执行。用于维持页面的
`dsh-extension-manager` 和 `dsh-plugin-manager` 是受保护依赖，不能从当前页面停用。
所有组合变更都明确提示“重启 Web 后生效”。

## 导入与市场

导入只接受 npm 包、GitHub 仓库或本地绝对目录。Host 使用参数数组调用官方命令：

```powershell
dsh plugin --profile web add <source> --ignore-scripts --reporter=append-only
```

不经过 shell 拼接。安装后必须在依赖清单中检测到唯一变化，并校验该包包含 DSH 声明；
校验不通过时通过官方 remove 命令回滚。

市场主页来自仓库内的受控发现清单，只展示仓库名、首句描述与本地状态，不批量请求
GitHub。用户打开详情时，Host 才读取 GitHub Repository、latest release 与根目录
`package.json`，结果在内存缓存 5 分钟；超时、限流或离线时优先返回旧缓存，本地管理
不受影响。

## 安装到开发 profile

```powershell
.\dev\setup-plugin-junction.ps1 -PluginName plugin-manager
dsh plugin --profile web add link:C:/Users/<user>/.dsh/plugins/plugin-manager --ignore-scripts
```

随后在 `~/.dsh/profiles/web/cordis.patch.yml` 中加入：

```yaml
- insert:
  - id: plugin-manager
    name: 'dsh-plugin-manager'
```

首次接入需要重启 `dsh web`。后续仅修改 Client 时硬刷新即可；Host 或组合修改仍需重启。

## 测试

```powershell
node --test plugins/plugin-manager/test/*.test.js
node --test plugins/skill-manager/test/*.test.js
```

前一组覆盖 Host profile 事务、导入回滚、GitHub 缓存/降级和真实 Client bundle DOM；
后一组验证 Extension 壳移除 Plugin 占位后不会破坏 Skill 分区。
