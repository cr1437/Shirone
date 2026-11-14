---
title: Zako3.16 update instructions
published: 2026-10-17
lang: en
permalink: posts/zako316
tags:
  - Open source projects
  - Project updates
  - Shizako
category: Open source projects
draft: false
aiSummary: 'The community reminded me that someone used a renamed and repackaged project like "Shizako+" to pretend to be my project. I unpacked my own APK and found that what looked most like a counterfeit was actually the upstream identity placeholder package embedded in the official build. There are three things in this version: stop issuing placeholder packages, in-app signature self-test, and fingerprint disclosure; in addition, the watchdog is changed from "retry three times and give up permanently" to a three-level reconnection.'
pinned: true
---

`zako3.16` deals with something more troublesome than a bug: **Someone is impersonating me**.

The cause of the matter was that someone in the community reminded me that there were some renamed and repackaged versions of "Shizako+" circulating out there, with messy signatures. Following this clue, the thing that made me shiver the most was not what those people outside had done, but—**my own GitHub version of the APK, which looked a lot like a counterfeit after unpacking**.

This edition is aimed at "complete solution". In addition, the old problem of watchdog "retrying three times and then giving up forever" has also been fixed.

## 0. What has been changed in this version?

| Category | Content |
| --- | --- |
| Governance | GitHub version has stopped issuing the upstream identity placeholder package (an empty sub-package occupying the upstream package name `moe.shizuku.privileged.api` and the application name "Shizuku") |
| Newly added | In-app signature self-test: Compare signature certificate fingerprints at startup, and warn and guide verification if inconsistencies occur (only warns, does not block) |
| New | "Settings → About" displays the complete signature fingerprint and verification status of the current installation package, click Copy |
| Reinforcement | The watchdog disconnection and reconnection strategy is changed to a three-level strategy: 3 seconds fast retry ×3 → low-frequency recovery every 5 minutes until successful |
| Reinforcement | Cold recovery: When the binder is never reported after booting, it will actively detect and start the service according to the last activation method |
| Repair | "Stop service" with the keep-alive point enabled, and the service is pulled up by the watchdog after 3 seconds |
| Repair | Permanent notifications truthfully display "low-frequency retrying" and "stopped as requested by the owner" and no longer pretend to be on duty |

The first three are for anti-counterfeiting, and the last three are for stability. The text is told in this order.

---

## 1. Counterfeiting outside and my own problems

Let’s talk about the external environment first. Shizuku's README on GitHub clearly states: **forks are prohibited from using the "Shizuku" name** (Apache-2.0 §6 Additional Terms). My project has followed the rules from the beginning: I use my own `com.churan.shizako` for the package name, my own permission name, my own provider authority, and I have never touched the upstream package name and application name.

But after being reminded by the community, I searched around and found that some people are indeed dumping various renamed and repackaged versions on third-party sites, with signatures such as "SILENT KILLER". I have no control over what is on these sites - only the users themselves can verify what they have installed. **What I can do is to make "verification" extremely simple on the user side**: a signature fingerprint that cannot be copied.

What really made me sit still was when the other half discovered: **My own GitHub version of APK has an `assets/shizako-stub.apk`** embedded in it. Unpacking it, the output of `aapt2 dump badging` is like this:
```
package: name='moe.shizuku.privileged.api'
application-label: 'Shizuku'
```
An empty shell package occupying the **upstream package name** and application name **"Shizuku"** is lying in my own release product. The historical mission of this thing is to please those third-party clients who spell out old package names - but it literally violates the additional terms of upstream Apache-2.0 §6. What's even worse is the **perception**: Anyone who unpacks my official APK and runs `aapt2 dump badging` will see a sub-package called "Shizuku" with the package name `moe.shizuku.privileged.api`. From the outside, this is indistinguishable from a counterfeit product that has been downloaded with Shizuko, repackaged and renamed.

I was slapping myself in the face. The F-Droid version has turned it off a long time ago (not including the `:stub` module + deleting the APK when building), but the GitHub version has always kept it. This is the origin of the first change in this version.

## 2. Stop issuing placeholder packages: uproot them

This is not a matter of deleting a file, you have to unplug the entire chain:

- **`settings.gradle`**: Originally include `:stub` module under `-Pfdroid` condition. Now any variant no longer builds the stub, the module itself (`stub/` directory) is deleted entirely;
- **`manager/build.gradle`**: `COMPAT_STUB_PACKAGE` This BuildConfig field is always an empty string; `compatAuthority` only retains its own authority `com.churan.shizako.shizuku`; `copyStubApk` / `removeStubApk` two build tasks and the ones hanging on them `preBuild` Dependencies are deleted together;
- **Runtime**: `StubManager.kt` (aggregation logic of three installation channels) is deleted, the stub status display in the laboratory page, and all `lab_stub_*` strings in `strings_lab.xml` are deleted;
- **starter side**: There is a secret in `ServiceStarter.java` - when the manager package name is empty, it falls back to `"moe.shizuku.privileged.api"`. All the placeholder packages are gone. This rollback is a landmine. Delete it.

After deleting it, I checked: there is no embedded APK in the new APK, all provider authorities are `com.churan.shizako.*`, and the package name, permissions and label of `moe.shizuku` can no longer be found in `aapt2 dump badging`.

**Document Synchronization**: All old descriptions of "compatibility bridge / provider authority / cannot coexist" in README, README_EN, NOTICE, and compiled documents have been rewritten, and a new section "Officially built signature fingerprint" has been added.

## 3. In-app signature self-check: the dimension that cannot be copied

After the placeholder package was removed, the second question emerged: **How do users know whether the APK in their hands was sent by me? **

Counterfeiters can copy my interface, my package name, and even my version number - but there is one thing they cannot copy: the private key of the issuing certificate. Signature fingerprints are the only hard obstacle for counterfeiters, because repackaging requires re-signing and the fingerprints must be different. Before that, this fingerprint only lay in my notes, and there was no way to verify it on the user side.

So with `security/SignatureGuard.kt`, the logic is very straightforward:

1. Read the signature certificate of the current installation package when starting, and calculate SHA-256;
2. Compare with the officially released fingerprint `515BAF0C…9F9C8A` (the same one announced in the README, measured and read from the officially released APK using `apksigner verify --print-certs`);
3. Inconsistency → Pop-up warning: Show your fingerprint, open the official release page for verification with one click, and copy your own fingerprint for comparison with one click.

Several deliberate design decisions:

- **Only warn, not block**. This is my clear choice: false positives (such as a user-signed compilation with a debug certificate) should not brick the software. Warning + guidance verification, returning the right of judgment to users;
- **F-Droid version does not play**. It is inevitable for F-Droid to re-sign with its own key. The fingerprint must be different from the official one and cannot be predicted within the application - popping a warning against it is like crying wolf. For the F-Droid version, just mark "F-Droid signature" on the about page;
- **Only play once per process**. Playing it once is enough to explain the problem, there is no need to play it again and again.

A new signature fingerprint card is added to the "Settings → About" page: status logo (official signature / F-Droid signature / unconfirmable) + complete 64-bit fingerprint displayed in segments in monospaced font, tap to copy. The user takes the copied string and README as a pair, and it takes three seconds.

To be honest: the deterrent power of this line of defense does not lie in how many counterfeit installation packages it blocks - what really matters is the channels and user habits. Its significance is to reduce the cost of "verifying officialness" to nearly zero, so that everyone who installs my software can confirm for themselves: What I installed is the one issued by the developer.

## 4. Watchdog: From "retry three times and then give up" to level three reconnection

After talking about anti-counterfeiting, let’s talk about stability. The cause of this line was two holes seen when reviewing the keepalive logic.

**Hole 1: Fail three times and give up permanently. ** This is how the watchdog handles service crashes: binder dies → quickly retry after 3 seconds, up to 3 times → do nothing after that and wait for binder to come back on its own. But why does binder come back on his own? Wireless debugging is turned off, adbd is restarted, the service process is frozen - in these scenarios it will never come back on its own. What the user sees is this: the notification says "Crashed 3 times, will try again..." and then spins around forever. The so-called retry means that it will never happen again.

**Hole 2: No one bothered to provide services after the computer was turned on. ** After the phone restarts, the watchdog itself will be pulled up by the alarm clock or the shell watchdog - but at this time the binder ** has never been reported ** and the death callback will not be triggered at all. The entire mechanism of "waiting for the binder to die before rescuing it" in the old logic is completely ineffective in the cold start scenario. The service just sits there, unattended.

Current three-level strategy:

1. **Quick retry**: binder dies → pull up after 3 seconds, try 3 times in a row (retain original behavior);
2. **Low frequency recovery**: Failed 3 times → Enter recovery mode, detect and pull up every 5 minutes, **do not exit until successful**. Choosing a frequency of 5 minutes is a compromise between power consumption and response speed - each round of the watchdog requires forking the process and reading `/proc`, which cannot be as intensive as fast retries;

   > **Additional note (zako3.16hp)**: This paragraph was accurate when it was published, but it was quickly discovered that there was a hole in it - **If there is no available pull-up method at all** (the last time was wireless debugging activation, 5555 failed, and did not get the permission to automatically turn on wireless debugging), the recovery loop will do nothing but wake up every 5 minutes, and the notification still says "Retrying". The so-called "until success" presupposes "there is a way to go". This point has been fixed in `zako3.16hp`, please see the supplement at the end of the article for details.
3. **Cold recovery**: When the watchdog itself is pulled up, if it is detected that the service is not running, and has been successfully activated before (mode has been recorded), and the owner has not just manually stopped it - after 5 seconds, press the last activation method (root/adb) to actively pull up. What needs to be filled is the boot hole.

By the way, a more basic bug has been fixed: **When you click "Stop Service" when keep-alive is enabled, the service is pulled up by the watchdog after 3 seconds**. The reason is simple - `Shizuku.exit()` triggers the binder death callback, and the watchdog treats it as a crash and schedules a restart. The master's clear operation is overturned by his own keep-alive logic, which is a logical contradiction. Now the four stop entrances (homepage status card, homepage dialog box, shortcut tile, Tasker) will all adjust `WatchdogService.noteIntentionalStop()` first: not only letting go of the following death callback, but also suppressing automatic reconnection for 30 minutes. If the owner still ignores it after 30 minutes, the keep-alive operation will continue - this is in line with the semantics of the word "watchdog".
The notification bar can finally speak human language: two new states are added: "Low-frequency retry for the Nth time" and "Keep stopped as requested by the owner". It no longer displays "Crashed, will try again..." regardless of the actual situation.

## 5. Construction and verification

- Both GitHub version and F-Droid version double variant `assembleRelease` passed;
- APK in-core verification: complete trilingual copywriting (English/Simplified Chinese/Traditional Chinese), official fingerprint constants in DEX, permission table and package name tags without upstream residue;
- Version numbers `versionCode 316` / `zako3.16`, update logs, development documents (`docs/dev/changelog.html` generated by `tools/md2html.py`) are synchronized.

## 6. What I want to say

This project started as a "repackaged and renamed Fork" (the legal one), and now it spends a whole page to make itself look like it can be verified from any angle - identity, signature, fingerprint disclosure, self-examination - in a sense, it is a reincarnation.

To those who have installed this software, I only have one thing to say: **Fingerprint verification only takes three seconds**. Settings → About, click Copy, and compare it with the line `515BAF0C…` in the GitHub README. Sorry, what you have is not from me. This action is worth making a habit of—not just for me, but for every critical piece of software you install.

When it comes to service and survival, it’s still the same sentence: The meaning of her existence is that you don’t need to worry about her. It will save you when it is dead, and it will come back on its own when it is turned on. If you ask her to stop, she will stop honestly.

above. See zako3.16.

---

## Supplementary note: zako3.16hp

After the article was published, I went back and reviewed the link between pairing and activation, and came up with two questions, one of which was exactly what I said in Section 4 above - **I said "don't quit until you succeed", but I didn't make it clear "what happens if there is no way out"**.

- **Low frequency recovery will idle**: When wireless debugging was activated last time, 5555 was blocked, and there was no permission to automatically turn on wireless debugging, the recovery logic did nothing, but still woke up every 5 minutes, never waiting for success, and the notification kept showing "Retrying". Now it will stop the clock and truthfully say "Automatic reconnection aborted - please start the service manually (or re-authorize/use Root instead)", with an additional try limit of about 1 hour. **This version fixes "Notice to stop claiming something that cannot be done"**, which is the same problem as the signature self-examination in Section 3: the interface should not speak for the facts.
- **Pairing leaks resources on every attempt**: The pairing client is closeable, but both call paths never close it. So every pairing attempt - including every failed retry - will miss two file descriptors and a piece of native memory, where a copy of the SPAKE2 key is stored. Retrying on failure is exactly the intended high-frequency operation of the pairing design.

`zako3.16hp` Released: [github.com/cr1437/Shizako/releases/tag/zako3.16hp](https://github.com/cr1437/Shizako/releases/tag/zako3.16hp).
`versionCode` is still 316, only `versionName` has the `hp` suffix added, and can directly overwrite and install zako3.16; the signature fingerprint remains unchanged and is still `515BAF0C…9F9C8A`.

There is one thing worth writing down separately, because it is the most valuable part of this edition: **The two questions above were too superficially looked at by me during the first round of review, and they were discovered only after "checking again"**. The most critical part of the review is not to read the code, but to actually compile the changes - `WatchdogService`. One `import` was missed when adding the log, which cannot be seen at all by simply reading the code. In an earlier round, I was almost fooled by Gradle's `FROM-CACHE`, thinking that "clean and passed" would count as passed.

So in Section 6, I would like to add another sentence to the sentence "Verifying a fingerprint only takes three seconds": **It's worth reading the code again. **
