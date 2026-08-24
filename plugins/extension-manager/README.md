# dsh-extension-manager

DeepSeek Harness 的通用“扩展”页面壳（DSH-006）。它只负责主页侧边栏入口、全页框架、
分区导航，不包含任何 Skill / MCP / Plugin 业务或 Host API。

## 组合契约

- 壳注册到 `sidebar.footer.action`，注册 id 为 `extensions-page`。
- 壳声明根作用域列表 Slot：`extension.manager.section`。
- 业务插件通过 `slots.inject('extension.manager.section', ...)` 注册分区；注册项至少提供
  `id`、`order` 和 `label`，组件即该分区页面。
- `dsh-skill-manager` 是首个业务贡献者，注册 `id: skill`，继续独立拥有
  `/api/skill-manager` 与 SKILL 管理界面。
- `dsh-plugin-manager` 注册 `id: plugin`，独立拥有 `/api/plugin-manager`、本地插件管理
  与插件市场；壳不再提供 Plugin 占位。
- `dsh-mcp-manager` 注册 `id: mcp`，独立拥有 `/api/mcp-manager`、服务器管理与市场界面。
- 插件加载顺序不影响组合；声明消失时，Cordis Slot 生命周期会同步移除分区挂载。

## 本地挂载

Windows 开发机使用 `dev/setup-plugin-junction.ps1` 建立
`~/.dsh/plugins/extension-manager` 到本目录的 junction，并在 web profile 的
`cordis.patch.yml` 中插入：

```yaml
- insert:
  - id: extension-manager
    name: 'dsh-extension-manager'
```

首次新增插件需要重启 `dsh web`；后续 client 修改硬刷新页面即可生效。
