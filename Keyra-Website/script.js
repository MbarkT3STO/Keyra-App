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

    // Smooth reveal animations on scroll
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    // Apply animation tracking to cards
    const elementsToReveal = document.querySelectorAll('.feature-card, .download-card');
    
    elementsToReveal.forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(20px)';
        el.style.transition = 'all 0.6s cubic-bezier(0.4, 0, 0.2, 1)';
        observer.observe(el);
    });

    // --- Mock UI Interactivity ---
    
    // Elements
    const mockVaultTab = document.querySelectorAll('.mock-nav-tab')[0];
    const mockSettingsTab = document.querySelectorAll('.mock-nav-tab')[1];
    const mockVaultView = document.getElementById('mock-vault-view');
    const mockSettingsView = document.getElementById('mock-settings-view');
    const mockAddAccountBtn = document.getElementById('mock-add-account-btn');
    const mockModal = document.getElementById('mock-modal');
    const mockModalCancel = document.getElementById('mock-modal-cancel');
    const mockUserBtn = document.querySelector('.mock-user-button');
    const mockUserDropdown = document.getElementById('mock-user-dropdown');
    const mockSwitches = document.querySelectorAll('.mock-switch');

    // 1. Tab Switching
    if (mockVaultTab && mockSettingsTab && mockVaultView && mockSettingsView) {
        mockVaultTab.addEventListener('click', () => {
            mockVaultTab.classList.add('active', 'nm-convex');
            mockSettingsTab.classList.remove('active', 'nm-convex');
            mockVaultView.style.display = 'block';
            mockSettingsView.style.display = 'none';
        });

        mockSettingsTab.addEventListener('click', () => {
            mockSettingsTab.classList.add('active', 'nm-convex');
            mockVaultTab.classList.remove('active', 'nm-convex');
            mockVaultView.style.display = 'none';
            mockSettingsView.style.display = 'block';
        });
    }

    // 2. Modal Toggling
    if (mockAddAccountBtn && mockModal && mockModalCancel) {
        mockAddAccountBtn.addEventListener('click', () => {
            mockModal.classList.add('show');
        });

        mockModalCancel.addEventListener('click', () => {
            mockModal.classList.remove('show');
        });

        // Close modal on click outside
        mockModal.addEventListener('click', (e) => {
            if (e.target === mockModal) {
                mockModal.classList.remove('show');
            }
        });
    }

    // 3. Dropdown Toggling
    if (mockUserBtn && mockUserDropdown) {
        mockUserBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            mockUserDropdown.classList.toggle('show');
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (mockUserDropdown.classList.contains('show') && !mockUserBtn.contains(e.target) && !mockUserDropdown.contains(e.target)) {
                mockUserDropdown.classList.remove('show');
            }
        });
    }

    // 4. Switch Toggling
    mockSwitches.forEach(sw => {
        sw.addEventListener('click', () => {
            sw.classList.toggle('active');
        });
    });

    // --- Dynamic GitHub Stats ---
    const fetchGitHubStats = async () => {
        const starsEl = document.getElementById('github-stars');
        const forksEl = document.getElementById('github-forks');
        const watchersEl = document.getElementById('github-watchers');

        const formatNumber = (num) => {
            if (num >= 1000) {
                return (num / 1000).toFixed(1) + 'k';
            }
            return num.toString();
        };

        try {
            const response = await fetch('https://api.github.com/repos/MbarkT3STO/Keyra-App');
            if (!response.ok) throw new Error('Failed to fetch stats');
            
            const data = await response.json();
            
            if (starsEl) starsEl.textContent = formatNumber(data.stargazers_count);
            if (forksEl) forksEl.textContent = formatNumber(data.forks_count);
            if (watchersEl) watchersEl.textContent = formatNumber(data.subscribers_count);
        } catch (error) {
            console.error('GitHub Stats Error:', error);
            // Fallback to placeholders if API fails
            if (starsEl) starsEl.textContent = '1.2k';
            if (forksEl) forksEl.textContent = '156';
            if (watchersEl) watchersEl.textContent = '89';
        }
    };

    fetchGitHubStats();
});
