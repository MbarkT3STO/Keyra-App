export interface AuthenticatorAccount {
    id: string;      // Unique identifier
    issuer: string;  // e.g. "GitHub"
    account: string; // e.g. "user@example.com"
    secret: string;  // Plaintext before saving, Encypted in storage
    isFavorite?: boolean;
    category?: string;
}

export interface UserSettings {
    theme: 'light' | 'dark';
    accentColor: string;
    wallpaperPreset: string;
    privacyMode: boolean;
    screenGuardian: boolean;
    autolock: string;
    oledMode: boolean;
    vaultPin?: string;
}

export interface UserRecord {
    id: string;
    username: string;
    email: string;
    hash: string;
    salt: string;
    isActivated: boolean;
    activationCode?: string;
    pendingEmail?: string;
    emailChangeCode?: string;
    encryptedVaultData: string;
    settings?: UserSettings;
}

const USERS_KEY = 'keyra_users';

const syncQueues: Record<string, { timer: any, data: any }> = {};

async function callSync(action: 'get' | 'put' | 'move', path: string, data?: any) {
    // For 'put' actions, we debounce per-path to avoid race conditions
    if (action === 'put') {
        return new Promise((resolve) => {
            if (syncQueues[path]) {
                clearTimeout(syncQueues[path].timer);
            }

            syncQueues[path] = {
                data,
                timer: setTimeout(async () => {
                    const latestData = syncQueues[path].data;
                    delete syncQueues[path];
                    
                    try {
                        const response = await fetch('/.netlify/functions/github-sync', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ action, path, data: latestData })
                        });
                        resolve(await response.json());
                    } catch (e) {
                        console.error("Cloud sync failed:", e);
                        resolve({ success: false, message: "Network error during cloud sync." });
                    }
                }, 500) // 500ms debounce
            };
        });
    }

    // Default 'get', 'move' or immediate action
    try {
        const response = await fetch('/.netlify/functions/github-sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, path, data })
        });
        return await response.json();
    } catch (e) {
        console.error("Cloud action failed:", e);
        return { success: false, message: "Network error." };
    }
}

export async function getUsers(): Promise<UserRecord[]> {
    // 1. Try to get from Cloud
    const cloudResult = await callSync('get', 'users.json');
    if (cloudResult.success && cloudResult.data) {
        const cloudUsers = cloudResult.data as UserRecord[];
        // Sync local cache
        localStorage.setItem(USERS_KEY, JSON.stringify(cloudUsers));
        return cloudUsers;
    }

    // 2. Fallback to LocalStorage
    try {
        const data = localStorage.getItem(USERS_KEY);
        return data ? JSON.parse(data) : [];
    } catch (error) {
        console.error('Failed to read users from localStorage', error);
        return [];
    }
}

export async function saveUsers(users: UserRecord[]): Promise<void> {
    // 1. Save to LocalStorage first (for responsiveness)
    try {
        localStorage.setItem(USERS_KEY, JSON.stringify(users));
    } catch (error) {
        console.error('Failed to save users to localStorage', error);
    }

    // 2. Sync to Cloud
    const result = await callSync('put', 'users.json', users);
    if (!result.success) {
        console.warn("Could not sync users to cloud:", result.message);
    }
}

export async function syncUserData(username: string, data: Partial<UserRecord>): Promise<void> {
    const path = `users/${username}/data.json`;
    await callSync('put', path, data);
}

export async function renameUserFolder(oldUsername: string, newUsername: string): Promise<void> {
    const oldPath = `users/${oldUsername}/data.json`;
    const newPath = `users/${newUsername}/data.json`;
    await callSync('move', '', { oldPath, newPath });
}

export async function getUserData(username: string): Promise<any | null> {
    const path = `users/${username}/data.json`;
    const result = await callSync('get', path);
    return result.success ? result.data : null;
}

export function backupUsers(fileName: string, users: UserRecord[]): void {
    const data = JSON.stringify(users, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
}
