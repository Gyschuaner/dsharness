# dsh-plugin-manager

DeepSeek Harness 的独立 Plugin 管理分区（DSH-027 / DSH-030）。它向
`dsh-extension-manager` 声明的 `extension.manager.section` Slot 注册 `id: plugin`，
并通过 `/api/plugin-manager` 提供本地插件清单、受保护的启停、插件导入，以及按需加载
GitHub 详情的受控插件市场。

## Plugin Loading

初次读取本地插件与市场索引时，Client 使用与 Skill Finding 同一套版式和动效节奏，
但把视觉语义改为四个 Cordis Plugin 模块向中心接口归位，并以 `Plugin Loading`
标记当前阶段。正常快速请求至少保留约 680ms，避免加载态一闪而过；
`prefers-reduced-motion: reduce` 下停止全部位移与循环动画，只保留静态官方插件图标和文案。
接口失败后动画退出并显示可重试错误，不会让页面停留在空白或无限加载状态。

## 边界

- `dsh-extension-manager` 只拥有主页“扩展”入口、全页壳和分区导航。
- `dsh-plugin-manager` 独立拥有 Plugin 页面与 Host API。
- `dsh-skill-manager` 不提供 Plugin 入口、占位或业务。
- 页面管理 `web` profile 的直接 DSH 插件依赖，并只读展示需要由用户确认状态的系统
  Bundle 插件。当前 `@deepseek-ai/dsh-vision-bridge` 即使由 base bundle 提供、不能从页面
  安全启停，也会显示真实 Loader 状态；其他 Cordis 内部基础行不会伪装成用户插件。

## 本地插件

本地列表以 `~/.dsh/profiles/web/package.json` 的直接依赖为安装事实，并读取依赖的
`package.json`、`dsh.client` / `dsh.bundle` 声明以及组合行 id。`cordis.patch.yml` 是挂载
事实。启停不会重写用户原有 YAML，而只维护文件末尾两个有明确边界的受管块：

- `plugin-manager:overrides`：按组合行 id 写 `disabled` 覆盖；
- `plugin-manager:mounts`：为没有 `dsh.bundle.patch` 的已导入插件补充显式挂载行。

写入使用同目录临时文件再原子替换，并在 Host 生命周期内串行执行。用于维持页面的
`dsh-extension-manager` 和 `dsh-plugin-manager` 是受保护依赖，不能从当前页面停用。
所有组合变更都明确提示“重启 Web 后生效”。

Host 同时读取 `pluginInventory` 的实时 Loader 快照，将 inventory-only 的
`@deepseek-ai/dsh-vision-bridge` 合并为“系统 Bundle”条目。它的状态控件与详情操作均为
只读，Host API 也以 `PLUGIN_SYSTEM_READ_ONLY` 拒绝写入；因此“显示存在”不会被误解为
Plugin Manager 拥有系统组合的启停权限。

## 导入与市场

导入只接受 npm 包、GitHub 仓库或本地绝对目录。Host 使用参数数组调用官方命令：

```powershell
dsh plugin --profile web add <source> --ignore-scripts --reporter=append-only
```

不经过 shell 拼接。安装后必须在依赖清单中检测到唯一变化，并校验该包包含 DSH 声明；
校验不通过时通过官方 remove 命令回滚。

市场首页把精选、版本化 DSH Registry 和 npm Registry 合并成一个可搜索列表。Host 使用
npm 搜索分页发现候选后，逐个读取精确版本 manifest；只有 `package.json` 含合法 `dsh.client`、
`dsh.bundle` 或 `dsh.plugin` 声明且能解析到 GitHub 仓库时才显示为可安装，并把安装来源锁定为
`package@version`。DSH Registry 中声明了 `packageName` 的条目也执行相同校验；未通过者保持
“仅查看”。Registry 使用 10 分钟内存缓存，远程失败时保留精选和最近成功数据。
列表图标使用 Registry 的可信 HTTPS URL 或受控
`owner/repository` 推导的 GitHub owner 头像，Client 加载失败时回退为通用 Plugin 图标。
用户打开详情时，Host 才读取 GitHub Repository、latest release 与根目录 `package.json`，
结果在内存缓存 5 分钟；超时、限流或离线时本地管理不受影响。

Registry 默认地址为：

```text
https://raw.githubusercontent.com/Gyschuaner/dsharness/main/marketplace/plugin-registry.json
```

开发或测试可通过 Host 选项 `registryUrl` / `npmRegistryUrl` / `npmSearchUrl`，或环境变量
`DSH_PLUGIN_REGISTRY_URL` / `DSH_PLUGIN_NPM_REGISTRY_URL` / `DSH_PLUGIN_NPM_SEARCH_URL` 覆盖。
本机 `http://localhost` / `127.0.0.1` 仅用于本地测试，生产地址必须使用 HTTPS。

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

前一组覆盖 Host profile 事务、导入回滚、Registry schema/缓存/降级、GitHub 缓存/降级
和真实 Client bundle DOM；
后一组验证 Extension 壳移除 Plugin 占位后不会破坏 Skill 分区。
