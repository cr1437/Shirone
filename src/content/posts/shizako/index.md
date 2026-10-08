---
title: "介绍一下我的开源项目：Shizako"
published: 2026-10-07
description: "Shizako 是我做的一个 Android 工具：不 Root 也能使用系统特权 API，兼容 Shizuku-API 生态。这篇简单介绍一下它。"
aiSummary: "本文介绍了作者的开源 Android 工具 Shizako：无需 Root，即可通过无线调试、电脑 ADB、Root 或 Dhizuku 启动特权进程，把系统级能力安全地借给受信任的应用，并兼容 Shizuku-API 生态。"
tags: [Shizako, Android, Shizuku, 开源]
category: 开源项目
draft: false
---

这是我做的一个 Android 小工具，叫 **Shizako**（[GitHub](https://github.com/cr1437/Shizako) ｜ [官网](https://cr1437.github.io/Shizako/)）。

做它的起因很简单：Android 上其实有不少好用的系统级功能，比如静默安装、冻结应用、改权限、读系统设置，但这些普通应用都调用不了。想用得舒服，一般就得 Root —— 但 Root 有风险，也不是每个人都愿意。

所以 Shizako 换了个思路：用无线调试、电脑 ADB 或者 Root 任意一种方式，先启动一个特权小进程，再由它把权限出借给你授权过的应用。每个应用第一次连接都需要你手动确认，之后随时可以收回。

## 它有什么功能

- **免 Root**：通过无线调试 / ADB 激活，不用刷机
- **授权管理**：每个应用单独授权，白名单本地记录，随时收回
- **兼容 Shizuku-API**：用官方 Shizuku SDK 写的应用，不用改代码、不用重编译，装好就能连
- **Dhizuku 模式**：可以把 Shizako 设为「设备所有者」，激活一次之后免 Root、免无线调试
- **四种激活方式**：无线调试 / 电脑 ADB / Root / Dhizuku
- **其它**：Tasker 广播指令、API 审计、自动更新、崩溃日志

## 怎么用

::: steps

1. 去 [Releases](https://github.com/cr1437/Shizako/releases) 下载最新版 APK 安装。

2. 选一种方式激活：

   - **无线调试**（Android 11+）：打开无线调试，扫码 / 配对即可；
   - **电脑 ADB**：在电脑上执行应用里给出的命令；
   - **Root**：有 Root 环境直接启动；
   - **Dhizuku**：执行下面的命令把它设为设备所有者（设备上不能有账户），之后就不需要再连无线调试了。

   ```bash title="Dhizuku 激活（电脑执行一次）"
   adb shell dpm set-device-owner com.churan.shizako/.dhizuku.DhizukuAdminReceiver
   ```

3. 打开需要授权的应用，在弹出的授权窗口里点同意就行。

:::

## 一些说明

- 底层用的是 Shizuku 的 API（`api/` 目录就是 Shizuku-API 的源码），通信协议、调用方式和上游完全一致；
- 用官方 SDK 写的应用（比如 MT 管理器、冰箱、SystemUI Tuner）不用重新编译，直接就能连；
- 有一个要注意的点：内置的兼容桥占用了官方 provider authority，所以 **Shizako 不能和官方 Shizuku 同时安装**，两个选一个就行；
- 项目以 Apache-2.0 协议开源，欢迎来玩。

::github{repo="cr1437/Shizako"}

## 关于看板娘

Shizako 的看板娘叫 **Shizako 酱**：白发猫耳、月牙发饰，设定是"抱着终端机的猫娘系统助手"。应用图标、文案和宣传物料基本都是围绕她做的。

觉得她可爱的话，欢迎拿去当表情包用，别拿去干坏事就行。

- **官网**：<https://cr1437.github.io/Shizako/>
- **仓库**：<https://github.com/cr1437/Shizako>
- **下载**：[Releases](https://github.com/cr1437/Shizako/releases)
- **反馈**：GitHub Issues / QQ 群