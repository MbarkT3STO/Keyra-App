import { rateLimiter } from '../../core/rateLimiter.js';
import { ThemeManager } from './managers/ThemeManager.js';
import { SyncManager } from './managers/SyncManager.js';
import { AccountManager } from './managers/AccountManager.js';
import { AuthManager } from './managers/AuthManager.js';
import { PinManager } from './managers/PinManager.js';
import { ConnectivityManager } from './managers/ConnectivityManager.js';
import { NavigationManager, TabName } from './managers/NavigationManager.js';
import { PrivacyManager } from './managers/PrivacyManager.js';
import { SystemManager } from './managers/SystemManager.js';
import { UpdateManager } from './managers/UpdateManager.js';
import { VaultManager } from './managers/VaultManager.js';
import { SettingsManager } from './managers/SettingsManager.js';

export class UIManager {
    public theme: ThemeManager;
    public sync: SyncManager;
    public accounts: AccountManager;
    public auth: AuthManager;
    public pin: PinManager;
    public connectivity: ConnectivityManager;
    public nav: NavigationManager;
    public privacy: PrivacyManager;
    public system: SystemManager;
    public updates: UpdateManager;
    public vault: VaultManager;
    public settings: SettingsManager;
    private timerInterval: any = null;
    private wallpaperPreset: string = 'nebula';


    constructor(public userId: string = 'default') {
        this.theme = new ThemeManager(userId, () => this.pushSettings());
        this.sync = new SyncManager(userId, {
            getSettingsObject: () => this.settings.getSettingsObject(),
            onConflict: (action, data) => this.accounts.showSyncConflictModal(action, data),
            onSettingsApply: (settings) => this.settings.applySettings(settings, true),
            onAccountsRefresh: () => this.refreshAccounts(),
            onActivityUpdate: () => this.updateLastActivityDisplay(),
            showToast: (msg, type) => this.showToast(msg, type),
            setLoading: (show, title, subtitle) => this.setLoading(show, title, subtitle),
        });
        this.accounts = new AccountManager({
            getPrivacyMode: () => this.privacy.privacyMode,
            getVaultViewStyle: () => this.vault.vaultViewStyle,
            getUserId: () => this.userId,
            showToast: (msg, type) => this.showToast(msg, type),
            setLoading: (show, title, subtitle) => this.setLoading(show, title, subtitle),
            showModal: (content) => this.showModal(content),
            hideModal: () => this.hideModal(),
            showCopyFeedback: (el) => this.showCopyFeedback(el),
            applySettings: (settings, saveLocal) => this.settings.applySettings(settings, saveLocal),
            handleLocalAccountUI: (user) => this.handleLocalAccountUI(user),
            updateLastActivity: (action) => this.updateLastActivity(action),
            pushSettings: () => this.pushSettings(),
            updateSegmentedUI: (id, val) => this.settings.updateSegmentedUI(id, val),
            updateAccountView: () => this.updateAccountView(),
            showStaticModal: (id) => this.showStaticModal(id),
        });
        this.auth = new AuthManager({
            getUserId: () => this.userId,
            getStorageKey: (key) => this.getStorageKey(key),
            showToast: (msg, type) => this.showToast(msg, type),
            setLoading: (show, title, subtitle) => this.setLoading(show, title, subtitle),
            showModal: (content) => this.showModal(content),
            hideModal: () => this.hideModal(),
            showStaticModal: (id) => this.showStaticModal(id),
            pushSettings: () => this.pushSettings(),
            updateSyncIndicator: (state) => this.updateSyncIndicator(state as any),
            setSyncVisible: (visible) => { this.sync.syncVisible = visible; },
            formatSyncTime: (date) => this.formatSyncTime(date),
        });
        this.pin = new PinManager({
            getUserId: () => this.userId,
            getStorageKey: (key) => this.getStorageKey(key),
            showToast: (msg, type) => this.showToast(msg, type),
            setLoading: (show, title, subtitle) => this.setLoading(show, title, subtitle),
            showModal: (content) => this.showModal(content),
            hideModal: () => this.hideModal(),
            pushSettings: () => this.pushSettings(),
            updateLockVaultVisibility: () => this.updateLockVaultVisibility(),
            updatePinStatus: () => this.updatePinStatus(),
            updateLastActivity: (action) => this.updateLastActivity(action),
        });
        this.connectivity = new ConnectivityManager({
            showToast: (msg, type) => this.showToast(msg, type),
            manualSync: () => this.sync.manualSync(),
        });
        this.nav = new NavigationManager({
            onTabSwitch: (tab) => {
                if (tab === 'account') this.loadAccountInfo();
                else if (tab === 'settings') this.updateLastActivityDisplay();
            },
            updateLastActivity: (action) => this.updateLastActivity(action),
        });
        this.privacy = new PrivacyManager({
            getStorageKey: (key) => this.getStorageKey(key),
        });
        this.system = new SystemManager({
            getStorageKey: (key) => this.getStorageKey(key),
            pushSettings: () => this.pushSettings(),
        });
        this.updates = new UpdateManager({
            pushSettings: () => this.pushSettings(),
            showToast: (msg, type) => this.showToast(msg, type),
            setLoading: (show, title, subtitle) => this.setLoading(show, title, subtitle),
        });
        this.vault = new VaultManager({
            getStorageKey: (key) => this.getStorageKey(key),
            pushSettings: () => this.pushSettings(),
            showToast: (msg, type) => this.showToast(msg, type),
            setLoading: (show, title, subtitle) => this.setLoading(show, title, subtitle),
            showModal: (content) => this.showModal(content),
            hideModal: () => this.hideModal(),
            refreshAccounts: () => this.refreshAccounts(),
            renderAccounts: () => this.renderAccounts(),
            updateSegmentedUI: (id, val) => this.settings.updateSegmentedUI(id, val),
            updateLastActivity: (action) => this.updateLastActivity(action),
            showExportOptionsModal: () => this.accounts.showExportOptionsModal(),
            performExport: (format, list) => this.accounts.performExport(format, list),
            setSearchQuery: (query) => { this.accounts.searchQuery = query; },
        });
        this.settings = new SettingsManager({
            getStorageKey: (key) => this.getStorageKey(key),
            pushSettings: () => this.pushSettings(),
            showToast: (msg, type) => this.showToast(msg, type),
            updateLastActivity: (action) => this.updateLastActivity(action),
            setTheme: (theme, silent) => this.setTheme(theme, silent),
            setAccentColor: (accent, silent) => this.setAccentColor(accent, silent),
            getCurrentTheme: () => this.theme.currentTheme,
            getAccentColor: () => localStorage.getItem(this.getStorageKey('accent_color')) || 'royal-purple',
            applyOledMode: (enabled) => this.theme.applyOledMode(enabled),
            getOledMode: () => this.theme.oledMode,
            applyPerformanceMode: (enabled) => this.theme.applyPerformanceMode(enabled),
            getPerformanceMode: () => this.theme.performanceMode,
            applyPrivacyMode: (enabled, save) => this.privacy.applyPrivacyMode(enabled, save),
            getPrivacyMode: () => this.privacy.privacyMode,
            applyScreenGuardian: (enabled, save) => this.privacy.applyScreenGuardian(enabled, save),
            getScreenGuardian: () => this.privacy.screenGuardian,
            applyPrivacyBlur: (enabled, save) => this.privacy.applyPrivacyBlur(enabled, save),
            getPrivacyBlur: () => this.privacy.privacyBlur,
            applyVaultViewStyle: (style) => this.vault.applyVaultViewStyle(style),
            getVaultViewStyle: () => this.vault.vaultViewStyle,
            applyLaunchOnStartup: (enabled) => this.system.applyLaunchOnStartup(enabled),
            getLaunchOnStartup: () => this.system.launchOnStartup,
            applyMinimizeToTray: (enabled) => this.system.applyMinimizeToTray(enabled),
            getMinimizeToTray: () => this.system.minimizeToTray,
            applyGlobalHotkey: (enabled) => this.system.applyGlobalHotkey(enabled),
            getGlobalHotkey: () => this.system.globalHotkey,
            getAutoCheckUpdates: () => this.updates.autoCheckUpdates,
            setAutoCheckUpdates: (val) => { this.updates.autoCheckUpdates = val; },
            getWallpaperPreset: () => this.wallpaperPreset,
            getVaultPin: () => localStorage.getItem(this.getStorageKey('vault_pin')),
            updateLockVaultVisibility: () => this.updateLockVaultVisibility(),
            renderAccounts: () => this.renderAccounts(),
            setupAccentColorSelectorInTheme: (onChange) => this.theme.setupAccentColorSelector(onChange),
        });
        this.theme.init();
        this.privacy.initPrivacyMode();
        this.privacy.initScreenGuardian();
        this.settings.init();
        this.privacy.initInteractivePrivacy();
        this.vault.initVaultViewStyle();
        this.settings.initSegmentedStates();
        this.setupEventListeners();
        this.nav.init();
        this.updateLockVaultVisibility();
        this.accounts.startTimer();
        this.loadInitialData();
        this.initFromCloud();
        this.sync.startLiveSync();
        this.sync.startLastSyncTimer();
        // Listen for private sync config saved event
        document.addEventListener('sync:configSaved', () => this.loadInitialData());
        this.connectivity.init();
        this.updatePinStatus();
        this.updates.init();
        this.system.initSystemIntegration();
        this.auth.initPhoneSecurity();
        this.pin.migratePin();
    }

    private getStorageKey(key: string): string {
        return `${this.userId}_${key}`;
    }

    public setSyncing(isSyncing: boolean) {
        this.sync.setSyncing(isSyncing);
    }

    public updateSyncIndicator(state: 'synced' | 'syncing' | 'error' | 'warning', message?: string) {
        this.sync.updateSyncIndicator(state, message);
    }

    public setLoading(show: boolean, title: string = "One moment...", subtitle: string = "GETTING THINGS READY") {
        const overlay = document.getElementById('loading-overlay');
        const titleEl = document.getElementById('loading-title');
        const subtitleEl = document.getElementById('loading-subtitle');

        if (overlay) {
            if (show) {
                if (titleEl) titleEl.textContent = title;
                if (subtitleEl) subtitleEl.textContent = subtitle;
                overlay.classList.remove('hidden');
                // Small delay to ensure display: block is processed before opacity starts
                setTimeout(() => overlay.classList.add('show'), 10);
            } else {
                overlay.classList.remove('show');
                setTimeout(() => overlay.classList.add('hidden'), 400); // Match CSS transition duration
            }
        }
    }

    private async initFromCloud() {
        const user = await (window as any).api.getCurrentUser();
        if (user) {
            const desktopSettings = user["Desktop Settings"] || user.settings || {};
            this.settings.applySettings(desktopSettings, false);
        }
    }

    private getSettingsObject(): any {
        return this.settings.getSettingsObject();
    }

    public async pushSettings(updateLocal: boolean = true) {
        return this.sync.pushSettings(updateLocal);
    }

    public applySettings(settings: any, saveLocal: boolean = true) {
        this.settings.applySettings(settings, saveLocal);
    }

    public setTheme(theme: string, silent: boolean = false) {
        this.theme.setTheme(theme, silent);
    }

    public setAccentColor(accentColor: string, silent: boolean = false) {
        this.theme.setAccentColor(accentColor, silent);
    }


    private setupEventListeners() {
        // User Dropdown close on outside click (card dropdowns also handled here)
        document.addEventListener('click', () => {
            document.getElementById('user-dropdown')?.classList.remove('show');
            document.querySelectorAll('.card-dropdown.show').forEach(d => {
                d.classList.remove('show');
                d.previousElementSibling?.classList.remove('active');
            });
        });

        // Dropdown Actions
        document.getElementById('lock-vault-btn')?.addEventListener('click', () => {
            this.lockVault();
            this.updateLastActivity('Vault locked');
        });

        // Redundant close listeners removed (now handled in app.ts for immediate activation)

        document.getElementById('theme-toggle-btn')?.addEventListener('click', () => {
            const nextTheme = this.theme.currentTheme === 'light' ? 'dark' : 'light';
            this.setTheme(nextTheme);
        });

        document.getElementById('btn-logout-trigger')?.addEventListener('click', () => {
            this.showStaticModal('modal-logout');
        });

        // Logout Confirmation
        document.getElementById('btn-confirm-logout')?.addEventListener('click', async () => {
            this.setLoading(true, "Ending Session", "SECURING VAULT & CLEARING KEY");
            try {
                await (window as any).api.logout();
                window.location.reload();
            } finally {
                this.setLoading(false);
            }
        });
        document.getElementById('btn-cancel-logout')?.addEventListener('click', () => {
            document.getElementById('modal-logout')?.classList.remove('show');
        });

        // Main Add Account
        document.getElementById('add-account-btn')?.addEventListener('click', () => {
            this.accounts.showAddModal();
            this.updateLastActivity('Opened add account');
        });
        document.getElementById('empty-add-btn')?.addEventListener('click', () => this.accounts.showAddModal());

        // Settings toggles — delegated to SettingsManager
        this.settings.setupEventListeners();

        // Private Sync Listeners — delegated to SyncManager
        this.sync.setupEventListeners();

        // Vault view, import/export, search — delegated to VaultManager
        this.vault.setupEventListeners();

        // Settings PIN
        document.getElementById('setup-pin-btn')?.addEventListener('click', () => this.pin.showPinSetup());

        // Unlock
        document.getElementById('form-unlock')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleUnlock();
        });

        const pinInput = document.getElementById('unlock-pin') as HTMLInputElement;
        pinInput?.addEventListener('input', (e) => {
            const value = (e.target as HTMLInputElement).value.replace(/[^0-9]/g, '');
            pinInput.value = value;
            console.log("[Lock] Input value changed:", value);
            this.validateAndAutoUnlock(value);
        });

        document.getElementById('lock-vessel')?.addEventListener('click', () => {
            pinInput?.focus();
        });

        pinInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this.clearPinInput();
            else if (e.key === 'Enter') { e.preventDefault(); this.handleUnlock(); }
        });

        // About Modal
        const brandBtn = document.getElementById('navbar-brand');
        const aboutModal = document.getElementById('about-modal');

        if (brandBtn) {
            brandBtn.addEventListener('click', () => this.showAboutModal());
        }

        if (aboutModal) {
            aboutModal.addEventListener('click', (e) => {
                if (e.target === aboutModal) this.hideAboutModal();
            });
        }

        // Remove PIN Logic
        document.getElementById('remove-pin-btn')?.addEventListener('click', () => {
            this.pin.showRemovePinConfirm();
        });

        // Forgot PIN Logic
        const forgotPinBtn = document.getElementById('btn-forgot-pin');
        if (forgotPinBtn) {
            console.log("[Auth] Forgot PIN button found, attaching listener.");
            forgotPinBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                // Check if user is rate limited
                const rateLimitCheck = rateLimiter.isAllowed('pin', this.userId);
                if (!rateLimitCheck.allowed) {
                    this.showToast(rateLimitCheck.message || "Too many attempts. Please wait.", "error");
                    return;
                }
                
                this.pin.showForgotPinConfirm();
            });
        } else {
            console.warn("[Auth] Forgot PIN button NOT FOUND in DOM.");
        }

        this.setupAccountEvents();
    }

    private setupAccountEvents() {
        this.auth.setupAccountEvents();
    }

    private async loadAccountInfo() {
        return this.auth.loadAccountInfo();
    }

    private handleLocalAccountUI(user: any) {
        this.auth.handleLocalAccountUI(user);
    }

    private showAboutModal() {
        const modal = document.getElementById('about-modal');
        if (modal) {
            modal.classList.remove('hidden');
            modal.classList.add('show');
            this.updateLastActivityDisplay();
        }
    }

    private hideAboutModal() {
        const modal = document.getElementById('about-modal');
        if (modal) {
            modal.classList.remove('show');
            setTimeout(() => {
                modal.classList.add('hidden');
            }, 300);
        }
    }

    private updateLastActivity(action: string) {
        this.auth.updateLastActivity(action);
    }

    private updateLastActivityDisplay() {
        this.auth.updateLastActivityDisplay();
    }

    private formatSyncTime(date: Date): string {
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const isToday = date.toDateString() === now.toDateString();
        
        const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
        
        if (isToday) return `Today, ${timeStr}`;
        
        const yesterday = new Date(now);
        yesterday.setDate(now.getDate() - 1);
        if (date.toDateString() === yesterday.toDateString()) return `Yesterday, ${timeStr}`;
        
        return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + `, ${timeStr}`;
    }

    public switchTab(tab: TabName) {
        this.nav.switchTab(tab);
    }


    public async refreshAccounts() {
        return this.accounts.refreshAccounts();
    }
    
    private renderAccounts() {
        this.accounts.renderAccounts();
    }

    private showModal(content: string) {
        const overlay = document.getElementById('modal-overlay');
        if (!overlay) return;
        overlay.innerHTML = `<div class="modal animate-fade-in">${content}</div>`;
        overlay.classList.add('show');
        
        // Premium Auto-Focus: Target the first primary input
        this.focusFirstInput(overlay);
    }

    private showStaticModal(id: string) {
        const modal = document.getElementById(id);
        if (!modal) return;
        modal.classList.remove('hidden');
        modal.classList.add('show');
        this.focusFirstInput(modal);
    }

    private focusFirstInput(container: HTMLElement) {
        setTimeout(() => {
            const firstInput = container.querySelector('input:not([type="hidden"]), button:not(.auth-close-btn)') as HTMLElement;
            if (firstInput) firstInput.focus();
        }, 50);
    }

    public hideModal() {
        const overlay = document.getElementById('modal-overlay');
        if (overlay) {
            overlay.classList.remove('show');
            setTimeout(() => overlay.innerHTML = '', 300);
        }
    }

    public showToast(message: string, type: 'info' | 'success' | 'error' = 'info') {
        const container = document.getElementById('toast-container');
        if (!container) return;
        const iconMap = { success: 'fa-solid fa-circle-check', error: 'fa-solid fa-circle-exclamation', info: 'fa-solid fa-bell' };
        const toast = document.createElement('div');
        toast.className = 'toast ' + type;
        toast.innerHTML = `<i class="toast-icon ${iconMap[type]}"></i><span>${message}</span>`;
        container.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(8px) scale(0.95)';
            setTimeout(() => toast.remove(), 350);
        }, 2800);
    }


    private showCopyFeedback(element: HTMLElement) {
        const original = element.textContent;
        element.textContent = 'Copied!';
        element.style.color = '#28a745';
        setTimeout(() => {
            element.textContent = original;
            element.style.color = '';
        }, 1000);
    }

    public async lockVault() {
        return this.pin.lockVault();
    }

    private handleUnlock() {
        this.pin.handleUnlock();
    }

    private async validateAndAutoUnlock(pinValue: string) {
        return this.pin.validateAndAutoUnlock(pinValue);
    }

    private clearPinInput() {
        this.pin.clearPinInput();
    }

    private updateLockVaultVisibility() {
        const lockBtn = document.getElementById('lock-vault-btn');
        if (lockBtn) lockBtn.classList.toggle('hidden', !localStorage.getItem(this.getStorageKey('vault_pin')));
    }

    private updatePinStatus() {
        const hasPin = !!localStorage.getItem(this.getStorageKey('vault_pin'));
        const badge = document.getElementById('pin-status-badge');
        const setupBtn = document.getElementById('setup-pin-btn');
        const removeBtn = document.getElementById('remove-pin-btn');

        if (badge) {
            badge.className = 'badge ' + (hasPin ? 'success' : 'danger');
            badge.style.display = 'block';
            badge.style.marginRight = '12px';
            badge.style.fontSize = '10px';
            badge.style.fontWeight = '850';
            badge.style.padding = '4px 10px';
            badge.style.borderRadius = '20px';
            badge.textContent = hasPin ? 'ACTIVE' : 'NOT SECURED';
            if (hasPin) {
                badge.style.background = 'rgba(40, 167, 69, 0.1)';
                badge.style.color = '#28a745';
                badge.style.border = '1px solid rgba(40, 167, 69, 0.2)';
            } else {
                badge.style.background = 'rgba(255, 59, 48, 0.1)';
                badge.style.color = '#ff3b30';
                badge.style.border = '1px solid rgba(255, 59, 48, 0.2)';
            }
        }
        if (setupBtn) setupBtn.textContent = hasPin ? 'Change' : 'Setup';
        if (removeBtn) removeBtn.classList.toggle('hidden', !hasPin);

        const autolockCtrl = document.getElementById('autolock-segmented');
        const autolockRow = autolockCtrl?.closest('.setting-row');
        if (autolockCtrl && autolockRow) {
            autolockCtrl.classList.toggle('disabled', !hasPin);
            autolockRow.classList.toggle('disabled', !hasPin);
            if (!hasPin) {
                this.settings.updateSegmentedUI('autolock-segmented', '0');
                localStorage.setItem(this.getStorageKey('autolock'), '0');
                this.pushSettings();
            }
        }
    }

    private async loadInitialData() {
        await this.accounts.loadInitialData();
        this.updateSyncIndicator('synced');
    }


    private async updateAccountView() {
        return this.auth.updateAccountView();
    }

}

