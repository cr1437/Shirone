/**
 * 时间线页数据源（纯内容）。
 * 页面展示与筛选规则由 src/config/timelineConfig.ts 控制。
 */
import type { TimelineItem } from "@/types/timelineConfig";

// 时间线数据（暂未添加，后续在下方数组中追加即可）
export const timelineData: TimelineItem[] = [{ highlights: [], tags: [], featured: false, title: "建站日期", date: "2026.10.7", links: [], category: "project" }];

/** 获取所有时间线数据列表 */
export function getTimelineList(): TimelineItem[] {
	return timelineData;
}