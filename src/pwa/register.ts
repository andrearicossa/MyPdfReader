/**
 * Registrazione del service worker (Fase 0).
 *
 * registerType è 'prompt': gli aggiornamenti non si applicano mai in automatico,
 * perché nelle fasi successive potrebbero esserci modifiche non ancora salvate.
 * Quando una nuova versione è pronta, appare un banner e l'utente decide.
 */
import { registerSW } from 'virtual:pwa-register';
import { showUpdateBanner } from './update-banner';

export function registerPwa() {
  const updateSW = registerSW({
    onNeedRefresh() {
      showUpdateBanner(() => {
        void updateSW(true);
      });
    },
    onOfflineReady() {
      // La shell funziona offline: nessun avviso necessario.
    },
  });
}
