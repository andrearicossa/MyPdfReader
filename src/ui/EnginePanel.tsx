import { useEffect, useRef, useState } from 'preact/hooks';
import type { FigureBlock, TextBlock } from '../core/reading-model';
import type { DocumentReader, PageExtraction } from '../pdf/document-reader';

export function EnginePanel({
  reader,
  originalUrl,
}: {
  reader: DocumentReader;
  originalUrl: string;
}) {
  const [result, setResult] = useState<PageExtraction>();
  const [selected, setSelected] = useState(1);
  const [draft, setDraft] = useState('1');
  const [status, setStatus] = useState<'running' | 'ready' | 'cancelled' | 'error'>('running');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [original, setOriginal] = useState(false);
  const controller = useRef<AbortController>();
  useEffect(() => {
    const abort = new AbortController();
    controller.current = abort;
    setResult(undefined);
    setError('');
    if (original) return () => abort.abort();
    setStatus('running');
    void reader
      .extractPage(selected, abort.signal)
      .then((value) => {
        if (!abort.signal.aborted) {
          setResult(value);
          setStatus('ready');
        }
      })
      .catch((cause) => {
        if (!abort.signal.aborted) {
          setError(cause instanceof Error ? cause.message : 'Estrazione non riuscita.');
          setStatus('error');
        }
      });
    return () => abort.abort();
  }, [reader, selected, attempt, original]);
  const go = (number: number) => {
    if (!Number.isSafeInteger(number) || number < 1 || number > reader.pageCount) return;
    controller.current?.abort();
    setSelected(number);
    setDraft(String(number));
    setResult(undefined);
    setStatus('running');
    if (number === selected) setAttempt(attempt + 1);
  };
  const page = result?.page.page === selected ? result.page : undefined;
  return (
    <section class="engine-panel" aria-labelledby="engine-title" data-testid="engine-panel">
      <div class="engine-header">
        <div>
          <p class="eyebrow">FASE 2 · MOTORE DI LETTURA</p>
          <h2 id="engine-title">{original ? 'Pagina originale' : 'Testo ricostruito'}</h2>
        </div>
        <p class="small-note">
          {reader.pageCount} {reader.pageCount === 1 ? 'pagina' : 'pagine'} · estrazione su
          richiesta
        </p>
      </div>
      <p class="small-note">
        Elaboriamo soltanto la pagina selezionata, senza precaricare le altre. La ricostruzione di
        testo, box e citazioni è euristica: confrontala con l’originale. Usa “Lettura fluida” per lo
        scorrimento e le preferenze; le annotazioni arriveranno nelle prossime fasi.
      </p>
      <form
        class="engine-toolbar"
        onSubmit={(event) => {
          event.preventDefault();
          go(Number(draft));
        }}
      >
        <button
          class="secondary-button"
          type="button"
          disabled={selected === 1}
          onClick={() => go(selected - 1)}
        >
          Pagina precedente
        </button>
        <label for="engine-page">Pagina da verificare</label>
        <input
          id="engine-page"
          data-testid="engine-page"
          type="number"
          required
          min="1"
          max={reader.pageCount}
          value={draft}
          onInput={(event) => setDraft(event.currentTarget.value)}
        />
        <button class="secondary-button" type="submit">
          Vai alla pagina
        </button>
        <button
          class="secondary-button"
          type="button"
          disabled={selected === reader.pageCount}
          onClick={() => go(selected + 1)}
        >
          Pagina successiva
        </button>
        <button
          class="secondary-button"
          type="button"
          data-testid="engine-original"
          aria-pressed={original ? 'true' : 'false'}
          onClick={() => {
            controller.current?.abort();
            setOriginal(!original);
          }}
        >
          {original ? 'Torna al testo ricostruito' : 'Mostra pagina originale'}
        </button>
        <a
          class="text-link"
          href={`${originalUrl}#page=${selected}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Apri PDF nel browser
        </a>
      </form>
      {!original && (
        <>
          <div role="status" aria-live="polite" data-testid="engine-status">
            {status === 'running' && <p>Estrazione della pagina {selected}…</p>}
            {status === 'cancelled' && (
              <p>Estrazione interrotta. Il PDF e il JSON non sono stati modificati.</p>
            )}
            {status === 'ready' && page && (
              <p>
                Pagina {selected} pronta.{' '}
                {page.supported
                  ? 'Layout semplice rilevato.'
                  : 'Pagina non supportata per la lettura fluida.'}{' '}
                <span data-testid="engine-cache">
                  {result!.cachedPages.length}{' '}
                  {result!.cachedPages.length === 1 ? 'pagina' : 'pagine'} in cache (massimo 8).
                </span>{' '}
                Filtro marginale progressivo: {result!.removedMarginalLines} righe escluse nelle
                pagine in cache.
              </p>
            )}
          </div>
          {status === 'running' && (
            <button
              class="secondary-button"
              onClick={() => {
                controller.current?.abort();
                setStatus('cancelled');
              }}
            >
              Interrompi estrazione
            </button>
          )}
          {status === 'error' && (
            <p role="alert" class="error-notice">
              Estrazione non riuscita: {error} Usa la vista Originale.
            </p>
          )}
          {(status === 'error' || status === 'cancelled') && (
            <button class="secondary-button" onClick={() => setAttempt(attempt + 1)}>
              Riprova estrazione
            </button>
          )}
          {page && (
            <p class="small-note">
              Intestazioni e piè di pagina sono riconosciuti confrontando solo le pagine visitate.
              Il filtro può cambiare tornando su una pagina; non modifica il PDF o il JSON.
            </p>
          )}
          {page && page.warnings.length > 0 && (
            <div class="engine-warning" data-testid="engine-warning">
              <strong>Usa la vista Originale per questa pagina</strong>
              <ul>
                {page.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
              <p>Il testo sottostante è soltanto diagnostico, non una ricostruzione affidabile.</p>
            </div>
          )}
        </>
      )}
      <article
        class="engine-page"
        data-testid="engine-content"
        aria-label={`Anteprima pagina ${selected}`}
        aria-busy={!original && status === 'running' ? 'true' : 'false'}
      >
        {original ? (
          <PageOriginal key={selected} reader={reader} number={selected} />
        ) : (
          page?.blocks.map((block) =>
            block.kind === 'figure' ? (
              <FigurePreview key={block.id} reader={reader} figure={block} />
            ) : (
              <ReadingText key={block.id} block={block} />
            ),
          )
        )}
        {!original && page && !page.text && (
          <p class="small-note">Nessun testo estraibile. Non viene eseguito OCR.</p>
        )}
      </article>
    </section>
  );
}

export function ReadingText({ block }: { block: TextBlock }) {
  if (block.kind === 'box')
    return (
      <aside
        class="engine-box"
        data-testid="reading-box"
        aria-label="Box di testo rilevato"
        data-block-id={block.id}
      >
        {block.children?.map((child) => (
          <ReadingText key={child.id} block={child} />
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
          ?.filter((child) => child.id !== block.attributionId)
          .map((child) => (
            <ReadingText key={child.id} block={child} />
          ))}
        {block.children
          ?.filter((child) => child.id === block.attributionId)
          .map((child) => (
            <footer key={child.id} data-testid="quote-attribution">
              <cite data-block-id={child.id}>{child.text}</cite>
            </footer>
          ))}
      </blockquote>
    );
  return block.kind === 'heading' ? (
    <h3 data-block-id={block.id}>{block.text}</h3>
  ) : (
    <p data-block-id={block.id}>{block.text}</p>
  );
}

export function PageOriginal({ reader, number }: { reader: DocumentReader; number: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    void reader
      .renderPage(number, canvas.current!)
      .then(() => {
        if (active) setReady(true);
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Rendering non disponibile.');
      });
    return () => {
      active = false;
    };
  }, [reader, number]);
  return (
    <figure class="engine-figure">
      <figcaption>Pagina originale {number} · anteprima non modificabile</figcaption>
      {!ready && !error && <p role="status">Rendering della pagina…</p>}
      {error && <p role="alert">Anteprima non disponibile: {error} Apri il PDF nel browser.</p>}
      <canvas
        ref={canvas}
        hidden={!ready}
        role="img"
        data-testid="original-canvas"
        aria-label={`Pagina PDF originale ${number}`}
      />
    </figure>
  );
}

function FigurePreview({ reader, figure }: { reader: DocumentReader; figure: FigureBlock }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [error, setError] = useState('');
  return (
    <figure class="engine-figure" data-testid="engine-figure">
      <figcaption>
        Regione grafica · pagina {figure.page}
        {figure.placement === 'page-end' && ' · posizione incerta, riportata a fine pagina'}
      </figcaption>
      <button
        class="secondary-button"
        disabled={status === 'loading'}
        onClick={() => {
          if (status === 'ready') {
            setStatus('idle');
            return;
          }
          setStatus('loading');
          void reader
            .renderRegion(figure.page, figure.region, canvas.current!)
            .then(() => setStatus('ready'))
            .catch((cause) => {
              setError(cause instanceof Error ? cause.message : 'Ritaglio non disponibile.');
              setStatus('error');
            });
        }}
      >
        {status === 'loading'
          ? 'Rendering…'
          : status === 'ready'
            ? 'Nascondi figura'
            : 'Mostra figura'}
      </button>
      <canvas
        ref={canvas}
        hidden={status !== 'ready'}
        role="img"
        aria-label={`Ritaglio della figura da pagina ${figure.page}`}
      />
      {status === 'error' && <p role="alert">{error} Consulta l’originale.</p>}
    </figure>
  );
}
