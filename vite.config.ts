import { defineConfig } from 'vitest/config';

export default defineConfig({
  // 相对路径，便于构建产物被直接拷入 Android assets 离线加载
  base: './',
  build: {
    target: 'es2021',
    // 内联一切静态资源，产物可直接以 file/WebViewAssetLoader 方式离线打开
    assetsInlineLimit: 1024 * 1024,
    cssCodeSplit: false,
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
