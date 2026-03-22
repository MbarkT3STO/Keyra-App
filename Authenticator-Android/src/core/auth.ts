import { Buffer } from 'buffer';
import { getUsers, saveUsers, getUserData, syncUserData, renameUserFolder } from './storage';
import type { UserRecord, DeviceRecord } from './storage';
import { hashPassword, verifyPassword, deriveKey, encryptVault, decryptVault } from './crypto';
import type { AuthenticatorAccount } from './crypto';
import { v4 as uuidv4 } from 'uuid';
import { sendActivationEmail } from './mailer';

let currentUser: UserRecord | null = null;
let currentKey: Buffer | null = null;

async function deliverActivationCode(email: string, code: string) {
    return sendActivationEmail({ to: email, subject: 'Activate Your Keyra Vault', code });
}

export function getCurrentUser() {
    if (!currentUser) return null;
    return {
        id: currentUser.id,
        username: currentUser.username,
        email: currentUser.email,
        pendingEmail: currentUser.pendingEmail,
        settings: currentUser["Android Settings"],
        autolock: currentUser.autolock,
        profilePicture: currentUser.profilePicture,
        devices: currentUser.devices
    };
}

export async function cancelEmailChange(): Promise<{ success: boolean, message: string }> {
    if (!currentUser) throw new Error("No active user session.");
    const users = await getUsers();
    const userIndex = users.findIndex(u => u.id === currentUser!.id);
    if (userIndex === -1) throw new Error("User missing from storage.");
    delete users[userIndex].pendingEmail;
    delete users[userIndex].emailChangeCode;
    delete currentUser.pendingEmail;
    await saveUsers(users);
    await syncUserData(currentUser.username, users[userIndex]);
    return { success: true, message: "Pending email change cancelled." };
}

export async function signup(username: string, email: string, password: string): Promise<{ success: boolean, message: string }> {
    const users = await getUsers();
    if (users.find(u => u.username === username || u.email === email)) {
        return { success: false, message: "Username or email already exists." };
    }
    const { hash, salt } = hashPassword(password);
    const activationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const initialKey = deriveKey(password, salt);
    const encryptedVaultData = encryptVault(JSON.stringify([]), initialKey);
    const newUser: UserRecord = {
        id: uuidv4(), username, email, hash, salt,
        isActivated: false, activationCode, encryptedVaultData, autolock: '0'
    };
    users.push(newUser);
    await saveUsers(users);
    await syncUserData(username, newUser);
    deliverActivationCode(email, activationCode);
    return { success: true, message: "Account created. Check your email." };
}

export async function resendCode(email: string): Promise<{ success: boolean, message: string }> {
    const users = await getUsers();
    const userIndex = users.findIndex(u => u.email === email);
    if (userIndex === -1) return { success: false, message: "User not found." };
    if (users[userIndex].isActivated) return { success: false, message: "Account already activated." };
    const newCode = Math.floor(100000 + Math.random() * 900000).toString();
    users[userIndex].activationCode = newCode;
    await saveUsers(users);
    deliverActivationCode(email, newCode);
    return { success: true, message: "Verification code sent." };
}

export async function verifyEmail(email: string, code: string): Promise<{ success: boolean, message: string }> {
    const users = await getUsers();
    const userIndex = users.findIndex(u => u.email === email);
    if (userIndex === -1) return { success: false, message: "User not found." };
    if (users[userIndex].isActivated) return { success: false, message: "Account already activated." };
    if (users[userIndex].activationCode === code) {
        users[userIndex].isActivated = true;
        delete users[userIndex].activationCode;
        await saveUsers(users);
        await syncUserData(users[userIndex].username, users[userIndex]);
        return { success: true, message: "Account activated successfully." };
    }
    return { success: false, message: "Invalid activation code." };
}

export async function login(username: string, password: string): Promise<{ success: boolean, message: string }> {
    const users = await getUsers();
    const localUser = users.find(u => u.username === username);

    const individualData = await getUserData(username);

    let user: UserRecord | undefined;
    if (individualData) {
        user = {
            ...(localUser || {}),
            ...individualData,
            hash: individualData.hash,
            salt: individualData.salt,
            encryptedVaultData: individualData.encryptedVaultData,
            isActivated: individualData.isActivated,
        } as UserRecord;
    } else if (localUser) {
        user = localUser;
    }

    if (!user) return { success: false, message: "Invalid credentials." };
    if (!user.isActivated) return { success: false, message: "Please verify your email first." };
    if (!verifyPassword(password, user.hash, user.salt)) return { success: false, message: "Invalid credentials." };

    try {
        const key = deriveKey(password, user.salt);
        decryptVault(user.encryptedVaultData, key); // validate vault is intact

        const userIndex = users.findIndex(u => u.username === username);
        if (userIndex >= 0) { users[userIndex] = user!; } else { users.push(user!); }
        await saveUsers(users);

        currentUser = user!;
        currentKey = key;
        localStorage.setItem('active_session_user', currentUser.username);
        localStorage.setItem('active_session_key', key.toString('base64'));
        localStorage.setItem('active_session_timestamp', Date.now().toString());
        registerCurrentDevice().catch(() => {});
        return { success: true, message: "Login successful." };
    } catch {
        return { success: false, message: "Data corrupted." };
    }
}

export async function verifyMasterPassword(password: string): Promise<{ success: boolean, message: string }> {
    if (!currentUser) return { success: false, message: "No active user session." };
    if (!verifyPassword(password, currentUser.hash, currentUser.salt)) {
        return { success: false, message: "Incorrect password." };
    }
    return { success: true, message: "Password verified." };
}

export function encryptPIN(pin: string): string {
    if (!currentKey) throw new Error("No active user session.");
    return encryptVault(pin, currentKey);
}

export function decryptPIN(encryptedPin: string): string {
    if (!currentKey) throw new Error("No active user session.");
    return decryptVault(encryptedPin, currentKey);
}

export async function checkSession(): Promise<{ success: boolean, message: string }> {
    const savedUser = localStorage.getItem('active_session_user');
    const savedKey = localStorage.getItem('active_session_key');
    const sessionTimestamp = localStorage.getItem('active_session_timestamp');
    if (savedUser && savedKey) {
        if (sessionTimestamp) {
            const sessionAge = Date.now() - parseInt(sessionTimestamp);
            if (sessionAge > 30 * 24 * 60 * 60 * 1000) {
                logout();
                return { success: false, message: "Session expired. Please login again." };
            }
        }
        try {
            // individual file is authoritative — fetch it first
            const individualData = await getUserData(savedUser);
            const users = await getUsers();
            const localUser = users.find(u => u.username === savedUser);

            let user: UserRecord | undefined;
            if (individualData) {
                user = {
                    ...(localUser || {}),
                    ...individualData,
                    hash: individualData.hash,
                    salt: individualData.salt,
                    encryptedVaultData: individualData.encryptedVaultData,
                    isActivated: individualData.isActivated,
                } as UserRecord;
            } else if (localUser) {
                user = localUser;
            }

            if (user) {
                const userIndex = users.findIndex(u => u.username === savedUser);
                if (userIndex >= 0) { users[userIndex] = user; await saveUsers(users); }
                currentUser = user;
                currentKey = Buffer.from(savedKey, 'base64');
                localStorage.setItem('active_session_timestamp', Date.now().toString());
                const deviceId = getCurrentDeviceId();
                if ((currentUser.revokedDevices || []).includes(deviceId)) {
                    logout();
                    return { success: false, message: "This device has been revoked." };
                }
                registerCurrentDevice().catch(() => {});
                return { success: true, message: "Session resumed." };
            }
        } catch (e) {
            console.error("Session resume failed:", e);
        }
    }
    return { success: false, message: "No active session." };
}

export function logout(): void {
    currentUser = null;
    currentKey = null;
    localStorage.removeItem('active_session_user');
    localStorage.removeItem('active_session_key');
    localStorage.removeItem('active_session_timestamp');
}

export async function getActiveAccounts(): Promise<AuthenticatorAccount[]> {
    if (!currentUser || !currentKey) throw new Error("No active user session.");
    try {
        const users = await getUsers();
        const freshUser = users.find(u => u.id === currentUser!.id);
        if (!freshUser) throw new Error("User missing from storage");
        const jsonStr = decryptVault(freshUser.encryptedVaultData, currentKey);
        return JSON.parse(jsonStr) as AuthenticatorAccount[];
    } catch (err) {
        console.error("getActiveAccounts failed:", err);
        return [];
    }
}

export async function saveActiveAccounts(accounts: AuthenticatorAccount[]): Promise<void> {
    if (!currentUser || !currentKey) throw new Error("No active user session.");
    const users = await getUsers();
    const userIndex = users.findIndex(u => u.id === currentUser!.id);
    if (userIndex === -1) throw new Error("User missing from storage.");
    const newEncryptedVault = encryptVault(JSON.stringify(accounts), currentKey);
    users[userIndex].encryptedVaultData = newEncryptedVault;
    currentUser.encryptedVaultData = newEncryptedVault;
    await saveUsers(users);
    await syncUserData(currentUser.username, users[userIndex]);
}

export async function updateUserSettings(settings: any): Promise<void> {
    if (!currentUser) throw new Error("No active user session.");
    const users = await getUsers();
    const userIndex = users.findIndex(u => u.id === currentUser!.id);
    if (userIndex === -1) throw new Error("User missing from storage.");
    if (settings["Android Settings"]) { users[userIndex]["Android Settings"] = settings["Android Settings"]; currentUser["Android Settings"] = settings["Android Settings"]; }
    if (settings["Web Settings"]) { users[userIndex]["Web Settings"] = settings["Web Settings"]; currentUser["Web Settings"] = settings["Web Settings"]; }
    if (settings["Desktop Settings"]) { users[userIndex]["Desktop Settings"] = settings["Desktop Settings"]; currentUser["Desktop Settings"] = settings["Desktop Settings"]; }
    const hasNamespace = settings["Android Settings"] || settings["Web Settings"] || settings["Desktop Settings"];
    if (!hasNamespace) { users[userIndex]["Android Settings"] = settings; currentUser["Android Settings"] = settings; }
    await saveUsers(users);
    await syncUserData(currentUser.username, users[userIndex]);
}

export function getBackupData(): {
    version: string; timestamp: number; accountCount: number;
    salt: string; encryptedVaultData: string; encryptedSettings?: string; checksum: string;
} {
    if (!currentUser || !currentKey) throw new Error("No active user session.");
    const settings = {
        autolock: currentUser.autolock,
        "Desktop Settings": currentUser["Desktop Settings"],
        "Web Settings": currentUser["Web Settings"],
        "Android Settings": currentUser["Android Settings"]
    };
    const encryptedSettings = encryptVault(JSON.stringify(settings), currentKey);
    let accountCount = 0;
    try {
        const decrypted = decryptVault(currentUser.encryptedVaultData, currentKey);
        const accounts = JSON.parse(decrypted);
        accountCount = Array.isArray(accounts) ? accounts.length : 0;
    } catch {}
    const backup = { version: "1.2.0", timestamp: Date.now(), accountCount, salt: currentUser.salt, encryptedVaultData: currentUser.encryptedVaultData, encryptedSettings };
    const checksum = generateChecksum(backup.salt + backup.encryptedVaultData + backup.encryptedSettings);
    return { ...backup, checksum };
}

function generateChecksum(data: string): string {
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
        hash = ((hash << 5) - hash) + data.charCodeAt(i);
        hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(8, '0');
}

export function verifyBackupFile(backupData: any): {
    valid: boolean; version?: string; timestamp?: number; accountCount?: number;
    encrypted: boolean; hasChecksum: boolean; checksumValid?: boolean; error?: string;
} {
    try {
        if (!backupData.salt || !backupData.encryptedVaultData) {
            return { valid: false, encrypted: false, hasChecksum: false, error: "Invalid backup format: missing required fields" };
        }
        const encrypted = !!backupData.encryptedSettings;
        const hasChecksum = !!backupData.checksum;
        let checksumValid = false;
        if (hasChecksum) {
            checksumValid = generateChecksum(backupData.salt + backupData.encryptedVaultData + (backupData.encryptedSettings || '')) === backupData.checksum;
        }
        return { valid: true, version: backupData.version || "1.0.0", timestamp: backupData.timestamp, accountCount: backupData.accountCount, encrypted, hasChecksum, checksumValid: hasChecksum ? checksumValid : undefined };
    } catch {
        return { valid: false, encrypted: false, hasChecksum: false, error: "Failed to parse backup file" };
    }
}

export async function importVaultData(
    salt: string, encryptedVaultData: string, password: string,
    encryptedSettings?: string, autolock?: string, desktopSettings?: any, webSettings?: any
): Promise<{ success: boolean, message: string, restoredSettings?: any }> {
    if (!currentUser || !currentKey) throw new Error("No active user session.");
    try {
        const key = deriveKey(password, salt);

        // Decrypt vault first — if password is wrong this throws before any writes
        const decryptedJson = decryptVault(encryptedVaultData, key);
        const accounts = JSON.parse(decryptedJson) as AuthenticatorAccount[];

        // Decrypt settings before any writes (fail fast, no partial state)
        let restoredSettings: any = null;
        if (encryptedSettings) {
            try {
                restoredSettings = JSON.parse(decryptVault(encryptedSettings, key));
            } catch {
                return { success: false, message: "Failed to decrypt backup settings. Wrong password?" };
            }
        }

        // All decryption succeeded — now commit to storage
        await saveActiveAccounts(accounts);

        const users = await getUsers();
        const userIndex = users.findIndex(u => u.id === currentUser!.id);
        if (userIndex !== -1) {
            if (restoredSettings) {
                if (restoredSettings.autolock !== undefined) { users[userIndex].autolock = restoredSettings.autolock; currentUser.autolock = restoredSettings.autolock; }
                if (restoredSettings["Desktop Settings"]) { users[userIndex]["Desktop Settings"] = restoredSettings["Desktop Settings"]; currentUser["Desktop Settings"] = restoredSettings["Desktop Settings"]; }
                if (restoredSettings["Web Settings"]) { users[userIndex]["Web Settings"] = restoredSettings["Web Settings"]; currentUser["Web Settings"] = restoredSettings["Web Settings"]; }
                if (restoredSettings["Android Settings"]) { users[userIndex]["Android Settings"] = restoredSettings["Android Settings"]; currentUser["Android Settings"] = restoredSettings["Android Settings"]; }
            } else if (autolock !== undefined || desktopSettings || webSettings) {
                if (autolock !== undefined) { users[userIndex].autolock = autolock; currentUser.autolock = autolock; }
                if (desktopSettings) { users[userIndex]["Desktop Settings"] = desktopSettings; currentUser["Desktop Settings"] = desktopSettings; }
                if (webSettings) { users[userIndex]["Web Settings"] = webSettings; currentUser["Web Settings"] = webSettings; }
                // Build restoredSettings for UI application
                restoredSettings = { autolock, "Desktop Settings": desktopSettings, "Web Settings": webSettings };
            }
            await saveUsers(users);
            await syncUserData(currentUser.username, users[userIndex]);
        }

        return { success: true, message: "Vault and settings successfully restored.", restoredSettings };
    } catch (err) {
        console.error("Vault Import Error:", err);
        return { success: false, message: "Decryption failed. Check your password and try again." };
    }
}

export async function changePassword(newPassword: string): Promise<{ success: boolean, message: string }> {
    if (!currentUser || !currentKey) throw new Error("No active user session.");
    if (newPassword.length < 8) return { success: false, message: "Password must be at least 8 characters." };
    try {
        const users = await getUsers();
        const userIndex = users.findIndex(u => u.id === currentUser!.id);
        if (userIndex === -1) throw new Error("User missing from storage.");
        const accounts = await getActiveAccounts();
        const { hash, salt } = hashPassword(newPassword);
        const newKey = deriveKey(newPassword, salt);
        const newEncryptedVault = encryptVault(JSON.stringify(accounts), newKey);
        users[userIndex].hash = hash; users[userIndex].salt = salt; users[userIndex].encryptedVaultData = newEncryptedVault;
        currentUser.hash = hash; currentUser.salt = salt; currentUser.encryptedVaultData = newEncryptedVault;
        currentKey = newKey;
        await saveUsers(users);
        await syncUserData(currentUser.username, users[userIndex]);
        localStorage.setItem('active_session_key', newKey.toString('base64'));
        return { success: true, message: "Password changed successfully." };
    } catch (err) {
        console.error("Password change failed:", err);
        return { success: false, message: "Failed to change password." };
    }
}

export async function changeUsername(newUsername: string): Promise<{ success: boolean, message: string }> {
    if (!currentUser) throw new Error("No active user session.");
    const users = await getUsers();
    if (users.find(u => u.username === newUsername)) return { success: false, message: "Username already in use." };
    const userIndex = users.findIndex(u => u.id === currentUser!.id);
    if (userIndex === -1) throw new Error("User missing from storage.");
    const oldUsername = currentUser.username;
    users[userIndex].username = newUsername;
    currentUser.username = newUsername;
    await saveUsers(users);
    await renameUserFolder(oldUsername, newUsername);
    await syncUserData(newUsername, users[userIndex]);
    localStorage.setItem('active_session_user', newUsername);
    return { success: true, message: "Display name updated." };
}

export async function updateProfilePicture(base64Image: string): Promise<{ success: boolean, message: string }> {
    if (!currentUser) throw new Error("No active user session.");
    const users = await getUsers();
    const userIndex = users.findIndex(u => u.id === currentUser!.id);
    if (userIndex === -1) throw new Error("User missing from storage.");
    users[userIndex].profilePicture = base64Image;
    currentUser.profilePicture = base64Image;
    await saveUsers(users);
    await syncUserData(currentUser.username, users[userIndex]);
    return { success: true, message: "Profile photo updated." };
}

export async function requestEmailChange(newEmail: string): Promise<{ success: boolean, message: string, code?: string }> {
    if (!currentUser) throw new Error("No active user session.");
    const users = await getUsers();
    const userIndex = users.findIndex(u => u.id === currentUser!.id);
    if (userIndex === -1) throw new Error("User missing from storage.");
    const user = users[userIndex];
    if (user.pendingEmail) return { success: false, message: "A change is already pending. Please confirm or cancel it first." };
    if (users.find(u => u.email === newEmail)) return { success: false, message: "Email already in use." };
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    user.pendingEmail = newEmail; user.emailChangeCode = code;
    await saveUsers(users);
    await syncUserData(currentUser.username, user);
    deliverActivationCode(newEmail, code);
    return { success: true, message: "Verification code sent to new email.", code };
}

export async function confirmEmailChange(code: string): Promise<{ success: boolean, message: string }> {
    if (!currentUser) throw new Error("No active user session.");
    const users = await getUsers();
    const userIndex = users.findIndex(u => u.id === currentUser!.id);
    if (userIndex === -1) throw new Error("User missing from storage.");
    const user = users[userIndex];
    if (!user.pendingEmail || !user.emailChangeCode) return { success: false, message: "No pending email change." };
    if (user.emailChangeCode !== code) return { success: false, message: "Invalid verification code." };
    user.email = user.pendingEmail;
    delete user.pendingEmail; delete user.emailChangeCode;
    currentUser.email = user.email;
    await saveUsers(users);
    await syncUserData(currentUser.username, users[userIndex]);
    return { success: true, message: "Email changed successfully." };
}

export async function pollForUpdates(): Promise<{ changed: boolean, settings?: any }> {
    if (!currentUser) return { changed: false };
    try {
        const cloudData = await getUserData(currentUser.username);
        if (!cloudData) return { changed: false };
        const vaultChanged = cloudData.encryptedVaultData && cloudData.encryptedVaultData !== currentUser.encryptedVaultData;
        const androidSettingsChanged = cloudData["Android Settings"] && JSON.stringify(cloudData["Android Settings"]) !== JSON.stringify(currentUser["Android Settings"]);
        if (!vaultChanged && !androidSettingsChanged) return { changed: false };
        const users = await getUsers();
        const userIndex = users.findIndex(u => u.id === currentUser!.id);
        if (userIndex !== -1) {
            const merged: UserRecord = { ...users[userIndex], ...cloudData, hash: users[userIndex].hash, salt: users[userIndex].salt };
            users[userIndex] = merged;
            await saveUsers(users);
            currentUser = merged;
        }
        return { changed: true, settings: cloudData["Android Settings"] ?? undefined };
    } catch (e) {
        console.error('pollForUpdates failed:', e);
        return { changed: false };
    }
}

export async function resendEmailChangeCode(): Promise<{ success: boolean, message: string, code?: string }> {
    if (!currentUser) throw new Error("No active user session.");
    const users = await getUsers();
    const userIndex = users.findIndex(u => u.id === currentUser!.id);
    if (userIndex === -1) throw new Error("User missing from storage.");
    const user = users[userIndex];
    if (!user.pendingEmail) return { success: false, message: "No pending email change." };
    const newCode = Math.floor(100000 + Math.random() * 900000).toString();
    user.emailChangeCode = newCode;
    await saveUsers(users);
    await syncUserData(currentUser.username, users[userIndex]);
    deliverActivationCode(user.pendingEmail, newCode);
    return { success: true, message: "New verification code sent.", code: newCode };
}

// ─── Device Management ────────────────────────────────────────────────────────

const DEVICE_ID_KEY = '__keyra_device_id__';

export function getCurrentDeviceId(): string {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
        id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
        localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
}

function getDeviceName(platform: string): string {
    // Try to extract a meaningful model name from the UA string
    const ua = navigator.userAgent;
    if (platform === 'android') {
        // UA format: "... (Linux; Android X; MODEL Build/...)"
        const match = ua.match(/;\s*([^;)]+)\s+Build\//);
        if (match) return match[1].trim();
        return 'Android Device';
    }
    if (platform === 'ios') {
        if (/ipad/i.test(ua)) return 'iPad';
        return 'iPhone';
    }
    return 'Web Browser';
}

export async function registerCurrentDevice(): Promise<void> {
    if (!currentUser) return;
    const id = getCurrentDeviceId();
    const now = new Date().toISOString();
    const ua = navigator.userAgent;
    let platform = 'web';
    if (/android/i.test(ua)) platform = 'android';
    else if (/iphone|ipad/i.test(ua)) platform = 'ios';

    const users = await getUsers();
    const userIndex = users.findIndex(u => u.id === currentUser!.id);
    if (userIndex === -1) return;
    const devices: DeviceRecord[] = users[userIndex].devices || [];
    const existing = devices.findIndex(d => d.id === id);

    if (existing >= 0) {
        devices[existing].lastSeen = now;
        devices[existing].platform = platform;
        // Only update name if it's still the generic default (preserve user-renamed devices)
        if (['Android Device', 'iOS Device', 'iPhone', 'iPad', 'Web Browser'].includes(devices[existing].name) || !devices[existing].name) {
            devices[existing].name = getDeviceName(platform);
        }
    } else {
        devices.push({ id, name: getDeviceName(platform), platform, firstSeen: now, lastSeen: now });
    }

    users[userIndex].devices = devices;
    currentUser.devices = devices;
    await saveUsers(users);
    syncUserData(currentUser.username, users[userIndex]).catch(() => {});
}

export async function renameDevice(deviceId: string, newName: string): Promise<{ success: boolean, message: string }> {
    if (!currentUser) throw new Error("No active user session.");
    const trimmed = newName.trim();
    if (!trimmed || trimmed.length > 32) return { success: false, message: 'Name must be 1–32 characters.' };
    const users = await getUsers();
    const userIndex = users.findIndex(u => u.id === currentUser!.id);
    if (userIndex === -1) throw new Error("User missing from storage.");
    const devices: DeviceRecord[] = users[userIndex].devices || [];
    const idx = devices.findIndex(d => d.id === deviceId);
    if (idx === -1) return { success: false, message: 'Device not found.' };
    devices[idx].name = trimmed;
    users[userIndex].devices = devices;
    currentUser.devices = devices;
    await saveUsers(users);
    syncUserData(currentUser.username, users[userIndex]).catch(() => {});
    return { success: true, message: 'Device renamed.' };
}

export async function revokeDevice(deviceId: string): Promise<{ success: boolean, message: string }> {
    if (!currentUser) throw new Error("No active user session.");
    const users = await getUsers();
    const userIndex = users.findIndex(u => u.id === currentUser!.id);
    if (userIndex === -1) throw new Error("User missing from storage.");
    const before = (users[userIndex].devices || []).length;
    users[userIndex].devices = (users[userIndex].devices || []).filter(d => d.id !== deviceId);
    if (users[userIndex].devices.length === before) return { success: false, message: "Device not found." };
    const revoked = users[userIndex].revokedDevices || [];
    if (!revoked.includes(deviceId)) revoked.push(deviceId);
    users[userIndex].revokedDevices = revoked;
    currentUser.devices = users[userIndex].devices;
    currentUser.revokedDevices = revoked;
    await saveUsers(users);
    await syncUserData(currentUser.username, users[userIndex]);
    return { success: true, message: "Device removed." };
}
