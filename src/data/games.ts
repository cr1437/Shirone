/**
 * 游戏展示页数据源（纯内容）。
 * 页面展示与筛选规则由 src/config/gamesConfig.ts 控制。
 *
 * 封面支持三种写法：
 * - src/assets 相对路径（走 Astro 图片管线自动优化为 webp/avif）；
 * - /public 绝对路径（如 "/assets/games/xxx.webp"，原样输出）；
 * - 远程 URL（https://…）。
 */
import type { GameItem } from "@/types/gamesConfig";

export const gamesData: GameItem[] = [
	{
		id: "minecraft",
		name: "Minecraft",
		developer: "Mojang Studios",
		category: "sandbox",
		status: "playing",
		cover: "assets/games/minecraft-hero.jpg",
		icon: "material-symbols:widgets-rounded",
		platform: "PC / Mobile",
		year: "2011",
		tags: ["沙盒", "生存", "建造"],
		description: "方块构成的沙盒世界：挖矿、合成、造房子，一个人或者和朋友们一起，想到什么就造什么。",
		link: "https://www.minecraft.net/",
		featured: true,
	},
	{
		id: "jixing-party",
		name: "吉星派对",
		developer: "飞魔游戏",
		category: "casual",
		status: "playing",
		cover: "assets/games/jixing-hero.webp",
		icon: "material-symbols:extension-outline-rounded",
		platform: "PC / Mobile",
		year: "2026",
		tags: ["派对", "联机", "欢乐"],
		description: "最多 4 人联机的派对游戏：用角色技能和手牌互相“整活”，恶搞卡通风，一局一个“友尽”现场。",
		link: "https://se.feimogames.com/home",
	},
	{
		id: "reverse-1999",
		name: "重返未来：1999",
		developer: "深蓝互动",
		category: "rpg",
		status: "playing",
		cover: "assets/games/re1999-hero.webp",
		icon: "material-symbols:auto-awesome-outline-rounded",
		platform: "PC / Mobile",
		year: "2023",
		tags: ["RPG", "复古", "神秘学"],
		description: "复古神秘学题材的卡牌 RPG：穿梭不同时代、收编神秘学家，美术与演出都很有味道。",
		link: "https://store.steampowered.com/app/3092660/",
	},
	{
		id: "needy-streamer-overload",
		name: "主播女孩重度依赖",
		developer: "xemono",
		category: "casual",
		status: "completed",
		cover: "assets/games/needy-hero.webp",
		icon: "material-symbols:heart-broken-outline-rounded",
		platform: "PC",
		year: "2022",
		tags: ["ADV", "心理", "主播"],
		description: "陪“网络天使”一路冲向百万粉丝的 ADV：表面粉粉嫩嫩，后劲有点大。",
		link: "https://store.steampowered.com/app/1451940/",
	},
];