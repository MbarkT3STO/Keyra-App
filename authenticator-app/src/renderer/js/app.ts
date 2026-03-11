import { syncVault } from './store.js';
import { UIManager } from './ui.js';
import { setupAuthUI, setAppInitCallback } from './auth.js';

let inactivityTimer: any = null;

function resetInactivityTimer() {
    if (inactivityTimer) clearTimeout(inactivityTimer);

    const uid = (window as any).userId || 'default';
    const timeoutMinutes = parseInt(localStorage.getItem(`${uid}_autolock`) || '0');
    if (timeoutMinutes > 0) {
        inactivityTimer = setTimeout(() => {
            if ((window as any).ui) (window as any).ui.lockVault();
        }, timeoutMinutes * 60 * 1000);
    }
}

// ─── Setup Listeners for Inactivity ─────────────────────────────
function initAutoLock() {
    ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart'].forEach(evt => {
        document.addEventListener(evt, resetInactivityTimer, true);
    });
    resetInactivityTimer();
}

async function init() {
    setupAuthUI();

    setAppInitCallback(async () => {
        // 0. Fetch Identity Context
        try {
            const user = await (window as any).api.getCurrentUser();
            (window as any).userId = user?.id || 'default';
        } catch (e) {
            console.error("Identity fetch failed", e);
            (window as any).userId = 'default';
        }

        const uid = (window as any).userId;
        const hasPin = !!localStorage.getItem(`${uid}_vault_pin`);

        // 2. Setup UI Components (Now User-Aware)
        (window as any).ui = new UIManager(uid);
        
        if (hasPin) (window as any).ui.lockVault();

        // 5. Initialize Security Logic
        initAutoLock();

        // 6. Privacy & Focus Shield
        const privacyOverlay = document.getElementById('privacy-blur-overlay');
        window.addEventListener('blur', () => {
            const authVessel = document.getElementById('auth-vessel');
            // Only blur if we are not on the auth screen (so we don't hide the login/signup)
            if (authVessel && authVessel.classList.contains('hidden')) {
                privacyOverlay?.classList.remove('hidden');
            }
        });
        window.addEventListener('focus', () => {
            privacyOverlay?.classList.add('hidden');
        });
    });
}

document.addEventListener('DOMContentLoaded', init);
