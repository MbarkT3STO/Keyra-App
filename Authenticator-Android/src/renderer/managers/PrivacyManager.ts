export interface PrivacyManagerHost {
    getStorageKey(key: string): string;
    showToast(message: string, type: 'info' | 'success' | 'error'): void;
    renderAccounts(): void;
    pushWebSettings(): Promise<void>;
}

export class PrivacyManager {
    private host: PrivacyManagerHost;

    public privacyMode: boolean = false;
    public screenGuardian: boolean = false;

    constructor(host: PrivacyManagerHost) {
        this.host = host;
    }

    // ─── Init ──────────────────────────────────────────────────────────────────

    public init() {
        this.privacyMode = localStorage.getItem(this.host.getStorageKey('privacyMode')) === 'true';
        this.screenGuardian = localStorage.getItem(this.host.getStorageKey('screenGuardian')) === 'true';

        const privacyToggle = document.getElementById('privacy-mode-toggle') as HTMLInputElement;
        const guardianToggle = document.getElementById('screen-guardian-toggle') as HTMLInputElement;
        if (privacyToggle) privacyToggle.checked = this.privacyMode;
        if (guardianToggle) guardianToggle.checked = this.screenGuardian;

        // Re-apply FLAG_SECURE if it was enabled before (persists across sessions)
        if (this.screenGuardian) {
            this.applyNativeScreenGuardian(true);
        }

        this.setupEventListeners();
        this.initAppStateListener();
    }

    // ─── Apply (called from applySettings on cloud sync) ──────────────────────

    public applyPrivacyMode(value: boolean, saveLocal: boolean = true) {
        this.privacyMode = value;
        const toggle = document.getElementById('privacy-mode-toggle') as HTMLInputElement;
        if (toggle) toggle.checked = value;
        if (saveLocal) localStorage.setItem(this.host.getStorageKey('privacyMode'), String(value));
    }

    public applyScreenGuardian(value: boolean, saveLocal: boolean = true) {
        this.screenGuardian = value;
        const toggle = document.getElementById('screen-guardian-toggle') as HTMLInputElement;
        if (toggle) toggle.checked = value;
        if (saveLocal) localStorage.setItem(this.host.getStorageKey('screenGuardian'), String(value));
        this.applyNativeScreenGuardian(value);
        if (!value) this.hideOverlay();
    }

    // ─── Native FLAG_SECURE (Android) / privacy screen (iOS) ──────────────────

    private applyNativeScreenGuardian(enable: boolean) {
        import('@capacitor-community/privacy-screen').then(({ PrivacyScreen }) => {
            if (enable) {
                PrivacyScreen.enable().catch(() => {/* not available in browser */});
            } else {
                PrivacyScreen.disable().catch(() => {/* not available in browser */});
            }
        }).catch(() => {
            // Plugin not available — web/browser fallback only
        });
    }

    // ─── Overlay ───────────────────────────────────────────────────────────────

    public showOverlay() {
        // Don't show if auth screen is visible
        const authVessel = document.getElementById('auth-vessel');
        if (authVessel && !authVessel.classList.contains('hidden')) return;
        document.getElementById('privacy-blur-overlay')?.classList.remove('hidden');
    }

    public hideOverlay() {
        document.getElementById('privacy-blur-overlay')?.classList.add('hidden');
    }

    // ─── App state (background/foreground) ────────────────────────────────────
    // FLAG_SECURE handles screenshots/recordings natively.
    // The overlay is a belt-and-suspenders guard for the brief moment
    // the app is transitioning to background (before FLAG_SECURE kicks in
    // for the app switcher thumbnail).

    private initAppStateListener() {
        import('@capacitor/app').then(({ App }) => {
            App.addListener('appStateChange', ({ isActive }) => {
                if (!isActive) {
                    if (this.screenGuardian) this.showOverlay();
                    // Lock on background if setting is enabled and vault is not already locked
                    const lockOnBg = localStorage.getItem(this.host.getStorageKey('lockOnBackground')) === 'true';
                    const isLocked = document.body.classList.contains('vault-is-locked');
                    const hasPin = !!localStorage.getItem(this.host.getStorageKey('vault_pin'));
                    if (lockOnBg && hasPin && !isLocked) {
                        (window as any).ui?.lockVault();
                    }
                } else {
                    this.hideOverlay();
                }
            });
        }).catch(() => {
            // Browser fallback: Page Visibility API
            document.addEventListener('visibilitychange', () => {
                if (document.hidden) {
                    if (this.screenGuardian) this.showOverlay();
                    const lockOnBg = localStorage.getItem(this.host.getStorageKey('lockOnBackground')) === 'true';
                    const isLocked = document.body.classList.contains('vault-is-locked');
                    const hasPin = !!localStorage.getItem(this.host.getStorageKey('vault_pin'));
                    if (lockOnBg && hasPin && !isLocked) {
                        (window as any).ui?.lockVault();
                    }
                } else {
                    this.hideOverlay();
                }
            });
        });
    }

    // ─── Settings event listeners ──────────────────────────────────────────────

    private setupEventListeners() {
        document.getElementById('privacy-mode-toggle')?.addEventListener('change', (e) => {
            const enabled = (e.target as HTMLInputElement).checked;
            this.applyPrivacyMode(enabled);
            this.host.pushWebSettings();
            this.host.renderAccounts();
            this.host.showToast(enabled ? 'Codes are now hidden' : 'Codes are now visible', 'info');
        });

        document.getElementById('screen-guardian-toggle')?.addEventListener('change', (e) => {
            const enabled = (e.target as HTMLInputElement).checked;
            this.applyScreenGuardian(enabled);
            this.host.pushWebSettings();
            this.host.showToast(
                enabled ? 'Anti-peek protection is on' : 'Anti-peek protection is off',
                'info'
            );
        });
    }
}
