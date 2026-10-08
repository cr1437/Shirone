// 多语言构建编排：zh（根）→ en（/en 子路径，--mode en）
// 环境变量 SKIP_EN_BUILD=1 时只构建中文站（快速验证用）。
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const SKIP_EN = process.env.SKIP_EN_BUILD === "1";

function run(cmd, args, env = {}) {
	const res = spawnSync(cmd, args, {
		cwd: root,
		stdio: "inherit",
		env: { ...process.env, ...env },
	});
	if (res.status !== 0) {
		console.error(`[build-multilang] 失败：${cmd} ${args.join(" ")}`);
		process.exit(res.status ?? 1);
	}
}

// 1) 内容同步（沿用原构建链第一步）
run("node", ["scripts/content/sync.mjs"]);

// 2) 中文站（根路径）
run("npx", ["astro", "build"]);
run("npx", ["pagefind", "--site", "dist"]);

if (!SKIP_EN) {
	// 3) 英文站（/en 子路径；.env.en 注入 PUBLIC_SITE_LANG/PUBLIC_SITE_BASE）
	const enEnv = {
		SITE_LANG: "en",
		SITE_BASE: "/en",
	};
	run("npx", ["astro", "build", "--mode", "en", "--outDir", "dist-en"], enEnv);
	run("npx", ["pagefind", "--site", "dist-en"]);

	// 4) 合并到 dist/en
	const distEn = path.join(root, "dist", "en");
	fs.rmSync(distEn, { recursive: true, force: true });
	fs.cpSync(path.join(root, "dist-en"), distEn, { recursive: true });
	fs.rmSync(path.join(root, "dist-en"), { recursive: true, force: true });
}

// 5) 字体检查（一次即可）
run("node", ["scripts/fonts/check-fonts.mjs"]);

console.log(
	SKIP_EN
		? "[build-multilang] 完成（仅中文站，SKIP_EN_BUILD=1）"
		: "[build-multilang] 完成：dist（zh）+ dist/en（en）",
);