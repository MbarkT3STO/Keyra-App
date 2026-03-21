import './ui-bridge';
import { UIManager } from './ui';
import { setupAuthUI, setAppInitCallback } from './auth';
import { errorHandler } from '../core/errorHandler';
import { App } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Keyboard } from '@capacitor/keyboard';

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

function initAutoLock() {
    ['touchstart', 'touchmove', 'keydown', 'scroll'].forEach(evt => {
        document.addEventListener(evt, resetInactivityTimer, true);
    });
    resetInactivityTimer();
}

async function initCapacitor() {
    try {
        // Sync status bar with current theme
        const theme = localStorage.getItem('default_theme') || 'light';
        await StatusBar.setStyle({ style: theme === 'dark' ? Style.Dark : Style.Light });
    } catch (e) {
        // StatusBar may not be available in browser
    }

    try {
        // Keyboard: scroll focused input into view when keyboard opens
        await Keyboard.addListener('keyboardWillShow', (info) => {
            document.body.classList.add('keyboard-open');
            // Give the keyboard time to animate in, then scroll focused element into view
            setTimeout(() => {
                const focused = document.activeElement as HTMLElement;
                if (focused && (focused.tagName === 'INPUT' || focused.tagName === 'TEXTAREA')) {
                    focused.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }, 100);
        });
        await Keyboard.addListener('keyboardWillHide', () => {
            document.body.classList.remove('keyboard-open');
        });
    } catch (e) {
        // Keyboard plugin not available in browser — use focusin fallback
        document.addEventListener('focusin', (e) => {
            const target = e.target as HTMLElement;
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
                setTimeout(() => {
                    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 300);
            }
        });
    }

    // Handle Android back button
    App.addListener('backButton', ({ canGoBack }) => {
        const modalOverlay = document.getElementById('modal-overlay');
        if (modalOverlay?.classList.contains('show')) {
            (window as any).ui?.hideModal();
            return;
        }
        if (!canGoBack) {
            App.minimizeApp();
        }
    });

    // Handle app going to background (privacy blur)
    App.addListener('appStateChange', ({ isActive }) => {
        const privacyOverlay = document.getElementById('privacy-blur-overlay');
        const ui = (window as any).ui;
        const authVessel = document.getElementById('auth-vessel');
        if (!isActive && ui?.screenGuardian && authVessel?.classList.contains('hidden')) {
            privacyOverlay?.classList.remove('hidden');
        } else if (isActive) {
            privacyOverlay?.classList.add('hidden');
        }
    });
}

async function init() {
    errorHandler.init();
    await initCapacitor();
    setupAuthUI();

    setAppInitCallback(async (resumed: boolean) => {
        try {
            const user = await (window as any).api.getCurrentUser();
            (window as any).userId = user?.id || 'default';
        } catch (e) {
            (window as any).userId = 'default';
        }

        const uid = (window as any).userId;
        const hasPin = !!localStorage.getItem(`${uid}_vault_pin`);

        (window as any).ui = new UIManager(uid);

        if (resumed && hasPin) (window as any).ui.lockVault();

        initAutoLock();
    });
}

document.addEventListener('DOMContentLoaded', init);
