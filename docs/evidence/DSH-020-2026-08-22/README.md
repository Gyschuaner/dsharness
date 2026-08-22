# DSH-020 vision progress and persistence evidence

Captured against the local production build at `http://127.0.0.1:3080/` with the opt-in DP vision bridge enabled.

- `vision-streaming.png`: live `Look ing <elapsed> · <visual output>` row while `vision_inspect` is still running. The intentional space between `Look` and `ing` is preserved.
- `vision-completed.png`: the same call after its formal `tool/result` replaced the running state without removing the row.
- `vision-after-reload.png`: a later completed vision call after a full page reload; the row and final visual summary replay from the durable session log.
- `verification.json`: 100 ms DOM sampling and reload assertions from the browser acceptance run.

The streaming `tool/progress` fragments are log-only and replayable. The paired `tool/call` and single final `tool/result` remain the model-facing context; progress fragments do not become duplicate model messages.

Reproducibility was also verified from an empty directory: all 19 patches applied to the official rc.2 base, the resulting tree matched `9689ee52fd6994f51674c73ba2a7a6580f481ef0`, frozen installation completed, and the full Host/Client/Web build passed. The run used `-SkipRegister`, so it did not replace the deployed 3080 command.
