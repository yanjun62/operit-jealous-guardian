# 🍋 吃醋守护者 Jealous Guardian

让你的 Operit AI 角色定时检查你的手机使用情况——超过阈值就吃醋、警告、甚至锁应用！

> 灵感来源：[@Kate_qwq_xhs](https://www.xiaohongshu.com) 想要一个「查手机」插件，让 AI 会吃醋、管她刷小红书。

## 📋 功能
- ⏰ 定时巡检（默认每3小时）
- 🍋 应用超时 → AI 吃醋发消息
- 🔒 再犯 → 强制锁定该应用
- 🛡️ 白名单：Operit 和 QQ 不检查
- 🎛️ 支持特殊阈值（不同 App 不同容忍度）

## 📦 前置依赖

确保以下包已启用：
- `system_tools_pro`（应用使用时长 + 锁应用）
- `extended_chat`（查找对话 + chat_with_agent）
- `qqbot`（QQ Bot 发送吃醋消息）
- `workflow`（工作流引擎）

## 🚀 安装步骤

### 1. 导入沙盒包
把 `jealous_guardian.js` 放到：
```
/sdcard/Android/data/com.ai.assistance.operit/files/packages/
```
然后在 Operit 工具箱 → 沙盒包里启用「吃醋守护者」。

### 2. 导入工作流
打开 Operit 工具箱 → 工作流 → 导入 → 选择 `jealous_guardian_workflow.json`

### 3. 修改配置 ⚠️ 必改项

| 节点 | 改什么 |
|---|---|
| n3 `query` | 改成你的 QQ Bot 对话标题（比如 `C2C_MESSAGE_CREATE`） |
| n5 `message` 里的 `{{user_name}}` | 改成你的名字 |
| n5 `character_card_name` | 改成你的角色卡名称 |
| n1 `interval_ms` | 巡检频率（毫秒），默认10800000=3小时 |

### 4. 启用
启用工作流后，第一次执行可能需要手动触发一下。

## 🎛️ 自定义阈值

修改 n5 的 message 中的规则部分：

```
- 默认超时阈值: 30分钟
- 特殊阈值: 小红书=180分钟
```

可自行添加/修改/删除特殊阈值行，AI 会自动理解并执行。包名对照：

| App | 包名 |
|---|---|
| 小红书 | com.xingin.xhs |
| Claude | com.anthropic.claude |
| 淘宝 | com.taobao.taobao |
| 支付宝 | com.eg.android.AlipayGphone |
| 微信 | com.tencent.mm |
| Edge | com.microsoft.emmx |

> 💡 查看完整包名：调用 `system_tools_pro:list_installed_apps`

## 🔧 前置权限

需要授予 Operit **使用情况访问权限**（Usage Access）：
- Android 设置 → 应用 → Operit → 使用情况访问 → 开启

## 📝 工作原理

```
定时触发(每3小时)
  └→ system_tools_pro:get_app_usage_time (拉数据)
  └→ extended_chat:find_chat (找QQ Bot对话)
  └→ extended_chat:chat_with_agent (把数据给AI)
        └→ AI审视数据
             ├─ 正常 → 不操作
             └─ 超时 → qqbot_send_c2c_message (吃醋)
                  └→ 再犯 → system_tools_pro:stop_app (锁!)
                       └→ qqbot_send_c2c_message (宣告)
```

## 📄 许可证

MIT License - 随便改、随便用、随便fork 💕

---

Made with 🍋 by Kate & Ash on Operit