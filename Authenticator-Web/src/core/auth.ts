import { getUsers, saveUsers } from './storage';
import type { UserRecord } from './storage';
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
    
    // Always store the last code for simulation fallback UI
    (window as any).lastSimulatedCode = code;
    return result;
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
        encryptedVaultData
    };

    users.push(newUser);
    saveUsers(users);

    deliverActivationCode(email, activationCode);

    return { success: true, message: "Account created. Check your email.", code: activationCode };
}

export function resendCode(email: string): { success: boolean, message: string, code?: string } {
    const users = getUsers();
    const userIndex = users.findIndex(u => u.email === email);
    if (userIndex === -1) return { success: false, message: "User not found." };
    if (users[userIndex].isActivated) return { success: false, message: "Account already activated." };

    const newCode = Math.floor(100000 + Math.random() * 900000).toString();
    users[userIndex].activationCode = newCode;
    saveUsers(users);

    deliverActivationCode(email, newCode);
    return { success: true, message: "Verification code sent.", code: newCode };
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

export function login(username: string, password: string): { success: boolean, message: string } {
    const users = getUsers();
    const user = users.find(u => u.username === username);
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

        return { success: true, message: "Login successful." };
    } catch (err) {
        console.error("Login Decryption Error:", err);
        return { success: false, message: "Data corrupted." };
    }
}

export function logout(): void {
    currentUser = null;
    currentKey = null;
}

export function getActiveAccounts(): AuthenticatorAccount[] {
    if (!currentUser || !currentKey) throw new Error("No active user session.");
    try {
        const users = getUsers();
        const freshUser = users.find(u => u.id === currentUser!.id);
        if (!freshUser) throw new Error("User missing from storage");

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
    if (userIndex === -1) throw new Error("User missing from storage.");

    const newEncryptedVault = encryptVault(JSON.stringify(accounts), currentKey);
    users[userIndex].encryptedVaultData = newEncryptedVault;

    saveUsers(users);
}

export function getBackupData(): { salt: string, encryptedVaultData: string } {
    if (!currentUser) throw new Error("No active user session.");
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

        saveActiveAccounts(accounts);
        return { success: true, message: "Vault successfully merged." };
    } catch (err) {
        console.error("Vault Import Error:", err);
        return { success: false, message: "Decryption failed." };
    }
}
