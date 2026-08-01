// Capture beforeinstallprompt hors de React : l'événement peut arriver avant le
// montage, et StrictMode démonte/remonte les effets (le cleanup perdrait l'écouteur).
let captured = null;
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn(captured));

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    captured = e;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    captured = null;
    notify();
  });
}

export const getInstallPrompt = () => captured;
export const clearInstallPrompt = () => { captured = null; notify(); };
export const onInstallPromptChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
