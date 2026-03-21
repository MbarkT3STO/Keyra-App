export interface ThemeManagerHost {
    userId: string;
    getStorageKey(key: string): string;
    pushWebSettings(): Promise<void>;
    updateSegmentedUI(containerId: string, value: string): void;
    updateLastActivity(action: string): void;
    showToast(message: string, type: 'info' | 'success' | 'error'): void;
}

export class ThemeManager {
    private host: ThemeManagerHost;
    private currentTheme: 'light' | 'dark' = 'light';

    // Stored so we can remove them on re-init
    private handleToggleClick: ((e: Event) => void) | null = null;
    private handleDocumentClick: ((e: Event) => void) | null = null;

    constructor(host: ThemeManagerHost) {
        this.host = host;
    }

    // ─── Public API ────────────────────────────────────────────────────────────

    public getTheme(): 'light' | 'dark' {
        return this.currentTheme;
    }

    public init() {
        this.loadAccentColor();
        this.setupAccentColorSelector();
        this.initializeTheme();
    }

    public setTheme(theme: 'light' | 'dark', silent: boolean = false) {
        this.currentTheme = theme;
        // Keep host in sync
        (this.host as any).currentTheme = theme;

        const body = document.body;
        body.classList.remove('light-theme', 'dark-theme');
        body.classList.add(`${theme}-theme`);

        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem(this.host.getStorageKey('theme'), theme);

        this.host.updateSegmentedUI('theme-segmented', theme);

        // Update theme toggle icons
        const themeIcon = document.getElementById('theme-icon-lucide');
        const themeText = document.getElementById('theme-text');
        const mobileThemeIcon = document.getElementById('mobile-theme-icon');
        const mobileThemeText = document.getElementById('mobile-theme-text');

        if (themeIcon) themeIcon.className = theme === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
        if (themeText) themeText.textContent = theme === 'dark' ? 'Light Mode' : 'Dark Mode';
        if (mobileThemeIcon) mobileThemeIcon.className = theme === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
        if (mobileThemeText) mobileThemeText.textContent = theme === 'dark' ? 'Light Mode' : 'Dark Mode';

        if (!silent) this.host.pushWebSettings();

        // Sync Android status bar color
        import('@capacitor/status-bar').then(({ StatusBar, Style }) => {
            StatusBar.setStyle({ style: theme === 'dark' ? Style.Dark : Style.Light }).catch(() => {});
        }).catch(() => {});
    }

    public setAccentColor(accentColor: string, silent: boolean = false) {
        const root = document.documentElement;
        const accentHues: Record<string, number> = {
            'royal-purple': 258,
            'electric-blue': 200,
            'emerald-green': 145,
            'solar-orange': 15,
            'rose-quartz': 330,
            'peach-blossom': 20,
            'lavender-dream': 270,
            'mint-fresh': 160,
            'sky-blue': 190,
            'coral-sunset': 10,
            'amethyst-glow': 280,
            'lemon-zest': 45,
            'ocean-teal': 175,
            'bubblegum': 320,
            'sage-serene': 150,
            'golden-hour': 35,
            'orchid-mystic': 300,
            'turquoise-dream': 180
        };

        const hue = accentHues[accentColor];
        if (hue !== undefined) {
            root.style.setProperty('--dynamic-accent-hue', hue.toString());
            root.style.setProperty('--accent-primary', `hsl(${hue}, var(--s), 65%)`);
            root.style.setProperty('--accent-hover', `hsl(${hue}, var(--s), 75%)`);
            root.style.setProperty('--accent-soft', `hsla(${hue}, var(--s), 65%, 0.15)`);
            localStorage.setItem(this.host.getStorageKey('accent_color'), accentColor);
            if (!silent) this.host.pushWebSettings();
        }
    }

    public loadAccentColor() {
        const savedAccent = localStorage.getItem(this.host.getStorageKey('accent_color')) || 'royal-purple';
        this.setAccentColor(savedAccent, true);

        document.querySelectorAll('.accent-item').forEach(item => {
            item.classList.toggle('active', item.getAttribute('data-accent') === savedAccent);
        });

        this.updateCurrentAccentDisplay();
    }

    public setupAccentColorSelector() {
        const toggle = document.getElementById('accent-color-toggle');
        const dropdown = document.getElementById('accent-dropdown');
        const currentAccent = document.getElementById('current-accent');
        const accentLabel = document.querySelector('.accent-label');

        if (!toggle || !dropdown) return;

        // Remove stale listeners
        if (this.handleToggleClick) toggle.removeEventListener('click', this.handleToggleClick);
        if (this.handleDocumentClick) document.removeEventListener('click', this.handleDocumentClick);

        const closeDropdown = () => {
            dropdown.classList.remove('show');
            toggle.classList.remove('active');
            toggle.parentElement?.classList.remove('open');
            dropdown.style.position = '';
            dropdown.style.top = '';
            dropdown.style.left = '';
            dropdown.style.width = '';
            dropdown.style.right = '';
        };

        this.handleToggleClick = (e: Event) => {
            e.preventDefault();
            e.stopPropagation();

            if (dropdown.classList.contains('show')) {
                closeDropdown();
            } else {
                const rect = (toggle as HTMLElement).getBoundingClientRect();
                const dropdownWidth = 264;
                const viewportWidth = window.innerWidth;
                let left = rect.left + rect.width / 2 - dropdownWidth / 2;
                left = Math.max(8, Math.min(left, viewportWidth - dropdownWidth - 8));

                dropdown.style.position = 'fixed';
                dropdown.style.top = `${rect.bottom + 8}px`;
                dropdown.style.left = `${left}px`;
                dropdown.style.width = `${dropdownWidth}px`;
                dropdown.style.right = 'auto';
                dropdown.classList.add('show');
                toggle.classList.add('active');
                toggle.parentElement?.classList.add('open');
            }
        };

        this.handleDocumentClick = (e: Event) => {
            if (!toggle.contains(e.target as Node) && !dropdown.contains(e.target as Node)) {
                closeDropdown();
            }
        };

        toggle.addEventListener('click', this.handleToggleClick);
        document.addEventListener('click', this.handleDocumentClick);

        // Close on scroll (fixed dropdown would drift)
        document.querySelector('.settings-container')?.addEventListener('scroll', () => {
            if (dropdown.classList.contains('show')) closeDropdown();
        }, { passive: true });

        // Color selection
        document.querySelectorAll('.accent-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();

                const accent = item.getAttribute('data-accent');
                if (!accent) return;

                this.setAccentColor(accent);
                this.host.showToast('Color updated!', 'success');

                document.querySelectorAll('.accent-item').forEach(i => i.classList.remove('active'));
                item.classList.add('active');

                const color = (item as HTMLElement).style.background;
                if (currentAccent) (currentAccent as HTMLElement).style.background = color;
                if (accentLabel) accentLabel.textContent = this.getAccentDisplayName(accent);

                closeDropdown();
            });
        });

        this.updateCurrentAccentDisplay();
    }

    // ─── Private helpers ───────────────────────────────────────────────────────

    private initializeTheme() {
        const savedTheme = localStorage.getItem(this.host.getStorageKey('theme')) as 'light' | 'dark' | null;

        if (savedTheme === 'light' || savedTheme === 'dark') {
            // Always silent on startup — no push, just apply
            this.setTheme(savedTheme, true);
            // Mark as manually set so system changes don't override
            localStorage.setItem(this.host.getStorageKey('theme_manual_override'), 'true');
        } else {
            const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
            this.setTheme(systemTheme, true);
            localStorage.setItem(this.host.getStorageKey('theme'), systemTheme);
        }

        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
            if (!localStorage.getItem(this.host.getStorageKey('theme_manual_override'))) {
                const newTheme = e.matches ? 'dark' : 'light';
                this.setTheme(newTheme, true);
                localStorage.setItem(this.host.getStorageKey('theme'), newTheme);
            }
        });

        this.setupThemeSwitcher();
    }

    private setupThemeSwitcher() {
        document.querySelectorAll('#theme-segmented .segment').forEach(segment => {
            segment.addEventListener('click', () => {
                const theme = segment.getAttribute('data-val');
                if (theme === 'light' || theme === 'dark') {
                    this.setTheme(theme);
                    localStorage.setItem(this.host.getStorageKey('theme'), theme);
                    localStorage.setItem(this.host.getStorageKey('theme_manual_override'), 'true');
                    this.host.updateLastActivity('Changed theme');
                    this.host.showToast(`Switched to ${theme} mode`, 'success');
                }
            });
        });
    }

    private updateCurrentAccentDisplay() {
        const currentAccent = document.getElementById('current-accent');
        const accentLabel = document.querySelector('.accent-label');
        const savedAccent = localStorage.getItem(this.host.getStorageKey('accent_color')) || 'royal-purple';

        const activeItem = document.querySelector(`.accent-item[data-accent="${savedAccent}"]`);
        if (activeItem) {
            const color = activeItem.getAttribute('style')?.match(/background:\s*(hsl\([^)]+\))/)?.[1];
            if (color && currentAccent) (currentAccent as HTMLElement).style.background = color;
            if (accentLabel) accentLabel.textContent = this.getAccentDisplayName(savedAccent);
        }
    }

    private getAccentDisplayName(accent: string): string {
        const names: Record<string, string> = {
            'royal-purple': 'Royal Purple',
            'electric-blue': 'Electric Blue',
            'emerald-green': 'Emerald Green',
            'solar-orange': 'Solar Orange',
            'rose-quartz': 'Rose Quartz',
            'peach-blossom': 'Peach Blossom',
            'lavender-dream': 'Lavender Dream',
            'bubblegum': 'Bubblegum',
            'sky-blue': 'Sky Blue',
            'coral-sunset': 'Coral Sunset',
            'lemon-zest': 'Lemon Zest',
            'ocean-teal': 'Ocean Teal',
            'amethyst-glow': 'Amethyst Glow',
            'sage-serene': 'Sage Serene',
            'golden-hour': 'Golden Hour',
            'orchid-mystic': 'Orchid Mystic',
            'mint-fresh': 'Mint Fresh',
            'turquoise-dream': 'Turquoise Dream'
        };
        return names[accent] || accent;
    }
}
