# Decisioni – Analisi tecnica lettore PDF (integrazione)

Data: 19/10/2026 · Riferimento: `analisi_tecnica_lettore_pdf.md`, sezione "Decisioni aperte" · Esito: **tutte le decisioni chiuse**

| #   | Decisione aperta                                          | Esito                                                            | Note e impatto sulla specifica                                                                                                                                                                                                                                                    |
| --- | --------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Sistemi, browser e contenitori target                     | **Approvata**: PWA statica su Azure Static Web Apps (piano Free) | Nessun backend; l'hosting fornisce HTTPS. Il service worker appartiene all'app, non all'hosting. Browser di riferimento: Chromium (desktop/Android), Safari (iOS/macOS), Firefox.                                                                                                 |
| D2  | Aggiornamento automatico del file su tutte le piattaforme | **Approvata con eccezione**                                      | Dove il browser consente la scrittura su file scelto (File System Access API, oggi Chromium desktop) il file associato viene aggiornato automaticamente. Altrove: stato salvato nel browser, **indicatore "modifiche non esportate"** e pulsante di download del file aggiornato. |
| D3  | Scelta PWA / Tauri                                        | **Approvata: PWA**                                               | Tauri resta un'evoluzione possibile; il motore di lettura resta indipendente dall'accesso ai file.                                                                                                                                                                                |
| D4  | File unico per annotazioni e posizione                    | **Approvata**                                                    | Un solo file JSON associato al PDF: evidenziazioni, note, punto di lettura.                                                                                                                                                                                                       |
| D5  | Figure e layout complessi                                 | **Approvata**                                                    | Figure coperte (visualizzazione e zoom). Supporto MVP limitato a layout semplici (colonna singola, testo selezionabile). Multi-colonna, tabelle complesse e scansioni (OCR) esclusi.                                                                                              |
| D6  | Corpus, dispositivi e soglie prestazionali                | **Rinviata**                                                     | Nessuna soglia per l'MVP; si misurano i tempi reali (apertura, ricostruzione testo) e si fissano le soglie dopo il primo rilascio. I criteri prestazionali diventano informativi, non bloccanti.                                                                                  |
| D7  | Preferenze portabili vs globali                           | **Approvata: globali per dispositivo**                           | Dimensione font, tema, interlinea e margini salvati nell'app per singolo dispositivo. Nel file associato solo annotazioni e posizione. Se necessarie in futuro, le preferenze per documento sono un'estensione successiva del file JSON.                                          |
| D8  | Licenza                                                   | **Approvata: MIT**                                               | PDF.js è distribuito con Apache-2.0, compatibile con MIT.                                                                                                                                                                                                                         |
| D9  | Avvio persistenza entro 2 secondi                         | **Approvata (provvisoria)**                                      | Il salvataggio parte entro 2 s dall'ultima modifica; rivedibile dopo l'MVP.                                                                                                                                                                                                       |

## Impatto sull'analisi tecnica

Con D7 e D8 chiuse, la sezione 3 dell'analisi tecnica va aggiornata così:

- Sostituire la proposta sulle preferenze per documento con: **preferenze di lettura globali per dispositivo, salvate nell'app**.
- La riga del file JSON "eventuali preferenze del documento" (sezione 9) si lascia nel campo schema come riserva, ma non viene popolata nell'MVP.
- Aggiungere la licenza MIT al criterio trasversale AC-32.

## Stato

Tutte le decisioni aperte sono chiuse. L'analisi tecnica passa a **approvata** e si può procedere con il piano di implementazione, già predisposto in `piano_implementazione_lettore_pdf.md`.
