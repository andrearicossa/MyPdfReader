# Fluido — Lettore PDF in modalità fluida

Lettore PDF leggero e open source: il testo del documento si legge come un ebook, con font
regolabile, evidenziazioni e note. Il PDF originale non viene mai modificato: annotazioni e
posizione di lettura vivono in un file JSON separato, portabile su altri dispositivi.

**Stato: Fase 0 (spec-driven).** Questa è la shell installabile dell'app: si installa come
PWA e funziona offline. L'apertura dei PDF e le annotazioni arrivano con le fasi successive
del [piano di implementazione](docs/piano_implementazione_lettore_pdf.md).

## Requisiti

- Node.js 20 o superiore (vedi `.nvmrc`)

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

## Struttura

```
src/
  core/     # motore di lettura: dominio puro, nessuna API browser (Fase 2)
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
3. Il portale genera un deployment token: copiarlo da
   _Gestione token di distribuzione_ e aggiungerlo in GitHub come secret
   `AZURE_STATIC_WEB_APPS_API_TOKEN` (Settings → Secrets and variables → Actions).
4. Il workflow builda e testa il progetto (lint, tipi, test, build), poi pubblica la build
   già pronta con `skip_app_build: true`: Azure non ricompila nulla e ciò che viene
   pubblicato è esattamente ciò che i test hanno verificato. L'app sarà raggiungibile su
   `https://<nome-app>.azurestaticapps.net` e ogni pull request riceverà un ambiente di
   anteprima automatico.

   Nota: se il portale Azure genera un proprio workflow in `.github/workflows/`, tenerne
   **uno solo**: eliminare quello generato dal portale e mantenere quello del repository,
   che include lint, test e la pubblicazione della build già verificata.

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
