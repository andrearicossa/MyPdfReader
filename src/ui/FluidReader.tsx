import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { ReadingPage } from '../core/reading-model';
import { defaultPreferences, readingWindow } from '../core/reading-preferences';
import type { DocumentReader } from '../pdf/document-reader';
import { ReadingText, PageOriginal } from './EnginePanel';
import { FlowFigure } from './FlowFigure';
import { useReadingPreferences } from './preferences';

type Anchor = { page: number; block: string; fraction: number };
export function FluidReader({
  reader,
  originalUrl,
}: {
  reader: DocumentReader;
  originalUrl: string;
}) {
  const { preferences, update, storage, ready } = useReadingPreferences();
  const [pages, setPages] = useState<ReadingPage[]>([]);
  const [current, setCurrent] = useState(1);
  const [draft, setDraft] = useState('1');
  const [original, setOriginal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const abort = useRef<AbortController>();
  const generation = useRef(0);
  const locked = useRef(false);
  const restore = useRef<Anchor>();
  const savedAnchor = useRef<Anchor>();
  const lastScroll = useRef(0);
  const layoutWidth = useRef(0);
  const scrollFrame = useRef(0);
  const scrollIntent = useRef(false);
  const draftDirty = useRef(false);
  const failedRequest = useRef({ number: 1, mode: 'jump' as 'jump' | 'next' | 'previous' });
  const capture = (): Anchor | undefined => {
    const host = root.current;
    if (!host) return;
    const top = host.getBoundingClientRect().top + 12;
    const blocks = [...host.querySelectorAll<HTMLElement>('[data-flow-block]')];
    const block = blocks.find((el) => el.getBoundingClientRect().bottom > top);
    if (!block) return;
    const bounds = block.getBoundingClientRect();
    return {
      page: Number(block.closest('[data-flow-page]')?.getAttribute('data-flow-page')),
      block: block.dataset.flowBlock!,
      fraction: Math.max(0, Math.min(1, (top - bounds.top) / Math.max(1, bounds.height))),
    };
  };
  useLayoutEffect(() => {
    const anchor = restore.current,
      host = root.current;
    if (!host || original) return;
    layoutWidth.current = host.clientWidth;
    if (!anchor) {
      savedAnchor.current = capture();
      return;
    }
    const block = [...host.querySelectorAll<HTMLElement>('[data-flow-page]')]
      .find((el) => Number(el.dataset.flowPage) === anchor.page)
      ?.querySelector<HTMLElement>(`[data-flow-block="${anchor.block}"]`);
    if (block) {
      const bounds = block.getBoundingClientRect();
      host.scrollTop +=
        bounds.top + bounds.height * anchor.fraction - host.getBoundingClientRect().top - 12;
    }
    lastScroll.current = host.scrollTop;
    restore.current = undefined;
    savedAnchor.current = capture();
  }, [pages, preferences, original]);
  useEffect(() => {
    const host = root.current!;
    const observer = new ResizeObserver(() => {
      if (host.clientWidth === 0 || host.clientWidth === layoutWidth.current) return;
      layoutWidth.current = host.clientWidth;
      const anchor = savedAnchor.current;
      if (!anchor || host.hidden) return;
      const block = [...host.querySelectorAll<HTMLElement>('[data-flow-page]')]
        .find((el) => Number(el.dataset.flowPage) === anchor.page)
        ?.querySelector<HTMLElement>(`[data-flow-block="${anchor.block}"]`);
      if (block) {
        const bounds = block.getBoundingClientRect();
        host.scrollTop +=
          bounds.top + bounds.height * anchor.fraction - host.getBoundingClientRect().top - 12;
        lastScroll.current = host.scrollTop;
      }
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, [reader]);
  const load = async (number: number, mode: 'jump' | 'next' | 'previous', force = false) => {
    if (number < 1 || number > reader.pageCount) return;
    if (mode !== 'jump' && locked.current) return;
    scrollIntent.current = false;
    if (mode === 'jump') {
      cancelAnimationFrame(scrollFrame.current);
      draftDirty.current = false;
      abort.current?.abort();
      generation.current++;
      locked.current = false;
      setPages([]);
      setCurrent(number);
      setDraft(String(number));
      setError('');
      restore.current = undefined;
      if (original && !force) {
        setLoading(false);
        return;
      }
    }
    const id = generation.current;
    failedRequest.current = { number, mode };
    const controller = new AbortController();
    abort.current = controller;
    locked.current = true;
    setLoading(true);
    setError('');
    try {
      const result = await reader.extractPage(number, controller.signal);
      if (controller.signal.aborted || id !== generation.current) return;
      if (mode !== 'jump') restore.current = capture();
      setPages((old) => (mode === 'jump' ? [result.page] : readingWindow(old, result.page, mode)));
      if (mode === 'jump') {
        if (root.current) root.current.scrollTop = 0;
        lastScroll.current = 0;
      }
    } catch (cause) {
      if (!controller.signal.aborted && id === generation.current)
        setError(cause instanceof Error ? cause.message : 'Estrazione non riuscita.');
    } finally {
      if (!controller.signal.aborted && id === generation.current) {
        locked.current = false;
        setLoading(false);
      }
    }
  };
  useEffect(() => {
    void load(1, 'jump');
    return () => {
      abort.current?.abort();
      generation.current++;
      cancelAnimationFrame(scrollFrame.current);
    };
    // Il workspace viene ricreato per ogni nuovo documento.
  }, [reader]);
  const start = pages[0]?.page ?? current;
  const end = pages.at(-1)?.page ?? current;
  const changePreferences = (change: Parameters<typeof update>[0]) => {
    if (!original) restore.current = capture();
    update(change);
  };
  const showOriginal = (number?: number) => {
    cancelAnimationFrame(scrollFrame.current);
    restore.current = capture();
    abort.current?.abort();
    generation.current++;
    locked.current = false;
    setLoading(false);
    setError('');
    if (number !== undefined) {
      setCurrent(number);
      setDraft(String(number));
    }
    setOriginal(true);
  };
  const scroll = () => {
    cancelAnimationFrame(scrollFrame.current);
    scrollFrame.current = requestAnimationFrame(() => {
      const host = root.current;
      if (!host || original) return;
      // WebKit può inviare scroll prima del ResizeObserver: non sostituire
      // l'ancora della vecchia impaginazione con una misura già ridisposta.
      if (host.clientWidth !== layoutWidth.current) return;
      const top = host.getBoundingClientRect().top + 24;
      const visible = [...host.querySelectorAll<HTMLElement>('[data-flow-page]')].find(
        (el) => el.getBoundingClientRect().bottom > top,
      );
      if (visible) {
        const number = Number(visible.dataset.flowPage);
        setCurrent(number);
        if (!draftDirty.current) setDraft(String(number));
      }
      const previous = lastScroll.current;
      savedAnchor.current = capture();
      lastScroll.current = host.scrollTop;
      if (locked.current) return;
      if (!scrollIntent.current) return;
      if (
        host.scrollTop > previous &&
        host.scrollHeight - host.clientHeight - host.scrollTop < 160 &&
        end < reader.pageCount
      )
        void load(end + 1, 'next');
      else if (host.scrollTop < previous && host.scrollTop < 60 && start > 1)
        void load(start - 1, 'previous');
    });
  };
  return (
    <section class="fluid-reader" aria-labelledby="fluid-title" data-testid="fluid-reader">
      <div class="flow-heading">
        <div>
          <p class="eyebrow">FASE 3 · LETTURA FLUIDA</p>
          <h2 id="fluid-title">Il testo, al tuo ritmo</h2>
        </div>
        <p class="small-note" data-testid="flow-current">
          Pagina {current} di {reader.pageCount}
        </p>
      </div>
      <form
        class="flow-toolbar"
        onSubmit={(event) => {
          event.preventDefault();
          void load(Number(draft), 'jump');
        }}
      >
        <button
          class="secondary-button"
          type="button"
          disabled={current === 1}
          onClick={() => void load(current - 1, 'jump')}
        >
          Precedente
        </button>
        <label for="flow-page">Pagina</label>
        <input
          id="flow-page"
          data-testid="flow-page"
          type="number"
          required
          min="1"
          max={reader.pageCount}
          value={draft}
          onInput={(event) => {
            draftDirty.current = true;
            setDraft(event.currentTarget.value);
          }}
        />
        <button class="secondary-button" type="submit">
          Vai
        </button>
        <button
          class="secondary-button"
          type="button"
          disabled={current === reader.pageCount}
          onClick={() => void load(current + 1, 'jump')}
        >
          Successiva
        </button>
        <button
          class="secondary-button"
          type="button"
          data-testid="flow-original"
          aria-pressed={original ? 'true' : 'false'}
          onClick={() => {
            if (!original) {
              showOriginal();
            } else {
              setOriginal(false);
              if (!pages.some((p) => p.page === current)) void load(current, 'jump', true);
            }
          }}
        >
          {original ? 'Torna alla lettura' : 'Originale'}
        </button>
        <a
          class="text-link"
          href={`${originalUrl}#page=${current}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Apri PDF originale
        </a>
      </form>
      <details class="reading-settings">
        <summary>Impostazioni di lettura</summary>
        <div class="reading-controls">
          <label>
            Carattere
            <select
              data-testid="reading-font"
              disabled={!ready}
              value={preferences.font}
              onChange={(event) =>
                changePreferences({ font: event.currentTarget.value as 'serif' | 'sans' })
              }
            >
              <option value="serif">Con grazie</option>
              <option value="sans">Senza grazie</option>
            </select>
          </label>
          <label>
            Dimensione · {preferences.size} px
            <input
              data-testid="reading-size"
              disabled={!ready}
              type="range"
              min="14"
              max="32"
              step="1"
              value={preferences.size}
              onInput={(event) => changePreferences({ size: Number(event.currentTarget.value) })}
            />
          </label>
          <label>
            Interlinea · {preferences.lineHeight}
            <input
              data-testid="reading-line"
              disabled={!ready}
              type="range"
              min="1.3"
              max="2.2"
              step=".1"
              value={preferences.lineHeight}
              onInput={(event) =>
                changePreferences({ lineHeight: Number(event.currentTarget.value) })
              }
            />
          </label>
          <label>
            Margini · {preferences.margin} px
            <input
              data-testid="reading-margin"
              disabled={!ready}
              type="range"
              min="8"
              max="48"
              step="4"
              value={preferences.margin}
              onInput={(event) => changePreferences({ margin: Number(event.currentTarget.value) })}
            />
          </label>
          <label>
            Tema
            <select
              data-testid="reading-theme"
              disabled={!ready}
              value={preferences.theme}
              onChange={(event) =>
                changePreferences({
                  theme: event.currentTarget.value as 'light' | 'dark' | 'sepia',
                })
              }
            >
              <option value="light">Chiaro</option>
              <option value="dark">Scuro</option>
              <option value="sepia">Seppia</option>
            </select>
          </label>
          <button
            class="secondary-button"
            disabled={!ready}
            type="button"
            onClick={() => changePreferences(defaultPreferences)}
          >
            Ripristina preferenze
          </button>
        </div>
        <p class="small-note" role="status" data-testid="preferences-status">
          {storage} Non vengono esportate nel JSON.
        </p>
      </details>
      <p class="small-note" role="status" data-testid="flow-status">
        {loading
          ? 'Caricamento pagina…'
          : error
            ? 'Lettura interrotta.'
            : `Pagine ${start}–${end} nel flusso · ${pages.length}/5 renderizzate.`}
      </p>
      {loading && (
        <button
          class="secondary-button"
          onClick={() => {
            abort.current?.abort();
            generation.current++;
            locked.current = false;
            setLoading(false);
            setError('Caricamento annullato.');
          }}
        >
          Interrompi caricamento
        </button>
      )}
      {error && (
        <p class="error-notice" role="alert">
          {error}{' '}
          <button
            class="text-link"
            onClick={() => void load(failedRequest.current.number, failedRequest.current.mode)}
          >
            Riprova caricamento
          </button>{' '}
          oppure apri Originale.
        </p>
      )}
      {original && (
        <div class="flow-original-view">
          <PageOriginal key={current} reader={reader} number={current} />
        </div>
      )}
      <div
        ref={root}
        class="flow-viewport"
        data-testid="flow-viewport"
        hidden={original}
        tabIndex={0}
        role="region"
        aria-label="Testo a scorrimento continuo"
        onScroll={scroll}
        onWheel={(event) => {
          scrollIntent.current = true;
          if (event.deltaY < 0 && event.currentTarget.scrollTop < 60 && start > 1)
            void load(start - 1, 'previous');
          else if (
            event.deltaY > 0 &&
            event.currentTarget.scrollHeight -
              event.currentTarget.clientHeight -
              event.currentTarget.scrollTop <
              160 &&
            end < reader.pageCount
          )
            void load(end + 1, 'next');
        }}
        onTouchMove={() => {
          scrollIntent.current = true;
        }}
        onKeyDown={(event) => {
          if (
            ['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes(event.key)
          )
            scrollIntent.current = true;
        }}
        onPointerDown={(event) => {
          if (event.target === event.currentTarget) scrollIntent.current = true;
        }}
        style={{
          '--reading-size': `${preferences.size}px`,
          '--reading-line': preferences.lineHeight,
          '--reading-margin': `${preferences.margin}px`,
          '--reading-font':
            preferences.font === 'sans' ? 'var(--font-body)' : 'var(--font-display)',
        }}
      >
        {start > 1 && (
          <button
            class="secondary-button flow-edge"
            disabled={loading}
            onClick={() => void load(start - 1, 'previous')}
          >
            Carica pagina precedente · {start - 1}
          </button>
        )}
        {pages.map((page) => (
          <section
            class="flow-sheet"
            key={page.page}
            data-flow-page={page.page}
            aria-label={`Pagina ${page.page}`}
          >
            <p class="page-marker" data-flow-block="marker">
              Pagina {page.page}
            </p>
            {!page.supported && (
              <div class="engine-warning" data-testid="flow-warning">
                <strong>Questa pagina richiede il confronto con l’Originale</strong>
                <ul>
                  {page.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
                <p>Il testo seguente è diagnostico, non una ricostruzione affidabile.</p>
                <button class="secondary-button" onClick={() => showOriginal(page.page)}>
                  Originale pagina {page.page}
                </button>
              </div>
            )}
            <div class="flow-prose">
              {page.blocks.map((block) => (
                <div key={block.id} data-flow-block={block.id}>
                  {block.kind === 'figure' ? (
                    <FlowFigure reader={reader} figure={block} />
                  ) : (
                    <ReadingText block={block} />
                  )}
                </div>
              ))}
              {!page.text && <p>Nessun testo estraibile. Non viene eseguito OCR.</p>}
            </div>
          </section>
        ))}
        {pages.length > 0 &&
          (end < reader.pageCount ? (
            <button
              class="secondary-button flow-edge"
              data-testid="flow-continue"
              disabled={loading}
              onClick={() => void load(end + 1, 'next')}
            >
              Continua con pagina {end + 1}
            </button>
          ) : (
            <p class="page-marker">Fine del documento</p>
          ))}
      </div>
      <p class="small-note flow-footnote">
        La lettura carica pagine su scorrimento o richiesta, non l’intero testo. Ricostruzione
        euristica; la posizione non viene ancora salvata nel file.
      </p>
    </section>
  );
}
