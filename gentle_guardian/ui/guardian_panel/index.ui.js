/*
 * 温柔巡检宝宝 — 侧边栏面板（设置 + 醋值仪表 + 记录）
 *
 * 路线：「HTML 承重、DSL 薄桥」。这个文件只做三件事：
 *   1. 创建 WebView 加载内嵌的面板 HTML
 *   2. 注入 Guardian 桥（loadConfig / saveConfig / loadState / loadLog / emergencyUnhide），内部走 Tools.Files
 *   3. 别的什么都不干
 *
 * ⚠️ 装机前对照 SandboxPackage_DEV 的 examples/emotion_mixologist/ui/ 核对：
 *   - WebView controller 的创建方式（下面按开发简报写的）
 *   - Tools.Files.read/write 的真实方法名与返回结构
 *   - shell 执行 API（紧急解除要用）
 *
 * 路径必须与 packages/gentle_guardian_tools.js 里的常量保持一致！
 */

var BASE_DIR = "/sdcard/Download/Operit/plugins/gentle_guardian/";
var CONFIG_PATH = BASE_DIR + "config.json";
var LOG_PATH = BASE_DIR + "patrol_log.json";
var STATE_PATH = BASE_DIR + "jealousy_state.json";

async function readFileSafe(path) {
    try {
        var raw = await Tools.Files.read(path);
        return typeof raw === "string" ? raw : (raw && (raw.content || (raw.data && raw.data.content))) || "";
    } catch (e) {
        return "";
    }
}

// 与工具子包同款的 shell 尝试链（紧急解除用）
async function execShell(cmd) {
    var candidates = [];
    if (typeof Tools !== "undefined") {
        if (Tools.System && typeof Tools.System.shell === "function") {
            candidates.push(function () { return Tools.System.shell(cmd); });
        }
        if (Tools.System && typeof Tools.System.exec === "function") {
            candidates.push(function () { return Tools.System.exec(cmd); });
        }
        if (Tools.Shell && typeof Tools.Shell.exec === "function") {
            candidates.push(function () { return Tools.Shell.exec(cmd); });
        }
        if (Tools.System && typeof Tools.System.terminal === "function") {
            candidates.push(function () { return Tools.System.terminal(cmd); });
        }
    }
    if (candidates.length === 0) {
        return { success: false, message: "没有可用的 shell 执行能力（需要 Shizuku/ADB）" };
    }
    var lastErr = "";
    for (var i = 0; i < candidates.length; i++) {
        try {
            await candidates[i]();
            return { success: true };
        } catch (e) {
            lastErr = "" + (e && e.message ? e.message : e);
        }
    }
    return { success: false, message: "shell 执行失败：" + lastErr };
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
    loadState: async function () {
        return await readFileSafe(STATE_PATH);
    },
    loadLog: async function () {
        return await readFileSafe(LOG_PATH);
    },
    // 逃生通道：QQ 链路断了、AI 联系不上时，人也要能把应用放出来
    emergencyUnhide: async function () {
        try {
            var raw = await readFileSafe(STATE_PATH);
            var state = raw ? JSON.parse(raw) : {};
            var hidden = Array.isArray(state.hidden_apps) ? state.hidden_apps : [];
            var failed = [];
            for (var i = 0; i < hidden.length; i++) {
                var r = await execShell("pm enable --user 0 " + hidden[i]);
                if (!r.success) failed.push(hidden[i] + "（" + r.message + "）");
            }
            state.hidden_apps = failed.length ? hidden.filter(function (p) {
                return failed.some(function (f) { return f.indexOf(p) === 0; });
            }) : [];
            // 压到藏应用档以下（按当前配置算），不然下次巡检立刻又藏回去
            var hideTier = 60;
            try {
                var cfgRaw = await readFileSafe(CONFIG_PATH);
                var cfg = cfgRaw ? JSON.parse(cfgRaw) : {};
                if (cfg.jealousy_tiers && cfg.jealousy_tiers.hide) hideTier = cfg.jealousy_tiers.hide;
            } catch (e) { /* 读不到就按默认档位 */ }
            state.jealousy = Math.min(
                typeof state.jealousy === "number" ? state.jealousy : 0,
                Math.max(0, hideTier - 10)
            );
            state.history = Array.isArray(state.history) ? state.history : [];
            state.history.unshift({
                time: new Date().toISOString(),
                delta: 0,
                value: state.jealousy,
                reason: "紧急解除（面板操作）"
            });
            state.updated_at = new Date().toISOString();
            await Tools.Files.write(STATE_PATH, JSON.stringify(state, null, 2));
            return JSON.stringify({
                success: failed.length === 0,
                message: failed.length === 0
                    ? (hidden.length ? "全部放出来啦" : "本来就没有藏着的应用")
                    : "部分失败：" + failed.join("；")
            });
        } catch (e) {
            return JSON.stringify({ success: false, message: "" + e.message });
        }
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
  .row2 { display: flex; gap: 8px; }
  .row2 > div { flex: 1; }
  button {
    width: 100%; border: none; border-radius: 12px; padding: 12px;
    background: #e8927c; color: #fff; font-size: 15px; font-weight: 600;
  }
  button:active { background: #d67d6b; }
  button.ghost { background: #fdeee9; color: #d67d6b; font-size: 13px; padding: 9px; margin-top: 10px; }
  #status { text-align: center; font-size: 12px; margin-top: 8px; min-height: 18px; color: #d67d6b; }
  .meter-top { display: flex; align-items: baseline; gap: 8px; }
  .meter-value { font-size: 32px; font-weight: 700; color: #d67d6b; }
  .meter-tier { font-size: 14px; }
  .meter-bar { height: 10px; border-radius: 5px; background: #f6e6df; margin: 8px 0 4px; overflow: hidden; }
  .meter-fill { height: 100%; border-radius: 5px; background: linear-gradient(90deg,#f3b39f,#e8927c,#d95f4e); transition: width .3s; }
  .meter-marks { display: flex; justify-content: space-between; font-size: 10px; color: #c0aca3; }
  .hidden-apps { font-size: 12px; margin-top: 6px; }
  .hidden-apps b { color: #d95f4e; }
  .log-item { border-top: 1px dashed #f2e2da; padding: 8px 0; font-size: 12px; }
  .log-item:first-child { border-top: none; }
  .log-time { color: #c0aca3; }
  .log-badge {
    display: inline-block; border-radius: 8px; padding: 0 6px;
    font-size: 11px; margin-left: 6px; background: #fdeee9; color: #d67d6b;
  }
  .delta-up { color: #d95f4e; font-weight: 600; }
  .delta-down { color: #7ba86f; font-weight: 600; }
  .empty { font-size: 12px; color: #c0aca3; text-align: center; padding: 8px 0; }
</style>
</head>
<body>
  <h1>🌸 温柔巡检宝宝</h1>
  <div class="sub">改完点保存就生效，工作流那边不用再动</div>

  <div class="card">
    <h2>🍋 现在的醋值</h2>
    <div class="meter-top">
      <span class="meter-value" id="jv">0</span>
      <span class="meter-tier" id="jt">温柔档</span>
    </div>
    <div class="meter-bar"><div class="meter-fill" id="jbar" style="width:0%"></div></div>
    <div class="meter-marks"><span id="m0">0 温柔</span><span id="m1">30 委屈</span><span id="m2">60 藏应用</span><span id="m3">90 要哄</span></div>
    <div class="hidden-apps" id="hiddenApps"></div>
    <button class="ghost" id="unhideBtn">🆘 紧急解除全部隐藏</button>
    <div class="hint">给 AI 联系不上时留的逃生通道；也可以用电脑 adb shell pm enable 包名 恢复</div>
  </div>

  <div class="card">
    <h2>醋值变动记录</h2>
    <div id="jlog"><div class="empty">还没有记录～</div></div>
  </div>

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
    <label>白名单（每行一个包名，这些不检查也永远不会被藏）</label>
    <textarea id="whitelist"></textarea>
  </div>

  <div class="card">
    <h2>吃醋机制</h2>
    <label>吃醋权重（每行一条：包名=倍率，“情敌”应用可以调高）</label>
    <textarea id="jealousy_weights" placeholder="com.xingin.xhs=1.5"></textarea>
    <div class="row2">
      <div><label>每超时10分钟加几点</label><input type="number" id="jealousy_gain_per_10min" min="1" step="0.5"></div>
      <div><label>每小时自然消退几点</label><input type="number" id="jealousy_decay_per_hour" min="0" step="0.5"></div>
    </div>
    <div class="row2">
      <div><label>委屈档起点</label><input type="number" id="tier_sulky" min="1"></div>
      <div><label>藏应用档起点</label><input type="number" id="tier_hide" min="1"></div>
      <div><label>要哄档起点</label><input type="number" id="tier_coax" min="1"></div>
    </div>
    <label>一次最多被哄掉几点</label>
    <input type="number" id="coax_max_reduce_per_call" min="1">
    <div class="hint">被哄了也要有个过程嘛</div>
  </div>

  <div class="card">
    <h2>观察方式</h2>
    <div class="switch-row"><span>📬 看看最近的通知</span><input type="checkbox" id="allow_notifications"></div>
    <div class="switch-row"><span>📱 看看当前屏幕在做什么</span><input type="checkbox" id="allow_screenshot"></div>
    <div class="switch-row"><span>📷 申请用前置摄像头看看你（需装相机包）</span><input type="checkbox" id="allow_camera"></div>
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
  var TIER_LABEL = { calm: "温柔档", sulky: "小委屈档", hide: "不高兴档（藏应用）", coax: "要哄档" };

  var DEFAULTS = {
    user_name: "宝宝", character_card_name: "", chat_query: "",
    default_threshold_minutes: 45,
    special_thresholds: { "com.xingin.xhs": 180, "com.anthropic.claude": 60 },
    whitelist: ["com.ai.assistance.operit", "com.tencent.mobileqq"],
    allow_notifications: true, allow_screenshot: true, allow_camera: false,
    max_peeks_per_patrol: 1,
    care_phrases: [
      "在{app}上待了{minutes}分钟啦，眼睛累不累？休息一下下嘛 ☕",
      "看到你刷了{minutes}分钟{app}～不催你，就是想让你知道我在想你 🌸",
      "记得抬头看看远处哦，{app}不会跑掉的，我也不会 💕",
      "忙什么呢？要不要来跟我说说话～"
    ],
    jealousy_weights: { "com.xingin.xhs": 1.5 },
    jealousy_gain_per_10min: 3,
    jealousy_decay_per_hour: 1,
    jealousy_tiers: { sulky: 30, hide: 60, coax: 90 },
    coax_max_reduce_per_call: 25
  };

  function kvToText(obj) {
    return Object.keys(obj || {}).map(function (k) { return k + "=" + obj[k]; }).join("\\n");
  }
  function textToKv(text, isFloat) {
    var out = {};
    (text || "").split("\\n").forEach(function (line) {
      var i = line.indexOf("=");
      if (i > 0) {
        var k = line.slice(0, i).trim();
        var v = isFloat ? parseFloat(line.slice(i + 1).trim()) : parseInt(line.slice(i + 1).trim(), 10);
        if (k && !isNaN(v)) out[k] = v;
      }
    });
    return out;
  }
  function linesToArr(text) {
    return (text || "").split("\\n").map(function (s) { return s.trim(); }).filter(Boolean);
  }
  function tierOf(v, tiers) {
    if (v >= tiers.coax) return "coax";
    if (v >= tiers.hide) return "hide";
    if (v >= tiers.sulky) return "sulky";
    return "calm";
  }

  function fillForm(cfg) {
    $("user_name").value = cfg.user_name || "";
    $("character_card_name").value = cfg.character_card_name || "";
    $("chat_query").value = cfg.chat_query || "";
    $("default_threshold_minutes").value = cfg.default_threshold_minutes;
    $("special_thresholds").value = kvToText(cfg.special_thresholds);
    $("whitelist").value = (cfg.whitelist || []).join("\\n");
    $("jealousy_weights").value = kvToText(cfg.jealousy_weights);
    $("jealousy_gain_per_10min").value = cfg.jealousy_gain_per_10min;
    $("jealousy_decay_per_hour").value = cfg.jealousy_decay_per_hour;
    $("tier_sulky").value = cfg.jealousy_tiers.sulky;
    $("tier_hide").value = cfg.jealousy_tiers.hide;
    $("tier_coax").value = cfg.jealousy_tiers.coax;
    $("coax_max_reduce_per_call").value = cfg.coax_max_reduce_per_call;
    $("allow_notifications").checked = !!cfg.allow_notifications;
    $("allow_screenshot").checked = !!cfg.allow_screenshot;
    $("allow_camera").checked = !!cfg.allow_camera;
    $("max_peeks_per_patrol").value = cfg.max_peeks_per_patrol;
    $("care_phrases").value = (cfg.care_phrases || []).join("\\n");
  }

  function readForm() {
    return {
      user_name: $("user_name").value.trim() || "宝宝",
      character_card_name: $("character_card_name").value.trim(),
      chat_query: $("chat_query").value.trim(),
      default_threshold_minutes: parseInt($("default_threshold_minutes").value, 10) || 45,
      special_thresholds: textToKv($("special_thresholds").value, false),
      whitelist: linesToArr($("whitelist").value),
      jealousy_weights: textToKv($("jealousy_weights").value, true),
      jealousy_gain_per_10min: parseFloat($("jealousy_gain_per_10min").value) || 3,
      jealousy_decay_per_hour: parseFloat($("jealousy_decay_per_hour").value) || 0,
      jealousy_tiers: {
        sulky: parseInt($("tier_sulky").value, 10) || 30,
        hide: parseInt($("tier_hide").value, 10) || 60,
        coax: parseInt($("tier_coax").value, 10) || 90
      },
      coax_max_reduce_per_call: parseInt($("coax_max_reduce_per_call").value, 10) || 25,
      allow_notifications: $("allow_notifications").checked,
      allow_screenshot: $("allow_screenshot").checked,
      allow_camera: $("allow_camera").checked,
      max_peeks_per_patrol: parseInt($("max_peeks_per_patrol").value, 10) || 0,
      care_phrases: linesToArr($("care_phrases").value)
    };
  }

  function renderMeter(state, cfg) {
    var tiers = cfg.jealousy_tiers;
    var v = (state && typeof state.jealousy === "number") ? Math.round(state.jealousy * 10) / 10 : 0;
    $("jv").textContent = v;
    $("jt").textContent = TIER_LABEL[tierOf(v, tiers)];
    var maxScale = Math.max(tiers.coax * 1.2, v);
    $("jbar").style.width = Math.min(100, v / maxScale * 100) + "%";
    $("m1").textContent = tiers.sulky + " 委屈";
    $("m2").textContent = tiers.hide + " 藏应用";
    $("m3").textContent = tiers.coax + " 要哄";
    var hidden = (state && state.hidden_apps) || [];
    $("hiddenApps").innerHTML = hidden.length
      ? "🙈 藏起来的应用：<b>" + hidden.join("、") + "</b>"
      : "现在没有应用被藏起来～";
  }

  function renderJealousyLog(state) {
    var box = $("jlog");
    var hist = (state && state.history) || [];
    if (!hist.length) {
      box.innerHTML = '<div class="empty">还没有记录～</div>';
      return;
    }
    box.innerHTML = hist.slice(0, 15).map(function (e) {
      var t = (e.time || "").replace("T", " ").slice(5, 16);
      var d = e.delta > 0 ? '<span class="delta-up">+' + e.delta + '</span>'
            : e.delta < 0 ? '<span class="delta-down">' + e.delta + '</span>' : "·";
      var app = e.app ? " " + e.app : "";
      return '<div class="log-item"><span class="log-time">' + t + '</span> ' + d +
             ' → ' + e.value + '<div>' + (e.reason || "") + app + '</div></div>';
    }).join("");
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

  var currentCfg = DEFAULTS;

  // 每次打开都是全新实例：先通过桥拉一遍数据，别假设上次的状态还在
  async function init() {
    try {
      var raw = await Guardian.loadConfig();
      if (raw) currentCfg = Object.assign({}, DEFAULTS, JSON.parse(raw));
    } catch (e) { /* 文件缺失或损坏，用默认值 */ }
    if (!currentCfg.jealousy_tiers) currentCfg.jealousy_tiers = DEFAULTS.jealousy_tiers;
    fillForm(currentCfg);
    var state = null;
    try {
      var sRaw = await Guardian.loadState();
      if (sRaw) state = JSON.parse(sRaw);
    } catch (e) { /* 还没有状态文件 */ }
    renderMeter(state, currentCfg);
    renderJealousyLog(state);
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
    if (!(cfg.jealousy_tiers.sulky < cfg.jealousy_tiers.hide && cfg.jealousy_tiers.hide < cfg.jealousy_tiers.coax)) {
      setStatus("⚠️ 分档要满足 委屈 < 藏应用 < 要哄");
      return;
    }
    try {
      var res = JSON.parse(await Guardian.saveConfig(JSON.stringify(cfg, null, 2)));
      if (res.success) {
        currentCfg = cfg;
        setStatus("保存好啦 🌸 下次巡检就按新配置来");
        renderMeter(null, cfg);
        try {
          var sRaw = await Guardian.loadState();
          if (sRaw) renderMeter(JSON.parse(sRaw), cfg);
        } catch (e) {}
      } else {
        setStatus("保存失败：" + res.message);
      }
    } catch (e) {
      setStatus("保存失败：" + e.message);
    }
  });

  $("unhideBtn").addEventListener("click", async function () {
    try {
      var res = JSON.parse(await Guardian.emergencyUnhide());
      setStatus(res.success ? "🆘 " + res.message : "⚠️ " + res.message);
      var sRaw = await Guardian.loadState();
      var state = sRaw ? JSON.parse(sRaw) : null;
      renderMeter(state, currentCfg);
      renderJealousyLog(state);
    } catch (e) {
      setStatus("解除失败：" + e.message);
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
