import { syncVault } from './store.js';

export class UIManager {
    private currentTheme: 'light' | 'dark' = 'light';
    private currentTab: 'vault' | 'settings' = 'vault';
    private accounts: any[] = [];
    private timerInterval: any = null;
    private privacyMode: boolean = false;
    private screenGuardian: boolean = false;
    private oledMode: boolean = false;
    private wallpaperPreset: string = 'nebula';
    private isMovingAura: boolean = false;
    private auraX: number = 0;
    private auraY: number = 0;
    private searchQuery: string = '';
    private syncCount: number = 0;
    private liveSyncInterval: any = null;

    constructor(public userId: string = 'default') {
        this.initTheme();
        this.initPrivacyMode();
        this.initScreenGuardian();
        this.initWallpaper();
        this.initSegmentedStates();
        this.setupEventListeners();
        this.updateLockVaultVisibility();
        this.startTimer();
        this.loadInitialData();
        this.initFromCloud();
        this.startLiveSync();
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

    private async initFromCloud() {
        const user = await (window as any).api.getCurrentUser();
        if (user && user.settings) {
            this.applySettings(user.settings, false);
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
            vaultPin: localStorage.getItem(this.getStorageKey('vault_pin'))
        };
    }

    public async pushSettings() {
        this.setSyncing(true);
        try {
            const settings = this.getSettingsObject();
            await (window as any).api.updateUserSettings(settings);
        } finally {
            this.setSyncing(false);
        }
    }

    public applySettings(settings: any, saveLocal: boolean = true) {
        if (!settings) return;

        if (settings.theme) this.setTheme(settings.theme, true);
        if (settings.accentColor) this.setAccentColor(settings.accentColor, true);
        if (settings.wallpaperPreset) this.applyWallpaper(settings.wallpaperPreset, true);

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

        if (saveLocal) {
            if (settings.theme) localStorage.setItem(this.getStorageKey('theme'), settings.theme);
            if (settings.accentColor) localStorage.setItem(this.getStorageKey('accent_color'), settings.accentColor);
            if (settings.wallpaperPreset) localStorage.setItem(this.getStorageKey('wallpaperPreset'), settings.wallpaperPreset);
            localStorage.setItem(this.getStorageKey('privacyMode'), String(this.privacyMode));
            localStorage.setItem(this.getStorageKey('screenGuardian'), String(this.screenGuardian));
            if (settings.autolock !== undefined) localStorage.setItem(this.getStorageKey('autolock'), String(settings.autolock));
            localStorage.setItem(this.getStorageKey('oled_mode'), String(this.oledMode));
            if (settings.vaultPin) localStorage.setItem(this.getStorageKey('vault_pin'), settings.vaultPin);
        }

        this.updateLockVaultVisibility();
        this.renderAccounts();
    }

    private initTheme() {
        const savedTheme = localStorage.getItem(this.getStorageKey('theme')) as 'light' | 'dark' || 'light';
        this.setTheme(savedTheme, true);
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
            'solar-orange': 15
        };

        const hue = accentHues[accentColor];
        if (hue) {
            root.style.setProperty('--dynamic-accent-hue', hue.toString());
            root.style.setProperty('--accent-primary', `hsl(${hue}, 100%, 68%)`);
            root.style.setProperty('--accent-secondary', `hsl(${hue + 20}, 100%, 75%)`);
            root.style.setProperty('--accent-hover', `hsl(${hue}, 100%, 62%)`);
            root.style.setProperty('--accent-soft', `hsla(${hue}, 100%, 68%, 0.12)`);

            root.style.setProperty('--aura-1', `hsla(${hue}, 100%, 68%, 0.35)`);
            root.style.setProperty('--aura-2', `hsla(${hue + 30}, 100%, 75%, 0.25)`);
            root.style.setProperty('--aura-3', `hsla(${hue - 30}, 100%, 75%, 0.25)`);

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

    private initWallpaper() {
        this.wallpaperPreset = localStorage.getItem(this.getStorageKey('wallpaperPreset')) || 'nebula';
        this.applyWallpaper(this.wallpaperPreset, true);
        document.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    }

    private applyWallpaper(preset: string, silent: boolean = false) {
        this.wallpaperPreset = preset;
        localStorage.setItem(this.getStorageKey('wallpaperPreset'), preset);

        document.querySelectorAll('.wallpaper-card').forEach(card => {
            card.classList.toggle('active', card.getAttribute('data-preset') === preset);
        });

        const root = document.documentElement;
        if (preset === 'nebula') {
            const hue = parseInt(root.style.getPropertyValue('--dynamic-accent-hue') || '258');
            root.style.setProperty('--aura-1', `hsla(${hue}, 100%, 68%, 0.35)`);
            root.style.setProperty('--aura-2', `hsla(${hue + 30}, 100%, 75%, 0.25)`);
            root.style.setProperty('--aura-3', `hsla(${hue - 30}, 100%, 75%, 0.25)`);
        } else {
            root.style.setProperty('--aura-1', `var(--${preset}-1)`);
            root.style.setProperty('--aura-2', `var(--${preset}-2)`);
            root.style.setProperty('--aura-3', `var(--${preset}-3)`);
        }

        if (!silent) this.pushSettings();
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
                const tabName = target.getAttribute('data-tab') as 'vault' | 'settings';
                this.switchTab(tabName);
                this.updateLastActivity(`Switched to ${tabName}`);
            });
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

        // Wallpaper Presets
        document.querySelectorAll('.wallpaper-card').forEach(card => {
            card.addEventListener('click', (e) => {
                const target = e.currentTarget as HTMLElement;
                const preset = target.getAttribute('data-preset')!;
                this.applyWallpaper(preset);
                this.showToast(`Wallpaper Switched: ${preset.charAt(0).toUpperCase() + preset.slice(1)}`, "info");
                this.updateLastActivity(`Changed wallpaper to ${preset}`);
            });
        });

        // Cloud Sync Controls
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
                this.showImportPasswordModal(res.data.salt, res.data.encryptedVaultData);
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
            this.updateLastActivity('Manual Cloud Sync');
            if (statusDesc) statusDesc.textContent = 'Synchronized';
        } catch (err) {
            this.showToast("Sync Failed", "error");
            if (statusDesc) statusDesc.textContent = 'Sync Failed';
        } finally {
            if (icon) icon.classList.remove('sync-spin');
            this.setSyncing(false);
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
        if (!lastActivityElement) return;

        const lastActivity = localStorage.getItem(this.getStorageKey('last_activity'));
        const lastAction = localStorage.getItem(this.getStorageKey('last_action')) || 'No activity';

        if (lastActivity) {
            const date = new Date(lastActivity);
            const diffMins = Math.floor((new Date().getTime() - date.getTime()) / 60000);

            let timeAgo = 'Just now';
            if (diffMins >= 1 && diffMins < 60) timeAgo = `${diffMins}m ago`;
            else if (diffMins >= 60 && diffMins < 1440) timeAgo = `${Math.floor(diffMins / 60)}h ago`;
            else if (diffMins >= 1440) timeAgo = `${Math.floor(diffMins / 1440)}d ago`;

            lastActivityElement.textContent = timeAgo;
        }
        if (lastActionElement) lastActionElement.textContent = lastAction;
    }

    private switchTab(tab: 'vault' | 'settings') {
        this.currentTab = tab;
        document.querySelectorAll('.nav-tab').forEach(t => t.classList.toggle('active', t.getAttribute('data-tab') === tab));
        document.getElementById('vault-view')?.classList.toggle('hidden', tab !== 'vault');
        document.getElementById('settings-view')?.classList.toggle('hidden', tab !== 'settings');
        if (tab === 'settings') this.updateLastActivityDisplay();
        this.refreshLucide();
    }

    public async refreshAccounts() {
        this.accounts = await (window as any).api.getAccounts();
        this.renderAccounts();
    }

    private renderAccounts() {
        const grid = document.getElementById('accounts-grid');
        const emptyState = document.getElementById('empty-state');
        if (!grid || !emptyState) return;

        const filtered = this.accounts.filter(acc =>
            acc.issuer.toLowerCase().includes(this.searchQuery) ||
            acc.account.toLowerCase().includes(this.searchQuery)
        );

        if (this.accounts.length === 0) {
            grid.classList.add('hidden');
            emptyState.classList.remove('hidden');
        } else {
            grid.classList.remove('hidden');
            emptyState.classList.add('hidden');
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

    private async updateCardOTP(card: HTMLElement, secret: string) {
        const codeElement = card.querySelector('.otp-code');
        if (!codeElement) return;

        const otp = await (window as any).api.generateTOTP(secret);
        if (!this.privacyMode) {
            codeElement.textContent = otp.substring(0, 3) + ' ' + otp.substring(3);
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
        const toast = document.createElement('div');
        toast.className = 'toast animate-fade-in ' + type;
        toast.innerHTML = `<span>${message}</span>`;
        container.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 400);
        }, 3000);
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
        const content = `
            <div style="padding: var(--space-lg);">
                <div class="modal-header">
                    <div class="modal-icon-vessel">
                        <i data-lucide="shield-check"></i>
                    </div>
                    <div class="modal-title-vessel">
                        <h2>Core Security</h2>
                        <p>ESTABLISH A 4-DIGIT VAULT ACCESS KEY</p>
                    </div>
                </div>
                <div class="modal-body">
                    <div class="form-group" style="text-align: center;">
                        <label class="form-label" style="display: inline-block; margin-bottom: 12px;">Establish PIN Code</label>
                        <input type="password" id="new-pin" maxlength="4" class="form-input" 
                               style="font-size: 36px; text-align: center; letter-spacing: 24px; padding: 24px; height: 80px; font-family: monospace;" 
                               placeholder="••••">
                        <p class="modal-help-text" style="margin-top: 16px;">This PIN will be required to unlock your encrypted local vault.</p>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn-primary" id="save-pin">Activate Key</button>
                    <button class="user-button" id="cancel-pin-btn">Discard</button>
                </div>
            </div>
        `;
        this.showModal(content);
        document.getElementById('save-pin')?.addEventListener('click', () => {
            const pin = (document.getElementById('new-pin') as HTMLInputElement).value;
            if (pin.length === 4) {
                localStorage.setItem(this.getStorageKey('vault_pin'), pin);
                this.pushSettings();
                this.updateLockVaultVisibility();
                this.showToast("PIN established", "success");
                this.hideModal();
            } else this.showToast("4 digits required", "error");
        });
        document.getElementById('cancel-pin-btn')?.addEventListener('click', () => this.hideModal());
    }

    private showAddModal() {
        const content = `
            <div style="padding: var(--space-lg);">
                <div class="modal-header">
                    <div class="modal-icon-vessel">
                        <i data-lucide="plus-circle"></i>
                    </div>
                    <div class="modal-title-vessel">
                        <h2>Initialize Token</h2>
                        <p>SECURE A NEW DIGITAL IDENTITY IN YOUR VAULT</p>
                    </div>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label class="form-label">Service Issuer</label>
                        <input type="text" id="new-issuer" class="form-input" placeholder="e.g. GitHub, Google">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Account Identity</label>
                        <input type="text" id="new-account" class="form-input" placeholder="name@domain.com">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Base32 Secret</label>
                        <input type="text" id="new-secret" class="form-input" placeholder="Enter security key">
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn-primary" id="save-new-account">Verify & Secure</button>
                    <button class="user-button" id="cancel-add-btn">Discard</button>
                </div>
            </div>
        `;
        this.showModal(content);
        document.getElementById('save-new-account')?.addEventListener('click', async () => {
            const issuer = (document.getElementById('new-issuer') as HTMLInputElement).value;
            const account = (document.getElementById('new-account') as HTMLInputElement).value;
            const secret = (document.getElementById('new-secret') as HTMLInputElement).value;
            if (issuer && secret) {
                await (window as any).api.saveAccount({ id: Date.now().toString(), issuer, account, secret });
                await this.refreshAccounts();
                this.hideModal();
                this.showToast("Identity secured", "success");
                this.updateLastActivity('Added new token');
            }
        });
        document.getElementById('cancel-add-btn')?.addEventListener('click', () => this.hideModal());
    }

    private showEditModal(account: any) {
        const content = `
            <div style="padding: var(--space-lg);">
                <div class="modal-header">
                    <div class="modal-icon-vessel">
                        <i data-lucide="settings-2"></i>
                    </div>
                    <div class="modal-title-vessel">
                        <h2>Refine Metadata</h2>
                        <p>UPDATE IDENTITY DETAILS OR SERVICE LABEL</p>
                    </div>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label class="form-label">Service Issuer</label>
                        <input type="text" id="edit-issuer" class="form-input" value="${account.issuer}">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Account Identity</label>
                        <input type="text" id="edit-account" class="form-input" value="${account.account}">
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn-primary" id="update-account">Commit Change</button>
                    <button class="user-button" id="cancel-edit-btn">Discard</button>
                </div>
            </div>
        `;
        this.showModal(content);
        document.getElementById('update-account')?.addEventListener('click', async () => {
            const issuer = (document.getElementById('edit-issuer') as HTMLInputElement).value;
            const accName = (document.getElementById('edit-account') as HTMLInputElement).value;
            if (issuer) {
                await (window as any).api.saveAccount({ ...account, issuer, account: accName });
                await this.refreshAccounts();
                this.hideModal();
                this.showToast("Updated", "success");
                this.updateLastActivity('Edited token');
            }
        });
        document.getElementById('cancel-edit-btn')?.addEventListener('click', () => this.hideModal());
    }

    private showDeleteConfirm(account: any) {
        const content = `
            <div style="padding: var(--space-xl); text-align: center;">
                <div class="modal-header">
                    <div class="modal-icon-vessel" style="background: hsla(0, 100%, 50%, 0.1); border-color: #ff3b30; color: #ff3b30; box-shadow: 0 0 30px rgba(255, 59, 48, 0.2);">
                        <i data-lucide="trash-2"></i>
                    </div>
                    <div class="modal-title-vessel">
                        <h2 style="color: #ff3b30;">Destroy Token?</h2>
                        <p>THIS ACTION IS PERMANENT AND CANNOT BE REVERSED</p>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn-primary" id="confirm-delete" style="background: #ff3b30; box-shadow: 0 8px 32px rgba(255, 59, 48, 0.3);">Confirm Erase</button>
                    <button class="user-button" id="cancel-delete-btn">Cancel</button>
                </div>
            </div>
        `;
        this.showModal(content);
        document.getElementById('confirm-delete')?.addEventListener('click', async () => {
            await (window as any).api.deleteAccount(account.id);
            await this.refreshAccounts();
            this.hideModal();
            this.showToast("Identity destroyed", "info");
            this.updateLastActivity('Deleted token');
        });
        document.getElementById('cancel-delete-btn')?.addEventListener('click', () => this.hideModal());
    }

    private showImportPasswordModal(salt: string, encryptedVaultData: string) {
        const content = `
            <div style="padding: var(--space-lg);">
                <div class="modal-header">
                    <div class="modal-icon-vessel">
                        <i data-lucide="shield-lock"></i>
                    </div>
                    <div class="modal-title-vessel">
                        <h2>Restore Vault</h2>
                        <p>VERIFY MASTER KEY TO IMPORT SECURE BACKUP</p>
                    </div>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label class="form-label">Backup Password</label>
                        <input type="password" id="import-pass" class="form-input" placeholder="••••••••">
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn-primary" id="confirm-import">Restore Identity</button>
                    <button class="user-button" id="cancel-import">Cancel</button>
                </div>
            </div>
        `;
        this.showModal(content);
        document.getElementById('confirm-import')?.addEventListener('click', async () => {
            const pass = (document.getElementById('import-pass') as HTMLInputElement).value;
            const res = await (window as any).api.performVaultImport(salt, encryptedVaultData, pass);
            if (res.success) {
                this.hideModal();
                this.showToast("Restored", "success");
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
            }
            await this.refreshAccounts();
        } catch (err) {
            console.error("Load failed", err);
        }
    }
}
