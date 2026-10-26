# ADR-007: integrazione del layout UI 01

Data: 23/10/2026. Aggiornamento: 26/10/2026.
Stato: implementato e pubblicato; regressione locale e Azure superata.
Restano aperte le verifiche su dispositivi fisici e PDF originale dell'utente.

## Decisione

Integrare il layout desktop/mobile approvato nel lettore reale Preact, senza
riutilizzare pagine fittizie, note demo o schema del prototipo. Nessuna nuova
libreria UI, nessun backend, nessuna modifica al motore PDF o ai file utente.

- Desktop: barra documento 76 px; contenuto centrato, larghezza controllata;
  colonna annotazioni 318 px (300 px nelle finestre intermedie), scroll autonomo.
- Fino a 900 px: barra 64 px, lettura a piena larghezza, navigazione e strumenti
  inferiori con safe area; note e impostazioni come pannelli modali dal basso.
- Pannelli nativi `dialog`: sfondo inerte, Tab/Shift+Tab limitati al pannello,
  chiusura, Escape, click sullo sfondo e ritorno del focus al comando.
- Aspetto: tutti i controlli esistenti. Font Source Sans 3 / Source Serif 4
  self-hosted, licenze OFL incluse e precache PWA per uso offline.
- Selezione: toolbar solo quando necessaria, quattro colori, evidenziazione,
  aggiunta nota e annullamento; nessun nuovo limite su una sola riga/paragrafo.
- Solo lettura: barre e note nascoste, uscita evidente ed Escape; i problemi di
  persistenza rimangono visibili e risolvibili.
- Aggiornamenti PWA: riga superiore con spazio riservato al posto del vecchio
  toast sul navigatore; “Più tardi” non applica aggiornamenti e non elimina dati.
- Menu documento: operazioni PDF/JSON, stato completo, dettagli e Vista tecnica.
  Il PDF originale apre la pagina reale e rimane disponibile anche in altra scheda.

## Compatibilità e stato

Il JSON rimane `fluido/annotations` v1, normalizzazione `fluido-text/2`.
Nessuna migrazione dei database: `notesOpen`, opzionale nei record preesistenti,
viene normalizzato a `true` ed è una preferenza per dispositivo. Il pannello
mobile parte chiuso e non modifica la preferenza della colonna desktop.

`writeConfirmed` è un flag effimero della sessione, impostato soltanto dopo
`stream.close()` riuscito e per la stessa versione dei dati. Non viene esportato
né aggiunto allo schema della cache. Un'importazione o un semplice collegamento
non mostra “JSON aggiornato”. Il download rimane “Download avviato”, non una
conferma di salvataggio sul dispositivo.

I conflitti della Fase 5, le due copie scaricabili, CAS della cache, riconferme,
schemi futuri protetti, debounce di 700 ms e protezioni PWA restano invariati.
Chiusura note e Solo lettura catturano e ripristinano una posizione testuale,
senza convertire il punto del documento in coordinate pixel.

## Verifica e limiti

Copertura e risultati in [QA della Fase 6](qa-fase6.md).
Non equivale alla chiusura dei gate manuali su dispositivi fisici, picker del
sistema operativo, installazione PWA o PDF reale mostrato nello screenshot.
La piattaforma di riferimento funzionale resta Azure: il contenitore di
anteprima può bloccare il worker PDF a causa dell'origine opaca.

Repository: [MyPdfReader](https://github.com/andrearicossa/MyPdfReader).
Applicazione: [Fluido su Azure](https://proud-desert-027a07a10.1.azurestaticapps.net/).
