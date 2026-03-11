import { syncVault } from './store.js';

export class UIManager {
    private currentTheme: 'light' | 'dark' = 'light';
    private currentTab: 'vault' | 'settings' = 'vault';
    private accounts: any[] = [];
    private timerInterval: any = null;

    constructor() {
        this.initTheme();
        this.setupEventListeners();
        this.startTimer();
        this.loadInitialData();
    }

    private initTheme() {
        const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' || 'light';
        this.setTheme(savedTheme);
    }

    public setTheme(theme: 'light' | 'dark') {
        this.currentTheme = theme;
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
        
        const themeIcon = document.getElementById('theme-icon-lucide');
        const themeText = document.getElementById('theme-text');
        
        if (themeIcon) {
            themeIcon.setAttribute('data-lucide', theme === 'dark' ? 'sun' : 'moon');
        }
        if (themeText) {
            themeText.textContent = theme === 'dark' ? 'Light Mode' : 'Dark Mode';
        }
        
        this.refreshLucide();
    }

    private refreshLucide() {
        if ((window as any).lucide) {
            (window as any).lucide.createIcons();
        }
    }

    private setupEventListeners() {
        // Tab Navigation
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const target = e.currentTarget as HTMLElement;
                const tabName = target.getAttribute('data-tab') as 'vault' | 'settings';
                this.switchTab(tabName);
            });
        });

        // User Dropdown Logic
        const dropdownBtn = document.getElementById('user-dropdown-btn');
        const dropdownMenu = document.getElementById('user-dropdown');
        dropdownBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdownMenu?.classList.toggle('show');
        });

        document.addEventListener('click', () => {
            dropdownMenu?.classList.remove('show');
        });

        // Dropdown Actions
        document.getElementById('lock-vault-btn')?.addEventListener('click', () => this.lockVault());
        document.getElementById('theme-toggle-btn')?.addEventListener('click', () => {
            const nextTheme = this.currentTheme === 'light' ? 'dark' : 'light';
            this.setTheme(nextTheme);
        });
        document.getElementById('btn-logout-trigger')?.addEventListener('click', () => {
            document.getElementById('modal-logout')?.classList.add('show');
            this.refreshLucide();
        });

        // Logout Confirmation
        document.getElementById('btn-confirm-logout')?.addEventListener('click', async () => {
            await window.api.logout();
            window.location.reload();
        });
        document.getElementById('btn-cancel-logout')?.addEventListener('click', () => {
            document.getElementById('modal-logout')?.classList.remove('show');
        });

        // Main Add Account
        document.getElementById('add-account-btn')?.addEventListener('click', () => this.showAddModal());
        document.getElementById('empty-add-btn')?.addEventListener('click', () => this.showAddModal());

        // Settings Theme Toggle
        document.getElementById('settings-theme-toggle')?.addEventListener('click', () => {
            const nextTheme = this.currentTheme === 'light' ? 'dark' : 'light';
            this.setTheme(nextTheme);
        });
        
        // Settings PIN
        document.getElementById('setup-pin-btn')?.addEventListener('click', () => this.showPinSetup());

        // Unlock Form
        document.getElementById('form-unlock')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleUnlock();
        });

        // Close modal on overlay click
        const modalOverlay = document.getElementById('modal-overlay');
        modalOverlay?.addEventListener('click', (e) => {
            if (e.target === e.currentTarget) this.hideModal();
        });
    }

    private async loadInitialData() {
        try {
            const user = await window.api.getCurrentUser();
            const userNameDisplay = document.getElementById('user-name-display');
            const userAvatar = document.getElementById('user-avatar');
            
            if (userNameDisplay && user) {
                userNameDisplay.textContent = user.username;
            }
            if (userAvatar && user) {
                userAvatar.textContent = user.username.charAt(0).toUpperCase();
            }

            await this.refreshAccounts();
        } catch (err) {
            console.error("Initial load failed", err);
        }
    }

    public async refreshAccounts() {
        this.accounts = await window.api.getAccounts();
        this.renderAccounts();
    }

    private switchTab(tab: 'vault' | 'settings') {
        this.currentTab = tab;
        document.querySelectorAll('.nav-tab').forEach(t => {
            t.classList.toggle('active', t.getAttribute('data-tab') === tab);
        });
        document.getElementById('vault-view')?.classList.toggle('hidden', tab !== 'vault');
        document.getElementById('settings-view')?.classList.toggle('hidden', tab !== 'settings');
        this.refreshLucide();
    }

    private renderAccounts() {
        const grid = document.getElementById('accounts-grid');
        const emptyState = document.getElementById('empty-state');
        if (!grid || !emptyState) return;

        if (this.accounts.length === 0) {
            grid.classList.add('hidden');
            emptyState.classList.remove('hidden');
        } else {
            grid.classList.remove('hidden');
            emptyState.classList.add('hidden');
            grid.innerHTML = '';
            this.accounts.forEach((acc, index) => {
                grid.appendChild(this.createAccountCard(acc, index));
            });
        }
        
        this.refreshLucide();
    }

    private createAccountCard(account: any, index: number): HTMLElement {
        const card = document.createElement('div');
        card.className = 'account-card animate-fade-in';
        card.style.animationDelay = `${index * 0.05}s`;
        
        card.innerHTML = `
            <div class="card-actions">
                <button class="btn-icon edit-btn" title="Edit">
                    <i data-lucide="edit-3"></i>
                </button>
                <button class="btn-icon danger delete-btn" title="Delete">
                    <i data-lucide="trash-2"></i>
                </button>
            </div>
            <div class="account-header">
                <div class="account-icon">
                    <i data-lucide="${this.getIcon(account.issuer)}"></i>
                </div>
                <div class="account-info">
                    <div class="service-name">${account.issuer}</div>
                    <div class="account-identity">${account.account}</div>
                </div>
            </div>
            
            <div class="otp-container">
                <div class="otp-box">
                    <div class="otp-code" data-id="${account.id}">------</div>
                    <div class="timer-container">
                        <svg viewBox="0 0 60 60">
                            <circle cx="30" cy="30" r="26" fill="none" class="timer-bg"></circle>
                            <circle class="timer-progress" cx="30" cy="30" r="26" fill="none" stroke-dasharray="163.36" stroke-dashoffset="0"></circle>
                        </svg>
                    </div>
                </div>
                <button class="btn-primary copy-btn" style="width: 100%; margin-top: 12px;">
                    <i data-lucide="copy"></i>
                    <span>Copy Code</span>
                    <span class="copy-feedback">Copied!</span>
                </button>
            </div>
        `;

        const copyBtn = card.querySelector('.copy-btn') as HTMLElement;
        copyBtn.onclick = async () => {
            const code = card.querySelector('.otp-code')?.textContent || '';
            await navigator.clipboard.writeText(code);
            const feedback = copyBtn.querySelector('.copy-feedback') as HTMLElement;
            feedback.style.opacity = '1';
            feedback.style.transform = 'translateX(-50%) translateY(-5px)';
            setTimeout(() => {
                feedback.style.opacity = '0';
                feedback.style.transform = 'translateX(-50%) translateY(0)';
            }, 2000);
        };

        card.querySelector('.edit-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.showEditModal(account);
        });
        
        card.querySelector('.delete-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.showDeleteConfirm(account);
        });

        this.updateCardOTP(card, account.secret);
        return card;
    }

    private async updateCardOTP(card: HTMLElement, secret: string) {
        const codeElement = card.querySelector('.otp-code');
        if (!codeElement) return;

        const otp = await window.api.generateTOTP(secret);
        if (codeElement.textContent !== otp) {
            codeElement.textContent = otp;
        }

        const remaining = await window.api.getRemainingSeconds();
        const dashOffset = 163.36 * (1 - remaining / 30);
        const progressCircle = card.querySelector('.timer-progress') as HTMLElement;
        if (progressCircle) {
            progressCircle.style.strokeDashoffset = dashOffset.toString();
            progressCircle.style.stroke = remaining <= 5 ? '#ff3b30' : 'var(--accent-primary)';
        }
    }

    private startTimer() {
        if (this.timerInterval) clearInterval(this.timerInterval);
        this.timerInterval = setInterval(() => {
            const cards = document.querySelectorAll('.account-card');
            cards.forEach((card, i) => {
                if (this.accounts[i]) this.updateCardOTP(card as HTMLElement, this.accounts[i].secret);
            });
        }, 1000);
    }

    private getIcon(issuer: string): string {
        const icons: any = {
            'google': 'search', 'github': 'github', 'microsoft': 'cloud', 'apple': 'apple',
            'amazon': 'shopping-cart', 'facebook': 'facebook', 'twitter': 'twitter', 'discord': 'message-square',
            'binance': 'coins', 'coinbase': 'wallet', 'stripe': 'credit-card', 'paypal': 'dollar-sign',
            'base': 'shield'
        };
        return icons[issuer.toLowerCase()] || 'shield';
    }

    private showModal(content: string) {
        const overlay = document.getElementById('modal-overlay');
        if (!overlay) return;
        overlay.innerHTML = `<div class="modal animate-fade-in">${content}</div>`;
        overlay.classList.add('show');
        this.refreshLucide();
    }

    public hideModal() {
        const overlay = document.getElementById('modal-overlay');
        if (!overlay) return;
        overlay.classList.remove('show');
        setTimeout(() => overlay.innerHTML = '', 300);
    }

    private showAddModal() {
        const content = `
            <div style="padding: 32px;">
                <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
                    <i data-lucide="plus-circle" style="color: var(--accent-primary); width: 24px; height: 24px;"></i>
                    <h2 style="font-weight: 800;">Add Account</h2>
                </div>
                <p style="color: var(--text-secondary); margin-bottom: 24px; font-size: 14px;">Enter your service details manually</p>
                <div class="form-group">
                    <label class="form-label">Service Name</label>
                    <input type="text" id="new-issuer" class="form-input" placeholder="e.g. Google, GitHub">
                </div>
                <div class="form-group">
                    <label class="form-label">Account Identity</label>
                    <input type="text" id="new-account" class="form-input" placeholder="user@example.com">
                </div>
                <div class="form-group">
                    <label class="form-label">Secret Key</label>
                    <input type="text" id="new-secret" class="form-input" placeholder="Base32 code">
                </div>
                <div style="display: flex; gap: 12px; margin-top: 32px;">
                    <button class="btn-primary" id="save-new-account" style="flex: 2;">Add Identity</button>
                    <button class="user-button" id="cancel-add-btn" style="flex: 1; justify-content: center;">Cancel</button>
                </div>
            </div>
        `;
        this.showModal(content);
        document.getElementById('save-new-account')?.addEventListener('click', async () => {
            const issuer = (document.getElementById('new-issuer') as HTMLInputElement).value;
            const account = (document.getElementById('new-account') as HTMLInputElement).value;
            const secret = (document.getElementById('new-secret') as HTMLInputElement).value;
            if (!issuer || !secret) {
                this.showToast("Issuer and Secret are required", "error");
                return;
            }
            await window.api.saveAccount({ id: Date.now().toString(), issuer, account, secret });
            await this.refreshAccounts();
            this.hideModal();
            this.showToast("Account added successfully", "success");
        });
        document.getElementById('cancel-add-btn')?.addEventListener('click', () => this.hideModal());
    }

    private showEditModal(account: any) {
        const content = `
            <div style="padding: 32px;">
                <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
                    <i data-lucide="edit-3" style="color: var(--accent-primary); width: 24px; height: 24px;"></i>
                    <h2 style="font-weight: 800;">Edit Account</h2>
                </div>
                <p style="color: var(--text-secondary); margin-bottom: 24px; font-size: 14px;">Update details for ${account.issuer}</p>
                <div class="form-group">
                    <label class="form-label">Service Name</label>
                    <input type="text" id="edit-issuer" class="form-input" value="${account.issuer}">
                </div>
                <div class="form-group">
                    <label class="form-label">Account Identity</label>
                    <input type="text" id="edit-account" class="form-input" value="${account.account}">
                </div>
                <div style="display: flex; gap: 12px; margin-top: 32px;">
                    <button class="btn-primary" id="update-account" style="flex: 2;">Update Changes</button>
                    <button class="user-button" id="cancel-edit-btn" style="flex: 1; justify-content: center;">Cancel</button>
                </div>
            </div>
        `;
        this.showModal(content);
        document.getElementById('update-account')?.addEventListener('click', async () => {
            const issuer = (document.getElementById('edit-issuer') as HTMLInputElement).value;
            const accountName = (document.getElementById('edit-account') as HTMLInputElement).value;
            if (!issuer) return this.showToast("Service name is required", "error");
            
            await window.api.saveAccount({ ...account, issuer, account: accountName });
            await this.refreshAccounts();
            this.hideModal();
            this.showToast("Account updated", "success");
        });
        document.getElementById('cancel-edit-btn')?.addEventListener('click', () => this.hideModal());
    }

    public showToast(message: string, type: 'info' | 'success' | 'error' = 'info') {
        const container = document.getElementById('toast-container');
        if (!container) return;
        const toast = document.createElement('div');
        toast.className = 'animate-fade-in';
        toast.style.cssText = `
            background: var(--bg-primary);
            color: var(--text-primary);
            padding: 12px 20px;
            border-radius: var(--radius-md);
            box-shadow: var(--shadow-medium);
            border-left: 4px solid ${type === 'error' ? '#ff3b30' : type === 'success' ? '#34c759' : 'var(--accent-primary)'};
            display: flex; align-items: center; gap: 10px;
            font-size: 14px; font-weight: 600;
        `;
        
        const iconName = type === 'error' ? 'alert-circle' : type === 'success' ? 'check-circle' : 'info';
        toast.innerHTML = `<i data-lucide="${iconName}" style="width: 18px; height: 18px;"></i> <span>${message}</span>`;
        
        container.appendChild(toast);
        this.refreshLucide();

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(10px)';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    public lockVault() {
        const vessel = document.getElementById('lock-vessel');
        if (!vessel) return;
        vessel.classList.add('show');
        this.refreshLucide();
        const pinIn = document.getElementById('unlock-pin') as HTMLInputElement;
        if (pinIn) { pinIn.value = ''; pinIn.focus(); }
    }

    private handleUnlock() {
        const pinIn = document.getElementById('unlock-pin') as HTMLInputElement;
        const uid = (window as any).currentUserId || 'default';
        const saved = localStorage.getItem(`${uid}_vault_pin`);
        if (pinIn.value === saved) {
            document.getElementById('lock-vessel')?.classList.remove('show');
        } else {
            this.showToast("Invalid PIN", "error");
            pinIn.value = ''; pinIn.focus();
        }
    }

    private showPinSetup() {
        const content = `
            <div style="padding: 32px;">
                <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
                    <i data-lucide="key-round" style="color: var(--accent-primary); width: 24px; height: 24px;"></i>
                    <h2 style="font-weight: 800;">Vault Security</h2>
                </div>
                <p style="color: var(--text-secondary); margin-bottom: 24px; font-size: 14px;">Set a 4-digit PIN to protect your vault</p>
                <input type="password" id="new-pin" maxlength="4" class="form-input" style="text-align: center; font-size: 24px; letter-spacing: 12px;" placeholder="••••">
                <div style="display: flex; gap: 12px; margin-top: 32px;">
                    <button class="btn-primary" id="save-pin" style="flex: 2;">Save PIN</button>
                    <button class="user-button" id="cancel-pin-btn" style="flex: 1; justify-content: center;">Cancel</button>
                </div>
            </div>
        `;
        this.showModal(content);
        document.getElementById('save-pin')?.addEventListener('click', () => {
            const pin = (document.getElementById('new-pin') as HTMLInputElement).value;
            if (pin.length === 4) {
                const uid = (window as any).currentUserId || 'default';
                localStorage.setItem(`${uid}_vault_pin`, pin);
                this.showToast("PIN set successfully", "success");
                this.hideModal();
            } else {
                this.showToast("PIN must be 4 digits", "error");
            }
        });
        document.getElementById('cancel-pin-btn')?.addEventListener('click', () => this.hideModal());
    }

    private showDeleteConfirm(account: any) {
        const content = `
            <div style="padding: 32px; text-align: center;">
                <div style="color: #ff3b30; margin-bottom: 16px;">
                    <i data-lucide="alert-triangle" style="width: 48px; height: 48px;"></i>
                </div>
                <h2 style="font-weight: 800; margin-bottom: 12px;">Delete Account?</h2>
                <p style="color: var(--text-secondary); margin-bottom: 32px; font-size: 15px;">Removing <strong>${account.issuer}</strong> will permanently erase its token.</p>
                <div style="display: flex; gap: 12px;">
                    <button class="btn-primary" id="confirm-delete" style="flex: 1; background: #ff3b30;">Delete</button>
                    <button class="user-button" id="cancel-delete-btn" style="flex: 1; justify-content: center;">Cancel</button>
                </div>
            </div>
        `;
        this.showModal(content);
        document.getElementById('confirm-delete')?.addEventListener('click', async () => {
            await window.api.deleteAccount(account.id);
            await this.refreshAccounts();
            this.hideModal();
            this.showToast("Account removed", "info");
        });
        document.getElementById('cancel-delete-btn')?.addEventListener('click', () => this.hideModal());
    }
}
