/*
 * 温柔巡检宝宝 — 侧边栏设置面板
 *
 * 路线：「HTML 承重、DSL 薄桥」。这个文件只做三件事：
 *   1. 创建 WebView 加载内嵌的设置页 HTML
 *   2. 注入 Guardian 桥（loadConfig / saveConfig / loadLog），内部走 Tools.Files
 *   3. 别的什么都不干
 *
 * ⚠️ 装机前对照 SandboxPackage_DEV 的 examples/emotion_mixologist/ui/ 核对：
 *   - WebView controller 的创建方式（下面按开发简报写的）
 *   - Tools.Files.read/write 的真实方法名与返回结构
 *
 * 路径必须与 packages/gentle_guardian_tools.js 里的常量保持一致！
 */

var BASE_DIR = "/sdcard/Download/Operit/plugins/gentle_guardian/";
var CONFIG_PATH = BASE_DIR + "config.json";
var LOG_PATH = BASE_DIR + "patrol_log.json";

async function readFileSafe(path) {
    try {
        var raw = await Tools.Files.read(path);
        return typeof raw === "string" ? raw : (raw && (raw.content || (raw.data && raw.data.content))) || "";
    } catch (e) {
        return "";
    }
}

var panelController = ctx.UI.createWebViewController();

panelController.addJavascriptInterface("Guardian", {
    loadConfig: async function () {
        return await readFileSafe(CONFIG_PATH);
    },
    saveConfig: async function (json) {
        try {
            JSON.parse(json); // 落盘前校验，坏 JSON 直接拒绝
            await Tools.Files.write(CONFIG_PATH, json);
            return JSON.stringify({ success: true });
        } catch (e) {
            return JSON.stringify({ success: false, message: "" + e.message });
        }
    },
    loadLog: async function () {
        return await readFileSafe(LOG_PATH);
    }
});

function buildPanelHtml() {
    return `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, "PingFang SC", "Noto Sans CJK SC", sans-serif;
    background: #fff7f4; color: #5a4a42; padding: 14px 14px 40px;
    font-size: 14px; line-height: 1.6;
  }
  h1 { font-size: 18px; margin-bottom: 2px; }
  .sub { font-size: 12px; color: #b09a90; margin-bottom: 14px; }
  .card {
    background: #fff; border-radius: 14px; padding: 14px;
    margin-bottom: 12px; box-shadow: 0 1px 4px rgba(180,140,120,.12);
  }
  .card h2 { font-size: 14px; margin-bottom: 10px; color: #d67d6b; }
  label { display: block; font-size: 12px; color: #8a7369; margin: 8px 0 3px; }
  input[type=text], input[type=number], textarea {
    width: 100%; border: 1px solid #eedcd4; border-radius: 8px;
    padding: 8px 10px; font-size: 14px; background: #fffdfc; color: #5a4a42;
  }
  textarea { min-height: 72px; resize: vertical; }
  .hint { font-size: 11px; color: #c0aca3; margin-top: 2px; }
  .switch-row { display: flex; align-items: center; justify-content: space-between; padding: 7px 0; }
  .switch-row span { font-size: 13px; }
  .switch-row input { width: 20px; height: 20px; accent-color: #e8927c; }
  button {
    width: 100%; border: none; border-radius: 12px; padding: 12px;
    background: #e8927c; color: #fff; font-size: 15px; font-weight: 600;
  }
  button:active { background: #d67d6b; }
  #status { text-align: center; font-size: 12px; margin-top: 8px; min-height: 18px; color: #d67d6b; }
  .log-item { border-top: 1px dashed #f2e2da; padding: 8px 0; font-size: 12px; }
  .log-item:first-child { border-top: none; }
  .log-time { color: #c0aca3; }
  .log-badge {
    display: inline-block; border-radius: 8px; padding: 0 6px;
    font-size: 11px; margin-left: 6px; background: #fdeee9; color: #d67d6b;
  }
  .empty { font-size: 12px; color: #c0aca3; text-align: center; padding: 8px 0; }
</style>
</head>
<body>
  <h1>🌸 温柔巡检宝宝</h1>
  <div class="sub">改完点保存就生效，工作流那边不用再动</div>

  <div class="card">
    <h2>基础设置</h2>
    <label>你的名字（AI 怎么称呼你）</label>
    <input type="text" id="user_name" placeholder="宝宝">
    <label>角色卡名称</label>
    <input type="text" id="character_card_name" placeholder="必填，和 Operit 里的角色卡完全一致">
    <label>QQ Bot 对话标题</label>
    <input type="text" id="chat_query" placeholder="必填，比如 C2C_MESSAGE_CREATE">
    <div class="hint">巡检消息会发到这个对话对应的 QQ 上</div>
  </div>

  <div class="card">
    <h2>关心阈值</h2>
    <label>默认阈值（分钟）</label>
    <input type="number" id="default_threshold_minutes" min="5">
    <label>特殊阈值（每行一条：包名=分钟）</label>
    <textarea id="special_thresholds" placeholder="com.xingin.xhs=180&#10;com.anthropic.claude=60"></textarea>
    <label>白名单（每行一个包名，这些不检查）</label>
    <textarea id="whitelist"></textarea>
  </div>

  <div class="card">
    <h2>观察方式</h2>
    <div class="switch-row"><span>📬 看看最近的通知</span><input type="checkbox" id="allow_notifications"></div>
    <div class="switch-row"><span>📱 看看当前屏幕在做什么</span><input type="checkbox" id="allow_screenshot"></div>
    <div class="switch-row"><span>📷 申请用前置摄像头看看你（需装相机包）</span><input type="checkbox" id="allow_camera"></div>
    <div class="switch-row"><span>🔒 屡劝不听时允许锁应用（严格模式）</span><input type="checkbox" id="allow_lock"></div>
    <label>每次巡检最多观察几次</label>
    <input type="number" id="max_peeks_per_patrol" min="0" max="5">
    <div class="hint">观察只用来组织一句贴心的话，AI 不会复述看到的细节</div>
  </div>

  <div class="card">
    <h2>关心的话（每行一句，{app} 和 {minutes} 会被替换）</h2>
    <textarea id="care_phrases" style="min-height:110px"></textarea>
  </div>

  <button id="save">保存 💾</button>
  <div id="status"></div>

  <div class="card" style="margin-top:12px">
    <h2>最近的巡检</h2>
    <div id="log"><div class="empty">还没有记录～</div></div>
  </div>

<script>
  var $ = function (id) { return document.getElementById(id); };
  var STATUS_LABEL = { all_good: "一切安好", cared: "发了关心", skipped: "跳过" };

  var DEFAULTS = {
    user_name: "宝宝", character_card_name: "", chat_query: "",
    default_threshold_minutes: 45,
    special_thresholds: { "com.xingin.xhs": 180, "com.anthropic.claude": 60 },
    whitelist: ["com.ai.assistance.operit", "com.tencent.mobileqq"],
    allow_notifications: true, allow_screenshot: true, allow_camera: false,
    max_peeks_per_patrol: 1, allow_lock: false,
    care_phrases: [
      "在{app}上待了{minutes}分钟啦，眼睛累不累？休息一下下嘛 ☕",
      "看到你刷了{minutes}分钟{app}～不催你，就是想让你知道我在想你 🌸",
      "记得抬头看看远处哦，{app}不会跑掉的，我也不会 💕",
      "忙什么呢？要不要来跟我说说话～"
    ]
  };

  function kvToText(obj) {
    return Object.keys(obj || {}).map(function (k) { return k + "=" + obj[k]; }).join("\\n");
  }
  function textToKv(text) {
    var out = {};
    (text || "").split("\\n").forEach(function (line) {
      var i = line.indexOf("=");
      if (i > 0) {
        var k = line.slice(0, i).trim(), v = parseInt(line.slice(i + 1).trim(), 10);
        if (k && !isNaN(v)) out[k] = v;
      }
    });
    return out;
  }
  function linesToArr(text) {
    return (text || "").split("\\n").map(function (s) { return s.trim(); }).filter(Boolean);
  }

  function fillForm(cfg) {
    $("user_name").value = cfg.user_name || "";
    $("character_card_name").value = cfg.character_card_name || "";
    $("chat_query").value = cfg.chat_query || "";
    $("default_threshold_minutes").value = cfg.default_threshold_minutes;
    $("special_thresholds").value = kvToText(cfg.special_thresholds);
    $("whitelist").value = (cfg.whitelist || []).join("\\n");
    $("allow_notifications").checked = !!cfg.allow_notifications;
    $("allow_screenshot").checked = !!cfg.allow_screenshot;
    $("allow_camera").checked = !!cfg.allow_camera;
    $("allow_lock").checked = !!cfg.allow_lock;
    $("max_peeks_per_patrol").value = cfg.max_peeks_per_patrol;
    $("care_phrases").value = (cfg.care_phrases || []).join("\\n");
  }

  function readForm() {
    return {
      user_name: $("user_name").value.trim() || "宝宝",
      character_card_name: $("character_card_name").value.trim(),
      chat_query: $("chat_query").value.trim(),
      default_threshold_minutes: parseInt($("default_threshold_minutes").value, 10) || 45,
      special_thresholds: textToKv($("special_thresholds").value),
      whitelist: linesToArr($("whitelist").value),
      allow_notifications: $("allow_notifications").checked,
      allow_screenshot: $("allow_screenshot").checked,
      allow_camera: $("allow_camera").checked,
      allow_lock: $("allow_lock").checked,
      max_peeks_per_patrol: parseInt($("max_peeks_per_patrol").value, 10) || 0,
      care_phrases: linesToArr($("care_phrases").value)
    };
  }

  function renderLog(entries) {
    var box = $("log");
    if (!entries || !entries.length) {
      box.innerHTML = '<div class="empty">还没有记录～</div>';
      return;
    }
    box.innerHTML = entries.slice(0, 10).map(function (e) {
      var t = (e.time || "").replace("T", " ").slice(5, 16);
      var badge = STATUS_LABEL[e.status] || e.status || "";
      var msg = e.message_sent ? '<div>💌 ' + e.message_sent + '</div>' : '';
      return '<div class="log-item"><span class="log-time">' + t + '</span>' +
             '<span class="log-badge">' + badge + '</span>' +
             '<div>' + (e.summary || "") + '</div>' + msg + '</div>';
    }).join("");
  }

  function setStatus(text) {
    $("status").textContent = text;
    if (text) setTimeout(function () { $("status").textContent = ""; }, 3000);
  }

  // 每次打开都是全新实例：先通过桥拉一遍数据，别假设上次的状态还在
  async function init() {
    var cfg = DEFAULTS;
    try {
      var raw = await Guardian.loadConfig();
      if (raw) {
        var saved = JSON.parse(raw);
        cfg = Object.assign({}, DEFAULTS, saved);
      }
    } catch (e) { /* 文件缺失或损坏，用默认值 */ }
    fillForm(cfg);
    try {
      var logRaw = await Guardian.loadLog();
      if (logRaw) renderLog(JSON.parse(logRaw));
    } catch (e) { /* 没有日志就算了 */ }
  }

  $("save").addEventListener("click", async function () {
    var cfg = readForm();
    if (!cfg.character_card_name || !cfg.chat_query) {
      setStatus("⚠️ 角色卡名称和 QQ Bot 对话标题是必填的哦");
      return;
    }
    try {
      var res = JSON.parse(await Guardian.saveConfig(JSON.stringify(cfg, null, 2)));
      setStatus(res.success ? "保存好啦 🌸 下次巡检就按新配置来" : "保存失败：" + res.message);
    } catch (e) {
      setStatus("保存失败：" + e.message);
    }
  });

  init();
</script>
</body>
</html>`;
}

return ctx.UI.WebView({
    html: buildPanelHtml(),
    baseUrl: "about:blank",
    javaScriptEnabled: true,
    domStorageEnabled: true,
    controller: panelController
});
