/*
 * gentle_guardian — ToolPkg 入口
 *
 * 对照 emotion_mixologist/main.js 的真实 API 签名：
 *   - require UI 文件获取 Screen 函数
 *   - ToolPkg.registerUiRoute 注册侧边栏路由
 *   - ToolPkg.registerNavigationEntry 注册导航入口
 *   - exports.registerToolPkg 导出注册函数
 */

var __importDefault = function(mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var ui = __importDefault(require("./ui/guardian_panel/index.ui.js"));
var Screen = ui.default;

function registerToolPkg() {
    ToolPkg.registerUiRoute({
        id: "gentle_guardian_sidebar",
        runtime: "compose_dsl",
        screen: Screen,
        params: {},
        title: {
            zh: "🌸 温柔巡检宝宝",
            en: "🌸 Gentle Guardian",
        }
    });

    ToolPkg.registerNavigationEntry({
        id: "gentle_guardian_sidebar_entry",
        route: "toolpkg:com.operit.gentle_guardian:ui:gentle_guardian_sidebar",
        surface: "main_sidebar_plugins",
        title: {
            zh: "🌸 巡检宝宝",
            en: "🌸 Guardian",
        },
        order: 1,
    });

    return true;
}

exports.registerToolPkg = registerToolPkg;
