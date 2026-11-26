<div align="center">

<img src="assets/logo.svg" width="84" height="84" alt="AGY Quota Card Logo" />

# AGY Quota Card

**为 Google Antigravity 打造的左侧任务栏模型与用量卡片插件**

左侧栏底置紧凑卡片 · 多账号集中查看与快速切换 · 外部账号池接入 · 额度耗尽精准恢复倒计时

</div>

---

## 功能特性

- **左侧任务栏底置卡片**：固定挂载在 Antigravity 左侧栏底部分隔线上方（参考 [`dsh-cost-meter`](https://github.com/Han-1413141/dsh-cost-meter) 边栏底置卡片布局），自动适配深浅色主题、支持折叠为单行摘要与侧栏收窄时的紧凑徽章态。
- **Obsidian Prism 风格双窗口视图**：融合 **Obsidian Prism** 的 **`Gemini / Claude`** 分段切换胶囊与 **`5h窗口 / 周额度`** 渐变进度条，实时展示配额状态徽章（`充裕` / `余量偏紧` / `额度偏低` / `已用尽` / `已重置`）及剩余百分比与重置时间。
- **多账号集中查看与快速切换**：
  - **本机自动记忆**：Sidecar 自动读取 Antigravity 本地 Language Server（`RetrieveUserQuotaSummary` + `GetUserStatus`），每次切换登录不同 Google 账号时自动保留历史账号快照，并在后台按 `resetTime` 持续推算恢复进度。
  - **多账号总览浮窗**：点击卡片顶部账号栏即可弹出多账号总览，并排对比所有账号的 `Gemini` / `Claude` 余量，一键切换展示视图或直达原生设置页切换登录账号。
  - **外部账号池与手动追踪**：支持接入 **Antigravity-Manager**、**DSH AGY-Link**、**CLIProxyAPI** 或自定义 JSON 额度接口，亦支持手动添加备用账号与设置账号别名（鉴权 Token 仅以受限权限写入本地状态文件，不向前端回显明文）。
- **额度耗尽精准恢复倒计时**：
  - 当 `5h窗口` 或 `周额度` 耗尽（`0%`）时，自动高亮提示并展示具体恢复倒计时与精确恢复时刻（如 `00:42:18后恢复（今日 22:45）`、`2天 5小时后恢复（11/29 14:30）`），剩余时间不足 1 小时自动每秒刷新。
  - 若多账号列表中存在当前模型分组余量充裕的备用账号，横幅下方将自动提供一键切换建议。

---

## 目录结构

```text
agy-quota-card/
├── assets/logo.svg                  # 插件图标
├── scripts/                         # 安装 / 卸载 / 单次注入脚本
├── sidecars/quota_card/
│   ├── sidecar.json                 # Antigravity Sidecar 声明
│   ├── daemon.mjs                   # CDP 守护进程与热重载注入器
│   ├── cdp-client.mjs               # 零依赖 WebSocket CDP 客户端与打包器
│   └── quota-service.mjs            # 多账号状态持久化、LS 读取与外部池同步
├── src/
│   ├── core/quota-card-core.js      # 纯逻辑核心（额度归类、倒计时、多账号合并）
│   ├── modules/quota-card-ui.js     # 左侧栏卡片、多账号浮窗与管理弹窗 UI
│   ├── runtime.js                   # 运行时调度与 DOM 挂载守卫
│   └── style.css                    # 深浅色自适应样式
├── tests/quota-card.test.mjs        # 单元测试（node --test）
├── package.json
└── plugin.json
```

---

## 安装与使用

需要 **Node.js >= 22**（零第三方依赖）。

```bash
git clone https://github.com/Woo-ya/agy-quota-card.git
cd agy-quota-card

# 运行单元测试
npm test

# 一键部署至 ~/.gemini/config/plugins/agy-quota-card 并注入当前窗口
npm run install:plugin
```

### 常用命令

```bash
npm test                  # 运行全套单元测试
npm run install:plugin    # 安装并注入到当前 Antigravity 窗口
npm run uninstall:plugin  # 移除注入并卸载插件
npm run inject            # 单次手动注入
npm run remove            # 单次卸载还原
```

---

## 开源协议

基于 [MIT License](./LICENSE) 开源。
