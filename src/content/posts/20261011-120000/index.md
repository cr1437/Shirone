---
title: "zako3.13更新说明"
published: 2026-10-11
tags: ["开源项目", "项目更新", "Shizako"]
category: "开源项目"
draft: false
pinned: false
aiSummary: 从一份混淆崩溃日志还原出 nav 调用点，追出 shizuku.json 里一条没有包名的授权记录，顺带把 F-Droid 变体、CI 和官网数据链路一起收干净。
---


## 0. 这一版到底改了什么

| 类别 | 内容 |
| --- | --- |
| 新增 | F-Droid 专用变体（版本名带 `-f`），已提上架 MR |
| 修复 | root 激活后给应用授权、刷新即从列表消失 |
| 修复 | 用官方 `dev.rikka.shizuku:api` 构建的应用无法正常授/撤权 |
| 修复 | 启动服务页 3 秒自动关窗前手动返回会崩溃 |
| 修复 | 关于页「基于 Shizako」自指文案 |
| 构建 | Groovy 取 git 失败导致配置阶段直接挂掉 |
| CI | `gradlew` 可执行位丢失、产物 glob 还是上游包名 |
| 官网 | 数据卡片改为实时值 + 三级回退，修掉动画与实时数据的竞态 |

其中最有价值的是前两个 —— 都是「一刷新就丢」这类看起来像前端状态管理的现象，真凶却都在**服务端的持久化记录**里。

---

## 1. 核心修复 A：root 激活后，授权应用刷新即消失

### 1.1 现象

用 root 权限激活 Shizako 服务后：

1. 进入「应用管理」，给某个应用打开授权开关；
2. 下拉刷新列表；
3. **这个应用整条从已授权列表里消失了。**

注意它不是「开关被关掉」，而是**整条记录不显示**。这个区别很重要：开关状态丢了是 flags 的问题，整条消失是列表筛选的问题。

### 1.2 定位

「应用管理」列表的数据来自服务端的 `ShizukuService.getApplications()`。列表侧（`AppsFragment` / `AppsAdapter`）只是渲染，不做过滤，所以先看服务端。

在 `getApplications()` 里找到这一段：

```java
for (String packageName : PackageManagerApis.getPackagesForUidNoThrow(uid)) {
    PackageInfo pi = ...;
    int flags = 0;
    ShizukuConfig.PackageEntry entry = configManager.find(uid);
    if (entry != null) {
        if (entry.packages != null && !entry.packages.contains(pi.packageName))
            continue;                       // ← 就是这里被跳过的
        flags = entry.flags & ConfigManager.MASK_PERMISSION;
    }
    ...
}
```

这条 `continue` 的语义是：**「这个 uid 的记录里写了它只算某几个包，而当前这个包不在名单里，跳过」**。

那问题就变成：谁写了一条 `packages` 里没有该应用、却有授权位的记录？

### 1.3 根因：一次 `update(uid, null, …)` 写下的空记录

授权开关走的链路是：管理器 `Shizuku.updateFlagsForUid(uid, MASK_PERMISSION, FLAG_ALLOWED)` → 服务端 `ShizukuService.updateFlagsForUid()`，而它的**最后一行**是：

```java
configManager.update(uid, null, mask, value);
//                        ^^^^ 包名传的是 null
```

再看 `updateLocked()` 与 `PackageEntry` 的构造函数：

```java
private void updateLocked(int uid, List<String> packages, int mask, int values) {
    ShizukuConfig.PackageEntry entry = findLocked(uid);
    if (entry == null) {
        entry = new ShizukuConfig.PackageEntry(uid, mask & values);  // 新建
        config.packages.add(entry);
    } else {
        ...
    }
    if (packages != null) {          // ← null 就整段跳过
        for (String packageName : packages) { ... }
    }
    scheduleWriteLocked();
}

public PackageEntry(int uid, int flags) {
    this.uid = uid;
    this.flags = flags;
    this.packages = new ArrayList<>();   // ← 关键：是空 List，不是 null
}
```

所以当**这个 uid 当时还没有任何记录**时，一次授权会写下一条：

- `flags` 有授权位（`MASK_PERMISSION & FLAG_ALLOWED`）
- `packages` 是**空 ArrayList**（`packages == null` 让写入被跳过，构造函数给了个空表）

而 `getApplications()` 里的判断是 `entry.packages != null && !entry.packages.contains(...)` —— 空表满足 `!= null`，于是 `!contains(pkg)` 成立，**应用被剔除**。

**这就是完整的因果链：一次以为「不限定包名」的调用，实际写下了「限定为零个包」的记录。**

一条记录同时代表「有没有权限」和「这个权限算在哪些包头上」，两个语义挤在一个字段组里，写的时候只带了一半，就必然出现这种自相矛盾的持久化状态。

### 1.4 为什么偏偏 root 稳定复现

同样的代码路径，ADB 激活却看不出来，差别在**服务生命周期**：

- **root 激活**的服务是长期常驻的（有看门狗保活）。服务启动那一刻做过一轮扫描，把当时已安装、且声明了权限的应用都建好了记录；但**在那之后新装的应用根本没有记录**。你给它授权时，`find(uid)` 返回 null，于是走进「新建」分支，写下空包名记录 → 刷新即消失。
- **ADB 激活**每次都是重新拉起服务、重跑一轮启动扫描，记录里早已带上包名，`packages` 非空且包含该包，于是看不出问题。

同一个 bug，被两种激活方式的**生命周期差异**遮住了一半 —— 这类 bug 最难报也最难复现。

### 1.5 修复（三处）

**① `getApplications()`：空包名记录视为「不限定包名」**

```diff
-                if (entry.packages != null && !entry.packages.contains(pi.packageName))
+                if (entry.packages != null && !entry.packages.isEmpty()
+                        && !entry.packages.contains(pi.packageName))
                     continue;
```

只在**非空**的前提下才做「包名不在名单里」的剔除。这一条同时是**向后兼容的止血**：旧版本已经写进 `shizuku.json` 的坏记录不用清、用户不用重新授权，升级后直接就正常了。

**② `updateFlagsForUid()`：把包名真正写进去**

```java
List<String> packages = new ArrayList<>();
// ...
for (String packageName : PackageManagerApis.getPackagesForUidNoThrow(uid)) {
    PackageInfo pi = ...;
    if (pi == null || pi.requestedPermissions == null) continue;

    // 用官方 dev.rikka.shizuku:api 构建的应用只声明上游权限名，
    // 授/撤运行时权限必须用它实际声明的那一个，否则会抛异常。
    String permission;
    if (ArraysKt.contains(pi.requestedPermissions, PERMISSION)) {
        permission = PERMISSION;
    } else if (ArraysKt.contains(pi.requestedPermissions, PERMISSION_UPSTREAM_API)) {
        permission = PERMISSION_UPSTREAM_API;
    } else {
        continue;
    }

    packages.add(packageName);

    try {
        if (allowed) {
            PermissionManagerApis.grantRuntimePermission(packageName, permission, userId);
        } else {
            PermissionManagerApis.revokeRuntimePermission(packageName, permission, userId);
        }
    } catch (Throwable e) {
        // 单个包失败不能中断整轮：否则下面的配置写入也被跳过，
        // 结果就是授权记录压根没落下。
        LOGGER.w(e, "updateFlagsForUid: " + (allowed ? "grant " : "revoke ") + packageName);
    }
}
// ...
configManager.update(uid, packages.isEmpty() ? null : packages, mask, value);
```

这里有三层考虑：

- `packages` 不再恒为 `null` —— 顺手把「按包**实际声明**的权限名授/撤权」也修了（原先对上游权限名的应用会直接抛异常）；
- 加上 `try/catch`，**单个包失败不再中断整轮** —— 否则下面的 `configManager.update(...)` 会被一起跳过，记录压根落不了盘，形成「授权了但记录不存在」的第三种坏状态；
- 只有真的一个包都没匹配上时才退回 `null`。

**③ `ShizukuConfigManager` 启动扫描 + `getFlagsForUidInternal()`：也认上游权限名**

启动扫描原先只认自家的 `PERMISSION`：

```diff
-                if (pi == null || pi.applicationInfo == null
-                        || pi.requestedPermissions == null
-                        || !ArraysKt.contains(pi.requestedPermissions, PERMISSION)) {
+                if (pi == null || pi.applicationInfo == null
+                        || pi.requestedPermissions == null) {
+                    continue;
+                }
+                String permission;
+                if (ArraysKt.contains(pi.requestedPermissions, PERMISSION)) {
+                    permission = PERMISSION;
+                } else if (ArraysKt.contains(pi.requestedPermissions, PERMISSION_UPSTREAM_API)) {
+                    permission = PERMISSION_UPSTREAM_API;
+                } else {
                     continue;
                 }
```

语义上是把「谁算我们的应用」这个判断，从**只看自家权限名**放宽到**自家或上游权限名**，与 `getApplications()`（也就是列表里实际显示的那些应用）对齐。不对齐的话，这一整类应用永远走不到「启动时就有记录」这条路，只能靠授权那一刻新建 —— 而那一刻新建的记录，正是上面那个空包名 bug 的温床。

### 1.6 小结

一个 `null` 参数，串起了三个不同层面的问题：列表筛选、权限授予、启动扫描。修的时候如果只把 `getApplications()` 的剔除逻辑改掉，症状会消失，但**每次授权依然在写坏配置**，下次换个地方读就又炸。所以正确的修法是：**堵住写入源，同时让读取端对历史脏数据宽容。**

---

## 2. 核心修复 B：启动页 3 秒自动关窗时崩溃

### 2.1 崩溃日志是混淆过的

线上收到的堆栈长这样（R8 混淆后）：

```
java.lang.IllegalStateException: Fragment StarterFragment{...} not associated with a fragment manager
    at rikka.shizuku.Ax.k(...)
    at rikka.shizuku.Xz.o(...)
    at rikka.shizuku.k3.run(...)
    at android.os.Handler.handleCallback(Handler.java:...)
    at android.os.Handler.dispatchMessage(Handler.java:...)
    at android.os.Looper.loopOnce(Looper.java:...)
    ...
```

类名全没了，但有个**本地资产**可以直接还原：同一次 release 构建产出的 `out/mapping/mapping-zako3.12.txt`。对着它查：

| 混淆名 | 还原后 |
| --- | --- |
| `rikka.shizuku.Ax` | `androidx.fragment.app.Fragment` |
| `rikka.shizuku.Xz` | `androidx.navigation.NavHostFragment` |
| `rikka.shizuku.k3` | 那层被 R8 内联/合成出来的 `Runnable` |

于是堆栈真实含义是：

```
Fragment.getParentFragmentManager()   ←
NavHostFragment.findNavController(Fragment)   ←
Runnable.run()  （主线程 Handler）
```

**保留 mapping 文件是这次能五分钟定位的根本原因** —— 它不值钱，但没有它，这条堆栈只能靠猜。

### 2.2 根因

`StarterFragment` 在服务起来之后要**延迟 3 秒自动关窗**：

```kotlin
view?.postDelayed({
    findNavController().navigateUp()
}, 3000)
```

问题有两个，叠在一起：

1. 这是**主线程 Handler 上的延迟任务**。它归属的是 `view`，但 `postDelayed` 一旦入队，只要不主动 `removeCallbacks`，**视图被拆掉它照样会跑**；
2. `findNavController()` 内部第一件事就是 `getParentFragmentManager()`。如果这 3 秒内用户自己按了返回、或页面被销毁，Fragment 已经离开 FragmentManager，这行直接抛 `IllegalStateException`。

也就是说：**「页面还在」这个前提，被写进了一个不保证页面还在的回调里。**

### 2.3 修复

```kotlin
/** 服务起来后延迟关窗用的回调。必须能在视图销毁时撤掉 */
private val navigateUpRunnable = Runnable {
    if (!isAdded || isRemoving) return@Runnable
    val nav = runCatching { findNavController() }.getOrNull() ?: return@Runnable
    runCatching { nav.navigateUp() }
}

/** 等服务的监听器，销毁时要摘掉，否则会留到下一次 binder 事件上 */
private var binderReceivedListener: Shizuku.OnBinderReceivedListener? = null

private var autoCloseArmed = false
```

配套三处：

- **`onDestroyView()` 里 `removeCallbacks`** 并把监听器摘掉 —— 这才是根治，回调不再有机会在页面消失后执行；
- **执行前判 `!isAdded || isRemoving`**，再加 `runCatching` 兜底 —— 防御式第二层；
- **`autoCloseArmed` 一次性保护** —— 原来 `observe` 每触发一次就可能**重复注册一个 binder 监听器**，服务一旦就绪会触发多个回调，叠加出多次 `navigateUp()`。

顺带说明：监听器改成持有引用（`binderReceivedListener`）而不是匿名对象直接 `remove(this)`，也是因为原来那个写法在重复注册时只能摘掉最后一次注册的那个，前面的全泄漏到下一次 binder 事件上。

---

## 3. F-Droid 上架：一个项目、两个变体

### 3.1 为什么不用 `productFlavors`

Gradle 的 flavor 会把产物路径改成 `apk/<flavor>/release/`，而现有发版脚本、官网下载链接、CI 产物 glob 全都写死了 `apk/release/`。所以改用**构建属性**：

```groovy
def fdroidBuild = project.hasProperty('fdroid')

versionName rootProject.ext.versionName + (fdroidBuild ? '-f' : '')
buildConfigField "boolean", "FDROID_BUILD", "${fdroidBuild}"
```

```bash
./gradlew :manager:assembleRelease              # GitHub 版 → zako3.13
./gradlew :manager:assembleRelease -Pfdroid     # F-Droid 版 → zako3.13-f
```

同样能达到「两个变体、一份源码」，但**不动任何现有路径**。也没有做两份项目副本 —— 两份会各自漂移，改一个 bug 要改两遍。

### 3.2 四个开关 + 占位包，集中在 `FdroidBuild.kt`

业务代码只引用 `FdroidBuild`，不直接读 `BuildConfig.FDROID_BUILD`，审查时一眼能看清「F-Droid 版关了什么、为什么关」：

```kotlin
object FdroidBuild {
    val isFdroid: Boolean get() = BuildConfig.FDROID_BUILD

    /** 自更新：F-Droid 用自己的密钥签名，换签名安装必然失败，且绕过商店分发 */
    val allowSelfUpdate: Boolean get() = !isFdroid

    /** 更新检查里的第三方 GitHub 反代（gh-proxy / ghfast / ghproxy） */
    val allowUpdateMirrors: Boolean get() = !isFdroid

    /** 一键注入：下载并安装第三方 APK */
    val allowOneClickInject: Boolean get() = !isFdroid

    /** AI 解释：内置多家专有服务商入口，关掉即可不申报 NonFreeNet */
    val allowAiExplain: Boolean get() = !isFdroid

    /** 兼容性占位包：applicationId 为上游 moe.shizuku.privileged.api 的空壳 */
    val allowCompatStub: Boolean get() = !isFdroid
}
```

其中占位包那条最微妙：它的作用是装一个 applicationId 等于**上游包名**的空壳，好让把上游包名写死在代码里的第三方应用「看得见」本应用。而上游 README 的 FORBIDDEN 条款明确禁止 fork 使用该 application id —— 所以 F-Droid 版不但不装，还做到**连包名字面量都不进 DEX**：

```groovy
buildConfigField "String", "COMPAT_PACKAGE",
        fdroidBuild ? '""' : '"moe.shizuku.privileged.api"'
```

### 3.3 stub APK 改为构建时生成

`manager/src/main/assets/shizako-stub.apk` 从 git 解除跟踪，改为构建期产物。这一步暴露了一个只在**新鲜克隆**上才出现的 Gradle 8 问题：任务曾把自己的输出同时声明为输入（`inputs.file(stubApkFile).optional()`），而 Gradle 8 在执行前做输入存在性校验 —— 克隆下来文件不存在，任务直接拒绝执行。删掉那行输入声明即可，「文件被删后重跑」由 `outputs.file` 天然保证（声明过的输出缺失即视为过期）。

### 3.4 让 Linux 构建机跑得起来：干掉 `java.io.tmpdir`

`gradle.properties` 里原本有：

```properties
org.gradle.jvmargs=-Xmx4096m -Dfile.encoding=UTF-8 -Djava.io.tmpdir=E:/tmp
```

这是开发机专用路径。GitHub CI 侧此前只在 workflow 里做了覆盖，但 **F-Droid 的构建机同样是 Linux 且直接执行 recipe 的 gradle** —— 仓库文件不改，MR 一提上去就会以同样方式在几秒内失败：

```
IOException: java.io.tmpdir is set to a directory that doesn't exist
```

修根：从 `org.gradle.jvmargs` 里彻底移除该参数，并加注释说明「**永远不要再加回来，以及本机真的需要时的正确做法**」。顺带确认当初解决路径问题靠的是目录 junction，这个 tmpdir 早已不承重。

### 3.5 recipe 与命名

- `tools/fdroid/com.churan.shizako.yml`：`versionName: zako3.13-f`、`output: manager/build/outputs/apk/release/shizako-zako3.13-f-release.apk`、`gradle:` 加 `-Pfdroid`
- NDK 修正为 `29.0.14206865`，与根 `build.gradle` 一致
- 因为关掉了 AI 入口，**不需要**申报 `NonFreeNet` 反特性
- `settings.gradle` 检测到 `-Pfdroid` 时自动关闭全部阿里云镜像，改走 `google()` / `mavenCentral()` / `gradlePluginPortal()`；不带参数的 GitHub 构建行为完全不变

---

## 4. 构建与 CI 硬化：四个坑

### 4.1 `gradlew` 丢失可执行位 —— 以及 Windows 的二次伤害

CI 长期红灯，根因是 `gradlew` 的 git 文件模式变成了 `100644`：

```
./gradlew: Permission denied      (exit 126)
```

修法是 `git update-index --chmod=+x gradlew`。但**第一次修失败了**：Git 提交后模式又变回 `100644`。原因是本机 `core.filemode=false`（Windows 常态），索引里刚设好的模式被随后的 `git add -A` 用**磁盘上的实际模式**（Windows 上恒为 `100644`）覆盖掉了。第二次只提交索引内容、不再 `add` 才生效。

> 教训：在 Windows 上改文件模式，一定要单独提交，别让它跟其他改动一起进 `git add -A`。

### 4.2 workflow 的产物 glob 还写着上游包名

```diff
- shizuku*-v*-release.apk
+ shizako*-release.apk
```

fork 之后产物名早就换了，glob 永远匹配不到，`ls` 在 `bash -e` 下直接中止步骤。这条解释了为什么连**纯 docs 提交**都亮红灯。

### 4.3 Groovy `'cmd'.execute([], dir)` 的空环境

本机（Windows）构建时出现：

```
Where: build.gradle line: 29
> For input string: ""
```

`build.gradle` 里有：

```groovy
def gitCommitId = 'git rev-parse --short HEAD'.execute([], project.rootDir).text.trim()
def gitCommitCount = Integer.parseInt('git rev-list --count HEAD'.execute([], project.rootDir).text.trim())
```

`String.execute(envp, dir)` 的第一个参数是**子进程环境变量数组** —— 传 `[]`（空数组）不是「继承当前环境」，而是**给子进程一个空环境**，`PATH` 随之丢失，于是找不到 `git`，输出空串，`Integer.parseInt("")` 让整个 root project 在**配置阶段**就挂掉。

而这两个变量在项目里**没有任何地方被引用**（versionCode / versionName 都是写死的）。改成容错：

```groovy
def gitCommitId = ''
def gitCommitCount = 0
try {
    def id = 'git rev-parse --short HEAD'.execute([], project.rootDir).text.trim()
    if (id) gitCommitId = id
    def count = 'git rev-list --count HEAD'.execute([], project.rootDir).text.trim()
    if (count) gitCommitCount = Integer.parseInt(count)
} catch (Throwable ignored) {
    // 环境里没有可用的 git：保持默认值，不影响构建
}
```

顺带记一个版本号约定：`versionCode` 跟 `versionName` 走而不是跟 git 提交数走 —— `3.01 → 301`，这样每次发版只要改 `versionName`，升级判断自然成立。

---

## 5. 官网数据卡片：三级回退与动画竞态

这块的技术点不在「拿到数据」，而在**数据到达顺序**。

第一版实现里，首屏卡片数字来自同源的 `stats.json`，而它由 `badges.yml` **每 6 小时**才刷一次。更糟的是入场动画：它先把 HTML 里写死的兜底值滚一遍并标记「已计数」，之后 `stats.json` 到了就被跳过 —— 于是页面上长期显示的是**写死在 HTML 里的旧数字**。

改成三级数据来源：

1. **HTML 兜底值** —— 永远存在，最坏情况；
2. **同源 `stats.json`** —— `badges.yml` 定时刷新，永远读得到，弱网兜底；
3. **`api.github.com` 实时查询** —— 拿到就覆盖，刷新页面即最新。

实时这一路失败（国内 DNS 拦截 / 403 限流 / 超时）一律**静默**，保持上一级数字。同时修掉两个竞态：

- 「后到数据被跳过」：`renderStat` 统一渲染，新值必定覆盖，只是不再重放动画；
- 「动画把新值滚回去」：`countUp` 增加 `alive` 回调，新数据一到立即停手。否则 900ms 的旧目标动画会把实时数字一帧帧盖掉 —— 实测表现为**开动效时最终停在兜底值，关掉动效才正常**，等于「越在意动效的用户越看不到实时数字」。

配套把 `badges.yml` 从 6 小时改为**每小时**，让弱网兜底最多旧一小时（数字没变则不产生提交）。

验证方式是 Node 夹具加载真实 `site.js`（最小 DOM 桩 + 拦截 `fetch`）跑四个场景 —— live / blocked / offline / live-anim 全 PASS，再用真 Chrome 无头端到端确认：把兜底值和 `stats.json` 故意写成错的旧值后，页面最终 DOM 显示的是实时值。

---

## 6. 版本与产物

| 项 | 值 |
| --- | --- |
| versionCode | `313` |
| versionName | `zako3.13`（GitHub 版）/ `zako3.13-f`（F-Droid 版） |
| 构建栈 | AGP 8.10.x / Kotlin 2.1.21 / jvmTarget 21 / material 1.12.0 |
| 签名 | `CN=Shizako, OU=Churan`（与旧版同证书，可直接覆盖安装） |
| 产物 | `shizako-zako3.13-release.apk`（GitHub Release 附件名沿用惯例为 `shizako-vzako3.13-release.apk`） |

---

## 6.5 一点方法论

这次三块工作——两个业务 bug、一个变体、一堆 CI——真正的共性只有一句话：

> **凡是「写入端少写一半、读取端却按写全了来读」的地方，都会长成「刷新一下就丢」这种看起来像前端状态管理的 bug。**

而定位它的顺序，几乎没有例外：

1. 先看现象是**状态错**还是**整条不见** —— 后者一定是筛选/查询逻辑，不是数据本身；
2. 找到**唯一的持久化入口**，看它写进去的到底是什么；
3. 顺着读到的地方，看看有没有「默认值恰好等于语义上的空集」这种巧合 —— 本例里 `new ArrayList<>()` 正好等价于「限定为零个包」，是最要命的那种巧合。

第二个 bug 则是另一种典型：**把一个前提（页面还在）写进了一个不保证该前提成立的回调里**。修法永远是「谁创建，谁负责销毁」——`onDestroyView` 里 `removeCallbacks`。

---

## 附：提交时间线（剔除徽章机器人）

```
2026-10-01  9dc6c99  chore(release): zako3.13（versionCode 313）
2026-10-01  a65c92c  build: 移除 gradle.properties 里会炸 Linux 构建机的 java.io.tmpdir
2026-10-01  539f1a3  ci: 恢复 gradlew 的 git 可执行位（100755）
2026-10-01  503a4d9  ci: 修复 App workflow 长期红灯的两个根因
2026-10-01  2c07873  site: 数据卡片的下载量与 Star 改为实时显示（GitHub API + 三级回退）
2026-10-01  654ef4c  fix(about): 去掉「二次开发」措辞，并修掉「基于 Shizako」这个自指 bug
2026-10-02  77beb7e  feat(fastlane): 加入 F-Droid 应用商店元数据（en-US + zh-CN）
2026-10-03  9160569  feat(fdroid): F-Droid 版不再打包兼容性占位包，并清掉产物里的上游包名
2026-10-11  1ecca5f  fix(server): 授权记录漏写包名，root 激活后授权应用刷新即从列表消失
2026-10-11  565cc56  fix(manager): 启动页延迟关窗在 Fragment 销毁后仍执行，导致崩溃
2026-10-11  e63772d  fix(build): 取不到 git 时不再让整个构建在配置阶段失败
2026-10-11  749aba6  docs(site): 官网更新到 zako3.13
```
