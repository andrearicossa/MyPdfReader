# Fluido — Lettore PDF in modalità fluida

Lettore PDF leggero e open source: il testo del documento si legge come un ebook, con font
regolabile. Il PDF originale non viene mai modificato. Evidenziazioni, note e posizione
di lettura sono conservate in un file JSON separato, portabile su altri dispositivi.

**Stato: Fase 6, versione `0.5.0-layout.1` (integrazione del layout UI 01).**
Lettura centrale, note laterali desktop e pannelli sovrapposti mobile.
Vedi [ADR-007](docs/ADR-007-layout.md), [QA della Fase 6](docs/qa-fase6.md)
e [ADR-006](docs/ADR-006-persistenza.md) per la persistenza invariata.
La PWA estrae nel worker PDF.js solo la pagina selezionata, senza elaborare le altre
in anticipo. Mantiene una cache LRU di 8 pagine visitate e ricostruisce paragrafi,
titoli, box rettangolari semplici e citazioni rientrate con attribuzione esplicita.
Il testo nei gruppi resta selezionabile; le immagini vere restano ritagli su richiesta.
Il file PDF viene comunque letto interamente per caricamento e hash, non a intervalli.

## Come conservare il lavoro

- Crea o collega un JSON delle annotazioni per la scrittura automatica, se il
  browser supporta File System Access e concedi il permesso. Alla riapertura è
  necessario ricollegare esplicitamente il file, senza permessi impliciti.
- In alternativa scarica il JSON aggiornato. La cache nel browser non sostituisce
  il file e non sincronizza i dispositivi.
- Per cambiare dispositivo porta PDF e JSON, apri il PDF e importa il JSON.
  Preferenze di lettura globali per dispositivo, non nel JSON.
- In caso di conflitto conserva entrambe le copie con i pulsanti di download;
  scegli poi quale usare. Date e revisioni non determinano un vincitore automatico.
  Non si sovrascrive uno schema futuro o un file relativo a un altro PDF.
  Include confronto con
  l'Originale e avvisi per layout non supportati. La vista principale ha scorrimento
  progressivo, finestra di cinque pagine, tipografia regolabile e figure con zoom.
  Le preferenze globali sono in un database IndexedDB separato; in caso di errore
  restano temporanee con avviso. Selezionando il testo è possibile evidenziare in quattro
  colori o aggiungere una nota, anche nei box e nelle citazioni. La colonna annotazioni
  desktop diventa un pannello sovrapposto sui viewport stretti; permette salto al
  passaggio, modifica e cancellazione confermata. Le ancore sono testuali, non in pixel;
  quelle non risolte o ambigue conservano la nota senza applicare evidenziazioni arbitrarie.
  La posizione nel testo o nella figura viene salvata nello stesso JSON.
  Il vecchio pannello della Fase 1 resta nella Vista tecnica, accessibile dal menu:
  il suo formato `fluido/file-spike v1` non è compatibile con `fluido/annotations v1`.
  Il relativo database non viene migrato né sovrascritto.

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
Per le annotazioni: [ADR-005](docs/ADR-005-annotazioni.md) e
[QA Fase 4](docs/qa-fase4.md). La Fase 5 finalizza il recupero dei conflitti e
la compatibilità v1 in [ADR-006](docs/ADR-006-persistenza.md); non chiude i gate
dei dispositivi reali. Schema invariato, nessuna conversione distruttiva.

## Annotare e portare le note su un altro dispositivo

1. Aprire il PDF e selezionare un passaggio all'interno della stessa pagina.
2. Scegliere il colore e premere **Evidenzia** o **Aggiungi nota**.
3. Modificare testo e colore nel pannello annotazioni; le modifiche avviano il
   salvataggio dopo 700 ms di inattività. Lo stato distingue cache e file.
4. Nel menu **Documento e file** (⋯ oppure stato JSON), dove disponibile,
   **Crea file annotazioni** collega un nuovo JSON vuoto per la
   scrittura automatica. Per uno esistente usare **Collega file annotazioni**;
   alla riapertura potrebbe essere necessaria un'autorizzazione esplicita.
5. Altrove usare **Scarica annotazioni** e verificare che il browser abbia
   conservato il file. Su un altro dispositivo aprire lo stesso PDF e importare
   il JSON. Serve la coppia di file; non c'è sincronizzazione tra dispositivi.

La cache del browser non sostituisce l'esportazione. Il file unico contiene
annotazioni e posizione; font e tema restano preferenze del dispositivo.
Le pagine con layout dichiarato non affidabile non accettano nuove annotazioni.

## Nuova interfaccia di lettura

- **Aspetto / Aa**: font, dimensione, interlinea, margini e tema; preferenze per
  dispositivo. Anche l'apertura della colonna note desktop viene ricordata qui,
  senza esportarla nel JSON del documento.
- **Annotazioni**: colonna chiudibile su desktop, pannello modale sul telefono.
  “Vai al passaggio” chiude il pannello mobile e riporta il focus al testo.
- **Originale**: confronto con la pagina PDF reale, non una ricostruzione demo.
  Il menu permette anche di aprire il PDF originale in un'altra scheda.
- **Menu ⋯ / stato JSON**: cambia PDF, importa o collega il JSON, ricollega i
  permessi, scarica la copia aggiornata, gestisci i conflitti e apri i dettagli.
- **Solo lettura**: dalla barra inferiore desktop o dal menu; uscita visibile
  ed Escape. Avvisi di conflitto o cache non disponibile non vengono nascosti.
- **Stato JSON**: “File collegato” non equivale a “JSON aggiornato”; quest'ultimo
  richiede una scrittura realmente conclusa. “Download avviato” richiede comunque
  di verificare che il browser abbia conservato il file.

Per aggiornare una PWA già aperta, prima conserva il JSON e poi usa la notifica
di aggiornamento. Se la vecchia UI resta visibile, chiudi e riapri l'app senza
cancellare dati del sito o cache: potrebbero contenere lavoro non ancora esportato.

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
