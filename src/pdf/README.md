# Adattatore PDF del browser

`DocumentReader` carica il file in un vero Web Worker PDF.js. `extractPage(number, signal)`
estrae run testuali e geometrie solo della pagina richiesta, poi invoca il dominio
puro in `src/core`. Cache LRU di massimo 8 pagine grezze, richieste simultanee alla
stessa pagina deduplicate; nessun precaricamento delle altre pagine.
Il caricamento iniziale e l'hash richiedono ancora l'intero file PDF in memoria.
La ricostruzione dei paragrafi è locale sul main thread; parsing ed estrazione PDF
sono nel worker. Non viene promesso il trasferimento di tutta l'elaborazione nel worker.

Il rendering è su richiesta, con ritagli limitati a 4 milioni di pixel e
1800 pixel sul lato maggiore. Anche l'anteprima della pagina originale usa lo
stesso adattatore, senza affidarsi a plugin PDF esterni.
`renderPage` non richiede di estrarre prima il testo. L'annullamento interrompe
l'attesa della UI, non il lavoro già inviato a `getTextContent` nel worker.

Il worker è esplicito: non c'è un fallback intenzionale al fake worker sul main
thread. Se non può avviarsi compare un errore. Le richieste HTTP caricano codice
e risorse statiche, non il PDF. `close()` distrugge il documento e termina il worker.

Vedere [ADR-002](../../docs/ADR-002-motore-pdf.md) per coordinate, normalizzazione,
euristiche, dipendenza, licenze e limiti.
Le modifiche successive a cache, margini, box e citazioni sono in
[ADR-003](../../docs/ADR-003-pagine-box-citazioni.md).
