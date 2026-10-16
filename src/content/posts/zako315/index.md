---
title: "zako3.15更新说明"
published: 2026-10-16
tags: ["开源项目", "项目更新", "Shizako"]
category: "开源项目"
draft: false
pinned: true
aiSummary: "一句「配不上对，却显示已配对」让我把配对链路整个翻了一遍：密钥在对象构造时就落盘、界面拿「密钥库非空」当配对成功、客户端用九个静默的 return false 吞掉失败原因。这一版把密钥改成配对成功才写，把失败改成会说话的异常。"
---

`zako3.15` 是我今天发的第二个版本。

上一个 `zako3.14` 解决的是「自动发现不到配对服务」：mDNS 被系统或 VPN 拦掉时，配对对话框只剩一个转圈，端口和配对码输入框根本不出现。那个问题刚修完几个小时，就收到了下面这段反馈。

## 0. 这一版改了什么

| 类别 | 内容 |
| --- | --- |
| 修复 | 配对失败后界面谎报「已配对」—— 密钥改为**配对成功才落盘** |
| 修复 | 配对失败没有任何提示 —— 改为抛出具名异常，区分三种失败原因 |
| 修复 | 通知栏配对遇到密钥生成失败会永远停在「配对中」 |
| 修复 | 旧版本升级上来的用户自动补写配对记录，不必重新配对 |
| 修复 | 「忘记配对」同时清掉成功记录，不再残留 |
| i18n | 英文激活页文案里混进的一个中文「酱」 |
| 构建 | F-Droid 版不再声明没有任何使用方的 `REQUEST_INSTALL_PACKAGES` |

前两条是正文。它们看起来都像「界面状态显示不对」，但真凶一个在**密钥的落盘时机**上，另一个在**失败信息的传递方式**上。

---

## 1. 报告

> I can't pair with the code. Any idea? And after it failed to pair, it displayed that it has been paired.

说这话的是 F-Droid 的维护者 linsui，他正在 review 我提的 F-Droid 上架 MR。这段话里其实是**两个独立的问题**：

1. **配不上对** —— 可能是操作问题（比如配对端口填错），也可能是设备兼容问题；
2. **配对失败了，却显示已配对** —— 这个没什么可辩解的，一定是我的 bug。

第二个比第一个严重得多。用户判断「能不能用」的唯一依据就是那一行状态；状态一旦说谎，用户就没有任何可用的反馈了 —— 他既不知道自己哪里做错了，也不知道该重试还是该换一种激活方式。

所以我先动手的是第二个。

---

## 2. 取证 A：为什么一次失败的配对会留下密钥

配对的第一步是构造 `AdbKey`：

```kotlin
val key = AdbKey(PreferenceAdbKeyStore(ShizukuSettings.getPreferences()), "shizuku")
```

而 `AdbKey` 的构造函数会一路调到 `getOrCreatePrivateKey()`：

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

关键在最后那个 `put`：**密钥是在「构造对象」这一步落盘的，跟配对成没成功毫无关系。**

而配对的动作序列是「先构造 `AdbKey` → 再连配对服务」——于是配对码输错、端口不通、用户中途关掉系统对话框、乃至配对过程中进程被杀，本地都会安安静静地留下一把 **adbd 从来没有见过的密钥**。

---

## 3. 取证 B：界面拿「密钥库非空」当配对成功

再看判定端。激活页判断「是否已配对」用的是这一行：

```kotlin
/** 本地是否已经存了配对用的 adb 私钥（配对过一次就一直有） */
private fun hasPairingKey(): Boolean =
    PreferenceAdbKeyStore(ShizukuSettings.getPreferences()).get() != null
```

注释写的是「配对过一次就一直有」，但结合上一节就能看出来，它的实际语义是「**本地仓库里有东西**」——而一次失败的配对同样会在仓库里留下东西。

两个问题乘起来，就成了用户看到的现象：**只要点过一次配对按钮，激活页就永久显示「已配对」**，无论那次配对是成是败。

根子上是一个概念被合并了：`本地有一把密钥` 和 `设备信任这把密钥` 是两件不同的事，代码里却用了同一个表达式表示。设备信不信的权威信息在设备那边（adbd 的授权列表里），本地真正能确认的只有「我成功跑完过一次配对」。

---

## 4. 取证 C：失败是静默的

「配不上」那半边的根因在客户端。原来的 `start()` 长这样：

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

两个收发函数里还藏着 **7 处 `return false`**：

| 位置 | 触发条件 |
| --- | --- |
| `doExchangeMsgs` | 读不到对端的 `SPAKE2_MSG` 包头 |
| `doExchangeMsgs` | 包类型不是 `SPAKE2_MSG` |
| `doExchangeMsgs` | `initCipher()` 返回 false |
| `doExchangePeerInfo` | `encrypt()` 返回 null |
| `doExchangePeerInfo` | 读不到对端的 `PEER_INFO` 包头 |
| `doExchangePeerInfo` | 包类型不是 `PEER_INFO` |
| `doExchangePeerInfo` | 解密后长度对不上 |

而调用方（配对对话框）是这样处理的：

```kotlin
result.onSuccess { success ->
    if (success) {
        onPairSuccess()
    }
    // success 为 false 时：什么都不做
}
```

**配对码输错走的正是第 3 条** —— SPAKE2 两边算出来的码不一致，`initCipher()` 返回 false。也就是说，用户最容易犯的那个错，恰好落在一条「静默返回」的路径上。

净效果：**用户点下确定，转一下圈，然后什么都没有。** 没有报错、没有提示，不知道该换配对码还是该重开局域网调试。

同一个毛病还有一处：通知栏那条配对路径遇到密钥生成失败时直接 `return@launch`，通知会永远停在「配对中」，用户等不出任何结果。

---

## 5. 我是怎么改的

### 5.1 密钥延迟落盘

给配对场景单独加了一层仓库包装：

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

两处配对入口（对话框、通知栏服务）都改用它，只在成功那一刻 `commit()`。

**为什么不是「失败时把刚写进去的密钥删掉」**：那种写法依赖失败处理一定被执行 —— 而用户直接关掉对话框、进程被系统回收，都会跳过清理，脏密钥照样留在盘上。延迟落盘是「压根不写」，没有需要清理的窗口。顺带一个好处：如果用户以前已经配对成功过，`AdbKey` 会复用旧密钥、根本不会触发 `put`，这次失败的尝试也不会动到那把正在用的密钥。

### 5.2 把「配对成功过」记成一笔独立的事实

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

从此刻起，「配对成功」是它自己的一个事实，只有 `AdbPairingClient` 真正跑完整个流程才写入。激活页、引导页的「已配对」全部改读它，不再看密钥库非不非空。

### 5.3 失败不再是一个 `false`

`start()` 改成返回 `Unit`，失败一律抛异常：

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

其中最要紧的那一条，从「静默」变成了「具名」：

```kotlin
// SPAKE2 的密码校验不过 = 两边算出来的配对码不一致：
// 输错了，或者那个配对码已经作废（系统配对对话框一关，码就失效）。
if (!pairingContext.initCipher(theirMessage)) {
    throw AdbInvalidPairingCodeException()
}
```

协议层与加密层的问题统一抛新加的 `AdbPairingFailedException(reason)`（`reason` 只进日志，不回显给用户）；`java.net.ConnectException`、`javax.net.ssl.SSLException` 则原样上抛 —— 它们在语义上本来就是不同的东西，调用方需要能区分。改完之后，整个配对流程里**一个 `return false` 都不剩了**。

### 5.4 界面：给「跟输入框无关的错误」单独一块地方

原来所有异常都被塞进端口输入框下面：

```kotlin
else -> {
    portError = err.message ?: context.getString(R.string.cannot_connect_port)
}
```

这会误导用户去反复改端口。现在分了三档，而且另起一块 `generalError` 展示：

| 异常类型 | 提示文案 | 给用户的下一步 |
| --- | --- | --- |
| `AdbInvalidPairingCodeException` | 配对码错误或已失效。 | 重新看一遍系统对话框里的 6 位码 |
| `SSLException` | 无法与配对服务建立加密连接：端口或配对码可能已经失效 | 重开系统「使用配对码配对设备」对话框 |
| `AdbPairingFailedException` | 配对被设备中断了 | 同上，重来一次 |

通知栏那条路径同步处理：密钥生成失败改为正常上报（原来是默默退出），失败原因也在通知正文里区分出来，原因不明时给一句能照做的提示，而不是把堆栈甩给用户。

### 5.5 让旧版本用户自动恢复

改判定标准必然会伤到老用户：他们本地有可用的密钥，但新加的「成功记录」是空的，升级后会被提示「没有配对成功的记录」。

所以加了一步自愈 —— 服务一旦成功启动，就说明这把密钥确实被设备信任，当场把记录补上：

```kotlin
val running = Shizuku.pingBinder()
val hasKey = hasPairingKey()
// 服务跑起来了，说明这把密钥确实被设备信任 —— 顺手补一笔配对记录。
// 旧版本没有这份记录，升级上来的用户靠这一步自动恢复正常显示。
if (running && hasKey && !AdbPairingState.isPaired(preferences)) {
    AdbPairingState.markPaired(preferences)
}
```

反过来，「忘记配对」现在会把 `adbkey` 和成功记录**一起**清掉 —— 只删密钥、留下记录，界面会继续显示「已配对」，等于把这次的 bug 换个方向再犯一次。

---

## 6. 一点方法论

这两处 bug 的共性还是那句老话：

> **凡是「写入端早写了一步、读取端却把它当成终态证据」的地方，界面就会开始替用户编造事实。**

顺着它排查的顺序也很固定：

1. 先分清「用户看到的状态」是由**哪一份数据**算出来的 —— 本例是「本地有没有密钥」；
2. 再问这份数据是**在哪一刻、由谁**写进去的 —— 本例是「对象构造时」，而不是「操作成功时」；
3. 找到这个时间差，问题就自己浮出来了。

另一半（失败静默）是另一种典型：**用返回值表达失败，却不给失败分配任何语义**。`Boolean` 只能说明「没成」，说不出「为什么没成」；当调用方唯一能做的是「什么都不做」时，多写一条 `return false` 就等于把用户扔在原地。让失败带上类型，是让界面能开口说话的最低成本。

---

## 7. 版本与产物

| 项 | 值 |
| --- | --- |
| versionCode / versionName | `315` / `zako3.15`（GitHub 版）、`zako3.15-f`（F-Droid 版） |
| 构建栈 | AGP 8.10.1 / Kotlin 2.2.21 / compileSdk 36 / minSdk 24 / JVM 21 |
| 签名 | `CN=Shizako, OU=Churan`（与旧版同证书，可直接覆盖安装） |
| 产物 | `shizako-zako3.15-release.apk`，8,253,481 字节，MD5 `a043afb432bcaffefb6fc91cee52b224` |
| 对应提交 | `ee4c2f1`（tag `zako3.15`） |

---

## 8. 附：一个真正有用的排障提示

配对用的端口，**不是**「无线调试」页面顶部显示的那个端口。

要拿的是系统「**使用配对码配对设备**」对话框里那一个（形如 `192.168.1.5:37241` 冒号后面的部分），而且**每次打开这个对话框端口都会变**。填错端口的表现是「配对立刻失败」，很容易被误认为功能坏了 —— linsui 遇到的问题里，操作那一半大概率就在这儿。

> [!TIP]
> - 配对对话框里现在**任何情况下都能手输端口**（`zako3.14` 改的），不用等自动发现出结果。
> - 自动发现（mDNS）失败时会明确提示：可能是系统、VPN 或防火墙拦了组播。
> - 配对码只有在系统那个对话框**保持打开**时有效，关掉就作废 —— 现在报错文案里会直接这么写。

---

## 附：提交时间线

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
