---
title: "zako3.19 更新说明：无线调试配对/激活的两个真根因"
published: 2026-11-14
tags: ["开源项目", "项目更新", "Shizako"]
category: "开源项目"
draft: false
pinned: true
aiSummary: "无线调试一直配不上、或者配对成功服务却起不来——这一版挖出两个真根因：Kotlin 的 Socket.apply 让 port 被解析成 0，每次配对都在连 127.0.0.1:0；以及 adbd 在 shell 通道关闭时给进程组发 SIGHUP，把还没 setsid 的服务子进程杀在了 fork 与 exec 之间。顺带修掉旧服务进程清理失效，并移除首页的诊断日志测试功能。"
---

`zako3.19` 只干一件主线的事：**把「无线调试」这条激活链路真正修好**。

从 zako3.16 开始，一直有用户报同一个现象：**Root 能正常激活，无线调试不行**。配对码输入完，要么卡在「无法连接至无线调试服务」，要么配对成功了但服务起不来。这一版把两个根因都挖出来并修掉了，而且这次不是靠猜——是在 Android 虚拟机里把整条链路跑通、每一步都有日志为证。

## 0. 这一版改了什么

| 类别 | 内容 |
| --- | --- |
| 修复 | 配对连接端口被 Kotlin 接收者遮蔽成 `0`，每次都在连 `127.0.0.1:0` |
| 修复 | 服务子进程在 `fork()` 与 `setsid()` 之间被 adbd 的 `SIGHUP` 杀掉，导致「配对成功但服务起不来」 |
| 修复 | 旧服务进程清理逻辑从未生效（`--nice-name` 把 cmdline 改写成了昵称），升级后可能出现两个 `shizako_server` |
| 优化 | 改成「先在可用端口启动服务，再尽力切 TCP 5555」，切换失败不再挡住激活 |
| 优化 | 配对端口过期自动换 mDNS 最新端口重试；mDNS 发现窗口 3s → 6s；局域网兜底改为所有非回环 IPv4 |
| 移除 | 首页「诊断日志」测试功能（仅在 `-PlogBuild` 排查包里出现），源码与发布包都不再包含 |
| 版本 | `versionCode 319` / `zako3.19`，签名指纹不变 |

## 1. 先讲清楚两条激活路径为什么表现不同

Root 激活走的是 `su -c`：拿到 root 之后直接 `app_process` 拉起服务，不经过任何 ADB 环节。

无线调试激活则是另一条完全不同的链路：

1. 系统「无线调试」打开，`adbd` 在随机端口上监听配对服务（`_adb-tls-pairing._tcp`）；
2. App 用 6 位配对码和 adbd 做 TLS + SPAKE2 配对（native 层 `adb_pairing.cpp`）；
3. 配对成功后，App 通过 `shell:` 服务执行命令，把 `libshizuku.so` 作为服务拉起来。

**Root 不会碰 1、2、3 里的任何一步。** 所以只要 bug 出在这三步里，现象就必然是「Root 行、无线调试不行」。这次查到的两个根因，恰好一个在步骤 2，一个在步骤 3。

## 2. 根因一：`Socket.apply` 把配对端口吞成了 `0`

配对客户端 `AdbPairingClient` 里，建 TLS 连接原来写成这样（为了加连接超时从 `Socket(host, port)` 改过来的）：

```kotlin
socket = java.net.Socket().apply {
    tcpNoDelay = true
    connect(java.net.InetSocketAddress(host, port), CONNECT_TIMEOUT_MS)
}
```

看上去 `port` 是构造 `InetSocketAddress` 用的那个字段。实际上——`apply` 的**接收者是 `Socket`**，而 `Socket` 自己有一个 `getPort()`（未连接时恒为 `0`）。Kotlin 的隐式接收者优先级里，离得更近的 `Socket.getPort()` 会遮住类字段 `port`。于是每次配对实际执行的是：

```text
connect(InetSocketAddress(host, 0), timeout)
```

现场日志长这样（修复前）：

```text
AdbPairClient: pairing start: hosts=[127.0.0.1, 10.0.2.16, 10.0.2.15] port=34939
AdbPairClient: tcp connect -> 127.0.0.1:0
AdbPairClient: tcp connect -> 10.0.2.16:0
AdbPairClient: tcp connect -> 10.0.2.15:0
java.net.ConnectException: failed to connect to /127.0.0.1 (port 0) ... ECONNREFUSED
```

配对服务活着、mDNS 端口也完全正确，但客户端**永远去连 0 号端口**——当然每次都失败。用户看到的就是「无法连接至无线调试服务」。

修复很直白：先把端口落到局部变量，再在 `apply` 外面连接，让变量名不再参与接收者解析。

```kotlin
val remotePort = port
val address = java.net.InetSocketAddress(host, remotePort)
socket = java.net.Socket().apply { tcpNoDelay = true }
socket.connect(address, CONNECT_TIMEOUT_MS)
```

修复后日志：

```text
AdbPairClient: tcp connect -> 127.0.0.1:44047
AdbPairClient: Handshake succeeded via 127.0.0.1:44047
AdbPairingService: Pair succeed
```

这个 bug 的教训不是「Kotlin 坑」，而是：**只要变量的作用域和对象成员重名，`apply` / `run` / `with` 这类带接收者的 lambda 就可能悄悄改变指向**。构造参数、成员属性、接收者成员三方重名时，编译器不会警告。

## 3. 根因二：`fork()` 之后、`setsid()` 之前的那一枪 `SIGHUP`

端口修好之后，配对能成功了，但出现了新现象：**配对成功，服务却起不来**。logcat 里只有两行：

```text
D/Shizuku ( 3899): start_server
D/Shizuku ( 3900): child
D/Shizuku ( 3900): exec app_process
I/init    (    0): Untracked pid 3608 received signal 1
W/AdbPairingService: Service did not come up after pairing
```

`signal 1` 是 `SIGHUP`。问题出在 `starter.cpp` 的启动顺序：

1. `fork()` 出服务子进程；
2. 子进程还没来得及 `setsid()`；
3. 此时 ADB shell 这条命令结束，`adbd` 关闭 pty，给**前台进程组**发 `SIGHUP`；
4. 子进程正好落在那个窗口里，被挂断信号杀掉，连 `exec` 都没跑到。

Root 路径为什么没事？因为 `su -c` 不经过 pty，不会有这个信号。

修复只有三行，但位置极其关键——**必须在 `fork()` 之前**：

```cpp
signal(SIGHUP, SIG_IGN);
signal(SIGPIPE, SIG_IGN);

pid_t pid = fork();
```

`SIG_IGN` 会被子进程继承，并且**跨 `exec` 继续有效**，所以 fork 出来的子进程天然免疫这个信号，竞态窗口被彻底填平。修完之后：

```text
D/Shizuku ( 4607): start_server
D/Shizuku ( 4608): child
D/Shizuku ( 4608): exec app_process
info: shizako_server pid is 4608
info: shizako_starter exit with 0
```

这条教训更通用：**「fork 之后立刻 setsid」是一个经典的安全区习惯，但信号属于「fork 之后就立刻生效」的那一类状态**，凡是要在 fork 与 exec 之间存活的东西，都得在 fork 前把信号处理设置好。

## 4. 顺手挖出来的：旧服务进程清理从来没生效过

修 SIGHUP 时顺手核对了「启动前清理旧服务」的逻辑，发现它一直是摆设。

原来的判断是「cmdline 里包含包名 + 服务类名」。但 `app_process` 的启动参数里带 `--nice-name=shizako_server`，**它会把 `/proc/<pid>/cmdline` 改写成只剩昵称**。于是匹配永远命中不了，升级后可能出现两个 `shizako_server` 抢注册同一个 binder。

现在的判断改成两步：

1. cmdline 等于 `shizako_server` → 认为是本应用的服务；
2. 如果等于旧昵称 `shizuku_server`，再读 `/proc/<pid>/maps`，确认里面包含本应用包名才动手。

这样既清得掉自己升级前留下的旧进程，也不会误杀官方 Shizuku 的 server。

## 5. 把「可选优化」从激活路径上摘出去

之前的顺序是「先切 `tcpip:5555`，再启动服务」。但切 TCP 只是为了「以后免网络直连」的优化，不该反过来成为激活的前置条件——切换失败（部分 ROM 限制、adbd 状态异常）会直接挡住整个激活。

现在 `AdbStarter` 的顺序是：

1. 先在调用方给的**当前可用端口**上把服务拉起来；
2. 再尽力切到固定 TCP 5555；
3. 切换失败只记日志，不影响已经起来的服务。

另外几处配对健壮性：

- 连接被拒时自动换 mDNS 最新端口重试一次（配对端口过期是高频操作）；
- 分屏配对也覆盖 `ConnectException`（原来只对握手阶段的 `SSLException` 重试）；
- `_adb-tls-connect._tcp` 发现窗口从 3s 放宽到 6s；
- 局域网兜底地址从「第一个 IPv4」改为「所有非回环 IPv4，Wi-Fi 优先」，多网卡设备不再挑错网卡；
- 配对成功但服务没起来时给出**可见通知**，而不是只在 logcat 里留一行。

## 6. 移除首页的「诊断日志」测试功能

之前为了排查现场问题，加过一个只在 `-PlogBuild` 排查包里出现的首页卡片：启动即录制 logcat，首页提供录制开关、导出、复制。它的定位是「临时发给个别用户排查问题，不发布」，但既然无线调试的根因已经落到具体代码行，这个调试功能就没有继续留在源码里的必要了。

这一版把它整条链删掉：

- `diag/DiagLog.kt`（录制器）、`home/DiagLogViewHolder.kt`（卡片）、`res/layout/home_diag_log.xml`（布局）；
- `HomeAdapter` 里的卡片挂载、`ShizukuApplication` 里的启动即录制；
- `-PlogBuild` 开关、`LOG_BUILD` 编译期字段、版本名 `-log` 后缀；
- `values/`、`values-b+zh+Hans/`、`values-b+zh+Hant/` 里全部 `diag_log_*` 文案。

以后不会再出现「排查包多一张卡」的情况，GitHub 上的源码也不带这段测试代码。

## 7. 怎么验证的

在 Android 12（API 31，x86_64）虚拟机上跑了完整流程：系统「无线调试」→「使用配对码配对设备」→ 通知栏输入 6 位配对码 → 自动激活。

关键日志：

```text
AdbPairClient: tcp connect -> 127.0.0.1:44047
AdbPairClient: Handshake succeeded via 127.0.0.1:44047
AdbPairingService: Pair succeed
AdbClient: A_OPEN ... shell:.../lib/x86_64/libshizuku.so --apk=...
info: shizako_server pid is 4608
info: shizako_starter exit with 0
```

进程与状态：

```bash
$ adb shell ps -A -o USER,PID,PPID,NAME | grep shizako
u0_a105       4303   333 com.churan.shizako
shell         4608     1 shizako_server
```

服务以 `shell`(2000) 身份运行，且只有一个；`/proc/net/tcp6` 里 5555 已被 adbd 监听；App 激活页状态为 **Running (adb)**。

另外回归了「已配对直接启动」：杀掉服务后点「Start service」，能重新拉起 `shizako_server`，界面回到 Running (adb)。

## 8. 版本与产物

- `versionCode 319` / `versionName zako3.19`；
- 签名指纹不变：`515BAF0C…9F9C8A`，可直接覆盖安装；
- GitHub Release 已附上用同一把钥匙签名的 `shizako-zako3.19-release.apk`。

## 9. 给同样卡在无线调试的人

如果你也在写类似的东西，排查顺序建议按链路的阶段来，别一上来就怀疑证书：

1. **发现**：mDNS 有没有解析出 `_adb-tls-pairing._tcp`、端口对不对；
2. **连接**：打印 `host:port`，确认不是 `0`、不是过期端口；
3. **握手**：SPAKE2 + TLS 是否成功（失败通常是配对码/协议问题）；
4. **启动**：配对成功后用 `shell:` 起的进程，是否被信号/权限/时序问题带走。

这次两个根因分别落在第 2 步和第 4 步——而它们的共同点是：**root 路径一个都不经过**。所以「root 能用」从来不能证明无线链路没问题。

以上。zako3.19 见。
