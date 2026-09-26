// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import './treemap-app'; // 副作用导入：注册 <treemap-app>
import type { TreemapApp } from './treemap-app';
import { layoutTreemap } from '../treemap/layout';
import { PRESETS } from '../treemap/presets';

const leafRects = (el: TreemapApp): SVGRectElement[] => [
  ...el.shadowRoot!.querySelectorAll<SVGRectElement>('rect.leaf'),
];

const domAreaSum = (el: TreemapApp): number =>
  leafRects(el).reduce(
    (s, r) => s + Number(r.getAttribute('width')) * Number(r.getAttribute('height')),
    0,
  );

async function makeEl(): Promise<TreemapApp> {
  const el = document.createElement('treemap-app') as TreemapApp;
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
}

function setInput(el: TreemapApp, selector: string, value: string): void {
  const input = el.shadowRoot!.querySelector<HTMLInputElement>(selector)!;
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('<treemap-app>', () => {
  let el: TreemapApp;

  beforeEach(async () => {
    document.body.innerHTML = '';
    el = await makeEl();
  });

  it('渲染：可见叶矩形与 svg 画布尺寸正确', async () => {
    const expected = layoutTreemap(PRESETS[0].tree, 640, 480);
    const svg = el.shadowRoot!.querySelector('svg')!;
    expect(svg.getAttribute('width')).toBe('640');
    expect(svg.getAttribute('height')).toBe('480');
    const visible = expected.leaves.filter((l) => !l.hidden);
    expect(leafRects(el)).toHaveLength(visible.length);
    // DOM 中的矩形与布局引擎一致
    for (const leaf of visible) {
      const rect = el.shadowRoot!.querySelector(`rect.leaf[data-id="${leaf.id}"]`)!;
      expect(Number(rect.getAttribute('x'))).toBe(leaf.rect.x);
      expect(Number(rect.getAttribute('y'))).toBe(leaf.rect.y);
      expect(Number(rect.getAttribute('width'))).toBe(leaf.rect.w);
      expect(Number(rect.getAttribute('height'))).toBe(leaf.rect.h);
    }
    expect(domAreaSum(el)).toBe(640 * 480);
  });

  it('编辑权重后同步重排且面积守恒', async () => {
    const before = el.shadowRoot!.querySelector('rect.leaf[data-id="a1"]')!;
    const beforeW = Number(before.getAttribute('width'));
    const beforeH = Number(before.getAttribute('height'));

    setInput(el, 'input[data-leaf="a1"]', '40');
    await el.updateComplete;

    const after = el.shadowRoot!.querySelector('rect.leaf[data-id="a1"]')!;
    const changed =
      Number(after.getAttribute('width')) !== beforeW ||
      Number(after.getAttribute('height')) !== beforeH;
    expect(changed).toBe(true);
    // 与布局引擎同步结果一致
    const expected = layoutTreemap(el._tree, 640, 480);
    expect(domAreaSum(el)).toBe(640 * 480);
    expect(expected.leaves.find((l) => l.id === 'a1')!.weight).toBe(40);
  });

  it('悬浮叶矩形显示祖先路径', async () => {
    const rect = el.shadowRoot!.querySelector('rect.leaf[data-id="a1"]')!;
    rect.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, clientX: 10, clientY: 10 }));
    await el.updateComplete;

    const tip = el.shadowRoot!.querySelector<HTMLElement>('.tooltip')!;
    expect(tip).toBeTruthy();
    expect(tip.querySelector('.tip-path')!.textContent).toBe('root / alpha / a1');
    const status = el.shadowRoot!.querySelector<HTMLElement>('.statusbar')!;
    expect(status.textContent).toContain('root / alpha / a1');

    rect.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
    await el.updateComplete;
    expect(el.shadowRoot!.querySelector('.tooltip')).toBeNull();
  });

  it('缩放重算：修改画布尺寸后同步重排，隐藏项明确列出', async () => {
    // 切到倾斜示例
    const select = el.shadowRoot!.querySelector<HTMLSelectElement>('select')!;
    select.value = '1';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    // 画布缩到 300×300
    setInput(el, '#canvas-w', '300');
    setInput(el, '#canvas-h', '300');
    await el.updateComplete;

    const svg = el.shadowRoot!.querySelector('svg')!;
    expect(svg.getAttribute('width')).toBe('300');
    expect(svg.getAttribute('height')).toBe('300');
    expect(domAreaSum(el)).toBe(300 * 300); // 面积守恒

    const hidden = el.shadowRoot!.querySelector<HTMLElement>('.hidden-list')!;
    expect(hidden.textContent).toContain('隐藏项');
    expect(hidden.textContent).toContain('s4');
    expect(hidden.textContent).toContain('s5');
    expect(hidden.textContent).toContain('s6');
    // 隐藏项不渲染
    expect(el.shadowRoot!.querySelector('rect.leaf[data-id="s4"]')).toBeNull();

    // 放大后重算，隐藏项消失
    setInput(el, '#canvas-w', '900');
    setInput(el, '#canvas-h', '900');
    await el.updateComplete;
    expect(domAreaSum(el)).toBe(900 * 900);
    expect(el.shadowRoot!.querySelector('.hidden-list')).toBeNull();
  });

  it('JSON：非法输入报错且树不变，合法输入替换树', async () => {
    const before = leafRects(el).length;
    setInput(el, '#json-input', '{ not json');
    el.shadowRoot!.querySelector<HTMLButtonElement>('#apply-json')!.click();
    await el.updateComplete;
    expect(el.shadowRoot!.querySelector('.errors')!.textContent).not.toBe('');
    expect(leafRects(el)).toHaveLength(before);

    setInput(
      el,
      '#json-input',
      JSON.stringify({
        id: 'root',
        children: [
          { id: 'u', weight: 3 },
          { id: 'v', weight: 1 },
        ],
      }),
    );
    el.shadowRoot!.querySelector<HTMLButtonElement>('#apply-json')!.click();
    await el.updateComplete;
    expect(el.shadowRoot!.querySelector('.errors')).toBeNull();
    expect(leafRects(el)).toHaveLength(2);
    expect(domAreaSum(el)).toBe(640 * 480);
  });

  it('JSON：违反约束（重复 id / 超深 / 非正权重）给出中文错误', async () => {
    const cases: unknown[] = [
      { id: 'root', children: [{ id: 'a', weight: 1 }, { id: 'a', weight: 2 }] },
      {
        id: 'a',
        children: [{ id: 'b', children: [{ id: 'c', children: [{ id: 'd', children: [{ id: 'e', weight: 1 }] }] }] }],
      },
      { id: 'root', children: [{ id: 'a', weight: 0 }] },
    ];
    for (const c of cases) {
      setInput(el, '#json-input', JSON.stringify(c));
      el.shadowRoot!.querySelector<HTMLButtonElement>('#apply-json')!.click();
      await el.updateComplete;
      expect(el.shadowRoot!.querySelector('.errors')!.textContent).not.toBe('');
    }
  });
});
