# ADR-005: annotazioni e punto di lettura portabili

Data: 21/10/2026. Stato: implementato per la Fase 4, `0.3.0-annotations.1`.

## Contesto e perimetro

La Fase 4 aggiunge evidenziazioni e note alla lettura fluida, senza modificare il
PDF, senza backend e senza caricare documenti in rete. Restano PWA statica,
licenza MIT e hosting Azure Static Web Apps Free. La vista tecnica precedente
rimane disponibile come diagnostica, distinta dal flusso delle annotazioni.

Le preferenze sono globali per dispositivo. Il file portabile contiene soltanto
dati del documento, annotazioni e posizione, non font o tema.

## Formato e compatibilità

Il nuovo JSON `<nomepdf>.annotations.json` usa:

- **Schema**: `fluido/annotations`, versione `1`.
- **Normalizzazione**: `fluido-text/2`, corrispondente al modello canonico della
  pagina. Gli offset sono UTF-16 e riferiti al testo normalizzato, non al DOM.
- **Documento**: SHA-256 dell'intero PDF, nome e dimensione. L'hash vincola il
  JSON allo stesso file; non viene effettuata una ricerca automatica sul disco.
- **Annotazioni**: ID univoco, ancora testuale, colore, nota, date ISO di
  creazione e modifica. Una nota vuota rappresenta una semplice evidenziazione.
- **Posizione**: pagina e offset, con citazione di contesto se disponibile;
  oppure ID della figura e frazione relativa alla figura. Non coordinate in pixel.
- **Revisione**: contatore del documento per lo stato delle scritture. Il campo
  interno `draftNote` rimane vuoto per compatibilità con l'adattatore generico;
  non è una seconda nota globale esposta nell'interfaccia.

Il database nuovo `fluido-annotations-v1` è separato dal vecchio
`fluido-file-spike-v1` e dal database delle preferenze. Non si cambiano schema
o contenuto dei dati esistenti. Il JSON sperimentale della Fase 1 viene rifiutato
dal lettore delle annotazioni con errore esplicito, non convertito o sovrascritto.
Il ritorno a una versione vecchia dell'app non deve farle riscrivere le note nuove.

Validazione runtime scritta in TypeScript, senza nuove dipendenze: struttura,
versione, normalizzazione, hash, ID duplicati, colori, date, offset e limiti.
Le proprietà sconosciute non vengono propagate. Limiti iniziali: 10 milioni di
caratteri JSON in ingresso, 10.000 annotazioni, 100.000 caratteri per nota,
20.000 per selezione; la UI lascia margine sotto il limite totale del JSON.
Questi sono limiti di protezione, non soglie prestazionali certificate.

## Selezione e riallineamento

Una selezione valida deve essere interamente nel testo ricostruito di una sola
pagina supportata. I nodi foglia espongono l'offset canonico e conservano il testo,
anche dentro box, citazioni e attribuzioni. Se la selezione attraversa paragrafi,
la citazione si ricava dal modello canonico, inclusi i separatori fra blocchi.

La UI legge la selezione senza alterarla. Durante un trascinamento con puntatore
non inserisce avvisi che sposterebbero il contenuto; elabora il risultato al
rilascio. Sono disponibili quattro colori: giallo, verde, azzurro e rosa.
Le sovrapposizioni sono segmentate senza annidare evidenziazioni: il colore più
recente prevale visivamente, mentre entrambe le note restano nella lista.

Ogni ancora contiene pagina, inizio/fine, citazione esatta e fino a 48 caratteri
di prefisso/suffisso. Il resolver:

1. Verifica la citazione agli offset originali.
2. Se non coincide, cerca la citazione nella sola pagina interessata.
3. Accetta una sola occorrenza oppure un solo candidato con contesto completo.
4. Altrimenti conserva la nota come assente o ambigua, senza aggancio arbitrario.

Le note di pagine non visitate rimangono non verificate fino al caricamento.
Il salto dalla lista carica soltanto la pagina necessaria, non analizza tutto il
PDF per verificare preventivamente le ancore. Le note rimangono leggibili anche
quando il passaggio non è risolto; la correzione manuale consiste nel ricreare
l'evidenziazione sul testo corretto conservando prima il testo della nota.

## Interfaccia e posizione

La colonna laterale desktop diventa un pannello sotto la lettura sui viewport
stretti. Include editor, colore, lista, salto al passaggio ed eliminazione con
conferma. Le evidenziazioni si possono aprire anche con tastiera. Testo di nota e
citazione vengono resi come testo, mai come HTML.

Lo scorrimento volontario aggiorna il punto di lettura. Ripristino, importazione
e salto caricano la pagina richiesta e usano un offset testuale, anche in un
paragrafo lungo. Cambio font e larghezza usano lo stesso principio; rimane una
frazione/blocco di ripiego quando non esiste una posizione testuale utilizzabile.
La posizione in figura è relativa alla figura; la riapertura torna al flusso,
non al dialogo di zoom. Se punto o figura non sono risolvibili, viene aperta la
pagina con avviso. La navigazione nell'Originale conserva la pagina, non il
livello di zoom o il suo scorrimento interno.

Restano massimo cinque pagine nel DOM e otto pagine nella cache grezza. Il PDF
intero viene comunque letto per caricamento e hash; non è streaming per intervalli.

## Persistenza riutilizzata e limiti della Fase 5

L'adattatore della Fase 1 è reso generico senza cambiarne il comportamento
precedente. Cache e scrittura partono dopo 700 ms senza modifiche; la scrittura
diretta richiede API e permessi disponibili. “Salvato” richiede la chiusura
riuscita dello stream. Permessi negati, conflitti e errori non cancellano le note.
Il confronto con la copia esterna blocca la sovrascrittura se i contenuti divergono.

Negli altri casi sono disponibili importazione e download espliciti. Un download
avviato non prova che il file sia stato conservato: la UI lo ricorda. Cache e file
sono stati distinti; l'aggiornamento della PWA e la sostituzione del PDF proteggono
le modifiche non conservate. Durante le operazioni sul JSON vengono bloccate le
modifiche concorrenti dell'editor.

Questo riuso è necessario per provare le annotazioni, ma non dichiara completata
la Fase 5. Restano finalizzazione dello schema, strategia di migrazione,
esperienza di recupero/conflitto, prove temporali di sistema e gate dei permessi
su file esterni in dispositivi reali. Non è implementato un merge tra dispositivi.

## Verifica e condizioni aperte

Vedere [QA della Fase 4](qa-fase4.md). Gli harness browser usano un corpus PDF
sintetico riproducibile. I test OPFS non certificano i picker OS e i permessi
persistenti sui file del dispositivo. Lo screenshot dell'utente non sostituisce
il PDF originale, che non è stato ricevuto. Restano da provare documenti reali
e selezione touch su Android/iOS; nessun supporto OCR o layout complessi.
