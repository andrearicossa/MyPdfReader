# Dipendenze e licenze

Il codice originale di Fluido è distribuito sotto licenza MIT, nel file `LICENSE`.
Le dipendenze mantengono le proprie licenze e non sono ri-licenziate MIT.

## Motore PDF

- **PDF.js / pdfjs-dist 5.4.624**: Apache License 2.0. Codice di Mozilla Foundation
  e contributori, usato senza modifiche al sorgente distribuito.
  Progetto: https://github.com/mozilla/pdf.js
  Licenza integrale: [docs/licenses/pdfjs-Apache-2.0.txt](docs/licenses/pdfjs-Apache-2.0.txt).
- **Risorse di PDF.js**: font, CMap, profili ICC e codec hanno anche avvisi specifici.
  `scripts/prepare-pdfjs.mjs` copia integralmente le cartelle distribuite, inclusi
  i rispettivi file `LICENSE*`, in `public/pdfjs` e nella build `dist/pdfjs`.
  La licenza principale è pubblicata in `pdfjs/LICENSE`.

## Altre dipendenze principali

- **Preact**: MIT, https://github.com/preactjs/preact
- **Vite**: MIT, https://github.com/vitejs/vite
- **vite-plugin-pwa**: MIT, https://github.com/vite-pwa/vite-plugin-pwa
- **Workbox**: MIT, https://github.com/GoogleChrome/workbox

Il lockfile registra le versioni esatte. Le licenze integrali delle altre
dipendenze e dei componenti transitivi sono incluse nei rispettivi pacchetti npm;
questa nota non sostituisce i loro avvisi.
