import { rateLimiter } from '../../core/rateLimiter';

export interface SyncManagerHost {
    userId: string;
    getStorageKey(key: string): string;
    showToast(message: string, type: 'info' | 'success' | 'error'): void;
    setLoading(show: boolean, title?: string, subtitle?: string): void;
    refreshAccounts(): Promise<void>;
    loadInitialData(): Promise<void>;
    applySettings(settings: any, saveLocal?: boolean): void;
    updateLastActivity(action: string): void;
    getSettingsObject(): any;
}

export class SyncManager {
    private host: SyncManagerHost;
    private syncCount: number = 0;
    private isManuallySyncing: boolean = false;
    private liveSyncInterval: any = null;
    private lastSyncUpdateInterval: any = null;

    constructor(host: SyncManagerHost) {
        this.host = host;
    }

    // ─── Indicator ─────────────────────────────────────────────────────────────

    public setSyncing(isSyncing: boolean) {
        if (isSyncing) this.syncCount++;
        else this.syncCount = Math.max(0, this.syncCount - 1);

        const indicator = document.getElementById('cloud-sync-indicator');
        if (indicator) {
            indicator.classList.toggle('hidden', this.syncCount === 0);
        }
    }

    // ─── Last Sync Display ─────────────────────────────────────────────────────

    public startLastSyncTimer() {
        this.updateLastSyncDisplay();
        if (this.lastSyncUpdateInterval) clearInterval(this.lastSyncUpdateInterval);
        this.lastSyncUpdateInterval = setInterval(() => this.updateLastSyncDisplay(), 30000);
    }

    public updateLastSyncDisplay() {
        const el = document.getElementById('cloud-status-display');
        const lastSyncStr = localStorage.getItem(this.host.getStorageKey('last_sync'));
        if (!el) return;
        if (!lastSyncStr) { el.textContent = 'Never synced'; return; }

        const diffMin = Math.floor((Date.now() - new Date(lastSyncStr).getTime()) / 60000);
        if (diffMin < 1)       el.textContent = 'Last synced: Just now';
        else if (diffMin < 60) el.textContent = `Last synced: ${diffMin}m ago`;
        else {
            const h = Math.floor(diffMin / 60);
            el.textContent = h < 24 ? `Last synced: ${h}h ago` : `Last synced: ${Math.floor(h / 24)}d ago`;
        }
    }

    // ─── Push Settings ─────────────────────────────────────────────────────────

    public async pushSettings(): Promise<void> {
        const check = rateLimiter.isAllowed('sync', this.host.userId);
        if (!check.allowed) {
            console.warn('Sync rate limited:', check.message);
            this.host.showToast(check.message || 'Too many sync operations. Please wait.', 'error');
            return;
        }
        try {
            this.setSyncing(true);
            rateLimiter.recordAttempt('sync', this.host.userId);
            const res = await (window as any).api.updateUserSettings(this.host.getSettingsObject());
            if (res && res.success === false) {
                this.host.showToast('Cloud sync failed: ' + (res.message || 'Unknown error'), 'error');
            } else {
                localStorage.setItem(this.host.getStorageKey('last_sync'), new Date().toISOString());
                this.updateLastSyncDisplay();
            }
        } catch (error) {
            console.error('Failed to push settings:', error);
            this.host.showToast('Sync Error: Please check your connection', 'error');
            throw error;
        } finally {
            this.setSyncing(false);
        }
    }

    public async pushWebSettings(): Promise<void> {
        const check = rateLimiter.isAllowed('sync', this.host.userId);
        if (!check.allowed) return;
        try {
            this.setSyncing(true);
            rateLimiter.recordAttempt('sync', this.host.userId);
            const settings = this.host.getSettingsObject();
            const webOnly = { 'Web Settings': settings['Web Settings'] };
            const res = await (window as any).api.updateUserSettings(webOnly);
            if (res && res.success === false) {
                console.warn('Cloud web sync reported failure:', res.message);
            }
        } catch (error) {
            console.error('Failed to push web settings:', error);
            throw error;
        } finally {
            this.setSyncing(false);
        }
    }

    // ─── Manual Sync ───────────────────────────────────────────────────────────

    public async manualSync() {
        if (this.isManuallySyncing) {
            this.host.showToast('Sync already in progress', 'info');
            return;
        }
        this.isManuallySyncing = true;

        this.host.showToast('Initiating Cloud Sync...', 'info');
        const icon = document.getElementById('sync-btn-icon');
        if (icon) icon.classList.add('sync-spin');

        try {
            await this.pushSettings();
            await this.host.loadInitialData();
            this.host.showToast('Vault backed up!', 'success');
            this.host.updateLastActivity('Manual Cloud Sync');
        } catch (err) {
            console.error('Manual sync failed', err);
            this.host.showToast('Synchronization failed', 'error');
        } finally {
            this.isManuallySyncing = false;
            if (icon) icon.classList.remove('sync-spin');
        }
    }

    // ─── Live Sync (Polling) ───────────────────────────────────────────────────

    public startLiveSync() {
        if (this.liveSyncInterval) clearInterval(this.liveSyncInterval);
        this.liveSyncInterval = setInterval(() => this.checkForUpdates(), 45000);
    }

    public stopLiveSync() {
        if (this.liveSyncInterval) clearInterval(this.liveSyncInterval);
        if (this.lastSyncUpdateInterval) clearInterval(this.lastSyncUpdateInterval);
    }

    private async checkForUpdates() {
        if (!navigator.onLine) return;
        if (document.activeElement?.tagName === 'INPUT' || document.querySelector('.modal.show')) return;

        this.setSyncing(true);
        try {
            const result = await (window as any).api.pollForUpdates();
            if (result?.changed) {
                if (result.settings) this.host.applySettings(result.settings, false);
                await this.host.refreshAccounts();
                localStorage.setItem(this.host.getStorageKey('last_sync'), new Date().toISOString());
                this.updateLastSyncDisplay();
            }
        } catch (e) {
            console.error('Background sync failed:', e);
        } finally {
            this.setSyncing(false);
        }
    }

    // ─── Event Listeners ───────────────────────────────────────────────────────

    public setupEventListeners() {
        document.getElementById('btn-manual-sync')?.addEventListener('click', () => this.manualSync());
    }
}
