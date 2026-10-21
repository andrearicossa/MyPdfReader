import type { TextBlock } from '../core/reading-model';
import type { Annotation, ResolvedAnchor } from '../core/annotations';
import { useAnnotations } from './annotations';

export type PageHighlight = {
  annotation: Annotation;
  resolved: Extract<ResolvedAnchor, { start: number }>;
};
export function AnnotatedText({
  block,
  highlights,
}: {
  block: TextBlock;
  highlights: PageHighlight[];
}) {
  const { select } = useAnnotations();
  if (block.kind === 'box')
    return (
      <aside
        class="engine-box"
        data-testid="reading-box"
        aria-label="Box di testo rilevato"
        data-block-id={block.id}
      >
        {block.children?.map((b) => (
          <AnnotatedText key={b.id} block={b} highlights={highlights} />
        ))}
      </aside>
    );
  if (block.kind === 'quote')
    return (
      <blockquote
        class="engine-quote"
        data-testid="reading-quote"
        aria-label="Citazione rilevata"
        data-block-id={block.id}
      >
        {block.children
          ?.filter((b) => b.id !== block.attributionId)
          .map((b) => (
            <AnnotatedText key={b.id} block={b} highlights={highlights} />
          ))}
        {block.children
          ?.filter((b) => b.id === block.attributionId)
          .map((b) => (
            <footer key={b.id} data-testid="quote-attribution">
              <AnnotatedText block={b} highlights={highlights} />
            </footer>
          ))}
      </blockquote>
    );
  const relevant = highlights.filter(
    (h) => h.resolved.end > block.start && h.resolved.start < block.end,
  );
  const edges = [
    ...new Set([
      block.start,
      block.end,
      ...relevant.flatMap((h) => [
        Math.max(block.start, h.resolved.start),
        Math.min(block.end, h.resolved.end),
      ]),
    ]),
  ].sort((a, b) => a - b);
  const content = edges.slice(0, -1).map((start, i) => {
    const end = edges[i + 1]!,
      active = relevant.filter((h) => h.resolved.start < end && h.resolved.end > start);
    const text = block.text.slice(start - block.start, end - block.start);
    if (!active.length) return text;
    const top = active.at(-1)!.annotation;
    return (
      <mark
        key={start}
        class={`text-highlight highlight-${top.color}`}
        data-annotation-ids={active.map((h) => h.annotation.id).join(' ')}
        role="button"
        tabIndex={0}
        aria-label={`Apri annotazione: ${text.slice(0, 80)}`}
        onClick={() => select(top.id)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            select(top.id);
          }
        }}
      >
        {text}
      </mark>
    );
  });
  const attrs = {
    'data-text-start': block.start,
    'data-text-end': block.end,
    'data-block-id': block.id,
  };
  return block.kind === 'heading' ? <h3 {...attrs}>{content}</h3> : <p {...attrs}>{content}</p>;
}
