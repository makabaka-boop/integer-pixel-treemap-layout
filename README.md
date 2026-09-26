# 离线权重树图编辑器（Lit / TypeScript + Compose 承载）

整数像素 squarify 树图编辑器：Web 端用 Lit + TypeScript 实现、完全离线（无任何运行时外链），
Android 端由 Compose 的 `TreemapPage` 通过 WebView 加载本地 assets 显示。

## 目录结构

```
├── index.html                 # Web 入口（vite）
├── src/
│   ├── treemap/
│   │   ├── types.ts           # 树 / 矩形 / 布局结果类型
│   │   ├── validate.ts        # 输入约束校验（中文报错）
│   │   ├── layout.ts          # 整数像素 squarify 布局引擎（核心）
│   │   ├── tree-utils.ts      # 不可变权重更新、叶数 / 深度统计
│   │   ├── presets.ts         # 内置示例权重树
│   │   ├── layout.test.ts     # Vitest：面积守恒、稳定并列、缩放重算等
│   │   └── validate.test.ts   # Vitest：输入校验
│   ├── components/
│   │   ├── treemap-app.ts     # <treemap-app> 编辑器组件
│   │   └── treemap-app.test.ts# Vitest(jsdom)：编辑重排、悬浮路径、缩放重算
│   └── main.ts
├── compose/                   # Android Compose 工程（TreemapPage 离线承载 Web 页）
├── scripts/sync-web-assets.sh # dist → compose/app/src/main/assets/treemap
└── vite.config.ts             # 构建 + Vitest 配置
```

## 快速开始

```bash
npm install
npm run dev        # 本地开发（vite）
npm test           # Vitest 全量测试
npm run typecheck  # tsc --noEmit
npm run build      # 产物到 dist/（相对路径、资源内联，可离线打开）
npm run sync:compose  # 把 dist/ 拷入 Compose assets
```

## 输入约束（`validate.ts` 强制）

- id：全局唯一，可打印 ASCII（`0x21`–`0x7E`，不含空白），≤ 32 字符；
- 深度（层数，根为第 1 层）≤ 4；叶子 ≤ 60；
- 叶权重为 1～1,000,000 的正整数（上界保证 `权重×边长 < 2^53`，整数运算精确）；
- 画布宽、高均为 300～900 的整数像素。

## 布局算法（`src/treemap/layout.ts`）

对每一层：

1. **排序**：子节点按子树权重降序、id 升序（charCode 字典序）进入 squarify；
   id 全局唯一 ⇒ 全序 ⇒ 布局完全确定，与输入顺序无关。
2. **组行**：沿父矩形短边组行（宽 ≥ 高 ⇒ 竖条行，行内沿高度堆叠；否则横条行）。
   顺序扫描，只有加入下一项**不会增大该行最差长宽比**时才继续，否则另起一行。
   最差长宽比用 Bruls 等人的公式（对像素缩放不变，直接以权重计算）：
   `worst = max(side²·w_max/Σ², Σ²/(side²·w_min))`。
3. **整数像素分配**：行厚（沿长边）与行内跨度（沿短边）分别用**最大余数法**
   分配整数像素——先取 `floor(w·total/Σw)`，剩余名额按「余数降序、id 升序」补 1
   （行以其行首项的 id 参与裁决）。余数用整数分子精确表示，无浮点误差。

由于每层的行厚之和 == 父矩形长边、行内跨度之和 == 父矩形短边，兄弟矩形构成父矩形的
**精确划分**：互不重叠、面积之和恰好等于父矩形面积，逐层递归到叶子——
不会出现逐层四舍五入留下的缝隙或兄弟重叠，窗口尺寸变化后也只是重新整算，不会错位。

- **零面积**：分配得到宽或高为 0 的项不渲染，但会列入 `hidden`（页面明确展示
  「隐藏项（零面积）」清单）；其兄弟仍恰好覆盖父矩形。
- **稳定性**：排序与裁决均为全序，同一输入任意次布局结果一致；等重兄弟按 id 升序定位。

## 页面功能（`<treemap-app>`）

- 左侧面板编辑任意叶子权重（或整体粘贴 JSON 权重树）→ **同步重排**；
- 画布宽高 300～900 可调，或勾选「适应窗口」随窗口尺寸自动重算；
- 悬浮叶矩形显示**祖先路径**（`根 / … / 叶`）、权重与像素面积；
- 下方实时显示面积守恒校验（可见叶面积和 == 画布面积）与隐藏项清单。

## Compose 集成

`compose/` 是独立的 Android 工程（本环境无 Android SDK，源码未在此编译）：

```bash
npm run build && npm run sync:compose   # 生成并同步离线页面资源
# 然后用 Android Studio 打开 compose/ 运行
```

`TreemapPage` 以 `WebView` + `WebViewAssetLoader` 从应用内 assets 加载
`treemap/index.html`；应用**不声明 INTERNET 权限**，完全离线。
旋转 / 分屏导致窗口尺寸变化时，页面内编辑器按当前画布自动重算布局。

## 测试（Vitest，27 例）

- **面积守恒**：全部示例 + 40 棵随机树 × 多种画布，逐节点校验兄弟面积和 == 父面积，
  并用像素网格验证每个画布格子恰好被一个可见叶矩形覆盖一次（无缝隙、无重叠）；
- **稳定并列**：等重兄弟按 id 升序布局、输入乱序结果完全一致、最大余数并列按 id 裁决；
- **缩放重算**：尺寸变化后重新整布局，同尺寸重算结果确定，不变量始终保持；
- 另含：零面积隐藏项、组行规则、最大余数法性质、输入校验、组件级
  （编辑权重同步重排、悬浮祖先路径、画布缩放与隐藏清单、JSON 导入报错）。
