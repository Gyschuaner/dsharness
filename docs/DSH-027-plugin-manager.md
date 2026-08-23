# DSH-027 Plugin Manager 实现说明

## 组合结构

```text
sidebar.footer.action (extensions-page)
└─ dsh-extension-manager
   └─ extension.manager.section (list, root)
      ├─ skill   ← dsh-skill-manager
      ├─ mcp     ← extension-manager 一期占位
      └─ plugin  ← dsh-plugin-manager
```

`plugin-manager` 是独立 Host + Client 双面插件，不从 `skill-manager` 复用入口、API 或状态。
Client 遵循 Slot 生命周期；Host 把 `webServer` 与只读 `pluginInventory` 声明为 Web
硬依赖，等待两项服务就绪后通过 `ctx.effect()` 持有 `/api/plugin-manager` 路由的 disposer。

## 两个事实来源

| 事实 | 来源 | 用途 |
| --- | --- | --- |
| 已安装插件 | `profiles/web/package.json` 直接依赖 + 依赖清单 | 名称、版本、来源、DSH 能力 |
| 组合挂载状态 | `profiles/web/cordis.patch.yml` + bundle patch | row id、期望启停状态 |

Plugin Manager 不直接编辑依赖 JSON；安装和更新调用 `dsh plugin --profile web add`。
组合启停只写 `cordis.patch.yml` 中由本插件拥有的标记块，不改写已有人工内容。

## 市场数据策略

首页使用仓库内受控清单，避免打开页面就为每个仓库消耗 GitHub API 配额。点击详情后
并行读取：

1. Repository API：作者、描述、Stars、Forks、语言、许可、topics、最后推送；
2. Releases latest：最新 tag 与发布地址；
3. raw `package.json`：DSH 声明、Host/Client 入口、兼容要求。

详情缓存 5 分钟。实时请求失败时返回旧缓存并标记 stale；没有缓存时给出可恢复错误，
市场基础列表与本地页仍可使用。

## 安全与失败语义

- 导入来源按类型校验，并以 `spawn(..., { shell: false })` 的参数数组执行；
- 默认 `--ignore-scripts`，减少第三方安装期代码执行；
- 安装后校验唯一 DSH 插件清单，否则通过官方 remove 命令回滚；
- profile patch 变更串行、临时文件原子替换；
- 扩展壳和 Plugin Manager 自身禁止停用；
- 所有安装、更新和启停只改变下一次组合，UI 明确提示重启 Web。
