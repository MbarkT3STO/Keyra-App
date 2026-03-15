import { app, BrowserWindow, ipcMain, globalShortcut, screen, desktopCapturer, Menu } from 'electron';
import * as path from 'path';
import { signup, resendCode, verifyEmail, login, logout, getCurrentUser, getActiveAccounts, saveActiveAccounts, updateUserSettings, checkSession, getBackupData, importVaultData, pollForUpdates, changeUsername, changePassword, requestEmailChange, confirmEmailChange, resendEmailChangeCode, cancelEmailChange } from '../core/auth';
import { generateTOTP, getRemainingSeconds, getBatchOTPs } from '../core/totp';
import * as fs from 'fs';
import { dialog } from 'electron';

let mainWindow: BrowserWindow | null = null;

function createWindow() {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

    const initialWidth = Math.floor(screenWidth * 0.8);
    const initialHeight = Math.floor(screenHeight * 0.8);

    mainWindow = new BrowserWindow({
        width: initialWidth,
        height: initialHeight,
        minWidth: 380,
        minHeight: 500,
        resizable: false,
        icon: path.join(__dirname, '../../assets/icon.png'),
        titleBarStyle: 'hidden', // Apple style clean top
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            devTools: false
        }
    });

    mainWindow.loadFile(path.join(__dirname, '../renderer/renderer/index.html'));

    // Remove the default application menu for a clean production look
    Menu.setApplicationMenu(null);

    mainWindow.on('closed', () => {
        mainWindow = null;
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

// -- Account Management --
ipcMain.handle('change-username', (event, newUsername) => changeUsername(newUsername));
ipcMain.handle('change-password', (event, newPassword) => changePassword(newPassword));
ipcMain.handle('request-email-change', (event, newEmail) => requestEmailChange(newEmail));
ipcMain.handle('confirm-email-change', (event, code) => confirmEmailChange(code));
ipcMain.handle('resend-email-change-code', () => resendEmailChangeCode());
ipcMain.handle('cancel-email-change', () => cancelEmailChange());


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

ipcMain.handle('get-batch-otps', (event, secrets) => {
    return getBatchOTPs(secrets);
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

ipcMain.handle('perform-vault-import', async (event, salt, encryptedVaultData, password, autolock, desktopSettings, webSettings) => {
    return importVaultData(salt, encryptedVaultData, password, autolock, desktopSettings, webSettings);
});

ipcMain.handle('set-content-protection', (event, enabled) => {
    mainWindow?.setContentProtection(enabled);
    return true;
});

ipcMain.handle('get-desktop-sources', async () => {
    return await desktopCapturer.getSources({ types: ['window', 'screen'] });
});

let captureWindow: BrowserWindow | null = null;

ipcMain.on('open-capture-window', () => {
    if (captureWindow) return;

    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.bounds;

    captureWindow = new BrowserWindow({
        width,
        height,
        x: 0,
        y: 0,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        fullscreen: process.platform !== 'darwin',
        enableLargerThanScreen: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    captureWindow.loadFile(path.join(__dirname, '../renderer/renderer/capture.html'));

    captureWindow.on('closed', () => {
        captureWindow = null;
    });
});

ipcMain.on('capture-result', (event, data) => {
    mainWindow?.webContents.send('capture-result', data);
    if (captureWindow) {
        captureWindow.close();
    }
});

ipcMain.on('close-capture-window', () => {
    captureWindow?.close();
});

// Basic window controls for custom titlebar
ipcMain.on('window-minimize', () => { mainWindow?.minimize(); });
ipcMain.on('window-maximize', () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize();
    else mainWindow?.maximize();
});
ipcMain.on('window-close', () => { mainWindow?.close(); });
ipcMain.on('set-resizable', (event, enabled) => {
    mainWindow?.setResizable(enabled);
});
