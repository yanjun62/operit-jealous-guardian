# 🌸 温柔巡检宝宝 Gentle Guardian

吃醋巡检的温和版，打包成一整个 ToolPkg。三个核心：

1. **动态吃醋状态机**：不是一次性的阈值报警。超时应用会累加吃醋值（权重可配，"情敌"应用加得更快），醋值分档决定 AI 的语气和行为；聊天里哄它会消气，时间也会慢慢治愈。
2. **关心代替惩罚**：AI 可以看看通知、截一张当前屏幕（以后还能申请拍照）了解你在做什么，然后在对话里说句贴心的话。醋意大了会把应用"藏起来"而不是粗暴锁死。
3. **配置收进侧边栏**：全部设置在面板里填，工作流导入之后一个字都不用动。

> v0.2 起所有 API 均为设备实测版本（Operit 真机跑通）。

## 🍋 吃醋状态机

```
巡检发现超时 → add_jealousy(app, 超出分钟数)
                └ 醋值 += ceil(分钟/10) × 每10分钟点数 × 应用权重（单次封顶30）

醋值分档（默认，可在面板改）：
   0-30   温柔档    正常温柔提醒
  30-60   小委屈档  话里带点委屈，还是关心为主
  60-90   不高兴档  把超时应用藏起来 + 发"我不高兴了"
  90+     要哄档    应用藏着，需要你主动来哄

消气的路：
  · 聊天里撒娇/认错/哄它 → AI 调 reduce_jealousy（单次上限可配，被哄要有过程）
  · 时间自然消退（默认每小时 -1，可配）
  · 醋值降回藏应用档以下 → 藏起来的应用立刻全部放出来
  · 面板「紧急解除」按钮 → 放出全部应用 + 醋值清零、档位归 calm
```

**藏应用的实现**是 `pm disable-user --user 0 <包名>`：应用图标从桌面消失、点不开，`pm enable` 即恢复。这需要 shell 权限（Shizuku 或 ADB）。白名单应用永远不会被藏，Operit 和 QQ 更是硬编码保护——藏了联系通道就没人能哄它了。

**桌面图标刷新**：`pm enable` 之后会对放出的应用补一道 `pm install-existing`，再把常见桌面进程（MIUI/原生/三星/华为/荣耀/OPPO/vivo/一加）`am force-stop` 一遍强制重建图标缓存。⚠️ MIUI 上即便如此图标仍可能不恢复（系统限制）——应用本身已经能搜索到、能打开，只是桌面图标可能要手动加回来。

**逃生通道**：`pm disable-user` 是持久生效的，所以面板上有「🆘 紧急解除全部隐藏」按钮，AI 联系不上时你自己也能把应用放出来（同时醋值清零）。最坏情况连 Operit 都出问题了，用电脑执行 `adb shell pm enable --user 0 <包名>` 一定能恢复。

## 📁 包结构

```
gentle_guardian/
├── manifest.json                        — ToolPkg 清单（schema_version/toolpkg_id/subpackages）
├── main.js                              — 入口：registerUiRoute + registerNavigationEntry
├── packages/
│   └── gentle_guardian_tools.js         — AI 工具（见下表）
├── ui/
│   └── guardian_panel/
│       └── index.ui.js                  — 面板：醋值仪表 + 变动记录 + 全部设置 + 巡检日志
└── workflow/
    └── gentle_patrol_workflow.json      — 🌸温柔巡检 工作流（导入后免修改，含手动触发节点）
```

| 工具 | 谁在什么时候调 |
|---|---|
| `get_patrol_settings` | 工作流第一个节点：读配置+当前醋值，生成巡检指引 |
| `add_jealousy` | 巡检中 AI 对每个超时应用调一次；到档自动藏应用 |
| `reduce_jealousy` | 平时聊天中 AI 被哄了就调；降档自动放应用 |
| `get_jealousy_state` | AI 随时查自己心情；也会顺手结算消退、放该放的应用 |
| `save_patrol_settings` | 聊天里让 AI 改配置（"小红书阈值改成两小时"） |
| `log_patrol` | 巡检收尾记一笔，面板可回看 |

数据都在 `/sdcard/Download/Operit/plugins/gentle_guardian/`：`config.json`（配置正本）、`jealousy_state.json`（醋值/藏的应用/变动历史）、`patrol_log.json`（巡检日志）。面板、AI 工具、工作流三方读写的是同一份文件。

## 🔗 和工作流怎么配合

```
定时触发(每3小时) / 手动触发
  ├→ gentle_guardian:get_patrol_settings   ← 读配置+醋值，生成巡检指引
  │     ├→ 提取对话标题 ──→ extended_chat:find_chat ──→ 提取chat_id ─┐
  │     ├→ 提取角色卡名 ─────────────────────────────────────────┤
  │     └→ 提取巡检指引 ──┐                                       │
  └→ get_app_usage_time ─┴→ CONCAT拼接完整消息 ──────────────────┤
                                                                  ↓
                                              extended_chat:chat_with_agent
                                                └→ AI 按指引巡检：
                                                     ├─ 超时 → add_jealousy（到档自动藏应用）
                                                     ├─ 想了解 → get_notifications / take_screenshot
                                                     ├─ 按醋值档位在对话里回复（温柔/委屈/不高兴/求哄）
                                                     └─ 收尾 → log_patrol
```

两个引擎层面的备忘：

- **StaticValue 里的 `{{n2a}}` 这类模板不会被工作流引擎替换**——AI 收到的是原始字符串。所以消息必须用 CONCAT 模式的提取节点（`n_msg`）手动拼接，本工作流已经这样做了。改消息文案时改 `n_msg` 的 `others` 数组，别回去用 `{{}}`。
- 消气不走工作流：你平时跟角色聊天，它检测到你在哄它就调 `reduce_jealousy`——靠工具描述本身教会 AI 什么时候用。

## 🚀 安装

1. **打包**：把 `gentle_guardian/` 目录内容压缩成 zip（manifest.json 在压缩包根目录），改后缀为 `.toolpkg`
   ```
   cd gentle_guardian && zip -r ../gentle_guardian.toolpkg . && cd ..
   ```
2. **导入**：Operit 工具箱 → 插件包 → 导入 `gentle_guardian.toolpkg`
3. **启用子包**：装完记得手动启用「温柔巡检」子包（默认关闭是常见的坑）
4. **填配置**：打开侧边栏「🌸 巡检宝宝」面板，填角色卡名称和巡检对话标题（必填，巡检消息将发送到这个 Operit 对话），吃醋机制按喜好调，点保存
5. **导入工作流**：工具箱 → 工作流 → 导入 `workflow/gentle_patrol_workflow.json`，启用即可；想立刻试一次就点「手动触发」节点
6. **权限**：「使用情况访问权限」照旧；藏应用需要 Shizuku/ADB 级 shell；开了截屏观察需要相应权限

## 📷 关于摄像头

面板里的「申请用前置摄像头看看你」开关默认关闭，对应功能还没开发。设计稿见 [CAMERA_PLAN.md](CAMERA_PLAN.md)——参考 pwa-sense-bridge 的思路，用 `input[type=file][capture=user]` 唤起系统相机（用户拍照确认即同意，拒绝就是不拍），代替原先的 Camera2 桥重方案；巡检时 AI 异步申请，不阻塞不打扰。

通知和截屏观察用的是 Operit 自带工具，实测可用：`system_tools:get_notifications`、`daily_life:take_screenshot`。

## ⚠️ 已知限制

- MIUI 桌面图标在 unhide 后可能不自动恢复（见上文「桌面图标刷新」）
- `pm disable-user` 需要 Shizuku/ADB shell；没有 shell 能力时藏应用会明确失败并告诉 AI 改用语气表达，状态不会记乱
- 面板 HTML 调试口诀：先把 HTML 单独放到工作区里修活，最后再搬回插件重新打包

## 📄 许可证

MIT，随便改随便用 💕
