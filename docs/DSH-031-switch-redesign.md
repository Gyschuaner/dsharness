# DSH-031 管理页 Switch 控件重设计

状态：testing（SIT 实测通过，待发布授权）
分支：`feat/DSH-031-switch-redesign`（commit `355bcaf`，已推送 origin）
参考设计：https://vibe-hub.org/switch（Switch 术语图解页）

## 目标

统一 plugin-manager / mcp-manager / skill-manager 三个管理插件中的 Switch 控件：
对齐 vibe-hub 的 44×24 视觉规格，动画采用简约 Apple 风格。

## 设计规格

| 项 | 值 |
| --- | --- |
| 轨道尺寸 | 44×24px，border-radius 999px |
| 关闭态 | `color-mix(in srgb, var(--dsw-alias-label-primary) 20%, var(--dsw-alias-bg-module-platform))`（≈ vibe-hub #c9cdd4，深浅主题自适应） |
| 开启态 | `var(--dsw-alias-state-business-primary)`（品牌蓝 #4176e6） |
| 滑块 | 18×18 白色，inset 3px，`box-shadow: 0 1px 3px rgba(0,0,0,.2)`，位移 20px |
| 轨道动画 | `background-color .25s ease` |
| 滑块动画 | `transform .3s cubic-bezier(.34,1.56,.64,1)`（Apple 弹性：轻微超程后回弹） |
| 按下反馈 | 滑块 `scaleX(1.12)`，transition-duration .12s（Apple 风格加宽） |
| 禁用态 | `opacity .5; cursor: not-allowed` |
| 焦点环 | `:focus-visible` 2px 品牌色 55% + offset 2px |
| 无障碍 | `role="switch"` + `aria-checked`（保持原有） |
| 动效降级 | `prefers-reduced-motion: reduce` 时 transition 关闭 |

## 重要发现（修复的既有问题）

旧实现（三个插件）轨道关闭态均引用 `--dsw-alias-fill-tsp-secondary`，
但该 token 在当前 DSH 主题（`packages/client/ui-theme`）中**不存在**，
导致 off 轨道背景是无效声明（实际透明）。本次改用真实存在的 token 组合。
上游官方 switch（TrajectoryToolbar）的 on 色亦使用 `--dsw-alias-state-business-primary`。

## 改动文件

- `plugins/plugin-manager/src/client.ts`（.pm-switch CSS 块）
- `plugins/mcp-manager/src/client.ts`（.mm-switch CSS 块 + 删除 36×20 覆盖块）
- `plugins/skill-manager/src/client.ts`（.sk-switch CSS 块 + 删除 .sk-root 覆盖块）
- 各插件 `lib/` 构建产物

## 测试

- 自动化：plugin-manager 22 / mcp-manager 16 / skill-manager 75，全部通过
- 浏览器（playwright + chromium，GUI 127.0.0.1:3080）：
  - SKILL 页 7 个 switch：44×24、off 中灰、on 品牌蓝、滑块 18×18 白 + 阴影 ✓
  - Plugin 页 6 个 switch：44×24、on 品牌蓝 ✓（off 探针同规格）
  - MCP 页无服务器时无 switch；探针注入验证 off/on 样式一致 ✓
  - 动画采样：8.85 → 17.4 → 20.34 → 21.73（超程）→ 20（回弹）✓
  - Tab 键盘聚焦：focus-visible 2px 品牌蓝 55% 环 ✓
  - 点击切换：aria-checked true→false 生效 ✓
- DP 测试用例：DSH-031 下 4 条（视觉规格 / 动画 / 交互边界 / 统一性与主题适配）

## 后续事项

- 需求已流转 testing；合并 main 与部署需用户授权
- Obsidian 研发记录（D:\Obsidian\gysnote\项目训练\DSH）需在 Windows 侧补充
