import { ThemeManager } from './managers/ThemeManager';
import { SettingsManager } from './managers/SettingsManager';
import { AccountManager } from './managers/AccountManager';
import { PinManager } from './managers/PinManager';
import { AuthManager } from './managers/AuthManager';
import { VaultManager } from './managers/VaultManager';
import { SyncManager } from './managers/SyncManager';
import { NavigationManager } from './managers/NavigationManager';
import { ConnectivityManager } from './managers/ConnectivityManager';
import { PrivacyManager } from './managers/PrivacyManager';

export class UIManager {
    public currentTheme: 'light' | 'dark' = 'light';
    public accounts: any[] = [];
    public timerInterval: any = null;
    public searchQuery: string = '';
    public vaultViewStyle: 'unified' | 'compact' | 'focus' | 'secure' = 'compact';
    public userId: string;

    // Privacy state — backed by PrivacyManager, exposed as pass-through for host interfaces
    get privacyMode(): boolean { return this.privacyManager?.privacyMode ?? false; }
    set privacyMode(v: boolean) { if (this.privacyManager) this.privacyManager.privacyMode = v; }
    get screenGuardian(): boolean { return this.privacyManager?.screenGuardian ?? false; }
    set screenGuardian(v: boolean) { if (this.privacyManager) this.privacyManager.screenGuardian = v; }

    // OLED mode — backed by ThemeManager
    get oledMode(): boolean { return this.themeManager?.oledMode ?? false; }
    set oledMode(v: boolean) { if (this.themeManager) this.themeManager.oledMode = v; }

    public themeManager!: ThemeManager;
    public settingsManager!: SettingsManager;
    public accountManager!: AccountManager;
    public pinManager!: PinManager;
    public authManager!: AuthManager;
    public vaultManager!: VaultManager;
    public syncManager!: SyncManager;
    public navigationManager!: NavigationManager;
    public connectivityManager!: ConnectivityManager;
    public privacyManager!: PrivacyManager;

    constructor(userId: string = 'default') {
        this.userId = userId;
        this.themeManager = new ThemeManager(this);
        this.settingsManager = new SettingsManager(this);
        this.accountManager = new AccountManager(this);
        this.pinManager = new PinManager(this);
        this.authManager = new AuthManager(this);
        this.vaultManager = new VaultManager(this);
        this.syncManager = new SyncManager(this);
        this.navigationManager = new NavigationManager(this);
        this.connectivityManager = new ConnectivityManager(this);
        this.privacyManager = new PrivacyManager(this);

        this.themeManager.init();
        this.settingsManager.init();
        this.privacyManager.init();
        this.navigationManager.setupEventListeners();
        this.navigationManager.setupPullToRefresh();
        this.navigationManager.setupSearchFocus();
        this.setupBiometric();
        this.updateLockVaultVisibility();
        this.accountManager.startTimer();
        this.accountManager.loadInitialData();
        this.pinManager.migratePinToEncrypted().catch(err => console.error('PIN migration error:', err));
        this.syncManager.setupEventListeners();
        this.syncManager.startLiveSync();
        this.syncManager.startLastSyncTimer();
    }

    // ─── Sync / Settings delegations ──────────────────────────────────────────

    public setSyncing(isSyncing: boolean) { this.syncManager.setSyncing(isSyncing); }
    public async pushSettings() { return this.syncManager.pushSettings(); }
    public async pushWebSettings() { return this.syncManager.pushWebSettings(); }
    public async manualSync() { return this.syncManager.manualSync(); }
    public getSettingsObject(): any { return this.settingsManager.getSettingsObject(); }
    public applySettings(settings: any, saveLocal: boolean = true) { this.settingsManager.applySettings(settings, saveLocal); }
    public updateAutoLockState() { this.settingsManager.updateAutoLockState(); }

    // ─── Theme delegations ─────────────────────────────────────────────────────

    public setTheme(theme: 'light' | 'dark', silent: boolean = false) {
        this.currentTheme = theme;
        this.themeManager.setTheme(theme, silent);
    }
    public setThemeMode(mode: 'light' | 'dark' | 'auto', silent: boolean = false) { this.themeManager.setThemeMode(mode, silent); }
    public setAccentColor(accentColor: string, silent: boolean = false) { this.themeManager.setAccentColor(accentColor, silent); }
    public applyOledMode(v: boolean, silent: boolean = false) { this.themeManager.applyOledMode(v, silent); }

    // themeMode pass-through
    get themeMode(): 'light' | 'dark' | 'auto' { return this.themeManager?.themeMode ?? 'auto'; }
    set themeMode(v: 'light' | 'dark' | 'auto') { if (this.themeManager) this.themeManager.themeMode = v; }

    // ─── Navigation delegations ────────────────────────────────────────────────

    public switchTab(tab: 'vault' | 'settings' | 'account') { this.navigationManager.switchTab(tab); }
    public updateSegmentedUI(containerId: string, value: string) { this.navigationManager.updateSegmentedUI(containerId, value); }
    public updateLockVaultVisibility() { this.navigationManager?.updateLockVaultVisibility(); }
    public setupNumpad() { this.pinManager.setupNumpad(); }

    // ─── Account delegations ───────────────────────────────────────────────────

    public async loadInitialData(): Promise<void> { return this.accountManager.loadInitialData(); }
    public async refreshAccounts(): Promise<void> { return this.accountManager.refreshAccounts(); }
    public renderAccounts() { this.accountManager.renderAccounts(); }
    public showAddModal() { this.accountManager.showAddModal(); }
    public showEditModal(account: any) { this.accountManager.showEditModal(account); }
    public getIcon(issuer: string): string { return this.accountManager.getIcon(issuer); }
    public clearAllOTPCodes() { this.accountManager.clearAllOTPCodes(); }

    // ─── Auth delegations ──────────────────────────────────────────────────────

    public updateLastActivity(action: string) { this.authManager.updateLastActivity(action); }
    public updateLastActivityDisplay() { this.authManager.updateLastActivityDisplay(); }
    public loadAccountInfo() { this.authManager.loadAccountInfo(); }

    // ─── PIN delegations ───────────────────────────────────────────────────────

    public lockVault() {
        (window as any).__connectivityManager?.setHidden();
        this.pinManager.lockVault();
    }
    public handleUnlock() { this.pinManager.handleUnlock(); }
    public showForgotPinConfirm() { this.pinManager.showForgotPinConfirm(); }
    public showPinSetup() { this.pinManager.showPinSetup(); }
    public showPinRemoval() { this.pinManager.showPinRemoval(); }

    // ─── Vault delegations ─────────────────────────────────────────────────────

    public showDeleteConfirm(account: any) { this.vaultManager.showDeleteConfirm(account); }
    public async showOtpModal(account: any) { return this.vaultManager.showOtpModal(account); }
    public showImportPasswordModal(data: any) { this.vaultManager.showImportPasswordModal(data); }
    public showExportOptionsModal() { this.vaultManager.showExportOptionsModal(); }

    // ─── Loading overlay ───────────────────────────────────────────────────────

    public setLoading(show: boolean, title: string = 'Processing', subtitle: string = 'VAULT SECURITY SYNCHRONIZATION') {
        const overlay = document.getElementById('loading-overlay');
        const titleEl = document.getElementById('loading-title');
        const subtitleEl = document.getElementById('loading-subtitle');
        if (!overlay) return;
        if (show) {
            if (titleEl) titleEl.textContent = title;
            if (subtitleEl) subtitleEl.textContent = subtitle;
            overlay.classList.remove('hidden');
            setTimeout(() => overlay.classList.add('show'), 10);
        } else {
            overlay.classList.remove('show');
            setTimeout(() => overlay.classList.add('hidden'), 400);
        }
    }

    // ─── Modal helpers ─────────────────────────────────────────────────────────

    public showModal(content: string) {
        const overlay = document.getElementById('modal-overlay');
        if (!overlay) return;
        overlay.innerHTML = `<div class="modal animate-fade-in">${content}</div>`;
        overlay.classList.add('show');
        // Push search overlay behind modal
        const searchOverlay = document.getElementById('search-overlay');
        if (searchOverlay) searchOverlay.style.zIndex = '1';
        // Block backdrop-click dismiss for 300ms so the opening tap doesn't immediately close it
        overlay.dataset.justOpened = '1';
        setTimeout(() => { delete overlay.dataset.justOpened; }, 300);
        setTimeout(() => {
            const first = overlay.querySelector('input:not([type="hidden"]), button:not(.auth-close-btn)') as HTMLElement;
            if (first) first.focus();
        }, 50);
    }

    public hideModal() {
        const overlay = document.getElementById('modal-overlay');
        if (overlay) {
            overlay.classList.remove('show');
            // Restore search overlay z-index
            const searchOverlay = document.getElementById('search-overlay');
            if (searchOverlay) searchOverlay.style.zIndex = '';
            setTimeout(() => overlay.innerHTML = '', 300);
        }
    }

    // ─── Toast ─────────────────────────────────────────────────────────────────

    public showToast(message: string, type: 'info' | 'success' | 'error' = 'info') {
        const container = document.getElementById('toast-container');
        if (!container) return;

        // Deduplicate — don't stack identical messages
        const existing = container.querySelector(`.neumorphic-toast[data-msg="${CSS.escape(message)}"]`);
        if (existing) {
            existing.classList.remove('hiding');
            (existing as any)._resetTimer?.();
            return;
        }

        const iconMap = {
            success: 'fa-solid fa-check',
            error: 'fa-solid fa-xmark',
            info: 'fa-solid fa-info'
        };

        const toast = document.createElement('div');
        toast.className = `neumorphic-toast toast-${type}`;
        toast.setAttribute('data-msg', message);
        toast.innerHTML = `
            <div class="toast-icon-vessel">
                <i class="${iconMap[type]}"></i>
            </div>
            <span class="toast-message">${message}</span>
            <div class="toast-progress"><div class="toast-progress-bar"></div></div>
        `;

        let dismissTimer: any;
        const dismiss = () => {
            clearTimeout(dismissTimer);
            toast.classList.add('hiding');
            setTimeout(() => toast.remove(), 380);
        };

        // Reset timer (used for dedup)
        (toast as any)._resetTimer = () => {
            clearTimeout(dismissTimer);
            const bar = toast.querySelector('.toast-progress-bar') as HTMLElement;
            if (bar) { bar.style.transition = 'none'; bar.style.width = '100%'; requestAnimationFrame(() => { bar.style.transition = ''; }); }
            dismissTimer = setTimeout(dismiss, 4000);
        };

        toast.addEventListener('click', dismiss);

        // Swipe down to dismiss
        let touchStartY = 0;
        toast.addEventListener('touchstart', (e) => { touchStartY = e.touches[0].clientY; }, { passive: true });
        toast.addEventListener('touchmove', (e) => {
            const dy = e.touches[0].clientY - touchStartY;
            if (dy > 0) toast.style.transform = `translateY(${dy}px)`;
        }, { passive: true });
        toast.addEventListener('touchend', (e) => {
            const dy = e.changedTouches[0].clientY - touchStartY;
            if (dy > 60) { dismiss(); } else { toast.style.transform = ''; }
        }, { passive: true });

        container.appendChild(toast);
        dismissTimer = setTimeout(dismiss, 4000);
    }

    // ─── Biometric ─────────────────────────────────────────────────────────────

    public async setupBiometric(): Promise<void> {
        const row = document.getElementById('biometric-setting-row');
        const toggle = document.getElementById('biometric-toggle') as HTMLInputElement;
        const desc = document.getElementById('biometric-setting-desc');

        try {
            const { BiometricAuth, BiometryType } = await import('@aparajita/capacitor-biometric-auth');
            const result = await BiometricAuth.checkBiometry();

            if (!result.isAvailable) {
                if (row) row.style.display = 'none';
                return;
            }

            // Show the row
            if (row) row.style.display = '';

            // Set description based on biometry type
            if (desc) {
                const type = result.biometryType;
                if (type === BiometryType.faceId || type === BiometryType.faceAuthentication) {
                    desc.textContent = 'Use Face ID to unlock your vault';
                } else if (type === BiometryType.touchId || type === BiometryType.fingerprintAuthentication) {
                    desc.textContent = 'Use fingerprint to unlock your vault';
                } else {
                    desc.textContent = 'Use biometrics to unlock your vault';
                }
            }

            // Restore saved state — but only if a PIN is set
            const hasPin = !!localStorage.getItem(this.getStorageKey('vault_pin'));
            const savedEnabled = localStorage.getItem(this.getStorageKey('biometric_enabled')) === 'true';
            if (toggle) toggle.checked = hasPin && savedEnabled;

            // If PIN was removed, clear biometric pref
            if (!hasPin) {
                localStorage.removeItem(this.getStorageKey('biometric_enabled'));
            }
        } catch {
            if (row) row.style.display = 'none';
        }
    }

    public async tryBiometricUnlock() {
        try {
            const { BiometricAuth } = await import('@aparajita/capacitor-biometric-auth');
            await BiometricAuth.authenticate({
                reason: 'Unlock your Keyra vault',
                cancelTitle: 'Use PIN',
                allowDeviceCredential: false
            });
            document.getElementById('lock-vessel')?.classList.remove('show');
            document.body.classList.remove('vault-is-locked');
            this.pinManager.clearPinInput();
            this.renderAccounts();
            this.showToast('Identity Verified', 'success');
        } catch {
            // User cancelled or failed — fall back to PIN silently
        }
    }

    // ─── Utility ───────────────────────────────────────────────────────────────

    public getStorageKey(key: string): string { return `${this.userId}_${key}`; }
}
