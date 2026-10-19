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
        const allowed = window.dispatchEvent(
          new Event('fluido:before-update', { cancelable: true }),
        );
        if (!allowed) {
          window.alert('Conserva prima le modifiche: attendi il salvataggio o scarica il JSON.');
          return;
        }
        void updateSW(true);
      });
    },
    onOfflineReady() {
      // La shell funziona offline: nessun avviso necessario.
    },
  });
}
