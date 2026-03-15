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
    pollForUpdates: () => ipcRenderer.invoke('poll-for-updates'),
    updateUserSettings: (settings: any) => ipcRenderer.invoke('update-user-settings', settings),
    changeUsername: (newUsername: string) => ipcRenderer.invoke('change-username', newUsername),
    changePassword: (newPassword: string) => ipcRenderer.invoke('change-password', newPassword),
    requestEmailChange: (newEmail: string) => ipcRenderer.invoke('request-email-change', newEmail),
    confirmEmailChange: (code: string) => ipcRenderer.invoke('confirm-email-change', code),
    resendEmailChangeCode: () => ipcRenderer.invoke('resend-email-change-code'),
    cancelEmailChange: () => ipcRenderer.invoke('cancel-email-change'),


    // Operations
    getAccounts: () => ipcRenderer.invoke('get-accounts'),
    saveAccount: (account: any) => ipcRenderer.invoke('save-account', account),
    deleteAccount: (id: string) => ipcRenderer.invoke('delete-account', id),
    generateTOTP: (secret: string) => ipcRenderer.invoke('generate-totp', secret),
    getRemainingSeconds: () => ipcRenderer.invoke('get-remaining-seconds'),
    getBatchOTPs: (secrets: string[]) => ipcRenderer.invoke('get-batch-otps', secrets),
    parseURI: (uri: string) => ipcRenderer.invoke('parse-uri', uri),
    exportVault: () => ipcRenderer.invoke('export-vault'),
    importVault: () => ipcRenderer.invoke('import-vault'),
    performVaultImport: (salt: string, encryptedVaultData: string, pass: string) => ipcRenderer.invoke('perform-vault-import', salt, encryptedVaultData, pass),
    setContentProtection: (enabled: boolean) => ipcRenderer.invoke('set-content-protection', enabled),
    getDesktopSources: () => ipcRenderer.invoke('get-desktop-sources'),
    openCaptureWindow: () => ipcRenderer.send('open-capture-window'),
    closeCaptureWindow: () => ipcRenderer.send('close-capture-window'),
    sendCaptureResult: (data: string) => ipcRenderer.send('capture-result', data),
    onCaptureResult: (callback: (data: string) => void) => {
        ipcRenderer.on('capture-result', (_event, data) => callback(data));
    },

    // Custom window controls
    minimize: () => ipcRenderer.send('window-minimize'),
    maximize: () => ipcRenderer.send('window-maximize'),
    close: () => ipcRenderer.send('window-close'),
    setResizable: (enabled: boolean) => ipcRenderer.send('set-resizable', enabled),

    // Update System
    checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
    startDownload: () => ipcRenderer.invoke('start-download'),
    installUpdate: () => ipcRenderer.invoke('install-update'),
    onUpdateChecking: (callback: () => void) => {
        ipcRenderer.removeAllListeners('update-checking');
        ipcRenderer.on('update-checking', () => callback());
    },
    onUpdateAvailable: (callback: (info: any) => void) => {
        ipcRenderer.removeAllListeners('update-available');
        ipcRenderer.on('update-available', (_event, info) => callback(info));
    },
    onUpdateNotAvailable: (callback: (info: any) => void) => {
        ipcRenderer.removeAllListeners('update-not-available');
        ipcRenderer.on('update-not-available', (_event, info) => callback(info));
    },
    onUpdateError: (callback: (err: string) => void) => {
        ipcRenderer.removeAllListeners('update-error');
        ipcRenderer.on('update-error', (_event, err) => callback(err));
    },
    onDownloadProgress: (callback: (percent: number) => void) => {
        ipcRenderer.removeAllListeners('update-download-progress');
        ipcRenderer.on('update-download-progress', (_event, percent) => callback(percent));
    },
    onUpdateDownloaded: (callback: (info: any) => void) => {
        ipcRenderer.removeAllListeners('update-downloaded');
        ipcRenderer.on('update-downloaded', (_event, info) => callback(info));
    },

    // System Integration
    setLaunchOnStartup: (enabled: boolean) => ipcRenderer.invoke('set-launch-on-startup', enabled),
    setMinimizeToTray: (enabled: boolean) => ipcRenderer.invoke('set-minimize-to-tray', enabled),
    setGlobalHotkey: (enabled: boolean) => ipcRenderer.invoke('set-global-hotkey', enabled)
});
