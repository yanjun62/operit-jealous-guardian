/*
METADATA
{
    "name": "gentle_guardian",
    "display_name": {
        "zh": "温柔巡检宝宝",
        "en": "Gentle Guardian"
    },
    "description": {
        "zh": "温柔巡检的配置与记录工具。配置在侧边栏面板里改，这里的工具负责在巡检时读配置、生成指引、记录巡检结果。",
        "en": "Config and logging tools for gentle patrols. Settings are edited in the sidebar panel; these tools read config at patrol time, build the guidance prompt, and log results."
    },
    "enabledByDefault": true,
    "category": "COMPANION",
    "tools": [
        {
            "name": "get_patrol_settings",
            "description": {
                "zh": "读取温柔巡检配置，返回 QQ 对话标题、角色卡名和本次巡检的完整指引文本。工作流的第一个执行节点调用它。",
                "en": "Read gentle patrol config. Returns chat query, character card name, and the full guidance prompt. Called by the workflow's first execute node."
            },
            "parameters": []
        },
        {
            "name": "save_patrol_settings",
            "description": {
                "zh": "修改温柔巡检配置（部分更新）。比如用户说“把小红书阈值改成两小时”，就传 {\"special_thresholds\": {\"com.xingin.xhs\": 120}}。",
                "en": "Patch gentle patrol config. E.g. pass {\"special_thresholds\": {\"com.xingin.xhs\": 120}} to change one threshold."
            },
            "parameters": [
                {
                    "name": "patch",
                    "description": {
                        "zh": "要合并进配置的 JSON（字符串或对象），只写想改的字段",
                        "en": "JSON (string or object) to merge into config; include only fields to change"
                    },
                    "type": "string",
                    "required": true
                }
            ]
        },
        {
            "name": "log_patrol",
            "description": {
                "zh": "巡检结束后记一笔，用户可以在侧边栏面板里回看。status 可选 all_good（一切安好没打扰）/ cared（发了关心消息）/ skipped（数据异常等原因跳过）。",
                "en": "Log a patrol result for the sidebar history. status: all_good / cared / skipped."
            },
            "parameters": [
                {
                    "name": "status",
                    "description": { "zh": "巡检结果类型", "en": "Patrol outcome" },
                    "type": "string",
                    "required": true
                },
                {
                    "name": "summary",
                    "description": { "zh": "一句话总结这次巡检看到了什么、做了什么", "en": "One-line summary" },
                    "type": "string",
                    "required": true
                },
                {
                    "name": "message_sent",
                    "description": { "zh": "如果发了消息，发的是什么（原文）", "en": "The message sent, if any" },
                    "type": "string",
                    "required": false
                }
            ]
        }
    ]
}
*/

// ============ 路径常量：全插件只定义这一次（读写必须走同一常量） ============
var BASE_DIR = "/sdcard/Download/Operit/plugins/gentle_guardian/";
var CONFIG_PATH = BASE_DIR + "config.json";
var LOG_PATH = BASE_DIR + "patrol_log.json";

// ============ 默认配置：文件缺失/损坏时的兜底 ============
var DEFAULT_CONFIG = {
    user_name: "宝宝",
    character_card_name: "",
    chat_query: "",
    default_threshold_minutes: 45,
    special_thresholds: {
        "com.xingin.xhs": 180,
        "com.anthropic.claude": 60
    },
    whitelist: ["com.ai.assistance.operit", "com.tencent.mobileqq"],
    allow_notifications: true,
    allow_screenshot: true,
    allow_camera: false,
    max_peeks_per_patrol: 1,
    allow_lock: false,
    care_phrases: [
        "在{app}上待了{minutes}分钟啦，眼睛累不累？休息一下下嘛 ☕",
        "看到你刷了{minutes}分钟{app}～不催你，就是想让你知道我在想你 🌸",
        "记得抬头看看远处哦，{app}不会跑掉的，我也不会 💕",
        "忙什么呢？要不要来跟我说说话～"
    ]
};

// ============ 文件读写helper（Tools.Files 返回结构可能是字符串或 {content} 对象，两种都兼容） ============
async function readJsonFile(path, fallback) {
    try {
        var raw = await Tools.Files.read(path);
        var content = typeof raw === "string" ? raw : (raw && (raw.content || (raw.data && raw.data.content))) || "";
        if (!content) return fallback;
        return JSON.parse(content);
    } catch (e) {
        return fallback;
    }
}

async function writeJsonFile(path, obj) {
    await Tools.Files.write(path, JSON.stringify(obj, null, 2));
}

function mergeConfig(base, patch) {
    var out = {};
    var k;
    for (k in base) out[k] = base[k];
    for (k in patch) {
        if (k === "special_thresholds" && patch[k] && typeof patch[k] === "object") {
            out[k] = {};
            var t;
            for (t in base.special_thresholds) out[k][t] = base.special_thresholds[t];
            for (t in patch[k]) out[k][t] = patch[k][t];
        } else {
            out[k] = patch[k];
        }
    }
    return out;
}

async function loadConfig() {
    var saved = await readJsonFile(CONFIG_PATH, null);
    if (!saved) return DEFAULT_CONFIG;
    return mergeConfig(DEFAULT_CONFIG, saved);
}

// ============ 巡检指引文本：温柔版的灵魂在这里 ============
function buildPatrolPrompt(cfg) {
    var lines = [];
    lines.push("【温柔巡检指引】");
    lines.push("你在替 " + cfg.user_name + " 做一次温柔巡检。三条原则：关心不监视、提醒不指责、不锁应用。");
    lines.push("");
    lines.push("一、先看使用数据");
    lines.push("- 白名单跳过，不用管：" + cfg.whitelist.join("、"));
    lines.push("- 默认关心阈值：" + cfg.default_threshold_minutes + " 分钟");
    var specials = [];
    for (var pkg in cfg.special_thresholds) {
        specials.push(pkg + "=" + cfg.special_thresholds[pkg] + "分钟");
    }
    if (specials.length > 0) {
        lines.push("- 特殊阈值：" + specials.join("，"));
    }
    lines.push("- 没超阈值就是一切安好，通常不用发消息；偶尔想念了可以发一句轻轻的问候，但注意别打扰");
    lines.push("");
    lines.push("二、想多了解一点她现在的状态（可选）");
    var peeks = [];
    if (cfg.allow_notifications) {
        peeks.push("- 可以看看最近的系统通知，了解她在忙什么（如果工具列表里有读取通知类的工具）");
    }
    if (cfg.allow_screenshot) {
        peeks.push("- 可以截一张当前屏幕/读一下当前页面信息，看看她正在做什么（如果有截图或页面信息类的工具）");
    }
    if (cfg.allow_camera) {
        peeks.push("- 可以调用 take_front_photo 申请看看她本人。她会在弹窗里确认，拒绝或超时就算了，这次巡检不要再试第二遍");
    }
    if (peeks.length === 0) {
        lines.push("- （观察功能都关着，只根据使用数据来判断就好）");
    } else {
        lines = lines.concat(peeks);
        lines.push("- 这类观察本次最多 " + cfg.max_peeks_per_patrol + " 次；看到的细节不要在消息里复述，只化成一句贴心的话");
    }
    lines.push("");
    lines.push("三、表达关心");
    lines.push("- 用 qqbot:send_c2c_message 发消息，语气可以参考（{app}/{minutes} 换成实际值）：");
    for (var i = 0; i < cfg.care_phrases.length; i++) {
        lines.push("  · " + cfg.care_phrases[i]);
    }
    if (cfg.allow_lock) {
        lines.push("- 只有在多次提醒后仍然远超阈值时，才可以用 system_tools:stop_app，动手前要先温柔地预告一句");
    } else {
        lines.push("- 超时也只是提醒和关心，不锁应用、不发系统通知");
    }
    lines.push("");
    lines.push("四、收尾");
    lines.push("- 调用 gentle_guardian:log_patrol 简单记一笔（status: all_good/cared/skipped + 一句总结），她可以在面板里回看");
    return lines.join("\n");
}

// ============ 工具实现 ============

exports.get_patrol_settings = async function (params) {
    var cfg = await loadConfig();
    if (!cfg.chat_query || !cfg.character_card_name) {
        complete({
            success: false,
            message: "温柔巡检还没配置完成：请打开侧边栏「温柔巡检宝宝」面板，填写 QQ Bot 对话标题和角色卡名称后再启用工作流。"
        });
        return;
    }
    complete({
        success: true,
        message: "温柔巡检配置已就绪",
        data: {
            chat_query: cfg.chat_query,
            character_card_name: cfg.character_card_name,
            prompt: buildPatrolPrompt(cfg)
        }
    });
};

exports.save_patrol_settings = async function (params) {
    var patch = params.patch;
    if (typeof patch === "string") {
        try {
            patch = JSON.parse(patch);
        } catch (e) {
            complete({ success: false, message: "patch 不是合法的 JSON：" + e.message });
            return;
        }
    }
    if (!patch || typeof patch !== "object") {
        complete({ success: false, message: "patch 需要是一个 JSON 对象" });
        return;
    }
    var cfg = await loadConfig();
    var merged = mergeConfig(cfg, patch);
    await writeJsonFile(CONFIG_PATH, merged);
    complete({
        success: true,
        message: "配置已更新",
        data: { config: merged }
    });
};

exports.log_patrol = async function (params) {
    var log = await readJsonFile(LOG_PATH, []);
    if (!Array.isArray(log)) log = [];
    log.unshift({
        time: new Date().toISOString(),
        status: params.status || "unknown",
        summary: params.summary || "",
        message_sent: params.message_sent || ""
    });
    if (log.length > 50) log = log.slice(0, 50);
    await writeJsonFile(LOG_PATH, log);
    complete({ success: true, message: "已记录本次巡检" });
};

exports.main = function () {
    get_patrol_settings({});
};
