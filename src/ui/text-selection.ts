import { makeAnchor, type ReadingPosition, type TextAnchor } from '../core/annotations';
import type { ReadingPage } from '../core/reading-model';

function leafOf(node: Node | null) {
  return (
    node?.nodeType === Node.ELEMENT_NODE ? (node as Element) : node?.parentElement
  )?.closest<HTMLElement>('[data-text-start]');
}
function leafOffset(leaf: HTMLElement, node: Node, offset: number) {
  const range = document.createRange();
  range.selectNodeContents(leaf);
  range.setEnd(node, offset);
  return Number(leaf.dataset.textStart) + range.toString().length;
}
export function selectedAnchor(root: HTMLElement, pages: ReadingPage[]): TextAnchor | undefined {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.rangeCount) return;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return;
  const first = leafOf(range.startContainer),
    last = leafOf(range.endContainer);
  if (!first || !last) throw new Error('Seleziona il testo ricostruito, non figure o controlli.');
  const page = Number(first.closest<HTMLElement>('[data-flow-page]')?.dataset.flowPage);
  if (page !== Number(last.closest<HTMLElement>('[data-flow-page]')?.dataset.flowPage))
    throw new Error('Seleziona un passaggio all’interno di una sola pagina.');
  const model = pages.find((p) => p.page === page);
  if (!model?.supported)
    throw new Error(
      'Annotazioni disattivate su pagine con ricostruzione non affidabile. Consulta l’Originale.',
    );
  return makeAnchor(
    model,
    leafOffset(first, range.startContainer, range.startOffset),
    leafOffset(last, range.endContainer, range.endOffset),
  );
}
export function visiblePosition(
  root: HTMLElement,
  pages: ReadingPage[],
): ReadingPosition | undefined {
  const top = root.getBoundingClientRect().top + 12;
  const sheet = [...root.querySelectorAll<HTMLElement>('[data-flow-page]')].find(
    (el) => el.getBoundingClientRect().bottom > top,
  );
  if (!sheet) return;
  const page = Number(sheet.dataset.flowPage);
  const figure = [...sheet.querySelectorAll<HTMLElement>('[data-figure-id]')].find((el) => {
    const r = el.getBoundingClientRect();
    return r.top <= top && r.bottom > top;
  });
  if (figure) {
    const r = figure.getBoundingClientRect();
    return {
      page,
      offset: 0,
      figure: figure.dataset.figureId!,
      fraction: Math.max(0, Math.min(1, (top - r.top) / r.height)),
    };
  }
  const leaves = [...sheet.querySelectorAll<HTMLElement>('[data-text-start]')];
  const leaf = leaves.find((el) => el.getBoundingClientRect().bottom > top);
  if (!leaf) return { page, offset: Number(leaves.at(-1)?.dataset.textEnd ?? 0) };
  const bounds = leaf.getBoundingClientRect();
  const anchored = (offset: number): ReadingPosition => {
    const model = pages.find((p) => p.page === page),
      end = Math.min(offset + 64, model?.text.length ?? 0);
    return {
      page,
      offset,
      ...(model && end > offset && model.text.slice(offset, end).trim()
        ? { anchor: makeAnchor(model, offset, end) }
        : {}),
    };
  };
  if (bounds.top >= top) return anchored(Number(leaf.dataset.textStart));
  const x = bounds.left + Math.min(12, bounds.width / 2),
    y = Math.min(bounds.bottom - 1, top + 2);
  const doc = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  const caret = doc.caretPositionFromPoint?.(x, y),
    range = caret ? undefined : doc.caretRangeFromPoint?.(x, y);
  const node = caret?.offsetNode ?? range?.startContainer,
    offset = caret?.offset ?? range?.startOffset;
  if (node && offset !== undefined && leaf.contains(node))
    return anchored(leafOffset(leaf, node, offset));
  const fraction = Math.max(0, Math.min(1, (top - bounds.top) / Math.max(1, bounds.height)));
  return anchored(
    Math.round(
      Number(leaf.dataset.textStart) +
        (Number(leaf.dataset.textEnd) - Number(leaf.dataset.textStart)) * fraction,
    ),
  );
}
export function scrollToPosition(root: HTMLElement, position: ReadingPosition) {
  const sheet = [...root.querySelectorAll<HTMLElement>('[data-flow-page]')].find(
    (s) => Number(s.dataset.flowPage) === position.page,
  );
  if (!sheet) return;
  if (position.figure) {
    const figure = [...sheet.querySelectorAll<HTMLElement>('[data-figure-id]')].find(
      (f) => f.dataset.figureId === position.figure,
    );
    if (figure) {
      const bounds = figure.getBoundingClientRect();
      root.scrollTop +=
        bounds.top +
        bounds.height * (position.fraction ?? 0) -
        root.getBoundingClientRect().top -
        12;
      return;
    }
  }
  const leaves = [...sheet.querySelectorAll<HTMLElement>('[data-text-start]')];
  const leaf = leaves.find((l) => Number(l.dataset.textEnd) >= position.offset) ?? leaves.at(-1);
  if (!leaf) {
    root.scrollTop += sheet.getBoundingClientRect().top - root.getBoundingClientRect().top;
    return;
  }
  let offset = Math.max(
    0,
    Math.min(leaf.textContent?.length ?? 0, position.offset - Number(leaf.dataset.textStart)),
  );
  const walker = document.createTreeWalker(leaf, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (offset <= (node.textContent?.length ?? 0)) {
      const range = document.createRange();
      range.setStart(node, offset);
      range.setEnd(node, Math.min(node.textContent?.length ?? 0, offset + 1));
      const bounds = range.getBoundingClientRect();
      root.scrollTop +=
        (bounds.height ? bounds.top : leaf.getBoundingClientRect().top) -
        root.getBoundingClientRect().top -
        12;
      return;
    }
    offset -= node.textContent?.length ?? 0;
  }
}
