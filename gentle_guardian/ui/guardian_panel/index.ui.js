function Screen(ctx) {
/*
 * 温柔巡检宝宝 — 侧边栏面板（设置 + 醋值仪表 + 记录）
 *
 * 路线：「HTML 承重、DSL 薄桥」。这个文件只做三件事：
 *   1. 创建 WebView 加载内嵌的面板 HTML
 *   2. 注入 Guardian 桥（loadConfig / saveConfig / loadState / loadLog / emergencyUnhide /
 *      shakeCoax / savePhoto / uploadPhoto / loadAvatar / …），内部走 Tools.Files + shell
 *   3. 别的什么都不干
 *
 * 路径必须与 packages/gentle_guardian_tools.js 里的常量保持一致！
 */

var BASE_DIR = "/sdcard/Download/Operit/plugins/gentle_guardian/";
var CONFIG_PATH = BASE_DIR + "config.json";
var LOG_PATH = BASE_DIR + "patrol_log.json";
var STATE_PATH = BASE_DIR + "jealousy_state.json";

function localTime() {
    var d = new Date();
    var pad = function(n) { return (n < 10 ? "0" : "") + n; };
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " " +
        pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
}

async function readFileSafe(path) {
    try {
        var raw = await Tools.Files.read(path);
        var content = typeof raw === "string" ? raw : (raw && (raw.content || (raw.data && raw.data.content))) || "";
        // 兼容：Operit 的 Files.read 有时把 content 包成单元素数组 ["{...}"]
        if (typeof content === "string" && content.trim().startsWith('[')) {
            try {
                var arr = JSON.parse(content);
                if (Array.isArray(arr) && arr.length > 0 && typeof arr[0] === "string") {
                    content = arr[0];
                }
            } catch (e) {}
        }
        return content;
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
            var r = await candidates[i]();
            // 捕获输出：loadAvatar 等桥方法需要 find/base64 的结果
            var out = "";
            if (typeof r === "string") out = r;
            else if (r && typeof r.output === "string") out = r.output;
            else if (r && typeof r.stdout === "string") out = r.stdout;
            else if (r != null) out = JSON.stringify(r);
            return { success: true, output: out };
        } catch (e) {
            lastErr = "" + (e && e.message ? e.message : e);
        }
    }
    return { success: false, message: "shell 执行失败：" + lastErr };
}

// 常见桌面包名：unhide 后 force-stop 一遍强制重建图标缓存（与工具子包同款）
var LAUNCHER_PKGS = [
    "com.miui.home",
    "com.android.launcher3",
    "com.google.android.apps.nexuslauncher",
    "com.sec.android.app.launcher",
    "com.huawei.android.launcher",
    "com.hihonor.android.launcher",
    "com.oppo.launcher",
    "com.bbk.launcher2",
    "com.oneplus.launcher"
];

async function refreshLauncher(releasedPkgs) {
    for (var i = 0; i < releasedPkgs.length; i++) {
        await execShell("pm install-existing " + releasedPkgs[i]);
    }
    for (var j = 0; j < LAUNCHER_PKGS.length; j++) {
        await execShell("am force-stop " + LAUNCHER_PKGS[j]);
    }
}

var panelController = ctx.createWebViewController("gentle_guardian_panel");

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
    // 逃生通道：AI 联系不上时，人也要能把应用放出来。醋值清零、档位归 calm。
    emergencyUnhide: async function () {
        try {
            var raw = await readFileSafe(STATE_PATH);
            var state = raw ? JSON.parse(raw) : {};
            var hidden = Array.isArray(state.hidden_apps) ? state.hidden_apps : [];
            var failed = [];
            var releasedOk = [];
            for (var i = 0; i < hidden.length; i++) {
                var r = await execShell("pm enable --user 0 " + hidden[i]);
                if (r.success) {
                    releasedOk.push(hidden[i]);
                } else {
                    failed.push(hidden[i] + "（" + r.message + "）");
                }
            }
            if (releasedOk.length > 0) {
                await refreshLauncher(releasedOk);
            }
            // 紧急解除 = 彻底重置：醋值归零、隐藏列表清空
            state.jealousy = 0;
            state.hidden_apps = [];
            state.history = Array.isArray(state.history) ? state.history : [];
            state.history.unshift({
                time: localTime(),
                delta: 0,
                value: 0,
                reason: "紧急解除（面板操作），醋值清零"
            });
            state.updated_at = localTime();
            await Tools.Files.write(STATE_PATH, JSON.stringify(state, null, 2));
            return JSON.stringify({
                success: failed.length === 0,
                message: failed.length === 0
                    ? (hidden.length ? "全部放出来啦，醋值已清零" : "本来就没有藏着的应用，醋值已清零")
                    : "醋值已清零，但这些没放出来：" + failed.join("；") + "。可用电脑 adb shell pm enable 包名 恢复"
            });
        } catch (e) {
            return JSON.stringify({ success: false, message: "" + e.message });
        }
    },
    // 摇一摇哄它：小幅消气；降回 hide 档以下同样放应用（检测算法在 HTML 侧，来自 pwa-sense-bridge / MIT）
    // 架构备忘：按「一份逻辑两个入口」的原则，这里理想形态是 callTool 转发给
    // gentle_guardian:reduce_jealousy，而不是面板侧复制状态机——ui 上下文的 callTool
    // 签名尚未实测，验证可用后建议改成转发（对照 SandboxPackage_DEV 里 CoRead 的桥）。
    shakeCoax: async function (points) {
        try {
            var p = parseFloat(points);
            if (isNaN(p) || p <= 0) p = 2;
            var hideTier = 60;
            var decayPerHour = 1;
            try {
                var cfgRaw = await readFileSafe(CONFIG_PATH);
                var cfg = cfgRaw ? JSON.parse(cfgRaw) : {};
                if (cfg.jealousy_tiers && cfg.jealousy_tiers.hide) hideTier = cfg.jealousy_tiers.hide;
                if (typeof cfg.jealousy_decay_per_hour === "number") decayPerHour = cfg.jealousy_decay_per_hour;
            } catch (e) { /* 读不到就按默认档位 */ }
            var raw = await readFileSafe(STATE_PATH);
            var state = raw ? JSON.parse(raw) : {};
            if (typeof state.jealousy !== "number" || isNaN(state.jealousy)) state.jealousy = 0;
            if (!Array.isArray(state.hidden_apps)) state.hidden_apps = [];
            if (!Array.isArray(state.history)) state.history = [];
            if (state.updated_at && decayPerHour > 0) {
                var hoursIdle = (Date.now() - new Date(state.updated_at).getTime()) / 3600000;
                if (hoursIdle > 0) {
                    state.jealousy = Math.max(0, Math.round((state.jealousy - hoursIdle * decayPerHour) * 10) / 10);
                }
            }
            var before = state.jealousy;
            state.jealousy = Math.max(0, Math.round((state.jealousy - p) * 10) / 10);
            state.history.unshift({
                time: localTime(),
                delta: -p,
                value: state.jealousy,
                reason: "被摇一摇哄了 🫨"
            });
            if (state.history.length > 50) state.history = state.history.slice(0, 50);
            var released = [];
            if (state.jealousy < hideTier && state.hidden_apps.length > 0) {
                var remaining = [];
                for (var i = 0; i < state.hidden_apps.length; i++) {
                    var r = await execShell("pm enable --user 0 " + state.hidden_apps[i]);
                    if (r.success) { released.push(state.hidden_apps[i]); } else { remaining.push(state.hidden_apps[i]); }
                }
                state.hidden_apps = remaining;
                if (released.length > 0) await refreshLauncher(released);
            }
            state.updated_at = localTime();
            await Tools.Files.write(STATE_PATH, JSON.stringify(state, null, 2));
            return JSON.stringify({
                success: true,
                before: before,
                jealousy: state.jealousy,
                hidden_apps: state.hidden_apps,
                released: released
            });
        } catch (e) {
            return JSON.stringify({ success: false, message: "" + e.message });
        }
    },
    // 📷 保存拍照：AI 说想看看你 → 你来面板点相机 → base64 落盘 → AI 下轮用 read_latest_photo 看到
    savePhoto: async function (base64) {
        try {
            var photoDir = BASE_DIR + "photos/";
            var photoPath = photoDir + "latest.jpg";
            // 确保目录存在——用 write 直接写，目录不存在会失败
            // 先尝试创建目录
            try { await Tools.Files.createDirectory(photoDir); } catch (e) { /* 目录可能已存在 */ }
            var dataUrl = base64;
            // 如果传入的是完整 data:image/jpeg;base64,... 前缀，去掉
            var commaIdx = base64.indexOf(",");
            if (commaIdx > -1) dataUrl = base64.slice(commaIdx + 1);
            // Tools.Files.write 写文本，但 base64 是二进制——用 writeBase64 或 write
            // 实际操作：将 base64 存为文本，下次读取用 readFileSafe 拿回来再转回来
            await Tools.Files.write(photoPath, JSON.stringify({
                base64: dataUrl,
                timestamp: localTime()
            }));
            return JSON.stringify({ success: true, path: photoPath });
        } catch (e) {
            return JSON.stringify({ success: false, message: "" + e.message });
        }
    },
    // ⭐ 归档：把指定索引的日志从主日志移到归档（或反向）
    toggleArchive: async function (index) {
        try {
            var ARCHIVE_PATH = BASE_DIR + "patrol_log_archive.json";
            var log = JSON.parse(await readFileSafe(LOG_PATH) || "[]");
            if (!Array.isArray(log)) log = [];
            var idx = parseInt(index);
            if (isNaN(idx) || idx < 0 || idx >= log.length) {
                return JSON.stringify({ success: false, message: "索引不对" });
            }
            var entry = log[idx];
            log.splice(idx, 1);
            await Tools.Files.write(LOG_PATH, JSON.stringify(log, null, 2));
            var archive = JSON.parse(await readFileSafe(ARCHIVE_PATH) || "[]");
            if (!Array.isArray(archive)) archive = [];
            archive.unshift(entry);
            // 收藏封顶100条：不然文件越攒越大，开面板越来越卡
            if (archive.length > 100) archive = archive.slice(0, 100);
            await Tools.Files.write(ARCHIVE_PATH, JSON.stringify(archive, null, 2));
            return JSON.stringify({ success: true, message: "已归档" });
        } catch (e) {
            return JSON.stringify({ success: false, message: "" + e.message });
        }
    },
    // ⭐ 读取归档日志
    loadArchive: async function () {
        try {
            var ARCHIVE_PATH = BASE_DIR + "patrol_log_archive.json";
            return await readFileSafe(ARCHIVE_PATH) || "[]";
        } catch (e) {
            return "[]";
        }
    },
    // 读最新照片（给 AI 工具 read_latest_photo 用）
    loadPhoto: async function () {
        try {
            var photoPath = BASE_DIR + "photos/latest.jpg";
            var raw = await readFileSafe(photoPath);
            return raw || "{}";
        } catch (e) {
            return "{}";
        }
    },
    // 📷 打开系统相机。用普通拍照模式 STILL_IMAGE_CAMERA：快门直接存进相册。
    // 之前用的 IMAGE_CAPTURE 是「拍完把结果返回给调用方」的模式，shell 启动没有接收方，
    // 很多相机拍完根本存不下来——这就是「无法保存」的原因。
    openCamera: async function () {
        try {
            var r = await execShell("am start -a android.media.action.STILL_IMAGE_CAMERA");
            if (!r.success) r = await execShell("am start -a android.media.action.IMAGE_CAPTURE");
            return JSON.stringify(r);
        } catch (e) {
            return JSON.stringify({ success: false, message: "" + e.message });
        }
    },
    // 扫描系统相册最近30分钟的最新照片并真正导入：转 base64 存进 photos/latest.jpg。
    // 返回 unchanged=true 表示最新照片就是上次导入的那张（没有新照片）。
    scanLatestPhoto: async function () {
        try {
            var photoDir = BASE_DIR + "photos/";
            var photoPath = photoDir + "latest.jpg";
            var findCmd = "find /sdcard/DCIM /sdcard/Pictures \\( -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.png' \\) -mmin -30 2>/dev/null | xargs ls -t 2>/dev/null | head -1";
            var scanRes = await execShell(findCmd);
            var latest = (scanRes.success && scanRes.output) ? scanRes.output.trim().split("\n")[0].trim() : "";
            if (!latest || latest.charAt(0) !== "/") {
                return JSON.stringify({ success: false, message: "最近30分钟没有新照片" });
            }
            var prevSource = "";
            try {
                var prevRaw = await readFileSafe(photoPath);
                if (prevRaw) { var prev = JSON.parse(prevRaw); prevSource = (prev && prev.source) || ""; }
            } catch (e) { /* 旧格式没有 source 字段，当作没导入过 */ }
            if (latest === prevSource) {
                return JSON.stringify({ success: true, unchanged: true, path: photoPath, source: latest });
            }
            try { await Tools.Files.createDirectory(photoDir); } catch (e) { /* 目录可能已存在 */ }
            var b64Res = await execShell("base64 -w0 '" + latest.replace(/'/g, "") + "'");
            var data = (b64Res.success && b64Res.output) ? b64Res.output.replace(/\s/g, "") : "";
            if (!data || !/^[A-Za-z0-9+/=]+$/.test(data)) {
                return JSON.stringify({ success: false, message: "照片转码失败" });
            }
            await Tools.Files.write(photoPath, JSON.stringify({
                base64: data,
                timestamp: localTime(),
                source: latest
            }));
            return JSON.stringify({ success: true, path: photoPath, kb: Math.round(data.length / 1024), source: latest });
        } catch (e) {
            return JSON.stringify({ success: false, message: "" + e.message });
        }
    },
    // 读取指定路径的照片文件（给 AI 用）
    readPhotoAt: async function (path) {
        try {
            var raw = await readFileSafe(path);
            return raw || "{}";
        } catch (e) {
            return "{}";
        }
    },
    // 🐱 头像：只读用户手动上传的（存在插件目录 avatar.json）。
    // 之前尝试过按角色卡名自动匹配 Operit 备份/avatars 目录，实测拿不到——现在放弃自动，纯手动。
    loadAvatar: async function (cardName) {
        try {
            var raw = await readFileSafe(BASE_DIR + "avatar.json");
            if (raw) {
                var m = JSON.parse(raw);
                if (m && m.base64) return JSON.stringify({ base64: m.base64, source: "manual" });
            }
        } catch (e) {}
        return "{}";
    },
    // 📎 上传照片：与 savePhoto 同一落盘格式（photos/latest.jpg 里存 {base64,timestamp} JSON），
    // AI 下轮 read_latest_photo / loadPhoto 就能看到
    uploadPhoto: async function (base64) {
        try {
            var photoDir = BASE_DIR + "photos/";
            var photoPath = photoDir + "latest.jpg";
            try { await Tools.Files.createDirectory(photoDir); } catch (e) { /* 目录可能已存在 */ }
            var data = "" + (base64 || "");
            var commaIdx = data.indexOf(",");
            if (commaIdx > -1) data = data.slice(commaIdx + 1);
            await Tools.Files.write(photoPath, JSON.stringify({
                base64: data,
                timestamp: localTime()
            }));
            return JSON.stringify({ success: true, path: photoPath });
        } catch (e) {
            return JSON.stringify({ success: false, message: "" + e.message });
        }
    },
    // 🐱 手动设置头像：存到插件目录，loadAvatar 最优先读它（自动匹配抓不到时的兜底）
    saveAvatar: async function (base64) {
        try {
            var data = "" + (base64 || "");
            var commaIdx = data.indexOf(",");
            if (commaIdx > -1) data = data.slice(commaIdx + 1);
            if (!data) return JSON.stringify({ success: false, message: "空图片" });
            await Tools.Files.write(BASE_DIR + "avatar.json", JSON.stringify({
                base64: data,
                timestamp: localTime()
            }));
            return JSON.stringify({ success: true });
        } catch (e) {
            return JSON.stringify({ success: false, message: "" + e.message });
        }
    },
    // ⭐ 取消收藏：把归档里第 index 条移回主日志最前面
    restoreArchive: async function (index) {
        try {
            var ARCHIVE_PATH = BASE_DIR + "patrol_log_archive.json";
            var archive = JSON.parse(await readFileSafe(ARCHIVE_PATH) || "[]");
            if (!Array.isArray(archive)) archive = [];
            var idx = parseInt(index);
            if (isNaN(idx) || idx < 0 || idx >= archive.length) {
                return JSON.stringify({ success: false, message: "索引不对" });
            }
            var entry = archive[idx];
            archive.splice(idx, 1);
            await Tools.Files.write(ARCHIVE_PATH, JSON.stringify(archive, null, 2));
            var log = JSON.parse(await readFileSafe(LOG_PATH) || "[]");
            if (!Array.isArray(log)) log = [];
            log.unshift(entry);
            await Tools.Files.write(LOG_PATH, JSON.stringify(log, null, 2));
            return JSON.stringify({ success: true, message: "已移回日志" });
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
  /* ── 巡检日志：四色状态 tag + 长文本折叠 ── */
  .log-badge.b-all_good { background: #e9f3e4; color: #5f8f52; }
  .log-badge.b-cared   { background: #fdeee9; color: #d67d6b; }
  .log-badge.b-hidden  { background: #fdf0dc; color: #c98a2e; }
  .log-badge.b-coax    { background: #ffe3de; color: #c9453a; }
  .log-badge.b-skipped { background: #f0ece9; color: #9a8c84; }
  .log-text {
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .log-item.expanded .log-text { display: block; -webkit-line-clamp: unset; overflow: visible; }
  .star-btn {
    float: right; background: none; border: none; font-size: 16px;
    cursor: pointer; padding: 0 4px; width: auto; margin: 0; color: #d0bdb4;
  }
  /* ── 收藏卡片：默认收起，点标题展开 ── */
  .collapse-header { display: flex; justify-content: space-between; align-items: center; cursor: pointer; }
  .collapse-header h2 { margin-bottom: 0; }
  .collapse-arrow { color: #c0aca3; font-size: 12px; }
  .collapsed-body { display: none; padding-top: 10px; }
  .collapsed-body.open { display: block; }
  /* ── 吃醋巡检卡片改版 ── */
  .jealousy-card { text-align: center; padding: 18px 14px 12px; }
  .avatar-section { position: relative; display: inline-block; margin-bottom: 10px; }
  .avatar-ring {
    width: 76px; height: 76px; border-radius: 50%;
    border: 3px solid #f3d5cc;
    display: flex; align-items: center; justify-content: center;
    overflow: visible; position: relative;
    background: #fef8f5;
  }
  .avatar-img {
    width: 64px; height: 64px; border-radius: 50%;
    background: #fdeee9 center/cover no-repeat;
    display: flex; align-items: center; justify-content: center;
    font-size: 28px;
  }
  .coax-hand {
    position: absolute; right: -6px; bottom: -4px;
    width: 30px; height: 30px; border-radius: 50%;
    background: #fff; box-shadow: 0 2px 6px rgba(180,140,120,.25);
    display: flex; align-items: center; justify-content: center;
    font-size: 16px; cursor: pointer; user-select: none;
    transition: transform .15s;
  }
  .coax-hand:active { transform: scale(1.2); }
  .coax-hand.coaxing { animation: coaxPulse .5s ease; }
  @keyframes coaxPulse {
    0% { transform: scale(1); }
    50% { transform: scale(1.35); }
    100% { transform: scale(1); }
  }
  .bottom-actions {
    display: flex; gap: 10px; margin-top: 12px;
  }
  .action-btn {
    flex: 1; border: none; border-radius: 12px; padding: 10px 6px;
    background: #fdeee9; color: #d67d6b; font-size: 18px;
    cursor: pointer; transition: background .15s;
  }
  .action-btn:active { background: #fad9ce; }
  .action-btn.emergency { background: #fff0ee; color: #c95e4e; }
  .action-btn.emergency:active { background: #ffe0d9; }
  .action-btn-label { font-size: 11px; display: block; margin-top: 2px; }
  .meter-inline { display: flex; align-items: center; gap: 8px; justify-content: center; margin: 6px 0; }
  .meter-inline .meter-value { font-size: 26px; font-weight: 700; color: #d67d6b; }
  .meter-inline .meter-tier { font-size: 13px; }
</style>
</head>
<body>
  <h1>🌸 温柔巡检宝宝</h1>
  <div class="sub">改完点保存就生效，工作流那边不用再动</div>

  <div class="card jealousy-card">
    <div class="avatar-section">
      <div class="avatar-ring" id="avatarRing">
        <div class="avatar-img" id="avatarImg">🐱</div>
        <div class="coax-hand" id="coaxHand" title="摸摸头哄哄它">👋</div>
      </div>
    </div>
    <div class="meter-inline">
      <span class="meter-value" id="jv">0</span>
      <span class="meter-tier" id="jt">温柔档</span>
    </div>
    <div class="meter-bar"><div class="meter-fill" id="jbar" style="width:0%"></div></div>
    <div class="meter-marks"><span id="m0">0</span><span id="m1">30</span><span id="m2">60</span><span id="m3">90</span></div>
    <div class="hidden-apps" id="hiddenApps"></div>
    <div style="margin-top:12px">
      <label style="text-align:left">角色卡名称</label>
      <input type="text" id="character_card_name" placeholder="和 Operit 里的角色卡完全一致">
    </div>
    <div class="bottom-actions" style="justify-content:center">
      <button class="action-btn emergency" id="unhideBtn" title="紧急解除全部隐藏，醋值清零" style="max-width:180px">🆘<span class="action-btn-label">紧急解除</span></button>
    </div>
    <input type="file" id="avatarInput" accept="image/*" style="display:none">
    <div class="hint" style="margin-top:8px;font-size:11px;line-height:1.5;color:#a68b7f" id="avatarHint">
      ⚠️ <b>第一次使用请手动设置</b>：点上方头像上传一张图，并在框里填角色卡名字。<br>
      （由于技术限制，角色卡头像和名字都没法自动读取到，只能辛苦你手动填一次，之后就一直用它）
    </div>
  </div>

  <div class="card">
    <h2>醋值变动记录</h2>
    <div id="jlog"><div class="empty">还没有记录～</div></div>
  </div>

  <div class="card">
    <h2>基础设置</h2>
    <label>你的名字（AI 怎么称呼你）</label>
    <input type="text" id="user_name" placeholder="宝宝">
    <label>巡检对话标题</label>
    <input type="text" id="chat_query" placeholder="必填，Operit 里巡检对话的标题">
    <div class="hint">巡检消息将发送到这个 Operit 对话</div>
  </div>

  <div class="card">
    <h2>关心阈值</h2>
    <label>默认阈值（分钟）</label>
    <input type="number" id="default_threshold_minutes" min="5">
    <label>特殊阈值（每行一条：包名=分钟）</label>
    <textarea id="special_thresholds" placeholder="com.xingin.xhs=180&#10;com.anthropic.claude=60"></textarea>
    <div class="hint" id="special_thresholds_names"></div>
    <label>白名单（每行一个包名，这些不检查也永远不会被藏）</label>
    <textarea id="whitelist"></textarea>
    <div class="hint" id="whitelist_names"></div>
    <div class="hint" style="color:#c95e4e;font-weight:600">⚠️ 白名单必须填准确的完整包名，填错保护就不生效！不确定的话直接在对话里让 AI 帮你查（比如「帮我查一下QQ的正确包名」），确认后再填进来</div>
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
    <div class="switch-row"><span>📱 偷看一眼当前屏幕（吃醋到藏应用档以上才看）</span><input type="checkbox" id="allow_screenshot"></div>
    <div class="switch-row"><span>📷 醋值 75 以上申请拍一张看看你（对话里问你同不同意）</span><input type="checkbox" id="allow_camera"></div>
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

  <div class="card" style="margin-top:12px">
    <div class="collapse-header" id="archiveHeader">
      <h2>⭐ 收藏的瞬间 <span id="archiveCount" style="font-weight:400;color:#c0aca3"></span></h2>
      <span class="collapse-arrow" id="archiveArrow">▸ 点开看看</span>
    </div>
    <div id="archiveBody" class="collapsed-body">
      <div id="archiveLog"><div class="empty">还没有收藏的记录～在日志里点 ☆ 就可以收到这里</div></div>
    </div>
  </div>

<script>
  var $ = function (id) { return document.getElementById(id); };
  var STATUS_LABEL = { all_good: "一切安好", cared: "表达关心", hidden: "吃醋隐藏", coax: "生气要哄", skipped: "跳过" };
  var STATUS_CLASS = { all_good: "b-all_good", cared: "b-cared", hidden: "b-hidden", coax: "b-coax", skipped: "b-skipped" };
  function badgeClass(s) { return STATUS_CLASS[s] || "b-cared"; }
  var TIER_LABEL = { calm: "温柔", sulky: "小委屈", hide: "吃醋了", coax: "要哄" };

  // 包名 → 应用名：面板展示用（变动记录/藏应用/阈值提示）。不在表里的原样显示包名。
  var APP_NAMES = {
    "com.xingin.xhs": "小红书",
    "com.tencent.mm": "微信",
    "com.tencent.mobileqq": "QQ",
    "com.anthropic.claude": "Claude",
    "com.ai.assistance.operit": "Operit",
    "tv.danmaku.bili": "哔哩哔哩",
    "com.ss.android.ugc.aweme": "抖音",
    "com.smile.gifmaker": "快手",
    "com.zhihu.android": "知乎",
    "com.sina.weibo": "微博",
    "com.taobao.taobao": "淘宝",
    "com.jingdong.app.mall": "京东",
    "com.xunmeng.pinduoduo": "拼多多",
    "com.netease.cloudmusic": "网易云音乐",
    "com.tencent.qqmusic": "QQ音乐",
    "com.miHoYo.Yuanshen": "原神",
    "com.miHoYo.hkrpg": "崩坏：星穹铁道",
    "com.tencent.tmgp.sgame": "王者荣耀",
    "com.douban.frodo": "豆瓣",
    "com.eg.android.AlipayGphone": "支付宝",
    "com.sankuai.meituan": "美团",
    "me.ele": "饿了么",
    "com.dragon.read": "番茄小说",
    "com.ss.android.article.news": "今日头条",
    "com.baidu.tieba": "百度贴吧",
    "com.google.android.youtube": "YouTube",
    "com.twitter.android": "X (Twitter)",
    "com.instagram.android": "Instagram",
    "com.openai.chatgpt": "ChatGPT"
  };
  function appName(pkg) { return APP_NAMES[pkg] || pkg; }

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
    renderPkgNameHints();
  }

  // 把阈值/白名单里的包名翻译成应用名显示在输入框下面，方便确认没填错
  function renderPkgNameHints() {
    var kv = textToKv($("special_thresholds").value, false);
    var parts = Object.keys(kv).map(function (k) { return appName(k) + " " + kv[k] + "分钟"; });
    $("special_thresholds_names").textContent = parts.length ? "识别为：" + parts.join("｜") : "";
    var wl = linesToArr($("whitelist").value).map(appName);
    $("whitelist_names").textContent = wl.length ? "识别为：" + wl.join("、") : "";
  }
  $("special_thresholds").addEventListener("input", renderPkgNameHints);
  $("whitelist").addEventListener("input", renderPkgNameHints);

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
    $("m0").textContent = "0 温柔";
    $("m1").textContent = tiers.sulky + " 委屈";
    $("m2").textContent = tiers.hide + " 藏";
    $("m3").textContent = tiers.coax + " 要哄";
    var hidden = (state && state.hidden_apps) || [];
    $("hiddenApps").innerHTML = hidden.length
      ? "🙈 藏起来的应用：<b>" + hidden.map(appName).join("、") + "</b>"
      : "现在没有应用被藏起来～";
  }

  function renderJealousyLog(state) {
    var box = $("jlog");
    var hist = (state && state.history) || [];
    if (!hist.length) {
      box.innerHTML = '<div class="empty">还没有记录～</div>';
      return;
    }
    box.innerHTML = hist.slice(0, 8).map(function (e) {
      var t = (e.time || "").replace("T", " ").slice(5, 16);
      var d = e.delta > 0 ? '<span class="delta-up">+' + e.delta + '</span>'
            : e.delta < 0 ? '<span class="delta-down">' + e.delta + '</span>' : "·";
      var app = e.app ? " " + appName(e.app) : "";
      return '<div class="log-item compact"><span class="log-time">' + t + '</span> ' +
             (e.reason || "") + app + '</div>';
    }).join("");
  }

  // 最近的巡检：只留5条，长文本默认折成2行，点条目展开
  function renderLog(entries) {
    var box = $("log");
    if (!entries || !entries.length) {
      box.innerHTML = '<div class="empty">还没有记录～</div>';
      return;
    }
    box.innerHTML = entries.slice(0, 5).map(function (e, i) {
      var t = (e.time || "").replace("T", " ").slice(5, 16);
      var badge = STATUS_LABEL[e.status] || e.status || "";
      var msg = e.message_sent ? '<div class="log-text">💌 ' + e.message_sent + '</div>' : '';
      var archiveBtn = '<button class="star-btn archive-star" data-idx="' + i + '" title="收藏这个瞬间">☆</button>';
      return '<div class="log-item"><span class="log-time">' + t + '</span>' +
             '<span class="log-badge ' + badgeClass(e.status) + '">' + badge + '</span>' + archiveBtn +
             '<div class="log-text">' + (e.summary || "") + '</div>' + msg + '</div>';
    }).join("");
  }

  // ⭐ 日志区点击：点星星收藏，点条目本身展开/收起长文本（事件委托）
  var logBox = $("log");
  logBox.addEventListener("click", async function (e) {
    var btn = e.target.closest(".archive-star");
    if (!btn) {
      var item = e.target.closest(".log-item");
      if (item) item.classList.toggle("expanded");
      return;
    }
    var idx = parseInt(btn.getAttribute("data-idx"));
    if (isNaN(idx)) return;
    btn.textContent = "⏳";
    try {
      var res = JSON.parse(await Guardian.toggleArchive(idx));
      if (res.success) {
        await refreshLogs();
      } else {
        btn.textContent = "☆";
      }
    } catch (err) {
      btn.textContent = "☆";
    }
  });

  // ⭐ 显示收藏（每条带 ★，点 ★ 移回日志）
  function renderArchive(entries) {
    var box = $("archiveLog");
    if (!box) return;
    var n = (entries && entries.length) || 0;
    $("archiveCount").textContent = n ? "(" + n + ")" : "";
    if (!n) {
      box.innerHTML = '<div class="empty">还没有收藏的记录～在日志里点 ☆ 就可以收到这里</div>';
      return;
    }
    box.innerHTML = entries.slice(0, 20).map(function (e, i) {
      var t = (e.time || "").replace("T", " ").slice(5, 16);
      var badge = STATUS_LABEL[e.status] || e.status || "";
      var msg = e.message_sent ? '<div class="log-text">💌 ' + e.message_sent + '</div>' : '';
      var unstar = '<button class="star-btn archive-unstar" data-idx="' + i + '" title="取消收藏，移回日志" style="color:#e8927c">★</button>';
      return '<div class="log-item"><span class="log-time">' + t + '</span>' +
             '<span class="log-badge ' + badgeClass(e.status) + '">' + badge + '</span>' + unstar +
             '<div class="log-text">' + (e.summary || "") + '</div>' + msg + '</div>';
    }).join("");
  }

  // 收藏卡片：默认收起，点标题展开
  $("archiveHeader").addEventListener("click", function () {
    var body = $("archiveBody");
    var open = body.classList.toggle("open");
    $("archiveArrow").textContent = open ? "▾ 收起" : "▸ 点开看看";
  });

  // 收藏区点击：点 ★ 取消收藏，点条目展开长文本
  $("archiveLog").addEventListener("click", async function (e) {
    var btn = e.target.closest(".archive-unstar");
    if (!btn) {
      var item = e.target.closest(".log-item");
      if (item) item.classList.toggle("expanded");
      return;
    }
    var idx = parseInt(btn.getAttribute("data-idx"));
    if (isNaN(idx)) return;
    btn.textContent = "⏳";
    try {
      var res = JSON.parse(await Guardian.restoreArchive(idx));
      if (res.success) await refreshLogs();
      else btn.textContent = "★";
    } catch (err) {
      btn.textContent = "★";
    }
  });

  // 日志 + 收藏一起刷新
  async function refreshLogs() {
    try {
      var logRaw = await Guardian.loadLog();
      renderLog(logRaw ? JSON.parse(logRaw) : []);
    } catch (e) {}
    try {
      var arcRaw = await Guardian.loadArchive();
      renderArchive(arcRaw ? JSON.parse(arcRaw) : []);
    } catch (e) {}
  }

  function setStatus(text) {
    $("status").textContent = text;
    if (text) setTimeout(function () { $("status").textContent = ""; }, 3000);
  }

  var currentCfg = DEFAULTS;

  // 🐱 头像：手动设置的优先，其次角色卡备份/avatars 目录，都没有就默认猫咪
  async function loadAvatar() {
    try {
      var avatarData = await Guardian.loadAvatar(currentCfg.character_card_name);
      if (avatarData) {
        var parsed = JSON.parse(avatarData);
        if (parsed.base64) {
          $("avatarImg").style.backgroundImage = "url(data:image/png;base64," + parsed.base64 + ")";
          $("avatarImg").textContent = "";
          return;
        }
      }
    } catch (e) { /* 加载不到就用默认 */ }
    $("avatarImg").textContent = "🐱";
    $("avatarImg").style.backgroundImage = "";
    $("avatarHint").textContent = "没抓到角色卡头像～点头像手动选一张，设置一次就一直用它";
  }

  // 点头像 → 手动选一张图设为固定头像（存到插件目录，之后 loadAvatar 最优先用它）
  var avatarInput = $("avatarInput");
  $("avatarImg").addEventListener("click", function () {
    avatarInput.click();
  });
  avatarInput.addEventListener("change", function () {
    var file = avatarInput.files[0];
    if (!file) return;
    setStatus("⏳ 设置头像中...");
    var reader = new FileReader();
    reader.onload = async function (e) {
      var b64 = e.target.result;
      var commaIdx = b64.indexOf(",");
      if (commaIdx > -1) b64 = b64.slice(commaIdx + 1);
      try {
        var res = JSON.parse(await Guardian.saveAvatar(b64));
        if (res.success) {
          $("avatarImg").style.backgroundImage = "url(data:image/png;base64," + b64 + ")";
          $("avatarImg").textContent = "";
          $("avatarHint").textContent = "👋摸摸头像可以哄它 · 点头像可以换头像 · 📷拍照后AI能看到";
          setStatus("🐱 头像设置好啦");
        } else {
          setStatus("头像保存失败：" + (res.message || ""));
        }
      } catch (err) {
        setStatus("头像保存失败：" + err.message);
      }
    };
    reader.readAsDataURL(file);
    avatarInput.value = "";
  });

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
    try {
      var arcRaw = await Guardian.loadArchive();
      if (arcRaw) renderArchive(JSON.parse(arcRaw));
    } catch (e) { /* 没有归档就算了 */ }
    await loadAvatar();
  }

  $("save").addEventListener("click", async function () {
    var cfg = readForm();
    if (!cfg.character_card_name || !cfg.chat_query) {
      setStatus("⚠️ 角色卡名称和巡检对话标题是必填的哦");
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

  // （摇一摇功能已移除：WebView 不支持设备运动传感器）

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

  // 👋 摸摸头哄它：点击头像上的小手消2点醋
  $("coaxHand").addEventListener("click", async function () {
    var hand = $("coaxHand");
    hand.classList.add("coaxing");
    setTimeout(function() { hand.classList.remove("coaxing"); }, 500);
    try {
      var per = 2;
      var res = JSON.parse(await Guardian.shakeCoax(per));
      if (res.success) {
        setStatus("🤲 哄好啦！醋值 " + res.before + " → " + res.jealousy +
          (res.released && res.released.length ? "，应用放出来啦！" : ""));
        var sRaw = await Guardian.loadState();
        var state = sRaw ? JSON.parse(sRaw) : null;
        renderMeter(state, currentCfg);
        renderJealousyLog(state);
      } else {
        setStatus("没哄动：" + res.message);
      }
    } catch (e) {
      setStatus("哄失败：" + e.message);
    }
  });

  // （吹气功能已移除：WebView不支持麦克风）


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
}
exports.default = Screen;
