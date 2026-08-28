# DSH-033 Qwen3.8-Flash-Next 接入与插件可见性

> 历史说明：本文记录 DSH-033 实施时的“显式启用”策略。DSH-034 同步
> `dsh-v0.1.2-alpha.1` 后，Vision Bridge 已改为 base bundle 默认启用；本文中的
> `disabled: true` 仅用于回溯和人工故障回退，不再是当前默认配置。

## 目标

DP-035 已将 `Qwen3.8-Flash-Next-FP8` 发布到 DP AI Relay。DSH-033 在不保存或改写
Relay 密钥的前提下完成两项接入：把模型加入 DSH 可选列表，并将 `vision-bridge` 的
视觉后端及部署覆盖路由切到该模型。默认主模型继续使用现有 DeepSeek 纯文本模型。

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

`Qwen3.8-Flash-Next-FP8` 保留为可选模型，但不设为默认主模型。本机
`agent-default-model.model` 继续使用 `DeepSeek-V4-Flash-0731-Q8_K_XL`，provider 为
`dpgateway`，`reasoningEffort` 为 `xhigh`。旧 Qwen3.8-27B、DeepSeek Q4/Q8 条目不删除。

视觉桥使用 [`../dev/vision-bridge.dp-gateway.patch.yml`](../dev/vision-bridge.dp-gateway.patch.yml)
作为受管的显式启用模板；base bundle 行继续保持 `disabled: true`。本机 web profile 不
覆盖该行，因此 DSH 启动时视觉桥保持关闭，只有目标 profile 主动合入模板并重启才启用。

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

默认启动验收应确认 `--dump-config` 中 vision-bridge 为 `disabled: true`，重启后插件库
仍显示该系统插件且状态为已停用。启用前必须用受管凭据确认 Relay `/v1/models` 暴露
精确模型 ID，并完成最小图片请求；显式合入模板后再确认 `disabled: false`、执行
`vision_inspect` 和插件库浏览器回归。

主模型没有随 DSH-033 切换，因此视觉桥启停和回退不应改写 `agent-default-model`。
回退视觉模型时将 profile 覆盖恢复为 `Qwen3.6-35B-A3B`；也可将 vision-bridge 设为
`disabled: true` 完全关闭，此时 `vision_inspect` 及其视觉代理链路不会挂载。配置修改前
的备份应保留到文本、图片与插件库冒烟全部完成。
