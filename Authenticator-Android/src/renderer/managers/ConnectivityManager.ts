export interface ConnectivityManagerHost {
    showToast(message: string, type: 'info' | 'success' | 'error'): void;
    manualSync(): Promise<void>;
}

export class ConnectivityManager {
    private host: ConnectivityManagerHost;
    private wasOffline: boolean = false;
    private hideTimer: any = null;

    constructor(host: ConnectivityManagerHost) {
        this.host = host;
    }

    public init() {
        this.updateIndicator(false); // silent on startup — show briefly then hide

        window.addEventListener('online', () => {
            const wasOff = this.wasOffline;
            this.wasOffline = false;
            this.updateIndicator(false);
            if (wasOff) {
                this.host.showToast('Back online — syncing vault...', 'success');
                setTimeout(() => this.host.manualSync().catch(() => {}), 800);
            }
        });

        window.addEventListener('offline', () => {
            this.wasOffline = true;
            if (this.hideTimer) { clearTimeout(this.hideTimer); this.hideTimer = null; }
            this.updateIndicator(false);
            this.host.showToast("You're offline — changes will sync when reconnected", 'info');
        });
    }

    private updateIndicator(notify: boolean) {
        const el = document.getElementById('connectivity-indicator');
        if (!el) return;

        const isOnline = navigator.onLine;

        // Update classes
        el.classList.toggle('online', isOnline);
        el.classList.toggle('offline', !isOnline);
        el.classList.remove('auto-hide');

        const label = el.querySelector('.connectivity-label');
        if (label) label.textContent = isOnline ? 'Online' : 'Offline';

        // Make visible
        el.classList.add('visible');

        // Also update the settings cloud status row
        const statusDisplay = document.getElementById('cloud-status-display');
        if (statusDisplay) {
            statusDisplay.textContent = isOnline ? 'Connected' : 'Offline';
            (statusDisplay as HTMLElement).style.color = isOnline
                ? 'var(--success, #34c759)'
                : 'var(--error, #ff3b30)';
        }

        if (notify && !isOnline) {
            this.host.showToast("You're offline", 'info');
        }

        // Auto-hide the online pill after 3 s — keep offline pill always visible
        if (this.hideTimer) clearTimeout(this.hideTimer);
        if (isOnline) {
            this.hideTimer = setTimeout(() => {
                el.classList.add('auto-hide');
            }, 3000);
        }
    }

    public get isOnline(): boolean {
        return navigator.onLine;
    }
}
