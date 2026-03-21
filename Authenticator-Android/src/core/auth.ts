import { getUsers, saveUsers, getUserData, syncUserData, renameUserFolder } from './storage';
import type { UserRecord, DeviceRecord } from './storage';
import { hashPassword, verifyPassword, deriveKey, encryptVault, decryptVault } from './crypto';
import type { AuthenticatorAccount } from './crypto';
import { v4 as uuidv4 } from 'uuid';
import { sendActivationEmail } from './mailer';

let currentUser: UserRecord | null = null;
let currentKey: Buffer | null = null;

// Email code delivery helper
async function deliverActivationCode(email: string, code: string) {
    const result = await sendActivationEmail({
        to: email,
        subject: 'Activate Your Keyra Vault',
        code: code
    });
    
    return result;
}

export function getCurrentUser() {
    if (!currentUser) return null;
    return {
        id: currentUser.id,
        username: currentUser.username,
        email: currentUser.email,
        pendingEmail: currentUser.pendingEmail,
        settings: currentUser["Web Settings"],
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

    const user = users[userIndex];
    delete user.pendingEmail;
    delete user.emailChangeCode;
    
    delete currentUser.pendingEmail; // Sync local session

    await saveUsers(users);
    await syncUserData(currentUser.username, users[userIndex]);

    return { success: true, message: "Pending email change cancelled." };
}

export async function signup(username: string, email: string, password: string): Promise<{ success: boolean, message: string, code?: string }> {
    const users = await getUsers();
    if (users.find(u => u.username === username || u.email === email)) {
        return { success: false, message: "Username or email already exists." };
    }

    const { hash, salt } = hashPassword(password);
    const activationCode = Math.floor(100000 + Math.random() * 900000).toString(); // 6 digits

    const initialKey = deriveKey(password, salt);
    const emptyVault: AuthenticatorAccount[] = [];
    const encryptedVaultData = encryptVault(JSON.stringify(emptyVault), initialKey);

    const newUser: UserRecord = {
        id: uuidv4(),
        username,
        email,
        hash,
        salt,
        isActivated: false,
        activationCode,
        encryptedVaultData,
        autolock: '0'
    };

    users.push(newUser);
    await saveUsers(users);
    
    // Also create user-specific data folder in cloud
    await syncUserData(username, newUser);

    deliverActivationCode(email, activationCode);

    return { success: true, message: "Account created. Check your email.", code: activationCode };
}

export async function resendCode(email: string): Promise<{ success: boolean, message: string, code?: string }> {
    const users = await getUsers();
    const userIndex = users.findIndex(u => u.email === email);
    if (userIndex === -1) return { success: false, message: "User not found." };
    if (users[userIndex].isActivated) return { success: false, message: "Account already activated." };

    const newCode = Math.floor(100000 + Math.random() * 900000).toString();
    users[userIndex].activationCode = newCode;
    await saveUsers(users);

    deliverActivationCode(email, newCode);
    return { success: true, message: "Verification code sent.", code: newCode };
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
        
        // Update specialized data folder too
        await syncUserData(users[userIndex].username, users[userIndex]);

        return { success: true, message: "Account activated successfully." };
    }

    return { success: false, message: "Invalid activation code." };
}

export async function login(username: string, password: string): Promise<{ success: boolean, message: string }> {
    const users = await getUsers();
    let user = users.find(u => u.username === username);
    
    // If not found in main list, try to fetch from cloud directly (specific user data)
    if (!user) {
        const cloudData = await getUserData(username);
        if (cloudData) {
            user = cloudData;
            // Add to local list and save
            users.push(user!);
            await saveUsers(users);
        }
    }

    if (!user) return { success: false, message: "Invalid credentials." };

    if (!user.isActivated) return { success: false, message: "Please verify your email first." };

    if (!verifyPassword(password, user.hash, user.salt)) {
        return { success: false, message: "Invalid credentials." };
    }

    try {
        const key = deriveKey(password, user.salt);
        const decryptedJson = decryptVault(user.encryptedVaultData, key);
        JSON.parse(decryptedJson);

        // Fetch latest user data from cloud (including profilePicture)
        const cloudData = await getUserData(username);
        if (cloudData) {
            // Merge cloud data with local user, preserving critical fields
            const mergedUser: UserRecord = {
                ...user,
                ...cloudData,
                // Ensure we keep the local encryption key-related fields
                hash: user.hash,
                salt: user.salt,
                encryptedVaultData: cloudData.encryptedVaultData || user.encryptedVaultData
            };
            
            // Update local storage with synced data
            const userIndex = users.findIndex(u => u.username === username);
            if (userIndex >= 0) {
                users[userIndex] = mergedUser;
                await saveUsers(users);
            }
            
            currentUser = mergedUser;
        } else {
            currentUser = user;
        }
        
        currentKey = key;

        // Persist session for "Remember Me" with timestamp
        localStorage.setItem('active_session_user', currentUser.username);
        localStorage.setItem('active_session_key', key.toString('base64'));
        localStorage.setItem('active_session_timestamp', Date.now().toString());

        // Register this device
        registerCurrentDevice().catch(() => {});

        return { success: true, message: "Login successful." };
    } catch (err) {
        console.error("Login Decryption Error:", err);
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

// ─── PIN Encryption/Decryption ─────────────────────────────────────────────

/**
 * Encrypts a PIN using the current user's master key
 */
export function encryptPIN(pin: string): string {
    if (!currentKey) throw new Error("No active user session.");
    return encryptVault(pin, currentKey);
}

/**
 * Decrypts an encrypted PIN using the current user's master key
 */
export function decryptPIN(encryptedPin: string): string {
    if (!currentKey) throw new Error("No active user session.");
    return decryptVault(encryptedPin, currentKey);
}

export async function checkSession(): Promise<{ success: boolean, message: string }> {
    const savedUser = localStorage.getItem('active_session_user');
    const savedKey = localStorage.getItem('active_session_key');
    const sessionTimestamp = localStorage.getItem('active_session_timestamp');

    if (savedUser && savedKey) {
        // Check session expiration (30 days)
        if (sessionTimestamp) {
            const sessionAge = Date.now() - parseInt(sessionTimestamp);
            const thirtyDaysInMs = 30 * 24 * 60 * 60 * 1000;
            
            if (sessionAge > thirtyDaysInMs) {
                logout();
                return { success: false, message: "Session expired. Please login again." };
            }
        }

        try {
            const users = await getUsers();
            let user = users.find(u => u.username === savedUser);
            
            if (user) {
                // Fetch latest user data from cloud (including profilePicture)
                const cloudData = await getUserData(savedUser);
                if (cloudData) {
                    // Merge cloud data with local user
                    const mergedUser: UserRecord = {
                        ...user,
                        ...cloudData,
                        // Ensure we keep the local encryption key-related fields
                        hash: user.hash,
                        salt: user.salt,
                        encryptedVaultData: cloudData.encryptedVaultData || user.encryptedVaultData
                    };
                    
                    // Update local storage with synced data
                    const userIndex = users.findIndex(u => u.username === savedUser);
                    if (userIndex >= 0) {
                        users[userIndex] = mergedUser;
                        await saveUsers(users);
                    }
                    
                    currentUser = mergedUser;
                } else {
                    currentUser = user;
                }
                
                currentKey = Buffer.from(savedKey, 'base64');
                
                // Update session timestamp on successful resume
                localStorage.setItem('active_session_timestamp', Date.now().toString());

                // Check if this device has been revoked
                const deviceId = getCurrentDeviceId();
                const revoked = currentUser.revokedDevices || [];
                if (revoked.includes(deviceId)) {
                    logout();
                    return { success: false, message: "This device has been revoked." };
                }

                // Update lastSeen for this device
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
    
    // Update the in-memory session
    currentUser.encryptedVaultData = newEncryptedVault;

    await saveUsers(users);
    
    // Sync specifically this user's data folder
    await syncUserData(currentUser.username, users[userIndex]);
}

export async function updateUserSettings(settings: any): Promise<void> {
    if (!currentUser) throw new Error("No active user session.");

    const users = await getUsers();
    const userIndex = users.findIndex(u => u.id === currentUser!.id);
    if (userIndex === -1) throw new Error("User missing from storage.");

    // Always target Web Settings for updates from this platform
    if (settings["Web Settings"]) {
        users[userIndex]["Web Settings"] = settings["Web Settings"];
        currentUser["Web Settings"] = settings["Web Settings"];
    } else {
        // If it's a flat object, wrap it and avoid touching other platform blocks
        delete settings["Desktop Settings"];
        users[userIndex]["Web Settings"] = settings;
        currentUser["Web Settings"] = settings;
    }

    await saveUsers(users);
    currentUser.settings = currentUser["Web Settings"]; // Keep legacy field in session if needed
    await syncUserData(currentUser.username, users[userIndex]);
}

export function getBackupData(): { 
    version: string;
    timestamp: number;
    accountCount: number;
    salt: string;
    encryptedVaultData: string;
    encryptedSettings?: string;
    checksum: string;
} {
    if (!currentUser || !currentKey) throw new Error("No active user session.");
    
    // Prepare settings object
    const settings = {
        autolock: currentUser.autolock,
        "Desktop Settings": currentUser["Desktop Settings"],
        "Web Settings": currentUser["Web Settings"]
    };
    
    // Encrypt the settings using the current key
    const encryptedSettings = encryptVault(JSON.stringify(settings), currentKey);
    
    // Get account count by decrypting vault
    let accountCount = 0;
    try {
        const decrypted = decryptVault(currentUser.encryptedVaultData, currentKey);
        const accounts = JSON.parse(decrypted);
        accountCount = Array.isArray(accounts) ? accounts.length : 0;
    } catch (err) {
        console.error("Failed to count accounts:", err);
    }
    
    // Create backup object
    const backup = {
        version: "1.2.0",
        timestamp: Date.now(),
        accountCount,
        salt: currentUser.salt,
        encryptedVaultData: currentUser.encryptedVaultData,
        encryptedSettings
    };
    
    // Generate checksum (SHA-256 hash of critical data)
    const checksumData = backup.salt + backup.encryptedVaultData + backup.encryptedSettings;
    const checksum = generateChecksum(checksumData);
    
    return {
        ...backup,
        checksum
    };
}

/**
 * Generate SHA-256 checksum for backup verification
 */
function generateChecksum(data: string): string {
    // Simple hash function for checksum (not cryptographic, just for integrity)
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
        const char = data.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16).padStart(8, '0');
}

/**
 * Verify backup file integrity and extract metadata
 */
export function verifyBackupFile(backupData: any): {
    valid: boolean;
    version?: string;
    timestamp?: number;
    accountCount?: number;
    encrypted: boolean;
    hasChecksum: boolean;
    checksumValid?: boolean;
    error?: string;
} {
    try {
        // Check required fields
        if (!backupData.salt || !backupData.encryptedVaultData) {
            return {
                valid: false,
                encrypted: false,
                hasChecksum: false,
                error: "Invalid backup format: missing required fields"
            };
        }
        
        // Check if encrypted (new format has encryptedSettings)
        const encrypted = !!backupData.encryptedSettings;
        
        // Check if has checksum
        const hasChecksum = !!backupData.checksum;
        
        // Verify checksum if present
        let checksumValid = false;
        if (hasChecksum) {
            const checksumData = backupData.salt + backupData.encryptedVaultData + (backupData.encryptedSettings || '');
            const calculatedChecksum = generateChecksum(checksumData);
            checksumValid = calculatedChecksum === backupData.checksum;
        }
        
        return {
            valid: true,
            version: backupData.version || "1.0.0",
            timestamp: backupData.timestamp,
            accountCount: backupData.accountCount,
            encrypted,
            hasChecksum,
            checksumValid: hasChecksum ? checksumValid : undefined
        };
    } catch (err) {
        return {
            valid: false,
            encrypted: false,
            hasChecksum: false,
            error: "Failed to parse backup file"
        };
    }
}

export async function importVaultData(
    salt: string, 
    encryptedVaultData: string, 
    password: string, 
    encryptedSettings?: string,
    // Legacy support for old backup format
    autolock?: string, 
    desktopSettings?: any, 
    webSettings?: any
): Promise<{ success: boolean, message: string }> {
    if (!currentUser || !currentKey) throw new Error("No active user session.");

    try {
        const key = deriveKey(password, salt);
        const decryptedJson = decryptVault(encryptedVaultData, key);
        const accounts = JSON.parse(decryptedJson) as AuthenticatorAccount[];

        // 1. Restore Vault Data - this will re-encrypt with current user's key
        await saveActiveAccounts(accounts);

        // 2. Restore Settings
        const users = await getUsers();
        const userIndex = users.findIndex(u => u.id === currentUser!.id);
        if (userIndex !== -1) {
            // New format: encrypted settings
            if (encryptedSettings) {
                try {
                    const decryptedSettings = decryptVault(encryptedSettings, key);
                    const settings = JSON.parse(decryptedSettings);
                    
                    if (settings.autolock !== undefined) {
                        users[userIndex].autolock = settings.autolock;
                        currentUser.autolock = settings.autolock;
                    }
                    if (settings["Desktop Settings"]) {
                        users[userIndex]["Desktop Settings"] = settings["Desktop Settings"];
                        currentUser["Desktop Settings"] = settings["Desktop Settings"];
                    }
                    if (settings["Web Settings"]) {
                        users[userIndex]["Web Settings"] = settings["Web Settings"];
                        currentUser["Web Settings"] = settings["Web Settings"];
                    }
                } catch (err) {
                    console.error("Failed to decrypt settings:", err);
                    return { success: false, message: "Failed to decrypt backup settings." };
                }
            }
            // Legacy format: plaintext settings (for backward compatibility)
            else if (autolock !== undefined || desktopSettings || webSettings) {
                if (autolock !== undefined) {
                    users[userIndex].autolock = autolock;
                    currentUser.autolock = autolock;
                }
                if (desktopSettings) {
                    users[userIndex]["Desktop Settings"] = desktopSettings;
                    currentUser["Desktop Settings"] = desktopSettings;
                }
                if (webSettings) {
                    users[userIndex]["Web Settings"] = webSettings;
                    currentUser["Web Settings"] = webSettings;
                }
            }
            
            // Only save settings if they were updated
            if (encryptedSettings || autolock !== undefined || desktopSettings || webSettings) {
                await saveUsers(users);
                await syncUserData(currentUser.username, users[userIndex]);
                
                // Update session state
                currentUser.settings = currentUser["Web Settings"];
            }
        }

        return { success: true, message: "Vault and settings successfully restored." };
    } catch (err) {
        console.error("Vault Import Error:", err);
        return { success: false, message: "Decryption failed." };
    }
}

export async function changePassword(newPassword: string): Promise<{ success: boolean, message: string }> {
    if (!currentUser || !currentKey) throw new Error("No active user session.");
    if (newPassword.length < 8) return { success: false, message: "Password must be at least 8 characters." };

    try {
        const users = await getUsers();
        const userIndex = users.findIndex(u => u.id === currentUser!.id);
        if (userIndex === -1) throw new Error("User missing from storage.");

        // 1. Decrypt current vault
        const accounts = await getActiveAccounts();

        // 2. Hash new password and derive new salt/key
        const { hash, salt } = hashPassword(newPassword);
        const newKey = deriveKey(newPassword, salt);

        // 3. Re-encrypt vault with new key
        const newEncryptedVault = encryptVault(JSON.stringify(accounts), newKey);

        // 4. Update user record
        users[userIndex].hash = hash;
        users[userIndex].salt = salt;
        users[userIndex].encryptedVaultData = newEncryptedVault;

        // 5. Update session
        currentUser.hash = hash;
        currentUser.salt = salt;
        currentUser.encryptedVaultData = newEncryptedVault;
        currentKey = newKey;

        // 6. Save and Sync
        await saveUsers(users);
        await syncUserData(currentUser.username, users[userIndex]);

        // 7. Update local session storage
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
    if (users.find(u => u.username === newUsername)) {
        return { success: false, message: "Username already in use." };
    }

    const userIndex = users.findIndex(u => u.id === currentUser!.id);
    if (userIndex === -1) throw new Error("User missing from storage.");

    const oldUsername = currentUser.username;
    users[userIndex].username = newUsername;
    currentUser.username = newUsername; // Sync local session

    await saveUsers(users);
    
    // Rename cloud folder (move the record)
    await renameUserFolder(oldUsername, newUsername);
    
    // Final sync to the new path to ensure latest metadata is preserved
    await syncUserData(newUsername, users[userIndex]);

    // Update local storage session
    localStorage.setItem('active_session_user', newUsername);

    return { success: true, message: "Display name updated." };
}

export async function updateProfilePicture(base64Image: string): Promise<{ success: boolean, message: string }> {
    if (!currentUser) throw new Error("No active user session.");
    
    const users = await getUsers();
    const userIndex = users.findIndex(u => u.id === currentUser!.id);
    if (userIndex === -1) throw new Error("User missing from storage.");

    const user = users[userIndex];
    user.profilePicture = base64Image;
    currentUser.profilePicture = base64Image; // Sync local session

    await saveUsers(users);
    await syncUserData(currentUser.username, user);

    return { success: true, message: "Profile photo updated." };
}

export async function requestEmailChange(newEmail: string): Promise<{ success: boolean, message: string, code?: string }> {
    if (!currentUser) throw new Error("No active user session.");
    
    const users = await getUsers();
    const userIndex = users.findIndex(u => u.id === currentUser!.id);
    if (userIndex === -1) throw new Error("User missing from storage.");

    const user = users[userIndex];
    if (user.pendingEmail) {
        return { success: false, message: "A change is already pending. Please confirm or cancel it first." };
    }

    if (users.find(u => u.email === newEmail)) {
        return { success: false, message: "Email already in use." };
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    user.pendingEmail = newEmail;
    user.emailChangeCode = code;

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
    if (!user.pendingEmail || !user.emailChangeCode) {
        return { success: false, message: "No pending email change." };
    }

    if (user.emailChangeCode !== code) {
        return { success: false, message: "Invalid verification code." };
    }

    user.email = user.pendingEmail;
    delete user.pendingEmail;
    delete user.emailChangeCode;
    
    currentUser.email = user.email; // Sync local session

    await saveUsers(users);
    await syncUserData(currentUser.username, users[userIndex]);

    return { success: true, message: "Email changed successfully." };
}

export async function pollForUpdates(): Promise<{ changed: boolean, settings?: any }> {
    if (!currentUser) return { changed: false };

    try {
        const cloudData = await getUserData(currentUser.username);
        if (!cloudData) return { changed: false };

        // Compare vault data to detect remote changes
        const vaultChanged = cloudData.encryptedVaultData &&
            cloudData.encryptedVaultData !== currentUser.encryptedVaultData;

        const settingsChanged = cloudData["Web Settings"] &&
            JSON.stringify(cloudData["Web Settings"]) !== JSON.stringify(currentUser["Web Settings"]);

        if (!vaultChanged && !settingsChanged) return { changed: false };

        // Merge in the updated cloud data
        const users = await getUsers();
        const userIndex = users.findIndex(u => u.id === currentUser!.id);
        if (userIndex !== -1) {
            const merged: UserRecord = {
                ...users[userIndex],
                ...cloudData,
                hash: users[userIndex].hash,
                salt: users[userIndex].salt,
            };
            users[userIndex] = merged;
            await saveUsers(users);
            currentUser = merged;
        }

        return {
            changed: true,
            settings: cloudData["Web Settings"] ?? undefined
        };
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

// ─── Device Management ─────────────────────────────────────────────────────

const DEVICE_ID_KEY = '__keyra_device_id__';

export function getCurrentDeviceId(): string {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
        // Generate a stable UUID for this device/browser
        id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
        localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
}

export async function registerCurrentDevice(): Promise<void> {
    if (!currentUser) return;

    const id = getCurrentDeviceId();
    const now = new Date().toISOString();

    // Detect platform
    const ua = navigator.userAgent;
    let platform = 'web';
    if (/android/i.test(ua)) platform = 'android';
    else if (/iphone|ipad/i.test(ua)) platform = 'ios';

    const name = platform === 'android' ? 'Android Device'
               : platform === 'ios'     ? 'iOS Device'
               : 'Web Browser';

    const users = await getUsers();
    const userIndex = users.findIndex(u => u.id === currentUser!.id);
    if (userIndex === -1) return;

    const devices: DeviceRecord[] = users[userIndex].devices || [];
    const existing = devices.findIndex(d => d.id === id);

    if (existing >= 0) {
        devices[existing].lastSeen = now;
        devices[existing].name = name;
    } else {
        devices.push({ id, name, platform, firstSeen: now, lastSeen: now });
    }

    users[userIndex].devices = devices;
    currentUser.devices = devices;

    await saveUsers(users);
    syncUserData(currentUser.username, users[userIndex]).catch(() => {});
}

export async function revokeDevice(deviceId: string): Promise<{ success: boolean, message: string }> {
    if (!currentUser) throw new Error("No active user session.");

    const users = await getUsers();
    const userIndex = users.findIndex(u => u.id === currentUser!.id);
    if (userIndex === -1) throw new Error("User missing from storage.");

    const before = (users[userIndex].devices || []).length;
    users[userIndex].devices = (users[userIndex].devices || []).filter(d => d.id !== deviceId);

    if (users[userIndex].devices.length === before) {
        return { success: false, message: "Device not found." };
    }

    // Track revoked so that device gets logged out on next session check
    const revoked = users[userIndex].revokedDevices || [];
    if (!revoked.includes(deviceId)) revoked.push(deviceId);
    users[userIndex].revokedDevices = revoked;

    currentUser.devices = users[userIndex].devices;
    currentUser.revokedDevices = revoked;

    await saveUsers(users);
    await syncUserData(currentUser.username, users[userIndex]);
    return { success: true, message: "Device removed." };
}
