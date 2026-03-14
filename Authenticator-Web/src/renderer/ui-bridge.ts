import * as auth from '../core/auth';
import * as totp from '../core/totp';
import { parseOTPAuthURI } from '../core/otpauth';

const syncWrapper = async <T>(fn: () => Promise<T>): Promise<T> => {
    const ui = (window as any).ui;
    if (ui) ui.setSyncing(true);
    try {
        return await fn();
    } finally {
        if (ui) setTimeout(() => ui.setSyncing(false), 500); // 500ms min show time to avoid flicker
    }
};

export const bridge = {
    // Auth System
    signup: async (user: string, email: string, pass: string) => syncWrapper(() => auth.signup(user, email, pass)),
    resendCode: async (email: string) => syncWrapper(() => auth.resendCode(email)),
    verifyEmail: async (email: string, code: string) => syncWrapper(() => auth.verifyEmail(email, code)),
    login: async (user: string, pass: string) => syncWrapper(() => auth.login(user, pass)),
    checkSession: async () => syncWrapper(() => auth.checkSession()),
    logout: async () => auth.logout(),
    getCurrentUser: async () => auth.getCurrentUser(),
    updateUserSettings: async (settings: any) => syncWrapper(() => auth.updateUserSettings(settings)),

    // Account Management
    changeUsername: async (newName: string) => syncWrapper(() => auth.changeUsername(newName)),
    changePassword: async (newPassword: string) => syncWrapper(() => auth.changePassword(newPassword)),
    requestEmailChange: async (newEmail: string) => syncWrapper(() => auth.requestEmailChange(newEmail)),
    confirmEmailChange: async (code: string) => syncWrapper(() => auth.confirmEmailChange(code)),
    cancelEmailChange: async () => syncWrapper(() => auth.cancelEmailChange()),
    resendEmailChangeCode: async () => syncWrapper(() => auth.resendEmailChangeCode()),

    // Operations
    getAccounts: async () => {
        try { return await syncWrapper(() => auth.getActiveAccounts()); }
        catch (err) { return []; }
    },
    saveAccount: async (account: any) => {
        try {
            return await syncWrapper(async () => {
                const accounts = await auth.getActiveAccounts();
                const existingIndex = accounts.findIndex((a: any) => a.id === account.id);
                if (existingIndex >= 0) {
                    accounts[existingIndex] = account;
                } else {
                    accounts.push(account);
                }
                await auth.saveActiveAccounts(accounts);
                return accounts;
            });
        } catch (err) {
            console.error("Save Account Error:", err);
            return [];
        }
    },
    deleteAccount: async (id: string) => {
        try {
            return await syncWrapper(async () => {
                let accounts = await auth.getActiveAccounts();
                accounts = accounts.filter((a: any) => a.id !== id);
                await auth.saveActiveAccounts(accounts);
                return accounts;
            });
        } catch (err) {
            return [];
        }
    },
    generateTOTP: async (secret: string) => totp.generateTOTP(secret),
    getRemainingSeconds: async () => totp.getRemainingSeconds(),
    parseURI: async (uri: string) => parseOTPAuthURI(uri),
    exportVault: async () => {
        try {
            const data = auth.getBackupData();
            const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'Keyra_Vault_Backup.keyra';
            a.click();
            URL.revokeObjectURL(url);
            return { success: true };
        } catch (e) {
            return { success: false, message: "Export failed." };
        }
    },
    importVault: async () => {
        return new Promise((resolve) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.keyra';
            input.onchange = async (e: any) => {
                const file = e.target.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = (event: any) => {
                        try {
                            const data = JSON.parse(event.target.result);
                            if (!data.salt || !data.encryptedVaultData) {
                                resolve({ success: false, message: "Invalid backup format." });
                            } else {
                                resolve({ success: true, data });
                            }
                        } catch (err) {
                            resolve({ success: false, message: "Parse error." });
                        }
                    };
                    reader.readAsText(file);
                } else {
                    resolve({ success: false });
                }
            };
            input.click();
        });
    },
    performVaultImport: async (salt: string, encryptedVaultData: string, pass: string, autolock?: string, desktopSettings?: any, webSettings?: any) => 
        syncWrapper(() => auth.importVaultData(salt, encryptedVaultData, pass, autolock, desktopSettings, webSettings)),
    
    setContentProtection: async (enabled: boolean) => {
        console.log("Content protection requested:", enabled);
        return true;
    },

    // Custom window controls (no-ops for web)
    minimize: () => {},
    maximize: () => {},
    close: () => {}
};

(window as any).api = bridge;
