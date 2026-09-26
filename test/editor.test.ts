// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import '../src/components/treemap-editor.js';
import type { TreemapEditor } from '../src/components/treemap-editor.js';
import { parseSpec } from '../src/engine/parse.js';
import { layoutTreemap } from '../src/engine/layout.js';

async function make(): Promise<TreemapEditor> {
  const el = document.createElement('treemap-editor');
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
}

const $ = (el: TreemapEditor, sel: string) => el.shadowRoot!.querySelector(sel);
const $$ = (el: TreemapEditor, sel: string) => [...el.shadowRoot!.querySelectorAll(sel)];

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('<treemap-editor>', () => {
  it('renders one SVG rect per visible leaf of the default spec', async () => {
    const el = await make();
    const spec = ($(el, 'textarea') as HTMLTextAreaElement).value;
    const parsed = parseSpec(spec);
    const expected = layoutTreemap(parsed.root!, 640, 480).leaves.filter((l) => !l.hidden)
      .length;
    expect($$(el, 'rect.leaf')).toHaveLength(expected);
    expect(expected).toBeGreaterThan(0);
  });

  it('re-lays out synchronously when the spec is edited', async () => {
    const el = await make();
    const before = ($(el, 'svg') as SVGSVGElement).innerHTML;
    const ta = $(el, 'textarea') as HTMLTextAreaElement;
    ta.value = 'root\n  a 1\n  b 1';
    ta.dispatchEvent(new Event('input'));
    await el.updateComplete;
    const after = ($(el, 'svg') as SVGSVGElement).innerHTML;
    expect(after).not.toBe(before);
    expect($$(el, 'rect.leaf')).toHaveLength(2);
  });

  it('shows parse errors and keeps the last good layout', async () => {
    const el = await make();
    const rectsBefore = $$(el, 'rect.leaf').length;
    const ta = $(el, 'textarea') as HTMLTextAreaElement;
    ta.value = 'root\n  a 1\n  a 2'; // duplicate id
    ta.dispatchEvent(new Event('input'));
    await el.updateComplete;
    expect($$(el, 'ul.errors li').length).toBeGreaterThan(0);
    expect($$(el, 'rect.leaf')).toHaveLength(rectsBefore);
  });

  it('shows the ancestor path on hover', async () => {
    const el = await make();
    const rect = $$(el, 'rect.leaf').find(
      (r) => (r as SVGRectElement).getAttribute('data-id') === 'd2a'
    ) as SVGRectElement;
    expect(rect).toBeTruthy();
    rect.dispatchEvent(new MouseEvent('mouseenter'));
    await el.updateComplete;
    const bar = $(el, '.pathbar') as HTMLElement;
    expect(bar.textContent).toContain('demo › delta › d2 › d2a');
    expect(bar.textContent).toMatch(/weight 2/);
    rect.dispatchEvent(new MouseEvent('mouseleave'));
    await el.updateComplete;
    expect(($(el, '.pathbar') as HTMLElement).textContent).toContain('hover a rectangle');
  });

  it('recomputes when the canvas size changes', async () => {
    const el = await make();
    const wInput = $$(el, '.canvas-ctl input')[0] as HTMLInputElement;
    wInput.value = '300';
    wInput.dispatchEvent(new Event('change'));
    await el.updateComplete;
    const svg = $(el, 'svg') as SVGSVGElement;
    expect(svg.getAttribute('width')).toBe('300');
    // engine output for 300px width must match what is rendered
    const spec = ($(el, 'textarea') as HTMLTextAreaElement).value;
    const res = layoutTreemap(parseSpec(spec).root!, 300, 480);
    const first = res.leaves.find((l) => !l.hidden)!;
    const rect = $$(el, 'rect.leaf').find(
      (r) => (r as SVGRectElement).getAttribute('data-id') === first.id
    ) as SVGRectElement;
    expect(Number(rect.getAttribute('width'))).toBe(first.rect.w);
  });

  it('edits a leaf weight through the selection panel and syncs the spec', async () => {
    const el = await make();
    const rect = $$(el, 'rect.leaf').find(
      (r) => (r as SVGRectElement).getAttribute('data-id') === 'beta'
    ) as SVGRectElement;
    rect.dispatchEvent(new MouseEvent('click'));
    await el.updateComplete;
    const input = $(el, '#weight-input') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.value).toBe('18');
    input.value = '30';
    input.dispatchEvent(new Event('change'));
    await el.updateComplete;
    const ta = $(el, 'textarea') as HTMLTextAreaElement;
    expect(ta.value).toContain('beta 30');
    // layout updated: beta's rect must match the engine for the edited spec
    const res = layoutTreemap(parseSpec(ta.value).root!, 640, 480);
    const beta = res.byId.get('beta')!;
    const betaRect = $$(el, 'rect.leaf').find(
      (r) => (r as SVGRectElement).getAttribute('data-id') === 'beta'
    ) as SVGRectElement;
    expect(Number(betaRect.getAttribute('width'))).toBe(beta.rect.w);
    expect(Number(betaRect.getAttribute('height'))).toBe(beta.rect.h);
  });

  it('lists hidden items when leaves collapse to zero area', async () => {
    const el = await make();
    const ta = $(el, 'textarea') as HTMLTextAreaElement;
    const tiny = Array.from({ length: 59 }, (_, i) => `  t${i} 1`).join('\n');
    ta.value = `root\n  big 100000\n${tiny}`;
    ta.dispatchEvent(new Event('input'));
    await el.updateComplete;
    expect(($(el, '.panel h2') as HTMLElement)?.textContent ?? '').toContain('59');
    expect($$(el, '.chip')).toHaveLength(59);
    expect($$(el, 'rect.leaf')).toHaveLength(1);
  });
});
