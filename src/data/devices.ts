/**
 * 设备展示页数据源（纯内容）。
 * 页面展示与筛选规则由 src/config/devicesConfig.ts 控制。
 */
import type { DeviceItem } from "@/types/devicesConfig";

export const devicesData: DeviceItem[] = [
	{
		id: "iqoo-z9-turbo-plus",
		name: "iQOO Z9 Turbo+",
		brand: "iQOO",
		category: "mobile",
		status: "active",
		specs: "天玑 9300+ · 6400mAh · 1.5K 144Hz",
		description: "现在正在用的手机，也是这台博客的“生产设备”。",
		icon: "material-symbols:smartphone",
		year: "2024",
		featured: true,
	},
	{
		id: "moondrop-chu3",
		name: "水月雨竹3",
		brand: "MOONDROP 水月雨",
		category: "audio",
		status: "active",
		specs: "动圈入耳 · 0.78 双针可换线 · 16Ω",
		description: "百元档的入门动圈，声音偏暖、好推，日常听歌很舒服。",
		icon: "material-symbols:headphones-rounded",
	},
	{
		id: "ipad-2017",
		name: "iPad (2017)",
		brand: "Apple",
		category: "mobile",
		status: "backup",
		specs: "9.7 英寸 · A9",
		description: "2017 年的老 iPad，还在发挥余热。",
		icon: "material-symbols:tablet",
		year: "2017",
	},
	{
		id: "mystery-desktop",
		name: "神秘台式机",
		brand: "DIY",
		category: "desk",
		status: "active",
		specs: "自组台式机 · 配置暂保密",
		description: "就是它，那台神秘的主力机。",
		icon: "material-symbols:desktop-windows",
	},
	{
		id: "razer-blackwidow-ultimate",
		name: "雷蛇黑寡妇蜘蛛终极版",
		brand: "Razer",
		category: "peripheral",
		status: "active",
		specs: "机械键盘 · 背光",
		description: "经典黑寡妇系列机械键盘，敲击手感很直接。",
		icon: "material-symbols:keyboard",
	},
];