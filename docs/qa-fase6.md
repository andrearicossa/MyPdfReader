# QA della Fase 6

Versione: `0.5.0-layout.1`. Data: 23/10/2026.
Stato: regressione locale superata; pubblicazione e verifica Azure in corso.

## Risultati locali

- Formattazione, lint, TypeScript e build di produzione: superati.
- Vitest: 113 test superati in 10 file.
- Playwright: 138 test superati, sei esclusioni previste, nessun fallimento
  nell'esecuzione completa finale su Chromium, Firefox e WebKit (144 casi).
- Le sei esclusioni riguardano tre scenari con handle OPFS su Firefox e WebKit;
  non costituiscono una verifica dei selettori del sistema operativo.

## Copertura

- Regressione completa del motore e dei flussi delle Fasi 1–5: caricamento,
  hash/PDF immutato, estrazione per pagina, cache LRU, cancellazione/errori,
  box/citazioni, figure, Originale, ancore e posizioni, import/export, offline,
  cache non disponibile, stream OPFS, conflitti, copie e protezioni PWA.
- Nuovo layout: desktop/mobile/desktop nella stessa pagina, note ricordate per
  dispositivo, finestra 1280×500, telefono 375×812, pannelli e barre entro viewport.
- Tastiera: ciclo Tab/Shift+Tab nel pannello, Escape, focus restituito al comando;
  Solo lettura ed uscita, sfondo modale, passaggio alla nota e ritorno al testo.
- Posizione: apertura/chiusura note e Solo lettura non spostano il passaggio.
- Densità: 24 note, nota lunga, scroll note indipendente, riapertura editor sullo
  stesso segno dopo chiusura del pannello, salto da pannello mobile.
- Stato reale: import/collegamento diversi da scrittura conclusa; errore e
  conflitto prioritari; avviso persistente con note chiuse e in Solo lettura.
- Tre temi, font self-hosted disponibili offline, nessuna libreria UI aggiuntiva.

## Verifiche interattive locali

Sessione persistente Chromium, input reali e PDF sintetico del corpus:

- Selezione trascinata nel box, colore verde, creazione/modifica della nota,
  chiusura e riapertura; lettura centrale e note separate nel tema chiaro.
- Temi scuro e seppia su telefono, nota nel pannello sovrapposto; tablet 768×1024
  e finestra desktop 1280×500. Nessun overflow orizzontale o comando principale
  tagliato nelle immagini esaminate.
- Link “Apri PDF originale” attivato: nuova scheda `blob:` con `#page=1`.
  Vista Originale interna verificata con canvas reale di 1190×1684 pixel,
  poi ritorno al testo.
- Aggiornamento SW reale tra due build: notifica riserva una riga superiore
  (54 px nel viewport desktop), lettore e navigazione rimangono accessibili.
  “Aggiorna ora” con nota non esportata mostra il blocco previsto; “Più tardi”
  rimuove la notifica senza perdere il lavoro. Download del JSON, riapertura
  della notifica e aggiornamento effettivo; riapertura del PDF recupera la nota.
- Conflitto reale di cache tra due schede: avviso visibile con colonna note
  chiusa e in Solo lettura; “Risolvi” apre il pannello file anche sul telefono.
- Figura su telefono: apertura dello zoom, incremento reale a 125% e chiusura
  accessibile con ritorno al lettore.
- Nessun `pageerror` nelle prove interattive sul lettore locale.

Durante il collaudo sono stati corretti il ciclo Tab dei pannelli, la notifica
PWA che in Firefox copriva la navigazione inferiore e un contrasto transitorio
al cambio tema in WebKit. I test del ridimensionamento attendono la consegna
asincrona di `matchMedia` prima di interagire con il nuovo pannello.

Le immagini in `evidence/phase6/` usano esclusivamente PDF e note sintetiche.
Non rappresentano il PDF dell'utente né una prova su hardware fisico.

## Gate aperti e limiti

- PDF originale dell'utente non ricevuto; lo screenshot non è un corpus PDF.
- Dispositivi fisici Android/iOS/desktop, picker OS, installazione/aggiornamento
  PWA e usabilità con tastiera virtuale richiedono ancora prove manuali.
- Nessuna soglia prestazionale nuova o benchmark dichiarato; PDF completo
  ancora letto per hash/caricamento, estrazione testo progressiva per pagina.
- Nessun OCR, supporto generale a colonne o layout complessi, cloud sync o
  collegamento Drive/OneDrive.
- Il prototipo UI 01 rimane separato dall'applicazione. Il contenitore di
  anteprima non è il riferimento per il worker: verificare su Azure.

## Riferimenti

- [ADR-007](https://github.com/andrearicossa/MyPdfReader/blob/main/docs/ADR-007-layout.md)
- [Repository](https://github.com/andrearicossa/MyPdfReader)
- [Applicazione Azure](https://proud-desert-027a07a10.1.azurestaticapps.net/)
