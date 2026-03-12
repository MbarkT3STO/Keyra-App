import * as auth from '../core/auth';
import * as totp from '../core/totp';
import { parseOTPAuthURI } from '../core/otpauth';

export const bridge = {
    // Auth System
    signup: async (user: string, email: string, pass: string) => auth.signup(user, email, pass),
    resendCode: async (email: string) => auth.resendCode(email),
    verifyEmail: async (email: string, code: string) => auth.verifyEmail(email, code),
    login: async (user: string, pass: string) => auth.login(user, pass),
    checkSession: async () => ({ success: false, message: "Session auto-login disabled in web" }),
    logout: async () => auth.logout(),
    getCurrentUser: async () => auth.getCurrentUser(),

    // Operations
    getAccounts: async () => {
        try { return auth.getActiveAccounts(); }
        catch (err) { return []; }
    },
    saveAccount: async (account: any) => {
        try {
            const accounts = auth.getActiveAccounts();
            const existingIndex = accounts.findIndex((a: any) => a.id === account.id);
            if (existingIndex >= 0) {
                accounts[existingIndex] = account;
            } else {
                accounts.push(account);
            }
            auth.saveActiveAccounts(accounts);
            return accounts;
        } catch (err) {
            console.error("Save Account Error:", err);
            return [];
        }
    },
    deleteAccount: async (id: string) => {
        try {
            let accounts = auth.getActiveAccounts();
            accounts = accounts.filter((a: any) => a.id !== id);
            auth.saveActiveAccounts(accounts);
            return accounts;
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
    performVaultImport: async (salt: string, encryptedVaultData: string, pass: string) => 
        auth.importVaultData(salt, encryptedVaultData, pass),
    
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
