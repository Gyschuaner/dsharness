# DeepSeek V4 Flash 0731 deployment

DSH-013 deploys the Unsloth `UD-Q4_K_XL` and `UD-Q8_K_XL` GGUF variants on the
8 x RTX 4090 model host.  It deliberately keeps every runtime artifact below
`/data1/gys/deepseek-v4` so that the existing Qwen environment remains a clean
rollback target.

## Pinned inputs

- ModelScope repository: `unsloth/DeepSeek-V4-Flash-0731-GGUF`
- ModelScope revision observed during deployment:
  `de4541c838e5d03f0a2fd32cd035df25ca1dbfc8`
- llama.cpp commit: `fe8156f789011f6ea0baf6917ea09f88b89d9554`
- Model roots:
  - `/data1/gys/models/DeepSeek-V4-Flash-0731-UD-Q4_K_XL`
  - `/data1/gys/models/DeepSeek-V4-Flash-0731-UD-Q8_K_XL`
- Isolated Python environment: `/data1/gys/deepseek-v4/env`

## Download

```bash
/data1/gys/deepseek-v4/env/bin/python download_modelscope.py --variant UD-Q4_K_XL
/data1/gys/deepseek-v4/env/bin/python download_modelscope.py --variant UD-Q8_K_XL
```

The downloader only selects the requested five GGUF shards, the Q8 DSpark
drafter, and repository metadata. It is safe to rerun and resumes ModelScope's
partial downloads.

## Start and stop

`select-nvidia-driver-libs.sh` chooses userspace NVIDIA libraries that match the loaded kernel module. The host currently runs a 570 kernel module while its system symlinks point at 580, so it temporarily selects `/data1/gys/qwen38/runtime/nvidia570`. After the host reboots into the 580 kernel, it automatically selects the validated system libraries instead of forcing stale 570 files.

`patch-qwen-driver-runtime.sh` applies the same runtime selection to the existing Qwen rollback launcher and keeps a one-time `.pre-dsh013-driver-auto` backup. It changes only the driver-library selection; the Qwen environment and inference parameters remain untouched.

The production profile is one 262,144-token slot, Q8 KV cache, Flash Attention,
8-way layer split, and DSpark with `n_max=3`. CUDA graphs are disabled by
default because the pinned build reproduced a fatal heterogeneous-request
cuBLAS shape error when graph reuse was enabled.

```bash
MODEL_VARIANT=UD-Q4_K_XL ./launch-server.sh
./status-server.sh
./stop-server.sh

MODEL_VARIANT=UD-Q8_K_XL ./launch-server.sh
```

`MODEL_VARIANT`, `CONTEXT_SIZE`, `PARALLEL`, `ENABLE_DSPARK`,
`DSPARK_N_MAX`, and KV data types are environment overrides. Only one variant
may own port 23341 at a time.

## Qwen rollback

The deployment keeps Qwen's Python environment and inference parameters intact.
The only Qwen-side change is the driver-library selector described above, with
a `.pre-dsh013-driver-auto` backup. To roll back, stop the DeepSeek screen and
run the preserved wrapper:

```bash
/data1/gys/deepseek-v4/scripts/restore-qwen38-services.sh
```

The wrapper delegates to the original production and long-context Qwen launch
scripts rather than copying or modifying their environments.

## DP-controlled single-model switching

The relay publishes four logical model IDs, but the GPU host loads exactly one
model on port 23341. `model-controller.py` listens only on `127.0.0.1:23340` and
serializes switch requests. It stops known model screens, launches the requested
profile, waits for the exact `/v1/models` alias, then requires a real short-prompt
chat completion before reporting `ready`. It rolls back to the previous model if
the target does not pass that inference gate within 2,700 seconds. The fourth
entry is `Qwen3.8-Flash-Next-FP8`, launched from the isolated
`/data1/gys/qwen38-flash-next` runtime; the preserved optimized DeepSeek Q8
launcher remains its rollback target.

```bash
install -m 600 model-controller.env.example \
  /data1/gys/deepseek-v4/control/model-controller.env
# Replace MODEL_CONTROL_TOKEN before starting.
./launch-model-controller.sh
./dp-ai-relay-tunnel
```

The restricted reverse tunnel exposes only the Compose-private listeners
`172.18.0.1:23341` (model API) and `172.18.0.1:23340` (controller) on the relay
host. Neither port binds a public NIC. DP is the only UI that may call the switch
endpoint. The 45-minute deadline covers a Q8 + DSpark cold load on the current
disk. DSH lists all four IDs and can select one, but selecting an inactive model
returns HTTP 409 and never triggers a deployment change.

If the controller process restarts while a switch is still loading, it resumes
the wait from the persisted target without invoking the launch script again.
This prevents an SSH or controller interruption from discarding a cold model
load or leaving the state permanently stuck at `switching`.

## Validation

Run mixed reasoning, tool-call, concurrency, and 256K-context checks with the
included Python scripts. Save JSON output below
`/data1/gys/deepseek-v4/results`; do not rely only on client wall time because
queued concurrent requests and server-side decode timing answer different
questions.

Operational notes:

- A completely cold 155+ GB model load takes roughly 20–30 minutes on the
  current `/data1` volume; a warm page-cache reload is much faster.
- Concurrent ModelScope downloads compete for the same volume. Freeze or
  finish them before a time-sensitive production restart.
- The host needs its driver compatibility library path and the local
  `readdir(3)` preload workaround; both are set by `start-server.sh`.
- The relay must publish the same alias as the selected variant.

## Measured production baselines

All figures below were captured on the same 8 x RTX 4090 host with 262,144
context, one llama.cpp slot, Q8 KV, Flash Attention, DSpark `n_max=3`, and CUDA
graphs disabled. Decode rates are server timings rather than estimates from
client wall time.

| Check | UD-Q4_K_XL | UD-Q8_K_XL |
| --- | ---: | ---: |
| Mixed 4 x 512-token mean / median | 50.71 / 47.41 tok/s | 48.41 / 46.66 tok/s |
| Tool-call decode | 55.74 tok/s; 2 parallel calls correct | 52.92 tok/s; 2 parallel calls correct |
| 4-request aggregate | 27.72 tok/s | 51.09 tok/s |
| 255,990-token prompt prefill | 541.58 tok/s | 533.78 tok/s |
| 256K test decode | 45.42 tok/s | 43.51 tok/s |
| Minimum VRAM headroom in 256K test | 1,361 MiB | 709 MiB |
| Repeated-prefix cache hit | 99.998% | 99.998% |

Q4 gained 29.97% over its no-DSpark baseline. Q8 was about 4–5% slower in
single-stream decode but retains the lossless quantization advantage, so it is
the final default. A real DSH Q8 + Xhigh read-only tool task completed three
correct file reads and strict JSON output at 52 tok/s with 41% reported cache
hit. At 256K both variants remained within 24GB per GPU; Q8 has less margin and
must keep `PARALLEL=1`, Q8 KV, and graphs disabled.
