export class ThemeManager {
    public currentTheme: 'light' | 'dark' = 'light';
    public oledMode: boolean = false;
    public performanceMode: boolean = false;

    private userId: string;
    private onSettingsChange: () => void;

    constructor(userId: string, onSettingsChange: () => void) {
        this.userId = userId;
        this.onSettingsChange = onSettingsChange;
    }

    private getStorageKey(key: string): string {
        return `${this.userId}_${key}`;
    }

    public init() {
        this.initOledMode();
        this.initPerformanceMode();
        this.initTheme();
    }

    private initTheme() {
        const savedTheme = localStorage.getItem(this.getStorageKey('theme')) || 'auto';
        this.setTheme(savedTheme, true);

        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
            const currentSetting = localStorage.getItem(this.getStorageKey('theme')) || 'auto';
            if (currentSetting === 'auto') {
                this.setTheme('auto', true);
            }
        });
    }

    private initOledMode() {
        this.oledMode = localStorage.getItem(this.getStorageKey('oled_mode')) === 'true';
        const toggle = document.getElementById('oled-mode-toggle') as HTMLInputElement;
        if (toggle) toggle.checked = this.oledMode;
        document.body.classList.toggle('oled-optimized', this.oledMode && this.currentTheme === 'dark');
    }

    private initPerformanceMode() {
        this.performanceMode = localStorage.getItem(this.getStorageKey('performance_mode')) === 'true';
        const toggle = document.getElementById('performance-mode-toggle') as HTMLInputElement;
        if (toggle) toggle.checked = this.performanceMode;
        document.body.classList.toggle('performance-mode', this.performanceMode);

        if (this.performanceMode) {
            document.documentElement.style.setProperty('--transition-fast', '0s');
            document.documentElement.style.setProperty('--transition-medium', '0s');
        }
    }

    public setTheme(theme: string, silent: boolean = false) {
        let themeToApply = theme;
        if (theme === 'auto') {
            themeToApply = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        }

        this.currentTheme = themeToApply as 'light' | 'dark';
        localStorage.setItem(this.getStorageKey('theme'), theme);
        localStorage.setItem('keyra_theme', theme);

        document.documentElement.setAttribute('data-theme', themeToApply);
        document.body.classList.remove('light-theme', 'dark-theme');
        document.body.classList.add(themeToApply + '-theme');

        document.body.classList.toggle('oled-optimized', this.oledMode && themeToApply === 'dark');

        this.updateSegmentedUI('theme-segmented', theme);

        const themeIcon = document.getElementById('theme-icon-fa');
        const themeText = document.getElementById('theme-text');
        if (themeIcon) {
            themeIcon.className = themeToApply === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
        }
        if (themeText) themeText.textContent = themeToApply === 'dark' ? 'Light Mode' : 'Dark Mode';

        if (!silent) this.onSettingsChange();
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
        if (hue) {
            root.style.setProperty('--h', hue.toString());
            root.style.setProperty('--dynamic-accent-hue', hue.toString());

            if (this.currentTheme === 'dark' && this.oledMode) {
                root.style.setProperty('--accent-primary', `hsl(${hue}, 100%, 75%)`);
            } else {
                root.style.setProperty('--accent-primary', `hsl(${hue}, 100%, 68%)`);
            }

            root.style.setProperty('--accent-secondary', `hsl(${hue + 20}, 100%, 75%)`);
            root.style.setProperty('--accent-hover', `hsl(${hue}, 100%, 62%)`);
            root.style.setProperty('--accent-soft', `hsla(${hue}, 100%, 68%, 0.12)`);

            root.style.setProperty('--aura-1', `hsla(${hue}, 100%, 68%, 0.38)`);
            root.style.setProperty('--aura-2', `hsla(${hue + 30}, 100%, 75%, 0.22)`);
            root.style.setProperty('--aura-3', `hsla(${hue - 30}, 100%, 75%, 0.18)`);

            root.style.setProperty('--bg-hue-a', hue.toString());
            root.style.setProperty('--bg-hue-b', (hue + 30).toString());

            localStorage.setItem(this.getStorageKey('accent_color'), accentColor);

            document.querySelectorAll('.accent-color-option').forEach(option => {
                option.classList.toggle('active', option.getAttribute('data-accent') === accentColor);
            });

            if (!silent) this.onSettingsChange();
        }
    }

    public setupAccentColorSelector(
        onAccentChange: (accent: string) => void
    ) {
        document.querySelectorAll('.accent-color-option').forEach(option => {
            option.addEventListener('click', () => {
                const accent = option.getAttribute('data-accent');
                if (accent) onAccentChange(accent);
            });
        });
    }

    public setupEventListeners(
        onThemeChange: (theme: string) => void,
        onOledChange: (enabled: boolean) => void,
        onPerformanceChange: (enabled: boolean) => void
    ) {
        // Quick-toggle button in navbar
        document.getElementById('theme-toggle-btn')?.addEventListener('click', () => {
            const nextTheme = this.currentTheme === 'light' ? 'dark' : 'light';
            onThemeChange(nextTheme);
        });

        // Segmented theme selector
        document.querySelectorAll('#theme-segmented .segment').forEach(seg => {
            seg.addEventListener('click', (e) => {
                const val = (e.currentTarget as HTMLElement).getAttribute('data-val')!;
                onThemeChange(val);
            });
        });

        // OLED Mode
        document.getElementById('oled-mode-toggle')?.addEventListener('change', (e) => {
            onOledChange((e.target as HTMLInputElement).checked);
        });

        // Performance Mode
        document.getElementById('performance-mode-toggle')?.addEventListener('change', (e) => {
            onPerformanceChange((e.target as HTMLInputElement).checked);
        });
    }

    public applyOledMode(enabled: boolean) {
        this.oledMode = enabled;
        localStorage.setItem(this.getStorageKey('oled_mode'), String(enabled));
        document.body.classList.toggle('oled-optimized', enabled && this.currentTheme === 'dark');
    }

    public applyPerformanceMode(enabled: boolean) {
        this.performanceMode = enabled;
        localStorage.setItem(this.getStorageKey('performance_mode'), String(enabled));
        document.body.classList.toggle('performance-mode', enabled);

        const root = document.documentElement;
        if (enabled) {
            root.style.setProperty('--transition-fast', '0s');
            root.style.setProperty('--transition-medium', '0s');
        } else {
            root.style.removeProperty('--transition-fast');
            root.style.removeProperty('--transition-medium');
        }
    }

    private updateSegmentedUI(containerId: string, value: string) {
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
}
