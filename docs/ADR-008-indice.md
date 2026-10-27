# ADR-008: indice di navigazione e contesto di lettura

Data: 27/10/2026. Stato: implementato e pubblicato (`0.6.0-index.1`).
Regressione locale e Azure superata. Restano aperti i gate su dispositivi fisici
e il PDF originale dell'utente.

## Decisione

Aggiungere un indice sempre raggiungibile per navigare più velocemente il
documento e percepire il contesto, senza nuove librerie UI né modifiche al
motore PDF o al formato delle annotazioni.

- **Origine dell'indice**: i segnalibri (outline) del PDF, letti una sola volta
  per documento con `getOutline()` di PDF.js. Le destinazioni — esplicite o
  nominate — vengono risolte in numero di pagina; le voci non risolvibili sono
  scartate se foglie, conservate come intestazioni di gruppo se hanno figli
  utili. I collegamenti URL esterni non diventano salti interni.
- **Fallback onesto**: senza segnalibri l'indice mostra l'elenco delle pagine a
  gruppi di 25. Non vengono inventati titoli dal testo estratto: l'euristica sui
  titoli è rimandata a una fase dedicata.
- **Desktop**: pannello laterale sinistro richiudibile (260 px), speculare alle
  annotazioni, con preferenza `indexOpen` per dispositivo, chiuso di default.
- **Mobile**: dialog dal basso con il medesimo contenuto, richiamabile dal
  comando "Indice" nella barra degli strumenti. Il salto chiude il dialog e
  restituisce il focus al comando. Note e indice non restano sovrapposti.
- **Contesto**: la barra di navigazione mostra il titolo della sezione corrente
  anche con pannello chiuso. La sezione viene dichiarata solo quando la pagina
  la distingue senza ambiguità: se più voci partono dalla stessa pagina, o le
  destinazioni sono fuori ordine, resta il solo contesto di pagina. Nel pannello
  la voce corrente è evidenziata con `aria-current` e un "Sei in: …" coerente.
- **Convivenza con le note**: sopra 1250 px indice e annotazioni restano entrambi
  aperti; sotto, le annotazioni cedono lo spazio e tornano al primo comando.
  Sopra 900 px l'apertura dell'indice conserva la posizione di lettura, come già
  fanno note e Solo lettura.

## Compatibilità e stato

Il JSON resta `fluido/annotations` v1: nessuna migrazione. `indexOpen` è una
preferenza per dispositivo, opzionale e normalizzata a `false` nei record
preesistenti; il pannello mobile non la modifica. Un errore di lettura
dell'indice non blocca mai l'apertura del PDF: l'indice ricade sulle pagine.

## Verifica e limiti

Copertura e risultati in [QA della Fase 7](qa-fase7.md). L'indice dipende dalla
qualità dei segnalibri del PDF: un documento senza sommario interno naviga per
pagina. I gate su dispositivi fisici e PDF reale restano aperti.
