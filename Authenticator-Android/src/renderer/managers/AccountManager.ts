import { Haptics, ImpactStyle } from '@capacitor/haptics';
import jsQR from 'jsqr';

export interface AccountManagerHost {
    userId: string;
    getStorageKey(key: string): string;
    updateLastActivity(action: string): void;
    showToast(message: string, type: 'info' | 'success' | 'error'): void;
    showModal(content: string): void;
    hideModal(): void;
    applySettings(settings: any, saveLocal?: boolean): void;
    showEditModal(account: any): void;
    showDeleteConfirm(account: any): void;
    showOtpModal(account: any): void;
    showAddModal(): void;
    privacyMode: boolean;
    vaultViewStyle: 'unified' | 'compact' | 'focus' | 'secure';
    accounts: any[];
    searchQuery: string;
    timerInterval: any;
}

/** Close every open card dropdown */
function closeAllCardDropdowns() {
    document.querySelectorAll<HTMLElement>('.card-dropdown.show').forEach(d => d.classList.remove('show'));
    document.querySelectorAll<HTMLElement>('.btn-card-more.active').forEach(b => b.classList.remove('active'));
}

export class AccountManager {
    private host: AccountManagerHost;

    constructor(host: AccountManagerHost) {
        this.host = host;
    }

    // ─── Public API ────────────────────────────────────────────────────────────

    public async loadInitialData(): Promise<void> {
        this.showSkeletonLoaders();
        try {
            const user = await (window as any).api.getCurrentUser();

            if (user) {
                const settings = { ...(user.settings || {}), autolock: user.autolock };
                this.host.applySettings(settings, true);
            }

            const ids = ['user-name-display', 'dropdown-user-name', 'mobile-dropdown-user-name'];
            const emailIds = ['dropdown-user-email', 'mobile-dropdown-user-email'];
            ids.forEach(id => { const el = document.getElementById(id); if (el && user) el.textContent = user.username; });
            emailIds.forEach(id => { const el = document.getElementById(id); if (el && user) el.textContent = user.email || ''; });

            if (user) {
                this.syncAvatar('navbar-avatar-img', 'navbar-avatar-initials', user);
                this.syncAvatar('mobile-avatar-img', 'mobile-avatar-initials', user);
                this.syncAvatar('sheet-avatar-img', 'sheet-avatar-initials', user);
            }

            await this.refreshAccounts();
        } catch (err) {
            console.error('Initial load failed', err);
        }
    }

    public async refreshAccounts(): Promise<void> {
        this.showSkeletonLoaders();
        this.host.accounts = await (window as any).api.getAccounts();
        await new Promise(resolve => setTimeout(resolve, 300));
        this.renderAccounts();
    }

    public renderAccounts() {
        const grid = document.getElementById('accounts-grid');
        const emptyState = document.getElementById('empty-state');
        const searchEmptyState = document.getElementById('search-empty-state');
        const searchTermSpan = document.getElementById('empty-search-term');

        if (!grid || !emptyState || !searchEmptyState) return;

        const filtered = this.host.accounts.filter(acc =>
            acc.issuer.toLowerCase().includes(this.host.searchQuery) ||
            acc.account.toLowerCase().includes(this.host.searchQuery)
        );

        if (this.host.accounts.length === 0) {
            grid.classList.add('hidden');
            searchEmptyState.classList.add('hidden');
            emptyState.classList.remove('hidden');
        } else if (filtered.length === 0) {
            grid.classList.add('hidden');
            emptyState.classList.add('hidden');
            searchEmptyState.classList.remove('hidden');
            if (searchTermSpan) searchTermSpan.textContent = this.host.searchQuery;
        } else {
            grid.classList.remove('hidden');
            emptyState.classList.add('hidden');
            searchEmptyState.classList.add('hidden');
            grid.innerHTML = '';

            if (this.host.vaultViewStyle === 'focus') {
                this.renderFocusView(grid, filtered);
            } else {
                filtered.forEach((acc, index) => grid.appendChild(this.createAccountCard(acc, index)));
            }
        }

        if (document.body.classList.contains('vault-is-locked')) {
            this.clearAllOTPCodes();
        }
    }

    public startTimer() {
        if (this.host.timerInterval) clearInterval(this.host.timerInterval);
        this.host.timerInterval = setInterval(async () => {
            // Skip tick when app is backgrounded — saves CPU/battery
            if ((window as any).__appInBackground) return;
            const remaining = await (window as any).api.getRemainingSeconds();

            if (this.host.vaultViewStyle === 'focus') {
                // Update focus card
                const focusCard = document.getElementById('focus-main-card');
                if (focusCard) {
                    const secret = focusCard.dataset.secret;
                    if (secret) this.updateFocusCardOTP(focusCard, secret, remaining);
                }
            } else {
                document.querySelectorAll<HTMLElement>('.account-card').forEach((card, i) => {
                    if (this.host.accounts[i]) this.updateCardOTP(card, this.host.accounts[i].secret, remaining);
                });
            }
        }, 1000);
    }

    public clearAllOTPCodes() {
        document.querySelectorAll('.otp-code, .focus-card-otp').forEach(el => { el.textContent = '••••••'; });
    }

    // ─── Private helpers ───────────────────────────────────────────────────────

    private showSkeletonLoaders(count: number = 6) {
        const grid = document.getElementById('accounts-grid');
        const emptyState = document.getElementById('empty-state');
        const searchEmptyState = document.getElementById('search-empty-state');
        if (!grid) return;
        emptyState?.classList.add('hidden');
        searchEmptyState?.classList.add('hidden');
        grid.classList.remove('hidden');
        grid.innerHTML = '';
        for (let i = 0; i < count; i++) grid.appendChild(this.createSkeletonCard(i));
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

    // ─── Focus View ────────────────────────────────────────────────────────────

    private focusIndex: number = 0;

    private renderFocusView(grid: HTMLElement, accounts: any[]) {
        this.focusIndex = Math.min(this.focusIndex, accounts.length - 1);
        const active = accounts[this.focusIndex];

        // ── Big focus card ──
        const ringCircumference = 113.1; // r=18: 2π×18
        const focusCard = document.createElement('div');
        focusCard.id = 'focus-main-card';
        focusCard.className = 'focus-main-card';
        focusCard.dataset.secret = active.secret;
        focusCard.dataset.index = String(this.focusIndex);
        focusCard.innerHTML = `
            <div class="focus-card-header">
                <div class="focus-card-icon">
                    <i class="${this.getIcon(active.issuer)}"></i>
                </div>
                <div class="focus-card-identity">
                    <div class="focus-card-name">${active.issuer}</div>
                    <div class="focus-card-account">${active.account}</div>
                </div>
                <div class="focus-card-timer">
                    <svg class="focus-timer-ring" viewBox="0 0 44 44">
                        <circle cx="22" cy="22" r="18" fill="none" stroke="var(--bg-secondary)" stroke-width="3.5"></circle>
                        <circle class="focus-timer-progress" cx="22" cy="22" r="18" fill="none"
                            stroke="var(--accent-primary)" stroke-width="3.5" stroke-linecap="round"
                            stroke-dasharray="${ringCircumference}" stroke-dashoffset="0"
                            transform="rotate(-90 22 22)"
                            style="transition: stroke-dashoffset 1s linear, stroke 0.3s ease;"></circle>
                    </svg>
                    <span class="focus-timer-seconds">30</span>
                </div>
            </div>
            <div class="focus-card-otp ${this.host.privacyMode ? 'privacy-hidden' : ''}" data-id="${active.id}">
                ${this.host.privacyMode ? '•••  •••' : '---  ---'}
            </div>
            <div class="focus-card-actions">
                <button class="focus-action-btn focus-copy-btn">
                    <i class="fa-solid fa-copy"></i>
                    <span>Copy</span>
                </button>
                <button class="focus-action-btn focus-edit-btn">
                    <i class="fa-solid fa-sliders"></i>
                    <span>Edit</span>
                </button>
                <button class="focus-action-btn focus-delete-btn danger">
                    <i class="fa-solid fa-trash-can"></i>
                    <span>Delete</span>
                </button>
            </div>
        `;

        // Copy
        focusCard.querySelector('.focus-copy-btn')?.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (document.body.classList.contains('vault-is-locked')) {
                this.host.showToast('Vault Locked - Enter PIN to Access', 'error'); return;
            }
            const otp = await (window as any).api.generateTOTP(active.secret);
            await navigator.clipboard.writeText(otp);
            Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});
            const btn = focusCard.querySelector('.focus-copy-btn') as HTMLElement;
            const icon = btn.querySelector('i') as HTMLElement;
            const label = btn.querySelector('span') as HTMLElement;
            icon.className = 'fa-solid fa-check';
            label.textContent = 'Copied!';
            btn.classList.add('copied');
            setTimeout(() => {
                icon.className = 'fa-solid fa-copy';
                label.textContent = 'Copy';
                btn.classList.remove('copied');
            }, 1500);
            this.host.showToast('Code copied!', 'success');
            this.host.updateLastActivity('OTP copied');
        });

        // Tap OTP to copy
        focusCard.querySelector('.focus-card-otp')?.addEventListener('click', async () => {
            if (document.body.classList.contains('vault-is-locked')) return;
            const otp = await (window as any).api.generateTOTP(active.secret);
            this.copyOTPToClipboard(otp, focusCard.querySelector('.focus-card-otp') as HTMLElement);
        });

        // Edit
        focusCard.querySelector('.focus-edit-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (document.body.classList.contains('vault-is-locked')) {
                this.host.showToast('Vault Locked - Enter PIN to Access', 'error'); return;
            }
            this.host.showEditModal(active);
        });

        // Delete
        focusCard.querySelector('.focus-delete-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (document.body.classList.contains('vault-is-locked')) {
                this.host.showToast('Vault Locked - Enter PIN to Access', 'error'); return;
            }
            this.host.showDeleteConfirm(active);
        });

        grid.appendChild(focusCard);
        this.updateFocusCardOTP(focusCard, active.secret, 30);

        // ── Mini grid ──
        if (accounts.length > 1) {
            const miniGrid = document.createElement('div');
            miniGrid.className = 'focus-mini-grid';

            accounts.forEach((acc, idx) => {
                const chip = document.createElement('button');
                chip.className = `focus-chip${idx === this.focusIndex ? ' active' : ''}`;
                chip.innerHTML = `
                    <div class="focus-chip-icon"><i class="${this.getIcon(acc.issuer)}"></i></div>
                    <div class="focus-chip-name">${acc.issuer}</div>
                    <div class="focus-chip-account">${acc.account}</div>
                `;
                chip.addEventListener('click', () => {
                    this.focusIndex = idx;
                    this.renderAccounts();
                });
                miniGrid.appendChild(chip);
            });

            grid.appendChild(miniGrid);
        }
    }

    private async updateFocusCardOTP(card: HTMLElement, secret: string, remainingSeconds: number) {
        if (document.body.classList.contains('vault-is-locked')) return;

        const codeEl = card.querySelector('.focus-card-otp') as HTMLElement;
        if (codeEl) {
            if (this.host.privacyMode) {
                if (codeEl.textContent?.trim() !== '•••  •••') codeEl.textContent = '•••  •••';
            } else {
                const otp = await (window as any).api.generateTOTP(secret);
                const display = otp.substring(0, 3) + '  ' + otp.substring(3);
                if (codeEl.textContent?.trim() !== display) codeEl.textContent = display;
            }
        }

        const isWarning = remainingSeconds <= 10 && remainingSeconds > 5;
        const isDanger = remainingSeconds <= 5;
        const strokeColor = isDanger ? '#ff3b30' : isWarning ? '#ff9500' : 'var(--accent-primary)';
        const ringCircumference = 113.1;

        const progressCircle = card.querySelector('.focus-timer-progress') as SVGCircleElement;
        if (progressCircle) {
            progressCircle.style.strokeDashoffset = (ringCircumference * (1 - remainingSeconds / 30)).toString();
            progressCircle.style.stroke = strokeColor;
        }
        const secondsEl = card.querySelector('.focus-timer-seconds') as HTMLElement;
        if (secondsEl) secondsEl.textContent = remainingSeconds.toString();

        // Pulse the OTP on danger
        if (codeEl) {
            codeEl.classList.toggle('timer-danger', isDanger);
        }
    }

    private createAccountCard(account: any, index: number): HTMLElement {
        const card = document.createElement('div');
        card.className = 'account-card';
        card.style.animationDelay = `${index * 0.06}s`;

        // Circumference for the 28px ring (r=11): 2π×11 ≈ 69.1
        const ringCircumference = 69.1;

        card.innerHTML = `
            <div class="card-actions">
                ${this.host.vaultViewStyle !== 'secure' ? `
                <button class="btn-card-copy" title="Copy code">
                    <i class="fa-solid fa-copy"></i>
                </button>
                ` : ''}
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
                ${this.host.vaultViewStyle !== 'secure' ? `
                <div class="otp-code ${this.host.privacyMode ? 'privacy-hidden' : ''}" data-id="${account.id}" title="Tap to copy">
                    ${this.host.privacyMode ? '••••••' : '------'}
                </div>
                ${this.host.vaultViewStyle !== 'unified' ? `
                <div class="otp-timer-badge">
                    <svg class="otp-timer-ring" viewBox="0 0 28 28">
                        <circle cx="14" cy="14" r="11" fill="none" stroke="var(--bg-secondary)" stroke-width="3"></circle>
                        <circle class="timer-progress" cx="14" cy="14" r="11" fill="none"
                            stroke="var(--accent-primary)" stroke-width="3" stroke-linecap="round"
                            stroke-dasharray="${ringCircumference}" stroke-dashoffset="0"
                            transform="rotate(-90 14 14)"
                            style="transition: stroke-dashoffset 1s linear, stroke 0.3s ease;"></circle>
                    </svg>
                    <span class="otp-timer-seconds">30</span>
                </div>
                ` : ''}
                ` : `
                <button class="btn-primary secure-view-btn" style="width: 100%; height: 50px; border-radius: 14px;">
                    <i class="fa-solid fa-shield-halved"></i>
                    <span>Secure View</span>
                </button>
                `}
            </div>
        `;

        // 3-dot dropdown
        const moreBtn = card.querySelector('.btn-card-more') as HTMLElement;
        const dropdown = card.querySelector('.card-dropdown') as HTMLElement;
        moreBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = dropdown.classList.contains('show');
            closeAllCardDropdowns();
            if (!isOpen) { dropdown.classList.add('show'); moreBtn.classList.add('active'); }
        });

        // Copy icon button in card-actions
        const copyBtn = card.querySelector('.btn-card-copy') as HTMLElement;
        if (copyBtn) {
            copyBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (document.body.classList.contains('vault-is-locked')) {
                    this.host.showToast('Vault Locked - Enter PIN to Access', 'error');
                    return;
                }
                const otp = await (window as any).api.generateTOTP(account.secret);
                await navigator.clipboard.writeText(otp);
                Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});
                const icon = copyBtn.querySelector('i') as HTMLElement;
                icon.className = 'fa-solid fa-check';
                copyBtn.classList.add('copied');
                setTimeout(() => {
                    icon.className = 'fa-solid fa-copy';
                    copyBtn.classList.remove('copied');
                }, 1200);
                this.host.showToast('Code copied!', 'success');
                this.host.updateLastActivity('OTP copied');
            });
        }

        // OTP code tap to copy
        const codeElement = card.querySelector('.otp-code') as HTMLElement;
        codeElement?.addEventListener('click', async () => {
            if (document.body.classList.contains('vault-is-locked')) {
                this.host.showToast('Vault Locked - Enter PIN to Access', 'error');
                return;
            }
            const otp = await (window as any).api.generateTOTP(account.secret);
            this.copyOTPToClipboard(otp, codeElement);
        });

        // Full card tap to copy
        card.addEventListener('click', async (e) => {
            const target = e.target as HTMLElement;
            if (target.closest('.card-actions, .secure-view-btn, .otp-code')) return;
            if (document.body.classList.contains('vault-is-locked')) return;
            if (this.host.vaultViewStyle === 'secure') return;
            const otp = await (window as any).api.generateTOTP(account.secret);
            this.copyOTPToClipboard(otp, (card.querySelector('.otp-code') as HTMLElement) || card);
        });

        card.querySelector('.edit-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (document.body.classList.contains('vault-is-locked')) {
                this.host.showToast('Vault Locked - Enter PIN to Access', 'error'); return;
            }
            this.host.showEditModal(account);
        });

        card.querySelector('.delete-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (document.body.classList.contains('vault-is-locked')) {
                this.host.showToast('Vault Locked - Enter PIN to Access', 'error'); return;
            }
            this.host.showDeleteConfirm(account);
        });

        card.querySelector('.secure-view-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (document.body.classList.contains('vault-is-locked')) {
                this.host.showToast('Vault Locked - Enter PIN to Access', 'error'); return;
            }
            this.host.showOtpModal(account);
        });

        this.updateCardOTP(card, account.secret, 30);
        return card;
    }

    private async updateCardOTP(card: HTMLElement, secret: string, remainingSeconds: number) {
        const codeElement = card.querySelector('.otp-code') as HTMLElement;

        if (document.body.classList.contains('vault-is-locked')) {
            if (codeElement) codeElement.textContent = '••••••';
            return;
        }

        if (codeElement) {
            if (this.host.privacyMode) {
                if (codeElement.textContent !== '••••••') codeElement.textContent = '••••••';
            } else {
                const otp = await (window as any).api.generateTOTP(secret);
                const displayOtp = otp.substring(0, 3) + ' ' + otp.substring(3);
                if (codeElement.textContent !== displayOtp) codeElement.textContent = displayOtp;
            }
        }

        const isWarning = remainingSeconds <= 10 && remainingSeconds > 5;
        const isDanger = remainingSeconds <= 5;
        const strokeColor = isDanger ? '#ff3b30' : isWarning ? '#ff9500' : 'var(--accent-primary)';

        // Ring + seconds — only in compact mode (unified uses global bar, secure has none)
        if (this.host.vaultViewStyle === 'compact') {
            const ringCircumference = 69.1;
            const progressCircle = card.querySelector('.timer-progress') as SVGCircleElement;
            if (progressCircle) {
                progressCircle.style.strokeDashoffset = (ringCircumference * (1 - remainingSeconds / 30)).toString();
                progressCircle.style.stroke = strokeColor;
            }
            const secondsEl = card.querySelector('.otp-timer-seconds') as HTMLElement;
            if (secondsEl) secondsEl.textContent = remainingSeconds.toString();
        }

        // Global bar — unified mode only
        if (this.host.vaultViewStyle === 'unified') {
            const globalBar = document.getElementById('global-otp-timer') as HTMLElement;
            if (globalBar) {
                globalBar.style.transform = `scaleX(${remainingSeconds / 30})`;
                globalBar.classList.toggle('timer-warning', isWarning);
                globalBar.classList.toggle('timer-danger', isDanger);
                if (remainingSeconds > 10) globalBar.style.backgroundColor = '';
            }
        }
    }

    private copyOTPToClipboard(otp: string, element: HTMLElement) {
        navigator.clipboard.writeText(otp).then(() => {
            Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});
            this.showCopyFeedback(element);
            this.host.updateLastActivity('OTP copied');
            this.host.showToast('Code copied!', 'success');
        }).catch(() => {
            this.host.showToast('Failed to copy', 'error');
        });
    }

    private showCopyFeedback(element: HTMLElement) {
        const originalText = element.textContent;
        const originalColor = element.style.color;
        element.textContent = 'Copied!';
        element.style.color = '#28a745';
        element.style.transform = 'scale(1.1)';
        element.style.transition = 'all 0.2s ease';
        setTimeout(() => {
            element.textContent = originalText;
            element.style.color = originalColor;
            element.style.transform = 'scale(1)';
        }, 1000);

        const copyBtn = element.closest('.copy-btn') as HTMLElement;
        if (copyBtn) {
            copyBtn.classList.add('copied');
            const ripple = document.createElement('span');
            ripple.className = 'copy-ripple';
            copyBtn.appendChild(ripple);
            setTimeout(() => { ripple.remove(); copyBtn.classList.remove('copied'); }, 600);
        }
    }

    private syncAvatar(imgId: string, initialsId: string, user: any) {
        const img = document.getElementById(imgId) as HTMLImageElement;
        const initials = document.getElementById(initialsId);
        if (!img || !initials) return;
        if (user.profilePicture) {
            img.src = user.profilePicture;
            img.classList.remove('hidden');
            initials.classList.add('hidden');
        } else {
            img.classList.add('hidden');
            initials.classList.remove('hidden');
            initials.textContent = user.username.charAt(0).toUpperCase();
        }
    }

    // ─── Add / Edit Modals ─────────────────────────────────────────────────────

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
                    <div class="add-modal-tabs">
                        <button class="add-modal-tab active" id="tab-scan">
                            <i class="fa-solid fa-qrcode"></i> Scan QR
                        </button>
                        <button class="add-modal-tab" id="tab-manual">
                            <i class="fa-solid fa-keyboard"></i> Manual
                        </button>
                    </div>

                    <!-- QR Scanner pane -->
                    <div id="pane-scan">
                        <div class="qr-scanner-vessel" id="qr-vessel">
                            <video id="qr-video" playsinline muted autoplay></video>
                            <canvas id="qr-canvas"></canvas>
                            <div class="qr-scanner-frame">
                                <div class="qr-frame-bl"></div>
                                <div class="qr-frame-br"></div>
                            </div>
                            <div class="qr-scan-line"></div>
                            <div class="qr-scanner-hint">Point camera at a TOTP QR code</div>
                        </div>
                        <div id="qr-error" class="qr-error-banner hidden">
                            <i class="fa-solid fa-circle-exclamation"></i>
                            <span id="qr-error-text">Camera unavailable</span>
                        </div>
                    </div>

                    <!-- Manual entry pane -->
                    <div id="pane-manual" class="hidden">
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
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn-primary hidden" id="save-new-account">
                    <i class="fa-solid fa-shield-halved"></i>
                    Save Token
                </button>
                <button class="user-button" id="cancel-add-btn" style="justify-content: center;">Cancel</button>
            </div>
        `;
        this.host.showModal(content);

        // ── Tab switching ──────────────────────────────────────────────────────
        let stream: MediaStream | null = null;
        let rafId: number | null = null;

        const stopCamera = () => {
            if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
            if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
        };

        const showError = (msg: string) => {
            const err = document.getElementById('qr-error');
            const txt = document.getElementById('qr-error-text');
            if (err) err.classList.remove('hidden');
            if (txt) txt.textContent = msg;
        };

        const startCamera = async () => {
            const video = document.getElementById('qr-video') as HTMLVideoElement;
            const canvas = document.getElementById('qr-canvas') as HTMLCanvasElement;
            if (!video || !canvas) return;
            try {
                stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
                video.srcObject = stream;
                await video.play();
                const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

                const tick = () => {
                    // Stop if modal closed
                    if (!document.getElementById('qr-video')) { stopCamera(); return; }
                    if (video.readyState === video.HAVE_ENOUGH_DATA) {
                        canvas.width = video.videoWidth;
                        canvas.height = video.videoHeight;
                        ctx.drawImage(video, 0, 0);
                        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
                        const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
                        if (code?.data) {
                            handleScannedQR(code.data);
                            return; // stop loop on success
                        }
                    }
                    rafId = requestAnimationFrame(tick);
                };
                rafId = requestAnimationFrame(tick);
            } catch (err: any) {
                const msg = err?.name === 'NotAllowedError'
                    ? 'Camera permission denied'
                    : 'Camera unavailable — use Manual entry';
                showError(msg);
            }
        };

        const handleScannedQR = async (data: string) => {
            stopCamera();
            try {
                if (!data.startsWith('otpauth://')) throw new Error('Not a valid OTP QR code');
                const parsed = await (window as any).api.parseURI(data);
                // Show success overlay briefly
                const vessel = document.getElementById('qr-vessel');
                if (vessel) {
                    const overlay = document.createElement('div');
                    overlay.className = 'qr-scanner-success';
                    overlay.innerHTML = `<i class="fa-solid fa-circle-check"></i><span>${parsed.issuer} detected</span>`;
                    vessel.appendChild(overlay);
                }
                Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});
                await new Promise(r => setTimeout(r, 900));
                const res = await (window as any).api.saveAccount({
                    id: Date.now().toString(),
                    issuer: parsed.issuer,
                    account: parsed.account,
                    secret: parsed.secret
                });
                this.host.accounts = res || [];
                this.renderAccounts();
                this.host.hideModal();
                this.host.showToast(`${parsed.issuer} added!`, 'success');
                this.host.updateLastActivity('Added token via QR');
            } catch (err: any) {
                showError(err?.message || 'Invalid QR code — try Manual entry');
                // Restart camera after bad scan
                setTimeout(() => startCamera(), 1500);
            }
        };

        // Start camera immediately on scan tab
        startCamera();

        document.getElementById('tab-scan')?.addEventListener('click', () => {
            document.getElementById('tab-scan')?.classList.add('active');
            document.getElementById('tab-manual')?.classList.remove('active');
            document.getElementById('pane-scan')?.classList.remove('hidden');
            document.getElementById('pane-manual')?.classList.add('hidden');
            document.getElementById('save-new-account')?.classList.add('hidden');
            startCamera();
        });

        document.getElementById('tab-manual')?.addEventListener('click', () => {
            document.getElementById('tab-manual')?.classList.add('active');
            document.getElementById('tab-scan')?.classList.remove('active');
            document.getElementById('pane-manual')?.classList.remove('hidden');
            document.getElementById('pane-scan')?.classList.add('hidden');
            document.getElementById('save-new-account')?.classList.remove('hidden');
            stopCamera();
        });

        // ── Manual save ────────────────────────────────────────────────────────
        const saveAction = async () => {
            const issuer = (document.getElementById('new-issuer') as HTMLInputElement).value.trim();
            const account = (document.getElementById('new-account') as HTMLInputElement).value.trim();
            const secret = (document.getElementById('new-secret') as HTMLInputElement).value.replace(/\s/g, '').toUpperCase();
            if (!issuer || !secret) {
                this.host.showToast('Service and Secret are required', 'error');
                return;
            }
            const res = await (window as any).api.saveAccount({ id: Date.now().toString(), issuer, account, secret });
            this.host.accounts = res || [];
            this.renderAccounts();
            this.host.hideModal();
            this.host.showToast('Account saved!', 'success');
            this.host.updateLastActivity('Added token');
        };

        document.getElementById('save-new-account')?.addEventListener('click', saveAction);
        ['new-issuer', 'new-account', 'new-secret'].forEach(id => {
            document.getElementById(id)?.addEventListener('keypress', (e) => { if (e.key === 'Enter') saveAction(); });
        });

        document.getElementById('cancel-add-btn')?.addEventListener('click', () => {
            stopCamera();
            this.host.hideModal();
        });

        // Stop camera if modal is dismissed via backdrop tap or back button
        const overlay = document.getElementById('modal-overlay');
        if (overlay) {
            const observer = new MutationObserver(() => {
                if (!overlay.classList.contains('show')) {
                    stopCamera();
                    observer.disconnect();
                }
            });
            observer.observe(overlay, { attributes: true, attributeFilter: ['class'] });
        }
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
            </div>
            <div class="modal-footer">
                <button class="btn-primary" id="update-account">
                    <i class="fa-solid fa-check"></i>
                    Save Changes
                </button>
                <button class="user-button" id="cancel-edit-btn" style="justify-content: center;">Cancel</button>
            </div>
        `;
        this.host.showModal(content);

        const updateAction = async () => {
            const issuer = (document.getElementById('edit-issuer') as HTMLInputElement).value.trim();
            const accName = (document.getElementById('edit-account') as HTMLInputElement).value.trim();
            if (!issuer) return;
            const res = await (window as any).api.saveAccount({ ...account, issuer, account: accName });
            this.host.accounts = res || [];
            this.renderAccounts();
            this.host.hideModal();
            this.host.showToast('Account updated!', 'success');
            this.host.updateLastActivity('Edited token');
        };

        document.getElementById('update-account')?.addEventListener('click', updateAction);
        ['edit-issuer', 'edit-account'].forEach(id => {
            document.getElementById(id)?.addEventListener('keypress', (e) => { if (e.key === 'Enter') updateAction(); });
        });
        document.getElementById('cancel-edit-btn')?.addEventListener('click', () => this.host.hideModal());
    }

    public getIcon(issuer: string): string {
        const name = issuer.toLowerCase();
        const icons: Record<string, string> = {
            'google': 'fa-brands fa-google', 'github': 'fa-brands fa-github',
            'microsoft': 'fa-brands fa-microsoft', 'apple': 'fa-brands fa-apple',
            'amazon': 'fa-brands fa-amazon', 'facebook': 'fa-brands fa-facebook',
            'twitter': 'fa-brands fa-x-twitter', 'discord': 'fa-brands fa-discord',
            'slack': 'fa-brands fa-slack', 'instagram': 'fa-brands fa-instagram',
            'linkedin': 'fa-brands fa-linkedin', 'twitch': 'fa-brands fa-twitch',
            'spotify': 'fa-brands fa-spotify', 'steam': 'fa-brands fa-steam',
            'dropbox': 'fa-brands fa-dropbox', 'reddit': 'fa-brands fa-reddit',
            'bitbucket': 'fa-brands fa-bitbucket', 'gitlab': 'fa-brands fa-gitlab',
            'wordpress': 'fa-brands fa-wordpress', 'paypal': 'fa-brands fa-paypal',
            'stripe': 'fa-brands fa-stripe', 'shopify': 'fa-brands fa-shopify',
            'netflix': 'fa-solid fa-tv', 'binance': 'fa-solid fa-coins',
            'coinbase': 'fa-solid fa-wallet', 'heroku': 'fa-solid fa-server',
            'digitalocean': 'fa-brands fa-digital-ocean', 'cloudflare': 'fa-solid fa-shield-halved',
            'vercel': 'fa-solid fa-globe', 'netlify': 'fa-solid fa-globe',
            'firebase': 'fa-solid fa-fire', 'medium': 'fa-brands fa-medium',
            'patreon': 'fa-brands fa-patreon', 'protonmail': 'fa-solid fa-envelope',
            'nordvpn': 'fa-solid fa-shield-halved', 'expressvpn': 'fa-solid fa-shield-halved',
            'bitwarden': 'fa-solid fa-lock', '1password': 'fa-solid fa-key',
            'lastpass': 'fa-solid fa-key', 'uber': 'fa-brands fa-uber',
            'airbnb': 'fa-brands fa-airbnb', 'notion': 'fa-solid fa-file-lines',
            'zoom': 'fa-solid fa-video', 'trello': 'fa-brands fa-trello',
            'figma': 'fa-brands fa-figma', 'adobe': 'fa-brands fa-adobe',
            'epic': 'fa-solid fa-gamepad', 'canva': 'fa-solid fa-pen-ruler',
            'asana': 'fa-solid fa-check-square', 'clickup': 'fa-solid fa-layer-group',
            'lyft': 'fa-brands fa-lyft',
        };
        if (icons[name]) return icons[name];

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
        return 'fa-solid fa-shield';
    }
}
