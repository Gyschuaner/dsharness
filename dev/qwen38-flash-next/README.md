# Qwen3.8-Flash-Next FP8 on 8 x RTX 4090

DP-035 deploys the official ModelScope `Qwen/Qwen3.8-Flash-Next-FP8`
checkpoint as one TP8/EP8 SGLang service on `127.0.0.1:23341`.

The runtime is isolated below `/data1/gys/qwen38-flash-next`; it does not alter
the existing Qwen3.8-27B or DeepSeek environments. The pinned day-zero SGLang
source is commit `73a255206f916366c8d26d4022f82ddfb0ab558d`. RTX 4090 requires
the Ada fallback overlays and an SM80-compatible FlashAttention 2 build. The
remote `validate-qwen4-tvm-jit-policy.sh` gate validates all overlays, including
the short-prefill QSA padding case and repeatable TileLang QSA execution, before
every launch.

The production defaults preserve model and cache precision: FP8 weights, BF16
KV, BF16 Mamba state, native 262,144 context, no MTP and no CPU layer offload.
`max_mamba_cache_size=20` retains the five state slots required by each of four
admitted live requests, while `max_total_tokens=262144` gives one full native-context request
and leaves runtime VRAM headroom instead of allocating an oversized token pool.
The 51B PLE n-gram table is read from pinned host memory. Long-context QSA
prefill uses TileLang 0.1.11's Cython launcher with TVM-FFI 0.1.11 as its
compiler IR runtime and an isolated CUDA 12.8 toolchain; decode CUDA Graphs
cover batch sizes 1, 2 and 4. Sampling uses the numerically equivalent PyTorch
backend because the FlashInfer sampler's cached TVM-FFI handle becomes invalid
after a 250K TileLang prefill on this Ada build.

```bash
./launch-qwen38-flash-next-fp8.sh
./stop-qwen38-flash-next-fp8.sh
```

The service accepts at most nine images and three videos per request. DP's
model controller lists it as `Qwen3.8-Flash-Next-FP8`; switching is serialized,
uses port 23341, performs a real short-prompt readiness check and rolls back to
the preserved DeepSeek Q8 launcher if the target fails.
