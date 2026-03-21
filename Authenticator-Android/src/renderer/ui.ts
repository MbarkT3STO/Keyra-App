// import { syncVault } from './store';
import { rateLimiter } from '../core/rateLimiter';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { BiometricAuth, BiometryType } from '@aparajita/capacitor-biometric-auth';

export class UIManager {
    private currentTheme: 'light' | 'dark' = 'light';
    private currentTab: 'vault' | 'settings' | 'account' = 'vault';
    private accounts: any[] = [];
    private timerInterval: any = null;
    private privacyMode: boolean = false;
    private screenGuardian: boolean = false;
    private searchQuery: string = '';
    private syncCount: number = 0;
    private vaultViewStyle: 'unified' | 'compact' | 'secure' = 'compact';

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
                // Match CSS transition duration (assuming 400ms from components.css transition)
                setTimeout(() => overlay.classList.add('hidden'), 400); 
            }
        }
    }

    public userId: string;

    constructor(userId: string = 'default') {
        this.userId = userId;
        this.initTheme();
        this.initPrivacyMode();
        this.initScreenGuardian();
        this.initVaultViewStyle();
        this.initSegmentedStates();
        this.setupEventListeners();
        this.setupPullToRefresh();
        this.setupSearchFocus();
        this.setupBiometric();
        this.updateLockVaultVisibility(); // Check PIN on startup
        this.startTimer();
        this.loadInitialData();
        this.migratePinToEncrypted().catch(err => console.error("PIN migration error:", err)); // Migrate legacy plaintext PINs
    }

    /**
     * Migrate legacy plaintext PINs to encrypted format
     */
    private async migratePinToEncrypted() {
        const pin = localStorage.getItem(this.getStorageKey('vault_pin'));
        if (pin && pin.length === 4 && /^\d+$/.test(pin)) {
            try {
                const encrypted = (window as any).api.encryptPIN(pin);
                localStorage.setItem(this.getStorageKey('vault_pin'), encrypted);
                await this.pushWebSettings();
            } catch (err) {
                console.error("PIN migration failed:", err);
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
            this.applySettings(settings, false); // Don't push back to cloud during init
        }
    }

    private getSettingsObject(): any {
        const vPin = localStorage.getItem(this.getStorageKey('vault_pin'));
        const aLock = localStorage.getItem(this.getStorageKey('autolock')) || '0';
        
        const obj: any = {
            Settings: {
                theme: this.currentTheme,
                accentColor: localStorage.getItem(this.getStorageKey('accent_color')) || 'royal-purple',
                privacyMode: this.privacyMode,
                screenGuardian: this.screenGuardian,
                vaultViewStyle: this.vaultViewStyle,
                vaultPin: vPin
            },
            "Web Settings": {
                theme: this.currentTheme,
                accentColor: localStorage.getItem(this.getStorageKey('accent_color')) || 'royal-purple',
                privacyMode: this.privacyMode,
                screenGuardian: this.screenGuardian,
                vaultViewStyle: this.vaultViewStyle,
                autolock: aLock,
                vaultPin: vPin
            }
        };

        return obj;
    }

    public async pushSettings() {
        // Rate limiting check
        const rateLimitCheck = rateLimiter.isAllowed('sync', this.userId);
        if (!rateLimitCheck.allowed) {
            console.warn('Sync rate limited:', rateLimitCheck.message);
            this.showToast(rateLimitCheck.message || "Too many sync operations. Please wait.", "error");
            return;
        }

        try {
            this.setSyncing(true);
            rateLimiter.recordAttempt('sync', this.userId);
            
            const settings = this.getSettingsObject();
            const res = await (window as any).api.updateUserSettings(settings);
            if (res && res.success === false) {
                console.warn('Cloud sync reported failure:', res.message);
                this.showToast("Cloud sync failed: " + (res.message || "Unknown error"), "error");
            }
        } catch (error) {
            console.error('Failed to push settings:', error);
            this.showToast("Sync Error: Please check your connection", "error");
            throw error;
        } finally {
            this.setSyncing(false);
        }
    }

    public async pushWebSettings() {
        // Rate limiting check
        const rateLimitCheck = rateLimiter.isAllowed('sync', this.userId);
        if (!rateLimitCheck.allowed) {
            console.warn('Sync rate limited:', rateLimitCheck.message);
            return;
        }

        try {
            this.setSyncing(true);
            rateLimiter.recordAttempt('sync', this.userId);
            
            const webSettings = this.getWebSettingsObject();
            const res = await (window as any).api.updateUserSettings(webSettings);
            if (res && res.success === false) {
                 console.warn('Cloud web sync reported failure:', res.message);
                 // We don't always show toast here to avoid spamming if it's a background sync,
                 // but for manual actions it's handled in the caller.
            }
        } catch (error) {
            console.error('Failed to push web settings:', error);
            // Same here, avoiding spam but keeping log
            throw error;
        } finally {
            this.setSyncing(false);
        }
    }

    private getWebSettingsObject(): any {
        const vPin = localStorage.getItem(this.getStorageKey('vault_pin'));
        const aLock = localStorage.getItem(this.getStorageKey('autolock'));
        
        const obj: any = {
            "Web Settings": {
                theme: this.currentTheme,
                accentColor: localStorage.getItem(this.getStorageKey('accent_color')) || 'royal-purple',
                privacyMode: this.privacyMode,
                screenGuardian: this.screenGuardian,
                vaultViewStyle: this.vaultViewStyle,
                autolock: aLock || '0',
                vaultPin: vPin
            }
        };

        return obj;
    }

    public applySettings(settings: any, saveLocal: boolean = true) {
        if (!settings) return;

        // Handle new structure with separate "Settings" and "Web Settings"
        const settingsToApply = settings.Settings || settings;
        const webSettingsToApply = settings["Web Settings"] || settings;

        // Apply general settings to local variables & DOM
        if (settingsToApply.theme) this.setTheme(settingsToApply.theme, true);
        if (settingsToApply.accentColor) this.setAccentColor(settingsToApply.accentColor, true);

        this.privacyMode = !!settingsToApply.privacyMode;
        this.screenGuardian = !!settingsToApply.screenGuardian;
        
        // Apply vault view style
        if (settingsToApply.vaultViewStyle && ['unified', 'compact', 'secure'].includes(settingsToApply.vaultViewStyle)) {
            this.vaultViewStyle = settingsToApply.vaultViewStyle;
        }

        // Apply to localStorage if requested (e.g. on initial sync from cloud)
        if (saveLocal || settings.vaultPin !== undefined || settingsToApply.autolock !== undefined || settingsToApply.privacyMode !== undefined) {
            if (settingsToApply.theme) localStorage.setItem(this.getStorageKey('theme'), settingsToApply.theme);
            if (settingsToApply.accentColor) localStorage.setItem(this.getStorageKey('accent_color'), settingsToApply.accentColor);

            localStorage.setItem(this.getStorageKey('privacyMode'), String(this.privacyMode));
            localStorage.setItem(this.getStorageKey('screenGuardian'), String(this.screenGuardian));
            
            if (settingsToApply.vaultViewStyle) {
                localStorage.setItem(this.getStorageKey('vault_view_style'), settingsToApply.vaultViewStyle);
            }

            // Read autolock from Web Settings (platform-specific)
            const finalAutolock = webSettingsToApply.autolock !== undefined ? webSettingsToApply.autolock : settingsToApply.autolock;
            if (finalAutolock !== undefined) localStorage.setItem(this.getStorageKey('autolock'), String(finalAutolock));

            // Critical, Ensure the PIN is persisted to local storage
            const finalPin = settings.vaultPin !== undefined ? settings.vaultPin : settingsToApply.vaultPin;
            if (finalPin !== undefined) {
                if (finalPin === null || finalPin === '') {
                    localStorage.removeItem(this.getStorageKey('vault_pin'));
                } else {
                    localStorage.setItem(this.getStorageKey('vault_pin'), finalPin);
                }
            }
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
        this.updateAutoLockState();

        // Vault View Style
        this.updateSegmentedUI('vault-view-segmented', this.vaultViewStyle);
    }

    private updateAutoLockState() {
        const hasPin = !!localStorage.getItem(this.getStorageKey('vault_pin'));
        const container = document.getElementById('autolock-segmented');
        if (!container) return;

        const segments = container.querySelectorAll('.segment');
        
        segments.forEach((seg) => {
            const val = seg.getAttribute('data-val');
            if (val !== '0') {
                if (hasPin) {
                    seg.removeAttribute('disabled');
                    (seg as HTMLElement).style.opacity = '1';
                    (seg as HTMLElement).style.cursor = 'pointer';
                } else {
                    seg.setAttribute('disabled', 'true');
                    (seg as HTMLElement).style.opacity = '0.4';
                    (seg as HTMLElement).style.cursor = 'not-allowed';
                }
            }
        });

        // If no PIN and auto-lock is enabled, reset to off
        if (!hasPin) {
            const currentAutolock = localStorage.getItem(this.getStorageKey('autolock')) || '0';
            if (currentAutolock !== '0') {
                localStorage.setItem(this.getStorageKey('autolock'), '0');
                this.updateSegmentedUI('autolock-segmented', '0');
                this.pushWebSettings();
            }
        }
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

    private initVaultViewStyle() {
        const saved = localStorage.getItem(this.getStorageKey('vault_view_style')) as any;
        if (saved && ['unified', 'compact', 'secure'].includes(saved)) {
            this.vaultViewStyle = saved;
        }
        const globalVessel = document.getElementById('global-timer-vessel');
        if (globalVessel) globalVessel.classList.toggle('hidden', this.vaultViewStyle !== 'unified');
    }


    private updateLockVaultVisibility() {
        const lockBtn = document.getElementById('lock-vault-btn');
        const setupBtn = document.getElementById('setup-pin-btn');
        const changeBtn = document.getElementById('change-pin-btn');
        const removeBtn = document.getElementById('remove-pin-btn');

        const hasPin = !!localStorage.getItem(`${this.userId}_vault_pin`);

        if (lockBtn) lockBtn.classList.toggle('hidden', !hasPin);
        if (setupBtn) setupBtn.style.display = hasPin ? 'none' : 'flex';
        if (changeBtn) changeBtn.style.display = hasPin ? 'flex' : 'none';
        if (removeBtn) removeBtn.style.display = hasPin ? 'flex' : 'none';
        if (removeBtn) removeBtn.title = "Remove Security Policy";
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
        this.updateSegmentedUI('theme-segmented', theme);

        // Update legacy theme icons
        const themeIcon = document.getElementById('theme-icon-lucide');
        const themeText = document.getElementById('theme-text');

        if (themeIcon) {
            themeIcon.className = theme === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
        }
        if (themeText) {
            themeText.textContent = theme === 'dark' ? 'Light Mode' : 'Dark Mode';
        }

        if (!silent) this.pushWebSettings();
    }

    private refreshLucide(_root?: HTMLElement) {
        // No-op: using Font Awesome 6, no initialization needed
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

        // Bottom nav tabs (mobile)
        document.querySelectorAll('.bottom-nav-tab').forEach(tab => {
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
                
                // Check if PIN is set up
                const hasPin = !!localStorage.getItem(this.getStorageKey('vault_pin'));
                
                // If trying to enable auto-lock without PIN, show error and prevent
                if (val !== '0' && !hasPin) {
                    this.showToast("Please set up a PIN first to enable auto-lock", "error");
                    return;
                }
                
                localStorage.setItem(this.getStorageKey('autolock'), val);
                this.updateSegmentedUI('autolock-segmented', val);
                this.pushWebSettings();
                this.showToast(val === '0' ? "Auto-lock is off" : `Auto-lock set to ${val}m`, "info");
            });
        });

        // Vault View Style Toggle
        document.querySelectorAll('#vault-view-segmented .segment').forEach(btn => {
            btn.addEventListener('click', () => {
                const val = btn.getAttribute('data-val') as 'unified' | 'compact' | 'secure';
                if (!val) return;
                this.vaultViewStyle = val;
                localStorage.setItem(this.getStorageKey('vault_view_style'), val);
                this.updateSegmentedUI('vault-view-segmented', val);
                this.pushWebSettings();
                const globalVessel = document.getElementById('global-timer-vessel');
                if (globalVessel) globalVessel.classList.toggle('hidden', val !== 'unified');
                this.renderAccounts();
                const labels: Record<string, string> = { unified: 'Unified', compact: 'Compact', secure: 'Secure' };
                this.showToast(`View: ${labels[val]}`, "info");
            });
        });

        // Settings PIN
        document.getElementById('setup-pin-btn')?.addEventListener('click', () => this.showPinSetup());
        document.getElementById('change-pin-btn')?.addEventListener('click', () => this.showPinSetup()); // Reuse showPinSetup
        document.getElementById('remove-pin-btn')?.addEventListener('click', () => this.showPinRemoval());

        // Privacy Mode Toggle
        document.getElementById('privacy-mode-toggle')?.addEventListener('change', (e) => {
            const target = e.target as HTMLInputElement;
            this.privacyMode = target.checked;
            localStorage.setItem(this.getStorageKey('privacyMode'), String(this.privacyMode));
            this.pushWebSettings();
            this.renderAccounts(); // Re-render to apply/remove masking
            this.showToast(this.privacyMode ? "Codes are now hidden" : "Codes are now visible", "info");
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

            this.showToast(this.screenGuardian ? "Screenshot protection is on" : "Screenshot protection is off", "info");
        });

        // Biometric toggle
        document.getElementById('biometric-toggle')?.addEventListener('change', (e) => {
            const enabled = (e.target as HTMLInputElement).checked;
            localStorage.setItem(this.getStorageKey('biometric_enabled'), String(enabled));
            this.showToast(enabled ? 'Biometric unlock enabled' : 'Biometric unlock disabled', 'info');
        });

        // Biometric unlock button on lock screen
        document.getElementById('btn-biometric-unlock')?.addEventListener('click', () => {
            this.tryBiometricUnlock();
        });


        // -- Vault Maintenance --
        document.getElementById('btn-export-vault')?.addEventListener('click', async () => {
            // Security: Prevent export if vault is locked
            if (document.body.classList.contains('vault-is-locked')) {
                this.showToast("Vault Locked - Enter PIN to Access", "error");
                return;
            }
            this.showExportOptionsModal();
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
                this.showImportPasswordModal(res.data);
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
                // Push all settings (includes Web Settings and root autolock) to cloud
                await this.pushSettings();

                // Then trigger a full vault sync to ensure local state is fresh
                await this.loadInitialData();

                this.showToast("Vault backed up!", "success");
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

        // Forgot PIN button
        document.getElementById('btn-forgot-pin')?.addEventListener('click', () => {
            this.showForgotPinConfirm();
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
                    this.showToast("Color updated!", "success");

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
                    this.updateLastActivity(`Changed theme`);
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
        // Show skeleton loaders immediately
        this.showSkeletonLoaders();
        
        try {
            const user = await (window as any).api.getCurrentUser();

            // Apply cloud settings first if they exist
            if (user) {
                const settings = {
                    ...(user.settings || {}),
                    autolock: user.autolock
                };
                this.applySettings(settings, true);
            }

            const userNameDisplay = document.getElementById('user-name-display');
            const dropdownName = document.getElementById('dropdown-user-name');
            const dropdownEmail = document.getElementById('dropdown-user-email');

            if (userNameDisplay && user) {
                userNameDisplay.textContent = user.username;
            }
            if (dropdownName && user) {
                dropdownName.textContent = user.username;
            }
            if (dropdownEmail && user) {
                dropdownEmail.textContent = user.email || '';
            }

            // Navbar avatar: show profile picture or initials
            if (user) {
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
            }

            await this.refreshAccounts();
        } catch (err) {
            console.error("Initial load failed", err);
        }
    }

    public async refreshAccounts() {
        // Show skeleton loaders
        this.showSkeletonLoaders();
        
        // Fetch accounts
        this.accounts = await (window as any).api.getAccounts();
        
        // Small delay to ensure smooth transition (minimum 300ms for better UX)
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // Render actual accounts
        this.renderAccounts();
    }
    
    private showSkeletonLoaders(count: number = 6) {
        const grid = document.getElementById('accounts-grid');
        const emptyState = document.getElementById('empty-state');
        const searchEmptyState = document.getElementById('search-empty-state');
        
        if (!grid) return;
        
        // Hide empty states
        emptyState?.classList.add('hidden');
        searchEmptyState?.classList.add('hidden');
        
        // Show grid and populate with skeletons
        grid.classList.remove('hidden');
        grid.innerHTML = '';
        
        for (let i = 0; i < count; i++) {
            const skeleton = this.createSkeletonCard(i);
            grid.appendChild(skeleton);
        }
    }
    
    private createSkeletonCard(index: number): HTMLElement {
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

    private switchTab(tab: 'vault' | 'settings' | 'account') {
        this.currentTab = tab;
        document.querySelectorAll('.nav-tab').forEach(t => {
            t.classList.toggle('active', t.getAttribute('data-tab') === tab);
        });
        // Sync bottom nav active state
        document.querySelectorAll('.bottom-nav-tab').forEach(t => {
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
        card.className = 'account-card';
        card.style.animationDelay = `${index * 0.06}s`;

        card.innerHTML = `
            <div class="card-actions">
                <button class="btn-card-more" title="More options">
                    <i class="fa-solid fa-ellipsis-vertical"></i>
                </button>
                <div class="card-dropdown">
                    <div class="card-dropdown-item edit-btn">
                        <i class="fa-solid fa-sliders"></i>
                        Edit
                    </div>
                    <div class="card-dropdown-item danger delete-btn">
                        <i class="fa-solid fa-trash-can"></i>
                        Delete
                    </div>
                </div>
            </div>
            <div class="account-header">
                <div class="account-icon">
                    <i class="${this.getIcon(account.issuer)}"></i>
                </div>
                <div style="flex: 1; min-width: 0;">
                    <div class="service-name">${account.issuer}</div>
                    <div class="account-identity">${account.account}</div>
                </div>
            </div>
            
            <div class="otp-box">
                ${this.vaultViewStyle !== 'secure' ? `
                <div class="otp-code ${this.privacyMode ? 'privacy-hidden' : ''}" data-id="${account.id}" style="cursor: pointer;" title="Click to copy">
                    ${this.privacyMode ? '••••••' : '------'}
                </div>
                ` : `
                <button class="btn-primary secure-view-btn" style="width: 100%; height: 50px;">
                    <i class="fa-solid fa-shield-halved"></i>
                    <span>Secure View</span>
                </button>
                `}
                ${this.vaultViewStyle === 'compact' ? `
                <div class="timer-linear-vessel" style="position: absolute; bottom: 0; left: 0; right: 0;">
                    <div class="timer-linear-progress"></div>
                </div>
                ` : this.vaultViewStyle === 'unified' || this.vaultViewStyle === 'secure' ? '' : `
                <div class="timer-container" style="position: absolute; right: 12px; width: 24px; height: 24px;">
                    <svg viewBox="0 0 60 60">
                        <circle cx="30" cy="30" r="26" fill="none" class="timer-bg" style="stroke: var(--bg-secondary); stroke-width: 4;"></circle>
                        <circle class="timer-progress" cx="30" cy="30" r="26" fill="none" stroke-dasharray="163.36" stroke-dashoffset="0" style="stroke: var(--accent-primary); stroke-width: 6; stroke-linecap: round; transition: stroke-dashoffset 1s linear;"></circle>
                    </svg>
                </div>
                `}
            </div>

            ${this.vaultViewStyle !== 'secure' ? `
            <div style="display: flex; gap: 10px;">
                <button class="btn-primary copy-btn" style="flex: 1; height: 44px; font-size: 14px;">
                    <i class="fa-solid fa-copy"></i>
                    <span class="btn-text">Secure Copy</span>
                </button>
            </div>
            ` : ''}
        `;

        // 3-dot dropdown toggle
        const moreBtn = card.querySelector('.btn-card-more') as HTMLElement;
        const dropdown = card.querySelector('.card-dropdown') as HTMLElement;
        moreBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = dropdown.classList.contains('show');
            // Close all other dropdowns
            document.querySelectorAll('.card-dropdown.show').forEach(d => d.classList.remove('show'));
            document.querySelectorAll('.btn-card-more.active').forEach(b => b.classList.remove('active'));
            if (!isOpen) {
                dropdown.classList.add('show');
                moreBtn.classList.add('active');
            }
        });

        // Close dropdown on outside click
        document.addEventListener('click', () => {
            dropdown.classList.remove('show');
            moreBtn.classList.remove('active');
        }, { once: true });

        const codeElement = card.querySelector('.otp-code') as HTMLElement;
        codeElement?.addEventListener('click', async () => {
            if (document.body.classList.contains('vault-is-locked')) {
                this.showToast("Vault Locked - Enter PIN to Access", "error");
                return;
            }
            const otp = await (window as any).api.generateTOTP(account.secret);
            this.copyOTPToClipboard(otp, codeElement);
        });

        // #6 Full card tap to copy (mobile-friendly)
        card.addEventListener('click', async (e) => {
            // Ignore if clicking interactive elements
            const target = e.target as HTMLElement;
            if (target.closest('.card-actions, .copy-btn, .secure-view-btn')) return;
            if (document.body.classList.contains('vault-is-locked')) return;
            if (this.vaultViewStyle === 'secure') return;
            const otp = await (window as any).api.generateTOTP(account.secret);
            this.copyOTPToClipboard(otp, card.querySelector('.otp-code') as HTMLElement || card);
        });

        const copyBtn = card.querySelector('.copy-btn') as HTMLElement;
        if (copyBtn) copyBtn.onclick = async () => {
            if (document.body.classList.contains('vault-is-locked')) {
                this.showToast("Vault Locked - Enter PIN to Access", "error");
                return;
            }
            const otpCode = await (window as any).api.generateTOTP(account.secret);
            await navigator.clipboard.writeText(otpCode);
            this.showToast("Code copied!", "success");
        };

        card.querySelector('.edit-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (document.body.classList.contains('vault-is-locked')) {
                this.showToast("Vault Locked - Enter PIN to Access", "error");
                return;
            }
            this.showEditModal(account);
        });

        card.querySelector('.delete-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (document.body.classList.contains('vault-is-locked')) {
                this.showToast("Vault Locked - Enter PIN to Access", "error");
                return;
            }
            this.showDeleteConfirm(account);
        });

        card.querySelector('.secure-view-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (document.body.classList.contains('vault-is-locked')) {
                this.showToast("Vault Locked - Enter PIN to Access", "error");
                return;
            }
            this.showOtpModal(account);
        });

        this.updateCardOTP(card, account.secret, 30);
        return card;
    }

    private async updateCardOTP(card: HTMLElement, secret: string, remainingSeconds: number) {
        const codeElement = card.querySelector('.otp-code') as HTMLElement;

        // Security: Don't generate or display OTP codes if vault is locked
        if (document.body.classList.contains('vault-is-locked')) {
            if (codeElement) codeElement.textContent = '••••••';
            return;
        }

        if (codeElement) {
            if (this.privacyMode) {
                if (codeElement.textContent !== '••••••') codeElement.textContent = '••••••';
            } else {
                const otp = await (window as any).api.generateTOTP(secret);
                const displayOtp = otp.substring(0, 3) + ' ' + otp.substring(3);
                if (codeElement.textContent !== displayOtp) codeElement.textContent = displayOtp;
            }
        }

        // Mode 1: Unified — update global bar only
        if (this.vaultViewStyle === 'unified') {
            const globalBar = document.getElementById('global-otp-timer') as HTMLElement;
            if (globalBar) {
                const scale = remainingSeconds / 30;
                globalBar.style.transform = `scaleX(${scale})`;
                globalBar.style.backgroundColor = remainingSeconds <= 5 ? '#ff3b30' : 'var(--accent-primary)';
            }
        }
        // Mode 2: Compact — individual linear bar
        else if (this.vaultViewStyle === 'compact') {
            const progressBar = card.querySelector('.timer-linear-progress') as HTMLElement;
            if (progressBar) {
                const scale = remainingSeconds / 30;
                progressBar.style.transform = `scaleX(${scale})`;
                progressBar.style.backgroundColor = remainingSeconds <= 5 ? '#ff3b30' : 'var(--accent-primary)';
            }
        }
        // Mode 3: Secure — SVG circle timer (fallback, no code shown)
        else {
            const dashOffset = 163.36 * (1 - remainingSeconds / 30);
            const progressCircle = card.querySelector('.timer-progress') as HTMLElement;
            if (progressCircle) {
                progressCircle.style.strokeDashoffset = dashOffset.toString();
                progressCircle.style.stroke = remainingSeconds <= 5 ? '#ff3b30' : 'var(--accent-primary)';
            }
        }
    }

    private copyOTPToClipboard(otp: string, element: HTMLElement) {
        navigator.clipboard.writeText(otp).then(() => {
            // Haptic feedback on mobile
            Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});

            // Show visual feedback
            this.showCopyFeedback(element);

            // Update activity
            this.updateLastActivity('OTP copied');

            // Show toast
            this.showToast('Code copied!', 'success');
        }).catch(() => {
            this.showToast('Failed to copy', 'error');
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

                if (lastActivityElement) {
                    lastActivityElement.textContent = timeAgo;
                }
            }

            if (lastActionElement) {
                lastActionElement.textContent = lastAction;
            }
        }
    }

    // ── #7 Biometric unlock ──────────────────────────────────────────────────
    private async setupBiometric() {
        const biometricRow = document.getElementById('biometric-setting-row');
        const biometricToggle = document.getElementById('biometric-toggle') as HTMLInputElement;
        const biometricDesc = document.getElementById('biometric-setting-desc');

        try {
            const { isAvailable, biometryType } = await BiometricAuth.checkBiometry();

            if (isAvailable && biometricRow) {
                biometricRow.style.display = 'flex';

                // Show the type name in the description
                const typeName = biometryType === BiometryType.faceId ? 'Face ID'
                    : biometryType === BiometryType.touchId ? 'Touch ID'
                    : biometryType === BiometryType.faceAuthentication ? 'Face Unlock'
                    : biometryType === BiometryType.fingerprintAuthentication ? 'Fingerprint'
                    : 'Biometrics';

                if (biometricDesc) biometricDesc.textContent = `Use ${typeName} to unlock`;

                // Restore saved preference
                const saved = localStorage.getItem(this.getStorageKey('biometric_enabled')) === 'true';
                if (biometricToggle) biometricToggle.checked = saved;
            }
        } catch {
            // Biometry not available (web/emulator) — keep row hidden
        }
    }

    public async tryBiometricUnlock() {
        const enabled = localStorage.getItem(this.getStorageKey('biometric_enabled')) === 'true';
        if (!enabled) return;

        try {
            await BiometricAuth.authenticate({
                reason: 'Unlock your Keyra vault',
                cancelTitle: 'Use PIN',
                allowDeviceCredential: false,
            });

            // Success — unlock vault
            document.getElementById('lock-vessel')?.classList.remove('show');
            document.body.classList.remove('vault-is-locked');
            const pinIn = document.getElementById('unlock-pin') as HTMLInputElement;
            if (pinIn) pinIn.value = '';
            document.querySelectorAll('.pin-input-vessel .pin-dot').forEach(d =>
                d.classList.remove('filled', 'error', 'success')
            );
            this.renderAccounts();
            this.showToast('Vault unlocked', 'success');
        } catch {
            // User cancelled or biometry failed — fall back to PIN silently
        }
    }

    // ── #4 Pull-to-refresh ──────────────────────────────────────────────────
    private setupPullToRefresh() {
        const mainContent = document.querySelector('.main-content') as HTMLElement;
        if (!mainContent) return;

        let startY = 0;
        let pulling = false;
        let indicator: HTMLElement | null = null;

        const getIndicator = () => {
            if (!indicator) {
                indicator = document.createElement('div');
                indicator.className = 'pull-refresh-indicator';
                indicator.innerHTML = '<i class="fa-solid fa-rotate"></i><span>Pull to refresh</span>';
                mainContent.prepend(indicator);
            }
            return indicator;
        };

        mainContent.addEventListener('touchstart', (e: TouchEvent) => {
            if (mainContent.scrollTop === 0 && this.currentTab === 'vault') {
                startY = e.touches[0].clientY;
                pulling = true;
            }
        }, { passive: true });

        mainContent.addEventListener('touchmove', (e: TouchEvent) => {
            if (!pulling) return;
            const dy = e.touches[0].clientY - startY;
            if (dy > 0 && dy < 100) {
                const ind = getIndicator();
                ind.style.height = `${dy}px`;
                ind.style.opacity = String(dy / 80);
                ind.classList.toggle('pull-refresh-ready', dy > 64);
            }
        }, { passive: true });

        mainContent.addEventListener('touchend', async (e: TouchEvent) => {
            if (!pulling) return;
            pulling = false;
            const dy = e.changedTouches[0].clientY - startY;
            const ind = getIndicator();

            if (dy > 64) {
                ind.classList.add('pull-refresh-loading');
                ind.querySelector('span')!.textContent = 'Refreshing...';
                try {
                    await this.loadInitialData();
                    this.showToast('Vault refreshed', 'success');
                } catch {
                    this.showToast('Refresh failed', 'error');
                }
            }

            ind.style.height = '0';
            ind.style.opacity = '0';
            ind.classList.remove('pull-refresh-ready', 'pull-refresh-loading');
        }, { passive: true });
    }

    // ── #9 Search focus animation ────────────────────────────────────────────
    private setupSearchFocus() {
        const searchInput = document.getElementById('vault-search') as HTMLInputElement;
        const searchVessel = searchInput?.closest('.search-vessel') as HTMLElement;
        if (!searchInput || !searchVessel) return;

        searchInput.addEventListener('focus', () => {
            searchVessel.classList.add('search-focused');
        });

        searchInput.addEventListener('blur', () => {
            searchVessel.classList.remove('search-focused');
            if (!searchInput.value) {
                searchVessel.classList.remove('search-expanded');
            }
        });

        searchInput.addEventListener('input', () => {
            searchVessel.classList.toggle('search-expanded', searchInput.value.length > 0);
        });
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
        const name = issuer.toLowerCase();

        // 1. Precise Brand Mapping — FA brands where available, solid fallbacks
        const icons: { [key: string]: string } = {
            'google': 'fa-brands fa-google',
            'github': 'fa-brands fa-github',
            'microsoft': 'fa-brands fa-microsoft',
            'apple': 'fa-brands fa-apple',
            'amazon': 'fa-brands fa-amazon',
            'facebook': 'fa-brands fa-facebook',
            'twitter': 'fa-brands fa-x-twitter',
            'discord': 'fa-brands fa-discord',
            'slack': 'fa-brands fa-slack',
            'instagram': 'fa-brands fa-instagram',
            'linkedin': 'fa-brands fa-linkedin',
            'twitch': 'fa-brands fa-twitch',
            'spotify': 'fa-brands fa-spotify',
            'steam': 'fa-brands fa-steam',
            'dropbox': 'fa-brands fa-dropbox',
            'reddit': 'fa-brands fa-reddit',
            'bitbucket': 'fa-brands fa-bitbucket',
            'gitlab': 'fa-brands fa-gitlab',
            'wordpress': 'fa-brands fa-wordpress',
            'paypal': 'fa-brands fa-paypal',
            'stripe': 'fa-brands fa-stripe',
            'shopify': 'fa-brands fa-shopify',
            'netflix': 'fa-solid fa-tv',
            'binance': 'fa-solid fa-coins',
            'coinbase': 'fa-solid fa-wallet',
            'heroku': 'fa-solid fa-server',
            'digitalocean': 'fa-brands fa-digital-ocean',
            'cloudflare': 'fa-solid fa-shield-halved',
            'vercel': 'fa-solid fa-globe',
            'netlify': 'fa-solid fa-globe',
            'firebase': 'fa-solid fa-fire',
            'medium': 'fa-brands fa-medium',
            'patreon': 'fa-brands fa-patreon',
            'protonmail': 'fa-solid fa-envelope',
            'nordvpn': 'fa-solid fa-shield-halved',
            'expressvpn': 'fa-solid fa-shield-halved',
            'bitwarden': 'fa-solid fa-lock',
            '1password': 'fa-solid fa-key',
            'lastpass': 'fa-solid fa-key',
            'uber': 'fa-brands fa-uber',
            'airbnb': 'fa-brands fa-airbnb',
            'notion': 'fa-solid fa-file-lines',
            'zoom': 'fa-solid fa-video',
            'trello': 'fa-brands fa-trello',
            'figma': 'fa-brands fa-figma',
            'adobe': 'fa-brands fa-adobe',
            'epic': 'fa-solid fa-gamepad',
            'canva': 'fa-solid fa-pen-ruler',
            'asana': 'fa-solid fa-check-square',
            'clickup': 'fa-solid fa-layer-group',
            'lyft': 'fa-brands fa-lyft',
        };

        if (icons[name]) return icons[name];

        // 2. Keyword-based Fuzzy Matching
        const keywords: [RegExp, string][] = [
            [/aws|amazon|cloud/i, 'fa-solid fa-cloud'],
            [/azure|microsoft/i, 'fa-solid fa-cloud'],
            [/server|host|vps|deploy/i, 'fa-solid fa-server'],
            [/db|database|mongo|sql|redis/i, 'fa-solid fa-database'],
            [/mail|email|outlook|gmail/i, 'fa-solid fa-envelope'],
            [/chat|message|messenger/i, 'fa-solid fa-comment'],
            [/social|network/i, 'fa-solid fa-share-nodes'],
            [/bank|finance|money|wallet|pay/i, 'fa-solid fa-wallet'],
            [/crypto|coin|token|eth|btc/i, 'fa-solid fa-coins'],
            [/card|credit|debit/i, 'fa-solid fa-credit-card'],
            [/auth|security|protect|shield|vault/i, 'fa-solid fa-shield-halved'],
            [/key|password|pass|login|access/i, 'fa-solid fa-key'],
            [/code|dev|git|build|repo/i, 'fa-solid fa-code'],
            [/video|movie|tv|stream|youtube/i, 'fa-solid fa-video'],
            [/music|audio|song|sound/i, 'fa-solid fa-music'],
            [/game|play|xbox|psn/i, 'fa-solid fa-gamepad'],
            [/shop|store|cart|ebay|buy/i, 'fa-solid fa-cart-shopping'],
            [/user|account|profile|id/i, 'fa-solid fa-user'],
            [/work|corp|company|office/i, 'fa-solid fa-briefcase'],
        ];

        for (const [pattern, icon] of keywords) {
            if (pattern.test(name)) return icon;
        }

        // 3. Fallback
        return 'fa-solid fa-shield';
    }

    private showModal(content: string) {
        const overlay = document.getElementById('modal-overlay');
        if (!overlay) return;
        overlay.innerHTML = `<div class="modal animate-fade-in">${content}</div>`;
        overlay.classList.add('show');
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
                    <div class="modal-brand-icon" style="width: 140px !important; height: 140px !important; margin-bottom: 48px !important;">
                        <i class="fa-solid fa-circle-plus" style="font-size: 72px !important;"></i>
                    </div>
                    <div>
                        <h2 style="font-weight: 950; font-size: clamp(28px, 5vw, 36px); color: var(--text-primary); letter-spacing: -1.5px; margin-bottom: 8px;">Add Token</h2>
                        <div class="modal-help-text" style="font-weight: 750; opacity: 0.8; text-transform: uppercase; font-size: 14px; letter-spacing: 1px;">SAVE DIGITAL IDENTITY</div>
                    </div>
                </div>
                
                <div class="form-group">
                    <label class="form-label">Service</label>
                    <input type="text" id="new-issuer" class="form-input" placeholder="e.g. GitHub, Google">
                </div>
                <div class="form-group">
                    <label class="form-label">Account</label>
                    <input type="text" id="new-account" class="form-input" placeholder="name@domain.com">
                </div>
                <div class="form-group">
                    <label class="form-label">TOTP Secret</label>
                    <input type="text" id="new-secret" class="form-input" placeholder="Enter secret key">
                    <div class="modal-help-text">Input derived from manual entry or registry backup</div>
                </div>
                
                <div style="display: flex; gap: var(--space-md); margin-top: var(--space-xl);">
                    <button class="btn-primary" id="save-new-account" style="flex: 2; height: var(--btn-h-lg); font-size: 17px;">
                        <i class="fa-solid fa-shield-halved"></i>
                        Save Token
                    </button>
                    <button class="user-button" id="cancel-add-btn" style="flex: 1; justify-content: center; height: var(--btn-h-lg); font-weight: 800;">Cancel</button>
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
                    <div class="modal-brand-icon" style="width: 140px !important; height: 140px !important; margin-bottom: 48px !important;">
                        <i class="fa-solid fa-sliders" style="font-size: 72px !important;"></i>
                    </div>
                    <div>
                        <h2 style="font-weight: 950; font-size: clamp(28px, 5vw, 36px); color: var(--text-primary); letter-spacing: -1.5px; margin-bottom: 8px;">Edit Identity</h2>
                        <div class="modal-help-text" style="font-weight: 750; opacity: 0.8; text-transform: uppercase; font-size: 14px; letter-spacing: 1px;">UPDATE SERVICE DETAILS</div>
                    </div>
                </div>
                
                <div class="modal-entity-badge" style="margin-bottom: 20px;">
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
                    <input type="text" id="edit-account" class="form-input" value="${account.account}">
                </div>
                
                <div style="display: flex; gap: var(--space-md); margin-top: var(--space-xl);">
                    <button class="btn-primary" id="update-account" style="flex: 2; height: var(--btn-h-lg); font-size: 17px;">
                        <i class="fa-solid fa-check"></i>
                        Save Changes
                    </button>
                    <button class="user-button" id="cancel-edit-btn" style="flex: 1; justify-content: center; height: var(--btn-h-lg); font-weight: 800;">Cancel</button>
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

        const iconName = type === 'error' ? 'fa-circle-exclamation' : type === 'success' ? 'fa-circle-check' : 'fa-circle-info';
        toast.innerHTML = `
            <i class="fa-solid ${iconName} toast-icon"></i>
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

        // Set user avatar on PIN lock screen
        this.updatePinAvatar();

        this.refreshLucide(vessel);
        const pinIn = document.getElementById('unlock-pin') as HTMLInputElement;
        if (pinIn) { pinIn.value = ''; pinIn.focus(); }

        // Show biometric button if enabled, then auto-prompt
        const biometricEnabled = localStorage.getItem(this.getStorageKey('biometric_enabled')) === 'true';
        const biometricBtn = document.getElementById('btn-biometric-unlock');
        if (biometricBtn) biometricBtn.classList.toggle('hidden', !biometricEnabled);
        if (biometricEnabled) {
            // Small delay so the lock screen animation completes first
            setTimeout(() => this.tryBiometricUnlock(), 400);
        }
    }

    private async updatePinAvatar() {
        const user = await (window as any).api.getCurrentUser();
        if (!user) return;

        const pinAvatarImg = document.getElementById('pin-avatar-img') as HTMLImageElement;
        const pinAvatarFallback = document.getElementById('pin-avatar-fallback') as HTMLImageElement;

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
    }

    private handleUnlock() {
        const pinIn = document.getElementById('unlock-pin') as HTMLInputElement;
        if (!pinIn) return;

        this.validateAndAutoUnlock(pinIn.value);
    }

    private async validateAndAutoUnlock(pinValue: string) {
        const pinIn = document.getElementById('unlock-pin') as HTMLInputElement;
        const saved = localStorage.getItem(this.getStorageKey('vault_pin'));
        const progressDots = document.querySelectorAll('.pin-input-vessel .pin-dot');

        // Update progress dots based on input length
        progressDots.forEach((dot, index) => {
            dot.classList.remove('filled', 'error', 'success');
            if (index < pinValue.length) {
                dot.classList.add('filled');
            }
        });

        if (pinValue.length === 4) {
            try {
                let isCorrect = false;
                
                // Check if it's a legacy plaintext PIN (4 digits)
                if (saved && saved.length === 4 && /^\d+$/.test(saved)) {
                    isCorrect = (pinValue === saved);
                } else if (saved) {
                    // Decrypt the encrypted PIN
                    const decrypted = (window as any).api.decryptPIN(saved);
                    isCorrect = (pinValue === decrypted);
                }

                if (isCorrect) {
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
                    const vessel = document.querySelector('.pin-input-vessel');
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
            } catch (err) {
                console.error("PIN validation error:", err);
                this.showToast("PIN validation failed", "error");
                if (pinIn) pinIn.value = '';
                progressDots.forEach(dot => dot.classList.remove('filled', 'error', 'success'));
            }
        }
    }

    private async loadAccountInfo() {
        const user = await (window as any).api.getCurrentUser();
        if (!user) return;

        // Populate dropdown header
        const dropdownName = document.getElementById('dropdown-user-name');
        const dropdownEmail = document.getElementById('dropdown-user-email');
        if (dropdownName) dropdownName.textContent = user.username;
        if (dropdownEmail) dropdownEmail.textContent = user.email || '';

        const nameDisplay = document.getElementById('acc-display-username');
        const emailDisplay = document.getElementById('acc-display-email');
        const pendingContainer = document.getElementById('pending-email-container');
        const pendingEmailDisplay = document.getElementById('acc-display-pending-email');
        const emailCard = document.getElementById('card-change-email');

        if (nameDisplay) nameDisplay.textContent = user.username;
        if (emailDisplay) emailDisplay.textContent = user.email;

        // Account page avatar
        const initialsEl = document.getElementById('acc-initials');
        const avatarImgEl = document.getElementById('acc-avatar-img') as HTMLImageElement;
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

        // Sync navbar avatar
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

        // Change Avatar
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
                const reader = new FileReader();
                reader.onload = async (ev) => {
                    const base64 = ev.target?.result as string;
                    try {
                        const res = await (window as any).api.updateProfilePicture(base64);
                        if (res.success) {
                            this.showToast(res.message || 'Profile photo updated', 'success');
                            await this.loadAccountInfo();
                        } else {
                            this.showToast(res.message || 'Failed to update photo', 'error');
                        }
                    } catch (err: any) {
                        this.showToast(err.message || 'Failed to update profile picture', 'error');
                    }
                };
                reader.onerror = () => this.showToast('Failed to read image file', 'error');
                reader.readAsDataURL(file);
            };
            input.click();
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
                    <i class="fa-solid fa-envelope-circle-check" style="font-size: 48px; color: var(--accent-primary);"></i>
                </div>
                
                <h2 style="font-weight: 900; font-size: 32px; color: var(--text-primary); margin-bottom: 12px; letter-spacing: -1.2px;">Check your Email</h2>
                <p style="color: var(--text-secondary); margin-bottom: 40px; font-weight: 500; font-size: 16px; line-height: 1.5;">
                    Enter the 6-digit code we just sent to <br>
                    <strong style="color: var(--accent-primary); font-weight: 700;">${email}</strong>
                </p>
                
                <div class="form-group" style="margin-bottom: 40px;">
                    <div style="position: relative;">
                        <input type="text" id="email-verify-code" class="form-input" placeholder="000000" maxlength="6" 
                               style="text-align: center; font-size: 36px; letter-spacing: 12px; font-family: 'Outfit'; height: 84px; border-radius: var(--radius-lg); box-shadow: var(--nm-pressed); border: none; width: 100%; color: var(--accent-primary); font-weight: 900;">
                        <div style="position: absolute; bottom: -20px; left: 0; right: 0; display: flex; justify-content: space-between; padding: 0 40px; pointer-events: none; opacity: 0.2;">
                            <span></span><span></span><span></span><span></span><span></span><span></span>
                        </div>
                    </div>
                </div>

                <div style="display: flex; flex-direction: column; gap: 12px; margin-top: 48px;">
                    <button class="btn-primary" id="btn-submit-email-verify" style="height: 64px; font-size: 18px; font-weight: 850; border-radius: var(--radius-xl); box-shadow: var(--nm-raised);">
                        Verify & Update
                    </button>
                    <button class="user-button" id="btn-cancel-email-verify" style="height: 64px; font-size: 15px; font-weight: 750; border-radius: var(--radius-xl); box-shadow: var(--nm-raised); justify-content: center;">
                        Cancel
                    </button>
                </div>

                <div style="margin-top: 32px; padding-top: 24px; border-top: 1px dashed var(--border-color);">
                    <div style="text-align: center; font-size: 14px;">
                        <span>Didn't get the code?</span>
                        <button id="btn-resend-verify-email" style="background: none; border: none; font-weight: 800; color: var(--accent-primary); cursor: pointer; transition: all 0.3s ease; display: inline-flex; align-items: center; gap: 8px; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; margin-left: 8px;" disabled>
                            <span>Send again</span> 
                            <span id="verify-email-resend-timer" style="opacity: 0.7; font-variant-numeric: tabular-nums;">(30s)</span>
                        </button>
                    </div>
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

                <div class="pin-step-content">
                    <div class="pin-header">
                        <div class="pin-brand-icon" style="width: 140px !important; height: 140px !important; margin-bottom: 48px !important;">
                            <i class="fa-solid fa-shield-halved" style="font-size: 72px !important;"></i>
                        </div>
                        <h2 class="pin-title">Set Master PIN</h2>
                        <p class="pin-subtitle">ESTABLISH 4-DIGIT VAULT KEY</p>
                    </div>

                    <div class="pin-input-container">
                        <div class="pin-input-vessel">
                            <div class="pin-indicators">
                                <div class="pin-dot" data-digit="1"></div>
                                <div class="pin-dot" data-digit="2"></div>
                                <div class="pin-dot" data-digit="3"></div>
                                <div class="pin-dot" data-digit="4"></div>
                            </div>
                            <input type="password" id="pin-step1" maxlength="4" class="pin-input-hidden" autocomplete="off">
                        </div>
                        <div class="pin-helper">Choose New PIN</div>
                    </div>

                    <div class="pin-actions">
                        <button class="btn-primary pin-continue-btn" id="pin-step1-continue" disabled>
                            <i class="fa-solid fa-arrow-right"></i>
                            Next Phase
                        </button>
                        <button class="user-button pin-cancel-btn" id="pin-step1-cancel">
                            Cancel
                        </button>
                    </div>
                    <p class="modal-help-text" style="text-align: center; margin-top: 20px;">
                        Keep this code safe. It is required to unlock your identities.
                    </p>
                </div>
            </div>
        `;
        this.showModal(content);
        this.setupPinStep1Events();
    }

    private showPinSetupStep2() {
        const content = `
            <div class="pin-steps-modal">
                <div class="pin-progress-container">
                    <div class="pin-step completed" data-step="1">
                        <div class="pin-step-number"><i class="fa-solid fa-check"></i></div>
                        <div class="pin-step-label">Create PIN</div>
                    </div>
                    <div class="pin-step-line active"></div>
                    <div class="pin-step active" data-step="2">
                        <div class="pin-step-number">2</div>
                        <div class="pin-step-label">Confirm PIN</div>
                    </div>
                </div>

                <div class="pin-step-content">
                    <div class="pin-header">
                        <div class="pin-brand-icon" style="width: 140px !important; height: 140px !important; margin-bottom: 48px !important;">
                            <i class="fa-solid fa-circle-check" style="font-size: 72px !important;"></i>
                        </div>
                        <h2 class="pin-title">Verify PIN</h2>
                        <p class="pin-subtitle">RE-ENTER KEY TO CONFIRM</p>
                    </div>

                    <div class="pin-input-container">
                        <div class="pin-input-vessel">
                            <div class="pin-indicators">
                                <div class="pin-dot" data-digit="1"></div>
                                <div class="pin-dot" data-digit="2"></div>
                                <div class="pin-dot" data-digit="3"></div>
                                <div class="pin-dot" data-digit="4"></div>
                            </div>
                            <input type="password" id="pin-step2" maxlength="4" class="pin-input-hidden" autocomplete="off">
                        </div>
                        <div class="pin-helper">Confirm New PIN</div>
                    </div>

                    <div class="pin-actions">
                        <button class="btn-primary pin-continue-btn" id="pin-step2-continue" disabled>
                            <i class="fa-solid fa-shield-halved"></i>
                            Activate Vault
                        </button>
                        <button class="user-button pin-back-btn" id="pin-step2-back">
                            <i class="fa-solid fa-arrow-left"></i>
                            Back
                        </button>
                    </div>
                    <p class="modal-help-text" style="text-align: center; margin-top: 20px;">
                        Passwords must match exactly to synchronize security.
                    </p>
                </div>
            </div>
        `;
        this.showModal(content);
        this.setupPinStep2Events();
    }

    private setupPinStep1Events() {
        const pinField = document.getElementById('pin-step1') as HTMLInputElement;
        const continueBtn = document.getElementById('pin-step1-continue');
        const setupDots = document.querySelectorAll('.pin-input-vessel .pin-dot');

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
        const setupDots = document.querySelectorAll('.pin-input-vessel .pin-dot');

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
                    // PIN confirmed - encrypt and save it
                    const encryptedPin = (window as any).api.encryptPIN(this.tempPin);
                    localStorage.setItem(this.getStorageKey('vault_pin'), encryptedPin);
                    this.pushWebSettings();
                    this.updateLockVaultVisibility();
                    this.updateAutoLockState();
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
        this.setupPinRemovalEvents();
    }

    private setupPinRemovalEvents() {
        document.getElementById('confirm-remove-pin')?.addEventListener('click', () => {
            localStorage.removeItem(this.getStorageKey('vault_pin'));
            this.pushSettings(); // Use pushSettings for vault security changes
            this.updateLockVaultVisibility();
            this.updateAutoLockState();
            this.showToast("PIN security removed", "info");
            this.hideModal();
        });

        document.getElementById('cancel-remove-pin')?.addEventListener('click', () => this.hideModal());
    }

    private showForgotPinConfirm() {
        const modal = document.getElementById('modal-forgot-pin');
        if (!modal) return;

        // Reset to main view
        const mainView = document.getElementById('forgot-pin-main-view');
        mainView?.classList.remove('hidden');

        // Reset inputs and errors
        const passwordInput = document.getElementById('forgot-pin-password') as HTMLInputElement;
        const passForm = document.getElementById('form-forgot-pin');
        const confirmBtn = document.getElementById('confirm-forgot-pin-btn');
        
        if (passwordInput) passwordInput.value = '';
        passForm?.classList.add('hidden');
        if (confirmBtn) {
            confirmBtn.innerHTML = '<i class="fa-solid fa-trash-can"></i> Reset PIN & Sign Out';
        }

        const errorEl = document.getElementById('forgot-pin-error');
        if (errorEl) {
            errorEl.textContent = '';
            errorEl.classList.add('hidden');
        }

        modal.classList.remove('hidden');
        modal.classList.add('show');

        // Error helpers
        const showError = (msg: string) => {
            if (errorEl) {
                errorEl.textContent = msg;
                errorEl.classList.remove('hidden');
            }
        };
        const hideError = () => {
            if (errorEl) {
                errorEl.textContent = '';
                errorEl.classList.add('hidden');
            }
        };

        // Complete PIN reset
        const completePinReset = async () => {
            this.showToast("Resetting Security...", "info");
            localStorage.removeItem(this.getStorageKey('vault_pin'));
            await this.pushSettings();
            this.updateLockVaultVisibility();
            this.updateAutoLockState();
            modal.classList.remove('show');
            setTimeout(() => modal.classList.add('hidden'), 300);
            this.showToast("Signing Out...", "info");
            await (window as any).api.logout();
            window.location.reload();
        };

        // Master Password Handler
        const confirmHandler = async (e?: Event) => {
            e?.preventDefault();
            const pForm = document.getElementById('form-forgot-pin');
            const pInput = document.getElementById('forgot-pin-password') as HTMLInputElement;
            const cBtn = document.getElementById('confirm-forgot-pin-btn');

            // If form is hidden, show it first
            if (pForm?.classList.contains('hidden')) {
                pForm.classList.remove('hidden');
                if (cBtn) {
                    cBtn.innerHTML = '<i class="fa-solid fa-check"></i> Confirm Reset & Sign Out';
                }
                setTimeout(() => pInput?.focus(), 100);
                return;
            }

            const password = pInput?.value || '';
            hideError();
            
            if (!password) {
                showError('Please enter your master password.');
                pInput?.focus();
                return;
            }

            this.showToast("Verifying Identity...", "info");
            try {
                const result = await (window as any).api.verifyMasterPassword(password);
                if (!result.success) {
                    showError(result.message || 'Incorrect password.');
                    pInput?.select();
                    return;
                }
                // Clear password on success for security
                if (pInput) pInput.value = '';
                await completePinReset();
            } catch (err) {
                showError('An error occurred. Please try again.');
            }
        };

        // Cancel Handler
        const cancelHandler = () => {
            // If password form is visible, reset it and return to initial state
            const pForm = document.getElementById('form-forgot-pin');
            const pInput = document.getElementById('forgot-pin-password') as HTMLInputElement;
            const cBtn = document.getElementById('confirm-forgot-pin-btn');
            
            if (pForm && !pForm.classList.contains('hidden')) {
                pForm.classList.add('hidden');
                if (pInput) pInput.value = '';
                if (cBtn) {
                    cBtn.innerHTML = '<i class="fa-solid fa-trash-can"></i> Reset PIN & Sign Out';
                }
                hideError();
                return;
            }

            // Otherwise, close the modal and return to PIN entry
            modal.classList.remove('show');
            setTimeout(() => modal.classList.add('hidden'), 300);
            this.clearPinInput();
        };

        // Attach Event Listeners (clone to remove old)
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

        // Form submission
        const form = document.getElementById('form-forgot-pin');
        if (form) {
            const newForm = form.cloneNode(true);
            form.parentNode?.replaceChild(newForm, form);
            newForm.addEventListener('submit', confirmHandler);
        }
    }

    private showDeleteConfirm(account: any) {
        const content = `
            <div style="padding: clamp(32px, 8vw, 48px); text-align: center;">
                <div style="margin: 0 auto 24px; width: 96px; height: 96px; border-radius: 50%; background: var(--bg-primary); box-shadow: var(--nm-shadow-out); display: flex; align-items: center; justify-content: center;">
                    <i class="fa-solid fa-trash-can" style="font-size: 36px; color: #ff3b30;"></i>
                </div>
                <h2 style="font-weight: 850; font-size: 24px; margin-bottom: 4px; color: var(--text-primary);" class="danger">Delete Token?</h2>
                <div class="modal-help-text" style="font-weight: 800; opacity: 0.8; text-transform: uppercase; font-size: 12px; letter-spacing: 0.5px; margin-bottom: 24px;">PERMANENT ACTION</div>
                
                <div class="modal-entity-badge" style="margin-bottom: 32px;">
                    <div class="entity-icon">
                        <i class="fa-solid fa-shield"></i>
                    </div>
                    <div class="entity-info">
                        <span class="entity-name">${account.issuer}</span>
                        <span class="entity-label">${account.account || 'Vault Token'}</span>
                    </div>
                </div>

                <p class="modal-help-text" style="font-size: 14px; margin-bottom: 40px; line-height: 1.6;">
                    Removing this token is permanent. You will lose access to its OTP codes.
                </p>
                
                <div style="display: flex; gap: 16px;">
                    <button class="btn-primary danger" id="confirm-delete" style="flex: 1; height: var(--btn-h-lg);">
                        <i class="fa-solid fa-trash-can"></i>
                        Delete Token
                    </button>
                    <button class="user-button" id="cancel-delete-btn" style="flex: 1; justify-content: center; height: var(--btn-h-lg);">Keep Token</button>
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

    private async showOtpModal(account: any) {
        const otp = await (window as any).api.generateTOTP(account.secret);
        const formatted = otp.substring(0, 3) + ' ' + otp.substring(3);
        const remaining = await (window as any).api.getRemainingSeconds();
        const circumference = 2 * Math.PI * 54;
        const offset = circumference - (remaining / 30) * circumference;

        const content = `
            <div style="padding: clamp(var(--space-xl), 10vw, var(--space-2xl)); text-align: center;">
                <div style="display: flex; align-items: center; gap: var(--space-xl); margin-bottom: 48px; text-align: left;">
                    <div class="modal-brand-icon" style="width: 140px !important; height: 140px !important; flex-shrink: 0; margin: 0 !important;">
                        <i class="${this.getIcon(account.issuer)}" style="font-size: 72px !important;"></i>
                    </div>
                    <div>
                        <h2 style="font-weight: 950; font-size: clamp(28px, 5vw, 36px); color: var(--text-primary); letter-spacing: -1.5px; margin-bottom: 8px;">${account.issuer}</h2>
                        <div style="color: var(--text-secondary); font-size: 16px; font-weight: 750; letter-spacing: 0.5px; opacity: 0.8;">${account.account}</div>
                    </div>
                </div>

                <div style="position: relative; display: flex; align-items: center; justify-content: center; margin: 0 auto var(--space-lg); width: 220px; height: 220px;">
                    <svg viewBox="0 0 120 120" style="position: absolute; inset: 0; width: 100%; height: 100%; transform: rotate(-90deg);">
                        <circle cx="60" cy="60" r="54" fill="none" stroke="var(--bg-secondary)" stroke-width="5"></circle>
                        <circle class="otp-modal-circle" cx="60" cy="60" r="54" fill="none"
                            stroke="var(--accent-primary)" stroke-width="7" stroke-linecap="round"
                            stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"
                            style="transition: stroke-dashoffset 1s linear;"></circle>
                    </svg>
                    <div style="position: relative; text-align: center; width: 100%; padding: 0 24px; box-sizing: border-box;">
                        <div class="otp-modal-code" style="font-size: clamp(24px, 6vw, 30px); font-weight: 900; letter-spacing: 6px; color: var(--accent-primary); line-height: 1; white-space: nowrap;">${formatted}</div>
                        <div class="otp-modal-timer" style="font-size: 13px; font-weight: 700; color: var(--text-secondary); margin-top: 6px;">${remaining}s</div>
                    </div>
                </div>

                <div style="display: flex; gap: var(--space-md);">
                    <button class="btn-primary otp-modal-copy-btn" style="flex: 2; height: var(--btn-h-lg); font-size: 16px;">
                        <i class="fa-solid fa-copy"></i>
                        <span>Copy Code</span>
                    </button>
                    <button class="user-button" id="otp-modal-close" style="flex: 1; justify-content: center; height: var(--btn-h-lg); font-weight: 800;">Close</button>
                </div>
            </div>
        `;
        this.showModal(content);

        document.getElementById('otp-modal-close')?.addEventListener('click', () => this.hideModal());
        document.querySelector('.otp-modal-copy-btn')?.addEventListener('click', async () => {
            const code = await (window as any).api.generateTOTP(account.secret);
            await navigator.clipboard.writeText(code);
            this.showToast("Code copied!", "success");
        });

        // Live update the modal timer
        const modalInterval = setInterval(async () => {
            const overlay = document.getElementById('modal-overlay');
            if (!overlay?.classList.contains('show')) { clearInterval(modalInterval); return; }
            const rem = await (window as any).api.getRemainingSeconds();
            const newOtp = await (window as any).api.generateTOTP(account.secret);
            const newFormatted = newOtp.substring(0, 3) + ' ' + newOtp.substring(3);
            const codeEl = overlay.querySelector('.otp-modal-code') as HTMLElement;
            const timerEl = overlay.querySelector('.otp-modal-timer') as HTMLElement;
            const circle = overlay.querySelector('.otp-modal-circle') as SVGCircleElement;
            if (codeEl) codeEl.textContent = newFormatted;
            if (timerEl) {
                timerEl.textContent = `${rem}s`;
                timerEl.style.color = rem <= 5 ? '#ff3b30' : 'var(--text-secondary)';
            }
            if (circle) {
                const circ = 2 * Math.PI * 54;
                circle.style.strokeDashoffset = String(circ - (rem / 30) * circ);
                circle.style.stroke = rem <= 5 ? '#ff3b30' : 'var(--accent-primary)';
            }
        }, 1000);
    }

    private showImportPasswordModal(data: any) {
        // Verify backup file first
        const verification = (window as any).api.verifyBackupFile(data);
        
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
            <div style="padding: clamp(24px, 5vw, 40px); max-width: 600px; margin: 0 auto;">
                <!-- Header -->
                <div style="display: flex; align-items: flex-start; gap: 20px; margin-bottom: 28px;">
                    <div class="account-icon nm-icon-large" style="width: 72px; height: 72px; flex-shrink: 0;">
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
                    <input type="password" id="import-pass" class="form-input" placeholder="Enter your master password" ${!verification.valid ? 'disabled' : ''} style="width: 100%; height: 52px; font-size: 15px;">
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

        document.getElementById('cancel-import')?.addEventListener('click', () => this.hideModal());
        
        if (verification.valid) {
            document.getElementById('confirm-import')?.addEventListener('click', async () => {
                const pass = (document.getElementById('import-pass') as HTMLInputElement).value;
                if (!pass) {
                    this.showToast("Password required", "error");
                    return;
                }
                
                // Show warning if checksum is invalid
                if (verification.hasChecksum && !verification.checksumValid) {
                    const confirmed = confirm("Warning: Backup file integrity check failed. The file may be corrupted or tampered with. Continue anyway?");
                    if (!confirmed) return;
                }
                
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
                    this.showToast("Vault successfully restored!", "success");
                    await this.refreshAccounts();
                } else {
                    this.showToast(res.message, "error");
                }
            });
        }
    }
    
    private showExportOptionsModal() {
        const content = `
            <div class="custom-scrollbar" style="max-height: 85vh; overflow-y: auto; padding: clamp(24px, 5vw, 32px); max-width: 580px; margin: 0 auto;">
                <!-- Header -->
                <div style="display: flex; align-items: flex-start; gap: 18px; margin-bottom: 24px;">
                    <div class="account-icon nm-icon-large" style="width: 64px; height: 64px; flex-shrink: 0;">
                        <i class="fa-solid fa-download" style="font-size: 28px;"></i>
                    </div>
                    <div style="flex: 1; min-width: 0;">
                        <h2 style="font-weight: 900; font-size: clamp(20px, 4vw, 24px); color: var(--text-primary); margin: 0 0 6px 0; line-height: 1.2;">Export Vault</h2>
                        <p style="font-size: 12px; color: var(--text-secondary); font-weight: 600; line-height: 1.4;">Choose your preferred export format</p>
                    </div>
                </div>
                
                <!-- Export Format Options -->
                <div style="display: grid; gap: 10px; margin-bottom: 20px;">
                    <!-- Full Encrypted Backup -->
                    <button class="export-option-card" data-format="encrypted" style="display: flex; align-items: center; gap: 14px; padding: 14px; background: var(--bg-primary); border: 2px solid transparent; border-radius: 12px; box-shadow: var(--nm-shadow-out); cursor: pointer; transition: all 0.2s ease; text-align: left; width: 100%;">
                        <div class="export-option-icon">
                            <i class="fa-solid fa-lock" style="font-size: 18px; color: var(--accent-primary);"></i>
                        </div>
                        <div style="flex: 1; min-width: 0;">
                            <div style="font-size: 14px; font-weight: 800; color: var(--text-primary); margin-bottom: 3px;">Full Encrypted Backup</div>
                            <div style="font-size: 11px; color: var(--text-secondary); font-weight: 600; line-height: 1.3;">Complete vault with settings (.keyra)</div>
                        </div>
                        <div class="export-check" style="width: 22px; height: 22px; border-radius: 50%; border: 2px solid var(--text-secondary); display: flex; align-items: center; justify-content: center; opacity: 0; transition: all 0.2s ease;">
                            <i class="fa-solid fa-check" style="font-size: 11px; color: var(--success);"></i>
                        </div>
                    </button>
                    
                    <!-- QR Codes PDF -->
                    <button class="export-option-card" data-format="qr-pdf" style="display: flex; align-items: center; gap: 14px; padding: 14px; background: var(--bg-primary); border: 2px solid transparent; border-radius: 12px; box-shadow: var(--nm-shadow-out); cursor: pointer; transition: all 0.2s ease; text-align: left; width: 100%;">
                        <div class="export-option-icon">
                            <i class="fa-solid fa-qrcode" style="font-size: 18px; color: var(--accent-primary);"></i>
                        </div>
                        <div style="flex: 1; min-width: 0;">
                            <div style="font-size: 14px; font-weight: 800; color: var(--text-primary); margin-bottom: 3px;">QR Codes (PDF)</div>
                            <div style="font-size: 11px; color: var(--text-secondary); font-weight: 600; line-height: 1.3;">Printable QR codes for each account</div>
                        </div>
                        <div class="export-check" style="width: 22px; height: 22px; border-radius: 50%; border: 2px solid var(--text-secondary); display: flex; align-items: center; justify-content: center; opacity: 0; transition: all 0.2s ease;">
                            <i class="fa-solid fa-check" style="font-size: 11px; color: var(--success);"></i>
                        </div>
                    </button>
                    
                    <!-- Plain JSON -->
                    <button class="export-option-card" data-format="json" style="display: flex; align-items: center; gap: 14px; padding: 14px; background: var(--bg-primary); border: 2px solid transparent; border-radius: 12px; box-shadow: var(--nm-shadow-out); cursor: pointer; transition: all 0.2s ease; text-align: left; width: 100%;">
                        <div class="export-option-icon">
                            <i class="fa-solid fa-file-code" style="font-size: 18px; color: #ff9500;"></i>
                        </div>
                        <div style="flex: 1; min-width: 0;">
                            <div style="font-size: 14px; font-weight: 800; color: var(--text-primary); margin-bottom: 3px;">Plain JSON</div>
                            <div style="font-size: 11px; color: var(--text-secondary); font-weight: 600; line-height: 1.3;">Unencrypted JSON for migration (.json)</div>
                        </div>
                        <div class="export-check" style="width: 22px; height: 22px; border-radius: 50%; border: 2px solid var(--text-secondary); display: flex; align-items: center; justify-content: center; opacity: 0; transition: all 0.2s ease;">
                            <i class="fa-solid fa-check" style="font-size: 11px; color: var(--success);"></i>
                        </div>
                    </button>
                    
                    <!-- Text File -->
                    <button class="export-option-card" data-format="text" style="display: flex; align-items: center; gap: 14px; padding: 14px; background: var(--bg-primary); border: 2px solid transparent; border-radius: 12px; box-shadow: var(--nm-shadow-out); cursor: pointer; transition: all 0.2s ease; text-align: left; width: 100%;">
                        <div class="export-option-icon">
                            <i class="fa-solid fa-file-lines" style="font-size: 18px; color: var(--text-secondary);"></i>
                        </div>
                        <div style="flex: 1; min-width: 0;">
                            <div style="font-size: 14px; font-weight: 800; color: var(--text-primary); margin-bottom: 3px;">Text File</div>
                            <div style="font-size: 11px; color: var(--text-secondary); font-weight: 600; line-height: 1.3;">Human-readable text format (.txt)</div>
                        </div>
                        <div class="export-check" style="width: 22px; height: 22px; border-radius: 50%; border: 2px solid var(--text-secondary); display: flex; align-items: center; justify-content: center; opacity: 0; transition: all 0.2s ease;">
                            <i class="fa-solid fa-check" style="font-size: 11px; color: var(--success);"></i>
                        </div>
                    </button>
                </div>
                
                <!-- Account Selection Toggle -->
                <div id="export-selection-container" style="background: var(--bg-primary); border-radius: 12px; padding: 14px; box-shadow: var(--nm-shadow-in-sm); margin-bottom: 20px; display: none;">
                    <div style="display: flex; align-items: center; justify-content: space-between;">
                        <div style="flex: 1; min-width: 0; margin-right: 12px;">
                            <div style="font-size: 13px; font-weight: 800; color: var(--text-primary); margin-bottom: 3px;">Export Selection</div>
                            <div style="font-size: 11px; color: var(--text-secondary); font-weight: 600;">Choose specific accounts or export all</div>
                        </div>
                        <label class="switch" style="flex-shrink: 0;">
                            <input type="checkbox" id="export-selective" checked>
                            <span class="slider round"></span>
                        </label>
                    </div>
                    <div id="export-accounts-list" style="display: none; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--bg-secondary);">
                        <!-- Account checkboxes will be inserted here -->
                    </div>
                </div>
                
                <!-- Action Buttons -->
                <div style="display: flex; gap: 10px;">
                    <button class="btn-primary" id="confirm-export" style="flex: 2; height: 52px; font-size: 14px; font-weight: 800; border-radius: 12px;">
                        <i class="fa-solid fa-download"></i>
                        <span>Export Vault</span>
                    </button>
                    <button class="user-button" id="cancel-export" style="flex: 1; justify-content: center; height: 52px; font-weight: 800; border-radius: 12px;">Cancel</button>
                </div>
            </div>
        `;
        
        this.showModal(content);
        
        let selectedFormat = 'encrypted';
        
        // Get the selection container
        const selectionContainer = document.getElementById('export-selection-container');
        
        // Handle format selection
        document.querySelectorAll('.export-option-card').forEach(card => {
            card.addEventListener('click', () => {
                document.querySelectorAll('.export-option-card').forEach(c => {
                    (c as HTMLElement).style.borderColor = 'transparent';
                    (c as HTMLElement).style.boxShadow = 'var(--nm-shadow-out)';
                    (c as HTMLElement).classList.remove('selected');
                    const check = c.querySelector('.export-check') as HTMLElement;
                    if (check) check.style.opacity = '0';
                });
                
                (card as HTMLElement).style.borderColor = 'var(--accent-primary)';
                (card as HTMLElement).style.boxShadow = '0 0 0 3px rgba(var(--accent-rgb), 0.15)';
                (card as HTMLElement).classList.add('selected');
                const check = card.querySelector('.export-check') as HTMLElement;
                if (check) {
                    check.style.opacity = '1';
                    check.style.borderColor = 'var(--accent-primary)';
                    check.style.background = 'var(--accent-primary)';
                }
                
                selectedFormat = card.getAttribute('data-format') || 'encrypted';
                
                // Show/hide selection container based on format
                if (selectionContainer) {
                    if (selectedFormat === 'encrypted') {
                        selectionContainer.style.display = 'none';
                    } else {
                        selectionContainer.style.display = 'block';
                    }
                }
            });
        });
        
        // Select first option by default
        const firstCard = document.querySelector('.export-option-card') as HTMLElement;
        if (firstCard) firstCard.click();
        
        // Handle selective export toggle
        const selectiveToggle = document.getElementById('export-selective') as HTMLInputElement;
        const accountsList = document.getElementById('export-accounts-list');
        
        selectiveToggle?.addEventListener('change', () => {
            if (accountsList) {
                if (selectiveToggle.checked) {
                    accountsList.style.display = 'none';
                } else {
                    accountsList.style.display = 'block';
                    // Populate accounts list
                    accountsList.innerHTML = this.accounts.map(acc => `
                        <label style="display: flex; align-items: center; gap: 10px; padding: 10px 12px; background: var(--bg-secondary); border-radius: 10px; margin-bottom: 6px; cursor: pointer; transition: all 0.2s ease;">
                            <input type="checkbox" class="export-account-check" data-id="${acc.id}" checked style="width: 16px; height: 16px; cursor: pointer; accent-color: var(--accent-primary);">
                            <div style="flex: 1; min-width: 0;">
                                <div style="font-size: 13px; font-weight: 700; color: var(--text-primary); margin-bottom: 2px;">${acc.issuer}</div>
                                <div style="font-size: 10px; color: var(--text-secondary); font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${acc.account}</div>
                            </div>
                        </label>
                    `).join('');
                }
            }
        });
        
        // Handle export
        document.getElementById('confirm-export')?.addEventListener('click', async () => {
            const exportAll = selectiveToggle?.checked !== false;
            let accountsToExport = this.accounts;
            
            if (!exportAll) {
                const selectedIds = Array.from(document.querySelectorAll('.export-account-check:checked'))
                    .map(cb => (cb as HTMLInputElement).getAttribute('data-id'));
                accountsToExport = this.accounts.filter(acc => selectedIds.includes(acc.id));
                
                if (accountsToExport.length === 0) {
                    this.showToast("Please select at least one account", "error");
                    return;
                }
            }
            
            this.hideModal();
            await this.performExport(selectedFormat, accountsToExport);
        });
        
        document.getElementById('cancel-export')?.addEventListener('click', () => this.hideModal());
    }
    
    private async performExport(format: string, accounts: any[]) {
        this.setLoading(true, "Exporting Vault", "PREPARING SECURE EXPORT");
        
        try {
            switch (format) {
                case 'encrypted':
                    await this.exportEncrypted();
                    break;
                case 'qr-pdf':
                    await this.exportQRCodesPDF(accounts);
                    break;
                case 'json':
                    await this.exportJSON(accounts);
                    break;
                case 'text':
                    await this.exportText(accounts);
                    break;
            }
            
            this.showToast("Export completed successfully!", "success");
            this.updateLastActivity('Exported vault');
        } catch (error) {
            console.error("Export failed:", error);
            this.showToast("Export failed. Please try again.", "error");
        } finally {
            this.setLoading(false);
        }
    }
    
    private async exportEncrypted() {
        const res = await (window as any).api.exportVault();
        if (!res.success && res.message) {
            throw new Error(res.message);
        }
    }
    
    private async exportQRCodesPDF(accounts: any[]) {
        // Generate QR codes and create PDF
        const qrCodes = await Promise.all(accounts.map(async (acc) => {
            const uri = `otpauth://totp/${encodeURIComponent(acc.issuer)}:${encodeURIComponent(acc.account)}?secret=${acc.secret}&issuer=${encodeURIComponent(acc.issuer)}`;
            return { account: acc, uri };
        }));
        
        // Create HTML for PDF generation
        let html = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Keyra Vault - QR Codes</title>
                <style>
                    body { font-family: Arial, sans-serif; padding: 40px; }
                    .page-break { page-break-after: always; }
                    .qr-container { margin-bottom: 60px; text-align: center; }
                    .qr-title { font-size: 24px; font-weight: bold; margin-bottom: 10px; }
                    .qr-subtitle { font-size: 16px; color: #666; margin-bottom: 20px; }
                    .qr-code { margin: 20px auto; }
                    .footer { font-size: 12px; color: #999; margin-top: 20px; }
                </style>
                <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
            </head>
            <body>
                <h1 style="text-align: center; margin-bottom: 40px;">Keyra Authenticator - QR Codes Backup</h1>
                <p style="text-align: center; color: #666; margin-bottom: 60px;">Generated on ${new Date().toLocaleString()}</p>
        `;
        
        qrCodes.forEach((item, index) => {
            html += `
                <div class="qr-container ${index < qrCodes.length - 1 ? 'page-break' : ''}">
                    <div class="qr-title">${item.account.issuer}</div>
                    <div class="qr-subtitle">${item.account.account}</div>
                    <div class="qr-code" id="qr-${index}"></div>
                    <div class="footer">Scan this QR code with your authenticator app</div>
                </div>
            `;
        });
        
        html += `
                <script>
                    ${qrCodes.map((item, index) => `
                        new QRCode(document.getElementById('qr-${index}'), {
                            text: '${item.uri}',
                            width: 256,
                            height: 256
                        });
                    `).join('\n')}
                </script>
            </body>
            </html>
        `;
        
        // Create blob and download
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Keyra_QR_Codes_${Date.now()}.html`;
        a.click();
        URL.revokeObjectURL(url);
        
        this.showToast("Open the HTML file and print to PDF", "info");
    }
    
    private async exportJSON(accounts: any[]) {
        const data = accounts.map(acc => ({
            issuer: acc.issuer,
            account: acc.account,
            secret: acc.secret,
            type: 'totp',
            algorithm: 'SHA1',
            digits: 6,
            period: 30
        }));
        
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Keyra_Export_${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }
    
    private async exportText(accounts: any[]) {
        let text = `Keyra Authenticator - Vault Export\n`;
        text += `Generated: ${new Date().toLocaleString()}\n`;
        text += `Total Accounts: ${accounts.length}\n`;
        text += `\n${'='.repeat(60)}\n\n`;
        
        accounts.forEach((acc, index) => {
            text += `${index + 1}. ${acc.issuer}\n`;
            text += `   Account: ${acc.account}\n`;
            text += `   Secret: ${acc.secret}\n`;
            text += `   URI: otpauth://totp/${encodeURIComponent(acc.issuer)}:${encodeURIComponent(acc.account)}?secret=${acc.secret}&issuer=${encodeURIComponent(acc.issuer)}\n`;
            text += `\n`;
        });
        
        text += `${'='.repeat(60)}\n`;
        text += `\nIMPORTANT: Keep this file secure. It contains sensitive authentication data.\n`;
        
        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Keyra_Export_${Date.now()}.txt`;
        a.click();
        URL.revokeObjectURL(url);
    }
}
