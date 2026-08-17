# dsh-better-sidebar-smooth

针对 `dsh-better-sidebar` 0.12.3 的本地 CSS 补丁：修复侧面板开合时
「Session log」胶囊**先跳 50px、再滑 300ms**的动画撕裂。

关联：DP `BUG-1E130940`（DSH-007 下）。

## 根因（上游 0.12.3 实测确认）

better-sidebar 的样式表里，布局位移和让位 padding 用了**两套不同步的机制**：

| 驱动 | 规则 | 动画 |
|---|---|---|
| 布局位移 | `#root { margin-right: var(--dsh-sidebar-width); transition: margin-right 300ms cubic-bezier(.4,0,.2,1) }` | 300ms 平滑 |
| 右上角让位 | `body[data-dsh-sidebar-collapsed] [data-slot="conversation.session.header"] > header { padding-right: 78px }` | **无过渡（瞬变）** |

开/关侧面板时，`--dsh-sidebar-width`（0↔432px）与 body 属性（padding
78↔28px）在同一次 React 提交里翻转：margin 走 300ms 动画，padding 瞬间
跳 50px。Session log 胶囊右对齐在 header 内，于是首帧**反向跳 50px**
（朝滑入的面板方向），随后才随布局平滑滑动 —— 即肉眼可见的「动画很奇怪」。

该 padding 规则本身是合理的：右上角两个切换按钮是 `position: fixed`
钉在视口角落，面板收起时 header 全宽，不加 78px 胶囊会被按钮压住；
问题只在于它没跟布局动画同步。

## 修复

给 header 的 `padding-right` 加上与布局**同时长同缓动**的过渡。两条曲线
同钟同步，位移 = margin 位移 + padding 位移 的叠加，是单调平滑函数，
开、关两个方向都修复。

## 卸载

`dsh plugin --profile web remove dsh-better-sidebar-smooth`，并删除
`~/.dsh/profiles/web/cordis.patch.yml` 里对应 insert 行与
`~/.dsh/plugins/better-sidebar-smooth` 符号链接，刷新页面。上游修复后可
直接整体移除。
