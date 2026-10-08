import type { TrackDescriptor } from "@/types/musicConfig";

/**
 * 侧栏音乐本地曲目数据源。
 * 遵循「零额外负担」原则：配置与数据解耦，此处专用于管理本地曲目列表。
 *
 * 添加曲目：在 musicTracks 中追加一项即可：
 * - id: 唯一标识
 * - title: 曲目标题
 * - artist: 艺术家（可选）
 * - cover: 封面图地址（可选；推荐相对 /src，亦支持 /public 或绝对 URL）
 * - source: 音频文件地址（相对 /public 或绝对 URL）
 * - duration: 曲目时长（秒，可选）
 */
export const musicTracks: readonly TrackDescriptor[] = [
	{
		id: "i-have-no-friends",
		title: "i have no friends",
		artist: "s0rrow",
		cover: "assets/images/music/i-have-no-friends.webp",
		source: "/assets/music/url/i-have-no-friends.mp3",
		duration: 99,
	},
	{
		id: "unhappy",
		title: "unhappy",
		artist: "s0rrow",
		cover: "assets/images/music/unhappy.webp",
		source: "/assets/music/url/unhappy.mp3",
		duration: 98,
	},
	{
		id: "unknown-mother-goose",
		title: "アンノウン・マザーグース",
		artist: "wowaka/初音ミク",
		cover: "assets/images/music/unknown-mother-goose.webp",
		source: "/assets/music/url/unknown-mother-goose.mp3",
		duration: 279,
	},
	{
		id: "rolling-girl",
		title: "ローリンガール",
		artist: "wowaka/初音ミク",
		cover: "assets/images/music/rolling-girl.webp",
		source: "/assets/music/url/rolling-girl.mp3",
		duration: 190,
	},
];