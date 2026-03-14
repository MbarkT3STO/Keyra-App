// import { syncVault } from './store';

export class UIManager {
    private currentTheme: 'light' | 'dark' = 'light';
    private currentTab: 'vault' | 'settings' | 'account' = 'vault';
    private accounts: any[] = [];
    private timerInterval: any = null;
    private privacyMode: boolean = false;
    private screenGuardian: boolean = false;
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
            Settings: {
                theme: this.currentTheme,
                accentColor: localStorage.getItem(this.getStorageKey('accent_color')) || 'royal-purple',
                privacyMode: this.privacyMode,
                screenGuardian: this.screenGuardian,
                autolock: localStorage.getItem(this.getStorageKey('autolock')) || '0',
                vaultPin: localStorage.getItem(this.getStorageKey('vault_pin'))
            },
            "Web Settings": {
                theme: this.currentTheme,
                accentColor: localStorage.getItem(this.getStorageKey('accent_color')) || 'royal-purple',
                privacyMode: this.privacyMode,
                screenGuardian: this.screenGuardian,
                autolock: localStorage.getItem(this.getStorageKey('autolock')) || '0'
            }
        };
    }

    public async pushSettings() {
        try {
            this.setSyncing(true);
            const settings = this.getSettingsObject();
            console.log('Pushing settings to cloud:', settings);
            await (window as any).api.updateUserSettings(settings);
            console.log('Settings pushed successfully');
        } catch (error) {
            console.error('Failed to push settings:', error);
            throw error;
        } finally {
            this.setSyncing(false);
        }
    }

    public async pushWebSettings() {
        try {
            this.setSyncing(true);
            const webSettings = this.getWebSettingsObject();
            const settingsPayload = {
                "Web Settings": webSettings
            };
            console.log('Pushing web settings to cloud:', settingsPayload);
            await (window as any).api.updateUserSettings(settingsPayload);
            console.log('Web settings pushed successfully');
        } catch (error) {
            console.error('Failed to push web settings:', error);
            throw error;
        } finally {
            this.setSyncing(false);
        }
    }

    private getWebSettingsObject(): any {
        return {
            theme: this.currentTheme,
            accentColor: localStorage.getItem(this.getStorageKey('accent_color')) || 'royal-purple',
            privacyMode: this.privacyMode,
            screenGuardian: this.screenGuardian,
            autolock: localStorage.getItem(this.getStorageKey('autolock')) || '0'
        };
    }

    public applySettings(settings: any, saveLocal: boolean = true) {
        if (!settings) return;

        console.log('Applying settings:', settings);

        // Handle new structure with separate "Settings" and "Web Settings"
        const settingsToApply = settings.Settings || settings;
        const webSettingsToApply = settings["Web Settings"] || settings;

        console.log('Settings to apply:', settingsToApply);
        console.log('Web settings to apply:', webSettingsToApply);

        // Apply general settings to local variables & DOM
        if (settingsToApply.theme) this.setTheme(settingsToApply.theme, true);
        if (settingsToApply.accentColor) this.setAccentColor(settingsToApply.accentColor, true);

        this.privacyMode = !!settingsToApply.privacyMode;
        this.screenGuardian = !!settingsToApply.screenGuardian;

        // Apply to localStorage if requested (e.g. on initial sync from cloud)
        if (saveLocal || settingsToApply.vaultPin !== undefined || settingsToApply.privacyMode !== undefined) {
            if (settingsToApply.theme) localStorage.setItem(this.getStorageKey('theme'), settingsToApply.theme);
            if (settingsToApply.accentColor) localStorage.setItem(this.getStorageKey('accent_color'), settingsToApply.accentColor);

            localStorage.setItem(this.getStorageKey('privacyMode'), String(this.privacyMode));
            localStorage.setItem(this.getStorageKey('screenGuardian'), String(this.screenGuardian));

            if (settingsToApply.autolock !== undefined) localStorage.setItem(this.getStorageKey('autolock'), String(settingsToApply.autolock));

            // Critical, Ensure the PIN is persisted to local storage
            if (settingsToApply.vaultPin) {
                localStorage.setItem(this.getStorageKey('vault_pin'), settingsToApply.vaultPin);
            }
        }

        this.updateLockVaultVisibility();
        this.renderAccounts();
        console.log('Settings applied successfully');
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
        }
    }


    private updateLockVaultVisibility() {
        const lockBtn = document.getElementById('lock-vault-btn');
        const setupBtn = document.getElementById('setup-pin-btn');
        const removeBtn = document.getElementById('remove-pin-btn');

        const hasPin = !!localStorage.getItem(`${this.userId}_vault_pin`);

        if (lockBtn) lockBtn.classList.toggle('hidden', !hasPin);
        if (setupBtn) setupBtn.style.display = hasPin ? 'none' : 'flex';
        if (removeBtn) removeBtn.style.display = hasPin ? 'flex' : 'none';
    }

    private initTheme() {
        const savedTheme = localStorage.getItem(this.getStorageKey('theme')) as 'light' | 'dark' || 'light';
        this.setTheme(savedTheme, true); // Silent init to avoid push-default overwrite
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
        if (!silent) this.pushWebSettings();
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
        document.getElementById('add-account-btn')?.addEventListener('click', () => {
            // Security: Prevent adding accounts if vault is locked
            if (document.body.classList.contains('vault-is-locked')) {
                this.showToast("Vault Locked - Enter PIN to Access", "error");
                return;
            }
            this.showAddModal();
        });
        document.getElementById('empty-add-btn')?.addEventListener('click', () => {
            // Security: Prevent adding accounts if vault is locked
            if (document.body.classList.contains('vault-is-locked')) {
                this.showToast("Vault Locked - Enter PIN to Access", "error");
                return;
            }
            this.showAddModal();
        });

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
                this.pushWebSettings();
                this.showToast(`Vault Auto-lock: ${val === '0' ? 'Off' : val + 'm'}`, "info");
            });
        });

        // Settings PIN
        document.getElementById('setup-pin-btn')?.addEventListener('click', () => this.showPinSetup());
        document.getElementById('remove-pin-btn')?.addEventListener('click', () => this.showPinRemoval());

        // Privacy Mode Toggle
        document.getElementById('privacy-mode-toggle')?.addEventListener('change', (e) => {
            const target = e.target as HTMLInputElement;
            this.privacyMode = target.checked;
            localStorage.setItem(this.getStorageKey('privacyMode'), String(this.privacyMode));
            this.pushWebSettings();
            this.renderAccounts(); // Re-render to apply/remove masking
            this.showToast(this.privacyMode ? "Privacy Mode Enabled" : "Privacy Mode Disabled", "info");
        });

        // Screen Guardian Toggle
        document.getElementById('screen-guardian-toggle')?.addEventListener('change', (e) => {
            const target = e.target as HTMLInputElement;
            this.screenGuardian = target.checked;
            localStorage.setItem(this.getStorageKey('screenGuardian'), String(this.screenGuardian));
            this.pushWebSettings();

            // Immediate feedback: if we just disabled it and it's blurred, hide it
            if (!this.screenGuardian) {
                document.getElementById('privacy-blur-overlay')?.classList.add('hidden');
            }

            this.showToast(this.screenGuardian ? "Privacy Shield Active" : "Privacy Shield Disabled", "info");
        });


        // -- Vault Maintenance --
        document.getElementById('btn-export-vault')?.addEventListener('click', async () => {
            // Security: Prevent export if vault is locked
            if (document.body.classList.contains('vault-is-locked')) {
                this.showToast("Vault Locked - Enter PIN to Access", "error");
                return;
            }
            const res = await (window as any).api.exportVault();
            if (res.success) {
                this.showToast("Vault backup exported successfully", "success");
            } else if (res.message) {
                this.showToast(res.message, "error");
            }
        });

        document.getElementById('btn-import-vault')?.addEventListener('click', async () => {
            // Security: Prevent import if vault is locked
            if (document.body.classList.contains('vault-is-locked')) {
                this.showToast("Vault Locked - Enter PIN to Access", "error");
                return;
            }
            const res = await (window as any).api.importVault();
            if (res.success && res.data) {
                // Show a modal to ask for the password of that backup
                this.showImportPasswordModal(res.data.salt, res.data.encryptedVaultData);
            } else if (res.message) {
                this.showToast(res.message, "error");
            }
        });

        // Manual Sync Action
        const manualSyncBtn = document.getElementById('btn-manual-sync');
        manualSyncBtn?.addEventListener('click', async () => {
            this.showToast("Initiating Cloud Sync...", "info");
            const icon = document.getElementById('sync-btn-icon');
            if (icon) icon.classList.add('sync-spin');

            try {
                // First push current settings and webSettings to cloud
                await this.pushSettings();
                await this.pushWebSettings();

                // Then trigger a full vault sync
                // Note: window.api.syncVault() or similar if available, 
                // but since we usually sync on change, let's just refresh data
                await this.loadInitialData();

                this.showToast("Cloud Synchronization Complete", "success");
                this.updateLastActivity('Manual Cloud Sync');
            } catch (err) {
                console.error("Manual sync failed", err);
                this.showToast("Synchronization failed", "error");
            } finally {
                if (icon) icon.classList.remove('sync-spin');
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
                // Don't return here, we want to update dots even if cleaned
            }

            // Call validation/update logic for EVERY change (it has its own 4-char guard for success/error)
            this.validateAndAutoUnlock(numericValue);
        });

        // Add keyboard support for PIN input
        pinInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.clearPinInput();
            } else if (e.key === 'Enter') {
                e.preventDefault();
                this.handleUnlock();
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

        // Setup Account specific listeners
        this.setupAccountEvents();

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

        // Initialize accent color from localStorage
        this.loadAccentColor();

        // Setup accent color selector
        this.setupAccentColorSelector();
    }

    private setupAccentColorSelector() {
        const toggle = document.getElementById('accent-color-toggle');
        const dropdown = document.getElementById('accent-dropdown');
        const currentAccent = document.getElementById('current-accent');
        const accentLabel = document.querySelector('.accent-label');

        if (!toggle || !dropdown) {
            console.error('Accent color selector elements not found!');
            return;
        }

        // Remove existing listeners to avoid duplicates
        if (this.handleToggleClick) {
            toggle.removeEventListener('click', this.handleToggleClick);
        }
        if (this.handleDocumentClick) {
            document.removeEventListener('click', this.handleDocumentClick);
        }

        // Bind methods to maintain context
        this.handleToggleClick = (e: Event) => {
            e.preventDefault();
            e.stopPropagation();

            const isOpen = dropdown.classList.contains('show');

            if (isOpen) {
                dropdown.classList.remove('show');
                toggle.classList.remove('active');
                toggle.parentElement?.classList.remove('open');
            } else {
                dropdown.classList.add('show');
                toggle.classList.add('active');
                toggle.parentElement?.classList.add('open');
            }
        };

        this.handleDocumentClick = (e: Event) => {
            if (!toggle.contains(e.target as Node) && !dropdown.contains(e.target as Node)) {
                dropdown.classList.remove('show');
                (toggle as HTMLElement).classList.remove('active');
                toggle.parentElement?.classList.remove('open');
            }
        };

        // Add event listeners
        toggle.addEventListener('click', this.handleToggleClick);
        document.addEventListener('click', this.handleDocumentClick);

        // Handle color selection
        document.querySelectorAll('.accent-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();

                const accent = item.getAttribute('data-accent');
                if (accent) {
                    this.setAccentColor(accent);

                    // Update UI
                    document.querySelectorAll('.accent-item').forEach(i => i.classList.remove('active'));
                    item.classList.add('active');

                    // Update current accent display
                    const color = (item as HTMLElement).style.background;
                    if (currentAccent) {
                        (currentAccent as HTMLElement).style.background = color;
                    }
                    if (accentLabel) {
                        accentLabel.textContent = this.getAccentDisplayName(accent);
                    }

                    // Close dropdown
                    dropdown.classList.remove('show');
                    toggle.classList.remove('active');
                    toggle.parentElement?.classList.remove('open');
                }
            });
        });

        // Initialize current accent display
        this.updateCurrentAccentDisplay();

        // Ensure Lucide icons are created for the chevron
        this.refreshLucide();
    }

    // Store methods as properties to maintain context
    private handleToggleClick: ((e: Event) => void) | null = null;
    private handleDocumentClick: ((e: Event) => void) | null = null;

    private getAccentDisplayName(accent: string): string {
        const names: Record<string, string> = {
            'royal-purple': 'Royal Purple',
            'electric-blue': 'Electric Blue',
            'emerald-green': 'Emerald Green',
            'solar-orange': 'Solar Orange',
            'rose-quartz': 'Rose Quartz',
            'peach-blossom': 'Peach Blossom',
            'lavender-dream': 'Lavender Dream',
            'bubblegum': 'Bubblegum',
            'sky-blue': 'Sky Blue',
            'coral-sunset': 'Coral Sunset',
            'lemon-zest': 'Lemon Zest',
            'ocean-teal': 'Ocean Teal',
            'amethyst-glow': 'Amethyst Glow',
            'sage-serene': 'Sage Serene',
            'golden-hour': 'Golden Hour',
            'orchid-mystic': 'Orchid Mystic',
            'mint-fresh': 'Mint Fresh',
            'turquoise-dream': 'Turquoise Dream'
        };
        return names[accent] || accent;
    }

    private updateCurrentAccentDisplay() {
        const currentAccent = document.getElementById('current-accent');
        const accentLabel = document.querySelector('.accent-label');
        const savedAccent = localStorage.getItem(this.getStorageKey('accent_color')) || 'royal-purple';

        // Find the active accent item
        const activeItem = document.querySelector(`.accent-item[data-accent="${savedAccent}"]`);
        if (activeItem) {
            const color = activeItem.getAttribute('style')?.match(/background:\s*(hsl\([^)]+\))/)?.[1];
            if (color && currentAccent) {
                currentAccent.style.background = color;
            }
            if (accentLabel) {
                accentLabel.textContent = this.getAccentDisplayName(savedAccent);
            }
        }
    }

    private setAccentColor(accentColor: string, silent: boolean = false) {
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
            // Update CSS custom properties
            root.style.setProperty('--dynamic-accent-hue', hue.toString());
            root.style.setProperty('--accent-primary', `hsl(${hue}, var(--s), 65%)`);
            root.style.setProperty('--accent-hover', `hsl(${hue}, var(--s), 75%)`);
            root.style.setProperty('--accent-soft', `hsla(${hue}, var(--s), 65%, 0.15)`);

            // Save to localStorage
            localStorage.setItem(this.getStorageKey('accent_color'), accentColor);


            if (!silent) this.pushWebSettings();
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
    }

    private loadAccentColor() {
        const savedAccent = localStorage.getItem(this.getStorageKey('accent_color')) || 'royal-purple';

        // Set the accent color
        this.setAccentColor(savedAccent, true); // Silent init to avoid push-default overwrite

        // Update active state in UI
        const accentItems = document.querySelectorAll('.accent-item');
        accentItems.forEach(item => {
            if (item.getAttribute('data-accent') === savedAccent) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });

        // Update current accent display
        this.updateCurrentAccentDisplay();
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

    private switchTab(tab: 'vault' | 'settings' | 'account') {
        this.currentTab = tab;
        document.querySelectorAll('.nav-tab').forEach(t => {
            t.classList.toggle('active', t.getAttribute('data-tab') === tab);
        });
        const vaultView = document.getElementById('vault-view');
        const settingsView = document.getElementById('settings-view');
        const accountView = document.getElementById('account-view');

        vaultView?.classList.toggle('hidden', tab !== 'vault');
        settingsView?.classList.toggle('hidden', tab !== 'settings');
        accountView?.classList.toggle('hidden', tab !== 'account');

        if (tab === 'vault') this.refreshLucide(vaultView || undefined);
        else if (tab === 'settings') this.refreshLucide(settingsView || undefined);
        else if (tab === 'account') {
            this.refreshLucide(accountView || undefined);
            this.loadAccountInfo();
        }
    }

    private renderAccounts() {
        const grid = document.getElementById('accounts-grid');
        const emptyState = document.getElementById('empty-state');
        const searchEmptyState = document.getElementById('search-empty-state');
        const searchTermSpan = document.getElementById('empty-search-term');
        
        if (!grid || !emptyState || !searchEmptyState) return;

        // Filter accounts based on search query
        const filtered = this.accounts.filter(acc =>
            acc.issuer.toLowerCase().includes(this.searchQuery) ||
            acc.account.toLowerCase().includes(this.searchQuery)
        );

        // State 1: Absolutely no accounts in the vault
        if (this.accounts.length === 0) {
            grid.classList.add('hidden');
            searchEmptyState.classList.add('hidden');
            emptyState.classList.remove('hidden');
            this.refreshLucide(emptyState);
        }
        // State 2: Accounts exist, but search filter produced zero results
        else if (filtered.length === 0) {
            grid.classList.add('hidden');
            emptyState.classList.add('hidden');
            searchEmptyState.classList.remove('hidden');
            if (searchTermSpan) searchTermSpan.textContent = this.searchQuery;
            this.refreshLucide(searchEmptyState);
        }
        // State 3: Accounts to show
        else {
            grid.classList.remove('hidden');
            emptyState.classList.add('hidden');
            searchEmptyState.classList.add('hidden');
            grid.innerHTML = '';
            filtered.forEach((acc, index) => {
                grid.appendChild(this.createAccountCard(acc, index));
            });
            this.refreshLucide(grid);
        }

        // Security: Clear OTP codes if vault is locked
        if (document.body.classList.contains('vault-is-locked')) {
            this.clearAllOTPCodes();
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
                        <circle cx="30" cy="30" r="26" fill="none" class="timer-bg" style="stroke: var(--bg-secondary); stroke-width: 4;"></circle>
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
            // Security: Prevent OTP access if vault is locked
            if (document.body.classList.contains('vault-is-locked')) {
                this.showToast("Vault Locked - Enter PIN to Access", "error");
                return;
            }
            const otp = await (window as any).api.generateTOTP(account.secret);
            this.copyOTPToClipboard(otp, codeElement);
        });

        const copyBtn = card.querySelector('.copy-btn') as HTMLElement;
        copyBtn.onclick = async () => {
            // Security: Prevent OTP access if vault is locked
            if (document.body.classList.contains('vault-is-locked')) {
                this.showToast("Vault Locked - Enter PIN to Access", "error");
                return;
            }
            const otpCode = await (window as any).api.generateTOTP(account.secret);
            await navigator.clipboard.writeText(otpCode);
            this.showToast("OTP Copied to Clipboard", "success");
        };

        card.querySelector('.edit-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            // Security: Prevent editing if vault is locked
            if (document.body.classList.contains('vault-is-locked')) {
                this.showToast("Vault Locked - Enter PIN to Access", "error");
                return;
            }
            this.showEditModal(account);
        });

        card.querySelector('.delete-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            // Security: Prevent deletion if vault is locked
            if (document.body.classList.contains('vault-is-locked')) {
                this.showToast("Vault Locked - Enter PIN to Access", "error");
                return;
            }
            this.showDeleteConfirm(account);
        });

        this.updateCardOTP(card, account.secret, 30); // Use a default for first render
        return card;
    }

    private async updateCardOTP(card: HTMLElement, secret: string, remainingSeconds: number) {
        const codeElement = card.querySelector('.otp-code');
        if (!codeElement) return;

        // Security: Don't generate or display OTP codes if vault is locked
        if (document.body.classList.contains('vault-is-locked')) {
            codeElement.textContent = '••••••';
            return;
        }

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
                <div class="account-icon nm-icon-large" style="width: 64px; height: 64px;">
                        <i data-lucide="plus-circle"></i>
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
                    <div class="account-icon nm-icon-large" style="width: 64px; height: 64px;">
                        <i data-lucide="edit-3"></i>
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
        toast.className = `neumorphic-toast toast-${type} animate-fade-in`;

        const iconName = type === 'error' ? 'alert-circle' : type === 'success' ? 'check-circle' : 'info';
        toast.innerHTML = `
            <i data-lucide="${iconName}" class="toast-icon"></i>
            <span class="toast-message">${message}</span>
        `;

        container.appendChild(toast);
        this.refreshLucide(toast);

        setTimeout(() => {
            toast.classList.add('hiding');
            setTimeout(() => toast.remove(), 400);
        }, 3500);
    }

    private clearAllOTPCodes() {
        // Security: Clear all OTP codes from DOM when vault is locked
        const otpElements = document.querySelectorAll('.otp-code');
        otpElements.forEach(element => {
            element.textContent = '••••••';
        });
    }

    public lockVault() {
        const vessel = document.getElementById('lock-vessel');
        if (!vessel) return;
        vessel.classList.add('show');
        document.body.classList.add('vault-is-locked'); // Optimize performance

        // Security: Clear all OTP codes immediately when vault is locked
        this.clearAllOTPCodes();

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
        const progressDots = document.querySelectorAll('.pin-vessel .pin-dot');

        // Update progress dots based on input length
        progressDots.forEach((dot, index) => {
            dot.classList.remove('filled', 'error', 'success');
            if (index < pinValue.length) {
                dot.classList.add('filled');
            }
        });

        if (pinValue.length === 4) {
            if (pinValue === saved) {
                // Success feedback
                progressDots.forEach((dot, index) => {
                    setTimeout(() => {
                        dot.classList.remove('filled');
                        dot.classList.add('success');
                    }, index * 80);
                });

                setTimeout(() => {
                    document.getElementById('lock-vessel')?.classList.remove('show');
                    document.body.classList.remove('vault-is-locked'); // Restore performance
                    pinIn.value = '';
                    progressDots.forEach(dot => dot.classList.remove('filled', 'error', 'success'));

                    // Security: Restore OTP codes after successful unlock
                    this.renderAccounts();
                }, 800);

                this.showToast("Identity Verified", "success");
            } else {
                // Error feedback
                const vessel = document.querySelector('.pin-vessel');
                vessel?.classList.add('animate-shake');
                progressDots.forEach(dot => {
                    dot.classList.remove('filled');
                    dot.classList.add('error');
                });

                setTimeout(() => {
                    vessel?.classList.remove('animate-shake');
                    pinIn.value = '';
                    pinIn.focus();
                    progressDots.forEach(dot => dot.classList.remove('filled', 'error', 'success'));
                }, 1000);

                this.showToast("Verification Failed", "error");
            }
        }
    }

    private async loadAccountInfo() {
        const user = await (window as any).api.getCurrentUser();
        if (!user) return;

        const nameDisplay = document.getElementById('acc-display-username');
        const emailDisplay = document.getElementById('acc-display-email');
        const pendingContainer = document.getElementById('pending-email-container');
        const pendingEmailDisplay = document.getElementById('acc-display-pending-email');
        const emailCard = document.getElementById('card-change-email');

        if (nameDisplay) nameDisplay.textContent = user.username;
        if (emailDisplay) emailDisplay.textContent = user.email;

        if (user.pendingEmail) {
            if (pendingContainer) pendingContainer.classList.remove('hidden');
            if (pendingEmailDisplay) pendingEmailDisplay.textContent = user.pendingEmail;
            if (emailCard) {
                emailCard.style.opacity = '0.5';
                emailCard.style.pointerEvents = 'none';
                (emailCard.querySelector('button[type="submit"]') as HTMLButtonElement).disabled = true;
            }
        } else {
            if (pendingContainer) pendingContainer.classList.add('hidden');
            if (emailCard) {
                emailCard.style.opacity = '1';
                emailCard.style.pointerEvents = 'auto';
                (emailCard.querySelector('button[type="submit"]') as HTMLButtonElement).disabled = false;
            }
        }
    }

    private setupAccountEvents() {
        document.getElementById('account-settings-btn')?.addEventListener('click', () => {
            this.switchTab('account');
        });

        document.getElementById('form-change-name')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const newName = (document.getElementById('change-name-input') as HTMLInputElement).value;
            const res = await (window as any).api.changeUsername(newName);
            if (res.success) {
                this.showToast(res.message, "success");
                (e.target as HTMLFormElement).reset();
                this.loadAccountInfo();
            } else {
                this.showToast(res.message, "error");
            }
        });

        document.getElementById('form-change-password')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const pass = (document.getElementById('change-pass-input') as HTMLInputElement).value;
            const confirm = (document.getElementById('change-pass-confirm') as HTMLInputElement).value;

            if (pass !== confirm) {
                this.showToast("Passwords do not match.", "error");
                return;
            }
            
            if (pass.length < 8) {
                this.showToast("Password must be at least 8 characters.", "error");
                return;
            }

            const res = await (window as any).api.changePassword(pass);
            if (res.success) {
                this.showToast(res.message, "success");
                (e.target as HTMLFormElement).reset();
            } else {
                this.showToast(res.message, "error");
            }
        });

        document.getElementById('form-change-email')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = (document.getElementById('change-email-input') as HTMLInputElement).value;
            const res = await (window as any).api.requestEmailChange(email);
            if (res.success) {
                this.showToast(res.message, "success");
                (e.target as HTMLFormElement).reset();
                this.loadAccountInfo();
                this.showEmailVerificationModal(email);
            } else {
                this.showToast(res.message, "error");
            }
        });

        document.getElementById('btn-verify-new-email')?.addEventListener('click', async () => {
            const user = await (window as any).api.getCurrentUser();
            if (user && user.pendingEmail) {
                this.showEmailVerificationModal(user.pendingEmail);
            }
        });

        document.getElementById('btn-remove-pending-email')?.addEventListener('click', async () => {
            if (confirm("Are you sure you want to cancel the pending email change?")) {
                const res = await (window as any).api.cancelEmailChange();
                if (res.success) {
                    this.showToast(res.message, "success");
                    this.loadAccountInfo();
                } else {
                    this.showToast(res.message, "error");
                }
            }
        });
    }

    private showEmailVerificationModal(email: string) {
        let resendTimer = 30;
        let timerInterval: any;

        const updateTimerText = () => {
            const btn = document.getElementById('btn-resend-verify-email');
            const timerSpan = document.getElementById('verify-email-resend-timer');
            if (timerSpan) timerSpan.textContent = resendTimer > 0 ? `(${resendTimer}s)` : '';
            if (btn) (btn as HTMLButtonElement).disabled = resendTimer > 0;
            if (btn) (btn as HTMLElement).style.opacity = resendTimer > 0 ? '0.5' : '1';
        };

        const content = `
            <div style="padding: clamp(32px, 8vw, 48px); text-align: center; position: relative; overflow: hidden;">
                <!-- Subtle background decoration -->
                <div style="position: absolute; top: -50px; right: -50px; width: 150px; height: 150px; background: var(--accent-soft); filter: blur(60px); opacity: 0.3; border-radius: 50%; pointer-events: none;"></div>
                
                <div class="nm-icon-large" style="margin: 0 auto 32px; width: 100px; height: 100px; display: flex; align-items: center; justify-content: center; border-radius: 30% 70% 70% 30% / 30% 30% 70% 70%; background: var(--bg-primary); box-shadow: var(--nm-raised);">
                    <i data-lucide="mail-check" style="width: 48px; height: 48px; color: var(--accent-primary);"></i>
                </div>
                
                <h2 style="font-weight: 900; font-size: 32px; color: var(--text-primary); margin-bottom: 12px; letter-spacing: -1.2px;">Verify Identity</h2>
                <p style="color: var(--text-secondary); margin-bottom: 40px; font-weight: 500; font-size: 16px; line-height: 1.5;">
                    Security protocol initiated. Enter the 6-digit synchronization code sent to <br>
                    <strong style="color: var(--accent-primary); font-weight: 700;">${email}</strong>
                </p>
                
                <div class="form-group" style="margin-bottom: 40px;">
                    <div style="position: relative;">
                        <input type="text" id="email-verify-code" class="form-input" placeholder="000000" maxlength="6" 
                               style="text-align: center; font-size: 36px; letter-spacing: 12px; font-family: 'JetBrains Mono'; height: 84px; border-radius: var(--radius-lg); box-shadow: var(--nm-pressed); border: none; width: 100%; color: var(--accent-primary); font-weight: 900;">
                        <div style="position: absolute; bottom: -20px; left: 0; right: 0; display: flex; justify-content: space-between; padding: 0 40px; pointer-events: none; opacity: 0.2;">
                            <span></span><span></span><span></span><span></span><span></span><span></span>
                        </div>
                    </div>
                </div>

                <div style="display: flex; gap: 20px; margin-top: 48px;">
                    <button class="btn-primary" id="btn-submit-email-verify" style="flex: 2; height: 64px; font-size: 18px; font-weight: 850; border-radius: var(--radius-xl); box-shadow: var(--nm-raised);">
                        Authorize Change
                    </button>
                    <button class="user-button" id="btn-cancel-email-verify" style="flex: 1; height: 64px; font-size: 15px; font-weight: 750; border-radius: var(--radius-xl); box-shadow: var(--nm-raised);">
                        Discard
                    </button>
                </div>

                <div style="margin-top: 32px; padding-top: 24px; border-top: 1px dashed var(--border-color);">
                    <button id="btn-resend-verify-email" style="background: none; border: none; font-weight: 800; color: var(--accent-primary); cursor: pointer; transition: all 0.3s ease; display: inline-flex; align-items: center; gap: 8px; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;" disabled>
                        <i data-lucide="refresh-cw" style="width: 14px; height: 14px;"></i>
                        <span>Resend Dispatch</span> 
                        <span id="verify-email-resend-timer" style="opacity: 0.7; font-variant-numeric: tabular-nums;">(30s)</span>
                    </button>
                </div>
            </div>
        `;

        this.showModal(content);
        this.refreshLucide();

        timerInterval = setInterval(() => {
            resendTimer--;
            updateTimerText();
            if (resendTimer <= 0) clearInterval(timerInterval);
        }, 1000);

        document.getElementById('btn-submit-email-verify')?.addEventListener('click', async () => {
            const code = (document.getElementById('email-verify-code') as HTMLInputElement).value;
            if (code.length !== 6) {
                this.showToast("Enter 6-digit code.", "error");
                return;
            }

            const res = await (window as any).api.confirmEmailChange(code);
            if (res.success) {
                this.showToast(res.message, "success");
                this.hideModal();
                this.loadAccountInfo();
                clearInterval(timerInterval);
            } else {
                this.showToast(res.message, "error");
            }
        });

        document.getElementById('btn-resend-verify-email')?.addEventListener('click', async () => {
            const res = await (window as any).api.resendEmailChangeCode();
            if (res.success) {
                this.showToast("New code sent.", "success");
                resendTimer = 30;
                updateTimerText();
                timerInterval = setInterval(() => {
                    resendTimer--;
                    updateTimerText();
                    if (resendTimer <= 0) clearInterval(timerInterval);
                }, 1000);
            } else {
                this.showToast(res.message, "error");
            }
        });

        document.getElementById('btn-cancel-email-verify')?.addEventListener('click', () => {
            this.hideModal();
            clearInterval(timerInterval);
        });
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
        this.currentPinStep = 1;
        this.tempPin = '';
        this.showPinSetupStep1();
    }

    private currentPinStep: number = 1;
    private tempPin: string = '';

    private showPinSetupStep1() {
        const content = `
            <div class="pin-steps-modal">
                <!-- Progress Steps -->
                <div class="pin-progress-container">
                    <div class="pin-step active" data-step="1">
                        <div class="pin-step-number">1</div>
                        <div class="pin-step-label">Create PIN</div>
                    </div>
                    <div class="pin-step-line"></div>
                    <div class="pin-step" data-step="2">
                        <div class="pin-step-number">2</div>
                        <div class="pin-step-label">Confirm PIN</div>
                    </div>
                </div>

                <!-- Step 1 Content -->
                <div class="pin-step-content">
                    <div class="pin-header">
                        <div class="pin-brand-icon">
                            <i data-lucide="shield-ellipsis"></i>
                        </div>
                        <h2 class="pin-title">Create Security PIN</h2>
                        <p class="pin-subtitle">Choose a 4-digit master code for vault access</p>
                    </div>

                    <div class="pin-input-container">
                        <div class="pin-input-vessel">
                            <input type="password" id="pin-step1" maxlength="4" class="pin-field" autocomplete="off" placeholder="••••">
                            <div class="pin-indicators">
                                <div class="pin-dot-setup" data-digit="1"></div>
                                <div class="pin-dot-setup" data-digit="2"></div>
                                <div class="pin-dot-setup" data-digit="3"></div>
                                <div class="pin-dot-setup" data-digit="4"></div>
                            </div>
                        </div>
                        <div class="pin-helper">Enter 4-digit security code</div>
                    </div>

                    <div class="pin-actions">
                        <button class="btn-primary pin-continue-btn" id="pin-step1-continue" disabled>
                            <i data-lucide="arrow-right"></i>
                            Continue
                        </button>
                        <button class="user-button pin-cancel-btn" id="pin-step1-cancel">
                            Cancel
                        </button>
                    </div>
                </div>
            </div>
        `;
        this.showModal(content);
        this.setupPinStep1Events();
    }

    private showPinSetupStep2() {
        const content = `
            <div class="pin-steps-modal">
                <!-- Progress Steps -->
                <div class="pin-progress-container">
                    <div class="pin-step completed" data-step="1">
                        <div class="pin-step-number"><i data-lucide="check"></i></div>
                        <div class="pin-step-label">Create PIN</div>
                    </div>
                    <div class="pin-step-line active"></div>
                    <div class="pin-step active" data-step="2">
                        <div class="pin-step-number">2</div>
                        <div class="pin-step-label">Confirm PIN</div>
                    </div>
                </div>

                <!-- Step 2 Content -->
                <div class="pin-step-content">
                    <div class="pin-header">
                        <div class="pin-brand-icon">
                            <i data-lucide="shield-check"></i>
                        </div>
                        <h2 class="pin-title">Confirm Security PIN</h2>
                        <p class="pin-subtitle">Re-enter your 4-digit master code to verify</p>
                    </div>

                    <div class="pin-input-container">
                        <div class="pin-input-vessel">
                            <input type="password" id="pin-step2" maxlength="4" class="pin-field" autocomplete="off" placeholder="••••">
                            <div class="pin-indicators">
                                <div class="pin-dot-setup" data-digit="1"></div>
                                <div class="pin-dot-setup" data-digit="2"></div>
                                <div class="pin-dot-setup" data-digit="3"></div>
                                <div class="pin-dot-setup" data-digit="4"></div>
                            </div>
                        </div>
                        <div class="pin-helper">Confirm your 4-digit security code</div>
                    </div>

                    <div class="pin-actions">
                        <button class="btn-primary pin-continue-btn" id="pin-step2-continue" disabled>
                            <i data-lucide="check"></i>
                            Activate PIN
                        </button>
                        <button class="user-button pin-back-btn" id="pin-step2-back">
                            <i data-lucide="arrow-left"></i>
                            Back
                        </button>
                    </div>
                </div>
            </div>
        `;
        this.showModal(content);
        this.setupPinStep2Events();
    }

    private setupPinStep1Events() {
        const pinField = document.getElementById('pin-step1') as HTMLInputElement;
        const continueBtn = document.getElementById('pin-step1-continue');
        const setupDots = document.querySelectorAll('.pin-dot-setup');

        pinField?.addEventListener('input', (e) => {
            const val = (e.target as HTMLInputElement).value;
            const numeric = val.replace(/[^0-9]/g, '');
            if (val !== numeric) (e.target as HTMLInputElement).value = numeric;

            setupDots.forEach((dot, idx) => {
                dot.classList.toggle('filled', idx < numeric.length);
            });

            if (continueBtn) {
                (continueBtn as HTMLButtonElement).disabled = numeric.length !== 4;
            }
        });

        continueBtn?.addEventListener('click', () => {
            if (pinField && pinField.value.length === 4) {
                this.tempPin = pinField.value;
                this.showPinSetupStep2();
            }
        });

        document.getElementById('pin-step1-cancel')?.addEventListener('click', () => this.hideModal());
    }

    private setupPinStep2Events() {
        const pinField = document.getElementById('pin-step2') as HTMLInputElement;
        const continueBtn = document.getElementById('pin-step2-continue');
        const setupDots = document.querySelectorAll('.pin-dot-setup');

        pinField?.addEventListener('input', (e) => {
            const val = (e.target as HTMLInputElement).value;
            const numeric = val.replace(/[^0-9]/g, '');
            if (val !== numeric) (e.target as HTMLInputElement).value = numeric;

            setupDots.forEach((dot, idx) => {
                dot.classList.toggle('filled', idx < numeric.length);
            });

            if (continueBtn) {
                (continueBtn as HTMLButtonElement).disabled = numeric.length !== 4;
            }
        });

        continueBtn?.addEventListener('click', () => {
            if (pinField && pinField.value.length === 4) {
                if (pinField.value === this.tempPin) {
                    // PIN confirmed - save it
                    localStorage.setItem(this.getStorageKey('vault_pin'), this.tempPin);
                    this.pushWebSettings();
                    this.updateLockVaultVisibility();
                    this.showToast("PIN security activated successfully", "success");
                    this.hideModal();
                } else {
                    // PIN mismatch - show error
                    this.showToast("PIN codes do not match. Please try again.", "error");
                    pinField.value = '';
                    setupDots.forEach(dot => dot.classList.remove('filled'));
                    if (continueBtn) (continueBtn as HTMLButtonElement).disabled = true;
                }
            }
        });

        document.getElementById('pin-step2-back')?.addEventListener('click', () => this.showPinSetupStep1());
    }

    private showPinRemoval() {
        const content = `
            <div class="pin-removal-modal">
                <div class="pin-header">
                    <div class="pin-brand-icon danger">
                        <i data-lucide="shield-off"></i>
                    </div>
                    <h2 class="pin-title">Remove Security PIN</h2>
                    <p class="pin-subtitle">This will disable PIN protection for your vault</p>
                </div>

                <div class="pin-warning-container">
                    <div class="pin-warning-icon">
                        <i data-lucide="alert-triangle"></i>
                    </div>
                    <div class="pin-warning-text">
                        <strong>Warning:</strong> Removing the PIN will make your vault less secure. Anyone with access to this device can open your vault.
                    </div>
                </div>

                <div class="pin-actions">
                    <button class="btn-primary danger" id="confirm-remove-pin">
                        <i data-lucide="trash-2"></i>
                        Remove PIN
                    </button>
                    <button class="user-button" id="cancel-remove-pin">
                        Cancel
                    </button>
                </div>
            </div>
        `;
        this.showModal(content);
        this.setupPinRemovalEvents();
    }

    private setupPinRemovalEvents() {
        document.getElementById('confirm-remove-pin')?.addEventListener('click', () => {
            localStorage.removeItem(this.getStorageKey('vault_pin'));
            this.pushSettings(); // Use pushSettings for vault security changes
            this.updateLockVaultVisibility();
            this.showToast("PIN security removed", "info");
            this.hideModal();
        });

        document.getElementById('cancel-remove-pin')?.addEventListener('click', () => this.hideModal());
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
                    <button class="btn-primary" id="confirm-delete" style="flex: 1; height: var(--btn-h-lg); background: var(--bg-primary); color: #ff3b30; box-shadow: var(--nm-raised);">Confirm Erase</button>
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
                    <div class="account-icon nm-icon-large" style="width: 64px; height: 64px;">
                        <i data-lucide="unlock"></i>
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
