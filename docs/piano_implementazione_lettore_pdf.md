# Piano di implementazione – Lettore PDF in modalità fluida (MVP)

Stato: **Layout desktop/mobile UI 01 integrato nella Fase 6; collaudo di rilascio in corso; gate dispositivi reali aperto** · Aggiornamento: 23/10/2026
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
- `revision` descrive la copia di lavoro; recupero esplicito e compatibilità
  sono definiti dalla Fase 5 in [ADR-006](ADR-006-persistenza.md). `updatedAt`
  alla radice è opzionale e informativo, non un criterio automatico di vittoria.

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

Implementazione `0.4.0-persistence.1`: [ADR-006](ADR-006-persistenza.md) e
[QA Fase 5](qa-fase5.md). La cache ha una coda indipendente dal filesystem,
con avvio della persistenza dopo 700 ms dall'ultima modifica. I test temporali
non costituiscono una garanzia real-time a pagina sospesa o sistema bloccato.
Resta aperto il gate dei selettori e file esterni su dispositivi reali.

- Cache in IndexedDB con debounce 700 ms; non attende uno stream esterno lento.
- Adattatore File System Access: scrittura automatica nel file associato.
- Adattatore di ripiego: indicatore "modifiche non esportate", download del file, import con verifica fingerprint.
- Conflitti cache/file e tra schede: scelta esplicita locale/esterna, copie
  scaricabili, nuova conferma se la sorgente cambia ancora. Rilevamento dal
  contenuto e dal token atomico della cache, non dal solo orologio; `updatedAt`
  facoltativo a scopo informativo, compatibile con i JSON v1 della Fase 4.
- Schema v1 e normalizzazione invariati. Nessuna migrazione necessaria per
  `updatedAt` opzionale; versioni future, prototipo UI e file-spike rifiutati,
  senza conversione distruttiva né azzeramento della cache.

### Fase 6 – Revisione UI/UX, stabilizzazione e rilascio MVP

Ampliamento approvato dall'utente il 22/10/2026: l'interfaccia dell'MVP non è
considerata sufficientemente semplice da usare. La fase include quindi un layout
diverso, centrato sulla lettura, senza sostituire i test finali già previsti.
L'utente ha successivamente approvato la proposta UI 01 desktop e mobile e ne ha
autorizzato l'integrazione nella Fase 6, chiedendo di procedere prima con la Fase 5.
Il redesign non viene anticipato nella release della persistenza.

#### Proposta di layout e approvazione

- **Flussi principali**: rivedere apertura del PDF, lettura, selezione/annotazione,
  consultazione delle note, ripresa della lettura e conservazione del JSON.
- **Proposta visiva**: preparare wireframe o mockup per desktop e mobile, con
  adattamento al tablet e confronto con l'interfaccia attuale.
- **Approvazione ottenuta**: UI 01 desktop/mobile confermata dall'utente il
  22/10/2026. Lettura centrale, note laterali richiudibili su desktop, pannello
  sovrapposto e comandi inferiori su mobile. Prototipo di riferimento:
  https://www.perplexity.ai/computer/a/fluido-proposta-layout-fase-6-YdFOxszURHSxxzelDRbQNg.
  Implementazione nella Fase 6, mantenendo regressioni e gate manuali distinti.

#### Direzione della revisione UI

- **Documento protagonista**: destinare quasi tutto lo spazio utile alla lettura,
  riducendo introduzioni, pannelli permanenti e informazioni tecniche.
- **Barra compatta**: nome del PDF, navigazione, impostazioni e accesso alle note;
  controlli secondari raccolti senza sovraccaricare la vista.
- **Azioni contestuali**: proporre evidenziazione e nota vicino al testo selezionato,
  con alternative utilizzabili da tastiera e touch, non dipendenti dal solo hover.
- **Annotazioni a scomparsa**: pannello laterale apribile su desktop e pannello
  scorrevole su mobile, evitando che la lista allunghi continuamente la pagina.
- **Salvataggio riconoscibile**: stato sintetico e discreto, con dettagli,
  importazione ed esportazione in un menu dedicato. Avvisi di dati non esportati,
  errori e conflitti non devono diventare meno visibili.
- **Recupero Fase 5**: mantenere nel nuovo layout i download di entrambe le copie,
  le conferme separate per copia locale/esterna, il blocco degli schemi futuri e
  la distinzione fra cache, download e scrittura esterna effettivamente conclusa.
- **Controlli tecnici separati**: mantenere la diagnostica fuori dal percorso
  ordinario di lettura, senza confonderla con le funzioni del documento.

#### Integrazione UI 01

**Implementata (`0.5.0-layout.1`), verifiche di rilascio in corso.**
Barra documento, note laterali desktop / modali mobile, Aspetto e menu file
sovrapposti, navigazione inferiore e Solo lettura. Font self-hosted e preferenza
note globale per dispositivo; nessuna modifica al JSON v1.
Specifiche: [ADR-007](ADR-007-layout.md). Risultati: [QA della Fase 6](qa-fase6.md).
La chiusura della fase resta subordinata al riscontro d'uso dell'utente e ai gate
manuali, non solo al redesign.

#### Implementazione e verifica di usabilità

- Implementare il layout approvato su desktop, tablet e telefono, preservando
  selezione, ancore, posizione, Originale, figure e compatibilità del JSON.
- Provare i flussi principali anche su viewport stretti e finestre basse:
  apertura e chiusura dei pannelli, ritorno al testo, orientamento e ridimensionamento.
- Verificare tastiera, focus, etichette, contrasto nei tre temi e controlli touch;
  il nuovo layout non deve nascondere azioni essenziali o produrre sovrapposizioni.
- Raccogliere il riscontro dell'utente sul nuovo layout prima di chiudere la fase.

#### Stabilizzazione e rilascio, distinti dal redesign

- Eseguire nuovamente l'intera suite di regressione e i criteri di accettazione
  sul corpus dopo le modifiche UI, inclusi PDF invariato, note, ancore, posizione,
  persistenza, import/export, gestione dei conflitti, offline e aggiornamenti PWA.
- Mantenere i gate manuali su dispositivi reali e documenti dell'utente: il solo
  collaudo dei mockup o l'emulazione del viewport non li sostituisce.
- Misurare apertura, ricostruzione e memoria a scopo informativo, per fissare le
  soglie future (D6), distinguendo eventuali regressioni introdotte dal layout.
- Preparare tag e note di rilascio MVP, con numero di versione coerente con le
  release già pubblicate, e aggiornare la guida utente.
- **Uscita**: layout approvato dall'utente, flussi di lettura e annotazione
  verificati, suite di regressione superata e gate di rilascio documentati.

La precedente stima di circa una settimana copriva soltanto stabilizzazione e
rilascio. La durata della Fase 6 e il totale vanno ricalibrati dopo l'approvazione
della proposta UI: non si presume che il redesign rientri nella stessa settimana.
La baseline originaria era di **10–13 settimane** a una persona part-time
equivalente; le settimane si riferiscono allo sviluppo di un dev umano, non ai
tempi di esecuzione automatica.

## 5. Tracciabilità verso i criteri di accettazione

| Area dei criteri (analisi)                                      | Fase      | Verifica                                                       |
| --------------------------------------------------------------- | --------- | -------------------------------------------------------------- |
| Apertura file locale, PDF invariato                             | 1, 2      | E2E + confronto hash del PDF                                   |
| Testo fluido, font regolabile                                   | 2, 3      | Unità su ricostruzione + E2E                                   |
| Scorrimento continuo e riferimenti di pagina                    | 3         | E2E                                                            |
| Figure e zoom                                                   | 2, 3      | E2E su corpus con figure                                       |
| Evidenziazioni e note                                           | 4         | Unità ancoraggio + E2E                                         |
| Ripristino del punto di lettura                                 | 4, 5      | E2E riapertura                                                 |
| File unico separato, portabilità                                | 5         | E2E: esporta → altro browser → importa → note al posto giusto  |
| Salvataggio automatico / ripiego con avviso                     | 1, 5      | E2E per piattaforma                                            |
| Persistenza entro 2 s                                           | 5         | Test temporizzato                                              |
| Codice e build disponibili, licenza MIT e dipendenze verificate | Fase 0, 6 | Checklist licenze (AC-32)                                      |
| Desktop, tablet, telefono                                       | 3, 6      | Playwright viewport + prova manuale su dispositivi             |
| Revisione UI/UX e layout centrato sulla lettura                 | 6         | Proposta desktop/mobile approvata + verifica dei flussi utente |
| Regressioni dopo il cambio di layout                            | 6         | Suite completa + criteri di accettazione e gate manuali        |

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
L'utente ha autorizzato progressivamente le Fasi 0–5 e l'integrazione del layout
approvato nella Fase 6.
I gate su documenti e dispositivi reali restano aperti anche dopo i test automatici.

- [x] Fasi 0–4 autorizzate.
- [x] Revisione UI/UX e nuovo layout inclusi nella Fase 6.
- [x] Fase 5: persistenza e recupero implementati; verifiche automatiche documentate
      in [QA Fase 5](qa-fase5.md). Gate file esterni/dispositivi reali ancora aperto.
- [x] Proposta UI desktop/mobile approvata prima dell'implementazione della Fase 6.
- [ ] Gate dispositivi reali e corpus dell'utente completato.
