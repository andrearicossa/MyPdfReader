# Piano di implementazione – Lettore PDF in modalità fluida (MVP)

Stato: **Fasi 0–4 autorizzate; gate dispositivi reali aperto** · Aggiornamento: 21/10/2026
Riferimenti: `analisi_tecnica_lettore_pdf.md` (con AC-01…AC-32 e RF-01…RF-10), `decisioni_analisi_tecnica_lettore_pdf.md`
Assunzioni approvate: D7 preferenze **globali per dispositivo**; D8 licenza **MIT**. Tutte le decisioni aperte sono chiuse.

## 1. Stack tecnico

| Area             | Scelta                                                        | Motivo                                                       |
| ---------------- | ------------------------------------------------------------- | ------------------------------------------------------------ |
| Linguaggio       | TypeScript (strict)                                           | Tipi condivisi tra motore e UI, schema del file verificabile |
| Build            | Vite + `vite-plugin-pwa` (Workbox)                            | Output statico, service worker e manifest generati           |
| UI               | Preact + CSS                                                  | Bundle leggero; scelta definitiva, nessun framework pesante  |
| PDF              | `pdfjs-dist` (Apache-2.0), worker separato                    | Rendering pagine, estrazione testo e immagini                |
| Stato locale     | IndexedDB (API native, nessuna libreria aggiuntiva)           | Cache locale e preferenze globali indipendenti               |
| Validazione file | Validatore runtime TypeScript, senza dipendenze aggiuntive    | Import sicuro e limiti espliciti; decisione ADR-005          |
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

File `<nomepdf>.annotations.json`, unico per documento. Schema implementato nella
Fase 4 ([ADR-005](ADR-005-annotazioni.md)); sostituisce la bozza iniziale del piano,
non il file sperimentale della Fase 1:

```json
{
  "schema": "fluido/annotations",
  "version": 1,
  "normalization": "fluido-text/2",
  "document": {
    "sha256": "...",
    "fileName": "libro.pdf",
    "size": 123456
  },
  "revision": 12,
  "draftNote": "",
  "position": { "page": 42, "offset": 1834 },
  "annotations": [
    {
      "id": "uuid",
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
  ]
}
```

- Ancoraggio indipendente da font e schermo: pagina PDF + offset nel testo estratto + citazione con contesto per il riallineamento.
- Il PDF non viene mai modificato.
- Le preferenze di lettura **non** sono nel file (restano globali nel dispositivo).
- La posizione può avere `anchor` con citazione e contesto oppure `figure` e
  `fraction` relativi alla figura. Non usa pixel. `draftNote` è uno slot interno
  vuoto dell'adattatore, non una nota globale distinta.
- `revision` gestisce le scritture della copia di lavoro; la strategia definitiva
  di migrazione e recupero dei conflitti rimane una verifica della Fase 5.

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

Implementata su richiesta dell'utente, senza attestare la chiusura delle prove
manuali della Fase 1. Motore PDF.js, modello puro e anteprima diagnostica per pagina,
con ritagli e confronto Originale. Non è ancora la vista di lettura della Fase 3.
Decisioni e limiti: [ADR-002](ADR-002-motore-pdf.md); verifiche:
[QA Fase 2](qa-fase2.md). Validazione qualitativa su PDF reali ancora aperta.
Estensione autorizzata il 20/10/2026: estrazione della sola pagina richiesta,
cache LRU di 8 pagine, box testuali semplici e citazioni con attribuzione.
[ADR-003](ADR-003-pagine-box-citazioni.md) precisa euristiche e limiti; il PDF
originale della pagina 35 non è disponibile, quindi quella prova resta aperta.
Verifica automatica locale: 62 test unitari, 58 casi browser passati sui tre motori
e 2 skip intenzionali OPFS fuori da Chromium.

- Caricamento PDF in worker, estrazione testo per pagina.
- Ricostruzione: righe → paragrafi, unione parole sillabate, rimozione intestazioni/piè di pagina ripetuti, titoli per dimensione font.
- Rilevamento PDF non supportati (solo immagini, multi-colonna) con avviso e rimando alla vista Originale.
- Estrazione figure come regioni di pagina renderizzate su richiesta.
- **Uscita**: modello documento testato sul corpus semplice.

### Fase 3 – Vista di lettura (≈ 2 settimane)

Implementazione `0.2.0-reader.1`: [ADR-004](ADR-004-lettura-fluida.md) e
[QA Fase 3](qa-fase3.md). Finestra progressiva di cinque pagine, non scrollbar
virtuale dell'intero PDF; preferenze globali in un database nuovo senza migrare
i dati esistenti. Posizione conservata in memoria durante la lettura e il
confronto Originale, non ancora salvata nel file. Le durate restano stime per
sviluppo umano, non tempi di esecuzione automatica.

- Scorrimento continuo con marcatori di pagina e navigazione per pagina.
- Rendering progressivo/virtualizzato per documenti lunghi.
- Font, dimensione, interlinea, margini, tema chiaro/scuro/seppia (preferenze globali in IndexedDB).
- Figure nel flusso del testo con zoom (pinch e doppio tocco su mobile).
- Vista Originale della pagina PDF, sincronizzata con la posizione.
- Layout responsive: telefono, tablet, desktop.

### Fase 4 – Annotazioni (≈ 2 settimane)

Implementazione `0.3.0-annotations.1`: [ADR-005](ADR-005-annotazioni.md) e
[QA Fase 4](qa-fase4.md). Selezione nel testo, box, citazioni e attribuzioni;
quattro colori, sovrapposizioni, note modificabili e cancellazione confermata.
La posizione è ora persistente nel JSON delle annotazioni e nella sua cache,
non soltanto in memoria. Il confronto Originale conserva la pagina; non il suo
zoom o scorrimento interno. La vecchia prova file rimane separata.
Le stime in settimane si riferiscono allo sviluppo umano.

- Selezione testo → evidenziazione (colori), nota a margine (desktop) o in pannello (mobile).
- Elenco note con salto al passaggio, modifica ed eliminazione.
- Ancoraggio e riallineamento dopo cambio font o dispositivo.
- Salvataggio automatico del punto di lettura.

### Fase 5 – Persistenza (≈ 1–2 settimane)

Da finalizzare. La Fase 4 riutilizza già cache, scrittura diretta, ripiego,
controllo del PDF e blocco dei conflitti dell'adattatore della Fase 1, con debounce
700 ms. Questo non chiude la strategia definitiva di migrazione o recupero,
le prove temporali di sistema né il gate dei file esterni su dispositivi reali.

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

| Rischio                                            | Mitigazione                                                                 |
| -------------------------------------------------- | --------------------------------------------------------------------------- |
| Scrittura automatica non disponibile su mobile/iOS | Ripiego dichiarato (D2), indicatore visibile, valutare Tauri in futuro      |
| Ricostruzione del testo imprecisa                  | Perimetro limitato a layout semplici, vista Originale sempre disponibile    |
| Ancoraggi persi su altro dispositivo               | Citazione con contesto + hash SHA-256 del PDF; test di portabilità dedicato |
| PDF grandi lenti su telefono                       | Elaborazione per pagine in worker, rendering virtualizzato                  |
| Pulizia dati del browser (iOS)                     | Avviso di esportare; richiesta `navigator.storage.persist()`                |

## 8. Fuori dall'MVP

OCR, multi-colonna, Google Drive e OneDrive, sincronizzazione, app Tauri, preferenze per documento.

## 9. Approvazione

L'analisi tecnica è approvata: tutte le decisioni aperte (D1–D9) sono chiuse.
L'utente ha autorizzato progressivamente le Fasi 0, 1, 2, 3 e 4 nella conversazione.
I gate su documenti e dispositivi reali restano aperti anche dopo i test automatici.

- [x] Fasi 0–4 autorizzate.
- [ ] Fase 5: avvio e finalizzazione della persistenza.
- [ ] Gate dispositivi reali e corpus dell'utente completato.
