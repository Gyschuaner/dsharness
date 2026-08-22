# DSH-020 vision progress and persistence evidence

Captured against the local production build at `http://127.0.0.1:3080/` with the opt-in DP vision bridge enabled.

- `vision-streaming.png`: live `Look ing <elapsed> · <visual output>` row while `vision_inspect` is still running. The intentional space between `Look` and `ing` is preserved.
- `vision-completed.png`: the same call after its formal `tool/result` replaced the running state without removing the row.
- `vision-after-reload.png`: a later completed vision call after a full page reload; the row and final visual summary replay from the durable session log.
- `verification.json`: 100 ms DOM sampling and reload assertions from the browser acceptance run.

BUG-374ECAE5 was verified on the same 3080 deployment after the streaming presentation regression fix.
The running row exposed exactly one `dsh-tool-row-sweep` animation. Once visual output started, the
visible summary changed on every sampled increment and its constrained 589 px viewport followed the
tail (`scrollLeft`: `0` -> `218` -> `539`). After completion it reset to the first summary line; a full
reload retained all eight Look rows and the latest completed text, with zero new browser errors.

BUG-40D0E1BE was then verified with a fresh visual call that required at least eight observations.
At 47 seconds the Looking line displayed the currently streaming middle-panel observation instead of
freezing on the completed summary. The final result contained nine observations and settled at 1:05
back to the final summary. A reload retained the tenth Look row. The generic outer `1:10 Done` activity
remained available to the Tool lifecycle DOM but computed to `display: none`, leaving only the inline
Look duration visible and completing BUG-BA3AD2DC.

The streaming `tool/progress` fragments are log-only and replayable. The paired `tool/call` and single final `tool/result` remain the model-facing context; progress fragments do not become duplicate model messages.

Reproducibility was also verified from an empty directory: all 21 patches applied to the official rc.2 base, the resulting tree matched `20b75d22dce990c0db43de5ea9ea03b7132e2e6e`, frozen installation completed, and the full Host/Client/Web build passed. The run used `-SkipRegister`, so it did not replace the deployed 3080 command.
