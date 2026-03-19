export interface AccountCallbacks {
    getPrivacyMode: () => boolean;
    getVaultViewStyle: () => string;
    getUserId: () => string;
    showToast: (msg: string, type: 'info' | 'success' | 'error') => void;
    setLoading: (show: boolean, title?: string, subtitle?: string) => void;
    showModal: (content: string) => void;
    hideModal: () => void;
    showCopyFeedback: (el: HTMLElement) => void;
    applySettings: (settings: any, saveLocal: boolean) => void;
    handleLocalAccountUI: (user: any) => void;
    updateLastActivity: (action: string) => void;
    pushSettings: () => Promise<any>;
    updateSegmentedUI: (id: string, val: string) => void;
    updateAccountView: () => Promise<void>;
    showStaticModal: (id: string) => void;
}

export class AccountManager {
    public accounts: any[] = [];
    public cardCache: HTMLElement[] = [];
    public activeOtpAccount: any = null;
    private timerInterval: any = null;
    private searchQuery: string = '';
    private pendingConflictAction: string | null = null;
    private pendingConflictData: any = null;

    private cb: AccountCallbacks;

    constructor(callbacks: AccountCallbacks) {
        this.cb = callbacks;
    }

    // ─── Timer ────────────────────────────────────────────────────────────────

    public startTimer() {
        if (this.timerInterval) clearInterval(this.timerInterval);
        this.timerInterval = setInterval(async () => {
            if (this.accounts.length === 0 || this.cardCache.length === 0) return;
            const secrets = this.accounts.map(acc => acc.secret);
            const { otps, remaining } = await (window as any).api.getBatchOTPs(secrets);
            this.cardCache.forEach((card, i) => {
                if (otps[i]) this.updateCardOTP(card, otps[i], remaining);
            });
            if (this.activeOtpAccount) {
                const activeIndex = this.accounts.findIndex(a => a.id === this.activeOtpAccount.id);
                if (activeIndex !== -1 && otps[activeIndex]) {
                    this.updateOtpModal(otps[activeIndex], remaining);
                }
            }
        }, 1000);
    }

    // ─── Load & Refresh ───────────────────────────────────────────────────────

    public async loadInitialData() {
        try {
            const user = await (window as any).api.getCurrentUser();
            if (user) {
                const nameDisplay = document.getElementById('user-name-display');
                if (nameDisplay) nameDisplay.textContent = user.username;

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

                const dropdownName = document.getElementById('dropdown-user-name');
                const dropdownEmail = document.getElementById('dropdown-user-email');
                if (dropdownName) dropdownName.textContent = user.username;
                if (dropdownEmail) dropdownEmail.textContent = user.isLocal ? "Local-Only Account" : (user.email || 'Keyra Secure Vault');

                this.cb.handleLocalAccountUI(user);
            }
            await this.refreshAccounts();
            await this.cb.updateAccountView();
        } catch (err) {
            console.error("Load failed", err);
        }
    }

    public async refreshAccounts() {
        this.showSkeletonLoaders();
        this.accounts = await (window as any).api.getAccounts();
        await new Promise(resolve => setTimeout(resolve, 300));
        this.renderAccounts();
    }

    // ─── Skeleton ─────────────────────────────────────────────────────────────

    public showSkeletonLoaders(count: number = 6) {
        const grid = document.getElementById('accounts-grid');
        const emptyState = document.getElementById('empty-state');
        const searchEmptyState = document.getElementById('search-empty-state');
        if (!grid) return;
        emptyState?.classList.add('hidden');
        searchEmptyState?.classList.add('hidden');
        grid.classList.remove('hidden');
        grid.innerHTML = '';
        for (let i = 0; i < count; i++) {
            grid.appendChild(this.createSkeletonCard(i));
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

    // ─── Render ───────────────────────────────────────────────────────────────

    public renderAccounts() {
        const grid = document.getElementById('accounts-grid');
        const emptyState = document.getElementById('empty-state');
        const searchEmptyState = document.getElementById('search-empty-state');
        if (!grid || !emptyState || !searchEmptyState) return;

        const privacyMode = this.cb.getPrivacyMode();
        const vaultViewStyle = this.cb.getVaultViewStyle();

        const filtered = this.accounts.filter(acc =>
            acc.issuer.toLowerCase().includes(this.searchQuery) ||
            acc.account.toLowerCase().includes(this.searchQuery)
        );

        if (this.accounts.length === 0) {
            grid.classList.add('hidden');
            emptyState.classList.remove('hidden');
            searchEmptyState.classList.add('hidden');
        } else if (filtered.length === 0) {
            grid.classList.add('hidden');
            emptyState.classList.add('hidden');
            searchEmptyState.classList.remove('hidden');
        } else {
            grid.classList.remove('hidden');
            emptyState.classList.add('hidden');
            searchEmptyState.classList.add('hidden');
            grid.innerHTML = '';
            this.cardCache = [];
            filtered.forEach((acc, index) => {
                const card = this.createAccountCard(acc, index);
                grid.appendChild(card);
                this.cardCache.push(card);
            });

            const secrets = filtered.map(acc => acc.secret);
            (window as any).api.getBatchOTPs(secrets).then((res: { otps: string[], remaining: number }) => {
                this.cardCache.forEach((card, i) => {
                    if (res.otps[i]) this.updateCardOTP(card, res.otps[i], res.remaining);
                });
            });
        }
    }

    // ─── Card Creation ────────────────────────────────────────────────────────

    public createAccountCard(account: any, index: number): HTMLElement {
        const privacyMode = this.cb.getPrivacyMode();
        const vaultViewStyle = this.cb.getVaultViewStyle();

        const card = document.createElement('div');
        card.className = 'account-card animate-fade-in';
        card.style.animationDelay = `${index * 0.05}s`;

        card.innerHTML = `
            <div class="account-header">
                <div class="account-icon">
                    <i class="${this.getIcon(account.issuer)}"></i>
                </div>
                <div class="account-info">
                    <div class="service-name">${account.issuer}</div>
                    <div class="account-identity">${account.account}</div>
                </div>
                <div class="card-actions">
                <button class="btn-card-more">
                    <i class="fa-solid fa-ellipsis-vertical"></i>
                </button>
                <div class="card-dropdown">
                    <div class="card-dropdown-item edit-btn">
                        <i class="fa-solid fa-pen-to-square icon-left"></i>
                        <span>Edit</span>
                    </div>
                    <div class="card-dropdown-item danger delete-btn">
                        <i class="fa-solid fa-trash-can icon-left"></i>
                        <span>Delete</span>
                    </div>
                </div>
            </div>
            </div>
            <div class="otp-hero">
                ${vaultViewStyle !== 'secure' ? `
                    <div class="otp-code ${privacyMode ? 'privacy-hidden' : ''}">
                        ${privacyMode ? '••••••' : '------'}
                    </div>
                ` : `
                    <button class="btn-primary secure-view-btn" style="width: 100%; height: 50px; background: var(--nm-surface); box-shadow: var(--nm-shadow-out-sm);">
                        <i class="fa-solid fa-shield-halved"></i>
                        <span>Secure View</span>
                    </button>
                `}
                ${vaultViewStyle === 'compact' ? `
                <div class="timer-linear-vessel">
                    <div class="timer-linear-progress"></div>
                </div>` : ''}
            </div>
            ${vaultViewStyle !== 'secure' ? `
            <div class="card-footer" style="padding: 0;">
                <button class="btn-primary copy-btn" style="width: 100%;">
                    <i class="fa-solid fa-copy icon-left"></i>
                    <span>Copy Code</span>
                </button>
            </div>
            ` : ''}
        `;

        const copyBtn = card.querySelector('.copy-btn') as HTMLElement;
        if (copyBtn) {
            copyBtn.onclick = async () => {
                const otpCode = await (window as any).api.generateTOTP(account.secret);
                await navigator.clipboard.writeText(otpCode);
                this.cb.showToast("Code copied!", "success");
                this.cb.updateLastActivity('OTP copied');
            };
        }

        const codeEl = card.querySelector('.otp-code') as HTMLElement;
        if (codeEl) {
            codeEl.onclick = async () => {
                const otpCode = await (window as any).api.generateTOTP(account.secret);
                await navigator.clipboard.writeText(otpCode);
                this.cb.showToast("OTP Copied", "success");
                this.cb.showCopyFeedback(codeEl);
                this.cb.updateLastActivity('OTP copied');
            };
        }

        const moreBtn = card.querySelector('.btn-card-more') as HTMLElement;
        const dropdown = card.querySelector('.card-dropdown') as HTMLElement;

        moreBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            document.querySelectorAll('.card-dropdown.show').forEach(d => {
                if (d !== dropdown) {
                    d.classList.remove('show');
                    d.previousElementSibling?.classList.remove('active');
                }
            });
            dropdown.classList.toggle('show');
            moreBtn.classList.toggle('active');
        });

        card.querySelector('.edit-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.classList.remove('show');
            moreBtn.classList.remove('active');
            this.showEditModal(account);
        });

        card.querySelector('.delete-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.classList.remove('show');
            moreBtn.classList.remove('active');
            this.showDeleteConfirm(account);
        });

        card.querySelector('.secure-view-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.showOtpModal(account);
        });

        return card;
    }

    // ─── OTP Updates ──────────────────────────────────────────────────────────

    public updateCardOTP(card: HTMLElement, otp: string, remaining: number) {
        const codeElement = card.querySelector('.otp-code') as HTMLElement;
        if (!codeElement) return;

        const formattedOtp = otp.substring(0, 3) + ' ' + otp.substring(3);
        if (!this.cb.getPrivacyMode()) {
            if (codeElement.textContent !== formattedOtp) {
                codeElement.textContent = formattedOtp;
            }
        }

        const vaultViewStyle = this.cb.getVaultViewStyle();
        if (vaultViewStyle === 'unified') {
            const globalProgressBar = document.getElementById('global-otp-timer') as HTMLElement;
            if (globalProgressBar) {
                const scale = remaining / 30;
                globalProgressBar.style.transform = `scaleX(${scale})`;
                globalProgressBar.style.backgroundColor = remaining <= 5 ? '#ff3b30' : 'var(--accent-primary)';
            }
        } else if (vaultViewStyle === 'compact') {
            const progressBar = card.querySelector('.timer-linear-progress') as HTMLElement;
            if (progressBar) {
                const scale = remaining / 30;
                progressBar.style.transform = `scaleX(${scale})`;
                progressBar.style.backgroundColor = remaining <= 5 ? '#ff3b30' : 'var(--accent-primary)';
            }
        }
    }

    public updateOtpModal(otp: string, remaining: number) {
        const modal = document.querySelector('.otp-modal-container');
        if (!modal || !this.activeOtpAccount) return;

        const codeDisp = modal.querySelector('.otp-modal-code-vessel') as HTMLElement;
        const formattedOtp = otp.substring(0, 3) + ' ' + otp.substring(3);
        if (codeDisp && codeDisp.textContent !== formattedOtp) {
            codeDisp.textContent = formattedOtp;
        }

        const circle = modal.querySelector('.timer-circle-progress') as SVGCircleElement;
        const text = modal.querySelector('.timer-countdown-text') as HTMLElement;
        if (circle && text) {
            const radius = 54;
            const circumference = 2 * Math.PI * radius;
            const offset = circumference - (remaining / 30) * circumference;
            circle.style.strokeDasharray = `${circumference} ${circumference}`;
            circle.style.strokeDashoffset = offset.toString();
            circle.style.stroke = remaining <= 5 ? '#ff3b30' : 'var(--accent-primary)';
            text.textContent = remaining.toString();
            text.style.color = remaining <= 5 ? '#ff3b30' : 'var(--accent-primary)';
        }
    }

    public async showOtpModal(account: any) {
        this.activeOtpAccount = account;
        const initialOtp = await (window as any).api.generateTOTP(account.secret);
        const { remaining } = await (window as any).api.getBatchOTPs([account.secret]);

        const content = `
            <div class="otp-modal-container">
                <div class="otp-modal-header">
                    <div class="otp-modal-name">${account.issuer}</div>
                    <div class="otp-modal-account">${account.account}</div>
                </div>
                <div class="circular-timer-vessel">
                    <svg class="circular-timer-svg" width="120" height="120">
                        <circle class="timer-circle-bg" cx="60" cy="60" r="54"></circle>
                        <circle class="timer-circle-progress" cx="60" cy="60" r="54"></circle>
                    </svg>
                    <div class="timer-countdown-text">${remaining}</div>
                </div>
                <div class="otp-modal-code-vessel" id="otp-modal-copy">
                    ${initialOtp.substring(0, 3)} ${initialOtp.substring(3)}
                </div>
                <div class="otp-modal-footer">
                    <button class="btn-primary" id="btn-otp-modal-copy" style="flex: 1;">
                        <i class="fa-solid fa-copy"></i>
                        Copy
                    </button>
                    <button class="user-button" id="btn-otp-modal-close" style="width: auto; padding: 0 20px;">Close</button>
                </div>
            </div>
        `;

        this.cb.showModal(content);
        this.updateOtpModal(initialOtp, remaining);

        document.getElementById('btn-otp-modal-copy')?.addEventListener('click', () => {
            navigator.clipboard.writeText(initialOtp);
            this.cb.showToast("Code copied!", "success");
            this.cb.showCopyFeedback(document.getElementById('otp-modal-copy')!);
        });
        document.getElementById('otp-modal-copy')?.addEventListener('click', () => {
            navigator.clipboard.writeText(initialOtp);
            this.cb.showToast("OTP Copied", "success");
            this.cb.showCopyFeedback(document.getElementById('otp-modal-copy')!);
        });
        document.getElementById('btn-otp-modal-close')?.addEventListener('click', () => {
            this.activeOtpAccount = null;
            this.cb.hideModal();
        });
    }

    // ─── Scanned Data ─────────────────────────────────────────────────────────

    public async handleScannedData(data: string) {
        try {
            if (!data.startsWith('otpauth://totp/')) {
                this.cb.showToast("QR code not recognized", "error");
                return;
            }
            this.cb.setLoading(true, "Processing QR", "DECODING SECURE URI");
            try {
                const parsed = await (window as any).api.parseURI(data);
                await (window as any).api.generateTOTP(parsed.secret);
                const res = await (window as any).api.saveAccount({
                    id: Date.now().toString(),
                    issuer: parsed.issuer,
                    account: parsed.account,
                    secret: parsed.secret
                });
                if (res.conflict) {
                    this.showSyncConflictModal('save-account', {
                        id: Date.now().toString(),
                        issuer: parsed.issuer,
                        account: parsed.account,
                        secret: parsed.secret
                    });
                    return;
                }
                this.accounts = res.accounts || [];
                this.renderAccounts();
                this.cb.showToast(`Account added!`, "success");
                this.cb.updateLastActivity('Added token via Scan');
            } finally {
                this.cb.setLoading(false);
            }
        } catch (err) {
            console.error("Invalid QR Format", err);
            this.cb.showToast("Invalid QR Format", "error");
        }
    }

    // ─── Sync Conflict ────────────────────────────────────────────────────────

    public showSyncConflictModal(action: string, data: any) {
        this.pendingConflictAction = action;
        this.pendingConflictData = data;

        const modal = document.getElementById('modal-sync-conflict');
        if (!modal) return;

        modal.classList.remove('hidden');
        setTimeout(() => modal.classList.add('show'), 10);

        const forcePushOption = document.getElementById('option-force-push');
        const pullRemoteOption = document.getElementById('option-pull-remote');
        const resolveBtn = document.getElementById('btn-resolve-sync-conflict') as HTMLButtonElement;
        const closeBtn = document.getElementById('btn-close-sync-conflict');

        let selectedResolution: 'force' | 'pull' | null = null;

        const updateSelection = (res: 'force' | 'pull') => {
            selectedResolution = res;
            forcePushOption?.classList.toggle('selected', res === 'force');
            pullRemoteOption?.classList.toggle('selected', res === 'pull');
            if (resolveBtn) {
                resolveBtn.classList.remove('disabled');
                resolveBtn.disabled = false;
            }
        };

        forcePushOption?.addEventListener('click', () => updateSelection('force'));
        pullRemoteOption?.addEventListener('click', () => updateSelection('pull'));

        closeBtn?.addEventListener('click', () => {
            modal.classList.remove('show');
            setTimeout(() => modal.classList.add('hidden'), 300);
            this.pendingConflictAction = null;
            this.pendingConflictData = null;
        });

        resolveBtn.addEventListener('click', async () => {
            if (!selectedResolution) return;
            this.cb.setLoading(true, "Resolving Conflict", "SYNCHRONIZING SECURE DATA");
            try {
                if (selectedResolution === 'force') {
                    let res: any;
                    if (this.pendingConflictAction === 'save-account') {
                        res = await (window as any).api.saveAccount(this.pendingConflictData, true);
                    } else if (this.pendingConflictAction === 'delete-account') {
                        res = await (window as any).api.deleteAccount(this.pendingConflictData, true);
                    } else if (this.pendingConflictAction === 'update-user-settings') {
                        res = await (window as any).api.updateUserSettings(this.pendingConflictData, true);
                    }
                    if (res && res.success) {
                        this.cb.showToast("Conflict resolved: local data pushed", "success");
                        if (res.accounts) {
                            this.accounts = res.accounts;
                            this.renderAccounts();
                        }
                        modal.classList.remove('show');
                        setTimeout(() => modal.classList.add('hidden'), 300);
                        this.cb.hideModal();
                    } else {
                        this.cb.showToast(res?.message || "Resolution failed", "error");
                    }
                } else {
                    await this.refreshAccounts();
                    const user = await (window as any).api.getCurrentUser();
                    if (user) {
                        this.cb.handleLocalAccountUI(user);
                        this.cb.applySettings(user.settings || {}, true);
                    }
                    this.cb.showToast("Conflict resolved: remote data pulled", "success");
                    modal.classList.remove('show');
                    setTimeout(() => modal.classList.add('hidden'), 300);
                    this.cb.hideModal();
                }
            } catch (err) {
                console.error("Resolution Error:", err);
                this.cb.showToast("An error occurred during resolution", "error");
            } finally {
                this.cb.setLoading(false);
            }
        });
    }

    // ─── Add / Edit / Delete Modals ───────────────────────────────────────────

    public showAddModal() {
        const content = `
            <div class="modal-content">
                <div class="modal-header">
                    <div class="modal-icon-vessel">
                        <i class="fa-solid fa-circle-plus"></i>
                    </div>
                    <div class="modal-title-vessel">
                        <h2>Add Token</h2>
                        <p>SAVE DIGITAL IDENTITY</p>
                    </div>
                </div>
                <div class="modal-divider"></div>
                <div class="modal-body">
                    <div class="form-group">
                        <label class="form-label">Service</label>
                        <input type="text" id="new-issuer" class="form-input" placeholder="e.g. GitHub, Google">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Account</label>
                        <input type="text" id="new-account" class="form-input" placeholder="name@domain.com" inputmode="email">
                    </div>
                    <div class="form-group">
                        <label class="form-label">TOTP Secret</label>
                        <input type="text" id="new-secret" class="form-input" placeholder="Enter secret key" autocomplete="off">
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn-primary" id="save-new-account">
                        <i class="fa-solid fa-shield-halved"></i>
                        Save Token
                    </button>
                    <button class="user-button" id="btn-scan-screen-trigger" style="justify-content: center; white-space: nowrap;">
                        <i class="fa-solid fa-desktop"></i>
                        Scan
                    </button>
                    <button class="user-button" id="cancel-add-btn" style="justify-content: center;">Cancel</button>
                </div>
            </div>
        `;
        this.cb.showModal(content);

        document.getElementById('btn-scan-screen-trigger')?.addEventListener('click', () => {
            this.cb.hideModal();
            (window as any).api.openCaptureWindow();
        });

        const saveAccountAction = async () => {
            const issuer = (document.getElementById('new-issuer') as HTMLInputElement).value.trim();
            const account = (document.getElementById('new-account') as HTMLInputElement).value.trim();
            const secret = (document.getElementById('new-secret') as HTMLInputElement).value.replace(/\s/g, '').toUpperCase();
            if (issuer && secret) {
                this.cb.setLoading(true, "Securing Token", "ENCRYPTING NEW IDENTITY");
                try {
                    const res = await (window as any).api.saveAccount({ id: Date.now().toString(), issuer, account, secret });
                    if (res.conflict) {
                        this.showSyncConflictModal('save-account', { id: Date.now().toString(), issuer, account, secret });
                        return;
                    }
                    this.accounts = res.accounts || [];
                    this.renderAccounts();
                    this.cb.hideModal();
                    this.cb.showToast("Account saved!", "success");
                    this.cb.updateLastActivity('Added token');
                } finally {
                    this.cb.setLoading(false);
                }
            } else {
                this.cb.showToast("Service and Secret are required", "error");
            }
        };

        document.getElementById('save-new-account')?.addEventListener('click', saveAccountAction);
        ['new-issuer', 'new-account', 'new-secret'].forEach(id => {
            document.getElementById(id)?.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') saveAccountAction();
            });
        });
        document.getElementById('cancel-add-btn')?.addEventListener('click', () => this.cb.hideModal());
    }

    public showEditModal(account: any) {
        const content = `
            <div class="modal-content">
                <div class="modal-header">
                    <div class="modal-icon-vessel">
                        <i class="fa-solid fa-sliders"></i>
                    </div>
                    <div class="modal-title-vessel">
                        <h2>Edit Identity</h2>
                        <p>UPDATE SERVICE DETAILS</p>
                    </div>
                </div>
                <div class="modal-divider"></div>
                <div class="modal-body">
                    <div class="modal-entity-badge">
                        <div class="entity-icon"><i class="fa-solid fa-shield"></i></div>
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
                        <input type="text" id="edit-account" class="form-input" value="${account.account}" inputmode="email">
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn-primary" id="update-account">
                        <i class="fa-solid fa-check"></i>
                        Save Changes
                    </button>
                    <button class="user-button" id="cancel-edit-btn" style="justify-content: center;">Cancel</button>
                </div>
            </div>
        `;
        this.cb.showModal(content);
        const updateAccountAction = async () => {
            const issuer = (document.getElementById('edit-issuer') as HTMLInputElement).value.trim();
            const accName = (document.getElementById('edit-account') as HTMLInputElement).value.trim();
            if (issuer) {
                this.cb.setLoading(true, "Updating Identity", "SYNCHRONIZING CHANGES");
                try {
                    const res = await (window as any).api.saveAccount({ ...account, issuer, account: accName });
                    if (res.conflict) {
                        this.showSyncConflictModal('save-account', { ...account, issuer, account: accName });
                        return;
                    }
                    this.accounts = res.accounts || [];
                    this.renderAccounts();
                    this.cb.hideModal();
                    this.cb.showToast("Account updated!", "success");
                    this.cb.updateLastActivity('Edited token');
                } finally {
                    this.cb.setLoading(false);
                }
            }
        };
        document.getElementById('update-account')?.addEventListener('click', updateAccountAction);
        ['edit-issuer', 'edit-account'].forEach(id => {
            document.getElementById(id)?.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') updateAccountAction();
            });
        });
        document.getElementById('cancel-edit-btn')?.addEventListener('click', () => this.cb.hideModal());
    }

    public showDeleteConfirm(account: any) {
        const content = `
            <div class="modal-content">
                <div class="modal-header">
                    <div class="modal-icon-vessel danger">
                        <i class="fa-solid fa-trash-can"></i>
                    </div>
                    <div class="modal-title-vessel">
                        <h2 class="danger">Delete Token?</h2>
                        <p>PERMANENT ACTION</p>
                    </div>
                </div>
                <div class="modal-divider"></div>
                <div class="modal-body">
                    <div class="modal-entity-badge">
                        <div class="entity-icon"><i class="fa-solid fa-shield"></i></div>
                        <div class="entity-info">
                            <span class="entity-name">${account.issuer}</span>
                            <span class="entity-label">${account.account || 'Vault Token'}</span>
                        </div>
                    </div>
                    <p class="modal-help-text">Removing this token is permanent. You will lose access to its OTP codes.</p>
                </div>
                <div class="modal-footer">
                    <button class="btn-danger" id="confirm-delete">
                        <i class="fa-solid fa-trash-can"></i>
                        Delete Token
                    </button>
                    <button class="user-button" id="cancel-delete-btn" style="justify-content: center;">Keep Token</button>
                </div>
            </div>
        `;
        this.cb.showModal(content);
        document.getElementById('confirm-delete')?.addEventListener('click', async () => {
            this.cb.setLoading(true, "Removing Token", "PERMANENT DELETION IN PROGRESS");
            try {
                const res = await (window as any).api.deleteAccount(account.id);
                if (res.conflict) {
                    this.showSyncConflictModal('delete-account', account.id);
                    return;
                }
                this.accounts = res.accounts || [];
                this.renderAccounts();
                this.cb.hideModal();
                this.cb.showToast("Account removed", "info");
                this.cb.updateLastActivity('Deleted token');
            } finally {
                this.cb.setLoading(false);
            }
        });
        document.getElementById('cancel-delete-btn')?.addEventListener('click', () => this.cb.hideModal());
    }

    // ─── Export / Import Modals ───────────────────────────────────────────────

    public showExportOptionsModal() {
        const content = `
            <div class="custom-scrollbar" style="max-height: 85vh; overflow-y: auto; max-width: 580px; padding: clamp(24px, 5vw, 32px); margin: 0 auto;">
                <div style="display: flex; align-items: flex-start; gap: 18px; margin-bottom: 24px;">
                    <div class="account-icon nm-icon-large" style="width: 64px; height: 64px; flex-shrink: 0;">
                        <i class="fa-solid fa-download" style="font-size: 28px;"></i>
                    </div>
                    <div style="flex: 1; min-width: 0;">
                        <h2 style="font-weight: 900; font-size: clamp(20px, 4vw, 24px); color: var(--text-primary); margin: 0 0 6px 0; line-height: 1.2;">Export Vault</h2>
                        <p style="font-size: 12px; color: var(--text-secondary); font-weight: 600; line-height: 1.4;">Choose your preferred export format</p>
                    </div>
                </div>
                <div style="display: grid; gap: 10px; margin-bottom: 20px;">
                    <button class="export-option-card" data-format="encrypted" style="display: flex; align-items: center; gap: 14px; padding: 14px; background: var(--bg-primary); border: 2px solid transparent; border-radius: 12px; box-shadow: var(--nm-shadow-out); cursor: pointer; transition: all 0.2s ease; text-align: left; width: 100%;">
                        <div class="export-option-icon"><i class="fa-solid fa-lock" style="font-size: 18px; color: var(--accent-primary);"></i></div>
                        <div style="flex: 1; min-width: 0;">
                            <div style="font-size: 14px; font-weight: 800; color: var(--text-primary); margin-bottom: 3px;">Full Encrypted Backup</div>
                            <div style="font-size: 11px; color: var(--text-secondary); font-weight: 600; line-height: 1.3;">Complete vault with settings (.keyra)</div>
                        </div>
                        <div class="export-check" style="width: 22px; height: 22px; border-radius: 50%; border: 2px solid var(--text-secondary); display: flex; align-items: center; justify-content: center; opacity: 0; transition: all 0.2s ease;">
                            <i class="fa-solid fa-check" style="font-size: 11px; color: var(--success);"></i>
                        </div>
                    </button>
                    <button class="export-option-card" data-format="qr-pdf" style="display: flex; align-items: center; gap: 14px; padding: 14px; background: var(--bg-primary); border: 2px solid transparent; border-radius: 12px; box-shadow: var(--nm-shadow-out); cursor: pointer; transition: all 0.2s ease; text-align: left; width: 100%;">
                        <div class="export-option-icon"><i class="fa-solid fa-qrcode" style="font-size: 18px; color: var(--accent-primary);"></i></div>
                        <div style="flex: 1; min-width: 0;">
                            <div style="font-size: 14px; font-weight: 800; color: var(--text-primary); margin-bottom: 3px;">QR Codes (PDF)</div>
                            <div style="font-size: 11px; color: var(--text-secondary); font-weight: 600; line-height: 1.3;">Printable QR codes for each account</div>
                        </div>
                        <div class="export-check" style="width: 22px; height: 22px; border-radius: 50%; border: 2px solid var(--text-secondary); display: flex; align-items: center; justify-content: center; opacity: 0; transition: all 0.2s ease;">
                            <i class="fa-solid fa-check" style="font-size: 11px; color: var(--success);"></i>
                        </div>
                    </button>
                    <button class="export-option-card" data-format="json" style="display: flex; align-items: center; gap: 14px; padding: 14px; background: var(--bg-primary); border: 2px solid transparent; border-radius: 12px; box-shadow: var(--nm-shadow-out); cursor: pointer; transition: all 0.2s ease; text-align: left; width: 100%;">
                        <div class="export-option-icon"><i class="fa-solid fa-file-code" style="font-size: 18px; color: #ff9500;"></i></div>
                        <div style="flex: 1; min-width: 0;">
                            <div style="font-size: 14px; font-weight: 800; color: var(--text-primary); margin-bottom: 3px;">Plain JSON</div>
                            <div style="font-size: 11px; color: var(--text-secondary); font-weight: 600; line-height: 1.3;">Unencrypted JSON for migration (.json)</div>
                        </div>
                        <div class="export-check" style="width: 22px; height: 22px; border-radius: 50%; border: 2px solid var(--text-secondary); display: flex; align-items: center; justify-content: center; opacity: 0; transition: all 0.2s ease;">
                            <i class="fa-solid fa-check" style="font-size: 11px; color: var(--success);"></i>
                        </div>
                    </button>
                    <button class="export-option-card" data-format="text" style="display: flex; align-items: center; gap: 14px; padding: 14px; background: var(--bg-primary); border: 2px solid transparent; border-radius: 12px; box-shadow: var(--nm-shadow-out); cursor: pointer; transition: all 0.2s ease; text-align: left; width: 100%;">
                        <div class="export-option-icon"><i class="fa-solid fa-file-lines" style="font-size: 18px; color: var(--text-secondary);"></i></div>
                        <div style="flex: 1; min-width: 0;">
                            <div style="font-size: 14px; font-weight: 800; color: var(--text-primary); margin-bottom: 3px;">Text File</div>
                            <div style="font-size: 11px; color: var(--text-secondary); font-weight: 600; line-height: 1.3;">Human-readable text format (.txt)</div>
                        </div>
                        <div class="export-check" style="width: 22px; height: 22px; border-radius: 50%; border: 2px solid var(--text-secondary); display: flex; align-items: center; justify-content: center; opacity: 0; transition: all 0.2s ease;">
                            <i class="fa-solid fa-check" style="font-size: 11px; color: var(--success);"></i>
                        </div>
                    </button>
                </div>
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
                    <div id="export-accounts-list" style="display: none; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--bg-secondary);"></div>
                </div>
                <div style="display: flex; gap: 10px;">
                    <button class="btn-primary" id="confirm-export" style="flex: 2; height: 52px; font-size: 14px; font-weight: 800; border-radius: 12px;">
                        <i class="fa-solid fa-download"></i>
                        <span>Export Vault</span>
                    </button>
                    <button class="user-button" id="cancel-export" style="flex: 1; justify-content: center; height: 52px; font-weight: 800; border-radius: 12px;">Cancel</button>
                </div>
            </div>
        `;
        this.cb.showModal(content);

        let selectedFormat = 'encrypted';
        const selectionContainer = document.getElementById('export-selection-container');

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
                if (selectionContainer) {
                    selectionContainer.style.display = selectedFormat === 'encrypted' ? 'none' : 'block';
                }
            });
        });

        const firstCard = document.querySelector('.export-option-card') as HTMLElement;
        if (firstCard) firstCard.click();

        const selectiveToggle = document.getElementById('export-selective') as HTMLInputElement;
        const accountsList = document.getElementById('export-accounts-list');
        selectiveToggle?.addEventListener('change', () => {
            if (accountsList) {
                if (selectiveToggle.checked) {
                    accountsList.style.display = 'none';
                } else {
                    accountsList.style.display = 'block';
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

        document.getElementById('confirm-export')?.addEventListener('click', async () => {
            const exportAll = selectiveToggle?.checked !== false;
            let accountsToExport = this.accounts;
            if (!exportAll) {
                const selectedIds = Array.from(document.querySelectorAll('.export-account-check:checked'))
                    .map(cb => (cb as HTMLInputElement).getAttribute('data-id'));
                accountsToExport = this.accounts.filter(acc => selectedIds.includes(acc.id));
                if (accountsToExport.length === 0) {
                    this.cb.showToast("Please select at least one account", "error");
                    return;
                }
            }
            this.cb.hideModal();
            await this.performExport(selectedFormat, accountsToExport);
        });

        document.getElementById('cancel-export')?.addEventListener('click', () => this.cb.hideModal());
    }

    public async performExport(format: string, accounts: any[]) {
        this.cb.setLoading(true, "Exporting Vault", "PREPARING SECURE EXPORT");
        try {
            switch (format) {
                case 'encrypted': await this.exportEncrypted(); break;
                case 'qr-pdf': await this.exportQRCodesPDF(accounts); break;
                case 'json': await this.exportJSON(accounts); break;
                case 'text': await this.exportText(accounts); break;
            }
            this.cb.showToast("Export completed successfully!", "success");
            this.cb.updateLastActivity('Exported vault');
        } catch (error) {
            console.error("Export failed:", error);
            this.cb.showToast("Export failed. Please try again.", "error");
        } finally {
            this.cb.setLoading(false);
        }
    }

    private async exportEncrypted() {
        const res = await (window as any).api.exportVault();
        if (!res.success && res.message) throw new Error(res.message);
    }

    private async exportQRCodesPDF(accounts: any[]) {
        const res = await (window as any).api.exportQRHTML(accounts);
        if (!res.success && res.message) throw new Error(res.message);
        if (res.success) this.cb.showToast("Open the HTML file and print to PDF", "info");
    }

    private async exportJSON(accounts: any[]) {
        const res = await (window as any).api.exportJSON(accounts);
        if (!res.success && res.message) throw new Error(res.message);
    }

    private async exportText(accounts: any[]) {
        const res = await (window as any).api.exportText(accounts);
        if (!res.success && res.message) throw new Error(res.message);
    }

    public getIcon(issuer: string): string {
        const name = issuer.toLowerCase();

        const icons: { [key: string]: string } = {
            'google': 'fa-brands fa-google', 'github': 'fa-brands fa-github', 'microsoft': 'fa-brands fa-microsoft', 'apple': 'fa-brands fa-apple',
            'amazon': 'fa-brands fa-amazon', 'facebook': 'fa-brands fa-facebook', 'twitter': 'fa-brands fa-twitter', 'discord': 'fa-brands fa-discord',
            'binance': 'fa-solid fa-coins', 'coinbase': 'fa-solid fa-wallet', 'stripe': 'fa-brands fa-stripe', 'paypal': 'fa-brands fa-paypal',
            'slack': 'fa-brands fa-slack', 'instagram': 'fa-brands fa-instagram', 'linkedin': 'fa-brands fa-linkedin', 'twitch': 'fa-brands fa-twitch',
            'spotify': 'fa-brands fa-spotify', 'netflix': 'fa-solid fa-tv', 'steam': 'fa-brands fa-steam', 'epic': 'fa-solid fa-gamepad',
            'dropbox': 'fa-brands fa-dropbox', 'figma': 'fa-brands fa-figma', 'canva': 'fa-solid fa-palette', 'adobe': 'fa-solid fa-pen-nib',
            'shopify': 'fa-brands fa-shopify', 'reddit': 'fa-brands fa-reddit', 'bitbucket': 'fa-brands fa-bitbucket',
            'gitlab': 'fa-brands fa-gitlab', 'heroku': 'fa-solid fa-server', 'digitalocean': 'fa-brands fa-digital-ocean', 'cloudflare': 'fa-brands fa-cloudflare',
            'vercel': 'fa-solid fa-triangle-exclamation', 'netlify': 'fa-solid fa-globe', 'firebase': 'fa-solid fa-flame', 'wordpress': 'fa-brands fa-wordpress',
            'medium': 'fa-brands fa-medium', 'patreon': 'fa-brands fa-patreon', 'discordapp': 'fa-brands fa-discord',
            'protonmail': 'fa-solid fa-envelope', 'nordvpn': 'fa-solid fa-shield-halved', 'expressvpn': 'fa-solid fa-shield-halved',
            'bitwarden': 'fa-solid fa-lock', '1password': 'fa-solid fa-key', 'lastpass': 'fa-solid fa-key',
            'uber': 'fa-brands fa-uber', 'lyft': 'fa-solid fa-car', 'airbnb': 'fa-brands fa-airbnb', 'notion': 'fa-solid fa-file-lines',
            'zoom': 'fa-solid fa-video', 'trello': 'fa-brands fa-trello', 'asana': 'fa-solid fa-list-check', 'clickup': 'fa-solid fa-layer-group'
        };

        if (icons[name]) return icons[name];

        const keywords: [string | RegExp, string][] = [
            [/aws|amazon|cloud/i, 'fa-solid fa-cloud'],
            [/azure|microsoft/i, 'fa-brands fa-microsoft'],
            [/server|host|vps|deploy/i, 'fa-solid fa-server'],
            [/db|database|mongo|sql|redis/i, 'fa-solid fa-database'],
            [/mail|email|outlook|gmail/i, 'fa-solid fa-envelope'],
            [/chat|message|messenger|slack|discord/i, 'fa-solid fa-comment-dots'],
            [/social|network|brand/i, 'fa-solid fa-share-nodes'],
            [/bank|finance|money|wallet|pay/i, 'fa-solid fa-wallet'],
            [/crypto|coin|token|eth|btc/i, 'fa-solid fa-coins'],
            [/card|credit|debit/i, 'fa-solid fa-credit-card'],
            [/auth|security|protect|shield|vault/i, 'fa-solid fa-shield-halved'],
            [/key|password|pass|login|access/i, 'fa-solid fa-key'],
            [/code|dev|git|build|repo/i, 'fa-solid fa-code'],
            [/api|endpoint|webhook/i, 'fa-solid fa-link'],
            [/video|movie|tv|stream|netflix|yt|youtube/i, 'fa-solid fa-video'],
            [/music|audio|song|sound/i, 'fa-solid fa-music'],
            [/game|play|epic|xbox|psn/i, 'fa-solid fa-gamepad'],
            [/shop|store|cart|ebay|buy/i, 'fa-solid fa-cart-shopping'],
            [/user|account|profile|id/i, 'fa-solid fa-user'],
            [/work|corp|company|office/i, 'fa-solid fa-briefcase']
        ];

        for (const [pattern, icon] of keywords) {
            if (typeof pattern === 'string' && name.includes(pattern)) return icon;
            if (pattern instanceof RegExp && pattern.test(name)) return icon;
        }

        return 'fa-solid fa-shield';
    }
}
