/**
 * 站点罗盘数据（本地数据源）。
 * 用途：src/pages/compass.astro → organisms/CompassSection → molecules/CompassTile。
 * 添加站点：往对应 Shelf.entries 追加一项；数组顺序即展示顺序。
 * - icon：Iconify 名（material-symbols:xxx）或图片 URL（http(s)/绝对路径）；
 *   省略时瓷砖显示 label 首字母 tonal 块（不自动抓取 favicon）。
 * - image：用户自定义图片 URL（http(s)/绝对路径），优先于 icon 渲染；
 *   加载失败自动降级为首字母块。
 */

/** 单条站点记录 */
export interface CompassEntry {
	/** 站点名（瓷砖标题） */
	label: string;
	/** 外链地址 */
	href: string;
	/** 一句话说明（瓷砖副行；省略则显示域名） */
	note?: string;
	/** 图标：Iconify 名或图片 URL；省略 = 首字母兜底 */
	icon?: string;
	/** 用户自定义图片（http(s)/绝对路径）：优先于 icon 渲染；省略则走 icon/首字母 */
	image?: string;
}

/** 分组（Shelf = 罗盘上的收纳格） */
export interface CompassShelf {
	/** 锚点 id（字母数字，作分组定位与跳转） */
	key: string;
	/** 分组名 */
	name: string;
	/** 分组图标（Iconify 名，SectionTitle 行首） */
	icon?: string;
	/** 分组副文案（标题下弱文本，可选） */
	blurb?: string;
	entries: CompassEntry[];
}

// 罗盘数据
export const compassData: CompassShelf[] = [
	{
		key: "ai",
		name: "AI 服务",
		icon: "material-symbols:smart-toy-rounded",
		blurb: "常用 AI 服务与模型平台",
		entries: [
			{
				label: "DeepSeek",
				href: "https://www.deepseek.com/",
				note: "深度求索 AI 官网",
				icon: "simple-icons:deepseek",
			},
			{
				label: "硅基流动",
				href: "https://siliconflow.cn/",
				note: "大模型 API 云服务平台",
				icon: "material-symbols:cloud-outline-rounded",
			},
		],
	},
	{
		key: "tools",
		name: "实用工具",
		icon: "material-symbols:handyman-rounded",
		blurb: "日常好用的小工具",
		entries: [
			{
				label: "临时邮箱",
				href: "https://temp-mail.io/zh",
				note: "一次性匿名收件箱",
				icon: "material-symbols:mail-outline-rounded",
			},
			{
				label: "菜鸟工具",
				href: "https://www.jyshare.com/",
				note: "在线编辑器与开发工具集",
				icon: "material-symbols:code-rounded",
			},
			{
				label: "格式转换",
				href: "https://www.freeconvert.com/zh-CN",
				note: "FreeConvert · 在线文件转换",
				icon: "material-symbols:swap-horiz-rounded",
			},
		],
	},
];