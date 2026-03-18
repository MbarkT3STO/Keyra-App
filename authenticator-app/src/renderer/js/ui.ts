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
    private windowResizable: boolean = false;
    private wallpaperPreset: string = 'nebula';
    private searchQuery: string = '';
    private syncCount: number = 0;
    private liveSyncInterval: any = null;
    private lastSyncUpdateInterval: any = null;
    private emailResendTimer: number = 0;
    private emailResendInterval: any = null;
    private cardCache: HTMLElement[] = [];
    private launchOnStartup: boolean = false;
    private minimizeToTray: boolean = false;
    private globalHotkey: boolean = false;
    private autoCheckUpdates: boolean = true;
    private vaultViewStyle: 'unified' | 'compact' | 'secure' = 'compact';
    private activeOtpAccount: any = null;
    private pendingConflictAction: string | null = null;
    private pendingConflictData: any = null;
    private syncVisible: boolean = true;


    constructor(public userId: string = 'default') {
        this.initTheme();
        this.initPrivacyMode();
        this.initScreenGuardian();
        this.initPerformanceMode();
        this.initMenuExitIntegration();
        this.initInteractivePrivacy();
        this.initWindowResizable();
        this.initVaultViewStyle();
        this.initSegmentedStates();
        this.setupEventListeners();
        this.updateLockVaultVisibility();
        this.startTimer();
        this.loadInitialData();
        this.initFromCloud();
        this.startLiveSync();
        this.startLastSyncTimer();
        this.initConnectivityStatus();
        this.updatePinStatus();
        this.initUpdateSystem();
        this.initSystemIntegration();
        this.initPhoneSecurity();
        this.migratePin();
    }

    private initUpdateSystem() {
        const checkBtn = document.getElementById('btn-check-updates');
        const downloadBtn = document.getElementById('btn-download-update');
        const installBtn = document.getElementById('btn-install-update');
        const message = document.getElementById('update-message');
        const badge = document.getElementById('update-status-badge');
        const progressContainer = document.getElementById('download-progress-container');
        const progressBar = document.getElementById('download-progress-bar');
        const percentText = document.getElementById('download-percent-text');
        const versionText = document.getElementById('current-version-text');
        const nmLoader = document.getElementById('nm-update-loader');

        if (versionText) {
            versionText.textContent = `Version 1.0.0`;
        }

        checkBtn?.addEventListener('click', () => {
            this.setLoading(true, "Checking Updates", "CONTACTING KEYRA SERVERS");
            if (message) message.textContent = 'Checking for updates...';
            nmLoader?.classList.remove('hidden');
            (window as any).api.checkForUpdates();
        });

        downloadBtn?.addEventListener('click', () => {
            (window as any).api.startDownload();
            downloadBtn.classList.add('hidden');
            progressContainer?.classList.remove('hidden');
        });

        installBtn?.addEventListener('click', () => {
            (window as any).api.installUpdate();
        });

        // Listen for events
        (window as any).api.onUpdateChecking(() => {
            if (message) message.textContent = 'Contacting update server...';
        });

        (window as any).api.onUpdateAvailable((info: any) => {
            nmLoader?.classList.add('hidden');
            if (message) message.textContent = `Update available: v${info.version}`;
            badge?.classList.remove('hidden');
            checkBtn?.classList.add('hidden');
            if (downloadBtn) {
                downloadBtn.classList.remove('hidden');
                const span = downloadBtn.querySelector('span');
                if (span) span.textContent = `Download v${info.version}`;
            }
        });

        (window as any).api.onUpdateNotAvailable(() => {
            this.setLoading(false);
            nmLoader?.classList.add('hidden');
            if (message) message.textContent = 'Your app is up to date.';
            checkBtn?.classList.remove('hidden');
        });

        (window as any).api.onUpdateError((err: string) => {
            this.setLoading(false);
            nmLoader?.classList.add('hidden');
            if (message) message.textContent = `Update check failed.`;
            console.error("Update Error:", err);
            checkBtn?.classList.remove('hidden');
        });

        (window as any).api.onDownloadProgress((percent: number) => {
            if (progressBar) progressBar.style.width = `${percent}%`;
            if (percentText) percentText.textContent = `${Math.round(percent)}%`;
            if (message) message.textContent = 'Downloading update...';
        });

        (window as any).api.onUpdateDownloaded(() => {
            if (message) message.textContent = 'Update ready to install.';
            progressContainer?.classList.add('hidden');
            installBtn?.classList.remove('hidden');
            this.showToast("Update ready to install!", "success");
        });
        
        const autoToggle = document.getElementById('auto-update-toggle') as HTMLInputElement;
        autoToggle?.addEventListener('change', () => {
            this.autoCheckUpdates = autoToggle.checked;
            this.pushSettings();
        });

        // Initial silent check
        setTimeout(() => {
            if (this.autoCheckUpdates) {
                (window as any).api.checkForUpdates();
            }
        }, 3000);
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
            this.showToast("You're offline", "info");
        }
    }

    private initSystemIntegration() {
        const startupToggle = document.getElementById('launch-on-startup-toggle') as HTMLInputElement;
        const trayToggle = document.getElementById('minimize-to-tray-toggle') as HTMLInputElement;
        const hotkeyToggle = document.getElementById('global-hotkey-toggle') as HTMLInputElement;

        startupToggle?.addEventListener('change', () => {
            this.launchOnStartup = startupToggle.checked;
            (window as any).api.setLaunchOnStartup(this.launchOnStartup);
            localStorage.setItem(this.getStorageKey('launch_on_startup'), String(this.launchOnStartup));
            this.pushSettings();
        });

        trayToggle?.addEventListener('change', () => {
            this.minimizeToTray = trayToggle.checked;
            (window as any).api.setMinimizeToTray(this.minimizeToTray);
            localStorage.setItem(this.getStorageKey('minimize_to_tray'), String(this.minimizeToTray));
            this.pushSettings();
        });

        hotkeyToggle?.addEventListener('change', () => {
            this.globalHotkey = hotkeyToggle.checked;
            (window as any).api.setGlobalHotkey(this.globalHotkey);
            localStorage.setItem(this.getStorageKey('global_hotkey'), String(this.globalHotkey));
            this.pushSettings();
        });

        // Load initial states
        this.launchOnStartup = localStorage.getItem(this.getStorageKey('launch_on_startup')) === 'true';
        this.minimizeToTray = localStorage.getItem(this.getStorageKey('minimize_to_tray')) === 'true';
        this.globalHotkey = localStorage.getItem(this.getStorageKey('global_hotkey')) === 'true';

        if (startupToggle) startupToggle.checked = this.launchOnStartup;
        if (trayToggle) trayToggle.checked = this.minimizeToTray;
        if (hotkeyToggle) hotkeyToggle.checked = this.globalHotkey;
        
        // Apply to main process on start
        (window as any).api.setLaunchOnStartup(this.launchOnStartup);
        (window as any).api.setMinimizeToTray(this.minimizeToTray);
        (window as any).api.setGlobalHotkey(this.globalHotkey);
    }

    private getStorageKey(key: string): string {
        return `${this.userId}_${key}`;
    }

    public setSyncing(isSyncing: boolean) {
        if (isSyncing) this.syncCount++;
        else this.syncCount = Math.max(0, this.syncCount - 1);

        this.updateSyncIndicator(this.syncCount > 0 ? 'syncing' : 'synced');
    }

    public updateSyncIndicator(state: 'synced' | 'syncing' | 'error' | 'warning', message?: string) {
        const indicator = document.getElementById('navbar-sync-indicator');
        if (!indicator) return;

        // Reset classes
        indicator.className = 'sync-indicator ' + state;
        
        // Hide if sync is not enabled/setup for this user
        indicator.classList.toggle('hidden', !this.syncVisible);
        if (!this.syncVisible) return;
        
        // Update Title/Tooltip
        let title = 'Synced and up to date';
        if (state === 'syncing') title = 'Syncing in progress...';
        if (state === 'error') title = message || 'Connection issue or PAT expired';
        if (state === 'warning') title = message || 'Sync issue detected';
        
        indicator.title = title;

        // Force a small pulse on state change
        indicator.style.transform = 'scale(1.2)';
        setTimeout(() => indicator.style.transform = '', 200);

        // Also update the textual display in settings if it exists
        if (state === 'synced') {
            this.updateLastSyncDisplay();
        }
    }

    private startLastSyncTimer() {
        this.updateLastSyncDisplay();
        if (this.lastSyncUpdateInterval) clearInterval(this.lastSyncUpdateInterval);
        this.lastSyncUpdateInterval = setInterval(() => this.updateLastSyncDisplay(), 30000); // Every 30s
    }

    private updateLastSyncDisplay() {
        const lastSyncEl = document.getElementById('sync-last-time');
        if (!lastSyncEl) return;

        const lastSyncStr = localStorage.getItem(this.getStorageKey('last_sync'));
        if (!lastSyncStr) {
            lastSyncEl.textContent = 'Never synced';
            return;
        }

        const lastSync = new Date(lastSyncStr);
        const now = new Date();
        const diffMs = now.getTime() - lastSync.getTime();
        const diffMin = Math.floor(diffMs / 60000);

        if (diffMin < 1) {
            lastSyncEl.textContent = 'Last synced: Just now';
        } else if (diffMin < 60) {
            lastSyncEl.textContent = `Last synced: ${diffMin}m ago`;
        } else {
            const diffHrs = Math.floor(diffMin / 60);
            if (diffHrs < 24) {
                lastSyncEl.textContent = `Last synced: ${diffHrs}h ago`;
            } else {
                lastSyncEl.textContent = `Last synced: ${Math.floor(diffHrs / 24)}d ago`;
            }
        }
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
            const settings = { 
                ...(user.settings || {}),
                autolock: user.autolock
            };
            this.applySettings(settings, false);
        }
    }

    private getSettingsObject(): any {
        return {
            theme: localStorage.getItem(this.getStorageKey('theme')) || 'auto',
            accentColor: localStorage.getItem(this.getStorageKey('accent_color')) || 'royal-purple',
            wallpaperPreset: this.wallpaperPreset,
            privacyMode: this.privacyMode,
            screenGuardian: this.screenGuardian,
            autolock: localStorage.getItem(this.getStorageKey('autolock')) || '0',
            oledMode: this.oledMode,
            performanceMode: this.performanceMode,
            menuExitIntegration: this.menuExitIntegration,
            privacyBlur: this.privacyBlur,
            windowResizable: this.windowResizable,
            launchOnStartup: this.launchOnStartup,
            minimizeToTray: this.minimizeToTray,
            globalHotkey: this.globalHotkey,
            autoCheckUpdates: this.autoCheckUpdates,
            vaultViewStyle: this.vaultViewStyle,
            vaultPin: localStorage.getItem(this.getStorageKey('vault_pin'))
        };
    }

    public async pushSettings(updateLocal: boolean = true) {
        this.setSyncing(true);
        try {
            const settings = this.getSettingsObject();
            const res = await (window as any).api.updateUserSettings(settings);
            
            if (res.conflict) {
                this.showSyncConflictModal('update-user-settings', settings);
                return;
            }

            if (res.success && updateLocal) {
                localStorage.setItem(this.getStorageKey('settings'), JSON.stringify(settings));
            }
            localStorage.setItem(this.getStorageKey('last_sync'), new Date().toISOString());
            return res;
        } catch (err) {
            console.error("Failed to push settings:", err);
            return { success: false };
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

        if (settings.launchOnStartup !== undefined) {
            this.launchOnStartup = !!settings.launchOnStartup;
            const t = document.getElementById('launch-on-startup-toggle') as HTMLInputElement;
            if (t) t.checked = this.launchOnStartup;
            (window as any).api.setLaunchOnStartup(this.launchOnStartup);
        }

        if (settings.minimizeToTray !== undefined) {
            this.minimizeToTray = !!settings.minimizeToTray;
            const t = document.getElementById('minimize-to-tray-toggle') as HTMLInputElement;
            if (t) t.checked = this.minimizeToTray;
            (window as any).api.setMinimizeToTray(this.minimizeToTray);
        }

        if (settings.globalHotkey !== undefined) {
            this.globalHotkey = !!settings.globalHotkey;
            const t = document.getElementById('global-hotkey-toggle') as HTMLInputElement;
            if (t) t.checked = this.globalHotkey;
            (window as any).api.setGlobalHotkey(this.globalHotkey);
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
            this.oledMode = !!settings.oledMode;
            const oledToggle = document.getElementById('oled-mode-toggle') as HTMLInputElement;
            if (oledToggle) oledToggle.checked = this.oledMode;
            document.body.classList.toggle('oled-optimized', this.oledMode && this.currentTheme === 'dark');
            // Re-apply accent to ensure OLED vibrancy if needed
            const currentAccent = localStorage.getItem(this.getStorageKey('accent_color')) || 'royal-purple';
            this.setAccentColor(currentAccent, true);
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

        if (settings.autoCheckUpdates !== undefined) {
            this.autoCheckUpdates = !!settings.autoCheckUpdates;
            const autoToggle = document.getElementById('auto-update-toggle') as HTMLInputElement;
            if (autoToggle) autoToggle.checked = this.autoCheckUpdates;
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
            localStorage.setItem(this.getStorageKey('privacyMode'), String(this.privacyMode));
            localStorage.setItem(this.getStorageKey('screenGuardian'), String(this.screenGuardian));
            if (settings.autolock !== undefined) localStorage.setItem(this.getStorageKey('autolock'), String(settings.autolock));
            localStorage.setItem(this.getStorageKey('oled_mode'), String(this.oledMode));
            localStorage.setItem(this.getStorageKey('performance_mode'), String(this.performanceMode));
            localStorage.setItem(this.getStorageKey('menu_exit_integration'), String(this.menuExitIntegration));
            localStorage.setItem(this.getStorageKey('privacy_blur'), String(this.privacyBlur));
            localStorage.setItem(this.getStorageKey('window_resizable'), String(this.windowResizable));
            localStorage.setItem(this.getStorageKey('auto_check_updates'), String(this.autoCheckUpdates));
            localStorage.setItem(this.getStorageKey('vault_view_style'), this.vaultViewStyle);
            if (settings.vaultPin !== undefined) localStorage.setItem(this.getStorageKey('vault_pin'), settings.vaultPin);
        }

        this.updateLockVaultVisibility();
        this.renderAccounts();
    }

    private initTheme() {
        const savedTheme = localStorage.getItem(this.getStorageKey('theme')) || 'auto';
        this.setTheme(savedTheme, true);

        // Listen for OS theme changes
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
            const currentSetting = localStorage.getItem(this.getStorageKey('theme')) || 'auto';
            if (currentSetting === 'auto') {
                this.setTheme('auto', true);
            }
        });
    }

    public setTheme(theme: string, silent: boolean = false) {
        let themeToApply = theme;
        if (theme === 'auto') {
            themeToApply = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        }

        this.currentTheme = themeToApply as 'light' | 'dark';
        localStorage.setItem(this.getStorageKey('theme'), theme);
        localStorage.setItem('keyra_theme', theme); // For head script

        document.documentElement.setAttribute('data-theme', themeToApply);
        document.body.classList.remove('light-theme', 'dark-theme');
        document.body.classList.add(themeToApply + '-theme');

        // OLED Optimization
        const isDark = themeToApply === 'dark';
        document.body.classList.toggle('oled-optimized', this.oledMode && isDark);

        this.updateSegmentedUI('theme-segmented', theme);

        const themeIcon = document.getElementById('theme-icon-fa');
        const themeText = document.getElementById('theme-text');
        if (themeIcon) {
            themeIcon.className = themeToApply === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
        }
        if (themeText) themeText.textContent = themeToApply === 'dark' ? 'Light Mode' : 'Dark Mode';

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
            
            // OLED awareness for accent primary
            if (this.currentTheme === 'dark' && this.oledMode) {
                root.style.setProperty('--accent-primary', `hsl(${hue}, 100%, 75%)`);
            } else {
                root.style.setProperty('--accent-primary', `hsl(${hue}, 100%, 68%)`);
            }
            
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
        document.body.classList.toggle('oled-optimized', this.oledMode && this.currentTheme === 'dark');
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
        this.privacyBlur = localStorage.getItem(this.getStorageKey('privacy_blur')) === 'true';
        const toggle = document.getElementById('privacy-blur-toggle') as HTMLInputElement;
        if (toggle) toggle.checked = this.privacyBlur;

        // Mouse Sensors for Privacy (Document level is often more stable for viewport exit)
        document.documentElement.addEventListener('mouseleave', (e) => {
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
            if (this.privacyBlur || this.screenGuardian) this.hidePrivacyOverlay();
        });
    }

    private async migratePin() {
        const pin = localStorage.getItem(this.getStorageKey('vault_pin'));
        if (pin && pin.length === 4 && /^\d+$/.test(pin)) {
            console.log("Migrating legacy plaintext PIN to encrypted storage...");
            try {
                const encrypted = await (window as any).api.encryptPIN(pin);
                localStorage.setItem(this.getStorageKey('vault_pin'), encrypted);
                await this.pushSettings();
                console.log("PIN migration successful");
            } catch (e) {
                console.error("PIN migration failed", e);
            }
        }
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
        // Don't show if we are on the auth screen
        const authVessel = document.getElementById('auth-vessel');
        const isAuthActive = authVessel && (authVessel.classList.contains('show'));
        
        if (!isAuthActive) {
            const overlay = document.getElementById('privacy-blur-overlay');
            if (overlay) {
                overlay.classList.add('show');
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
        // Tab Navigation
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const target = e.currentTarget as HTMLElement;
                const tabName = target.getAttribute('data-tab') as 'vault' | 'settings' | 'account';
                this.switchTab(tabName);
                this.updateLastActivity(`Viewed ${tabName}`);
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
        document.addEventListener('click', () => {
            dropdownMenu?.classList.remove('show');
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
            const nextTheme = this.currentTheme === 'light' ? 'dark' : 'light';
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
            const target = e.target as HTMLInputElement;
            this.oledMode = target.checked;
            localStorage.setItem(this.getStorageKey('oled_mode'), String(this.oledMode));
            
            const isDark = this.currentTheme === 'dark';
            document.body.classList.toggle('oled-optimized', this.oledMode && isDark);
            
            // Re-apply accent for vibrancy
            const currentAccent = localStorage.getItem(this.getStorageKey('accent_color')) || 'royal-purple';
            this.setAccentColor(currentAccent, true);

            this.pushSettings();
            
            if (this.oledMode && !isDark) {
                this.showToast("Pure Black only works in Dark Mode", "info");
            } else {
                this.showToast(this.oledMode ? "Pure Black (OLED) Activated" : "Standard Dark Mode Restored", "success");
            }
            this.updateLastActivity(`OLED Mode ${this.oledMode ? 'on' : 'off'}`);
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
            this.showToast(this.performanceMode ? "Performance Mode is on" : "Performance Mode is off", "info");
            this.updateLastActivity(`Performance Mode ${this.performanceMode ? 'on' : 'off'}`);
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

        // Private Sync Listeners
        document.getElementById('btn-open-private-sync')?.addEventListener('click', () => {
            this.openPrivateSyncModal();
        });

        document.getElementById('btn-close-private-sync')?.addEventListener('click', () => {
            const modal = document.getElementById('modal-private-sync');
            if (modal) {
                modal.classList.remove('show');
                setTimeout(() => modal.classList.add('hidden'), 300);
            }
        });

        document.getElementById('btn-test-sync-connection')?.addEventListener('click', () => {
            this.testPrivateSyncConnection();
        });

        document.getElementById('btn-save-private-sync')?.addEventListener('click', () => {
            this.savePrivateSyncConfig();
        });

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
            this.privacyMode = target.checked;
            localStorage.setItem(this.getStorageKey('privacyMode'), String(this.privacyMode));
            this.pushSettings();
            this.renderAccounts();
            this.showToast(this.privacyMode ? "Codes are now hidden" : "Codes are now visible", "info");
            this.updateLastActivity(`Hide Codes ${this.privacyMode ? 'on' : 'off'}`);
        });

        // Screen Guardian Toggle
        document.getElementById('screen-guardian-toggle')?.addEventListener('change', (e) => {
            const target = e.target as HTMLInputElement;
            this.screenGuardian = target.checked;
            localStorage.setItem(this.getStorageKey('screenGuardian'), String(this.screenGuardian));
            (window as any).api.setContentProtection(this.screenGuardian);
            this.pushSettings();
            this.showToast(this.screenGuardian ? "Screenshot protection is on" : "Screenshot protection is off", "info");
            this.updateLastActivity(`Anti-Peek ${this.screenGuardian ? 'on' : 'off'}`);
        });

        // Interactive Privacy Toggle
        document.getElementById('privacy-blur-toggle')?.addEventListener('change', (e) => {
            const target = e.target as HTMLInputElement;
            this.privacyBlur = target.checked;
            localStorage.setItem(this.getStorageKey('privacy_blur'), String(this.privacyBlur));
            this.pushSettings();
            this.showToast(this.privacyBlur ? "Auto-blur is on" : "Auto-blur is off", "info");
            this.updateLastActivity(`Auto-blur ${this.privacyBlur ? 'on' : 'off'}`);
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
        
        // Cloud Sync Toggle (Unified for both online and private sync)
        document.getElementById('cloud-sync-toggle')?.addEventListener('change', async (e) => {
            const target = e.target as HTMLInputElement;
            const user = await (window as any).api.getCurrentUser();
            
            if (user?.isLocal) {
                if (user.privateSync) {
                    const newConfig = { ...user.privateSync, enabled: target.checked };
                    await (window as any).api.updatePrivateSyncConfig(newConfig);
                    this.syncVisible = target.checked;
                    this.updateSyncIndicator(this.syncCount > 0 ? 'syncing' : 'synced');
                    this.showToast(target.checked ? "Private Auto-Sync enabled" : "Private Auto-Sync disabled", "info");
                }
            } else {
                // Online sync toggle logic (already persisted via pushSettings and settings object)
                this.pushSettings();
                this.showToast(target.checked ? "Cloud Auto-Sync enabled" : "Cloud Auto-Sync disabled", "info");
            }
            this.updateLastActivity(`Sync ${target.checked ? 'on' : 'off'}`);
        });

        document.getElementById('btn-sync-now')?.addEventListener('click', () => this.manualSync());

        // Vault Maintenance
        document.getElementById('btn-export-vault')?.addEventListener('click', async () => {
            this.setLoading(true, "Encrypting Backup", "PREPARING OFFLINE ARCHIVE");
            try {
                const res = await (window as any).api.exportVault();
                if (res.success) {
                    this.showToast("Vault backup created", "success");
                    this.updateLastActivity('Backed up vault');
                }
            } finally {
                this.setLoading(false);
            }
        });
        document.getElementById('btn-import-vault')?.addEventListener('click', async () => {
            this.setLoading(true, "Opening Explorer", "SELECTING BACKUP FILE");
            try {
                const res = await (window as any).api.importVault();
                if (res.success && res.data) {
                    this.showImportPasswordModal(res.data);
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
                console.log("[Auth] Forgot PIN clicked!");
                this.showForgotPinConfirm();
            });
        } else {
            console.warn("[Auth] Forgot PIN button NOT FOUND in DOM.");
        }

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
                    this.showToast("Name updated!", "success");
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

        // Change Avatar Logic
        document.getElementById('btn-change-avatar')?.addEventListener('click', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/png, image/jpeg, image/webp';
            input.onchange = async (e) => {
                const file = (e.target as HTMLInputElement).files?.[0];
                if (!file) return;

                if (file.size > 2 * 1024 * 1024) {
                    this.showToast('Image must be less than 2MB', 'error');
                    return;
                }

                // Show loading before processing
                this.setLoading(true, "Updating Profile", "UPLOADING AVATAR");

                const reader = new FileReader();
                reader.onload = async (e) => {
                    const base64 = e.target?.result as string;
                    try {
                        const res = await (window as any).api.updateProfilePicture(base64);
                        if (res.success) {
                            this.showToast(res.message, 'success');
                            await this.loadAccountInfo();
                        } else {
                            this.showToast(res.message, 'error');
                        }
                    } catch (err: any) {
                        this.showToast(err.message || "Failed to update profile picture", 'error');
                    } finally {
                        this.setLoading(false);
                    }
                };
                reader.onerror = () => {
                    this.showToast("Failed to read image file", 'error');
                    this.setLoading(false);
                };
                reader.readAsDataURL(file);
            };
            input.click();
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
                    this.showToast("Confirmation code sent!", "success");
                    
                    const modal = document.getElementById('modal-email-verify');
                    if (modal) {
                        modal.classList.remove('hidden');
                        modal.classList.add('show');
                    }
                    this.startEmailResendTimer();
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
                    this.showToast("New code sent", "success");
                } else {
                    this.showToast(res.message, "error");
                }
            } finally {
                this.setLoading(false);
            }
        });

        // Request Phone Verification (Verify Now)
        document.getElementById('form-request-phone-verification')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const phone = (document.getElementById('new-phone') as HTMLInputElement).value.trim();
            if (!phone) return;

            // Proactive Validation: International format (+ followed by 8-15 digits)
            const phoneRegex = /^\+[0-9]{8,15}$/;
            if (!phoneRegex.test(phone)) {
                this.showToast("Invalid format. Use + and 8-15 digits (e.g. +123456789).", "error");
                return;
            }

            this.setLoading(true, "Saving", "PHONE SECURITY");
            try {
                // Defensive Rate Limiting: Prevent rapid Puppeteer re-launches which cause process locks
                const lastInit = (window as any)._lastWaInit || 0;
                const now = Date.now();
                if (now - lastInit < 2000) {
                    console.log("[UI] Rate limiting WhatsApp initialization to prevent process locks.");
                    this.setLoading(true, "Wait...", "INITIALIZING");
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
                (window as any)._lastWaInit = Date.now();

                const res = await (window as any).api.requestPhoneVerification(phone);
                if (res.success) {
                    this.showToast("Number saved! Please scan to verify.", "success");
                    this.updateAccountView(); // Refresh UI to show verify box
                    this.showPhoneQrModal(); // Show the modern modal with QR
                } else {
                    this.showToast(res.message, "error");
                }
            } finally {
                this.setLoading(false);
            }
        });

        // Phone QR Modal Listeners
        document.getElementById('btn-cancel-phone-qr')?.addEventListener('click', () => this.hidePhoneQrModal());

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
                    this.showToast("Password updated!", "success");
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
                this.showToast("Email updated!", "success");
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
        const avatarImgEl = document.getElementById('acc-avatar-img') as HTMLImageElement;

        if (dispName) dispName.textContent = user.username;
        if (dispEmail) dispEmail.textContent = user.isLocal ? "Local-Only Account" : user.email;

        this.handleLocalAccountUI(user);

        // Avatar Logic
        if (avatarImgEl && initialsEl) {
            if (user.profilePicture) {
                avatarImgEl.src = user.profilePicture;
                avatarImgEl.classList.remove('hidden');
                initialsEl.classList.add('hidden');
            } else {
                avatarImgEl.classList.add('hidden');
                initialsEl.classList.remove('hidden');
                const names = user.username.split(' ');
                initialsEl.textContent = names.length > 1 
                    ? (names[0][0] + names[1][0]).toUpperCase()
                    : user.username.slice(0, 2).toUpperCase();
            }
        }

        // Also sync the navbar avatar
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
    }

    private handleLocalAccountUI(user: any) {
        const syncCard = document.getElementById('sync-settings-card');
        const syncOverlay = document.getElementById('sync-disabled-overlay');
        const syncTitle = document.getElementById('sync-settings-title');
        const syncSubtitle = document.getElementById('sync-settings-subtitle');
        const syncStatusDesc = document.getElementById('sync-status-desc');
        const syncToggle = document.getElementById('cloud-sync-toggle') as HTMLInputElement;

        if (user.isLocal) {
            document.body.classList.add('local-only');
            
            if (user.privateSync && user.privateSync.pat) {
                // Private Sync is configured
                if (syncTitle) syncTitle.textContent = "Private Sync";
                if (syncSubtitle) syncSubtitle.textContent = "GITHUB REPOSITORY STORAGE";
                if (syncStatusDesc) syncStatusDesc.textContent = user.privateSync.enabled ? "Private GitHub Sync Active" : "Private Sync Paused";
                
                // Unlock the card
                if (syncCard) syncCard.classList.remove('disabled-card');
                if (syncOverlay) {
                    syncOverlay.classList.add('hidden');
                    (syncOverlay as HTMLElement).style.display = 'none';
                }
                
                // Sync toggle state
                if (syncToggle) syncToggle.checked = !!user.privateSync.enabled;
            } else {
                // Not configured
                const syncStatusDesc = document.getElementById('sync-status-desc');
                if (syncStatusDesc) syncStatusDesc.textContent = "Offline Mode Active";
                if (syncCard) syncCard.classList.add('disabled-card');
                if (syncOverlay) {
                    syncOverlay.classList.remove('hidden');
                    (syncOverlay as HTMLElement).style.display = 'flex';
                }
            }

            // Sync Indicator Visibility
            this.syncVisible = !!(user.privateSync && user.privateSync.enabled);
            this.updateSyncIndicator(this.syncCount > 0 ? 'syncing' : 'synced');
        } else {
            document.body.classList.remove('local-only');
            if (syncTitle) syncTitle.textContent = "Cloud Sync";
            if (syncSubtitle) syncSubtitle.textContent = "Keep your Vault safe on GitHub";
            if (syncCard) syncCard.classList.remove('disabled-card');
            if (syncOverlay) syncOverlay.classList.add('hidden');

            // Online users always see the indicator (sync is part of the core experience)
            this.syncVisible = true;
            this.updateSyncIndicator(this.syncCount > 0 ? 'syncing' : 'synced');
        }


        // Handle the visibility of Private Sync button specifically
        const privateSyncBtn = document.getElementById('btn-open-private-sync');
        if (privateSyncBtn) {
            if (user.isLocal) {
                if (user.privateSync?.enabled) {
                    privateSyncBtn.innerHTML = '<i class="fa-solid fa-gear"></i><span>Configure Private Sync</span>';
                } else {
                    privateSyncBtn.innerHTML = '<i class="fa-solid fa-shield-halved"></i><span>Enable Private Sync</span>';
                }
            }
        }
    }

    private async openPrivateSyncModal() {
        const user = await (window as any).api.getCurrentUser();
        if (!user) return;

        const patInput = document.getElementById('sync-github-pat') as HTMLInputElement;
        const ownerInput = document.getElementById('sync-github-owner') as HTMLInputElement;
        const repoInput = document.getElementById('sync-github-repo') as HTMLInputElement;

        if (user.privateSync) {
            if (patInput) patInput.value = user.privateSync.pat || '';
            if (ownerInput) ownerInput.value = user.privateSync.owner || '';
            if (repoInput) repoInput.value = user.privateSync.repo || '';
        }

        this.showStaticModal('modal-private-sync');
    }

    private async testPrivateSyncConnection() {
        const pat = (document.getElementById('sync-github-pat') as HTMLInputElement)?.value;
        const owner = (document.getElementById('sync-github-owner') as HTMLInputElement)?.value;
        const repo = (document.getElementById('sync-github-repo') as HTMLInputElement)?.value;

        if (!pat || !owner || !repo) {
            this.showToast("Please fill in all fields", "info");
            return;
        }

        this.setLoading(true, "Testing Connection", "CONTACTING GITHUB API");
        try {
            const result = await (window as any).api.testPrivateSyncConnection({ pat, owner, repo });
            if (result.success) {
                this.showToast("Connection successful!", "success");
            } else {
                this.showToast(`Connection failed: ${result.message}`, "error");
            }
        } catch (e: any) {
            this.showToast(`Error: ${e.message}`, "error");
        } finally {
            this.setLoading(false);
        }
    }

    private async savePrivateSyncConfig() {
        const pat = (document.getElementById('sync-github-pat') as HTMLInputElement)?.value;
        const owner = (document.getElementById('sync-github-owner') as HTMLInputElement)?.value;
        const repo = (document.getElementById('sync-github-repo') as HTMLInputElement)?.value;

        if (!pat || !owner || !repo) {
            this.showToast("Please fill in all fields", "info");
            return;
        }

        this.setLoading(true, "Saving Config", "ENCRYPTING CREDENTIALS");
        try {
            const config = { enabled: true, pat, owner, repo };
            const result = await (window as any).api.updatePrivateSyncConfig(config);
            if (result.success) {
                this.showToast("Private Sync enabled successfully!", "success");
                const modal = document.getElementById('modal-private-sync');
                if (modal) {
                    modal.classList.remove('show');
                    setTimeout(() => modal.classList.add('hidden'), 300);
                }
                
                // Update local status desc
                const syncStatusDesc = document.getElementById('sync-status-desc');
                if (syncStatusDesc) syncStatusDesc.textContent = "Private GitHub Sync Active";

                // Update the setup button text if it exists
                const privateSyncBtn = document.getElementById('btn-open-private-sync');
                if (privateSyncBtn) {
                    privateSyncBtn.innerHTML = '<i class="fa-solid fa-gear"></i><span>Configure Private Sync</span>';
                }
                
                await this.loadInitialData(); // Refresh UI
            } else {
                this.showToast(`Failed to save: ${result.message}`, "error");
            }
        } catch (e: any) {
            this.showToast(`Error: ${e.message}`, "error");
        } finally {
            this.setLoading(false);
        }
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
        document.querySelectorAll('.accent-color-option').forEach(option => {
            option.addEventListener('click', () => {
                const accent = option.getAttribute('data-accent');
                if (accent) {
                    this.setAccentColor(accent);
                    this.showToast("Color updated!", "success");
                    this.updateLastActivity(`Changed color to ${accent}`);
                }
            });
        });
    }

    private async manualSync() {
        if (!navigator.onLine) {
            this.showToast("Cannot sync while offline", "error");
            return;
        }
        this.setLoading(true, "Synchronizing Vault", "CLOUD BACKUP IN PROGRESS");
        this.setSyncing(true);
        const btn = document.getElementById('btn-sync-now');
        const icon = btn?.querySelector('i');
        const statusDesc = document.getElementById('sync-status-desc');

        if (icon) icon.classList.add('sync-spin');
        if (statusDesc) statusDesc.textContent = 'Synchronizing...';

        try {
            await this.pushSettings();
            await this.refreshAccounts();
            this.showToast("Vault backed up!", "success");
            localStorage.setItem(this.getStorageKey('last_sync'), new Date().toISOString());
            this.updateLastActivity('Manual Cloud Sync');
            if (statusDesc) statusDesc.textContent = 'Synchronized';
            this.updateSyncIndicator('synced');
        } catch (err: any) {
            this.showToast("Sync failed", "error");
            this.updateSyncIndicator('error', err.message || 'Sync failed');
            if (statusDesc) statusDesc.textContent = 'Sync Failed';
        } finally {
            if (icon) icon.classList.remove('sync-spin');
            this.setSyncing(false);
            this.setLoading(false);
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
        const aboutAction = document.getElementById('about-last-action');
        const aboutSync = document.getElementById('about-last-sync');

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
            this.cardCache = []; 
            filtered.forEach((acc, index) => {
                const card = this.createAccountCard(acc, index);
                grid.appendChild(card);
                this.cardCache.push(card);
            });

            // Immediate batch update for all rendered cards so they don't stay empty for 1s
            const secrets = filtered.map(acc => acc.secret);
            (window as any).api.getBatchOTPs(secrets).then((res: { otps: string[], remaining: number }) => {
                this.cardCache.forEach((card, i) => {
                    if (res.otps[i]) this.updateCardOTP(card, res.otps[i], res.remaining);
                });
            });
        }
    }

    private createAccountCard(account: any, index: number): HTMLElement {
        const card = document.createElement('div');
        card.className = 'account-card animate-fade-in';
        card.style.animationDelay = `${index * 0.05}s`;

        card.innerHTML = `
            <div class="account-header">
                <div class="account-icon">
                    <i class="${this.getIcon(account.issuer)}"></i>
                </div>
                <div class="account-info">
                    <div class="service-name">${account.issuer}</div>
                    <div class="account-identity">${account.account}</div>
                </div>
                <div class="card-actions">
                <button class="btn-card-more">
                    <i class="fa-solid fa-ellipsis-vertical"></i>
                </button>
                <div class="card-dropdown">
                    <div class="card-dropdown-item edit-btn">
                        <i class="fa-solid fa-pen-to-square icon-left"></i>
                        <span>Edit</span>
                    </div>
                    <div class="card-dropdown-item danger delete-btn">
                        <i class="fa-solid fa-trash-can icon-left"></i>
                        <span>Delete</span>
                    </div>
                </div>
            </div>
            </div>
            
            <div class="otp-hero">
                ${this.vaultViewStyle !== 'secure' ? `
                    <div class="otp-code ${this.privacyMode ? 'privacy-hidden' : ''}">
                        ${this.privacyMode ? '••••••' : '------'}
                    </div>
                ` : `
                    <button class="btn-primary secure-view-btn" style="width: 100%; height: 50px; background: var(--nm-surface); box-shadow: var(--nm-shadow-out-sm);">
                        <i class="fa-solid fa-shield-halved"></i>
                        <span>Secure View</span>
                    </button>
                `}

                ${this.vaultViewStyle === 'compact' ? `
                <div class="timer-linear-vessel">
                    <div class="timer-linear-progress"></div>
                </div>` : ''}
            </div>

            ${this.vaultViewStyle !== 'secure' ? `
            <div class="card-footer" style="padding: 0;">
                <button class="btn-primary copy-btn" style="width: 100%;">
                    <i class="fa-solid fa-copy icon-left"></i>
                    <span>Copy Code</span>
                </button>
            </div>
            ` : ''}
        `;

        const copyBtn = card.querySelector('.copy-btn') as HTMLElement;
        if (copyBtn) {
            copyBtn.onclick = async () => {
                const otpCode = await (window as any).api.generateTOTP(account.secret);
                await navigator.clipboard.writeText(otpCode);
                this.showToast("Code copied!", "success");
                this.updateLastActivity('OTP copied');
            };
        }

        const codeEl = card.querySelector('.otp-code') as HTMLElement;
        if (codeEl) {
            codeEl.onclick = async () => {
                const otpCode = await (window as any).api.generateTOTP(account.secret);
                await navigator.clipboard.writeText(otpCode);
                this.showToast("OTP Copied", "success");
                this.showCopyFeedback(codeEl);
                this.updateLastActivity('OTP copied');
            };
        }

        const moreBtn = card.querySelector('.btn-card-more') as HTMLElement;
        const dropdown = card.querySelector('.card-dropdown') as HTMLElement;

        moreBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            // Close all other dropdowns first
            document.querySelectorAll('.card-dropdown.show').forEach(d => {
                if (d !== dropdown) {
                    d.classList.remove('show');
                    d.previousElementSibling?.classList.remove('active');
                }
            });
            dropdown.classList.toggle('show');
            moreBtn.classList.toggle('active');
        });

        card.querySelector('.edit-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.classList.remove('show');
            moreBtn.classList.remove('active');
            this.showEditModal(account);
        });

        card.querySelector('.delete-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.classList.remove('show');
            moreBtn.classList.remove('active');
            this.showDeleteConfirm(account);
        });

        card.querySelector('.secure-view-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.showOtpModal(account);
        });

        // Initial update will be handled by the batch call in renderAccounts or the timer
        return card;
    }

    private async handleScannedData(data: string) {
        try {
            if (!data.startsWith('otpauth://totp/')) {
                this.showToast("QR code not recognized", "error");
                return;
            }

            this.setLoading(true, "Processing QR", "DECODING SECURE URI");
            try {
                const parsed = await (window as any).api.parseURI(data);
                await (window as any).api.generateTOTP(parsed.secret);

                const res = await (window as any).api.saveAccount({
                    id: Date.now().toString(),
                    issuer: parsed.issuer,
                    account: parsed.account,
                    secret: parsed.secret
                });

                if (res.conflict) {
                    this.showSyncConflictModal('save-account', {
                        id: Date.now().toString(),
                        issuer: parsed.issuer,
                        account: parsed.account,
                        secret: parsed.secret
                    });
                    return;
                }

                this.accounts = res.accounts || [];
                this.renderAccounts();
                this.showToast(`Account added!`, "success");
                this.updateLastActivity('Added token via Scan');
            } finally {
                this.setLoading(false);
            }
        } catch (err) {
            console.error("Invalid QR Format", err);
            this.showToast("Invalid QR Format", "error");
        }
    }

    private async updateCardOTP(card: HTMLElement, otp: string, remaining: number) {
        const codeElement = card.querySelector('.otp-code') as HTMLElement;
        if (!codeElement) return;

        const formattedOtp = otp.substring(0, 3) + ' ' + otp.substring(3);
        
        if (!this.privacyMode) {
            if (codeElement.textContent !== formattedOtp) {
                codeElement.textContent = formattedOtp;
            }
        }

        // Mode 1: Unified (Global Bar)
        if (this.vaultViewStyle === 'unified') {
            const globalProgressBar = document.getElementById('global-otp-timer') as HTMLElement;
            if (globalProgressBar) {
                const scale = remaining / 30;
                globalProgressBar.style.transform = `scaleX(${scale})`;
                globalProgressBar.style.backgroundColor = remaining <= 5 ? '#ff3b30' : 'var(--accent-primary)';
            }
        } 
        // Mode 2: Compact (Individual Bars)
        else if (this.vaultViewStyle === 'compact') {
            const progressBar = card.querySelector('.timer-linear-progress') as HTMLElement;
            if (progressBar) {
                const scale = remaining / 30;
                progressBar.style.transform = `scaleX(${scale})`;
                progressBar.style.backgroundColor = remaining <= 5 ? '#ff3b30' : 'var(--accent-primary)';
            }
        }
        // Mode 3: Secure (Modal) - Updates are handled separately via this.updateOtpModal if modal is open
    }

    private updateOtpModal(otp: string, remaining: number) {
        const modal = document.querySelector('.otp-modal-container');
        if (!modal || !this.activeOtpAccount) return;

        const codeDisp = modal.querySelector('.otp-modal-code-vessel') as HTMLElement;
        const formattedOtp = otp.substring(0, 3) + ' ' + otp.substring(3);
        
        if (codeDisp && codeDisp.textContent !== formattedOtp) {
            codeDisp.textContent = formattedOtp;
        }

        const circle = modal.querySelector('.timer-circle-progress') as SVGCircleElement;
        const text = modal.querySelector('.timer-countdown-text') as HTMLElement;
        if (circle && text) {
            const radius = 54;
            const circumference = 2 * Math.PI * radius;
            const offset = circumference - (remaining / 30) * circumference;
            
            circle.style.strokeDasharray = `${circumference} ${circumference}`;
            circle.style.strokeDashoffset = offset.toString();
            circle.style.stroke = remaining <= 5 ? '#ff3b30' : 'var(--accent-primary)';
            
            text.textContent = remaining.toString();
            text.style.color = remaining <= 5 ? '#ff3b30' : 'var(--accent-primary)';
        }
    }

    private async showOtpModal(account: any) {
        this.activeOtpAccount = account;
        const initialOtp = await (window as any).api.generateTOTP(account.secret);
        const { remaining } = await (window as any).api.getBatchOTPs([account.secret]);

        const content = `
            <div class="otp-modal-container">
                <div class="otp-modal-header">
                    <div class="otp-modal-name">${account.issuer}</div>
                    <div class="otp-modal-account">${account.account}</div>
                </div>

                <div class="circular-timer-vessel">
                    <svg class="circular-timer-svg" width="120" height="120">
                        <circle class="timer-circle-bg" cx="60" cy="60" r="54"></circle>
                        <circle class="timer-circle-progress" cx="60" cy="60" r="54"></circle>
                    </svg>
                    <div class="timer-countdown-text">${remaining}</div>
                </div>

                <div class="otp-modal-code-vessel" id="otp-modal-copy">
                    ${initialOtp.substring(0, 3)} ${initialOtp.substring(3)}
                </div>

                <div class="otp-modal-footer">
                    <button class="btn-primary" id="btn-otp-modal-copy" style="flex: 1;">
                        <i class="fa-solid fa-copy"></i>
                        Copy
                    </button>
                    <button class="user-button" id="btn-otp-modal-close" style="width: auto; padding: 0 20px;">Close</button>
                </div>
            </div>
        `;

        this.showModal(content);
        this.updateOtpModal(initialOtp, remaining);

        document.getElementById('btn-otp-modal-copy')?.addEventListener('click', () => {
            navigator.clipboard.writeText(initialOtp);
            this.showToast("Code copied!", "success");
            this.showCopyFeedback(document.getElementById('otp-modal-copy')!);
        });
        document.getElementById('otp-modal-copy')?.addEventListener('click', () => {
             navigator.clipboard.writeText(initialOtp);
            this.showToast("OTP Copied", "success");
            this.showCopyFeedback(document.getElementById('otp-modal-copy')!);
        });
        document.getElementById('btn-otp-modal-close')?.addEventListener('click', () => {
            this.activeOtpAccount = null;
            this.hideModal();
        });
    }

    private startTimer() {
        if (this.timerInterval) clearInterval(this.timerInterval);
        this.timerInterval = setInterval(async () => {
            if (this.accounts.length === 0 || this.cardCache.length === 0) return;
            
            // Batch process all secrets in one IPC called
            const secrets = this.accounts.map(acc => acc.secret);
            const { otps, remaining } = await (window as any).api.getBatchOTPs(secrets);

            this.cardCache.forEach((card, i) => {
                if (otps[i]) this.updateCardOTP(card, otps[i], remaining);
            });

            // Update active modal if open
            if (this.activeOtpAccount) {
                const activeIndex = this.accounts.findIndex(a => a.id === this.activeOtpAccount.id);
                if (activeIndex !== -1 && otps[activeIndex]) {
                    this.updateOtpModal(otps[activeIndex], remaining);
                }
            }
        }, 1000);
    }

    private showSyncConflictModal(action: string, data: any) {
        this.pendingConflictAction = action;
        this.pendingConflictData = data;

        const modal = document.getElementById('modal-sync-conflict');
        if (!modal) return;

        modal.classList.remove('hidden');
        setTimeout(() => modal.classList.add('show'), 10);

        const forcePushOption = document.getElementById('option-force-push');
        const pullRemoteOption = document.getElementById('option-pull-remote');
        const resolveBtn = document.getElementById('btn-resolve-sync-conflict') as HTMLButtonElement;
        const closeBtn = document.getElementById('btn-close-sync-conflict');

        let selectedResolution: 'force' | 'pull' | null = null;

        const updateSelection = (res: 'force' | 'pull') => {
            selectedResolution = res;
            forcePushOption?.classList.toggle('selected', res === 'force');
            pullRemoteOption?.classList.toggle('selected', res === 'pull');
            if (resolveBtn) {
                resolveBtn.classList.remove('disabled');
                resolveBtn.disabled = false;
            }
        };

        forcePushOption?.addEventListener('click', () => updateSelection('force'));
        pullRemoteOption?.addEventListener('click', () => updateSelection('pull'));

        closeBtn?.addEventListener('click', () => {
            modal.classList.remove('show');
            setTimeout(() => modal.classList.add('hidden'), 300);
            this.pendingConflictAction = null;
            this.pendingConflictData = null;
        });

        resolveBtn.addEventListener('click', async () => {
            if (!selectedResolution) return;

            this.setLoading(true, "Resolving Conflict", "SYNCHRONIZING SECURE DATA");
            try {
                if (selectedResolution === 'force') {
                    // Retrying the same action with force=true
                    // I need to update the IPC calls to support a 'force' argument if I go this way.
                    // Actually, I'll update syncUserData in auth.ts to handle force-push.
                    // For now, let's assume we can pass a 'force' flag.
                    
                    let res: any;
                    if (this.pendingConflictAction === 'save-account') {
                        res = await (window as any).api.saveAccount(this.pendingConflictData, true);
                    } else if (this.pendingConflictAction === 'delete-account') {
                        res = await (window as any).api.deleteAccount(this.pendingConflictData, true);
                    } else if (this.pendingConflictAction === 'update-user-settings') {
                        res = await (window as any).api.updateUserSettings(this.pendingConflictData, true);
                    }

                    if (res && res.success) {
                        this.showToast("Conflict resolved: local data pushed", "success");
                        if (res.accounts) {
                            this.accounts = res.accounts;
                            this.renderAccounts();
                        }
                        modal.classList.remove('show');
                        setTimeout(() => modal.classList.add('hidden'), 300);
                        this.hideModal(); // Hide the original action modal if any
                    } else {
                        this.showToast(res?.message || "Resolution failed", "error");
                    }
                } else {
                    // Pull Remote
                    await this.refreshAccounts();
                    const user = await (window as any).api.getCurrentUser();
                    if (user) {
                        this.handleLocalAccountUI(user);
                        this.applySettings(user.settings || {}, true);
                    }
                    this.showToast("Conflict resolved: remote data pulled", "success");
                    modal.classList.remove('show');
                    setTimeout(() => modal.classList.add('hidden'), 300);
                    this.hideModal();
                }
            } catch (err) {
                console.error("Resolution Error:", err);
                this.showToast("An error occurred during resolution", "error");
            } finally {
                this.setLoading(false);
            }
        });
    }

    private getIcon(issuer: string): string {
        const name = issuer.toLowerCase();
        
        // 1. Precise Brand Mapping (Top Tier)
        const icons: { [key: string]: string } = {
            'google': 'fa-brands fa-google', 'github': 'fa-brands fa-github', 'microsoft': 'fa-brands fa-microsoft', 'apple': 'fa-brands fa-apple',
            'amazon': 'fa-brands fa-amazon', 'facebook': 'fa-brands fa-facebook', 'twitter': 'fa-brands fa-twitter', 'discord': 'fa-brands fa-discord',
            'binance': 'fa-solid fa-coins', 'coinbase': 'fa-solid fa-wallet', 'stripe': 'fa-brands fa-stripe', 'paypal': 'fa-brands fa-paypal',
            'slack': 'fa-brands fa-slack', 'instagram': 'fa-brands fa-instagram', 'linkedin': 'fa-brands fa-linkedin', 'twitch': 'fa-brands fa-twitch',
            'spotify': 'fa-brands fa-spotify', 'netflix': 'fa-solid fa-tv', 'steam': 'fa-brands fa-steam', 'epic': 'fa-solid fa-gamepad',
            'dropbox': 'fa-brands fa-dropbox', 'figma': 'fa-brands fa-figma', 'canva': 'fa-solid fa-palette', 'adobe': 'fa-solid fa-pen-nib',
            'shopify': 'fa-brands fa-shopify', 'reddit': 'fa-brands fa-reddit', 'bitbucket': 'fa-brands fa-bitbucket',
            'gitlab': 'fa-brands fa-gitlab', 'heroku': 'fa-solid fa-server', 'digitalocean': 'fa-brands fa-digital-ocean', 'cloudflare': 'fa-brands fa-cloudflare',
            'vercel': 'fa-solid fa-triangle-exclamation', 'netlify': 'fa-solid fa-globe', 'firebase': 'fa-solid fa-flame', 'wordpress': 'fa-brands fa-wordpress',
            'medium': 'fa-brands fa-medium', 'patreon': 'fa-brands fa-patreon', 'discordapp': 'fa-brands fa-discord',
            'protonmail': 'fa-solid fa-envelope', 'nordvpn': 'fa-solid fa-shield-halved', 'expressvpn': 'fa-solid fa-shield-halved',
            'bitwarden': 'fa-solid fa-lock', '1password': 'fa-solid fa-key', 'lastpass': 'fa-solid fa-key',
            'uber': 'fa-brands fa-uber', 'lyft': 'fa-solid fa-car', 'airbnb': 'fa-brands fa-airbnb', 'notion': 'fa-solid fa-file-lines',
            'zoom': 'fa-solid fa-video', 'trello': 'fa-brands fa-trello', 'asana': 'fa-solid fa-list-check', 'clickup': 'fa-solid fa-layer-group'
        };

        if (icons[name]) return icons[name];

        // 2. Keyword-based Fuzzy Matching (Intelligent Heuristics)
        const keywords: [string | RegExp, string][] = [
            // Cloud & Infrastructure
            [/aws|amazon|cloud/i, 'fa-solid fa-cloud'],
            [/azure|microsoft/i, 'fa-brands fa-microsoft'],
            [/server|host|vps|deploy/i, 'fa-solid fa-server'],
            [/db|database|mongo|sql|redis/i, 'fa-solid fa-database'],
            
            // Communication & Social
            [/mail|email|outlook|gmail/i, 'fa-solid fa-envelope'],
            [/chat|message|messenger|slack|discord/i, 'fa-solid fa-comment-dots'],
            [/social|network|brand/i, 'fa-solid fa-share-nodes'],
            
            // Finance
            [/bank|finance|money|wallet|pay/i, 'fa-solid fa-wallet'],
            [/crypto|coin|token|eth|btc/i, 'fa-solid fa-coins'],
            [/card|credit|debit/i, 'fa-solid fa-credit-card'],
            
            // Security & Dev
            [/auth|security|protect|shield|vault/i, 'fa-solid fa-shield-halved'],
            [/key|password|pass|login|access/i, 'fa-solid fa-key'],
            [/code|dev|git|build|repo/i, 'fa-solid fa-code'],
            [/api|endpoint|webhook/i, 'fa-solid fa-link'],
            
            // Media & Entertainment
            [/video|movie|tv|stream|netflix|yt|youtube/i, 'fa-solid fa-video'],
            [/music|audio|song|sound/i, 'fa-solid fa-music'],
            [/game|play|epic|xbox|psn/i, 'fa-solid fa-gamepad'],
            
            // Business & Identity
            [/shop|store|cart|ebay|buy/i, 'fa-solid fa-cart-shopping'],
            [/user|account|profile|id/i, 'fa-solid fa-user'],
            [/work|corp|company|office/i, 'fa-solid fa-briefcase']
        ];

        for (const [pattern, icon] of keywords) {
            if (typeof pattern === 'string' && name.includes(pattern)) return icon;
            if (pattern instanceof RegExp && pattern.test(name)) return icon;
        }

        // 3. Last Resort Fallback
        return 'fa-solid fa-shield';
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
        const vessel = document.getElementById('lock-vessel');
        if (vessel) {
            // Populate the user's identity on the lock screen
            try {
                const user = await (window as any).api.getCurrentUser();
                if (user) {
                    const pinAvatarImg = document.getElementById('pin-avatar-img') as HTMLImageElement;
                    const pinAvatarFallback = document.getElementById('pin-avatar-fallback') as HTMLImageElement;
                    const pinGreeting = document.getElementById('pin-greeting');

                    if (pinAvatarImg && pinAvatarFallback) {
                        if (user.profilePicture) {
                            pinAvatarImg.src = user.profilePicture;
                            pinAvatarImg.classList.remove('hidden');
                            pinAvatarFallback.classList.add('hidden');
                        } else {
                            pinAvatarImg.classList.add('hidden');
                            pinAvatarFallback.classList.remove('hidden');
                        }
                    }

                    if (pinGreeting) {
                        const firstName = user.username.split(' ')[0];
                        pinGreeting.textContent = `Welcome back, ${firstName}`;
                    }
                }
            } catch (e) {
                console.error("Failed to load user for lock screen:", e);
            }

            vessel.classList.add('show');
            document.body.classList.add('vault-is-locked');
            const pinIn = document.getElementById('unlock-pin') as HTMLInputElement;
            if (pinIn) { 
                pinIn.value = ''; 
                setTimeout(() => pinIn.focus(), 100);
            }
            // Reset dots
            const dots = vessel.querySelectorAll('.pin-dot');
            dots.forEach(dot => dot.classList.remove('filled', 'success', 'error'));
        }
    }

    private handleUnlock() {
        const pinIn = document.getElementById('unlock-pin') as HTMLInputElement;
        if (pinIn) this.validateAndAutoUnlock(pinIn.value);
    }

    private async validateAndAutoUnlock(pinValue: string) {
        const saved = localStorage.getItem(this.getStorageKey('vault_pin'));
        
        // Target only the dots inside the lock vessel to avoid conflicts with other modals
        const lockVessel = document.getElementById('lock-vessel');
        const dots = lockVessel?.querySelectorAll('.pin-dot');

        if (dots) {
            dots.forEach((dot, i) => dot.classList.toggle('filled', i < pinValue.length));
        }

        if (pinValue.length === 4) {
            let isCorrect = false;
            try {
                if (saved) {
                    // Try decrypting. If it fails, it's either an invalid key or plaintext.
                    // We'll handle plaintext migration in init, so here we expect encrypted if it's there.
                    // But for robustness, we handle both if needed or assume migration worked.
                    if (saved.length === 4 && /^\d+$/.test(saved)) {
                        isCorrect = (pinValue === saved);
                    } else {
                        const decrypted = await (window as any).api.decryptPIN(saved);
                        isCorrect = (pinValue === decrypted);
                    }
                }
            } catch (e) {
                console.error("PIN Decryption failed during unlock", e);
                isCorrect = false;
            }

            if (isCorrect) {
                if (dots) dots.forEach(dot => dot.classList.add('success'));
                setTimeout(() => {
                    document.getElementById('lock-vessel')?.classList.remove('show');
                    document.body.classList.remove('vault-is-locked');
                    (document.getElementById('unlock-pin') as HTMLInputElement).value = '';
                    if (dots) dots.forEach(dot => dot.classList.remove('filled', 'success'));
                }, 500);
                this.showToast("Vault unlocked!", "success");
                this.updateLastActivity('Vault unlocked');
            } else {
                if (dots) dots.forEach(dot => dot.classList.add('error'));
                setTimeout(() => {
                    (document.getElementById('unlock-pin') as HTMLInputElement).value = '';
                    if (dots) dots.forEach(dot => dot.classList.remove('filled', 'error'));
                }, 800);
                this.showToast("Incorrect PIN", "error");
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
            setupBtn.textContent = hasPin ? 'Change' : 'Setup';
        }

        if (removeBtn) {
            removeBtn.classList.toggle('hidden', !hasPin);
        }

        // Auto-Lock dependency on PIN
        const autolockCtrl = document.getElementById('autolock-segmented');
        const autolockRow = autolockCtrl?.closest('.setting-row');
        if (autolockCtrl && autolockRow) {
            autolockCtrl.classList.toggle('disabled', !hasPin);
            autolockRow.classList.toggle('disabled', !hasPin);
            
            if (!hasPin) {
                // Reset autolock to 0 (Off) if PIN is removed
                this.updateSegmentedUI('autolock-segmented', '0');
                localStorage.setItem(this.getStorageKey('autolock'), '0');
                this.pushSettings();
            }
        }
    }

    private async verifyCurrentPin(onSuccess: () => void) {
        const storedPin = localStorage.getItem(this.getStorageKey('vault_pin'));
        if (!storedPin) {
            onSuccess();
            return;
        }

        const content = `
            <div class="modal-content">
                <div class="modal-header">
                    <div class="modal-icon-vessel">
                        <i class="fa-solid fa-shield-halved"></i>
                    </div>
                    <div class="modal-title-vessel">
                        <h2>Verify Identity</h2>
                        <p>ENTER CURRENT PIN TO PROCEED</p>
                    </div>
                </div>
                <div class="modal-divider"></div>
                <div class="modal-body">
                    <div class="pin-input-vessel" style="margin: 20px 0;">
                        <input type="password" id="verify-pin-field" maxlength="4" class="pin-field" 
                               style="opacity: 0; position: absolute;" autocomplete="off" autofocus>
                        <div class="pin-indicators" style="justify-content: center;">
                            <div class="pin-dot" data-digit="1"></div>
                            <div class="pin-dot" data-digit="2"></div>
                            <div class="pin-dot" data-digit="3"></div>
                            <div class="pin-dot" data-digit="4"></div>
                        </div>
                    </div>
                </div>
                <div class="modal-footer" style="padding: 0; min-height: 48px;">
                    <button class="user-button" id="cancel-verify-btn" style="width: 100%; justify-content: center;">Cancel</button>
                </div>
            </div>
        `;
        this.showModal(content);

        const input = document.getElementById('verify-pin-field') as HTMLInputElement;
        const dots = document.querySelectorAll('.pin-dot');

        input?.focus();
        
        input?.addEventListener('input', async (e) => {
            const val = (e.target as HTMLInputElement).value.replace(/[^0-9]/g, '');
            input.value = val;
            dots.forEach((dot, i) => dot.classList.toggle('filled', i < val.length));
            
            if (val.length === 4) {
                await performVerify();
            }
        });

        const performVerify = async () => {
            const enteredPin = input.value;
            try {
                let isCorrect = false;
                try {
                    const decrypted = await (window as any).api.decryptPIN(storedPin);
                    isCorrect = enteredPin === decrypted;
                } catch (e) {
                    isCorrect = enteredPin === storedPin;
                }

                if (isCorrect) {
                     onSuccess();
                } else {
                    this.showToast("Incorrect PIN", "error");
                    input.value = '';
                    dots.forEach(dot => dot.classList.remove('filled'));
                    input.focus();
                }
            } catch (e) {
                console.error("Verification failed", e);
                this.showToast("Verification error", "error");
            }
        };

        input?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') performVerify();
        });

        document.getElementById('cancel-verify-btn')?.addEventListener('click', () => this.hideModal());
    }

    private showRemovePinConfirm() {
        this.verifyCurrentPin(() => {
            const content = `
                <div class="modal-content">
                    <div class="modal-header">
                        <div class="modal-icon-vessel danger">
                            <i class="fa-solid fa-shield-halved"></i>
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
                                <i class="fa-solid fa-lock"></i>
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
                            <i class="fa-solid fa-trash-can"></i>
                            Remove Security
                        </button>
                        <button class="user-button" id="cancel-remove-pin" style="justify-content: center;">Keep PIN Active</button>
                    </div>
                </div>
            `;
            this.showModal(content);
            document.getElementById('confirm-remove-pin')?.addEventListener('click', async () => {
                this.setLoading(true, "Removing Security", "DEACTIVATING MASTER KEY");
                try {
                    localStorage.removeItem(this.getStorageKey('vault_pin'));
                    await this.pushSettings();
                    this.updateLockVaultVisibility();
                    this.updatePinStatus();
                    this.showToast("Security code removed", "info");
                    this.hideModal();
                } finally {
                    this.setLoading(false);
                }
            });
            document.getElementById('cancel-remove-pin')?.addEventListener('click', () => this.hideModal());
        });
    }


    private debounce(func: Function, wait: number) {
        let timeout: any;
        return (...args: any[]) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }

    private showPinSetup() {
        this.verifyCurrentPin(() => {
            let firstEntry = '';
            let phase: 'entry' | 'confirm' = 'entry';

            const renderModal = () => {
            const isEntry = phase === 'entry';
            const content = `
                <div class="modal-content">
                    <div class="modal-header">
                        <div class="modal-icon-vessel">
                            <i class="fa-solid ${isEntry ? 'fa-shield-halved' : 'fa-circle-check'}"></i>
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
                            <i class="fa-solid ${isEntry ? 'fa-arrow-right' : 'fa-shield-halved'}"></i>
                            ${isEntry ? 'Next Phase' : 'Activate Vault'}
                        </button>
                        <button class="user-button" id="cancel-pin-btn" style="justify-content: center;">Cancel</button>
                    </div>
                </div>
            `;
            this.showModal(content);

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

            nextBtn?.addEventListener('click', async () => {
                if (phase === 'entry') {
                    firstEntry = input.value;
                    phase = 'confirm';
                    renderModal();
                } else {
                    if (input.value === firstEntry) {
                        this.setLoading(true, "Securing Vault", "GENERATING MASTER KEY");
                        try {
                            const encrypted = await (window as any).api.encryptPIN(input.value);
                            localStorage.setItem(this.getStorageKey('vault_pin'), encrypted);
                            await this.pushSettings();
                            this.updateLockVaultVisibility();
                            this.updatePinStatus();
                            this.showToast("PIN set up and encrypted!", "success");
                            this.hideModal();
                        } catch (e) {
                            console.error("PIN Setup encryption failed", e);
                            this.showToast("Security setup failed", "error");
                        } finally {
                            this.setLoading(false);
                        }
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
        });
    }

    private showAddModal() {
        const content = `
            <div class="modal-content">
                <div class="modal-header">
                    <div class="modal-icon-vessel">
                        <i class="fa-solid fa-circle-plus"></i>
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
                        <i class="fa-solid fa-shield-halved"></i>
                        Save Token
                    </button>
                    <button class="user-button" id="btn-scan-screen-trigger" style="justify-content: center; white-space: nowrap;">
                        <i class="fa-solid fa-desktop"></i>
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

        const saveAccountAction = async () => {
            const issuer = (document.getElementById('new-issuer') as HTMLInputElement).value.trim();
            const account = (document.getElementById('new-account') as HTMLInputElement).value.trim();
            const secret = (document.getElementById('new-secret') as HTMLInputElement).value.replace(/\s/g, '').toUpperCase();
            
            if (issuer && secret) {
                this.setLoading(true, "Securing Token", "ENCRYPTING NEW IDENTITY");
                try {
                    const res = await (window as any).api.saveAccount({ id: Date.now().toString(), issuer, account, secret });
                    
                    if (res.conflict) {
                        this.showSyncConflictModal('save-account', { id: Date.now().toString(), issuer, account, secret });
                        return;
                    }

                    this.accounts = res.accounts || [];
                    this.renderAccounts();
                    this.hideModal();
                    this.showToast("Account saved!", "success");
                    this.updateLastActivity('Added token');
                } finally {
                    this.setLoading(false);
                }
            } else {
                this.showToast("Service and Secret are required", "error");
            }
        };

        document.getElementById('save-new-account')?.addEventListener('click', saveAccountAction);
        
        ['new-issuer', 'new-account', 'new-secret'].forEach(id => {
            document.getElementById(id)?.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') saveAccountAction();
            });
        });

        document.getElementById('cancel-add-btn')?.addEventListener('click', () => this.hideModal());
    }

    private showEditModal(account: any) {
        const content = `
            <div class="modal-content">
                <div class="modal-header">
                    <div class="modal-icon-vessel">
                        <i class="fa-solid fa-sliders"></i>
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
                            <i class="fa-solid fa-shield"></i>
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
                        <i class="fa-solid fa-check"></i>
                        Save Changes
                    </button>
                    <button class="user-button" id="cancel-edit-btn" style="justify-content: center;">Cancel</button>
                </div>
            </div>
        `;
        this.showModal(content);
        const updateAccountAction = async () => {
            const issuer = (document.getElementById('edit-issuer') as HTMLInputElement).value.trim();
            const accName = (document.getElementById('edit-account') as HTMLInputElement).value.trim();
            if (issuer) {
                this.setLoading(true, "Updating Identity", "SYNCHRONIZING CHANGES");
                try {
                    const res = await (window as any).api.saveAccount({ ...account, issuer, account: accName });
                    
                    if (res.conflict) {
                        this.showSyncConflictModal('save-account', { ...account, issuer, account: accName });
                        return;
                    }

                    this.accounts = res.accounts || [];
                    this.renderAccounts();
                    this.hideModal();
                    this.showToast("Account updated!", "success");
                    this.updateLastActivity('Edited token');
                } finally {
                    this.setLoading(false);
                }
            }
        };

        document.getElementById('update-account')?.addEventListener('click', updateAccountAction);
        
        ['edit-issuer', 'edit-account'].forEach(id => {
            document.getElementById(id)?.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') updateAccountAction();
            });
        });

        document.getElementById('cancel-edit-btn')?.addEventListener('click', () => this.hideModal());
    }

    private showDeleteConfirm(account: any) {
        const content = `
            <div class="modal-content">
                <div class="modal-header">
                    <div class="modal-icon-vessel danger">
                        <i class="fa-solid fa-trash-can"></i>
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
                            <i class="fa-solid fa-shield"></i>
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
                        <i class="fa-solid fa-trash-can"></i>
                        Delete Token
                    </button>
                    <button class="user-button" id="cancel-delete-btn" style="justify-content: center;">Keep Token</button>
                </div>
            </div>
        `;
        this.showModal(content);
        document.getElementById('confirm-delete')?.addEventListener('click', async () => {
            this.setLoading(true, "Removing Token", "PERMANENT DELETION IN PROGRESS");
            try {
                const res = await (window as any).api.deleteAccount(account.id);
                
                if (res.conflict) {
                    this.showSyncConflictModal('delete-account', account.id);
                    return;
                }

                this.accounts = res.accounts || [];
                this.renderAccounts();
                this.hideModal();
                this.showToast("Account removed", "info");
                this.updateLastActivity('Deleted token');
            } finally {
                this.setLoading(false);
            }
        });
        document.getElementById('cancel-delete-btn')?.addEventListener('click', () => this.hideModal());
    }

    private showImportPasswordModal(data: any) {
        const { salt, encryptedVaultData, autolock, "Desktop Settings": desktopSettings, "Web Settings": webSettings } = data;
        const content = `
            <div class="modal-content">
                <div class="modal-header">
                    <div class="modal-icon-vessel">
                        <i class="fa-solid fa-upload"></i>
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
                            <i class="fa-solid fa-hard-drive"></i>
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
                        <i class="fa-solid fa-shield-halved"></i>
                        Restore Vault
                    </button>
                    <button class="user-button" id="cancel-import" style="justify-content: center;">Cancel</button>
                </div>
            </div>
        `;
        this.showModal(content);
        document.getElementById('confirm-import')?.addEventListener('click', async () => {
            const pass = (document.getElementById('import-pass') as HTMLInputElement).value;
            this.setLoading(true, "Restoring Vault", "DECRYPTING BACKUP ARCHIVE");
            try {
                const res = await (window as any).api.performVaultImport(salt, encryptedVaultData, pass, autolock, desktopSettings, webSettings);
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
                this.updateSyncIndicator('synced');
                this.setSyncing(false);
            }
        } catch (e: any) {
            console.error("Background sync failed:", e);
            this.updateSyncIndicator('warning', 'Background sync failed');
            this.setSyncing(false);
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


    private showPhoneQrModal() {
        const modal = document.getElementById('modal-phone-qr');
        if (modal) {
            modal.classList.remove('hidden');
            setTimeout(() => modal.classList.add('show'), 10);
            // Trigger WhatsApp linking ONLY when the modal is opened
            (window as any).api.startWhatsAppLinking();
            this.initWhatsAppLinking(); 
        }
    }

    private hidePhoneQrModal() {
        const modal = document.getElementById('modal-phone-qr');
        if (modal) {
            modal.classList.remove('show');
            setTimeout(() => {
                modal.classList.add('hidden');
                const errorContainer = document.getElementById('wa-qr-error');
                const overlay = document.getElementById('wa-qr-overlay');
                if (errorContainer) errorContainer.classList.add('hidden');
                if (overlay) overlay.classList.add('hidden');
            }, 300);
        }
    }

    private initPhoneSecurity() {
        // Handled via listeners and updateAccountView
    }

    private initWhatsAppLinking() {
        const modalStatusText = document.getElementById('modal-wa-status');
        const modalQrImage = document.getElementById('modal-wa-qr-image') as HTMLImageElement;
        const modalLoader = document.getElementById('modal-wa-loader');
        const modalQrOverlay = document.getElementById('wa-qr-overlay');
        const modalQrError = document.getElementById('wa-qr-error');
        const modalQrErrorText = document.getElementById('wa-qr-error-text');

        const checkAndVerifyPhone = async (waNumber: string) => {
            (window as any).api.logToMain(`[UI] WhatsApp READY. Received Number: ${waNumber}. Waiting 200ms for data sync...`);
            await new Promise(resolve => setTimeout(resolve, 200));
            
            try {
                const user = await (window as any).api.getCurrentUser();
                (window as any).api.logToMain(`[UI] Verification Cross-Check - Pending: "${user?.pendingPhone}", Received WA: "${waNumber}"`);
                
                if (user?.pendingPhone) {
                    (window as any).api.logToMain(`[UI] Triggering cross-check with verifyPhoneByWhatsAppMatch...`);
                    const res = await (window as any).api.verifyPhoneByWhatsAppMatch(waNumber);
                    
                    if (res.success) {
                        (window as any).api.logToMain(`[UI] Verification SUCCESS: ${res.message}`);
                        this.showToast("Phone Verified! 🚀", "success");
                        this.hidePhoneQrModal();
                        this.updateAccountView();
                    } else {
                        (window as any).api.logToMain(`[UI] Verification FAILED: ${res.message}`);
                        // Reveal inline error instead of a toast
                        if (modalQrOverlay) modalQrOverlay.classList.add('hidden');
                        if (modalQrError && modalQrErrorText) {
                            modalQrErrorText.textContent = "Number Mismatch! Please scan with the WhatsApp account matching your entered phone number.";
                            modalQrError.classList.remove('hidden');
                        }
                    }
                } else if (user?.isPhoneVerified) {
                    (window as any).api.logToMain(`[UI] Phone is already verified, closing modal.`);
                    this.hidePhoneQrModal();
                } else {
                    (window as any).api.logToMain(`[UI] ERROR: WhatsApp connected but NO PENDING PHONE found in session. user = ${JSON.stringify(user)}`);
                }
            } catch (err: any) {
                (window as any).api.logToMain(`[UI] Critical error during phone verification check: ${err.message || err}`);
            }
        };

        const updateUI = (status: { ready: boolean, qr: string | null, initializing?: boolean, authenticated?: boolean, waNumber?: string }) => {
            const commonStatus = status.ready ? "CONNECTED" : (status.authenticated ? "VERIFYING IDENTITY" : (status.qr ? "READY TO SCAN" : "INITIALIZING..."));
            console.log(`[UI] WA Status Update: ${commonStatus}`, status);
            
            // Clear error on any state change that means we're trying anew
            if (!status.ready && !status.authenticated) {
                modalQrError?.classList.add('hidden');
            }

            if (status.authenticated) {
                // QR is scanned and verified by WA backend, display the blurring overlay
                modalQrOverlay?.classList.remove('hidden');
                if (modalStatusText) modalStatusText.textContent = "VERIFYING IDENTITY";
            } else if (status.ready) {
                // Keep the overlay active and trigger the local checking
                if (status.waNumber) checkAndVerifyPhone(status.waNumber);
            } else if (status.initializing || !status.qr) {
                modalLoader?.classList.remove('hidden');
                modalQrImage?.classList.add('hidden');
                modalQrOverlay?.classList.add('hidden');
                if (modalStatusText) modalStatusText.textContent = "INITIALIZING...";
            } else if (status.qr) {
                if (modalQrImage) modalQrImage.src = status.qr;
                modalLoader?.classList.add('hidden');
                modalQrImage?.classList.remove('hidden');
                modalQrOverlay?.classList.add('hidden');
                if (modalStatusText) modalStatusText.textContent = "SCAN QR CODE";
            }
        };

        // Get current status immediately
        (window as any).api.getWaStatus().then(updateUI);

        // Register one-time listeners for the modal session
        (window as any).api.onWaInitializing(() => updateUI({ ready: false, qr: null, initializing: true }));
        (window as any).api.onWaQrCode((qr: string) => updateUI({ ready: false, qr }));
        (window as any).api.onWaAuthenticated(() => {
            console.log(`[UI] IPC: wa-authenticated event received.`);
            updateUI({ ready: false, qr: null, authenticated: true });
        });
        (window as any).api.onWaReady(async (waNumber?: string) => {
            console.log(`[UI] IPC: wa-ready event received. Number: ${waNumber}`);
            updateUI({ ready: true, qr: null, waNumber });
        });

        (window as any).api.onWaAuthFailure((err: string) => {
            console.error(`[UI] WhatsApp Auth Failure: ${err}`);
            if (modalStatusText) modalStatusText.textContent = "AUTH FAILURE";
            this.showToast(`WhatsApp Error: ${err}`, "error");
        });
    }

    private async updateAccountView() {
        const user = await (window as any).api.getCurrentUser();
        if (!user) return;

        // Profile Details
        const nameDisplay = document.getElementById('acc-display-username');
        const emailDisplay = document.getElementById('acc-primary-email');
        const initials = document.getElementById('acc-initials');
        
        if (nameDisplay) nameDisplay.textContent = user.username;
        if (emailDisplay) emailDisplay.textContent = user.email;
        if (initials) initials.textContent = user.username.charAt(0).toUpperCase();

        // Email Sync Boxes
        const pendingBadge = document.getElementById('pending-email-badge');
        const pendingAction = document.getElementById('pending-email-action-box');
        const pendingText = document.getElementById('pending-email-text');
        
        if (user.pendingEmail) {
            pendingBadge?.classList.remove('hidden');
            pendingAction?.classList.remove('hidden');
            if (pendingText) pendingText.textContent = `Confirming your new email: ${user.pendingEmail}`;
        } else {
            pendingBadge?.classList.add('hidden');
            pendingAction?.classList.add('hidden');
        }

        // Phone Security Updates
        const phoneDisplay = document.getElementById('current-phone-display');
        const phoneStatusText = document.getElementById('phone-status-text');
        const phoneBadge = document.getElementById('phone-status-badge');
        const phoneActionBox = document.getElementById('phone-verify-action-box');
        const requestForm = document.getElementById('form-request-phone-verification');
        const removeBtn = document.getElementById('btn-remove-phone');

        if (user.phone && user.isPhoneVerified) {
            // VERIFIED STATE
            if (phoneDisplay) phoneDisplay.textContent = user.phone;
            if (phoneStatusText) phoneStatusText.textContent = "VERIFIED NUMBER";
            if (phoneBadge) {
                phoneBadge.textContent = "SECURE";
                phoneBadge.className = "badge success";
                phoneBadge.style.background = "rgba(40, 167, 69, 0.1)";
                phoneBadge.style.color = "#28a745";
                phoneBadge.style.border = "1px solid rgba(40, 167, 69, 0.2)";
            }
            phoneActionBox?.classList.add('hidden');
            requestForm?.classList.add('hidden'); 
            removeBtn?.classList.remove('hidden');
        } else if (user.pendingPhone) {
            // PENDING STATE (Awaiting QR Scan)
            if (phoneDisplay) phoneDisplay.textContent = user.pendingPhone;
            if (phoneStatusText) phoneStatusText.textContent = "AWAITING VERIFICATION";
            if (phoneBadge) {
                phoneBadge.textContent = "PENDING";
                phoneBadge.style.color = "#007aff";
                phoneBadge.style.border = "1px solid rgba(0, 122, 255, 0.2)";
            }
            phoneActionBox?.classList.remove('hidden');
            
            const verifyNowBtn = document.getElementById('btn-verify-now');
            if (verifyNowBtn) {
                verifyNowBtn.onclick = () => this.showPhoneQrModal();
            }
            
            requestForm?.classList.add('hidden');
            removeBtn?.classList.remove('hidden');
        } else {
            if (phoneDisplay) phoneDisplay.textContent = "No Phone Set";
            if (phoneStatusText) phoneStatusText.textContent = "NOT VERIFIED";
            if (phoneBadge) {
                phoneBadge.textContent = "UNPROTECTED";
                phoneBadge.className = "badge danger";
                phoneBadge.style.background = "rgba(255, 59, 48, 0.1)";
                phoneBadge.style.color = "#ff3b30";
                phoneBadge.style.border = "1px solid rgba(255, 59, 48, 0.2)";
            }
            phoneActionBox?.classList.add('hidden');
            requestForm?.classList.remove('hidden');
            removeBtn?.classList.add('hidden');
        }

        if (removeBtn) {
            removeBtn.onclick = async () => {
                if (confirm("Are you sure you want to remove your phone number? This will disable dual-channel protection.")) {
                    this.setLoading(true, "Removing", "PHONE SECURITY");
                    try {
                        const res = await (window as any).api.removePhone();
                        if (res.success) {
                            // Also disconnect WhatsApp when phone is removed
                            await (window as any).api.logoutWhatsApp();
                            this.showToast("Phone number removed & WhatsApp disconnected", "success");
                            this.updateAccountView();
                        } else {
                            this.showToast(res.message, "error");
                        }
                    } finally {
                        this.setLoading(false);
                    }
                }
            };
        }
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
            await this.pushSettings();
            this.updateLockVaultVisibility();
            this.updatePinStatus();
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
}
