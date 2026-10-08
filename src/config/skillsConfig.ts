import type { SkillsConfig } from "@/types/skillsConfig";
import { withUserConfig } from "../utils/config-overlay.ts";

/**
 * 技能页行为与展示配置。
 *
 * 遵循「配置管行为，数据管内容」原则：
 * - enable：页面总开关；false 时导航入口同步隐藏，访问 /skills/ 跳转 404；
 * - categories：筛选分类清单（数组顺序即页面顶部 Chips 顺序）；
 * - disabledNames：可选被禁用的技能名称列表（例如 ["PHP"]）；
 *
 * 注：技能的具体内容数据（技能名称、熟练度等级、图标、描述等）请在 `src/data/skills.ts` 中维护。
 */
export const skillsConfig: SkillsConfig = withUserConfig("skills", {
	enable: true,
	title: "$t:skills",
	description: "$t:skillsBanner",
	categories: [
		{
			key: "app",
			label: "App 开发",
			icon: "material-symbols:android-rounded",
		},
		{
			key: "web",
			label: "Web 开发",
			icon: "material-symbols:web-rounded",
		},
		{
			key: "system",
			label: "系统编程",
			icon: "material-symbols:memory-rounded",
		},
		{
			key: "data",
			label: "数据与脚本",
			icon: "material-symbols:database-rounded",
		},
	],
	// disabledNames: [],
});
