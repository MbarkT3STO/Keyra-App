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

    let loginLockoutInterval: any = null;
    function startLoginLockoutCountdown(errEl: HTMLElement, until: Date) {
        if (loginLockoutInterval) clearInterval(loginLockoutInterval);
        const submitBtn = document.querySelector('#form-login button[type="submit"]') as HTMLButtonElement | null;
        if (submitBtn) submitBtn.disabled = true;

        const tick = () => {
            const remaining = until.getTime() - Date.now();
            if (remaining <= 0) {
                clearInterval(loginLockoutInterval);
                loginLockoutInterval = null;
                errEl.style.opacity = '0';
                if (submitBtn) submitBtn.disabled = false;
                return;
            }
            const mins = Math.floor(remaining / 60000);
            const secs = Math.floor((remaining % 60000) / 1000);
            const label = mins > 0
                ? `Too many attempts. Try again in ${mins}m ${secs.toString().padStart(2, '0')}s`
                : `Too many attempts. Try again in ${secs}s`;
            errEl.textContent = label;
            errEl.style.opacity = '1';
        };

        tick();
        loginLockoutInterval = setInterval(tick, 1000);
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
            // Show live countdown
            startLoginLockoutCountdown(err, rateLimitCheck.blockedUntil);
            return;
        }

        setAuthLoading(true, "Unlocking Vault...");
        try {
            const result = await window.api.login(user, pass);
            if (result.success) {
                // Reset rate limit on successful login
                rateLimiter.reset('login', user);
                if (loginLockoutInterval) { clearInterval(loginLockoutInterval); loginLockoutInterval = null; }
                const submitBtn = document.querySelector('#form-login button[type="submit"]') as HTMLButtonElement | null;
                if (submitBtn) submitBtn.disabled = false;
                completeLogin();
            } else {
                // Record failed attempt
                const rlResult = rateLimiter.recordAttempt('login', user);
                
                let errorMsg = result.message;
                if (!rlResult.allowed) {
                    errorMsg = rlResult.message;
                } else if (rlResult.remainingAttempts <= 3) {
                    errorMsg += ` (${rlResult.remainingAttempts} attempt${rlResult.remainingAttempts !== 1 ? 's' : ''} remaining)`;
                }
                
                err.textContent = errorMsg;
                err.style.opacity = '1';
                void (err as HTMLElement).offsetWidth; // Trigger reflow
                err.classList.add('animate-shake');

                // Show debug modal if diagnostic info is available
                if ((result as any).debug) {
                    showLoginDebugModal(result.message, (result as any).debug);
                }
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
            // Rate limit signup by email
            const rlCheck = rateLimiter.isAllowed('signup', email);
            if (!rlCheck.allowed) {
                err.textContent = rlCheck.message;
                err.style.opacity = '1';
                void (err as HTMLElement).offsetWidth;
                err.classList.add('animate-shake');
                return;
            }

            const result = await window.api.signup(user, email, pass);
            if (result.success) {
                switchState(boxSignup, boxVerify);
                (document.getElementById('verify-email-field') as HTMLInputElement).value = email;
                if (result.code) showSimulationToast(result.code);
            } else {
                rateLimiter.recordAttempt('signup', email);
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
                const rlResult = rateLimiter.recordAttempt('verification', email);
                
                let errorMsg = result.message;
                if (!rlResult.allowed) {
                    errorMsg = rlResult.message;
                } else if (rlResult.remainingAttempts > 0) {
                    errorMsg += ` (${rlResult.remainingAttempts} attempt${rlResult.remainingAttempts !== 1 ? 's' : ''} remaining)`;
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

    function showLoginDebugModal(errorMessage: string, debug: string) {
        const escaped = debug
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        // Remove any existing debug modal
        document.getElementById('login-debug-modal')?.remove();

        const modal = document.createElement('div');
        modal.id = 'login-debug-modal';
        modal.style.cssText = `
            position: fixed; inset: 0; z-index: 99999;
            background: rgba(0,0,0,0.7);
            display: flex; align-items: center; justify-content: center;
            padding: 20px; box-sizing: border-box;
        `;
        modal.innerHTML = `
            <div style="
                background: var(--bg-primary, #e0e5ec);
                border-radius: 20px;
                padding: 24px;
                width: 100%; max-width: 480px;
                max-height: 80vh;
                overflow-y: auto;
                box-shadow: 8px 8px 16px rgba(0,0,0,0.3), -4px -4px 12px rgba(255,255,255,0.1);
            ">
                <div style="display:flex; align-items:center; gap:12px; margin-bottom:16px;">
                    <div style="
                        width:44px; height:44px; border-radius:12px; flex-shrink:0;
                        background: var(--bg-primary, #e0e5ec);
                        box-shadow: 4px 4px 8px rgba(0,0,0,0.2), -2px -2px 6px rgba(255,255,255,0.1);
                        display:flex; align-items:center; justify-content:center;
                        color: #ff3b30; font-size:20px;
                    "><i class="fa-solid fa-bug"></i></div>
                    <div>
                        <div style="font-weight:800; font-size:16px; color:var(--text-primary,#333);">Login Failed</div>
                        <div style="font-size:13px; color:var(--text-secondary,#666); margin-top:2px;">${errorMessage}</div>
                    </div>
                </div>
                <div style="font-size:11px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:var(--text-secondary,#666); margin-bottom:8px;">Diagnostic Log</div>
                <pre style="
                    background: var(--bg-secondary, #d1d9e6);
                    border-radius: 12px;
                    padding: 12px;
                    font-size: 11px;
                    line-height: 1.7;
                    color: var(--text-primary, #333);
                    white-space: pre-wrap;
                    word-break: break-all;
                    font-family: 'JetBrains Mono', monospace;
                    max-height: 260px;
                    overflow-y: auto;
                    margin: 0 0 16px 0;
                ">${escaped}</pre>
                <button id="login-debug-close" style="
                    width:100%; padding:14px; border:none; border-radius:12px; cursor:pointer;
                    background: var(--accent-primary, #7c3aed);
                    color: #fff; font-weight:800; font-size:15px;
                    box-shadow: 4px 4px 8px rgba(0,0,0,0.2);
                ">Close</button>
            </div>
        `;
        document.body.appendChild(modal);
        document.getElementById('login-debug-close')?.addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
    }
}
