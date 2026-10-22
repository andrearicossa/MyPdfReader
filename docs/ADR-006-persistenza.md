# ADR-006: persistenza, conflitti e compatibilità

Data: 22/10/2026. Stato: implementato nella release `0.4.0-persistence.1`.
Ambito: Fase 5; nessun redesign e nessun servizio di sincronizzazione.

## Decisione

La PWA rimane statica, MIT e distribuibile su Azure Static Web Apps Free. PDF
originale in sola lettura; un solo JSON portabile contiene annotazioni e posizione.
Le preferenze globali restano nel browser del dispositivo, non nel documento.

Il layout UI 01 desktop/mobile approvato sarà integrato nella Fase 6. Questa
release aggiunge esclusivamente i controlli di recupero necessari alla persistenza.

## Code indipendenti e stato osservabile

- **Cache**: ogni modifica riavvia il debounce di 700 ms. La coda IndexedDB non
  attende la coda del file. Anche se uno stream esterno resta sospeso, la modifica
  successiva può arrivare alla cache e il download può iniziare.
- **File**: scritture serializzate, permesso verificato, confronto del contenuto
  con la baseline prima di scrivere e ulteriore confronto dopo l'apertura dello
  stream. Stato salvato solo dopo `close()` riuscita; `abort()` se possibile in
  caso di errore. Modifiche più recenti non sono dichiarate salvate dalla chiusura
  di uno snapshot precedente.
- **Download**: serializza immediatamente il documento corrente senza attendere
  il file esterno; la UI avverte di verificare il file conservato. Il download
  non annulla una scrittura automatica ancora necessaria al file collegato.
- **Riapertura**: gli handle eventualmente clonati in IndexedDB non autorizzano
  scritture implicite. Ripristino locale in modalità manuale e ricollegamento con
  gesto esplicito dell'utente.
- **Uscita/aggiornamento**: restano i flush su pagina nascosta e le protezioni
  prima di chiusura e aggiornamento PWA. Sono best effort, non una promessa di
  salvataggio quando il sistema operativo termina il processo.

Il limite concordato riguarda l'avvio della persistenza entro due secondi,
non la conclusione di un'operazione I/O. Timer, processi sospesi, storage bloccato
e sistemi sovraccarichi non consentono una garanzia real-time. Il timer di 700 ms
è verificato con clock controllato; il browser misura anche il raggiungimento
della cache entro due secondi nell'ambiente automatico.

## Conflitti del file

Una baseline di contenuto differente blocca la scrittura. Nessun merge automatico:
si mostrano revisione e data, quando disponibili, e si offrono i download della
copia locale e della copia esterna rilevata.

- **Usa copia esterna**: conferma la sostituzione dei dati locali, verifica hash
  e schema, ricontrolla il file e importa annotazioni e posizione.
- **Mantieni copia locale**: conferma la sostituzione della copia esterna indicata,
  ricontrolla il contenuto e il permesso; revisione successiva al massimo delle
  due revisioni. La scrittura resta soggetta a `close()` riuscita.
- **File cambiato ancora**: aggiorna la copia rilevata e richiede una nuova scelta,
  invece di applicare una conferma riferita a un contenuto precedente.
- **JSON non supportato**: un file invalido, futuro o riferito a un altro PDF non
  viene sovrascritto. Entrambe le copie sono scaricabili; usare un nuovo file per
  il recupero locale oppure correggere e ricollegare la sorgente.

File System Access non offre un compare-and-swap atomico sul filesystem. Il
secondo controllo riduce ma non elimina la corsa con un altro processo che scriva
durante il commit. Non si dichiara una protezione atomica tra processi o dispositivi.

## Conflitti fra schede nella cache

Ogni record conserva un token opaco. Il confronto del token atteso e la scrittura
di documento e alias `$latest` avvengono nella stessa transazione readwrite
IndexedDB. Una scheda obsoleta non sostituisce silenziosamente l'altra copia.

La scelta è esplicita anche qui; prima si possono scaricare entrambe le versioni.
Un altro aggiornamento del token durante la decisione richiede una nuova conferma.
Scegliere una cache non autorizza una scrittura sul file esterno: si ritorna alla
modalità manuale e, se necessario, si ricollega il file.

I vecchi record senza token sono leggibili. Una vecchia versione dell'app che
scrive senza questo protocollo non partecipa alla protezione atomica: evitare
l'uso contemporaneo di versioni diverse. Non è sincronizzazione fra dispositivi.

## Compatibilità del formato e delle cache

Il formato resta `fluido/annotations`, versione `1`, normalizzazione
`fluido-text/2`. `updatedAt` alla radice è opzionale, validato se presente,
generato alla modifica e conservato al round-trip. Non viene inventato un
timestamp per un documento v1 precedente, né usato l'orologio per scegliere un
vincitore.

Non si aggiunge una versione 2 senza una trasformazione di dati necessaria.
Versioni future e normalizzazioni diverse sono rifiutate. I JSON del prototipo
di layout e quelli della vecchia prova file non vengono convertiti in annotazioni.
La vecchia prova rimane in un database e formato separati.

Le cache esistenti non sono cancellate o rinominate. I nuovi metadati sono
opzionali: token e stato di scrittura esterna pendente. Una cache futura o
corrotta non viene sovrascritta come documento vuoto: la sessione può ancora
conservare separatamente i dati correnti attraverso download o nuovo file.

## Errori e limiti aperti

Errori di quota, cache indisponibile, permesso revocato e scrittura/chiusura
fallite non tolgono la possibilità di scaricare il documento corrente. Il JSON
rimane testo serializzato e non esegue markup delle note.

Il corpus automatico è sintetico. OPFS prova stream e handle reali ma non
selettori del sistema operativo o permessi di file esterni. Restano da provare
desktop e dispositivi reali, Safari/iOS installato, Android e il PDF originale
dell'utente, finora non ricevuto.
