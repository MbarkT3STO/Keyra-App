import { IS_NATIVE } from '../../core/storage';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

export interface VaultManagerHost {
    accounts: any[];
    getIcon(issuer: string): string;
    showModal(content: string): void;
    hideModal(): void;
    showToast(message: string, type: 'info' | 'success' | 'error'): void;
    refreshAccounts(): Promise<void>;
    setLoading(show: boolean, title?: string, subtitle?: string): void;
    updateLastActivity(action: string): void;
}

export class VaultManager {
    private host: VaultManagerHost;

    constructor(host: VaultManagerHost) {
        this.host = host;
    }

    // ─── Delete Confirm ────────────────────────────────────────────────────────

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
                        <div class="entity-icon"><i class="${this.host.getIcon(account.issuer)}"></i></div>
                        <div class="entity-info">
                            <span class="entity-name">${account.issuer}</span>
                            <span class="entity-label">${account.account || 'Vault Token'}</span>
                        </div>
                    </div>
                    <p class="modal-help-text">Removing this token is permanent. You will lose access to its OTP codes.</p>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn-danger" id="confirm-delete">
                    <i class="fa-solid fa-trash-can"></i>
                    Delete Token
                </button>
                <button class="user-button" id="cancel-delete-btn">Keep Token</button>
            </div>
        `;
        this.host.showModal(content);
        document.getElementById('confirm-delete')?.addEventListener('click', async () => {
            await (window as any).api.deleteAccount(account.id);
            await this.host.refreshAccounts();
            this.host.hideModal();
            this.host.showToast('Identity destroyed', 'info');
        });
        document.getElementById('cancel-delete-btn')?.addEventListener('click', () => this.host.hideModal());
    }

    // ─── OTP Modal ─────────────────────────────────────────────────────────────

    public async showOtpModal(account: any) {
        const otp = await (window as any).api.generateTOTP(account.secret);
        const formatted = otp.substring(0, 3) + ' ' + otp.substring(3);
        const remaining = await (window as any).api.getRemainingSeconds();
        const circumference = 2 * Math.PI * 54;
        const offset = circumference - (remaining / 30) * circumference;
        const icon = this.host.getIcon(account.issuer);

        const content = `
            <div class="otp-modal-sheet">
                <!-- Service header -->
                <div class="otp-modal-service-row">
                    <div class="otp-modal-service-icon">
                        <i class="${icon}"></i>
                    </div>
                    <div class="otp-modal-service-info">
                        <div class="otp-modal-service-name">${account.issuer}</div>
                        <div class="otp-modal-service-account">${account.account || ''}</div>
                    </div>
                </div>

                <!-- Code hero -->
                <div class="otp-modal-code-hero" id="otp-modal-code-hero" title="Tap to copy">
                    <div class="otp-modal-code-display" id="otp-modal-code">${formatted}</div>
                    <div class="otp-modal-copy-hint" id="otp-modal-copy-hint">
                        <i class="fa-solid fa-copy"></i>
                        <span>Tap to copy</span>
                    </div>
                </div>

                <!-- Timer row -->
                <div class="otp-modal-timer-row">
                    <div class="otp-modal-ring-wrap">
                        <svg viewBox="0 0 120 120" class="otp-modal-svg">
                            <circle cx="60" cy="60" r="54" fill="none" stroke="var(--bg-secondary)" stroke-width="6"></circle>
                            <circle class="otp-modal-circle" cx="60" cy="60" r="54" fill="none"
                                stroke="var(--accent-primary)" stroke-width="7" stroke-linecap="round"
                                stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"
                                style="transition: stroke-dashoffset 1s linear, stroke 0.3s ease;"></circle>
                        </svg>
                        <div class="otp-modal-ring-seconds" id="otp-modal-seconds">${remaining}</div>
                    </div>
                    <div class="otp-modal-timer-info">
                        <div class="otp-modal-timer-label">Refreshes in</div>
                        <div class="otp-modal-timer-value" id="otp-modal-timer-text">${remaining} seconds</div>
                    </div>
                </div>

                <!-- Actions -->
                <div class="otp-modal-actions">
                    <button class="otp-modal-copy-btn" id="otp-modal-copy-btn">
                        <i class="fa-solid fa-copy"></i>
                        <span>Copy Code</span>
                    </button>
                    <button class="otp-modal-close-btn" id="otp-modal-close">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>
            </div>
        `;

        this.host.showModal(content);

        // Auto-copy on open
        navigator.clipboard.writeText(otp).catch(() => {});

        const doCopy = async () => {
            const code = await (window as any).api.generateTOTP(account.secret);
            await navigator.clipboard.writeText(code);
            const hint = document.getElementById('otp-modal-copy-hint');
            const copyBtn = document.getElementById('otp-modal-copy-btn');
            if (hint) { hint.innerHTML = '<i class="fa-solid fa-check"></i><span>Copied!</span>'; hint.classList.add('copied'); }
            if (copyBtn) { copyBtn.innerHTML = '<i class="fa-solid fa-check"></i><span>Copied!</span>'; copyBtn.classList.add('copied'); }
            setTimeout(() => {
                if (hint) { hint.innerHTML = '<i class="fa-solid fa-copy"></i><span>Tap to copy</span>'; hint.classList.remove('copied'); }
                if (copyBtn) { copyBtn.innerHTML = '<i class="fa-solid fa-copy"></i><span>Copy Code</span>'; copyBtn.classList.remove('copied'); }
            }, 1500);
            this.host.showToast('Code copied!', 'success');
        };

        document.getElementById('otp-modal-code-hero')?.addEventListener('click', doCopy);
        document.getElementById('otp-modal-copy-btn')?.addEventListener('click', doCopy);
        document.getElementById('otp-modal-close')?.addEventListener('click', () => this.host.hideModal());

        const modalInterval = setInterval(async () => {
            const overlay = document.getElementById('modal-overlay');
            if (!overlay?.classList.contains('show')) { clearInterval(modalInterval); return; }

            const rem = await (window as any).api.getRemainingSeconds();
            const newOtp = await (window as any).api.generateTOTP(account.secret);
            const newFormatted = newOtp.substring(0, 3) + ' ' + newOtp.substring(3);

            const codeEl = document.getElementById('otp-modal-code');
            const secondsEl = document.getElementById('otp-modal-seconds');
            const timerText = document.getElementById('otp-modal-timer-text');
            const circle = overlay.querySelector('.otp-modal-circle') as SVGCircleElement;

            if (codeEl) codeEl.textContent = newFormatted;
            if (secondsEl) secondsEl.textContent = String(rem);
            if (timerText) timerText.textContent = `${rem} second${rem !== 1 ? 's' : ''}`;

            const isDanger = rem <= 5;
            const isWarning = rem <= 10 && rem > 5;
            const color = isDanger ? '#ff3b30' : isWarning ? '#ff9500' : 'var(--accent-primary)';

            if (circle) {
                const circ = 2 * Math.PI * 54;
                circle.style.strokeDashoffset = String(circ - (rem / 30) * circ);
                circle.style.stroke = color;
            }
            if (secondsEl) secondsEl.style.color = color;
            if (timerText) timerText.style.color = color;
        }, 1000);
    }

    // ─── Import Password Modal ─────────────────────────────────────────────────

    public showImportPasswordModal(data: any) {
        const verification = (window as any).api.verifyBackupFile(data);
        const { salt, encryptedVaultData, encryptedSettings, autolock, "Desktop Settings": desktopSettings, "Web Settings": webSettings } = data;

        let dateStr = 'Unknown';
        if (verification.timestamp) {
            const date = new Date(verification.timestamp);
            dateStr = date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        }

        const encryptionBadge = verification.encrypted
            ? '<span class="import-badge import-badge--encrypted"><i class="fa-solid fa-lock"></i> FULLY ENCRYPTED</span>'
            : '<span class="import-badge import-badge--legacy"><i class="fa-solid fa-triangle-exclamation"></i> LEGACY FORMAT</span>';

        let checksumStatus = '';
        if (verification.hasChecksum) {
            checksumStatus = verification.checksumValid
                ? '<div class="import-checksum import-checksum--ok"><i class="fa-solid fa-circle-check"></i><span>Integrity Verified</span></div>'
                : '<div class="import-checksum import-checksum--fail"><i class="fa-solid fa-triangle-exclamation"></i><span>Checksum Mismatch — File may be corrupted</span></div>';
        }

        const warningSection = !verification.valid
            ? `<div class="import-warning-banner">
                <i class="fa-solid fa-circle-exclamation import-warning-icon"></i>
                <div>
                    <div class="import-warning-title">Invalid Backup File</div>
                    <div class="import-warning-body">${verification.error || 'This file cannot be restored'}</div>
                </div>
            </div>` : '';

        const content = `
            <div class="modal-content">
                <div class="modal-header">
                    <div class="modal-icon-vessel">
                        <i class="fa-solid fa-upload"></i>
                    </div>
                    <div class="modal-title-vessel">
                        <h2>Restore Vault</h2>
                        <p>VERIFY MASTER KEY</p>
                    </div>
                    ${encryptionBadge}
                </div>
                <div class="modal-divider"></div>
                <div class="modal-body">
                    ${warningSection}
                    <div class="import-info-section">
                        <div class="import-info-label">Backup Information</div>
                        <div class="import-info-rows">
                            <div class="import-info-row">
                                <div class="import-info-row-icon"><i class="fa-solid fa-code-branch"></i></div>
                                <div class="import-info-row-body">
                                    <div class="import-info-row-key">Version</div>
                                    <div class="import-info-row-val import-mono">${verification.version || 'Unknown'}</div>
                                </div>
                            </div>
                            <div class="import-info-row">
                                <div class="import-info-row-icon"><i class="fa-solid fa-clock"></i></div>
                                <div class="import-info-row-body">
                                    <div class="import-info-row-key">Created</div>
                                    <div class="import-info-row-val">${dateStr}</div>
                                </div>
                            </div>
                            <div class="import-info-row">
                                <div class="import-info-row-icon"><i class="fa-solid fa-key"></i></div>
                                <div class="import-info-row-body">
                                    <div class="import-info-row-key">Accounts</div>
                                    <div class="import-info-row-val">${verification.accountCount !== undefined ? verification.accountCount : 'Unknown'}</div>
                                </div>
                            </div>
                            <div class="import-info-row">
                                <div class="import-info-row-icon import-info-row-icon--${verification.encrypted ? 'success' : 'warn'}">
                                    <i class="fa-solid fa-${verification.encrypted ? 'shield-halved' : 'shield'}"></i>
                                </div>
                                <div class="import-info-row-body">
                                    <div class="import-info-row-key">Encryption</div>
                                    <div class="import-info-row-val import-mono">${verification.encrypted ? 'AES-256-GCM' : 'Partial (Legacy)'}</div>
                                </div>
                            </div>
                        </div>
                        ${checksumStatus}
                    </div>
                    <div id="checksum-warning-inline" class="hidden"></div>
                    <div class="form-group">
                        <label class="form-label">Backup Master Password</label>
                        <input type="password" id="import-pass" class="form-input" placeholder="Enter your master password" ${!verification.valid ? 'disabled' : ''}>
                        <div class="form-error" id="err-import-pass"><i class="fa-solid fa-circle-exclamation"></i><span></span></div>
                        <p class="modal-help-text">Enter the master password used when this backup was created.</p>
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn-primary" id="confirm-import" ${!verification.valid ? 'disabled' : ''}>
                    <i class="fa-solid fa-shield-halved"></i>
                    <span>Restore Vault</span>
                </button>
                <button class="user-button" id="cancel-import">Cancel</button>
            </div>
        `;
        this.host.showModal(content);

        document.getElementById('cancel-import')?.addEventListener('click', () => this.host.hideModal());
        document.getElementById('import-pass')?.addEventListener('input', () => {
            const p = document.getElementById('import-pass') as HTMLInputElement;
            p?.classList.remove('invalid');
            document.getElementById('err-import-pass')?.classList.remove('visible');
        });

        if (verification.valid) {
            document.getElementById('confirm-import')?.addEventListener('click', async () => {
                const passInput = document.getElementById('import-pass') as HTMLInputElement;
                const pass = passInput.value;

                // Inline validation
                if (!pass) {
                    passInput.classList.add('invalid');
                    const errEl = document.getElementById('err-import-pass');
                    if (errEl) { const s = errEl.querySelector('span'); if (s) s.textContent = 'Password is required'; errEl.classList.add('visible'); }
                    passInput.focus();
                    return;
                }

                // Clear error on retry
                passInput.classList.remove('invalid');
                document.getElementById('err-import-pass')?.classList.remove('visible');

                // Replace window.confirm (blocked in Capacitor WebView) with inline warning
                if (verification.hasChecksum && !verification.checksumValid) {
                    const warningEl = document.getElementById('checksum-warning-inline');
                    if (warningEl && !warningEl.classList.contains('acknowledged')) {
                        warningEl.classList.remove('hidden');
                        warningEl.classList.add('acknowledged');
                        warningEl.innerHTML = `<div class="import-warning-banner" style="margin-bottom:12px;">
                            <i class="fa-solid fa-triangle-exclamation import-warning-icon"></i>
                            <div>
                                <div class="import-warning-title">Integrity check failed</div>
                                <div class="import-warning-body">The file may be corrupted. Tap Restore again to proceed anyway.</div>
                            </div>
                        </div>`;
                        return;
                    }
                }

                // Show loading state
                const btn = document.getElementById('confirm-import') as HTMLButtonElement;
                const cancelBtn = document.getElementById('cancel-import') as HTMLButtonElement;
                btn.disabled = true;
                cancelBtn.disabled = true;
                passInput.disabled = true;
                btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Decrypting...</span>';

                const res = await (window as any).api.performVaultImport(salt, encryptedVaultData, pass, encryptedSettings, autolock, desktopSettings, webSettings);

                if (res.success) {
                    this.host.hideModal();
                    this.host.showToast('Vault successfully restored!', 'success');
                    await this.host.refreshAccounts();
                    // Apply restored settings to UI
                    if (res.restoredSettings) {
                        const androidSettings = res.restoredSettings['Android Settings'] || res.restoredSettings;
                        (window as any).ui?.settingsManager?.applySettings(androidSettings, true);
                        // Apply autolock to localStorage explicitly
                        if (androidSettings.autolock !== undefined) {
                            const storageKey = (window as any).ui?.getStorageKey?.('autolock');
                            if (storageKey) localStorage.setItem(storageKey, String(androidSettings.autolock));
                        }
                    }
                } else {
                    // Re-enable for retry
                    btn.disabled = false;
                    cancelBtn.disabled = false;
                    passInput.disabled = false;
                    passInput.value = '';
                    passInput.classList.add('invalid');
                    const errEl = document.getElementById('err-import-pass');
                    if (errEl) { const s = errEl.querySelector('span'); if (s) s.textContent = res.message || 'Incorrect password — try again'; errEl.classList.add('visible'); }
                    passInput.focus();
                    btn.innerHTML = '<i class="fa-solid fa-shield-halved"></i> <span>Restore Vault</span>';
                }
            });
        }
    }

    // ─── Export Options Modal ──────────────────────────────────────────────────

    public showExportOptionsModal() {
        const content = `
            <div class="modal-content" style="max-height: 85dvh; overflow-y: auto;">
                <div class="modal-header">
                    <div class="modal-icon-vessel">
                        <i class="fa-solid fa-download"></i>
                    </div>
                    <div class="modal-title-vessel">
                        <h2>Export Vault</h2>
                        <p>CHOOSE EXPORT FORMAT</p>
                    </div>
                </div>
                <div class="modal-divider"></div>
                <div class="modal-body">
                    <div style="display: grid; gap: 10px; margin-bottom: 16px;">
                        <button class="export-option-card" data-format="encrypted">
                            <div class="export-option-icon"><i class="fa-solid fa-lock" style="color: var(--accent-primary);"></i></div>
                            <div style="flex: 1; min-width: 0;">
                                <div class="export-option-title">Full Encrypted Backup</div>
                                <div class="export-option-desc">Complete vault with settings (.keyra)</div>
                            </div>
                            <div class="export-check"><i class="fa-solid fa-check" style="font-size: 11px;"></i></div>
                        </button>
                        <button class="export-option-card" data-format="qr-pdf">
                            <div class="export-option-icon"><i class="fa-solid fa-qrcode" style="color: var(--accent-primary);"></i></div>
                            <div style="flex: 1; min-width: 0;">
                                <div class="export-option-title">QR Codes (PDF)</div>
                                <div class="export-option-desc">Printable QR codes for each account</div>
                            </div>
                            <div class="export-check"><i class="fa-solid fa-check" style="font-size: 11px;"></i></div>
                        </button>
                        <button class="export-option-card" data-format="json">
                            <div class="export-option-icon"><i class="fa-solid fa-file-code" style="color: #ff9500;"></i></div>
                            <div style="flex: 1; min-width: 0;">
                                <div class="export-option-title">Plain JSON</div>
                                <div class="export-option-desc">Unencrypted JSON for migration (.json)</div>
                            </div>
                            <div class="export-check"><i class="fa-solid fa-check" style="font-size: 11px;"></i></div>
                        </button>
                        <button class="export-option-card" data-format="text">
                            <div class="export-option-icon"><i class="fa-solid fa-file-lines" style="color: var(--text-secondary);"></i></div>
                            <div style="flex: 1; min-width: 0;">
                                <div class="export-option-title">Text File</div>
                                <div class="export-option-desc">Human-readable text format (.txt)</div>
                            </div>
                            <div class="export-check"><i class="fa-solid fa-check" style="font-size: 11px;"></i></div>
                        </button>
                    </div>
                    <div id="export-selection-container" style="background: var(--bg-primary); border-radius: 14px; padding: 14px; box-shadow: var(--nm-shadow-in-sm); margin-bottom: 4px; display: none;">
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
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn-primary" id="confirm-export">
                    <i class="fa-solid fa-download"></i>
                    Export Vault
                </button>
                <button class="user-button" id="cancel-export">Cancel</button>
            </div>
        `;
        this.host.showModal(content);

        let selectedFormat = 'encrypted';
        const selectionContainer = document.getElementById('export-selection-container');

        document.querySelectorAll('.export-option-card').forEach(card => {
            card.addEventListener('click', () => {
                document.querySelectorAll('.export-option-card').forEach(c => {
                    (c as HTMLElement).classList.remove('selected');
                    const check = c.querySelector('.export-check') as HTMLElement;
                    if (check) check.classList.remove('visible');
                });
                (card as HTMLElement).classList.add('selected');
                const check = card.querySelector('.export-check') as HTMLElement;
                if (check) check.classList.add('visible');
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
                    accountsList.innerHTML = this.host.accounts.map(acc => `
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
            let accountsToExport = this.host.accounts;
            if (!exportAll) {
                const selectedIds = Array.from(document.querySelectorAll('.export-account-check:checked'))
                    .map(cb => (cb as HTMLInputElement).getAttribute('data-id'));
                accountsToExport = this.host.accounts.filter(acc => selectedIds.includes(acc.id));
                if (accountsToExport.length === 0) {
                    this.host.showToast('Please select at least one account', 'error');
                    return;
                }
            }
            this.host.hideModal();
            await this.performExport(selectedFormat, accountsToExport);
        });

        document.getElementById('cancel-export')?.addEventListener('click', () => this.host.hideModal());
    }

    // ─── Export Helpers ────────────────────────────────────────────────────────

    private async performExport(format: string, accounts: any[]) {
        this.host.setLoading(true, 'Exporting Vault', 'PREPARING SECURE EXPORT');
        try {
            switch (format) {
                case 'encrypted': await this.exportEncrypted(); break;
                case 'qr-pdf':    await this.exportQRCodesPDF(accounts); break;
                case 'json':      await this.exportJSON(accounts); break;
                case 'text':      await this.exportText(accounts); break;
            }
            this.host.showToast('Export completed successfully!', 'success');
            this.host.updateLastActivity('Exported vault');
        } catch (error) {
            console.error('Export failed:', error);
            this.host.showToast('Export failed. Please try again.', 'error');
        } finally {
            this.host.setLoading(false);
        }
    }

    private async exportEncrypted() {
        const res = await (window as any).api.exportVault();
        if (!res.success) throw new Error(res.message || 'Export failed');
    }

    private async exportQRCodesPDF(accounts: any[]) {
        const qrCodes = await Promise.all(accounts.map(async (acc) => {
            const uri = `otpauth://totp/${encodeURIComponent(acc.issuer)}:${encodeURIComponent(acc.account)}?secret=${acc.secret}&issuer=${encodeURIComponent(acc.issuer)}`;
            return { account: acc, uri };
        }));

        let html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Keyra Vault - QR Codes</title>
            <style>body{font-family:Arial,sans-serif;padding:40px}.page-break{page-break-after:always}.qr-container{margin-bottom:60px;text-align:center}.qr-title{font-size:24px;font-weight:bold;margin-bottom:10px}.qr-subtitle{font-size:16px;color:#666;margin-bottom:20px}.qr-code{margin:20px auto}.footer{font-size:12px;color:#999;margin-top:20px}</style>
            <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script></head><body>
            <h1 style="text-align:center;margin-bottom:40px;">Keyra Authenticator - QR Codes Backup</h1>
            <p style="text-align:center;color:#666;margin-bottom:60px;">Generated on ${new Date().toLocaleString()}</p>`;

        qrCodes.forEach((item, index) => {
            html += `<div class="qr-container ${index < qrCodes.length - 1 ? 'page-break' : ''}">
                <div class="qr-title">${item.account.issuer}</div>
                <div class="qr-subtitle">${item.account.account}</div>
                <div class="qr-code" id="qr-${index}"></div>
                <div class="footer">Scan this QR code with your authenticator app</div>
            </div>`;
        });

        html += `<script>${qrCodes.map((item, index) => `new QRCode(document.getElementById('qr-${index}'),{text:'${item.uri}',width:256,height:256});`).join('\n')}</script></body></html>`;

        await this.shareTextFile(html, `Keyra_QR_Codes_${Date.now()}.html`, 'text/html');
        this.host.showToast('Open the HTML file and print to PDF', 'info');
    }

    private async exportJSON(accounts: any[]) {
        const data = accounts.map(acc => ({ issuer: acc.issuer, account: acc.account, secret: acc.secret, type: 'totp', algorithm: 'SHA1', digits: 6, period: 30 }));
        await this.shareTextFile(JSON.stringify(data, null, 2), `Keyra_Export_${Date.now()}.json`, 'application/json');
    }

    private async exportText(accounts: any[]) {
        let text = `Keyra Authenticator - Vault Export\nGenerated: ${new Date().toLocaleString()}\nTotal Accounts: ${accounts.length}\n\n${'='.repeat(60)}\n\n`;
        accounts.forEach((acc, index) => {
            text += `${index + 1}. ${acc.issuer}\n   Account: ${acc.account}\n   Secret: ${acc.secret}\n   URI: otpauth://totp/${encodeURIComponent(acc.issuer)}:${encodeURIComponent(acc.account)}?secret=${acc.secret}&issuer=${encodeURIComponent(acc.issuer)}\n\n`;
        });
        text += `${'='.repeat(60)}\n\nIMPORTANT: Keep this file secure. It contains sensitive authentication data.\n`;
        await this.shareTextFile(text, `Keyra_Export_${Date.now()}.txt`, 'text/plain');
    }

    private async shareTextFile(content: string, filename: string, mimeType: string) {
        if (IS_NATIVE) {
            await Filesystem.writeFile({ path: filename, data: content, directory: Directory.Cache, encoding: Encoding.UTF8 });
            const { uri } = await Filesystem.getUri({ path: filename, directory: Directory.Cache });
            await Share.share({ title: filename, url: uri, dialogTitle: 'Save File' });
        } else {
            const blob = new Blob([content], { type: mimeType });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.click();
            URL.revokeObjectURL(url);
        }
    }
}
