export interface AuthManagerHost {
    userId: string;
    getStorageKey(key: string): string;
    showToast(message: string, type: 'info' | 'success' | 'error'): void;
    showModal(content: string): void;
    hideModal(): void;
    applySettings(settings: any, saveLocal?: boolean): void;
    switchTab(tab: 'vault' | 'settings' | 'account'): void;
}

export class AuthManager {
    private host: AuthManagerHost;

    constructor(host: AuthManagerHost) {
        this.host = host;
    }

    // ─── Init ──────────────────────────────────────────────────────────────────

    public async initFromCloud() {
        const user = await (window as any).api.getCurrentUser();
        if (user?.settings) {
            // user.settings is already the unwrapped "Android Settings" object
            this.host.applySettings(user.settings, false);
        }
    }

    // ─── Account Info ──────────────────────────────────────────────────────────

    public async loadAccountInfo() {
        const user = await (window as any).api.getCurrentUser();
        if (!user) return;

        // Load devices in parallel
        this.loadDevices();

        // Dropdown header
        const dropdownName = document.getElementById('dropdown-user-name');
        const dropdownEmail = document.getElementById('dropdown-user-email');
        if (dropdownName) dropdownName.textContent = user.username;
        if (dropdownEmail) dropdownEmail.textContent = user.email || '';

        // Account page fields
        const nameDisplay = document.getElementById('acc-display-username');
        const emailDisplay = document.getElementById('acc-display-email');
        const pendingContainer = document.getElementById('pending-email-container');
        const pendingEmailDisplay = document.getElementById('acc-display-pending-email');
        const emailCard = document.getElementById('card-change-email');

        if (nameDisplay) nameDisplay.textContent = user.username;
        if (emailDisplay) emailDisplay.textContent = user.email;

        // Account page avatar
        const initialsEl = document.getElementById('acc-initials');
        const avatarImgEl = document.getElementById('acc-avatar-img') as HTMLImageElement;
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

        // Navbar avatar
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

        // Pending email
        if (user.pendingEmail) {
            pendingContainer?.classList.remove('hidden');
            if (pendingEmailDisplay) pendingEmailDisplay.textContent = user.pendingEmail;
            if (emailCard) {
                emailCard.style.opacity = '0.5';
                emailCard.style.pointerEvents = 'none';
                (emailCard.querySelector('button[type="submit"]') as HTMLButtonElement).disabled = true;
            }
        } else {
            pendingContainer?.classList.add('hidden');
            if (emailCard) {
                emailCard.style.opacity = '1';
                emailCard.style.pointerEvents = 'auto';
                (emailCard.querySelector('button[type="submit"]') as HTMLButtonElement).disabled = false;
            }
        }
    }

    // ─── Account Events ────────────────────────────────────────────────────────

    public setupAccountEvents() {
        document.getElementById('account-settings-btn')?.addEventListener('click', () => {
            this.host.switchTab('account');
            this.loadDevices();
        });

        // Change Avatar
        document.getElementById('btn-change-avatar')?.addEventListener('click', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/png, image/jpeg, image/webp';
            input.onchange = async (e) => {
                const file = (e.target as HTMLInputElement).files?.[0];
                if (!file) return;
                if (file.size > 2 * 1024 * 1024) {
                    this.host.showToast('Image must be less than 2MB', 'error');
                    return;
                }
                const reader = new FileReader();
                reader.onload = async (ev) => {
                    const base64 = ev.target?.result as string;
                    try {
                        const res = await (window as any).api.updateProfilePicture(base64);
                        if (res.success) {
                            this.host.showToast(res.message || 'Profile photo updated', 'success');
                            await this.loadAccountInfo();
                        } else {
                            this.host.showToast(res.message || 'Failed to update photo', 'error');
                        }
                    } catch (err: any) {
                        this.host.showToast(err.message || 'Failed to update profile picture', 'error');
                    }
                };
                reader.onerror = () => this.host.showToast('Failed to read image file', 'error');
                reader.readAsDataURL(file);
            };
            input.click();
        });

        document.getElementById('form-change-name')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const newName = (document.getElementById('change-name-input') as HTMLInputElement).value;
            const res = await (window as any).api.changeUsername(newName);
            if (res.success) {
                this.host.showToast(res.message, 'success');
                (e.target as HTMLFormElement).reset();
                this.loadAccountInfo();
            } else {
                this.host.showToast(res.message, 'error');
            }
        });

        document.getElementById('form-change-password')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const pass = (document.getElementById('change-pass-input') as HTMLInputElement).value;
            const confirm = (document.getElementById('change-pass-confirm') as HTMLInputElement).value;
            if (pass !== confirm) { this.host.showToast('Passwords do not match.', 'error'); return; }
            if (pass.length < 8) { this.host.showToast('Password must be at least 8 characters.', 'error'); return; }
            const res = await (window as any).api.changePassword(pass);
            if (res.success) {
                this.host.showToast(res.message, 'success');
                (e.target as HTMLFormElement).reset();
            } else {
                this.host.showToast(res.message, 'error');
            }
        });

        document.getElementById('form-change-email')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = (document.getElementById('change-email-input') as HTMLInputElement).value;
            const res = await (window as any).api.requestEmailChange(email);
            if (res.success) {
                this.host.showToast(res.message, 'success');
                (e.target as HTMLFormElement).reset();
                this.loadAccountInfo();
                this.showEmailVerificationModal(email);
            } else {
                this.host.showToast(res.message, 'error');
            }
        });

        document.getElementById('btn-verify-new-email')?.addEventListener('click', async () => {
            const user = await (window as any).api.getCurrentUser();
            if (user && user.pendingEmail) this.showEmailVerificationModal(user.pendingEmail);
        });

        document.getElementById('btn-remove-pending-email')?.addEventListener('click', async () => {
            if (confirm('Are you sure you want to cancel the pending email change?')) {
                const res = await (window as any).api.cancelEmailChange();
                if (res.success) {
                    this.host.showToast(res.message, 'success');
                    this.loadAccountInfo();
                } else {
                    this.host.showToast(res.message, 'error');
                }
            }
        });
    }

    // ─── Email Verification Modal ──────────────────────────────────────────────

    private showEmailVerificationModal(email: string) {
        let resendTimer = 30;
        let timerInterval: any;

        const updateTimerText = () => {
            const btn = document.getElementById('btn-resend-verify-email');
            const timerSpan = document.getElementById('verify-email-resend-timer');
            if (timerSpan) timerSpan.textContent = resendTimer > 0 ? `(${resendTimer}s)` : '';
            if (btn) (btn as HTMLButtonElement).disabled = resendTimer > 0;
            if (btn) (btn as HTMLElement).style.opacity = resendTimer > 0 ? '0.5' : '1';
        };

        const content = `
            <div style="padding: clamp(32px, 8vw, 48px); text-align: center; position: relative; overflow: hidden;">
                <div style="position: absolute; top: -50px; right: -50px; width: 150px; height: 150px; background: var(--accent-soft); filter: blur(60px); opacity: 0.3; border-radius: 50%; pointer-events: none;"></div>
                <div class="nm-icon-large" style="margin: 0 auto 32px; width: 100px; height: 100px; display: flex; align-items: center; justify-content: center; border-radius: 30% 70% 70% 30% / 30% 30% 70% 70%; background: var(--bg-primary); box-shadow: var(--nm-raised);">
                    <i class="fa-solid fa-envelope-circle-check" style="font-size: 48px; color: var(--accent-primary);"></i>
                </div>
                <h2 style="font-weight: 900; font-size: 32px; color: var(--text-primary); margin-bottom: 12px; letter-spacing: -1.2px;">Check your Email</h2>
                <p style="color: var(--text-secondary); margin-bottom: 40px; font-weight: 500; font-size: 16px; line-height: 1.5;">
                    Enter the 6-digit code we just sent to <br>
                    <strong style="color: var(--accent-primary); font-weight: 700;">${email}</strong>
                </p>
                <div class="form-group" style="margin-bottom: 40px;">
                    <div style="position: relative;">
                        <input type="text" id="email-verify-code" class="form-input" placeholder="000000" maxlength="6"
                               style="text-align: center; font-size: 36px; letter-spacing: 12px; font-family: 'Outfit'; height: 84px; border-radius: var(--radius-lg); box-shadow: var(--nm-pressed); border: none; width: 100%; color: var(--accent-primary); font-weight: 900;">
                    </div>
                </div>
                <div style="display: flex; flex-direction: column; gap: 12px; margin-top: 48px;">
                    <button class="btn-primary" id="btn-submit-email-verify" style="height: 64px; font-size: 18px; font-weight: 850; border-radius: var(--radius-xl); box-shadow: var(--nm-raised);">
                        Verify & Update
                    </button>
                    <button class="user-button" id="btn-cancel-email-verify" style="height: 64px; font-size: 15px; font-weight: 750; border-radius: var(--radius-xl); box-shadow: var(--nm-raised); justify-content: center;">
                        Cancel
                    </button>
                </div>
                <div style="margin-top: 32px; padding-top: 24px; border-top: 1px dashed var(--border-color);">
                    <div style="text-align: center; font-size: 14px;">
                        <span>Didn't get the code?</span>
                        <button id="btn-resend-verify-email" style="background: none; border: none; font-weight: 800; color: var(--accent-primary); cursor: pointer; display: inline-flex; align-items: center; gap: 8px; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; margin-left: 8px;" disabled>
                            <span>Send again</span>
                            <span id="verify-email-resend-timer" style="opacity: 0.7; font-variant-numeric: tabular-nums;">(30s)</span>
                        </button>
                    </div>
                </div>
            </div>
        `;

        this.host.showModal(content);

        timerInterval = setInterval(() => {
            resendTimer--;
            updateTimerText();
            if (resendTimer <= 0) clearInterval(timerInterval);
        }, 1000);

        document.getElementById('btn-submit-email-verify')?.addEventListener('click', async () => {
            const code = (document.getElementById('email-verify-code') as HTMLInputElement).value;
            if (code.length !== 6) { this.host.showToast('Enter 6-digit code.', 'error'); return; }
            const res = await (window as any).api.confirmEmailChange(code);
            if (res.success) {
                this.host.showToast(res.message, 'success');
                this.host.hideModal();
                this.loadAccountInfo();
                clearInterval(timerInterval);
            } else {
                this.host.showToast(res.message, 'error');
            }
        });

        document.getElementById('btn-resend-verify-email')?.addEventListener('click', async () => {
            const res = await (window as any).api.resendEmailChangeCode();
            if (res.success) {
                this.host.showToast('New code sent.', 'success');
                resendTimer = 30;
                updateTimerText();
                timerInterval = setInterval(() => {
                    resendTimer--;
                    updateTimerText();
                    if (resendTimer <= 0) clearInterval(timerInterval);
                }, 1000);
            } else {
                this.host.showToast(res.message, 'error');
            }
        });

        document.getElementById('btn-cancel-email-verify')?.addEventListener('click', () => {
            this.host.hideModal();
            clearInterval(timerInterval);
        });
    }

    // ─── Device Management ─────────────────────────────────────────────────────

    public async loadDevices() {
        const list = document.getElementById('devices-list');
        if (!list) return;

        const user = await (window as any).api.getCurrentUser();
        if (!user) return;

        const currentDeviceId: string = (window as any).api.getCurrentDeviceId();
        const devices: DeviceRecord[] = user.devices || [];

        if (devices.length === 0) {
            list.innerHTML = `<p class="devices-empty">No devices recorded yet.</p>`;
            return;
        }

        // Sort: current device first, then by lastSeen desc
        const sorted = [...devices].sort((a, b) => {
            if (a.id === currentDeviceId) return -1;
            if (b.id === currentDeviceId) return 1;
            return new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime();
        });

        list.innerHTML = sorted.map(device => {
            const isCurrent = device.id === currentDeviceId;
            const icon = device.platform === 'android' ? 'fa-android'
                       : device.platform === 'ios'     ? 'fa-apple'
                       : device.platform === 'darwin'  ? 'fa-apple'
                       : device.platform === 'linux'   ? 'fa-linux'
                       : device.platform === 'win32'   ? 'fa-windows'
                       : 'fa-display';
            const platformLabel = device.platform === 'android' ? 'Android'
                                : device.platform === 'ios'     ? 'iOS'
                                : device.platform === 'darwin'  ? 'macOS'
                                : device.platform === 'linux'   ? 'Linux'
                                : device.platform === 'win32'   ? 'Windows'
                                : 'Web';
            const lastSeen = this.formatRelativeTime(new Date(device.lastSeen));
            const firstSeen = new Date(device.firstSeen).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
            // Consider "recently active" if seen within last 5 minutes
            const isOnline = (Date.now() - new Date(device.lastSeen).getTime()) < 5 * 60 * 1000;

            return `
            <div class="device-row" data-device-id="${device.id}">
                <div class="device-icon-vessel">
                    <i class="fa-brands ${icon}"></i>
                    ${isOnline ? '<span class="device-online-dot"></span>' : ''}
                </div>
                <div class="device-info">
                    <div class="device-name-row">
                        <span class="device-name" id="device-name-${device.id}">${device.name}</span>
                        ${isCurrent ? '<span class="device-current-badge">This Device</span>' : ''}
                        ${isCurrent ? `<button class="device-rename-btn" data-device-id="${device.id}" title="Rename"><i class="fa-solid fa-pen" style="font-size:10px;"></i></button>` : ''}
                    </div>
                    <div class="device-meta">
                        <span class="device-platform-tag">${platformLabel}</span>
                        <span class="device-meta-dot">·</span>
                        <span>Since ${firstSeen}</span>
                        <span class="device-meta-dot">·</span>
                        <span>${isOnline ? '<span style="color:var(--accent-primary);font-weight:700;">Active now</span>' : `Last seen ${lastSeen}`}</span>
                    </div>
                </div>
                ${!isCurrent ? `<button class="device-revoke-btn" data-device-id="${device.id}" title="Revoke"><i class="fa-solid fa-xmark"></i></button>` : ''}
            </div>
            ${isCurrent ? `
            <div class="device-rename-form hidden" data-rename-id="${device.id}">
                <input class="form-input device-rename-input" type="text" maxlength="32" placeholder="Device name" value="${device.name}" data-rename-id="${device.id}">
                <div class="device-revoke-confirm-actions" style="margin-top:8px;">
                    <button class="device-confirm-cancel device-rename-cancel" data-rename-id="${device.id}">Cancel</button>
                    <button class="device-confirm-ok device-rename-save" data-rename-id="${device.id}">Save</button>
                </div>
            </div>` : ''}
            ${!isCurrent ? `
            <div class="device-revoke-confirm hidden" data-confirm-id="${device.id}">
                <span class="device-revoke-confirm-text">Remove this device?</span>
                <div class="device-revoke-confirm-actions">
                    <button class="device-confirm-cancel" data-confirm-id="${device.id}">Cancel</button>
                    <button class="device-confirm-ok" data-confirm-id="${device.id}">Remove</button>
                </div>
            </div>` : ''}`;
        }).join('');

        this.setupDeviceEvents(list);
    }

    private setupDeviceEvents(list: HTMLElement) {
        // Rename button (current device only)
        list.querySelectorAll('.device-rename-btn').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                const id = (btn as HTMLElement).dataset.deviceId!;
                const form = list.querySelector(`.device-rename-form[data-rename-id="${id}"]`);
                form?.classList.remove('hidden');
                (form?.querySelector('.device-rename-input') as HTMLInputElement)?.select();
            });
        });

        list.querySelectorAll('.device-rename-cancel').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                const id = (btn as HTMLElement).dataset.renameId!;
                list.querySelector(`.device-rename-form[data-rename-id="${id}"]`)?.classList.add('hidden');
            });
        });

        list.querySelectorAll('.device-rename-save').forEach(btn => {
            btn.addEventListener('click', async e => {
                e.stopPropagation();
                const id = (btn as HTMLElement).dataset.renameId!;
                const input = list.querySelector(`.device-rename-input[data-rename-id="${id}"]`) as HTMLInputElement;
                const newName = input?.value?.trim();
                if (!newName) return;
                const res = await (window as any).api.renameDevice(id, newName);
                if (res.success) {
                    this.host.showToast('Device renamed', 'success');
                    await this.loadDevices();
                } else {
                    this.host.showToast(res.message || 'Failed to rename', 'error');
                }
            });
        });

        // Revoke button
        list.querySelectorAll('.device-revoke-btn').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                const id = (btn as HTMLElement).dataset.deviceId!;
                list.querySelector(`.device-revoke-confirm[data-confirm-id="${id}"]`)?.classList.remove('hidden');
            });
        });

        list.querySelectorAll('.device-confirm-cancel:not(.device-rename-cancel)').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                const id = (btn as HTMLElement).dataset.confirmId!;
                list.querySelector(`.device-revoke-confirm[data-confirm-id="${id}"]`)?.classList.add('hidden');
            });
        });

        list.querySelectorAll('.device-confirm-ok:not(.device-rename-save)').forEach(btn => {
            btn.addEventListener('click', async e => {
                e.stopPropagation();
                const id = (btn as HTMLElement).dataset.confirmId!;
                try {
                    const res = await (window as any).api.revokeDevice(id);
                    if (res.success) {
                        this.host.showToast('Device removed', 'success');
                        await this.loadDevices();
                    } else {
                        this.host.showToast(res.message || 'Failed to remove device', 'error');
                    }
                } catch {
                    this.host.showToast('Failed to remove device', 'error');
                }
            });
        });
    }

    private formatRelativeTime(date: Date): string {
        const diffMs = Date.now() - date.getTime();
        const diffMin = Math.floor(diffMs / 60000);
        if (diffMin < 1) return 'just now';
        if (diffMin < 60) return `${diffMin}m ago`;
        const diffHrs = Math.floor(diffMin / 60);
        if (diffHrs < 24) return `${diffHrs}h ago`;
        const diffDays = Math.floor(diffHrs / 24);
        return diffDays === 1 ? 'yesterday' : `${diffDays}d ago`;
    }

    // ─── Activity Tracking ─────────────────────────────────────────────────────

    public updateLastActivity(action: string) {
        localStorage.setItem(
            this.host.getStorageKey('last_activity'),
            JSON.stringify({ action, time: new Date().toISOString() })
        );
    }

    public updateLastActivityDisplay() {
        const raw = localStorage.getItem(this.host.getStorageKey('last_activity'));
        if (!raw) return;
        try {
            const { action, time } = JSON.parse(raw);
            const el = document.getElementById('last-activity-display');
            if (el) el.textContent = `${action} — ${new Date(time).toLocaleTimeString()}`;
        } catch {}
    }
}
