import { getUsers, saveUsers, getUserData, syncUserData, renameUserFolder } from './storage';
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
        email: currentUser.email,
        pendingEmail: currentUser.pendingEmail,
        settings: currentUser.settings
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
        encryptedVaultData
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

        currentUser = user;
        currentKey = key;

        // Persist session for "Remember Me"
        localStorage.setItem('active_session_user', user.username);
        localStorage.setItem('active_session_key', key.toString('base64'));

        return { success: true, message: "Login successful." };
    } catch (err) {
        console.error("Login Decryption Error:", err);
        return { success: false, message: "Data corrupted." };
    }
}

export async function checkSession(): Promise<{ success: boolean, message: string }> {
    const savedUser = localStorage.getItem('active_session_user');
    const savedKey = localStorage.getItem('active_session_key');

    if (savedUser && savedKey) {
        try {
            const users = await getUsers();
            const user = users.find(u => u.username === savedUser);
            if (user) {
                currentUser = user;
                currentKey = Buffer.from(savedKey, 'base64');
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
    currentUser.settings = settings; // Update local session too

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
