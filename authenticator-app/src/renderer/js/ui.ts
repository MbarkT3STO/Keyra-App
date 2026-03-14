import { syncVault } from './store.js';

export class UIManager {
    private currentTheme: 'light' | 'dark' = 'light';
    private currentTab: 'vault' | 'settings' | 'account' = 'vault';
    private accounts: any[] = [];
    private timerInterval: any = null;
    private privacyMode: boolean = false;
    private screenGuardian: boolean = false;
    private oledMode: boolean = false;
    private performanceMode: boolean = false;
    private menuExitIntegration: boolean = false;
    private privacyBlur: boolean = false;
    private wallpaperPreset: string = 'nebula';
    private searchQuery: string = '';
    private syncCount: number = 0;
    private liveSyncInterval: any = null;
    private emailResendTimer: number = 0;
    private emailResendInterval: any = null;

    constructor(public userId: string = 'default') {
        this.initTheme();
        this.initOSThemeDetection();
        this.initPrivacyMode();
        this.initScreenGuardian();
        this.initPerformanceMode();
        this.initMenuExitIntegration();
        this.initInteractivePrivacy();
        this.initSegmentedStates();
        this.setupEventListeners();
        this.updateLockVaultVisibility();
        this.startTimer();
        this.loadInitialData();
        this.initFromCloud();
        this.startLiveSync();
        this.initCaptureResults();
        this.initConnectivityStatus();
        this.updatePinStatus();
    }

    private initCaptureResults() {
        (window as any).api.onCaptureResult(async (data: string) => {
            await this.handleScannedData(data);
        });
    }

    private initConnectivityStatus() {
        this.updateConnectivityStatus();
        window.addEventListener('online', () => this.updateConnectivityStatus());
        window.addEventListener('offline', () => this.updateConnectivityStatus());

        // Interactive Expansion
        const statusEl = document.getElementById('connectivity-status');
        if (statusEl) {
            statusEl.addEventListener('click', () => {
                statusEl.classList.toggle('expanded');
                
                // Auto-collapse after 5 seconds if expanded
                if (statusEl.classList.contains('expanded')) {
                    setTimeout(() => {
                        statusEl.classList.remove('expanded');
                    }, 5000);
                }
            });
        }
    }

    private updateConnectivityStatus() {
        const isOnline = navigator.onLine;
        const statusEl = document.getElementById('connectivity-status');
        const textEl = document.getElementById('status-text');

        if (statusEl && textEl) {
            statusEl.classList.toggle('online', isOnline);
            statusEl.classList.toggle('offline', !isOnline);
            textEl.textContent = isOnline ? 'Online' : 'Offline';
        }
        
        if (!isOnline) {
            this.showToast("Working Offline", "info");
        }
    }

    private getStorageKey(key: string): string {
        return `${this.userId}_${key}`;
    }

    public setSyncing(isSyncing: boolean) {
        if (isSyncing) this.syncCount++;
        else this.syncCount = Math.max(0, this.syncCount - 1);

        const indicator = document.getElementById('cloud-sync-indicator');
        if (indicator) {
            indicator.classList.toggle('hidden', this.syncCount === 0);
        }
    }

    public setLoading(show: boolean, title: string = "Processing", subtitle: string = "VAULT SECURITY SYNCHRONIZATION") {
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
            const settings = { 
                ...(user.settings || {}),
                autolock: user.autolock
            };
            this.applySettings(settings, false);
        }
    }

    private getSettingsObject(): any {
        return {
            theme: this.currentTheme,
            accentColor: localStorage.getItem(this.getStorageKey('accent_color')) || 'royal-purple',
            wallpaperPreset: this.wallpaperPreset,
            privacyMode: this.privacyMode,
            screenGuardian: this.screenGuardian,
            autolock: localStorage.getItem(this.getStorageKey('autolock')) || '0',
            oledMode: this.oledMode,
            performanceMode: this.performanceMode,
            menuExitIntegration: this.menuExitIntegration,
            privacyBlur: this.privacyBlur,
            vaultPin: localStorage.getItem(this.getStorageKey('vault_pin'))
        };
    }

    public async pushSettings() {
        this.setSyncing(true);
        try {
            const settings = this.getSettingsObject();
            await (window as any).api.updateUserSettings(settings);
            localStorage.setItem(this.getStorageKey('last_sync'), new Date().toISOString());
        } finally {
            this.setSyncing(false);
            this.updateLastActivityDisplay();
        }
    }

    public applySettings(settings: any, saveLocal: boolean = true) {
        if (!settings) return;

        if (settings.theme) this.setTheme(settings.theme, true);
        if (settings.accentColor) this.setAccentColor(settings.accentColor, true);

        this.privacyMode = !!settings.privacyMode;
        const privacyToggle = document.getElementById('privacy-mode-toggle') as HTMLInputElement;
        if (privacyToggle) privacyToggle.checked = this.privacyMode;

        this.screenGuardian = !!settings.screenGuardian;
        const guardianToggle = document.getElementById('screen-guardian-toggle') as HTMLInputElement;
        if (guardianToggle) guardianToggle.checked = this.screenGuardian;
        (window as any).api.setContentProtection(this.screenGuardian);

        if (settings.autolock !== undefined) {
            this.updateSegmentedUI('autolock-segmented', String(settings.autolock));
        }

        if (settings.oledMode !== undefined) {
            this.oledMode = !!settings.oledMode;
            const oledToggle = document.getElementById('oled-mode-toggle') as HTMLInputElement;
            if (oledToggle) oledToggle.checked = this.oledMode;
            document.body.classList.toggle('oled-optimized', this.oledMode);
        }

        if (settings.performanceMode !== undefined) {
            this.performanceMode = !!settings.performanceMode;
            const perfToggle = document.getElementById('performance-mode-toggle') as HTMLInputElement;
            if (perfToggle) perfToggle.checked = this.performanceMode;
            document.body.classList.toggle('performance-mode', this.performanceMode);
        }

        if (settings.menuExitIntegration !== undefined) {
            this.menuExitIntegration = !!settings.menuExitIntegration;
            const menuExitToggle = document.getElementById('menu-exit-toggle') as HTMLInputElement;
            if (menuExitToggle) menuExitToggle.checked = this.menuExitIntegration;
            this.updateCloseButtonVisibility();
        }

        if (settings.privacyBlur !== undefined) {
            this.privacyBlur = !!settings.privacyBlur;
            const blurToggle = document.getElementById('privacy-blur-toggle') as HTMLInputElement;
            if (blurToggle) blurToggle.checked = this.privacyBlur;
        }

        if (saveLocal) {
            if (settings.theme) localStorage.setItem(this.getStorageKey('theme'), settings.theme);
            if (settings.accentColor) localStorage.setItem(this.getStorageKey('accent_color'), settings.accentColor);
            if (settings.wallpaperPreset) localStorage.setItem(this.getStorageKey('wallpaperPreset'), settings.wallpaperPreset);
            localStorage.setItem(this.getStorageKey('privacyMode'), String(this.privacyMode));
            localStorage.setItem(this.getStorageKey('screenGuardian'), String(this.screenGuardian));
            if (settings.autolock !== undefined) localStorage.setItem(this.getStorageKey('autolock'), String(settings.autolock));
            localStorage.setItem(this.getStorageKey('oled_mode'), String(this.oledMode));
            localStorage.setItem(this.getStorageKey('performance_mode'), String(this.performanceMode));
            localStorage.setItem(this.getStorageKey('menu_exit_integration'), String(this.menuExitIntegration));
            localStorage.setItem(this.getStorageKey('privacy_blur'), String(this.privacyBlur));
            if (settings.vaultPin !== undefined) localStorage.setItem(this.getStorageKey('vault_pin'), settings.vaultPin);
        }

        this.updateLockVaultVisibility();
        this.renderAccounts();
    }

    private initTheme() {
        const savedTheme = localStorage.getItem(this.getStorageKey('theme')) as 'light' | 'dark';
        if (savedTheme) {
            this.setTheme(savedTheme, true);
        } else {
            // Default to OS theme
            const osTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
            this.setTheme(osTheme, true);
        }
    }

    private initOSThemeDetection() {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        mediaQuery.addEventListener('change', (e) => {
            // Only auto-switch if user hasn't manually set a theme in this session or if it's the auth screen
            const hasManualTheme = !!localStorage.getItem(this.getStorageKey('theme'));
            const authVessel = document.getElementById('auth-vessel');
            const isAuthActive = authVessel && authVessel.classList.contains('show');

            if (!hasManualTheme || isAuthActive) {
                const newTheme = e.matches ? 'dark' : 'light';
                this.setTheme(newTheme, false);
            }
        });
    }

    public setTheme(theme: 'light' | 'dark', silent: boolean = false) {
        this.currentTheme = theme;
        const body = document.body;
        body.classList.remove('light-theme', 'dark-theme');
        body.classList.add(`${theme}-theme`);
        document.documentElement.setAttribute('data-theme', theme);

        localStorage.setItem(this.getStorageKey('theme'), theme);
        localStorage.setItem('keyra_theme', theme);

        this.updateSegmentedUI('theme-segmented', theme);

        const themeIcon = document.getElementById('theme-icon-lucide');
        const themeText = document.getElementById('theme-text');
        if (themeIcon) themeIcon.setAttribute('data-lucide', theme === 'dark' ? 'sun' : 'moon');
        if (themeText) themeText.textContent = theme === 'dark' ? 'Light Mode' : 'Dark Mode';

        this.refreshLucide();
        if (!silent) this.pushSettings();
    }

    public setAccentColor(accentColor: string, silent: boolean = false) {
        const root = document.documentElement;
        const accentHues: Record<string, number> = {
            'royal-purple': 258,
            'electric-blue': 200,
            'emerald-green': 145,
            'solar-orange': 15,
            // New Modern & Cute Accent Colors
            'rose-quartz': 330,
            'peach-blossom': 20,
            'lavender-dream': 270,
            'mint-fresh': 160,
            'sky-blue': 190,
            'coral-sunset': 10,
            'amethyst-glow': 280,
            'lemon-zest': 45,
            'ocean-teal': 175,
            'bubblegum': 320,
            'sage-serene': 150,
            'golden-hour': 35,
            'orchid-mystic': 300,
            'turquoise-dream': 180
        };

        const hue = accentHues[accentColor];
        if (hue) {
            // Update --h so dark/light body class backgrounds tint with the accent color
            root.style.setProperty('--h', hue.toString());
            root.style.setProperty('--dynamic-accent-hue', hue.toString());
            root.style.setProperty('--accent-primary', `hsl(${hue}, 100%, 68%)`);
            root.style.setProperty('--accent-secondary', `hsl(${hue + 20}, 100%, 75%)`);
            root.style.setProperty('--accent-hover', `hsl(${hue}, 100%, 62%)`);
            root.style.setProperty('--accent-soft', `hsla(${hue}, 100%, 68%, 0.12)`);

            root.style.setProperty('--aura-1', `hsla(${hue}, 100%, 68%, 0.38)`);
            root.style.setProperty('--aura-2', `hsla(${hue + 30}, 100%, 75%, 0.22)`);
            root.style.setProperty('--aura-3', `hsla(${hue - 30}, 100%, 75%, 0.18)`);

            // Always sync background hues to accent color now that wallpaper system is gone
            root.style.setProperty('--bg-hue-a', hue.toString());
            root.style.setProperty('--bg-hue-b', (hue + 30).toString());

            localStorage.setItem(this.getStorageKey('accent_color'), accentColor);

            // Update active state in UI
            document.querySelectorAll('.accent-color-option').forEach(option => {
                option.classList.toggle('active', option.getAttribute('data-accent') === accentColor);
            });

            if (!silent) this.pushSettings();
        }
    }

    private initPrivacyMode() {
        this.privacyMode = localStorage.getItem(this.getStorageKey('privacyMode')) === 'true';
        const toggle = document.getElementById('privacy-mode-toggle') as HTMLInputElement;
        if (toggle) toggle.checked = this.privacyMode;
    }

    private initScreenGuardian() {
        this.screenGuardian = localStorage.getItem(this.getStorageKey('screenGuardian')) === 'true';
        const toggle = document.getElementById('screen-guardian-toggle') as HTMLInputElement;
        if (toggle) toggle.checked = this.screenGuardian;
        (window as any).api.setContentProtection(this.screenGuardian);
    }

    private initPerformanceMode() {
        this.performanceMode = localStorage.getItem(this.getStorageKey('performance_mode')) === 'true';
        const toggle = document.getElementById('performance-mode-toggle') as HTMLInputElement;
        if (toggle) toggle.checked = this.performanceMode;
        document.body.classList.toggle('performance-mode', this.performanceMode);
        
        // If performance mode is active, we significantly reduce animation complexity at the root
        if (this.performanceMode) {
            document.documentElement.style.setProperty('--transition-fast', '0s');
            document.documentElement.style.setProperty('--transition-medium', '0s');
        }
    }

    private initOledMode() {
        this.oledMode = localStorage.getItem(this.getStorageKey('oled_mode')) === 'true';
        const toggle = document.getElementById('oled-mode-toggle') as HTMLInputElement;
        if (toggle) toggle.checked = this.oledMode;
        document.body.classList.toggle('oled-optimized', this.oledMode);
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
            this.refreshLucide(); // Re-render icon if it was hidden
        }
    }

    private initInteractivePrivacy() {
        this.privacyBlur = localStorage.getItem(this.getStorageKey('privacy_blur')) === 'true';
        const toggle = document.getElementById('privacy-blur-toggle') as HTMLInputElement;
        if (toggle) toggle.checked = this.privacyBlur;

        // Mouse Sensors for Privacy (Document level is often more stable for viewport exit)
        document.documentElement.addEventListener('mouseleave', (e) => {
            // Check if it's actually leaving the window (not just a child element)
            if (!e.relatedTarget) {
                if (this.privacyBlur) this.showPrivacyOverlay();
            }
        });

        document.documentElement.addEventListener('mouseenter', () => {
            if (this.privacyBlur) this.hidePrivacyOverlay();
        });

        // Unified Focus logic
        window.addEventListener('blur', () => {
            if (this.privacyBlur || this.screenGuardian) this.showPrivacyOverlay();
        });

        window.addEventListener('focus', () => {
            this.hidePrivacyOverlay();
        });
    }

    private showPrivacyOverlay() {
        // Don't show if we are on the auth screen
        const authVessel = document.getElementById('auth-vessel');
        const isAuthActive = authVessel && (authVessel.classList.contains('show'));
        
        if (!isAuthActive) {
            const overlay = document.getElementById('privacy-blur-overlay');
            if (overlay) {
                overlay.classList.add('show');
                this.refreshLucide();
            } else {
                console.error("[Privacy] Overlay element NOT FOUND");
            }
        } else {
        }
    }

    private hidePrivacyOverlay() {
        const overlay = document.getElementById('privacy-blur-overlay');
        overlay?.classList.remove('show');
    }

    private initSegmentedStates() {
        const theme = localStorage.getItem(this.getStorageKey('theme')) || 'light';
        this.updateSegmentedUI('theme-segmented', theme);

        const autolock = localStorage.getItem(this.getStorageKey('autolock')) || '0';
        this.updateSegmentedUI('autolock-segmented', autolock);
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
        // Tab Navigation
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const target = e.currentTarget as HTMLElement;
                const tabName = target.getAttribute('data-tab') as 'vault' | 'settings' | 'account';
                this.switchTab(tabName);
                this.updateLastActivity(`Switched to ${tabName}`);
            });
        });

        // Account navigation from dropdown
        document.getElementById('account-settings-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            document.getElementById('user-dropdown')?.classList.remove('show');
            this.switchTab('account');
            this.updateLastActivity('Opened Account Settings');
        });


        // User Dropdown Logic
        const dropdownBtn = document.getElementById('user-dropdown-btn');
        const dropdownMenu = document.getElementById('user-dropdown');
        dropdownBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdownMenu?.classList.toggle('show');
        });
        document.addEventListener('click', () => dropdownMenu?.classList.remove('show'));

        // Dropdown Actions
        document.getElementById('lock-vault-btn')?.addEventListener('click', () => {
            this.lockVault();
            this.updateLastActivity('Vault locked');
        });

        // Close App Logic
        document.getElementById('btn-close-app')?.addEventListener('click', () => {
            (window as any).api.close();
        });

        document.getElementById('theme-toggle-btn')?.addEventListener('click', () => {
            const nextTheme = this.currentTheme === 'light' ? 'dark' : 'light';
            this.setTheme(nextTheme);
        });

        document.getElementById('menu-close-app-btn')?.addEventListener('click', () => {
            (window as any).api.close();
        });
        document.getElementById('btn-logout-trigger')?.addEventListener('click', () => {
            document.getElementById('modal-logout')?.classList.add('show');
            this.refreshLucide();
        });

        // Logout Confirmation
        document.getElementById('btn-confirm-logout')?.addEventListener('click', async () => {
            await (window as any).api.logout();
            window.location.reload();
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

        // Segmented Theme Toggle
        document.querySelectorAll('#theme-segmented .segment').forEach(seg => {
            seg.addEventListener('click', (e) => {
                const target = e.currentTarget as HTMLElement;
                const val = target.getAttribute('data-val') as 'light' | 'dark';
                this.setTheme(val);
                this.updateLastActivity(`Changed theme to ${val}`);
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
                this.showToast(`Vault Auto-lock: ${val === '0' ? 'Off' : val + 'm'}`, "info");
                this.updateLastActivity(`Changed autolock to ${val}m`);
            });
        });

        // OLED Mode Toggle
        document.getElementById('oled-mode-toggle')?.addEventListener('change', (e) => {
            const target = e.target as HTMLInputElement;
            this.oledMode = target.checked;
            localStorage.setItem(this.getStorageKey('oled_mode'), String(this.oledMode));
            document.body.classList.toggle('oled-optimized', this.oledMode);
            this.pushSettings();
            this.showToast(this.oledMode ? "OLED Mode Enabled" : "OLED Mode Disabled", "info");
            this.updateLastActivity(`OLED Mode ${this.oledMode ? 'Enabled' : 'Disabled'}`);
        });

        // Performance Mode Toggle
        document.getElementById('performance-mode-toggle')?.addEventListener('change', (e) => {
            const target = e.target as HTMLInputElement;
            this.performanceMode = target.checked;
            localStorage.setItem(this.getStorageKey('performance_mode'), String(this.performanceMode));
            document.body.classList.toggle('performance-mode', this.performanceMode);
            
            // Immediate CSS variable update for root-level speed
            const root = document.documentElement;
            if (this.performanceMode) {
                root.style.setProperty('--transition-fast', '0s');
                root.style.setProperty('--transition-medium', '0s');
            } else {
                root.style.removeProperty('--transition-fast');
                root.style.removeProperty('--transition-medium');
            }

            this.pushSettings();
            this.showToast(this.performanceMode ? "Ultra Performance Active" : "Visual Effects Restored", "info");
            this.updateLastActivity(`Performance Mode ${this.performanceMode ? 'Enabled' : 'Disabled'}`);
        });

        // Menu Exit Toggle
        document.getElementById('menu-exit-toggle')?.addEventListener('change', (e) => {
            const target = e.target as HTMLInputElement;
            this.menuExitIntegration = target.checked;
            localStorage.setItem(this.getStorageKey('menu_exit_integration'), String(this.menuExitIntegration));
            this.updateCloseButtonVisibility();
            this.pushSettings();
            this.showToast(this.menuExitIntegration ? "Close Button moved to Menu" : "Close Button moved to Navbar", "info");
            this.updateLastActivity(`Menu Exit ${this.menuExitIntegration ? 'Enabled' : 'Disabled'}`);
        });

        // Settings PIN
        document.getElementById('setup-pin-btn')?.addEventListener('click', () => this.showPinSetup());

        // Privacy Mode Toggle
        document.getElementById('privacy-mode-toggle')?.addEventListener('change', (e) => {
            const target = e.target as HTMLInputElement;
            this.privacyMode = target.checked;
            localStorage.setItem(this.getStorageKey('privacyMode'), String(this.privacyMode));
            this.pushSettings();
            this.renderAccounts();
            this.showToast(this.privacyMode ? "Privacy Mode Enabled" : "Privacy Mode Disabled", "info");
            this.updateLastActivity(`Privacy Mode ${this.privacyMode ? 'Enabled' : 'Disabled'}`);
        });

        // Screen Guardian Toggle
        document.getElementById('screen-guardian-toggle')?.addEventListener('change', (e) => {
            const target = e.target as HTMLInputElement;
            this.screenGuardian = target.checked;
            localStorage.setItem(this.getStorageKey('screenGuardian'), String(this.screenGuardian));
            (window as any).api.setContentProtection(this.screenGuardian);
            this.pushSettings();
            this.showToast(this.screenGuardian ? "Screen Guardian Active" : "Screen Guardian Disabled", "info");
            this.updateLastActivity(`Screen Guardian ${this.screenGuardian ? 'Enabled' : 'Disabled'}`);
        });

        // Interactive Privacy Toggle
        document.getElementById('privacy-blur-toggle')?.addEventListener('change', (e) => {
            const target = e.target as HTMLInputElement;
            this.privacyBlur = target.checked;
            localStorage.setItem(this.getStorageKey('privacy_blur'), String(this.privacyBlur));
            this.pushSettings();
            this.showToast(this.privacyBlur ? "Interactive Privacy Enabled" : "Interactive Privacy Disabled", "info");
            this.updateLastActivity(`Interactive Privacy ${this.privacyBlur ? 'Enabled' : 'Disabled'}`);
        });

        // Accent Color
        this.setupAccentColorSelector();
        document.getElementById('btn-sync-now')?.addEventListener('click', () => this.manualSync());

        // Vault Maintenance
        document.getElementById('btn-export-vault')?.addEventListener('click', async () => {
            const res = await (window as any).api.exportVault();
            if (res.success) {
                this.showToast("Vault backup exported", "success");
                this.updateLastActivity('Exported vault');
            }
        });
        document.getElementById('btn-import-vault')?.addEventListener('click', async () => {
            const res = await (window as any).api.importVault();
            if (res.success && res.data) {
                this.showImportPasswordModal(res.data);
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

        window.addEventListener('resize', this.debounce(() => this.refreshLucide(), 250));

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

        this.setupAccountEvents();
    }

    private setupAccountEvents() {
        // Change Username
        document.getElementById('form-change-username')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const newName = (document.getElementById('new-username') as HTMLInputElement).value.trim();
            if (newName.length < 4) return;

            this.setLoading(true, "Updating Identity", "SECURE VAULT RENAMING");
            try {
                const res = await (window as any).api.changeUsername(newName);
                if (res.success) {
                    this.showToast("Display name updated", "success");
                    await this.loadAccountInfo();
                    // Update main name display
                    const userNameDisp = document.getElementById('user-name-display');
                    if (userNameDisp) userNameDisp.textContent = newName;
                    const dropUserName = document.getElementById('dropdown-user-name');
                    if (dropUserName) dropUserName.textContent = newName;
                } else {
                    this.showToast(res.message, "error");
                }
            } finally {
                this.setLoading(false);
            }
        });

        // Request Email Change
        document.getElementById('form-request-email-change')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const newEmail = (document.getElementById('new-email') as HTMLInputElement).value.trim();
            if (!newEmail) return;

            this.setLoading(true, "Requesting Change", "INITIATING EMAIL ROTATION");
            try {
                const res = await (window as any).api.requestEmailChange(newEmail);
                if (res.success) {
                    this.showToast("Verification code sent", "success");
                    
                    const modal = document.getElementById('modal-email-verify');
                    if (modal) {
                        modal.classList.remove('hidden');
                        modal.classList.add('show');
                    }
                    this.startEmailResendTimer();
                    this.refreshLucide();
                    await this.loadAccountInfo();
                } else {
                    this.showToast(res.message, "error");
                }
            } finally {
                this.setLoading(false);
            }
        });

        // Verify Email Modal (Manual Trigger from Pending Box)
        document.getElementById('btn-show-email-verify')?.addEventListener('click', async () => {
            // Requirement: Send a new activation code and show the activation modal
            this.setLoading(true, "Requesting Code", "ROTATING VERIFICATION KEY");
            try {
                const res = await (window as any).api.resendEmailChangeCode();
                if (res.success) {
                    const modal = document.getElementById('modal-email-verify');
                    if (modal) {
                        modal.classList.remove('hidden');
                        modal.classList.add('show');
                    }
                    this.startEmailResendTimer();
                    this.refreshLucide();
                    this.showToast("New code sent", "success");
                } else {
                    this.showToast(res.message, "error");
                }
            } finally {
                this.setLoading(false);
            }
        });

        // Verify Email Modal UI Helpers
        document.getElementById('btn-cancel-email-modal')?.addEventListener('click', () => {
            const modal = document.getElementById('modal-email-verify');
            if (modal) {
                modal.classList.remove('show');
                setTimeout(() => modal.classList.add('hidden'), 300);
            }
        });

        // Email Verification Digits
        const digits = document.querySelectorAll('.email-verify-digit') as NodeListOf<HTMLInputElement>;
        digits.forEach((input, idx) => {
            input.addEventListener('input', () => {
                if (input.value && digits[idx + 1]) digits[idx + 1].focus();
                if (Array.from(digits).every(i => i.value)) this.handleEmailVerification();
            });
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Backspace' && !input.value && digits[idx - 1]) digits[idx - 1].focus();
            });
        });

        document.getElementById('btn-confirm-email-change')?.addEventListener('click', () => this.handleEmailVerification());

        document.getElementById('btn-resend-email-code')?.addEventListener('click', async () => {
            if (this.emailResendTimer > 0) return;
            
            try {
                const res = await (window as any).api.resendEmailChangeCode();
                if (res.success) {
                    this.showToast("New code sent", "success");
                    this.startEmailResendTimer();
                }
            } catch (e) {
                this.showToast("Failed to resend code", "error");
            }
        });

        document.getElementById('btn-cancel-email-change')?.addEventListener('click', async () => {
            this.setLoading(true, "Cancelling", "REVERTING IDENTITY CHANGES");
            try {
                await (window as any).api.cancelEmailChange();
                await this.loadAccountInfo();
                this.showToast("Email change cancelled", "info");
            } finally {
                this.setLoading(false);
            }
        });

        // Change Password
        document.getElementById('form-change-password')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const newPass = (document.getElementById('new-master-password') as HTMLInputElement).value;
            const confPass = (document.getElementById('confirm-master-password') as HTMLInputElement).value;

            if (newPass !== confPass) {
                this.showToast("Passwords do not match", "error");
                return;
            }

            if (newPass.length < 8) {
                this.showToast("Password too short", "error");
                return;
            }

            this.setLoading(true, "Re-encrypting Vault", "MASTER KEY ROTATION IN PROGRESS");
            try {
                const res = await (window as any).api.changePassword(newPass);
                if (res.success) {
                    this.showToast("Master key updated", "success");
                    (document.getElementById('new-master-password') as HTMLInputElement).value = '';
                    (document.getElementById('confirm-master-password') as HTMLInputElement).value = '';
                } else {
                    this.showToast(res.message, "error");
                }
            } finally {
                this.setLoading(false);
            }
        });
    }

    private async handleEmailVerification() {
        const digits = document.querySelectorAll('.email-verify-digit') as NodeListOf<HTMLInputElement>;
        const code = Array.from(digits).map(i => i.value).join('');
        const err = document.getElementById('email-verify-error');

        if (code.length < 6) return;

        this.setLoading(true, "Verifying", "FINALIZING EMAIL IDENTITY");
        try {
            const res = await (window as any).api.confirmEmailChange(code);
            if (res.success) {
                const modal = document.getElementById('modal-email-verify');
                if (modal) {
                    modal.classList.remove('show');
                    setTimeout(() => modal.classList.add('hidden'), 300);
                }
                await this.loadAccountInfo();
                this.showToast("Email updated successfully", "success");
                digits.forEach(i => i.value = '');
            } else {
                if (err) {
                    err.textContent = res.message;
                    err.classList.remove('opacity-0');
                    setTimeout(() => err.classList.add('opacity-0'), 3000);
                }
                digits.forEach(i => i.value = '');
                digits[0].focus();
            }
        } finally {
            this.setLoading(false);
        }
    }

    private startEmailResendTimer() {
        if (this.emailResendInterval) clearInterval(this.emailResendInterval);
        this.emailResendTimer = 30;
        this.updateResendBtnUI();

        this.emailResendInterval = setInterval(() => {
            this.emailResendTimer--;
            this.updateResendBtnUI();
            if (this.emailResendTimer <= 0) {
                clearInterval(this.emailResendInterval);
            }
        }, 1000);
    }

    private updateResendBtnUI() {
        const btn = document.getElementById('btn-resend-email-code') as HTMLButtonElement;
        const timerText = document.getElementById('email-resend-timer');
        if (!btn || !timerText) return;

        if (this.emailResendTimer > 0) {
            btn.disabled = true;
            timerText.textContent = `(${this.emailResendTimer}s)`;
        } else {
            btn.disabled = false;
            timerText.textContent = '';
        }
    }

    private async loadAccountInfo() {
        const user = await (window as any).api.getCurrentUser();
        if (!user) return;

        const dispName = document.getElementById('acc-display-username');
        const dispEmail = document.getElementById('acc-primary-email');
        const initialsEl = document.getElementById('acc-initials');
        const avatarEl = document.getElementById('acc-avatar');

        if (dispName) dispName.textContent = user.username;
        if (dispEmail) dispEmail.textContent = user.email;

        // Initials Logic
        if (initialsEl) {
            const names = user.username.split(' ');
            initialsEl.textContent = names.length > 1 
                ? (names[0][0] + names[1][0]).toUpperCase()
                : user.username.slice(0, 2).toUpperCase();
        }

        // Pending UI
        const badge = document.getElementById('pending-email-badge');
        const actionBox = document.getElementById('pending-email-action-box');
        const pendingText = document.getElementById('pending-email-text');

        if (user.pendingEmail) {
            badge?.classList.remove('hidden');
            if (badge) {
                badge.textContent = 'NOT VERIFIED';
                badge.style.background = 'rgba(255, 59, 48, 0.1)';
                badge.style.color = '#ff3b30';
                badge.style.border = '1px solid rgba(255, 59, 48, 0.2)';
                badge.style.fontSize = '10px';
                badge.style.fontWeight = '850';
                badge.style.padding = '4px 10px';
                badge.style.borderRadius = '20px';
            }
            actionBox?.classList.remove('hidden');
            if (pendingText) pendingText.textContent = `Verify: ${user.pendingEmail}`;
        } else {
            badge?.classList.add('hidden');
            actionBox?.classList.add('hidden');
        }

        this.refreshLucide();
    }


    private showAboutModal() {
        const modal = document.getElementById('about-modal');
        if (modal) {
            modal.classList.remove('hidden');
            modal.classList.add('show');
            this.updateLastActivityDisplay();
            this.refreshLucide();
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
        document.querySelectorAll('.accent-color-option').forEach(option => {
            option.addEventListener('click', () => {
                const accent = option.getAttribute('data-accent');
                if (accent) {
                    this.setAccentColor(accent);
                    this.showToast("Accent color updated", "success");
                    this.updateLastActivity(`Changed accent to ${accent}`);
                }
            });
        });
    }

    private async manualSync() {
        if (!navigator.onLine) {
            this.showToast("Cannot sync while offline", "error");
            return;
        }
        this.setSyncing(true);
        const btn = document.getElementById('btn-sync-now');
        const icon = btn?.querySelector('i');
        const statusDesc = document.getElementById('sync-status-desc');

        if (icon) icon.classList.add('sync-spin');
        if (statusDesc) statusDesc.textContent = 'Synchronizing...';

        try {
            await this.pushSettings();
            await this.refreshAccounts();
            this.showToast("Cloud Vault Synchronized", "success");
            localStorage.setItem(this.getStorageKey('last_sync'), new Date().toISOString());
            this.updateLastActivity('Manual Cloud Sync');
            if (statusDesc) statusDesc.textContent = 'Synchronized';
        } catch (err) {
            this.showToast("Sync Failed", "error");
            if (statusDesc) statusDesc.textContent = 'Sync Failed';
        } finally {
            if (icon) icon.classList.remove('sync-spin');
            this.setSyncing(false);
            this.updateLastActivityDisplay();
        }
    }

    private updateLastActivity(action: string) {
        const now = new Date().toISOString();
        localStorage.setItem(this.getStorageKey('last_activity'), now);
        localStorage.setItem(this.getStorageKey('last_action'), action);
        this.updateLastActivityDisplay();
    }

    private updateLastActivityDisplay() {
        const lastActivityElement = document.getElementById('last-activity-display');
        const lastActionElement = document.getElementById('last-action-display');
        
        const lastActivity = localStorage.getItem(this.getStorageKey('last_activity'));
        const lastAction = localStorage.getItem(this.getStorageKey('last_action')) || 'No activity';

        if (lastActivity && lastActivityElement) {
            const date = new Date(lastActivity);
            const diffMins = Math.floor((new Date().getTime() - date.getTime()) / 60000);

            let timeAgo = 'Just now';
            if (diffMins >= 1 && diffMins < 60) timeAgo = `${diffMins}m ago`;
            else if (diffMins >= 60 && diffMins < 1440) timeAgo = `${Math.floor(diffMins / 60)}h ago`;
            else if (diffMins >= 1440) timeAgo = `${Math.floor(diffMins / 1440)}d ago`;

            lastActivityElement.textContent = timeAgo;
        }

        if (lastActionElement) {
            lastActionElement.textContent = lastAction;
        }

        // Sync About Modal (if open or for next time)
        const aboutActivity = document.getElementById('about-last-activity');
        const aboutAction = document.getElementById('about-last-action');
        const aboutSync = document.getElementById('about-last-sync');

        if (aboutActivity) {
            const lastActivityVal = lastActivity ? this.formatSyncTime(new Date(lastActivity)) : 'Never';
            aboutActivity.textContent = lastActivityVal;
        }
        if (aboutAction) aboutAction.textContent = lastAction;

        if (aboutSync) {
            const lastSync = localStorage.getItem(this.getStorageKey('last_sync'));
            aboutSync.textContent = lastSync ? this.formatSyncTime(new Date(lastSync)) : 'Never Secured';
        }
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

    public switchTab(tab: 'vault' | 'settings' | 'account') {
        this.currentTab = tab;

        // Update Nav Tabs UI
        document.querySelectorAll('.nav-tab').forEach(t => {
            t.classList.toggle('active', t.getAttribute('data-tab') === tab);
        });

        // Toggle View Sections
        ['vault-view', 'settings-view', 'account-view'].forEach(viewId => {
            const el = document.getElementById(viewId);
            if (el) {
                const shouldShow = viewId === `${tab}-view`;
                el.classList.toggle('hidden', !shouldShow);
            }
        });

        if (tab === 'account') {
            this.loadAccountInfo();
        } else if (tab === 'settings') {
            this.updateLastActivityDisplay();
        }

        this.refreshLucide();
    }


    public async refreshAccounts() {
        this.accounts = await (window as any).api.getAccounts();
        this.renderAccounts();
    }

    private renderAccounts() {
        const grid = document.getElementById('accounts-grid');
        const emptyState = document.getElementById('empty-state');
        const searchEmptyState = document.getElementById('search-empty-state');
        if (!grid || !emptyState || !searchEmptyState) return;

        const filtered = this.accounts.filter(acc =>
            acc.issuer.toLowerCase().includes(this.searchQuery) ||
            acc.account.toLowerCase().includes(this.searchQuery)
        );

        // State 1: Completely Empty Vault
        if (this.accounts.length === 0) {
            grid.classList.add('hidden');
            emptyState.classList.remove('hidden');
            searchEmptyState.classList.add('hidden');
        } 
        // State 2: No Results Found for Search
        else if (filtered.length === 0) {
            grid.classList.add('hidden');
            emptyState.classList.add('hidden');
            searchEmptyState.classList.remove('hidden');
        }
        // State 3: Active Results
        else {
            grid.classList.remove('hidden');
            emptyState.classList.add('hidden');
            searchEmptyState.classList.add('hidden');
            grid.innerHTML = '';
            filtered.forEach((acc, index) => grid.appendChild(this.createAccountCard(acc, index)));
        }
        this.refreshLucide();
    }

    private createAccountCard(account: any, index: number): HTMLElement {
        const card = document.createElement('div');
        card.className = 'account-card animate-fade-in';
        card.style.animationDelay = `${index * 0.05}s`;

        card.innerHTML = `
            <div class="account-header">
                <div class="account-icon">
                    <i data-lucide="${this.getIcon(account.issuer)}"></i>
                </div>
                <div class="account-info">
                    <div class="service-name">${account.issuer}</div>
                    <div class="account-identity">${account.account}</div>
                </div>
                <div class="card-actions">
                    <button class="btn-icon edit-btn" title="Refine Metadata">
                        <i data-lucide="settings-2"></i>
                    </button>
                    <button class="btn-icon danger delete-btn" title="Remove Token">
                        <i data-lucide="trash-2"></i>
                    </button>
                </div>
            </div>
            
            <div class="otp-hero">
                <div class="otp-code ${this.privacyMode ? 'privacy-hidden' : ''}">
                    ${this.privacyMode ? '••••••' : '------'}
                </div>
                <div class="timer-linear-vessel">
                    <div class="timer-linear-progress"></div>
                </div>
            </div>

            <div class="card-footer" style="padding: 0;">
                <button class="btn-primary copy-btn" style="width: 100%;">
                    <i data-lucide="copy"></i>
                    <span>Secure Copy</span>
                </button>
            </div>
        `;

        const copyBtn = card.querySelector('.copy-btn') as HTMLElement;
        copyBtn.onclick = async () => {
            const otpCode = await (window as any).api.generateTOTP(account.secret);
            await navigator.clipboard.writeText(otpCode);
            this.showToast("OTP Copied", "success");
            this.updateLastActivity('OTP copied');
        };

        const codeEl = card.querySelector('.otp-code') as HTMLElement;
        codeEl.onclick = async () => {
            const otpCode = await (window as any).api.generateTOTP(account.secret);
            await navigator.clipboard.writeText(otpCode);
            this.showToast("OTP Copied", "success");
            this.showCopyFeedback(codeEl);
            this.updateLastActivity('OTP copied');
        };

        card.querySelector('.edit-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.showEditModal(account);
        });

        card.querySelector('.delete-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.showDeleteConfirm(account);
        });

        this.updateCardOTP(card, account.secret);
        return card;
    }

    private async handleScannedData(data: string) {
        try {
            if (!data.startsWith('otpauth://totp/')) {
                this.showToast("Invalid QR Format", "error");
                return;
            }

            const parsed = await (window as any).api.parseURI(data);
            await (window as any).api.generateTOTP(parsed.secret);

            this.accounts = await (window as any).api.saveAccount({
                id: Date.now().toString(),
                issuer: parsed.issuer,
                account: parsed.account,
                secret: parsed.secret
            });
            this.renderAccounts();
            this.showToast(`Added ${parsed.issuer} account!`, "success");
            this.updateLastActivity('Added token via Scan');
        } catch (err) {
            console.error("Invalid QR Format", err);
            this.showToast("Invalid QR Format", "error");
        }
    }

    private async updateCardOTP(card: HTMLElement, secret: string) {
        const codeElement = card.querySelector('.otp-code');
        if (!codeElement) return;

        // Skip heavy generateTOTP calls frequently in performance mode if possible
        // But for TOTP, correctness is more important than 1 FPS gain.
        // Instead, we optimize the CSS/DOM side of it.
        const otp = await (window as any).api.generateTOTP(secret);
        const formattedOtp = otp.substring(0, 3) + ' ' + otp.substring(3);
        
        if (!this.privacyMode) {
            if (codeElement.textContent !== formattedOtp) {
                codeElement.textContent = formattedOtp;
            }
        }

        const remaining = await (window as any).api.getRemainingSeconds();
        const progressBar = card.querySelector('.timer-linear-progress') as HTMLElement;
        if (progressBar) {
            const percentage = (remaining / 30) * 100;
            progressBar.style.width = `${percentage}%`;
            progressBar.style.backgroundColor = remaining <= 5 ? '#ff3b30' : 'var(--accent-primary)';
        }
    }

    private startTimer() {
        if (this.timerInterval) clearInterval(this.timerInterval);
        this.timerInterval = setInterval(() => {
            const cards = document.querySelectorAll('.account-card');
            cards.forEach((card, i) => {
                if (this.accounts[i]) this.updateCardOTP(card as HTMLElement, this.accounts[i].secret);
            });
        }, 1000);
    }

    private getIcon(issuer: string): string {
        const icons: any = {
            'google': 'search', 'github': 'github', 'microsoft': 'cloud', 'apple': 'apple',
            'amazon': 'shopping-cart', 'facebook': 'facebook', 'twitter': 'twitter', 'discord': 'message-square',
            'binance': 'coins', 'coinbase': 'wallet', 'stripe': 'credit-card', 'paypal': 'dollar-sign'
        };
        return icons[issuer.toLowerCase()] || 'shield';
    }

    private showModal(content: string) {
        const overlay = document.getElementById('modal-overlay');
        if (!overlay) return;
        overlay.innerHTML = `<div class="modal animate-fade-in">${content}</div>`;
        overlay.classList.add('show');
        this.refreshLucide();
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
        const iconMap = { success: 'check-circle', error: 'alert-circle', info: 'bell' };
        const toast = document.createElement('div');
        toast.className = 'toast animate-fade-in ' + type;
        toast.innerHTML = `<i class="toast-icon" data-lucide="${iconMap[type]}"></i><span>${message}</span>`;
        container.appendChild(toast);
        this.refreshLucide();
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(-50%) translateY(8px) scale(0.95)';
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

    public lockVault() {
        const vessel = document.getElementById('lock-vessel');
        if (vessel) {
            vessel.classList.add('show');
            document.body.classList.add('vault-is-locked');
            this.refreshLucide();
            const pinIn = document.getElementById('unlock-pin') as HTMLInputElement;
            if (pinIn) { pinIn.value = ''; pinIn.focus(); }
        }
    }

    private handleUnlock() {
        const pinIn = document.getElementById('unlock-pin') as HTMLInputElement;
        if (pinIn) this.validateAndAutoUnlock(pinIn.value);
    }

    private validateAndAutoUnlock(pinValue: string) {
        const saved = localStorage.getItem(this.getStorageKey('vault_pin'));
        const dots = document.querySelectorAll('.pin-dot');

        dots.forEach((dot, i) => dot.classList.toggle('filled', i < pinValue.length));

        if (pinValue.length === 4) {
            if (pinValue === saved) {
                dots.forEach(dot => dot.classList.add('success'));
                setTimeout(() => {
                    document.getElementById('lock-vessel')?.classList.remove('show');
                    document.body.classList.remove('vault-is-locked');
                    (document.getElementById('unlock-pin') as HTMLInputElement).value = '';
                    dots.forEach(dot => dot.classList.remove('filled', 'success'));
                }, 500);
                this.showToast("Vault Unlocked", "success");
                this.updateLastActivity('Vault unlocked');
            } else {
                dots.forEach(dot => dot.classList.add('error'));
                setTimeout(() => {
                    (document.getElementById('unlock-pin') as HTMLInputElement).value = '';
                    dots.forEach(dot => dot.classList.remove('filled', 'error'));
                }, 800);
                this.showToast("Verification Failed", "error");
            }
        }
    }

    private clearPinInput() {
        const pinIn = document.getElementById('unlock-pin') as HTMLInputElement;
        if (pinIn) { pinIn.value = ''; pinIn.focus(); }
        document.querySelectorAll('.pin-dot').forEach(dot => dot.classList.remove('filled', 'error', 'success'));
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

        if (setupBtn) {
            setupBtn.textContent = hasPin ? 'Change PIN' : 'Setup PIN';
        }

        if (removeBtn) {
            removeBtn.classList.toggle('hidden', !hasPin);
            this.refreshLucide();
        }
    }

    private showRemovePinConfirm() {
        const content = `
            <div class="modal-content">
                <div class="modal-header">
                    <div class="modal-icon-vessel danger">
                        <i data-lucide="shield-off"></i>
                    </div>
                    <div class="modal-title-vessel">
                        <h2 class="danger">Deactivate Security?</h2>
                        <p>VAULT WILL BE UNPROTECTED</p>
                    </div>
                </div>
                <div class="modal-divider"></div>
                <div class="modal-body">
                    <div class="modal-entity-badge">
                        <div class="entity-icon">
                            <i data-lucide="lock"></i>
                        </div>
                        <div class="entity-info">
                            <span class="entity-name">Master PIN Policy</span>
                            <span class="entity-label">Active Protection</span>
                        </div>
                    </div>
                    <p class="modal-help-text">Removing the PIN means anyone with access to this device can view your identities. This action is immediate.</p>
                </div>
                <div class="modal-footer">
                    <button class="btn-danger" id="confirm-remove-pin">
                        <i data-lucide="trash-2"></i>
                        Remove Security
                    </button>
                    <button class="user-button" id="cancel-remove-pin" style="justify-content: center;">Keep PIN Active</button>
                </div>
            </div>
        `;
        this.showModal(content);
        document.getElementById('confirm-remove-pin')?.addEventListener('click', () => {
            localStorage.removeItem(this.getStorageKey('vault_pin'));
            this.pushSettings();
            this.updateLockVaultVisibility();
            this.updatePinStatus();
            this.showToast("Security Policy Removed", "info");
            this.hideModal();
        });
        document.getElementById('cancel-remove-pin')?.addEventListener('click', () => this.hideModal());
    }

    private refreshLucide() {
        if ((window as any).lucide) (window as any).lucide.createIcons();
    }

    private debounce(func: Function, wait: number) {
        let timeout: any;
        return (...args: any[]) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }

    private showPinSetup() {
        let firstEntry = '';
        let phase: 'entry' | 'confirm' = 'entry';

        const renderModal = () => {
            const isEntry = phase === 'entry';
            const content = `
                <div class="modal-content">
                    <div class="modal-header">
                        <div class="modal-icon-vessel">
                            <i data-lucide="${isEntry ? 'shield-check' : 'check-circle'}"></i>
                        </div>
                        <div class="modal-title-vessel">
                            <h2>${isEntry ? 'Set Master PIN' : 'Verify PIN'}</h2>
                            <p>${isEntry ? 'ESTABLISH 4-DIGIT VAULT KEY' : 'RE-ENTER KEY TO CONFIRM'}</p>
                        </div>
                    </div>
                    <div class="modal-divider"></div>
                    <div class="modal-body">
                        <div class="form-group">
                            <label class="form-label">${isEntry ? 'Choose New PIN' : 'Confirm New PIN'}</label>
                            <div class="pin-input-vessel" style="margin: 20px 0;">
                                <input type="password" id="setup-pin-field" maxlength="4" class="pin-field" 
                                       style="opacity: 0; position: absolute;" autocomplete="off" autofocus>
                                <div class="pin-indicators" style="justify-content: center;">
                                    <div class="pin-dot" data-digit="1"></div>
                                    <div class="pin-dot" data-digit="2"></div>
                                    <div class="pin-dot" data-digit="3"></div>
                                    <div class="pin-dot" data-digit="4"></div>
                                </div>
                            </div>
                            <p class="modal-help-text" style="text-align: center;">
                                ${isEntry ? 'Keep this code safe. It is required to unlock your identities.' : 'Passwords must match exactly to synchronize security.'}
                            </p>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn-primary" id="btn-next-step" disabled>
                            <i data-lucide="${isEntry ? 'arrow-right' : 'shield-check'}"></i>
                            ${isEntry ? 'Next Phase' : 'Activate Vault'}
                        </button>
                        <button class="user-button" id="cancel-pin-btn" style="justify-content: center;">Cancel</button>
                    </div>
                </div>
            `;
            this.showModal(content);
            this.refreshLucide();

            const input = document.getElementById('setup-pin-field') as HTMLInputElement;
            const dots = document.querySelectorAll('.pin-dot');
            const nextBtn = document.getElementById('btn-next-step') as HTMLButtonElement;

            input?.focus();
            
            input?.addEventListener('input', (e) => {
                const val = (e.target as HTMLInputElement).value.replace(/[^0-9]/g, '');
                input.value = val;
                dots.forEach((dot, i) => dot.classList.toggle('filled', i < val.length));
                if (nextBtn) nextBtn.disabled = val.length !== 4;
            });

            nextBtn?.addEventListener('click', () => {
                if (phase === 'entry') {
                    firstEntry = input.value;
                    phase = 'confirm';
                    renderModal();
                } else {
                    if (input.value === firstEntry) {
                        localStorage.setItem(this.getStorageKey('vault_pin'), input.value);
                        this.pushSettings();
                        this.updateLockVaultVisibility();
                        this.updatePinStatus();
                        this.showToast("PIN Activated", "success");
                        this.hideModal();
                    } else {
                        this.showToast("PIN Matching Failed", "error");
                        phase = 'entry';
                        firstEntry = '';
                        renderModal();
                    }
                }
            });

            document.getElementById('cancel-pin-btn')?.addEventListener('click', () => this.hideModal());
        };

        renderModal();
    }

    private showAddModal() {
        const content = `
            <div class="modal-content">
                <div class="modal-header">
                    <div class="modal-icon-vessel">
                        <i data-lucide="plus-circle"></i>
                    </div>
                    <div class="modal-title-vessel">
                        <h2>Add Token</h2>
                        <p>SAVE DIGITAL IDENTITY</p>
                    </div>
                </div>
                <div class="modal-divider"></div>
                <div class="modal-body">
                    <div class="form-group">
                        <label class="form-label">Service</label>
                        <input type="text" id="new-issuer" class="form-input" placeholder="e.g. GitHub, Google">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Account</label>
                        <input type="text" id="new-account" class="form-input" placeholder="name@domain.com" inputmode="email">
                    </div>
                    <div class="form-group">
                        <label class="form-label">TOTP Secret</label>
                        <input type="text" id="new-secret" class="form-input" placeholder="Enter secret key" autocomplete="off">
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn-primary" id="save-new-account">
                        <i data-lucide="shield-plus"></i>
                        Save Token
                    </button>
                    <button class="user-button" id="btn-scan-screen-trigger" style="justify-content: center; white-space: nowrap;">
                        <i data-lucide="monitor"></i>
                        Scan
                    </button>
                    <button class="user-button" id="cancel-add-btn" style="justify-content: center;">Cancel</button>
                </div>
            </div>
        `;
        this.showModal(content);
        
        document.getElementById('btn-scan-screen-trigger')?.addEventListener('click', () => {
            this.hideModal();
            (window as any).api.openCaptureWindow();
        });

        // Listen for capture results (globally once or every time? Better in constructor or persistent)
        // I'll add handleScannedData to UIManager for reuse

        document.getElementById('save-new-account')?.addEventListener('click', async () => {
            const issuer = (document.getElementById('new-issuer') as HTMLInputElement).value;
            const account = (document.getElementById('new-account') as HTMLInputElement).value;
            const secret = (document.getElementById('new-secret') as HTMLInputElement).value;
            if (issuer && secret) {
                this.accounts = await (window as any).api.saveAccount({ id: Date.now().toString(), issuer, account, secret });
                this.renderAccounts();
                this.hideModal();
                this.showToast("Token Saved", "success");
                this.updateLastActivity('Added token');
            }
        });
        document.getElementById('cancel-add-btn')?.addEventListener('click', () => this.hideModal());
    }

    private showEditModal(account: any) {
        const content = `
            <div class="modal-content">
                <div class="modal-header">
                    <div class="modal-icon-vessel">
                        <i data-lucide="settings-2"></i>
                    </div>
                    <div class="modal-title-vessel">
                        <h2>Edit Identity</h2>
                        <p>UPDATE SERVICE DETAILS</p>
                    </div>
                </div>
                <div class="modal-divider"></div>
                <div class="modal-body">
                    <div class="modal-entity-badge">
                        <div class="entity-icon">
                            <i data-lucide="shield"></i>
                        </div>
                        <div class="entity-info">
                            <span class="entity-name">${account.issuer}</span>
                            <span class="entity-label">${account.account || 'Vault Token'}</span>
                        </div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Service</label>
                        <input type="text" id="edit-issuer" class="form-input" value="${account.issuer}">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Account</label>
                        <input type="text" id="edit-account" class="form-input" value="${account.account}" inputmode="email">
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn-primary" id="update-account">
                        <i data-lucide="check"></i>
                        Save Changes
                    </button>
                    <button class="user-button" id="cancel-edit-btn" style="justify-content: center;">Cancel</button>
                </div>
            </div>
        `;
        this.showModal(content);
        document.getElementById('update-account')?.addEventListener('click', async () => {
            const issuer = (document.getElementById('edit-issuer') as HTMLInputElement).value;
            const accName = (document.getElementById('edit-account') as HTMLInputElement).value;
            if (issuer) {
                this.accounts = await (window as any).api.saveAccount({ ...account, issuer, account: accName });
                this.renderAccounts();
                this.hideModal();
                this.showToast("Updated", "success");
                this.updateLastActivity('Edited token');
            }
        });
        document.getElementById('cancel-edit-btn')?.addEventListener('click', () => this.hideModal());
    }

    private showDeleteConfirm(account: any) {
        const content = `
            <div class="modal-content">
                <div class="modal-header">
                    <div class="modal-icon-vessel danger">
                        <i data-lucide="trash-2"></i>
                    </div>
                    <div class="modal-title-vessel">
                        <h2 class="danger">Delete Token?</h2>
                        <p>PERMANENT ACTION</p>
                    </div>
                </div>
                <div class="modal-divider"></div>
                <div class="modal-body">
                    <div class="modal-entity-badge">
                        <div class="entity-icon">
                            <i data-lucide="shield"></i>
                        </div>
                        <div class="entity-info">
                            <span class="entity-name">${account.issuer}</span>
                            <span class="entity-label">${account.account || 'Vault Token'}</span>
                        </div>
                    </div>
                    <p class="modal-help-text">Removing this token is permanent. You will lose access to its OTP codes.</p>
                </div>
                <div class="modal-footer">
                    <button class="btn-danger" id="confirm-delete">
                        <i data-lucide="trash-2"></i>
                        Delete Token
                    </button>
                    <button class="user-button" id="cancel-delete-btn" style="justify-content: center;">Keep Token</button>
                </div>
            </div>
        `;
        this.showModal(content);
        document.getElementById('confirm-delete')?.addEventListener('click', async () => {
            this.accounts = await (window as any).api.deleteAccount(account.id);
            this.renderAccounts();
            this.hideModal();
            this.showToast("Token removed", "info");
            this.updateLastActivity('Deleted token');
        });
        document.getElementById('cancel-delete-btn')?.addEventListener('click', () => this.hideModal());
    }

    private showImportPasswordModal(data: any) {
        const { salt, encryptedVaultData, autolock, "Desktop Settings": desktopSettings, "Web Settings": webSettings } = data;
        const content = `
            <div class="modal-content">
                <div class="modal-header">
                    <div class="modal-icon-vessel">
                        <i data-lucide="upload"></i>
                    </div>
                    <div class="modal-title-vessel">
                        <h2>Restore Vault</h2>
                        <p>VERIFY MASTER KEY TO IMPORT</p>
                    </div>
                </div>
                <div class="modal-divider"></div>
                <div class="modal-body">
                    <div class="modal-entity-badge">
                        <div class="entity-icon">
                            <i data-lucide="hard-drive"></i>
                        </div>
                        <div class="entity-info">
                            <span class="entity-name">Encrypted Backup</span>
                            <span class="entity-label">Awaiting decryption key</span>
                        </div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Backup Master Password</label>
                        <input type="password" id="import-pass" class="form-input" placeholder="••••••••" autocomplete="current-password">
                        <p class="modal-help-text" style="margin-top: 8px;">Enter the master password that was used when this backup was created.</p>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn-primary" id="confirm-import">
                        <i data-lucide="shield-check"></i>
                        Restore Vault
                    </button>
                    <button class="user-button" id="cancel-import" style="justify-content: center;">Cancel</button>
                </div>
            </div>
        `;
        this.showModal(content);
        document.getElementById('confirm-import')?.addEventListener('click', async () => {
            const pass = (document.getElementById('import-pass') as HTMLInputElement).value;
            const res = await (window as any).api.performVaultImport(salt, encryptedVaultData, pass, autolock, desktopSettings, webSettings);
            if (res.success) {
                this.hideModal();
                this.showToast("Vault restored", "success");
                await this.refreshAccounts();
            } else this.showToast(res.message, "error");
        });
        document.getElementById('cancel-import')?.addEventListener('click', () => this.hideModal());
    }

    private startLiveSync() {
        if (this.liveSyncInterval) clearInterval(this.liveSyncInterval);
        // Poll every 45 seconds to stay within GitHub API limits while remaining "reactive"
        this.liveSyncInterval = setInterval(() => this.checkForUpdates(), 45000);
    }

    private async checkForUpdates() {
        if (!navigator.onLine) return; // Skip background sync if offline

        // Don't sync if user is active in sensitive areas or typing
        if (document.activeElement?.tagName === 'INPUT' ||
            document.querySelector('.modal.show')) {
            return;
        }

        try {
            const result = await (window as any).api.pollForUpdates();
            if (result.changed) {
                this.setSyncing(true);

                // If settings changed, apply them
                if (result.settings) {
                    this.applySettings(result.settings, true); // Update local cache too
                }

                // If accounts changed (discovered via global registry or user-data update)
                await this.refreshAccounts();

                // Successful sync pulse
                const indicator = document.getElementById('cloud-sync-indicator');
                indicator?.classList.add('sync-pulse');
                setTimeout(() => indicator?.classList.remove('sync-pulse'), 2000);

                this.setSyncing(false);
            }
        } catch (e) {
            console.error("Live Sync Polling Failed", e);
        }
    }

    private async loadInitialData() {
        try {
            const user = await (window as any).api.getCurrentUser();
            if (user) {
                const nameDisplay = document.getElementById('user-name-display');
                if (nameDisplay) nameDisplay.textContent = user.username;
                const avatar = document.getElementById('user-avatar');
                if (avatar) avatar.textContent = user.username.charAt(0).toUpperCase();
                // Populate dropdown header
                const dropdownName = document.getElementById('dropdown-user-name');
                const dropdownEmail = document.getElementById('dropdown-user-email');
                if (dropdownName) dropdownName.textContent = user.username;
                if (dropdownEmail) dropdownEmail.textContent = user.email || 'Keyra Secure Vault';
            }
            await this.refreshAccounts();
        } catch (err) {
            console.error("Load failed", err);
        }
    }
}
