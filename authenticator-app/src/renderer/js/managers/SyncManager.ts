import { rateLimiter } from '../../../core/rateLimiter.js';

export type SyncState = 'synced' | 'syncing' | 'error' | 'warning';

export interface SyncCallbacks {
    getSettingsObject: () => any;
    onConflict: (action: string, data: any) => void;
    onSettingsApply: (settings: any) => void;
    onAccountsRefresh: () => Promise<void>;
    onActivityUpdate: () => void;
    showToast: (msg: string, type: 'info' | 'success' | 'error') => void;
    setLoading: (show: boolean, title?: string, subtitle?: string) => void;
}

export class SyncManager {
    private syncCount: number = 0;
    private liveSyncInterval: any = null;
    private lastSyncUpdateInterval: any = null;
    public syncVisible: boolean = true;

    private userId: string;
    private cb: SyncCallbacks;

    constructor(userId: string, callbacks: SyncCallbacks) {
        this.userId = userId;
        this.cb = callbacks;
    }

    private getStorageKey(key: string): string {
        return `${this.userId}_${key}`;
    }

    // ─── Indicator ───────────────────────────────────────────────────────────

    public setSyncing(isSyncing: boolean) {
        if (isSyncing) this.syncCount++;
        else this.syncCount = Math.max(0, this.syncCount - 1);
        this.updateSyncIndicator(this.syncCount > 0 ? 'syncing' : 'synced');
    }

    public updateSyncIndicator(state: SyncState, message?: string) {
        const pill = document.getElementById('connectivity-status');
        if (!pill) return;

        pill.classList.remove('sync-synced', 'sync-syncing', 'sync-error', 'sync-warning', 'sync-hidden');

        if (!this.syncVisible) {
            pill.classList.add('sync-hidden');
        } else {
            pill.classList.add('sync-' + state);
        }

        const colorMap: Record<string, string> = {
            synced:  '#34c759',
            syncing: 'var(--accent-primary)',
            error:   '#ff3b30',
            warning: '#ff9500',
        };
        const color = this.syncVisible ? (colorMap[state] ?? 'var(--text-tertiary)') : 'var(--text-tertiary)';

        const syncIcon = document.getElementById('popover-sync-icon');
        const syncText = document.getElementById('popover-sync-text');
        if (syncIcon) syncIcon.style.color = color;

        let popoverText = 'Synced';
        let title = 'Online · Synced';
        if (state === 'syncing') { title = 'Syncing...';              popoverText = 'Syncing...'; }
        if (state === 'error')   { title = message || 'Sync error';   popoverText = 'Error'; }
        if (state === 'warning') { title = message || 'Sync warning'; popoverText = 'Warning'; }
        pill.title = title;

        if (syncText && state !== 'synced') {
            syncText.textContent = popoverText;
            syncText.style.color = color;
        }

        if (state === 'synced') this.updateLastSyncDisplay();
    }

    // ─── Last Sync Display ────────────────────────────────────────────────────

    public startLastSyncTimer() {
        this.updateLastSyncDisplay();
        if (this.lastSyncUpdateInterval) clearInterval(this.lastSyncUpdateInterval);
        this.lastSyncUpdateInterval = setInterval(() => this.updateLastSyncDisplay(), 30000);
    }

    public updateLastSyncDisplay() {
        const lastSyncEl    = document.getElementById('sync-last-time');
        const popoverSyncEl = document.getElementById('popover-sync-text');

        const lastSyncStr = localStorage.getItem(this.getStorageKey('last_sync'));
        if (!lastSyncStr) {
            if (lastSyncEl)    lastSyncEl.textContent    = 'Never synced';
            if (popoverSyncEl) popoverSyncEl.textContent = 'Never synced';
            return;
        }

        const lastSync = new Date(lastSyncStr);
        const diffMin  = Math.floor((new Date().getTime() - lastSync.getTime()) / 60000);

        let text: string;
        if (diffMin < 1)       text = 'Last synced: Just now';
        else if (diffMin < 60) text = `Last synced: ${diffMin}m ago`;
        else {
            const diffHrs = Math.floor(diffMin / 60);
            text = diffHrs < 24
                ? `Last synced: ${diffHrs}h ago`
                : `Last synced: ${Math.floor(diffHrs / 24)}d ago`;
        }

        if (lastSyncEl)    lastSyncEl.textContent    = text;
        if (popoverSyncEl) popoverSyncEl.textContent = text;
    }

    // ─── Push Settings ────────────────────────────────────────────────────────

    public async pushSettings(updateLocal: boolean = true) {
        const rateLimitCheck = rateLimiter.isAllowed('sync', this.userId);
        if (!rateLimitCheck.allowed) {
            console.warn('Sync rate limited:', rateLimitCheck.message);
            this.cb.showToast(rateLimitCheck.message || "Too many sync operations. Please wait.", "error");
            return { success: false, message: 'Rate limited' };
        }

        this.setSyncing(true);
        try {
            rateLimiter.recordAttempt('sync', this.userId);
            const settings = this.cb.getSettingsObject();
            const res = await (window as any).api.updateUserSettings(settings);

            if (res.conflict) {
                this.cb.onConflict('update-user-settings', settings);
                return;
            }

            if (res.success && updateLocal) {
                localStorage.setItem(this.getStorageKey('settings'), JSON.stringify(settings));
            }
            localStorage.setItem(this.getStorageKey('last_sync'), new Date().toISOString());
            return res;
        } catch (err) {
            console.error("Failed to push settings:", err);
            return { success: false };
        } finally {
            this.setSyncing(false);
            this.cb.onActivityUpdate();
        }
    }

    // ─── Manual Sync ──────────────────────────────────────────────────────────

    public async manualSync() {
        if (!navigator.onLine) {
            this.cb.showToast("Cannot sync while offline", "error");
            return;
        }

        // Reset counter to avoid stale state from previous operations
        this.syncCount = 0;

        this.cb.setLoading(true, "Synchronizing Vault", "CLOUD BACKUP IN PROGRESS");
        this.updateSyncIndicator('syncing');

        const btn = document.getElementById('btn-sync-now');
        const icon = btn?.querySelector('i');
        const statusDesc = document.getElementById('sync-status-desc');
        if (icon) icon.classList.add('sync-spin');
        if (statusDesc) statusDesc.textContent = 'Synchronizing...';

        try {
            const rateLimitCheck = rateLimiter.isAllowed('sync', this.userId);
            if (!rateLimitCheck.allowed) {
                this.cb.showToast(rateLimitCheck.message || "Too many sync operations. Please wait.", "error");
                return;
            }
            rateLimiter.recordAttempt('sync', this.userId);

            const settings = this.cb.getSettingsObject();
            const res = await (window as any).api.updateUserSettings(settings);

            if (res?.conflict) {
                this.cb.onConflict('update-user-settings', settings);
            } else if (res?.success) {
                localStorage.setItem(this.getStorageKey('settings'), JSON.stringify(settings));
            }

            await this.cb.onAccountsRefresh();
            localStorage.setItem(this.getStorageKey('last_sync'), new Date().toISOString());
            this.cb.showToast("Vault synced!", "success");
            if (statusDesc) statusDesc.textContent = 'Synchronized';
            this.updateSyncIndicator('synced');
        } catch (err: any) {
            this.cb.showToast("Sync failed", "error");
            this.updateSyncIndicator('error', err.message || 'Sync failed');
            if (statusDesc) statusDesc.textContent = 'Sync Failed';
        } finally {
            this.syncCount = 0;
            if (icon) icon.classList.remove('sync-spin');
            this.cb.setLoading(false);
            this.cb.onActivityUpdate();
        }
    }

    // ─── Live Sync (Polling) ──────────────────────────────────────────────────

    public startLiveSync() {
        if (this.liveSyncInterval) clearInterval(this.liveSyncInterval);
        this.liveSyncInterval = setInterval(() => this.checkForUpdates(), 45000);
    }

    private async checkForUpdates() {
        if (!navigator.onLine) return;
        if (document.activeElement?.tagName === 'INPUT' || document.querySelector('.modal.show')) return;

        this.setSyncing(true);
        try {
            const result = await (window as any).api.pollForUpdates();
            if (result.changed) {
                if (result.settings) this.cb.onSettingsApply(result.settings);
                await this.cb.onAccountsRefresh();
                localStorage.setItem(this.getStorageKey('last_sync'), new Date().toISOString());
            }
        } catch (e: any) {
            console.error("Background sync failed:", e);
            this.updateSyncIndicator('warning', 'Background sync failed');
        } finally {
            this.setSyncing(false);
        }
    }

    // ─── Private Sync Config ──────────────────────────────────────────────────

    public async openPrivateSyncModal() {
        const user = await (window as any).api.getCurrentUser();
        if (!user) return;

        const patInput = document.getElementById('sync-github-pat') as HTMLInputElement;
        const ownerInput = document.getElementById('sync-github-owner') as HTMLInputElement;
        const repoInput = document.getElementById('sync-github-repo') as HTMLInputElement;

        if (user.privateSync) {
            if (patInput) patInput.value = user.privateSync.pat || '';
            if (ownerInput) ownerInput.value = user.privateSync.owner || '';
            if (repoInput) repoInput.value = user.privateSync.repo || '';
        }

        // Delegate modal show back to UIManager
        const modal = document.getElementById('modal-private-sync');
        if (modal) {
            modal.classList.remove('hidden');
            setTimeout(() => modal.classList.add('show'), 10);
        }
    }

    public async testPrivateSyncConnection() {
        const pat = (document.getElementById('sync-github-pat') as HTMLInputElement)?.value;
        const owner = (document.getElementById('sync-github-owner') as HTMLInputElement)?.value;
        const repo = (document.getElementById('sync-github-repo') as HTMLInputElement)?.value;

        if (!pat || !owner || !repo) {
            this.cb.showToast("Please fill in all fields", "info");
            return;
        }

        this.cb.setLoading(true, "Testing Connection", "CONTACTING GITHUB API");
        try {
            const result = await (window as any).api.testPrivateSyncConnection({ pat, owner, repo });
            if (result.success) {
                this.cb.showToast("Connection successful!", "success");
            } else {
                this.cb.showToast(`Connection failed: ${result.message}`, "error");
            }
        } catch (e: any) {
            this.cb.showToast(`Error: ${e.message}`, "error");
        } finally {
            this.cb.setLoading(false);
        }
    }

    public async savePrivateSyncConfig(onSaved: () => Promise<void>) {
        const pat = (document.getElementById('sync-github-pat') as HTMLInputElement)?.value;
        const owner = (document.getElementById('sync-github-owner') as HTMLInputElement)?.value;
        const repo = (document.getElementById('sync-github-repo') as HTMLInputElement)?.value;

        if (!pat || !owner || !repo) {
            this.cb.showToast("Please fill in all fields", "info");
            return;
        }

        this.cb.setLoading(true, "Saving Config", "ENCRYPTING CREDENTIALS");
        try {
            const result = await (window as any).api.updatePrivateSyncConfig({ enabled: true, pat, owner, repo });
            if (result.success) {
                this.cb.showToast("Private Sync enabled successfully!", "success");

                const modal = document.getElementById('modal-private-sync');
                if (modal) {
                    modal.classList.remove('show');
                    setTimeout(() => modal.classList.add('hidden'), 300);
                }

                const syncStatusDesc = document.getElementById('sync-status-desc');
                if (syncStatusDesc) syncStatusDesc.textContent = "Private GitHub Sync Active";

                const privateSyncBtn = document.getElementById('btn-open-private-sync');
                if (privateSyncBtn) {
                    privateSyncBtn.innerHTML = '<i class="fa-solid fa-gear"></i><span>Configure Private Sync</span>';
                }

                await onSaved();
            } else {
                this.cb.showToast(`Failed to save: ${result.message}`, "error");
            }
        } catch (e: any) {
            this.cb.showToast(`Error: ${e.message}`, "error");
        } finally {
            this.cb.setLoading(false);
        }
    }

    // ─── Event Listeners ──────────────────────────────────────────────────────

    public setupEventListeners() {
        document.getElementById('btn-sync-now')?.addEventListener('click', () => this.manualSync());

        document.getElementById('btn-open-private-sync')?.addEventListener('click', () => {
            this.openPrivateSyncModal();
        });

        document.getElementById('btn-close-private-sync')?.addEventListener('click', () => {
            const modal = document.getElementById('modal-private-sync');
            if (modal) {
                modal.classList.remove('show');
                setTimeout(() => modal.classList.add('hidden'), 300);
            }
        });

        document.getElementById('btn-test-sync-connection')?.addEventListener('click', () => {
            this.testPrivateSyncConnection();
        });

        document.getElementById('btn-save-private-sync')?.addEventListener('click', () => {
            this.savePrivateSyncConfig(async () => {
                // loadInitialData is on UIManager — trigger via a custom event
                document.dispatchEvent(new CustomEvent('sync:configSaved'));
            });
        });

        document.getElementById('cloud-sync-toggle')?.addEventListener('change', async (e) => {
            const target = e.target as HTMLInputElement;
            const user = await (window as any).api.getCurrentUser();

            if (user?.isLocal) {
                if (user.privateSync) {
                    const newConfig = { ...user.privateSync, enabled: target.checked };
                    await (window as any).api.updatePrivateSyncConfig(newConfig);
                    this.syncVisible = target.checked;
                    this.updateSyncIndicator(this.syncCount > 0 ? 'syncing' : 'synced');
                    this.cb.showToast(target.checked ? "Private Auto-Sync enabled" : "Private Auto-Sync disabled", "info");
                }
            } else {
                await this.pushSettings();
                this.cb.showToast(target.checked ? "Cloud Auto-Sync enabled" : "Cloud Auto-Sync disabled", "info");
            }
        });
    }
}
