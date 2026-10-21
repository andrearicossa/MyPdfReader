# ADR-004: vista di lettura fluida

Data: 21/10/2026. Versione: `0.2.0-reader.1`.
Fase 3 autorizzata dall'utente. La piattaforma rimane una PWA statica MIT,
senza backend e senza upload del documento.

## Flusso di lettura

- **Vista principale**: lettura fluida; la vista tecnica della Fase 2 resta
  accessibile e ha un ingresso diretto con `?view=technical`.
- **Progressività**: estrazione iniziale della sola pagina 1. Scorrendo
  volontariamente vicino alla fine viene aggiunta la successiva; in alternativa
  “Continua con pagina N”. Anche un gesto esplicito della rotella al bordo può
  aggiungere una pagina corta; non si estraggono pagine per riempire lo schermo.
  Focus e riposizionamenti automatici del browser non autorizzano estrazioni.
- **Finestra**: massimo cinque pagine renderizzate contemporaneamente. Alla sesta
  viene rimossa quella lontana, conservando un ancoraggio visivo nel contenuto
  rimasto. Si può caricare la precedente anche verso l'alto.
- **Scrollbar**: rappresenta la finestra attiva, non l'intero documento con migliaia
  di segnaposto. Il salto assoluto avviene col campo pagina; precedente/successiva
  spostano alla pagina adiacente a quella corrente.
- **Memoria**: resta la cache LRU di otto pagine grezze dell'ADR-003. I limiti della
  finestra non limitano la RAM totale: file completo, risorse e cache PDF.js
  restano in memoria. Nessuna soglia prestazionale certificata su PDF reali.

## Impaginazione e posizione

- **Preferenze**: carattere con/senza grazie, 14–32 px, interlinea 1,3–2,2,
  margini 8–48 px, temi chiaro/scuro/seppia. Famiglie locali di sistema, senza
  richieste a CDN; l'aspetto del carattere può variare fra dispositivi.
- **Posizione corrente**: identificata dalla pagina visibile nella regione di
  scorrimento. Cambi di tipografia o larghezza usano un blocco visibile e la sua
  frazione verticale: ancoraggio visivo approssimativo, non ancora per carattere.
- **Originale**: apre la pagina corrente; tornando al testo si conserva la finestra.
  La navigazione in Originale non estrae nuovo testo; lo farà al ritorno.
- **Limiti della sessione**: posizione soltanto in memoria. Riaprire il documento,
  ricaricare l'app o ritornare dalla vista tecnica ricrea la lettura dalla prima
  pagina. Salvataggio automatico del punto di lettura e annotazioni restano alla
  Fase 4; il campo “Pagina di prova” non è il segnalibro del lettore.

## Figure e layout non supportati

- **Rendering**: figure nel flusso, renderizzate quando vicine alla vista.
  Spazio riservato secondo il rapporto della regione PDF per ridurre i salti.
- **Zoom**: dialogo modale nativo, controlli 100–400%, adatta, doppio tocco/doppio
  clic, pinch e trascinamento. Escape o pulsante di chiusura tornano alla lettura.
  Risoluzione raster limitata dal renderer già esistente, non ricostruzione di
  dettaglio aggiuntivo dell'immagine originale.
- **Fallback**: scansioni, colonne o separazioni grafiche incerte hanno un avviso
  e l'accesso all'Originale della pagina. Nessun OCR o nuovo supporto a layout complessi.
- **Box e citazioni**: riuso del modello `fluido-text/2` e del riconoscimento
  euristico della Fase 2; nessuna garanzia sul PDF originale non ricevuto.

## Preferenze persistenti

Nuovo database `fluido-preferences-v1`, versione 1, store `settings`, chiave
`reading`. Nessuna modifica al database `fluido-file-spike-v1`, allo store
`documents`, ai record precedenti o al JSON sperimentale `fluido/file-spike v1`.
Le vecchie versioni dell'app possono continuare a leggere i propri dati.

I valori vengono validati e limitati prima dell'uso. Scritture serializzate con
conferma al commit della transazione, non al singolo `put`; preferenze globali per
origine/browser/dispositivo, non portabili col documento. Con IndexedDB non
disponibile, l'app usa preferenze temporanee e lo dichiara senza bloccare la lettura.
Non è sincronizzazione cloud né una garanzia contro la cancellazione dei dati
del browser. Schede simultanee non sincronizzano le preferenze in tempo reale.

## Verifica

Risultati e limiti in [QA Fase 3](qa-fase3.md). Le simulazioni dei gesti e dei
viewport non certificano browser, permessi file e touch sui dispositivi fisici.
L'anteprima incorporata Perplexity continua ad avere il limite del worker da
origine opaca: il sito Azure rimane l'ambiente di utilizzo e verifica funzionale.
