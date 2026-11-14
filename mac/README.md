# macOS 版

适用于 macOS 13 Ventura 或更新版本。Apple Silicon 使用 arm64 包，Intel Mac 使用 x64 包。

解压 ZIP 后，将 `Desktop Billiards.app` 拖进「应用程序」再打开。游戏画面、规则、赛事和新手引导与 Windows 版共用同一套代码。设置可点击右上角打开。Mac 键盘上的 F1 若用于调亮度，可按 Fn + F1。

两个下载包是未经过 Apple 公证的预览构建。Mac 上实际运行、Gatekeeper 提示和系统壁纸读取需要在目标设备上验收。面向公众分发时，应使用自己的 Developer ID 签名并完成 Apple 公证。

## 从源码打包

准备 Node.js 24、Python 3.11 或更新版本及 curl。在项目根目录执行：

```sh
npm ci
npm run build:mac
```

Windows 上可用 `python scripts/build-mac.py`。默认输出到 `release/mac/`，也可传入 `--arch arm64` 或 `--arch x64` 只打包一个架构。构建会下载并校验 Electron 官方运行时，ZIP 会保留 Mac 应用的符号链接和执行权限。
