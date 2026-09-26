package com.example.treemap

import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView
import androidx.webkit.WebViewAssetLoader

/**
 * 树图页面离线地址：WebViewAssetLoader 把虚拟域映射到应用 assets，
 * 页面与资源全部随包分发，无需任何网络权限。
 */
private const val TREEMAP_URL = "https://appassets.androidplatform.net/assets/treemap/index.html"

/**
 * Compose 树图页面：以 WebView 承载 Lit/TypeScript 离线树图编辑器。
 *
 * 页面资源由仓库根目录的 Web 工程构建（`npm run build`），
 * 再经 `scripts/sync-web-assets.sh` 拷贝到 `app/src/main/assets/treemap/`。
 * 窗口尺寸变化（旋转、分屏）时页面内编辑器会按当前画布自动重算布局。
 */
@Composable
fun TreemapPage(modifier: Modifier = Modifier) {
    AndroidView(
        modifier = modifier,
        factory = { context ->
            val assetLoader = WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(context))
                .build()
            WebView(context).apply {
                settings.javaScriptEnabled = true
                settings.domStorageEnabled = true
                settings.allowFileAccess = false
                settings.allowContentAccess = false
                webViewClient = object : WebViewClient() {
                    override fun shouldInterceptRequest(
                        view: WebView,
                        request: WebResourceRequest,
                    ): WebResourceResponse? = assetLoader.shouldInterceptRequest(request.url)
                }
                loadUrl(TREEMAP_URL)
            }
        },
    )
}
