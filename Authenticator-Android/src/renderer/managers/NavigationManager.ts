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
    showEditModal(account: any): void;
    showDeleteConfirm(account: any): void;
    showOtpModal(account: any): void;
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

        // Track current query so we can re-render after modal closes
        let currentQuery = '';

        const renderResults = (query: string) => {
            currentQuery = query;
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
                    <div class="search-result-top">
                        <div class="search-result-icon"><i class="${this.host.getIcon(account.issuer)}"></i></div>
                        <div class="search-result-info">
                            <div class="search-result-name">${account.issuer || 'Unknown'}</div>
                            <div class="search-result-account">${account.account || ''}</div>
                        </div>
                    </div>
                    <div class="search-result-actions">
                        <button class="search-result-action-btn search-result-copy" title="Copy OTP">
                            <i class="fa-solid fa-copy"></i>
                            <span>Copy</span>
                        </button>
                        <button class="search-result-action-btn search-result-view" title="View Code">
                            <i class="fa-solid fa-shield-halved"></i>
                            <span>View</span>
                        </button>
                        <button class="search-result-action-btn search-result-edit" title="Edit">
                            <i class="fa-solid fa-sliders"></i>
                            <span>Edit</span>
                        </button>
                        <button class="search-result-action-btn search-result-delete danger" title="Delete">
                            <i class="fa-solid fa-trash-can"></i>
                            <span>Delete</span>
                        </button>
                    </div>
                `;

                // Copy
                const copyBtn = card.querySelector('.search-result-copy') as HTMLButtonElement;
                copyBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    try {
                        const otp = await (window as any).api.generateTOTP(account.secret);
                        await navigator.clipboard.writeText(otp);
                        copyBtn.innerHTML = '<i class="fa-solid fa-check"></i><span>Copied!</span>';
                        copyBtn.classList.add('success');
                        this.host.showToast(`${account.issuer} code copied`, 'success');
                        Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
                        setTimeout(() => {
                            copyBtn.innerHTML = '<i class="fa-solid fa-copy"></i><span>Copy</span>';
                            copyBtn.classList.remove('success');
                        }, 1500);
                    } catch { this.host.showToast('Failed to copy code', 'error'); }
                });

                // View — modal opens on top, overlay stays open
                card.querySelector('.search-result-view')?.addEventListener('click', (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    if (document.body.classList.contains('vault-is-locked')) {
                        this.host.showToast('Vault Locked — Enter PIN to Access', 'error'); return;
                    }
                    setTimeout(() => this.host.showOtpModal(account), 50);
                });

                // Edit — modal opens on top, overlay stays open
                card.querySelector('.search-result-edit')?.addEventListener('click', (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    if (document.body.classList.contains('vault-is-locked')) {
                        this.host.showToast('Vault Locked — Enter PIN to Access', 'error'); return;
                    }
                    setTimeout(() => this.host.showEditModal(account), 50);
                });

                // Delete — modal opens on top, overlay stays open
                card.querySelector('.search-result-delete')?.addEventListener('click', (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    if (document.body.classList.contains('vault-is-locked')) {
                        this.host.showToast('Vault Locked — Enter PIN to Access', 'error'); return;
                    }
                    setTimeout(() => this.host.showDeleteConfirm(account), 50);
                });

                resultsContainer.appendChild(card);
            });
        };

        const openOverlay = () => {
            overlay.classList.remove('hidden');
            overlay.getBoundingClientRect();
            overlay.classList.add('open');
            setTimeout(() => overlayInput.focus(), 100);
            renderResults(overlayInput.value);
        };

        const closeOverlay = () => {
            overlay.classList.remove('open');
            setTimeout(() => {
                overlay.classList.add('hidden');
                overlayInput.value = '';
                currentQuery = '';
                if (clearBtn) clearBtn.classList.add('hidden');
                resultsContainer.innerHTML = '';
            }, 350);
        };

        // Mobile search icon button in toolbar
        document.getElementById('mobile-search-btn')?.addEventListener('click', () => openOverlay());

        // Fallback: hidden input click (desktop)
        searchInput?.addEventListener('focus', (e) => { e.preventDefault(); searchInput.blur(); openOverlay(); });
        searchInput?.closest('.search-vessel')?.addEventListener('click', () => openOverlay());

        // Only re-render when user actually types — ignore spurious input events
        overlayInput.addEventListener('input', () => {
            if (!overlay.classList.contains('open')) return;
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
        const mainContent = document.querySelector('.main-content');
        document.addEventListener('click', (e) => {
            if (!(e.target as HTMLElement).closest('.card-actions')) closeAllCardDropdowns();
        });
        // Debounced scroll/touchmove — only close dropdowns after movement settles
        let dropdownScrollTimer: any = null;
        const debouncedClose = () => {
            if (dropdownScrollTimer) return;
            dropdownScrollTimer = setTimeout(() => {
                dropdownScrollTimer = null;
                closeAllCardDropdowns();
            }, 150);
        };
        if (mainContent) mainContent.addEventListener('scroll', debouncedClose, { passive: true });
        document.addEventListener('touchmove', debouncedClose, { passive: true });

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
        const mobileSheet = document.getElementById('mobile-user-dropdown');

        const openSheet = (e?: Event) => {
            e?.stopPropagation();
            mobileSheet?.classList.add('show');
        };
        const closeSheet = () => {
            mobileSheet?.classList.remove('show');
        };

        mobileAvatarBtn?.addEventListener('click', openSheet);
        document.getElementById('mobile-sheet-backdrop')?.addEventListener('click', closeSheet);

        // Logo → About modal
        const pushSearchBehind = () => {
            const so = document.getElementById('search-overlay');
            if (so) so.style.zIndex = '1';
        };
        const restoreSearch = () => {
            const so = document.getElementById('search-overlay');
            if (so) so.style.zIndex = '';
        };

        const openAbout = () => {
            pushSearchBehind();
            document.getElementById('modal-about')?.classList.add('show');
        };
        const closeAbout = () => {
            document.getElementById('modal-about')?.classList.remove('show');
            restoreSearch();
        };
        document.querySelector('.vault-header-brand')?.addEventListener('click', openAbout);
        document.querySelector('.navbar-brand')?.addEventListener('click', openAbout);
        document.getElementById('about-close-btn')?.addEventListener('click', closeAbout);
        document.getElementById('about-dismiss-btn')?.addEventListener('click', closeAbout);
        document.getElementById('modal-about')?.addEventListener('click', (e) => {
            if (e.target === e.currentTarget) closeAbout();
        });

        // Vault toolbar collapse toggle
        const vaultPanel = document.getElementById('vault-header-panel');
        const toolbarToggle = document.getElementById('vault-toolbar-toggle');
        const TOOLBAR_KEY = 'vault_toolbar_collapsed';
        if (vaultPanel && toolbarToggle) {
            const isCollapsed = localStorage.getItem(TOOLBAR_KEY) === '1';
            if (isCollapsed) {
                vaultPanel.classList.add('collapsed');
                toolbarToggle.setAttribute('aria-expanded', 'false');
            }
            toolbarToggle.addEventListener('click', () => {
                const collapsed = vaultPanel.classList.toggle('collapsed');
                toolbarToggle.setAttribute('aria-expanded', String(!collapsed));
                localStorage.setItem(TOOLBAR_KEY, collapsed ? '1' : '0');
            });
        }

        document.getElementById('about-website-row')?.addEventListener('click', async () => {
            try {
                const { Browser } = await import('@capacitor/browser');
                await Browser.open({ url: 'https://keyraauth.netlify.app/' });
            } catch {
                window.open('https://keyraauth.netlify.app/', '_blank');
            }
        });

        // Sheet "About" trigger
        document.getElementById('mobile-about-trigger')?.addEventListener('click', () => {
            closeSheet();
            setTimeout(() => openAbout(), 50);
        });

        document.getElementById('mobile-lock-btn')?.addEventListener('click', () => this.host.lockVault());
        document.getElementById('mobile-lock-btn-settings')?.addEventListener('click', () => this.host.lockVault());
        document.getElementById('mobile-lock-btn-account')?.addEventListener('click', () => this.host.lockVault());

        document.getElementById('mobile-theme-toggle-btn')?.addEventListener('click', () => {
            const next = this.host.currentTheme === 'light' ? 'dark' : 'light';
            this.host.setThemeMode(next);
            closeSheet();
        });
        document.getElementById('mobile-logout-trigger')?.addEventListener('click', () => {
            closeSheet();
            pushSearchBehind();
            document.getElementById('modal-logout')?.classList.add('show');
        });

        // Logout confirmation
        document.getElementById('btn-confirm-logout')?.addEventListener('click', async () => {
            await (window as any).api.logout();
            window.location.reload();
        });
        document.getElementById('btn-cancel-logout')?.addEventListener('click', () => {
            document.getElementById('modal-logout')?.classList.remove('show');
            restoreSearch();
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
            if (modalOverlay.dataset.justOpened) return;
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

        // Swipe navigation
        this.setupSwipeNavigation();

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

    // ─── Swipe Navigation ──────────────────────────────────────────────────────

    private setupSwipeNavigation() {
        const TABS: Array<'vault' | 'settings' | 'account'> = ['vault', 'settings', 'account'];
        const MIN_X = 40;
        const MAX_Y = 100;

        let startX = 0;
        let startY = 0;
        let startTime = 0;
        let swiped = false;

        const onStart = (clientX: number, clientY: number) => {
            startX = clientX;
            startY = clientY;
            startTime = Date.now();
            swiped = false;
        };

        const onEnd = (clientX: number, clientY: number, target: EventTarget | null) => {
            if (swiped) return;

            // Ignore if any overlay/modal is open
            if (document.querySelector('.modal-overlay.show, .privacy-blur-overlay:not(.hidden)')) return;
            // Ignore touches on the bottom nav
            const nav = document.getElementById('bottom-nav');
            if (nav && target instanceof Node && nav.contains(target)) return;

            const dx = clientX - startX;
            const dy = Math.abs(clientY - startY);
            const adx = Math.abs(dx);
            const dt = Date.now() - startTime;

            if (dt > 600 || adx < MIN_X || dy > MAX_Y || dy > adx) return;

            swiped = true;

            const idx = TABS.indexOf(this.currentTab);
            const next = dx < 0
                ? TABS[Math.min(idx + 1, TABS.length - 1)]
                : TABS[Math.max(idx - 1, 0)];

            if (next === this.currentTab) return;

            Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
            this.switchTab(next);
        };

        // Touch events
        window.addEventListener('touchstart', (e) => {
            onStart(e.touches[0].clientX, e.touches[0].clientY);
        }, { passive: true });

        window.addEventListener('touchend', (e) => {
            onEnd(e.changedTouches[0].clientX, e.changedTouches[0].clientY, e.target);
        }, { passive: true });

        // Pointer events as fallback (covers mouse drag on desktop preview)
        window.addEventListener('pointerdown', (e) => {
            if (e.pointerType === 'touch') return; // handled by touch events
            onStart(e.clientX, e.clientY);
        }, { passive: true });

        window.addEventListener('pointerup', (e) => {
            if (e.pointerType === 'touch') return;
            onEnd(e.clientX, e.clientY, e.target);
        }, { passive: true });
    }
}
