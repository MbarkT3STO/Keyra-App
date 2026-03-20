export interface AuthCallbacks {
    getUserId: () => string;
    getStorageKey: (key: string) => string;
    showToast: (msg: string, type: 'info' | 'success' | 'error') => void;
    setLoading: (show: boolean, title?: string, subtitle?: string) => void;
    showModal: (content: string) => void;
    hideModal: () => void;
    showStaticModal: (id: string) => void;
    pushSettings: () => Promise<any>;
    updateSyncIndicator: (state: string) => void;
    setSyncVisible: (visible: boolean) => void;
    formatSyncTime: (date: Date) => string;
}

export class AuthManager {
    private emailResendTimer: number = 0;
    private emailResendInterval: any = null;

    constructor(private cb: AuthCallbacks) {}

    async initFromCloud() {
        const user = await (window as any).api.getCurrentUser();
        if (user) {
            const desktopSettings = user["Desktop Settings"] || user.settings || {};
            return desktopSettings;
        }
        return null;
    }

    updateLastActivity(action: string) {
        const now = new Date().toISOString();
        localStorage.setItem(this.cb.getStorageKey('last_activity'), now);
        localStorage.setItem(this.cb.getStorageKey('last_action'), action);
        this.updateLastActivityDisplay();
    }

    updateLastActivityDisplay() {
        const lastActivityElement = document.getElementById('last-activity-display');
        const lastActionElement = document.getElementById('last-action-display');
        const lastActivity = localStorage.getItem(this.cb.getStorageKey('last_activity'));
        const lastAction = localStorage.getItem(this.cb.getStorageKey('last_action')) || 'No activity';

        if (lastActivity && lastActivityElement) {
            const date = new Date(lastActivity);
            const diffMins = Math.floor((new Date().getTime() - date.getTime()) / 60000);
            let timeAgo = 'Just now';
            if (diffMins >= 1 && diffMins < 60) timeAgo = `${diffMins}m ago`;
            else if (diffMins >= 60 && diffMins < 1440) timeAgo = `${Math.floor(diffMins / 60)}h ago`;
            else if (diffMins >= 1440) timeAgo = `${Math.floor(diffMins / 1440)}d ago`;
            lastActivityElement.textContent = timeAgo;
        }
        if (lastActionElement) lastActionElement.textContent = lastAction;

        const aboutAction = document.getElementById('about-last-action');
        const aboutSync = document.getElementById('about-last-sync');
        if (aboutAction) aboutAction.textContent = lastAction;
        if (aboutSync) {
            const lastSync = localStorage.getItem(this.cb.getStorageKey('last_sync'));
            aboutSync.textContent = lastSync ? this.cb.formatSyncTime(new Date(lastSync)) : 'Never Secured';
        }
    }

    async loadAccountInfo() {
        const user = await (window as any).api.getCurrentUser();
        if (!user) return;

        const dispName = document.getElementById('acc-display-username');
        const dispEmail = document.getElementById('acc-primary-email');
        const initialsEl = document.getElementById('acc-initials');
        const avatarImgEl = document.getElementById('acc-avatar-img') as HTMLImageElement;

        if (dispName) dispName.textContent = user.username;
        if (dispEmail) dispEmail.textContent = user.isLocal ? "Local-Only Account" : user.email;

        this.handleLocalAccountUI(user);

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

    handleLocalAccountUI(user: any) {
        const syncCard = document.getElementById('sync-settings-card');
        const syncOverlay = document.getElementById('sync-disabled-overlay');
        const syncTitle = document.getElementById('sync-settings-title');
        const syncSubtitle = document.getElementById('sync-settings-subtitle');
        const syncStatusDesc = document.getElementById('sync-status-desc');
        const syncToggle = document.getElementById('cloud-sync-toggle') as HTMLInputElement;

        if (user.isLocal) {
            document.body.classList.add('local-only');
            if (user.privateSync && user.privateSync.pat) {
                if (syncTitle) syncTitle.textContent = "Private Sync";
                if (syncSubtitle) syncSubtitle.textContent = "GITHUB REPOSITORY STORAGE";
                if (syncStatusDesc) syncStatusDesc.textContent = user.privateSync.enabled ? "Private GitHub Sync Active" : "Private Sync Paused";
                if (syncCard) syncCard.classList.remove('disabled-card');
                if (syncOverlay) { syncOverlay.classList.add('hidden'); (syncOverlay as HTMLElement).style.display = 'none'; }
                if (syncToggle) syncToggle.checked = !!user.privateSync.enabled;
            } else {
                const desc = document.getElementById('sync-status-desc');
                if (desc) desc.textContent = "Offline Mode Active";
                if (syncCard) syncCard.classList.add('disabled-card');
                if (syncOverlay) { syncOverlay.classList.remove('hidden'); (syncOverlay as HTMLElement).style.display = 'flex'; }
            }
            this.cb.setSyncVisible(!!(user.privateSync && user.privateSync.enabled));
            this.cb.updateSyncIndicator('synced');
        } else {
            document.body.classList.remove('local-only');
            if (syncTitle) syncTitle.textContent = "Cloud Sync";
            if (syncSubtitle) syncSubtitle.textContent = "Keep your Vault safe on GitHub";
            if (syncCard) syncCard.classList.remove('disabled-card');
            if (syncOverlay) syncOverlay.classList.add('hidden');
            this.cb.setSyncVisible(true);
            this.cb.updateSyncIndicator('synced');
        }

        const privateSyncBtn = document.getElementById('btn-open-private-sync');
        if (privateSyncBtn && user.isLocal) {
            privateSyncBtn.innerHTML = user.privateSync?.enabled
                ? '<i class="fa-solid fa-gear"></i><span>Configure Private Sync</span>'
                : '<i class="fa-solid fa-shield-halved"></i><span>Enable Private Sync</span>';
        }
    }

    async updateAccountView() {
        const user = await (window as any).api.getCurrentUser();
        if (!user) return;

        const nameDisplay = document.getElementById('acc-display-username');
        const emailDisplay = document.getElementById('acc-primary-email');
        const initials = document.getElementById('acc-initials');
        if (nameDisplay) nameDisplay.textContent = user.username;
        if (emailDisplay) emailDisplay.textContent = user.email;
        if (initials) initials.textContent = user.username.charAt(0).toUpperCase();

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

        const phoneDisplay = document.getElementById('current-phone-display');
        const phoneStatusText = document.getElementById('phone-status-text');
        const phoneBadge = document.getElementById('phone-status-badge');
        const phoneActionBox = document.getElementById('phone-verify-action-box');
        const requestForm = document.getElementById('form-request-phone-verification');
        const removeBtn = document.getElementById('btn-remove-phone');

        if (user.phone && user.isPhoneVerified) {
            if (phoneDisplay) phoneDisplay.textContent = user.phone;
            if (phoneStatusText) phoneStatusText.textContent = "VERIFIED NUMBER";
            if (phoneBadge) { phoneBadge.textContent = "SECURE"; phoneBadge.className = "badge success"; phoneBadge.style.background = "rgba(40, 167, 69, 0.1)"; phoneBadge.style.color = "#28a745"; phoneBadge.style.border = "1px solid rgba(40, 167, 69, 0.2)"; }
            phoneActionBox?.classList.add('hidden');
            requestForm?.classList.add('hidden');
            removeBtn?.classList.remove('hidden');
        } else if (user.pendingPhone) {
            if (phoneDisplay) phoneDisplay.textContent = user.pendingPhone;
            if (phoneStatusText) phoneStatusText.textContent = "AWAITING VERIFICATION";
            if (phoneBadge) { phoneBadge.textContent = "PENDING"; phoneBadge.style.color = "#007aff"; phoneBadge.style.border = "1px solid rgba(0, 122, 255, 0.2)"; }
            phoneActionBox?.classList.remove('hidden');
            const verifyNowBtn = document.getElementById('btn-verify-now');
            if (verifyNowBtn) verifyNowBtn.onclick = () => this.showPhoneQrModal();
            requestForm?.classList.add('hidden');
            removeBtn?.classList.remove('hidden');
        } else {
            if (phoneDisplay) phoneDisplay.textContent = "No Phone Set";
            if (phoneStatusText) phoneStatusText.textContent = "NOT VERIFIED";
            if (phoneBadge) { phoneBadge.textContent = "UNPROTECTED"; phoneBadge.className = "badge danger"; phoneBadge.style.background = "rgba(255, 59, 48, 0.1)"; phoneBadge.style.color = "#ff3b30"; phoneBadge.style.border = "1px solid rgba(255, 59, 48, 0.2)"; }
            phoneActionBox?.classList.add('hidden');
            requestForm?.classList.remove('hidden');
            removeBtn?.classList.add('hidden');
        }

        if (removeBtn) {
            removeBtn.onclick = async () => {
                if (confirm("Are you sure you want to remove your phone number? This will disable dual-channel protection.")) {
                    this.cb.setLoading(true, "Removing", "PHONE SECURITY");
                    try {
                        const res = await (window as any).api.removePhone();
                        if (res.success) {
                            await (window as any).api.logoutWhatsApp();
                            this.cb.showToast("Phone number removed & WhatsApp disconnected", "success");
                            this.updateAccountView();
                        } else {
                            this.cb.showToast(res.message, "error");
                        }
                    } finally {
                        this.cb.setLoading(false);
                    }
                }
            };
        }
    }

    async handleEmailVerification() {
        const digits = document.querySelectorAll('.email-verify-digit') as NodeListOf<HTMLInputElement>;
        const code = Array.from(digits).map(i => i.value).join('');
        const err = document.getElementById('email-verify-error');
        if (code.length < 6) return;
        this.cb.setLoading(true, "Verifying", "FINALIZING EMAIL IDENTITY");
        try {
            const res = await (window as any).api.confirmEmailChange(code);
            if (res.success) {
                const modal = document.getElementById('modal-email-verify');
                if (modal) { modal.classList.remove('show'); setTimeout(() => modal.classList.add('hidden'), 300); }
                await this.loadAccountInfo();
                this.cb.showToast("Email updated!", "success");
                digits.forEach(i => i.value = '');
            } else {
                if (err) { err.textContent = res.message; err.classList.remove('opacity-0'); setTimeout(() => err.classList.add('opacity-0'), 3000); }
                digits.forEach(i => i.value = '');
                digits[0].focus();
            }
        } finally { this.cb.setLoading(false); }
    }

    startEmailResendTimer() {
        if (this.emailResendInterval) clearInterval(this.emailResendInterval);
        this.emailResendTimer = 30;
        this.updateResendBtnUI();
        this.emailResendInterval = setInterval(() => {
            this.emailResendTimer--;
            this.updateResendBtnUI();
            if (this.emailResendTimer <= 0) clearInterval(this.emailResendInterval);
        }, 1000);
    }

    updateResendBtnUI() {
        const btn = document.getElementById('btn-resend-email-code') as HTMLButtonElement;
        const timerText = document.getElementById('email-resend-timer');
        if (!btn || !timerText) return;
        if (this.emailResendTimer > 0) { btn.disabled = true; timerText.textContent = `(${this.emailResendTimer}s)`; }
        else { btn.disabled = false; timerText.textContent = ''; }
    }

    showPhoneQrModal() {
        const modal = document.getElementById('modal-phone-qr');
        if (modal) {
            modal.classList.remove('hidden');
            setTimeout(() => modal.classList.add('show'), 10);
            (window as any).api.startWhatsAppLinking();
            this.initWhatsAppLinking();
        }
    }

    hidePhoneQrModal() {
        const modal = document.getElementById('modal-phone-qr');
        if (modal) {
            modal.classList.remove('show');
            setTimeout(() => {
                modal.classList.add('hidden');
                document.getElementById('wa-qr-error')?.classList.add('hidden');
                document.getElementById('wa-qr-overlay')?.classList.add('hidden');
            }, 300);
        }
    }

    initPhoneSecurity() {
        // Handled via listeners and updateAccountView
    }

    initWhatsAppLinking() {
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
                if (user?.pendingPhone) {
                    const res = await (window as any).api.verifyPhoneByWhatsAppMatch(waNumber);
                    if (res.success) { this.cb.showToast("Phone Verified! 🚀", "success"); this.hidePhoneQrModal(); this.updateAccountView(); }
                    else {
                        if (modalQrOverlay) modalQrOverlay.classList.add('hidden');
                        if (modalQrError && modalQrErrorText) { modalQrErrorText.textContent = "Number Mismatch! Please scan with the WhatsApp account matching your entered phone number."; modalQrError.classList.remove('hidden'); }
                    }
                } else if (user?.isPhoneVerified) { this.hidePhoneQrModal(); }
            } catch (err: any) { (window as any).api.logToMain(`[UI] Critical error during phone verification check: ${err.message || err}`); }
        };

        const updateUI = (status: { ready: boolean, qr: string | null, initializing?: boolean, authenticated?: boolean, waNumber?: string }) => {
            if (!status.ready && !status.authenticated) modalQrError?.classList.add('hidden');
            if (status.authenticated) { modalQrOverlay?.classList.remove('hidden'); if (modalStatusText) modalStatusText.textContent = "VERIFYING IDENTITY"; }
            else if (status.ready) { if (status.waNumber) checkAndVerifyPhone(status.waNumber); }
            else if (status.initializing || !status.qr) { modalLoader?.classList.remove('hidden'); modalQrImage?.classList.add('hidden'); modalQrOverlay?.classList.add('hidden'); if (modalStatusText) modalStatusText.textContent = "INITIALIZING..."; }
            else if (status.qr) { if (modalQrImage) modalQrImage.src = status.qr; modalLoader?.classList.add('hidden'); modalQrImage?.classList.remove('hidden'); modalQrOverlay?.classList.add('hidden'); if (modalStatusText) modalStatusText.textContent = "SCAN QR CODE"; }
        };

        (window as any).api.getWaStatus().then(updateUI);
        (window as any).api.onWaInitializing(() => updateUI({ ready: false, qr: null, initializing: true }));
        (window as any).api.onWaQrCode((qr: string) => updateUI({ ready: false, qr }));
        (window as any).api.onWaAuthenticated(() => updateUI({ ready: false, qr: null, authenticated: true }));
        (window as any).api.onWaReady(async (waNumber?: string) => updateUI({ ready: true, qr: null, waNumber }));
        (window as any).api.onWaAuthFailure((err: string) => { if (modalStatusText) modalStatusText.textContent = "AUTH FAILURE"; this.cb.showToast(`WhatsApp Error: ${err}`, "error"); });
    }

    setupAccountEvents() {
        document.getElementById('form-change-username')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const newName = (document.getElementById('new-username') as HTMLInputElement).value.trim();
            if (newName.length < 4) return;
            this.cb.setLoading(true, "Updating Identity", "SECURE VAULT RENAMING");
            try {
                const res = await (window as any).api.changeUsername(newName);
                if (res.success) {
                    this.cb.showToast("Name updated!", "success");
                    await this.loadAccountInfo();
                    const userNameDisp = document.getElementById('user-name-display');
                    if (userNameDisp) userNameDisp.textContent = newName;
                    const dropUserName = document.getElementById('dropdown-user-name');
                    if (dropUserName) dropUserName.textContent = newName;
                } else { this.cb.showToast(res.message, "error"); }
            } finally { this.cb.setLoading(false); }
        });

        document.getElementById('btn-change-avatar')?.addEventListener('click', () => {
            const input = document.createElement('input');
            input.type = 'file'; input.accept = 'image/png, image/jpeg, image/webp';
            input.onchange = async (e) => {
                const file = (e.target as HTMLInputElement).files?.[0];
                if (!file) return;
                if (file.size > 2 * 1024 * 1024) { this.cb.showToast('Image must be less than 2MB', 'error'); return; }
                this.cb.setLoading(true, "Updating Profile", "UPLOADING AVATAR");
                const reader = new FileReader();
                reader.onload = async (e) => {
                    const base64 = e.target?.result as string;
                    try {
                        const res = await (window as any).api.updateProfilePicture(base64);
                        if (res.success) { this.cb.showToast(res.message, 'success'); await this.loadAccountInfo(); }
                        else { this.cb.showToast(res.message, 'error'); }
                    } catch (err: any) { this.cb.showToast(err.message || "Failed to update profile picture", 'error'); }
                    finally { this.cb.setLoading(false); }
                };
                reader.onerror = () => { this.cb.showToast("Failed to read image file", 'error'); this.cb.setLoading(false); };
                reader.readAsDataURL(file);
            };
            input.click();
        });

        document.getElementById('form-request-email-change')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const newEmail = (document.getElementById('new-email') as HTMLInputElement).value.trim();
            if (!newEmail) return;
            this.cb.setLoading(true, "Requesting Change", "INITIATING EMAIL ROTATION");
            try {
                const res = await (window as any).api.requestEmailChange(newEmail);
                if (res.success) {
                    this.cb.showToast("Confirmation code sent!", "success");
                    const modal = document.getElementById('modal-email-verify');
                    if (modal) { modal.classList.remove('hidden'); modal.classList.add('show'); }
                    this.startEmailResendTimer();
                    await this.loadAccountInfo();
                } else { this.cb.showToast(res.message, "error"); }
            } finally { this.cb.setLoading(false); }
        });

        document.getElementById('btn-show-email-verify')?.addEventListener('click', async () => {
            this.cb.setLoading(true, "Requesting Code", "ROTATING VERIFICATION KEY");
            try {
                const res = await (window as any).api.resendEmailChangeCode();
                if (res.success) {
                    const modal = document.getElementById('modal-email-verify');
                    if (modal) { modal.classList.remove('hidden'); modal.classList.add('show'); }
                    this.startEmailResendTimer();
                    this.cb.showToast("New code sent", "success");
                } else { this.cb.showToast(res.message, "error"); }
            } finally { this.cb.setLoading(false); }
        });

        document.getElementById('form-request-phone-verification')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const phone = (document.getElementById('new-phone') as HTMLInputElement).value.trim();
            if (!phone) return;
            const phoneRegex = /^\+[0-9]{8,15}$/;
            if (!phoneRegex.test(phone)) { this.cb.showToast("Invalid format. Use + and 8-15 digits (e.g. +123456789).", "error"); return; }
            this.cb.setLoading(true, "Saving", "PHONE SECURITY");
            try {
                const lastInit = (window as any)._lastWaInit || 0;
                if (Date.now() - lastInit < 2000) { this.cb.setLoading(true, "Wait...", "INITIALIZING"); await new Promise(resolve => setTimeout(resolve, 2000)); }
                (window as any)._lastWaInit = Date.now();
                const res = await (window as any).api.requestPhoneVerification(phone);
                if (res.success) { this.cb.showToast("Number saved! Please scan to verify.", "success"); this.updateAccountView(); this.showPhoneQrModal(); }
                else { this.cb.showToast(res.message, "error"); }
            } finally { this.cb.setLoading(false); }
        });

        document.getElementById('btn-cancel-phone-qr')?.addEventListener('click', () => this.hidePhoneQrModal());

        document.getElementById('btn-cancel-email-modal')?.addEventListener('click', () => {
            const modal = document.getElementById('modal-email-verify');
            if (modal) { modal.classList.remove('show'); setTimeout(() => modal.classList.add('hidden'), 300); }
        });

        const digits = document.querySelectorAll('.email-verify-digit') as NodeListOf<HTMLInputElement>;
        digits.forEach((input, idx) => {
            input.addEventListener('input', () => {
                if (input.value && digits[idx + 1]) digits[idx + 1].focus();
                if (Array.from(digits).every(i => i.value)) this.handleEmailVerification();
            });
            input.addEventListener('keydown', (e) => { if (e.key === 'Backspace' && !input.value && digits[idx - 1]) digits[idx - 1].focus(); });
        });

        document.getElementById('btn-confirm-email-change')?.addEventListener('click', () => this.handleEmailVerification());

        document.getElementById('btn-resend-email-code')?.addEventListener('click', async () => {
            if (this.emailResendTimer > 0) return;
            try {
                const res = await (window as any).api.resendEmailChangeCode();
                if (res.success) { this.cb.showToast("New code sent", "success"); this.startEmailResendTimer(); }
            } catch (e) { this.cb.showToast("Failed to resend code", "error"); }
        });

        document.getElementById('btn-cancel-email-change')?.addEventListener('click', async () => {
            this.cb.setLoading(true, "Cancelling", "REVERTING IDENTITY CHANGES");
            try { await (window as any).api.cancelEmailChange(); await this.loadAccountInfo(); this.cb.showToast("Email change cancelled", "info"); }
            finally { this.cb.setLoading(false); }
        });

        document.getElementById('form-change-password')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const newPass = (document.getElementById('new-master-password') as HTMLInputElement).value;
            const confPass = (document.getElementById('confirm-master-password') as HTMLInputElement).value;
            if (newPass !== confPass) { this.cb.showToast("Passwords do not match", "error"); return; }
            if (newPass.length < 8) { this.cb.showToast("Password too short", "error"); return; }
            this.cb.setLoading(true, "Re-encrypting Vault", "MASTER KEY ROTATION IN PROGRESS");
            try {
                const res = await (window as any).api.changePassword(newPass);
                if (res.success) {
                    this.cb.showToast("Password updated!", "success");
                    (document.getElementById('new-master-password') as HTMLInputElement).value = '';
                    (document.getElementById('confirm-master-password') as HTMLInputElement).value = '';
                } else { this.cb.showToast(res.message, "error"); }
            } finally { this.cb.setLoading(false); }
        });
    }
}
