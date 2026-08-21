# DSH-005 视觉桥与 DP Gateway 部署说明

## 固定调用链

视觉桥启用后的唯一受支持链路是：

```text
DeepSeek 主模型
  -> vision_inspect
  -> DSH vision-bridge
  -> https://ai.chuansgu.top/v1/chat/completions
  -> DP Gateway / Relay
  -> Qwen3.6-35B-A3B
```

DSH 不直连模型机，也不在会话、工具结果、日志或 Git 中保存网关密钥。插件通过
`ctx.credentials` 在每次调用时解析 `DPGATEWAY_API_KEY`；视觉模型看到的是主模型委派的
完整 prompt 与本对话内已授权的图片字节，DeepSeek 主模型只看到文本 reminder 和
结构化工具结果。

## Profile 覆盖配置

可复用覆盖文件位于
[`dev/vision-bridge.dp-gateway.patch.yml`](../dev/vision-bridge.dp-gateway.patch.yml)。
管理员确认健康检查通过后，把该条目合并到目标 profile 的 `cordis.patch.yml`：

```yaml
- id: vision-bridge
  name: '@deepseek-ai/dsh-vision-bridge'
  disabled: false
  config:
    baseURL: 'https://ai.chuansgu.top/v1'
    apiKeyEnv: DPGATEWAY_API_KEY
    model: Qwen3.6-35B-A3B
    timeoutMs: 120000
    maxImagesPerCall: 9
    maxOutputTokens: 4096
```

该条目只用于纯文本主模型进程。使用原生多模态模型时不要加载视觉桥，继续走 DSH
原生图片通道。

## 启用前健康检查

1. 以受管凭据请求 `GET https://ai.chuansgu.top/v1/models`。
2. 响应中必须存在精确模型 id `Qwen3.6-35B-A3B`。
3. 通过 DP Gateway 对该模型发起一条最小图片 `chat/completions` 请求，确认图片输入、
   `chat_template_kwargs.enable_thinking=false` 和结构化文本输出均受支持。
4. 再启用 profile 覆盖并执行 DSH 会话隔离、历史图片回看和失败脱敏冒烟测试。

截至 2026-08-22，本机受管凭据查询到的相关模型只有 `Qwen3.8-27B-FP8`，尚未发现
`Qwen3.6-35B-A3B`。因此覆盖配置已经固化，但当前不能启用或宣称 SIT 通过；需要先在
DP Relay 注册并暴露目标模型。

## 安全与回退

- 不允许把 `DPGATEWAY_API_KEY` 的实际值写入 profile、环境示例或错误消息。
- 项目目录内 `.env` 不能覆盖受管凭据对应的网关地址；插件只接受 composition 中的
  运维配置，或进程/用户级 `DSH_VISION_BASE_URL`。
- 任何未知或跨会话 `attachment_id` 都必须在读取图片和访问网关之前整批拒绝。
- 回退时移除 profile 中的 `vision-bridge` 覆盖条目，或将其设为 `disabled: true`；原生
  多模态路径和不带图的纯文本路径不受影响。
