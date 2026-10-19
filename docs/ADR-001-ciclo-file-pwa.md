# ADR-001: ciclo dei file della PWA

Data: 19 ottobre 2026.
Stato: implementato come spike; gate dispositivi reali ancora aperto.

## Decisione e perimetro

Manteniamo la PWA statica e il ripiego approvato: scrittura diretta del JSON
quando disponibile, altrimenti importazione e download. La disponibilità è
rilevata dalle API effettivamente esposte, non dal nome del browser.

La Fase 1 usa una nota libera e una pagina numerica di prova. Non implementa
ricostruzione del PDF, navigazione reale o ancoraggio delle annotazioni.
L'apertura controlla l'intestazione e calcola SHA-256 sui byte: non certifica
che il PDF sia strutturalmente valido. L'originale è consultabile attraverso
il visualizzatore del browser, non quello futuro dell'app.

## Ciclo implementato

- **PDF:** aperto solo in lettura. SHA-256 indipendente da nome e percorso.
- **Creazione JSON:** nome suggerito `<documento>.annotations.json`. Un file non
  vuoto è rifiutato: va importato, non sovrascritto.
- **Permessi:** picker e richieste su gesto utente. Il debounce non apre prompt.
  Riapertura PDF e ricollegamento JSON sono azioni separate.
- **Scrittura:** debounce 700 ms, coda seriale, conferma solo dopo `close()`.
  Modifiche arrivate durante la scrittura restano pendenti.
- **Cache:** IndexedDB con copia di lavoro e handle. La cache recuperata è
  dichiarata come tale, non equivale al file esterno aggiornato. Quota o storage
  inaccessibili producono avviso e lasciano il download disponibile.
- **Fallback:** import esplicito e indicatore di modifiche non esportate.
  “Download avviato” non garantisce che l'utente abbia conservato il file.
- **Conflitti:** confronto byte-per-byte prima della scrittura con l'ultima copia
  letta/scritta. Divergenza: autoscrittura bloccata. Scaricare la copia locale prima
  di importare il JSON esterno.
- **Chiusura e update:** avviso con dati pendenti/non esportati; aggiornamento
  PWA bloccato finché non vengono conservati. Nessun salvataggio affidato alla chiusura.

Gli handle possono essere conservati in IndexedDB, i permessi possono richiedere
nuova autorizzazione e la scrittura viene confermata alla chiusura dello stream
([documentazione Chrome](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access)).

## Formato sperimentale

Schema `fluido/file-spike`, versione 1, distinto dal futuro schema
`pdf-fluid-reader/annotations`. Contiene hash/nome/dimensione del PDF, revisione,
nota e pagina di prova. Niente percorsi assoluti, immagini, handle o preferenze.
Non promettiamo compatibilità con il futuro MVP. Validazione dei campi, limite
di 1 MB per il testo JSON e rifiuto di hash/schema non corrispondenti.

## Matrice delle evidenze

Ambiente Linux del sandbox; build Vite di produzione; browser legati alla
versione Playwright registrata in `package-lock.json`.

| Ambiente                             | Prova                                                                                                       | Esito e limite                                                          |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Chromium Playwright                  | Import/export, cache, riapertura, PDF rinominato, JSON errati, offline                                      | Passato; non prova picker OS                                            |
| Firefox Playwright                   | Stesso ciclo fallback                                                                                       | Passato; non è Firefox Android                                          |
| WebKit Playwright                    | Stesso ciclo fallback                                                                                       | Passato; non è Safari reale su iOS/macOS                                |
| Chromium OPFS                        | Handle e stream reali, salvataggio, handle in IndexedDB, riapertura, conflitto                              | Passato; picker sostituiti da harness, non file del dispositivo         |
| Test unitari con adattatori simulati | Debounce, errore close, revoca, cache indisponibile, conflitto, scritture concorrenti della stessa sessione | Passato; non prova del filesystem OS                                    |
| Viewport 1280 e 375 px               | Documento caricato e temi chiaro/scuro                                                                      | Nessun overflow nel controllo locale; non è un dispositivo mobile reale |

30 test unitari e 27 casi browser: 25 passati, 2 skip intenzionali dell'harness
OPFS nei motori non Chromium. Il riferimento ad AC nei test indica copertura
parziale dello scenario, non approvazione dell'intero criterio MVP.

## Limiti aperti

- **Dispositivi:** nessuna certificazione di Safari/Android reali, installazione
  PWA o persistenza dei permessi fra riavvii. Servono le prove manuali sotto.
- **Concorrenza esterna:** confronto ottimistico, non compare-and-swap del
  filesystem. Usare una sola scheda in scrittura. Modifiche di app esterne
  fra controllo e commit restano un rischio; AC-29 non è certificato nell'MVP.
- **Crash/alimentazione:** cache tentata prima della scrittura; nessuna garanzia
  assoluta. Prima del debounce possono perdersi le ultime modifiche.
  AC-19 non è certificato.
- **Prestazioni:** SHA-256 calcolato in memoria; worker e documenti grandi saranno
  trattati nelle fasi del motore. Nessuna soglia introdotta.
- **Download ripetuti:** possibile suffisso automatico del browser; trasferire
  il JSON più recente insieme al PDF. Nessuna sincronizzazione.

## Checklist manuale

Usare una copia di prova di un PDF. Registrare sistema, browser/versione,
modalità scheda/PWA ed esito.

- [ ] Chrome/Edge desktop: aprire PDF, creare JSON, scrivere nota e pagina,
      attendere “scrittura confermata” e controllare il JSON sul disco.
- [ ] Ricaricare, riaprire PDF e autorizzare JSON: nota e pagina ripristinate.
- [ ] Chiudere completamente il browser e riprovare permessi e riapertura.
- [ ] Revocare permesso JSON: errore senza falsa conferma, download disponibile.
- [ ] Modificare JSON esternamente fra salvataggi: conflitto, nessuna sovrascrittura.
- [ ] Telefono/tablet: avviso fallback, download ritrovabile, riapertura PDF + JSON.
- [ ] Coppia PDF/JSON su altro dispositivo con cache vuota: stessa nota/pagina.
- [ ] JSON errato o di altro PDF: avviso, nota corrente conservata.
- [ ] Ripetere offline dopo la prima visita online.

## Gate

Percorso PWA e fallback verificati automaticamente. Gate complessivo aperto
fino alle prove manuali sui dispositivi target. Non avviamo automaticamente Fase 2.
