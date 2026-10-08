/**
 * 构建端语言与部署前缀。
 * - 默认（主站）：zh_CN + "/"。
 * - 英文子站：scripts/build-multilang.mjs 以 `astro build --mode en` 触发，
 *   值来自仓库根的 `.env.en`（PUBLIC_ 前缀变量会被 Vite 内联到客户端与服务端代码）。
 * - process.env 分支兜底 Node 配置上下文（astro.config 链路中没有 import.meta.env 时）。
 */
function readLang(): string | undefined {
	try {
		return import.meta.env.PUBLIC_SITE_LANG as string | undefined;
	} catch {
		/* Node 配置上下文：无 import.meta.env */
	}
	try {
		return typeof process !== "undefined" ? process.env.SITE_LANG : undefined;
	} catch {
		return undefined;
	}
}
function readBase(): string | undefined {
	try {
		return import.meta.env.PUBLIC_SITE_BASE as string | undefined;
	} catch {
		/* Node 配置上下文：无 import.meta.env */
	}
	try {
		return typeof process !== "undefined" ? process.env.SITE_BASE : undefined;
	} catch {
		return undefined;
	}
}
/** 构建语言：默认 zh_CN；英文子站构建为 "en" */
export const BUILD_LANG: string = readLang() ?? "zh_CN";
/** 构建部署前缀：默认 "/"；英文子站构建为 "/en" */
export const BUILD_BASE: string = readBase() ?? "/";
/** 是否为英文子站构建 */
export const IS_EN_BUILD: boolean = BUILD_LANG.toLowerCase().startsWith("en");