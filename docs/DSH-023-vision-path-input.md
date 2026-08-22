# DSH-023 vision_inspect 本地图片路径输入

## 目标

保留 `vision_inspect` 作为唯一视觉入口。主模型既可以传入当前会话已有附件 ID，也可以
传入本地图片路径；插件负责把路径先转换为当前会话的持久附件，再调用配置好的视觉模型。

## 工具接口

工具描述：

```text
Inspect conversation attachments or local image files with the configured vision model.
```

参数描述：

```text
attachmentIds: Current-conversation attachment IDs to inspect.
paths: Image file paths to import into this conversation and inspect.
prompt: The complete visual question or inspection task.
```

`prompt` 必填；`attachmentIds` 与 `paths` 至少提供一项，两者可以混用。

## 数据路径与边界

1. 先校验全部附件 ID 都属于当前会话；任一越权引用都会在读取图片或访问视觉网关前失败。
2. 路径相对当前会话工作目录解析，绝对路径仍受当前文件系统服务及访问模式约束。
3. 先完成整批路径解析、普通文件检查、格式和数量检查，再读取字节。
4. 图片通过原生 attachment 服务执行大小、像素、格式和内容寻址准入。
5. 只把规范化附件引用写入 `vision/image-import`；图片字节和 base64 不进入主模型上下文。
6. 同一内容再次导入时复用附件 ID，当前会话可继续按 ID 回看，跨会话仍被拒绝。

## 验证记录

- vision bridge 定向测试：36/36 通过。
- session 持久化生成测试：25/25 通过。
- TypeScript host/client 构建、oxlint、插件 bundle、Markdown 校验通过。
- `pnpm run build:official` 完整构建通过。
- 3082 SIT 页面健康，3080 未修改、未重启。
- 视觉工具历史记录刷新后仍以 Look 行和完整 IN/OUT 展示：
  [`evidence/DSH-023-3082-look-persisted.png`](evidence/DSH-023-3082-look-persisted.png)。

正式技术设计：<https://ycn7t34xe864.feishu.cn/docx/YxyvdRUpVo2Fazx1RBfcV47dn5b>。
