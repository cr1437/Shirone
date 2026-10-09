# 角色页（Oshi Pages）文件对照与维护指南

> 适用页面：`/miku/`、`/nina/`、`/subaru/`、`/mita/`
> 本文说明每个文件负责界面上的哪一部分、字段从哪里来、以及常见改动该动哪个文件。

---

## 一、总体结构

角色页不是通过一个通用模板循环生成的，而是**每个角色一个独立页面文件**，共用同一套组件和布局。

```
src/
├─ pages/                        ← 页面骨架
│   ├─ characters.astro           角色合集页（/characters/，三张卡片入口）
│   ├─ miku.astro                 初音未来
│   ├─ nina.astro                 井芹仁菜
│   ├─ subaru.astro               安和昴
│   └─ mita.astro                 帽子米塔
│
├─ content/spec/                 ← 正文文字内容（Markdown，中英各一份）
│   ├─ miku.md / miku-en.md
│   ├─ nina.md / nina-en.md
│   ├─ subaru.md / subaru-en.md
│   └─ mita.md / mita-en.md
│
├─ components/molecules/
│   └─ OshiTabs.astro            ← 顶部「角色切换」标签栏
│
├─ assets/images/
│   ├─ characters/               ← 角色头像与配图
│   │   ├─ nina.gif
│   │   ├─ nina-extra.gif
│   │   ├─ subaru.gif
│   │   └─ capmita.webp
│   └─ music/
│       └─ unknown-mother-goose.webp   ← 初音页的头像（来自歌曲封面）
│
└─ layouts/
    └─ MainGridLayout.astro      ← 全站页面骨架（侧栏 + Banner + 内容槽）
```

### 数据流向

```
spec/*.md  ──渲染──▶  <Markdown><Content /></Markdown>   （正文段落）
                            ▲
pages/*.astro  ──定义──▶  infoRows[][]  ──▶  信息卡字段（本名/身高/生日…）
               ──定义──▶  labels{}      ──▶  界面文案（徽标/配图说明/代表色标签）
               ──import──▶ 头像图片  ──▶  信息卡左侧图像
```

**关键理解**：信息卡里的资料（身高、生日等）**不在 Markdown 里**，而是写在各自的 `.astro` 文件的 `infoRows` 数组中。改资料要改 `.astro`，不是改 `.md`。

---

## 二、文件逐个说明

### 1. 页面骨架 `src/pages/<角色>.astro`

每个角色页的完整结构，从上到下四块：

| 界面区域 | 代码位置 | 说明 |
|---|---|---|
| **① 角色切换标签** | `<OshiTabs current="nina" />` | 一行胶囊按钮，切换四个角色页 |
| **② 顶部横幅** | 第一个 `<Card>` | 显示「角色介绍」徽标 + 中文名 + 英文名 + 代表色横条 |
| **③ 信息卡** | 第二个 `<Card>` | 基本资料：头像 + 字段网格 |
| **④ 正文** | 第三个 `<Card>` | Markdown 渲染的角色介绍文章 |

#### 文件头部（`---` 之间）各变量的作用

| 变量 | 作用 |
|---|---|
| `pageTitle` | 浏览器标签/SEO 标题，中英各一份 |
| `pageDescription` | 页面描述，用于 SEO 和分享卡片 |
| `entryId` | **指定读取哪个 Markdown 文件**（中英切换靠这个） |
| `accent` | **该角色的代表色**（十六进制），驱动横幅色条、色块、字段里的圆点 |
| `labels` | 界面上的固定文案：`badge` 徽标、`infoTitle` 信息卡标题、`colorLabel` 代表色行标签、`accentNote` 配图说明 |
| `infoRows` | **基本资料的全部字段**，`[键, 值]` 二元组数组 |
| `colorRow` | 代表色那一行（由 `labels.colorLabel` 和 `accent` 拼成） |

---

### 2. 角色切换标签 `src/components/molecules/OshiTabs.astro`

- 是一个 `<nav>`，内部 `tabs` 数组定义四个角色的：路由地址、显示名、代表色。
- `current` 属性由调用方传入（如 `current="nina"`），决定哪个标签高亮。
- 高亮方式：边框和背景使用该角色的 `accent` 色做 16% 混合。

| 想改什么 | 改哪里 |
|---|---|
| 加一个新角色标签 | 在 `tabs` 数组里加一项，并新建对应页面文件 |
| 改标签上的文字 | 改 `tabs` 里的 `label` |
| 改标签颜色 | 改 `tabs` 里的 `accent` |

> 注意：`OshiTabs` 的 `tabs` 数组**不含 mita**（帽子米塔），所以帽子米塔页上没有高亮项。若要补上，需在数组里新增一项，并同步 `current` 的类型联合（`"miku" | "mita" | "nina" | "subaru"`）。

---

### 2.5 角色合集页 `src/pages/characters.astro`

**入口页**：导航抽屉 →「更多」→「动漫人物」→ `/characters/`（配置见 `src/lib/.../navBarConfig.ts` 的 `LinkPresets.Oshi`）。

页面结构：
1. 顶部横幅（badge + 标题 + 双色横条 + 副标题）
2. **角色卡片网格** —— `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`，每张卡片链接到对应角色页

```astro
<a href={c.href} class="block group">
    <Card>
        <div class="aspect-[4/3] sm:aspect-square overflow-hidden">   <!-- 封面 -->
            <img src={c.img} ... />
        </div>
        <div class="p-5 flex flex-col gap-1">   <!-- 中文名 + 英文名 + 描述 + CTA -->
        </div>
    </Card>
</a>
```

**封面比例是有意设计的**（2026-10 修复）：
- 移动端 `aspect-[4/3]`：单卡约 400px 高，避免一张卡片占满整屏
- `sm`（≥640px）起 `aspect-square`：大屏恢复正方形，保持视觉

> ⚠️ 若改回全端 `aspect-square`，在 393×851 的手机上单卡高达 494px，三张卡片总高约 1460px，**第二、三张完全在首屏之外**。用户容易以为「页面没渲染出来」或「点不动」，实际是需要向下滚动约 450px 才能触达。排查问题时注意区分「卡片在屏外」与「链接失效」。

**新增角色时需要同步改三处**：
| 位置 | 改什么 |
|---|---|
| `characters.astro` 的 `cards` 数组 | 加一张卡片（href / img / zh / en / desc） |
| 新建 `src/pages/<name>.astro` | 角色详情页 |
| `OshiTabs.astro` 的 `tabs` 数组 | 详情页顶部的切换标签（可选） |

### 3. 正文内容 `src/content/spec/<角色>.md`

- 纯 Markdown，支持站点的全部扩展语法（提示块、代码块、数学公式等）。
- `#` 一级标题会显示为大标题；`##` 二级标题会进入页面目录（TOC）。
- 中英两版：`nina.md` 与 `nina-en.md`，构建英文站时自动选用 `-en` 版本。

**注意**：正文里不要再重复「基本资料」（身高生日等），那部分由信息卡负责。正文只写叙述性内容。

---

### 4. 全站骨架 `src/layouts/MainGridLayout.astro`

角色页使用它包裹，它决定：

- **页面最大宽度**：`--page-width`（由 `src/constants/constants.ts` 的 `PAGE_WIDTH` / `PAGE_WIDTH_DUAL` 决定，双栏编排时是 `96rem`）。
- **侧栏**：左右两条 `--sidebar-width`（17.5rem），在大屏（≥1280px）展开为三列。
- **内容槽**：角色页的所有 `<Card>` 都渲染在这里。

> 这就是「正文为什么只有这么宽」的根源：页框 96rem 减去左右侧栏各 280px，剩下的才是内容区。

---

## 三、信息卡布局（本次改动的重点）

### 改动前

```
<div class="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] gap-4 items-start">
    <div>正文 Card</div>
    <div>信息卡（固定 300px 宽，sticky）</div>
</div>
```

问题：正文列被切掉 300px；信息卡内部字段单列竖排 13 行，整块被拉得很长，观感是「又长又窄」。

### 改动后

信息卡**移出栅格**，独立成一张全宽卡片，正文恢复单栏全宽：

```
角色切换 OshiTabs
├─ 顶部横幅 Card（全宽）
├─ 信息卡 Card（全宽）        ← 新增/改动
│   ├─ 标题区：基本资料 / 中文名 / 英文名
│   └─ flex 容器（md 以上横向）
│       ├─ 头像栏（固定 13–15rem）
│       └─ 字段网格 dl（auto-fit 自适应列数）
└─ 正文 Card（全宽）
```

### 字段网格的响应式原理

```html
style="grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr))"
```

- **不写死断点像素**，浏览器按可用宽度自动决定列数。
- 每个字段最小 15rem（240px），能放下就并排，放不下就换行。
- 因此：手机 1 列 → 平板 2 列 → 1080p 3 列 → 2K/4K 4 列以上，全自动。

配合外层 `flex md:flex-row`：窄屏头像在上、字段在下（单列）；宽屏头像在左、字段在右（多列）。

---

## 四、常见修改指引

| 我想… | 改哪个文件 | 具体位置 |
|---|---|---|
| **改某个角色的资料**（身高、生日…） | `src/pages/<角色>.astro` | `infoRows` 数组 |
| **加一行资料** | 同上 | 在 `infoRows` 里加 `["标签", "内容"]` |
| **改代表色** | 同上 | 头部 `const accent = "#xxxxxx"`（一行改全身生效） |
| **改界面文案**（"基本资料""配图：…"） | 同上 | `labels` 对象 |
| **换头像图** | 同上 | 首行的 `import portrait from "..."` |
| **改正文文字** | `src/content/spec/<角色>.md` | 直接编辑 Markdown |
| **改角色切换标签** | `src/components/molecules/OshiTabs.astro` | `tabs` 数组 |
| **改全站页框宽度** | `src/constants/constants.ts` | `PAGE_WIDTH` / `PAGE_WIDTH_DUAL` |
| **改侧栏宽度** | `src/styles/variables.styl` | `--sidebar-width` |

---

## 五、四个页面的差异对照

| 项目 | 初音未来 | 井芹仁菜 | 安和昴 | 帽子米塔 |
|---|---|---|---|---|
| 文件 | `miku.astro` | `nina.astro` | `subaru.astro` | `mita.astro` |
| 代表色 | `#39C5BB` | `#D90E2C` | `#76BD53` | `#8b5cf6` |
| 头像 | 歌曲封面 webp | nina.gif | subaru.gif | capmita.webp |
| 独特区块 | **推し歴天数** | 正文配图 gif | — | — |
| 标签栏高亮 | 有 | 有 | 有 | 无（未登记） |
| 正文配图 | 无 | `nina-extra.gif` | 无 | 无 |

> 另有合集页 `characters.astro`（不在上表四个之列），它是三张卡片的入口页，本身不含角色资料。

**只有 miku 页**在顶部横幅右侧有「推し歴」天数显示，计算逻辑在 `miku.astro` 头部：

```ts
const OSHI_START_UTC = Date.UTC(2020, 3, 17, 16, 0, 0);  // 起始日（UTC+8 的 2020-04-18 0 点）
const oshiDays = ...;                                     // 距今天数，当天记作第 1 天
```

---

## 六、附：本次改动清单

| 文件 | 改动 |
|---|---|
| `src/pages/miku.astro` | 信息卡改为全宽横幅 + 自适应网格；代表色抽为 `accent` 常量 |
| `src/pages/nina.astro` | 同上 |
| `src/pages/subaru.astro` | 同上 |
| `src/pages/mita.astro` | 同上 |
| `src/pages/characters.astro` | 移动端封面 `aspect-square` → `aspect-[4/3]`，修复后续卡片难触达 |
| `docs/character-pages.md` | 新增本文档 |

### 为什么网格要写成 `minmax(min(15rem, 100%), 1fr)`

`minmax()` 的**最小值不会被自动收缩**。如果只写 `minmax(15rem, 1fr)`，当容器窄于 240px 时，网格仍会强制每列至少 240px，导致内容横向溢出、出现横向滚动条。

套一层 `min(15rem, 100%)` 后，最小值变成「240px 与容器宽度取小者」——容器够宽时按 240px 排多列，容器过窄时自动退化为单列撑满，不再溢出。这是自适应网格的标准写法，改动后无需再为极窄屏单独写断点。
