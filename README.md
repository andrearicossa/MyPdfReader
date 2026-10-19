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

Nota: con npm 10.8.x l'installazione può fallire per un bug noto di risoluzione dei peer
dependency; in quel caso usare `npm install --legacy-peer-deps` oppure una versione più
recente di npm.

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
4. Il workflow `.github/workflows/azure-static-web-app.yml` builda (con lint, tipi e test) e
   pubblica su `https://<nome-app>.azurestaticapps.net`. Ogni pull request riceve un ambiente
   di anteprima automatico.

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

MIT — vedi [LICENSE](LICENSE). Il titolare del copyright nel testo è da completare con il
nome scelto per il progetto. Le dipendenze usate (Preact, Vite, PDF.js in futuro) sono
compatibili con questa licenza.
