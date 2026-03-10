import { accounts, syncVault } from './store.js';

// ─── Service Icon Mapping ──────────────────────────────────────
const SERVICE_ICONS: Record<string, string> = {
    'github': 'github',
    'google': 'chrome',
    'discord': 'message-square',
    'microsoft': 'layout',
    'aws': 'cloud',
    'binance': 'wallet',
    'facebook': 'facebook',
    'twitter': 'twitter',
    'instagram': 'instagram',
    'linkedin': 'linkedin',
    'twitch': 'twitch',
    'dropbox': 'box',
    'digitalocean': 'droplet'
};

function getServiceIcon(issuer: string): string {
    const key = issuer.toLowerCase();
    for (const [s, icon] of Object.entries(SERVICE_ICONS)) {
        if (key.includes(s)) return icon;
    }
    return 'shield-check';
}

// ─── Modal Management ──────────────────────────────────────────
export function showModal(m: HTMLElement) {
    m.classList.remove('hidden');
    m.classList.add('show');
}

export function hideModal(m: HTMLElement) {
    m.classList.remove('show');
    m.classList.add('hidden');
}

// ─── Toast Engine ──────────────────────────────────────────────
export function showToast(msg: string, err = false) {
    const box = document.getElementById('toasts');
    if (!box) return;
    const t = document.createElement('div');
    t.className = `toast ${err ? 'err' : 'ok'}`;
    t.style.cssText = `
        background: ${err ? '#ff4757' : 'var(--v-3)'};
        color: #fff; padding: 16px 24px; border-radius: 18px;
        margin-bottom: 12px; font-weight: 700; font-size: 0.95rem;
        box-shadow: 0 10px 30px rgba(0,0,0,0.3);
        border: 1px solid rgba(255,255,255,0.1);
        display: flex; align-items: center; gap: 12px;
        transform: translateX(50px); opacity: 0; transition: 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        z-index: 1000000;
    `;
    const icon = err ? 'alert-triangle' : 'check-circle';
    t.innerHTML = `<i data-lucide="${icon}"></i><span>${msg}</span>`;
    box.appendChild(t);
    if (typeof (window as any).lucide !== 'undefined') (window as any).lucide.createIcons();

    requestAnimationFrame(() => {
        t.style.transform = 'translateX(0)';
        t.style.opacity = '1';
    });

    setTimeout(() => {
        t.style.transform = 'translateX(50px)';
        t.style.opacity = '0';
        t.addEventListener('transitionend', () => t.remove(), { once: true });
    }, 3000);
}

// ─── View Management ───────────────────────────────────────────
function switchView(viewId: string) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));

    document.getElementById(`view-${viewId}`)?.classList.add('active');
    document.querySelector(`[data-view="${viewId}"]`)?.classList.add('active');

    const fab = document.getElementById('btn-add');
    if (fab) fab.style.display = (viewId === 'vault') ? 'flex' : 'none';
}

// ─── Lock System ───────────────────────────────────────────────
export function lockVault() {
    const lock = document.getElementById('lock-screen');
    if (lock) showModal(lock);
}

export function unlockVault() {
    const lock = document.getElementById('lock-screen');
    if (lock) hideModal(lock);
    renderAccounts(); // Force render to ensure accounts show up after initial startup unlock
}

// ─── Hide Codes Setup ──────────────────────────────────────────
export function initHideCodes() {
    const hcToggle = document.getElementById('setting-hide') as HTMLInputElement;
    if (hcToggle) {
        hcToggle.checked = localStorage.getItem('hide_codes') === 'true';
        hcToggle.addEventListener('change', () => {
            localStorage.setItem('hide_codes', hcToggle.checked.toString());
            renderAccounts();
            showToast(hcToggle.checked ? 'Codes Hidden' : 'Codes Revealed');
        });
    }
}

// ─── Account Render ───────────────────────────────────────────
export async function renderAccounts(filter = '') {
    const list = document.getElementById('accounts-list');
    if (!list) return;

    const term = filter || (document.getElementById('search-input') as HTMLInputElement)?.value.toLowerCase() || '';
    const filtered = accounts.filter(a =>
        a.issuer.toLowerCase().includes(term) || (a.account || '').toLowerCase().includes(term)
    );

    if (filtered.length === 0) {
        list.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 100px 20px; color: var(--t4); width: 100%;">
                <i data-lucide="info" style="width: 48px; height: 48px; opacity: 0.2; margin-bottom: 20px;"></i>
                <h3 style="font-weight: 800; font-size: 1.5rem; color: var(--t1);">Empty Vault</h3>
                <p>No matches found in your secure bloom storage.</p>
            </div>`;
        if (typeof (window as any).lucide !== 'undefined') (window as any).lucide.createIcons();
        return;
    }

    const html = await Promise.all(filtered.map(async (a, i) => {
        let code = '000000';
        try { code = await window.api.generateTOTP(a.secret); } catch { }
        const fmt = code.slice(0, 3) + ' ' + code.slice(3);
        const iconName = getServiceIcon(a.issuer);

        return `
        <div class="card ${localStorage.getItem('hide_codes') === 'true' ? 'hidden-codes-active' : ''}" data-id="${a.id}" data-code="${code}" style="animation: app-entry 0.6s cubic-bezier(0.16, 1, 0.3, 1) ${i * 0.05}s forwards; opacity: 0;">
            <div class="card-header">
                <div class="service-grp">
                    <div class="avatar"><i data-lucide="${iconName}"></i></div>
                    <div class="meta">
                        <div class="issuer">${a.issuer}</div>
                        <div class="identity">${a.account || 'Secured'}</div>
                    </div>
                </div>
                <div style="display: flex; gap: 8px;">
                    <div class="btn-icon-m btn-edit-card" data-id="${a.id}"><i data-lucide="edit-3"></i></div>
                    <div class="btn-icon-m danger btn-del-card" data-id="${a.id}"><i data-lucide="trash-2"></i></div>
                </div>
            </div>
            <div class="otp-box">
                <div class="otp-val" data-raw="${fmt}">
                    ${localStorage.getItem('hide_codes') === 'true' ? '••• •••' : fmt}
                </div>
                ${localStorage.getItem('hide_codes') === 'true' ? '<i data-lucide="eye" class="btn-reveal-code" style="color: var(--t4); cursor: pointer; margin-left: auto;"></i>' : ''}
            </div>
            <div class="card-foot">
                <div class="progress-wrap"><div class="progress-bar" style="width:100%"></div></div>
                <div class="timer-circle">
                    <svg class="timer-svg" viewBox="0 0 32 32">
                        <circle cx="16" cy="16" r="14" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="4" />
                        <circle class="timer-fill" cx="16" cy="16" r="14" stroke-dasharray="88" stroke-dashoffset="0"/>
                    </svg>
                </div>
            </div>
        </div>`;
    }));

    list.innerHTML = html.join('');
    if (typeof (window as any).lucide !== 'undefined') (window as any).lucide.createIcons();
    attachCardListeners();
}

// ─── Interactions ──────────────────────────────────────────────
function attachCardListeners() {
    document.querySelectorAll('.card').forEach(card => {
        card.addEventListener('click', async (e) => {
            const target = e.target as HTMLElement;
            if (target.closest('.btn-icon-m')) return;

            // Handle Reveal Code
            if (target.closest('.btn-reveal-code')) {
                const valTarget = card.querySelector('.otp-val');
                if (valTarget) valTarget.textContent = valTarget.getAttribute('data-raw') || '000 000';
                return; // Prevent copy when just revealing
            }

            const code = ((card as HTMLElement).getAttribute('data-code') || '').replace(/\s/g, '');
            try {
                if (navigator.clipboard && document.hasFocus()) {
                    await navigator.clipboard.writeText(code);
                } else {
                    const el = document.createElement('textarea');
                    el.value = code;
                    document.body.appendChild(el);
                    el.select();
                    document.execCommand('copy');
                    document.body.removeChild(el);
                }
                showToast('OTP copied to clipboard');
            } catch (err) {
                showToast('Failed to copy', true);
            }
        });
    });

    document.querySelectorAll('.btn-del-card').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            pendingDeleteId = (btn as HTMLElement).getAttribute('data-id');
            const acc = accounts.find(a => a.id === pendingDeleteId);
            const label = document.getElementById('delete-account-label');
            if (label && acc) label.textContent = acc.issuer;
            showModal(document.getElementById('modal-delete')!);
        });
    });

    document.querySelectorAll('.btn-edit-card').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            editingAccountId = (btn as HTMLElement).getAttribute('data-id');
            const acc = accounts.find(a => a.id === editingAccountId);
            if (!acc) return;
            (document.getElementById('edit-issuer') as HTMLInputElement).value = acc.issuer;
            (document.getElementById('edit-account') as HTMLInputElement).value = acc.account || '';
            showModal(document.getElementById('modal-edit')!);
        });
    });
}

let pendingDeleteId: string | null = null;
let editingAccountId: string | null = null;

function toggleTheme() {
    const b = document.body;
    b.className = b.classList.contains('theme-dark') ? 'theme-light' : 'theme-dark';
    localStorage.setItem('theme', b.className);
    const ts = document.getElementById('setting-theme') as HTMLSelectElement;
    if (ts) ts.value = b.className;
}

// ─── PIN System Logic ─────────────────────────────────────────

function setupPinInput(inputId: string, dotsId: string, onSubmit: (pin: string) => void) {
    const input = document.getElementById(inputId) as HTMLInputElement;
    const dotsContainer = document.getElementById(dotsId);
    if (!input || !dotsContainer) return;

    const dots = dotsContainer.querySelectorAll('.pin-dot');

    input.addEventListener('input', () => {
        const val = input.value;
        dots.forEach((dot, idx) => {
            if (idx < val.length) dot.classList.add('filled');
            else dot.classList.remove('filled');
            dot.classList.remove('error');
        });

        if (val.length === 4) {
            onSubmit(val);
        }
    });

    dotsContainer.addEventListener('click', () => input.focus());
}

function clearPinDots(dotsId: string, hasError = false) {
    const dots = document.querySelectorAll(`#${dotsId} .pin-dot`);
    dots.forEach(dot => {
        dot.classList.remove('filled');
        if (hasError) dot.classList.add('error');
    });
}

// ─── Setup ────────────────────────────────────────────────────
export function setupUI() {
    const modalAdd = document.getElementById('modal-add');
    const modalDel = document.getElementById('modal-delete');
    const modalEdit = document.getElementById('modal-edit');

    // Tab Logic
    document.querySelectorAll('.tab-item').forEach(tab => {
        tab.addEventListener('click', () => {
            const view = (tab as HTMLElement).getAttribute('data-view');
            if (view) switchView(view);
        });
    });

    // Theme Logic
    document.getElementById('btn-theme')?.addEventListener('click', toggleTheme);
    const themeSelect = document.getElementById('setting-theme') as HTMLSelectElement;
    if (themeSelect) {
        themeSelect.value = document.body.className;
        themeSelect.addEventListener('change', () => {
            document.body.className = themeSelect.value;
            localStorage.setItem('theme', themeSelect.value);
        });
    }

    document.getElementById('btn-add')?.addEventListener('click', () => { if (modalAdd) showModal(modalAdd); });

    // Master PIN Setup Handlers
    const btnSetupPin = document.getElementById('btn-setup-pin');

    function updateSetupPinBtnState() {
        if (!btnSetupPin) return;
        btnSetupPin.textContent = localStorage.getItem('vault_pin') ? 'Change PIN' : 'Set PIN';
        btnSetupPin.style.background = localStorage.getItem('vault_pin') ? 'rgba(255, 255, 255, 0.1)' : '';
    }

    updateSetupPinBtnState();

    let isSettingMasterPin = false;

    btnSetupPin?.addEventListener('click', () => {
        isSettingMasterPin = true;
        showModal(document.getElementById('modal-set-pin')!);
        setTimeout(() => document.getElementById('setup-pin-input')?.focus(), 100);
    });

    // Auto-Lock Handlers
    const autolockSelect = document.getElementById('setting-autolock') as HTMLSelectElement;

    if (autolockSelect) {
        autolockSelect.value = localStorage.getItem('autolock') || '0';
        autolockSelect.addEventListener('change', () => {
            const val = autolockSelect.value;
            if (val !== '0' && !localStorage.getItem('vault_pin')) {
                // Require Master PIN setup first
                autolockSelect.value = localStorage.getItem('autolock') || '0'; // Revert visually
                showToast('Please Set Master App PIN first.', true);

                // Highlight the PIN setup button briefly
                btnSetupPin?.animate([
                    { transform: 'scale(1)' },
                    { transform: 'scale(1.05)', backgroundColor: 'var(--v-5)' },
                    { transform: 'scale(1)' }
                ], { duration: 300 });

            } else {
                localStorage.setItem('autolock', val);
                showToast(val === '0' ? 'Auto-Lock Disabled' : `Auto-Lock set to ${autolockSelect.options[autolockSelect.selectedIndex].text}`);
            }
        });
    }

    document.getElementById('btn-cancel-pin')?.addEventListener('click', () => {
        hideModal(document.getElementById('modal-set-pin')!);
        isSettingMasterPin = false;
    });

    setupPinInput('setup-pin-input', 'setup-pin-dots', (pin) => {
        localStorage.setItem('vault_pin', pin);
        hideModal(document.getElementById('modal-set-pin')!);
        (document.getElementById('setup-pin-input') as HTMLInputElement).value = '';
        clearPinDots('setup-pin-dots');
        updateSetupPinBtnState();
        showToast('Master PIN set successfully.');
        isSettingMasterPin = false;
    });

    setupPinInput('unlock-pin-input', 'unlock-pin-dots', (pin) => {
        const stored = localStorage.getItem('vault_pin');
        if (pin === stored) {
            unlockVault();
            (document.getElementById('unlock-pin-input') as HTMLInputElement).value = '';
            clearPinDots('unlock-pin-dots');
            const err = document.getElementById('unlock-error');
            if (err) err.style.opacity = '0';
            showToast('Vault Unlocked');
        } else {
            clearPinDots('unlock-pin-dots', true);
            (document.getElementById('unlock-pin-input') as HTMLInputElement).value = '';
            const err = document.getElementById('unlock-error');
            if (err) err.style.opacity = '1';
        }
    });

    document.getElementById('btn-export')?.addEventListener('click', () => {
        const data = JSON.stringify(accounts, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `keyra_vault_export_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        showToast('Vault exported successfully.');
    });

    document.getElementById('btn-purge-all')?.addEventListener('click', async () => {
        if (confirm('CRITICAL: Purge all accounts permanently?')) {
            for (const acc of accounts) await window.api.deleteAccount(acc.id);
            await syncVault(() => renderAccounts());
            showToast('Vault purged.', true);
        }
    });

    // Modal Overlays
    document.querySelectorAll('.overlay').forEach(o => {
        o.addEventListener('click', (e) => {
            if (e.target === o && o.id !== 'lock-screen' && o.id !== 'modal-set-pin') hideModal(o as HTMLElement);
        });
    });

    document.querySelectorAll('.btn-close-modal').forEach(btn => {
        btn.addEventListener('click', () => {
            const o = (btn as HTMLElement).closest('.overlay');
            if (o) hideModal(o as HTMLElement);
        });
    });

    // Form logic
    document.getElementById('form-add')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const issuer = (document.getElementById('add-issuer') as HTMLInputElement).value.trim();
        const account = (document.getElementById('add-account') as HTMLInputElement).value.trim();
        const secret = (document.getElementById('add-secret') as HTMLInputElement).value.trim().replace(/\s/g, '');
        try {
            await window.api.generateTOTP(secret);
            await window.api.saveAccount({ issuer, account, secret });
            await syncVault(() => renderAccounts());
            if (modalAdd) hideModal(modalAdd);
            (document.getElementById('form-add') as HTMLFormElement).reset();
            showToast('Account secured.');
        } catch { showToast('Invalid Secret.', true); }
    });

    document.getElementById('btn-confirm-delete')?.addEventListener('click', async () => {
        if (!pendingDeleteId) return;
        await window.api.deleteAccount(pendingDeleteId);
        await syncVault(() => renderAccounts());
        if (modalDel) hideModal(modalDel);
        showToast('Purged.');
    });

    document.getElementById('form-edit')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!editingAccountId) return;
        const acc = accounts.find(a => a.id === editingAccountId);
        if (!acc) return;
        await window.api.saveAccount({
            ...acc,
            issuer: (document.getElementById('edit-issuer') as HTMLInputElement).value.trim(),
            account: (document.getElementById('edit-account') as HTMLInputElement).value.trim()
        });
        await syncVault(() => renderAccounts());
        if (modalEdit) hideModal(modalEdit);
        showToast('Updated.');
    });

    document.getElementById('search-input')?.addEventListener('input', () => renderAccounts());

    // Window controls
    document.getElementById('btn-minimize')?.addEventListener('click', () => window.api.minimize());
    document.getElementById('btn-maximize')?.addEventListener('click', () => window.api.maximize());
    document.getElementById('btn-close')?.addEventListener('click', () => window.api.close());

    initHideCodes();
}

