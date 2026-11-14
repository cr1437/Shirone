---
title: zako3.13 update instructions
published: 2026-10-11
lang: en
permalink: posts/20261011-120000
tags:
  - Open source projects
  - Project updates
  - Shizako
category: Open source projects
draft: false
aiSummary: Restore the nav call point from a confusing crash log, trace out an authorization record without a package name in shizuku.json, and collect the F-Droid variants, CI and official website data links.
pinned: false
---

## 0. What has been changed in this version?

| Category | Content |
| --- | --- |
| New | F-Droid special variant (version name with `-f`), has been put on the shelves MR |
| Repair | After root is activated, the application is authorized and disappears from the list after refreshing |
| Fix | Applications built with official `dev.rikka.shizuku:api` cannot grant/revoke permissions normally |
| Repair | The startup service page will crash if you return manually before automatically closing the window in 3 seconds |
| Repair | About page "Based on Shizako" self-referential copywriting |
| Build | Groovy fails to retrieve git, causing the configuration phase to hang directly |
| CI | `gradlew` Executable bit missing, product glob or upstream package name |
| Official website | The data card is changed to real-time value + three-level fallback, and the competition between animation and real-time data is eliminated |

The most valuable of them are the first two - they are both "lost as soon as refreshed", which looks like front-end state management phenomena, but the real culprits are in the persistent records on the server side.

---

## 1. Core fix A: After root activation, the authorized application disappears after refreshing

### 1.1 Phenomenon

After activating the Shizako service with root privileges:

1. Enter "Application Management" and turn on the authorization switch for an application;
2. Pull down to refresh the list;
3. **This application has completely disappeared from the authorized list. **

Note that it is not "the switch is turned off", but **the entire record is not displayed**. This difference is very important: the loss of the switch status is a problem of flags, and the disappearance of the entire switch is a problem of list filtering.

### 1.2 Positioning

The data in the "Application Management" list comes from `ShizukuService.getApplications()` on the server side. The list side (`AppsFragment` / `AppsAdapter`) is just rendering without filtering, so look at the server side first.

Find this paragraph in `getApplications()`:
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
The semantics of this `continue` is: **"The record of this uid states that it only counts certain packages, and the current package is not in the list, so skip it"**.

The question then becomes: Who wrote a record that does not contain the application but has the authorization bit in `packages`?

### 1.3 Root cause: an empty record written by `update(uid, null, …)`

The link taken by the authorization switch is: Manager `Shizuku.updateFlagsForUid(uid, MASK_PERMISSION, FLAG_ALLOWED)` → Server `ShizukuService.updateFlagsForUid()`, and its **last line** is:
```java
configManager.update(uid, null, mask, value);
//                        ^^^^ 包名传的是 null
```
Look at the constructors of `updateLocked()` and `PackageEntry`:
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
So when there is no record for this uid at that time, an authorization will write one:

- `flags` has authorization bit (`MASK_PERMISSION & FLAG_ALLOWED`)
- `packages` is an **empty ArrayList** (`packages == null` allows writing to be skipped, and the constructor gives an empty list)

The judgment in `getApplications()` is `entry.packages != null && !entry.packages.contains(...)` - the empty table satisfies `!= null`, so `!contains(pkg)` is established and the **application is eliminated**.

**This is the complete causal chain: a call that was thought to be "unlimited package name" actually wrote a record of "limited to zero packages". **

A record represents both "does it have permissions" and "which headers does this permission count for?" The two semantics are squeezed into one field group, and only half of them are included when writing. This contradictory persistence state is bound to occur.

### 1.4 Why does root reappear stably?

The same code path cannot be seen when activated by ADB. The difference lies in the **service life cycle**:

- The service activated by **root** is permanent (with a watchdog to keep it alive). A round of scanning was done at the moment the service was started, and records were created for all applications that had been installed and had declared permissions at that time; but **newly installed applications after that were not recorded at all**. When you authorize it, `find(uid)` returns null, so go to the "New" branch and write down the empty package name record → it will disappear after refreshing.
- **ADB activation** requires restarting the service and re-running a startup scan every time. The package name is already included in the record, and `packages` is not empty and contains the package, so no problem can be seen.

The same bug is half covered by the life cycle difference between the two activation methods - this type of bug is the most difficult to report and reproduce.

### 1.5 fixes (three places)

**① `getApplications()`: Empty package name records are regarded as "unlimited package names"**
```diff
-                if (entry.packages != null && !entry.packages.contains(pi.packageName))
+                if (entry.packages != null && !entry.packages.isEmpty()
+                        && !entry.packages.contains(pi.packageName))
                     continue;
```
The "package name is not in the list" will be eliminated only if it is **non-empty**. This article is also a **backwards compatible hemostasis**: there is no need to clear the bad records that have been written into `shizuku.json` in the old version, and the user does not need to re-authorize. It will be normal immediately after the upgrade.

**② `updateFlagsForUid()`: Write the actual package name**
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
There are three layers to consider here:

- `packages` is no longer always `null` - "Grant/revoke permissions based on the actual declaration of the package" has also been fixed (originally, the application of the upstream permission name would directly throw an exception);
- With the addition of `try/catch`, **single packet failure will no longer interrupt the entire round** - otherwise the following `configManager.update(...)` will be skipped together, and the record will not be placed on the disk at all, forming the third bad state of "authorized but the record does not exist";
- Only return `null` when no package is matched.

**③ `ShizukuConfigManager` starts scanning + `getFlagsForUidInternal()`: also recognizes the upstream permission name**

When starting the scan, it originally only recognized its own `PERMISSION`:
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
Semantically, the judgment of "who counts as our application" is relaxed from **only looking at own permission names** to **own or upstream permission names**, aligned with `getApplications()` (that is, those applications actually displayed in the list). If they are not aligned, this entire type of application will never be able to take the path of "recording at startup" and can only rely on creation at the moment of authorization - and the record created at that moment is the hotbed of the empty package name bug above.

### 1.6 Summary

A `null` parameter connects three different levels of issues: list filtering, permission granting, and startup scanning. If you only change the deletion logic of `getApplications()` during repair, the symptoms will disappear, but the bad configuration will still be written every time you authorize it, and it will explode again next time you read it from another place. Therefore, the correct correction method is: **Block the writing source, and at the same time make the reading end tolerant to historical dirty data. **

---

## 2. Core fix B: The startup page crashes when the window automatically closes in 3 seconds.

### 2.1 The crash log is obfuscated

The stack received online looks like this (after R8 obfuscation):
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
The class names are all gone, but there is a **local asset** that can be directly restored: `out/mapping/mapping-zako3.12.txt` produced by the same release build. Check it:

| Obfuscated name | After restoration |
| --- | --- |
| `rikka.shizuku.Ax` | `androidx.fragment.app.Fragment` |
| `rikka.shizuku.Xz` | `androidx.navigation.NavHostFragment` |
| `rikka.shizuku.k3` | That layer is inlined/synthesized by R8 `Runnable` |

So the true meaning of the stack is:
```
Fragment.getParentFragmentManager()   ←
NavHostFragment.findNavController(Fragment)   ←
Runnable.run()  （主线程 Handler）
```
**Keeping the mapping file is the root cause of the five-minute positioning this time** - it's worthless, but without it, this stack can only be guessed.

### 2.2 Root cause

`StarterFragment` will **delay 3 seconds to automatically close the window** after the service is started:
```kotlin
view?.postDelayed({
    findNavController().navigateUp()
}, 3000)
```
There are two questions, stacked together:

1. This is a deferred task on the main thread Handler. It belongs to `view`, but once `postDelayed` joins the team, as long as it does not actively call `removeCallbacks`, it will still run if the view is torn down;
2. The first thing inside `findNavController()` is `getParentFragmentManager()`. If the user presses return within these 3 seconds, or the page is destroyed, the Fragment has left the FragmentManager, and this line directly throws `IllegalStateException`.

In other words: **The premise of "the page is still there" is written into a callback that does not guarantee that the page is still there. **

### 2.3 Fix
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
Three supporting facilities:

- `removeCallbacks`** in **`onDestroyView()` and remove the listener - this is the root cause, the callback no longer has a chance to be executed after the page disappears;
- **Execute the prejudgment `!isAdded || isRemoving`**, and add `runCatching` to hide the bottom line - the second layer of defense;
- **`autoCloseArmed` One-time protection** - It turns out that every time `observe` is triggered, it may **re-register a binder listener**. Once the service is ready, multiple callbacks will be triggered, superimposing multiple `navigateUp()`.

By the way, the listener was changed to hold a reference (`binderReceivedListener`) instead of the anonymous object directly `remove(this)`. This is also because the original writing method can only remove the last registered one when registering repeatedly, and all the previous ones will be leaked to the next binder event.

---

## 3. F-Droid launched: one project, two variants

### 3.1 Why not use `productFlavors`

Gradle's flavor will change the product path to `apk/<flavor>/release/`, and the existing release script, official website download link, and CI product glob are all hard-coded to `apk/release/`. So use **build properties** instead:
```groovy
def fdroidBuild = project.hasProperty('fdroid')

versionName rootProject.ext.versionName + (fdroidBuild ? '-f' : '')
buildConfigField "boolean", "FDROID_BUILD", "${fdroidBuild}"
```

```bash
./gradlew :manager:assembleRelease              # GitHub 版 → zako3.13
./gradlew :manager:assembleRelease -Pfdroid     # F-Droid 版 → zako3.13-f
```
"Two variants, one source code" can also be achieved, but **no existing paths** will be left unchanged. There is no need to make two copies of the project - the two copies will drift separately, and one bug needs to be corrected twice.

### 3.2 Four switches + placeholder package, concentrated in `FdroidBuild.kt`

The business code only references `FdroidBuild` and does not directly read `BuildConfig.FDROID_BUILD`. During the review, you can see clearly at a glance "what is disabled in the F-Droid version and why":
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
Among them, the placeholder package is the most subtle: its function is to install an empty shell with an applicationId equal to **upstream package name**, so that third-party applications that have the upstream package name written into the code can "see" this application. The FORBIDDEN clause of the upstream README explicitly prohibits fork from using the application id - so the F-Droid version not only does not install it, but also does not even enter the package name into DEX:
```groovy
buildConfigField "String", "COMPAT_PACKAGE",
        fdroidBuild ? '""' : '"moe.shizuku.privileged.api"'
```
### 3.3 stub APK is changed to be generated during build

`manager/src/main/assets/shizako-stub.apk` Remove tracking from git and change it to build-time products. This step exposes a Gradle 8 problem that only occurs on **fresh clones**: the task once declared its output as input (`inputs.file(stubApkFile).optional()`), and Gradle 8 performs input existence verification before execution - the cloned file does not exist, and the task directly refuses to execute. Just delete that line of input declaration. "Rerun after the file is deleted" is naturally guaranteed by `outputs.file` (the declared output is deemed expired if it is missing).

### 3.4 Making the Linux build machine work: Kill `java.io.tmpdir`

`gradle.properties` originally contained:
```properties
org.gradle.jvmargs=-Xmx4096m -Dfile.encoding=UTF-8 -Djava.io.tmpdir=E:/tmp
```
This is a development machine-specific path. The GitHub CI side has only covered the workflow in the past, but **F-Droid's build machine is also Linux and directly executes the recipe's gradle** - the warehouse file is not changed, and the MR will fail in the same way within a few seconds as soon as it is mentioned:
```
IOException: java.io.tmpdir is set to a directory that doesn't exist
```
Root fix: Completely remove this parameter from `org.gradle.jvmargs`, and add a comment stating "**Never add it back, and the correct approach when this machine really needs it**". By the way, I confirmed that the directory junction was used to solve the path problem. This tmpdir has long been unable to bear the load.

### 3.5 recipe and naming

- `tools/fdroid/com.churan.shizako.yml`: `versionName: zako3.13-f`, `output: manager/build/outputs/apk/release/shizako-zako3.13-f-release.apk`, `gradle:` plus `-Pfdroid`
- NDK corrected to `29.0.14206865`, consistent with root `build.gradle`
- Because the AI entrance is closed, there is no need to declare `NonFreeNet` anti-features
- `settings.gradle` automatically closes all Alibaba Cloud images when `-Pfdroid` is detected, and changes to `google()` / `mavenCentral()` / `gradlePluginPortal()`; the GitHub build behavior without parameters remains completely unchanged

---

## 4. Build and CI hardening: four pitfalls

### 4.1 `gradlew` Loses the executable bit — and secondary damage to Windows

CI has a long-term red light. The root cause is that the git file mode of `gradlew` has changed to `100644`:
```
./gradlew: Permission denied      (exit 126)
```
The fix is ​​`git update-index --chmod=+x gradlew`. But **the first repair failed**: the mode changed back to `100644` after Git submission. The reason is that the local `core.filemode=false` (Windows normal), the newly set mode in the index is overwritten by the subsequent `git add -A` with the **actual mode on the disk** (always `100644` on Windows). The second time only the index content is submitted and no longer `add` will take effect.

> Lesson: When changing the file mode on Windows, be sure to submit it separately, do not let it go into `git add -A` with other changes.

### 4.2 The product glob of workflow also contains the upstream package name
```diff
- shizuku*-v*-release.apk
+ shizako*-release.apk
```
After the fork, the product name has been changed long ago, and the glob can never be matched. `ls` directly aborts the step under `bash -e`. This explains why even pure docs submissions have a red light.

### 4.3 Empty environment of Groovy `'cmd'.execute([], dir)`

When building natively (Windows) I get:
```
Where: build.gradle line: 29
> For input string: ""
```
`build.gradle` contains:
```groovy
def gitCommitId = 'git rev-parse --short HEAD'.execute([], project.rootDir).text.trim()
def gitCommitCount = Integer.parseInt('git rev-list --count HEAD'.execute([], project.rootDir).text.trim())
```
The first parameter of `String.execute(envp, dir)` is **child process environment variable array** - passing `[]` (empty array) does not "inherit the current environment", but **gives an empty environment to the child process**, `PATH` is lost accordingly, so `git` cannot be found, and an empty string is output, `Integer.parseInt("")` Let the entire root project hang during the **configuration phase**.

These two variables are not referenced anywhere in the project (versionCode / versionName are hard-coded). Change to fault tolerance:
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
By the way, remember a version number agreement: `versionCode` follows `versionName` instead of following the git submission number - `3.01 → 301`. In this way, you only need to change `versionName` every time a version is released, and the upgrade judgment will naturally be established.

---

## 5. Official website data card: three-level fallback and animation competition

The technical point of this piece is not "getting the data", but the **data arrival order**.

In the first version of the implementation, the first screen card number comes from the same source `stats.json`, and it is refreshed only once every 6 hours by `badges.yml`. What's worse is the entry animation: it first rolls over the bottom value hard-coded in the HTML and marks it as "counted", and then skips `stats.json` when it arrives - so the old number hard-coded in the HTML is displayed on the page for a long time.

Change to third-level data source:

1. **HTML guaranteed value** - always exists, worst case scenario;
2. **Same source `stats.json`** —— `badges.yml` is refreshed regularly and can be read forever, which is protected by weak network;
3. **`api.github.com` Real-time query** - Overwrite as soon as you get it, refresh the page to get the latest one.

If this path fails in real time (domestic DNS interception / 403 current limit / timeout), it will be **silent** and keep the previous level number. Fix two race conditions at the same time:

- "Latest data is skipped": `renderStat` unified rendering, the new value must be overwritten, but the animation will not be replayed;
- "Animation rolls back the new value": `countUp` Added `alive` callback, which will stop as soon as new data arrives. Otherwise, the old target animation of 900ms will cover up the real-time numbers frame by frame - the actual measurement shows that when the motion effect is turned on, it finally stops at the lowest value, and it works normally when the motion effect is turned off. This is equivalent to "the more users who care about the motion effect, the less they can see the real-time numbers."

The package changes `badges.yml` from 6 hours to **every hour**, so that the weak network can keep the bottom for up to one hour (no submission will occur if the number does not change).

The verification method is to load the real `site.js` (minimum DOM stub + interception `fetch`) in the Node fixture and run four scenarios - live / blocked / offline / live-anim full PASS, and then use real Chrome headless end-to-end confirmation: after deliberately writing the bottom value and `stats.json` into wrong old values, the final DOM of the page Displayed are real-time values.

---

## 6. Versions and products

| item | value |
| --- | --- |
| versionCode | `313` |
| versionName | `zako3.13` (GitHub version) / `zako3.13-f` (F-Droid version) |
| Build stack | AGP 8.10.x / Kotlin 2.1.21 / jvmTarget 21 / material 1.12.0 |
| Signature | `CN=Shizako, OU=Churan` (same certificate as the old version, can be directly overwritten and installed) |
| Product | `shizako-zako3.13-release.apk` (GitHub Release attachment name convention is `shizako-vzako3.13-release.apk`) |

---

## 6.5 A little methodology

This time the three pieces of work - two business bugs, a variant, and a bunch of CIs - have only one sentence in common:

> **Anywhere where "the writing end writes less than half, and the reading end reads as written as full" will develop into a bug that looks like front-end state management like "refresh and then lose it." **

And the order of locating it, with almost no exceptions:

1. First check whether the phenomenon is **status error** or **entire missing** - the latter must be the filtering/query logic, not the data itself;
2. Find the **only persistence entry** and see what is written in it;
3. Follow the reading and see if there is any coincidence like "the default value is exactly equal to the semantically empty set" - in this case, `new ArrayList<>()` is exactly equivalent to "limited to zero packets", which is the most terrible coincidence.

The second bug is another typical one: **writing a premise (the page is still there) into a callback that does not guarantee that the premise is true**. The law is always "whoever creates it is responsible for destroying it" - `removeCallbacks` in `onDestroyView`.

---

## Attachment: Submission timeline (removing badge robots)
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
