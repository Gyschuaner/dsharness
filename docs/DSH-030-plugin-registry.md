# DSH-030 Plugin 市场 Phase 1：Registry 只读发现

## 范围

Phase 1 在 DSH-027 的精选 Plugin 市场之上增加版本化远程 Registry。Registry 只承载
发现数据，不承载可执行代码、密钥或安装脚本；现有导入、安装、更新和启停流程保持不变。
Registry-only 条目本阶段只能查看，避免在未建立完整审查链路前扩大安装权限。

## 数据流

```text
marketplace/plugin-registry.json
        ↓ HTTPS
dsh-plugin-manager Host
        ├─ schema / URL / repository 校验
        ├─ 10 分钟内存缓存
        ├─ 重复仓库去重
        └─ Registry 失败 → stale cache → featured fallback
        ↓ JSON
Plugin Client：精选 / 发现切换、搜索、详情
```

默认 Registry 地址：

```text
https://raw.githubusercontent.com/Gyschuaner/dsharness/main/marketplace/plugin-registry.json
```

Host 可以通过 `registryUrl` 选项或 `DSH_PLUGIN_REGISTRY_URL` 环境变量覆盖。生产地址必须
使用 HTTPS；本机 localhost / 127.0.0.1 的 HTTP 只为本地验证保留。

## Registry schema

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-08-24T03:00:00Z",
  "items": [
    {
      "id": "owner/repository",
      "repository": "owner/repository",
      "description": "一句话描述",
      "packageName": "optional-package-name",
      "iconUrl": "https://...",
      "latestHint": "optional-version"
    }
  ]
}
```

Host 对根节点、schema 版本、生成时间、数组上限、仓库格式、ID 一致性、文本长度、包名
格式和 HTTPS 图标逐项校验。重复仓库按不区分大小写的仓库名去重；精选条目优先，避免
同一插件在两个来源中出现两行。

## API 语义

`marketplace` 仍保持 API version 1，并增加可选字段：

- `registry.status`: `fresh`、`stale` 或 `unavailable`；
- `registry.generatedAt` / `registry.warning`；
- `page`: `offset`、`limit`、`total`、`hasMore`、`nextCursor`；
- 每个条目的 `marketSource` 和 `installable`。

`marketplace.detail` 会按需读取 Registry-only 条目的 GitHub 详情；
`marketplace.install` 对 Registry-only 条目返回 `MARKET_REGISTRY_READ_ONLY`，不会修改
profile。精选条目的原有安装路径不变。

## 失败与安全边界

- Client 不直接访问 Registry 或 GitHub，所有网络请求由 Host 发起；
- Registry JSON 无法解析、schema 不匹配、HTTP 失败或超时时，优先使用最近成功缓存；
- 没有缓存时仍返回精选列表，市场不会因发现源不可用而空白；
- 远程 Registry 不会触发插件代码、npm、Docker 或 lifecycle script；
- 图标只允许 HTTPS，Client 图片失败回退为通用 Plugin 图标；
- Registry 条目不会写入 `package.json` 或 `cordis.patch.yml`。

## 验证范围

- Host：正常 Registry、空 Registry、schema 错误、危险图标、重复仓库、stale cache 和
  Registry-only 安装拒绝；
- Client：精选 / 发现切换、来源状态提示、发现条目仅查看、详情抽屉和图标降级；
- 回归：本地插件列表、导入、启停、精选市场详情与既有安装路径。
