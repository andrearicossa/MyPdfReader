import { useEffect, useRef, useState } from 'preact/hooks';
import { serializeSpike, sidecarName } from '../core/file-spike';
import { FileSession, type FileState } from '../storage/file-session';
import {
  downloadData,
  inspectPdf,
  isCancelled,
  jsonOptions,
  pdfOptions,
  pickers,
  type LocalHandle,
} from '../storage/files';
import { workCache } from '../storage/cache';
import { ReaderWorkspace } from './ReaderWorkspace';
import type { DocumentReader } from '../pdf/document-reader';

export function FileWorkbench() {
  const [state, setState] = useState<FileState>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [lastPdf, setLastPdf] = useState<LocalHandle>();
  const [native, setNative] = useState(false);
  const session = useRef<FileSession>();
  const unsubscribe = useRef<() => void>();
  const pdfInput = useRef<HTMLInputElement>(null);
  const jsonInput = useRef<HTMLInputElement>(null);
  const [pdfUrl, setPdfUrl] = useState('');
  const pdfUrlRef = useRef('');
  const [reader, setReader] = useState<DocumentReader>();
  const readerRef = useRef<DocumentReader>();

  useEffect(() => {
    setNative(!!pickers().open && !!pickers().save);
    void workCache
      .read('$latest')
      .then((copy) => setLastPdf(copy?.pdfHandle))
      .catch(() => {});
    const protect = (event: BeforeUnloadEvent) => {
      const current = session.current?.state;
      if (current?.unexported || current?.cachePending || current?.status === 'saving') {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    const allowUpdate = (event: Event) => {
      const current = session.current?.state;
      if (current?.unexported || current?.cachePending || current?.status === 'saving') {
        event.preventDefault();
      }
    };
    window.addEventListener('beforeunload', protect);
    window.addEventListener('fluido:before-update', allowUpdate);
    return () => {
      unsubscribe.current?.();
      window.removeEventListener('beforeunload', protect);
      window.removeEventListener('fluido:before-update', allowUpdate);
      if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current);
      void readerRef.current?.close().catch(() => {});
    };
  }, []);

  const run = async (operation: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await operation();
    } catch (cause) {
      if (!isCancelled(cause)) {
        setError(cause instanceof Error ? cause.message : 'Operazione non riuscita.');
      }
    } finally {
      setBusy(false);
    }
  };

  const mayReplace = () =>
    !session.current?.state.unexported ||
    window.confirm('Ci sono modifiche non esportate. Vuoi sostituire la copia di lavoro corrente?');

  const openPdf = async (file: File, handle?: LocalHandle) => {
    const document = await inspectPdf(file);
    const { DocumentReader } = await import('../pdf/document-reader');
    // Validazione del parser prima di sostituire una sessione di lavoro.
    const opened = await DocumentReader.open(file);
    // Un file non valido non chiude né sostituisce la sessione corrente.
    await session.current?.close();
    unsubscribe.current?.();
    const next = new FileSession(document);
    session.current = next;
    unsubscribe.current = next.subscribe(setState);
    await next.restore(handle);
    if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current);
    pdfUrlRef.current = URL.createObjectURL(file);
    setPdfUrl(pdfUrlRef.current);
    setLastPdf(handle);
    void readerRef.current?.close().catch(() => {});
    readerRef.current = opened;
    setReader(opened);
  };

  const choosePdf = () => {
    if (!mayReplace()) return;
    const picker = pickers().open;
    if (!picker) {
      pdfInput.current?.click();
      return;
    }
    void run(async () => {
      const [handle] = await picker(pdfOptions);
      if (handle) await openPdf(await handle.getFile(), handle);
    });
  };

  const chooseJson = () => {
    if (!mayReplace()) return;
    const picker = pickers().open;
    if (!picker) {
      jsonInput.current?.click();
      return;
    }
    void run(async () => {
      const [handle] = await picker(jsonOptions);
      if (!handle) return;
      const permission = await handle.requestPermission({ mode: 'readwrite' });
      if (permission !== 'granted') {
        throw new Error('Permesso di scrittura negato: usa “Importa senza scrittura automatica”.');
      }
      await session.current?.import(await (await handle.getFile()).text(), handle);
    });
  };

  return (
    <section class="workbench" aria-labelledby="workbench-title">
      <div class="workbench-intro">
        <p class="eyebrow">FASE 3 · LETTURA FLUIDA</p>
        <h1 id="workbench-title">Il tuo PDF, i tuoi file</h1>
        <p class="intro-copy">
          Apri un PDF locale e leggilo con testo adattabile, figure e confronto con l’originale. Le
          preferenze restano su questo dispositivo. Il JSON separato è ancora una verifica tecnica
          di nota e pagina: evidenziazioni e salvataggio del punto di lettura arriveranno nelle
          prossime fasi.
        </p>
      </div>

      <div class="capability-notice" data-testid="status-capability">
        <strong>
          {native ? 'Scrittura diretta disponibile' : 'Modalità importazione e download'}
        </strong>
        <p>
          {native
            ? 'Dopo la tua autorizzazione possiamo aggiornare il JSON scelto. Il PDF resta in sola lettura.'
            : 'Questo browser non espone i selettori per la scrittura diretta. Devi scaricare il JSON aggiornato e selezionarlo di nuovo alla riapertura. La cache non equivale al file salvato.'}
        </p>
      </div>

      <div class="toolbar">
        <button
          class="primary-button"
          disabled={busy}
          onClick={choosePdf}
          data-testid="button-open-pdf"
        >
          {state ? 'Cambia PDF' : 'Apri PDF locale'}
        </button>
        {native && (
          <button
            class="secondary-button"
            disabled={busy}
            onClick={() => {
              if (mayReplace()) pdfInput.current?.click();
            }}
            data-testid="button-standard-picker"
          >
            Usa selettore standard
          </button>
        )}
        {!state && lastPdf && native && (
          <button
            class="secondary-button"
            disabled={busy}
            data-testid="button-reopen-pdf"
            onClick={() =>
              void run(async () => {
                // La richiesta segue direttamente il clic, prima dell'I/O.
                if ((await lastPdf.requestPermission({ mode: 'read' })) !== 'granted') {
                  throw new Error('Accesso negato. Seleziona nuovamente il PDF.');
                }
                await openPdf(await lastPdf.getFile(), lastPdf);
              })
            }
          >
            Riapri ultimo PDF
          </button>
        )}
      </div>

      {busy && (
        <p role="status" aria-live="polite">
          Operazione locale in corso…
        </p>
      )}
      <input
        ref={pdfInput}
        type="file"
        accept="application/pdf,.pdf"
        aria-label="PDF locale"
        data-testid="input-pdf"
        hidden
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          if (file) void run(() => openPdf(file));
        }}
      />
      <input
        ref={jsonInput}
        type="file"
        accept="application/json,.json"
        aria-label="File JSON associato"
        data-testid="input-json"
        hidden
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          if (file) void run(async () => session.current?.import(await file.text()));
        }}
      />

      {error && (
        <p role="alert" class="error-notice" data-testid="status-error">
          {error}
        </p>
      )}
      {reader && <ReaderWorkspace key={pdfUrl} reader={reader} originalUrl={pdfUrl} />}
      {state ? (
        <div class="workspace-grid">
          <div class="document-panel">
            <h2>Documento aperto</h2>
            <p class="document-name" data-testid="text-pdf-name">
              {state.data.document.fileName}
            </p>
            <dl class="document-details">
              <dt>Dimensione</dt>
              <dd>{state.data.document.size.toLocaleString('it-IT')} byte</dd>
              <dt>Identità SHA-256</dt>
              <dd class="hash" data-testid="text-pdf-hash">
                {state.data.document.sha256}
              </dd>
              <dt>File associato</dt>
              <dd>{state.fileName ?? 'Non collegato'}</dd>
            </dl>
            <a
              class="text-link"
              href={pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="link-original-pdf"
            >
              Apri originale nel visualizzatore del browser
            </a>
            <p class="small-note">
              Nessun file viene inviato a un server. Il PDF non viene scritto.
            </p>
            <hr />
            <h2>File dati separato</h2>
            <div class="file-actions">
              {native && (
                <button
                  class="secondary-button"
                  disabled={busy}
                  data-testid="button-create-json"
                  onClick={() =>
                    void run(async () => {
                      const handle = await pickers().save!({
                        ...jsonOptions,
                        suggestedName: sidecarName(state.data.document.fileName),
                      });
                      await session.current?.create(handle);
                    })
                  }
                >
                  Crea e collega JSON
                </button>
              )}
              <button
                class="secondary-button"
                disabled={busy}
                onClick={chooseJson}
                data-testid="button-import-json"
              >
                {native ? 'Collega JSON esistente' : 'Importa JSON'}
              </button>
              {native && (
                <button
                  class="secondary-button"
                  disabled={busy}
                  data-testid="button-import-manual"
                  onClick={() => {
                    if (mayReplace()) jsonInput.current?.click();
                  }}
                >
                  Importa senza scrittura automatica
                </button>
              )}
              {state.canReconnect && native && (
                <button
                  class="secondary-button"
                  disabled={busy}
                  data-testid="button-reconnect"
                  onClick={() => void run(async () => session.current?.reconnect())}
                >
                  Ricollega / autorizza scrittura
                </button>
              )}
              <button
                class="primary-button"
                disabled={busy}
                data-testid="button-download-json"
                onClick={() =>
                  void run(async () => {
                    await session.current?.flush();
                    const current = session.current!;
                    const data = current.state.data;
                    downloadData(serializeSpike(data), sidecarName(data.document.fileName));
                    await current.exported(data.revision);
                  })
                }
              >
                Scarica JSON aggiornato
              </button>
            </div>
            <p class="small-note">
              Per trasferire i dati copia PDF e JSON insieme. Nessuna sincronizzazione automatica.
            </p>
          </div>
          <div class="notes-panel">
            <h2>Prova di scrittura e ripristino</h2>
            <p class="small-note">
              Formato sperimentale <code>fluido/file-spike v1</code>, non ancora il formato
              annotazioni definitivo. La pagina è un valore di prova, non naviga nel PDF.
            </p>
            <label class="field-label" for="draft-note">
              Nota di prova
            </label>
            <textarea
              id="draft-note"
              data-testid="input-note"
              disabled={busy}
              maxLength={100_000}
              rows={7}
              value={state.data.draftNote}
              placeholder="Scrivi qui, poi riapri lo stesso PDF e il suo JSON."
              onInput={(event) =>
                session.current?.update(event.currentTarget.value, state.data.position.page)
              }
            />
            <label class="field-label" for="draft-page">
              Pagina di prova
            </label>
            <input
              id="draft-page"
              type="number"
              data-testid="input-page"
              min="1"
              max="1000000"
              step="1"
              disabled={busy}
              value={state.data.position.page}
              onInput={(event) => {
                const page = Number(event.currentTarget.value);
                if (Number.isSafeInteger(page) && page >= 1 && page <= 1_000_000) {
                  session.current?.update(state.data.draftNote, page);
                }
              }}
            />
            <div
              role="status"
              aria-live="polite"
              class={`save-state state-${state.status}`}
              data-testid="status-persistence"
            >
              <strong>{state.mode === 'automatic' ? 'File collegato' : 'Download manuale'}</strong>
              <p>{state.message}</p>
              <p class="cache-note">{state.cacheMessage}</p>
            </div>
            <p class="small-note">
              Le scritture partono dopo 700 ms senza modifiche. Se il browser è chiuso prima della
              conferma, gli ultimi cambiamenti possono andare persi.
            </p>
          </div>
        </div>
      ) : (
        <div class="start-instructions">
          <h2>Come eseguire la prova</h2>
          <ol>
            <li>Apri un PDF locale con un layout semplice, a colonna singola.</li>
            <li>
              Controlla il testo ricostruito, mostra le figure e confronta la pagina originale.
            </li>
            <li>Per la prova di persistenza, crea o importa un JSON separato.</li>
            <li>Modifica la nota e la pagina di prova.</li>
            <li>Attendi la conferma di scrittura, oppure scarica il JSON aggiornato.</li>
            <li>Ricarica l’app e seleziona gli stessi file per controllare il ripristino.</li>
          </ol>
          <p class="small-note">
            Puoi usare il selettore standard anche se i permessi del browser impediscono quello
            diretto.
          </p>
        </div>
      )}
    </section>
  );
}
