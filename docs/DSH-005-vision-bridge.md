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
    timeoutMs: 900000
    maxImagesPerCall: 20
    maxOutputTokens: 4096
```

该条目只用于纯文本主模型进程。使用原生多模态模型时不要加载视觉桥，继续走 DSH
原生图片通道。

DSH-022 起不再加载 `image-context-guard`。视觉桥的默认 20 图边界与 0.1.1 原生
`attachment-local` 单条消息数量一致；它只限制一次工具调用，不删除会话附件。

DSH-023 起，`vision_inspect` 可接收本会话 `attachmentIds`、本地图片 `paths`，或两者
混用。本地路径不会绕过原生附件服务：工具会在当前会话工作目录中解析相对路径，校验
PNG/JPEG/WebP/GIF、文件类型与部署限额，内容寻址保存后再调用视觉层。成功导入的附件
引用以模型不可见的 `vision/image-import` 事件留在当前会话，后续可按返回的附件 ID
回看；其他会话仍不可访问。

## 启用前健康检查

1. 以受管凭据请求 `GET https://ai.chuansgu.top/v1/models`。
2. 响应中必须存在精确模型 id `Qwen3.6-35B-A3B`。
3. 通过 DP Gateway 对该模型发起一条最小图片 `chat/completions` 请求，确认图片输入、
   `chat_template_kwargs.enable_thinking=false` 和结构化文本输出均受支持。
4. 再启用 profile 覆盖并执行 DSH 会话隔离、历史图片回看和失败脱敏冒烟测试。

## 2026-08-22 生产部署事实

- 模型机在 `127.0.0.1:23343` 常驻 `Qwen3.6-35B-A3B-Q8_0.gguf`，主模型继续独立运行在
  `127.0.0.1:23341`；二者同时健康。
- Q8 GGUF 与 BF16 projector 共 37,805,963,024 字节，启动前原子复制到
  `/dev/shm/gys/qwen36-q8`。服务设置 `CUDA_VISIBLE_DEVICES=""`、`--n-gpu-layers 0` 与
  `--no-mmproj-offload`，不会占用主模型显存。
- 腾讯云受限反向隧道新增私网监听 `172.18.0.1:23343`。Relay 把
  `Qwen3.6-35B-A3B` 配置为静态上游；它不进入三个主模型的单活切换控制器。
- `GET https://ai.chuansgu.top/v1/models` 已同时返回三个可切换主模型与常驻视觉模型。
- 本机用户级 `DPGATEWAY_API_KEY` 已通过 DP 创建的专用 Key 配置，明文未写入仓库或日志。

实测使用同一张 640×488 JPEG、321 个输入 token、40 个输出 token：

| 链路 | TTFT | 生成速度 |
| --- | ---: | ---: |
| 模型机直连，首次图片 | 4.45 s | 16.12 tok/s |
| 模型机直连，同图热请求 | 0.18 s | 16.72 tok/s |
| 公网 DP Relay，两次热请求 | 1.02 / 1.12 s | 15.85 / 17.82 tok/s |

模型机已安装 `@reboot` 自动启动：重启后会先恢复 `/dev/shm` 模型副本，再拉起受管
`screen`。可重复使用 `dev/qwen36-vision-ram/benchmark_ttft_tps.py` 监测文本和图片的
TTFT/TPS；凭据只从 `BENCHMARK_API_KEY` 环境变量读取。

## 安全与回退

- 不允许把 `DPGATEWAY_API_KEY` 的实际值写入 profile、环境示例或错误消息。
- 项目目录内 `.env` 不能覆盖受管凭据对应的网关地址；插件只接受 composition 中的
  运维配置，或进程/用户级 `DSH_VISION_BASE_URL`。
- 任何未知或跨会话 `attachment_id` 都必须在读取图片和访问网关之前整批拒绝。
- 回退时移除 profile 中的 `vision-bridge` 覆盖条目，或将其设为 `disabled: true`；原生
  多模态路径和不带图的纯文本路径不受影响。
