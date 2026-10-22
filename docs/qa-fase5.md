# QA della Fase 5

Data: 22/10/2026. Versione: `0.4.0-persistence.1`.
Perimetro: persistenza e recupero; layout UI 01 approvato per la Fase 6.

## Ambiente e controlli

PWA statica Preact/Vite, nessuna nuova dipendenza runtime. Installazione pulita
con `npm ci`, audit, controllo formato, ESLint, TypeScript, test unitari e build
di produzione. Corpus sintetico, nessun PDF dell'utente trasferito a un server.

Browser automatici Chromium, Firefox e WebKit headless. OPFS viene esercitato
solo nell'harness Chromium: non certifica selettori del sistema operativo né
permessi di scrittura sui file locali esterni.

## Copertura aggiunta

- **Tempi**: debounce 700 ms con clock controllato; verifica nel browser della
  cache entro due secondi dopo la modifica di una nota. La coda cache prosegue
  mentre lo stream esterno è fermo, senza scartare modifiche successive.
- **Download**: JSON disponibile senza attendere lo stream; l'esportazione non
  annulla un autosalvataggio del file ancora dovuto. Nessun falso ritorno allo
  stato modifiche non esportate alla scadenza del debounce.
- **File**: scelte locale ed esterna, download dello snapshot rilevato, stato
  confermato dopo chiusura, nuova scelta se la sorgente cambia ancora. File
  futuro, invalido o di altro PDF protetto dalla sovrascrittura.
- **Schede**: due viste nello stesso contesto, transazioni CAS reali IndexedDB,
  nessuna sostituzione silenziosa, annullamento e conferma delle due scelte,
  download di entrambe le versioni. Chiudere una scheda obsoleta non riscrive
  la copia scelta.
- **Quota**: errore durante `put`, transazione abortita senza `pageerror`,
  cache precedente intatta, JSON corrente scaricabile e protezione aggiornamento.
- **Compatibilità**: v1 della Fase 4 senza data alla radice, round-trip di
  `updatedAt`, date invalide rifiutate; cache futura preservata senza azzeramento.
- **Portabilità**: riapertura della cache in modalità manuale; export/import
  in un contesto separato e offline dopo il precaching, con annotazioni conservate.
- **Regressione**: PDF/worker reali, estrazione per pagina, LRU, box/citazioni,
  figure, Originale, flusso di lettura, preferenze, selezione, colori, CRUD, punto
  di lettura, documenti errati, PWA e prova file separata.

## Controllo visivo

Scelta del conflitto e stati di salvataggio verificati con interazioni reali in
un browser persistente. Desktop 1280×900, mobile 375×900 e desktop basso
1280×500; controllo di overflow orizzontale, annullamento e focus da tastiera.
Temi chiaro, scuro e seppia. Screenshot in `evidence/phase5/`.

Sul testo secondario del nuovo pannello è stato campionato un contrasto di
5,03:1 chiaro, 5,12:1 scuro e 5,16:1 seppia. Sono campioni puntuali, non una
certificazione completa di accessibilità.

La UI di lettura non viene ridisegnata in questa release. I nuovi pulsanti di
recupero dovranno essere mantenuti nell'integrazione del layout UI 01.

## Risultati e pubblicazione

- Installazione pulita e audit: zero vulnerabilità rilevate.
- Formato, lint, TypeScript e build superati.
- 108 test unitari superati in nove file.
- Prima regressione locale completa: 120 test browser superati, sei esclusioni
  OPFS previste su 126 casi, tre motori. Nessuna regressione dei 111 casi
  preesistenti.
- Ripetizione mirata dopo le rifiniture di stato: 29 test superati e quattro
  esclusioni previste, su file, adattatore nativo e persistenza nei tre motori.
- Pubblicazione, controllo CI e ripetizione su Azure in corso; i riferimenti
  verranno registrati dopo la conclusione delle esecuzioni.

## Gate manuali che restano aperti

- File esterni reali: picker, revoca, ricollegamento e concorrenza con editor OS.
- Dispositivi fisici Android/iOS, installazione PWA e Safari installato.
- PDF originale dell'utente, figure e box della sua pagina 35.
- Prestazioni su documenti reali: non è stata concordata una soglia MVP globale.
- Perdita improvvisa del processo: lifecycle e timer rimangono best effort,
  non una garanzia contro terminazione forzata o indisponibilità del disco.
