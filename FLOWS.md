# Main flows

## Esito Fase 3 (21/10/2026)

Build di produzione verificata da installazione pulita: 66 test unitari superati,
79 test browser superati e 2 esclusioni OPFS previste. Ripetizione del percorso
scorrimento/reflow/Originale: 12/12. Verifica visiva desktop/tablet/mobile e altezza
ridotta, temi, box/citazioni, Originale, figure/zoom, errore e riprova; nessun
nuovo pageerror. Dettagli e limiti in `docs/qa-fase3.md`.

## Fase 3: delta e controlli prima della pubblicazione

- Vista principale “Lettura fluida”, vista tecnica ancora accessibile. Apertura:
  una sola pagina estratta; caricamento su scorrimento volontario o “Continua”.
- Finestra di massimo 5 pagine renderizzate, navigazione diretta, ritorno alle
  pagine precedenti senza salto del contenuto visibile.
- Preferenze: carattere, dimensione, interlinea, margini e chiaro/scuro/seppia;
  persistono in un nuovo database IndexedDB indipendente dal JSON e dai documenti.
- Originale sincronizzato alla pagina visibile; ritorno al medesimo punto della
  finestra. Modifica tipografia conserva un ancoraggio visivo approssimativo.
- Figure nel flusso, rendering su visibilità, zoom con controlli, doppio tocco e
  pinch; chiusura con Escape e ritorno alla lettura. Verificare raster e vettori.
- Corpus: 200 pagine senza estrazione preventiva, box/citazioni, scansione,
  colonne, errori/riprova, cambio documento durante richiesta pendente.
- Desktop 1280, tablet 768 e mobile 375; tutti i temi, tastiera, offline, storage
  non disponibile. Nessuna migrazione del vecchio database o del JSON.
- Posizione soltanto in memoria durante la sessione: persistenza automatica del
  punto di lettura e annotazioni non fanno parte di questa fase.

## Apertura e tema

- Start: Azure o anteprima locale, schermata “Il tuo PDF, i tuoi file”.
- Steps: alternare tema, aprire un PDF con selettore standard o nativo.
- Expect: tema senza reload, nome/hash PDF, “Lettura fluida” e accesso a “Vista tecnica”; originale immutato.

## Lettura e figure

- Steps: selezionare pagina, mostrare/nascondere figura, alternare Originale e testo.
- Expect: pagina selezionata corretta, raster/vettore non bianco, nessun upload.
- Change: prima pagina subito, “Vai alla pagina”, precedente/successiva; nessuna estrazione
  di pagine non richieste, cache limitata, filtro margini progressivo.
- Checks: 200 pagine ma un solo GetTextContent all'apertura; salto 35 senza pagine
  intermedie; ritorno in cache senza estrazione, cancellazione/errore/riprova e cambio rapido.

## Box e citazioni

- Steps: aprire corpus equivalente allo screenshot, leggere box multi-paragrafo e citazione.
- Expect: testo selezionabile una volta sola, ordine conservato, attribuzione distinta;
  box non duplicato come figura, immagini vere ancora disponibili.
- Checks: rettangoli chiusi e a quattro segmenti, sfondi, rientro semplice da non
  confondere con citazione, liste/tabelle, immagini in box, offset UTF-16 di gruppi e figli.
- Visual: desktop 1280 e mobile 375, chiaro/scuro, box/quote/Originale/avvisi, nessun overflow.
- Limite: screenshot originale disponibile, non PDF reale; riconoscimento euristico.

## Persistenza separata

- Steps: creare/importare JSON, modificare nota/pagina di prova, attendere o scaricare;
  ricaricare e riconnettere/importare nel contesto vuoto.
- Expect: dati conservati, conflitto/permessi espliciti, JSON di altro PDF respinto.
- Checks: prima/successiva pagina diagnostica non modifica il JSON; schema/cache invariati.

## Errori e offline

- Steps: PDF falso, incompleto, cifrato; scansione e colonne; reload offline dopo installazione.
- Expect: note precedenti intatte, avviso e Originale disponibile, worker/font locali offline.
- Exploratory: navigazione mentre l'estrazione ritardata è pendente; pagina vuota, 0/fuori
  intervallo, annullamento e cambio documento; niente contenuto obsoleto mostrato come corrente.

## Aggiornamento e pubblicazione

- Steps: aggiornare PWA con dati pendenti, poi dopo download; aprire link live in contesto vuoto.
- Expect: aggiornamento protetto; nuova versione 0.2.0-reader.1, stessi flussi su Azure.
- Preview: verificare link restituito separatamente; eventuali limiti iframe dichiarati.

## Verifica locale del 20/10/2026

- 62 test unitari passati; 58 casi browser passati sui tre motori, 2 skip OPFS previsti.
- Installazione pulita, formato, lint, tipi e build di produzione passati.
- Ispezione visiva 1280/375 px, entrambi i temi, testo/box/citazione/Originale/avviso colonne.
- Esplorazione: cambio documento mentre una richiesta testuale è ritardata; il nuovo
  documento conserva un solo box e il risultato tardivo non lo sostituisce. Nessun
  errore JavaScript osservato. Pagina 0, cache espulsa e navigazione rapida negli E2E.
- Le prove su file esterni del dispositivo e sul PDF originale dello screenshot
  restano escluse; non sostituite da viewport emulati o corpus sintetico.
