# Piano di implementazione – Lettore PDF in modalità fluida (MVP)

Stato: **Fasi 0 e 1 autorizzate; gate dispositivi reali aperto** · Data: 19/10/2026
Riferimenti: `analisi_tecnica_lettore_pdf.md` (con AC-01…AC-32 e RF-01…RF-10), `decisioni_analisi_tecnica_lettore_pdf.md`
Assunzioni approvate: D7 preferenze **globali per dispositivo**; D8 licenza **MIT**. Tutte le decisioni aperte sono chiuse.

## 1. Stack tecnico

| Area             | Scelta                                                        | Motivo                                                       |
| ---------------- | ------------------------------------------------------------- | ------------------------------------------------------------ |
| Linguaggio       | TypeScript (strict)                                           | Tipi condivisi tra motore e UI, schema del file verificabile |
| Build            | Vite + `vite-plugin-pwa` (Workbox)                            | Output statico, service worker e manifest generati           |
| UI               | Preact + CSS                                                  | Bundle leggero; scelta definitiva, nessun framework pesante  |
| PDF              | `pdfjs-dist` (Apache-2.0), worker separato                    | Rendering pagine, estrazione testo e immagini                |
| Stato locale     | IndexedDB (`idb`)                                             | Cache delle annotazioni e preferenze globali                 |
| Validazione file | JSON Schema + `ajv` (o `zod`)                                 | Import sicuro del file associato                             |
| Test             | Vitest (unità), Playwright (E2E su Chromium, WebKit, Firefox) | Copertura dei criteri di accettazione                        |
| CI/CD            | GitHub Actions → Azure Static Web Apps (Free)                 | Deploy automatico, ambienti di anteprima per le PR           |

## 2. Struttura del repository

```
/src
  /core        # motore puro, senza DOM né API file
    pdf/         caricamento, estrazione testo, immagini
    reflow/      ricostruzione paragrafi → modello documento
    anchors/     ancoraggio annotazioni (pagina + offset + citazione testuale)
    sidecar/     schema, serializzazione, migrazioni versione
  /storage     # adattatori: FileSystemAccess, Download/Import, IndexedDB
  /ui          # viste: Libreria, Lettura fluida, Originale, Note, Impostazioni
  /pwa         # manifest, service worker, icone
/tests         unit, e2e, corpus PDF
/docs          analisi, decisioni, ADR
staticwebapp.config.json
LICENSE (MIT)
```

Regola: `core` non importa nulla da `storage` o `ui`; è il nucleo riutilizzabile in futuro con Tauri o connettori Drive/OneDrive.

## 3. Formato del file associato (v1)

File `<nomepdf>.annotations.json`, unico per documento:

```json
{
  "schema": "pdf-fluid-reader/annotations",
  "version": 1,
  "document": {
    "fingerprint": "<pdf.js fingerprint>",
    "sha256": "...",
    "fileName": "libro.pdf",
    "pageCount": 312
  },
  "position": { "page": 42, "offset": 1834, "quote": "testo di contesto…", "updatedAt": "..." },
  "annotations": [
    {
      "id": "uuid",
      "type": "highlight|note",
      "color": "yellow",
      "anchor": {
        "page": 42,
        "start": 1800,
        "end": 1870,
        "quote": "…",
        "prefix": "…",
        "suffix": "…"
      },
      "note": "testo opzionale",
      "createdAt": "...",
      "updatedAt": "..."
    }
  ],
  "updatedAt": "..."
}
```

- Ancoraggio indipendente da font e schermo: pagina PDF + offset nel testo estratto + citazione con contesto per il riallineamento.
- Il PDF non viene mai modificato.
- Le preferenze di lettura **non** sono nel file (restano globali nel dispositivo).

## 4. Fasi e attività

### Fase 0 – Fondamenta (≈ 1 settimana)

- Repository, licenza MIT, README, linting, Prettier, TypeScript strict.
- Pipeline CI: build, test, deploy su Azure SWA con anteprime per PR.
- Shell PWA installabile (manifest, service worker, funzionamento offline della shell).
- **Uscita**: app vuota installabile da URL Azure su desktop, Android e iOS.

**Stato: completata localmente e pubblicata su Azure; gate installazione dispositivi aperto.** Progetto "Fluido" in
`pdf-fluid-reader/`: lint, tipi, 5 test unitari e 3 test E2E (incluso offline) verdi; build con
43 KiB di precache; `npm audit` pulito; licenze dipendenze verificate (MIT/Apache-2.0,
compatibili con MIT). Repository GitHub e risorsa Azure sono collegati e il deploy è
stato verificato. Resta da verificare l'installazione della PWA sui dispositivi reali.
La Fase 1 è stata successivamente autorizzata dall'utente.

### Fase 1 – Spike tecnico sul ciclo del file (≈ 1 settimana) – gate

Verifica sulle piattaforme reali di: apertura PDF, creazione/selezione del file associato, scrittura automatica, riapertura con permessi.

**Stato: spike implementato e verificato automaticamente (19/10/2026); gate manuale aperto.**
Nota/pagina sperimentali, SHA-256, handle e cache in IndexedDB, scrittura dopo 700 ms,
ricollegamento esplicito, fallback import/download, errori e conflitti.
30 test unitari e 25 casi browser passati su Chromium/Firefox/WebKit; 2 skip intenzionali.
Il test di handle/stream reali usa OPFS e picker sostituiti, non file esterni del dispositivo.
Matrice e checklist: [ADR-001](ADR-001-ciclo-file-pwa.md). Non equivale all'approvazione
del gate su desktop/Android/iOS reali. Il formato `fluido/file-spike v1` non è lo schema MVP.

- Chromium desktop: `showOpenFilePicker` / `showSaveFilePicker`, handle salvati in IndexedDB, richiesta permesso alla riapertura.
- Android, iOS, Firefox, Safari: fallback import + download.
- **Uscita**: matrice di supporto documentata (ADR-001). Se emergono blocchi, si rivede la decisione D2.

### Fase 2 – Motore di lettura (≈ 2–3 settimane)

- Caricamento PDF in worker, estrazione testo per pagina.
- Ricostruzione: righe → paragrafi, unione parole sillabate, rimozione intestazioni/piè di pagina ripetuti, titoli per dimensione font.
- Rilevamento PDF non supportati (solo immagini, multi-colonna) con avviso e rimando alla vista Originale.
- Estrazione figure come regioni di pagina renderizzate su richiesta.
- **Uscita**: modello documento testato sul corpus semplice.

### Fase 3 – Vista di lettura (≈ 2 settimane)

- Scorrimento continuo con marcatori di pagina e navigazione per pagina.
- Rendering progressivo/virtualizzato per documenti lunghi.
- Font, dimensione, interlinea, margini, tema chiaro/scuro/seppia (preferenze globali in IndexedDB).
- Figure nel flusso del testo con zoom (pinch e doppio tocco su mobile).
- Vista Originale della pagina PDF, sincronizzata con la posizione.
- Layout responsive: telefono, tablet, desktop.

### Fase 4 – Annotazioni (≈ 2 settimane)

- Selezione testo → evidenziazione (colori), nota a margine (desktop) o in pannello (mobile).
- Elenco note con salto al passaggio, modifica ed eliminazione.
- Ancoraggio e riallineamento dopo cambio font o dispositivo.
- Salvataggio automatico del punto di lettura.

### Fase 5 – Persistenza (≈ 1–2 settimane)

- Cache in IndexedDB sempre aggiornata (debounce ≤ 2 s dall'ultima modifica).
- Adattatore File System Access: scrittura automatica nel file associato.
- Adattatore di ripiego: indicatore "modifiche non esportate", download del file, import con verifica fingerprint.
- Gestione conflitti semplice: all'apertura confronto `updatedAt` cache/file e scelta esplicita dell'utente.
- Validazione schema e migrazioni versione.

### Fase 6 – Stabilizzazione e rilascio MVP (≈ 1 settimana)

- Esecuzione completa dei criteri di accettazione sul corpus.
- Accessibilità di base (tastiera, contrasto, etichette).
- Misure prestazionali informative (apertura, ricostruzione, memoria) per fissare le soglie future (D6).
- Tag `v0.1.0`, note di rilascio, guida utente breve.

Stima totale indicativa: **10–13 settimane** a una persona part-time equivalente; da ricalibrare dopo la Fase 1.

## 5. Tracciabilità verso i criteri di accettazione

| Area dei criteri (analisi)                                      | Fase      | Verifica                                                      |
| --------------------------------------------------------------- | --------- | ------------------------------------------------------------- |
| Apertura file locale, PDF invariato                             | 1, 2      | E2E + confronto hash del PDF                                  |
| Testo fluido, font regolabile                                   | 2, 3      | Unità su ricostruzione + E2E                                  |
| Scorrimento continuo e riferimenti di pagina                    | 3         | E2E                                                           |
| Figure e zoom                                                   | 2, 3      | E2E su corpus con figure                                      |
| Evidenziazioni e note                                           | 4         | Unità ancoraggio + E2E                                        |
| Ripristino del punto di lettura                                 | 4, 5      | E2E riapertura                                                |
| File unico separato, portabilità                                | 5         | E2E: esporta → altro browser → importa → note al posto giusto |
| Salvataggio automatico / ripiego con avviso                     | 1, 5      | E2E per piattaforma                                           |
| Persistenza entro 2 s                                           | 5         | Test temporizzato                                             |
| Codice e build disponibili, licenza MIT e dipendenze verificate | Fase 0, 6 | Checklist licenze (AC-32)                                     |
| Desktop, tablet, telefono                                       | 3, 6      | Playwright viewport + prova manuale su dispositivi            |

Ogni test riporta nel nome l'identificativo del criterio dell'analisi, da AC-01 a AC-32.

## 6. Corpus di test

- 5–10 PDF semplici a colonna singola (romanzo, saggio, manuale), alcuni con figure.
- 3 PDF fuori perimetro (scansione, due colonne, tabelle) per verificare gli avvisi.
- Solo documenti con licenza libera nel repository.

## 7. Rischi principali

| Rischio                                            | Mitigazione                                                                |
| -------------------------------------------------- | -------------------------------------------------------------------------- |
| Scrittura automatica non disponibile su mobile/iOS | Ripiego dichiarato (D2), indicatore visibile, valutare Tauri in futuro     |
| Ricostruzione del testo imprecisa                  | Perimetro limitato a layout semplici, vista Originale sempre disponibile   |
| Ancoraggi persi su altro dispositivo               | Citazione con contesto + fingerprint del PDF; test di portabilità dedicato |
| PDF grandi lenti su telefono                       | Elaborazione per pagine in worker, rendering virtualizzato                 |
| Pulizia dati del browser (iOS)                     | Avviso di esportare; richiesta `navigator.storage.persist()`               |

## 8. Fuori dall'MVP

OCR, multi-colonna, Google Drive e OneDrive, sincronizzazione, app Tauri, preferenze per documento.

## 9. Approvazione

L'analisi tecnica è approvata: tutte le decisioni aperte (D1–D9) sono chiuse. Per il piano resta solo l'approvazione esplicita qui di seguito.

- [ ] Approvato senza modifiche.
- [ ] Approvato con modifiche da recepire.
- [ ] Da rivedere.
