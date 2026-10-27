import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { currentSection, type OutlineEntry } from '../pdf/outline';

const GROUP_SIZE = 25;

/**
 * Indice del documento: segnalibri del PDF quando presenti, pagine altrimenti.
 * La voce corrente è evidenziata sulla base della pagina visibile; quando più
 * sezioni partono dalla stessa pagina si evidenzia il contesto di pagina senza
 * dichiarare una sezione esatta.
 */
export function IndexPanel({
  entries,
  pageCount,
  currentPage,
  onGo,
}: {
  entries: OutlineEntry[];
  pageCount: number;
  currentPage: number;
  /** Salta alla pagina e chiude il pannello solo dove il contesto è mobile. */
  onGo(page: number): void;
}) {
  const activePage = useMemo(() => {
    const reached = entries.filter((e) => e.page !== null && e.page <= currentPage);
    if (reached.length === 0) return null;
    return Math.max(...reached.map((e) => e.page!));
  }, [entries, currentPage]);
  const activeRef = useRef<HTMLLIElement>(null);
  const [openGroups, setOpenGroups] = useState<Record<number, boolean>>({});
  const currentGroup = Math.floor((currentPage - 1) / GROUP_SIZE);
  useEffect(() => {
    if (entries.length === 0 && !(openGroups[currentGroup] ?? true))
      setOpenGroups((s) => ({ ...s, [currentGroup]: true }));
  }, [entries.length, currentGroup]);
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' });
  }, [activePage, currentPage, entries]);
  const section = currentSection(entries, currentPage);
  return (
    <nav class="index-panel" aria-label="Indice del documento" data-testid="index-panel">
      {entries.length > 0 ? (
        <>
          <p class="cache-note">Sommario del PDF · {entries.length} voci</p>
          <ul class="index-list">
            {entries.map((entry) => (
              <li
                key={entry.id}
                ref={entry.page !== null && entry.page === activePage ? activeRef : undefined}
                class={`index-item level-${Math.min(entry.level, 6)}${
                  entry.page !== null && entry.page === activePage ? ' current' : ''
                }`}
              >
                {entry.page !== null ? (
                  <button
                    type="button"
                    aria-current={
                      entry.page === activePage
                        ? currentPage === activePage
                          ? 'page'
                          : 'true'
                        : undefined
                    }
                    onClick={() => onGo(entry.page!)}
                  >
                    <span class="index-title" title={entry.title}>
                      {entry.title}
                    </span>
                    <span class="index-page">p. {entry.page}</span>
                  </button>
                ) : (
                  <span class="index-group-title" title={entry.title}>
                    {entry.title}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <p class="cache-note">Il PDF non ha un sommario · navigazione per pagina</p>
          <ul class="index-pages">
            {Array.from({ length: Math.ceil(pageCount / GROUP_SIZE) }, (_, g) => {
              const from = g * GROUP_SIZE + 1;
              const to = Math.min(pageCount, from + GROUP_SIZE - 1);
              const expanded = openGroups[g] ?? g === currentGroup;
              return (
                <li key={g}>
                  <button
                    type="button"
                    class="index-group-toggle"
                    aria-expanded={expanded ? 'true' : 'false'}
                    onClick={() => setOpenGroups((s) => ({ ...s, [g]: !expanded }))}
                  >
                    Pagine {from}–{to}
                  </button>
                  {expanded && (
                    <div class="index-page-grid">
                      {Array.from({ length: to - from + 1 }, (_, i) => from + i).map((page) => (
                        <button
                          key={page}
                          type="button"
                          aria-current={page === currentPage ? 'page' : undefined}
                          onClick={() => onGo(page)}
                        >
                          {page}
                        </button>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
      {section && (
        <p class="small-note index-context" data-testid="index-context">
          Sei in: {section}
        </p>
      )}
    </nav>
  );
}
