# Main flows

## Esito Fase 6

- Release `0.5.0-layout.1`: formattazione, lint, TypeScript e build superati.
- 113 test unitari e 138 test browser superati; sei esclusioni OPFS previste
  su Firefox/WebKit. Suite completa ripetuta su Azure: 138 superati, sei esclusi.
- CI e deploy riusciti per `aaf8257`; contesto fresco Azure con apertura PDF,
  nota nel box, download JSON verificato, pannelli desktop/mobile, Originale
  e nuova scheda PDF. Nessun `pageerror`, overflow orizzontale o comando primario
  tagliato nelle viste desktop/mobile esaminate.
- Anteprima aggiornata nello stesso asset; shell verificata tramite proxy,
  worker bloccato dall'origine opaca e permalink con verifica Cloudflare.
- Verificato anche lo zoom figura mobile a 125% e la chiusura del pannello.

## Fase 6: inventario prima dell'integrazione UI 01

- Baseline Azure aperta il 23/10/2026: `0.4.0-persistence.1`; repository pulito.
- Layout approvato: barra 76 px, lettura centrale con larghezza controllata,
  note laterali 318–320 px; breakpoint 900 px, barra bassa e note sovrapposte.
- Preservare motore PDF, apertura/riapertura, estrazione per pagina e LRU,
  box/citazioni, figure/zoom, Originale e collegamento al PDF in nuova scheda.
- Menu documento: cambia PDF, selettore standard, import/collegamento/download
  JSON, permessi, dettagli di hash e diagnostica. Nessun dato demo nella release.
- Stato breve sempre visibile e apribile; conflitto/errore persistente anche in
  Solo lettura. “JSON aggiornato” solo dopo scrittura riuscita, non al collegamento.
- Aspetto/Aa: stessi intervalli di font, dimensioni, margini, interlinea, tre
  temi e ripristino. Preferenza note desktop per dispositivo, non nel JSON.
- Annotazioni: selezione reale e toolbar contestuale, quattro colori, nota
  automatica, modifica, conferma cancellazione, Vai al passaggio; chiudere note
  e Aspetto non cambia punto. Mobile: modale con Escape, focus e ritorno al testo.
- Navigazione inferiore: precedente/successiva, salto e avanzamento reali.
  Solo lettura con uscita evidente; errore/annullamento/riprova restano disponibili.
- Persistenza Fase 5 invariata: cache, autoscrittura, fallback, CAS, due copie,
  conferme, schemi futuri protetti, update PWA e cambio PDF con dati pendenti.
- Regressione browser completa e prove nuove: resize desktop/mobile/desktop,
  chiusura/riapertura pannelli, note lunghe, editor, conflitti, font offline,
  finestra bassa, 375 px, tre temi e contrasto etichette.
- Nessuna cancellazione di cache o schema; gate fisici, picker OS e PDF reale
  ancora aperti, da non dichiarare chiusi con test headless.

## Fase 6: prova interattiva aggiuntiva della PWA

- Aggiornamento reale tra due build con worker attivo: notifica superiore e
  navigazione inferiore senza sovrapposizione a 1440 e 375 px.
- Modifica nota, “Aggiorna ora”: alert di protezione, nessun reload. “Più tardi”:
  notifica rimossa e nota presente. Esportare, riaprire la notifica, aggiornare,
  riaprire PDF: nota recuperata dal browser.
- Aprire il PDF originale in nuova scheda: URL `blob:` con pagina reale.
  Originale interno: canvas PDF.js visibile, ritorno alla lettura riuscito.
- Due schede con lo stesso PDF, versioni diverse della nota: banner di conflitto
  presente anche in Solo lettura; “Risolvi” apre il menu file mobile.
- Immagini controllate: desktop note, scuro, telefono scuro/seppia e note,
  tablet 768×1024, desktop 1280×500, PWA e conflitti. Nessun nuovo pageerror.

## Esito Fase 5

- Release `0.4.0-persistence.1`, codice `19a60d8`.
- 108 test unitari, 120 browser superati e sei esclusioni previste sia nella
  regressione locale sia sulla release Azure; 29 prove mirate superate.
- UI 01 approvata per la Fase 6, non integrata in questa release.
- Selezione e nota reali, download, Originale e apertura del PDF verificati
  anche nel browser persistente su Azure; nessun nuovo pageerror.
- Dettagli e screenshot: `docs/qa-fase5.md`, `evidence/phase5/`.
- Anteprima incorporata: worker bloccato dall'origine opaca; usare Azure.
- I gate su PDF dell'utente, picker OS e dispositivi fisici restano aperti.

## Fase 5: inventario prima delle modifiche

- Baseline Azure aperta il 22/10/2026: `0.3.0-annotations.1`, Fase 4.
- Layout UI 01 desktop/mobile approvato; integrazione nella Fase 6, non in questa release.
- Preservare tutti i percorsi precedenti: apertura PDF, estrazione per pagina,
  box/citazioni, figure/zoom, Originale, preferenze, selezione, CRUD e posizione.
- Persistenza: cache e avvio autoscrittura dopo 700 ms dall'ultima modifica;
  cache indipendente da stream lento; stato salvato solo dopo close riuscita.
- Ripiego: import/download reale, hash PDF verificato, indicatore modifiche
  non esportate, cache distinta dal file esterno, protezione aggiornamenti PWA.
- Conflitti file: scelta locale/esterna esplicita con conferma; nessun merge,
  nessun overwrite di schema futuro/invalido; cambiamenti durante la scelta rilevati.
- Conflitti tra schede: CAS IndexedDB, seconda copia non sovrascrive la prima,
  download locale disponibile e scelta esplicita prima di sostituire la cache.
- Compatibilità JSON v1 della Fase 4 e cache esistente; nessuna cancellazione,
  nessuna migrazione inventata da file-spike o dal prototipo; date solo informative.
- Errori: quota/cache indisponibile, permesso revocato, file mancante/non valido,
  close fallita, modifiche durante scrittura, riapertura senza permesso implicito.
- UI nuova limitata a controlli di recupero/stato, desktop/375 px, tre temi,
  finestra bassa e focus. Corpus sintetico e OPFS non chiudono gate hardware.

## Fase 4: verifica del 21/10/2026

- Release applicativa `b06639e`, versione `0.3.0-annotations.1`, inviata a main.
- Installazione pulita, audit senza vulnerabilità, formato, lint, tipi e build passati.
- 90 unitari superati; 107 browser superati e quattro esclusioni OPFS previste.
- Suite completa ripetuta sul sito Azure con gli stessi 107 passaggi e quattro skip.
- CI e deploy Azure conclusi con successo; link e dettagli in `docs/qa-fase4.md`.
- Percorso interattivo Azure in contesto pulito: selezione reale, quattro colori,
  note/editor, import errato, ancore non risolte, Originale e link al PDF locale.
- Desktop 1280×900, finestra 1280×500, tablet 768×1024, telefono 375×900;
  temi chiaro/scuro/seppia, contrasto misurato, nessun overflow orizzontale osservato.
- Prefissi/citazioni non risolti non inventano evidenziazioni. La lista conserva le note.
- Nessun nuovo errore `pageerror` nel percorso Azure. Anteprima aggiornata ma worker
  impedito dall'origine opaca dell'host; Azure rimane il riferimento funzionale.
- Restano aperti il PDF reale dell'utente, hardware touch/permessi esterni e Fase 5.

## Fase 4: inventario prima delle modifiche

- Selezionare un passaggio nel testo, in box/citazioni/attribuzioni; evidenziare
  in quattro colori o aggiungere una nota. Selezioni su più pagine: rifiuto esplicito.
- Colonna annotazioni desktop, pannello sotto la lettura su telefono; testo della
  nota modificabile, cambio colore, salto al passaggio, eliminazione confermata.
- Evidenziazioni sovrapposte, selezione inversa e da tastiera; testo con Unicode
  e contenuto simile a HTML sempre reso come testo, mai interpretato.
- Ancore: offset e citazione con contesto; riallineamento univoco soltanto,
  ancore ambigue/non risolte segnalate e mai applicate silenziosamente.
- Cambio carattere/dimensione/viewport e finestra virtuale: stessa citazione
  evidenziata; lista note raggiunge pagine non ancora estratte senza preanalisi.
- Posizione automatica nel nuovo stato: ripristino dopo riapertura/importazione,
  inclusa pagina non iniziale. Nessuna autoscrittura della posizione iniziale
  prima del ripristino; modifiche pendenti protette da update PWA/cambio PDF.
- JSON annotazioni dedicato, fingerprint verificato; export/import tra contesti
  puliti con font e schermi diversi. Vecchio DB e file-spike invariati, accessibili
  soltanto nella prova tecnica separata; nessuna migrazione distruttiva.
- Regressione completa Fasi 1–3: PDF immutato, import/download, errori/conflitti,
  PWA/offline, preferenze, pagine progressive, Originale e zoom.
- Visuale: 1280/768/375 px, finestra bassa, tutti i temi, pannello vuoto/popolato,
  editor, cancellazione, errore import e annotazione non risolta.

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
- Expect: aggiornamento protetto; versione corrente 0.3.0-annotations.1, stessi flussi su Azure.
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
