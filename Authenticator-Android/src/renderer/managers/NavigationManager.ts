import { Haptics, ImpactStyle } from '@capacitor/haptics';

export interface NavigationManagerHost {
    userId: string;
    currentTheme: 'light' | 'dark';
    themeMode: 'light' | 'dark' | 'auto';
    accounts: any[];
    getStorageKey(key: string): string;
    showToast(message: string, type: 'info' | 'success' | 'error'): void;
    setTheme(theme: 'light' | 'dark', silent?: boolean): void;
    setThemeMode(mode: 'light' | 'dark' | 'auto', silent?: boolean): void;
    setLoading(show: boolean, title?: string, subtitle?: string): void;
    showModal(content: string): void;
    hideModal(): void;
    lockVault(): void;
    showAddModal(): void;
    showForgotPinConfirm(): void;
    handleUnlock(): void;
    updateLockVaultVisibility(): void;
    updateSegmentedUI(containerId: string, value: string): void;
    updateLastActivity(action: string): void;
    updateLastActivityDisplay(): void;
    renderAccounts(): void;
    refreshAccounts(): Promise<void>;
    loadAccountInfo(): void;
    setupNumpad(): void;
    getIcon(issuer: string): string;
    pinManager: { validateAndAutoUnlock(pin: string): void; clearPinInput(): void; };
    themeManager: { loadAccentColor(): void; setupAccentColorSelector(): void; };
    authManager: { setupAccountEvents(): void; };
}

/** Close every open card dropdown */
function closeAllCardDropdowns() {
    document.querySelectorAll<HTMLElement>('.card-dropdown.show').forEach(d => d.classList.remove('show'));
    document.querySelectorAll<HTMLElement>('.btn-card-more.active').forEach(b => b.classList.remove('active'));
}

export class NavigationManager {
    private host: NavigationManagerHost;
    private currentTab: 'vault' | 'settings' | 'account' = 'vault';

    constructor(host: NavigationManagerHost) {
        this.host = host;
    }

    // ─── Tab Switching ─────────────────────────────────────────────────────────

    public switchTab(tab: 'vault' | 'settings' | 'account') {
        this.currentTab = tab;

        document.querySelectorAll('.nav-tab').forEach(t =>
            t.classList.toggle('active', t.getAttribute('data-tab') === tab));
        document.querySelectorAll('.bottom-nav-tab').forEach(t =>
            t.classList.toggle('active', t.getAttribute('data-tab') === tab));

        document.getElementById('vault-view')?.classList.toggle('hidden', tab !== 'vault');
        document.getElementById('settings-view')?.classList.toggle('hidden', tab !== 'settings');
        document.getElementById('account-view')?.classList.toggle('hidden', tab !== 'account');

        if (tab === 'account') this.host.loadAccountInfo();
    }

    // ─── Segmented UI ──────────────────────────────────────────────────────────

    public updateSegmentedUI(containerId: string, value: string) {
        const container = document.getElementById(containerId);
        if (!container) return;
        const segments = container.querySelectorAll('.segment');
        const indicator = container.querySelector('.segment-indicator') as HTMLElement;
        let activeIdx = 0;
        segments.forEach((seg, idx) => {
            const isActive = seg.getAttribute('data-val') === value;
            seg.classList.toggle('active', isActive);
            if (isActive) activeIdx = idx;
        });
        if (indicator) {
            const segmentWidth = 100 / segments.length;
            indicator.style.width = `calc(${segmentWidth}% - 6px)`;
            indicator.style.left = `calc(${activeIdx * segmentWidth}% + 3px)`;
        }
    }

    // ─── Lock Visibility ───────────────────────────────────────────────────────

    public updateLockVaultVisibility() {
        const hasPin = !!localStorage.getItem(`${this.host.userId}_vault_pin`);
        document.getElementById('lock-vault-btn')?.classList.toggle('hidden', !hasPin);
        document.getElementById('mobile-lock-btn')?.classList.toggle('hidden', !hasPin);
        document.getElementById('mobile-lock-btn-settings')?.classList.toggle('hidden', !hasPin);
        document.getElementById('mobile-lock-btn-account')?.classList.toggle('hidden', !hasPin);

        const setupBtn = document.getElementById('setup-pin-btn');
        const changeBtn = document.getElementById('change-pin-btn');
        const removeBtn = document.getElementById('remove-pin-btn');
        if (setupBtn) setupBtn.style.display = hasPin ? 'none' : 'flex';
        if (changeBtn) changeBtn.style.display = hasPin ? 'flex' : 'none';
        if (removeBtn) { removeBtn.style.display = hasPin ? 'flex' : 'none'; removeBtn.title = 'Remove Security Policy'; }
    }

    // ─── Search Overlay ────────────────────────────────────────────────────────

    public setupSearchOverlay() {
        const searchInput = document.getElementById('vault-search') as HTMLInputElement;
        const overlay = document.getElementById('search-overlay');
        const overlayInput = document.getElementById('search-overlay-input') as HTMLInputElement;
        const backBtn = document.getElementById('search-overlay-back');
        const clearBtn = document.getElementById('search-overlay-clear');
        const resultsContainer = document.getElementById('search-overlay-results');

        if (!overlay || !overlayInput || !resultsContainer) return;

        const renderResults = (query: string) => {
            resultsContainer.innerHTML = '';
            const q = query.toLowerCase().trim();
            if (!q) {
                resultsContainer.innerHTML = `
                    <div class="search-overlay-empty">
                        <i class="fa-solid fa-magnifying-glass"></i>
                        <p>Start typing to search your accounts</p>
                    </div>`;
                return;
            }
            const filtered = this.host.accounts.filter(a =>
                (a.issuer || '').toLowerCase().includes(q) ||
                (a.account || '').toLowerCase().includes(q)
            );
            if (!filtered.length) {
                resultsContainer.innerHTML = `
                    <div class="search-overlay-empty">
                        <i class="fa-solid fa-magnifying-glass"></i>
                        <p>No results for "${query}"</p>
                    </div>`;
                return;
            }
            filtered.forEach(account => {
                const card = document.createElement('div');
                card.className = 'search-result-card';
                card.innerHTML = `
                    <div class="search-result-icon"><i class="${this.host.getIcon(account.issuer)}"></i></div>
                    <div class="search-result-info">
                        <div class="search-result-name">${account.issuer || 'Unknown'}</div>
                        <div class="search-result-account">${account.account || ''}</div>
                    </div>
                    <button class="search-result-copy" title="Copy OTP">
                        <i class="fa-solid fa-copy"></i>
                    </button>
                `;
                const copyBtn = card.querySelector('.search-result-copy') as HTMLButtonElement;
                const doCopy = async (e: Event) => {
                    e.stopPropagation();
                    try {
                        const otp = await (window as any).api.generateTOTP(account.secret);
                        await navigator.clipboard.writeText(otp);
                        copyBtn.innerHTML = '<i class="fa-solid fa-check"></i>';
                        this.host.showToast(`${account.issuer} code copied`, 'success');
                        Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
                        setTimeout(() => { copyBtn.innerHTML = '<i class="fa-solid fa-copy"></i>'; }, 1500);
                    } catch {
                        this.host.showToast('Failed to copy code', 'error');
                    }
                };
                card.addEventListener('click', doCopy);
                copyBtn.addEventListener('click', doCopy);
                resultsContainer.appendChild(card);
            });
        };

        const openOverlay = () => {
            overlay.classList.remove('hidden');
            overlay.getBoundingClientRect(); // force reflow for transition
            overlay.classList.add('open');
            setTimeout(() => overlayInput.focus(), 100);
            renderResults(overlayInput.value);
        };

        const closeOverlay = () => {
            overlay.classList.remove('open');
            setTimeout(() => overlay.classList.add('hidden'), 350);
            overlayInput.value = '';
            if (clearBtn) clearBtn.classList.add('hidden');
            resultsContainer.innerHTML = '';
        };

        searchInput?.addEventListener('focus', (e) => { e.preventDefault(); searchInput.blur(); openOverlay(); });
        searchInput?.closest('.search-vessel')?.addEventListener('click', () => openOverlay());

        overlayInput.addEventListener('input', () => {
            const q = overlayInput.value;
            if (clearBtn) clearBtn.classList.toggle('hidden', q.length === 0);
            renderResults(q);
        });

        backBtn?.addEventListener('click', closeOverlay);
        clearBtn?.addEventListener('click', () => {
            overlayInput.value = '';
            clearBtn.classList.add('hidden');
            renderResults('');
            overlayInput.focus();
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && overlay.classList.contains('open')) closeOverlay();
        });

        document.getElementById('search-empty-clear-btn')?.addEventListener('click', () => openOverlay());

        // Expose for app.ts Android back button
        (window as any).__closeSearchOverlay = closeOverlay;
        (window as any).__isSearchOverlayOpen = () => overlay.classList.contains('open');
    }

    // ─── Pull-to-Refresh ───────────────────────────────────────────────────────

    public setupPullToRefresh() {
        const content = document.querySelector('.main-content') as HTMLElement;
        if (!content) return;
        let startY = 0;
        let pulling = false;
        const threshold = 72;
        const maxHeight = 52;
        const isVaultTab = () => !document.getElementById('vault-view')?.classList.contains('hidden');

        content.addEventListener('touchstart', (e) => {
            if (!isVaultTab()) return;
            if (content.scrollTop === 0) { startY = e.touches[0].clientY; pulling = true; }
        }, { passive: true });

        content.addEventListener('touchmove', (e) => {
            if (!pulling) return;
            const delta = e.touches[0].clientY - startY;
            if (delta > 0 && content.scrollTop === 0) {
                const indicator = document.getElementById('pull-refresh-indicator');
                if (indicator) {
                    // Expand height proportionally, capped at maxHeight
                    const h = Math.min(delta * 0.55, maxHeight);
                    indicator.style.height = `${h}px`;
                    indicator.classList.toggle('ready', delta > threshold);
                }
            }
        }, { passive: true });

        content.addEventListener('touchend', async (e) => {
            if (!pulling) return;
            pulling = false;
            const delta = e.changedTouches[0].clientY - startY;
            const indicator = document.getElementById('pull-refresh-indicator');
            if (delta > threshold && isVaultTab()) {
                Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});
                // Hold open at full height while loading
                if (indicator) {
                    indicator.style.height = `${maxHeight}px`;
                    indicator.classList.remove('ready');
                    indicator.classList.add('loading');
                }
                await this.host.refreshAccounts();
                if (indicator) {
                    indicator.classList.remove('loading');
                    indicator.style.height = '0';
                }
            } else {
                // Snap closed
                if (indicator) {
                    indicator.style.height = '0';
                    indicator.classList.remove('ready');
                }
            }
        }, { passive: true });
    }

    // ─── Search Focus ──────────────────────────────────────────────────────────

    public setupSearchFocus() {
        const searchInput = document.getElementById('vault-search') as HTMLInputElement;
        const searchWrapper = searchInput?.closest('.search-wrapper') as HTMLElement;
        if (!searchInput || !searchWrapper) return;
        searchInput.addEventListener('focus', () => searchWrapper.classList.add('focused'));
        searchInput.addEventListener('blur', () => searchWrapper.classList.remove('focused'));
    }

    // ─── Global Event Listeners ────────────────────────────────────────────────

    public setupEventListeners() {
        // Card dropdown dismissal
        document.addEventListener('click', (e) => {
            if (!(e.target as HTMLElement).closest('.card-actions')) closeAllCardDropdowns();
        });
        const mainContent = document.querySelector('.main-content');
        if (mainContent) mainContent.addEventListener('scroll', () => closeAllCardDropdowns(), { passive: true });
        document.addEventListener('touchmove', () => closeAllCardDropdowns(), { passive: true });

        // Tab navigation
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const tabName = (e.currentTarget as HTMLElement).getAttribute('data-tab') as 'vault' | 'settings' | 'account';
                this.switchTab(tabName);
            });
        });
        document.querySelectorAll('.bottom-nav-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const tabName = (e.currentTarget as HTMLElement).getAttribute('data-tab') as 'vault' | 'settings' | 'account';
                this.switchTab(tabName);
            });
        });

        // User dropdown
        const dropdownBtn = document.getElementById('user-dropdown-btn');
        const dropdownMenu = document.getElementById('user-dropdown');
        dropdownBtn?.addEventListener('click', (e) => { e.stopPropagation(); dropdownMenu?.classList.toggle('show'); });
        document.addEventListener('click', () => {
            dropdownMenu?.classList.remove('show');
            document.getElementById('mobile-user-dropdown')?.classList.remove('show');
        });

        // Dropdown actions
        document.getElementById('lock-vault-btn')?.addEventListener('click', () => this.host.lockVault());
        document.getElementById('theme-toggle-btn')?.addEventListener('click', () => {
            const next = this.host.currentTheme === 'light' ? 'dark' : 'light';
            this.host.setThemeMode(next);
        });
        document.getElementById('btn-logout-trigger')?.addEventListener('click', () => {
            document.getElementById('modal-logout')?.classList.add('show');
        });

        // Mobile header actions
        const mobileAvatarBtn = document.getElementById('mobile-avatar-btn');
        const mobileDropdown = document.getElementById('mobile-user-dropdown');
        mobileAvatarBtn?.addEventListener('click', (e) => { e.stopPropagation(); mobileDropdown?.classList.toggle('show'); });

        document.getElementById('mobile-lock-btn')?.addEventListener('click', () => this.host.lockVault());
        document.getElementById('mobile-lock-btn-settings')?.addEventListener('click', () => this.host.lockVault());
        document.getElementById('mobile-lock-btn-account')?.addEventListener('click', () => this.host.lockVault());

        document.getElementById('mobile-theme-toggle-btn')?.addEventListener('click', () => {
            const next = this.host.currentTheme === 'light' ? 'dark' : 'light';
            this.host.setThemeMode(next);
            mobileDropdown?.classList.remove('show');
        });
        document.getElementById('mobile-logout-trigger')?.addEventListener('click', () => {
            mobileDropdown?.classList.remove('show');
            document.getElementById('modal-logout')?.classList.add('show');
        });

        // Logout confirmation
        document.getElementById('btn-confirm-logout')?.addEventListener('click', async () => {
            await (window as any).api.logout();
            window.location.reload();
        });
        document.getElementById('btn-cancel-logout')?.addEventListener('click', () => {
            document.getElementById('modal-logout')?.classList.remove('show');
        });

        // Add account buttons
        const guardedAdd = () => {
            if (document.body.classList.contains('vault-is-locked')) {
                this.host.showToast('Vault Locked - Enter PIN to Access', 'error');
                return;
            }
            this.host.showAddModal();
        };
        document.getElementById('add-account-btn')?.addEventListener('click', guardedAdd);
        document.getElementById('empty-add-btn')?.addEventListener('click', guardedAdd);

        // Search input (desktop fallback — overlay handles mobile)
        const searchInput = document.getElementById('vault-search') as HTMLInputElement;
        searchInput?.addEventListener('input', (e) => {
            // On desktop the overlay isn't used, so filter inline
            const q = (e.target as HTMLInputElement).value.toLowerCase().trim();
            (this.host as any).searchQuery = q;
            this.host.renderAccounts();
        });

        // Modal overlay dismiss
        const modalOverlay = document.getElementById('modal-overlay');
        modalOverlay?.addEventListener('click', (e) => {
            if (e.target === e.currentTarget) this.host.hideModal();
        });

        // Unlock form
        document.getElementById('form-unlock')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.host.handleUnlock();
        });
        document.getElementById('btn-forgot-pin')?.addEventListener('click', () => this.host.showForgotPinConfirm());

        // PIN keyboard input fallback
        const pinInput = document.getElementById('unlock-pin') as HTMLInputElement;
        pinInput?.addEventListener('input', (e) => {
            const value = (e.target as HTMLInputElement).value;
            const numeric = value.replace(/[^0-9]/g, '');
            if (value !== numeric) (e.target as HTMLInputElement).value = numeric;
            this.host.pinManager.validateAndAutoUnlock(numeric);
        });
        pinInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this.host.pinManager.clearPinInput();
            else if (e.key === 'Enter') { e.preventDefault(); this.host.handleUnlock(); }
            else if (e.key.length === 1 && !/[0-9]/.test(e.key)) e.preventDefault();
        });

        // Numpad + search overlay
        this.host.setupNumpad();
        this.setupSearchOverlay();

        // Resize debounce (no-op)
        let resizeTimer: any;
        window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => {}, 250); });

        // Accent + theme init
        this.host.themeManager.loadAccentColor();
        this.host.themeManager.setupAccentColorSelector();

        // Account events
        this.host.authManager.setupAccountEvents();

        // Activity tracking
        this.host.updateLastActivity('Vault opened');
        this.host.updateLastActivityDisplay();

        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const tabName = tab.getAttribute('data-tab');
                this.host.updateLastActivity(`Switched to ${tabName}`);
                if (tabName === 'settings') setTimeout(() => this.host.updateLastActivityDisplay(), 100);
            });
        });
        document.getElementById('lock-vault-btn')?.addEventListener('click', () => this.host.updateLastActivity('Vault locked'));
        document.getElementById('add-account-btn')?.addEventListener('click', () => this.host.updateLastActivity('Added new token'));
        document.getElementById('theme-segmented')?.addEventListener('click', () => {
            setTimeout(() => this.host.updateLastActivity('Changed theme'), 100);
        });
    }
}
