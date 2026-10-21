# QA della Fase 4

Data: 21/10/2026. Versione: `0.3.0-annotations.1`.

## Ambiente e perimetro

PWA statica Preact/Vite, senza nuove dipendenze runtime. Prove automatiche
Playwright su Chromium, Firefox e WebKit headless; non browser fisici Android/iOS
né Safari installato su macOS. Corpus sintetico riproducibile nel repository.
Nessun documento dell'utente è stato caricato su server.

Il PDF originale dell'utente non è stato ricevuto: lo screenshot della pagina 35
guida il perimetro box/citazioni, ma non permette di verificarne l'estrazione reale.

## Risultati automatici

- **Installazione pulita**: `npm ci` completato; `npm audit --audit-level=low`
  riporta zero vulnerabilità.
- **Controlli statici**: formato, ESLint, TypeScript e build di produzione superati.
- **Unitari**: 90 test superati in nove file, inclusi 24 nuovi casi per ancore,
  formato e sessione annotazioni.
- **Browser locali**: suite completa con 107 test superati e quattro esclusioni
  OPFS previste, su 111 casi nei tre motori.
- **Ultime rifiniture UI**: dopo contrasto e nome del documento, ripetizione dei
  dieci scenari annotazioni su Chromium; il nome visibile proviene dal PDF
  realmente aperto, non dal nome eventualmente conservato nel JSON.

## Copertura annotazioni

- **Selezione reale**: trascinamento del mouse nel box, selezione inversa,
  sovrapposizioni, attribuzione della citazione e selezione tra paragrafi nello
  stesso box. Gli offset provengono dal testo canonico e includono i separatori
  fra blocchi. Il test non crea selezioni tramite `addRange()`.
- **Esclusioni**: selezione tra pagine e pagine con ricostruzione non affidabile
  rifiutate con messaggio. La UI non sposta il testo inserendo avvisi durante
  il trascinamento; il risultato viene elaborato al rilascio.
- **CRUD**: quattro colori, nota Unicode, testo che sembra HTML non eseguito,
  modifica, annullamento e conferma dell'eliminazione, rimozione del mark.
  Le evidenziazioni sono accessibili anche con tastiera.
- **Riallineamento**: citazione unica recuperata a offset diverso, duplicati
  disambiguati con contesto nei test unitari; ancore assenti o ambigue rimangono
  nella lista, senza evidenziazione inventata. Le pagine non visitate non vengono
  analizzate preventivamente per verificare le note.
- **Navigazione**: salto dalla lista al testo, senza aprire automaticamente
  l'editor. Sui viewport stretti la lettura torna visibile. “Modifica” apre invece
  l'editor; cambio desktop → mobile → desktop senza perdita della nota.

## Portabilità, posizione e dati

- **PDF immutato**: confronto byte per byte del blob originale dopo le annotazioni.
- **JSON portabile**: export, contesto browser pulito, stesso PDF e import;
  evidenziazione/nota ripristinate con viewport e font diversi. Font e tema
  del nuovo contesto non vengono sostituiti dal JSON.
- **Cache**: dopo riapertura del PDF, recupero di note e posizione, anche offline.
  Indisponibilità del solo database annotazioni: avviso, nota ancora in memoria,
  download valido. Il controllo PWA blocca l'aggiornamento con modifiche non
  conservate e lo consente dopo download.
- **Posizione nel testo**: paragrafo lungo, scorrimento con tastiera, esportazione
  di pagina/offset/citazione; reload direttamente sulla pagina 3 con una sola
  pagina nel DOM, senza montare tutte le precedenti. Ritorno dalla vista tecnica
  con lo stesso punto. Le regressioni del motore contano anche le richieste
  testuali al worker su un PDF di 200 pagine.
- **Posizione nella figura**: apertura zoom, chiusura, export, reload sul flusso
  in corrispondenza della figura; il dialogo non si riapre automaticamente.
- **Import difensivo**: schema, normalizzazione, hash, tipi, date, ID duplicati,
  colori e offset incoerenti respinti. Un import invalido o di altro PDF non
  sostituisce la nota. Il vecchio formato sperimentale è rifiutato, non migrato.

## Scrittura diretta e regressioni

L'harness Chromium usa handle reali OPFS e un picker simulato. Verifica il nuovo
schema scritto dopo la modifica, riapertura, ricollegamento e modifica esterna:
il conflitto blocca la sovrascrittura e la versione esterna rimane intatta.
Non è una certificazione dei picker del sistema operativo o dei permessi su file
esterni. Il test OPFS nuovo e quello precedente sono esclusi su Firefox/WebKit.

I test dell'adattatore condiviso continuano a verificare permesso negato,
autorizzazione alla riapertura, conflitto, stream fallito, errore di `close`,
scritture concorrenti e debounce 700 ms. Nessuna perdita dei test precedenti:
motore/worker reali, estrazione per pagina, LRU, virtualizzazione, figure/gesti,
annullamento, Originale, documenti errati, file di prova separato, preferenze,
manifest, aggiornamento e offline.

## Controllo visivo ed esplorazione

Viewport 1280×900, 768×1024, 375×900 e finestra desktop ridotta in altezza.
Controllo separato dei temi chiaro, scuro e seppia; lista vuota e popolata,
quattro colori, editor, cancellazione, import errato e stato della persistenza.
Il pannello laterale diventa una sezione sotto la lettura sui viewport stretti.
La pagina esterna rimane scorrevole: non è una finestra a schermo fisso.

Misura dei contrasti dei testi di servizio e delle evidenziazioni; correzione
delle indicazioni nell'area di selezione e nell'editor, che sui fondi chiaro/seppia
erano sotto 4,5:1. I colori di evidenziazione usano testo scuro esplicito anche
nel tema scuro. Nessun contenuto delle note viene troncato con ellissi.

I testi secondari misurati hanno minimo circa 5,03:1; istruzioni di selezione e
editor almeno 9,03:1, evidenziazioni almeno 13,04:1 nei tre temi. Sono misure
dei componenti ispezionati, non una certificazione completa WCAG.

Ispezionati il box e la citazione con i quattro colori, la lista, l'editor mobile,
il salto al passaggio e il comportamento con finestra ridotta. La prova
esplorativa comprende modifica/ripresa della lettura, alternanza Originale/testo,
riduzione/ripristino del viewport e apertura/chiusura della lista annotazioni.
Il collegamento all'originale apre realmente una scheda con URL blob locale.
Non osservati nuovi `pageerror` né overflow orizzontale nei viewport controllati.
Il controllo dei link di pubblicazione deve seguire il deploy della release.

## Limiti e verifiche manuali aperte

- PDF reale dello screenshot e corpus personale dell'utente.
- Android/iOS reali, selezione tramite maniglie native, tastiere virtuali e
  riapertura dopo chiusura del browser/sistema operativo.
- Permessi e file esterni su Windows/macOS/Linux/Android/iOS; OPFS non li sostituisce.
- Nell'Originale si conserva la pagina, non lo scorrimento o lo zoom interno.
- Ancore non risolte: nota conservata e avviso; nessun editor di riassociazione
  manuale. Per correggere, conservare il testo e ricreare il passaggio.
- OCR, colonne e layout complessi esclusi. Nessun merge o sincronizzazione cloud.
- Cache locale revocabile; download non equivale a conferma del file sul disco.
- Fase 5 non completata: migrazioni, recupero e gate temporali/dispositivi.
- Azure è il riferimento funzionale. L'anteprima incorporata può impedire il
  worker PDF a causa dell'origine opaca; non viene introdotto un parser alternativo.
