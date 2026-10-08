import type { AnnouncementConfig } from "@/types/announcementConfig";
import { withUserConfig } from "../utils/config-overlay.ts";
import { IS_EN_BUILD } from "../utils/build-locale.ts";

/**
 * 公告栏配置
 * 组件显示由 sidebarConfig 统一控制
 */
export const announcementConfig: AnnouncementConfig = withUserConfig(
	"announcement",
	{
		title: "", // 公告标题，填空使用 i18n 字符串 Key.announcement
		content: IS_EN_BUILD
			? "Welcome to Churan's blog — dev notes, anime logs and daily life. Feel free to look around~"
			: "这里是初然的博客网站，会陆续写一些开发笔记、番剧记录和生活日常，欢迎随便逛逛～", // 公告内容
		closable: true, // 允许用户关闭公告
		link: {
			enable: true, // 启用链接
			text: IS_EN_BUILD ? "About me" : "关于我", // 链接文本
			url: "/about/", // 链接 URL
			external: false, // 外部链接
		},
	},
);
