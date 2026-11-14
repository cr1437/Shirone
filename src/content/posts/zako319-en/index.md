---
title: "Zako3.19 update instructions: two real root causes of wireless debugging pairing/activation"
published: 2026-11-14
lang: en
permalink: posts/zako319
tags:
  - Open source projects
  - Project updates
  - Shizako
category: Open source projects
draft: false
aiSummary: "Wireless debugging always fails, or the service fails to start after pairing is successful - this version unearthed two real root causes: Kotlin's Socket.apply causes the port to be parsed to 0, and each pairing is connected to 127.0.0.1:0; and adbd sends SIGHUP to the process group when the shell channel is closed, killing the service sub-process that does not have a setsid between fork and exec. By the way, the old service process cleaning failure has been repaired, and the diagnostic log test function on the homepage has been removed."
pinned: true
---

`zako3.19` only does one main thing: **really repair the activation link of "wireless debugging"**.

Starting from zako3.16, users have been reporting the same phenomenon: **Root can be activated normally, but wireless debugging cannot**. After entering the pairing code, it is either stuck at "Unable to connect to the wireless debugging service", or the pairing is successful but the service cannot be started. In this version, both root causes were dug out and repaired, and this time it was not based on guesswork - the entire link was run through in the Android virtual machine, and every step was documented with logs.

## 0. What has been changed in this version?

| Category | Content |
| --- | --- |
| Fix | Pairing connection port masked as `0` by Kotlin receiver, connecting every time to `127.0.0.1:0` |
| Fix | The service subprocess was killed by adbd's `SIGHUP` between `fork()` and `setsid()`, resulting in "pairing successful but service cannot start" |
| Fix | The old service process cleanup logic never takes effect (`--nice-name` rewrites cmdline into a nickname), and two `shizako_server` may appear after the upgrade |
| Optimization | Changed to "Start the service on the available port first, and then try to switch to TCP 5555", switching failure will no longer block activation |
| Optimization | When the paired port expires, it automatically switches to the latest mDNS port and retries; mDNS discovery window 3s → 6s; LAN cover is changed to all non-loopback IPv4 |
| Remove | Home page "Diagnostic Log" test function (only appears in `-PlogBuild` troubleshooting package), source code and release package no longer include |
| Version | `versionCode 319` / `zako3.19`, signature fingerprint remains unchanged |

## 1. First explain why the two activation paths behave differently.

The root activation method is `su -c`: after getting the root, directly use `app_process` to start the service without going through any ADB link.

Wireless debugging activation is a completely different link:

1. The system "Wireless Debugging" is turned on, and `adbd` monitors the pairing service on a random port (`_adb-tls-pairing._tcp`);
2. The App uses the 6-digit pairing code to perform TLS + SPAKE2 pairing with adbd (native layer `adb_pairing.cpp`);
3. After successful pairing, the App executes the command through the `shell:` service and pulls up `libshizuku.so` as a service.

**Root will not touch any step in 1, 2, and 3. ** So as long as the bug occurs in these three steps, the phenomenon must be "Root works, but wireless debugging does not work." The two root causes found this time happened to be one in step 2 and one in step 3.

## 2. Root cause 1: `Socket.apply` swallowed the paired port into `0`

In the paired client `AdbPairingClient`, establishing a TLS connection was originally written like this (changed from `Socket(host, port)` in order to add connection timeout):
```kotlin
socket = java.net.Socket().apply {
    tcpNoDelay = true
    connect(java.net.InetSocketAddress(host, port), CONNECT_TIMEOUT_MS)
}
```
It looks like `port` is the field used to construct `InetSocketAddress`. In fact - the **receiver of `apply` is `Socket`**, and `Socket` has one of its own `getPort()` (always `0` when not connected). In Kotlin's implicit receiver priority, the closer `Socket.getPort()` will cover the class field `port`. So what each pairing actually performs is:
```text
connect(InetSocketAddress(host, 0), timeout)
```
The field log looks like this (before repair):
```text
AdbPairClient: pairing start: hosts=[127.0.0.1, 10.0.2.16, 10.0.2.15] port=34939
AdbPairClient: tcp connect -> 127.0.0.1:0
AdbPairClient: tcp connect -> 10.0.2.16:0
AdbPairClient: tcp connect -> 10.0.2.15:0
java.net.ConnectException: failed to connect to /127.0.0.1 (port 0) ... ECONNREFUSED
```
The pairing service is alive and the mDNS port is correct, but the client always tries to connect to port 0 - which of course fails every time. What the user sees is "Unable to connect to the wireless debugging service."

The fix is ​​straightforward: first put the port into a local variable, and then connect it outside `apply` so that the variable name no longer participates in receiver resolution.
```kotlin
val remotePort = port
val address = java.net.InetSocketAddress(host, remotePort)
socket = java.net.Socket().apply { tcpNoDelay = true }
socket.connect(address, CONNECT_TIMEOUT_MS)
```
Log after repair:
```text
AdbPairClient: tcp connect -> 127.0.0.1:44047
AdbPairClient: Handshake succeeded via 127.0.0.1:44047
AdbPairingService: Pair succeed
```
The lesson of this bug is not a "Kotlin pit", but: **As long as the scope of the variable and the object member have the same name, lambdas with receivers such as `apply` / `run` / `with` may quietly change their pointers**. The compiler will not warn when the construction parameters, member attributes, and receiver members have the same names.

## 3. Root cause two: the shot after `fork()` and before `setsid()` `SIGHUP`

After the port was repaired, pairing was successful, but a new phenomenon occurred: **Pairing was successful, but the service could not start**. There are only two lines in logcat:
```text
D/Shizuku ( 3899): start_server
D/Shizuku ( 3900): child
D/Shizuku ( 3900): exec app_process
I/init    (    0): Untracked pid 3608 received signal 1
W/AdbPairingService: Service did not come up after pairing
```
`signal 1` is `SIGHUP`. The problem lies in the startup sequence of `starter.cpp`:

1. `fork()` exits the service sub-process;
2. The child process has not had time to `setsid()`;
3. At this time, the ADB shell command ends, `adbd` closes pty, and sends `SIGHUP` to the **foreground process group**;
4. The child process happened to fall in that window and was killed by the hang-up signal. It did not even reach `exec`.

Why is the Root path okay? Because `su -c` does not pass through pty, there will be no such signal.

The fix is ​​only three lines long, but the position is extremely critical - **must come before `fork()`**:
```cpp
signal(SIGHUP, SIG_IGN);
signal(SIGPIPE, SIG_IGN);

pid_t pid = fork();
```
`SIG_IGN` will be inherited by the child process, and will continue to be valid across `exec`, so the forked child process is naturally immune to this signal, and the race window is completely filled. After repairing:
```text
D/Shizuku ( 4607): start_server
D/Shizuku ( 4608): child
D/Shizuku ( 4608): exec app_process
info: shizako_server pid is 4608
info: shizako_starter exit with 0
```
This lesson is more general: **"setid immediately after fork" is a classic safe zone habit, but signals belong to the type of state that "takes effect immediately after fork"**. Anything that wants to survive between fork and exec must set up signal processing before fork.

## 4. Digged out by accident: Cleaning up old service processes has never taken effect.

When repairing SIGHUP, I checked the logic of "cleaning up old services before starting" and found that it was always a decoration.

The original judgment was "cmdline contains package name + service class name". But the startup parameter of `app_process` contains `--nice-name=shizako_server`, **it will rewrite `/proc/<pid>/cmdline` to only the nickname**. Therefore, the match will never be successful. After the upgrade, two `shizako_server` may appear trying to register the same binder.

The current judgment is changed to two steps:

1. cmdline is equal to `shizako_server` → considered to be the service of this application;
2. If it is equal to the old nickname `shizuku_server`, read `/proc/<pid>/maps` again and make sure it contains the name of the application package before proceeding.

In this way, you can clear out the old processes left behind before upgrading, and you will not accidentally kill the official Shizuku server.

## 5. Remove "optional optimization" from the activation path

The previous order was "cut `tcpip:5555` first, and then start the service." However, switching TCP is only for the optimization of "avoiding direct network connection in the future" and should not in turn become a prerequisite for activation - failure to switch (some ROM restrictions, abnormal adbd status) will directly block the entire activation.

Now the order of `AdbStarter` is:

1. First pull up the service on the **currently available port** given by the caller;
2. Try your best to switch to fixed TCP 5555;
3. If the switch fails, only the log will be recorded and the existing services will not be affected.

Several other aspects of pairing robustness:

- Automatically switch to the latest mDNS port and try again when the connection is rejected (paired port expiration is a high-frequency operation);
- Split-screen pairing also covers `ConnectException` (originally only retrying `SSLException` in the handshake phase);
- `_adb-tls-connect._tcp` discovery window relaxed from 3s to 6s;
- The LAN IP address has been changed from "First IPv4" to "All non-loopback IPv4, Wi-Fi first", and devices with multiple network cards will no longer pick the wrong network card;
- Give a **visible notification** when pairing is successful but the service is not up, instead of just leaving a line in logcat.

## 6. Remove the "Diagnostic Log" test function on the homepage

In order to troubleshoot on-site problems before, I added a homepage card that only appears in the `-PlogBuild` troubleshooting package: logcat is recorded upon startup, and the homepage provides recording switches, exporting, and copying. It is positioned as "temporarily distributed to individual users to troubleshoot problems and will not be released." However, since the root cause of wireless debugging has fallen into specific lines of code, there is no need for this debugging function to remain in the source code.

This version deletes the entire chain:

- `diag/DiagLog.kt` (recorder), `home/DiagLogViewHolder.kt` (card), `res/layout/home_diag_log.xml` (layout);
- Card mounting in `HomeAdapter`, recording on startup in `ShizukuApplication`;
- `-PlogBuild` switch, `LOG_BUILD` compile-time field, version name `-log` suffix;
- All `diag_log_*` copywriting in `values/`, `values-b+zh+Hans/`, `values-b+zh+Hant/`.

In the future, there will no longer be a situation where "the troubleshooting package contains an extra card", and the source code on GitHub does not include this test code.

## 7. How to verify
The complete process was run on the Android 12 (API 31, x86_64) virtual machine: System "Wireless Debugging" → "Pair the device using the pairing code" → Enter the 6-digit pairing code in the notification bar → Automatic activation.

Key log:
```text
AdbPairClient: tcp connect -> 127.0.0.1:44047
AdbPairClient: Handshake succeeded via 127.0.0.1:44047
AdbPairingService: Pair succeed
AdbClient: A_OPEN ... shell:.../lib/x86_64/libshizuku.so --apk=...
info: shizako_server pid is 4608
info: shizako_starter exit with 0
```
Process and status:
```bash
$ adb shell ps -A -o USER,PID,PPID,NAME | grep shizako
u0_a105       4303   333 com.churan.shizako
shell         4608     1 shizako_server
```
The service runs as `shell`(2000), and there is only one; 5555 in `/proc/net/tcp6` has been monitored by adbd; the App activation page status is **Running (adb)**.

In addition, "Start directly after pairing" has returned: after killing the service, click "Start service", you can restart `shizako_server`, and the interface returns to Running (adb).

## 8. Versions and products

- `versionCode 319` / `versionName zako3.19`;
- The signature fingerprint remains unchanged: `515BAF0C…9F9C8A`, which can be directly overwritten and installed;
- GitHub Release has attached `shizako-zako3.19-release.apk` signed with the same key.

## 9. For those who are also stuck in wireless debugging

If you are writing something similar, it is recommended to check the sequence according to the link stage. Don’t doubt the certificate at the first glance:

1. **Discovery**: Did mDNS resolve `_adb-tls-pairing._tcp` and the port is correct?
2. **Connect**: Print `host:port`, confirm it is not `0`, and it is not an expired port;
3. **Handshake**: Whether SPAKE2 + TLS is successful (failure is usually a pairing code/protocol issue);
4. **Startup**: Whether the process started with `shell:` after successful pairing is taken away by signal/permission/timing issues.

This time the two root causes fall on steps 2 and 4 respectively - and what they have in common is: the root path does not pass through any one. So "root works" never proves that the wireless link is OK.

above. See zako3.19.