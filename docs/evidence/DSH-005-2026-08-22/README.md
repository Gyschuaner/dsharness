# DSH-005 视觉桥生产验收证据

验收日期：2026-08-22（Asia/Shanghai）

## 交付版本

- dsharness main：`31476e8e3e5f7ece456a8deeab71c374597a9e41`
- 上游功能提交：`14f94fa`、`e93914a`、`21359be`
- 锁定结果树：`2f2d1e7033499d5e2d7b7e2d66450b69df117741`
- 新增补丁：`0018-feat-DSH-005-add-dedicated-vision-tool-presentation.patch`
- 补丁 SHA-256：`5AC66C9896CF49470496C4CBD76466504070D57C1DAF101422FAF652899029AA`
- 运行版本：`dsh 0.1.1-rc.2`

## 自动化与构建验证

- 在全新 Git 目录按 `upstream.lock.json` 拉取官方基线，18 个补丁全部应用成功，结果树精确匹配锁定值。
- `pnpm install --frozen-lockfile`、Host build、Client build、Web build 均通过。
- `verify-dsh-source.ps1` 全项通过，含源码树、补丁哈希、构建产物、默认关闭、DP Gateway、Qwen 路由与全局命令校验。
- 聚焦回归：5 个测试文件、63 项测试全部通过。
- vision-bridge：2 个测试文件、37 项测试全部通过；Statements / Branches / Functions / Lines 均为 100%。
- 完整上游测试曾执行 842 个测试文件：805 passed、32 failed、5 skipped；14,087 项测试：13,921 passed、102 failed、64 skipped。失败集中于 Windows symlink `EPERM`、临时目录 `EBUSY`、5 秒加载超时及外部 shell/SDK 环境，未包含 DSH-005 聚焦测试失败。
- Client domain graph 仍报告 27 个上游既有约束项，DSH-005 新包不在违规列表中。

## 3080 部署

- 全局 `dsh` 链接到干净构建目录 `D:\Pythonproject\deepseek-harness-DSH-005-release-ui-20260822\apps\cli`。
- `http://127.0.0.1:3080/` 返回 HTTP 200。
- DP Gateway `GET /health/ready` 返回 `ready`。
- 授权 `GET /v1/models` 唯一命中 `Qwen3.6-35B-A3B`。
- 3080 使用 `vision-bridge.dp-gateway.patch.yml` 显式启用视觉桥；base bundle 仍默认关闭。

## 浏览器端到端结果

1. 新会话、图片粘贴、图片持久化成功。
2. 每条带图用户消息仅出现一条持久 `vision-bridge` system reminder。
3. DeepSeek 通过原生结构化工具通道调用 `vision_inspect`，视觉结果进入最近的 tool-result，主模型最终回答与图中节点和连线一致。
4. 同一会话可使用历史 attachmentId 再次检查图片。
5. 新会话复用旧 attachmentId 时，在网关调用前返回 `not available in the current session`；工具耗时 0 秒，未泄露图片内容。
6. `vision_inspect` 调用中显示专属取景框/眼睛图标与 `Vision` 标题，不再显示通用 `Tool call`；计时复用 Think 的 `ElapsedTime` 语义和格式。
7. 成功和失败完成态均保留专属视觉呈现；IN/OUT 与 Inspect 仍可展开，其他工具继续使用通用 Tool call 呈现。

## 截图索引

- [01 新会话](01-new-session.png)
- [02 图片已附加](02-image-attached.png)
- [03 持久 system reminder](03-image-reminder.png)
- [04 优化前的通用 Tool call](04-vision-tool-call.png)
- [05 视觉结果与回答](05-vision-result-and-answer.png)
- [06 最终视觉回答](06-final-visual-answer.png)
- [07 同会话历史图片回看](07-history-image-recall.png)
- [08 专属 Vision 调用中图标与计时](08-vision-dedicated-running.png)
- [09 专属 Vision 完成态及 IN/OUT](09-vision-dedicated-settled.png)
- [10 跨会话附件拒绝](10-cross-session-isolation.png)

## 性能与剩余风险

- 本次 3080 真实验收的两次视觉工具调用总计 2 分 13 秒，单次约 70 秒和 76 秒；主模型最终统计约 50 tok/s、缓存命中 66%。
- 视觉模型经 DP Relay 的独立热请求基准约 1.02–1.12 秒 TTFT、15.85–17.82 tok/s。真实工具链延迟明显更高，后续应继续拆分排队、图片预处理、prompt 长度和生成长度的耗时。
- 回滚：移除 `-EnableVisionBridge` 后重启即可恢复默认关闭；若需回滚 UI 补丁，revert `31476e8`、按旧锁文件重装并重启 3080。
