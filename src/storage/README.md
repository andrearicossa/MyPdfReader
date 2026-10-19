# storage — adattatori di persistenza

Adattatori per l'accesso ai file e ai dati dell'app. Arrivano dalla Fase 1 e Fase 5
del piano di implementazione.

Adattatori previsti:

- **FileSystemAccess** — apertura e aggiornamento automatico del file associato dove
  il browser lo consente (File System Access API, oggi Chromium desktop);
- **ExportImport** — ripiego con download e importazione esplicita del file;
- **IndexedDB** — cache di lavoro (annotazioni, posizione di lettura, preferenze
  globali del dispositivo).

La regola architetturale è l'inverso di `core`: `storage` può usare `core`, mai il
contrario.
