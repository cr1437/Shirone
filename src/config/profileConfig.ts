import type { ProfileConfig } from "@/types/config";
import { withUserConfig } from "../utils/config-overlay.ts";

/**
 * 博主资料：头像 / 名称 / 简介 / 社交链接（侧栏 Profile 卡片、页脚、RSS 作者等消费）。
 * 类型见 src/types/config.ts。
 */
export const profileConfig: ProfileConfig = withUserConfig("profile", {
	avatar: "/images/churan-avatar.gif",
	name: "初然",
	bio: "悲观者永远正确 乐观者正在前行",
	links: [
		{
			name: "GitHub",
			icon: "fa7-brands:github",
			url: "https://github.com/cr1437",
		},
		{
			name: "Bilibili",
			icon: "fa7-brands:bilibili",
			url: "https://space.bilibili.com/2101448217",
		},
		{
			name: "Email",
			icon: "material-symbols:mail-outline-rounded",
			url: "mailto:churan1437@outlook.com",
		},
	],
});
