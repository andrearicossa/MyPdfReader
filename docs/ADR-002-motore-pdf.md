# ADR-002: motore PDF e modello di lettura

Stato: implementato nella Fase 2, sperimentale. Nessuna attestazione sui dispositivi
reali dell'utente; il gate manuale della Fase 1 rimane aperto.

Aggiornamento 20/10/2026: questo ADR descrive la baseline della Fase 2.
Estrazione dell'intero documento, filtro marginale globale e normalizzazione `/1`
sono superati da [ADR-003](ADR-003-pagine-box-citazioni.md): estrazione su richiesta,
cache limitata e modello `fluido-text/2` con box e citazioni.

## Perimetro

La Fase 2 aggiunge parsing, estrazione, un modello verificabile e un'anteprima
diagnostica per pagina. Non è la vista di lettura continua della Fase 3, né il
modello di annotazioni della Fase 4. Il JSON `fluido/file-spike v1` della Fase 1
rimane separato: nota e pagina di prova non diventano annotazioni vere.
Cambiare la pagina diagnostica non salva ancora la posizione di lettura.

## Architettura e risorse

- **Adattatore browser `src/pdf`**: PDF.js `5.4.624`, versione esatta nel lockfile,
  compatibile con Node 20 usato in CI. Prima di sostituire la sessione aperta
  si identifica il file e lo si valida con il parser. Un PDF danneggiato o
  protetto da password non sostituisce documento e note correnti.
- **Worker**: `Worker` ES module dedicato e `PDFWorker.create({port})`. Parsing,
  font ed estrazione PDF nel worker; costruzione del modello TypeScript puro
  sul main thread. Non c'è un secondo worker per il dominio.
- **Dominio `src/core`**: run testuali, ricostruzione e modello senza DOM,
  storage, UI o import dell'adattatore. `src/pdf` differisce dallo scheletro
  iniziale `core/pdf` per mantenere questa separazione.
- **Risorse locali**: worker, CMap, font standard, ICC e codec della stessa
  versione installata. Nessuna CDN, backend o upload del documento.
  Preparazione in `predev`/`prebuild`; precache PWA delle risorse dinamiche.
  Offline disponibile dopo l'installazione del service worker, non prima del
  primo accesso alla rete.
- **Sicurezza e licenze**: valutazione dinamica di codice e XFA disabilitate.
  Nessun esecutore di JavaScript incorporato, azioni o allegati. Testo renderizzato
  come testo Preact, non HTML. Progetto MIT; PDF.js Apache-2.0 e licenze delle
  risorse conservate, vedere `THIRD_PARTY_NOTICES.md`.

## Contratto del modello

`ReadingModel.normalization` vale `fluido-text/1`. Ogni pagina contiene dimensioni,
rotazione, testo normalizzato, blocchi, geometrie e avvisi.

- **Coordinate**: punti nel viewport PDF.js a scala 1, rotazione della pagina
  applicata, origine in alto a sinistra. Rettangoli delle figure e delle righe
  non dipendono dal font dell'interfaccia.
- **Testo**: PDF.js con `disableNormalization: true`, poi NFC, espansione di
  legature comuni, conversione NBSP, rimozione di soft hyphen e zero-width space,
  compressione spazi e trim. PDF.js gestisce ancora mappatura glifi e proprio
  ordinamento interno.
- **Offset**: `[start,end)` UTF-16 nel testo normalizzato della singola pagina.
  Fra blocchi testuali si inseriscono due newline; non si attraversa la pagina.
  Invariante: `page.text.slice(start,end) === block.text`.
- **Identificatori**: pagina e progressivo locale, diagnostici, non ancora
  stabili fra versioni del motore e non ancore definitive per annotazioni.
- **Titoli/paragrafi**: dimensione relativa dei caratteri, posizione, interlinea,
  rientri e figure interposte. Nessun indice semantico.
- **Sillabazione**: trattino a fine riga tra lettere e successiva iniziale
  minuscola ricongiunti nello stesso paragrafo. Euristica senza dizionari,
  può rimuovere trattini di parole composte.
- **Margini**: righe brevi nell'8% superiore/inferiore, ripetute in almeno due
  pagine e nel 60% delle pagine; numeri normalizzati nel confronto.
  Non è un rilevatore universale di intestazioni.

## Figure e vista Originale

Regioni derivate dagli operatori immagini e dai tracciati vettoriali semplici,
con trasformazioni, clipping al rettangolo della pagina e unione di regioni vicine.
Esclusi decorazioni minuscole e sfondi quasi a tutta pagina. Non si promette la
semantica di una “figura” editoriale o il rispetto di ogni maschera di clipping.

Figura collocata fra i blocchi in ordine verticale, oppure esplicitamente a fine
pagina se sovrapposta al testo. Canvas renderizzato solo su richiesta, non scritto
nel JSON. Massimo 4 milioni di pixel e 1800 pixel sul lato maggiore; il ritaglio
può includere testo e margini. Non si estraggono i byte dell'immagine incorporata.

L'Originale è un raster della pagina selezionata, su richiesta, in sola lettura,
anche per scansioni e layout non supportati. Rimane un collegamento al
visualizzatore del browser; il frammento `#page` dipende da quel visualizzatore.

## Supporto e limiti

Stato pagina con avvisi; stato documento `simple`, `partial` o `unsupported`.
Assenza di testo, possibili colonne/tabelle, testo verticale/ruotato, RTL e alcuni
operatori grafici complessi sono segnalati. Per pagine non supportate, il testo
è soltanto diagnostico e l'utente è invitato a usare l'Originale.

Il rilevamento geometrico delle colonne, anche sfalsate, può avere falsi positivi
e negativi. Nessun avviso non certifica la qualità di un PDF arbitrario.
No OCR, tabelle strutturate, ordine multi-colonna, lettura verticale/RTL,
apertura di PDF cifrati o garanzia per grafici/pattern complessi.
Font e figure non sono verificati su tutti i formati PDF.

Estrazione sequenziale per pagina con progressione, interruzione e ripresa.
File, run e modello in memoria; hash ed estrazione leggono il file separatamente.
Nessuna soglia prestazionale o garanzia sui PDF grandi.
Il corpus sintetico non sostituisce PDF e dispositivi reali.

## Verifica

Corpus e risultati in [QA Fase 2](qa-fase2.md). Gate dei layout semplici verificato
su esempi controllati e testo atteso esplicito; validazione qualitativa sul corpus
dell'utente ancora da fare.
