import { useEffect, useRef, useState } from 'preact/hooks';
import type { FigureBlock, ReadingModel } from '../core/reading-model';
import type { DocumentReader } from '../pdf/document-reader';

export function EnginePanel({
  reader,
  originalUrl,
}: {
  reader: DocumentReader;
  originalUrl: string;
}) {
  const [model, setModel] = useState<ReadingModel>();
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<'running' | 'ready' | 'cancelled' | 'error'>('running');
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [original, setOriginal] = useState(false);
  const controller = useRef<AbortController>();
  useEffect(() => {
    const abort = new AbortController();
    controller.current = abort;
    setProgress(0);
    setModel(undefined);
    setStatus('running');
    void reader
      .extract(abort.signal, setProgress)
      .then((result) => {
        if (!abort.signal.aborted) {
          setModel(result);
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
  }, [reader, attempt]);
  const page = model?.pages[selected - 1];
  return (
    <section class="engine-panel" aria-labelledby="engine-title" data-testid="engine-panel">
      <div class="engine-header">
        <div>
          <p class="eyebrow">FASE 2 · MOTORE DI LETTURA</p>
          <h2 id="engine-title">{original ? 'Pagina originale' : 'Testo ricostruito'}</h2>
        </div>
        <p class="small-note">
          {reader.pageCount} {reader.pageCount === 1 ? 'pagina' : 'pagine'} · elaborazione locale in
          worker
        </p>
      </div>
      <p class="small-note">
        Anteprima tecnica di una pagina alla volta. La ricostruzione è euristica: controllala con
        l’originale. Lettura continua, preferenze e annotazioni arriveranno nelle prossime fasi.
      </p>
      <div role="status" aria-live="polite" data-testid="engine-status">
        {status === 'running' && (
          <p>
            Estrazione: {progress} di {reader.pageCount} pagine…
          </p>
        )}
        {status === 'cancelled' && (
          <p>Estrazione interrotta. Il PDF e il JSON non sono stati modificati.</p>
        )}
        {status === 'ready' && (
          <p>
            {model?.support === 'simple'
              ? 'Layout semplice rilevato.'
              : model?.support === 'partial'
                ? 'Documento parzialmente supportato.'
                : 'Documento non supportato per la lettura fluida.'}{' '}
            {model?.removedMarginalLines} righe marginali ripetute escluse.
          </p>
        )}
      </div>
      {status === 'error' && (
        <p role="alert" class="error-notice">
          Estrazione non riuscita: {error} Usa la vista Originale.
        </p>
      )}
      {status === 'running' ? (
        <button
          class="secondary-button"
          onClick={() => {
            controller.current?.abort();
            setStatus('cancelled');
          }}
        >
          Interrompi estrazione
        </button>
      ) : (
        status !== 'ready' && (
          <button class="secondary-button" onClick={() => setAttempt(attempt + 1)}>
            Riprova estrazione
          </button>
        )
      )}
      {model && page && (
        <>
          <div class="engine-toolbar">
            <label for="engine-page">Pagina da verificare</label>
            <input
              id="engine-page"
              data-testid="engine-page"
              type="number"
              min="1"
              max={reader.pageCount}
              value={selected}
              onInput={(event) => {
                const value = Number(event.currentTarget.value);
                if (Number.isSafeInteger(value) && value >= 1 && value <= reader.pageCount)
                  setSelected(value);
              }}
            />
            <button
              class="secondary-button"
              data-testid="engine-original"
              aria-pressed={original ? 'true' : 'false'}
              onClick={() => setOriginal(!original)}
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
          </div>
          {page.warnings.length > 0 && (
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
          <article
            class="engine-page"
            data-testid="engine-content"
            aria-label={`Anteprima pagina ${selected}`}
          >
            {original ? (
              <PageOriginal key={page.page} reader={reader} page={page} />
            ) : (
              page.blocks.map((block) =>
                block.kind === 'figure' ? (
                  <FigurePreview key={block.id} reader={reader} figure={block} />
                ) : block.kind === 'heading' ? (
                  <h3 key={block.id} data-block-id={block.id}>
                    {block.text}
                  </h3>
                ) : (
                  <p key={block.id} data-block-id={block.id}>
                    {block.text}
                  </p>
                ),
              )
            )}
            {!original && !page.text && (
              <p class="small-note">Nessun testo estraibile. Non viene eseguito OCR.</p>
            )}
          </article>
        </>
      )}
    </section>
  );
}

function PageOriginal({
  reader,
  page,
}: {
  reader: DocumentReader;
  page: ReadingModel['pages'][number];
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    void reader
      .renderRegion(
        page.page,
        { x: 0, y: 0, width: page.width, height: page.height },
        canvas.current!,
      )
      .then(() => {
        if (active) setReady(true);
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Rendering non disponibile.');
      });
    return () => {
      active = false;
    };
  }, [reader, page]);
  return (
    <figure class="engine-figure">
      <figcaption>Pagina originale {page.page} · anteprima non modificabile</figcaption>
      {!ready && !error && <p role="status">Rendering della pagina…</p>}
      {error && <p role="alert">Anteprima non disponibile: {error} Apri il PDF nel browser.</p>}
      <canvas
        ref={canvas}
        hidden={!ready}
        role="img"
        data-testid="original-canvas"
        aria-label={`Pagina PDF originale ${page.page}`}
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
