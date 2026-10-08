/**
 * 技能页数据源（纯内容）。
 * 页面展示与筛选规则由 src/config/skillsConfig.ts 控制。
 */
import type { SkillItem } from "@/types/skillsConfig";

// 技能数据
export const skillsData: SkillItem[] = [
	{
		name: "Kotlin",
		description: "Android 开发主力语言，日常生产力。",
		icon: "simple-icons:kotlin",
		category: "app",
		level: "advanced",
	},
	{
		name: "JavaScript",
		description: "网页交互与脚本的万能胶。",
		icon: "simple-icons:javascript",
		category: "web",
		level: "advanced",
	},
	{
		name: "TypeScript",
		description: "给 JavaScript 加上类型的安全感。",
		icon: "simple-icons:typescript",
		category: "web",
		level: "advanced",
	},
	{
		name: "Java",
		description: "最扎实的底子，Android 与后端都写过。",
		icon: "simple-icons:openjdk",
		category: "app",
		level: "expert",
	},
	{
		name: "Python",
		description: "脚本、自动化与数据处理的好帮手。",
		icon: "simple-icons:python",
		category: "data",
		level: "expert",
	},
	{
		name: "C++",
		description: "算法与性能的硬功夫。",
		icon: "simple-icons:cplusplus",
		category: "system",
		level: "expert",
	},
	{
		name: "Go",
		description: "入门中：喜欢它的简洁与并发。",
		icon: "simple-icons:go",
		category: "system",
		level: "beginner",
	},
	{
		name: "Rust",
		description: "入门中：冲着安全与高性能来的。",
		icon: "simple-icons:rust",
		category: "system",
		level: "beginner",
	},
	{
		name: "PHP",
		description: "入门中：经典建站语言。",
		icon: "simple-icons:php",
		category: "web",
		level: "beginner",
	},
	{
		name: "SQL",
		description: "入门中：数据库的增删改查。",
		icon: "simple-icons:mysql",
		category: "data",
		level: "beginner",
	},
];

/** 获取所有技能数据列表 */
export function getSkillsList(): SkillItem[] {
	return skillsData;
}