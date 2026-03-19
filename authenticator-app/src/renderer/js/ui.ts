import { syncVault } from './store.js';
import { rateLimiter } from '../../core/rateLimiter.js';
import { ThemeManager } from './managers/ThemeManager.js';
import { SyncManager } from './managers/SyncManager.js';
import { AccountManager } from './managers/AccountManager.js';
import { AuthManager } from './managers/AuthManager.js';
import { ConnectivityManager } from './managers/ConnectivityManager.js';
import { NavigationManager, TabName } from './managers/NavigationManager.js';
import { PrivacyManager } from './managers/PrivacyManager.js';
import { SystemManager } from './managers/SystemManager.js';

export class UIManager {
    public theme: ThemeManager;
    public sync: SyncManager;
    public accounts: AccountManager;
    public auth: AuthManager;
    public connectivity: ConnectivityManager;
    public nav: NavigationManager;
    public privacy: PrivacyManager;
    public system: SystemManager;
    private timerInterval: any = null;
    private menuExitIntegration: boolean = false;
    private windowResizable: boolean = false;
    private wallpaperPreset: string = 'nebula';
    private searchQuery: string = '';
    private vaultViewStyle: 'unified' | 'compact' | 'secure' = 'compact';


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
            getVaultViewStyle: () => this.vaultViewStyle,
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
            updateLockVaultVisibility: () => this.updateLockVaultVisibility(),
            updatePinStatus: () => this.updatePinStatus(),
            updateSyncIndicator: (state) => this.updateSyncIndicator(state as any),
            setSyncVisible: (visible) => { this.sync.syncVisible = visible; },
            formatSyncTime: (date) => this.formatSyncTime(date),
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
            showToast: (msg, type) => this.showToast(msg, type),
            setLoading: (show, title, subtitle) => this.setLoading(show, title, subtitle),
        });
        this.theme.init();
        this.privacy.initPrivacyMode();
        this.privacy.initScreenGuardian();
        this.initMenuExitIntegration();
        this.privacy.initInteractivePrivacy();
        this.initWindowResizable();
        this.initVaultViewStyle();
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
        this.system.initUpdateSystem();
        this.system.initSystemIntegration();
        this.initPhoneSecurity();
        this.migratePin();
    }

    private initUpdateSystem() {
        this.system.initUpdateSystem();
    }

    private initConnectivityStatus() {
        this.connectivity.init();
    }

    private updateConnectivityStatus() {
        this.connectivity.updateStatus();
    }

    private initSystemIntegration() {
        this.system.initSystemIntegration();
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

    private startLastSyncTimer() {
        this.sync.startLastSyncTimer();
    }

    private updateLastSyncDisplay() {
        this.sync.updateLastSyncDisplay();
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
                autoCheckUpdates: this.system.autoCheckUpdates,
                vaultViewStyle: this.vaultViewStyle,
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
            this.vaultViewStyle = settings.vaultViewStyle;
            this.updateSegmentedUI('countdown-style-segmented', this.vaultViewStyle);
            
            // Immediately toggle global bar visibility
            const globalVessel = document.getElementById('global-timer-vessel');
            if (globalVessel) globalVessel.classList.toggle('hidden', this.vaultViewStyle !== 'unified');
            
            this.renderAccounts();
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
            this.system.autoCheckUpdates = !!settings.autoCheckUpdates;
            const autoToggle = document.getElementById('auto-update-toggle') as HTMLInputElement;
            if (autoToggle) autoToggle.checked = this.system.autoCheckUpdates;
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
            localStorage.setItem(this.getStorageKey('auto_check_updates'), String(this.system.autoCheckUpdates));
            localStorage.setItem(this.getStorageKey('vault_view_style'), this.vaultViewStyle);
            if (settings.vaultPin !== undefined) localStorage.setItem(this.getStorageKey('vault_pin'), settings.vaultPin);
        }

        this.updateLockVaultVisibility();
        this.renderAccounts();
    }

    private initTheme() {
        // Delegated to ThemeManager — kept for compatibility
        this.theme.init();
    }

    public setTheme(theme: string, silent: boolean = false) {
        this.theme.setTheme(theme, silent);
    }

    public setAccentColor(accentColor: string, silent: boolean = false) {
        this.theme.setAccentColor(accentColor, silent);
    }

    private initPrivacyMode() {
        this.privacy.initPrivacyMode();
    }

    private initScreenGuardian() {
        this.privacy.initScreenGuardian();
    }

    private initPerformanceMode() {
        // Delegated to ThemeManager
        this.theme.applyPerformanceMode(this.theme.performanceMode);
    }

    private initOledMode() {
        // Delegated to ThemeManager
        this.theme.applyOledMode(this.theme.oledMode);
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

    private initInteractivePrivacy() {
        this.privacy.initInteractivePrivacy();
    }

    private async migratePin() {
        return this.auth.migratePin();
    }

    private initVaultViewStyle() {
        const saved = localStorage.getItem(this.getStorageKey('vault_view_style')) as any;
        if (saved && ['unified', 'compact', 'secure'].includes(saved)) {
            this.vaultViewStyle = saved;
        } else {
            // Check legacy key if any or default
            const legacy = localStorage.getItem(this.getStorageKey('vaultViewStyle')) as any;
            if (legacy && ['unified', 'compact', 'secure'].includes(legacy)) {
                this.vaultViewStyle = legacy;
                localStorage.setItem(this.getStorageKey('vault_view_style'), legacy);
                localStorage.removeItem(this.getStorageKey('vaultViewStyle'));
            }
        }
        
        // Apply initial visibility
        const globalVessel = document.getElementById('global-timer-vessel');
        if (globalVessel) globalVessel.classList.toggle('hidden', this.vaultViewStyle !== 'unified');
    }

    private showPrivacyOverlay() {
        this.privacy.showOverlay();
    }

    private hidePrivacyOverlay() {
        this.privacy.hideOverlay();
    }

    private initSegmentedStates() {
        const theme = localStorage.getItem(this.getStorageKey('theme')) || 'auto';
        this.updateSegmentedUI('theme-segmented', theme);

        const autolock = localStorage.getItem(this.getStorageKey('autolock')) || '0';
        this.updateSegmentedUI('autolock-segmented', autolock);

        this.updateSegmentedUI('countdown-style-segmented', this.vaultViewStyle);
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
            this.showAddModal();
            this.updateLastActivity('Opened add account');
        });
        document.getElementById('empty-add-btn')?.addEventListener('click', () => this.showAddModal());

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

        // Vault View Type Toggle (Vault View Header)
        const countdownSegmented = document.getElementById('countdown-style-segmented');
        countdownSegmented?.querySelectorAll('.segment').forEach(btn => {
            btn.addEventListener('click', () => {
                const val = btn.getAttribute('data-val') as any;
                this.vaultViewStyle = val || 'unified';
                localStorage.setItem(this.getStorageKey('vault_view_style'), this.vaultViewStyle);
                this.updateSegmentedUI('countdown-style-segmented', this.vaultViewStyle);
                
                const globalVessel = document.getElementById('global-timer-vessel');
                if (globalVessel) globalVessel.classList.toggle('hidden', this.vaultViewStyle !== 'unified');
                
                this.renderAccounts();
                this.pushSettings();
                this.showToast(`View style: ${this.vaultViewStyle.charAt(0).toUpperCase() + this.vaultViewStyle.slice(1)}`, "info");
                this.updateLastActivity(`Changed view to ${this.vaultViewStyle}`);
            });
        });

        // Settings PIN
        document.getElementById('setup-pin-btn')?.addEventListener('click', () => this.showPinSetup());

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

        // Vault Maintenance
        document.getElementById('btn-export-vault')?.addEventListener('click', async () => {
            this.showExportOptionsModal();
        });
        document.getElementById('btn-import-vault')?.addEventListener('click', async () => {
            this.setLoading(true, "Opening Explorer", "SELECTING BACKUP FILE");
            try {
                const res = await (window as any).api.importVault();
                if (res.success && res.data) {
                    await this.showImportPasswordModal(res.data);
                }
            } finally {
                this.setLoading(false);
            }
        });

        // Search
        const searchInput = document.getElementById('vault-search') as HTMLInputElement;
        searchInput?.addEventListener('input', (e) => {
            const target = e.target as HTMLInputElement;
            this.searchQuery = target.value.toLowerCase().trim();
            this.renderAccounts();
        });

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

        // Accent Color
        this.setupAccentColorSelector();
        const savedAccent = localStorage.getItem(this.getStorageKey('accent_color')) || 'royal-purple';
        this.setAccentColor(savedAccent, true);

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
            this.showRemovePinConfirm();
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
                
                console.log("[Auth] Forgot PIN clicked!");
                this.showForgotPinConfirm();
            });
        } else {
            console.warn("[Auth] Forgot PIN button NOT FOUND in DOM.");
        }

        this.setupAccountEvents();
    }

    private setupAccountEvents() {
        this.auth.setupAccountEvents();
    }

    private async handleEmailVerification() {
        return this.auth.handleEmailVerification();
    }

    private startEmailResendTimer() {
        this.auth.startEmailResendTimer();
    }

    private updateResendBtnUI() {
        this.auth.updateResendBtnUI();
    }

    private async loadAccountInfo() {
        return this.auth.loadAccountInfo();
    }

    private handleLocalAccountUI(user: any) {
        this.auth.handleLocalAccountUI(user);
    }

    private async openPrivateSyncModal() {
        this.sync.openPrivateSyncModal();
    }

    private async testPrivateSyncConnection() {
        this.sync.testPrivateSyncConnection();
    }

    private async savePrivateSyncConfig() {
        this.sync.savePrivateSyncConfig(() => this.loadInitialData());
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

    private async manualSync() {
        this.sync.manualSync();
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
    
    private showSkeletonLoaders(count: number = 6) {
        this.accounts.showSkeletonLoaders(count);
    }
    
    private createSkeletonCard(index: number): HTMLElement {
        // Delegated — kept for internal compatibility
        const card = document.createElement('div');
        card.className = 'skeleton-card';
        card.style.animationDelay = `${index * 0.06}s`;
        card.innerHTML = `
            <div class="skeleton-header">
                <div class="skeleton-icon skeleton-shimmer"></div>
                <div class="skeleton-text-group">
                    <div class="skeleton-text title skeleton-shimmer"></div>
                    <div class="skeleton-text subtitle skeleton-shimmer"></div>
                </div>
            </div>
            <div class="skeleton-otp skeleton-shimmer"></div>
            <div class="skeleton-button skeleton-shimmer"></div>
        `;
        return card;
    }

    private renderAccounts() {
        this.accounts.renderAccounts();
    }

    private createAccountCard(account: any, index: number): HTMLElement {
        return this.accounts.createAccountCard(account, index);
    }

    private async handleScannedData(data: string) {
        return this.accounts.handleScannedData(data);
    }

    private async updateCardOTP(card: HTMLElement, otp: string, remaining: number) {
        return this.accounts.updateCardOTP(card, otp, remaining);
    }

    private updateOtpModal(otp: string, remaining: number) {
        this.accounts.updateOtpModal(otp, remaining);
    }

    private async showOtpModal(account: any) {
        return this.accounts.showOtpModal(account);
    }

    private startTimer() {
        // Delegated to AccountManager
        this.accounts.startTimer();
    }

    private showSyncConflictModal(action: string, data: any) {
        this.accounts.showSyncConflictModal(action, data);
    }

    private getIcon(issuer: string): string {
        return this.accounts.getIcon(issuer);
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
        return this.auth.lockVault();
    }

    private handleUnlock() {
        this.auth.handleUnlock();
    }

    private async validateAndAutoUnlock(pinValue: string) {
        return this.auth.validateAndAutoUnlock(pinValue);
    }

    private clearPinInput() {
        this.auth.clearPinInput();
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

    private async verifyCurrentPin(onSuccess: () => void) {
        return this.auth.verifyCurrentPin(onSuccess);
    }

    private showRemovePinConfirm() {
        this.auth.showRemovePinConfirm();
    }
    private showPinSetup() {
        this.auth.showPinSetup();
    }

    private showAddModal() {
        this.accounts.showAddModal();
    }

    private showEditModal(account: any) {
        this.accounts.showEditModal(account);
    }

    private showDeleteConfirm(account: any) {
        this.accounts.showDeleteConfirm(account);
    }

    private async showImportPasswordModal(data: any) {
        console.log('showImportPasswordModal called with data:', {
            hasSalt: !!data?.salt,
            hasEncryptedVaultData: !!data?.encryptedVaultData,
            hasEncryptedSettings: !!data?.encryptedSettings,
            hasChecksum: !!data?.checksum,
            version: data?.version,
            timestamp: data?.timestamp,
            accountCount: data?.accountCount,
            keys: Object.keys(data || {})
        });
        
        // Verify backup file first
        const verification = await (window as any).api.verifyBackupFile(data);
        console.log('Verification result:', verification);
        
        // Support both new encrypted format and legacy plaintext format
        const { 
            salt, 
            encryptedVaultData, 
            encryptedSettings,
            autolock, 
            "Desktop Settings": desktopSettings, 
            "Web Settings": webSettings 
        } = data;
        
        // Format timestamp if available
        let dateStr = "Unknown";
        if (verification.timestamp) {
            const date = new Date(verification.timestamp);
            dateStr = date.toLocaleDateString('en-US', { 
                year: 'numeric', 
                month: 'short', 
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        }
        
        // Encryption status badge
        const encryptionBadge = verification.encrypted 
            ? '<div class="badge" style="background: var(--success); color: white; padding: 4px 12px; border-radius: 20px; font-size: 10px; font-weight: 800;"><i class="fa-solid fa-lock"></i> FULLY ENCRYPTED</div>'
            : '<div class="badge" style="background: #ff9500; color: white; padding: 4px 12px; border-radius: 20px; font-size: 10px; font-weight: 800;"><i class="fa-solid fa-triangle-exclamation"></i> LEGACY FORMAT</div>';
        
        // Checksum status
        let checksumStatus = '';
        if (verification.hasChecksum) {
            if (verification.checksumValid) {
                checksumStatus = '<div style="display: flex; align-items: center; gap: 8px; color: var(--success); font-size: 13px; font-weight: 700; margin-top: 12px;"><i class="fa-solid fa-circle-check"></i><span>Integrity Verified</span></div>';
            } else {
                checksumStatus = '<div style="display: flex; align-items: center; gap: 8px; color: #ff3b30; font-size: 13px; font-weight: 700; margin-top: 12px;"><i class="fa-solid fa-triangle-exclamation"></i><span>Checksum Mismatch - File may be corrupted</span></div>';
            }
        }
        
        // Warning if backup is invalid
        const warningSection = !verification.valid 
            ? `<div style="background: rgba(255, 59, 48, 0.1); border: 2px solid #ff3b30; border-radius: var(--radius-md); padding: var(--space-md); margin-bottom: var(--space-md);">
                <div style="display: flex; align-items: center; gap: 12px; color: #ff3b30;">
                    <i class="fa-solid fa-circle-exclamation" style="font-size: 24px;"></i>
                    <div>
                        <div style="font-weight: 800; font-size: 14px; margin-bottom: 4px;">Invalid Backup File</div>
                        <div style="font-size: 12px; opacity: 0.9;">${verification.error || 'This file cannot be restored'}</div>
                    </div>
                </div>
            </div>`
            : '';
        
        const content = `
            <div class="modal-content" style="max-width: 600px; padding: clamp(24px, 5vw, 40px);">
                <!-- Header -->
                <div style="display: flex; align-items: flex-start; gap: 20px; margin-bottom: 28px;">
                    <div class="modal-icon-vessel" style="width: 72px; height: 72px; flex-shrink: 0;">
                        <i class="fa-solid fa-upload" style="font-size: 32px;"></i>
                    </div>
                    <div style="flex: 1; min-width: 0;">
                        <h2 style="font-weight: 900; font-size: clamp(22px, 4vw, 28px); color: var(--text-primary); margin: 0 0 12px 0; line-height: 1.2;">Restore Vault</h2>
                        <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                            <div style="font-size: 11px; font-weight: 800; letter-spacing: 0.8px; color: var(--text-secondary); text-transform: uppercase;">Verify Master Key</div>
                            ${encryptionBadge}
                        </div>
                    </div>
                </div>
                
                ${warningSection}
                
                <!-- Backup Details Card -->
                <div style="background: var(--bg-primary); border-radius: 16px; padding: 20px; box-shadow: var(--nm-shadow-in-sm); margin-bottom: 24px;">
                    <div style="font-size: 10px; font-weight: 800; letter-spacing: 1px; color: var(--text-secondary); margin-bottom: 16px; text-transform: uppercase; opacity: 0.7;">Backup Information</div>
                    
                    <div style="display: grid; gap: 16px;">
                        <!-- Version -->
                        <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; background: var(--bg-secondary); border-radius: 12px; transition: all 0.2s ease;">
                            <div style="display: flex; align-items: center; gap: 14px; flex: 1; min-width: 0;">
                                <div style="width: 40px; height: 40px; border-radius: 10px; background: var(--bg-primary); box-shadow: var(--nm-shadow-in-sm); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                                    <i class="fa-solid fa-code-branch" style="font-size: 16px; color: var(--accent-primary);"></i>
                                </div>
                                <div style="flex: 1; min-width: 0;">
                                    <div style="font-size: 12px; font-weight: 700; color: var(--text-secondary); margin-bottom: 2px; text-transform: uppercase; letter-spacing: 0.5px;">Version</div>
                                    <div style="font-size: 15px; font-weight: 800; color: var(--text-primary); font-family: 'JetBrains Mono', monospace;">${verification.version || 'Unknown'}</div>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Created Date -->
                        <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; background: var(--bg-secondary); border-radius: 12px; transition: all 0.2s ease;">
                            <div style="display: flex; align-items: center; gap: 14px; flex: 1; min-width: 0;">
                                <div style="width: 40px; height: 40px; border-radius: 10px; background: var(--bg-primary); box-shadow: var(--nm-shadow-in-sm); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                                    <i class="fa-solid fa-clock" style="font-size: 16px; color: var(--accent-primary);"></i>
                                </div>
                                <div style="flex: 1; min-width: 0;">
                                    <div style="font-size: 12px; font-weight: 700; color: var(--text-secondary); margin-bottom: 2px; text-transform: uppercase; letter-spacing: 0.5px;">Created</div>
                                    <div style="font-size: 14px; font-weight: 700; color: var(--text-primary);">${dateStr}</div>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Accounts Count -->
                        <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; background: var(--bg-secondary); border-radius: 12px; transition: all 0.2s ease;">
                            <div style="display: flex; align-items: center; gap: 14px; flex: 1; min-width: 0;">
                                <div style="width: 40px; height: 40px; border-radius: 10px; background: var(--bg-primary); box-shadow: var(--nm-shadow-in-sm); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                                    <i class="fa-solid fa-key" style="font-size: 16px; color: var(--accent-primary);"></i>
                                </div>
                                <div style="flex: 1; min-width: 0;">
                                    <div style="font-size: 12px; font-weight: 700; color: var(--text-secondary); margin-bottom: 2px; text-transform: uppercase; letter-spacing: 0.5px;">Accounts</div>
                                    <div style="font-size: 15px; font-weight: 800; color: var(--text-primary);">${verification.accountCount !== undefined ? verification.accountCount : 'Unknown'}</div>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Encryption -->
                        <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; background: var(--bg-secondary); border-radius: 12px; transition: all 0.2s ease;">
                            <div style="display: flex; align-items: center; gap: 14px; flex: 1; min-width: 0;">
                                <div style="width: 40px; height: 40px; border-radius: 10px; background: var(--bg-primary); box-shadow: var(--nm-shadow-in-sm); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                                    <i class="fa-solid fa-${verification.encrypted ? 'shield-halved' : 'shield'}" style="font-size: 16px; color: ${verification.encrypted ? 'var(--success)' : '#ff9500'};"></i>
                                </div>
                                <div style="flex: 1; min-width: 0;">
                                    <div style="font-size: 12px; font-weight: 700; color: var(--text-secondary); margin-bottom: 2px; text-transform: uppercase; letter-spacing: 0.5px;">Encryption</div>
                                    <div style="font-size: 14px; font-weight: 800; color: var(--text-primary); font-family: 'JetBrains Mono', monospace;">${verification.encrypted ? 'AES-256-GCM' : 'Partial (Legacy)'}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    ${checksumStatus}
                </div>
                
                <!-- Password Input -->
                <div style="margin-bottom: 24px;">
                    <label style="display: block; font-size: 13px; font-weight: 800; color: var(--text-primary); margin-bottom: 10px; letter-spacing: 0.3px;">Backup Master Password</label>
                    <input type="password" id="import-pass" class="form-input" placeholder="Enter your master password" autocomplete="current-password" ${!verification.valid ? 'disabled' : ''} style="width: 100%; height: 52px; font-size: 15px;">
                    <p style="font-size: 12px; color: var(--text-secondary); margin-top: 8px; font-weight: 600; line-height: 1.5;">Enter the master password used when this backup was created.</p>
                </div>
                
                <!-- Action Buttons -->
                <div style="display: flex; gap: 12px;">
                    <button class="btn-primary" id="confirm-import" style="flex: 2; height: 56px; font-size: 15px; font-weight: 800; border-radius: 14px;" ${!verification.valid ? 'disabled' : ''}>
                        <i class="fa-solid fa-shield-halved"></i>
                        <span>Restore Vault</span>
                    </button>
                    <button class="user-button" id="cancel-import" style="flex: 1; justify-content: center; height: 56px; font-weight: 800; border-radius: 14px;">Cancel</button>
                </div>
            </div>
        `;
        this.showModal(content);
        
        if (verification.valid) {
            document.getElementById('confirm-import')?.addEventListener('click', async () => {
                const pass = (document.getElementById('import-pass') as HTMLInputElement).value;
                
                // Show warning if checksum is invalid
                if (verification.hasChecksum && !verification.checksumValid) {
                    const confirmed = confirm("Warning: Backup file integrity check failed. The file may be corrupted or tampered with. Continue anyway?");
                    if (!confirmed) return;
                }
                
                this.setLoading(true, "Restoring Vault", "DECRYPTING BACKUP ARCHIVE");
                try {
                    const res = await (window as any).api.performVaultImport(
                        salt, 
                        encryptedVaultData, 
                        pass, 
                        encryptedSettings,
                        autolock, 
                        desktopSettings, 
                        webSettings
                    );
                    if (res.success) {
                        this.hideModal();
                        this.showToast("Vault restored!", "success");
                        await this.refreshAccounts();
                    } else this.showToast(res.message, "error");
                } finally {
                    this.setLoading(false);
                }
            });
            document.getElementById('import-pass')?.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') document.getElementById('confirm-import')?.click();
            });
        }
        
        document.getElementById('cancel-import')?.addEventListener('click', () => this.hideModal());
    }

    private startLiveSync() {
        // Delegated to SyncManager
        this.sync.startLiveSync();
    }

    private async checkForUpdates() {
        // Delegated to SyncManager
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


    private showPhoneQrModal() {
        this.auth.showPhoneQrModal();
    }

    private hidePhoneQrModal() {
        this.auth.hidePhoneQrModal();
    }

    private initPhoneSecurity() {
        this.auth.initPhoneSecurity();
    }

    private initWhatsAppLinking() {
        this.auth.initWhatsAppLinking();
    }

    private async updateAccountView() {
        return this.auth.updateAccountView();
    }

    private maskPhoneNumber(phone: string): string {
        if (!phone) return 'XX XXX XX';
        const digits = phone.replace(/\D/g, '');
        if (digits.length < 2) return phone;
        return `XXXX XXX XX${digits.slice(-2)}`;
    }

    private showForgotPinConfirm() {
        console.log("[UI] Showing Forgot PIN modal...");
        const modal = document.getElementById('modal-forgot-pin');
        if (!modal) {
            console.error("[UI] Forgot PIN modal NOT FOUND!");
            return;
        }

        // View elements
        const mainView = document.getElementById('forgot-pin-main-view');
        const waView = document.getElementById('forgot-pin-wa-view');
        const codeView = document.getElementById('forgot-pin-code-view');
        const waDivider = document.getElementById('forgot-pin-wa-divider');
        const waButton = document.getElementById('btn-forgot-pin-whatsapp');

        // Helper to switch views
        const showView = (view: 'main' | 'wa' | 'code') => {
            mainView?.classList.toggle('hidden', view !== 'main');
            waView?.classList.toggle('hidden', view !== 'wa');
            codeView?.classList.toggle('hidden', view !== 'code');
        };

        // Reset to main view
        showView('main');

        // Reset all inputs and errors
        const passwordInput = document.getElementById('forgot-pin-password') as HTMLInputElement;
        const passForm = document.getElementById('form-forgot-pin');
        const confirmBtn = document.getElementById('confirm-forgot-pin-btn');
        const codeInput = document.getElementById('forgot-pin-verify-code') as HTMLInputElement;
        
        if (passwordInput) passwordInput.value = '';
        if (codeInput) codeInput.value = '';
        
        // Hide password form by default
        passForm?.classList.add('hidden');
        if (confirmBtn) {
            confirmBtn.innerHTML = '<i class="fa-solid fa-trash-can"></i> Reset PIN & Sign Out';
        }

        document.querySelectorAll('#modal-forgot-pin .hidden[id$="-error"]').forEach(el => el.classList.add('hidden'));

        modal.classList.remove('hidden');
        modal.classList.add('show');
        modal.style.zIndex = "99999";
        // Remove immediate focus since the input is now hidden initially
        // setTimeout(() => passwordInput?.focus(), 100);

        // Error helpers
        const showError = (id: string, msg: string) => {
            const el = document.getElementById(id);
            if (el) { el.textContent = msg; el.classList.remove('hidden'); }
        };
        const hideError = (id: string) => {
            const el = document.getElementById(id);
            if (el) { el.textContent = ''; el.classList.add('hidden'); }
        };

        // Common PIN reset completion
        const completePinReset = async () => {
            this.setLoading(true, "Resetting Security", "REMOVING PIN & SYNCING");
            localStorage.removeItem(this.getStorageKey('vault_pin'));
            this.updateLockVaultVisibility();
            this.updatePinStatus();
            this.pushSettings().catch(e => console.warn("PIN reset sync failed", e));
            modal.classList.remove('show');
            setTimeout(() => modal.classList.add('hidden'), 300);
            this.setLoading(true, "Signing Out", "RETURNING TO LOGIN");
            await (window as any).api.logout();
            window.location.reload();
        };

        // --- Master Password Handler ---
        const confirmHandler = async (e?: Event) => {
            e?.preventDefault();
            const pForm = document.getElementById('form-forgot-pin');
            const pInput = document.getElementById('forgot-pin-password') as HTMLInputElement;
            const cBtn = document.getElementById('confirm-forgot-pin-btn');

            // If form is hidden, show it first (Requirement: box shouldn't appear till button click)
            if (pForm?.classList.contains('hidden')) {
                pForm.classList.remove('hidden');
                if (cBtn) {
                    cBtn.innerHTML = '<i class="fa-solid fa-check"></i> Confirm Reset & Sign Out';
                }
                setTimeout(() => pInput?.focus(), 100);
                return;
            }

            const password = pInput?.value || '';
            hideError('forgot-pin-error');
            
            if (!password) {
                showError('forgot-pin-error', 'Please enter your master password.');
                pInput?.focus();
                return;
            }

            this.setLoading(true, "Verifying Identity", "CHECKING MASTER PASSWORD");
            try {
                const result = await (window as any).api.verifyMasterPassword(password);
                if (!result.success) {
                    this.setLoading(false);
                    showError('forgot-pin-error', result.message || 'Incorrect password.');
                    pInput?.select();
                    return;
                }
                // Clear password on success for security
                if (pInput) pInput.value = '';
                await completePinReset();
            } catch (err) {
                this.setLoading(false);
                showError('forgot-pin-error', 'An error occurred. Please try again.');
            }
        };

        // --- Cancel/Close Handler ---
        const cancelHandler = () => {
            // Smart Back: If not in main view, return to options instead of closing
            const currentView = Array.from(modal.querySelectorAll('.modal-content')).find(v => !v.classList.contains('hidden'))?.id;
            
            if (currentView && currentView !== 'forgot-pin-main-view') {
                showView('main');
                // Reset password form state when going back
                passForm?.classList.add('hidden');
                if (passwordInput) passwordInput.value = '';
                if (confirmBtn) {
                    confirmBtn.innerHTML = '<i class="fa-solid fa-trash-can"></i> Reset PIN & Sign Out';
                }
                return;
            }

            (window as any).api.clearPinResetCode();
            modal.classList.remove('show');
            setTimeout(() => modal.classList.add('hidden'), 300);
            document.getElementById('unlock-pin')?.focus();
        };

        // --- WhatsApp Flow ---
        let verifiedPhone: string | null = null;

        const startWhatsAppFlow = async () => {
            showView('wa');
            const qrImg = document.getElementById('forgot-pin-wa-qr') as HTMLImageElement;
            const loader = document.getElementById('forgot-pin-wa-loader');
            const overlay = document.getElementById('forgot-pin-wa-overlay');
            const status = document.getElementById('forgot-pin-wa-status');
            const errorEl = document.getElementById('forgot-pin-wa-error');
            const errorText = document.getElementById('forgot-pin-wa-error-text');

            // Reset state
            loader?.classList.remove('hidden');
            qrImg?.classList.add('hidden');
            overlay?.classList.add('hidden');
            errorEl?.classList.add('hidden');
            if (status) status.textContent = 'INITIALIZING...';

            const showWaError = (msg: string) => {
                if (errorText) errorText.textContent = msg;
                errorEl?.classList.remove('hidden');
            };

            const updateWaUI = (state: { qr?: string, initializing?: boolean, authenticated?: boolean, ready?: boolean, waNumber?: string }) => {
                errorEl?.classList.add('hidden');
                
                if (state.authenticated) {
                    overlay?.classList.remove('hidden');
                    if (status) status.textContent = 'VERIFYING IDENTITY';
                } else if (state.ready && state.waNumber) {
                    // Check phone match
                    checkPhoneMatch(state.waNumber);
                } else if (state.qr) {
                    if (qrImg) qrImg.src = state.qr;
                    loader?.classList.add('hidden');
                    qrImg?.classList.remove('hidden');
                    overlay?.classList.add('hidden');
                    if (status) status.textContent = 'SCAN QR CODE';
                } else if (state.initializing) {
                    loader?.classList.remove('hidden');
                    qrImg?.classList.add('hidden');
                    overlay?.classList.add('hidden');
                    if (status) status.textContent = 'INITIALIZING...';
                }
            };

            const checkPhoneMatch = async (waNumber: string) => {
                try {
                    const user = await (window as any).api.getCurrentUser();
                    if (!user?.phone) {
                        showWaError('No verified phone number found.');
                        overlay?.classList.add('hidden');
                        return;
                    }

                    // Normalize for comparison
                    const normalizedAccount = user.phone.replace(/\D/g, '');
                    const normalizedWa = waNumber.replace(/\D/g, '');

                    if (normalizedAccount.length >= 8 && normalizedWa.length >= 8 &&
                        (normalizedWa.endsWith(normalizedAccount) || normalizedAccount.endsWith(normalizedWa))) {
                        // Phone matches! Get the PIN and send it
                        verifiedPhone = user.phone;
                        if (status) status.textContent = 'SENDING PIN...';
                        
                        // Get the encrypted PIN from localStorage and decrypt it
                        const encryptedPin = localStorage.getItem(this.getStorageKey('vault_pin'));
                        if (!encryptedPin) {
                            showWaError('No PIN found to recover.');
                            overlay?.classList.add('hidden');
                            return;
                        }

                        let pin: string;
                        try {
                            pin = await (window as any).api.decryptPIN(encryptedPin);
                        } catch (e) {
                            showWaError('Failed to retrieve PIN.');
                            overlay?.classList.add('hidden');
                            return;
                        }

                        // Send PIN via WhatsApp
                        const sendResult = await (window as any).api.sendPinResetCode(
                            user.phone, 
                            `🔐 Your Keyra Vault PIN is: ${pin}\n\n⚠️ For security, please delete this message after reading.`
                        );
                        
                        if (!sendResult.success) {
                            showWaError(sendResult.message || 'Failed to send PIN.');
                            overlay?.classList.add('hidden');
                            return;
                        }

                        // Show success view
                        const phoneDisplay = document.getElementById('forgot-pin-code-phone');
                        if (phoneDisplay) {
                            phoneDisplay.textContent = this.maskPhoneNumber(user.phone);
                        }
                        showView('code');
                        this.showToast('PIN sent to your WhatsApp!', 'success');
                    } else {
                        showWaError('WhatsApp number does not match your verified phone.');
                        overlay?.classList.add('hidden');
                        if (status) status.textContent = 'MISMATCH';
                    }
                } catch (err) {
                    console.error('[UI] Phone match check error:', err);
                    showWaError('Verification failed. Please try again.');
                    overlay?.classList.add('hidden');
                }
            };

            // Set up WhatsApp listeners
            (window as any).api.onWaInitializing(() => updateWaUI({ initializing: true }));
            (window as any).api.onWaQrCode((qr: string) => updateWaUI({ qr }));
            (window as any).api.onWaAuthenticated(() => updateWaUI({ authenticated: true }));
            (window as any).api.onWaReady((waNumber?: string) => updateWaUI({ ready: true, waNumber }));
            (window as any).api.onWaAuthFailure((err: string) => {
                showWaError(`WhatsApp error: ${err}`);
                if (status) status.textContent = 'ERROR';
            });

            // Start WhatsApp
            (window as any).api.startWhatsAppLinking();
            const currentStatus = await (window as any).api.getWaStatus();
            updateWaUI(currentStatus);
        };

        // --- Done Handler (close modal and return to PIN entry) ---
        const doneHandler = () => {
            modal.classList.remove('show');
            setTimeout(() => modal.classList.add('hidden'), 300);
            const pinIn = document.getElementById('unlock-pin') as HTMLInputElement;
            if (pinIn) {
                pinIn.value = '';
                pinIn.focus();
            }
        };

        // --- Attach Event Listeners (clone to remove old) ---
        const attachListener = (id: string, handler: (e?: Event) => void, event = 'click') => {
            const el = document.getElementById(id);
            if (el) {
                const newEl = el.cloneNode(true);
                el.parentNode?.replaceChild(newEl, el);
                newEl.addEventListener(event, handler);
            }
        };

        attachListener('confirm-forgot-pin-btn', confirmHandler);
        attachListener('cancel-forgot-pin-btn', cancelHandler);
        attachListener('btn-forgot-pin-whatsapp', startWhatsAppFlow);
        attachListener('btn-pin-sent-done', doneHandler);

        // Form submissions
        const form1 = document.getElementById('form-forgot-pin');
        if (form1) {
            const newForm = form1.cloneNode(true);
            form1.parentNode?.replaceChild(newForm, form1);
            newForm.addEventListener('submit', confirmHandler);
            setTimeout(() => (document.getElementById('forgot-pin-password') as HTMLInputElement)?.focus(), 150);
        }

        // Check if user has verified phone for WhatsApp option (AFTER cloning)
        (window as any).api.getCurrentUser().then((user: any) => {
            const hasVerifiedPhone = user?.phone && user?.isPhoneVerified;
            const divider = document.getElementById('forgot-pin-wa-divider');
            const waBtn = document.getElementById('btn-forgot-pin-whatsapp');
            
            if (hasVerifiedPhone) {
                divider?.classList.remove('hidden');
                waBtn?.classList.remove('hidden');
                if (divider) (divider as HTMLElement).style.display = 'flex';
                const phoneHint = document.getElementById('forgot-pin-wa-phone-hint');
                if (phoneHint) {
                    phoneHint.textContent = `Use the WhatsApp account linked to ${this.maskPhoneNumber(user.phone)}`;
                }
            } else {
                divider?.classList.add('hidden');
                waBtn?.classList.add('hidden');
            }
        });
    }
    
    private showExportOptionsModal() {
        this.accounts.showExportOptionsModal();
    }
    
    private async performExport(format: string, accountsList: any[]) {
        return this.accounts.performExport(format, accountsList);
    }
}

