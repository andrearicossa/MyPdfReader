# core — motore di lettura (dominio puro)

Modulo di dominio del lettore: ricostruzione del testo, modello di lettura, ancora delle
annotazioni e schema del file associato. Il motore arriva dalla Fase 2 del piano.
Nella Fase 1 `file-spike.ts` definisce esclusivamente il formato sperimentale
della prova e la sua validazione, non lo schema definitivo delle annotazioni.

## Regola architetturale (verificata da ESLint)

`core` **non importa** codice da `ui` o `storage` e **non usa** API del browser
(`window`, `document`, `fetch`, `localStorage`, `indexedDB`).

Questo mantiene il motore riutilizzabile con contenitori diversi (PWA oggi, Tauri o
provider cloud in futuro) e testabile in Node senza browser. Le integrazioni concrete
— ad esempio PDF.js — vivono in adattatori, non qui.
