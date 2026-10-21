# Fluido — Lettore PDF in modalità fluida

Lettore PDF leggero e open source: il testo del documento si legge come un ebook, con font
regolabile. Il PDF originale non viene mai modificato. Il progetto prevede evidenziazioni,
note e posizione di lettura in un file JSON separato, portabile su altri dispositivi;
queste funzioni non sono ancora disponibili nella vista fluida.

**Stato: Fase 3 (lettura fluida, non ancora annotazioni e segnalibro persistente).**
La PWA estrae nel worker PDF.js solo la pagina selezionata, senza elaborare le altre
in anticipo. Mantiene una cache LRU di 8 pagine visitate e ricostruisce paragrafi,
titoli, box rettangolari semplici e citazioni rientrate con attribuzione esplicita.
Il testo nei gruppi resta selezionabile; le immagini vere restano ritagli su richiesta.
Il file PDF viene comunque letto interamente per caricamento e hash, non a intervalli.
Include confronto con
l'Originale e avvisi per layout non supportati. La vista principale ha scorrimento
progressivo, finestra di cinque pagine, tipografia regolabile e figure con zoom.
Le preferenze globali sono in un database IndexedDB separato; in caso di errore
restano temporanee con avviso. Annotazioni vere e posizione di lettura persistente
sono ancora da implementare.
La nota e la pagina del pannello di persistenza rimangono dati di prova della Fase 1.
Il formato dati `fluido/file-spike v1` è sperimentale, non il formato definitivo MVP.

La scrittura diretta è disponibile solo se il browser espone le API e l'utente concede i
permessi; altrove importazione/download sono espliciti, con avviso prima dell'uso.
Cache e handle sono salvati in IndexedDB quando disponibile. La cache non sostituisce il
file. Gli aggiornamenti PWA vengono bloccati quando ci sono dati non ancora conservati.

Vedere [ADR-001](docs/ADR-001-ciclo-file-pwa.md) per matrice testata, limiti e checklist
da eseguire sui dispositivi reali. Il gate della Fase 1 è ancora aperto per quelle prove.
Per il motore: [ADR-002](docs/ADR-002-motore-pdf.md),
[ADR-003: pagine, box e citazioni](docs/ADR-003-pagine-box-citazioni.md) e
[QA Fase 2](docs/qa-fase2.md). Il riconoscimento dei gruppi è euristico, non una
garanzia su qualsiasi PDF; il documento dello screenshot dell'utente non è disponibile
come PDF ed è ancora da verificare. Nessun OCR o supporto a layout complessi.
Per la vista fluida: [ADR-004](docs/ADR-004-lettura-fluida.md) e
[QA Fase 3](docs/qa-fase3.md). Il sito Azure è il riferimento funzionale;
l'anteprima incorporata può impedire l'avvio del worker PDF.

## Requisiti

- Node.js 20.16+ oppure 22.3+ (vedi `.nvmrc` e requisiti di PDF.js)

## Comandi

| Comando             | Descrizione                                               |
| ------------------- | --------------------------------------------------------- |
| `npm install`       | Installa le dipendenze                                    |
| `npm run dev`       | Server di sviluppo                                        |
| `npm run build`     | Build di produzione in `dist/`                            |
| `npm run preview`   | Serve `dist/` in locale                                   |
| `npm run lint`      | ESLint (include la regola architetturale su `core`)       |
| `npm run typecheck` | Controllo tipi TypeScript                                 |
| `npm test`          | Test unitari (Vitest)                                     |
| `npm run e2e`       | Test end-to-end con Playwright (richiede `npm run build`) |
| `npm run format`    | Formatta il codice con Prettier                           |
| `npm run icons`     | Rigenera le icone PNG in `public/icons/`                  |

Nota: il file `.npmrc` di progetto imposta `legacy-peer-deps=true` per aggirare un bug
noto di npm 10.8.x nella risoluzione dei peer di `@preact/preset-vite`; così l'installazione
è identica in locale e in CI, senza flag manuali. I peer effettivi sono tutti soddisfatti
(una sola copia di Vite 6) e `npm audit` è pulito.

## Eseguire le prove

```sh
npm ci
npx playwright install --with-deps chromium firefox webkit
npm run build
npm test
npm run e2e
```

Gli E2E eseguono tre motori desktop in Linux; il viewport stretto non è una
certificazione dei dispositivi mobili. L'harness nativo Chromium usa veri handle OPFS
con picker sostituiti, non file esterni o finestre OS.

Per provare il sito già pubblicato (solo con file sintetici di test):
`E2E_BASE_URL=https://proud-desert-027a07a10.1.azurestaticapps.net npm run e2e`.

## Struttura

```
src/
  core/     # motore di lettura: dominio puro, nessuna API browser (Fase 2)
  pdf/      # adattatore browser PDF.js, worker e rendering su richiesta
  storage/  # adattatori di persistenza: file system, import/export, IndexedDB (Fasi 1 e 5)
  ui/       # componenti e stili
  pwa/      # registrazione service worker e banner aggiornamenti
  styles/   # token di design, stili di base, stili dell'app
public/     # manifest, icone, configurazione Azure Static Web Apps
tests/
  unit/     # Vitest
  e2e/      # Playwright: shell online, offline e cambio tema
docs/       # analisi tecnica, decisioni e piano di implementazione
```

### Regola architetturale

`src/core` è un modulo di dominio puro: **non importa** `ui` o `storage` e **non usa** API
del browser (`window`, `document`, `fetch`, `localStorage`, `indexedDB`). La regola è
applicata da ESLint (`eslint.config.js`): `npm run lint` fallisce se viene violata. Questo
consente di riutilizzare il motore in futuro con Tauri o provider cloud senza riscriverlo.

## PWA

- Manifest statico e ispezionabile in `public/manifest.webmanifest` (nome dell'app: "Fluido",
  modificabile lì e in `index.html`).
- Service worker generato da Workbox con precache dell'intera shell: dopo la prima visita
  l'app funziona senza rete (verificato dal test E2E dedicato).
- Aggiornamenti controllati dall'utente: quando esce una nuova versione appare un banner
  "Nuova versione disponibile" e l'aggiornamento avviene solo su conferma. Nessun ricaricamento
  automatico: nelle fasi successive potrebbero esserci modifiche non ancora salvate.
- Il tema chiaro/scuro segue la preferenza di sistema ed è modificabile per la sessione; la
  persistenza delle preferenze arriva con gli adattatori di storage.

## Deploy su Azure Static Web Apps (piano Free)

1. Creare un repository GitHub con questo codice (il progetto include già la cronologia git
   locale) e caricarlo sul proprio account.
2. Nel [portale Azure](https://portal.azure.com) creare una risorsa **Static Web App**:
   - Piano: **Free**
   - Origine: **GitHub**, selezionando il repository e il ramo `main`
   - Preset di build: **Custom**
   - Posizione app: `/`
   - Percorso output: `dist`
3. Il portale ha creato il secret GitHub
   `AZURE_STATIC_WEB_APPS_API_TOKEN_PROUD_DESERT_027A07A10`, già referenziato dal workflow.
   Non copiare il token nel codice o nella documentazione.
4. Il workflow builda e testa il progetto (lint, tipi, test, build), poi pubblica la build
   già pronta con `skip_app_build: true`: Azure non ricompila nulla e ciò che viene
   pubblicato è esattamente ciò che i test hanno verificato. L'app sarà raggiungibile su
   `https://<nome-app>.azurestaticapps.net` e ogni pull request riceverà un ambiente di
   anteprima automatico.

   Il workflow di deploy unico è
   `.github/workflows/azure-static-web-apps-proud-desert-027a07a10.yml`: mantiene il nome
   generato dal portale, con i controlli di qualità integrati. Il vecchio workflow generico
   è stato rimosso. È possibile avviare il deploy anche manualmente dalla scheda Actions.

Il workflow CI separato (`.github/workflows/ci.yml`) esegue su ogni push e pull request:
formato, lint, tipi, test unitari, build e test E2E (incluso il test offline).

Dopo il deploy, verificare l'installazione reale della PWA su desktop, Android e iOS:
i test Playwright non sostituiscono la prova manuale sui dispositivi.

## Documentazione

- [Analisi tecnica e specifica](docs/analisi_tecnica_lettore_pdf.md) — requisiti RF-01…RF-10
  e criteri di accettazione AC-01…AC-32
- [Decisioni sulle questioni aperte](docs/decisioni_analisi_tecnica_lettore_pdf.md)
- [Piano di implementazione](docs/piano_implementazione_lettore_pdf.md) — fasi 0–6

## Licenza

MIT — vedi [LICENSE](LICENSE). Copyright (c) 2026 andrearicossa, come indicato
nella licenza originale del repository.

Licenze delle dipendenze dirette (verificate con la versione installata, tutte compatibili
con MIT): Preact, Vite, vite-plugin-pwa, Workbox, Vitest, ESLint, Prettier e
typescript-eslint sono MIT; Playwright e TypeScript sono Apache-2.0.
