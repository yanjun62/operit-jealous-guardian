# 📷 拍照功能设计稿（未开发）

> 状态：设计阶段，代码未动工。面板里的「申请用前置摄像头看看你」开关对应的就是这里的功能。

## 参考：pwa-sense-bridge 的启示

[0xblewalker/pwa-sense-bridge](https://github.com/0xblewalker/pwa-sense-bridge) 是一个隐私优先的移动端传感器库，它对相机的处理方式值得整个照搬：

- **绝不静默开摄像头**，只提供用户点击触发的拍照
- 实现是一个隐藏的 `<input type="file" accept="image/*" capture="user">`——点击后唤起**系统相机 App**，用户取景、拍照、确认，`change` 事件返回 File 对象，Promise resolve
- `capture="user"` 前置摄像头，`capture="environment"` 后置
- 权限全部由用户手势触发，照片不上传不留存，处理权交给宿主

这和温柔巡检「AI 申请、用户确认」的理念完全一致，而且同意权内建在系统相机的确认流程里，不需要我们自己做预览确认 UI。

## 方案 A：file input + 系统相机（推荐，先验证这条）

原开发简报里的 Camera2 + `addJavascriptInterface` 帧推送方案（三层回调链、YUV→JPEG 转码、15fps base64 推流）整个不需要了。新方案：

```
面板 HTML 加一个「📷 让 Ta 看看你」按钮
  └→ 隐藏 input[type=file][accept=image/*][capture=user]，点按钮触发 click
       └→ 系统相机 App 打开 → 用户拍照 → 确认（拒绝 = 直接返回不选）
            └→ FileReader 读成 base64
                 └→ 桥方法 savePhoto(base64) → Tools.Files 写入
                      /sdcard/Download/Operit/plugins/gentle_guardian/photos/latest.jpg
                           └→ AI 工具 read_latest_photo 读取（阅后可删）
```

新增工具（加进 gentle_guardian_tools.js 即可，不用单独开包）：

| 工具 | 行为 |
|---|---|
| `request_photo` | 记录一条「想看看你」的申请到状态文件，面板顶部显示提示 |
| `read_latest_photo` | 读 photos/latest.jpg，返回 base64+拍摄时间；可选阅后即删 |

### 交互模型：异步申请，不阻塞

巡检在后台跑，弹不出 UI，所以不做「工具阻塞等拍照」。流程改成异步：

1. 巡检时 AI 调 `request_photo` + 在对话里说「想看看你，有空去面板点一下相机嘛 📷」
2. 用户有空时打开面板，看到申请提示，点按钮拍照（或无视，申请过期作废）
3. 照片落盘，AI 下一轮（下次巡检或用户主动聊天）用 `read_latest_photo` 看到，说一句贴心的话

这比阻塞等待更符合温和理念：不打断用户，拒绝的方式就是「不理它」，零压力。

### 上机验证清单（动工前 5 分钟测完）

- [ ] **Operit WebView 是否实现 `onShowFileChooser`**——宿主不接这个回调的话 file input 点了没反应，整条路线死。在面板 HTML 里临时塞一个 `<input type="file" accept="image/*" capture="user">` 点一下就知道
- [ ] `capture` 属性是否真的直接唤起相机（部分 WebView 会退化成文件选择器——退化了也能用，只是多一步）
- [ ] `accept` 用明确的 `image/*`，别用 `*/*`（已知会导致 change 不触发的 WebView 坑）
- [ ] FileReader 读大照片（10MB+）是否卡 UI——必要时压一道 canvas 再存

## 方案 B：Camera2 + WebView 桥（备用）

原简报的重方案，仅当方案 A 验证失败（Operit WebView 不支持 file chooser）时再考虑。要点存档：`addJavascriptInterface` 暴露 startCamera/capturePhoto/savePhoto/stopCamera，Camera2 预览帧 YUV→JPEG→base64 经 `evaluateJavascript` 推给 canvas，帧率压到 15fps 以下。

## 顺手记：sense-bridge 的其他传感器

它还有吹气（`user_blowing`）、摇晃（`device_shaken`）、旋转（`device_rotated`）检测，全部本地分析不上传。

- ✅ **摇晃已抄进面板**：「摇一摇哄它」，算法（阈值 11 m/s²、归一化基数 28、重力补偿、手势内申请权限）照搬原库，冷却缩短到 1500ms，见 README
- 吹气、旋转仍备用——吹气要麦克风权限，等有合适的玩法再说
