import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { ReadingPage } from '../core/reading-model';
import { defaultPreferences, readingWindow } from '../core/reading-preferences';
import type { DocumentReader } from '../pdf/document-reader';
import { PageOriginal } from './EnginePanel';
import { FlowFigure } from './FlowFigure';
import { useReadingPreferences } from './preferences';
import { resolveAnchor, type ReadingPosition, type ResolvedAnchor } from '../core/annotations';
import { useAnnotations } from './annotations';
import { AnnotatedText, type PageHighlight } from './AnnotatedText';
import { AnnotationPanel, AnnotationSelection } from './AnnotationPanel';
import { IndexPanel } from './IndexPanel';
import { currentSection, type OutlineEntry } from '../pdf/outline';
import { selectedAnchor, visiblePosition, scrollToPosition } from './text-selection';
import { ReaderDialog } from './ReaderDialog';
import { version } from '../../package.json';
import { persistenceLabel, cacheNeedsAttention } from './reader-state';

type Anchor = { page: number; block: string; fraction: number };
export function FluidReader({
  reader,
  originalUrl,
  fileName,
  onOpenPdf,
  onStandardPdf,
  onTechnical,
}: {
  reader: DocumentReader;
  originalUrl: string;
  fileName: string;
  onOpenPdf(): void;
  onStandardPdf(): void;
  onTechnical(): void;
}) {
  const { preferences, update, storage, ready } = useReadingPreferences();
  const annotations = useAnnotations();
  const [panel, setPanel] = useState<'files' | 'appearance'>();
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 900px)').matches);
  const [mobileNotes, setMobileNotes] = useState(false);
  const [mobileIndex, setMobileIndex] = useState(false);
  const [outline, setOutline] = useState<OutlineEntry[]>([]);
  const [focus, setFocus] = useState(false);
  const [pages, setPages] = useState<ReadingPage[]>([]);
  const [current, setCurrent] = useState(1);
  const [draft, setDraft] = useState('1');
  const [original, setOriginal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const changeFocus = (value: boolean) => {
    if (value !== focus && root.current && !original)
      targetPosition.current = visiblePosition(root.current, pages);
    setFocus(value);
  };
  const notesOpen = !focus && (mobile ? mobileNotes : preferences.notesOpen);
  const indexOpen = !focus && (mobile ? mobileIndex : preferences.indexOpen);
  const contextTitle = currentSection(outline, current);
  const openNotes = () => {
    changeFocus(false);
    if (mobile) {
      setMobileIndex(false);
      setMobileNotes(true);
    } else {
      if (root.current && !original) targetPosition.current = visiblePosition(root.current, pages);
      update({ notesOpen: true });
    }
  };
  const closeNotes = () => {
    if (mobile) setMobileNotes(false);
    else {
      if (root.current && !original) targetPosition.current = visiblePosition(root.current, pages);
      update({ notesOpen: false });
    }
  };
  const openIndex = () => {
    changeFocus(false);
    if (mobile) {
      setMobileNotes(false);
      setMobileIndex(true);
    } else {
      if (root.current && !original) targetPosition.current = visiblePosition(root.current, pages);
      update({ indexOpen: true });
    }
  };
  const closeIndex = () => {
    if (mobile) setMobileIndex(false);
    else {
      if (root.current && !original) targetPosition.current = visiblePosition(root.current, pages);
      update({ indexOpen: false });
    }
  };
  const goFromIndex = (page: number) => {
    void load(page, 'jump');
    if (mobile) closeIndex();
  };
  useEffect(() => {
    document.documentElement.dataset.reading = 'true';
    const media = window.matchMedia('(max-width: 900px)');
    const changed = () => {
      setMobile(media.matches);
      setMobileNotes(false);
      setMobileIndex(false);
    };
    media.addEventListener('change', changed);
    return () => {
      delete document.documentElement.dataset.reading;
      media.removeEventListener('change', changed);
    };
  }, []);
  useEffect(() => {
    if (annotations.selectedId) openNotes();
  }, [annotations.selectedId, annotations.selectionRequest]);
  useEffect(() => {
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('dialog[open]')) changeFocus(false);
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [focus, pages, original]);
  const root = useRef<HTMLDivElement>(null);
  const abort = useRef<AbortController>();
  const generation = useRef(0);
  const locked = useRef(false);
  const restore = useRef<Anchor>();
  const savedAnchor = useRef<Anchor>();
  const savedTextPosition = useRef<ReadingPosition>();
  const lastScroll = useRef(0);
  const layoutWidth = useRef(0);
  const scrollFrame = useRef(0);
  const scrollIntent = useRef(false);
  const draftDirty = useRef(false);
  const targetPosition = useRef<ReadingPosition>();
  const focusOnRestore = useRef(false);
  const navigationSeen = useRef(-1);
  const outlineGeneration = useRef(0);
  useEffect(() => {
    const generation = ++outlineGeneration.current;
    setOutline([]);
    void reader.outline().then((entries) => {
      if (outlineGeneration.current === generation) setOutline(entries);
    });
  }, [reader]);
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
    if (targetPosition.current && pages.some((p) => p.page === targetPosition.current!.page)) {
      scrollToPosition(host, targetPosition.current);
      targetPosition.current = undefined;
      restore.current = undefined;
      lastScroll.current = host.scrollTop;
      savedAnchor.current = capture();
      savedTextPosition.current = visiblePosition(host, pages);
      if (focusOnRestore.current) {
        focusOnRestore.current = false;
        host.focus({ preventScroll: true });
        host.parentElement?.scrollIntoView({ block: 'start' });
      }
      return;
    }
    if (!anchor) {
      savedAnchor.current = capture();
      savedTextPosition.current = visiblePosition(host, pages);
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
    savedTextPosition.current = visiblePosition(host, pages);
  }, [pages, preferences, original, focus]);
  useEffect(() => {
    const host = root.current!;
    const observer = new ResizeObserver(() => {
      if (host.clientWidth === 0 || host.clientWidth === layoutWidth.current) return;
      layoutWidth.current = host.clientWidth;
      if (savedTextPosition.current && !host.hidden) {
        scrollToPosition(host, savedTextPosition.current);
        lastScroll.current = host.scrollTop;
        return;
      }
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
  const load = async (
    number: number,
    mode: 'jump' | 'next' | 'previous',
    force = false,
    position?: ReadingPosition,
    annotationId?: string,
  ) => {
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
      targetPosition.current = position;
      focusOnRestore.current = Boolean(annotationId);
      if (original && !force) {
        annotations.position({ page: number, offset: 0 });
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
      if (mode !== 'jump') {
        restore.current = capture();
        if (root.current) targetPosition.current = visiblePosition(root.current, pages);
      }
      if (position?.anchor) {
        const resolved = resolveAnchor(result.page.text, position.anchor);
        targetPosition.current =
          'start' in resolved
            ? { ...position, offset: resolved.start }
            : { page: number, offset: 0 };
        if (!('start' in resolved))
          annotations.setSelectionError(
            'Punto di lettura non risolto: ripristinata la pagina salvata.',
          );
      }
      if (
        position?.figure &&
        !result.page.blocks.some((b) => b.kind === 'figure' && b.id === position.figure)
      ) {
        targetPosition.current = { page: number, offset: 0 };
        annotations.setSelectionError(
          'Figura del punto di lettura non trovata: ripristinata la pagina salvata.',
        );
      }
      if (
        position &&
        !position.anchor &&
        !position.figure &&
        position.offset > result.page.text.length
      ) {
        targetPosition.current = { page: number, offset: 0 };
        annotations.setSelectionError(
          'Punto di lettura fuori dal testo: ripristinata la pagina salvata.',
        );
      }
      if (annotationId) {
        const note = annotations.session.state.data.annotations.find((n) => n.id === annotationId);
        if (note && note.anchor.page === number) {
          const resolved = resolveAnchor(result.page.text, note.anchor);
          targetPosition.current = {
            page: number,
            offset: 'start' in resolved ? resolved.start : 0,
          };
        }
      }
      setPages((old) => (mode === 'jump' ? [result.page] : readingWindow(old, result.page, mode)));
      if (mode === 'jump') {
        if (root.current) root.current.scrollTop = 0;
        lastScroll.current = 0;
        annotations.position(targetPosition.current ?? { page: number, offset: 0 });
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
    const requested = annotations.navigation;
    const position =
      navigationSeen.current === -1 ? annotations.session.state.data.position : requested.position;
    navigationSeen.current = requested.token;
    const page = Math.max(1, Math.min(reader.pageCount, position.page));
    if (page !== position.page)
      annotations.setSelectionError(
        'Pagina salvata fuori dal documento: aperta la pagina valida più vicina. Le note restano conservate.',
      );
    setOriginal(false);
    void load(
      page,
      'jump',
      true,
      page === position.page ? position : { page, offset: 0 },
      requested.annotationId,
    );
    return () => {
      abort.current?.abort();
      generation.current++;
      cancelAnimationFrame(scrollFrame.current);
    };
    // Il workspace viene ricreato per ogni nuovo documento.
  }, [reader, annotations.navigation.token]);
  const highlights = new Map<number, PageHighlight[]>();
  const statuses: Record<string, ResolvedAnchor['status']> = {};
  for (const a of annotations.data.annotations)
    if (a.anchor.page > reader.pageCount) statuses[a.id] = 'missing';
  for (const page of pages) {
    const items: PageHighlight[] = [];
    for (const annotation of annotations.data.annotations.filter(
      (a) => a.anchor.page === page.page,
    )) {
      const resolved = resolveAnchor(page.text, annotation.anchor);
      statuses[annotation.id] = page.supported ? resolved.status : 'missing';
      if ('start' in resolved && page.supported) items.push({ annotation, resolved });
    }
    highlights.set(page.page, items);
  }
  useEffect(() => {
    annotations.report(statuses);
  }, [pages, annotations.data.annotations]);
  useEffect(() => {
    let pointerSelecting = false;
    const onSelection = () => {
      if (!root.current || pointerSelecting) return;
      try {
        const anchor = selectedAnchor(root.current, pages);
        if (anchor) {
          annotations.setSelection(anchor);
          annotations.setSelectionError('');
        }
      } catch (e) {
        annotations.setSelection(undefined);
        annotations.setSelectionError(e instanceof Error ? e.message : 'Selezione non valida.');
      }
    };
    const down = (event: PointerEvent) => {
      pointerSelecting =
        event.button === 0 && root.current?.contains(event.target as Node) === true;
    };
    const up = () => {
      if (!pointerSelecting) return;
      pointerSelecting = false;
      onSelection();
    };
    document.addEventListener('selectionchange', onSelection);
    document.addEventListener('pointerdown', down);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', up);
    window.addEventListener('blur', up);
    return () => {
      document.removeEventListener('selectionchange', onSelection);
      document.removeEventListener('pointerdown', down);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', up);
      window.removeEventListener('blur', up);
    };
  }, [pages]);
  const start = pages[0]?.page ?? current;
  const end = pages.at(-1)?.page ?? current;
  const changePreferences = (change: Parameters<typeof update>[0]) => {
    if (!original) {
      restore.current = capture();
      if (root.current) targetPosition.current = visiblePosition(root.current, pages);
    }
    update(change);
  };
  const showOriginal = (number?: number) => {
    cancelAnimationFrame(scrollFrame.current);
    restore.current = capture();
    if (root.current) {
      const p = visiblePosition(root.current, pages);
      if (p) {
        annotations.position(p);
        targetPosition.current = p;
      }
    }
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
      savedTextPosition.current = visiblePosition(host, pages);
      lastScroll.current = host.scrollTop;
      if (locked.current) return;
      if (!scrollIntent.current) return;
      const position = visiblePosition(host, pages);
      if (position) annotations.position(position);
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
    <section
      class={`fluid-reader ${focus ? 'focus-mode' : ''}`}
      aria-labelledby="fluid-title"
      data-testid="fluid-reader"
      data-notes={notesOpen && !mobile ? 'open' : 'closed'}
      data-index={indexOpen && !mobile ? 'open' : 'closed'}
    >
      <header class="reader-topbar">
        <span class="reader-wordmark">
          Fluido<span>.</span>
        </span>
        <div class="reader-title">
          <h1 title={fileName}>{fileName}</h1>
          <p>PDF locale · sola lettura</p>
        </div>
        <button
          type="button"
          class={`reader-save ${annotations.state.unexported || annotations.state.conflict || annotations.state.status === 'error' || cacheNeedsAttention(annotations.state) ? 'reader-save-warning' : annotations.state.writeConfirmed && annotations.state.mode === 'automatic' && annotations.state.status === 'saved' ? 'reader-save-confirmed' : 'reader-save-neutral'}`}
          data-testid="reader-save"
          onClick={() => setPanel('files')}
          aria-label={`Stato JSON: ${persistenceLabel(annotations.state)}. Apri dettagli`}
        >
          <span class="state-dot" />
          {persistenceLabel(annotations.state)}
        </button>
        <nav class="reader-actions" aria-label="Strumenti di lettura">
          <button
            type="button"
            class="reader-tool"
            data-testid="flow-original"
            aria-pressed={original ? 'true' : 'false'}
            onClick={() => {
              if (!original) showOriginal();
              else {
                setOriginal(false);
                if (!pages.some((p) => p.page === current)) void load(current, 'jump', true);
              }
            }}
          >
            <span class="tool-symbol" aria-hidden="true">
              <svg
                width="18"
                height="20"
                viewBox="0 0 20 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.4"
              >
                <path d="M4 2h9l4 4v16H4zM13 2v5h4M7 11h7M7 15h7M7 19h4" />
              </svg>
            </span>
            <span>{original ? 'Torna alla lettura' : 'Originale'}</span>
          </button>
          <button
            type="button"
            class="reader-tool"
            data-testid="reader-appearance"
            aria-label="Impostazioni di lettura"
            aria-expanded={panel === 'appearance' ? 'true' : 'false'}
            onClick={() => setPanel('appearance')}
          >
            <span class="type-symbol" aria-hidden="true">
              Aa
            </span>
            <span class="tool-caption">Aspetto</span>
          </button>
          <button
            type="button"
            class="reader-tool"
            data-testid="reader-index"
            aria-label="Indice del documento"
            aria-expanded={indexOpen ? 'true' : 'false'}
            onClick={() => (indexOpen ? closeIndex() : openIndex())}
          >
            <span class="tool-symbol" aria-hidden="true">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.4"
              >
                <path d="M4 6h16M4 12h16M4 18h10" />
              </svg>
            </span>
            <span class="tool-caption">Indice</span>
          </button>
          <button
            type="button"
            class="reader-tool"
            data-testid="reader-notes"
            aria-expanded={notesOpen ? 'true' : 'false'}
            onClick={() => (notesOpen ? closeNotes() : openNotes())}
          >
            <span class="tool-symbol" aria-hidden="true">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.4"
              >
                <path d="M5 3h14v18H5zM8 8h8M8 12h8M8 16h5" />
              </svg>
            </span>
            <span>
              Annotazioni <span class="note-count">{annotations.data.annotations.length}</span>
            </span>
          </button>
        </nav>
        <button
          type="button"
          class="reader-icon"
          data-testid="reader-more"
          aria-label="Menu documento e file"
          aria-expanded={panel === 'files' ? 'true' : 'false'}
          onClick={() => setPanel('files')}
        >
          ⋯
        </button>
      </header>
      <div class="flow-heading">
        <div>
          <p class="eyebrow">LETTURA E ANNOTAZIONI</p>
          <h2 id="fluid-title">Il testo, al tuo ritmo</h2>
        </div>
        <p class="small-note" data-testid="flow-current">
          Pagina {current} di {reader.pageCount}
        </p>
      </div>
      {(annotations.state.conflict ||
        annotations.state.status === 'error' ||
        cacheNeedsAttention(annotations.state)) && (
        <div class="reader-alert" role="status" data-testid="reader-persistence-warning">
          <span>
            {annotations.state.conflict
              ? 'Conflitto: scrittura bloccata. Conserva entrambe le copie.'
              : 'Il lavoro richiede attenzione. Conserva il JSON aggiornato.'}
          </span>
          <button type="button" onClick={() => setPanel('files')}>
            {annotations.state.conflict ? 'Risolvi' : 'Dettagli e download'}
          </button>
        </div>
      )}
      <form
        class="flow-toolbar"
        onSubmit={(event) => {
          event.preventDefault();
          void load(Number(draft), 'jump');
        }}
      >
        <p class="flow-context" data-testid="reader-context" hidden={!contextTitle}>
          {contextTitle}
        </p>
        <button
          class="secondary-button"
          type="button"
          disabled={current === 1}
          aria-label="Precedente"
          onClick={() => void load(current - 1, 'jump')}
        >
          <span aria-hidden="true">← </span>Precedente
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
        <span class="page-total">di {reader.pageCount}</span>
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
        <progress value={current} max={reader.pageCount} aria-label="Avanzamento nel documento" />
        <button
          type="button"
          class="reader-focus"
          data-testid="reader-focus"
          onClick={() => changeFocus(true)}
        >
          Solo lettura
        </button>
      </form>
      <ReaderDialog
        open={panel === 'appearance'}
        title="Impostazioni di lettura"
        id="appearance-panel"
        onClose={() => setPanel(undefined)}
      >
        <div class="reading-settings">
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
                onInput={(event) =>
                  changePreferences({ margin: Number(event.currentTarget.value) })
                }
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
        </div>
      </ReaderDialog>
      <ReaderDialog
        open={panel === 'files'}
        title="Documento e file"
        id="file-panel"
        onClose={() => setPanel(undefined)}
      >
        <p class="menu-document-name">{fileName}</p>
        <div class="reader-menu-actions">
          <button
            class="secondary-button"
            onClick={() => {
              setPanel(undefined);
              onOpenPdf();
            }}
          >
            Cambia PDF
          </button>
          <button
            class="secondary-button"
            onClick={() => {
              setPanel(undefined);
              onStandardPdf();
            }}
          >
            Usa selettore standard
          </button>
          <a
            class="text-link"
            href={`${originalUrl}#page=${current}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Apri PDF originale
          </a>
          <button
            class="secondary-button"
            onClick={() => {
              setPanel(undefined);
              changeFocus(true);
            }}
          >
            Solo lettura
          </button>
        </div>
        <AnnotationPanel files />
        <details class="document-info">
          <summary>Dettagli del documento</summary>
          <p>
            {annotations.data.document.size.toLocaleString('it-IT')} byte · PDF originale invariato
          </p>
          <p class="hash">{annotations.data.document.sha256}</p>
          <p>
            Ricostruzione euristica: layout semplici, nessun OCR. Nessun file viene inviato a un
            server.
          </p>
          <p>
            Pagine {start}–{end} nel flusso · {pages.length}/5 renderizzate.
          </p>
          <button
            class="secondary-button"
            onClick={() => {
              setPanel(undefined);
              onTechnical();
            }}
          >
            Vista tecnica
          </button>
        </details>
        <p class="reader-version">
          Fluido v{version} · Fase 7 · <a href="https://opensource.org/licenses/MIT">MIT</a> ·{' '}
          <a href="./pdfjs/LICENSE" download="PDF.js-LICENSE.txt">
            Licenza PDF.js
          </a>
          {' · '}Font OFL:{' '}
          <a href="./fonts/OFL-source-sans-3.txt" download>
            Sans
          </a>
          ,{' '}
          <a href="./fonts/OFL-source-serif-4.txt" download>
            Serif
          </a>
        </p>
      </ReaderDialog>
      <p
        class="small-note flow-status"
        role="status"
        data-testid="flow-status"
        hidden={!loading && !error}
      >
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
      <div class="annotated-layout">
        {!mobile && (
          <aside
            class="index-aside"
            aria-label="Indice del documento"
            data-testid="index-aside"
            hidden={!indexOpen}
          >
            <div class="reader-panel-heading">
              <h2>Indice</h2>
              <button
                type="button"
                class="reader-icon"
                aria-label="Chiudi indice"
                onClick={closeIndex}
              >
                ×
              </button>
            </div>
            <div class="index-content">
              <IndexPanel
                entries={outline}
                pageCount={reader.pageCount}
                currentPage={current}
                onGo={goFromIndex}
              />
            </div>
          </aside>
        )}
        <div class="annotated-main">
          {!original && <AnnotationSelection />}
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
                ['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes(
                  event.key,
                )
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
                        <AnnotatedText block={block} highlights={highlights.get(page.page) ?? []} />
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
        </div>
        {mobile ? (
          <ReaderDialog
            open={indexOpen}
            title="Indice"
            id="index-panel-dialog"
            className="index-dialog"
            onClose={closeIndex}
          >
            <IndexPanel
              entries={outline}
              pageCount={reader.pageCount}
              currentPage={current}
              onGo={goFromIndex}
            />
          </ReaderDialog>
        ) : null}
        {mobile ? (
          <ReaderDialog
            open={notesOpen}
            title="Annotazioni"
            id="notes-panel"
            className="notes-dialog"
            onClose={closeNotes}
          >
            <AnnotationPanel open={notesOpen} onClose={closeNotes} onNavigate={closeNotes} />
          </ReaderDialog>
        ) : (
          <AnnotationPanel open={notesOpen} onClose={closeNotes} />
        )}
      </div>
      <p class="small-note flow-footnote">
        La lettura carica pagine su scorrimento o richiesta, non l’intero testo. Ricostruzione
        euristica; annotazioni e punto di lettura vanno conservati nel JSON separato.
      </p>
      {focus && (
        <button
          type="button"
          class="exit-focus"
          data-testid="reader-exit-focus"
          onClick={() => changeFocus(false)}
        >
          Esci da Solo lettura <span aria-hidden="true">↗</span>
        </button>
      )}
    </section>
  );
}
