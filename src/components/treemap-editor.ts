/**
 * <treemap-editor> — offline treemap editor.
 *
 * Left panel: tree spec (textarea), canvas size (300..900 px), parse errors,
 * selected-leaf weight editor, hidden-items list.
 * Right panel: SVG treemap. Hovering a leaf shows its ancestor path; editing
 * any weight re-lays the canvas out synchronously.
 */
import { LitElement, html, css, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { parseSpec } from '../engine/parse.js';
import {
  layoutTreemap,
  LayoutResult,
  LayoutEntry,
  TreeNode,
  MIN_CANVAS,
  MAX_CANVAS
} from '../engine/layout.js';

const DEFAULT_SPEC = `# id [weight]   — indent with spaces, leaves carry a positive integer weight
demo
  alpha 26
  beta 18
  gamma
    g1 9
    g2 7
    g3 3
  delta
    d1 6
    d2
      d2a 2
      d2b 1
  epsilon 4`;

function colorFor(id: string, depth: number): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const light = Math.max(38, 66 - depth * 7);
  return `hsl(${h % 360} 58% ${light}%)`;
}

@customElement('treemap-editor')
export class TreemapEditor extends LitElement {
  static styles = css`
    :host {
      display: block;
      font-family: 'Segoe UI', system-ui, sans-serif;
      color: #1d2433;
    }
    .app {
      display: grid;
      grid-template-columns: 330px 1fr;
      gap: 16px;
      align-items: start;
    }
    aside {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    h2 {
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #667085;
      margin: 0;
    }
    textarea {
      width: 100%;
      box-sizing: border-box;
      height: 260px;
      font: 12px/1.5 'SFMono-Regular', Consolas, monospace;
      padding: 8px;
      border: 1px solid #c4cdd9;
      border-radius: 6px;
      resize: vertical;
      tab-size: 2;
    }
    .canvas-ctl {
      display: flex;
      gap: 10px;
      align-items: center;
      font-size: 13px;
    }
    .canvas-ctl input {
      width: 64px;
      font: inherit;
      padding: 3px 6px;
      border: 1px solid #c4cdd9;
      border-radius: 5px;
    }
    .hint {
      color: #98a2b3;
      font-size: 12px;
    }
    ul.errors {
      margin: 0;
      padding: 8px 10px 8px 26px;
      background: #fef3f2;
      border: 1px solid #fecdca;
      border-radius: 6px;
      color: #b42318;
      font-size: 12px;
      max-height: 130px;
      overflow: auto;
    }
    .panel {
      border: 1px solid #e4e7ec;
      border-radius: 6px;
      padding: 8px 10px;
      font-size: 13px;
      background: #f9fafb;
    }
    .panel .row {
      display: flex;
      gap: 8px;
      align-items: center;
      margin-top: 6px;
    }
    .panel input[type='number'] {
      width: 90px;
      font: inherit;
      padding: 3px 6px;
      border: 1px solid #c4cdd9;
      border-radius: 5px;
    }
    button {
      font: inherit;
      padding: 3px 12px;
      border: 1px solid #98a2b3;
      background: #fff;
      border-radius: 5px;
      cursor: pointer;
    }
    button:hover {
      background: #eef2f6;
    }
    .hidden-list {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin-top: 6px;
    }
    .chip {
      background: #fff7ed;
      border: 1px solid #fed7aa;
      color: #9a3412;
      border-radius: 10px;
      padding: 1px 8px;
      font-size: 11px;
      font-family: Consolas, monospace;
    }
    main {
      min-width: 0;
    }
    .pathbar {
      font: 13px Consolas, monospace;
      background: #101828;
      color: #e4e7ec;
      border-radius: 6px;
      padding: 7px 12px;
      margin-bottom: 10px;
      min-height: 18px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .pathbar .meta {
      color: #98a2b3;
    }
    .canvas-wrap {
      display: inline-block;
      border: 1px solid #d0d5dd;
      border-radius: 4px;
      background: #fff;
      line-height: 0;
      max-width: 100%;
      overflow: auto;
    }
    svg {
      display: block;
    }
    rect.leaf {
      cursor: pointer;
      stroke: #ffffff;
      stroke-width: 1;
    }
    rect.leaf:hover {
      stroke: #101828;
      stroke-width: 1.5;
    }
    rect.leaf.selected {
      stroke: #101828;
      stroke-width: 2;
    }
    rect.leaf.on-path {
      stroke: #101828;
      stroke-width: 1.5;
    }
    rect.group {
      fill: none;
      stroke: rgba(16, 24, 40, 0.35);
      stroke-width: 1;
      pointer-events: none;
    }
    text {
      font: 11px Consolas, monospace;
      fill: rgba(16, 24, 40, 0.85);
      pointer-events: none;
    }
  `;

  @state() private spec = DEFAULT_SPEC;
  @state() private canvasW = 640;
  @state() private canvasH = 480;
  @state() private errors: string[] = [];
  @state() private result: LayoutResult | null = null;
  @state() private hoverId: string | null = null;
  @state() private selectedId: string | null = null;

  /** id -> source line index, for syncing weight edits back into the spec. */
  private lineOf = new Map<string, number>();

  connectedCallback(): void {
    super.connectedCallback();
    this.recompute();
  }

  private recompute(): void {
    const parsed = parseSpec(this.spec);
    this.errors = parsed.errors;
    if (!parsed.root) return; // keep showing the last good layout
    this.lineOf = new Map();
    const collect = (n: TreeNode): void => {
      if (n.line !== undefined) this.lineOf.set(n.id, n.line);
      (n.children ?? []).forEach(collect);
    };
    collect(parsed.root);
    try {
      this.result = layoutTreemap(parsed.root, this.canvasW, this.canvasH);
    } catch (e) {
      this.errors = [...this.errors, String(e)];
    }
  }

  private onSpecInput(e: InputEvent): void {
    this.spec = (e.target as HTMLTextAreaElement).value;
    this.recompute();
  }

  private clampSide(v: number): number {
    if (!Number.isFinite(v)) return MIN_CANVAS;
    return Math.min(MAX_CANVAS, Math.max(MIN_CANVAS, Math.round(v)));
  }

  private onCanvas(which: 'w' | 'h') {
    return (e: Event) => {
      const v = Number((e.target as HTMLInputElement).value);
      if (which === 'w') this.canvasW = this.clampSide(v);
      else this.canvasH = this.clampSide(v);
      (e.target as HTMLInputElement).value = String(which === 'w' ? this.canvasW : this.canvasH);
      this.recompute();
    };
  }

  /** Rewrite the weight token of a leaf's spec line, then re-layout. */
  private applyWeight(id: string, weight: number): void {
    const line = this.lineOf.get(id);
    if (line === undefined) return;
    if (!Number.isInteger(weight) || weight < 1) {
      this.errors = [`weight for '${id}' must be a positive integer`];
      return;
    }
    const lines = this.spec.split('\n');
    const m = lines[line].match(/^(\s*)(\S+)/);
    if (!m || m[2] !== id) return;
    lines[line] = `${m[1]}${id} ${weight}`;
    this.spec = lines.join('\n');
    this.recompute();
  }

  private entryOf(id: string | null): LayoutEntry | null {
    return id && this.result ? this.result.byId.get(id) ?? null : null;
  }

  private renderPathBar() {
    const entry = this.entryOf(this.hoverId) ?? this.entryOf(this.selectedId);
    if (!entry) {
      return html`<div class="pathbar"><span class="meta">hover a rectangle to see its ancestor path</span></div>`;
    }
    const { rect } = entry;
    return html`<div class="pathbar">
      ${entry.path.join(' › ')}
      <span class="meta">
        · weight ${entry.weight} · ${rect.w}×${rect.h} @ (${rect.x}, ${rect.y}) · area
        ${rect.w * rect.h}px²</span
      >
    </div>`;
  }

  private renderHidden() {
    const res = this.result;
    if (!res) return nothing;
    return html`<div class="panel">
      <h2>Hidden items (zero area): ${res.hidden.length}</h2>
      ${res.hidden.length === 0
        ? html`<div class="hint">every leaf has a visible rectangle</div>`
        : html`<div class="hidden-list">
            ${res.hidden.map(
              (e) => html`<span class="chip" title=${e.path.join(' › ')}>${e.id}</span>`
            )}
          </div>`}
    </div>`;
  }

  private renderSelection() {
    const entry = this.entryOf(this.selectedId);
    if (!entry) return nothing;
    return html`<div class="panel">
      <h2>Selected: ${entry.id}</h2>
      <div class="hint">${entry.path.join(' › ')}</div>
      ${entry.isLeaf
        ? html`<div class="row">
            <label
              >weight
              <input
                id="weight-input"
                type="number"
                min="1"
                step="1"
                .value=${String(entry.weight)}
                @change=${(e: Event) => {
                  this.applyWeight(entry.id, Number((e.target as HTMLInputElement).value));
                }}
            /></label>
            <button
              @click=${() => {
                const input = this.shadowRoot?.getElementById('weight-input') as HTMLInputElement | null;
                if (input) this.applyWeight(entry.id, Number(input.value));
              }}
            >
              apply
            </button>
          </div>`
        : html`<div class="hint">internal node — weight ${entry.weight} is derived from its
            subtree</div>`}
    </div>`;
  }

  private renderSvg() {
    const res = this.result;
    if (!res) {
      return html`<div class="panel">fix the spec errors to render the treemap</div>`;
    }
    const hoverPath = this.entryOf(this.hoverId)?.path ?? [];
    const visibleLeaves = res.leaves.filter((e) => !e.hidden);
    const groups = res.entries.filter((e) => !e.isLeaf && e.depth > 0);
    return html`<div class="canvas-wrap">
      <svg
        width=${res.width}
        height=${res.height}
        viewBox="0 0 ${res.width} ${res.height}"
        role="img"
        aria-label="treemap"
      >
        ${visibleLeaves.map((e) => {
          const cls = [
            'leaf',
            this.selectedId === e.id ? 'selected' : '',
            hoverPath.includes(e.id) && e.id !== this.hoverId ? 'on-path' : ''
          ]
            .filter(Boolean)
            .join(' ');
          const showLabel = e.rect.w >= e.id.length * 7 + 10 && e.rect.h >= 16;
          return html`<rect
              class=${cls}
              data-id=${e.id}
              x=${e.rect.x}
              y=${e.rect.y}
              width=${e.rect.w}
              height=${e.rect.h}
              fill=${colorFor(e.id, e.depth)}
              @mouseenter=${() => (this.hoverId = e.id)}
              @mouseleave=${() => (this.hoverId = null)}
              @click=${() => (this.selectedId = e.id)}
            >
              <title>${e.path.join(' › ')}</title>
            </rect>
            ${showLabel
              ? html`<text x=${e.rect.x + 4} y=${e.rect.y + 13}>${e.id}</text>`
              : nothing}`;
        })}
        ${groups.map(
          (e) =>
            html`<rect
              class="group"
              x=${e.rect.x + 0.5}
              y=${e.rect.y + 0.5}
              width=${Math.max(0, e.rect.w - 1)}
              height=${Math.max(0, e.rect.h - 1)}
            />`
        )}
      </svg>
    </div>`;
  }

  render() {
    return html`<div class="app">
      <aside>
        <h2>Tree spec</h2>
        <textarea
          .value=${this.spec}
          @input=${this.onSpecInput}
          spellcheck="false"
          aria-label="tree spec"
        ></textarea>
        <div class="canvas-ctl">
          <label
            >W <input type="number" min=${MIN_CANVAS} max=${MAX_CANVAS} step="1"
              .value=${String(this.canvasW)} @change=${this.onCanvas('w')}
          /></label>
          <label
            >H <input type="number" min=${MIN_CANVAS} max=${MAX_CANVAS} step="1"
              .value=${String(this.canvasH)} @change=${this.onCanvas('h')}
          /></label>
          <span class="hint">${MIN_CANVAS}–${MAX_CANVAS}px</span>
        </div>
        ${this.errors.length > 0
          ? html`<ul class="errors">
              ${this.errors.map((e) => html`<li>${e}</li>`)}
            </ul>`
          : nothing}
        ${this.renderSelection()} ${this.renderHidden()}
      </aside>
      <main>${this.renderPathBar()} ${this.renderSvg()}</main>
    </div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'treemap-editor': TreemapEditor;
  }
}
