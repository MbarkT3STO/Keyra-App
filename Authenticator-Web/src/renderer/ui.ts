// import { syncVault } from './store';

export class UIManager {
    private currentTheme: 'light' | 'dark' = 'light';
    private currentTab: 'vault' | 'settings' = 'vault';
    private accounts: any[] = [];
    private timerInterval: any = null;
    private privacyMode: boolean = false;
    private screenGuardian: boolean = false;
    private wallpaperPreset: string = 'nebula';
    private isMovingAura: boolean = false;
    private auraX: number = 0;
    private auraY: number = 0;
    private searchQuery: string = '';
    private syncCount: number = 0;

    public setSyncing(isSyncing: boolean) {
        if (isSyncing) this.syncCount++;
        else this.syncCount = Math.max(0, this.syncCount - 1);

        const indicator = document.getElementById('cloud-sync-indicator');
        if (indicator) {
            indicator.classList.toggle('hidden', this.syncCount === 0);
        }
    }

    public userId: string;

    constructor(userId: string = 'default') {
        this.userId = userId;
        this.initTheme();
        this.initPrivacyMode();
        this.initScreenGuardian();
        this.initWallpaper();
        this.initSegmentedStates();
        this.setupEventListeners();
        this.updateLockVaultVisibility(); // Check PIN on startup
        this.startTimer();
        this.loadInitialData();
    }

    private async initFromCloud() {
        const user = await (window as any).api.getCurrentUser();
        if (user && user.settings) {
            this.applySettings(user.settings, false); // Don't push back to cloud during init
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
            oledMode: localStorage.getItem(this.getStorageKey('oled_mode')) === 'true',
            vaultPin: localStorage.getItem(this.getStorageKey('vault_pin'))
        };
    }

    public async pushSettings() {
        const settings = this.getSettingsObject();
        await (window as any).api.updateUserSettings(settings);
    }

    public applySettings(settings: any, saveLocal: boolean = true) {
        if (!settings) return;

        // Apply to local variables & DOM
        if (settings.theme) this.setTheme(settings.theme, true);
        if (settings.accentColor) this.setAccentColor(settings.accentColor, true);
        if (settings.wallpaperPreset) this.applyWallpaper(settings.wallpaperPreset);
        
        this.privacyMode = !!settings.privacyMode;
        const privacyToggle = document.getElementById('privacy-mode-toggle') as HTMLInputElement;
        if (privacyToggle) privacyToggle.checked = this.privacyMode;

        this.screenGuardian = !!settings.screenGuardian;
        const guardianToggle = document.getElementById('screen-guardian-toggle') as HTMLInputElement;
        if (guardianToggle) guardianToggle.checked = this.screenGuardian;

        if (settings.autolock !== undefined) {
            this.updateSegmentedUI('autolock-segmented', String(settings.autolock));
        }

        const oledToggle = document.getElementById('oled-mode-toggle') as HTMLInputElement;
        if (oledToggle && settings.oledMode !== undefined) {
            oledToggle.checked = settings.oledMode;
            document.body.classList.toggle('oled-optimized', settings.oledMode);
        }

        // Apply to localStorage if requested (e.g. on initial sync from cloud)
        if (saveLocal) {
            if (settings.theme) localStorage.setItem(this.getStorageKey('theme'), settings.theme);
            if (settings.accentColor) localStorage.setItem(this.getStorageKey('accent_color'), settings.accentColor);
            if (settings.wallpaperPreset) localStorage.setItem(this.getStorageKey('wallpaperPreset'), settings.wallpaperPreset);
            localStorage.setItem(this.getStorageKey('privacyMode'), String(this.privacyMode));
            localStorage.setItem(this.getStorageKey('screenGuardian'), String(this.screenGuardian));
            if (settings.autolock !== undefined) localStorage.setItem(this.getStorageKey('autolock'), String(settings.autolock));
            if (settings.oledMode !== undefined) localStorage.setItem(this.getStorageKey('oled_mode'), String(settings.oledMode));
            if (settings.vaultPin) localStorage.setItem(this.getStorageKey('vault_pin'), settings.vaultPin);
        }
        
        this.updateLockVaultVisibility();
        this.renderAccounts();
    }

    private initSegmentedStates() {
        // Theme
        const theme = localStorage.getItem(this.getStorageKey('theme')) || 'light';
        this.updateSegmentedUI('theme-segmented', theme);
        
        // Autolock
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

    private getStorageKey(key: string): string {
        return `${this.userId}_${key}`;
    }

    private initPrivacyMode() {
        this.privacyMode = localStorage.getItem(this.getStorageKey('privacyMode')) === 'true';
        const toggle = document.getElementById('privacy-mode-toggle') as HTMLInputElement;
        if (toggle) toggle.checked = this.privacyMode;
    }

    private initScreenGuardian() {
        this.screenGuardian = localStorage.getItem(this.getStorageKey('screenGuardian')) === 'true';
        const toggle = document.getElementById('screen-guardian-toggle') as HTMLInputElement;
        if (toggle) {
            toggle.checked = this.screenGuardian;
            // Content protection is an Electron-only feature
            // (window as any).api.setContentProtection(this.screenGuardian);
        }
    }

    private initWallpaper() {
        this.wallpaperPreset = localStorage.getItem(this.getStorageKey('wallpaperPreset')) || 'nebula';
        this.applyWallpaper(this.wallpaperPreset);
        
        // Setup mouse-follow
        document.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    }

    private applyWallpaper(preset: string) {
        this.wallpaperPreset = preset;
        localStorage.setItem(this.getStorageKey('wallpaperPreset'), preset);
        
        document.querySelectorAll('.wallpaper-card').forEach(card => {
            card.classList.toggle('active', card.getAttribute('data-preset') === preset);
        });

        const root = document.documentElement;
        if (preset === 'nebula') {
            root.style.setProperty('--aura-1', 'hsla(258, 100%, 68%, 0.35)');
            root.style.setProperty('--aura-2', 'hsla(330, 100%, 75%, 0.25)');
            root.style.setProperty('--aura-3', 'hsla(200, 100%, 75%, 0.25)');
        } else if (preset === 'solar') {
            root.style.setProperty('--aura-1', 'var(--solar-1)');
            root.style.setProperty('--aura-2', 'var(--solar-2)');
            root.style.setProperty('--aura-3', 'var(--solar-3)');
        } else if (preset === 'emerald') {
            root.style.setProperty('--aura-1', 'var(--emerald-1)');
            root.style.setProperty('--aura-2', 'var(--emerald-2)');
            root.style.setProperty('--aura-3', 'var(--emerald-3)');
        } else if (preset === 'space') {
            root.style.setProperty('--aura-1', 'var(--space-1)');
            root.style.setProperty('--aura-2', 'var(--space-2)');
            root.style.setProperty('--aura-3', 'var(--space-3)');
        }
    }

    private handleMouseMove(e: MouseEvent) {
        this.auraX = (e.clientX / window.innerWidth - 0.5) * 40;
        this.auraY = (e.clientY / window.innerHeight - 0.5) * 40;
        
        if (!this.isMovingAura) {
            this.isMovingAura = true;
            requestAnimationFrame(() => this.updateAuraBlobs());
        }
    }

    private updateAuraBlobs() {
        const blobs = document.querySelectorAll('.aura-blob');
        blobs.forEach((blob, idx) => {
            const factor = (idx + 1) * 0.5;
            (blob as HTMLElement).style.transform = `translate(${this.auraX * factor}px, ${this.auraY * factor}px)`;
        });
        this.isMovingAura = false;
    }

    private updateLockVaultVisibility() {
        const lockBtn = document.getElementById('lock-vault-btn');
        if (!lockBtn) return;
        
        const hasPin = !!localStorage.getItem(`${this.userId}_vault_pin`);
        lockBtn.classList.toggle('hidden', !hasPin);
    }

    private initTheme() {
        const savedTheme = localStorage.getItem(this.getStorageKey('theme')) as 'light' | 'dark' || 'light';
        this.setTheme(savedTheme);
    }

    public setTheme(theme: 'light' | 'dark', silent: boolean = false) {
        this.currentTheme = theme;
        
        // Update body classes for new theme system
        const body = document.body;
        body.classList.remove('light-theme', 'dark-theme');
        body.classList.add(`${theme}-theme`);
        
        // Update legacy attribute for compatibility
        document.documentElement.setAttribute('data-theme', theme);
        
        // Save to storage
        localStorage.setItem(this.getStorageKey('theme'), theme);
        
        // Update segmented control
        const segments = document.querySelectorAll('#theme-segmented .segment');
        const indicator = document.querySelector('#theme-segmented .segment-indicator');
        
        segments.forEach(segment => {
            if (segment.getAttribute('data-val') === theme) {
                segment.classList.add('active');
            } else {
                segment.classList.remove('active');
            }
        });
        
        // Move indicator
        if (indicator) {
            const activeSegment = document.querySelector(`#theme-segmented .segment[data-val="${theme}"]`) as HTMLElement;
            if (activeSegment) {
                (indicator as HTMLElement).style.left = `${activeSegment.offsetLeft}px`;
                (indicator as HTMLElement).style.width = `${activeSegment.offsetWidth}px`;
            }
        }
        
        // Update legacy theme icons
        const themeIcon = document.getElementById('theme-icon-lucide');
        const themeText = document.getElementById('theme-text');
        
        if (themeIcon) {
            themeIcon.setAttribute('data-lucide', theme === 'dark' ? 'sun' : 'moon');
        }
        if (themeText) {
            themeText.textContent = theme === 'dark' ? 'Light Mode' : 'Dark Mode';
        }
        
        this.refreshLucide();
        if (!silent) this.pushSettings();
    }

    private refreshLucide(root?: HTMLElement) {
        if ((window as any).lucide) {
            (window as any).lucide.createIcons(root ? { root } : undefined);
        }
    }

    private setupEventListeners() {
        // Tab Navigation
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const target = e.currentTarget as HTMLElement;
                const tabName = target.getAttribute('data-tab') as 'vault' | 'settings';
                this.switchTab(tabName);
            });
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
        });

        // Dropdown Actions
        document.getElementById('lock-vault-btn')?.addEventListener('click', () => this.lockVault());
        document.getElementById('theme-toggle-btn')?.addEventListener('click', () => {
            const nextTheme = this.currentTheme === 'light' ? 'dark' : 'light';
            this.setTheme(nextTheme);
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
        document.getElementById('add-account-btn')?.addEventListener('click', () => this.showAddModal());
        document.getElementById('empty-add-btn')?.addEventListener('click', () => this.showAddModal());

        // Segmented Theme Toggle
        document.querySelectorAll('#theme-segmented .segment').forEach(seg => {
            seg.addEventListener('click', (e) => {
                const target = e.currentTarget as HTMLElement;
                const val = target.getAttribute('data-val') as 'light' | 'dark';
                this.setTheme(val);
                this.updateSegmentedUI('theme-segmented', val);
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
            this.renderAccounts(); // Re-render to apply/remove masking
            this.showToast(this.privacyMode ? "Privacy Mode Enabled" : "Privacy Mode Disabled", "info");
        });

        // Screen Guardian Toggle
        document.getElementById('screen-guardian-toggle')?.addEventListener('change', (e) => {
            const target = e.target as HTMLInputElement;
            this.screenGuardian = target.checked;
            localStorage.setItem(this.getStorageKey('screenGuardian'), String(this.screenGuardian));
            this.pushSettings();
            // (window as any).api.setContentprotection(this.screenGuardian);
            this.showToast(this.screenGuardian ? "Screen Guardian Active" : "Screen Guardian Disabled", "info");
        });

        // Wallpaper Presets
        document.querySelectorAll('.wallpaper-card').forEach(card => {
            card.addEventListener('click', (e) => {
                const target = e.currentTarget as HTMLElement;
                const preset = target.getAttribute('data-preset')!;
                this.applyWallpaper(preset);
                this.pushSettings();
                this.showToast(`Wallpaper Switched: ${preset.charAt(0).toUpperCase() + preset.slice(1)}`, "info");
            });
        });

        // -- Vault Maintenance --
        document.getElementById('btn-export-vault')?.addEventListener('click', async () => {
            const res = await (window as any).api.exportVault();
            if (res.success) {
                this.showToast("Vault backup exported successfully", "success");
            } else if (res.message) {
                this.showToast(res.message, "error");
            }
        });

        document.getElementById('btn-import-vault')?.addEventListener('click', async () => {
            const res = await (window as any).api.importVault();
            if (res.success && res.data) {
                // Show a modal to ask for the password of that backup
                this.showImportPasswordModal(res.data.salt, res.data.encryptedVaultData);
            } else if (res.message) {
                this.showToast(res.message, "error");
            }
        });

        // Search Input
        const searchInput = document.getElementById('vault-search') as HTMLInputElement;
        searchInput?.addEventListener('input', (e) => {
            const target = e.target as HTMLInputElement;
            this.searchQuery = target.value.toLowerCase().trim();
            this.renderAccounts();
        });

        // Close modal on overlay click
        const modalOverlay = document.getElementById('modal-overlay');
        modalOverlay?.addEventListener('click', (e) => {
            if (e.target === e.currentTarget) this.hideModal();
        });

        // Unlock Form
        document.getElementById('form-unlock')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleUnlock();
        });

        // Auto-unlock on PIN input
        const pinInput = document.getElementById('unlock-pin') as HTMLInputElement;
        pinInput?.addEventListener('input', (e) => {
            const value = (e.target as HTMLInputElement).value;
            
            // Only allow numeric digits
            const numericValue = value.replace(/[^0-9]/g, '');
            if (value !== numericValue) {
                (e.target as HTMLInputElement).value = numericValue;
                return;
            }
            
            if (numericValue.length === 4) {
                this.validateAndAutoUnlock(numericValue);
            }
        });

        // Add keyboard support for PIN input
        pinInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.clearPinInput();
            } else if (e.key === 'Enter') {
                e.preventDefault();
                this.handleUnlock();
            }
            // Prevent non-numeric input
            else if (e.key.length === 1 && !/[0-9]/.test(e.key)) {
                e.preventDefault();
            }
        });
        
        // Handle window resize for icon refreshing if layout shifts majorly
        window.addEventListener('resize', this.debounce(() => this.refreshLucide(), 250));

        // Initialize accent color from localStorage
        this.loadAccentColor();

        // Setup accent color selector
        this.setupAccentColorSelector();

        // Initialize activity tracking
        this.updateLastActivity('Vault opened');
        this.updateLastActivityDisplay();

        // Initialize theme with system detection
        this.initializeTheme();

        // Track tab switches
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const tabName = tab.getAttribute('data-tab');
                this.updateLastActivity(`Switched to ${tabName}`);
                
                // Update activity display when switching to settings
                if (tabName === 'settings') {
                    setTimeout(() => {
                        this.updateLastActivityDisplay();
                    }, 100); // Small delay to ensure DOM is ready
                }
            });
        });

        // Track lock/unlock actions
        const lockBtn = document.getElementById('lock-vault-btn');
        if (lockBtn) {
            lockBtn.addEventListener('click', () => {
                this.updateLastActivity('Vault locked');
            });
        }

        // Track add token action
        const addBtn = document.getElementById('add-account-btn');
        if (addBtn) {
            addBtn.addEventListener('click', () => {
                this.updateLastActivity('Added new token');
            });
        }

        // Track theme changes
        const themeSegmented = document.getElementById('theme-segmented');
        if (themeSegmented) {
            themeSegmented.addEventListener('click', () => {
                setTimeout(() => {
                    this.updateLastActivity('Changed theme');
                }, 100);
            });
        }

        // Track export/import actions
        const exportBtn = document.getElementById('btn-export-vault');
        const importBtn = document.getElementById('btn-import-vault');
        
        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                this.updateLastActivity('Exported vault');
            });
        }
        
        if (importBtn) {
            importBtn.addEventListener('click', () => {
                this.updateLastActivity('Imported vault');
            });
        }
    }

    private setupAccentColorSelector() {
        const accentOptions = document.querySelectorAll('.accent-color-option');
        
        accentOptions.forEach(option => {
            option.addEventListener('click', () => {
                const accentColor = option.getAttribute('data-accent');
                if (accentColor) {
                    this.setAccentColor(accentColor);
                    
                    // Update active state
                    accentOptions.forEach(opt => opt.classList.remove('active'));
                    option.classList.add('active');
                    
                    // Show feedback
                    this.showToast("Accent color updated", "success");
                }
            });
        });
    }

    private setAccentColor(accentColor: string, silent: boolean = false) {
        const root = document.documentElement;
        const accentHues: Record<string, number> = {
            'royal-purple': 258,
            'electric-blue': 200,
            'emerald-green': 145,
            'solar-orange': 15
        };

        const hue = accentHues[accentColor];
        if (hue) {
            // Update CSS custom properties
            root.style.setProperty('--dynamic-accent-hue', hue.toString());
            root.style.setProperty('--accent-primary', `hsl(${hue}, 100%, 68%)`);
            root.style.setProperty('--accent-secondary', `hsl(${hue + 20}, 100%, 75%)`);
            root.style.setProperty('--accent-hover', `hsl(${hue}, 100%, 62%)`);
            root.style.setProperty('--accent-soft', `hsla(${hue}, 100%, 68%, 0.12)`);
            
            // Update aura colors to match accent
            root.style.setProperty('--aura-1', `hsla(${hue}, 100%, 68%, 0.35)`);
            root.style.setProperty('--aura-2', `hsla(${hue + 30}, 100%, 75%, 0.25)`);
            root.style.setProperty('--aura-3', `hsla(${hue - 30}, 100%, 75%, 0.25)`);
            
            // Save to localStorage
            localStorage.setItem(this.getStorageKey('accent_color'), accentColor);
            if (!silent) this.pushSettings();
        }
    }

    private initializeTheme() {
        // Check for saved theme preference
        const savedTheme = localStorage.getItem(this.getStorageKey('theme')) as 'light' | 'dark' | null;
        
        if (savedTheme && (savedTheme === 'light' || savedTheme === 'dark')) {
            // Use saved theme
            this.setTheme(savedTheme);
        } else {
            // Detect system theme
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            const systemTheme = prefersDark ? 'dark' : 'light';
            this.setTheme(systemTheme);
            localStorage.setItem(this.getStorageKey('theme'), systemTheme);
        }

        // Listen for system theme changes
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
            // Only auto-switch if user hasn't manually set a preference
            if (!localStorage.getItem(this.getStorageKey('theme_manual_override'))) {
                const newTheme = e.matches ? 'dark' : 'light';
                this.setTheme(newTheme);
                localStorage.setItem(this.getStorageKey('theme'), newTheme);
            }
        });

        // Setup theme switcher
        this.setupThemeSwitcher();
    }

    private setupThemeSwitcher() {
        const segments = document.querySelectorAll('#theme-segmented .segment');
        const oledToggle = document.getElementById('oled-mode-toggle') as HTMLInputElement;
        const oledModeRow = document.getElementById('oled-mode-row');
        
        // Setup theme segments
        segments.forEach(segment => {
            segment.addEventListener('click', () => {
                const theme = segment.getAttribute('data-val');
                if (theme && (theme === 'light' || theme === 'dark')) {
                    this.setTheme(theme);
                    localStorage.setItem(this.getStorageKey('theme'), theme);
                    localStorage.setItem(this.getStorageKey('theme_manual_override'), 'true');
                    this.updateLastActivity(`Changed to ${theme} mode`);
                    this.showToast(`Switched to ${theme} mode`, 'success');
                }
            });
        });

        // Setup OLED toggle
        if (oledToggle && oledModeRow) {
            // Load saved OLED preference
            const savedOledMode = localStorage.getItem(this.getStorageKey('oled_mode')) === 'true';
            oledToggle.checked = savedOledMode;

            // Show/hide OLED option based on theme
            const updateOledVisibility = () => {
                const isDarkTheme = document.body.classList.contains('dark-theme');
                oledModeRow.style.display = isDarkTheme ? 'flex' : 'none';
            };

            // Initial visibility
            updateOledVisibility();

            // Handle OLED toggle changes
            oledToggle.addEventListener('change', () => {
                const isEnabled = oledToggle.checked;
                localStorage.setItem(this.getStorageKey('oled_mode'), isEnabled.toString());
                this.pushSettings();
                
                if (isEnabled) {
                    document.body.classList.add('oled-optimized');
                    this.showToast('OLED optimization enabled', 'success');
                } else {
                    document.body.classList.remove('oled-optimized');
                    this.showToast('OLED optimization disabled', 'info');
                }
                
                this.updateLastActivity(`${isEnabled ? 'Enabled' : 'Disabled'} OLED optimization`);
            });

            // Update visibility when theme changes
            const originalSetTheme = this.setTheme.bind(this);
            this.setTheme = (theme: 'light' | 'dark') => {
                originalSetTheme(theme);
                updateOledVisibility();
                
                // Auto-enable OLED in dark mode if previously enabled
                if (theme === 'dark' && savedOledMode) {
                    document.body.classList.add('oled-optimized');
                }
            };
        }
    }

    private loadAccentColor() {
        const savedAccent = localStorage.getItem(this.getStorageKey('accent_color')) || 'royal-purple';
        
        // Set the accent color
        this.setAccentColor(savedAccent);
        
        // Update active state in UI
        const accentOptions = document.querySelectorAll('.accent-color-option');
        accentOptions.forEach(option => {
            if (option.getAttribute('data-accent') === savedAccent) {
                option.classList.add('active');
            } else {
                option.classList.remove('active');
            }
        });
    }

    private debounce(func: Function, wait: number) {
        let timeout: any;
        return (...args: any[]) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }

    private async loadInitialData() {
        try {
            const user = await (window as any).api.getCurrentUser();
            
            // Apply cloud settings first if they exist
            if (user && user.settings) {
                this.applySettings(user.settings, true);
            }

            const userNameDisplay = document.getElementById('user-name-display');
            const userAvatar = document.getElementById('user-avatar');
            
            if (userNameDisplay && user) {
                userNameDisplay.textContent = user.username;
            }
            if (userAvatar && user) {
                userAvatar.textContent = user.username.charAt(0).toUpperCase();
            }

            await this.refreshAccounts();
        } catch (err) {
            console.error("Initial load failed", err);
        }
    }

    public async refreshAccounts() {
        this.accounts = await (window as any).api.getAccounts();
        this.renderAccounts();
    }

    private switchTab(tab: 'vault' | 'settings') {
        this.currentTab = tab;
        document.querySelectorAll('.nav-tab').forEach(t => {
            t.classList.toggle('active', t.getAttribute('data-tab') === tab);
        });
        const vaultView = document.getElementById('vault-view');
        const settingsView = document.getElementById('settings-view');
        vaultView?.classList.toggle('hidden', tab !== 'vault');
        settingsView?.classList.toggle('hidden', tab !== 'settings');
        
        if (tab === 'vault') this.refreshLucide(vaultView || undefined);
        else if (tab === 'settings') this.refreshLucide(settingsView || undefined);
    }

    private renderAccounts() {
        const grid = document.getElementById('accounts-grid');
        const emptyState = document.getElementById('empty-state');
        if (!grid || !emptyState) return;

        // Filter accounts based on search query
        const filtered = this.accounts.filter(acc => 
            acc.issuer.toLowerCase().includes(this.searchQuery) || 
            acc.account.toLowerCase().includes(this.searchQuery)
        );

        if (this.accounts.length === 0) {
            grid.classList.add('hidden');
            emptyState.classList.remove('hidden');
            this.refreshLucide(emptyState);
        } else {
            grid.classList.remove('hidden');
            emptyState.classList.add('hidden');
            grid.innerHTML = '';
            filtered.forEach((acc, index) => {
                grid.appendChild(this.createAccountCard(acc, index));
            });
            this.refreshLucide(grid);
        }
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
                <div style="flex: 1; min-width: 0;">
                    <div class="service-name">${account.issuer}</div>
                    <div class="account-identity">${account.account}</div>
                </div>
                <div class="card-actions" style="display: flex; gap: 4px;">
                     <button class="btn-icon danger delete-btn" title="Remove Token" style="width: 32px; height: 32px; padding: 0;">
                        <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
                    </button>
                </div>
            </div>
            
            <div class="otp-box">
                <div class="otp-code ${this.privacyMode ? 'privacy-hidden' : ''}" data-id="${account.id}" style="cursor: pointer;" title="Click to copy">
                    ${this.privacyMode ? '••••••' : '------'}
                </div>
                <div class="timer-container" style="position: absolute; right: 12px; width: 24px; height: 24px;">
                    <svg viewBox="0 0 60 60">
                        <circle cx="30" cy="30" r="26" fill="none" class="timer-bg" style="stroke: var(--border-color); stroke-width: 4;"></circle>
                        <circle class="timer-progress" cx="30" cy="30" r="26" fill="none" stroke-dasharray="163.36" stroke-dashoffset="0" style="stroke: var(--accent-primary); stroke-width: 6; stroke-linecap: round; transition: stroke-dashoffset 1s linear;"></circle>
                    </svg>
                </div>
            </div>

            <div style="display: flex; gap: 10px;">
                <button class="btn-primary copy-btn" style="flex: 1; height: 44px; font-size: 14px;">
                    <i data-lucide="copy" style="width: 16px; height: 16px;"></i>
                    <span class="btn-text">Secure Copy</span>
                </button>
                <button class="user-button edit-btn" title="Refine Metadata" style="width: 44px; height: 44px; justify-content: center; padding: 0;">
                    <i data-lucide="settings-2" style="width: 18px; height: 18px;"></i>
                </button>
            </div>
        `;

        const codeElement = card.querySelector('.otp-code') as HTMLElement;
        codeElement.addEventListener('click', async () => {
             const otp = await (window as any).api.generateTOTP(account.secret);
             this.copyOTPToClipboard(otp, codeElement);
        });

        const copyBtn = card.querySelector('.copy-btn') as HTMLElement;
        copyBtn.onclick = async () => {
            const otpCode = await (window as any).api.generateTOTP(account.secret);
            await navigator.clipboard.writeText(otpCode);
            this.showToast("OTP Copied to Clipboard", "success");
        };

        card.querySelector('.edit-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.showEditModal(account);
        });
        
        card.querySelector('.delete-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.showDeleteConfirm(account);
        });

        this.updateCardOTP(card, account.secret, 30); // Use a default for first render
        return card;
    }

    private async updateCardOTP(card: HTMLElement, secret: string, remainingSeconds: number) {
        const codeElement = card.querySelector('.otp-code');
        if (!codeElement) return;

        if (this.privacyMode) {
            if (codeElement.textContent !== '••••••') {
                codeElement.textContent = '••••••';
            }
        } else {
            const otp = await (window as any).api.generateTOTP(secret);
            const displayOtp = otp.substring(0, 3) + ' ' + otp.substring(3);
            if (codeElement.textContent !== displayOtp) {
                codeElement.textContent = displayOtp;
            }
        }

        // Update timer
        const dashOffset = 163.36 * (1 - remainingSeconds / 30);
        const progressCircle = card.querySelector('.timer-progress') as HTMLElement;
        if (progressCircle) {
            progressCircle.style.strokeDashoffset = dashOffset.toString();
            progressCircle.style.stroke = remainingSeconds <= 5 ? '#ff3b30' : 'var(--accent-primary)';
        }
    }

    private copyOTPToClipboard(otp: string, element: HTMLElement) {
        navigator.clipboard.writeText(otp).then(() => {
            // Show visual feedback
            this.showCopyFeedback(element);
            
            // Update activity
            this.updateLastActivity('OTP copied');
            
            // Show toast
            this.showToast('OTP code copied to clipboard', 'success');
        }).catch(() => {
            this.showToast('Failed to copy code', 'error');
        });
    }

    private showCopyFeedback(element: HTMLElement) {
        const originalText = element.textContent;
        const originalColor = element.style.color;
        
        // Change to "Copied!" with green color
        element.textContent = 'Copied!';
        element.style.color = '#28a745';
        element.style.transform = 'scale(1.1)';
        
        setTimeout(() => {
            element.textContent = originalText;
            element.style.color = originalColor;
            element.style.transform = 'scale(1)';
        }, 1000);
    }

    private updateLastActivity(action: string) {
        const now = new Date().toISOString();
        localStorage.setItem(this.getStorageKey('last_activity'), now);
        localStorage.setItem(this.getStorageKey('last_action'), action);
        
        // Update the display if settings are open
        this.updateLastActivityDisplay();
    }

    private updateLastActivityDisplay() {
        const lastActivityElement = document.getElementById('last-activity-display');
        const lastActionElement = document.getElementById('last-action-display');
        
        if (lastActivityElement) {
            const lastActivity = localStorage.getItem(this.getStorageKey('last_activity'));
            const lastAction = localStorage.getItem(this.getStorageKey('last_action')) || 'No activity';
            
            if (lastActivity) {
                const date = new Date(lastActivity);
                const now = new Date();
                const diffMs = now.getTime() - date.getTime();
                const diffMins = Math.floor(diffMs / 60000);
                
                let timeAgo;
                if (diffMins < 1) {
                    timeAgo = 'Just now';
                } else if (diffMins < 60) {
                    timeAgo = `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
                } else if (diffMins < 1440) {
                    const hours = Math.floor(diffMins / 60);
                    timeAgo = `${hours} hour${hours > 1 ? 's' : ''} ago`;
                } else {
                    const days = Math.floor(diffMins / 1440);
                    timeAgo = `${days} day${days > 1 ? 's' : ''} ago`;
                }
                
                lastActivityElement.textContent = timeAgo;
            }
            
            if (lastActionElement) {
                lastActionElement.textContent = lastAction;
            }
        }
    }

    private async startTimer() {
        if (this.timerInterval) clearInterval(this.timerInterval);
        this.timerInterval = setInterval(async () => {
            const remaining = await (window as any).api.getRemainingSeconds();
            const cards = document.querySelectorAll('.account-card');
            cards.forEach((card, i) => {
                if (this.accounts[i]) this.updateCardOTP(card as HTMLElement, this.accounts[i].secret, remaining);
            });
        }, 1000);
    }

    private getIcon(issuer: string): string {
        const icons: any = {
            'google': 'search', 'github': 'github', 'microsoft': 'cloud', 'apple': 'apple',
            'amazon': 'shopping-cart', 'facebook': 'facebook', 'twitter': 'twitter', 'discord': 'message-square',
            'binance': 'coins', 'coinbase': 'wallet', 'stripe': 'credit-card', 'paypal': 'dollar-sign',
            'base': 'shield'
        };
        return icons[issuer.toLowerCase()] || 'shield';
    }

    private showModal(content: string) {
        const overlay = document.getElementById('modal-overlay');
        if (!overlay) return;
        overlay.innerHTML = `<div class="modal animate-fade-in">${content}</div>`;
        overlay.classList.add('show');
        this.refreshLucide(overlay);
    }

    public hideModal() {
        const overlay = document.getElementById('modal-overlay');
        if (!overlay) return;
        overlay.classList.remove('show');
        setTimeout(() => overlay.innerHTML = '', 300);
    }

    private showAddModal() {
        const content = `
            <div style="padding: clamp(var(--space-md), 8vw, var(--space-xl));">
                <div style="display: flex; align-items: center; gap: var(--space-md); margin-bottom: var(--space-lg);">
                    <div class="account-icon" style="background: var(--accent-soft); border-color: var(--accent-primary); width: 64px; height: 64px;">
                        <i data-lucide="plus-circle" style="color: var(--accent-primary); width: 32px; height: 32px;"></i>
                    </div>
                    <div>
                        <h2 style="font-weight: 900; font-size: clamp(24px, 4vw, 28px); color: var(--text-primary); letter-spacing: -1px;">Initialize Identity</h2>
                        <div class="modal-help-text" style="font-weight: 600; opacity: 0.8; text-transform: uppercase; font-size: 12px; letter-spacing: 0.5px;">Register new secure service token</div>
                    </div>
                </div>
                
                <div class="form-group">
                    <label class="form-label">Service Provider</label>
                    <input type="text" id="new-issuer" class="form-input" placeholder="e.g. Identity Node">
                </div>
                <div class="form-group">
                    <label class="form-label">Vault Label</label>
                    <input type="text" id="new-account" class="form-input" placeholder="User Reference">
                </div>
                <div class="form-group">
                    <label class="form-label">Base32 Secret</label>
                    <input type="text" id="new-secret" class="form-input" placeholder="Secure Token Payload">
                    <div class="modal-help-text">Input derived from manual entry or registry backup</div>
                </div>
                
                <div style="display: flex; gap: var(--space-md); margin-top: var(--space-xl);">
                    <button class="btn-primary" id="save-new-account" style="flex: 2; height: var(--btn-h-lg); font-size: 17px;">Verify & Secure</button>
                    <button class="user-button" id="cancel-add-btn" style="flex: 1; justify-content: center; height: var(--btn-h-lg); font-weight: 800;">Discard</button>
                </div>
            </div>
        `;
        this.showModal(content);
        document.getElementById('save-new-account')?.addEventListener('click', async () => {
            const issuer = (document.getElementById('new-issuer') as HTMLInputElement).value;
            const account = (document.getElementById('new-account') as HTMLInputElement).value;
            const secret = (document.getElementById('new-secret') as HTMLInputElement).value;
            if (!issuer || !secret) {
                this.showToast("Verification data missing", "error");
                return;
            }
            await (window as any).api.saveAccount({ id: Date.now().toString(), issuer, account, secret });
            await this.refreshAccounts();
            this.hideModal();
            this.showToast("Identity successfully verified", "success");
        });
        document.getElementById('cancel-add-btn')?.addEventListener('click', () => this.hideModal());
    }

    private showEditModal(account: any) {
        const content = `
            <div style="padding: clamp(var(--space-md), 8vw, var(--space-xl));">
                <div style="display: flex; align-items: center; gap: var(--space-md); margin-bottom: var(--space-lg);">
                    <div class="account-icon" style="background: var(--accent-soft); border-color: var(--accent-primary); width: 64px; height: 64px;">
                        <i data-lucide="edit-3" style="color: var(--accent-primary); width: 32px; height: 32px;"></i>
                    </div>
                    <div>
                        <h2 style="font-weight: 900; font-size: clamp(24px, 4vw, 28px); color: var(--text-primary); letter-spacing: -1px;">Refine Metadata</h2>
                        <div class="modal-help-text" style="font-weight: 600; opacity: 0.8; text-transform: uppercase; font-size: 12px; letter-spacing: 0.5px;">Adjust identity for ${account.issuer}</div>
                    </div>
                </div>
                
                <div class="form-group">
                    <label class="form-label">Provider Label</label>
                    <input type="text" id="edit-issuer" class="form-input" value="${account.issuer}">
                </div>
                <div class="form-group">
                    <label class="form-label">Identity Reference</label>
                    <input type="text" id="edit-account" class="form-input" value="${account.account}">
                </div>
                
                <div style="display: flex; gap: var(--space-md); margin-top: var(--space-xl);">
                    <button class="btn-primary" id="update-account" style="flex: 2; height: var(--btn-h-lg); font-size: 17px;">Commit Changes</button>
                    <button class="user-button" id="cancel-edit-btn" style="flex: 1; justify-content: center; height: var(--btn-h-lg); font-weight: 800;">Discard</button>
                </div>
            </div>
        `;
        this.showModal(content);
        document.getElementById('update-account')?.addEventListener('click', async () => {
            const issuer = (document.getElementById('edit-issuer') as HTMLInputElement).value;
            const accountName = (document.getElementById('edit-account') as HTMLInputElement).value;
            if (!issuer) return this.showToast("Identification required", "error");
            
            await (window as any).api.saveAccount({ ...account, issuer, account: accountName });
            await this.refreshAccounts();
            this.hideModal();
            this.showToast("Vault synchronized successfully", "success");
        });
        document.getElementById('cancel-edit-btn')?.addEventListener('click', () => this.hideModal());
    }

    public showToast(message: string, type: 'info' | 'success' | 'error' = 'info') {
        const container = document.getElementById('toast-container');
        if (!container) return;
        const toast = document.createElement('div');
        toast.className = 'animate-fade-in';
        toast.style.cssText = `
            background: var(--glass-bg);
            backdrop-filter: blur(25px);
            color: var(--text-primary);
            padding: 16px 28px;
            border-radius: var(--radius-md);
            box-shadow: var(--shadow-hard);
            border: 1.5px solid var(--glass-border);
            border-bottom: 4px solid ${type === 'error' ? '#ff3b30' : type === 'success' ? '#28a745' : 'var(--accent-primary)'};
            display: flex; align-items: center; gap: var(--space-sm);
            font-size: 16px; font-weight: 800;
            max-width: 92vw;
            margin: 0 auto;
            letter-spacing: -0.2px;
        `;
        
        const iconName = type === 'error' ? 'alert-circle' : type === 'success' ? 'check-circle' : 'info';
        toast.innerHTML = `<i data-lucide="${iconName}" style="width: 20px; height: 20px; color: ${type === 'error' ? '#ff3b30' : type === 'success' ? '#28a745' : 'var(--accent-primary)'}; flex-shrink:0;"></i> <span>${message}</span>`;
        
        container.appendChild(toast);
        this.refreshLucide(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(24px) scale(0.95)';
            setTimeout(() => toast.remove(), 400);
        }, 3500);
    }

    public lockVault() {
        const vessel = document.getElementById('lock-vessel');
        if (!vessel) return;
        vessel.classList.add('show');
        this.refreshLucide(vessel);
        const pinIn = document.getElementById('unlock-pin') as HTMLInputElement;
        if (pinIn) { pinIn.value = ''; pinIn.focus(); }
    }

    private handleUnlock() {
        const pinIn = document.getElementById('unlock-pin') as HTMLInputElement;
        if (!pinIn) return;
        
        this.validateAndAutoUnlock(pinIn.value);
    }

    private validateAndAutoUnlock(pinValue: string) {
        const pinIn = document.getElementById('unlock-pin') as HTMLInputElement;
        const saved = localStorage.getItem(this.getStorageKey('vault_pin'));
        const progressDots = document.querySelectorAll('.pin-dot');
        
        // Update progress dots based on input length
        progressDots.forEach((dot, index) => {
            dot.classList.remove('filled', 'error', 'success');
            if (index < pinValue.length) {
                dot.classList.add('filled');
            }
        });
        
        // Add visual feedback for validation
        if (pinValue.length === 4) {
            pinIn.style.borderColor = 'var(--accent-primary)';
            pinIn.style.boxShadow = '0 0 0 3px rgba(199, 125, 255, 0.1)';
            
            if (pinValue === saved) {
                // Success feedback
                pinIn.style.borderColor = '#28a745';
                pinIn.style.boxShadow = '0 0 0 3px rgba(40, 167, 69, 0.2)';
                
                // Animate progress dots to success state
                progressDots.forEach((dot, index) => {
                    setTimeout(() => {
                        dot.classList.remove('filled');
                        dot.classList.add('success');
                    }, index * 100);
                });
                
                // Auto-unlock after brief delay for visual feedback
                setTimeout(() => {
                    document.getElementById('lock-vessel')?.classList.remove('show');
                    pinIn.style.borderColor = '';
                    pinIn.style.boxShadow = '';
                    pinIn.value = '';
                    // Reset progress dots
                    progressDots.forEach(dot => {
                        dot.classList.remove('filled', 'error', 'success');
                    });
                }, 600);
                
                this.showToast("Vault unlocked successfully", "success");
            } else {
                // Error feedback
                pinIn.style.borderColor = '#ff3b30';
                pinIn.style.boxShadow = '0 0 0 3px rgba(255, 59, 48, 0.2)';
                
                // Animate progress dots to error state
                progressDots.forEach(dot => {
                    dot.classList.remove('filled');
                    dot.classList.add('error');
                });
                
                setTimeout(() => {
                    pinIn.style.borderColor = '';
                    pinIn.style.boxShadow = '';
                    pinIn.value = '';
                    pinIn.focus();
                    // Reset progress dots
                    progressDots.forEach(dot => {
                        dot.classList.remove('filled', 'error', 'success');
                    });
                }, 1000);
                
                this.showToast("Invalid PIN", "error");
            }
        }
    }

    private clearPinInput() {
        const pinIn = document.getElementById('unlock-pin') as HTMLInputElement;
        const progressDots = document.querySelectorAll('.pin-dot');
        
        if (pinIn) {
            pinIn.value = '';
            pinIn.style.borderColor = '';
            pinIn.style.boxShadow = '';
            pinIn.focus();
        }
        
        // Reset progress dots
        progressDots.forEach(dot => {
            dot.classList.remove('filled', 'error', 'success');
        });
    }

    private showPinSetup() {
        const content = `
            <div style="padding: clamp(24px, 5vw, 40px);">
                <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 24px;">
                    <div class="account-icon" style="background: var(--accent-soft); border-color: var(--accent-primary);">
                        <i data-lucide="key-round" style="color: var(--accent-primary);"></i>
                    </div>
                    <div>
                        <h2 style="font-weight: 850; font-size: 24px; color: var(--text-primary);">Vault Security</h2>
                        <div class="modal-help-text">Set a 4-digit master access PIN</div>
                    </div>
                </div>
                
                <div class="form-group">
                    <label class="form-label">Access PIN</label>
                    <input type="password" id="new-pin" maxlength="4" class="form-input" style="text-align: center; font-size: 32px; letter-spacing: 16px; height: 80px;" placeholder="••••">
                    <div class="modal-help-text">Must be exactly 4 numeric digits</div>
                </div>
                
                <div style="display: flex; gap: 16px; margin-top: 40px;">
                    <button class="btn-primary" id="save-pin" style="flex: 2; height: var(--btn-h-lg);">Lock Vault</button>
                    <button class="user-button" id="cancel-pin-btn" style="flex: 1; justify-content: center; height: var(--btn-h-lg);">Discard</button>
                </div>
            </div>
        `;
        this.showModal(content);
        document.getElementById('save-pin')?.addEventListener('click', () => {
            const pin = (document.getElementById('new-pin') as HTMLInputElement).value;
            if (pin.length === 4) {
                localStorage.setItem(this.getStorageKey('vault_pin'), pin);
                this.pushSettings();
                this.updateLockVaultVisibility(); // Update visibility immediately
                this.showToast("PIN established successfully", "success");
                this.hideModal();
            } else {
                this.showToast("PIN must be 4 digits", "error");
            }
        });
        document.getElementById('cancel-pin-btn')?.addEventListener('click', () => this.hideModal());
    }

    private showDeleteConfirm(account: any) {
        const content = `
            <div style="padding: clamp(32px, 8vw, 48px); text-align: center;">
                <div style="color: #ff3b30; margin-bottom: 24px;">
                    <i data-lucide="alert-triangle" style="width: 64px; height: 64px;"></i>
                </div>
                <h2 style="font-weight: 850; font-size: 24px; margin-bottom: 12px; color: var(--text-primary);">Destroy Token?</h2>
                <div class="modal-help-text" style="font-size: 16px; margin-bottom: 40px;">
                    Permanently remove identity for <strong>${account.issuer}</strong>? This action is irreversible.
                </div>
                
                <div style="display: flex; gap: 16px;">
                    <button class="btn-primary" id="confirm-delete" style="flex: 1; height: var(--btn-h-lg); background: #ff3b30; box-shadow: 0 8px 24px rgba(255, 59, 48, 0.2);">Confirm Erase</button>
                    <button class="user-button" id="cancel-delete-btn" style="flex: 1; justify-content: center; height: var(--btn-h-lg);">Discard</button>
                </div>
            </div>
        `;
        this.showModal(content);
        document.getElementById('confirm-delete')?.addEventListener('click', async () => {
            await (window as any).api.deleteAccount(account.id);
            await this.refreshAccounts();
            this.hideModal();
            this.showToast("Identity destroyed", "info");
        });
        document.getElementById('cancel-delete-btn')?.addEventListener('click', () => this.hideModal());
    }

    private showImportPasswordModal(salt: string, encryptedVaultData: string) {
        const content = `
            <div style="padding: clamp(var(--space-md), 8vw, var(--space-xl));">
                <div style="display: flex; align-items: center; gap: var(--space-md); margin-bottom: var(--space-lg);">
                    <div class="account-icon" style="background: var(--accent-soft); border-color: var(--accent-primary); width: 64px; height: 64px;">
                        <i data-lucide="unlock" style="color: var(--accent-primary); width: 32px; height: 32px;"></i>
                    </div>
                    <div>
                        <h2 style="font-weight: 900; font-size: 24px; color: var(--text-primary);">Restore Vault</h2>
                        <div class="modal-help-text" style="text-transform: uppercase; font-size: 11px; font-weight: 800; letter-spacing: 0.5px;">Verification required for decryption</div>
                    </div>
                </div>
                
                <div class="form-group">
                    <label class="form-label">Backup Password</label>
                    <input type="password" id="import-pass" class="form-input" placeholder="Enter the password for this backup">
                    <div class="modal-help-text">This is usually the master password used when the backup was created.</div>
                </div>
                
                <div style="display: flex; gap: var(--space-md); margin-top: var(--space-xl);">
                    <button class="btn-primary" id="confirm-import" style="flex: 2; height: var(--btn-h-lg);">Verify & Restore</button>
                    <button class="user-button" id="cancel-import" style="flex: 1; justify-content: center; height: var(--btn-h-lg); font-weight: 800;">Cancel</button>
                </div>
            </div>
        `;
        this.showModal(content);
        
        document.getElementById('cancel-import')?.addEventListener('click', () => this.hideModal());
        document.getElementById('confirm-import')?.addEventListener('click', async () => {
            const pass = (document.getElementById('import-pass') as HTMLInputElement).value;
            if (!pass) {
                this.showToast("Password required", "error");
                return;
            }

            const res = await (window as any).api.performVaultImport(salt, encryptedVaultData, pass);
            if (res.success) {
                this.hideModal();
                this.showToast("Vault successfully restored!", "success");
                await this.refreshAccounts();
            } else {
                this.showToast(res.message, "error");
            }
        });
    }
}
