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

市场列表和详情抽屉沿用 MCP 的图标语义：受控仓库条目使用 GitHub owner 头像作为
HTTPS 图标源；Host 会拒绝非 HTTPS 图标，Client 图片加载失败时显示通用 Plugin
图标，且不改变安装、更新和详情缓存流程。

## Phase 1：只读 Registry（DSH-030）

精选清单继续作为稳定兜底；Host 额外读取版本化
`marketplace/plugin-registry.json`，校验 schema、仓库、描述和 HTTPS 图标，按仓库名
去重并返回 `marketSource`、Registry 状态和分页字段。Client 在市场内提供“精选 / 发现”
切换。Registry-only 条目本阶段仅支持查看，精选条目的原有安装路径不变。

Registry 请求使用 10 分钟内存缓存：新数据优先，远程失败时使用 stale 缓存，没有缓存时
仍显示精选列表。网络和 Registry 数据都由 Host 持有，Client 不直连远程来源。

## Build 2：Plugin Loading

- 初次读取本地配置或市场索引时保留标题、页签和搜索框，只替换内容区，避免页面跳动；
- 动画沿用 Skill Finding 的 216 × 132 视觉槽位和文字聚焦节奏，四个官方 Cordis
  Plugin 模块从四角向中心接口归位，其中一个模块使用品牌蓝作为视觉焦点；
- 即使 Host 在数十毫秒内返回，也至少展示约 680ms，避免动画只闪一帧；
- `prefers-reduced-motion` 下取消位移、缩放和循环，只保留静态模块与完整文案；
- 请求失败会退出动画并显示可恢复错误，点击“重试”重新进入加载态并发起真实请求。

## 安全与失败语义

- 导入来源按类型校验，并以 `spawn(..., { shell: false })` 的参数数组执行；
- 默认 `--ignore-scripts`，减少第三方安装期代码执行；
- 安装后校验唯一 DSH 插件清单，否则通过官方 remove 命令回滚；
- profile patch 变更串行、临时文件原子替换；
- 扩展壳和 Plugin Manager 自身禁止停用；
- 所有安装、更新和启停只改变下一次组合，UI 明确提示重启 Web。
