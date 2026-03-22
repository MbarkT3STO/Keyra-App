import './ui-bridge';
import { UIManager } from './ui';
import { setupAuthUI, setAppInitCallback } from './auth';
import { errorHandler } from '../core/errorHandler';
import { App } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Keyboard } from '@capacitor/keyboard';
import { ConnectivityManager } from './managers/ConnectivityManager';
import { UpdateManager } from './managers/UpdateManager';

let inactivityTimer: any = null;

function initUpdateManager() {
    const showToast = (msg: string, type: 'info' | 'success' | 'error') => {
        (window as any).ui?.showToast(msg, type);
    };
    const um = new UpdateManager({ showToast });
    (window as any).__updateManager = um;
}

function initConnectivity() {
    // Standalone connectivity monitor — runs before login, no host needed
    const showToast = (msg: string, type: 'info' | 'success' | 'error') => {
        (window as any).ui?.showToast(msg, type);
    };
    const manualSync = async () => {
        await (window as any).ui?.manualSync?.();
    };
    const cm = new ConnectivityManager({ showToast, manualSync });
    cm.init();
    (window as any).__connectivityManager = cm;
}

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
        if ((window as any).__isSearchOverlayOpen?.()) {
            (window as any).__closeSearchOverlay?.();
            return;
        }
        const modalOverlay = document.getElementById('modal-overlay');
        if (modalOverlay?.classList.contains('show')) {
            (window as any).ui?.hideModal();
            return;
        }
        if (!canGoBack) {
            App.minimizeApp();
        }
    });

    // appStateChange is handled by PrivacyManager.initAppStateListener()
}

async function init() {
    errorHandler.init();
    await initCapacitor();
    setupAuthUI();
    initConnectivity();
    initUpdateManager();

    setAppInitCallback(async (resumed: boolean) => {
        try {
            const user = await (window as any).api.getCurrentUser();
            (window as any).userId = user?.id || 'default';
        } catch (e) {
            (window as any).userId = 'default';
        }

        const uid = (window as any).userId;
        const hasPin = !!localStorage.getItem(`${uid}_vault_pin`);
        const requirePinOnLaunch = localStorage.getItem(`${uid}_requirePinOnLaunch`) === 'true';

        (window as any).ui = new UIManager(uid);

        if (hasPin && (resumed || requirePinOnLaunch)) {
            (window as any).ui.lockVault();
        } else {
            // Main UI is visible — allow connectivity indicator to show
            (window as any).__connectivityManager?.setReady();

            // Check for updates silently on startup
            (window as any).__updateManager?.checkOnStartup();
        }

        initAutoLock();
    });
}

document.addEventListener('DOMContentLoaded', init);
