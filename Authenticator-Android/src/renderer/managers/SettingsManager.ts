export interface SettingsManagerHost {
    userId: string;
    getStorageKey(key: string): string;
    updateSegmentedUI(containerId: string, value: string): void;
    updateLastActivity(action: string): void;
    showToast(message: string, type: 'info' | 'success' | 'error'): void;
    setThemeMode(mode: 'light' | 'dark' | 'auto', silent?: boolean): void;
    setAccentColor(accentColor: string, silent?: boolean): void;
    updateLockVaultVisibility(): void;
    renderAccounts(): void;
    showPinSetup(): void;
    showPinRemoval(): void;
    tryBiometricUnlock(): Promise<void>;
    setupBiometric(): Promise<void>;
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
        // Support both namespaced and flat payloads
        const s = settings['Android Settings'] || settings.Settings || settings;

        if (s.themeMode) this.host.setThemeMode(s.themeMode, true);
        if (s.accentColor) this.host.setAccentColor(s.accentColor, true);

        // Delegate privacy state to PrivacyManager
        if (s.privacyMode !== undefined) this.host.privacyManager.applyPrivacyMode(!!s.privacyMode, saveLocal);
        if (s.screenGuardian !== undefined) this.host.privacyManager.applyScreenGuardian(!!s.screenGuardian, saveLocal);

        if (s.oledMode !== undefined) this.host.applyOledMode(!!s.oledMode, true);

        if (s.vaultViewStyle && ['unified', 'compact', 'secure'].includes(s.vaultViewStyle)) {
            this.host.vaultViewStyle = s.vaultViewStyle;
        }

        if (saveLocal) {
            if (s.accentColor) localStorage.setItem(this.host.getStorageKey('accent_color'), s.accentColor);
            if (s.vaultViewStyle) localStorage.setItem(this.host.getStorageKey('vault_view_style'), s.vaultViewStyle);

            if (s.autolock !== undefined) {
                localStorage.setItem(this.host.getStorageKey('autolock'), String(s.autolock));
            }

            if (s.vaultPin !== undefined) {
                if (s.vaultPin === null || s.vaultPin === '') {
                    localStorage.removeItem(this.host.getStorageKey('vault_pin'));
                } else {
                    localStorage.setItem(this.host.getStorageKey('vault_pin'), s.vaultPin);
                }
            }

            if (s.biometricEnabled !== undefined) {
                localStorage.setItem(this.host.getStorageKey('biometric_enabled'), String(s.biometricEnabled));
            }

            if (s.lockOnBackground !== undefined) {
                localStorage.setItem(this.host.getStorageKey('lockOnBackground'), String(s.lockOnBackground));
                const toggle = document.getElementById('lock-on-background-toggle') as HTMLInputElement;
                if (toggle) toggle.checked = !!s.lockOnBackground;
            }

            if (s.requirePinOnLaunch !== undefined) {
                localStorage.setItem(this.host.getStorageKey('requirePinOnLaunch'), String(s.requirePinOnLaunch));
                const toggle = document.getElementById('require-pin-launch-toggle') as HTMLInputElement;
                if (toggle) toggle.checked = !!s.requirePinOnLaunch;
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

        // Restore lock-on-background and require-pin-on-launch toggle states
        const lockOnBg = localStorage.getItem(this.host.getStorageKey('lockOnBackground')) === 'true';
        const requirePin = localStorage.getItem(this.host.getStorageKey('requirePinOnLaunch')) === 'true';
        const lockOnBgToggle = document.getElementById('lock-on-background-toggle') as HTMLInputElement;
        const requirePinToggle = document.getElementById('require-pin-launch-toggle') as HTMLInputElement;
        if (lockOnBgToggle) lockOnBgToggle.checked = lockOnBg;
        if (requirePinToggle) requirePinToggle.checked = requirePin;
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
            // Disable biometric if PIN is removed
            const biometricToggle = document.getElementById('biometric-toggle') as HTMLInputElement;
            if (biometricToggle && biometricToggle.checked) {
                biometricToggle.checked = false;
                localStorage.removeItem(this.host.getStorageKey('biometric_enabled'));
            }
            // Disable lock-on-background and require-pin-on-launch if PIN is removed
            const lockOnBgToggle = document.getElementById('lock-on-background-toggle') as HTMLInputElement;
            if (lockOnBgToggle && lockOnBgToggle.checked) {
                lockOnBgToggle.checked = false;
                localStorage.removeItem(this.host.getStorageKey('lockOnBackground'));
            }
            const requirePinToggle = document.getElementById('require-pin-launch-toggle') as HTMLInputElement;
            if (requirePinToggle && requirePinToggle.checked) {
                requirePinToggle.checked = false;
                localStorage.removeItem(this.host.getStorageKey('requirePinOnLaunch'));
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
            const hasPin = !!localStorage.getItem(this.host.getStorageKey('vault_pin'));
            if (enabled && !hasPin) {
                (e.target as HTMLInputElement).checked = false;
                this.host.showToast('Set up a PIN first to enable biometric unlock', 'error');
                return;
            }
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

        // Lock on Background toggle
        document.getElementById('lock-on-background-toggle')?.addEventListener('change', (e) => {
            const enabled = (e.target as HTMLInputElement).checked;
            const hasPin = !!localStorage.getItem(this.host.getStorageKey('vault_pin'));
            if (enabled && !hasPin) {
                (e.target as HTMLInputElement).checked = false;
                this.host.showToast('Set up a PIN first to enable this', 'error');
                return;
            }
            localStorage.setItem(this.host.getStorageKey('lockOnBackground'), String(enabled));
            this.pushWebSettings();
            this.host.showToast(enabled ? 'Vault locks when app goes to background' : 'Background lock off', 'info');
        });

        // Require PIN on Launch toggle
        document.getElementById('require-pin-launch-toggle')?.addEventListener('change', (e) => {
            const enabled = (e.target as HTMLInputElement).checked;
            const hasPin = !!localStorage.getItem(this.host.getStorageKey('vault_pin'));
            if (enabled && !hasPin) {
                (e.target as HTMLInputElement).checked = false;
                this.host.showToast('Set up a PIN first to enable this', 'error');
                return;
            }
            localStorage.setItem(this.host.getStorageKey('requirePinOnLaunch'), String(enabled));
            this.pushWebSettings();
            this.host.showToast(enabled ? 'PIN required on every launch' : 'PIN on launch off', 'info');
        });

        // Check for updates
        document.getElementById('btn-check-updates')?.addEventListener('click', () => {
            (window as any).__updateManager?.checkManually();
        });
    }

    public getSettingsObject(): any {
        const vPin = localStorage.getItem(this.host.getStorageKey('vault_pin'));
        const aLock = localStorage.getItem(this.host.getStorageKey('autolock')) || '0';
        const accentColor = localStorage.getItem(this.host.getStorageKey('accent_color')) || 'royal-purple';

        return {
            'Android Settings': {
                themeMode: this.host.themeMode,
                accentColor,
                privacyMode: this.host.privacyMode,
                screenGuardian: this.host.screenGuardian,
                oledMode: this.host.oledMode,
                vaultViewStyle: this.host.vaultViewStyle,
                autolock: aLock,
                vaultPin: vPin,
                biometricEnabled: localStorage.getItem(this.host.getStorageKey('biometric_enabled')) === 'true',
                lockOnBackground: localStorage.getItem(this.host.getStorageKey('lockOnBackground')) === 'true',
                requirePinOnLaunch: localStorage.getItem(this.host.getStorageKey('requirePinOnLaunch')) === 'true'
            }
        };
    }
}
