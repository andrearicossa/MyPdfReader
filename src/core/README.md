# core — motore di lettura (dominio puro)

Modulo di dominio del lettore: ricostruzione del testo, modello di lettura, ancora delle
annotazioni e schema del file associato. `reading-model.ts` implementa la Fase 2:
normalizzazione versionata, blocchi, offset e geometrie per pagina.
L'adattatore PDF.js è in `src/pdf`, fuori dal dominio puro.
Nella Fase 1 `file-spike.ts` definisce esclusivamente il formato sperimentale
della prova e la sua validazione, non lo schema definitivo delle annotazioni.

## Regola architetturale (verificata da ESLint)

`core` **non importa** codice da `ui` o `storage` e **non usa** API del browser
(`window`, `document`, `fetch`, `localStorage`, `indexedDB`).

Questo mantiene il motore riutilizzabile con contenitori diversi (PWA oggi, Tauri o
provider cloud in futuro) e testabile in Node senza browser. Le integrazioni concrete
— ad esempio PDF.js — vivono in adattatori, non qui.
