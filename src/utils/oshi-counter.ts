/**
 * 「推し歴」天数计数器（#oshi-days）。
 *
 * 口径：自 2020-04-18 起按天计（含当天为第 1 天），随本地日期自动更新。
 * 页面里服务端渲染的初始值只作兜底；这里在加载、swup 导航与页面重新可见时刷新，
 * 保证跨天之后无需重新构建也会变化。
 */
const OSHI_START = new Date(2020, 3, 18);

function resolveOshiDays(reference: Date): number {
	const today = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate());
	return Math.round((today.getTime() - OSHI_START.getTime()) / 86400000) + 1;
}

export function updateOshiDays(root: ParentNode = document, reference: Date = new Date()): void {
	const el = root.querySelector<HTMLElement>("#oshi-days");
	if (!el) return;
	const days = resolveOshiDays(reference);
	if (days > 0) el.textContent = String(days);
}

export function initOshiCounter(): void {
	updateOshiDays();
	if (document.documentElement.dataset.oshiCounterBound === "true") return;
	document.documentElement.dataset.oshiCounterBound = "true";
	document.addEventListener("swup:content:replace", () => updateOshiDays());
	document.addEventListener("swup:page:view", () => updateOshiDays());
	document.addEventListener("visibilitychange", () => {
		if (!document.hidden) updateOshiDays();
	});
}
