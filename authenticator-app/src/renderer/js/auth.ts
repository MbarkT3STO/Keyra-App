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
    const boxResume = document.getElementById('auth-resume-box')!;
    const boxEntry = document.getElementById('auth-entry-box')!;

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

    document.getElementById('btn-show-signup-local')?.addEventListener('click', () => {
        switchState(boxLogin, boxSignup);
        btnBack?.classList.remove('hidden');
        setLocalMode(true);
    });

    document.getElementById('btn-toggle-local')?.addEventListener('click', () => {
        const isLocal = (document.getElementById('signup-is-local') as HTMLInputElement).value === 'true';
        setLocalMode(!isLocal);
    });

    function setLocalMode(isLocal: boolean) {
        const emailGroup = document.getElementById('signup-email-group');
        const emailInput = document.getElementById('signup-email') as HTMLInputElement;
        const passLabel = document.getElementById('label-signup-password');
        const passInput = document.getElementById('signup-password') as HTMLInputElement;
        const isLocalInput = document.getElementById('signup-is-local') as HTMLInputElement;
        const toggleBtn = document.getElementById('btn-toggle-local');
        const toggleText = document.getElementById('local-toggle-text');
        const submitBtn = document.getElementById('btn-signup-submit');

        if (isLocal) {
            emailGroup?.classList.add('hidden');
            emailInput.removeAttribute('required');
            if (passLabel) passLabel.textContent = "Encryption Key";
            if (passInput) passInput.placeholder = "Min 8 characters (Key)";
            if (isLocalInput) isLocalInput.value = 'true';
            if (toggleBtn) toggleBtn.textContent = "Enable Online Features";
            if (toggleText) toggleText.firstChild!.textContent = "Need Cloud Sync? ";
            if (submitBtn) submitBtn.textContent = "Create Local Vault";
        } else {
            emailGroup?.classList.remove('hidden');
            emailInput.setAttribute('required', 'required');
            if (passLabel) passLabel.textContent = "Master Password";
            if (passInput) passInput.placeholder = "Min 8 characters";
            if (isLocalInput) isLocalInput.value = 'false';
            if (toggleBtn) toggleBtn.textContent = "Stay Offline (Local Only)";
            if (toggleText) toggleText.firstChild!.textContent = "Privacy First? ";
            if (submitBtn) submitBtn.textContent = "Create Vault";
        }
    }

    btnBack?.addEventListener('click', () => {
        if (!boxSignup.classList.contains('hidden')) {
            switchState(boxSignup, boxEntry);
            btnBack.classList.add('hidden');
            setLocalMode(false); 
        } else if (!boxLogin.classList.contains('hidden')) {
            switchState(boxLogin, boxEntry);
            btnBack.classList.add('hidden');
        } else if (!boxVerify.classList.contains('hidden')) {
            switchState(boxVerify, boxLogin);
            // Don't hide back btn here as it should go to login
        } else if (!boxResume.classList.contains('hidden')) {
            switchState(boxResume, boxEntry);
            btnBack.classList.add('hidden');
        }
    });

    document.getElementById('btn-entry-login')?.addEventListener('click', () => {
        switchState(boxEntry, boxLogin);
        btnBack?.classList.remove('hidden');
    });

    document.getElementById('btn-entry-signup')?.addEventListener('click', () => {
        switchState(boxEntry, boxSignup);
        btnBack?.classList.remove('hidden');
        setLocalMode(false);
    });

    document.getElementById('btn-entry-local')?.addEventListener('click', () => {
        switchState(boxEntry, boxSignup);
        btnBack?.classList.remove('hidden');
        setLocalMode(true);
    });

    document.getElementById('btn-show-resume')?.addEventListener('click', () => {
        switchState(boxEntry, boxResume);
        btnBack?.classList.remove('hidden');
    });

    document.getElementById('btn-show-login-resume')?.addEventListener('click', () => {
        switchState(boxResume, boxEntry);
        btnBack?.classList.add('hidden');
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
            err.textContent = "Name or Phone must be at least 4 characters.";
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

        const isLocal = (document.getElementById('signup-is-local') as HTMLInputElement).value === 'true';

        setAuthLoading(true, isLocal ? "Creating Local Vault..." : "Creating Vault...");
        try {
            if (isLocal) {
                const result = await (window as any).api.signupLocal(user, pass);
                if (result.success) {
                    // Local accounts go straight to login or can we auto-login?
                    // signupLocal returns success: true. We usually want them to login to confirm password.
                    switchState(boxSignup, boxLogin);
                    (document.getElementById('login-username') as HTMLInputElement).value = user;
                    const loginErr = document.getElementById('login-error')!;
                    loginErr.textContent = "Local vault created! Please unlock to continue.";
                    loginErr.style.color = "var(--accent-primary)";
                    loginErr.style.opacity = '1';
                } else {
                    err.textContent = result.message;
                    err.style.opacity = '1';
                    void (err as HTMLElement).offsetWidth; 
                    err.classList.add('animate-shake');
                }
            } else {
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
            }
        } catch (error: any) {
            err.textContent = isLocal ? "Local setup failed." : "Registration failed.";
            err.style.opacity = '1';
            err.classList.add('animate-shake');
        } finally {
            setAuthLoading(false);
        }
    });

    // Resume Form
    document.getElementById('form-resume')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const pat = (document.getElementById('resume-pat') as HTMLInputElement).value.trim();
        const owner = (document.getElementById('resume-owner') as HTMLInputElement).value.trim();
        const repo = (document.getElementById('resume-repo') as HTMLInputElement).value.trim();
        const err = document.getElementById('resume-error')!;

        err.classList.remove('animate-shake');
        err.style.opacity = '0';

        setAuthLoading(true, "Restoring Vault from GitHub...");
        try {
            const result = await (window as any).api.resumeFromGitHub(pat, owner, repo);
            if (result.success) {
                // Success: Pre-fill username and switch to login
                switchState(boxResume, boxLogin);
                (document.getElementById('login-username') as HTMLInputElement).value = result.username || "";
                
                const loginErr = document.getElementById('login-error')!;
                loginErr.textContent = result.message;
                loginErr.style.color = "var(--accent-primary)";
                loginErr.style.opacity = '1';
                btnBack?.classList.add('hidden');
            } else {
                err.textContent = result.message;
                err.style.opacity = '1';
                void (err as HTMLElement).offsetWidth; 
                err.classList.add('animate-shake');
            }
        } catch (error: any) {
            err.textContent = "Restoration failed. Check credentials.";
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
