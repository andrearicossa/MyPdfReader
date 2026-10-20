# Main flows

## Apertura e tema

- Start: Azure o anteprima locale, schermata “Il tuo PDF, i tuoi file”.
- Steps: alternare tema, aprire un PDF con selettore standard o nativo.
- Expect: tema senza reload, nome/hash PDF, pannello “Testo ricostruito”; originale immutato.

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
- Expect: aggiornamento protetto; nuova versione 0.1.0-engine.3, stessi flussi su Azure.
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
