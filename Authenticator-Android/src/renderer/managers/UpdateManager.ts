// Current app version — bump this on each release
export const APP_VERSION = '1.0.0';

// URL to your hosted version.json — GitHub raw content is ideal
// Update this to your actual repo URL before release
const VERSION_URL = 'https://raw.githubusercontent.com/you/keyra/main/version.json';

export interface VersionManifest {
    version: string;
    releaseDate: string;
    changelog: string[];
    downloadUrl?: string;  // direct link to the .apk file
    critical?: boolean;    // if true, show modal immediately (no dismiss)
}

export interface UpdateManagerHost {
    showToast(message: string, type: 'info' | 'success' | 'error'): void;
}

function semverGt(a: string, b: string): boolean {
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
        if ((pa[i] ?? 0) > (pb[i] ?? 0)) return true;
        if ((pa[i] ?? 0) < (pb[i] ?? 0)) return false;
    }
    return false;
}

/** Open a URL using Capacitor Browser plugin, falling back to window.open */
async function openUrl(url: string): Promise<void> {
    try {
        const { Browser } = await import('@capacitor/browser');
        await Browser.open({ url });
    } catch {
        // Browser plugin unavailable — fall back
        window.open(url, '_blank');
    }
}

export class UpdateManager {
    private host: UpdateManagerHost;
    private manifest: VersionManifest | null = null;
    private dismissed = false;
    private downloading = false;

    constructor(host: UpdateManagerHost) {
        this.host = host;
    }

    // ─── Public API ────────────────────────────────────────────────────────────

    /** Called once on app start — silent, no toast when up to date */
    public async checkOnStartup(): Promise<void> {
        if (this.dismissed) return;
        if (this.isBannerVisible()) return;
        await this.fetchAndEvaluate(false);
    }

    /** Called from "Check for Updates" button — always gives feedback */
    public async checkManually(): Promise<void> {
        this.setCheckingState(true);
        try {
            await this.fetchAndEvaluate(true);
        } finally {
            this.setCheckingState(false);
        }
    }

    // ─── Fetch & Evaluate ──────────────────────────────────────────────────────

    private async fetchAndEvaluate(manual: boolean): Promise<void> {
        const manifest = await this.fetchManifest();
        if (!manifest) {
            if (manual) this.host.showToast('Could not reach update server', 'error');
            return;
        }

        this.manifest = manifest;
        this.updateVersionRow(manifest.version);

        if (semverGt(manifest.version, APP_VERSION)) {
            if (manifest.critical) {
                this.renderModal(manifest);
            } else {
                this.showBanner(manifest);
            }
        } else {
            if (manual) {
                this.host.showToast("You're on the latest version", 'success');
                this.setLatestBadge();
            }
        }
    }

    private async fetchManifest(): Promise<VersionManifest | null> {
        try {
            const res = await fetch(VERSION_URL, { cache: 'no-store' });
            if (!res.ok) return null;
            const data = await res.json();
            if (data?.version) return data as VersionManifest;
        } catch {
            // network unavailable or CORS — silently ignore
        }
        return null;
    }

    // ─── Download & Install ────────────────────────────────────────────────────

    private async downloadAndInstall(manifest: VersionManifest): Promise<void> {
        if (this.downloading) return;
        if (!manifest.downloadUrl) {
            this.host.showToast('No download URL provided', 'error');
            return;
        }

        this.downloading = true;
        this.setInstallBtnState('downloading');

        try {
            // On Android, opening the APK URL via the system browser triggers
            // the Android Download Manager, which handles the download and
            // prompts the system package installer automatically.
            // The user may need to allow "Install unknown apps" for this app
            // in Android Settings — this is standard for sideloaded APKs.
            await openUrl(manifest.downloadUrl);

            // Give user context on what to expect
            this.host.showToast('Download started — tap the APK to install when done', 'info');

            // Close modal after a short delay so the toast is readable
            setTimeout(() => this.closeModal(), 1500);
        } catch (err) {
            this.host.showToast('Could not open download link', 'error');
        } finally {
            this.downloading = false;
            this.setInstallBtnState('idle');
        }
    }

    // ─── Banner ────────────────────────────────────────────────────────────────

    private showBanner(manifest: VersionManifest): void {
        const banner = document.getElementById('update-banner');
        if (!banner) return;

        const versionEl = banner.querySelector('.update-banner-version');
        if (versionEl) versionEl.textContent = `v${manifest.version} available`;

        banner.classList.remove('hidden');
        requestAnimationFrame(() => banner.classList.add('visible'));

        banner.querySelector('.update-banner-view')?.addEventListener('click', () => {
            this.renderModal(manifest);
        }, { once: true });

        banner.querySelector('.update-banner-dismiss')?.addEventListener('click', () => {
            this.hideBanner();
            this.dismissed = true;
        }, { once: true });
    }

    private hideBanner(): void {
        const banner = document.getElementById('update-banner');
        if (!banner) return;
        banner.classList.remove('visible');
        setTimeout(() => banner.classList.add('hidden'), 400);
    }

    private isBannerVisible(): boolean {
        const banner = document.getElementById('update-banner');
        return !!banner && banner.classList.contains('visible');
    }

    // ─── Modal ─────────────────────────────────────────────────────────────────

    private renderModal(manifest: VersionManifest): void {
        this.hideBanner();

        const overlay = document.getElementById('update-modal-overlay');
        const content = document.getElementById('update-modal-content');
        if (!overlay || !content) return;

        const changelogHtml = manifest.changelog
            .map(item => `
                <div class="update-changelog-item">
                    <div class="update-changelog-dot"></div>
                    <span>${item}</span>
                </div>`)
            .join('');

        const criticalBadge = manifest.critical
            ? `<div class="update-critical-badge"><i class="fa-solid fa-triangle-exclamation"></i> Critical Update</div>`
            : '';

        const hasDownload = !!manifest.downloadUrl;

        content.innerHTML = `
            ${criticalBadge}
            <div class="update-modal-header">
                <div class="update-modal-icon-vessel">
                    <i class="fa-solid fa-arrow-up-from-bracket"></i>
                </div>
                <div class="update-modal-title-group">
                    <h2 class="update-modal-title">Update Available</h2>
                    <div class="update-modal-versions">
                        <span class="update-version-current">v${APP_VERSION}</span>
                        <i class="fa-solid fa-arrow-right" style="font-size:10px; opacity:0.5;"></i>
                        <span class="update-version-new">v${manifest.version}</span>
                    </div>
                </div>
            </div>
            <div class="nm-divider" style="margin: 16px 0;"></div>
            <div class="update-changelog-label">What's new</div>
            <div class="update-changelog-list">${changelogHtml}</div>
            <div class="update-modal-footer">
                <button class="btn-primary update-install-btn" id="update-install-btn">
                    <i class="fa-solid fa-download" id="update-install-icon"></i>
                    <span id="update-install-label">${hasDownload ? 'Download & Install' : 'Reload App'}</span>
                </button>
                ${!manifest.critical ? `<button class="user-button update-later-btn" id="update-later-btn">Later</button>` : ''}
            </div>
            ${hasDownload ? `<p class="update-install-hint">You may be prompted to allow installs from unknown sources</p>` : ''}
        `;

        overlay.classList.remove('hidden');
        requestAnimationFrame(() => overlay.classList.add('show'));

        document.getElementById('update-install-btn')?.addEventListener('click', () => {
            if (hasDownload) {
                this.downloadAndInstall(manifest);
            } else {
                // Web-only fallback: reload to pick up new assets
                window.location.reload();
            }
        });

        document.getElementById('update-later-btn')?.addEventListener('click', () => {
            this.closeModal();
            this.dismissed = true;
        });

        // Only allow backdrop dismiss if not critical
        if (!manifest.critical) {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    this.closeModal();
                    this.dismissed = true;
                }
            }, { once: true });
        }
    }

    private closeModal(): void {
        const overlay = document.getElementById('update-modal-overlay');
        if (!overlay) return;
        overlay.classList.remove('show');
        setTimeout(() => overlay.classList.add('hidden'), 350);
    }

    // ─── UI State Helpers ──────────────────────────────────────────────────────

    private setInstallBtnState(state: 'idle' | 'downloading'): void {
        const btn = document.getElementById('update-install-btn') as HTMLButtonElement | null;
        const icon = document.getElementById('update-install-icon');
        const label = document.getElementById('update-install-label');
        if (!btn) return;

        if (state === 'downloading') {
            btn.disabled = true;
            if (icon) { icon.className = 'fa-solid fa-rotate'; icon.style.animation = 'syncSpin 0.9s linear infinite'; }
            if (label) label.textContent = 'Opening...';
        } else {
            btn.disabled = false;
            if (icon) { icon.className = 'fa-solid fa-download'; icon.style.animation = ''; }
            if (label) label.textContent = 'Download & Install';
        }
    }

    private updateVersionRow(remoteVersion: string): void {
        const desc = document.getElementById('version-row-desc');
        if (desc) desc.textContent = `v${APP_VERSION}`;

        const badge = document.getElementById('version-row-badge');
        if (!badge) return;

        if (semverGt(remoteVersion, APP_VERSION)) {
            badge.textContent = 'UPDATE';
            badge.className = 'update-badge update-badge--new';
        } else {
            badge.textContent = 'LATEST';
            badge.className = 'update-badge update-badge--ok';
        }
    }

    private setLatestBadge(): void {
        const badge = document.getElementById('version-row-badge');
        if (badge) {
            badge.textContent = 'LATEST';
            badge.className = 'update-badge update-badge--ok';
        }
    }

    private setCheckingState(checking: boolean): void {
        const btn = document.getElementById('btn-check-updates');
        if (!btn) return;
        const icon = btn.querySelector('i');
        if (checking) {
            btn.setAttribute('disabled', 'true');
            if (icon) { icon.className = 'fa-solid fa-rotate'; icon.style.animation = 'syncSpin 0.9s linear infinite'; }
        } else {
            btn.removeAttribute('disabled');
            if (icon) { icon.className = 'fa-solid fa-rotate'; icon.style.animation = ''; }
        }
    }
}
