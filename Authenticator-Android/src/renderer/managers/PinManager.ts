import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { rateLimiter } from '../../core/rateLimiter';

export interface PinManagerHost {
    userId: string;
    getStorageKey(key: string): string;
    showToast(message: string, type: 'info' | 'success' | 'error'): void;
    showModal(content: string): void;
    hideModal(): void;
    pushSettings(): Promise<void>;
    pushWebSettings(): Promise<void>;
    updateLockVaultVisibility(): void;
    updateAutoLockState(): void;
    renderAccounts(): void;
    tryBiometricUnlock(): Promise<void>;
    setupBiometric(): Promise<void>;
    clearAllOTPCodes(): void;
}

export class PinManager {
    private host: PinManagerHost;
    private pinBuffer: string = '';
    private tempPin: string = '';
    private lockoutInterval: any = null;

    constructor(host: PinManagerHost) {
        this.host = host;
    }

    // ─── Lock / Unlock ─────────────────────────────────────────────────────────

    public lockVault() {
        const vessel = document.getElementById('lock-vessel');
        if (!vessel) return;
        vessel.classList.add('show');
        document.body.classList.add('vault-is-locked');

        this.host.clearAllOTPCodes();
        this.updatePinAvatar();

        this.pinBuffer = '';
        this.updatePinDots(0);

        const biometricEnabled = localStorage.getItem(this.host.getStorageKey('biometric_enabled')) === 'true';
        const biometricKey = document.getElementById('btn-biometric-unlock');
        if (biometricKey) biometricKey.classList.toggle('hidden', !biometricEnabled);
        if (biometricEnabled) {
            setTimeout(() => this.host.tryBiometricUnlock(), 400);
        }

        // Check if already locked out from a previous session
        const userId = this.host.userId;
        const existing = rateLimiter.getBlockedUntil('pin', userId);
        if (existing) {
            this.startLockoutCountdown(existing);
        } else {
            this.clearLockoutUI();
        }
    }

    private async updatePinAvatar() {
        const user = await (window as any).api.getCurrentUser();
        if (!user) return;
        const img = document.getElementById('pin-avatar-img') as HTMLImageElement;
        const fallback = document.getElementById('pin-avatar-fallback') as HTMLImageElement;
        if (img && fallback) {
            if (user.profilePicture) {
                img.src = user.profilePicture;
                img.classList.remove('hidden');
                fallback.classList.add('hidden');
            } else {
                img.classList.add('hidden');
                fallback.classList.remove('hidden');
            }
        }
    }

    public handleUnlock() {
        this.validateAndAutoUnlock(this.pinBuffer);
    }

    public async validateAndAutoUnlock(pinValue: string) {
        const pinIn = document.getElementById('unlock-pin') as HTMLInputElement;
        const saved = localStorage.getItem(this.host.getStorageKey('vault_pin'));
        const progressDots = document.querySelectorAll('.pin-input-vessel .pin-dot');

        this.updatePinDots(pinValue.length);

        if (pinValue.length === 4) {
            // Check rate limit before attempting
            const userId = this.host.userId;
            const check = rateLimiter.isAllowed('pin', userId);
            if (!check.allowed) {
                Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => {});
                this.pinBuffer = '';
                if (pinIn) pinIn.value = '';
                this.updatePinDots(0);
                this.startLockoutCountdown(check.blockedUntil);
                return;
            }

            try {
                let isCorrect = false;
                if (saved && saved.length === 4 && /^\d+$/.test(saved)) {
                    isCorrect = (pinValue === saved);
                } else if (saved) {
                    const decrypted = (window as any).api.decryptPIN(saved);
                    isCorrect = (pinValue === decrypted);
                }

                if (isCorrect) {
                    // Success — reset rate limit
                    rateLimiter.reset('pin', userId);
                    this.clearLockoutUI();

                    progressDots.forEach((dot, index) => {
                        setTimeout(() => {
                            dot.classList.remove('filled');
                            dot.classList.add('success');
                        }, index * 80);
                    });
                    setTimeout(() => {
                        document.getElementById('lock-vessel')?.classList.remove('show');
                        document.body.classList.remove('vault-is-locked');
                        this.pinBuffer = '';
                        if (pinIn) pinIn.value = '';
                        progressDots.forEach(dot => dot.classList.remove('filled', 'error', 'success'));
                        this.host.renderAccounts();
                    }, 800);
                    this.host.showToast('Identity Verified', 'success');
                } else {
                    Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => {});

                    // Record failed attempt
                    const result = rateLimiter.recordAttempt('pin', userId);

                    const vessel = document.querySelector('.pin-input-vessel');
                    vessel?.classList.add('animate-shake');
                    progressDots.forEach(dot => { dot.classList.remove('filled'); dot.classList.add('error'); });

                    setTimeout(() => {
                        vessel?.classList.remove('animate-shake');
                        this.pinBuffer = '';
                        if (pinIn) pinIn.value = '';
                        this.updatePinDots(0);
                        progressDots.forEach(dot => dot.classList.remove('filled', 'error', 'success'));
                    }, 1000);

                    if (!result.allowed) {
                        // Just got blocked
                        this.startLockoutCountdown(result.blockedUntil);
                        this.host.showToast(result.message, 'error');
                    } else {
                        const left = result.remainingAttempts;
                        const msg = left <= 2
                            ? `Wrong PIN — ${left} attempt${left !== 1 ? 's' : ''} left`
                            : 'Wrong PIN';
                        this.host.showToast(msg, 'error');
                        this.updatePinWarning(left);
                    }
                }
            } catch (err) {
                console.error('PIN validation error:', err);
                this.host.showToast('PIN validation failed', 'error');
                this.pinBuffer = '';
                if (pinIn) pinIn.value = '';
                this.updatePinDots(0);
                progressDots.forEach(dot => dot.classList.remove('filled', 'error', 'success'));
            }
        }
    }

    // ─── Lockout UI ────────────────────────────────────────────────────────────

    private startLockoutCountdown(until: Date) {
        if (this.lockoutInterval) clearInterval(this.lockoutInterval);
        this.setNumpadDisabled(true);
        this.setForgotPinDisabled(true);

        const tick = () => {
            const remaining = until.getTime() - Date.now();
            if (remaining <= 0) {
                clearInterval(this.lockoutInterval);
                this.lockoutInterval = null;
                this.clearLockoutUI();
                return;
            }
            const mins = Math.floor(remaining / 60000);
            const secs = Math.floor((remaining % 60000) / 1000);
            const label = mins > 0
                ? `Locked — ${mins}m ${secs.toString().padStart(2, '0')}s remaining`
                : `Locked — ${secs}s remaining`;
            this.setPinSubtitle(label, true);
        };

        tick();
        this.lockoutInterval = setInterval(tick, 1000);
    }

    private clearLockoutUI() {
        if (this.lockoutInterval) {
            clearInterval(this.lockoutInterval);
            this.lockoutInterval = null;
        }
        this.setNumpadDisabled(false);
        this.setForgotPinDisabled(false);
        this.setPinSubtitle('Enter your PIN to continue', false);
        this.removePinWarning();
    }

    private setForgotPinDisabled(disabled: boolean) {
        const btn = document.getElementById('btn-forgot-pin') as HTMLButtonElement | null;
        if (!btn) return;
        btn.disabled = disabled;
        btn.style.opacity = disabled ? '0.3' : '';
        btn.style.pointerEvents = disabled ? 'none' : '';
    }

    private setNumpadDisabled(disabled: boolean) {
        const numpad = document.getElementById('pin-numpad');
        if (!numpad) return;
        numpad.querySelectorAll('.pin-key').forEach(k => {
            (k as HTMLButtonElement).disabled = disabled;
            (k as HTMLElement).style.opacity = disabled ? '0.35' : '';
            (k as HTMLElement).style.pointerEvents = disabled ? 'none' : '';
        });
    }

    private setPinSubtitle(text: string, isWarning: boolean) {
        const el = document.querySelector('.pin-subtitle') as HTMLElement | null;
        if (!el) return;
        el.textContent = text;
        el.style.color = isWarning ? 'var(--error, #ff3b30)' : '';
        el.style.fontWeight = isWarning ? '700' : '';
    }

    private updatePinWarning(attemptsLeft: number) {
        let warning = document.getElementById('pin-rate-warning');
        if (!warning) {
            warning = document.createElement('p');
            warning.id = 'pin-rate-warning';
            warning.style.cssText = 'color: var(--error, #ff3b30); font-size: 13px; font-weight: 700; text-align: center; margin-top: 8px; letter-spacing: 0.02em;';
            document.querySelector('.pin-footer-actions')?.before(warning);
        }
        warning.textContent = `${attemptsLeft} attempt${attemptsLeft !== 1 ? 's' : ''} remaining before lockout`;
    }

    private removePinWarning() {
        document.getElementById('pin-rate-warning')?.remove();
    }

    public updatePinDots(filledCount: number, state?: 'error' | 'success') {
        const dots = document.querySelectorAll('.pin-input-vessel .pin-dot');
        dots.forEach((dot, i) => {
            dot.classList.remove('filled', 'error', 'success');
            if (state) dot.classList.add(state);
            else if (i < filledCount) dot.classList.add('filled');
        });
    }

    public clearPinInput() {
        this.pinBuffer = '';
        const pinIn = document.getElementById('unlock-pin') as HTMLInputElement;
        if (pinIn) pinIn.value = '';
        this.updatePinDots(0);
    }

    // ─── Numpad ────────────────────────────────────────────────────────────────

    public setupNumpad() {
        document.querySelectorAll('.pin-key[data-key]').forEach(key => {
            key.addEventListener('click', () => {
                // Block input if currently locked out
                const check = rateLimiter.isAllowed('pin', this.host.userId);
                if (!check.allowed) {
                    this.startLockoutCountdown(check.blockedUntil);
                    return;
                }
                if (this.pinBuffer.length >= 4) return;
                const digit = (key as HTMLElement).getAttribute('data-key')!;
                this.pinBuffer += digit;
                Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
                this.updatePinDots(this.pinBuffer.length);
                this.validateAndAutoUnlock(this.pinBuffer);
            });
        });

        document.getElementById('pin-key-delete')?.addEventListener('click', () => {
            if (this.pinBuffer.length > 0) {
                this.pinBuffer = this.pinBuffer.slice(0, -1);
                Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
                this.updatePinDots(this.pinBuffer.length);
            }
        });
    }

    // ─── PIN Setup ─────────────────────────────────────────────────────────────

    public showPinSetup() {
        this.tempPin = '';
        this.showPinSetupStep1();
    }

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
                        <div class="pin-brand-icon"><i class="fa-solid fa-shield-halved"></i></div>
                        <div>
                            <h2 class="pin-title">Set Master PIN</h2>
                            <p class="pin-subtitle">ESTABLISH 4-DIGIT VAULT KEY</p>
                        </div>
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
                        <button class="user-button pin-cancel-btn" id="pin-step1-cancel">Cancel</button>
                    </div>
                    <p class="modal-help-text" style="text-align: center;">Keep this code safe. It is required to unlock your identities.</p>
                </div>
            </div>
        `;
        this.host.showModal(content);
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
                        <div class="pin-brand-icon"><i class="fa-solid fa-circle-check"></i></div>
                        <div>
                            <h2 class="pin-title">Verify PIN</h2>
                            <p class="pin-subtitle">RE-ENTER KEY TO CONFIRM</p>
                        </div>
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
                    <p class="modal-help-text" style="text-align: center;">Passwords must match exactly to synchronize security.</p>
                </div>
            </div>
        `;
        this.host.showModal(content);
        this.setupPinStep2Events();
    }

    private setupPinStep1Events() {
        const pinField = document.getElementById('pin-step1') as HTMLInputElement;
        const continueBtn = document.getElementById('pin-step1-continue');
        const dots = document.querySelectorAll('.pin-input-vessel .pin-dot');

        pinField?.addEventListener('input', (e) => {
            const val = (e.target as HTMLInputElement).value;
            const numeric = val.replace(/[^0-9]/g, '');
            if (val !== numeric) (e.target as HTMLInputElement).value = numeric;
            dots.forEach((dot, idx) => dot.classList.toggle('filled', idx < numeric.length));
            if (continueBtn) (continueBtn as HTMLButtonElement).disabled = numeric.length !== 4;
        });

        continueBtn?.addEventListener('click', () => {
            if (pinField && pinField.value.length === 4) {
                this.tempPin = pinField.value;
                this.showPinSetupStep2();
            }
        });

        document.getElementById('pin-step1-cancel')?.addEventListener('click', () => this.host.hideModal());
    }

    private setupPinStep2Events() {
        const pinField = document.getElementById('pin-step2') as HTMLInputElement;
        const continueBtn = document.getElementById('pin-step2-continue');
        const dots = document.querySelectorAll('.pin-input-vessel .pin-dot');

        pinField?.addEventListener('input', (e) => {
            const val = (e.target as HTMLInputElement).value;
            const numeric = val.replace(/[^0-9]/g, '');
            if (val !== numeric) (e.target as HTMLInputElement).value = numeric;
            dots.forEach((dot, idx) => dot.classList.toggle('filled', idx < numeric.length));
            if (continueBtn) (continueBtn as HTMLButtonElement).disabled = numeric.length !== 4;
        });

        continueBtn?.addEventListener('click', () => {
            if (pinField && pinField.value.length === 4) {
                if (pinField.value === this.tempPin) {
                    const encrypted = (window as any).api.encryptPIN(this.tempPin);
                    localStorage.setItem(this.host.getStorageKey('vault_pin'), encrypted);
                    this.host.pushWebSettings();
                    this.host.updateLockVaultVisibility();
                    this.host.updateAutoLockState();
                    this.host.setupBiometric().catch(() => {});
                    this.host.showToast('PIN security activated successfully', 'success');
                    this.host.hideModal();
                } else {
                    this.host.showToast('PIN codes do not match. Please try again.', 'error');
                    pinField.value = '';
                    dots.forEach(dot => dot.classList.remove('filled'));
                    if (continueBtn) (continueBtn as HTMLButtonElement).disabled = true;
                }
            }
        });

        document.getElementById('pin-step2-back')?.addEventListener('click', () => this.showPinSetupStep1());
    }

    // ─── PIN Removal ───────────────────────────────────────────────────────────

    public showPinRemoval() {
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
                        <div class="entity-icon"><i class="fa-solid fa-lock"></i></div>
                        <div class="entity-info">
                            <span class="entity-name">Master PIN Policy</span>
                            <span class="entity-label">Active Protection</span>
                        </div>
                    </div>
                    <p class="modal-help-text">Removing the PIN means anyone with access to this device can view your identities. This action is immediate.</p>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn-danger" id="confirm-remove-pin">
                    <i class="fa-solid fa-trash-can"></i>
                    Remove Security
                </button>
                <button class="user-button" id="cancel-remove-pin">Keep PIN Active</button>
            </div>
        `;
        this.host.showModal(content);

        document.getElementById('confirm-remove-pin')?.addEventListener('click', () => {
            localStorage.removeItem(this.host.getStorageKey('vault_pin'));
            localStorage.removeItem(this.host.getStorageKey('biometric_enabled'));
            this.host.pushSettings();
            this.host.updateLockVaultVisibility();
            this.host.updateAutoLockState();
            this.host.setupBiometric().catch(() => {});
            this.host.showToast('PIN security removed', 'info');
            this.host.hideModal();
        });

        document.getElementById('cancel-remove-pin')?.addEventListener('click', () => this.host.hideModal());
    }

    // ─── Forgot PIN ────────────────────────────────────────────────────────────

    public showForgotPinConfirm() {
        const modal = document.getElementById('modal-forgot-pin');
        if (!modal) return;

        const mainView = document.getElementById('forgot-pin-main-view');
        mainView?.classList.remove('hidden');

        const passwordInput = document.getElementById('forgot-pin-password') as HTMLInputElement;
        const passForm = document.getElementById('form-forgot-pin');
        const confirmBtn = document.getElementById('confirm-forgot-pin-btn');
        const errorEl = document.getElementById('forgot-pin-error');

        if (passwordInput) passwordInput.value = '';
        passForm?.classList.add('hidden');
        if (confirmBtn) confirmBtn.innerHTML = '<i class="fa-solid fa-trash-can"></i> Reset PIN & Sign Out';
        if (errorEl) { errorEl.textContent = ''; errorEl.classList.add('hidden'); }

        modal.classList.remove('hidden');
        modal.classList.add('show');

        const showError = (msg: string) => {
            if (errorEl) { errorEl.textContent = msg; errorEl.classList.remove('hidden'); }
        };
        const hideError = () => {
            if (errorEl) { errorEl.textContent = ''; errorEl.classList.add('hidden'); }
        };

        const completePinReset = async () => {
            this.host.showToast('Resetting Security...', 'info');
            localStorage.removeItem(this.host.getStorageKey('vault_pin'));
            await this.host.pushSettings();
            this.host.updateLockVaultVisibility();
            this.host.updateAutoLockState();
            modal.classList.remove('show');
            setTimeout(() => modal.classList.add('hidden'), 300);
            this.host.showToast('Signing Out...', 'info');
            await (window as any).api.logout();
            window.location.reload();
        };

        const confirmHandler = async (e?: Event) => {
            e?.preventDefault();
            const pForm = document.getElementById('form-forgot-pin');
            const pInput = document.getElementById('forgot-pin-password') as HTMLInputElement;
            const cBtn = document.getElementById('confirm-forgot-pin-btn');

            if (pForm?.classList.contains('hidden')) {
                pForm.classList.remove('hidden');
                if (cBtn) cBtn.innerHTML = '<i class="fa-solid fa-check"></i> Confirm Reset & Sign Out';
                setTimeout(() => pInput?.focus(), 100);
                return;
            }

            const password = pInput?.value || '';
            hideError();
            if (!password) { showError('Please enter your master password.'); pInput?.focus(); return; }

            this.host.showToast('Verifying Identity...', 'info');
            try {
                const result = await (window as any).api.verifyMasterPassword(password);
                if (!result.success) { showError(result.message || 'Incorrect password.'); pInput?.select(); return; }
                if (pInput) pInput.value = '';
                await completePinReset();
            } catch {
                showError('An error occurred. Please try again.');
            }
        };

        const cancelHandler = () => {
            const pForm = document.getElementById('form-forgot-pin');
            const pInput = document.getElementById('forgot-pin-password') as HTMLInputElement;
            const cBtn = document.getElementById('confirm-forgot-pin-btn');
            if (pForm && !pForm.classList.contains('hidden')) {
                pForm.classList.add('hidden');
                if (pInput) pInput.value = '';
                if (cBtn) cBtn.innerHTML = '<i class="fa-solid fa-trash-can"></i> Reset PIN & Sign Out';
                hideError();
                return;
            }
            modal.classList.remove('show');
            setTimeout(() => modal.classList.add('hidden'), 300);
            this.clearPinInput();
        };

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

        const form = document.getElementById('form-forgot-pin');
        if (form) {
            const newForm = form.cloneNode(true);
            form.parentNode?.replaceChild(newForm, form);
            newForm.addEventListener('submit', confirmHandler);
        }
    }

    // ─── Migration ─────────────────────────────────────────────────────────────

    public async migratePinToEncrypted() {
        const pin = localStorage.getItem(this.host.getStorageKey('vault_pin'));
        if (pin && pin.length === 4 && /^\d+$/.test(pin)) {
            try {
                const encrypted = (window as any).api.encryptPIN(pin);
                localStorage.setItem(this.host.getStorageKey('vault_pin'), encrypted);
                await this.host.pushWebSettings();
            } catch (err) {
                console.error('PIN migration failed:', err);
            }
        }
    }
}
