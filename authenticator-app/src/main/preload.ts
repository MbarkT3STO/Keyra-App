import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
    // Auth System
    logToMain: (msg: string) => ipcRenderer.send('log-to-main', msg),
    signup: (user: string, email: string, pass: string) => ipcRenderer.invoke('signup', user, email, pass),
    signupLocal: (user: string, pass: string) => ipcRenderer.invoke('signup-local', user, pass),
    resendCode: (email: string) => ipcRenderer.invoke('resend-code', email),
    verifyEmail: (email: string, code: string) => ipcRenderer.invoke('verify-email', email, code),
    login: (user: string, pass: string) => ipcRenderer.invoke('login', user, pass),
    resumeFromGitHub: (pat: string, owner: string, repo: string) => ipcRenderer.invoke('resume-from-github', pat, owner, repo),
    checkSession: () => ipcRenderer.invoke('check-session'),
    logout: () => ipcRenderer.invoke('logout'),
    getCurrentUser: () => ipcRenderer.invoke('get-current-user'),
    pollForUpdates: () => ipcRenderer.invoke('poll-for-updates'),
    updateUserSettings: (settings: any, force: boolean = false) => ipcRenderer.invoke('update-user-settings', settings, force),
    changeUsername: (newUsername: string) => ipcRenderer.invoke('change-username', newUsername),
    changePassword: (newPassword: string) => ipcRenderer.invoke('change-password', newPassword),
    updateProfilePicture: (base64Image: string) => ipcRenderer.invoke('update-profile-picture', base64Image),
    updatePrivateSyncConfig: (config: any) => ipcRenderer.invoke('update-private-sync-config', config),
    testPrivateSyncConnection: (config: any) => ipcRenderer.invoke('test-private-sync-connection', config),
    requestEmailChange: (newEmail: string) => ipcRenderer.invoke('request-email-change', newEmail),
    confirmEmailChange: (code: string) => ipcRenderer.invoke('confirm-email-change', code),
    resendEmailChangeCode: () => ipcRenderer.invoke('resend-email-change-code'),
    cancelEmailChange: () => ipcRenderer.invoke('cancel-email-change'),
    requestPhoneVerification: (phone: string) => ipcRenderer.invoke('request-phone-verification', phone),
    startWhatsAppLinking: () => ipcRenderer.invoke('start-whatsapp-linking'),
    getWaStatus: () => ipcRenderer.invoke('get-wa-status'),
    logoutWhatsApp: () => ipcRenderer.invoke('logout-whatsapp'),
    removePhone: () => ipcRenderer.invoke('remove-phone'),
    verifyMasterPassword: (password: string) => ipcRenderer.invoke('verify-master-password', password),
    generatePinResetCode: () => ipcRenderer.invoke('generate-pin-reset-code'),
    verifyPinResetCode: (code: string) => ipcRenderer.invoke('verify-pin-reset-code', code),
    clearPinResetCode: () => ipcRenderer.invoke('clear-pin-reset-code'),
    sendPinResetCode: (phone: string, message: string) => ipcRenderer.invoke('send-pin-reset-code', phone, message),
    verifyPhoneByWhatsAppMatch: (waNumber: string) => ipcRenderer.invoke('verify-phone-wa-match', waNumber),
    onWaInitializing: (callback: () => void) => {
        ipcRenderer.removeAllListeners('wa-initializing');
        ipcRenderer.on('wa-initializing', () => callback());
    },
    onWaAuthFailure: (callback: (error: string) => void) => {
        ipcRenderer.removeAllListeners('wa-auth-failure');
        ipcRenderer.on('wa-auth-failure', (_event, err) => callback(err));
    },
    onWaQrCode: (callback: (qr: string) => void) => {
        ipcRenderer.removeAllListeners('wa-qr-code');
        ipcRenderer.on('wa-qr-code', (_event, qr) => callback(qr));
    },
    onWaAuthenticated: (callback: () => void) => {
        ipcRenderer.removeAllListeners('wa-authenticated');
        ipcRenderer.on('wa-authenticated', () => callback());
    },
    onWaReady: (callback: (waNumber?: string) => void) => {
        ipcRenderer.removeAllListeners('wa-ready');
        ipcRenderer.on('wa-ready', (_event, num) => callback(num));
    },


    // Operations
    getAccounts: () => ipcRenderer.invoke('get-accounts'),
    saveAccount: (account: any, force: boolean = false) => ipcRenderer.invoke('save-account', account, force),
    deleteAccount: (id: string, force: boolean = false) => ipcRenderer.invoke('delete-account', id, force),
    generateTOTP: (secret: string) => ipcRenderer.invoke('generate-totp', secret),
    getRemainingSeconds: () => ipcRenderer.invoke('get-remaining-seconds'),
    getBatchOTPs: (secrets: string[]) => ipcRenderer.invoke('get-batch-otps', secrets),
    parseURI: (uri: string) => ipcRenderer.invoke('parse-uri', uri),
    performVaultImport: (salt: string, encryptedVaultData: string, pass: string, encryptedSettings?: string, autolock?: string, desktopSettings?: any, webSettings?: any) => 
        ipcRenderer.invoke('perform-vault-import', salt, encryptedVaultData, pass, encryptedSettings, autolock, desktopSettings, webSettings),
    verifyBackupFile: (backupData: any) => ipcRenderer.invoke('verify-backup-file', backupData),
    exportVault: () => ipcRenderer.invoke('export-vault'),
    exportQRHTML: (accounts: any[]) => ipcRenderer.invoke('export-qr-html', accounts),
    exportJSON: (accounts: any[]) => ipcRenderer.invoke('export-json', accounts),
    exportText: (accounts: any[]) => ipcRenderer.invoke('export-text', accounts),
    importVault: () => ipcRenderer.invoke('import-vault'),
    encryptPIN: (pin: string) => ipcRenderer.invoke('encrypt-pin', pin),
    decryptPIN: (encryptedPin: string) => ipcRenderer.invoke('decrypt-pin', encryptedPin),
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
    setGlobalHotkey: (enabled: boolean) => ipcRenderer.invoke('set-global-hotkey', enabled),
    openExternal: (url: string) => ipcRenderer.invoke('open-external', url)
});
