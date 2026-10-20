# QA della Fase 2

Aggiornamento del 20/10/2026 per `0.1.0-engine.3`: pagine su richiesta, box e citazioni.
Decisioni in [ADR-003](ADR-003-pagine-box-citazioni.md).

## Corpus riproducibile

`tests/fixtures/pdf-corpus.mjs` genera PDF reali con xref, font Helvetica e contenuti
sintetici, senza dati personali. File in `tests/fixtures/corpus`.
Rigenerazione: `node scripts/generate-corpus.mjs`.

- **semplice.pdf**: tre pagine, titoli, paragrafi, parola sillabata, intestazioni e
  numeri pagina ripetuti, immagine raster e rettangolo vettoriale.
- **colonne.pdf**: due colonne allineate, da segnalare come non affidabili.
- **scansione.pdf**: immagine senza testo, nessun OCR.
- **misto.pdf**: una pagina testuale e una immagine senza testo.
- **ruotato.pdf**: pagina ruotata con testo non orizzontale nel viewport.
- **corrotto.pdf**: header PDF ma struttura non valida.
- **box_citazione.pdf**: box rettangolare con due paragrafi, testo esterno e
  citazione rientrata con attribuzione distinta.
- **box_segmenti.pdf**: stesso contenuto, bordo composto da quattro segmenti.
- **box_sfondo.pdf**: stesso contenuto, sfondo rettangolare.
- **protetto.pdf**: `semplice.pdf` cifrato con qpdf 12.3.2. Rigenerazione facoltativa,
  qpdf non richiesto in CI:
  `qpdf --encrypt fluido-test proprietario-test 256 -- tests/fixtures/corpus/semplice.pdf tests/fixtures/corpus/protetto.pdf`.
  Password pubbliche di prova, non credenziali.

Gli E2E generano anche 200 pagine semplici per interruzione/ripresa.
Verificano un solo `GetTextContent` all'apertura, salto alla 35 senza pagine
intermedie, hit/espulsione LRU e massimo 8 pagine grezze in cache. La navigazione
in Originale non estrae testo finché non si torna alla vista testuale.
Il test ritarda un solo messaggio al worker per rendere il clic deterministico;
non sostituisce parsing o estrazione. Nessun PDF esterno redistribuito.

## Controlli automatici

- **Dominio**: Unicode, legature e offset UTF-16 tramite slice; run, titoli,
  paragrafi e sillabazione; niente fusioni fra pagine; margini ripetuti
  contro testo ripetuto nel corpo.
- **Layout**: colonne allineate/sfalsate, assenza di testo, verticalità, RTL,
  grafica complessa e stato parziale del documento.
- **Geometrie**: matrici, rotazioni, unione/clipping delle regioni, esclusione
  di decorazioni e sfondi.
- **Worker e UI**: PDF reale nei tre motori, testo atteso integrale dei paragrafi
  della prima pagina, filtro marginale progressivo dopo aver visitato altre
  pagine, pagina diagnostica e viewport 375 px.
- **Box/citazioni**: varianti bordo/sfondo, testo selezionabile una sola volta,
  attribuzione separata e immagini vere non rimosse. Negativi su rientri della
  prima riga, liste, tabelle, curve e bordi incompleti; intervalli UTF-16 di gruppi
  e figli.
- **Concorrenza**: richiesta condivisa, annullamento del singolo chiamante,
  errore/riprova e cambio pagina durante una richiesta ritardata. Il risultato
  tardivo non sostituisce quello della pagina corrente.
- **Figure**: canvas inizialmente nascosto, rendering su richiesta, pixel raster
  non bianchi, rendering vettoriale e ritorno fra pagine.
- **Originale**: anteprima della pagina richiesta senza plugin del browser.
- **Errori**: PDF incompleto/cifrato; nota e documento precedenti conservati;
  scansioni/colonne con avviso, senza falsa dichiarazione di supporto.
- **Offline**: reload senza rete, primo PDF nel contesto offline, font/worker
  e figura. Richiede service worker installato.
- **Regressione Fase 1**: JSON, hash, cache, download/import in contesto vuoto,
  permessi/conflitti e OPFS Chromium con picker OS sostituiti.

Risultati sulla build locale: **62 test unitari passati** e **58 test browser
passati** su Chromium, Firefox e WebKit. Due skip intenzionali dell'harness OPFS
su Firefox/WebKit, non funzionalità dichiarate verificate sui file del dispositivo.
Lint, controllo tipi e build di produzione passati.

Controllo visivo della schermata iniziale, testo con figura, Originale e avviso
multi-colonna. Desktop 1280 px e mobile 375 px, temi chiaro e scuro; nessun
overflow orizzontale o errore JavaScript osservato. Non sono screenshot di
dispositivi fisici. Le verifiche end-to-end della pubblicazione Azure vengono
eseguite anche dopo il deploy, prima della consegna.

Per questa estensione: controllo visivo di box multi-paragrafo e citazione con
attribuzione nei due temi, ridimensionamento desktop/mobile/desktop e Originale.
Contrasto calcolato sulle etichette secondarie e di stato abilitate, a transizioni
concluse: minimo 4,82:1 in chiaro e 4,69:1 in scuro nelle schermate controllate.
Non è una certificazione globale di accessibilità.

## Checklist manuale aperta

- [ ] PDF reali a colonna singola: testo, accenti e figure.
- [ ] Pagina 35 del documento dell'utente: ricevuto soltanto uno screenshot,
      non il PDF. Il corpus equivalente sintetico non chiude questa prova.
- [ ] Citazioni senza indicatori espliciti, box annidati/curvi e altri editor PDF.
- [ ] Figure vettoriali articolate e font incorporati/non latini.
- [ ] Tablet/smartphone reali: installazione e offline.
- [ ] PDF grandi: osservare tempo, memoria e interruzione.
- [ ] File esterni e permessi OS della Fase 1.

Nessuna soglia prestazionale. Viewport emulato ed E2E desktop Linux non
certificano dispositivi mobili o dialoghi OS.
