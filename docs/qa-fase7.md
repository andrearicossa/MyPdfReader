# QA della Fase 7: indice di navigazione e contesto

Versione: `0.6.0-index.1`. Data: 27/10/2026.
Stato: implementata e pubblicata su Azure; regressione locale superata.

## Funzione verificata

Indice del documento sempre raggiungibile e contesto di lettura percepibile,
secondo [ADR-008](ADR-008-indice.md).

- Pulsante "Indice" nella barra degli strumenti, con `aria-expanded`.
- Pannello laterale desktop (260 px) richiudibile con preferenza `indexOpen`,
  chiuso di default; dialog mobile dal basso con chiusura al salto e ritorno
  del focus al comando.
- Voci dei segnalibri con livello, titolo e pagina; voce corrente evidenziata
  con `aria-current` e "Sei in: …" coerente con la barra di contesto.
- Barra di contesto visibile con pannello chiuso: dichiara la sezione solo
  quando la pagina la distingue, altrimenti resta il contesto di pagina.
- Fallback senza segnalibri: elenco pagine a gruppi di 25, gruppo corrente
  aperto, salto diretto. Nessun titolo inventato dal testo estratto.
- Sopra 900 px l'apertura dell'indice conserva la posizione di lettura.
  Sopra 1250 px indice e annotazioni convivono; sotto le annotazioni cedono.
- Note e indice non restano sovrapposti su mobile: aprirne uno chiude l'altro.
- Solo lettura chiude l'indice; un salto non perde le annotazioni esistenti.
- Un errore di lettura dell'indice non blocca l'apertura del PDF (unità).

## Copertura

### Unità (Vitest)

- `tests/unit/outline.test.ts`: appiattimento gerarchico con livelli e ordine;
  destinazioni nominate, esplicite e numeriche; genitori senza destinazione
  conservati solo con figli utili; foglie non risolvibili e soli link esterni
  scartati; errore `getOutline` non blocca il documento; limiti profondità e
  numero voci; contesto onesto con pagine ambigue e destinazioni fuori ordine.
- `tests/unit/reading-preferences.test.ts`: `indexOpen` retrocompatibile,
  normalizzato a `false`, valori non booleani rifiutati.

### Browser (Playwright)

`tests/e2e/index.spec.ts`, sei scenari su Chromium, Firefox e WebKit:

- Desktop: voci, contesto, salto alla voce, evidenziazione corrente e
  posizione di lettura conservata all'apertura dell'indice.
- Pagina ambigua (Capitolo 2 e Sottosezione 2.1 sulla stessa pagina):
  nessuna sezione dichiarata, entrambe le voci evidenziate, aggiornamento
  del contesto durante lo scorrimento.
- PDF senza sommario: fallback sull'elenco pagine e salto diretto.
- Mobile: dialog dedicato, nessun overflow orizzontale, salto con chiusura e
  ritorno del focus, assenza di sovrapposizione con le note.
- Convivenza con le note: un solo pannello laterale sotto i 1250 px, entrambi
  sopra; transizione desktop→mobile→desktop e persistenza dopo ricaricamento.
- Solo lettura chiude l'indice; le annotazioni restano al loro posto dopo i salti.

## Risultati locali

- Formattazione, lint, TypeScript e build di produzione: superati.
- Vitest: 124 test superati in 11 file.
- Playwright: 156 test superati, 6 esclusioni previste, nessun fallimento
  nell'esecuzione completa finale su Chromium, Firefox e WebKit (162 casi).
- Le sei esclusioni restano i tre scenari con handle OPFS su Firefox e WebKit.

## Rilascio e verifica Azure

- Commit applicativo e CI/Deploy da registrare dopo la pubblicazione.
- Verifica interattiva su URL Azure da eseguire dopo il deploy.
- Screenshot desktop e mobile dell'indice in `evidence/phase7/`.

## Limiti e gate aperti

- L'indice dipende dai segnalibri del PDF: documenti senza sommario navigano
  per pagina. L'euristica sui titoli estratti è rimandata a una fase dedicata.
- Dispositivi fisici, picker di sistema e PDF originale dell'utente restano
  gate manuali aperti, come per la Fase 6.
