import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
    // Auth System
    signup: (user: string, email: string, pass: string) => ipcRenderer.invoke('signup', user, email, pass),
    resendCode: (email: string) => ipcRenderer.invoke('resend-code', email),
    verifyEmail: (email: string, code: string) => ipcRenderer.invoke('verify-email', email, code),
    login: (user: string, pass: string) => ipcRenderer.invoke('login', user, pass),
    checkSession: () => ipcRenderer.invoke('check-session'),
    logout: () => ipcRenderer.invoke('logout'),
    getCurrentUser: () => ipcRenderer.invoke('get-current-user'),

    // Operations
    getAccounts: () => ipcRenderer.invoke('get-accounts'),
    saveAccount: (account: any) => ipcRenderer.invoke('save-account', account),
    deleteAccount: (id: string) => ipcRenderer.invoke('delete-account', id),
    generateTOTP: (secret: string) => ipcRenderer.invoke('generate-totp', secret),
    getRemainingSeconds: () => ipcRenderer.invoke('get-remaining-seconds'),
    parseURI: (uri: string) => ipcRenderer.invoke('parse-uri', uri),
    exportVault: () => ipcRenderer.invoke('export-vault'),
    importVault: () => ipcRenderer.invoke('import-vault'),
    performVaultImport: (salt: string, encryptedVaultData: string, pass: string) => ipcRenderer.invoke('perform-vault-import', salt, encryptedVaultData, pass),
    setContentProtection: (enabled: boolean) => ipcRenderer.invoke('set-content-protection', enabled),

    // Custom window controls
    minimize: () => ipcRenderer.send('window-minimize'),
    maximize: () => ipcRenderer.send('window-maximize'),
    close: () => ipcRenderer.send('window-close')
});
