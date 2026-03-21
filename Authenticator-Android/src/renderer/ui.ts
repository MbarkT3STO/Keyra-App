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
    public vaultViewStyle: 'unified' | 'compact' | 'secure' = 'compact';
    public userId: string;

    // Privacy state — backed by PrivacyManager, exposed as pass-through for host interfaces
    get privacyMode(): boolean { return this.privacyManager?.privacyMode ?? false; }
    set privacyMode(v: boolean) { if (this.privacyManager) this.privacyManager.privacyMode = v; }
    get screenGuardian(): boolean { return this.privacyManager?.screenGuardian ?? false; }
    set screenGuardian(v: boolean) { if (this.privacyManager) this.privacyManager.screenGuardian = v; }

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
    public setAccentColor(accentColor: string, silent: boolean = false) { this.themeManager.setAccentColor(accentColor, silent); }

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

    public lockVault() { this.pinManager.lockVault(); }
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
        setTimeout(() => {
            const first = overlay.querySelector('input:not([type="hidden"]), button:not(.auth-close-btn)') as HTMLElement;
            if (first) first.focus();
        }, 50);
    }

    public hideModal() {
        const overlay = document.getElementById('modal-overlay');
        if (overlay) {
            overlay.classList.remove('show');
            setTimeout(() => overlay.innerHTML = '', 300);
        }
    }

    // ─── Toast ─────────────────────────────────────────────────────────────────

    public showToast(message: string, type: 'info' | 'success' | 'error' = 'info') {
        const container = document.getElementById('toast-container');
        if (!container) return;
        const iconMap = { success: 'fa-solid fa-circle-check', error: 'fa-solid fa-circle-exclamation', info: 'fa-solid fa-circle-info' };
        const toast = document.createElement('div');
        toast.className = `neumorphic-toast toast-${type}`;
        toast.innerHTML = `<i class="${iconMap[type]} toast-icon"></i><span class="toast-message">${message}</span>`;
        const dismiss = () => { toast.classList.add('hiding'); setTimeout(() => toast.remove(), 320); };
        toast.addEventListener('click', dismiss);
        container.appendChild(toast);
        setTimeout(dismiss, 5000);
    }

    // ─── Biometric ─────────────────────────────────────────────────────────────

    public async setupBiometric() {
        try {
            const { BiometricAuth } = await import('@aparajita/capacitor-biometric-auth');
            const result = await BiometricAuth.checkBiometry();
            const toggle = document.getElementById('biometric-toggle') as HTMLInputElement;
            const section = document.getElementById('biometric-section');
            if (section) section.classList.toggle('hidden', !result.isAvailable);
            if (toggle && result.isAvailable) {
                toggle.checked = localStorage.getItem(this.getStorageKey('biometric_enabled')) === 'true';
            }
        } catch {
            document.getElementById('biometric-section')?.classList.add('hidden');
        }
    }

    public async tryBiometricUnlock() {
        try {
            const { BiometricAuth } = await import('@aparajita/capacitor-biometric-auth');
            await BiometricAuth.authenticate({ reason: 'Unlock your vault', cancelTitle: 'Use PIN' });
            document.getElementById('lock-vessel')?.classList.remove('show');
            document.body.classList.remove('vault-is-locked');
            this.pinManager.clearPinInput();
            this.renderAccounts();
            this.showToast('Biometric unlock successful', 'success');
        } catch {
            // User cancelled — fall back to PIN silently
        }
    }

    // ─── Utility ───────────────────────────────────────────────────────────────

    public getStorageKey(key: string): string { return `${this.userId}_${key}`; }
}
