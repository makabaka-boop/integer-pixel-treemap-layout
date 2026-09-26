import { css, html, LitElement, nothing, svg, type TemplateResult } from 'lit';
import { layoutTreemap } from '../treemap/layout';
import { PRESETS } from '../treemap/presets';
import { cloneTree, countLeaves, treeDepth, updateLeafWeight } from '../treemap/tree-utils';
import type { LeafLayout, NodeLayout, TreeNode, TreemapLayout } from '../treemap/types';
import {
  MAX_CANVAS,
  MAX_WEIGHT,
  MIN_CANVAS,
  TreemapError,
  validateTree,
} from '../treemap/validate';

const clampCanvas = (v: number): number =>
  Math.min(MAX_CANVAS, Math.max(MIN_CANVAS, Math.round(v)));

/**
 * 离线权重树图编辑器。
 * 编辑权重 / 调整画布后同步重排；悬浮叶矩形显示祖先路径；零面积项列入隐藏清单。
 */
export class TreemapApp extends LitElement {
  static properties = {
    _tree: { state: true },
    _canvasW: { state: true },
    _canvasH: { state: true },
    _autoFit: { state: true },
    _hover: { state: true },
    _tipX: { state: true },
    _tipY: { state: true },
    _jsonText: { state: true },
    _errors: { state: true },
    _preset: { state: true },
  };

  declare _tree: TreeNode;
  declare _canvasW: number;
  declare _canvasH: number;
  declare _autoFit: boolean;
  declare _hover: LeafLayout | null;
  declare _tipX: number;
  declare _tipY: number;
  declare _jsonText: string;
  declare _errors: string[];
  declare _preset: number;

  private _resizeObserver?: ResizeObserver;

  constructor() {
    super();
    this._preset = 0;
    this._tree = cloneTree(PRESETS[0].tree);
    this._canvasW = 640;
    this._canvasH = 480;
    this._autoFit = false;
    this._hover = null;
    this._tipX = 0;
    this._tipY = 0;
    this._jsonText = JSON.stringify(this._tree, null, 2);
    this._errors = [];
  }

  static styles = css`
    :host {
      display: block;
      font-family: system-ui, 'PingFang SC', 'Microsoft YaHei', sans-serif;
      background: #14171c;
      color: #dfe4ea;
      min-height: 100vh;
    }
    header {
      padding: 12px 20px;
      border-bottom: 1px solid #2a2f38;
    }
    header h1 {
      margin: 0;
      font-size: 17px;
      font-weight: 600;
    }
    header p {
      margin: 4px 0 0;
      font-size: 12px;
      color: #8b94a1;
    }
    main {
      display: flex;
      gap: 18px;
      padding: 16px 20px;
      align-items: flex-start;
      flex-wrap: wrap;
    }
    aside {
      width: 330px;
      flex: none;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .card {
      background: #1b1f26;
      border: 1px solid #2a2f38;
      border-radius: 8px;
      padding: 12px;
    }
    .card h2 {
      margin: 0 0 8px;
      font-size: 13px;
      color: #9fb2c8;
      font-weight: 600;
    }
    .stage {
      flex: 1;
      min-width: 340px;
    }
    .canvas-wrap {
      position: relative;
      display: inline-block;
      max-width: 100%;
      line-height: 0;
    }
    svg {
      background: #0d1015;
      border: 1px solid #2a2f38;
      border-radius: 4px;
      max-width: 100%;
      height: auto;
    }
    .leaf {
      cursor: pointer;
      stroke: rgba(0, 0, 0, 0.45);
      stroke-width: 1;
    }
    .leaf:hover {
      filter: brightness(1.25);
      stroke: #ffffff;
      stroke-width: 1.5;
    }
    .leaf-label {
      font-size: 11px;
      fill: #fff;
      pointer-events: none;
      paint-order: stroke;
      stroke: rgba(0, 0, 0, 0.55);
      stroke-width: 2px;
    }
    .grp {
      fill: none;
      pointer-events: none;
      shape-rendering: crispEdges;
    }
    .grp-label {
      font-size: 10px;
      fill: rgba(255, 255, 255, 0.75);
      pointer-events: none;
      paint-order: stroke;
      stroke: rgba(0, 0, 0, 0.6);
      stroke-width: 2px;
    }
    .tooltip {
      position: absolute;
      z-index: 10;
      pointer-events: none;
      background: rgba(12, 14, 18, 0.94);
      border: 1px solid #3d4654;
      border-radius: 6px;
      padding: 6px 9px;
      font-size: 12px;
      line-height: 1.5;
      white-space: nowrap;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.5);
    }
    .tooltip .tip-path {
      color: #7fd0ff;
      font-weight: 600;
    }
    .statusbar {
      margin-top: 8px;
      font-size: 12px;
      color: #9fb2c8;
      min-height: 18px;
      line-height: 1.5;
    }
    .statusbar .path {
      color: #7fd0ff;
    }
    .hidden-list {
      margin-top: 6px;
      font-size: 12px;
      color: #e8b45a;
      line-height: 1.5;
    }
    .stats {
      margin-top: 6px;
      font-size: 12px;
      color: #8b94a1;
      line-height: 1.6;
    }
    .stats .ok {
      color: #6fd08c;
    }
    label.row {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      margin: 4px 0;
    }
    input[type='number'] {
      width: 72px;
      background: #10141a;
      color: #dfe4ea;
      border: 1px solid #3d4654;
      border-radius: 4px;
      padding: 3px 6px;
      font-size: 12px;
    }
    input[type='number']:disabled {
      opacity: 0.45;
    }
    select,
    button {
      background: #232a34;
      color: #dfe4ea;
      border: 1px solid #3d4654;
      border-radius: 4px;
      padding: 4px 10px;
      font-size: 12px;
      cursor: pointer;
    }
    button:hover {
      background: #2c3542;
    }
    textarea {
      width: 100%;
      box-sizing: border-box;
      height: 150px;
      background: #10141a;
      color: #cfe3cf;
      border: 1px solid #3d4654;
      border-radius: 4px;
      font-family: ui-monospace, Consolas, monospace;
      font-size: 11px;
      padding: 6px;
      resize: vertical;
    }
    .btn-row {
      display: flex;
      gap: 8px;
      margin-top: 8px;
      flex-wrap: wrap;
    }
    .errors {
      margin-top: 8px;
      color: #ff8a8a;
      font-size: 12px;
      line-height: 1.5;
      white-space: pre-wrap;
    }
    .tree-editor {
      max-height: 300px;
      overflow: auto;
      font-size: 12px;
    }
    .grp-row {
      color: #9fb2c8;
      margin: 6px 0 2px;
      font-weight: 600;
    }
    .grp-row .w {
      color: #6b7482;
      font-weight: 400;
    }
    .leaf-row {
      display: flex;
      align-items: center;
      gap: 6px;
      margin: 2px 0;
    }
    .leaf-row .id {
      color: #cfe3cf;
      min-width: 56px;
      font-family: ui-monospace, Consolas, monospace;
    }
    .leaf-row .px {
      color: #6b7482;
    }
    .leaf-row.hidden-leaf .id {
      color: #e8b45a;
    }
  `;

  firstUpdated(): void {
    if (typeof ResizeObserver !== 'undefined') {
      this._resizeObserver = new ResizeObserver(() => this._fitToContainer());
      const wrap = this.renderRoot.querySelector('.stage');
      if (wrap) this._resizeObserver.observe(wrap);
    }
  }

  disconnectedCallback(): void {
    this._resizeObserver?.disconnect();
    super.disconnectedCallback();
  }

  private _fitToContainer(): void {
    if (!this._autoFit) return;
    const stage = this.renderRoot.querySelector('.stage');
    if (!stage) return;
    const w = clampCanvas(stage.clientWidth - 4 || MIN_CANVAS);
    const h = clampCanvas(Math.round((stage.clientWidth - 4 || MIN_CANVAS) * 0.66));
    if (w !== this._canvasW || h !== this._canvasH) {
      this._canvasW = w;
      this._canvasH = h;
    }
  }

  // ---------- 事件 ----------

  private _onWeightInput(id: string, e: InputEvent): void {
    const raw = (e.target as HTMLInputElement).value;
    const w = Number(raw);
    if (!Number.isInteger(w) || w < 1 || w > MAX_WEIGHT) {
      this._errors = [`叶子「${id}」的权重须为 1～${MAX_WEIGHT} 的整数`];
      return;
    }
    this._errors = [];
    this._tree = updateLeafWeight(this._tree, id, w); // 同步重排在 render 中完成
  }

  private _onCanvasInput(which: 'w' | 'h', e: InputEvent): void {
    const v = Number((e.target as HTMLInputElement).value);
    if (!Number.isFinite(v)) return;
    const clamped = clampCanvas(v);
    if (which === 'w') this._canvasW = clamped;
    else this._canvasH = clamped;
  }

  private _onAutoFit(e: Event): void {
    this._autoFit = (e.target as HTMLInputElement).checked;
    if (this._autoFit) this._fitToContainer();
  }

  private _onPreset(e: Event): void {
    const i = Number((e.target as HTMLSelectElement).value);
    this._preset = i;
    this._tree = cloneTree(PRESETS[i].tree);
    this._jsonText = JSON.stringify(this._tree, null, 2);
    this._errors = [];
  }

  private _applyJson(): void {
    try {
      const parsed: unknown = JSON.parse(this._jsonText);
      this._tree = validateTree(parsed);
      this._errors = [];
    } catch (err) {
      this._errors = [
        err instanceof TreemapError || err instanceof SyntaxError
          ? err.message
          : String(err),
      ];
    }
  }

  private _dumpJson(): void {
    this._jsonText = JSON.stringify(this._tree, null, 2);
  }

  private _showTip(leaf: LeafLayout, e: MouseEvent): void {
    const wrap = this.renderRoot.querySelector('.canvas-wrap');
    const box = wrap?.getBoundingClientRect();
    this._hover = leaf;
    this._tipX = e.clientX - (box?.left ?? 0) + 12;
    this._tipY = e.clientY - (box?.top ?? 0) + 12;
  }

  private _hideTip(): void {
    this._hover = null;
  }

  // ---------- 渲染 ----------

  render() {
    let layout: TreemapLayout;
    try {
      layout = layoutTreemap(this._tree, this._canvasW, this._canvasH);
    } catch (err) {
      // 状态在入口均已校验，理论上不可达；兜底展示错误
      return html`<main>
        <div class="card"><h2>布局失败</h2>
        <div class="errors" style="display:block">${String(err)}</div></div>
      </main>`;
    }
    const visibleArea = layout.leaves.reduce((s, l) => s + l.rect.w * l.rect.h, 0);
    const conserved = visibleArea === layout.width * layout.height;

    return html`
      <header>
        <h1>离线权重树图编辑器</h1>
        <p>整数像素 squarify：行厚与行内跨度按最大余数法分配，兄弟矩形恰好覆盖父矩形，零面积项列入隐藏清单。</p>
      </header>
      <main>
        <aside>
          <div class="card">
            <h2>权重树</h2>
            <label class="row">
              示例
              <select @change=${this._onPreset}>
                ${PRESETS.map(
                  (p, i) => html`<option value=${i} ?selected=${i === this._preset}>${p.name}</option>`,
                )}
              </select>
            </label>
            <div class="tree-editor">${this._renderEditorNode(layout.root, layout)}</div>
          </div>
          <div class="card">
            <h2>画布（${MIN_CANVAS}～${MAX_CANVAS} px）</h2>
            <label class="row">
              宽
              <input
                id="canvas-w"
                type="number"
                min=${MIN_CANVAS}
                max=${MAX_CANVAS}
                step="1"
                .value=${String(this._canvasW)}
                ?disabled=${this._autoFit}
                @input=${(e: InputEvent) => this._onCanvasInput('w', e)}
              />
              高
              <input
                id="canvas-h"
                type="number"
                min=${MIN_CANVAS}
                max=${MAX_CANVAS}
                step="1"
                .value=${String(this._canvasH)}
                ?disabled=${this._autoFit}
                @input=${(e: InputEvent) => this._onCanvasInput('h', e)}
              />
            </label>
            <label class="row">
              <input type="checkbox" .checked=${this._autoFit} @change=${this._onAutoFit} />
              适应窗口（窗口尺寸变化时自动重算）
            </label>
          </div>
          <div class="card">
            <h2>导入 / 导出 JSON</h2>
            <textarea
              id="json-input"
              .value=${this._jsonText}
              @input=${(e: InputEvent) => {
                this._jsonText = (e.target as HTMLTextAreaElement).value;
              }}
            ></textarea>
            <div class="btn-row">
              <button id="apply-json" @click=${this._applyJson}>应用 JSON</button>
              <button id="dump-json" @click=${this._dumpJson}>从当前树生成 JSON</button>
            </div>
            ${this._errors.length > 0
              ? html`<div class="errors">${this._errors.join('\n')}</div>`
              : nothing}
          </div>
        </aside>
        <section class="stage">
          <div class="canvas-wrap">
            ${this._renderSvg(layout)} ${this._renderTooltip()}
          </div>
          <div class="statusbar">
            ${this._hover
              ? html`祖先路径：<span class="path">${this._hover.path.join(' / ')}</span>
                  ｜权重 ${this._hover.weight}｜矩形 ${this._hover.rect.w}×${this._hover.rect.h}
                  = ${this._hover.rect.w * this._hover.rect.h} px²`
              : html`悬浮叶矩形查看祖先路径。`}
          </div>
          ${layout.hidden.length > 0
            ? html`<div class="hidden-list">
                隐藏项（零面积，共 ${layout.hidden.length} 个）：${layout.hidden.join('、')}
              </div>`
            : nothing}
          <div class="stats">
            画布 ${layout.width}×${layout.height} = ${layout.width * layout.height} px² ｜ 叶子
            ${countLeaves(this._tree)}（可见 ${layout.leaves.length - layout.hidden.length}）｜ 深度
            ${treeDepth(this._tree)} 层 ｜ 可见叶面积和 ${visibleArea} px²
            <span class="ok">${conserved ? '✓ 面积守恒' : '✗ 不守恒'}</span>
          </div>
        </section>
      </main>
    `;
  }

  private _renderEditorNode(node: NodeLayout, layout: TreemapLayout): TemplateResult {
    if (node.children.length === 0) {
      const leaf = layout.leaves.find((l) => l.id === node.id);
      const hidden = leaf?.hidden ?? false;
      return html`
        <div class="leaf-row ${hidden ? 'hidden-leaf' : ''}">
          <span class="id">${node.id}</span>
          <input
            type="number"
            data-leaf=${node.id}
            min="1"
            max=${MAX_WEIGHT}
            step="1"
            .value=${String(leaf?.weight ?? 1)}
            @input=${(e: InputEvent) => this._onWeightInput(node.id, e)}
          />
          <span class="px">${node.rect.w}×${node.rect.h}${hidden ? '（隐藏）' : ''}</span>
        </div>
      `;
    }
    return html`
      <div class="grp-row" style="padding-left:${(node.depth - 1) * 10}px">
        ${node.id} <span class="w">子树权重 ${node.weight}</span>
      </div>
      <div style="padding-left:10px">
        ${node.children.map((c) => this._renderEditorNode(c, layout))}
      </div>
    `;
  }

  private _renderSvg(layout: TreemapLayout): TemplateResult {
    const groups: NodeLayout[] = [];
    const walk = (n: NodeLayout): void => {
      if (n.children.length > 0) {
        groups.push(n);
        n.children.forEach(walk);
      }
    };
    walk(layout.root);
    groups.sort((a, b) => a.depth - b.depth);

    const topCount = Math.max(layout.root.children.length, 1);
    const leafColor = (leaf: LeafLayout): string => {
      const topId = leaf.path.length > 1 ? leaf.path[1] : leaf.id;
      const idx = Math.max(
        0,
        layout.root.children.findIndex((c) => c.id === topId),
      );
      let hash = 0;
      for (const ch of leaf.id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
      const hue = Math.round((idx * 360) / topCount + (hash % 24) - 12 + 360) % 360;
      const light = 40 + (hash % 22);
      return `hsl(${hue} 62% ${light}%)`;
    };

    const groupStrokes = ['#4a5568', '#5b6b82', '#7186a3', '#8aa2c4'];

    return html`
      <svg
        width=${layout.width}
        height=${layout.height}
        viewBox="0 0 ${layout.width} ${layout.height}"
        role="img"
        aria-label="权重树图"
      >
        ${layout.leaves
          .filter((l) => !l.hidden)
          .map(
            (leaf) => svg`
            <rect
              class="leaf"
              data-id=${leaf.id}
              x=${leaf.rect.x}
              y=${leaf.rect.y}
              width=${leaf.rect.w}
              height=${leaf.rect.h}
              fill=${leafColor(leaf)}
              @mouseover=${(e: MouseEvent) => this._showTip(leaf, e)}
              @mousemove=${(e: MouseEvent) => this._showTip(leaf, e)}
              @mouseleave=${this._hideTip}
            ></rect>
            ${
              leaf.rect.w >= 26 && leaf.rect.h >= 13
                ? svg`<text
                    class="leaf-label"
                    x=${leaf.rect.x + 3}
                    y=${leaf.rect.y + 12}
                  >${leaf.id}</text>`
                : nothing
            }
            ${
              leaf.rect.w >= 40 && leaf.rect.h >= 27
                ? svg`<text
                    class="leaf-label"
                    x=${leaf.rect.x + 3}
                    y=${leaf.rect.y + 25}
                    opacity="0.75"
                  >${leaf.weight}</text>`
                : nothing
            }`,
          )}
        ${groups.map(
          (g) => svg`
          <rect
            class="grp"
            data-grp=${g.id}
            x=${g.rect.x + 0.5}
            y=${g.rect.y + 0.5}
            width=${Math.max(g.rect.w - 1, 0)}
            height=${Math.max(g.rect.h - 1, 0)}
            stroke=${groupStrokes[Math.min(g.depth - 1, groupStrokes.length - 1)]}
            stroke-width=${Math.max(3 - g.depth, 1)}
          ></rect>
          ${
            g.depth > 1 && g.rect.w >= 44 && g.rect.h >= 15
              ? svg`<text class="grp-label" x=${g.rect.x + 3} y=${g.rect.y + 11}>${g.id}</text>`
              : nothing
          }`,
        )}
      </svg>
    `;
  }

  private _renderTooltip() {
    const leaf = this._hover;
    if (!leaf) return nothing;
    return html`
      <div class="tooltip" style="left:${this._tipX}px; top:${this._tipY}px">
        <div class="tip-path">${leaf.path.join(' / ')}</div>
        <div>权重 ${leaf.weight} ｜ ${leaf.rect.w}×${leaf.rect.h} = ${leaf.rect.w * leaf.rect.h} px²</div>
      </div>
    `;
  }
}

customElements.define('treemap-app', TreemapApp);

declare global {
  interface HTMLElementTagNameMap {
    'treemap-app': TreemapApp;
  }
}
