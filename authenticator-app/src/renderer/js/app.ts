import { syncVault } from './store.js';
import { UIManager } from './ui.js';
import { setupAuthUI, setAppInitCallback } from './auth.js';

let inactivityTimer: any = null;

function resetInactivityTimer() {
    if (inactivityTimer) clearTimeout(inactivityTimer);

    const uid = (window as any).currentUserId || 'default';
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

    setAppInitCallback(() => {
        // 0. Startup Security Check (Post-Auth)
        const uid = (window as any).currentUserId || 'default';
        const hasPin = !!localStorage.getItem(`${uid}_vault_pin`);

        // 2. Setup UI Components
        (window as any).ui = new UIManager();
        
        if (hasPin) (window as any).ui.lockVault();

        // 5. Initialize Security Logic
        initAutoLock();
    });
}

document.addEventListener('DOMContentLoaded', init);
