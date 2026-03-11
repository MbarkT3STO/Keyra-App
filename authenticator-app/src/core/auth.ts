import { getUsers, saveUsers, UserRecord } from './storage';
import { hashPassword, verifyPassword, deriveKey, encryptVault, decryptVault, AuthenticatorAccount } from './crypto';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { app, safeStorage } from 'electron';
import { sendActivationEmail } from './mailer';

let currentUser: UserRecord | null = null;
let currentKey: Buffer | null = null;

// Email helper with Real/Simulation fallback
async function sendActivationCode(email: string, code: string) {
    const msg = `[KEYRA] Activation code for ${email}: ${code}`;
    console.log(msg);

    // Try real email
    const result = await sendActivationEmail({
        to: email,
        subject: 'Keyra Activation Code',
        code: code
    });

    // Always log to mock file for debugging
    const mockDbPath = path.join(app.getPath('userData'), 'mock_emails.txt');
    fs.appendFileSync(mockDbPath, `[${new Date().toISOString()}] ${msg} | Real Sent: ${result.success}\n`);
}

export function getCurrentUser() {
    if (!currentUser) return null;
    return {
        id: currentUser.id,
        username: currentUser.username,
        email: currentUser.email
    };
}

export function signup(username: string, email: string, password: string): { success: boolean, message: string, code?: string } {
    const users = getUsers();
    if (users.find(u => u.username === username || u.email === email)) {
        return { success: false, message: "Username or email already exists." };
    }

    const { hash, salt } = hashPassword(password);
    const activationCode = Math.floor(100000 + Math.random() * 900000).toString(); // 6 digits

    // Create an empty vault and encrypt it right away to establish the baseline
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
    saveUsers(users);

    sendActivationCode(email, activationCode);

    return { success: true, message: "Account created.", code: activationCode };
}

export function resendCode(email: string): { success: boolean, message: string, code?: string } {
    const users = getUsers();
    const userIndex = users.findIndex(u => u.email === email);
    if (userIndex === -1) return { success: false, message: "User not found." };
    if (users[userIndex].isActivated) return { success: false, message: "Account already activated." };

    const newCode = Math.floor(100000 + Math.random() * 900000).toString();
    users[userIndex].activationCode = newCode;
    saveUsers(users);

    sendActivationCode(email, newCode);
    return { success: true, message: "Verification code resent.", code: newCode };
}

export function verifyEmail(email: string, code: string): { success: boolean, message: string } {
    const users = getUsers();
    const userIndex = users.findIndex(u => u.email === email);
    if (userIndex === -1) return { success: false, message: "User not found." };

    if (users[userIndex].isActivated) return { success: false, message: "Account already activated." };

    if (users[userIndex].activationCode === code) {
        users[userIndex].isActivated = true;
        delete users[userIndex].activationCode;
        saveUsers(users);
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

export function checkSession(): { success: boolean, message: string } {
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

export function login(username: string, password: string): { success: boolean, message: string } {
    const users = getUsers();
    const user = users.find(u => u.username === username);
    if (!user) return { success: false, message: "Invalid credentials." };

    if (!user.isActivated) return { success: false, message: "Please verify your email first." };

    if (!verifyPassword(password, user.hash, user.salt)) {
        return { success: false, message: "Invalid credentials." };
    }

    // Attempt to derive key and decrypt vault to ensure integrity
    try {
        const key = deriveKey(password, user.salt);
        const decryptedJson = decryptVault(user.encryptedVaultData, key);
        JSON.parse(decryptedJson); // ensure it's valid JSON

        currentUser = user;
        currentKey = key;

        // Lock credentials in OS keychain
        saveSession(username, password);

        return { success: true, message: "Login successful." };
    } catch (err) {
        console.error("Login Decryption Error:", err);
        return { success: false, message: "Derived key failed to decrypt vault. Data corrupted." };
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

export function getActiveAccounts(): AuthenticatorAccount[] {
    if (!currentUser || !currentKey) throw new Error("No active user session.");
    try {
        // Read fresh from disk to ensure sync
        const users = getUsers();
        const freshUser = users.find(u => u.id === currentUser!.id);
        if (!freshUser) throw new Error("User missing from disk");

        const jsonStr = decryptVault(freshUser.encryptedVaultData, currentKey);
        return JSON.parse(jsonStr) as AuthenticatorAccount[];
    } catch (err) {
        console.error("getActiveAccounts failed:", err);
        return [];
    }
}

export function saveActiveAccounts(accounts: AuthenticatorAccount[]): void {
    if (!currentUser || !currentKey) throw new Error("No active user session.");

    const users = getUsers();
    const userIndex = users.findIndex(u => u.id === currentUser!.id);
    if (userIndex === -1) throw new Error("User missing from disk.");

    const newEncryptedVault = encryptVault(JSON.stringify(accounts), currentKey);
    users[userIndex].encryptedVaultData = newEncryptedVault;

    saveUsers(users);
}
export function getBackupData(): { salt: string, encryptedVaultData: string } {
    if (!currentUser) throw new Error("No active user session.");
    // We export the salt and the vault blob so it can be decrypted with the same password on any machine
    return {
        salt: currentUser.salt,
        encryptedVaultData: currentUser.encryptedVaultData
    };
}

export function importVaultData(salt: string, encryptedVaultData: string, password: string): { success: boolean, message: string } {
    if (!currentUser || !currentKey) throw new Error("No active user session.");

    try {
        const key = deriveKey(password, salt);
        const decryptedJson = decryptVault(encryptedVaultData, key);
        const accounts = JSON.parse(decryptedJson) as AuthenticatorAccount[];

        // If decryption worked, we can safely re-encrypt it with the CURRENT user's key
        saveActiveAccounts(accounts);
        return { success: true, message: "Vault successfully merged and secured." };
    } catch (err) {
        console.error("Vault Import Error:", err);
        return { success: false, message: "Decryption failed. Please check the backup password." };
    }
}
