// script.js

document.addEventListener('DOMContentLoaded', () => {
    // Elements
    const themeToggleBtn = document.getElementById('themeToggle');
    const darkIcon = document.querySelector('.dark-icon');
    const lightIcon = document.querySelector('.light-icon');
    
    // Theme Management
    const initTheme = () => {
        // Check local storage
        const savedTheme = localStorage.getItem('keyra-theme');
        
        if (savedTheme) {
            setTheme(savedTheme);
        } else {
            // Check OS preference
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            setTheme(prefersDark ? 'dark' : 'light');
        }
    };
    
    const setTheme = (theme) => {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('keyra-theme', theme);
        
        // Update toggle button icons
        if (theme === 'dark') {
            darkIcon.classList.add('hidden');
            lightIcon.classList.remove('hidden');
        } else {
            lightIcon.classList.add('hidden');
            darkIcon.classList.remove('hidden');
        }
    };
    
    // Toggle Event Listener
    themeToggleBtn.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        setTheme(currentTheme === 'dark' ? 'light' : 'dark');
    });
    
    // Listen for OS theme changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        if (!localStorage.getItem('keyra-theme')) {
            setTheme(e.matches ? 'dark' : 'light');
        }
    });
    
    // Initialize
    initTheme();


    // ─── Scroll Reveal ──────────────────────────────────────────────────────
    const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('revealed');
                revealObserver.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

    document.querySelectorAll('.reveal, .reveal-stagger').forEach(el => revealObserver.observe(el));

    // ─── Hero Live Mockup ────────────────────────────────────────────────────
    const HERO_OFFSETS = [0, 9, 18];
    const HERO_CIRC    = 2 * Math.PI * 14;

    const tickHero = () => {
        HERO_OFFSETS.forEach((offset, i) => {
            const idx  = i + 1;
            const pct  = ((30 - ((Date.now() / 1000 + offset) % 30)) / 30);
            const slot = Math.floor((Date.now() / 1000 + offset) / 30);
            const code = String(Math.abs((slot * 1234567 + offset * 9871) % 1000000)).padStart(6, '0');
            const fmt  = code.slice(0, 3) + ' ' + code.slice(3);
            const color = pct < 0.2 ? '#ff3b30' : 'var(--accent-primary)';

            const codeEl = document.getElementById(`hero-code-${idx}`);
            const ringEl = document.getElementById(`hero-ring-${idx}`);

            if (codeEl && codeEl.textContent !== fmt) codeEl.textContent = fmt;
            if (ringEl) {
                ringEl.style.strokeDasharray  = HERO_CIRC;
                ringEl.style.strokeDashoffset = HERO_CIRC * (1 - pct);
                ringEl.style.stroke = color;
            }
        });
    };

    tickHero();
    setInterval(tickHero, 500);


    // ─── Desktop App Simulation ───────────────────────────────────────────────

    const MOCK_ACCOUNTS = [
        { icon: 'fa-brands fa-aws',      service: 'Amazon Web Services', identity: 'admin@keyra.app',   offset: 0   },
        { icon: 'fa-brands fa-discord',  service: 'Discord',             identity: 'MBVRK#1234',        offset: 7   },
        { icon: 'fa-brands fa-github',   service: 'GitHub',              identity: 'mbvrk-dev',         offset: 14  },
        { icon: 'fa-brands fa-google',   service: 'Google',              identity: 'mbvrk@gmail.com',   offset: 21  },
        { icon: 'fa-brands fa-twitter',  service: 'X / Twitter',         identity: '@mbarkt3sto',       offset: 3   },
        { icon: 'fa-solid fa-cloud',     service: 'Cloudflare',          identity: 'admin@keyra.app',   offset: 18  },
    ];

    const PERIOD = 30; // seconds
    let viewMode = 'compact'; // compact | unified | secure
    let secureTarget = null;

    const fmtOTP = (n) => {
        const s = String(n).padStart(6, '0');
        return s.slice(0, 3) + ' ' + s.slice(3);
    };

    const genOTP = (offset) => {
        // Deterministic fake OTP based on time + offset so it refreshes every 30s
        const slot = Math.floor((Date.now() / 1000 + offset) / PERIOD);
        const seed = (slot * 1234567 + offset * 9871) % 1000000;
        return fmtOTP(Math.abs(seed));
    };

    const getProgress = (offset) => {
        const elapsed = (Date.now() / 1000 + offset) % PERIOD;
        return ((PERIOD - elapsed) / PERIOD) * 100;
    };

    const timerColor = (pct) => pct < 20 ? '#ff3b30' : 'var(--accent-primary)';

    // Build cards
    const grid = document.getElementById('mock-accounts-grid');

    const buildCards = () => {
        grid.innerHTML = '';
        MOCK_ACCOUNTS.forEach((acc, i) => {
            const pct = getProgress(acc.offset);
            const code = genOTP(acc.offset);
            const card = document.createElement('div');
            card.className = 'mock-account-card nm-flat';
            card.dataset.index = i;
            card.innerHTML = `
                <div class="mock-account-header">
                    <div class="mock-account-icon nm-inset">
                        <i class="${acc.icon} text-gradient"></i>
                    </div>
                    <div class="mock-account-info">
                        <div class="mock-service-name">${acc.service}</div>
                        <div class="mock-account-identity">${acc.identity}</div>
                    </div>
                </div>
                <div class="mock-otp-hero">
                    <div class="mock-otp-code" data-idx="${i}">${code}</div>
                    <div class="mock-card-timer-track">
                        <div class="mock-card-timer-fill" data-idx="${i}" style="width:${pct}%;background:${timerColor(pct)};"></div>
                    </div>
                    <div class="mock-secure-hint">Tap to reveal</div>
                </div>
                <button class="mock-card-more nm-flat"><i class="fa-solid fa-ellipsis"></i></button>
            `;
            // Secure mode: tap to open secure modal
            card.addEventListener('click', () => {
                if (viewMode === 'secure') openSecureModal(i);
            });
            grid.appendChild(card);
        });
    };

    buildCards();

    // Live timer tick
    const tickTimers = () => {
        MOCK_ACCOUNTS.forEach((acc, i) => {
            const pct = getProgress(acc.offset);
            const newCode = genOTP(acc.offset);

            const fillEl = grid.querySelector(`.mock-card-timer-fill[data-idx="${i}"]`);
            const codeEl = grid.querySelector(`.mock-otp-code[data-idx="${i}"]`);

            if (fillEl) {
                fillEl.style.width = pct + '%';
                fillEl.style.background = timerColor(pct);
            }

            if (codeEl && codeEl.textContent !== newCode) {
                codeEl.classList.add('refreshing');
                setTimeout(() => {
                    codeEl.textContent = newCode;
                    codeEl.classList.remove('refreshing');
                }, 300);
            }
        });

        // Global bar
        const globalFill = document.getElementById('mock-global-fill');
        if (globalFill) {
            const pct = getProgress(0);
            globalFill.style.width = pct + '%';
            globalFill.style.background = timerColor(pct);
        }

        // Secure modal circular timer
        if (secureTarget !== null) {
            const acc = MOCK_ACCOUNTS[secureTarget];
            const pct = getProgress(acc.offset);
            const remaining = Math.ceil((pct / 100) * PERIOD);
            const circumference = 2 * Math.PI * 34;
            const offset = circumference * (1 - pct / 100);

            const circle = document.getElementById('mock-circle-progress');
            const count  = document.getElementById('mock-circular-count');
            const secCode = document.getElementById('mock-secure-code');

            if (circle) {
                circle.style.strokeDasharray = circumference;
                circle.style.strokeDashoffset = offset;
                circle.style.stroke = timerColor(pct);
            }
            if (count) count.textContent = remaining;
            if (secCode) secCode.textContent = genOTP(acc.offset);
        }
    };

    setInterval(tickTimers, 500);

    // ── View Mode Toggle ──
    const viewToggle = document.getElementById('mock-view-toggle');
    const globalTimer = document.getElementById('mock-global-timer');

    if (viewToggle) {
        viewToggle.querySelectorAll('.mock-segment').forEach(btn => {
            btn.addEventListener('click', () => {
                viewToggle.querySelectorAll('.mock-segment').forEach(b => {
                    b.classList.remove('active', 'nm-flat');
                });
                btn.classList.add('active', 'nm-flat');
                viewMode = btn.dataset.mode;

                // Apply mode to grid
                grid.classList.remove('unified-mode');
                grid.querySelectorAll('.mock-account-card').forEach(c => c.classList.remove('secure-mode'));

                if (viewMode === 'unified') {
                    grid.classList.add('unified-mode');
                    globalTimer.style.display = 'flex';
                } else {
                    globalTimer.style.display = 'none';
                }

                if (viewMode === 'secure') {
                    grid.querySelectorAll('.mock-account-card').forEach(c => c.classList.add('secure-mode'));
                }
            });
        });
    }

    // ── Tab Switching ──
    const tabVault    = document.getElementById('mock-tab-vault');
    const tabSettings = document.getElementById('mock-tab-settings');
    const vaultView   = document.getElementById('mock-vault-view');
    const settingsView = document.getElementById('mock-settings-view');

    const switchTab = (active, inactive, show, hide) => {
        active.classList.add('active', 'nm-flat');
        inactive.classList.remove('active', 'nm-flat');
        show.style.display = 'block';
        hide.style.display = 'none';
    };

    if (tabVault && tabSettings) {
        tabVault.addEventListener('click', () => switchTab(tabVault, tabSettings, vaultView, settingsView));
        tabSettings.addEventListener('click', () => switchTab(tabSettings, tabVault, settingsView, vaultView));
    }

    // ── Add Account Modal ──
    const addBtn    = document.getElementById('mock-add-account-btn');
    const modal     = document.getElementById('mock-modal');
    const cancelBtn = document.getElementById('mock-modal-cancel');

    if (addBtn && modal) {
        addBtn.addEventListener('click', () => modal.classList.add('show'));
        cancelBtn.addEventListener('click', () => modal.classList.remove('show'));
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('show'); });
    }

    // ── User Dropdown ──
    const userBtn      = document.getElementById('mock-user-btn');
    const userDropdown = document.getElementById('mock-user-dropdown');

    if (userBtn && userDropdown) {
        userBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            userDropdown.classList.toggle('show');
        });
        document.addEventListener('click', (e) => {
            if (!userBtn.contains(e.target) && !userDropdown.contains(e.target)) {
                userDropdown.classList.remove('show');
            }
        });
    }

    // ── Settings Toggles ──
    document.querySelectorAll('.mock-toggle').forEach(toggle => {
        toggle.addEventListener('click', () => toggle.classList.toggle('active'));
    });

    // ── Secure Modal ──
    const secureModal   = document.getElementById('mock-secure-modal');
    const secureClose   = document.getElementById('mock-secure-close');
    const secureIconEl  = document.getElementById('mock-secure-icon');
    const secureNameEl  = document.getElementById('mock-secure-name');
    const secureAccEl   = document.getElementById('mock-secure-account');
    const secureCodeEl  = document.getElementById('mock-secure-code');
    const circleEl      = document.getElementById('mock-circle-progress');
    const circumference = 2 * Math.PI * 34;

    const openSecureModal = (idx) => {
        const acc = MOCK_ACCOUNTS[idx];
        secureTarget = idx;
        secureIconEl.innerHTML = `<i class="${acc.icon} text-gradient"></i>`;
        secureNameEl.textContent = acc.service;
        secureAccEl.textContent  = acc.identity;
        secureCodeEl.textContent = genOTP(acc.offset);
        if (circleEl) {
            circleEl.style.strokeDasharray = circumference;
            circleEl.style.strokeDashoffset = 0;
        }
        secureModal.classList.add('show');
    };

    if (secureClose) {
        secureClose.addEventListener('click', () => {
            secureModal.classList.remove('show');
            secureTarget = null;
        });
        secureModal.addEventListener('click', (e) => {
            if (e.target === secureModal) {
                secureModal.classList.remove('show');
                secureTarget = null;
            }
        });
    }

    // Copy code on click in secure modal
    if (secureCodeEl) {
        secureCodeEl.addEventListener('click', () => {
            secureCodeEl.style.transform = 'scale(0.97)';
            setTimeout(() => secureCodeEl.style.transform = '', 150);
        });
    }
    // --- Download Dropdowns Logic ---
    const dropdownTriggers = document.querySelectorAll('.dropdown-trigger');
    const submenus = document.querySelectorAll('.download-submenu');

    const closeAllDropdowns = () => {
        dropdownTriggers.forEach(trigger => trigger.classList.remove('active'));
        submenus.forEach(menu => menu.classList.remove('show'));
    };

    dropdownTriggers.forEach(trigger => {
        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            const dropdownId = trigger.getAttribute('data-dropdown');
            const targetMenu = document.getElementById(`${dropdownId}-dropdown`);
            
            const isClosing = trigger.classList.contains('active');
            
            closeAllDropdowns();
            
            if (!isClosing) {
                trigger.classList.add('active');
                if (targetMenu) targetMenu.classList.add('show');
            }
        });
    });

    // Close on click outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.download-dropdown-vessel')) {
            closeAllDropdowns();
        }
    });

    // --- Dynamic GitHub Stats ---
    const fetchGitHubStats = async () => {
        const starsEl    = document.getElementById('github-stars');
        const forksEl    = document.getElementById('github-forks');
        const watchersEl = document.getElementById('github-watchers');

        const fmt = (n) => n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n);

        const applyStats = (data) => {
            if (starsEl)    starsEl.textContent    = fmt(data.stargazers_count  || 0);
            if (forksEl)    forksEl.textContent    = fmt(data.forks_count       || 0);
            if (watchersEl) watchersEl.textContent = fmt(data.subscribers_count || 0);
        };

        try {
            const res = await fetch('https://api.github.com/repos/MbarkT3STO/Keyra-App', {
                headers: { 'Accept': 'application/vnd.github.v3+json' }
            });
            if (!res.ok) throw new Error(`GitHub API ${res.status}`);
            applyStats(await res.json());
        } catch (err) {
            console.warn('GitHub Stats:', err.message);
            if (starsEl)    starsEl.textContent    = '1';
            if (forksEl)    forksEl.textContent    = '0';
            if (watchersEl) watchersEl.textContent = '1';
        }
    };

    fetchGitHubStats();

    // --- OS Detection & Recommended Badge ---
    const detectOSAndHighlight = () => {
        const platform = window.navigator.platform.toLowerCase();
        let recommendedCardId = '';
        
        if (platform.includes('win')) {
            recommendedCardId = 'windows-download';
        } else if (platform.includes('mac')) {
            recommendedCardId = 'macos-download';
        } else if (platform.includes('linux')) {
            recommendedCardId = 'linux-download';
        }
        
        if (recommendedCardId) {
            const vessel = document.getElementById(recommendedCardId);
            const card = vessel.querySelector('.download-card');
            
            if (vessel && card) {
                // Add badge
                const badge = document.createElement('div');
                badge.className = 'recommended-badge';
                badge.textContent = 'Recommended';
                vessel.appendChild(badge);
                
                // Add a special class for extra prominence
                card.style.borderColor = 'rgba(var(--h), var(--s), 55%, 0.3)';
                card.style.borderWidth = '1px';
                card.style.borderStyle = 'solid';
            }
        }
    };

    detectOSAndHighlight();
});
