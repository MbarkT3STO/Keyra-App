import { rateLimiter } from '../../../core/rateLimiter.js';

export interface PinCallbacks {
    getUserId: () => string;
    getStorageKey: (key: string) => string;
    showToast: (msg: string, type: 'info' | 'success' | 'error') => void;
    setLoading: (show: boolean, title?: string, subtitle?: string) => void;
    showModal: (content: string) => void;
    hideModal: () => void;
    pushSettings: () => Promise<any>;
    updateLockVaultVisibility: () => void;
    updatePinStatus: () => void;
    updateLastActivity: (action: string) => void;
}

export class PinManager {
    constructor(private cb: PinCallbacks) {}

    async migratePin() {
        const pin = localStorage.getItem(this.cb.getStorageKey('vault_pin'));
        if (pin && pin.length === 4 && /^\d+$/.test(pin)) {
            console.log("Migrating legacy plaintext PIN to encrypted storage...");
            try {
                const encrypted = await (window as any).api.encryptPIN(pin);
                localStorage.setItem(this.cb.getStorageKey('vault_pin'), encrypted);
                await this.cb.pushSettings();
                console.log("PIN migration successful");
            } catch (e) {
                console.error("PIN migration failed", e);
            }
        }
    }

    async lockVault() {
        const vessel = document.getElementById('lock-vessel');
        if (!vessel) return;
        try {
            const user = await (window as any).api.getCurrentUser();
            if (user) {
                const pinAvatarImg = document.getElementById('pin-avatar-img') as HTMLImageElement;
                const pinAvatarFallback = document.getElementById('pin-avatar-fallback') as HTMLImageElement;
                const pinGreeting = document.getElementById('pin-greeting');
                if (pinAvatarImg && pinAvatarFallback) {
                    if (user.profilePicture) { pinAvatarImg.src = user.profilePicture; pinAvatarImg.classList.remove('hidden'); pinAvatarFallback.classList.add('hidden'); }
                    else { pinAvatarImg.classList.add('hidden'); pinAvatarFallback.classList.remove('hidden'); }
                }
                if (pinGreeting) pinGreeting.textContent = `Welcome back, ${user.username.split(' ')[0]}`;
            }
        } catch (e) { console.error("Failed to load user for lock screen:", e); }

        vessel.classList.add('show');
        document.body.classList.add('vault-is-locked');
        const pinIn = document.getElementById('unlock-pin') as HTMLInputElement;
        const dots = vessel.querySelectorAll('.pin-dot');
        const forgotPinBtn = document.getElementById('btn-forgot-pin') as HTMLButtonElement;
        const blockedStatus = document.getElementById('pin-blocked-status');
        const blockedText = document.getElementById('pin-blocked-text');
        const pinHelper = vessel.querySelector('.pin-helper') as HTMLElement;

        const rateLimitCheck = rateLimiter.isAllowed('pin', this.cb.getUserId());
        if (!rateLimitCheck.allowed) {
            if (pinIn) { pinIn.disabled = true; pinIn.value = ''; pinIn.placeholder = ''; }
            dots.forEach(dot => { dot.classList.remove('filled', 'success', 'error'); dot.classList.add('blocked'); });
            if (forgotPinBtn) { forgotPinBtn.disabled = true; forgotPinBtn.style.opacity = '0.3'; forgotPinBtn.style.cursor = 'not-allowed'; }
            if (blockedStatus && blockedText && rateLimitCheck.blockMinutes) {
                blockedText.textContent = `Blocked for ${rateLimitCheck.blockMinutes} minute${rateLimitCheck.blockMinutes > 1 ? 's' : ''}`;
                blockedStatus.classList.remove('hidden');
                if (pinHelper) pinHelper.style.display = 'none';
            }
            this.cb.showToast(rateLimitCheck.message || "Too many attempts", "error");
            if (rateLimitCheck.blockMinutes) {
                setTimeout(() => {
                    if (pinIn) { pinIn.disabled = false; pinIn.placeholder = ''; pinIn.focus(); }
                    dots.forEach(dot => dot.classList.remove('blocked'));
                    if (forgotPinBtn) { forgotPinBtn.disabled = false; forgotPinBtn.style.opacity = ''; forgotPinBtn.style.cursor = ''; }
                    if (blockedStatus) blockedStatus.classList.add('hidden');
                    if (pinHelper) pinHelper.style.display = '';
                    this.cb.showToast("You can try again now", "info");
                }, rateLimitCheck.blockMinutes * 60 * 1000);
            }
        } else {
            if (pinIn) { pinIn.disabled = false; pinIn.value = ''; setTimeout(() => pinIn.focus(), 100); }
            dots.forEach(dot => dot.classList.remove('filled', 'success', 'error', 'blocked'));
            if (forgotPinBtn) { forgotPinBtn.disabled = false; forgotPinBtn.style.opacity = ''; forgotPinBtn.style.cursor = ''; }
            if (blockedStatus) blockedStatus.classList.add('hidden');
            if (pinHelper) pinHelper.style.display = '';
        }
    }

    handleUnlock() {
        const pinIn = document.getElementById('unlock-pin') as HTMLInputElement;
        if (pinIn) this.validateAndAutoUnlock(pinIn.value);
    }

    async validateAndAutoUnlock(pinValue: string) {
        const saved = localStorage.getItem(this.cb.getStorageKey('vault_pin'));
        const lockVessel = document.getElementById('lock-vessel');
        const dots = lockVessel?.querySelectorAll('.pin-dot');
        const pinInput = document.getElementById('unlock-pin') as HTMLInputElement;
        const forgotPinBtn = document.getElementById('btn-forgot-pin') as HTMLButtonElement;
        const blockedStatus = document.getElementById('pin-blocked-status');
        const blockedText = document.getElementById('pin-blocked-text');
        const pinHelper = lockVessel?.querySelector('.pin-helper') as HTMLElement;

        const rateLimitCheck = rateLimiter.isAllowed('pin', this.cb.getUserId());
        if (!rateLimitCheck.allowed) {
            if (pinInput) { pinInput.disabled = true; pinInput.value = ''; pinInput.placeholder = ''; }
            if (dots) dots.forEach(dot => { dot.classList.remove('filled', 'error', 'success'); dot.classList.add('blocked'); });
            if (forgotPinBtn) { forgotPinBtn.disabled = true; forgotPinBtn.style.opacity = '0.3'; forgotPinBtn.style.cursor = 'not-allowed'; }
            if (blockedStatus && blockedText && rateLimitCheck.blockMinutes) {
                blockedText.textContent = `Blocked for ${rateLimitCheck.blockMinutes} minute${rateLimitCheck.blockMinutes > 1 ? 's' : ''}`;
                blockedStatus.classList.remove('hidden');
                if (pinHelper) pinHelper.style.display = 'none';
            }
            this.cb.showToast(rateLimitCheck.message || "Too many attempts", "error");
            if (rateLimitCheck.blockMinutes) {
                setTimeout(() => {
                    if (pinInput) { pinInput.disabled = false; pinInput.placeholder = ''; pinInput.focus(); }
                    if (dots) dots.forEach(dot => dot.classList.remove('blocked'));
                    if (forgotPinBtn) { forgotPinBtn.disabled = false; forgotPinBtn.style.opacity = ''; forgotPinBtn.style.cursor = ''; }
                    if (blockedStatus) blockedStatus.classList.add('hidden');
                    if (pinHelper) pinHelper.style.display = '';
                    this.cb.showToast("You can try again now", "info");
                }, rateLimitCheck.blockMinutes * 60 * 1000);
            }
            return;
        }

        if (dots) dots.forEach((dot, i) => dot.classList.toggle('filled', i < pinValue.length));

        if (pinValue.length === 4) {
            let isCorrect = false;
            try {
                if (saved) {
                    if (saved.length === 4 && /^\d+$/.test(saved)) {
                        isCorrect = (pinValue === saved);
                    } else {
                        const decrypted = await (window as any).api.decryptPIN(saved);
                        isCorrect = (pinValue === decrypted);
                    }
                }
            } catch (e) { console.error("PIN Decryption failed during unlock", e); }

            if (isCorrect) {
                rateLimiter.reset('pin', this.cb.getUserId());
                if (dots) dots.forEach(dot => dot.classList.add('success'));
                setTimeout(() => {
                    document.getElementById('lock-vessel')?.classList.remove('show');
                    document.body.classList.remove('vault-is-locked');
                    if (pinInput) pinInput.value = '';
                    if (dots) dots.forEach(dot => dot.classList.remove('filled', 'success'));
                }, 500);
                this.cb.showToast("Vault unlocked!", "success");
                this.cb.updateLastActivity('Vault unlocked');
            } else {
                rateLimiter.recordAttempt('pin', this.cb.getUserId());
                const remaining = rateLimiter.getRemainingAttempts('pin', this.cb.getUserId());
                if (dots) dots.forEach(dot => dot.classList.add('error'));
                setTimeout(() => {
                    if (pinInput) pinInput.value = '';
                    if (dots) dots.forEach(dot => dot.classList.remove('filled', 'error'));
                }, 800);
                let errorMsg = "Incorrect PIN";
                if (remaining > 0 && remaining <= 3) errorMsg += ` (${remaining} attempt${remaining > 1 ? 's' : ''} remaining)`;
                else if (remaining === 0) { errorMsg = "Too many attempts. Blocked for 10 minutes."; setTimeout(() => this.validateAndAutoUnlock(''), 100); }
                this.cb.showToast(errorMsg, "error");
            }
        }
    }

    clearPinInput() {
        const pinIn = document.getElementById('unlock-pin') as HTMLInputElement;
        if (pinIn) { pinIn.value = ''; pinIn.focus(); }
        document.querySelectorAll('.pin-dot').forEach(dot => dot.classList.remove('filled', 'error', 'success'));
    }

    async verifyCurrentPin(onSuccess: () => void) {
        const storedPin = localStorage.getItem(this.cb.getStorageKey('vault_pin'));
        if (!storedPin) { onSuccess(); return; }

        const content = `
            <div class="modal-content">
                <div class="modal-header">
                    <div class="modal-icon-vessel"><i class="fa-solid fa-shield-halved"></i></div>
                    <div class="modal-title-vessel"><h2>Verify Identity</h2><p>ENTER CURRENT PIN TO PROCEED</p></div>
                </div>
                <div class="modal-divider"></div>
                <div class="modal-body">
                    <div class="pin-input-vessel" style="margin: 20px 0;">
                        <input type="password" id="verify-pin-field" maxlength="4" class="pin-field" style="opacity: 0; position: absolute;" autocomplete="off" autofocus>
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
            </div>`;
        this.cb.showModal(content);

        const input = document.getElementById('verify-pin-field') as HTMLInputElement;
        const modalContainer = input?.closest('.modal-content') || document;
        const dots = modalContainer.querySelectorAll('.pin-dot');
        input?.focus();

        const performVerify = async () => {
            const enteredPin = input.value;
            try {
                let isCorrect = false;
                try {
                    const decrypted = await (window as any).api.decryptPIN(storedPin);
                    isCorrect = enteredPin === decrypted;
                } catch (e) { isCorrect = enteredPin === storedPin; }
                if (isCorrect) { onSuccess(); }
                else { this.cb.showToast("Incorrect PIN", "error"); input.value = ''; dots.forEach(dot => dot.classList.remove('filled')); input.focus(); }
            } catch (e) { console.error("Verification failed", e); this.cb.showToast("Verification error", "error"); }
        };

        input?.addEventListener('input', async (e) => {
            const val = (e.target as HTMLInputElement).value.replace(/[^0-9]/g, '');
            input.value = val;
            dots.forEach((dot, i) => dot.classList.toggle('filled', i < val.length));
            if (val.length === 4) await performVerify();
        });
        input?.addEventListener('keypress', (e) => { if (e.key === 'Enter') performVerify(); });
        document.getElementById('cancel-verify-btn')?.addEventListener('click', () => this.cb.hideModal());
    }

    showPinSetup() {
        this.verifyCurrentPin(() => {
            let firstEntry = '';
            let phase: 'entry' | 'confirm' = 'entry';
            const renderModal = () => {
                const isEntry = phase === 'entry';
                const content = `
                    <div class="modal-content">
                        <div class="modal-header">
                            <div class="modal-icon-vessel"><i class="fa-solid ${isEntry ? 'fa-shield-halved' : 'fa-circle-check'}"></i></div>
                            <div class="modal-title-vessel"><h2>${isEntry ? 'Set Master PIN' : 'Verify PIN'}</h2><p>${isEntry ? 'ESTABLISH 4-DIGIT VAULT KEY' : 'RE-ENTER KEY TO CONFIRM'}</p></div>
                        </div>
                        <div class="modal-divider"></div>
                        <div class="modal-body">
                            <div class="form-group">
                                <label class="form-label">${isEntry ? 'Choose New PIN' : 'Confirm New PIN'}</label>
                                <div class="pin-input-vessel" style="margin: 20px 0;">
                                    <input type="password" id="setup-pin-field" maxlength="4" class="pin-field" style="opacity: 0; position: absolute;" autocomplete="off" autofocus>
                                    <div class="pin-indicators" style="justify-content: center;">
                                        <div class="pin-dot" data-digit="1"></div><div class="pin-dot" data-digit="2"></div>
                                        <div class="pin-dot" data-digit="3"></div><div class="pin-dot" data-digit="4"></div>
                                    </div>
                                </div>
                                <p class="modal-help-text" style="text-align: center;">${isEntry ? 'Keep this code safe. It is required to unlock your identities.' : 'Passwords must match exactly to synchronize security.'}</p>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button class="btn-primary" id="btn-next-step" disabled><i class="fa-solid ${isEntry ? 'fa-arrow-right' : 'fa-shield-halved'}"></i>${isEntry ? 'Next Phase' : 'Activate Vault'}</button>
                            <button class="user-button" id="cancel-pin-btn" style="justify-content: center;">Cancel</button>
                        </div>
                    </div>`;
                this.cb.showModal(content);
                const input = document.getElementById('setup-pin-field') as HTMLInputElement;
                const dots = (input?.closest('.modal-content') || document).querySelectorAll('.pin-dot');
                const nextBtn = document.getElementById('btn-next-step') as HTMLButtonElement;
                input?.focus();
                input?.addEventListener('input', (e) => {
                    const val = (e.target as HTMLInputElement).value.replace(/[^0-9]/g, '');
                    input.value = val;
                    dots.forEach((dot, i) => dot.classList.toggle('filled', i < val.length));
                    if (nextBtn) nextBtn.disabled = val.length !== 4;
                });
                nextBtn?.addEventListener('click', async () => {
                    if (phase === 'entry') { firstEntry = input.value; phase = 'confirm'; renderModal(); }
                    else {
                        if (input.value === firstEntry) {
                            this.cb.setLoading(true, "Securing Vault", "GENERATING MASTER KEY");
                            try {
                                const encrypted = await (window as any).api.encryptPIN(input.value);
                                localStorage.setItem(this.cb.getStorageKey('vault_pin'), encrypted);
                                this.cb.updateLockVaultVisibility();
                                this.cb.updatePinStatus();
                                this.cb.showToast("PIN set up and encrypted!", "success");
                                this.cb.hideModal();
                                this.cb.pushSettings().catch(e => console.warn("PIN sync failed", e));
                            } catch (e) { console.error("PIN Setup encryption failed", e); this.cb.showToast("Security setup failed", "error"); }
                            finally { this.cb.setLoading(false); }
                        } else { this.cb.showToast("PIN Matching Failed", "error"); phase = 'entry'; firstEntry = ''; renderModal(); }
                    }
                });
                document.getElementById('cancel-pin-btn')?.addEventListener('click', () => this.cb.hideModal());
            };
            renderModal();
        });
    }

    showRemovePinConfirm() {
        this.verifyCurrentPin(() => {
            const content = `
                <div class="modal-content">
                    <div class="modal-header">
                        <div class="modal-icon-vessel danger"><i class="fa-solid fa-shield-halved"></i></div>
                        <div class="modal-title-vessel"><h2 class="danger">Deactivate Security?</h2><p>VAULT WILL BE UNPROTECTED</p></div>
                    </div>
                    <div class="modal-divider"></div>
                    <div class="modal-body">
                        <div class="modal-entity-badge">
                            <div class="entity-icon"><i class="fa-solid fa-lock"></i></div>
                            <div class="entity-info"><span class="entity-name">Master PIN Policy</span><span class="entity-label">Active Protection</span></div>
                        </div>
                        <p class="modal-help-text">Removing the PIN means anyone with access to this device can view your identities. This action is immediate.</p>
                    </div>
                    <div class="modal-footer">
                        <button class="btn-danger" id="confirm-remove-pin"><i class="fa-solid fa-trash-can"></i>Remove Security</button>
                        <button class="user-button" id="cancel-remove-pin" style="justify-content: center;">Keep PIN Active</button>
                    </div>
                </div>`;
            this.cb.showModal(content);
            document.getElementById('confirm-remove-pin')?.addEventListener('click', async () => {
                this.cb.setLoading(true, "Removing Security", "DEACTIVATING MASTER KEY");
                try {
                    localStorage.removeItem(this.cb.getStorageKey('vault_pin'));
                    this.cb.updateLockVaultVisibility();
                    this.cb.updatePinStatus();
                    this.cb.showToast("Security code removed", "info");
                    this.cb.hideModal();
                    this.cb.pushSettings().catch(e => console.warn("PIN removal sync failed", e));
                } finally { this.cb.setLoading(false); }
            });
            document.getElementById('cancel-remove-pin')?.addEventListener('click', () => this.cb.hideModal());
        });
    }

    maskPhoneNumber(phone: string): string {
        if (!phone) return 'XX XXX XX';
        const digits = phone.replace(/\D/g, '');
        if (digits.length < 2) return phone;
        return `XXXX XXX XX${digits.slice(-2)}`;
    }

    showForgotPinConfirm() {
        console.log("[UI] Showing Forgot PIN modal...");
        const modal = document.getElementById('modal-forgot-pin');
        if (!modal) { console.error("[UI] Forgot PIN modal NOT FOUND!"); return; }

        const mainView = document.getElementById('forgot-pin-main-view');
        const waView = document.getElementById('forgot-pin-wa-view');
        const codeView = document.getElementById('forgot-pin-code-view');

        const showView = (view: 'main' | 'wa' | 'code') => {
            mainView?.classList.toggle('hidden', view !== 'main');
            waView?.classList.toggle('hidden', view !== 'wa');
            codeView?.classList.toggle('hidden', view !== 'code');
        };

        showView('main');

        const passwordInput = document.getElementById('forgot-pin-password') as HTMLInputElement;
        const passForm = document.getElementById('form-forgot-pin');
        const confirmBtn = document.getElementById('confirm-forgot-pin-btn');
        const codeInput = document.getElementById('forgot-pin-verify-code') as HTMLInputElement;

        if (passwordInput) passwordInput.value = '';
        if (codeInput) codeInput.value = '';
        passForm?.classList.add('hidden');
        if (confirmBtn) confirmBtn.innerHTML = '<i class="fa-solid fa-trash-can"></i> Reset PIN & Sign Out';

        document.querySelectorAll('#modal-forgot-pin .hidden[id$="-error"]').forEach(el => el.classList.add('hidden'));
        modal.classList.remove('hidden');
        modal.classList.add('show');
        modal.style.zIndex = "99999";

        const showError = (id: string, msg: string) => { const el = document.getElementById(id); if (el) { el.textContent = msg; el.classList.remove('hidden'); } };
        const hideError = (id: string) => { const el = document.getElementById(id); if (el) { el.textContent = ''; el.classList.add('hidden'); } };

        const completePinReset = async () => {
            this.cb.setLoading(true, "Resetting Security", "REMOVING PIN & SYNCING");
            localStorage.removeItem(this.cb.getStorageKey('vault_pin'));
            this.cb.updateLockVaultVisibility();
            this.cb.updatePinStatus();
            this.cb.pushSettings().catch(e => console.warn("PIN reset sync failed", e));
            modal.classList.remove('show');
            setTimeout(() => modal.classList.add('hidden'), 300);
            this.cb.setLoading(true, "Signing Out", "RETURNING TO LOGIN");
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
            hideError('forgot-pin-error');
            if (!password) { showError('forgot-pin-error', 'Please enter your master password.'); pInput?.focus(); return; }
            this.cb.setLoading(true, "Verifying Identity", "CHECKING MASTER PASSWORD");
            try {
                const result = await (window as any).api.verifyMasterPassword(password);
                if (!result.success) { this.cb.setLoading(false); showError('forgot-pin-error', result.message || 'Incorrect password.'); pInput?.select(); return; }
                if (pInput) pInput.value = '';
                await completePinReset();
            } catch (err) { this.cb.setLoading(false); showError('forgot-pin-error', 'An error occurred. Please try again.'); }
        };

        const cancelHandler = () => {
            const currentView = Array.from(modal.querySelectorAll('.modal-content')).find(v => !v.classList.contains('hidden'))?.id;
            if (currentView && currentView !== 'forgot-pin-main-view') {
                showView('main');
                passForm?.classList.add('hidden');
                if (passwordInput) passwordInput.value = '';
                if (confirmBtn) confirmBtn.innerHTML = '<i class="fa-solid fa-trash-can"></i> Reset PIN & Sign Out';
                return;
            }
            (window as any).api.clearPinResetCode();
            modal.classList.remove('show');
            setTimeout(() => modal.classList.add('hidden'), 300);
            document.getElementById('unlock-pin')?.focus();
        };

        let verifiedPhone: string | null = null;

        const startWhatsAppFlow = async () => {
            showView('wa');
            const qrImg = document.getElementById('forgot-pin-wa-qr') as HTMLImageElement;
            const loader = document.getElementById('forgot-pin-wa-loader');
            const overlay = document.getElementById('forgot-pin-wa-overlay');
            const status = document.getElementById('forgot-pin-wa-status');
            const errorEl = document.getElementById('forgot-pin-wa-error');
            const errorText = document.getElementById('forgot-pin-wa-error-text');

            loader?.classList.remove('hidden');
            qrImg?.classList.add('hidden');
            overlay?.classList.add('hidden');
            errorEl?.classList.add('hidden');
            if (status) status.textContent = 'INITIALIZING...';

            const showWaError = (msg: string) => { if (errorText) errorText.textContent = msg; errorEl?.classList.remove('hidden'); };

            const updateWaUI = (state: { qr?: string, initializing?: boolean, authenticated?: boolean, ready?: boolean, waNumber?: string }) => {
                errorEl?.classList.add('hidden');
                if (state.authenticated) { overlay?.classList.remove('hidden'); if (status) status.textContent = 'VERIFYING IDENTITY'; }
                else if (state.ready && state.waNumber) { checkPhoneMatch(state.waNumber); }
                else if (state.qr) { if (qrImg) qrImg.src = state.qr; loader?.classList.add('hidden'); qrImg?.classList.remove('hidden'); overlay?.classList.add('hidden'); if (status) status.textContent = 'SCAN QR CODE'; }
                else if (state.initializing) { loader?.classList.remove('hidden'); qrImg?.classList.add('hidden'); overlay?.classList.add('hidden'); if (status) status.textContent = 'INITIALIZING...'; }
            };

            const checkPhoneMatch = async (waNumber: string) => {
                try {
                    const user = await (window as any).api.getCurrentUser();
                    if (!user?.phone) { showWaError('No verified phone number found.'); overlay?.classList.add('hidden'); return; }
                    const normalizedAccount = user.phone.replace(/\D/g, '');
                    const normalizedWa = waNumber.replace(/\D/g, '');
                    if (normalizedAccount.length >= 8 && normalizedWa.length >= 8 &&
                        (normalizedWa.endsWith(normalizedAccount) || normalizedAccount.endsWith(normalizedWa))) {
                        verifiedPhone = user.phone;
                        if (status) status.textContent = 'SENDING PIN...';
                        const encryptedPin = localStorage.getItem(this.cb.getStorageKey('vault_pin'));
                        if (!encryptedPin) { showWaError('No PIN found to recover.'); overlay?.classList.add('hidden'); return; }
                        let pin: string;
                        try { pin = await (window as any).api.decryptPIN(encryptedPin); }
                        catch (e) { showWaError('Failed to retrieve PIN.'); overlay?.classList.add('hidden'); return; }
                        const sendResult = await (window as any).api.sendPinResetCode(user.phone, `🔐 Your Keyra Vault PIN is: ${pin}\n\n⚠️ For security, please delete this message after reading.`);
                        if (!sendResult.success) { showWaError(sendResult.message || 'Failed to send PIN.'); overlay?.classList.add('hidden'); return; }
                        const phoneDisplay = document.getElementById('forgot-pin-code-phone');
                        if (phoneDisplay) phoneDisplay.textContent = this.maskPhoneNumber(user.phone);
                        showView('code');
                        this.cb.showToast('PIN sent to your WhatsApp!', 'success');
                    } else {
                        showWaError('WhatsApp number does not match your verified phone.');
                        overlay?.classList.add('hidden');
                        if (status) status.textContent = 'MISMATCH';
                    }
                } catch (err) { console.error('[UI] Phone match check error:', err); showWaError('Verification failed. Please try again.'); overlay?.classList.add('hidden'); }
            };

            (window as any).api.onWaInitializing(() => updateWaUI({ initializing: true }));
            (window as any).api.onWaQrCode((qr: string) => updateWaUI({ qr }));
            (window as any).api.onWaAuthenticated(() => updateWaUI({ authenticated: true }));
            (window as any).api.onWaReady((waNumber?: string) => updateWaUI({ ready: true, waNumber }));
            (window as any).api.onWaAuthFailure((err: string) => { showWaError(`WhatsApp error: ${err}`); if (status) status.textContent = 'ERROR'; });
            (window as any).api.startWhatsAppLinking();
            const currentStatus = await (window as any).api.getWaStatus();
            updateWaUI(currentStatus);
        };

        const doneHandler = () => {
            modal.classList.remove('show');
            setTimeout(() => modal.classList.add('hidden'), 300);
            const pinIn = document.getElementById('unlock-pin') as HTMLInputElement;
            if (pinIn) { pinIn.value = ''; pinIn.focus(); }
        };

        const attachListener = (id: string, handler: (e?: Event) => void, event = 'click') => {
            const el = document.getElementById(id);
            if (el) { const newEl = el.cloneNode(true); el.parentNode?.replaceChild(newEl, el); newEl.addEventListener(event, handler); }
        };

        attachListener('confirm-forgot-pin-btn', confirmHandler);
        attachListener('cancel-forgot-pin-btn', cancelHandler);
        attachListener('btn-forgot-pin-whatsapp', startWhatsAppFlow);
        attachListener('btn-pin-sent-done', doneHandler);

        const form1 = document.getElementById('form-forgot-pin');
        if (form1) {
            const newForm = form1.cloneNode(true);
            form1.parentNode?.replaceChild(newForm, form1);
            newForm.addEventListener('submit', confirmHandler);
            setTimeout(() => (document.getElementById('forgot-pin-password') as HTMLInputElement)?.focus(), 150);
        }

        (window as any).api.getCurrentUser().then((user: any) => {
            const hasVerifiedPhone = user?.phone && user?.isPhoneVerified;
            const divider = document.getElementById('forgot-pin-wa-divider');
            const waBtn = document.getElementById('btn-forgot-pin-whatsapp');
            if (hasVerifiedPhone) {
                divider?.classList.remove('hidden');
                waBtn?.classList.remove('hidden');
                if (divider) (divider as HTMLElement).style.display = 'flex';
                const phoneHint = document.getElementById('forgot-pin-wa-phone-hint');
                if (phoneHint) phoneHint.textContent = `Use the WhatsApp account linked to ${this.maskPhoneNumber(user.phone)}`;
            } else {
                divider?.classList.add('hidden');
                waBtn?.classList.add('hidden');
            }
        });
    }
}
