# ADR-003: estrazione per pagina, box e citazioni

Data: 20/10/2026. Versione applicativa: `0.1.0-engine.3`.
Estensione della Fase 2 autorizzata dall'utente, non avvio della Fase 3.
Integra e supera le parti indicate di [ADR-002](ADR-002-motore-pdf.md).

## Estrazione su richiesta

- **Apertura**: estrazione testuale della sola prima pagina. Il file PDF viene
  comunque letto integralmente per hash e caricamento PDF.js: non è lettura a
  intervalli del file e non garantisce memoria proporzionale a una sola pagina.
- **Navigazione**: campo numerico confermato con “Vai alla pagina”, precedente e
  successiva. Il salto alla pagina 35 non estrae le pagine 2–34. Nessun prefetch.
- **Cache**: massimo 8 pagine grezze, espulsione LRU e deduplicazione delle richieste
  concorrenti della stessa pagina. Il limite non comprende le cache interne PDF.js
  né l'intero file in memoria; non è un limite assoluto di RAM.
- **Margini**: intestazioni e piè di pagina ricorrenti sono confrontati soltanto
  fra le pagine in cache, non sull'intero documento. Alla prima apertura possono
  restare visibili; ritornando su una pagina il filtro può cambiare.
- **Interruzione**: annulla l'attesa della UI ed esclude risultati obsoleti. Il
  lavoro `getTextContent` già inviato al worker può terminare e alimentare la cache.
  Non viene promesso un arresto immediato della CPU. Chiudere il documento termina
  invece il worker.
- **Originale**: il rendering della pagina non richiede prima l'estrazione del
  testo. Il confronto resta disponibile anche dopo annullamento o errore.

## Box semplici

- **Riconoscimento**: rettangoli assiali chiusi, quattro segmenti corrispondenti
  oppure sfondi rettangolari. Servono almeno due righe contenute, margini interni
  e una regione non equivalente all'intera pagina; i layout già incerti non
  vengono convertiti in box.
- **Testo**: i paragrafi restano distinti in un contenitore `aside`, con testo
  selezionabile e geometrie originali. Il bordo riconosciuto non diventa anche
  una figura duplicata.
- **Immagini**: un riquadro contenente immagini non viene assimilato a un semplice
  box testuale. La figura resta disponibile e compare un avviso. Anche le regioni
  grafiche con testo non separabile rimandano al confronto Originale.
- **Limiti**: nessuna promessa per tabelle, bordi curvi, contenitori annidati,
  colonne o diagrammi complessi. Riconoscimento euristico: possibili falsi
  positivi e falsi negativi, da valutare su PDF reali.

## Citazioni e modello

- **Riconoscimento**: rientro rispetto ai paragrafi del corpo, più righe e margine
  destro, oppure apertura con virgolette. Liste numerate e rientro della sola prima
  riga non bastano per creare una citazione.
- **Attribuzione**: separata in `footer/cite` quando segue la citazione e ha un
  indicatore esplicito, per esempio trattino o “Fonte:”. Una firma senza indicatore
  non è riconosciuta in modo generale.
- **Contratto**: `fluido-text/2`, gruppi `box` e `quote` con figli e attribuzione
  opzionale. Offset UTF-16 locali alla pagina; per gruppi e figli vale
  `page.text.slice(start,end) === block.text`. Il testo è presente una volta sola
  nella pagina, non ripetuto per ogni livello dell'albero.
- **Persistenza**: nessuna migrazione IndexedDB, nessuna modifica al JSON
  sperimentale `fluido/file-spike v1`. Navigare nell'anteprima non salva la vera
  posizione di lettura. Gli offset possono cambiare col filtro marginale:
  non sono ancora ancore definitive di annotazioni.

## Evidenza e limiti della validazione

Lo screenshot dell'utente è un riferimento visivo: il PDF originale non è stato
ricevuto. Il corpus sintetico riproduce una disposizione simile con box,
paragrafi e citazione attribuita; non dimostra il riconoscimento della pagina 35
del documento reale. Nessun OCR o upload del documento.

Le prove riproducibili e i risultati sono in [QA Fase 2](qa-fase2.md).
Le prove manuali su dispositivi reali e file del dispositivo restano aperte.
