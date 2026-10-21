# QA della Fase 3

Data: 21/10/2026. Versione: `0.2.0-reader.1`.

## Ambito e ambiente

Lettura fluida su PWA statica, senza backend o upload. Il PDF rimane immutato.
Decisioni in [ADR-004](ADR-004-lettura-fluida.md); nessuna modifica al formato
JSON sperimentale o al database dei documenti. Il nuovo database delle preferenze
è indipendente e non richiede migrazioni dei dati precedenti.

- **Ambiente locale**: build di produzione Vite, Playwright Chromium/Firefox/WebKit.
- **Ambiente di utilizzo**: [Fluido su Azure](https://proud-desert-027a07a10.1.azurestaticapps.net).
- **Codice e workflow**: [MyPdfReader](https://github.com/andrearicossa/MyPdfReader).
- **Corpus**: PDF sintetici riproducibili in `tests/fixtures/pdf-corpus.mjs`,
  incluso documento da 200 pagine, testo lungo, raster, vettori, box, citazioni,
  scansioni, colonne, errori e richieste ritardate.

## Controlli automatici

- **Installazione pulita**: `npm ci`, nessuna nuova dipendenza; audit senza vulnerabilità.
- **Qualità**: formattazione, ESLint, TypeScript e build verificati.
- **Unità**: 66 test superati; inclusi normalizzazione, limiti delle preferenze
  e finestra di lettura a cinque pagine.
- **Regressione browser completa**: 79 test superati e 2 esclusioni previste
  su 81 casi, con un worker e tutti e tre i browser. Lo scenario scorrimento,
  reflow e Originale è stato anche ripetuto quattro volte per browser: 12/12 superati.
- **Verifica online**: ripetere la suite su Azure dopo il deployment, con il
  comando della sezione seguente; la sola verifica locale non certifica il rilascio.

I due test con handle OPFS reali vengono eseguiti soltanto su Chromium:
Firefox e WebKit non espongono la stessa API. Questo non certifica i selettori
file nativi, i permessi persistenti o la scrittura su file utente nei dispositivi reali.

### Ripetere la verifica sul sito Azure

Attendere il completamento del workflow Azure per il commit di rilascio, quindi
eseguire la stessa suite senza il server locale:

```sh
E2E_BASE_URL=https://proud-desert-027a07a10.1.azurestaticapps.net npm run e2e -- --workers=1
```

Aprire inoltre un contesto browser nuovo, verificare il footer `0.2.0-reader.1`
e caricare un PDF. Il collegamento di utilizzo è Azure, non l'iframe dell'anteprima.

## Funzioni e regressioni coperte

- **Progressività**: un solo `GetTextContent` all'apertura; salto diretto a 35
  senza estrazione intermedia; continuazioni richieste una alla volta, massimo
  cinque pagine nel DOM e caricamento della precedente. Focus e scorrimenti
  automatici del browser non fanno partire una lettura preventiva dell'intero PDF.
- **Scorrimento e punto corrente**: pagina visibile, navigazione numerica e
  precedente/successiva; ancoraggio frazione/blocco dopo cambio font e larghezza.
  Conservazione della finestra nel passaggio testo/Originale; navigazione
  nell'Originale senza estrazione di testo fino al ritorno.
- **Preferenze**: carattere con/senza grazie, dimensione, interlinea, margini,
  chiaro/scuro/seppia, ripristino; conferma della scrittura, riapertura offline e
  preferenze temporanee dichiarate se IndexedDB non è disponibile.
- **Figure**: raster e vettori nel flusso, zoom, adatta, doppio clic, Escape.
  Doppio tocco e pinch verificati con input touch Chromium/CDP; non solo eventi
  sintetici inviati direttamente ai gestori dell'app.
- **Contenuti critici**: box selezionabili non duplicati, citazioni con
  attribuzione, scansioni e colonne con avviso e accesso all'Originale.
- **Errori**: errore di estrazione e riprova, interruzione, navigazione mentre
  una risposta ritardata è pendente; il risultato obsoleto non sostituisce il corrente.
- **Compatibilità precedente**: diagnostica della Fase 2, hash del PDF invariato,
  JSON separato, import/download, recupero della cache, permessi/conflitti e
  protezione dell'aggiornamento PWA con modifiche pendenti.

## Verifica visiva e interattiva

Controlli separati dai test automatici tramite Chromium in sessione persistente:
desktop 1280 px, tablet 768 px, mobile 375 px e finestra desktop alta 500 px.
Ispezionati lettura, impostazioni, box/citazione, Originale e dialogo figura.
Nessun overflow orizzontale nei viewport verificati; controlli su più righe e
scorrimento esterno nelle finestre basse, senza comprimere il testo.

I temi chiaro, scuro e seppia sono stati ispezionati. Il contrasto del testo
secondario sulla superficie principale misura rispettivamente circa 5,03:1,
5,12:1 e 5,16:1; non è una certificazione completa WCAG.
Il collegamento esterno all'originale apre effettivamente il PDF locale in una
nuova scheda. Nessun nuovo errore `pageerror` nel percorso interattivo verificato.

## Limiti e controlli ancora manuali

- **PDF originale dell'utente**: non ricevuto. Lo screenshot della pagina 35
  non permette di verificare l'estrazione di quel file; box/citazioni restano euristici.
- **Hardware reale**: restano da provare Android/Brave o Chrome, iPhone/iPad/Safari,
  tablet e desktop con file reali; in particolare gesti, tastiera virtuale e permessi.
  Playwright WebKit non equivale a Safari su iOS.
- **Posizione**: solo in memoria, con ancoraggio approssimativo per blocco.
  Ricaricare, riaprire il documento o passare dalla vista tecnica ricrea la
  lettura dalla prima pagina. Non è ancora il segnalibro persistente.
- **Memoria e prestazioni**: cinque pagine nel DOM e otto in cache grezza non
  limitano il file intero o le cache PDF.js. Nessuna soglia prestazionale certificata.
- **Figure**: zoom fino al 400%, senza ricostruire dettagli oltre la risoluzione
  del renderer esistente. Posizionamento incerto dichiarato quando rilevato.
- **Anteprima Perplexity**: origine opaca e worker PDF limitano l'apertura dei
  PDF nell'iframe. Per utilizzare il lettore aprire il sito Azure; non viene
  introdotto un worker fittizio o un backend per aggirare il limite.
- **Fuori ambito**: evidenziazioni, annotazioni reali, OCR, layout complessi,
  sincronizzazione cloud e salvataggio automatico della posizione di lettura.
