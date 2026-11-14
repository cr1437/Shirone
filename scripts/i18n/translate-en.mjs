#!/usr/bin/env node
/**
 * 自动生成英文文章（Lang = "en"）。
 *
 * 为什么需要：英文子站（/en）只收录 `lang: "en"` 的文章，语言切换按钮又是纯路径映射
 * （/posts/x ↔ /en/posts/x）。所以每篇中文文章都必须有一个内容等价的英文版本，
 * 否则英文站就是空的、切换按钮点过去 404。
 *
 * 用法：
 *   node scripts/i18n/translate-en.mjs            # 只补缺失的
 *   node scripts/i18n/translate-en.mjs --force    # 全部重新生成
 *   node scripts/i18n/translate-en.mjs --dry      # 只打印计划
 *   node scripts/i18n/translate-en.mjs --only zako319
 *   SKIP_I18N=1 ...                               # 构建时跳过（build-multilang 会看这个变量）
 *
 * 翻译后端（环境变量）：
 *   TRANSLATE_PROVIDER=google（默认，免费端点，CI 上可用）
 *   TRANSLATE_PROVIDER=openai  + OPENAI_BASE_URL / TRANSLATE_API_KEY / TRANSLATE_MODEL
 *     例：TRANSLATE_PROVIDER=openai OPENAI_BASE_URL=https://api.deepseek.com \
 *         TRANSLATE_API_KEY=sk-xxx TRANSLATE_MODEL=deepseek-chat
 *
 * 设计取舍：
 * - 不覆盖已有英文文章（除非 --force），增量生成；
 * - 网络失败只告警，不阻断构建（除非 --strict）；
 * - 代码块 / 行内代码 / 短代码（:::）原样保留，只翻叙述性文本。
 */
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { execFile } from "node:child_process";
import YAML from "yaml";

const ROOT = process.cwd();
const POSTS_DIR = path.join(ROOT, "src/content/posts");
const GOOGLE_URL = "https://translate.googleapis.com/translate_a/single";
const MAX_CHUNK = 1500;
const RETRIES = 3;
const RETRY_DELAY_MS = 1200;
const REQUEST_GAP_MS = 250;

const args = process.argv.slice(2);
const hasFlag = (name) => args.includes(name);
const getOption = (name) => {
	const i = args.indexOf(name);
	return i >= 0 ? args[i + 1] : undefined;
};
const FORCE = hasFlag("--force");
const DRY = hasFlag("--dry");
const STRICT = hasFlag("--strict");
const QUIET = hasFlag("--quiet");
const ONLY = getOption("--only");

const log = (...m) => {
	if (!QUIET) console.log("[i18n]", ...m);
};
const warn = (...m) => console.warn("[i18n]", ...m);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let lastRequestAt = 0;
async function throttle() {
	const wait = REQUEST_GAP_MS - (Date.now() - lastRequestAt);
	if (wait > 0) await sleep(wait);
	lastRequestAt = Date.now();
}

/* ---------------- 翻译后端 ---------------- */

function curlJson(url, proxy) {
	return new Promise((resolve, reject) => {
		const args = ["-sS", "--max-time", "45"];
		if (proxy) args.push("-x", proxy);
		args.push(url);
		execFile("curl", args, { maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => {
			if (err) {
				reject(new Error(`curl 失败：${String(stderr || err.message).slice(0, 200)}`));
				return;
			}
			try {
				resolve(JSON.parse(stdout));
			} catch {
				reject(new Error("curl 返回的不是 JSON"));
			}
		});
	});
}

async function googleTranslate(text) {
	await throttle();
	const url = `${GOOGLE_URL}?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(text)}`;
	// 本机/内网环境通常需要走代理才能访问 Google；CI 上不需要。
	const proxy = process.env.TRANSLATE_PROXY;
	let data;
	if (proxy) {
		data = await curlJson(url, proxy);
	} else {
		const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (Shirone i18n)" } });
		if (!res.ok) throw new Error(`Google 翻译 HTTP ${res.status}`);
		data = await res.json();
	}
	if (!Array.isArray(data?.[0])) throw new Error("Google 翻译返回格式异常");
	return data[0].map((part) => part?.[0] ?? "").join("");
}

async function llmTranslate(text) {
	const base = (process.env.OPENAI_BASE_URL || "https://api.deepseek.com").replace(/\/+$/, "");
	const model = process.env.TRANSLATE_MODEL || "deepseek-chat";
	const key = process.env.TRANSLATE_API_KEY;
	if (!key) throw new Error("TRANSLATE_PROVIDER=openai 但未设置 TRANSLATE_API_KEY");
	await throttle();
	const res = await fetch(`${base}/chat/completions`, {
		method: "POST",
		headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
		body: JSON.stringify({
			model,
			temperature: 0.2,
			messages: [
				{
					role: "system",
					content:
						"You are a Chinese-to-English technical translator for a developer blog. Translate faithfully and naturally. " +
						"Preserve all Markdown syntax, code blocks, inline code, URLs, HTML tags, lists, tables and placeholder tokens like __I18N_TOKEN_0__ exactly.",
				},
				{ role: "user", content: text },
			],
		}),
	});
	if (!res.ok) throw new Error(`LLM 翻译 HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
	const data = await res.json();
	const out = data?.choices?.[0]?.message?.content;
	if (typeof out !== "string" || !out.trim()) throw new Error("LLM 返回内容为空");
	return out.trim();
}

async function passthrough(text) {
	// 仅用于离线自测：不真正翻译，按原样生成结构，方便检查文件格式。
	return text;
}

function provider() {
	const name = (process.env.TRANSLATE_PROVIDER || "google").toLowerCase();
	if (name === "none") return passthrough;
	if (name === "openai" || name === "llm" || name === "deepseek") return llmTranslate;
	return googleTranslate;
}

async function translate(text) {
	const fn = provider();
	const input = String(text ?? "");
	if (!input.trim()) return "";
	// 品牌词（zako3.19 / zako3.16hp 等）不要被翻译器改大小写
	const brandStash = [];
	const protectedInput = input.replace(/\bzako\d+(?:\.\d+)?[a-z]*\b/gi, (m) => TOKEN(brandStash.push(m) - 1));
	let lastErr = null;
	for (let attempt = 1; attempt <= RETRIES; attempt += 1) {
		try {
			const out = await fn(protectedInput);
			return restore(out, brandStash);
		} catch (err) {
			lastErr = err;
			if (attempt < RETRIES) await sleep(RETRY_DELAY_MS * attempt);
		}
	}
	throw lastErr;
}

/* ---------------- Markdown 保护 ---------------- */

const TOKEN = (i) => `__I18N_TOKEN_${i}__`;

function stashInlineCode(line, stash) {
	return line.replace(/`[^`\n]+`/g, (m) => TOKEN(stash.push(m) - 1));
}

function restore(text, stash) {
	return text.replace(/__I18N_TOKEN_(\d+)__/g, (_, i) => stash[Number(i)] ?? "");
}

/** 把正文按「整段可翻译 / 原样保留」切块，只翻叙述性文本。 */
function splitMarkdown(body) {
	const lines = body.split(/\r?\n/);
	const segments = [];
	let chunk = [];
	let chunkLen = 0;
	let inFence = false;

	const flush = () => {
		if (chunk.length) {
			segments.push({ type: "text", lines: chunk });
			chunk = [];
			chunkLen = 0;
		}
	};

	for (const line of lines) {
		const isFence = /^\s*(```|~~~)/.test(line);
		if (isFence) {
			flush();
			inFence = !inFence;
			segments.push({ type: "raw", lines: [line] });
			continue;
		}
		if (inFence) {
			segments.push({ type: "raw", lines: [line] });
			continue;
		}
		// ::: steps / ::: note 之类的容器短代码原样保留
		if (/^\s*:::/.test(line)) {
			flush();
			segments.push({ type: "raw", lines: [line] });
			continue;
		}
		chunk.push(line);
		chunkLen += line.length + 1;
		if (chunkLen >= MAX_CHUNK) flush();
	}
	flush();
	return segments;
}

async function translateMarkdown(body) {
	const segments = splitMarkdown(body);
	const out = [];
	for (const seg of segments) {
		if (seg.type === "raw") {
			out.push(seg.lines.join("\n"));
			continue;
		}
		const stash = [];
		const protectedText = seg.lines.map((line) => stashInlineCode(line, stash)).join("\n");
		let translated;
		try {
			translated = await translate(protectedText);
		} catch (err) {
			warn(`段落翻译失败，保留原文：${err.message}`);
			translated = protectedText;
		}
		out.push(restore(translated, stash));
	}
	return out.join("\n");
}

/* ---------------- 文章读写 ---------------- */

function splitFrontmatter(raw) {
	const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
	if (!m) return null;
	return { fm: m[1], body: m[2] };
}

function normalizeDate(value) {
	if (value instanceof Date) {
		return value.toISOString().slice(0, 10);
	}
	return value;
}

async function listPosts() {
	const entries = await fs.readdir(POSTS_DIR, { withFileTypes: true });
	const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
	const posts = [];
	for (const dir of dirs) {
		const file = path.join(POSTS_DIR, dir, "index.md");
		let raw;
		try {
			raw = await fs.readFile(file, "utf8");
		} catch {
			continue;
		}
		const parts = splitFrontmatter(raw);
		if (!parts) continue;
		let data;
		try {
			data = YAML.parse(parts.fm) ?? {};
		} catch (err) {
			warn(`跳过 ${dir}：frontmatter 解析失败（${err.message}）`);
			continue;
		}
		posts.push({ dir, file, raw, fmRaw: parts.fm, body: parts.body, data });
	}
	return posts;
}

function isEnglish(post) {
	return String(post.data.lang ?? "").toLowerCase().startsWith("en");
}

function permalinkOf(post) {
	const explicit = post.data.permalink;
	if (typeof explicit === "string" && explicit.trim()) {
		return explicit.replace(/^\/+/, "").replace(/\/+$/, "");
	}
	return `posts/${post.dir}`;
}

async function translatePost(zhPost, posts) {
	const fm = zhPost.data;
	const permalink = permalinkOf(zhPost);
	const targetDir = `${zhPost.dir}-en`;
	const targetFile = path.join(POSTS_DIR, targetDir, "index.md");

	// 已经存在（目录名后辍 -en 或 permalink 对得上）→ 不重复生成
	const existed = posts.some((p) => isEnglish(p) && permalinkOf(p) === permalink);
	const targetExists = await fs
		.access(targetFile)
		.then(() => true)
		.catch(() => false);
	if (!FORCE && (existed || targetExists)) {
		log(`跳过 ${zhPost.dir}：已有英文版本`);
		return { slug: zhPost.dir, skipped: true };
	}

	log(`翻译 ${zhPost.dir} → ${targetDir}（permalink=${permalink}）`);
	const title = await translate(fm.title ?? "");
	const description = fm.description ? await translate(fm.description) : undefined;
	const aiSummary = fm.aiSummary ? await translate(fm.aiSummary) : undefined;
	const category = fm.category ? await translate(fm.category) : undefined;
	const tags = Array.isArray(fm.tags) && fm.tags.length
		? await Promise.all(fm.tags.map((tag) => translate(String(tag))))
		: undefined;

	const enFm = {
		title,
		published: normalizeDate(fm.published),
		lang: "en",
		permalink,
	};
	if (description) enFm.description = description;
	if (tags?.length) enFm.tags = tags;
	if (category) enFm.category = category;
	enFm.draft = Boolean(fm.draft);
	if (aiSummary) enFm.aiSummary = aiSummary;

	// 原样继承的字段（与语言无关）
	for (const key of [
		"updated",
		"updatedAt",
		"pinned",
		"comment",
		"encrypted",
		"password",
		"passwordHint",
		"image",
	]) {
		if (fm[key] !== undefined && fm[key] !== null) {
			enFm[key] = key.startsWith("updated") ? normalizeDate(fm[key]) : fm[key];
		}
	}

	const enBody = await translateMarkdown(zhPost.body);
	const yamlText = YAML.stringify(enFm, { lineWidth: 0 }).trimEnd();
	const content = `---\n${yamlText}\n---\n\n${enBody.replace(/^\n+/, "")}`;

	if (DRY) {
		log(`[dry] 将写入 ${targetFile}`);
		return { slug: zhPost.dir, dry: true };
	}

	await fs.mkdir(path.dirname(targetFile), { recursive: true });
	await fs.writeFile(targetFile, content, "utf8");
	log(`已写入 ${path.relative(ROOT, targetFile)}`);
	return { slug: zhPost.dir, written: true };
}

async function main() {
	let posts;
	try {
		posts = await listPosts();
	} catch (err) {
		warn(`读取内容目录失败：${err.message}`);
		process.exit(STRICT ? 1 : 0);
	}

	const zhPosts = posts.filter((p) => !isEnglish(p) && (!ONLY || p.dir === ONLY));
	if (!zhPosts.length) {
		log("没有需要翻译的中文文章");
		return;
	}

	const results = [];
	for (const post of zhPosts) {
		try {
			results.push(await translatePost(post, posts));
		} catch (err) {
			warn(`${post.dir} 翻译失败：${err.message}`);
			results.push({ slug: post.dir, failed: true });
		}
	}

	const written = results.filter((r) => r.written).length;
	const skipped = results.filter((r) => r.skipped).length;
	const failed = results.filter((r) => r.failed).length;
	log(`完成：生成 ${written}，跳过 ${skipped}，失败 ${failed}`);

	if (failed && STRICT) process.exit(1);
}

main().catch((err) => {
	warn(`未捕获错误：${err?.stack || err}`);
	process.exit(STRICT ? 1 : 0);
});
