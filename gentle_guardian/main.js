/*
 * gentle_guardian — ToolPkg 入口
 *
 * 职责只有一个：把侧边栏设置面板注册进 Operit 的工具箱。
 * 真正干活的逻辑都在 packages/gentle_guardian_tools.js（AI 工具）
 * 和 ui/guardian_panel/index.ui.js（设置面板）里。
 *
 * ⚠️ 装机前请对照 SandboxPackage_DEV 里 examples/emotion_mixologist/main.js
 * 核对 registerUiRoute 的真实签名——下面是按开发简报里的描述写的，
 * 参数名如有出入以 examples 为准。
 */

registerUiRoute({
    id: "gentle_guardian_panel",
    title: "温柔巡检宝宝",
    icon: "favorite",
    entry: "ui/guardian_panel/index.ui.js",
    sidebar: true
});

console.log("Gentle Guardian 温柔巡检宝宝已加载");
