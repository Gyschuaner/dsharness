# DSH-033 Qwen3.8-Flash-Next 接入与插件可见性

## 目标

DP-035 已将 `Qwen3.8-Flash-Next-FP8` 发布到 DP AI Relay。DSH-033 在不保存或改写
Relay 密钥的前提下完成三项接入：把模型加入 DSH 可选列表、将本机默认主模型切到该
模型试用、将 `vision-bridge` 的默认及部署覆盖路由切到同一模型。

## DSH 模型配置

在 `~/.dsh/settings.yaml` 的 `llm-pi-ai.providers.dpgateway.models` 中保留现有模型并新增：

```yaml
- id: Qwen3.8-Flash-Next-FP8
  name: Qwen3.8-Flash-Next
  contextWindow: 262144
  maxTokens: 32768
  input:
    - text
    - image
  reasoningEfforts:
    off: none
    low: low
    medium: medium
    xhigh: xhigh
```

本机试用配置把 `agent-default-model.model` 设为 `Qwen3.8-Flash-Next-FP8`，provider 仍为
`dpgateway`，`reasoningEffort` 保持 `xhigh`。旧 Qwen3.8-27B、DeepSeek Q4/Q8 条目不删除。

视觉桥使用 [`../dev/vision-bridge.dp-gateway.patch.yml`](../dev/vision-bridge.dp-gateway.patch.yml)
中的受管覆盖；base bundle 行继续保持 `disabled: true`，只有目标 profile 显式覆盖才启用。

## vision-bridge 为什么此前不在插件库

Plugin Manager 0.2.0 只枚举 profile `package.json` 的直接 DSH 依赖，再用
`pluginInventory` 补充这些条目的运行状态。`@deepseek-ai/dsh-vision-bridge` 由
`@deepseek-ai/dsh-base` 间接提供，不是 profile 直接依赖，因此即使 Loader 已启用也会
被列表遗漏。

Plugin Manager 0.2.1 将该 inventory-only 条目合并为“系统 Bundle / 只读”插件：

- 列表和详情显示真实 Loader 启用状态与 Fiber phase；
- 开关与详情操作禁用，并说明由系统组合管理；
- Host `setEnabled` 对该包返回 `PLUGIN_SYSTEM_READ_ONLY`，不会写入 profile；
- 其他 Cordis 内部基础行仍不进入用户插件列表。

## 验证与回退

启用前必须用受管凭据确认 Relay `/v1/models` 暴露精确模型 ID，并完成最小文本与图片
请求。随后检查 `--dump-config` 中 vision-bridge 为 `disabled: false` 且模型正确，重启
Web 后执行 `vision_inspect` 和插件库浏览器回归。

回退主模型时将 `agent-default-model.model` 恢复为
`DeepSeek-V4-Flash-0731-Q8_K_XL`。回退视觉模型时将 profile 覆盖恢复为
`Qwen3.6-35B-A3B`；也可将 vision-bridge 设为 `disabled: true` 完全关闭。配置修改前的
备份应保留到文本、图片与插件库冒烟全部完成。
