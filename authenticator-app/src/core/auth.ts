import { getUsers, saveUsers, UserRecord, getUserData, syncUserData, pollCloudUpdates } from './storage';
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
        settings: currentUser.settings
    };
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
        encryptedVaultData
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

    users[userIndex].settings = settings;
    currentUser.settings = settings;

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
export async function pollForUpdates(): Promise<{ changed: boolean, settings?: any, accounts?: AuthenticatorAccount[] }> {
    if (!currentUser || !currentKey) return { changed: false };

    const result = await pollCloudUpdates(currentUser.username);
    
    if (result.dataChanged && result.userData) {
        // Update local session state if it exists in the fetched data
        if (result.userData.settings) {
            currentUser.settings = result.userData.settings;
        }

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
            settings: result.userData.settings,
            accounts
        };
    }

    return { changed: result.usersChanged }; // Return true if global registry changed, even if user data didn't (for account discovery)
}
