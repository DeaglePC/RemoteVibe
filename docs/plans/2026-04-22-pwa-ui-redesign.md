# PWA UI 重设计方案

> **版本**：v2 定稿（Q1–Q7 + Q3.1–Q3.7 已拍板）
> **作者**：设计方案讨论（Agent pair-programming）
> **日期**：2026-04-22
> **状态**：🟢 已拍板，待实施（P1 起步）
> **范围**：仅前端（`web/`），**不动 Go 后端、不动业务协议、不动 WebSocket 数据流**
>
> **拍板摘要**：
> - Q1=A 沿用现有色调做多尺寸图标；Q2=A 保留可拖分割；Q3=双 Tab（会话/设置）；Q4=A 同步做命令面板；Q5=A 跟随系统；Q6=A 字体本地化；Q7=A 离线聊天可读
> - Q3.1=A 项目=workDir；Q3.2=A 手风琴；Q3.3=A 进聊天隐藏 TabBar；Q3.4=PC-1 Sidebar 承载；Q3.5=A 直接切换无返回；Q3.6=A 右上角打开文件 Pane；Q3.7=A 多机器仅 CRUD

---

## 0. TL;DR

把 BaoMiHua Agent Gateway 从"网页感"的布局升级为"原生 PWA App 感"，**双端信息架构完全同构**：

- **信息架构（双端统一）**：两个一级功能 —— **会话（Sessions）** 和 **设置（Settings）**。
  - **会话** = 项目手风琴：项目（workDir）→ 展开 → 该项目下的会话列表 → 点会话进入聊天。
  - **设置** = 主题 / 模型 / **后端机器（多机器 CRUD）** / 关于。
- **手机端**：iOS 原生风 —— **底部 2 Tab（会话 / 设置）** + 全屏页面栈 + SafeArea 贴合；点会话 push 进聊天页并隐藏 TabBar；聊天页右上角按钮打开文件面板。
- **PC 端（方案 PC-1）**：VS Code 风 —— **活动栏（2 图标：会话 / 设置） + Sidebar（项目手风琴，常驻）+ 聊天主区 + 右侧 Pane（文件/工具详情，按需展开）**。和手机完全同构，组件双端复用。
- **PWA 能力**：补齐 icons（多尺寸 + maskable）、splash screen、theme-color 分浅/深、SW 三策略分层升级、安装提示、离线降级页、本地字体、Cmd+K 命令面板。
- **设计系统**：保留现有 `oklch` 色板，重新规范 **spacing / radius / elevation / motion / z-index** 五个 token 族；补齐**浅色主题**并跟随系统。

---

## 1. 现状审计（快速）

### 1.1 已具备

| 项 | 状态 | 说明 |
|---|---|---|
| Manifest | ✅ 基础版 | `public/manifest.json`，只有一个 SVG 图标，多尺寸未配齐 |
| Service Worker | ✅ 基础版 | `public/sw.js`，cache-first 策略，**无版本回收**、**无 SWR**、**无离线兜底页** |
| `<meta theme-color>` | ✅ | 已有 `#1a1128`，但未区分浅/深主题 |
| `apple-mobile-web-app-*` | ✅ | iOS 全屏 + 黑色透明状态栏 |
| `safe-area-inset-*` | 🟡 部分 | `index.css` 有 `.safe-bottom/.safe-top`，但布局内未全局贴合 |
| 视口 `viewport-fit=cover` | ✅ | |
| 设计 token | 🟡 | `oklch` 色板完整；spacing / elevation / motion 散落在各组件内联 style，未系统化 |
| 暗色 | ✅ | 硬编码暗色，`color-scheme: dark`，**无浅色主题** |
| 响应式 | 🟡 | 仅用 `isMobile = innerWidth < 640` 粗粒度二分，中间档 640–1024 未专门设计 |
| 移动端 Header | 🟡 | TopBar 在移动端显示完整 header，挤占垂直空间 |
| 字体 | 🟡 | Inter + JetBrains Mono 从 Google Fonts CDN 加载 — 离线时无字体（回退 system-ui） |

### 1.2 问题清单（按影响度排序）

1. **🔴 PWA 安装体验差**：图标只有一个 SVG，iOS / Android / Windows 安装后**图标模糊、无 maskable、无 splash**。
2. **🔴 手机端垂直空间紧**：TopBar 顶到顶，`ChatStatusBar` + `InputBar` 叠在底部，中间聊天区过窄；缺 TabBar 切换导致功能藏在命令里。
3. **🟡 PC 端信息架构混乱**：`ActivityBar` 不带文字标签、只有图标；`TopBar` 在桌面被 `hideHeader` 隐藏但 Launch 靠状态触发器，链路不直观。
4. **🟡 会话切换链路长**：`SessionPickerModal` 要从 TopBar 入口进，缺一个常驻的侧栏会话列表。
5. **🟡 设计 token 不统一**：大量 `style={{ background: 'var(--color-surface-x)', border: '1px solid ...' }}` 内联 —— 改主题要改几十处。
6. **🟡 深色强制**：`color-scheme: dark` 写死；PWA 用户习惯跟随系统。
7. **🟠 SW 升级陷阱**：当前 SW 是纯 cache-first，发布新版后**用户不刷新就永远拿旧资源**，没有 skipWaiting / clientsClaim / 版本清理。
8. **🟠 离线降级**：没有离线页面，断网直接白屏。
9. **🟠 无"安装到主屏"引导**：Android / Desktop Chrome 的 `beforeinstallprompt` 完全未处理。

---

## 2. 设计目标

1. **像原生 App**：手机端动画、TabBar、SafeArea 贴合、返回手势（或顶部返回按钮）、全屏态下无网页感。
2. **可安装可离线**：安装后图标清晰、启动有 splash、断网可打开（显示缓存的聊天历史 + 离线提示）、后台更新 SW 有提示。
3. **信息密度双档**：PC 端可同时看到 *文件树 / 聊天 / 工具调用*，手机端单页聚焦。
4. **深色为主，浅色跟随系统**：不强制主题，尊重系统设定，保留手动切换。
5. **保留全部业务功能**，不删业务入口；仅做信息架构和视觉重组。


---

## 3. 设计系统（Design Tokens）

### 3.1 主题策略

- **深色（默认，当前）**：保留现有 `oklch` 紫调 + 电子青点缀。
- **浅色（新增）**：以 `oklch(0.98 ...)` 作 surface-0，保持色相 270 / 195 不变；对比度靠明度拉开。
- **切换方式**：`<html data-theme="light|dark|auto">`；默认 `auto` 跟随 `prefers-color-scheme`；设置里可手动覆盖。

### 3.2 Token 分族

| 族 | 命名规则 | 示例 | 当前状态 |
|---|---|---|---|
| Color | `--color-{role}-{scale}` | `--color-surface-1` | ✅ 已有，补浅色 |
| Spacing | `--space-{1..12}` | `--space-4 = 1rem` | ❌ 新增（取代散落 `px-3 py-2`） |
| Radius | `--radius-{xs/sm/md/lg/xl/full}` | ✅ 已有 | 保持 |
| Elevation | `--shadow-{1..4}` | `--shadow-2 = 0 2px 8px ...` | ❌ 新增 |
| Motion | `--ease-out`, `--duration-fast/base/slow` | `--duration-base = 200ms` | ❌ 新增 |
| Z-index | `--z-{base/raised/overlay/modal/toast}` | `--z-modal = 1000` | ❌ 新增 |
| Touch | `--touch-target: 44px` | iOS HIG 推荐最小触控 | ❌ 新增 |

### 3.3 字体

- 保留 Inter + JetBrains Mono，但改为**本地托管**（避免离线无字体），放 `public/fonts/`，`font-display: swap`。
- 新增 `--font-display`（用于大标题）、`--font-mono`（已有）。
- 中文回退：`"PingFang SC", "Microsoft YaHei", "Noto Sans SC"`。

---

## 4. PC 端布局（≥ 1024px） · 方案 PC-1

> **核心原则**：PC 端和手机端信息架构**完全同构** —— 都是「会话 / 设置」两个一级功能。PC 用常驻 Sidebar 承载手机的项目手风琴，避免点击切换的重复劳动。

### 4.1 线框

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
├──┬───────────────────┬───────────────────────────────────────┬────────────────┐
│  │                    │ PageHeader（聊天主区顶，44px）         │                │
│💬│ Sidebar（220px）   │  会话名                  [📂文件][⋯]     │  Right Pane    │
│└─│                    ├───────────────────────────────────────┤  （按需展开） │
│  │ ▸ 项目 A          │                                        │                │
│⚙️│   · 会话 1  ←激活  │   ChatView                             │  - 文件树       │
│  │   · 会话 2        │   - Thought（折叠）                    │  - 文件预览     │
│  │ ▸ 项目 B          │   - Markdown                             │  - 工具详情     │
│  │   + 新建会话       │   - 内联工具调用                      │                │
│  │ + 打开新项目       │                                        │  380px，可拖     │
│  │                    ├───────────────────────────────────────┤  Cmd+J 折叠     │
│  │                    │   InputBar                              │                │
│  │                    ├───────────────────────────────────────┤                │
│  │                    │   ChatStatusBar（24px）                │                │
└──┴───────────────────┴───────────────────────────────────────┴────────────────┘
  48px                  Cmd+B 折叠
  Activity
   Bar
```

### 4.2 ActivityBar（左侧 48px）

只有 2 个图标，和手机 TabBar 一一对应：

| 图标 | 功能 | 点击行为 |
|---|---|---|
| 💬 **会话** | 开/关 Sidebar | 切换 Sidebar 到项目手风琴模式（默认） |
| ⚙️ **设置** | 开/关 Sidebar | 切换 Sidebar 到设置导航模式 |

> 设计上关键点：**ActivityBar 只切换 Sidebar 的内容主题**，不影响右侧主工作区。主工作区始终是当前聊天（或欢迎页）。设置不会"隐藏"聊天，会话可随时切回。

### 4.3 Sidebar 两种模式

**模式 A：会话模式（默认）**

```
会话                                   [🔍] [+]
─────────────────────────────────────
▾ 📁 RemoteVibe
    ● 主会话            2分钟前
    · 重构 UI            昨天
    + 新建会话
▸ 📁 my-app
▸ 📁 scratch
─────────────────────────────────────
+ 打开新项目（选择 workDir）
```

- 项目默认折叠，点击展开（手风琴）。
- 当前激活会话用品牌色圆点 + 左侧高亮条 `2px`。
- 顶部搜索框可模糊查找会话/项目名。
- `+` 新建会话：如当前有激活项目，则在该项目下新建；否则弹出 workDir 选择器。

**模式 B：设置模式**

```
设置
─────────────────────────────────────
🎨 主题            auto
🧠 模型            gemini-2.x
🖥️ 后端机器       · localhost •  激活
                  · dev-box
                  + 添加
🔔 通知            开
ℹ️  关于            v0.1.0
```

- 进入设置模式后，主区**保持显示当前聊天**（不切换）；如需全屏设置，默认还是聊天页，设置项点开后以 Modal/Pane 形式打开各子页。
- **后端机器**是设置下的一项，点击展开 CRUD 面板（加/改/删/激活当前机器）。

### 4.4 主工作区

- **欢迎页**（未选会话）：Logo + 「选择左侧会话开始，或 Cmd+K 快速分析」+ 最近会话快捷卡。
- **聊天页**：PageHeader（会话名 + 右上角 📂文件按钮 + ⋯更多）+ ChatView + InputBar + ChatStatusBar。
- **右上角文件按钮（Q3.6=A）**：点击开关右侧 Pane，默认展示当前会话 workDir 的文件树 + 文件预览。
- **主工作区不因 ActivityBar 切换而改变**，避免用户打断聊天思路。

### 4.5 交互快捷键

| 快捷键 | 行为 |
|---|---|
| `Cmd+B` / `Ctrl+B` | 折叠/展开 Sidebar |
| `Cmd+J` / `Ctrl+J` | 折叠/展开 Right Pane |
| `Cmd+K` / `Ctrl+K` | 命令面板 |
| `Cmd+,` / `Ctrl+,` | 进入设置模式 |
| `Cmd+N` / `Ctrl+N` | 新建会话 |
| `↑` / `↓` | Sidebar 上下切换会话 |
| `Enter` | Sidebar 激活选中会话 |

### 4.6 变化小结（跟现有代码对比）

| 区域 | 现状 | 新方案 |
|---|---|---|
| **ActivityBar** | 多个图标，功能不统一 | **精简成 2 个图标**，和手机同构；底部加后端连接状态灯 |
| **Sidebar** | 无常驻侧栏 | **新增常驻 220px Sidebar**，两种模式：会话手风琴 / 设置导航 |
| **TopBar** | 桌面被 `hideHeader=true` 隐藏 | **彻底移除桌面版本**；Agent 启动/停止按钮移至 Sidebar 会话项右键/Hover 菜单中 |
| **主区 PageHeader** | 无独立 header | **新增 44px 主区顶**，展示会话名 + 右上角文件按钮，与手机同构 |
| **主工作区** | `Allotment` 三列硬分割 | 保留 `Allotment`，但只用于主区/Right Pane；Sidebar 独立为 flex 子元素不受 Allotment 管理 |
| **Right Pane** | 无 | 新增，文件/工具详情交给它 |
| **ChatStatusBar** | 底部 | 保持，改为 24px 细条 |
| **Command Palette** | 无 | 新增 `Cmd+K`，所有动作可搜索（Raycast 风） |

---

## 5. 手机端布局（< 640px）

> **核心信息架构（Q3=双 Tab）**：仅 2 个底部 Tab —— 💬 **会话** / ⚙️ **设置**。所有功能从这两个入口进入；聊天是会话 Tab 下的二级页，进入后 TabBar 隐藏（Q3.3=A）。

### 5.1 页面栈结构

```
L1（首页）          L2（二级，push 进栈，TabBar 隐藏）        L3（三级）
──────────────── ───────────────────────────── ────────────────
💬 会话 Tab
  项目手风琴列表 →  聊天页（Q3.5 手机版本）  →  文件面板（右上角 📂）
                                                   →  文件查看器
⚙️ 设置 Tab
  设置列表       →  主题/模型/后端/关于  →  子项编辑
                       （后端 = 机器 CRUD）
```

### 5.2 L1：会话 Tab 首页（项目手风琴）

```
┌──────────────────────────────────────┐
│ SafeArea Top                         │
├─────────────────────────────────────┤ 44px Header
│ 会话                   [🔍] [+]        │ （无返回，是 L1）
├─────────────────────────────────────┤
│                                      │
│ ▾ 📁 RemoteVibe                      │ 项目折叠（展开）
│     ● 主会话          2分钟前       │   └─ 当前激活
│     · 重构 UI          昨天          │
│     + 新建会话                      │
│                                      │
│ ▸ 📁 my-app                          │ 项目折叠（折叠）
│ ▸ 📁 scratch                         │
│                                      │
│ + 打开新项目                         │
│                                      │
├─────────────────────────────────────┤
│   💬 会话        •••        ⚙️ 设置     │ 56px TabBar
│ SafeArea Bottom                      │
└─────────────────────────────────────┘
```

- **项目 = workDir**（Q3.1=A），如 `/Users/xxx/github/RemoteVibe` 展示为 `RemoteVibe`（取尾段），全路径 tooltip/长按提示。
- **手风琴行为**（Q3.2=A）：项目默认折叠，点项目展开/收起；多个可同时展开；默认展开当前激活会话所在项目。
- **列表项操作**：
  - 单击 → push 进聊天页。
  - 长按/左滑 → 重命名 / 删除 / 复制 workDir 路径。
  - `+ 新建会话`：在该项目下开新会话。
- **`+` 顶栏按钮**：打开 workDir 选择器，选一个新目录 → 创建第一个会话 → 进聊天页。

### 5.3 L2：聊天页（从会话 Tab push）

```
┌──────────────────────────────────────┐
│ SafeArea Top                         │
├─────────────────────────────────────┤ 44px PageHeader
│ [←]  会话名          [📂] [⋯]         │ 左返回→首页
├─────────────────────────────────────┤
│                                      │
│            ChatView                  │ 全屏（无 TabBar）
│                                      │
│                                      │
├─────────────────────────────────────┤
│            InputBar                  │ 56px
├─────────────────────────────────────┤
│          ChatStatusBar               │ 24px 细条
│ SafeArea Bottom                      │
└─────────────────────────────────────┘
```

- **右上角 📂 文件**（Q3.6=A）：点击 push 进 L3 文件树页面；从文件树再点文件 push 进文件查看器。
- **⋯ 菜单**：重命名 / 清除历史 / 重启 Agent / 查看 ACP 日志 / 关闭会话。
- **← 返回**：pop 回会话 Tab 首页，TabBar 重新显示。
- **iOS 边缘手势返回**：同等于点 ←。
- **限制高度**：键盘弹出时用 `visualViewport` API 计算 InputBar bottom，避免遮挡。

### 5.4 L1：设置 Tab 首页

```
┌──────────────────────────────────────┐
│ 设置                                 │ 44px
├─────────────────────────────────────┤
│                                      │
│  🎨 主题              auto   ›      │
│  🧠 模型          gemini-2.x ›      │
│  🖥️ 后端机器       2 台 · localhost › │ ← 多机器入口
│  🔔 通知              开   ›      │
│  ℹ️  关于             v0.1.0 ›      │
│                                      │
├─────────────────────────────────────┤
│   💬 会话        •••        ⚙️ 设置     │ 56px TabBar
└─────────────────────────────────────┘
```

- iOS 风分组设置页，每项 push 进子页，TabBar 在子页隐藏。

### 5.5 L2：后端机器页（多机器 CRUD，Q3.7=A）

```
┌──────────────────────────────────────┐
│ [←]  后端机器              [+]    │ 44px
├─────────────────────────────────────┤
│                                      │
│  • localhost           🟢 已连接 ✓    │ ← 当前激活
│    ws://localhost:8080               │
│                                      │
│  • dev-box             ⚪ 已添加       │
│    ws://10.0.0.5:8080                │
│                                      │
│  + 添加机器                          │
└─────────────────────────────────────┘
```

- **列表项操作**：单击 → 激活该机器；长按/左滑 → 编辑 / 删除。
- **切换机器 = 断开当前 WebSocket → 连接新机器 → 重新拉取会话/Agent 列表**。切换期间显示过渡页。
- **添加机器**：表单填名称 + ws 地址 + 可选 token，测试连接 → 保存。

### 5.6 手机交互总约

- **返回**：PageHeader 左侧 `←` + iOS 边缘手势。
- **TabBar 隐藏**：在任何 L2/L3 页均隐藏，pop 回 L1 自动显示（`transform: translateY(100%)` + `opacity` 淡出）。
- **状态栏颜色**：`<meta theme-color>` 深色时 `#13051b`，浅色时 `#ffffff`，通过 `prefers-color-scheme` 的 media 分开写。
- **SafeArea**：TabBar `padding-bottom: env(safe-area-inset-bottom)`；Header `padding-top: env(safe-area-inset-top)`。
- **键盘**：聚焦 InputBar 时，用 `visualViewport` API 调整底部高度，避免遮挡。
- **Pull-to-refresh**：不加（会和聊天滚动打架）。
- **连接状态**：如后端断线，在聊天页顶部显示红色细条提示，点击跳转设置→后端机器页。

### 5.7 中间档（640–1024px，平板竖屏）

- 采用 PC 结构，Sidebar 默认显示；Right Pane 默认折叠，点开时以底部 sheet 形式打开（iPadOS 风）。

---

## 6. 消息流视觉（双端共用）

### 6.1 用户气泡

- 右对齐，圆角 `--radius-lg`，右下角小圆角 `--radius-xs`（iMessage 感）。
- 背景深色用 `--color-accent-600`（带电子青），浅色用 `--color-brand-100`。
- 最大宽度 `min(88%, 720px)`。

### 6.2 Agent 气泡

- 左对齐，**无气泡背景**（直接渲染 Markdown，ChatGPT 风），减少视觉噪音。
- 发言人头像小圆（32px），带呼吸光晕 when thinking。
- 气泡底下依次：**Thought（折叠）** → **Markdown 内容** → **内联工具调用** → **时间戳（hover 显示）**。

### 6.3 Thought

- 保持现有 `CollapsibleThought` 交互，但视觉改为 **"虚线左边框 + 灰色文本 + 🧠 图标"**，默认折叠。
- 展开动画：`max-height` + `opacity`，`--duration-base`。

### 6.4 工具调用（InlineToolCall）

- 保留上一轮的内联单行设计。
- **新增**：点击工具卡可"钉到右侧 Pane"（PC）或"打开底部 Sheet"（手机），查看完整 diff / terminal。

### 6.5 系统消息

- 居中细条，背景 `surface-1`，图标 + 文字，不超过 80% 宽，不显示时间。

---

## 7. PWA 能力增强

### 7.1 Manifest 升级

```jsonc
{
  "name": "BaoMiHua Agent Gateway",
  "short_name": "BaoMiHua",
  "description": "...",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "display_override": ["window-controls-overlay", "standalone"],  // 新增
  "orientation": "any",
  "background_color": "#13051b",
  "theme_color": "#13051b",
  "categories": ["developer", "productivity"],
  "prefer_related_applications": false,
  "icons": [
    // 新增：192 / 512 PNG any + maskable
    { "src": "/icons/icon-192.png",  "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "/icons/icon-512.png",  "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "/icons/maskable-192.png", "sizes": "192x192", "type": "image/png", "purpose": "maskable" },
    { "src": "/icons/maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" },
    { "src": "/favicon.svg", "sizes": "any", "type": "image/svg+xml", "purpose": "any" }
  ],
  "shortcuts": [                                               // 新增：长按图标的快捷入口
    { "name": "New Session", "url": "/?action=new", "icons": [...] },
    { "name": "Sessions",    "url": "/?view=sessions" }
  ],
  "screenshots": [                                             // 新增：商店展示图
    { "src": "/screenshots/phone-chat.png", "sizes": "1080x1920", "form_factor": "narrow" },
    { "src": "/screenshots/desktop.png",   "sizes": "1920x1080", "form_factor": "wide" }
  ]
}
```

### 7.2 Service Worker 升级

三个策略分层：

| 资源类型 | 策略 | 备注 |
|---|---|---|
| `index.html` | **network-first**，3s 超时降级到 cache | 确保拿到新版 |
| `/assets/*.js`, `*.css`（带 hash） | **cache-first，永久** | Vite hash 保证新文件新 URL |
| `/api/*`, `/ws` | **不缓存** | 跳过 SW |
| 字体、图标 | **stale-while-revalidate** | 后台更新 |
| 离线 fallback | `/offline.html` | 任何页面失败时兜底 |

并新增：
- `self.skipWaiting()` + `clients.claim()` 即时激活
- 版本号管理：`CACHE_NAME = 'baomihua-v${BUILD_ID}'`，旧版本自动清理
- `message` 事件监听：前端可发 `SKIP_WAITING` 强制升级

### 7.3 更新提示 UI

- 检测到新 SW `waiting` 时，显示 toast：「发现新版本，点击更新」
- 用户点击后 postMessage `SKIP_WAITING` → 刷新。

### 7.4 安装提示

- 监听 `beforeinstallprompt`，存住事件；
- 用户进入 3 次后、或在设置页里，显示"安装到主屏"按钮；
- 已安装 (`display-mode: standalone`) 时隐藏按钮。

### 7.5 离线页

新增 `public/offline.html`，极简静态页：
- Logo + "离线中" + "已有的会话在本地可查看" + 按钮回首页
- 样式内联，不依赖任何外部资源。

---

## 8. 改动文件清单（估算）

> **重要**：每一项都是后续实施用的 checklist，本文档阶段**不动**。

### 8.1 新增文件

**资源类**
| 文件 | 作用 |
|---|---|
| `web/public/icons/icon-{192,512}.png` | 标准图标 |
| `web/public/icons/maskable-{192,512}.png` | 自适应图标 |
| `web/public/offline.html` | 离线兜底页 |
| `web/public/fonts/*.woff2` | 本地字体（Inter + JetBrains Mono 子集） |
| `web/public/screenshots/*.png` | PWA store 展示图 |

**设计系统 & Hooks**
| 文件 | 作用 |
|---|---|
| `web/src/design/tokens.css` | spacing/elevation/motion/z-index tokens |
| `web/src/design/themes.css` | light/dark 主题变量 |
| `web/src/hooks/useTheme.ts` | 主题切换 + 持久化（auto/light/dark） |
| `web/src/hooks/useBreakpoint.ts` | 响应式断点（替代 `isMobile` 硬编码） |
| `web/src/hooks/useInstallPrompt.ts` | PWA 安装提示 |
| `web/src/hooks/useSwUpdate.ts` | SW 版本更新通知 |
| `web/src/hooks/useShortcuts.ts` | 全局键盘快捷键注册中心 |

**双端共用组件（信息架构同构的关键）**
| 文件 | 作用 |
|---|---|
| `web/src/components/Sessions/ProjectAccordion.tsx` | 项目手风琴（Q3.2=A）：workDir 分组 + 会话列表，双端共用 |
| `web/src/components/Sessions/ProjectGroup.tsx` | 单个项目折叠组 |
| `web/src/components/Sessions/SessionItem.tsx` | 单个会话条目（含激活标记、时间、操作菜单） |
| `web/src/components/Sessions/NewSessionButton.tsx` | 新建会话入口（含 workDir 选择器） |
| `web/src/components/Settings/SettingsRoot.tsx` | 设置路由器，双端共用 |
| `web/src/components/Settings/Pages/ThemeSettings.tsx` | 主题设置页 |
| `web/src/components/Settings/Pages/ModelSettings.tsx` | 模型设置页 |
| `web/src/components/Settings/Pages/BackendManagement.tsx` | **多机器 CRUD**（Q3.7=A） |
| `web/src/components/Settings/Pages/AboutPage.tsx` | 关于页 |

**桌面专用壳**
| 文件 | 作用 |
|---|---|
| `web/src/components/Layout/DesktopShell.tsx` | 桌面整体壳（ActivityBar + Sidebar + Main + RightPane） |
| `web/src/components/Layout/DesktopSidebar.tsx` | 桌面常驻 Sidebar（承载项目手风琴/设置导航） |
| `web/src/components/Layout/RightPane.tsx` | 右侧文件/工具详情面板（Q3.6=A） |

**手机专用壳**
| 文件 | 作用 |
|---|---|
| `web/src/components/Layout/MobileShell.tsx` | 手机页面栈壳（管理 L1/L2 路由栈） |
| `web/src/components/Layout/MobileTabBar.tsx` | 底部 2 Tab（会话/设置，Q3=双 Tab） |
| `web/src/components/Layout/MobilePageHeader.tsx` | 手机顶部 header（含返回/文件按钮） |
| `web/src/components/Layout/MobilePage.tsx` | 手机二级页容器（push/pop 动画） |

**其他**
| 文件 | 作用 |
|---|---|
| `web/src/components/CommandPalette/*.tsx` | Cmd+K 命令面板（Q4=A） |
| `web/src/components/Toast/*.tsx` | 全局 toast（版本更新/错误/安装提示） |
| `web/src/stores/uiStore.ts` | UI 状态（当前 Tab、Sidebar 折叠、RightPane 打开、当前设置页等） |

### 8.2 改动文件

| 文件 | 改动说明 |
|---|---|
| `web/index.html` | 浅/深 theme-color 分 media 写、预加载本地字体、去 Google Fonts CDN |
| `web/public/manifest.json` | 升级到 v2（见 §7.1），加 shortcuts（新建会话、设置） |
| `web/public/sw.js` | 全部重写（见 §7.2） |
| `web/src/index.css` | 改为 import `design/tokens.css` + `design/themes.css`；`color-scheme: light dark` |
| `web/src/App.tsx` | 移除 inline 布局，改用 `<DesktopShell>` / `<MobileShell>`；通过 `useBreakpoint` 二选一 |
| `web/src/components/Layout/ActivityBar.tsx` | 精简到仅 2 个图标（会话/设置）；底部加后端连接状态灯 |
| `web/src/components/Layout/TopBar.tsx` | 桌面版移除；手机版 header 逻辑迁移到 `MobilePageHeader`；Launch/Stop 业务逻辑抽出成 hook（`useAgentLifecycle`） |
| `web/src/components/SessionPickerModal.tsx` | 业务逻辑迁移到 `ProjectAccordion`，组件本身删除（P4 完成后） |
| `web/src/components/Settings/BackendSettingsModal.tsx` | 重构为 `BackendManagement` 页面（非 Modal） |
| `web/src/stores/chatStore.ts` | 新增 `projects` 维度（按 workDir 分组会话）的 selector；焦点方法改名为以项目为中心的 API |
| `web/src/stores/backendStore.ts` | 新增多机器 CRUD（新增 `machines: Machine[]`、`activeMachineId`、`addMachine/updateMachine/removeMachine/switchMachine`）；切机器时触发 WebSocket 断连重连 |
| `web/src/components/ChatView/*` | 仅调色 + token 替换，不改结构 |
| `web/src/components/Cards/*` | 同上 |

### 8.3 删除文件（方案阶段先不删，实施时评估）

- `web/src/components/SessionPickerModal.tsx` —— 功能被 `ProjectAccordion` 完全替代后删除
- `web/src/components/WorkspacePickerModal.tsx` —— 如被 `NewSessionButton` 夹带的 workDir 选择器完全替代则删除
- `web/src/components/FolderPickerModal.tsx` —— 同上评估

为降低风险，拆 5 个独立可交付的 PR。每个 PR 都能单独上线、单独回滚。

| 阶段 | 内容 | 工作量 | 风险 |
|---|---|---|---|
| **P1 · 设计系统** | tokens.css + themes.css + 浅色主题 + useTheme | S | 🟢 低 |
| **P2 · PWA 基础** | 图标多尺寸 + manifest 升级 + SW 重写 + offline.html + 安装/更新提示 | M | 🟡 中（SW 要灰度） |
| **P3 · 桌面重构** | DesktopShell + Sidebar + RightPane + CommandPalette | L | 🟡 中 |
| **P4 · 手机重构** | MobileShell + MobileTabBar + MobilePageHeader + Tab 页面 | L | 🟡 中 |
| **P5 · 打磨** | 动画、键盘适配、字体本地化、screenshots | S | 🟢 低 |

**每个阶段的验收标准：**
- P1：切换主题无报错，所有现有页面视觉保持一致，`tsc --noEmit` + `vitest` 全过。
- P2：Chrome DevTools → Application → Manifest 全绿；Lighthouse PWA 评分 ≥ 90；断网可看离线页。
- P3：PC 三栏可拖、可折叠；`Cmd+K` 命令面板可用；所有原有功能可达。
- P4：手机真机（iPhone Safari、Android Chrome）验证 SafeArea、键盘、TabBar、Tab 切换流畅。
- P5：Lighthouse Performance ≥ 90，首屏 ≤ 2s（4G），字体无 FOUT。

---

## 10. 风险与回滚

| 风险 | 缓解 |
|---|---|
| SW 升级把老用户卡在旧版本 | 新 SW 带 `clients.claim()` + 前端检测 `waiting` worker 提示刷新；保留 `?nosw` URL 参数能绕过 SW |
| 手机 TabBar 和 iOS 手势冲突 | TabBar 不用滑动手势，纯点击；Header 返回也只点击 |
| Allotment 和新 Sidebar 嵌套 | Sidebar 不放进 Allotment，作为独立 flex 子元素；Allotment 只管主工作区 |
| 浅色主题对比度不够 | 每个 token 配对 `WCAG AA`（正文 4.5:1，大字 3:1）的对比度验证 |
| 本地字体体积大 | 使用 `unicode-range` 按需子集（英文 + 常用中文 3500 字），每文件 < 200KB |
| 重构期间业务改动冲突 | 每阶段独立 PR，PR 提交前 rebase；业务代码路径尽量不动，只动 Layout/设计层 |

---

## 11. 拍板记录（已定稿）

### 11.1 顶层决策（Q1–Q7）

| 编号 | 问题 | 决策 |
|---|---|---|
| Q1 | 图标风格 | **A** 沿用现有深紫+电子青色调做多尺寸 PNG |
| Q2 | PC 端可拖分割 | **A** 保留 `allotment`，默认折叠 |
| Q3 | 手机端 TabBar | **双 Tab**（会话 / 设置，替代原 4 Tab 方案） |
| Q4 | 命令面板 | **A** P3 同步做（`Cmd+K`） |
| Q5 | 主题默认 | **A** 跟随系统 `auto` |
| Q6 | 字体本地化 | **A** 本地化 Inter + JetBrains Mono |
| Q7 | 离线聊天可读 | **A** SW 缓存最后 N 条会话只读视图 |

### 11.2 信息架构决策（Q3.1–Q3.7）

| 编号 | 问题 | 决策 |
|---|---|---|
| Q3.1 | 「项目」的语义 | **A** 项目 = workDir（工作目录路径） |
| Q3.2 | 会话 Tab 展示 | **A** 手风琴（项目默认折叠，点开展开会话列表） |
| Q3.3 | 进聊天后 TabBar | **A** 隐藏（iOS push 标准） |
| Q3.4 | PC 适配方案 | **PC-1** Sidebar 承载项目手风琴（双端同构） |
| Q3.5 | PC 点会话行为 | **A** 主区直接切换，无"返回首页"概念 |
| Q3.6 | 文件浏览位置 | **A** 聊天页右上角按钮 → 右侧 Pane（PC）/ push 全屏页（手机） |
| Q3.7 | 多机器管理粒度 | **A** 仅 CRUD + 激活当前机器（连接状态/延迟等放后续迭代） |

### 11.3 待实施

按 **P1 → P5** 逐阶段推进，第一个 PR（P1 设计系统）只含 tokens + 浅色主题 + theme hook，不改任何现有布局，验收通过后再进入 P2。

---

## 附：参考视觉对标

| 领域 | 参考 |
|---|---|
| 桌面三栏 | Linear / Cursor / VS Code |
| 命令面板 | Raycast / Linear Cmd+K |
| 手机 Chat | ChatGPT iOS / Claude iOS |
| 手机 TabBar | iOS HIG / 微信读书 |
| 设计 token | Radix UI / Vercel Geist |
| PWA 体验 | Twitter PWA / Starbucks PWA |

