# Qwen3.6 RAM vision service

This deployment keeps `Qwen3.6-35B-A3B-Q8_0.gguf` and its BF16 multimodal
projector in `/dev/shm`, then serves them with llama.cpp on `127.0.0.1:23343`.
It is a static, CPU/system-RAM-only vision upstream. The GPU main-model service
on `127.0.0.1:23341` remains online and independently switchable.

The launcher sets `CUDA_VISIBLE_DEVICES` to an empty value, `--n-gpu-layers 0`,
and `--no-mmproj-offload`. This is an explicit safety boundary: the vision layer
must never borrow VRAM from the main model.

```bash
./launch-server.sh
./install-autostart.sh
./status-server.sh
python3 ./benchmark_ttft_tps.py --rounds 2
python3 ./benchmark_ttft_tps.py \
  --image /data1/gys/deepseek-v4/src/llama.cpp/tools/mtmd/test-1.jpeg \
  --rounds 2
```

For a safe first deployment, set `PORT=23345` and validate the temporary
instance before replacing the previously unmanaged process on `23343`. The
stop script only stops the exact managed `screen` name for its selected port.

When measuring through DP Relay, set `BENCHMARK_API_KEY` in the environment and
pass `--base-url https://ai.chuansgu.top/v1`. Do not put the key on the command
line or in benchmark output.
