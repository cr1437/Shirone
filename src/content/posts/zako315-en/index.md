---
title: zako3.15 update instructions
published: 2026-10-16
lang: en
permalink: posts/zako315
tags:
  - Open source projects
  - Project updates
  - Shizako
category: Open source projects
draft: false
aiSummary: "The sentence \"It doesn't match, but it shows that it is paired\" made me go through the entire pairing link: the key is placed when the object is constructed, the interface shows \"the keystore is not empty\" when the pairing is successful, and the client uses nine silent return false to swallow up the failure reason. In this version, the key is changed to be written only after the pairing is successful, and the failure is changed to a talking exception."
pinned: false
---

`zako3.15` is the second version I posted today.

The previous `zako3.14` solves the problem of "no matching service automatically discovered": when mDNS is blocked by the system or VPN, the pairing dialog box only has a circle left, and the port and pairing code input boxes do not appear at all. Just a few hours after that problem was fixed, I received the following feedback.

## 0. What has been changed in this version?

| Category | Content |
| --- | --- |
| Repair | After pairing fails, the interface falsely reports "paired" - the key is changed to **Pairing is successful only** |
| Fix | There is no prompt when pairing fails - instead a named exception is thrown, distinguishing three reasons for failure |
| Fix | When pairing in the notification bar fails to generate a key, it will always stop at "Pairing" |
| Repair | Users who upgraded from the old version will automatically rewrite the pairing record without having to re-pair |
| Repair | "Forgot pairing" clears the success record at the same time and no longer remains |
| i18n | There is a Chinese word "jiang" mixed into the English activation page copy |
| Build | F-Droid version no longer declares `REQUEST_INSTALL_PACKAGES` without any consumer |

The first two items are the main text. They all look like "the interface status display is wrong", but the real culprit is one in the key placement timing and the other in the delivery method of the failure information.

---

## 1. Report

> I can't pair with the code. Any idea? And after it failed to pair, it displayed that it has been paired.

The person who said this is linsui, the maintainer of F-Droid. He is reviewing the MR that I mentioned about F-Droid. There are actually **two independent questions** in this passage:

1. **Not a match** - It may be an operational problem (such as filling in the wrong pairing port), or it may be a device compatibility problem;
2. **Pairing failed, but it shows that it has been paired** - There is no excuse for this, it must be my bug.

The second one is much more serious than the first. The only basis for the user to judge "whether it can be used" is the status of that line; once the status lies, the user has no feedback available - he does not know what he did wrong, nor does he know whether to try again or change the activation method.

So I started with the second one.

---

## 2. Forensic A: Why does a failed pairing leave the key?

The first step in pairing is to construct `AdbKey`:
```kotlin
val key = AdbKey(PreferenceAdbKeyStore(ShizukuSettings.getPreferences()), "shizuku")
```
And the constructor of `AdbKey` will be adjusted all the way to `getOrCreatePrivateKey()`:
```kotlin
private fun getOrCreatePrivateKey(): RSAPrivateKey {
    var privateKey: RSAPrivateKey? = null
    val aad = ByteArray(16)
    "adbkey".toByteArray().copyInto(aad)

    var ciphertext = adbKeyStore.get()
    if (ciphertext != null) {
        // 仓库里已经有密钥：解密后直接复用
        val plaintext = decrypt(ciphertext, aad)
        privateKey = keyFactory.generatePrivate(PKCS8EncodedKeySpec(plaintext)) as RSAPrivateKey
    }
    if (privateKey == null) {
        // 仓库是空的：现在生成一对新密钥，并且**立刻写进仓库**
        val keyPair = keyPairGenerator.generateKeyPair()
        privateKey = keyPair.private as RSAPrivateKey

        ciphertext = encrypt(privateKey.encoded, aad)
        if (ciphertext != null) {
            adbKeyStore.put(ciphertext)      // ← 落盘在这里，而不是在配对成功之后
        }
    }
    return privateKey
}
```
The key is the last one `put`: **The key is placed in the "Constructing Object" step and has nothing to do with whether the pairing is successful. **

The action sequence of pairing is "first construct `AdbKey` → then connect to the pairing service" - so if the pairing code is entered incorrectly, the port is blocked, the user closes the system dialog box midway, or even the process is killed during the pairing process, a key that **adbd has never seen** will be quietly left locally.

---

## 3. Evidence B: The interface shows "the keystore is not empty" as the pairing is successful.

Let’s look at the judgment end again. The activation page uses this line to determine "whether it has been paired":
```kotlin
/** 本地是否已经存了配对用的 adb 私钥（配对过一次就一直有） */
private fun hasPairingKey(): Boolean =
    PreferenceAdbKeyStore(ShizukuSettings.getPreferences()).get() != null
```
The comment says "It is always there after pairing once", but combined with the previous section, we can see that its actual semantics is "**There is something in the local warehouse**" - and a failed pairing will also leave something in the warehouse.

When the two problems are multiplied, it becomes the phenomenon that users see: **As long as the pairing button is clicked once, the activation page will permanently display "Paired"**, regardless of whether the pairing is successful or failed.

Basically, a concept has been merged: `本地有一把密钥` and `设备信任这把密钥` are two different things, but they are represented by the same expression in the code. The authoritative information about whether the device trusts it or not is on the device side (in the authorization list of adbd). The only thing that can be truly confirmed locally is "I successfully ran a pairing."

---

## 4. Forensic C: Failure is silent

The root cause of the "unworthy" half lies on the client side. The original `start()` looks like this:
```kotlin
fun start(): Boolean {
    setupTlsConnection()

    state = State.ExchangingMsgs
    if (!doExchangeMsgs()) {
        state = State.Stopped
        return false
    }

    state = State.ExchangingPeerInfo
    if (!doExchangePeerInfo()) {
        state = State.Stopped
        return false
    }

    state = State.Stopped
    return true
}
```
There are **7 `return false`** hidden in the two sending and receiving functions:

| Location | Trigger Condition |
| --- | --- |
| `doExchangeMsgs` | Unable to read peer's `SPAKE2_MSG` header |
| `doExchangeMsgs` | Packet type is not `SPAKE2_MSG` |
| `doExchangeMsgs` | `initCipher()` returns false |
| `doExchangePeerInfo` | `encrypt()` returns null |
| `doExchangePeerInfo` | Unable to read peer's `PEER_INFO` header |
| `doExchangePeerInfo` | Packet type is not `PEER_INFO` |
| `doExchangePeerInfo` | The length after decryption does not match |

The caller (pairing dialog box) handles it like this:
```kotlin
result.onSuccess { success ->
    if (success) {
        onPairSuccess()
    }
    // success 为 false 时：什么都不做
}
```
**The wrong pairing code is entered in item 3** ——The codes calculated on both sides of SPAKE2 are inconsistent, `initCipher()` returns false. In other words, the mistake that users are most likely to make happens to fall on a "silent return" path.

Net effect: **The user clicks OK, spins around, and then nothing. ** No error, no prompt, I don’t know whether to change the pairing code or restart the LAN debugging.

There is another problem with the same problem: when the pairing path in the notification bar encounters a key generation failure, it directly `return@launch`, and the notification will always stop at "Pairing", and the user cannot wait for any results.

---

## 5. How did I change it?

### 5.1 Delayed key placement

A separate layer of warehouse packaging is added to the matching scene:
```kotlin
class DeferredAdbKeyStore(private val delegate: AdbKeyStore) : AdbKeyStore {

    private var pending: ByteArray? = null

    /** 配对期间只进内存，不碰磁盘。 */
    override fun put(bytes: ByteArray) {
        pending = bytes
    }

    /** 读优先拿内存里的，否则回落到真正的仓库（复用上次配对留下的密钥）。 */
    override fun get(): ByteArray? = pending ?: delegate.get()

    /** 配对成功：这一刻才把暂存的密钥写进真正的仓库。 */
    fun commit() {
        pending?.let { delegate.put(it) }
    }
}
```
Both pairing entrances (dialog box, notification bar service) use it instead, only at the moment of success `commit()`.

**Why not "delete the newly written key when it fails"**: That way of writing relies on failure processing to be executed - but if the user directly closes the dialog box and the process is recycled by the system, the cleanup will be skipped, and the dirty key will still remain on the disk. Delayed placement means "no writing at all" and there is no window that needs to be cleared. By the way, there is a benefit: if the user has successfully paired before, `AdbKey` will reuse the old key and will not trigger `put` at all. This failed attempt will not touch the key in use.

### 5.2 Record "successful matching" as an independent fact
```kotlin
object AdbPairingState {

    private const val KEY_PAIRED_AT = "adb_paired_at"

    /** 配对成功的时间戳；0 表示没有成功记录。 */
    fun pairedAt(preferences: SharedPreferences): Long = preferences.getLong(KEY_PAIRED_AT, 0L)

    fun isPaired(preferences: SharedPreferences): Boolean = pairedAt(preferences) > 0L

    fun markPaired(preferences: SharedPreferences) {
        preferences.edit { putLong(KEY_PAIRED_AT, System.currentTimeMillis()) }
    }

    fun clear(preferences: SharedPreferences) {
        preferences.edit { remove(KEY_PAIRED_AT) }
    }
}
```
From this point on, "pairing successful" is a fact of its own, and is only written after `AdbPairingClient` actually runs the entire process. Change the "Paired" on the activation page and boot page to read it, and no longer check whether the keystore is empty or not.

### 5.3 Failure is no longer a `false`

`start()` is changed to return `Unit`, and an exception will be thrown if it fails:
```kotlin
/**
 * 跑完整个配对流程；失败一律抛异常。
 */
fun start() {
    setupTlsConnection()

    state = State.ExchangingMsgs
    doExchangeMsgs()

    state = State.ExchangingPeerInfo
    doExchangePeerInfo()

    state = State.Stopped
}
```
The most important one has changed from "silent" to "named":
```kotlin
// SPAKE2 的密码校验不过 = 两边算出来的配对码不一致：
// 输错了，或者那个配对码已经作废（系统配对对话框一关，码就失效）。
if (!pairingContext.initCipher(theirMessage)) {
    throw AdbInvalidPairingCodeException()
}
```
The newly added `AdbPairingFailedException(reason)` (`reason` only enters the log and does not echo to the user) is thrown uniformly for issues on the protocol layer and encryption layer; `java.net.ConnectException` and `javax.net.ssl.SSLException` are thrown up as they are - they are semantically different things, and the caller needs to be able to distinguish them. After the modification, not a single `return false` is left in the entire matching process.

### 5.4 Interface: Give "errors unrelated to the input box" a separate place

It turns out that all exceptions are stuffed under the port input box:
```kotlin
else -> {
    portError = err.message ?: context.getString(R.string.cannot_connect_port)
}
```
This will mislead users to change the port repeatedly. Now it is divided into three levels, and a new one `generalError` is displayed:

| Exception type | Prompt copy | Next step for the user |
| --- | --- | --- |
| `AdbInvalidPairingCodeException` | The pairing code is wrong or expired. | Look again at the 6-digit code in the system dialog box |
| `SSLException` | Unable to establish an encrypted connection with the pairing service: the port or pairing code may have expired | Reopen the system "Pair device using pairing code" dialog box |
| `AdbPairingFailedException` | Pairing was interrupted by the device | Same as above, try again |

The path in the notification bar is processed synchronously: key generation failure is changed to normal reporting (originally it was a silent exit). The cause of the failure is also distinguished in the notification text. If the reason is unknown, a prompt is given to follow the instructions instead of dumping the stack to the user.

### 5.5 Allow users of old versions to automatically restore

Changing the judgment criteria will definitely hurt old users: they have local keys available, but the newly added "success record" is empty. After upgrading, they will be prompted with "no record of successful pairing."

So a step of self-healing was added - once the service is successfully started, it means that the key is indeed trusted by the device, and the record is filled in on the spot:
```kotlin
val running = Shizuku.pingBinder()
val hasKey = hasPairingKey()
// 服务跑起来了，说明这把密钥确实被设备信任 —— 顺手补一笔配对记录。
// 旧版本没有这份记录，升级上来的用户靠这一步自动恢复正常显示。
if (running && hasKey && !AdbPairingState.isPaired(preferences)) {
    AdbPairingState.markPaired(preferences)
}
```
On the contrary, "Forgot Pairing" will now clear `adbkey` and the success record together - only the key will be deleted and the record will be left. The interface will continue to display "Paired", which is equivalent to committing this bug again in a different direction.

---

## 6. A little methodology

What these two bugs have in common is the old saying:

> **Wherever "the writing end has written one step earlier, but the reading end regards it as final state evidence", the interface will start to make up facts for the user. **

The order of investigation is also very fixed:

1. First distinguish the "status seen by the user" is calculated from **which piece of data** - in this case, "whether there is a local key";
2. Ask again at what moment and by whom this data was written - in this case "when the object is constructed", not "when the operation is successful";
3. Once you find this time difference, the problem will emerge by itself.

The other half (silent failure) is another example: using a return value to express failure without assigning any semantics to the failure. `Boolean` can only explain "it didn't work", but cannot tell "why it didn't work"; when the only thing the caller can do is "do nothing", writing an extra `return false` is equivalent to leaving the user where they are. Putting a type on failure is the lowest cost to let the interface speak.

---

## 7. Versions and products

| item | value |
| --- | --- |
| versionCode / versionName | `315` / `zako3.15` (GitHub version), `zako3.15-f` (F-Droid version) |
| Build stack | AGP 8.10.1 / Kotlin 2.2.21 / compileSdk 36 / minSdk 24 / JVM 21 |
| Signature | `CN=Shizako, OU=Churan` (same certificate as the old version, can be directly overwritten and installed) |
| Product | `shizako-zako3.15-release.apk`, 8,253,481 bytes, MD5 `a043afb432bcaffefb6fc91cee52b224` |
| Corresponding submission | `ee4c2f1` (tag `zako3.15`) |

---

## 8. Attachment: A really useful troubleshooting tip

The port used for pairing is not the port shown at the top of the "Wireless Debugging" page.

What you need to get is the one in the system's "**Pair device with pairing code**" dialog box (formed like the part after the colon of `192.168.1.5:37241`), and the port will change every time you open this dialog box. The performance of filling in the wrong port is "immediate pairing failure", which can easily be mistaken as a broken function - half of the problems encountered by linsui are likely to be here.

> [!TIP]
> - In the pairing dialog box, you can now enter the port manually under any circumstances (changed from `zako3.14`), without waiting for the result to be automatically discovered.
> - When automatic discovery (mDNS) fails, a clear prompt will appear: The system, VPN or firewall may be blocking multicast.
> - The pairing code is only valid when the system dialog box is kept open, and will be invalid when it is closed - this will be written directly in the error text now.

---

## Attached: Submission timeline
```
2026-10-16 01:43  1db9619  fix(activation): 自动发现不到配对服务时改为手动输入端口   （zako3.14）
2026-10-16 01:43  40a159f  chore(release): zako3.14
2026-10-16 01:47  7f14103  docs(site): 官网更新到 zako3.14
2026-10-16 02:08  e8a412a  fix(pairing): 配对失败不再谎报「已配对」，失败原因可见
2026-10-16 02:08  ee4c2f1  chore(release): zako3.15
2026-10-16 02:09  05efdd3  docs(site): 官网更新到 zako3.15
2026-10-16 02:36  ca6a34e  fix(i18n): 英文激活页文案误混入中文「酱」
2026-10-16 02:40  41f3681  docs(fastlane): 补 315 的更新日志
2026-10-16 02:44  3af09ed  docs(fdroid): 本地 recipe 与 MR 现状对齐
2026-10-16 02:56  f1a8e59  fix(fdroid): F-Droid 版不再声明未使用的 REQUEST_INSTALL_PACKAGES
2026-10-16 02:57  6bfa50d  docs(fdroid): recipe 副本跟进 MR（pin f1a8e59、补权限说明）
```
