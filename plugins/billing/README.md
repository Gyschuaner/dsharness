# dsh-billing

Deepseek Harness 的 Cordis 影子计费插件。

## 功能

- Host 侧扫描 `~/.dsh/sessions`，按调用去重并持久化到 SQLite。
- 根据 DeepSeek Flash 的峰谷价规则估算输入、缓存命中和输出 Token 费用。
- 在 Extensions 的独立 Billing 分区展示 Token 用量、缓存命中、最近 7 天图表、按模型汇总和调用明细。
- 在设置页展示本地估算口径与价格表。

## 挂载点

- `extension.manager.section`：Billing 主页面。
- `settings.section`：Billing 设置页。

Billing 不向会话顶部或会话页签注入入口，避免把计费信息混入对话上下文。
