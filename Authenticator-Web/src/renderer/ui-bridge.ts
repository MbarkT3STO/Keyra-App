import * as auth from '../core/auth';
import * as totp from '../core/totp';
import { parseOTPAuthURI } from '../core/otpauth';
import { handleError, withErrorHandling } from '../core/errorHandler';

const syncWrapper = async <T>(fn: () => Promise<T>, title: string = "Processing", subtitle: string = "VAULT SECURITY SYNCHRONIZATION"): Promise<T> => {
    const ui = (window as any).ui;
    if (ui) {
        ui.setSyncing(true);
        ui.setLoading(true, title, subtitle);
    }
    try {
        return await fn();
    } catch (error: any) {
        // Log error and show user-friendly message
        const userMessage = handleError(error, {
            operation: title,
            timestamp: Date.now()
        });
        
        if (ui) {
            ui.showToast(userMessage, 'error');
        }
        
        throw error;
    } finally {
        if (ui) {
            setTimeout(() => {
                ui.setSyncing(false);
                ui.setLoading(false);
            }, 500); // 500ms min show time to avoid flicker
        }
    }
};

export const bridge = {
    // Auth System
    signup: async (user: string, email: string, pass: string) => syncWrapper(() => auth.signup(user, email, pass), "Creating Vault", "SECURE VAULT INITIALIZATION"),
    resendCode: async (email: string) => syncWrapper(() => auth.resendCode(email), "Resending Code", "SECURITY VERIFICATION"),
    verifyEmail: async (email: string, code: string) => syncWrapper(() => auth.verifyEmail(email, code), "Verifying", "FINALIZING IDENTITY"),
    login: async (user: string, pass: string) => syncWrapper(() => auth.login(user, pass), "Unlocking Vault", "SECURE CONNECTION"),
    checkSession: async () => syncWrapper(() => auth.checkSession(), "Syncing", "CHECKING VAULT STATUS"),
    logout: async () => auth.logout(),
    getCurrentUser: async () => auth.getCurrentUser(),
    updateUserSettings: async (settings: any) => syncWrapper(() => auth.updateUserSettings(settings), "Saving Changes", "SYNCHRONIZING SECURE DATA"),
    verifyMasterPassword: async (password: string) => syncWrapper(() => auth.verifyMasterPassword(password), "Verifying", "MASTER KEY VALIDATION"),

    // PIN Encryption/Decryption
    encryptPIN: (pin: string) => auth.encryptPIN(pin),
    decryptPIN: (encryptedPin: string) => auth.decryptPIN(encryptedPin),

    // Account Management
    changeUsername: async (newName: string) => syncWrapper(() => auth.changeUsername(newName), "Updating Profile", "SYNCHRONIZING CHANGES"),
    changePassword: async (newPassword: string) => syncWrapper(() => auth.changePassword(newPassword), "Re-encrypting Vault", "MASTER KEY ROTATION"),
    updateProfilePicture: async (base64Image: string) => syncWrapper(() => auth.updateProfilePicture(base64Image), "Updating Photo", "UPLOADING AVATAR"),
    requestEmailChange: async (newEmail: string) => syncWrapper(() => auth.requestEmailChange(newEmail), "Processing", "INITIATING EMAIL ROTATION"),
    confirmEmailChange: async (code: string) => syncWrapper(() => auth.confirmEmailChange(code), "Verifying", "FINALIZING EMAIL IDENTITY"),
    cancelEmailChange: async () => syncWrapper(() => auth.cancelEmailChange(), "Cancelling", "REVERTING CHANGES"),
    resendEmailChangeCode: async () => syncWrapper(() => auth.resendEmailChangeCode(), "Resending", "SECURITY CODE ROTATION"),

    // Operations
    getAccounts: async () => {
        return await withErrorHandling(
            async () => {
                const accounts = await syncWrapper(() => auth.getActiveAccounts(), "Loading Vault", "SYNCHRONIZING SECURE DATA");
                return accounts || [];
            },
            { operation: 'getAccounts', timestamp: Date.now() },
            (error) => {
                console.error("Failed to load accounts:", error);
                const ui = (window as any).ui;
                if (ui) {
                    ui.showToast('Failed to load accounts. Please try again.', 'error');
                }
            }
        ) || [];
    },
    saveAccount: async (account: any) => {
        return await withErrorHandling(
            async () => {
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
                }, "Syncing Vault", "SECURE CLOUD BACKUP");
            },
            { operation: 'saveAccount', details: { accountId: account.id }, timestamp: Date.now() },
            (error) => {
                console.error("Failed to save account:", error);
                const ui = (window as any).ui;
                if (ui) {
                    ui.showToast('Failed to save account. Please try again.', 'error');
                }
            }
        ) || [];
    },
    deleteAccount: async (id: string) => {
        return await withErrorHandling(
            async () => {
                return await syncWrapper(async () => {
                    let accounts = await auth.getActiveAccounts();
                    accounts = accounts.filter((a: any) => a.id !== id);
                    await auth.saveActiveAccounts(accounts);
                    return accounts;
                }, "Updating Vault", "CLOUD SYNCHRONIZATION");
            },
            { operation: 'deleteAccount', details: { accountId: id }, timestamp: Date.now() },
            (error) => {
                console.error("Failed to delete account:", error);
                const ui = (window as any).ui;
                if (ui) {
                    ui.showToast('Failed to delete account. Please try again.', 'error');
                }
            }
        ) || [];
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
    performVaultImport: async (salt: string, encryptedVaultData: string, pass: string, encryptedSettings?: string, autolock?: string, desktopSettings?: any, webSettings?: any) => 
        syncWrapper(() => auth.importVaultData(salt, encryptedVaultData, pass, encryptedSettings, autolock, desktopSettings, webSettings), "Restoring Vault", "DECRYPTING SECURITY ARCHIVE"),
    
    verifyBackupFile: (backupData: any) => auth.verifyBackupFile(backupData),
    
    setContentProtection: async (enabled: boolean) => {
        return true;
    },

    // Custom window controls (no-ops for web)
    minimize: () => {},
    maximize: () => {},
    close: () => {}
};

(window as any).api = bridge;
