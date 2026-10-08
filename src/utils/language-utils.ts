import { siteConfig } from "../config/siteConfig.ts";
/** 当前构建是否为英文子站（siteConfig.lang 由构建环境注入） */
export function isEnglishSite(): boolean {
	return String(siteConfig.lang).toLowerCase().startsWith("en");
}
/**
 * 语言切换目标路径：同一页面在另一语言版本下的路径。
 * - 中文站（base "/"）→ 加 "/en" 前缀；
 * - 英文站（base "/en"）→ 去掉 "/en" 前缀。
 * pathname 为当前构建下的真实路径（可能含 base，两种形态都容错）。
 */
export function languageSwitchHref(pathname: string): string {
	const clean = pathname.split("?")[0].split("#")[0];
	// 404 页产物是 /404.html（非目录路由），单独映射到对方语言的 404 文件
	if (/^\/(en\/)?404(\/|\.html)?$/.test(clean)) {
		return isEnglishSite() ? "/404.html" : "/en/404.html";
	}
	if (isEnglishSite()) {
		const stripped = clean.replace(/^\/en(?=\/|$)/, "");
		return stripped === "" ? "/" : stripped;
	}
	if (clean === "/" || clean === "") return "/en/";
	if (clean.startsWith("/en/") || clean === "/en") return clean;
	return `/en${clean}`;
}