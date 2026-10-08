---
title: "Introducing my open-source project: Shizako"
published: 2026-10-07
lang: "en"
permalink: "posts/shizako"
description: "Shizako is an Android tool I built: use privileged system APIs without Root, compatible with the Shizuku-API ecosystem. A quick introduction."
aiSummary: "This post introduces Shizako, my open-source Android tool: without Root, it starts a privileged process via Wireless Debugging, PC ADB, Root or Dhizuku, safely lending system-level capabilities to trusted apps — compatible with the Shizuku-API ecosystem."
tags: [Shizako, Android, Shizuku, Open Source]
category: "Open Source"
draft: false
---

This is a small Android tool I made, called **Shizako** ([GitHub](https://github.com/cr1437/Shizako) | [Website](https://cr1437.github.io/Shizako/)).

The reason is simple: Android actually has plenty of useful system-level features — silent installs, freezing apps, changing permissions, reading system settings — but normal apps can't call them. To use them comfortably you usually need Root — which is risky, and not everyone wants it.

So Shizako took a different approach: start a small privileged process via Wireless Debugging, PC ADB or Root (any one of them), and let it lend permissions to the apps you authorize. Every app needs your manual confirmation on first connection, and you can revoke access at any time.

## What it can do

- **No Root needed**: activate via Wireless Debugging / ADB, no flashing
- **Permission management**: authorize each app individually; the allowlist is stored locally and revocable anytime
- **Shizuku-API compatible**: apps built with the official Shizuku SDK work without any code change or recompilation
- **Dhizuku mode**: set Shizako as Device Owner — after one activation, no Root and no Wireless Debugging needed
- **Four activation methods**: Wireless Debugging / PC ADB / Root / Dhizuku
- **And more**: Tasker broadcast intents, API auditing, auto-update, crash logs

## How to use it

::: steps
1. Download the latest APK from [Releases](https://github.com/cr1437/Shizako/releases) and install it.
2. Choose an activation method:
   - **Wireless Debugging** (Android 11+): turn it on, scan the QR / pair;
   - **PC ADB**: run the command shown in the app on your computer;
   - **Root**: launch directly if you have a Root environment;
   - **Dhizuku**: run the command below to set it as Device Owner (no accounts allowed on the device), then Wireless Debugging is no longer needed.
   ```bash title="Dhizuku activation (run once on PC)"
   adb shell dpm set-device-owner com.churan.shizako/.dhizuku.DhizukuAdminReceiver
   ```
3. Open the app you want to authorize and tap allow in the dialog.
:::

## Notes

- Under the hood it uses Shizuku's API (the `api/` directory is the Shizuku-API source); the protocol and calling conventions match upstream exactly;
- Apps built with the official SDK (like MT Manager, Ice Box, SystemUI Tuner) connect directly without recompiling;
- One caveat: the built-in compatibility bridge occupies the official provider authority, so **Shizako cannot be installed alongside official Shizuku** — pick one;
- The project is open source under Apache-2.0. Have fun.

::github{repo="cr1437/Shizako"}

## About the mascot

Shizako's mascot is **Shizako-chan**: white hair, cat ears, a crescent-moon hair ornament — a "cat-girl system assistant hugging a terminal". The app icon, copy and promo materials are all built around her.

If you find her cute, feel free to use her as a sticker — just don't do anything bad with her.

- **Website**: <https://cr1437.github.io/Shizako/>
- **Repository**: <https://github.com/cr1437/Shizako>
- **Download**: [Releases](https://github.com/cr1437/Shizako/releases)