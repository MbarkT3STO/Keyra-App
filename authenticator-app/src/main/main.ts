import { app, BrowserWindow, ipcMain, globalShortcut } from 'electron';
import * as path from 'path';
import { signup, resendCode, verifyEmail, login, logout, getCurrentUser, getActiveAccounts, saveActiveAccounts, checkSession } from '../core/auth';
import { generateTOTP, getRemainingSeconds } from '../core/totp';

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

// -- Vault Access (Requires Active User) --
ipcMain.handle('get-accounts', () => {
    try { return getActiveAccounts(); }
    catch (err) { return []; }
});

ipcMain.handle('save-account', (event, account) => {
    try {
        const accounts = getActiveAccounts();
        const existingIndex = accounts.findIndex((a: any) => a.id === account.id);
        if (existingIndex >= 0) {
            accounts[existingIndex] = account; // Update
        } else {
            accounts.push(account); // Add new
        }
        saveActiveAccounts(accounts);
        return accounts;
    } catch (err) {
        console.error("Save Account Error:", err);
        return [];
    }
});

ipcMain.handle('delete-account', (event, id) => {
    try {
        let accounts = getActiveAccounts();
        accounts = accounts.filter((a: any) => a.id !== id);
        saveActiveAccounts(accounts);
        return accounts;
    } catch (err) {
        return [];
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

// Basic window controls for custom titlebar
ipcMain.on('window-minimize', () => { mainWindow?.minimize(); });
ipcMain.on('window-maximize', () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize();
    else mainWindow?.maximize();
});
ipcMain.on('window-close', () => { mainWindow?.close(); });
