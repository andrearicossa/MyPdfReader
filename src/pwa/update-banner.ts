/**
 * Banner di aggiornamento: avvisa che una nuova versione dell'app è pronta.
 * L'aggiornamento è sempre esplicito (registerType: 'prompt').
 */
export function showUpdateBanner(applyUpdate: () => void) {
  if (document.getElementById('update-banner')) return;

  const banner = document.createElement('div');
  banner.id = 'update-banner';
  banner.className = 'update-banner';
  banner.setAttribute('role', 'status');

  const text = document.createElement('p');
  text.textContent = 'Nuova versione disponibile.';

  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Aggiorna ora';
  button.addEventListener('click', applyUpdate);

  banner.append(text, button);
  document.body.append(banner);
}
