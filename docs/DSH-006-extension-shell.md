# DSH-006 扩展页组合边界

## 目标

主页“扩展”入口是 Web Shell 能力，不属于 SKILL 业务。自 2026-08-24 起，代码按以下边界组合：

```text
sidebar.footer.action
└─ dsh-extension-manager
   ├─ 扩展全页壳 / 分区导航 / 收起记忆 / 关闭行为
   └─ extension.manager.section（list, root）
      ├─ skill  ← dsh-skill-manager
      ├─ mcp    ← extension-manager 一期占位
      └─ plugin ← extension-manager 一期占位
```

## 职责

- `plugins/extension-manager`
  - 唯一注册 `sidebar.footer.action` 的 `extensions-page`。
  - 在注册上声明 `extension.manager.section`，根据 Slot ledger 生成有序导航。
  - 维护通用全页框架、响应式导航、浏览器本地收起状态与 Esc/关闭行为。
  - 一期内注册 MCP / Plugin 占位；正式业务落地时可拆为独立贡献插件。
- `plugins/skill-manager`
  - 注册 `extension.manager.section` 的 `skill` 分区。
  - 独立维护 `/api/skill-manager`、项目配置、扫描合并、启停、来源、标签与预设。
  - 不注册主页 Slot，不包含 `.ext-*` 样式或通用扩展文案。

## 生命周期与加载顺序

两个插件都使用 `slots.inject`。Skill 可先于壳加载并等待声明；壳也可先加载并在 Skill
出现后接收注册。壳卸载时，Cordis 会级联撤销其声明的分区 Slot，避免残留孤立页面。

## 验证门槛

- 源码中只有 `dsh-extension-manager` 注册 `sidebar.footer.action`。
- `dsh-skill-manager` 只注册 `extension.manager.section`。
- DOM 集成测试覆盖两种加载顺序、三分区顺序、壳样式归属和 SKILL 页面渲染。
- 运行配置同时包含两个独立 Cordis 行；3080 实机只显示一个“扩展”入口。

2026-08-24 实际结果：真实 bundle DOM 8/8；全量插件 57 pass / 0 fail / 4 skip；
3080 从扫描态过渡到 `game` 11/68，MCP/Plugin 占位切换正常，console 0 error/warn。
DP 测试用例 `8fe181aa-a743-4803-9719-8f8eeb8091e5` 在计划
`3612b72a-4b08-4519-999d-166757e3b4fd` 中执行 passed 并完成计划。
