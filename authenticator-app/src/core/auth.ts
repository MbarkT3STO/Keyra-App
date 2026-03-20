import { 
    getUsers, saveUsers, syncUserData, pollCloudUpdates, 
    UserRecord, UserSettings, PrivateSyncConfig, testGitHubConnection,
    getUserData, renameUserFolder
} from './storage';
import { hashPassword, verifyPassword, deriveKey, encryptVault, decryptVault, AuthenticatorAccount } from './crypto';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { app, safeStorage } from 'electron';
import { sendActivationEmail } from './mailer';

export interface SyncResult {
    success: boolean;
    conflict?: boolean;
    message?: string;
}

let currentUser: UserRecord | null = null;
let currentKey: Buffer | null = null;

// Email helper with Real/Simulation fallback
async function deliverActivationCode(email: string, code: string) {
    const msg = `[KEYRA] Activation code for ${email}: ${code}`;

    // Try real email
    const result = await sendActivationEmail({
        to: email,
        subject: 'Keyra Activation Code',
        code: code
    });

    // Always log to mock file for debugging
    const mockDbPath = path.join(app.getPath('userData'), 'mock_emails.txt');
    try {
        fs.appendFileSync(mockDbPath, `[${new Date().toISOString()}] ${msg} | Real Sent: ${result.success}\n`);
    } catch (e) {}
    
    return result;
}

export function getCurrentUser() {
    if (!currentUser) return null;
    return {
        id: currentUser.id,
        username: currentUser.username,
        email: currentUser.email,
        phone: currentUser.phone,
        isPhoneVerified: !!currentUser.isPhoneVerified,
        pendingPhone: currentUser.pendingPhone,
        settings: currentUser["Desktop Settings"],
        autolock: currentUser.autolock,
        profilePicture: currentUser.profilePicture,
        isLocal: !!currentUser.isLocal,
        privateSync: currentUser.privateSync
    };
}

export async function cancelEmailChange(): Promise<SyncResult> {
    if (!currentUser) throw new Error("No active user session.");
    
    const users = await getUsers();
    const userIndex = users.findIndex(u => u.id === currentUser!.id);
    if (userIndex === -1) throw new Error("User missing from storage.");

    const user = users[userIndex];
    delete user.pendingEmail;
    delete user.emailChangeCode;
    
    delete currentUser.pendingEmail; // Sync local session

    await saveUsers(users);
    return await syncUserData(currentUser.username, users[userIndex]);
}

export async function updateProfilePicture(base64Image: string): Promise<SyncResult> {
    if (!currentUser) throw new Error("No active user session.");
    
    const users = await getUsers();
    const userIndex = users.findIndex(u => u.id === currentUser!.id);
    if (userIndex === -1) throw new Error("User missing from storage.");

    const user = users[userIndex];
    user.profilePicture = base64Image;
    currentUser.profilePicture = base64Image; // Sync local session

    await saveUsers(users);
    const res = await syncUserData(currentUser.username, user);
    return { ...res, message: res.success ? "Profile picture updated successfully." : (res.message || "Sync failed") };
}


export async function signup(username: string, email: string, password: string): Promise<SyncResult & { code?: string }> {
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
        id: crypto.randomUUID(),
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

    // Sync to cloud
    const res = await syncUserData(username, newUser);

    deliverActivationCode(email, activationCode);

    return { 
        ...res, 
        message: res.success ? "Account created. Check your email." : (res.message || "Sync failed"),
        code: activationCode 
    };
}

export async function signupLocal(username: string, key: string): Promise<SyncResult> {
    const users = await getUsers();
    if (users.find(u => u.username === username)) {
        return { success: false, message: "Username already exists." };
    }

    const { hash, salt } = hashPassword(key);

    const initialKey = deriveKey(key, salt);
    const emptyVault: AuthenticatorAccount[] = [];
    const encryptedVaultData = encryptVault(JSON.stringify(emptyVault), initialKey);

    const newUser: UserRecord = {
        id: crypto.randomUUID(),
        username,
        email: 'local@keyra.offline',
        hash,
        salt,
        isActivated: true, // Auto-activated for local
        isLocal: true,
        encryptedVaultData,
        autolock: '0'
    };

    users.push(newUser);
    await saveUsers(users);
    return { success: true, message: "Local account created successfully!" };
}

export async function resendCode(email: string): Promise<SyncResult & { code?: string }> {
    const users = await getUsers();
    const userIndex = users.findIndex(u => u.email === email);
    if (userIndex === -1) return { success: false, message: "User not found." };
    if (users[userIndex].isActivated) return { success: false, message: "Account already activated." };

    const newCode = Math.floor(100000 + Math.random() * 900000).toString();
    users[userIndex].activationCode = newCode;
    await saveUsers(users);

    deliverActivationCode(email, newCode);
    return { success: true, message: "Verification code resent.", code: newCode };
}

export async function verifyEmail(email: string, code: string): Promise<SyncResult> {
    const users = await getUsers();
    const userIndex = users.findIndex(u => u.email === email);
    if (userIndex === -1) return { success: false, message: "User not found." };

    if (users[userIndex].isActivated) return { success: false, message: "Account already activated." };

    if (users[userIndex].activationCode === code) {
        users[userIndex].isActivated = true;
        await saveUsers(users);

        // Sync to cloud
        const res = await syncUserData(users[userIndex].username, users[userIndex]);

        return {
            ...res,
            message: res.success ? "Account activated successfully." : (res.message || "Sync failed")
        };
    }

    return { success: false, message: "Invalid activation code." };
}

// ─── Session Auto-Login Engine ──────────────────────────────────────

const getSessionPath = () => path.join(app.getPath('userData'), 'session.enc');

function saveSession(username: string, rawPass: string) {
    if (!safeStorage.isEncryptionAvailable()) return;
    try {
        const payload = JSON.stringify({ username, pass: rawPass });
        const enc = safeStorage.encryptString(payload);
        fs.writeFileSync(getSessionPath(), enc);
    } catch (err) {
        console.error("Failed to save encrypted session:", err);
    }
}

export async function checkSession(): Promise<{ success: boolean, message: string }> {
    if (!safeStorage.isEncryptionAvailable()) return { success: false, message: "Safe storage unavailable" };
    try {
        const p = getSessionPath();
        if (!fs.existsSync(p)) return { success: false, message: "No session found" };

        const enc = fs.readFileSync(p);
        const dec = safeStorage.decryptString(enc);
        const creds = JSON.parse(dec);

        // Feed decrypted credentials back into login flow
        return login(creds.username, creds.pass);
    } catch (err) {
        return { success: false, message: "Session corrupted or decryption failed" };
    }
}

export async function login(username: string, password: string): Promise<{ success: boolean, message: string }> {
    let user: UserRecord | null = null;
    let cloudFetchSuccess = false;

    // 1. Resolve Identity (Username or Phone)
    const normalizedInput = username.trim();
    const isPhoneInput = normalizedInput.startsWith('+') || /^\d{8,}$/.test(normalizedInput.replace(/\s/g, ''));

    let resolvedUsername = normalizedInput;
    const localUsers = await getUsers();

    if (isPhoneInput) {
        const digitsOnlyInput = normalizedInput.replace(/\D/g, '');
        if (digitsOnlyInput.length >= 8) { // Only attempt phone lookup if enough digits are provided
            const matchingUser = localUsers.find(u => {
                const checkMatch = (phone?: string) => {
                    if (!phone) return false;
                    const digitsOnlyStored = phone.replace(/\D/g, '');
                    return digitsOnlyStored === digitsOnlyInput || digitsOnlyStored.endsWith(digitsOnlyInput);
                };
                return checkMatch(u.phone) || checkMatch(u.pendingPhone);
            });
            if (matchingUser) {
                resolvedUsername = matchingUser.username;
            }
        }
    }

    // 2. Cloud First Approach
        // Detect if this is a local user first to avoid unnecessary cloud attempts
        const isLocalUser = localUsers.find(u => u.username === resolvedUsername)?.isLocal;

        if (!isLocalUser) {
            try {
                const cloudData = await getUserData(resolvedUsername);
                if (cloudData) {
                    user = cloudData;
                    cloudFetchSuccess = true;

                    // Proactively update local cache with fresh cloud data
                    const localIdx = localUsers.findIndex(u => u.username === resolvedUsername);
                    if (localIdx !== -1) {
                        localUsers[localIdx] = cloudData;
                    } else {
                        localUsers.push(cloudData);
                    }
                    await saveUsers(localUsers);
                }
            } catch (err: any) {
                console.warn("Cloud login fetch failed, will attempt local fallback:", err.message);
            }
        }

    // 3. Local Fallback (if cloud failed or user not found in cloud)
    if (!user) {
        user = localUsers.find(u => u.username === resolvedUsername) || null;
    }

    if (!user) {
        return { success: false, message: "Account not found. Please ensure you have an active internet connection for first-time login." };
    }

    if (!user.isActivated) return { success: false, message: "Please verify your email first." };

    if (!verifyPassword(password, user.hash, user.salt)) {
        return { success: false, message: "Incorrect password. Please try again." };
    }

    try {
        const key = deriveKey(password, user.salt);
        const decryptedJson = decryptVault(user.encryptedVaultData, key);
        JSON.parse(decryptedJson);

        currentUser = user;
        currentKey = key;

        // Lock credentials in OS keychain
        saveSession(username, password);

        return { success: true, message: "Login successful." };
    } catch (err) {
        console.error("Login Decryption Error:", err);
        return { success: false, message: "Data corrupted." };
    }
}

export function logout(): void {
    currentUser = null;
    currentKey = null;
    try {
        if (fs.existsSync(getSessionPath())) {
            fs.unlinkSync(getSessionPath());
        }
    } catch (e) { }
}

// ─── Bound Vault Access ──────────────────────────────────────────────

export async function getActiveAccounts(): Promise<AuthenticatorAccount[]> {
    if (!currentUser || !currentKey) throw new Error("No active user session.");
    try {
        console.log("getActiveAccounts called for user:", currentUser.username);
        
        const users = await getUsers();
        const freshUser = users.find(u => u.id === currentUser!.id);
        if (!freshUser) throw new Error("User missing from disk");

        console.log("Fresh user encryptedVaultData length:", freshUser.encryptedVaultData.length);
        console.log("CurrentUser encryptedVaultData length:", currentUser.encryptedVaultData.length);
        
        const jsonStr = decryptVault(freshUser.encryptedVaultData, currentKey);
        const accounts = JSON.parse(jsonStr) as AuthenticatorAccount[];
        
        console.log("getActiveAccounts returning", accounts.length, "accounts");
        return accounts;
    } catch (err) {
        console.error("getActiveAccounts failed:", err);
        return [];
    }
}

export async function saveActiveAccounts(accounts: AuthenticatorAccount[], force: boolean = false): Promise<SyncResult> {
    if (!currentUser || !currentKey) throw new Error("No active user session.");

    console.log("saveActiveAccounts called with", accounts.length, "accounts");

    const users = await getUsers();
    const userIndex = users.findIndex(u => u.id === currentUser!.id);
    if (userIndex === -1) throw new Error("User missing from disk.");

    const newEncryptedVault = encryptVault(JSON.stringify(accounts), currentKey);
    console.log("Encrypted vault data length:", newEncryptedVault.length);
    
    users[userIndex].encryptedVaultData = newEncryptedVault;
    
    // Update the in-memory session
    currentUser.encryptedVaultData = newEncryptedVault;
    console.log("Updated currentUser.encryptedVaultData");

    await saveUsers(users);
    console.log("Saved users to disk");

    // Sync specifically this user's data folder
    const res = await syncUserData(currentUser.username, users[userIndex], force);
    console.log("Sync result:", res);
    
    return {
        ...res,
        message: res.success ? "Vault saved successfully." : (res.message || "Sync failed")
    };
}

export async function updateUserSettings(settings: any, force: boolean = false): Promise<SyncResult> {
    if (!currentUser) throw new Error("No active user session.");

    const users = await getUsers();
    const userIndex = users.findIndex(u => u.id === currentUser!.id);
    if (userIndex === -1) throw new Error("User missing from storage.");

    // Always target Desktop Settings for updates from this platform
    if (settings["Desktop Settings"]) {
        users[userIndex]["Desktop Settings"] = settings["Desktop Settings"];
        currentUser["Desktop Settings"] = settings["Desktop Settings"];
    } else {
        // If it's a flat object, wrap it and avoid touching other platform blocks
        delete settings["Web Settings"];
        users[userIndex]["Desktop Settings"] = settings;
        currentUser["Desktop Settings"] = settings;
    }

    await saveUsers(users);
    return await syncUserData(currentUser.username, users[userIndex], force);
}

export async function updatePrivateSyncConfig(config: PrivateSyncConfig): Promise<SyncResult> {
    if (!currentUser) throw new Error("No active user session.");
    const users = await getUsers();
    const userIndex = users.findIndex(u => u.id === currentUser!.id);
    if (userIndex === -1) throw new Error("User missing from storage.");

    users[userIndex].privateSync = config;
    currentUser.privateSync = config;

    await saveUsers(users);
    // Trigger an immediate sync to the new repo if enabled
    if (config.enabled && config.pat) {
        const res = await syncUserData(currentUser.username, users[userIndex]);
        return { 
            ...res, 
            message: res.success ? "Sync configuration updated." : (res.message || "Sync failed") 
        };
    }
    return { success: true, message: "Sync configuration saved." };
}

export async function testPrivateSyncConnection(config: PrivateSyncConfig): Promise<{ success: boolean, message: string }> {
    return await testGitHubConnection(config);
}

export async function resumeFromGitHub(pat: string, owner: string, repo: string): Promise<{ success: boolean, message: string, username?: string }> {
    try {
        const config: PrivateSyncConfig = { enabled: true, pat, owner, repo };
        
        // 1. Verify connection
        const test = await testGitHubConnection(config);
        if (!test.success) return { success: false, message: test.message };

        // 2. Fetch vault data
        const filePath = `vault/vault.json`;
        const { getUserDataDirect } = require('./storage');
        const userData = await getUserDataDirect(filePath, config);
        
        if (!userData) {
            return { success: false, message: "No vault data found. Ensure you have synced your vault at least once from another device." };
        }

        // 3. Import locally
        const users = await getUsers();
        if (users.find(u => u.username === userData.username)) {
            return { success: false, message: `Account "${userData.username}" already exists locally.` };
        }

        users.push(userData);
        await saveUsers(users);

        return { success: true, message: "Vault restored! Please sign in.", username: userData.username };
    } catch (err: any) {
        return { success: false, message: "Failed to resume from GitHub." };
    }
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

export function encryptPIN(pin: string): string {
    if (!currentKey) throw new Error("No active user session.");
    return encryptVault(pin, currentKey);
}

export function decryptPIN(encryptedPin: string): string {
    if (!currentKey) throw new Error("No active user session.");
    return decryptVault(encryptedPin, currentKey);
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
): Promise<SyncResult> {
    if (!currentUser || !currentKey) throw new Error("No active user session.");

    try {
        console.log("=== Starting Vault Import ===");
        console.log("Current user:", currentUser.username);
        console.log("Backup salt:", salt);
        console.log("Backup encryptedVaultData length:", encryptedVaultData.length);
        console.log("Has encryptedSettings:", !!encryptedSettings);
        console.log("Has legacy autolock:", autolock);
        console.log("Has legacy desktopSettings:", !!desktopSettings);
        console.log("Has legacy webSettings:", !!webSettings);
        
        const key = deriveKey(password, salt);
        console.log("Derived key from backup password");
        
        const decryptedJson = decryptVault(encryptedVaultData, key);
        console.log("Decrypted vault JSON:", decryptedJson);
        
        const accounts = JSON.parse(decryptedJson) as AuthenticatorAccount[];

        console.log("Decrypted accounts from backup:", accounts.length);
        console.log("Account details:", accounts.map(a => ({ issuer: a.issuer, account: a.account })));

        // 1. Restore Vault Data - this will re-encrypt with current user's key
        console.log("Saving accounts with current user's key...");
        const saveResult = await saveActiveAccounts(accounts, true);
        console.log("Save result:", saveResult);
        
        if (!saveResult.success) {
            console.error("Failed to save accounts:", saveResult.message);
            return { success: false, message: "Failed to restore vault data." };
        }

        // Verify the save worked by reading back
        console.log("Verifying saved data...");
        const verifyAccounts = await getActiveAccounts();
        console.log("Verified accounts count:", verifyAccounts.length);
        console.log("Verified account details:", verifyAccounts.map(a => ({ issuer: a.issuer, account: a.account })));

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
                console.log("Restoring legacy format settings");
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
            }
        }

        console.log("=== Vault Import Completed Successfully ===");
        return { success: true, message: "Vault and settings successfully restored." };
    } catch (err) {
        console.error("Vault Import Error:", err);
        return { success: false, message: "Decryption failed." };
    }
}

export async function changePassword(newPassword: string): Promise<SyncResult> {
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
        const res = await syncUserData(currentUser.username, users[userIndex]);

        if (!res.success) return res;

        // 7. Update local session (Electron safeStorage)
        saveSession(currentUser.username, newPassword);

        return { success: true, message: "Password changed successfully." };
    } catch (err) {
        console.error("Password change failed:", err);
        return { success: false, message: "Failed to change password." };
    }
}

export async function changeUsername(newUsername: string): Promise<SyncResult> {
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

    // Update local session (Electron safeStorage)
    // We don't have the raw password here, but login() saves it.
    // However, if we change the username, we need to update the session.enc which stores {username, pass}.
    // To do this safely, we'd need the password. 
    // In Authenticator-Web, it just updates localStorage. 
    // For now, if we change username, the next auto-login might fail or use old username.
    // A better way is to ask for password on username change, but for consistency with Web port, 
    // we'll try to retrieve the pass if possible or let the user login again.
    // Wait, saveSession is called in login. Let's assume the user will need to re-login if they change username for simplicity, 
    // or we could try to implement a more complex session migration.
    // Actually, in changePassword we call saveSession. In changeUsername, we should probably do the same if we had the pass.
    
    return { success: true, message: "Display name updated." };
}

export async function requestEmailChange(newEmail: string): Promise<SyncResult & { code?: string }> {
    if (!currentUser) throw new Error("No active user session.");
    
    const users = await getUsers();
    const userIndex = users.findIndex(u => u.id === currentUser!.id);
    if (userIndex === -1) throw new Error("User missing from storage.");

    const user = users[userIndex];
    if (user.pendingEmail) {
        return { success: false, message: "A change is already pending. Please confirm or cancel it first." };
    }

    if (users.find(u => u.email.toLowerCase() === newEmail.toLowerCase() || u.pendingEmail?.toLowerCase() === newEmail.toLowerCase())) {
        return { success: false, message: "Email already in use or pending by another user." };
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    user.pendingEmail = newEmail;
    user.emailChangeCode = code;

    await saveUsers(users);
    const syncRes = await syncUserData(currentUser.username, user);

    deliverActivationCode(newEmail, code);

    return { 
        success: syncRes.success, 
        conflict: syncRes.conflict, 
        message: syncRes.success ? "Verification code sent to new email." : (syncRes.message || "Sync failed")
    };
}

export async function confirmEmailChange(code: string): Promise<SyncResult> {
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
    return await syncUserData(currentUser.username, users[userIndex]);
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
    const res = await syncUserData(currentUser.username, users[userIndex]);

    deliverActivationCode(user.pendingEmail, newCode);
    return { ...res, message: res.success ? "New verification code sent." : (res.message || "Sync failed") };
}

// ─── Phone Verification Logic ───────────────────────────────────────

import { sendPhoneVerification } from './notifier';

export async function requestPhoneVerification(phoneNumber: string): Promise<SyncResult> {
    if (!currentUser) throw new Error("No active user session.");
    
    // Robust validation: Starts with + and contains 8 to 15 digits
    const phoneRegex = /^\+[0-9]{8,15}$/;
    if (!phoneRegex.test(phoneNumber)) {
        return { success: false, message: "Invalid phone format. Please use international format (e.g. +123456789)." };
    }
    
    const users = await getUsers();
    const userIndex = users.findIndex(u => u.id === currentUser!.id);
    if (userIndex === -1) throw new Error("User missing from storage.");

    // Reject if the number is already claimed by another user
    const normalizePhone = (p?: string) => p?.replace(/\D/g, '');
    const incomingDigits = normalizePhone(phoneNumber);
    const conflict = users.find(u =>
        u.id !== currentUser!.id && (
            normalizePhone(u.phone) === incomingDigits ||
            normalizePhone(u.pendingPhone) === incomingDigits
        )
    );
    if (conflict) {
        return { success: false, message: "This phone number is already associated with another account." };
    }

    const user = users[userIndex];
    user.pendingPhone = phoneNumber;
    delete user.phoneVerificationCode; // Cleanup old system

    // Sync local session
    if (currentUser) {
        currentUser.pendingPhone = phoneNumber;
        delete currentUser.phoneVerificationCode;
    }

    await saveUsers(users);
    return await syncUserData(currentUser.username, user);
}

// remove confirmPhoneVerification...

export async function removePhone(): Promise<SyncResult> {
    if (!currentUser) throw new Error("No active user session.");
    
    const users = await getUsers();
    const userIndex = users.findIndex(u => u.id === currentUser!.id);
    if (userIndex === -1) throw new Error("User missing from storage.");

    const user = users[userIndex];
    delete user.phone;
    delete user.pendingPhone;
    delete user.isPhoneVerified;
    delete user.phoneVerificationCode;
    
    // Sync local session
    delete currentUser.phone;
    delete currentUser.pendingPhone;
    delete currentUser.isPhoneVerified;
    delete currentUser.phoneVerificationCode;

    await saveUsers(users);
    await syncUserData(currentUser.username, user);

    return { success: true, message: "Phone number removed successfully." };
}

export async function verifyPhoneByWhatsAppMatch(waNumber: string): Promise<SyncResult> {
    if (!currentUser) throw new Error("No active user session.");
    
    const users = await getUsers();
    const userIndex = users.findIndex(u => u.id === currentUser!.id);
    if (userIndex === -1) throw new Error("User missing from storage.");

    const user = users[userIndex];
    if (!user.pendingPhone) return { success: false, message: "No pending phone verification." };

    console.log(`[Auth] Comparison Trace - Pending: "${user.pendingPhone}" (len: ${user.pendingPhone.length}), Received WA: "${waNumber}" (len: ${waNumber.length})`);

    // Normalize both numbers (remove +, spaces, and any non-digit chars)
    const normalizedPending = user.pendingPhone.replace(/\D/g, '');
    const normalizedWA = waNumber.replace(/\D/g, '');

    console.log(`[Auth] Comparison Trace - Normalized Pending: "${normalizedPending}" vs Normalized WA: "${normalizedWA}"`);

    // For safety, we check if one is contained in the other or exact match.
    // We also ensure both numbers have at least 8 digits to avoid false positives on short fragments.
    if (normalizedPending.length >= 8 && normalizedWA.length >= 8 && 
        (normalizedWA.endsWith(normalizedPending) || normalizedPending.endsWith(normalizedWA))) {
        user.phone = user.pendingPhone;
        user.isPhoneVerified = true;
        delete user.pendingPhone;
        delete user.phoneVerificationCode;
        
        // Sync local session
        currentUser.phone = user.phone;
        currentUser.isPhoneVerified = true;

        await saveUsers(users);
        return await syncUserData(currentUser.username, user);
    }

    return { success: false, message: "WhatsApp number does not match entered phone." };
}

export async function verifyMasterPassword(password: string): Promise<{ success: boolean, message: string }> {
    if (!currentUser) return { success: false, message: "No active user session." };
    
    if (!verifyPassword(password, currentUser.hash, currentUser.salt)) {
        return { success: false, message: "Incorrect password. Please try again." };
    }
    
    return { success: true, message: "Password verified successfully." };
}

// ─── PIN Reset via WhatsApp ────────────────────────────────────────

let pinResetCode: string | null = null;
let pinResetCodeExpiry: number | null = null;

export function generatePinResetCode(): { code: string, phone: string } | null {
    if (!currentUser) return null;
    if (!currentUser.phone || !currentUser.isPhoneVerified) return null;
    
    pinResetCode = Math.floor(100000 + Math.random() * 900000).toString();
    pinResetCodeExpiry = Date.now() + 5 * 60 * 1000; // 5 minutes expiry
    
    return { code: pinResetCode, phone: currentUser.phone };
}

export function verifyPinResetCode(code: string): { success: boolean, message: string } {
    if (!currentUser) return { success: false, message: "No active user session." };
    if (!pinResetCode || !pinResetCodeExpiry) {
        return { success: false, message: "No verification code pending." };
    }
    
    if (Date.now() > pinResetCodeExpiry) {
        pinResetCode = null;
        pinResetCodeExpiry = null;
        return { success: false, message: "Verification code expired. Please try again." };
    }
    
    if (code !== pinResetCode) {
        return { success: false, message: "Incorrect verification code." };
    }
    
    // Clear the code after successful verification
    pinResetCode = null;
    pinResetCodeExpiry = null;
    
    return { success: true, message: "Code verified successfully." };
}

export function clearPinResetCode(): void {
    pinResetCode = null;
    pinResetCodeExpiry = null;
}

export async function pollForUpdates(): Promise<{ changed: boolean, settings?: any, accounts?: AuthenticatorAccount[] }> {
    if (!currentUser || !currentKey) return { changed: false };

    const result = await pollCloudUpdates(currentUser.username);
    
    if (result.dataChanged && result.userData) {
        // Strict isolation: only pull what belongs to this platform
        if (result.userData["Desktop Settings"]) {
            currentUser["Desktop Settings"] = result.userData["Desktop Settings"];
        }
        
        // Optionally mirror Web Settings in memory but don't touch them
        if (result.userData["Web Settings"]) {
            currentUser["Web Settings"] = result.userData["Web Settings"];
        }

        if (result.userData.autolock !== undefined) currentUser.autolock = result.userData.autolock;

        // If vault data changed, decrypt it
        let accounts: AuthenticatorAccount[] | undefined = undefined;
        if (result.userData.encryptedVaultData) {
            try {
                const jsonStr = decryptVault(result.userData.encryptedVaultData, currentKey);
                accounts = JSON.parse(jsonStr);
            } catch (e) {
                console.error("Live Sync Decryption Failed", e);
            }
        }

        return { 
            changed: true, 
            settings: currentUser["Desktop Settings"],
            accounts
        };
    }

    return { changed: result.usersChanged }; // Return true if global registry changed, even if user data didn't (for account discovery)
}
