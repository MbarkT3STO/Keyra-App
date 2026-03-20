export interface ConnectivityCallbacks {
    showToast: (msg: string, type: 'info' | 'success' | 'error') => void;
    manualSync: () => Promise<void>;
}

export class ConnectivityManager {
    constructor(private cb: ConnectivityCallbacks) {}

    init() {
        this.updateStatus();
        window.addEventListener('online',  () => this.updateStatus());
        window.addEventListener('offline', () => this.updateStatus());

        const pill    = document.getElementById('connectivity-status');
        const popover = document.getElementById('status-popover');

        pill?.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = popover?.classList.contains('show');
            popover?.classList.toggle('show', !isOpen);
        });

        document.addEventListener('click', (e) => {
            if (!pill?.contains(e.target as Node) && !popover?.contains(e.target as Node)) {
                popover?.classList.remove('show');
            }
        });

        document.getElementById('btn-popover-sync')?.addEventListener('click', async (e) => {
            e.stopPropagation();
            popover?.classList.remove('show');
            await this.cb.manualSync();
        });
    }

    updateStatus() {
        const isOnline  = navigator.onLine;
        const pill      = document.getElementById('connectivity-status');
        const connText  = document.getElementById('popover-conn-text');
        const connIcon  = document.getElementById('popover-conn-icon');

        if (pill) {
            pill.classList.toggle('online',  isOnline);
            pill.classList.toggle('offline', !isOnline);
        }
        if (connText) {
            connText.textContent = isOnline ? 'Online' : 'Offline';
            connText.style.color = isOnline ? '#34c759' : '#ff3b30';
        }
        if (connIcon) connIcon.style.color = isOnline ? '#34c759' : '#ff3b30';

        if (!isOnline) this.cb.showToast("You're offline", 'info');
    }
}
