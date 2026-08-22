# DSH-021 视觉模型纯系统内存推理加速报告

## 结论

在不使用 GPU/VRAM、不改变 DSH `vision_inspect` 协议和 DP Relay 路由的前提下，
accuracy-first 的 Q8_0 真实图片 1024-token 长输出从生产基线 17.81 TPS 提升到 41.18
TPS 中位数。配置是 ik_llama.cpp NUMA mirror fork、仅镜像权重、44 个 decode 线程、
8K 上下文、ubatch 64 和关闭 continuous batching。它比生产基线快约 131%，但没有达到
DSH-021 后续提高到 45 TPS 的验收线。

Q4_0 可达到 50.03 TPS 中位数、50.14 TPS 均值，但用户明确选择 Q8 的视觉精度，故仅保留
为性能参考。重新导出的 Q8_0 内置官方一层 MTP 后，draft 接受率稳定在 83.15%，长输出却
降到 33.49 TPS 中位数、33.45 TPS 均值；纯 CPU 上额外 MTP 层与双 token 验证成本大于
接受收益，因此不启用 MTP。用户确认候选后，生产端口 `23343` 已切换到该 Q8_0 非 MTP
配置；其余视觉实验端口与进程均已停止。

## 固定环境与测试口径

- 模型机：2 × Intel Xeon Platinum 8474C，96 个物理核、192 个逻辑 CPU、2 个 NUMA
  节点、503 GiB RAM；支持 AVX-512 VNNI/BF16 和 AMX INT8/BF16。
- 主模型 `23341` 与视觉生产服务 `23343` 始终在线；实验只使用 `23350–23355`。
- 所有候选均设置空 `CUDA_VISIBLE_DEVICES`、0 GPU layers、禁止 mmproj offload。
- 模型：Qwen3.6-35B-A3B；projector：BF16；真实图片为 llama.cpp 自带的
  640×488《纽约时报》登月头版 JPEG。
- 温度 0、关闭 thinking、单并发、流式 OpenAI chat completions。短测输出 256 token；
  长测输出 1024 token；TPS 从首个可见 token 到流结束计算。
- Q8 非 MTP 候选约占 73 GiB RSS；Q8+MTP 实测峰值 RSS 77,394,976 KiB。两者均未打开
  `/dev/nvidia*` 设备。

## 开源方案筛选

| 方案 | 判断 | 原因 |
| --- | --- | --- |
| [llama.cpp](https://github.com/ggml-org/llama.cpp) 最新 main | 实测后淘汰 | Q4_K_M 合成峰值仅 16.48 TPS，低于当前构建。 |
| [ik_llama.cpp](https://github.com/ikawrakow/ik_llama.cpp) | 保留 | fused MoE、AVX-VNNI 与 runtime row repack 把 Q4_K_M 真实速度提升到 30.04 TPS。 |
| [NUMA mirror fork](https://github.com/mikechambers84/ik_llama.cpp/tree/numa-mirror) | 最佳 | 每个 CPU 插槽持有本地权重副本，并使用分层 barrier，显著减少跨插槽访存。 |
| [KTransformers AMX](https://github.com/kvcache-ai/ktransformers/blob/main/doc/en/AMX.md) | 不采用 | AMX 更利于矩阵-矩阵的 prefill；decode 仍主要走 AVX-512。其 [Qwen3.5 路径](https://github.com/kvcache-ai/ktransformers/blob/main/doc/en/Qwen3.5.md) 是 CPU/GPU 混合，和“不占 VRAM”冲突。 |
| 外部 0.8B draft speculative | 不可用 | multimodal target 需要等价图片 embedding；当前 server 明确拒绝无视觉 embedding 的 draft。 |
| target 自带 MTP | 实测后淘汰 | 从官方 HF 权重重新导出同一 GGUF 内置的一层 MTP；接受率 83.15%，但 Q8 长输出从 41.18 降至 33.49 TPS。 |

## 结果

### 同一真实图片的 256-token 对比

| 后端与量化 | NUMA/关键配置 | TPS 中位 | 热 TTFT 中位 | 约 RSS |
| --- | --- | ---: | ---: | ---: |
| 生产 llama.cpp Q8_0 | distribute，48 threads | 17.81 | 0.20 s | 约 38 GiB |
| ik_llama Q4_K_M | runtime repack，80 threads | 30.04 | 0.12 s | 约 23 GiB |
| ik NUMA mirror Q8_0 | 权重与 KV 双节点镜像，48 threads | 39.38 | 0.22 s | 约 73 GiB |
| ik NUMA mirror Q4_K_M | 权重与 KV 双节点镜像，64 threads | 44.73 | 0.20 s | 约 45 GiB |
| ik Q4_0 最佳候选 | 仅权重镜像，64 threads，8K ctx，ubatch 64，no-CB | 49.54 | 0.15 s | 38.68 GiB |

Q8 可以使用，而且经过 NUMA mirror 与长输出参数细调后从 17.81 提升到 41.18 TPS；
如果质量优先，它是当前推荐路径。Q4_0 的 50 TPS 只说明硬件仍有低比特性能空间，不能
作为 Q8 精度验收的替代品。

### Q8_0 非 MTP 长输出基线

| 轮次 | TTFT | 输出 token | 端到端流式 TPS |
| ---: | ---: | ---: | ---: |
| 1（冷图片） | 2.344 s | 1024 | 40.64 |
| 2 | 0.413 s | 1024 | 41.18 |
| 3 | 0.162 s | 1024 | 41.17 |
| 4 | 0.175 s | 1024 | 41.46 |
| 5 | 0.170 s | 1024 | 41.43 |

中位 41.18 TPS，均值 41.18 TPS。五轮均正确识别 `The New York Times`、
`MONDAY, JULY 21, 1969` 和 `MEN WALK ON MOON`。

### Q8_0 内置一层 MTP

新 GGUF 由官方 BF16/HF 权重直接转换为 Q8_0，共 753 个 tensor、37,802,149,568 bytes，
元数据包含 `qwen35moe.nextn_predict_layers=1`。服务使用
`--spec-type mtp:n_max=1,p_min=0.0`，并在启动时执行 `--validate-quants` 和
`--check-tensors`。文件 SHA-256 为
`e9e45e0f9d4ae0274875cb9438bc9f46fd0ccf76f30c14c92e72bbe072014d4e`。

| 轮次 | TTFT | 输出 token | 端到端流式 TPS | draft 接受率 |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 0.436 s | 1024 | 33.49 | 83.15% |
| 2 | 0.282 s | 1024 | 33.53 | 83.15% |
| 3 | 0.156 s | 1024 | 33.20 | 83.15% |
| 4 | 0.162 s | 1024 | 33.74 | 83.15% |
| 5 | 0.149 s | 1024 | 33.30 | 83.15% |

中位 33.49 TPS，均值 33.45 TPS，比同量化非 MTP 基线慢 18.7%。32–56 decode threads
细扫的最佳值为 36 线程、256-token 35.13 TPS，排除了“44 线程仅适合普通 decode”的
干扰。服务端累计生成 4,582 个 draft token、接受 3,820 个，证明 MTP 一直生效，并非
静默回退。密集 UI、`Think 2s ... vision_inspect` 小字行以及 `Look 48s ... 53s` 重复耗时
三项 OCR 冒烟均通过，说明失败点是性能而不是质量。

### Q4_0 性能参考的真实图片长输出

| 轮次 | TTFT | 输出 token | 端到端流式 TPS |
| ---: | ---: | ---: | ---: |
| 1（冷图片） | 2.398 s | 1024 | 49.85 |
| 2 | 0.313 s | 1024 | 49.95 |
| 3 | 0.171 s | 1024 | 50.03 |
| 4 | 0.183 s | 1024 | 50.32 |
| 5 | 0.162 s | 1024 | 50.52 |

中位 50.03 TPS，均值 50.14 TPS，热 TTFT 中位 0.183 s。五轮输出均正确识别
`The New York Times`、`NEW YORK, MONDAY, JULY 21, 1969` 和
`MEN WALK ON MOON`。256-token 热态 10 轮中位为 49.80 TPS，说明该配置就在硬件边界：
长输出能够达到 50 TPS，短输出会因流关闭固定开销略低于 50。

## 关键决策与失败实验

1. 双路 NUMA 本地权重副本是最大收益项。Q4_K_M 从普通 ik 的 30.04 提升到 44.73
   TPS；单纯升级官方 llama.cpp 反而没有收益。
2. Q4_0 runtime row repack 的合成 128-token 峰值为 52.43 TPS；真实视觉长输出稳定在
   50 TPS 左右。
3. 仅镜像权重优于同时镜像 KV。视觉请求上下文短，KV 双写的成本高于本地读取收益。
4. ubatch 从 512 降到 64、上下文从 32K 降到 8K、关闭 continuous batching 都有小幅
   收益；64 decode threads 是 60–68 细扫中的明确峰值。
5. 把每个 worker 强制绑到唯一物理核使合成速度从 52.43 降到 51.83 TPS，已撤销；
   让 Linux 在节点内调度更适合当前有其他常驻服务的机器。
6. `llama-quantize --repack` 只重排已有类型，不会同时降量化。第一次误生成的 BF16_R16
   文件已重命名纠正，正式 Q4_0 由独立量化步骤生成。
7. `/proc/sys/kernel/numa_balancing=1`，当前账号不能无密码 sudo。NUMA fork 明确警告该
   设置可能影响性能；若以后允许主机级调优，关闭自动 NUMA balancing 后值得重测，
   但本报告没有把未执行的收益计入结果。
8. Q8_K_R8、transparent huge pages、QKV/专家合并、远端 KV cache 和异步调度均未把 Q8
   拉到 45 TPS；最佳长输出仍约 41 TPS。
9. MTP 的接受率不是问题。纯 CPU 每一步还要运行一层 MTP MoE，并由 target 对两个 token
   做验证；这部分成本使 83% 接受率仍成为 18.7% 的净负收益。MTP 不进入推荐启动参数。

## 推荐配置与切换边界

可复现启动器为 `dev/qwen36-vision-ram/start-server-ik-numa.sh`，默认端口 `23355`，并拒绝
无显式授权使用 `23343`。关键参数：

```text
Q8_0 + BF16 mmproj，不启用 MTP
threads=44, threads-batch=96, threads-mtmd=96
ctx=8192, batch=512, ubatch=64, parallel=1
numa-mirror=weights, runtime-repack, no-cont-batching
ngl=0, no-mmproj-offload, CUDA_VISIBLE_DEVICES=""
```

## 生产发布结果（2026-08-22）

- 发布目录：`/data1/gys/qwen36-vision/releases/20260822-2148-3cf4852`；
- 生产视觉端口：`127.0.0.1:23343`，使用 Q8_0 与 BF16 projector；
- 实际参数与推荐配置一致，不含 `--spec-type`、MTP 或其他 draft 参数；
- `23344–23355` 无监听，主模型 `23341` 保持健康；
- 视觉进程的 GPU 设备句柄数为 0；
- 生产 1024-token 真实图片冒烟：TTFT 2.407 s，流式 TPS 40.85，图片识别正确；
- DP Relay 经认证的真实截图调用成功，DSH 3080 的 `vision_inspect` 历史 `Look` 记录可见；
- 已安装 `@reboot` 守护入口，启动与健康检查脚本随发布目录留存；
- 切换前后进程、端口、crontab 与基准证据均保存在发布目录的 `evidence/` 下，旧启动脚本
  保存在 `rollback-scripts/`，可用于回退。

后续若继续追速，应优先评估可控的主机级 NUMA balancing/内存策略或新的 CPU kernel，
不再继续调 MTP 接受阈值。8K 上下文仍是显式运行边界；超长视觉任务应明确报错或路由到
更大上下文的回退服务，而不是静默截断。

原始机器侧证据保存在 `/data1/gys/dsh021`；仓库摘要证据见
`docs/evidence/DSH-021-2026-08-22/benchmark-summary.json`。
