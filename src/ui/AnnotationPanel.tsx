import { useEffect, useRef, useState } from 'preact/hooks';
import { colors, colorNames, serializeAnnotations, type HighlightColor } from '../core/annotations';
import { sidecarName } from '../core/file-spike';
import { downloadData, isCancelled, jsonOptions, pickers } from '../storage/files';
import { useAnnotations } from './annotations';

export function AnnotationSelection() {
  const a = useAnnotations();
  const [color, setColor] = useState<HighlightColor>('yellow');
  return (
    <div
      class="annotation-selection"
      hidden={!a.selection && !a.selectionError}
      data-annotation-ui
      data-testid="annotation-selection"
    >
      <p class="small-note">
        {a.selection
          ? `${a.selection.quote.length} caratteri selezionati · pagina ${a.selection.page}`
          : 'Seleziona un passaggio per evidenziarlo o annotarlo.'}
      </p>
      {a.selectionError && <p role="alert">{a.selectionError}</p>}
      <div class="annotation-actions">
        <div class="selection-colors" role="group" aria-label="Colore nuova evidenziazione">
          {colors.map((c) => (
            <button
              key={c}
              type="button"
              class={`selection-color swatch-${c}`}
              aria-label={`Colore: ${colorNames[c]}`}
              title={colorNames[c]}
              aria-pressed={color === c ? 'true' : 'false'}
              disabled={a.ioBusy}
              onClick={() => setColor(c)}
            >
              <span />
            </button>
          ))}
        </div>
        <button
          class="secondary-button"
          disabled={!a.selection || a.ioBusy}
          onClick={() => a.add(color)}
        >
          Evidenzia
        </button>
        <button
          class="primary-button"
          disabled={!a.selection || a.ioBusy}
          onClick={() => a.add(color, true)}
        >
          Aggiungi nota
        </button>
        {a.selection && (
          <button
            class="text-link"
            onClick={() => {
              a.setSelection(undefined);
              a.setSelectionError('');
              window.getSelection()?.removeAllRanges();
            }}
          >
            Annulla selezione
          </button>
        )}
      </div>
    </div>
  );
}
export function AnnotationPanel({
  files = false,
  open = true,
  onClose,
  onNavigate,
}: {
  files?: boolean;
  open?: boolean;
  onClose?(): void;
  onNavigate?(): void;
}) {
  const a = useAnnotations();
  const [confirmDelete, setConfirmDelete] = useState<string>();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null),
    editor = useRef<HTMLTextAreaElement>(null);
  const selected = a.data.annotations.find((n) => n.id === a.selectedId);
  useEffect(() => {
    if (selected && !files && open) {
      const frame = requestAnimationFrame(() => editor.current?.focus());
      return () => cancelAnimationFrame(frame);
    }
  }, [a.selectedId, files, open]);
  const run = async (fn: () => Promise<void>) => {
    a.setIoBusy(true);
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      if (!isCancelled(e))
        setError(e instanceof Error ? e.message : 'Operazione annotazioni non riuscita.');
    } finally {
      a.setIoBusy(false);
      setBusy(false);
    }
  };
  const mayImport = () =>
    !a.session.state.unexported ||
    window.confirm(
      'Il JSON importato sostituirà annotazioni e posizione correnti. Conserva prima una copia. Continuare?',
    );
  const importFile = () => {
    if (!mayImport()) return;
    const picker = pickers().open;
    if (!picker) {
      input.current?.click();
      return;
    }
    void run(async () => {
      const [handle] = await picker(jsonOptions);
      if (!handle) return;
      if ((await handle.requestPermission({ mode: 'readwrite' })) !== 'granted')
        throw new Error('Permesso negato: usa “Importa annotazioni senza scrittura”.');
      await a.session.import(await (await handle.getFile()).text(), handle);
      a.imported();
    });
  };
  return (
    <aside
      class={files ? 'annotation-file-pane' : 'annotations-panel'}
      aria-label={files ? 'File delle annotazioni' : 'Annotazioni del documento'}
      data-annotation-ui
      data-testid={files ? 'annotation-file-pane' : 'annotations-panel'}
      hidden={!open}
    >
      {!files && (
        <>
          <div class="reader-panel-heading">
            <div>
              <h2>
                Annotazioni <span class="note-count">{a.data.annotations.length}</span>
              </h2>
              <p class="cache-note">I passaggi che vuoi ritrovare.</p>
            </div>
            <button
              type="button"
              class="reader-icon"
              aria-label="Chiudi annotazioni"
              onClick={onClose}
            >
              ×
            </button>
          </div>
          <div class="annotations-content" inert={a.ioBusy}>
            {selected && (
              <section class="annotation-editor" data-testid="annotation-editor">
                <h3>Modifica nota · pagina {selected.anchor.page}</h3>
                <blockquote>{selected.anchor.quote}</blockquote>
                <label for="annotation-note">Testo della nota</label>
                <textarea
                  ref={editor}
                  id="annotation-note"
                  data-testid="annotation-note"
                  maxLength={100_000}
                  rows={5}
                  value={selected.note}
                  onInput={(e) => a.edit(selected.id, { note: e.currentTarget.value })}
                />
                <label>
                  Colore della nota
                  <select
                    aria-label="Colore della nota"
                    value={selected.color}
                    onChange={(e) =>
                      a.edit(selected.id, { color: e.currentTarget.value as HighlightColor })
                    }
                  >
                    {colors.map((c) => (
                      <option key={c} value={c}>
                        {colorNames[c]}
                      </option>
                    ))}
                  </select>
                </label>
                <p class="small-note">
                  Modifiche automatiche nella copia locale. Controlla lo stato JSON nella barra.
                </p>
                <button class="secondary-button" onClick={() => a.select(undefined)}>
                  Chiudi nota
                </button>
              </section>
            )}
            {!a.data.annotations.length && (
              <p class="small-note">Nessuna annotazione. Il PDF originale resta invariato.</p>
            )}
            <ol class="annotation-list">
              {a.data.annotations.map((n) => (
                <li
                  key={n.id}
                  class={`annotation-card highlight-border-${n.color}`}
                  data-testid="annotation-card"
                  data-note-id={n.id}
                >
                  <p class="annotation-meta">
                    Pagina {n.anchor.page} · {colorNames[n.color]}
                  </p>
                  <blockquote>{n.anchor.quote}</blockquote>
                  {n.note && <p class="annotation-body">{n.note}</p>}
                  {(a.statuses[n.id] === 'missing' || a.statuses[n.id] === 'ambiguous') && (
                    <p class="anchor-warning" role="status">
                      Ancora {a.statuses[n.id] === 'ambiguous' ? 'ambigua' : 'non trovata'}:
                      evidenziazione non applicata. Verifica la pagina originale.
                    </p>
                  )}
                  {!a.statuses[n.id] && (
                    <p class="small-note">Ancora da verificare quando si apre la pagina.</p>
                  )}
                  {a.statuses[n.id] === 'relocated' && (
                    <p class="small-note">Passaggio riallineato tramite citazione e contesto.</p>
                  )}
                  <div class="annotation-actions">
                    <button
                      class="text-link"
                      onClick={() => {
                        a.go({ page: n.anchor.page, offset: n.anchor.start }, n.id);
                        a.select(undefined);
                        onNavigate?.();
                      }}
                    >
                      Vai al passaggio
                    </button>
                    <button class="text-link" onClick={() => a.select(n.id)}>
                      Modifica
                    </button>
                    <button class="text-link" onClick={() => setConfirmDelete(n.id)}>
                      Elimina
                    </button>
                  </div>
                  {confirmDelete === n.id && (
                    <div class="delete-confirm" role="group" aria-label="Conferma eliminazione">
                      <p>Eliminare questa annotazione dal prossimo JSON salvato?</p>
                      <button
                        class="secondary-button"
                        onClick={() => {
                          a.remove(n.id);
                          setConfirmDelete(undefined);
                        }}
                      >
                        Conferma eliminazione
                      </button>
                      <button class="text-link" onClick={() => setConfirmDelete(undefined)}>
                        Mantieni
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ol>
          </div>
          <div class="notes-footer">
            <span>PDF originale invariato</span>
            <span class="state-dot" />
          </div>
        </>
      )}
      {files && (
        <section class="annotation-files">
          <h3>Conserva annotazioni e posizione</h3>
          <p class="small-note">
            Un solo JSON separato dal PDF. Le preferenze di lettura restano su questo dispositivo.
          </p>
          <div class="annotation-actions">
            {pickers().save && (
              <button
                class="secondary-button"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const handle = await pickers().save!({
                      ...jsonOptions,
                      suggestedName: sidecarName(a.data.document.fileName),
                    });
                    await a.session.create(handle);
                  })
                }
              >
                Crea file annotazioni
              </button>
            )}
            <button class="secondary-button" disabled={busy} onClick={importFile}>
              {pickers().open ? 'Collega file annotazioni' : 'Importa annotazioni'}
            </button>
            {pickers().open && (
              <button
                class="secondary-button"
                disabled={busy}
                onClick={() => {
                  if (mayImport()) input.current?.click();
                }}
              >
                Importa annotazioni senza scrittura
              </button>
            )}
            {a.state.canReconnect && pickers().open && (
              <button
                class="secondary-button"
                disabled={busy}
                onClick={() => void run(() => a.session.reconnect())}
              >
                Ricollega annotazioni
              </button>
            )}
            <button
              class="primary-button"
              disabled={busy}
              data-testid="download-annotations"
              onClick={() =>
                void run(async () => {
                  const d = a.session.state.data;
                  downloadData(serializeAnnotations(d), sidecarName(d.document.fileName));
                  await a.session.exported(d.revision);
                })
              }
            >
              Scarica annotazioni
            </button>
          </div>
          <input
            ref={input}
            hidden
            type="file"
            accept=".json,application/json"
            data-testid="input-annotations"
            aria-label="Importa JSON annotazioni"
            onChange={(e) => {
              const file = e.currentTarget.files?.[0];
              e.currentTarget.value = '';
              if (file)
                void run(async () => {
                  await a.session.import(await file.text());
                  a.imported();
                });
            }}
          />
          {error && (
            <p class="error-notice" role="alert" data-testid="annotations-error">
              {error}
            </p>
          )}
          {a.state.conflict && (
            <section
              class="delete-confirm"
              aria-label="Risoluzione conflitto"
              data-testid="persistence-conflict"
            >
              <h3>
                {a.state.conflict.source === 'cache'
                  ? 'Due copie nel browser'
                  : 'Due versioni del JSON'}
              </h3>
              <p class="small-note">
                Nessuna unione automatica. Conserva entrambe le copie prima di scegliere. Le date
                sono informative, non decidono quale versione vince.
              </p>
              <p class="small-note">
                Locale: revisione {a.data.revision} · {a.data.updatedAt ?? 'data non disponibile'}.{' '}
                Esterna: revisione {a.state.conflict.externalRevision ?? '?'} ·{' '}
                {a.state.conflict.externalUpdatedAt ?? 'data non disponibile'}.
              </p>
              {!a.state.conflict.canUseExternal && (
                <p class="error-notice" role="alert">
                  La copia esterna non è valida o usa uno schema non supportato. Non sarà
                  sovrascritta: scarica la copia locale in un nuovo file.
                </p>
              )}
              <div class="annotation-actions">
                <button
                  class="secondary-button"
                  disabled={busy || a.session.conflictExport() === undefined}
                  data-testid="download-conflict-external"
                  onClick={() => {
                    const text = a.session.conflictExport();
                    if (text !== undefined)
                      downloadData(text, `${sidecarName(a.data.document.fileName)}.external.json`);
                  }}
                >
                  Scarica copia esterna rilevata
                </button>
                <button
                  class="secondary-button"
                  disabled={busy || !a.state.conflict.canUseExternal}
                  data-testid="resolve-conflict-external"
                  onClick={() => {
                    if (
                      !window.confirm(
                        'La copia esterna sostituirà annotazioni e posizione locali. Hai conservato la copia locale?',
                      )
                    )
                      return;
                    void run(async () => {
                      await a.session.resolveConflict('external');
                      a.imported();
                    });
                  }}
                >
                  Usa copia esterna
                </button>
                <button
                  class="secondary-button"
                  disabled={busy || !a.state.conflict.canUseExternal}
                  data-testid="resolve-conflict-local"
                  onClick={() => {
                    if (
                      !window.confirm(
                        'La copia locale sostituirà quella esterna indicata. Hai conservato entrambe le copie?',
                      )
                    )
                      return;
                    void run(async () => {
                      await a.session.resolveConflict('local');
                      a.imported();
                    });
                  }}
                >
                  Mantieni copia locale
                </button>
              </div>
            </section>
          )}
          <div
            class={`save-state state-${a.state.status}`}
            role="status"
            data-testid="annotation-save-status"
          >
            <strong>{a.state.mode === 'automatic' ? 'File collegato' : 'Download manuale'}</strong>
            <p>{a.state.message}</p>
            <p class="cache-note">{a.state.cacheMessage}</p>
            <p class="cache-note" data-testid="annotation-unsaved">
              {a.state.unexported
                ? 'Modifiche non esportate.'
                : 'Nessuna nuova modifica da esportare; verifica il file conservato.'}
            </p>
          </div>
          <p class="small-note">
            Cache e scrittura partono dopo 700 ms senza modifiche. La cache del browser non
            sostituisce il file: verifica il download prima di cambiare dispositivo.
          </p>
        </section>
      )}
    </aside>
  );
}
