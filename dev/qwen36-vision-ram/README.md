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

## DSH-021 CPU/NUMA acceleration candidate

The production launcher above intentionally remains on the accepted Q8
configuration. DSH-021 adds a separately reviewable ik_llama.cpp candidate in
`start-server-ik-numa.sh`; its defaults are the best measured settings on the
dual-socket Xeon 8474C host:

- Q4_0 target weights plus BF16 multimodal projector;
- 64 decode threads, 96 prompt/image threads;
- per-node weight mirroring, without KV mirroring;
- 8K context, batch 512, ubatch 64, one slot;
- runtime row repacking and continuous batching disabled.

The candidate defaults to isolated port `23355` and refuses production port
`23343` unless `ALLOW_PRODUCTION_PORT=1` is explicit. `--numa-mirror weights`
implies no-mmap: even when the source GGUF is on disk, both weight copies live
in anonymous system RAM. It keeps `CUDA_VISIBLE_DEVICES` empty, uses zero GPU
layers, and disables projector offload.

```bash
PORT=23355 ./start-server-ik-numa.sh
python3 ./benchmark_ttft_tps.py \
  --base-url http://127.0.0.1:23355/v1 \
  --image /data1/gys/deepseek-v4/src/llama.cpp/tools/mtmd/test-1.jpeg \
  --prompt '请详细观察这张图片，列出至少二十条你能确认的内容，逐条说明依据，并在最后集中说明无法确认的细节。请完整回答，不要提前结束。' \
  --max-tokens 1024 \
  --rounds 5
```

Measured results and the Q8/Q4 comparison are recorded in
`docs/DSH-021-vision-ram-tps.md`. Q4_0 is a speed candidate rather than an
automatic production replacement: small-text OCR and visual reasoning quality
must be accepted before changing the Relay upstream.
