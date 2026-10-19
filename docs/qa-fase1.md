# QA della Fase 1

## Inventario di verifica

| Controllo o stato             | Verifica funzionale                        | Verifica visiva                     |
| ----------------------------- | ------------------------------------------ | ----------------------------------- |
| Apri PDF / selettore standard | File locale, hash, falso PDF respinto      | Stato iniziale e documento caricato |
| Apri originale                | Blob con byte invariati                    | Link distinto dal salvataggio       |
| Crea e collega JSON           | Unit test e harness OPFS Chromium          | Pulsante distinto dal PDF           |
| Importa/collega JSON          | Schema, identità, import su contesto vuoto | Errore leggibile                    |
| Nota e pagina                 | Debounce, ripristino, Unicode              | Etichette e avviso di prova         |
| Scarica JSON                  | Download reale e import su altro contesto  | Nessun “salvato” ingannevole        |
| Riapri/ricollega              | Veri handle OPFS ripristinati da IndexedDB | Azioni esplicite                    |
| Errore/revoca                 | Simulazioni: cache e lavoro conservati     | Errore distinto                     |
| Conflitto                     | Copia esterna non sovrascritta             | Scrittura bloccata                  |
| Cache recuperata              | Reload e stessa identità                   | Non dichiarata file esterno         |
| Tema                          | Click reale                                | Desktop/mobile chiaro/scuro         |
| Offline                       | Service worker e reload senza rete         | Pagina utilizzabile                 |
| Aggiornamento PWA             | Evento cancellabile con dati pendenti      | Avviso prima del reload             |

## Esplorazione fuori dal percorso principale

- JSON invalido e di altro PDF dopo una modifica: nota corrente conservata.
- Cambiamento durante `close()`: revisione successiva scritta al giro seguente.
- Nome lungo e hash su 375 px: nessun overflow.
- Chiusura/cambio documento con dati non esportati: avviso, niente salvataggio implicito.

## Evidenze e limiti

30 test unitari, 25 casi browser passati, 2 skip intenzionali per OPFS non
Chromium. Screenshot della build locale desktop/mobile chiaro/scuro.
Nessuna prova manuale sui dispositivi dell'utente.

Vedere [ADR-001](ADR-001-ciclo-file-pwa.md) per la matrice e la checklist manuale.
OPFS non sostituisce la verifica dei dialoghi OS e dei file esterni.
