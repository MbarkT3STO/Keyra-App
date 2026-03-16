import { UIManager } from './ui.js';

let appInitCallback: ((resumed: boolean) => void | Promise<void>) | null = null;

export function setAppInitCallback(cb: (resumed: boolean) => void | Promise<void>) {
    appInitCallback = cb;
}

export async function setupAuthUI() {
    const vessel = document.getElementById('auth-vessel');
    const boxLogin = document.getElementById('auth-login-box')!;
    const boxSignup = document.getElementById('auth-signup-box')!;
    const boxVerify = document.getElementById('auth-verify-box')!;

    // 0. Auto-Login Sequence
    try {
        const auto = await (window as any).api.checkSession();
        if (auto.success) {
            await completeLogin(true);
        } else {
            hideSplashScreen();
        }
    } catch (e) { 
        console.error("Session resume failed", e);
        hideSplashScreen();
    }

    function hideSplashScreen() {
        const splash = document.getElementById('splash-screen');
        if (splash) {
            splash.classList.add('fade-out');
            setTimeout(() => splash.style.display = 'none', 1000);
        }
    }

    async function completeLogin(resumed: boolean = false) {
        if (vessel) {
            vessel.classList.remove('show');
            setTimeout(() => vessel.classList.add('hidden'), 500);
        }
        
        if (appInitCallback) await appInitCallback(resumed);

        // Let UIManager handle initial data loading
        if ((window as any).ui) {
            await (window as any).ui.refreshAccounts();
        }

        if (resumed) {
            hideSplashScreen();
        }
    }

    function setAuthLoading(show: boolean, text: string = "Unlocking Vault...") {
        const overlay = document.getElementById('auth-loading-overlay');
        const label = document.getElementById('auth-loading-text');
        if (overlay) {
            if (show) {
                if (label) label.textContent = text;
                overlay.classList.remove('hidden');
            } else {
                overlay.classList.add('hidden');
            }
        }
    }

    function switchState(toHide: HTMLElement, toShow: HTMLElement) {
        toHide.classList.add('hidden');
        toShow.classList.remove('hidden');
    }

    // Navigation
    const btnBack = document.getElementById('btn-auth-back');

    document.getElementById('btn-show-signup')?.addEventListener('click', () => {
        switchState(boxLogin, boxSignup);
        btnBack?.classList.remove('hidden');
    });

    document.getElementById('btn-show-login')?.addEventListener('click', () => {
        switchState(boxSignup, boxLogin);
        btnBack?.classList.add('hidden');
    });

    document.getElementById('btn-show-login-from-verify')?.addEventListener('click', () => {
        switchState(boxVerify, boxLogin);
        btnBack?.classList.add('hidden');
    });

    btnBack?.addEventListener('click', () => {
        if (!boxSignup.classList.contains('hidden')) {
            switchState(boxSignup, boxLogin);
            btnBack.classList.add('hidden');
        } else if (!boxVerify.classList.contains('hidden')) {
            switchState(boxVerify, boxLogin);
            btnBack.classList.add('hidden');
        }
    });

    // Login Form
    document.getElementById('form-login')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const user = (document.getElementById('login-username') as HTMLInputElement).value.trim();
        const pass = (document.getElementById('login-password') as HTMLInputElement).value;
        const err = document.getElementById('login-error')!;

        err.classList.remove('animate-shake');
        err.style.opacity = '0';

        // Local Validation
        if (user.length < 4) {
            err.textContent = "Identity must be at least 4 characters.";
            err.style.opacity = '1';
            void (err as HTMLElement).offsetWidth; 
            err.classList.add('animate-shake');
            return;
        }
        if (pass.length < 8) {
            err.textContent = "Master key must be at least 8 characters.";
            err.style.opacity = '1';
            void (err as HTMLElement).offsetWidth;
            err.classList.add('animate-shake');
            return;
        }

        setAuthLoading(true, "Unlocking Vault...");
        try {
            const result = await (window as any).api.login(user, pass);
            if (result.success) {
                completeLogin();
            } else {
                err.textContent = result.message;
                err.style.opacity = '1';
                void (err as HTMLElement).offsetWidth; 
                err.classList.add('animate-shake');
            }
        } catch (error: any) {
            err.textContent = "Vault access denied.";
            err.style.opacity = '1';
            err.classList.add('animate-shake');
        } finally {
            setAuthLoading(false);
        }
    });

    // Signup Form
    document.getElementById('form-signup')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const user = (document.getElementById('signup-username') as HTMLInputElement).value.trim();
        const email = (document.getElementById('signup-email') as HTMLInputElement).value.trim();
        const pass = (document.getElementById('signup-password') as HTMLInputElement).value;
        const err = document.getElementById('signup-error')!;

        err.classList.remove('animate-shake');
        err.style.opacity = '0';

        // Local Validation
        if (user.length < 4) {
            err.textContent = "Full name must be at least 4 characters.";
            err.style.opacity = '1';
            void (err as HTMLElement).offsetWidth;
            err.classList.add('animate-shake');
            return;
        }
        if (pass.length < 8) {
            err.textContent = "Password must be at least 8 characters.";
            err.style.opacity = '1';
            void (err as HTMLElement).offsetWidth;
            err.classList.add('animate-shake');
            return;
        }

        setAuthLoading(true, "Creating Vault...");
        try {
            const result = await (window as any).api.signup(user, email, pass);
            if (result.success) {
                switchState(boxSignup, boxVerify);
                (document.getElementById('verify-email-field') as HTMLInputElement).value = email;
                if (result.code) showSimulationToast(result.code);
                startResendTimer();
            } else {
                err.textContent = result.message;
                err.style.opacity = '1';
                void (err as HTMLElement).offsetWidth; 
                err.classList.add('animate-shake');
            }
        } catch (error: any) {
            err.textContent = "Registration failed.";
            err.style.opacity = '1';
            err.classList.add('animate-shake');
        } finally {
            setAuthLoading(false);
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
        setAuthLoading(true, "Verifying Identity...");
        try {
            const result = await (window as any).api.verifyEmail(email, code);
            if (result.success) {
                switchState(boxVerify, boxLogin);
            } else {
                err.textContent = result.message;
                err.style.opacity = '1';
                void (err as HTMLElement).offsetWidth; 
                err.classList.add('animate-shake');
                digitInputs.forEach(i => i.value = '');
                digitInputs[0].focus();
            }
        } catch (e) {
            err.textContent = "Sync error.";
            err.style.opacity = '1';
            err.classList.add('animate-shake');
        } finally {
            setAuthLoading(false);
        }
    }

    document.getElementById('form-verify')?.addEventListener('submit', (e) => {
        e.preventDefault();
        handleVerification();
    });

    // Resend Logic
    let resendCooldown = 0;
    let resendInterval: any = null;

    function startResendTimer() {
        resendCooldown = 60;
        const btn = document.getElementById('btn-resend-code') as HTMLButtonElement;
        const timerSpan = document.getElementById('resend-timer');
        if (!btn || !timerSpan) return;

        btn.disabled = true;
        btn.style.opacity = '0.5';
        
        if (resendInterval) clearInterval(resendInterval);
        resendInterval = setInterval(() => {
            resendCooldown--;
            timerSpan.textContent = `(${resendCooldown}s)`;
            if (resendCooldown <= 0) {
                clearInterval(resendInterval);
                btn.disabled = false;
                btn.style.opacity = '1';
                timerSpan.textContent = '';
            }
        }, 1000);
    }

    document.getElementById('btn-resend-code')?.addEventListener('click', async () => {
        const email = (document.getElementById('verify-email-field') as HTMLInputElement).value;
        setAuthLoading(true, "Resending Code...");
        try {
            const result = await (window as any).api.resendCode(email);
            if (result.success) {
                if (result.code) showSimulationToast(result.code);
                startResendTimer();
            } else {
                const err = document.getElementById('verify-error')!;
                err.textContent = result.message;
                err.style.opacity = '1';
            }
        } catch (e) {
            console.error("Resend failed", e);
        } finally {
            setAuthLoading(false);
        }
    });

    function showSimulationToast(code: string) {
        const toast = document.getElementById('simulation-toast')!;
        const codeLabel = document.getElementById('sim-code')!;
        codeLabel.textContent = code;
        toast.classList.remove('hidden');
        setTimeout(() => toast.classList.add('hidden'), 8000);
    }
}
