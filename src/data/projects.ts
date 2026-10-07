/**
 * 项目页数据源（纯内容）。
 * 页面展示与筛选规则由 src/config/projectsConfig.ts 控制。
 */
import type { ProjectItem } from "@/types/projectsConfig";

export const projectsData: ProjectItem[] = [
	{
		key: "shizako",
		title: "Shizako",
		summary:
			"猫耳看板娘的系统权限助手：免 Root 也能用特权 API，兼容 Shizuku-API 生态，官方 SDK 应用零改动直连。",
		category: "android",
		phase: "shipped",
		technologies: ["Kotlin", "Java", "Android"],
		icon: "simple-icons:android",
		featured: true,
		repository: "https://github.com/cr1437/Shizako",
	},
];

/** 获取所有项目数据列表 */
export function getProjectsList(): ProjectItem[] {
	return projectsData;
}
