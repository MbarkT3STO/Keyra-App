import { app, BrowserWindow, ipcMain, globalShortcut, screen, desktopCapturer, Menu, Tray, nativeImage, shell } from 'electron';
import { autoUpdater } from 'electron-updater';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load .env — works both in dev and packaged
const envPath = app.isPackaged
    ? path.join(process.resourcesPath, '.env')
    : path.join(process.cwd(), '.env');
dotenv.config({ path: envPath });
import { 
    signup, signupLocal, resendCode, verifyEmail, login, logout, 
    getCurrentUser, getActiveAccounts, saveActiveAccounts, updateUserSettings, 
    checkSession, getBackupData, importVaultData, pollForUpdates, changeUsername, 
    changePassword, requestEmailChange, confirmEmailChange, resendEmailChangeCode, 
    cancelEmailChange, requestPhoneVerification, removePhone, verifyPhoneByWhatsAppMatch, 
    verifyMasterPassword, generatePinResetCode, verifyPinResetCode, clearPinResetCode,
    updatePrivateSyncConfig, testPrivateSyncConnection,
    registerCurrentDevice, revokeDevice, getCurrentDeviceId
} from '../core/auth';
import { service } from '../core/notifier';
import { generateTOTP, getRemainingSeconds, getBatchOTPs } from '../core/totp';
import * as fs from 'fs';
import { dialog } from 'electron';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

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
        trafficLightPosition: { x: -100, y: -100 }, // Hide macOS traffic lights
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

    mainWindow.on('close', (event) => {
        if (!isQuitting && tray) {
            event.preventDefault();
            mainWindow?.hide();
            return false;
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    createTray();
    setupGlobalShortcut();

    // Configure AutoUpdater
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;

    // Set GitHub token for authenticated requests (avoids rate limiting on download)
    const ghToken = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
    if (ghToken) {
        autoUpdater.requestHeaders = { 'Authorization': `token ${ghToken}` };
    }

    autoUpdater.on('checking-for-update', () => {
        mainWindow?.webContents.send('update-checking');
    });

    autoUpdater.on('update-available', (info) => {
        mainWindow?.webContents.send('update-available', info);
    });

    autoUpdater.on('update-not-available', (info) => {
        mainWindow?.webContents.send('update-not-available', info);
    });

    autoUpdater.on('error', (err) => {
        console.error('[AutoUpdater] Error:', err.message);
        mainWindow?.webContents.send('update-error', err.message);
    });

    autoUpdater.on('download-progress', (progressObj) => {
        mainWindow?.webContents.send('update-download-progress', progressObj.percent);
    });

    autoUpdater.on('update-downloaded', (info) => {
        mainWindow?.webContents.send('update-downloaded', info);
    });
}

// App Events
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('before-quit', () => {
    isQuitting = true;
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// IPC Communication
// -- Auth & Multi-User IPC --
ipcMain.handle('signup', (event, user, email, pass) => signup(user, email, pass));
ipcMain.handle('signup-local', (event, user, pass) => signupLocal(user, pass));
ipcMain.handle('resend-code', (event, email) => resendCode(email));
ipcMain.handle('verify-email', (event, email, code) => verifyEmail(email, code));
ipcMain.handle('login', async (event, user, pass) => {
    const result = await login(user, pass);
    if (result.success) registerCurrentDevice().catch(() => {});
    return result;
});
ipcMain.handle('resume-from-github', (event, pat, owner, repo) => {
    const { resumeFromGitHub } = require('../core/auth');
    return resumeFromGitHub(pat, owner, repo);
});
ipcMain.handle('check-session', async () => {
    const result = await checkSession();
    if (result.success) registerCurrentDevice().catch(() => {});
    return result;
});
ipcMain.handle('logout', () => logout());
ipcMain.handle('get-current-user', () => getCurrentUser());
ipcMain.handle('poll-for-updates', () => pollForUpdates());

// -- Account Management --
ipcMain.handle('change-username', (event, newUsername) => changeUsername(newUsername));
ipcMain.handle('change-password', (event, newPassword) => changePassword(newPassword));
ipcMain.handle('update-profile-picture', (event, base64Image) => {
    const { updateProfilePicture } = require('../core/auth');
    return updateProfilePicture(base64Image);
});
ipcMain.handle('request-email-change', (event, newEmail) => requestEmailChange(newEmail));
ipcMain.handle('confirm-email-change', (event, code) => confirmEmailChange(code));
ipcMain.handle('resend-email-change-code', () => resendEmailChangeCode());
ipcMain.handle('cancel-email-change', () => cancelEmailChange());
ipcMain.handle('request-phone-verification', (event, phone) => requestPhoneVerification(phone));
ipcMain.handle('remove-phone', () => removePhone()),
ipcMain.handle('revoke-device', async (event, deviceId) => {
    try { return await revokeDevice(deviceId); }
    catch (err: any) { return { success: false, message: err.message }; }
}),
ipcMain.handle('get-current-device-id', () => getCurrentDeviceId()),
ipcMain.handle('verify-phone-wa-match', (_event, waNumber) => verifyPhoneByWhatsAppMatch(waNumber)),
ipcMain.handle('verify-master-password', (_event, password) => verifyMasterPassword(password)),
ipcMain.handle('generate-pin-reset-code', () => generatePinResetCode()),
ipcMain.handle('verify-pin-reset-code', (_event, code) => verifyPinResetCode(code)),
ipcMain.handle('clear-pin-reset-code', () => clearPinResetCode()),
ipcMain.handle('send-pin-reset-code', async (_event, phone: string, message: string) => {
    const { sendPhoneVerification } = require('../core/notifier');
    return sendPhoneVerification({
        to: phone,
        message: message,
        code: ''
    });
}),
ipcMain.handle('logout-whatsapp', () => service.logoutWhatsApp()),
ipcMain.handle('stop-whatsapp', () => service.stopWhatsApp()),
ipcMain.handle('start-whatsapp-linking', () => service.ensureWhatsAppStarted()),


// -- Vault Access (Requires Active User) --
ipcMain.on('log-to-main', (event, msg) => {
    console.log(`[Renderer] ${msg}`);
});

ipcMain.handle('get-accounts', async () => {
    try { return await getActiveAccounts(); }
    catch (err) { return []; }
});

ipcMain.handle('save-account', async (event, account, force = false) => {
    try {
        const accounts = await getActiveAccounts();
        const existingIndex = accounts.findIndex((a: any) => a.id === account.id);
        if (existingIndex >= 0) {
            accounts[existingIndex] = account; // Update
        } else {
            accounts.push(account); // Add new
        }
        const syncRes = await saveActiveAccounts(accounts, force);
        return { ...syncRes, accounts };
    } catch (err: any) {
        console.error("Save Account Error:", err);
        return { success: false, message: err.message, accounts: [] };
    }
});

ipcMain.handle('delete-account', async (event, id, force = false) => {
    try {
        let accounts = await getActiveAccounts();
        accounts = accounts.filter((a: any) => a.id !== id);
        const syncRes = await saveActiveAccounts(accounts, force);
        return { ...syncRes, accounts };
    } catch (err: any) {
        return { success: false, message: err.message, accounts: [] };
    }
});

ipcMain.handle('update-user-settings', async (event, settings, force = false) => {
    try {
        return await updateUserSettings(settings, force);
    } catch (err: any) {
        return { success: false, message: err.message };
    }
});

ipcMain.handle('update-private-sync-config', async (event, config) => {
    try {
        await updatePrivateSyncConfig(config);
        return { success: true };
    } catch (err: any) {
        return { success: false, message: err.message };
    }
});

ipcMain.handle('test-private-sync-connection', async (event, config) => {
    try {
        return await testPrivateSyncConnection(config);
    } catch (err: any) {
        return { success: false, message: err.message };
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

ipcMain.handle('encrypt-pin', (event, pin) => {
    const { encryptPIN } = require('../core/auth');
    return encryptPIN(pin);
});

ipcMain.handle('decrypt-pin', (event, encryptedPin) => {
    const { decryptPIN } = require('../core/auth');
    return decryptPIN(encryptedPin);
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

ipcMain.handle('perform-vault-import', async (event, salt, encryptedVaultData, password, encryptedSettings, autolock, desktopSettings, webSettings) => {
    return importVaultData(salt, encryptedVaultData, password, encryptedSettings, autolock, desktopSettings, webSettings);
});

ipcMain.handle('verify-backup-file', (event, backupData) => {
    console.log('verify-backup-file called with data:', {
        hasSalt: !!backupData?.salt,
        hasEncryptedVaultData: !!backupData?.encryptedVaultData,
        hasEncryptedSettings: !!backupData?.encryptedSettings,
        hasChecksum: !!backupData?.checksum,
        version: backupData?.version,
        timestamp: backupData?.timestamp,
        accountCount: backupData?.accountCount
    });
    const { verifyBackupFile } = require('../core/auth');
    const result = verifyBackupFile(backupData);
    console.log('verify-backup-file result:', result);
    return result;
});

// Export format handlers
ipcMain.handle('export-qr-html', async (event, accounts) => {
    const { filePath } = await dialog.showSaveDialog(mainWindow!, {
        title: 'Export QR Codes',
        defaultPath: `Keyra_QR_Codes_${Date.now()}.html`,
        filters: [{ name: 'HTML Files', extensions: ['html'] }]
    });

    if (filePath) {
        try {
            const qrCodes = accounts.map((acc: any) => {
                const uri = `otpauth://totp/${encodeURIComponent(acc.issuer)}:${encodeURIComponent(acc.account)}?secret=${acc.secret}&issuer=${encodeURIComponent(acc.issuer)}`;
                return { account: acc, uri };
            });
            
            let html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Keyra Vault - QR Codes</title>
    <style>
        body { font-family: Arial, sans-serif; padding: 40px; }
        .page-break { page-break-after: always; }
        .qr-container { margin-bottom: 60px; text-align: center; }
        .qr-title { font-size: 24px; font-weight: bold; margin-bottom: 10px; }
        .qr-subtitle { font-size: 16px; color: #666; margin-bottom: 20px; }
        .qr-code { margin: 20px auto; }
        .footer { font-size: 12px; color: #999; margin-top: 20px; }
    </style>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
</head>
<body>
    <h1 style="text-align: center; margin-bottom: 40px;">Keyra Authenticator - QR Codes Backup</h1>
    <p style="text-align: center; color: #666; margin-bottom: 60px;">Generated on ${new Date().toLocaleString()}</p>
`;
            
            qrCodes.forEach((item: any, index: number) => {
                html += `
    <div class="qr-container ${index < qrCodes.length - 1 ? 'page-break' : ''}">
        <div class="qr-title">${item.account.issuer}</div>
        <div class="qr-subtitle">${item.account.account}</div>
        <div class="qr-code" id="qr-${index}"></div>
        <div class="footer">Scan this QR code with your authenticator app</div>
    </div>
`;
            });
            
            html += `
    <script>
        ${qrCodes.map((item: any, index: number) => `
        new QRCode(document.getElementById('qr-${index}'), {
            text: '${item.uri}',
            width: 256,
            height: 256
        });
        `).join('\n')}
    </script>
</body>
</html>
`;
            
            fs.writeFileSync(filePath, html);
            return { success: true };
        } catch (e) {
            console.error('Export QR HTML failed:', e);
            return { success: false, message: "Export failed." };
        }
    }
    return { success: false };
});

ipcMain.handle('export-json', async (event, accounts) => {
    const { filePath } = await dialog.showSaveDialog(mainWindow!, {
        title: 'Export as JSON',
        defaultPath: `Keyra_Export_${Date.now()}.json`,
        filters: [{ name: 'JSON Files', extensions: ['json'] }]
    });

    if (filePath) {
        try {
            const data = accounts.map((acc: any) => ({
                issuer: acc.issuer,
                account: acc.account,
                secret: acc.secret,
                type: 'totp',
                algorithm: 'SHA1',
                digits: 6,
                period: 30
            }));
            
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
            return { success: true };
        } catch (e) {
            console.error('Export JSON failed:', e);
            return { success: false, message: "Export failed." };
        }
    }
    return { success: false };
});

ipcMain.handle('export-text', async (event, accounts) => {
    const { filePath } = await dialog.showSaveDialog(mainWindow!, {
        title: 'Export as Text',
        defaultPath: `Keyra_Export_${Date.now()}.txt`,
        filters: [{ name: 'Text Files', extensions: ['txt'] }]
    });

    if (filePath) {
        try {
            let text = `Keyra Authenticator - Vault Export\n`;
            text += `Generated: ${new Date().toLocaleString()}\n`;
            text += `Total Accounts: ${accounts.length}\n`;
            text += `\n${'='.repeat(60)}\n\n`;
            
            accounts.forEach((acc: any, index: number) => {
                text += `${index + 1}. ${acc.issuer}\n`;
                text += `   Account: ${acc.account}\n`;
                text += `   Secret: ${acc.secret}\n`;
                text += `   URI: otpauth://totp/${encodeURIComponent(acc.issuer)}:${encodeURIComponent(acc.account)}?secret=${acc.secret}&issuer=${encodeURIComponent(acc.issuer)}\n`;
                text += `\n`;
            });
            
            text += `${'='.repeat(60)}\n`;
            text += `\nIMPORTANT: Keep this file secure. It contains sensitive authentication data.\n`;
            
            fs.writeFileSync(filePath, text);
            return { success: true };
        } catch (e) {
            console.error('Export text failed:', e);
            return { success: false, message: "Export failed." };
        }
    }
    return { success: false };
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

// -- Update System IPC --
ipcMain.handle('check-for-updates', async () => {
    try {
        return await autoUpdater.checkForUpdates();
    } catch (err: any) {
        mainWindow?.webContents.send('update-error', err.message);
    }
});

ipcMain.handle('start-download', async () => {
    try {
        return await autoUpdater.downloadUpdate();
    } catch (err: any) {
        console.error('[AutoUpdater] Download failed:', err.message);
        mainWindow?.webContents.send('update-error', err.message);
    }
});

ipcMain.handle('install-update', () => {
    autoUpdater.quitAndInstall();
});

// -- System Integration IPC --
ipcMain.handle('set-launch-on-startup', (event, enabled) => {
    app.setLoginItemSettings({
        openAtLogin: enabled,
        path: app.getPath('exe')
    });
    return true;
});

ipcMain.handle('set-minimize-to-tray', (event, enabled) => {
    if (enabled && !tray) createTray();
    else if (!enabled && tray) {
        tray.destroy();
        tray = null;
    }
    return true;
});

ipcMain.handle('set-global-hotkey', (event, enabled) => {
    if (enabled) setupGlobalShortcut();
    else globalShortcut.unregister('Alt+Shift+K');
    return true;
});

ipcMain.handle('open-external', async (event, url) => {
    try {
        await shell.openExternal(url);
        return true;
    } catch (e) {
        console.error('Failed to open external URL:', e);
        return false;
    }
});

function createTray() {
    if (tray) return;

    const iconPath = path.join(__dirname, '../../assets/icon.png');
    if (!fs.existsSync(iconPath)) return;

    const icon = nativeImage.createFromPath(iconPath);
    tray = new Tray(icon.resize({ width: 16, height: 16 }));
    
    const contextMenu = Menu.buildFromTemplate([
        { label: 'Show Keyra', click: () => mainWindow?.show() },
        { type: 'separator' },
        { label: 'Quit', click: () => {
            isQuitting = true;
            app.quit();
        }}
    ]);

    tray.setToolTip('Keyra Authenticator');
    tray.setContextMenu(contextMenu);
    
    tray.on('click', () => {
        if (mainWindow?.isVisible()) mainWindow.hide();
        else mainWindow?.show();
    });
}

function setupGlobalShortcut() {
    globalShortcut.register('Alt+Shift+K', () => {
        if (mainWindow?.isVisible()) {
            mainWindow.hide();
        } else {
            mainWindow?.show();
            mainWindow?.focus();
        }
    });
}
