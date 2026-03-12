import { app, BrowserWindow, ipcMain, globalShortcut } from 'electron';
import * as path from 'path';
import { signup, resendCode, verifyEmail, login, logout, getCurrentUser, getActiveAccounts, saveActiveAccounts, updateUserSettings, checkSession, getBackupData, importVaultData, pollForUpdates } from '../core/auth';
import { generateTOTP, getRemainingSeconds } from '../core/totp';
import * as fs from 'fs';
import { dialog } from 'electron';

let mainWindow: BrowserWindow | null = null;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 450,
        height: 700,
        minWidth: 380,
        minHeight: 500,
        titleBarStyle: 'hidden', // Apple style clean top
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    mainWindow.loadFile(path.join(__dirname, '../renderer/renderer/index.html'));

    // Always open devtools in this debug mode for the user
    mainWindow.webContents.openDevTools({ mode: 'detach' });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    // Register F12 to toggle DevTools
    globalShortcut.register('F12', () => {
        if (BrowserWindow.getFocusedWindow()) {
            BrowserWindow.getFocusedWindow()?.webContents.toggleDevTools();
        }
    });

    // Also register CommandOrControl+Shift+I for standard devtools
    globalShortcut.register('CommandOrControl+Shift+I', () => {
        if (BrowserWindow.getFocusedWindow()) {
            BrowserWindow.getFocusedWindow()?.webContents.toggleDevTools();
        }
    });
}

// App Events
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// IPC Communication
// -- Auth & Multi-User IPC --
ipcMain.handle('signup', (event, user, email, pass) => signup(user, email, pass));
ipcMain.handle('resend-code', (event, email) => resendCode(email));
ipcMain.handle('verify-email', (event, email, code) => verifyEmail(email, code));
ipcMain.handle('login', (event, user, pass) => login(user, pass));
ipcMain.handle('check-session', () => checkSession());
ipcMain.handle('logout', () => logout());
ipcMain.handle('get-current-user', () => getCurrentUser());
ipcMain.handle('poll-for-updates', () => pollForUpdates());

// -- Vault Access (Requires Active User) --
ipcMain.handle('get-accounts', async () => {
    try { return await getActiveAccounts(); }
    catch (err) { return []; }
});

ipcMain.handle('save-account', async (event, account) => {
    try {
        const accounts = await getActiveAccounts();
        const existingIndex = accounts.findIndex((a: any) => a.id === account.id);
        if (existingIndex >= 0) {
            accounts[existingIndex] = account; // Update
        } else {
            accounts.push(account); // Add new
        }
        await saveActiveAccounts(accounts);
        return accounts;
    } catch (err) {
        console.error("Save Account Error:", err);
        return [];
    }
});

ipcMain.handle('delete-account', async (event, id) => {
    try {
        let accounts = await getActiveAccounts();
        accounts = accounts.filter((a: any) => a.id !== id);
        await saveActiveAccounts(accounts);
        return accounts;
    } catch (err) {
        return [];
    }
});

ipcMain.handle('update-user-settings', async (event, settings) => {
    try {
        await updateUserSettings(settings);
        return { success: true };
    } catch (err) {
        return { success: false };
    }
});

ipcMain.handle('generate-totp', (event, secret) => {
    return generateTOTP(secret);
});

ipcMain.handle('get-remaining-seconds', () => {
    return getRemainingSeconds();
});

ipcMain.handle('parse-uri', (event, uri) => {
    const { parseOTPAuthURI } = require('../core/otpauth');
    return parseOTPAuthURI(uri);
});

// -- Backup & Maintenance --
ipcMain.handle('export-vault', async () => {
    const { filePath } = await dialog.showSaveDialog(mainWindow!, {
        title: 'Export Secure Vault Backup',
        defaultPath: 'Keyra_Vault_Backup.keyra',
        filters: [{ name: 'Keyra Backup', extensions: ['keyra'] }]
    });

    if (filePath) {
        try {
            const data = getBackupData();
            fs.writeFileSync(filePath, JSON.stringify(data));
            return { success: true };
        } catch (e) {
            return { success: false, message: "Export failed." };
        }
    }
    return { success: false };
});

ipcMain.handle('import-vault', async () => {
    const { filePaths } = await dialog.showOpenDialog(mainWindow!, {
        title: 'Import Secure Vault Backup',
        filters: [{ name: 'Keyra Backup', extensions: ['keyra'] }],
        properties: ['openFile']
    });

    if (filePaths && filePaths.length > 0) {
        try {
            const content = fs.readFileSync(filePaths[0], 'utf8');
            const data = JSON.parse(content);
            if (!data.salt || !data.encryptedVaultData) {
                return { success: false, message: "Invalid backup file format." };
            }
            return { success: true, data }; // Send data back to renderer to ask for password
        } catch (e) {
            return { success: false, message: "Import failed." };
        }
    }
    return { success: false };
});

ipcMain.handle('perform-vault-import', async (event, salt, encryptedVaultData, password) => {
    return importVaultData(salt, encryptedVaultData, password);
});

ipcMain.handle('set-content-protection', (event, enabled) => {
    mainWindow?.setContentProtection(enabled);
    return true;
});

// Basic window controls for custom titlebar
ipcMain.on('window-minimize', () => { mainWindow?.minimize(); });
ipcMain.on('window-maximize', () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize();
    else mainWindow?.maximize();
});
ipcMain.on('window-close', () => { mainWindow?.close(); });
