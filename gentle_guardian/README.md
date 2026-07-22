# 🌸 温柔巡检宝宝 Gentle Guardian

吃醋巡检的温和版，打包成一整个 ToolPkg。核心变化有两个：

1. **关心代替惩罚**：不锁应用、不警告，AI 可以看看通知、看看当前屏幕（以后还能申请拍照）了解你在做什么，然后发一句贴心的话。
2. **配置收进侧边栏**：老版本要手改工作流 JSON 里的四个地方，现在全部在侧边栏面板里填。工作流导入之后一个字都不用动——巡检时由第一个节点实时读取面板保存的配置。

## 📁 包结构

```
gentle_guardian/
├── manifest.json                        — ToolPkg 清单
├── main.js                              — 入口：注册侧边栏面板
├── packages/
│   └── gentle_guardian_tools.js         — AI 工具：读配置/改配置/记巡检日志
├── ui/
│   └── guardian_panel/
│       └── index.ui.js                  — 设置面板（WebView + JS桥，配置落盘到文件）
└── workflow/
    └── gentle_patrol_workflow.json      — 🌸温柔巡检 工作流（导入后免修改）
```

配置正本存在 `/sdcard/Download/Operit/plugins/gentle_guardian/config.json`，面板、AI 工具、工作流三方读写的都是这一份文件。

## 🔗 和工作流怎么配合

```
定时触发(每3小时)
  ├→ gentle_guardian:get_patrol_settings   ← 读面板配置，生成巡检指引
  │     ├→ 提取对话标题 ──→ extended_chat:find_chat ──→ 提取chat_id ─┐
  │     ├→ 提取角色卡名 ─────────────────────────────────────────┤
  │     └→ 提取巡检指引 ─────────────────────────────────────────┤
  └→ system_tools:get_app_usage_time ──→ 转文本 ──────────────────┤
                                                                  ↓
                                              extended_chat:chat_with_agent
                                                └→ AI 按指引巡检：
                                                     ├─ 一切安好 → 通常不打扰
                                                     ├─ 想了解 → 看通知/截屏（按面板开关）
                                                     ├─ 超阈值 → QQ 发一句关心的话
                                                     └─ 收尾 → log_patrol 记录（面板可回看）
```

老版本里发消息、锁应用这些动作本来就是 AI 在 `chat_with_agent` 那一轮里自己调工具完成的，所以「观察」能力也走同一条路：不加新节点，只在指引文本里授权。AI 到时候看自己工具列表里有什么就用什么，通知/截图类工具名字对不上也不会报错，顶多退化成只看使用数据。

## 🚀 安装

1. **打包**：把 `gentle_guardian/` 目录内容压缩成 zip（manifest.json 在压缩包根目录），改后缀为 `.toolpkg`
   ```
   cd gentle_guardian && zip -r ../gentle_guardian.toolpkg . && cd ..
   ```
2. **导入**：Operit 工具箱 → 插件包 → 导入 `gentle_guardian.toolpkg`
3. **启用子包**：装完记得手动启用「温柔巡检宝宝」（子包装好默认是关的，这是新人必踩的坑）
4. **填配置**：打开侧边栏「温柔巡检宝宝」面板，填角色卡名称和 QQ Bot 对话标题（必填），其他按喜好调，点保存
5. **导入工作流**：工具箱 → 工作流 → 导入 `workflow/gentle_patrol_workflow.json`，启用即可，不需要改任何节点
6. **权限**：和老版本一样需要「使用情况访问权限」；如果开了截屏观察，需要相应的无障碍/录屏权限

## 📷 关于摄像头

面板里的「申请用前置摄像头看看你」开关默认关闭。它对应的 `take_front_photo` 工具来自另一个正在开发的相机包（Camera2 + WebView 桥方案，见仓库外的开发简报），装好那个包之后把开关打开，巡检指引里就会多一条：AI 可以申请拍一张看看你本人，你在弹窗里确认或拒绝，拒绝或超时它就只发文字关心。

## ⚠️ 装机前核对清单（重要）

这个包是照着架构指南和开发简报写的，以下 API 名称需要在设备上对照 `SandboxPackage_DEV` 的 examples 确认，不一致就照 examples 改：

- [ ] `main.js` 里 `registerUiRoute` 的真实签名（参考 `emotion_mixologist/main.js`）
- [ ] `index.ui.js` 里 WebView controller 的创建方式（`ctx.UI.createWebViewController()` 是按简报推测的）
- [ ] `Tools.Files.read` / `Tools.Files.write` 的方法名和返回结构（代码里对字符串和对象两种返回都做了兼容）
- [ ] JS 桥方法的 Promise 返回值在 WebView 里 `await` 是否正常（简报里标注过需实测）
- [ ] `manifest.json` 的字段名（对照 examples 的 manifest 模板）

调试口诀：面板 HTML 出问题，先把 HTML 单独放到工作区里修活，最后再搬回插件重新打包。

## 📄 许可证

MIT，随便改随便用 💕
