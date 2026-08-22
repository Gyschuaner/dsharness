# DSH-021 视觉模型纯系统内存推理加速报告

## 结论

在不使用 GPU/VRAM、不改变 DSH `vision_inspect` 协议和 DP Relay 路由的前提下，
Qwen3.6-35B-A3B 的真实图片长输出已经从生产 Q8 基线 17.81 TPS 提升到 50.03 TPS
中位数、50.14 TPS 均值。最佳候选是 ik_llama.cpp NUMA mirror fork、Q4_0、仅镜像
权重、64 个 decode 线程、8K 上下文和关闭 continuous batching。

本次没有替换生产端口 `23343`。Q4_0 比优化后的 Q8 快约 27.1%，但量化精度更低；
因此将它定义为性能候选，待补充小字 OCR、复杂图表和空间关系质量集后再决定是否上线。

## 固定环境与测试口径

- 模型机：2 × Intel Xeon Platinum 8474C，96 个物理核、192 个逻辑 CPU、2 个 NUMA
  节点、503 GiB RAM；支持 AVX-512 VNNI/BF16 和 AMX INT8/BF16。
- 主模型 `23341` 与视觉生产服务 `23343` 始终在线；实验只使用 `23350–23355`。
- 所有候选均设置空 `CUDA_VISIBLE_DEVICES`、0 GPU layers、禁止 mmproj offload。
- 模型：Qwen3.6-35B-A3B；projector：BF16；真实图片为 llama.cpp 自带的
  640×488《纽约时报》登月头版 JPEG。
- 温度 0、关闭 thinking、单并发、流式 OpenAI chat completions。短测输出 256 token；
  长测输出 1024 token；TPS 从首个可见 token 到流结束计算。
- 最佳候选 RSS 40,563,500 KiB；进程没有打开 `/dev/nvidia*` 设备。

## 开源方案筛选

| 方案 | 判断 | 原因 |
| --- | --- | --- |
| [llama.cpp](https://github.com/ggml-org/llama.cpp) 最新 main | 实测后淘汰 | Q4_K_M 合成峰值仅 16.48 TPS，低于当前构建。 |
| [ik_llama.cpp](https://github.com/ikawrakow/ik_llama.cpp) | 保留 | fused MoE、AVX-VNNI 与 runtime row repack 把 Q4_K_M 真实速度提升到 30.04 TPS。 |
| [NUMA mirror fork](https://github.com/mikechambers84/ik_llama.cpp/tree/numa-mirror) | 最佳 | 每个 CPU 插槽持有本地权重副本，并使用分层 barrier，显著减少跨插槽访存。 |
| [KTransformers AMX](https://github.com/kvcache-ai/ktransformers/blob/main/doc/en/AMX.md) | 不采用 | AMX 更利于矩阵-矩阵的 prefill；decode 仍主要走 AVX-512。其 [Qwen3.5 路径](https://github.com/kvcache-ai/ktransformers/blob/main/doc/en/Qwen3.5.md) 是 CPU/GPU 混合，和“不占 VRAM”冲突。 |
| 外部 0.8B draft speculative | 不可用 | multimodal target 需要等价图片 embedding；当前 server 明确拒绝无视觉 embedding 的 draft。 |
| target 自带 MTP | 不可用 | 当前 GGUF 不包含完整 MTP head，server 在启动时拒绝。 |

## 结果

### 同一真实图片的 256-token 对比

| 后端与量化 | NUMA/关键配置 | TPS 中位 | 热 TTFT 中位 | 约 RSS |
| --- | --- | ---: | ---: | ---: |
| 生产 llama.cpp Q8_0 | distribute，48 threads | 17.81 | 0.20 s | 约 38 GiB |
| ik_llama Q4_K_M | runtime repack，80 threads | 30.04 | 0.12 s | 约 23 GiB |
| ik NUMA mirror Q8_0 | 权重与 KV 双节点镜像，48 threads | 39.38 | 0.22 s | 约 73 GiB |
| ik NUMA mirror Q4_K_M | 权重与 KV 双节点镜像，64 threads | 44.73 | 0.20 s | 约 45 GiB |
| ik Q4_0 最佳候选 | 仅权重镜像，64 threads，8K ctx，ubatch 64，no-CB | 49.54 | 0.15 s | 38.68 GiB |

Q8 可以使用，而且经过 NUMA mirror 后从 17.81 提升到 39.38 TPS；但双份 Q8 权重更吃
内存带宽，仍比 Q4_K_M 慢 12.0%，比 Q4_0 短测慢 20.5%。如果质量优先，Q8 是最稳妥
回退；如果目标是 50 TPS，则需要 Q4_0。

### 最佳候选的真实图片长输出

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

## 推荐配置与切换边界

可复现启动器为 `dev/qwen36-vision-ram/start-server-ik-numa.sh`，默认端口 `23355`，并拒绝
无显式授权使用 `23343`。关键参数：

```text
Q4_0 + BF16 mmproj
threads=64, threads-batch=96, threads-mtmd=96
ctx=8192, batch=512, ubatch=64, parallel=1
numa-mirror=weights, runtime-repack, no-cont-batching
ngl=0, no-mmproj-offload, CUDA_VISIBLE_DEVICES=""
```

上线前仍需：

1. 建立至少 30 张图片的质量集，覆盖小字 OCR、表格、流程图、图表、密集 UI、空间关系、
   中文与英文混排；以当前 Q8 为基准做盲测。
2. 评估 8K 上下文是否覆盖视觉子代理的最长完整 prompt；超长请求应明确报错或路由到
   Q8 32K 回退，而不是静默截断。
3. 在隔离端口通过 DP Relay 和 DSH `vision_inspect` 做完整回归，再由用户明确授权替换
   `23343`。本次实验结束时 `23350–23355` 均已关闭，`23341` 与 `23343` 健康为 `ok`。

原始机器侧证据保存在 `/data1/gys/dsh021`；仓库摘要证据见
`docs/evidence/DSH-021-2026-08-22/benchmark-summary.json`。
