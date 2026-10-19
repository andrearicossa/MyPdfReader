# Adattatore PDF del browser

`DocumentReader` carica il file in un vero Web Worker PDF.js, estrae run testuali
e geometrie delle figure, poi invoca il dominio puro in `src/core`.
La ricostruzione dei paragrafi è locale sul main thread; parsing ed estrazione PDF
sono nel worker. Non viene promesso il trasferimento di tutta l'elaborazione nel worker.

Il rendering è su richiesta, con ritagli limitati a 4 milioni di pixel e
1800 pixel sul lato maggiore. Anche l'anteprima della pagina originale usa lo
stesso adattatore, senza affidarsi a plugin PDF esterni.

Il worker è esplicito: non c'è un fallback intenzionale al fake worker sul main
thread. Se non può avviarsi compare un errore. Le richieste HTTP caricano codice
e risorse statiche, non il PDF. `close()` distrugge il documento e termina il worker.

Vedere [ADR-002](../../docs/ADR-002-motore-pdf.md) per coordinate, normalizzazione,
euristiche, dipendenza, licenze e limiti.
