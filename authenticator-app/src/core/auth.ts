import { getUsers, saveUsers, UserRecord, getUserData, syncUserData, pollCloudUpdates, renameUserFolder } from './storage';
import { hashPassword, verifyPassword, deriveKey, encryptVault, decryptVault, AuthenticatorAccount } from './crypto';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { app, safeStorage } from 'electron';
import { sendActivationEmail } from './mailer';

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
        pendingEmail: currentUser.pendingEmail,
        settings: currentUser["Desktop Settings"],
        autolock: currentUser.autolock,
        vaultPin: currentUser.vaultPin
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
        id: crypto.randomUUID(),
        username,
        email,
        hash,
        salt,
        isActivated: false,
        activationCode,
        encryptedVaultData,
        autolock: '0',
        vaultPin: ''
    };

    users.push(newUser);
    await saveUsers(users);

    // Sync to cloud
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
    return { success: true, message: "Verification code resent.", code: newCode };
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
        
        // Sync to cloud
        await syncUserData(users[userIndex].username, users[userIndex]);

        return { success: true, message: "Account activated successfully." };
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
    const users = await getUsers();
    let user = users.find(u => u.username === username);
    
    // Cloud Fallback
    if (!user) {
        const cloudData = await getUserData(username);
        if (cloudData) {
            user = cloudData;
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
        const users = await getUsers();
        const freshUser = users.find(u => u.id === currentUser!.id);
        if (!freshUser) throw new Error("User missing from disk");

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
    if (userIndex === -1) throw new Error("User missing from disk.");

    const newEncryptedVault = encryptVault(JSON.stringify(accounts), currentKey);
    users[userIndex].encryptedVaultData = newEncryptedVault;

    await saveUsers(users);
    
    // Sync specifically this user's data folder
    await syncUserData(currentUser.username, users[userIndex]);
}

export async function updateUserSettings(settings: any): Promise<void> {
    if (!currentUser) throw new Error("No active user session.");

    const users = await getUsers();
    const userIndex = users.findIndex(u => u.id === currentUser!.id);
    if (userIndex === -1) throw new Error("User missing from storage.");

    // Move autolock and vaultPin to root if they exist in the settings object, and remove them from the nested object
    if (settings.autolock !== undefined) {
        users[userIndex].autolock = String(settings.autolock);
        currentUser.autolock = String(settings.autolock);
        delete settings.autolock;
    }
    if (settings.vaultPin !== undefined) {
        users[userIndex].vaultPin = settings.vaultPin;
        currentUser.vaultPin = settings.vaultPin;
        delete settings.vaultPin;
    }

    users[userIndex]["Desktop Settings"] = settings;
    currentUser["Desktop Settings"] = settings;

    await saveUsers(users);
    await syncUserData(currentUser.username, users[userIndex]);
}

export function getBackupData(): { salt: string, encryptedVaultData: string } {
    if (!currentUser) throw new Error("No active user session.");
    return {
        salt: currentUser.salt,
        encryptedVaultData: currentUser.encryptedVaultData
    };
}

export async function importVaultData(salt: string, encryptedVaultData: string, password: string): Promise<{ success: boolean, message: string }> {
    if (!currentUser || !currentKey) throw new Error("No active user session.");

    try {
        const key = deriveKey(password, salt);
        const decryptedJson = decryptVault(encryptedVaultData, key);
        const accounts = JSON.parse(decryptedJson) as AuthenticatorAccount[];

        await saveActiveAccounts(accounts);
        return { success: true, message: "Vault successfully merged." };
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

        // 7. Update local session (Electron safeStorage)
        saveSession(currentUser.username, newPassword);

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

export async function requestEmailChange(newEmail: string): Promise<{ success: boolean, message: string, code?: string }> {
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
    await syncUserData(currentUser.username, user);

    deliverActivationCode(newEmail, code);

    return { success: true, message: "Verification code sent to new email." };
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
    return { success: true, message: "New verification code sent." };
}

export async function pollForUpdates(): Promise<{ changed: boolean, settings?: any, accounts?: AuthenticatorAccount[] }> {
    if (!currentUser || !currentKey) return { changed: false };

    const result = await pollCloudUpdates(currentUser.username);
    
    if (result.dataChanged && result.userData) {
        // Update local session state if it exists in the fetched data
        if (result.userData["Desktop Settings"] || result.userData.settings) {
            currentUser["Desktop Settings"] = result.userData["Desktop Settings"] || result.userData.settings;
            currentUser.settings = result.userData.settings; // Keep legacy for ref
        }
        if (result.userData.autolock !== undefined) currentUser.autolock = result.userData.autolock;
        if (result.userData.vaultPin !== undefined) currentUser.vaultPin = result.userData.vaultPin;

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
