/**
 * 技能页数据源（纯内容）。
 * 页面展示与筛选规则由 src/config/skillsConfig.ts 控制。
 */
import type { SkillItem } from "@/types/skillsConfig";
import { IS_EN_BUILD } from "@utils/build-locale";

// 技能数据
export const skillsData: SkillItem[] = [
	{
		name: "Kotlin",
		description: IS_EN_BUILD
			? "Primary language for Android development — my daily driver."
			: "Android 开发主力语言，日常生产力。",
		icon: "simple-icons:kotlin",
		category: "app",
		level: "advanced",
	},
	{
		name: "JavaScript",
		description: IS_EN_BUILD ? "The duct tape of the web." : "网页交互与脚本的万能胶。",
		icon: "simple-icons:javascript",
		category: "web",
		level: "advanced",
	},
	{
		name: "TypeScript",
		description: IS_EN_BUILD ? "JavaScript with a safety net of types." : "给 JavaScript 加上类型的安全感。",
		icon: "simple-icons:typescript",
		category: "web",
		level: "advanced",
	},
	{
		name: "Java",
		description: IS_EN_BUILD
			? "My solid foundation; written both Android and backend with it."
			: "最扎实的底子，Android 与后端都写过。",
		icon: "simple-icons:openjdk",
		category: "app",
		level: "expert",
	},
	{
		name: "Python",
		description: IS_EN_BUILD
			? "Handy for scripting, automation and data work."
			: "脚本、自动化与数据处理的好帮手。",
		icon: "simple-icons:python",
		category: "data",
		level: "expert",
	},
	{
		name: "C++",
		description: IS_EN_BUILD ? "Algorithms and performance, the hard way." : "算法与性能的硬功夫。",
		icon: "simple-icons:cplusplus",
		category: "system",
		level: "expert",
	},
	{
		name: "Go",
		description: IS_EN_BUILD ? "Learning — love its simplicity and concurrency." : "入门中：喜欢它的简洁与并发。",
		icon: "simple-icons:go",
		category: "system",
		level: "beginner",
	},
	{
		name: "Rust",
		description: IS_EN_BUILD ? "Learning — here for safety and performance." : "入门中：冲着安全与高性能来的。",
		icon: "simple-icons:rust",
		category: "system",
		level: "beginner",
	},
	{
		name: "PHP",
		description: IS_EN_BUILD ? "Learning — the classic language for building websites." : "入门中：经典建站语言。",
		icon: "simple-icons:php",
		category: "web",
		level: "beginner",
	},
	{
		name: "SQL",
		description: IS_EN_BUILD ? "Learning — CRUD and the world of databases." : "入门中：数据库的增删改查。",
		icon: "simple-icons:mysql",
		category: "data",
		level: "beginner",
	},
];

/** 获取所有技能数据列表 */
export function getSkillsList(): SkillItem[] {
	return skillsData;
}