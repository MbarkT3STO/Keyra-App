import { UIManager } from './ui';
import { rateLimiter } from '../core/rateLimiter';

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
        const auto = await window.api.checkSession();
        if (auto.success) {
            await completeLogin(true);
        } else {
            // No session, show login box and hide splash
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

        // Final fade out if coming from session resume
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
        const user = (document.getElementById('login-username') as HTMLInputElement).value.trim();
        const pass = (document.getElementById('login-password') as HTMLInputElement).value;
        const err = document.getElementById('login-error')!;

        err.classList.remove('animate-shake');
        err.style.opacity = '0';

        // Local Validation
        if (user.length < 4) {
            err.textContent = "Identity label must be at least 4 characters.";
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

        // Rate limiting check
        const rateLimitCheck = rateLimiter.isAllowed('login', user);
        if (!rateLimitCheck.allowed) {
            err.textContent = rateLimitCheck.message || "Too many attempts. Please try again later.";
            err.style.opacity = '1';
            void (err as HTMLElement).offsetWidth;
            err.classList.add('animate-shake');
            return;
        }

        setAuthLoading(true, "Unlocking Vault...");
        try {
            const result = await window.api.login(user, pass);
            if (result.success) {
                // Reset rate limit on successful login
                rateLimiter.reset('login', user);
                completeLogin();
            } else {
                // Record failed attempt
                rateLimiter.recordAttempt('login', user);
                const remaining = rateLimiter.getRemainingAttempts('login', user);
                
                let errorMsg = result.message;
                if (remaining > 0 && remaining <= 3) {
                    errorMsg += ` (${remaining} attempt${remaining > 1 ? 's' : ''} remaining)`;
                }
                
                err.textContent = errorMsg;
                err.style.opacity = '1';
                void (err as HTMLElement).offsetWidth; // Trigger reflow
                err.classList.add('animate-shake');
            }
        } catch (error: any) {
            rateLimiter.recordAttempt('login', user);
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
        } finally {
            setAuthLoading(false);
        }
    });

    // Verification
    const digitInputs = document.querySelectorAll('.verify-digit') as NodeListOf<HTMLInputElement>;
    digitInputs.forEach((input, idx) => {
        input.addEventListener('input', () => {
            input.classList.toggle('filled', !!input.value);
            if (input.value && digitInputs[idx + 1]) digitInputs[idx + 1].focus();
            if (Array.from(digitInputs).every(i => i.value)) handleVerification();
        });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' && !input.value && digitInputs[idx - 1]) {
                digitInputs[idx - 1].focus();
                digitInputs[idx - 1].classList.remove('filled');
            }
        });
    });

    async function handleVerification() {
        const email = (document.getElementById('verify-email-field') as HTMLInputElement).value;
        const code = Array.from(digitInputs).map(i => i.value).join('');
        const err = document.getElementById('verify-error')!;
        
        err.classList.remove('animate-shake');
        
        // Rate limiting check
        const rateLimitCheck = rateLimiter.isAllowed('verification', email);
        if (!rateLimitCheck.allowed) {
            err.textContent = rateLimitCheck.message || "Too many attempts. Please try again later.";
            err.style.opacity = '1';
            void (err as HTMLElement).offsetWidth;
            err.classList.add('animate-shake');
            digitInputs.forEach(i => i.value = '');
            digitInputs[0].focus();
            return;
        }
        
        setAuthLoading(true, "Verifying Identity...");
        try {
            const result = await window.api.verifyEmail(email, code);
            if (result.success) {
                rateLimiter.reset('verification', email);
                switchState(boxVerify, boxLogin);
            } else {
                rateLimiter.recordAttempt('verification', email);
                const remaining = rateLimiter.getRemainingAttempts('verification', email);
                
                let errorMsg = result.message;
                if (remaining > 0) {
                    errorMsg += ` (${remaining} attempt${remaining > 1 ? 's' : ''} remaining)`;
                }
                
                err.textContent = errorMsg;
                err.style.opacity = '1';
                void (err as HTMLElement).offsetWidth; // Trigger reflow
                err.classList.add('animate-shake');
                // Clear inputs on error
                digitInputs.forEach(i => i.value = '');
                digitInputs[0].focus();
            }
        } catch (e) {
            rateLimiter.recordAttempt('verification', email);
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

    function showSimulationToast(code: string) {
        const toast = document.getElementById('simulation-toast')!;
        const codeLabel = document.getElementById('sim-code')!;
        codeLabel.textContent = code;
        toast.classList.remove('hidden');
        setTimeout(() => toast.classList.add('hidden'), 8000);
    }
}
