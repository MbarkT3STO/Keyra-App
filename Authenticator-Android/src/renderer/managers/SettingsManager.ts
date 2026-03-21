export interface SettingsManagerHost {
    userId: string;
    getStorageKey(key: string): string;
    updateSegmentedUI(containerId: string, value: string): void;
    updateLastActivity(action: string): void;
    showToast(message: string, type: 'info' | 'success' | 'error'): void;
    setTheme(theme: 'light' | 'dark', silent?: boolean): void;
    setThemeMode(mode: 'light' | 'dark' | 'auto', silent?: boolean): void;
    setAccentColor(accentColor: string, silent?: boolean): void;
    updateLockVaultVisibility(): void;
    renderAccounts(): void;
    showPinSetup(): void;
    showPinRemoval(): void;
    tryBiometricUnlock(): Promise<void>;
    showExportOptionsModal(): void;
    showImportPasswordModal(data: any): void;
    loadInitialData(): Promise<void>;
    pushSettings(): Promise<void>;
    pushWebSettings(): Promise<void>;
    // Privacy state — read via PrivacyManager getters on UIManager
    privacyMode: boolean;
    screenGuardian: boolean;
    privacyManager: { applyPrivacyMode(v: boolean, save?: boolean): void; applyScreenGuardian(v: boolean, save?: boolean): void; };
    vaultViewStyle: 'unified' | 'compact' | 'secure';
    currentTheme: 'light' | 'dark';
    themeMode: 'light' | 'dark' | 'auto';
    oledMode: boolean;
    applyOledMode(v: boolean, silent?: boolean): void;
}

export class SettingsManager {
    private host: SettingsManagerHost;

    constructor(host: SettingsManagerHost) {
        this.host = host;
    }

    public init() {
        this.initVaultViewStyle();
        this.initSegmentedStates();
        this.setupSettingsEventListeners();
    }

    public async pushSettings(): Promise<void> {
        return this.host.pushSettings();
    }

    public async pushWebSettings(): Promise<void> {
        return this.host.pushWebSettings();
    }

    public applySettings(settings: any, saveLocal: boolean = true) {
        if (!settings) return;
        const s = settings.Settings || settings;
        const ws = settings['Web Settings'] || settings;

        if (s.themeMode) this.host.setThemeMode(s.themeMode, true);
        else if (s.theme) this.host.setTheme(s.theme, true);
        if (s.accentColor) this.host.setAccentColor(s.accentColor, true);

        // Delegate privacy state to PrivacyManager
        if (s.privacyMode !== undefined) this.host.privacyManager.applyPrivacyMode(!!s.privacyMode, saveLocal);
        if (s.screenGuardian !== undefined) this.host.privacyManager.applyScreenGuardian(!!s.screenGuardian, saveLocal);

        if (s.oledMode !== undefined) this.host.applyOledMode(!!s.oledMode, true);

        if (s.vaultViewStyle && ['unified', 'compact', 'secure'].includes(s.vaultViewStyle)) {
            this.host.vaultViewStyle = s.vaultViewStyle;
        }

        if (saveLocal || settings.vaultPin !== undefined || s.autolock !== undefined) {
            if (s.theme) localStorage.setItem(this.host.getStorageKey('theme'), s.theme);
            if (s.accentColor) localStorage.setItem(this.host.getStorageKey('accent_color'), s.accentColor);
            if (s.vaultViewStyle) localStorage.setItem(this.host.getStorageKey('vault_view_style'), s.vaultViewStyle);

            const finalAutolock = ws.autolock !== undefined ? ws.autolock : s.autolock;
            if (finalAutolock !== undefined) localStorage.setItem(this.host.getStorageKey('autolock'), String(finalAutolock));

            const finalPin = settings.vaultPin !== undefined ? settings.vaultPin : s.vaultPin;
            if (finalPin !== undefined) {
                if (finalPin === null || finalPin === '') {
                    localStorage.removeItem(this.host.getStorageKey('vault_pin'));
                } else {
                    localStorage.setItem(this.host.getStorageKey('vault_pin'), finalPin);
                }
            }
        }

        this.host.updateLockVaultVisibility();
        this.host.renderAccounts();
    }

    public initSegmentedStates() {
        this.host.updateSegmentedUI('theme-segmented', this.host.themeMode);
        const autolock = localStorage.getItem(this.host.getStorageKey('autolock')) || '0';
        this.host.updateSegmentedUI('autolock-segmented', autolock);
        this.updateAutoLockState();
        this.host.updateSegmentedUI('vault-view-segmented', this.host.vaultViewStyle);
    }

    public updateAutoLockState() {
        const hasPin = !!localStorage.getItem(this.host.getStorageKey('vault_pin'));
        const container = document.getElementById('autolock-segmented');
        if (!container) return;

        container.querySelectorAll('.segment').forEach((seg) => {
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

        if (!hasPin) {
            const current = localStorage.getItem(this.host.getStorageKey('autolock')) || '0';
            if (current !== '0') {
                localStorage.setItem(this.host.getStorageKey('autolock'), '0');
                this.host.updateSegmentedUI('autolock-segmented', '0');
                this.pushWebSettings();
            }
        }
    }

    public initVaultViewStyle() {
        const saved = localStorage.getItem(this.host.getStorageKey('vault_view_style')) as any;
        if (saved && ['unified', 'compact', 'secure'].includes(saved)) {
            this.host.vaultViewStyle = saved;
        }
        const globalVessel = document.getElementById('global-timer-vessel');
        if (globalVessel) globalVessel.classList.toggle('hidden', this.host.vaultViewStyle !== 'unified');
    }

    public setupSettingsEventListeners() {
        // Auto-lock
        document.querySelectorAll('#autolock-segmented .segment').forEach(seg => {
            seg.addEventListener('click', (e) => {
                const val = (e.currentTarget as HTMLElement).getAttribute('data-val')!;
                const hasPin = !!localStorage.getItem(this.host.getStorageKey('vault_pin'));
                if (val !== '0' && !hasPin) {
                    this.host.showToast('Please set up a PIN first to enable auto-lock', 'error');
                    return;
                }
                localStorage.setItem(this.host.getStorageKey('autolock'), val);
                this.host.updateSegmentedUI('autolock-segmented', val);
                this.pushWebSettings();
                this.host.showToast(val === '0' ? 'Auto-lock is off' : `Auto-lock set to ${val}m`, 'info');
            });
        });

        // Vault view style
        document.querySelectorAll('#vault-view-segmented .segment').forEach(btn => {
            btn.addEventListener('click', () => {
                const val = btn.getAttribute('data-val') as 'unified' | 'compact' | 'secure';
                if (!val) return;
                this.host.vaultViewStyle = val;
                localStorage.setItem(this.host.getStorageKey('vault_view_style'), val);
                this.host.updateSegmentedUI('vault-view-segmented', val);
                this.pushWebSettings();
                const globalVessel = document.getElementById('global-timer-vessel');
                if (globalVessel) globalVessel.classList.toggle('hidden', val !== 'unified');
                this.host.renderAccounts();
                const labels: Record<string, string> = { unified: 'Unified', compact: 'Compact', secure: 'Secure' };
                this.host.showToast(`View: ${labels[val]}`, 'info');
            });
        });

        // OLED mode toggle
        document.getElementById('oled-mode-toggle')?.addEventListener('change', (e) => {
            const enabled = (e.target as HTMLInputElement).checked;
            this.host.applyOledMode(enabled);
            this.host.showToast(enabled ? 'OLED mode on' : 'OLED mode off', 'info');
        });

        // Biometric toggle
        document.getElementById('biometric-toggle')?.addEventListener('change', (e) => {
            const enabled = (e.target as HTMLInputElement).checked;
            localStorage.setItem(this.host.getStorageKey('biometric_enabled'), String(enabled));
            this.host.showToast(enabled ? 'Biometric unlock enabled' : 'Biometric unlock disabled', 'info');
        });

        // Biometric unlock button
        document.getElementById('btn-biometric-unlock')?.addEventListener('click', () => {
            this.host.tryBiometricUnlock();
        });

        // PIN buttons
        document.getElementById('setup-pin-btn')?.addEventListener('click', () => this.host.showPinSetup());
        document.getElementById('change-pin-btn')?.addEventListener('click', () => this.host.showPinSetup());
        document.getElementById('remove-pin-btn')?.addEventListener('click', () => this.host.showPinRemoval());

        // Export
        document.getElementById('btn-export-vault')?.addEventListener('click', async () => {
            if (document.body.classList.contains('vault-is-locked')) {
                this.host.showToast('Vault Locked - Enter PIN to Access', 'error');
                return;
            }
            this.host.showExportOptionsModal();
        });

        // Import
        document.getElementById('btn-import-vault')?.addEventListener('click', async () => {
            if (document.body.classList.contains('vault-is-locked')) {
                this.host.showToast('Vault Locked - Enter PIN to Access', 'error');
                return;
            }
            const res = await (window as any).api.importVault();
            if (res.success && res.data) {
                this.host.showImportPasswordModal(res.data);
            } else if (res.message) {
                this.host.showToast(res.message, 'error');
            }
        });
    }

    public getSettingsObject(): any {
        const vPin = localStorage.getItem(this.host.getStorageKey('vault_pin'));
        const aLock = localStorage.getItem(this.host.getStorageKey('autolock')) || '0';
        return {
            Settings: {
                theme: this.host.currentTheme,
                themeMode: this.host.themeMode,
                accentColor: localStorage.getItem(this.host.getStorageKey('accent_color')) || 'royal-purple',
                privacyMode: this.host.privacyMode,
                screenGuardian: this.host.screenGuardian,
                oledMode: this.host.oledMode,
                vaultViewStyle: this.host.vaultViewStyle,
                vaultPin: vPin
            },
            'Web Settings': {
                theme: this.host.currentTheme,
                themeMode: this.host.themeMode,
                accentColor: localStorage.getItem(this.host.getStorageKey('accent_color')) || 'royal-purple',
                privacyMode: this.host.privacyMode,
                screenGuardian: this.host.screenGuardian,
                oledMode: this.host.oledMode,
                vaultViewStyle: this.host.vaultViewStyle,
                autolock: aLock,
                vaultPin: vPin
            }
        };
    }
}
