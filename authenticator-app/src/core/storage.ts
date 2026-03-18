import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { AuthenticatorAccount } from './crypto';

// Load from .env
const dotenv = require('dotenv');
const envPath = app.isPackaged 
    ? path.join(process.resourcesPath, '.env') 
    : path.join(process.cwd(), '.env');

dotenv.config({ path: envPath });

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_OWNER;
const GITHUB_REPO = process.env.GITHUB_REPO;

const STORE_PATH = path.join(app.getPath('userData'), 'users.json');

// SHA Tracking for Live Sync
let lastUsersSHA: string | null = null;
const lastUserDataSHAs: Record<string, string> = {};

export interface UserSettings {
    theme: 'light' | 'dark';
    accentColor: string;
    wallpaperPreset: string;
    privacyMode: boolean;
    screenGuardian: boolean;
    oledMode: boolean;
    performanceMode: boolean;
    menuExitIntegration: boolean;
    privacyBlur: boolean;
    autoCheckUpdates?: boolean;
    vaultViewStyle?: 'unified' | 'compact' | 'secure';
    vaultPin?: string;
}

export interface PrivateSyncConfig {
    enabled: boolean;
    pat: string;
    owner: string;
    repo: string;
}

export interface UserRecord {
    id: string;
    username: string;
    email: string;
    hash: string;
    salt: string;
    isLocal?: boolean;
    privateSync?: PrivateSyncConfig;
    isActivated: boolean;
    activationCode?: string;
    pendingEmail?: string;
    emailChangeCode?: string;
    encryptedVaultData: string;
    phone?: string;
    isPhoneVerified?: boolean;
    phoneVerificationCode?: string;
    pendingPhone?: string;
    settings?: UserSettings;
    "Desktop Settings"?: UserSettings;
    "Web Settings"?: any;
    autolock: string;
    profilePicture?: string;
}

/*
 * Task: Separate User Settings
 * - [x] Create implementation plan
 * - [/] Update data structure and storage logic
 * - [ ] Update sync logic to handle separate settings sections
 * - [ ] Update UI to read/write to the correct settings section
 * - [ ] Verify the separation and sync functionality
 */

async function githubRequest(filePath: string, method: string = 'GET', body: any = null, customCreds?: PrivateSyncConfig) {
    const token = customCreds?.pat || GITHUB_TOKEN;
    const owner = customCreds?.owner || GITHUB_OWNER;
    const repo = customCreds?.repo || GITHUB_REPO;

    if (!token || !owner || !repo) {
        throw new Error("GitHub configuration missing.");
    }

    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;
    
    const headers: Record<string, string> = {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'User-Agent': 'Keyra-Electron'
    };

    const options: any = {
        method,
        headers,
    };

    if (body) {
        options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    
    if (response.status === 404 && method === 'GET') {
        return null;
    }

    if (!response.ok) {
        let errorData: any = {};
        try { errorData = await response.json(); } catch (e) {}
        
        if (response.status === 409) {
            const err: any = new Error(`Conflict: Remote version changed.`);
            err.status = 409;
            throw err;
        }

        throw new Error(`GitHub API Error: ${response.status} ${JSON.stringify(errorData)}`);
    }

    return response.json();
}

async function callSync(action: 'get' | 'put', filePath: string, data?: any, customCreds?: PrivateSyncConfig, expectedSha?: string) {
    try {
        if (action === 'get') {
            const fileData: any = await githubRequest(filePath, 'GET', null, customCreds);
            if (!fileData) return { success: true, data: null, sha: null };
            const content = Buffer.from(fileData.content, 'base64').toString('utf8');
            return { success: true, data: JSON.parse(content), sha: fileData.sha };
        }

        if (action === 'put') {
            // Optimistic Lock: Only fetch SHA if not provided
            let sha = expectedSha;
            if (!sha) {
                const existingFile: any = await githubRequest(filePath, 'GET', null, customCreds);
                sha = existingFile ? existingFile.sha : undefined;
            }

            const content = Buffer.from(JSON.stringify(data, null, 2)).toString('base64');
            
            try {
                const result = await githubRequest(filePath, 'PUT', {
                    message: `Sync ${filePath} from Desktop`,
                    content,
                    sha
                }, customCreds);
                return { success: true, sha: result.content.sha };
            } catch (e: any) {
                if (e.status === 409) {
                    return { success: false, conflict: true, message: "Remote version changed." };
                }
                throw e;
            }
        }
    } catch (e: any) {
        console.error("Cloud action failed:", e);
        return { success: false, message: e.message };
    }
    return { success: false, message: "Invalid action." };
}

export async function testGitHubConnection(config: PrivateSyncConfig): Promise<{ success: boolean, message: string }> {
    try {
        // Try to get repository info to verify token and repo exists
        const token = config.pat;
        const owner = config.owner;
        const repo = config.repo;
        
        const url = `https://api.github.com/repos/${owner}/${repo}`;
        const res = await fetch(url, {
            headers: {
                'Authorization': `token ${token}`,
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'Keyra-Electron'
            }
        });

        if (res.ok) {
            const data = await res.json();
            if (data.private === true) {
                return { success: true, message: "Connection successful! Private repository verified." };
            } else {
                return { success: false, message: "Security Error: Selected repository is PUBLIC. Private Sync requires a PRIVATE repository for your security." };
            }
        } else {
            const err = await res.json();
            return { success: false, message: err.message || "Failed to connect." };
        }
    } catch (e: any) {
        return { success: false, message: e.message };
    }
}

export async function getUsers(): Promise<UserRecord[]> {
    // 1. Local Read
    let localUsers: UserRecord[] = [];
    try {
        if (fs.existsSync(STORE_PATH)) {
            localUsers = JSON.parse(fs.readFileSync(STORE_PATH, 'utf-8'));
        }
    } catch (e) {
        console.error("Local storage read failed", e);
    }

    return localUsers;
}

export async function saveUsers(users: UserRecord[]): Promise<void> {
    // 1. Local Save (Immediate feedback)
    fs.writeFileSync(STORE_PATH, JSON.stringify(users, null, 2), 'utf-8');

    // 2. Cloud Save (Only for online users registry)
    // We only push to the central repo if we have a global TOKEN
    if (GITHUB_TOKEN) {
        const res: any = await callSync('put', 'users.json', users);
        if (res.success) {
            lastUsersSHA = res.sha;
        } else {
            console.warn("Cloud users storage failed:", res.message);
        }
    }
}

export async function syncUserData(username: string, data: Partial<UserRecord>, force: boolean = false): Promise<{ success: boolean, conflict?: boolean, message?: string }> {
    const expectedSha = force ? undefined : lastUserDataSHAs[username];

    if (data.isLocal) {
        if (data.privateSync?.enabled && data.privateSync.pat) {
            const filePath = `vault/vault.json`;
            const res: any = await callSync('put', filePath, data, data.privateSync, expectedSha);
            if (res.success) {
                lastUserDataSHAs[username] = (res as any).sha;
                return { success: true };
            }
            return { success: false, conflict: res.conflict, message: res.message };
        }
        return { success: true };
    }
    
    const filePath = `users/${username}/data.json`;
    const res: any = await callSync('put', filePath, data, undefined, expectedSha);
    if (res.success) {
        lastUserDataSHAs[username] = (res as any).sha;
        return { success: true };
    }
    return { success: false, conflict: res.conflict, message: res.message };
}

export async function getUserData(username: string): Promise<any | null> {
    const filePath = `users/${username}/data.json`;
    const result: any = await callSync('get', filePath);
    if (result.success && result.data) {
        lastUserDataSHAs[username] = result.sha;
        return result.data;
    }
    return null;
}

export async function getUserDataDirect(filePath: string, config: PrivateSyncConfig): Promise<any | null> {
    const result: any = await callSync('get', filePath, null, config);
    if (result.success && result.data) {
        return result.data;
    }
    return null;
}

// Polling Engine for Live Sync
export async function pollCloudUpdates(username: string): Promise<{ usersChanged: boolean, dataChanged: boolean, userData?: any }> {
    let usersChanged = false;
    let dataChanged = false;
    let userData: any = null;

    try {
        const users = await getUsers();
        const currentUser = users.find(u => u.username === username);

        // Check global users.json (only for online users)
        if (GITHUB_TOKEN) {
            const userRes: any = await githubRequest('users.json', 'GET');
            if (userRes && userRes.sha !== lastUsersSHA) {
                const content = Buffer.from(userRes.content, 'base64').toString('utf8');
                fs.writeFileSync(STORE_PATH, content);
                lastUsersSHA = userRes.sha;
                usersChanged = true;
            }
        }

        // Check user-specific data.json
        if (currentUser?.isLocal) {
            if (currentUser.privateSync?.enabled && currentUser.privateSync.pat) {
                const dataPath = `vault/vault.json`;
                const dataRes: any = await githubRequest(dataPath, 'GET', null, currentUser.privateSync);
                if (dataRes && dataRes.sha !== lastUserDataSHAs[username]) {
                    const content = Buffer.from(dataRes.content, 'base64').toString('utf8');
                    userData = JSON.parse(content);
                    lastUserDataSHAs[username] = dataRes.sha;
                    dataChanged = true;
                }
            }
        } else {
            const dataPath = `users/${username}/data.json`;
            const dataRes: any = await githubRequest(dataPath, 'GET');
            if (dataRes && dataRes.sha !== lastUserDataSHAs[username]) {
                const content = Buffer.from(dataRes.content, 'base64').toString('utf8');
                userData = JSON.parse(content);
                lastUserDataSHAs[username] = dataRes.sha;
                dataChanged = true;
            }
        }
    } catch (e) {
        console.error("Live Sync Polling Error:", e);
    }

    return { usersChanged, dataChanged, userData };
}

export async function renameUserFolder(oldUsername: string, newUsername: string): Promise<void> {
    const oldPath = `users/${oldUsername}/data.json`;
    const newPath = `users/${newUsername}/data.json`;

    try {
        // 1. Get old data
        const oldFile: any = await githubRequest(oldPath, 'GET');
        if (!oldFile) return;

        // 2. Create new file with same content
        await githubRequest(newPath, 'PUT', {
            message: `Rename user folder: ${oldUsername} -> ${newUsername}`,
            content: oldFile.content
        });

        // 3. Delete old file
        await githubRequest(oldPath, 'DELETE', {
            message: `Cleanup after rename: ${oldUsername} -> ${newUsername}`,
            sha: oldFile.sha
        });

        // 4. Update local SHA tracking if exists
        if (lastUserDataSHAs[oldUsername]) {
            delete lastUserDataSHAs[oldUsername];
        }
    } catch (e) {
        console.error("Failed to rename user folder in cloud:", e);
        throw e;
    }
}

export function backupUsers(filePath: string, users: UserRecord[]): void {
    fs.writeFileSync(filePath, JSON.stringify(users, null, 2), 'utf-8');
}
