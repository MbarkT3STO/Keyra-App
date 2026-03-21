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
    "Desktop Settings"?: any;
    "Web Settings"?: any;
    "Android Settings"?: any;
    autolock: string;
    profilePicture?: string;
    devices?: DeviceRecord[];
    revokedDevices?: string[];
}

export interface DeviceRecord {
    id: string;
    name: string;
    platform: string;   // 'android' | 'web' | 'desktop'
    firstSeen: string;  // ISO timestamp
    lastSeen: string;   // ISO timestamp
}

const USERS_KEY = 'keyra_users';

// On Android (Capacitor), relative URLs resolve to https://localhost — must use absolute.
// In browser/dev, use relative so the Vite proxy handles CORS.
const IS_NATIVE = !!(window as any).Capacitor?.isNativePlatform?.();
const SYNC_URL = IS_NATIVE
    ? 'https://keyraapp.netlify.app/.netlify/functions/github-sync'
    : '/.netlify/functions/github-sync';

const syncQueues: Record<string, { timer: any, data: any, resolvers: ((val: any) => void)[] }> = {};

/**
 * Retry helper for network requests
 */
async function retryFetch(url: string, options: RequestInit, maxRetries: number = 3): Promise<Response> {
    let lastError: any;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const response = await fetch(url, options);
            
            // If response is ok or client error (4xx), don't retry
            if (response.ok || (response.status >= 400 && response.status < 500)) {
                return response;
            }
            
            // Server error (5xx) - retry
            lastError = new Error(`Server error: ${response.status}`);
        } catch (error) {
            lastError = error;
            console.warn(`Sync attempt ${attempt}/${maxRetries} failed:`, error);
        }
        
        // Wait before retry (exponential backoff)
        if (attempt < maxRetries) {
            const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    
    throw lastError;
}

async function callSync(action: 'get' | 'put' | 'move', path: string, data?: any) {
    // For 'put' actions, we debounce per-path to avoid race conditions
    if (action === 'put') {
        return new Promise((resolve) => {
            if (!syncQueues[path]) {
                syncQueues[path] = { timer: null, data: null, resolvers: [] };
            }

            const queue = syncQueues[path]!;
            queue.data = data;
            queue.resolvers.push(resolve);

            if (queue.timer) {
                clearTimeout(queue.timer);
            }

            queue.timer = setTimeout(async () => {
                const latestData = queue.data;
                const activeResolvers = [...queue.resolvers];
                delete syncQueues[path];
                
                try {
                    const response = await retryFetch(SYNC_URL, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action, path, data: latestData })
                    });
                    const result = await response.json();
                    activeResolvers.forEach(res => res(result));
                } catch (e) {
                    console.error("Cloud sync failed after retries:", e);
                    const errorRes = { success: false, message: "Network error during cloud sync." };
                    activeResolvers.forEach(res => res(errorRes));
                }
            }, 500); // 500ms debounce
        });
    }

    // Default 'get', 'move' or immediate action with retry
    try {
        const response = await retryFetch(SYNC_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, path, data })
        });
        return await response.json();
    } catch (e) {
        console.error("Cloud action failed after retries:", e);
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
