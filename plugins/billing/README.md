# dsh-billing

Deepseek Harness 的 Cordis 影子计费插件。

## 功能

- Host 侧扫描 `~/.dsh/sessions`，按调用去重并持久化到 SQLite。
- 根据 [DeepSeek-V4-Flash 官方价格](https://api-docs.deepseek.com/quick_start/pricing/?article_id=article_1779470751466_8)估算输入未命中、缓存命中和输出 Token 费用：按 ¥7.2/USD 折算后低谷约为 ¥1.01 / ¥0.02 / ¥2.02（每 1M Token），北京时间工作日峰值按 ×2；缓存命中价格低于输入未命中。
- 在价格口径更新后自动重算已有 SQLite 调用记录，避免历史汇总继续沿用旧价格。
- 在 Extensions 的独立 Billing 分区展示 Token 用量、缓存命中、最近 7 天图表、按模型汇总和调用明细；按模型用量占比展示输入、缓存命中、输出三类 Token 的数值与百分比，并使用对应模型品牌图标。
- 在设置页展示本地估算口径与价格表，并明确这不是官方账单。

## 挂载点

- `extension.manager.section`：Billing 主页面。
- `settings.section`：Billing 设置页。

Billing 不向会话顶部或会话页签注入入口，避免把计费信息混入对话上下文。
