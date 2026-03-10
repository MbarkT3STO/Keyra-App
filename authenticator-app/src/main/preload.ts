import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
    getAccounts: () => ipcRenderer.invoke('get-accounts'),
    saveAccount: (account: any) => ipcRenderer.invoke('save-account', account),
    deleteAccount: (id: string) => ipcRenderer.invoke('delete-account', id),
    generateTOTP: (secret: string) => ipcRenderer.invoke('generate-totp', secret),
    getRemainingSeconds: () => ipcRenderer.invoke('get-remaining-seconds'),
    parseURI: (uri: string) => ipcRenderer.invoke('parse-uri', uri),

    // Custom window controls
    minimize: () => ipcRenderer.send('window-minimize'),
    maximize: () => ipcRenderer.send('window-maximize'),
    close: () => ipcRenderer.send('window-close')
});
