# Compose 承载工程（TreemapPage）

以 Jetpack Compose 页面 `TreemapPage` 离线显示仓库根目录构建的 Lit/TypeScript 树图编辑器。

## 工作原理

- Web 工程（仓库根目录）执行 `npm run build` 产出 `dist/`（相对路径、资源内联）；
- `../scripts/sync-web-assets.sh`（或根目录 `npm run sync:compose`）把 `dist/`
  拷贝到 `app/src/main/assets/treemap/`；
- `TreemapPage` 通过 `WebView` + `WebViewAssetLoader` 以虚拟域
  `https://appassets.androidplatform.net/assets/treemap/index.html` 加载应用内 assets；
- 应用**不声明 INTERNET 权限**，页面与资源全部随包分发，完全离线；
- `MainActivity` 声明 `configChanges="orientation|screenSize|screenLayout|keyboardHidden"`，
  旋转 / 分屏不重建 Activity，页面内编辑器按当前画布自动重算布局。

## 构建步骤

```bash
# 在仓库根目录
npm install && npm run build && npm run sync:compose

# 然后用 Android Studio 打开本目录（compose/），Sync Gradle 后运行 app
# 或命令行（需本机已装 Android SDK 并配置 local.properties / ANDROID_HOME）：
./gradlew :app:assembleDebug
```

要求：Android Studio Hedgehog+ / AGP 8.5 / Kotlin 2.0 / compileSdk 34 / minSdk 24。
（本仓库 CI 环境无 Android SDK，此工程源码未在此编译。）
