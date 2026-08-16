# image-context-guard

`DSH-004` / `BUG-3E5CFD04` 的短期保护插件。它在 `llm/stream` 最终模型调用边界检查整次请求中的图片块，并把超过上限的旧图片替换成文本占位符。

## 行为

- 单次模型请求最多保留 9 张图片；
- 按消息从新到旧选择，同一消息内保持原顺序；
- 普通用户图片和 `tool-result` 中的嵌套图片统一计数；
- 0～9 张时直接放行原请求对象；
- 超限时只创建下游请求副本，不修改持久化会话、附件引用或页面历史；
- 下游模型错误、取消和流式返回语义保持不变。

被裁剪的图片位置会换成简短文本占位符，避免形成空用户消息或空工具结果。

## 本地测试

```powershell
node --test .\test\image-context-guard.test.js
```

## DSH Web 接入

运行时插件目录使用仓库 junction：

```powershell
.\dev\setup-plugin-junction.ps1 -PluginName image-context-guard
```

在 `~/.dsh/profiles/web/package.json` 的 `dependencies` 增加：

```json
"dsh-image-context-guard": "link:C:/Users/<user>/.dsh/plugins/image-context-guard"
```

在 `~/.dsh/profiles/web/cordis.patch.yml` 增加顶层条目：

```yaml
- insert:
  - id: image-context-guard
    name: 'dsh-image-context-guard'
```

重新安装 profile 依赖并重启 `dsh web` 后生效。长期的附件存储、视觉摘要和按需重注入方案见 DP `DSH-005`，不在本插件范围内。
