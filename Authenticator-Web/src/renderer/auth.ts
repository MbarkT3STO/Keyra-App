import { UIManager } from './ui';

let appInitCallback: (() => void | Promise<void>) | null = null;

export function setAppInitCallback(cb: () => void | Promise<void>) {
    appInitCallback = cb;
}

export async function setupAuthUI() {
    const vessel = document.getElementById('auth-vessel');
    const boxLogin = document.getElementById('auth-login-box')!;
    const boxSignup = document.getElementById('auth-signup-box')!;
    const boxVerify = document.getElementById('auth-verify-box')!;

    // 0. Auto-Login Sequence
    try {
        const auto = await window.api.checkSession();
        if (auto.success) {
            completeLogin();
        }
    } catch (e) { console.error("Session resume failed", e); }

    async function completeLogin() {
        if (vessel) {
            vessel.classList.remove('show');
            setTimeout(() => vessel.classList.add('hidden'), 500);
        }
        
        if (appInitCallback) await appInitCallback();

        // Let UIManager handle initial data loading
        if ((window as any).ui) {
            (window as any).ui.refreshAccounts();
        }
    }

    function switchState(toHide: HTMLElement, toShow: HTMLElement) {
        toHide.classList.add('hidden');
        toShow.classList.remove('hidden');
    }

    // Navigation
    document.getElementById('btn-show-signup')?.addEventListener('click', () => {
        switchState(boxLogin, boxSignup);
    });

    document.getElementById('btn-show-login')?.addEventListener('click', () => {
        switchState(boxSignup, boxLogin);
    });

    document.getElementById('btn-show-login-from-verify')?.addEventListener('click', () => {
        switchState(boxVerify, boxLogin);
    });

    // Login Form
    document.getElementById('form-login')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const user = (document.getElementById('login-username') as HTMLInputElement).value;
        const pass = (document.getElementById('login-password') as HTMLInputElement).value;
        const err = document.getElementById('login-error')!;

        err.classList.remove('animate-shake');
        err.style.opacity = '0';
        try {
            const result = await window.api.login(user, pass);
            if (result.success) {
                completeLogin();
            } else {
                err.textContent = result.message;
                err.style.opacity = '1';
                void (err as HTMLElement).offsetWidth; // Trigger reflow
                err.classList.add('animate-shake');
            }
        } catch (error: any) {
            err.textContent = "Vault access denied.";
            err.style.opacity = '1';
            err.classList.add('animate-shake');
        }
    });

    // Signup Form
    document.getElementById('form-signup')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const user = (document.getElementById('signup-username') as HTMLInputElement).value;
        const email = (document.getElementById('signup-email') as HTMLInputElement).value;
        const pass = (document.getElementById('signup-password') as HTMLInputElement).value;
        const err = document.getElementById('signup-error')!;

        err.classList.remove('animate-shake');
        err.style.opacity = '0';
        try {
            const result = await window.api.signup(user, email, pass);
            if (result.success) {
                switchState(boxSignup, boxVerify);
                (document.getElementById('verify-email-field') as HTMLInputElement).value = email;
                if (result.code) showSimulationToast(result.code);
            } else {
                err.textContent = result.message;
                err.style.opacity = '1';
                void (err as HTMLElement).offsetWidth; // Trigger reflow
                err.classList.add('animate-shake');
            }
        } catch (error: any) {
            err.textContent = "Registry expansion failed.";
            err.style.opacity = '1';
            err.classList.add('animate-shake');
        }
    });

    // Verification
    const digitInputs = document.querySelectorAll('.verify-digit') as NodeListOf<HTMLInputElement>;
    digitInputs.forEach((input, idx) => {
        input.addEventListener('input', () => {
            if (input.value && digitInputs[idx + 1]) digitInputs[idx + 1].focus();
            if (Array.from(digitInputs).every(i => i.value)) handleVerification();
        });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' && !input.value && digitInputs[idx - 1]) digitInputs[idx - 1].focus();
        });
    });

    async function handleVerification() {
        const email = (document.getElementById('verify-email-field') as HTMLInputElement).value;
        const code = Array.from(digitInputs).map(i => i.value).join('');
        const err = document.getElementById('verify-error')!;
        
        err.classList.remove('animate-shake');
        try {
            const result = await window.api.verifyEmail(email, code);
            if (result.success) {
                switchState(boxVerify, boxLogin);
            } else {
                err.textContent = result.message;
                err.style.opacity = '1';
                void (err as HTMLElement).offsetWidth; // Trigger reflow
                err.classList.add('animate-shake');
                // Clear inputs on error
                digitInputs.forEach(i => i.value = '');
                digitInputs[0].focus();
            }
        } catch (e) {
            err.textContent = "Sync error.";
            err.style.opacity = '1';
            err.classList.add('animate-shake');
        }
    }

    document.getElementById('form-verify')?.addEventListener('submit', (e) => {
        e.preventDefault();
        handleVerification();
    });

    function showSimulationToast(code: string) {
        const toast = document.getElementById('simulation-toast')!;
        const codeLabel = document.getElementById('sim-code')!;
        codeLabel.textContent = code;
        toast.classList.remove('hidden');
        setTimeout(() => toast.classList.add('hidden'), 8000);
    }
}
