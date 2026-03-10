import { syncVault } from './store.js';
import { setupUI, renderAccounts, lockVault } from './ui.js';
import { runTimer } from './timer.js';

let inactivityTimer: any = null;

function resetInactivityTimer() {
    if (inactivityTimer) clearTimeout(inactivityTimer);

    const timeoutMinutes = parseInt(localStorage.getItem('autolock') || '0');
    if (timeoutMinutes > 0) {
        inactivityTimer = setTimeout(() => {
            lockVault();
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
    // 0. Startup Security Check
    const hasPin = !!localStorage.getItem('vault_pin');
    if (hasPin) {
        lockVault();
        // Wait for unlock before rendering accounts (handled loosely by unlock event/UI state)
    }

    // 1. Initial State Sync
    await syncVault(() => renderAccounts());

    // 2. Setup UI Components and Events
    setupUI();

    // 3. Render initial list
    if (!hasPin) renderAccounts(); // Ensure it doesn't render prematurely if locked, though syncVault does a render above.

    // 4. Start OTP Timer
    runTimer();

    // 5. Initialize Security Logic
    initAutoLock();
}

document.addEventListener('DOMContentLoaded', init);
