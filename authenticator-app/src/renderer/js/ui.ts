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
    private timerInterval: any = null;
    private menuExitIntegration: boolean = false;
    private windowResizable: boolean = false;
    private wallpaperPreset: string = 'nebula';


    constructor(public userId: string = 'default') {
        this.theme = new ThemeManager(userId, () => this.pushSettings());
        this.sync = new SyncManager(userId, {
            getSettingsObject: () => this.getSettingsObject(),
            onConflict: (action, data) => this.accounts.showSyncConflictModal(action, data),
            onSettingsApply: (settings) => this.applySettings(settings, true),
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
            applySettings: (settings, saveLocal) => this.applySettings(settings, saveLocal),
            handleLocalAccountUI: (user) => this.handleLocalAccountUI(user),
            updateLastActivity: (action) => this.updateLastActivity(action),
            pushSettings: () => this.pushSettings(),
            updateSegmentedUI: (id, val) => this.updateSegmentedUI(id, val),
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
            updateSegmentedUI: (id, val) => this.updateSegmentedUI(id, val),
            updateLastActivity: (action) => this.updateLastActivity(action),
            showExportOptionsModal: () => this.accounts.showExportOptionsModal(),
            performExport: (format, list) => this.accounts.performExport(format, list),
            setSearchQuery: (query) => { this.accounts.searchQuery = query; },
        });
        this.theme.init();
        this.privacy.initPrivacyMode();
        this.privacy.initScreenGuardian();
        this.initMenuExitIntegration();
        this.privacy.initInteractivePrivacy();
        this.initWindowResizable();
        this.vault.initVaultViewStyle();
        this.initSegmentedStates();
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
            // Use Desktop Settings for this platform
            const desktopSettings = user["Desktop Settings"] || user.settings || {};
            this.applySettings(desktopSettings, false);
        }
    }

    private getSettingsObject(): any {
        return {
            "Desktop Settings": {
                theme: localStorage.getItem(this.getStorageKey('theme')) || 'auto',
                accentColor: localStorage.getItem(this.getStorageKey('accent_color')) || 'royal-purple',
                wallpaperPreset: this.wallpaperPreset,
                privacyMode: this.privacy.privacyMode,
                screenGuardian: this.privacy.screenGuardian,
                autolock: localStorage.getItem(this.getStorageKey('autolock')) || '0',
                oledMode: this.theme.oledMode,
                performanceMode: this.theme.performanceMode,
                menuExitIntegration: this.menuExitIntegration,
                privacyBlur: this.privacy.privacyBlur,
                windowResizable: this.windowResizable,
                launchOnStartup: this.system.launchOnStartup,
                minimizeToTray: this.system.minimizeToTray,
                globalHotkey: this.system.globalHotkey,
                autoCheckUpdates: this.updates.autoCheckUpdates,
                vaultViewStyle: this.vault.vaultViewStyle,
                vaultPin: localStorage.getItem(this.getStorageKey('vault_pin'))
            }
        };
    }

    public async pushSettings(updateLocal: boolean = true) {
        return this.sync.pushSettings(updateLocal);
    }

    public applySettings(settings: any, saveLocal: boolean = true) {
        if (!settings) return;

        if (settings.theme) this.setTheme(settings.theme, true);
        if (settings.accentColor) this.setAccentColor(settings.accentColor, true);

        this.privacy.applyPrivacyMode(!!settings.privacyMode, false);
        this.privacy.applyScreenGuardian(!!settings.screenGuardian, false);

        if (settings.autolock !== undefined) {
            this.updateSegmentedUI('autolock-segmented', String(settings.autolock));
        }

        if (settings.launchOnStartup !== undefined) {
            this.system.applyLaunchOnStartup(!!settings.launchOnStartup);
        }

        if (settings.minimizeToTray !== undefined) {
            this.system.applyMinimizeToTray(!!settings.minimizeToTray);
        }

        if (settings.globalHotkey !== undefined) {
            this.system.applyGlobalHotkey(!!settings.globalHotkey);
        }

        if (settings.vaultViewStyle !== undefined) {
            this.vault.applyVaultViewStyle(settings.vaultViewStyle);
        }

        if (settings.oledMode !== undefined) {
            this.theme.applyOledMode(!!settings.oledMode);
            const oledToggle = document.getElementById('oled-mode-toggle') as HTMLInputElement;
            if (oledToggle) oledToggle.checked = this.theme.oledMode;
            const currentAccent = localStorage.getItem(this.getStorageKey('accent_color')) || 'royal-purple';
            this.setAccentColor(currentAccent, true);
        }

        if (settings.performanceMode !== undefined) {
            this.theme.applyPerformanceMode(!!settings.performanceMode);
            const perfToggle = document.getElementById('performance-mode-toggle') as HTMLInputElement;
            if (perfToggle) perfToggle.checked = this.theme.performanceMode;
        }

        if (settings.menuExitIntegration !== undefined) {
            this.menuExitIntegration = !!settings.menuExitIntegration;
            const menuExitToggle = document.getElementById('menu-exit-toggle') as HTMLInputElement;
            if (menuExitToggle) menuExitToggle.checked = this.menuExitIntegration;
            this.updateCloseButtonVisibility();
        }

        if (settings.privacyBlur !== undefined) {
            this.privacy.applyPrivacyBlur(!!settings.privacyBlur, false);
        }

        if (settings.autoCheckUpdates !== undefined) {
            this.updates.autoCheckUpdates = !!settings.autoCheckUpdates;
            const autoToggle = document.getElementById('auto-update-toggle') as HTMLInputElement;
            if (autoToggle) autoToggle.checked = this.updates.autoCheckUpdates;
        }
        
        if (settings.windowResizable !== undefined) {
            this.windowResizable = !!settings.windowResizable;
            const resizableToggle = document.getElementById('window-resizable-toggle') as HTMLInputElement;
            if (resizableToggle) resizableToggle.checked = this.windowResizable;
            (window as any).api.setResizable(this.windowResizable);
        }

        if (saveLocal) {
            if (settings.theme) localStorage.setItem(this.getStorageKey('theme'), settings.theme);
            if (settings.accentColor) localStorage.setItem(this.getStorageKey('accent_color'), settings.accentColor);
            if (settings.wallpaperPreset) localStorage.setItem(this.getStorageKey('wallpaperPreset'), settings.wallpaperPreset);
            localStorage.setItem(this.getStorageKey('privacyMode'), String(this.privacy.privacyMode));
            localStorage.setItem(this.getStorageKey('screenGuardian'), String(this.privacy.screenGuardian));
            if (settings.autolock !== undefined) localStorage.setItem(this.getStorageKey('autolock'), String(settings.autolock));
            localStorage.setItem(this.getStorageKey('oled_mode'), String(this.theme.oledMode));
            localStorage.setItem(this.getStorageKey('performance_mode'), String(this.theme.performanceMode));
            localStorage.setItem(this.getStorageKey('menu_exit_integration'), String(this.menuExitIntegration));
            localStorage.setItem(this.getStorageKey('privacy_blur'), String(this.privacy.privacyBlur));
            localStorage.setItem(this.getStorageKey('window_resizable'), String(this.windowResizable));
            localStorage.setItem(this.getStorageKey('auto_check_updates'), String(this.updates.autoCheckUpdates));
            localStorage.setItem(this.getStorageKey('vault_view_style'), this.vault.vaultViewStyle);
            if (settings.vaultPin !== undefined) localStorage.setItem(this.getStorageKey('vault_pin'), settings.vaultPin);
        }

        this.updateLockVaultVisibility();
        this.renderAccounts();
    }

    public setTheme(theme: string, silent: boolean = false) {
        this.theme.setTheme(theme, silent);
    }

    public setAccentColor(accentColor: string, silent: boolean = false) {
        this.theme.setAccentColor(accentColor, silent);
    }

    private initMenuExitIntegration() {
        this.menuExitIntegration = localStorage.getItem(this.getStorageKey('menu_exit_integration')) === 'true';
        const toggle = document.getElementById('menu-exit-toggle') as HTMLInputElement;
        if (toggle) toggle.checked = this.menuExitIntegration;
        this.updateCloseButtonVisibility();
    }


    private updateCloseButtonVisibility() {
        const navBtn = document.getElementById('btn-close-app');
        const menuBtn = document.getElementById('menu-close-app-btn');
        if (navBtn) navBtn.classList.toggle('hidden', this.menuExitIntegration);
        if (menuBtn) {
            menuBtn.classList.toggle('hidden', !this.menuExitIntegration);
        }
    }

    private initWindowResizable() {
        this.windowResizable = localStorage.getItem(this.getStorageKey('window_resizable')) === 'true';
        const toggle = document.getElementById('window-resizable-toggle') as HTMLInputElement;
        if (toggle) toggle.checked = this.windowResizable;
        (window as any).api.setResizable(this.windowResizable);
    }

    private initSegmentedStates() {
        const theme = localStorage.getItem(this.getStorageKey('theme')) || 'auto';
        this.updateSegmentedUI('theme-segmented', theme);

        const autolock = localStorage.getItem(this.getStorageKey('autolock')) || '0';
        this.updateSegmentedUI('autolock-segmented', autolock);

        this.updateSegmentedUI('countdown-style-segmented', this.vault.vaultViewStyle);
    }

    private updateSegmentedUI(containerId: string, value: string) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const segments = container.querySelectorAll('.segment');
        const indicator = container.querySelector('.segment-indicator') as HTMLElement;

        let activeIdx = 0;
        segments.forEach((seg, idx) => {
            const isActive = seg.getAttribute('data-val') === value;
            seg.classList.toggle('active', isActive);
            if (isActive) activeIdx = idx;
        });

        if (indicator) {
            const segmentWidth = 100 / segments.length;
            indicator.style.width = `calc(${segmentWidth}% - 6px)`;
            indicator.style.left = `calc(${activeIdx * segmentWidth}% + 3px)`;
        }
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

        // Segmented Theme Toggle (Light/Dark/Auto)
        document.querySelectorAll('#theme-segmented .segment').forEach(seg => {
            seg.addEventListener('click', (e) => {
                const target = e.currentTarget as HTMLElement;
                const val = target.getAttribute('data-val')!;
                this.setTheme(val);
                this.updateLastActivity(`Changed appearance to ${val}`);
                
                if (val === 'auto') {
                    this.showToast("App will now follow system theme", "info");
                } else {
                    this.showToast(`${val.charAt(0).toUpperCase() + val.slice(1)} mode enabled`, "info");
                }
            });
        });

        // Segmented Auto-Lock
        document.querySelectorAll('#autolock-segmented .segment').forEach(seg => {
            seg.addEventListener('click', (e) => {
                const target = e.currentTarget as HTMLElement;
                const val = target.getAttribute('data-val')!;
                localStorage.setItem(this.getStorageKey('autolock'), val);
                this.updateSegmentedUI('autolock-segmented', val);
                this.pushSettings();
                this.showToast(val === '0' ? 'Auto-lock turned off' : `Locked after ${val}m of inactivity`, "info");
                this.updateLastActivity(`Changed autolock to ${val}m`);
            });
        });

        // OLED Mode Toggle
        document.getElementById('oled-mode-toggle')?.addEventListener('change', (e) => {
            const enabled = (e.target as HTMLInputElement).checked;
            this.theme.applyOledMode(enabled);
            const currentAccent = localStorage.getItem(this.getStorageKey('accent_color')) || 'royal-purple';
            this.setAccentColor(currentAccent, true);
            this.pushSettings();
            if (enabled && this.theme.currentTheme !== 'dark') {
                this.showToast("Pure Black only works in Dark Mode", "info");
            } else {
                this.showToast(enabled ? "Pure Black (OLED) Activated" : "Standard Dark Mode Restored", "success");
            }
            this.updateLastActivity(`OLED Mode ${enabled ? 'on' : 'off'}`);
        });

        // Performance Mode Toggle
        document.getElementById('performance-mode-toggle')?.addEventListener('change', (e) => {
            const enabled = (e.target as HTMLInputElement).checked;
            this.theme.applyPerformanceMode(enabled);
            this.pushSettings();
            this.showToast(enabled ? "Performance Mode is on" : "Performance Mode is off", "info");
            this.updateLastActivity(`Performance Mode ${enabled ? 'on' : 'off'}`);
        });

        // Menu Exit Toggle
        document.getElementById('menu-exit-toggle')?.addEventListener('change', (e) => {
            const target = e.target as HTMLInputElement;
            this.menuExitIntegration = target.checked;
            localStorage.setItem(this.getStorageKey('menu_exit_integration'), String(this.menuExitIntegration));
            this.updateCloseButtonVisibility();
            this.pushSettings();
            this.showToast(this.menuExitIntegration ? "Close button moved to menu" : "Close button moved to navbar", "info");
            this.updateLastActivity(`Menu Exit ${this.menuExitIntegration ? 'on' : 'off'}`);
        });

        // Private Sync Listeners — delegated to SyncManager
        this.sync.setupEventListeners();

        // Vault view, import/export, search — delegated to VaultManager
        this.vault.setupEventListeners();

        // Settings PIN
        document.getElementById('setup-pin-btn')?.addEventListener('click', () => this.pin.showPinSetup());

        // Privacy Mode Toggle
        document.getElementById('privacy-mode-toggle')?.addEventListener('change', (e) => {
            const target = e.target as HTMLInputElement;
            this.privacy.applyPrivacyMode(target.checked, true);
            this.pushSettings();
            this.renderAccounts();
            this.showToast(this.privacy.privacyMode ? "Codes are now hidden" : "Codes are now visible", "info");
            this.updateLastActivity(`Hide Codes ${this.privacy.privacyMode ? 'on' : 'off'}`);
        });

        // Screen Guardian Toggle
        document.getElementById('screen-guardian-toggle')?.addEventListener('change', (e) => {
            const target = e.target as HTMLInputElement;
            this.privacy.applyScreenGuardian(target.checked, true);
            this.pushSettings();
            this.showToast(this.privacy.screenGuardian ? "Screenshot protection is on" : "Screenshot protection is off", "info");
            this.updateLastActivity(`Anti-Peek ${this.privacy.screenGuardian ? 'on' : 'off'}`);
        });

        // Interactive Privacy Toggle
        document.getElementById('privacy-blur-toggle')?.addEventListener('change', (e) => {
            const target = e.target as HTMLInputElement;
            this.privacy.applyPrivacyBlur(target.checked, true);
            this.pushSettings();
            this.showToast(this.privacy.privacyBlur ? "Auto-blur is on" : "Auto-blur is off", "info");
            this.updateLastActivity(`Auto-blur ${this.privacy.privacyBlur ? 'on' : 'off'}`);
        });

        // Window Resizable Toggle
        document.getElementById('window-resizable-toggle')?.addEventListener('change', (e) => {
            const target = e.target as HTMLInputElement;
            this.windowResizable = target.checked;
            localStorage.setItem(this.getStorageKey('window_resizable'), String(this.windowResizable));
            (window as any).api.setResizable(this.windowResizable);
            this.pushSettings();
            this.showToast(this.windowResizable ? "App is now resizable" : "App is now fixed size", "info");
            this.updateLastActivity(`Window resizing ${this.windowResizable ? 'on' : 'off'}`);
        });

        // Accent Color
        this.setupAccentColorSelector();
        const savedAccent = localStorage.getItem(this.getStorageKey('accent_color')) || 'royal-purple';
        this.setAccentColor(savedAccent, true);

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

    private setupAccentColorSelector() {
        this.theme.setupAccentColorSelector((accent) => {
            this.setAccentColor(accent);
            this.showToast("Color updated!", "success");
            this.updateLastActivity(`Changed color to ${accent}`);
        });
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
                this.updateSegmentedUI('autolock-segmented', '0');
                localStorage.setItem(this.getStorageKey('autolock'), '0');
                this.pushSettings();
            }
        }
    }

    private async loadInitialData() {
        try {
            const user = await (window as any).api.getCurrentUser();
            if (user) {
                const nameDisplay = document.getElementById('user-name-display');
                if (nameDisplay) nameDisplay.textContent = user.username;

                // Navbar avatar: show profile picture or initials
                const navbarAvatarImg = document.getElementById('navbar-avatar-img') as HTMLImageElement;
                const navbarAvatarInitials = document.getElementById('navbar-avatar-initials');
                if (navbarAvatarImg && navbarAvatarInitials) {
                    if (user.profilePicture) {
                        navbarAvatarImg.src = user.profilePicture;
                        navbarAvatarImg.classList.remove('hidden');
                        navbarAvatarInitials.classList.add('hidden');
                    } else {
                        navbarAvatarImg.classList.add('hidden');
                        navbarAvatarInitials.classList.remove('hidden');
                        navbarAvatarInitials.textContent = user.username.charAt(0).toUpperCase();
                    }
                }

                // Populate dropdown header
                const dropdownName = document.getElementById('dropdown-user-name');
                const dropdownEmail = document.getElementById('dropdown-user-email');
                if (dropdownName) dropdownName.textContent = user.username;
                if (dropdownEmail) dropdownEmail.textContent = user.isLocal ? "Local-Only Account" : (user.email || 'Keyra Secure Vault');

                this.handleLocalAccountUI(user);
            }
            await this.refreshAccounts();
            this.updateAccountView();
            this.updateSyncIndicator('synced');
        } catch (err) {
            console.error("Load failed", err);
        }
    }


    private async updateAccountView() {
        return this.auth.updateAccountView();
    }

}

