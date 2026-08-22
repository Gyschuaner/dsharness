# DSH-022 原生图片策略

## 决策

DSH 0.1.1 已提供图片批次准入、内容寻址存储、会话事件引用与按模型策略生成请求图片。
因此停用 DSH-004 的 `image-context-guard`，不再在 `llm/stream` 边界把整次请求裁到
9 张。旧插件源码保留用于历史回溯，但不安装、不挂载。

## 运行边界

- 单条用户消息最多 20 张图片；
- 单张源图最多 20 MiB；
- 单条消息源图合计最多 200 MiB；
- 支持 PNG、JPEG、WebP 与 GIF；
- 单张源图最大 64,000,000 像素且单边不超过 8192 px；
- 持久化前归一化为最长边不超过 2048 px、编码不超过 4 MiB 的内容寻址对象；
- 一个会话没有额外的图片总数硬上限，限制发生在单条消息和单次模型/工具请求边界。

纯文本主模型启用视觉桥时，`vision_inspect` 默认可读取当前会话内最多 20 张唯一图片。
工具仍先验证整批 `attachment_id` 都来自当前会话，再读取任何字节或访问 DP Gateway；
跨会话和未知引用不会放宽。

## 发布与回退

生产迁移需同时完成：

1. 从 Web profile 的 `cordis.patch.yml` 删除 `image-context-guard` insert；
2. 从 profile `package.json` 删除 `dsh-image-context-guard` 依赖并重新安装依赖；
3. 使用新增的 DSH-022 上游补丁构建，使视觉桥默认值和 base bundle 配置均为 20；
4. 重启 Web 后确认 dump-config 中不存在 guard，并验证图片限制投影为 20 / 20 MiB / 200 MiB。

如某个下游提供方重新出现更低的图片硬限制，应针对该路由修复或配置，不恢复全局 9 图
裁剪；紧急回退只恢复旧 profile 依赖和挂载，不触碰现有会话或附件目录。

## 生产发布结果（2026-08-22）

- 22 个上游补丁从官方 `0.1.1-rc.2` 基线完整重放，最终源码树为
  `3c61807f54affd0667e4b6fcf7d170ef20d087bf`，Host、Client、Web 全量构建成功；
- `attachment-local` 原生默认值确认是每条消息 20 张、单图 20 MiB、合计 200 MiB；
- `vision_inspect` 默认批次由 9 改为 20，41 项视觉桥与本地附件回归测试通过；
- Web profile 已移除 `dsh-image-context-guard` 依赖和挂载，原 profile 备份位于
  `C:\Users\chuansgu\.dsh\profiles\web\backup-DSH-022-20260822-220148`；
- 3080 已使用新构建启动，dump-config 中不存在旧 guard，视觉桥配置为
  `maxImagesPerCall: 20`；
- 浏览器生产冒烟通过，既有会话、图片、`Look` 工具记录和结果仍可见，未迁移或删除附件；
- 回退时只恢复 profile 备份并重新启动 3080，不回滚或清理会话数据。
