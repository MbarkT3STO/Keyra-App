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

async function githubRequest(filePath: string, method: string = 'GET', body: any = null) {
    if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
        throw new Error("GitHub configuration missing in .env.");
    }

    const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}`;
    
    const headers: Record<string, string> = {
        'Authorization': `token ${GITHUB_TOKEN}`,
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
        const errorData = await response.json();
        throw new Error(`GitHub API Error: ${response.status} ${JSON.stringify(errorData)}`);
    }

    return response.json();
}

async function callSync(action: 'get' | 'put', filePath: string, data?: any) {
    try {
        if (action === 'get') {
            const fileData: any = await githubRequest(filePath, 'GET');
            if (!fileData) return { success: true, data: null, sha: null };
            const content = Buffer.from(fileData.content, 'base64').toString('utf8');
            return { success: true, data: JSON.parse(content), sha: fileData.sha };
        }

        if (action === 'put') {
            const existingFile: any = await githubRequest(filePath, 'GET');
            const sha = existingFile ? existingFile.sha : undefined;
            const content = Buffer.from(JSON.stringify(data, null, 2)).toString('base64');
            
            const result = await githubRequest(filePath, 'PUT', {
                message: `Sync ${filePath} from Desktop`,
                content,
                sha
            });
            return { success: true, sha: result.content.sha };
        }
    } catch (e: any) {
        console.error("Cloud action failed:", e);
        return { success: false, message: e.message };
    }
    return { success: false, message: "Invalid action." };
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

    // 2. Cloud Save
    const res: any = await callSync('put', 'users.json', users);
    if (res.success) {
        lastUsersSHA = res.sha;
    } else {
        console.warn("Cloud users storage failed:", res.message);
    }
}

export async function syncUserData(username: string, data: Partial<UserRecord>): Promise<void> {
    const filePath = `users/${username}/data.json`;
    const res: any = await callSync('put', filePath, data);
    if (res.success) {
        lastUserDataSHAs[username] = (res as any).sha;
    }
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

// Polling Engine for Live Sync
export async function pollCloudUpdates(username: string): Promise<{ usersChanged: boolean, dataChanged: boolean, userData?: any }> {
    let usersChanged = false;
    let dataChanged = false;
    let userData: any = null;

    try {
        // Check users.json
        const userRes: any = await githubRequest('users.json', 'GET');
        if (userRes && userRes.sha !== lastUsersSHA) {
            const content = Buffer.from(userRes.content, 'base64').toString('utf8');
            fs.writeFileSync(STORE_PATH, content);
            lastUsersSHA = userRes.sha;
            usersChanged = true;
        }

        // Check user-specific data.json
        const dataPath = `users/${username}/data.json`;
        const dataRes: any = await githubRequest(dataPath, 'GET');
        if (dataRes && dataRes.sha !== lastUserDataSHAs[username]) {
            const content = Buffer.from(dataRes.content, 'base64').toString('utf8');
            userData = JSON.parse(content);
            lastUserDataSHAs[username] = dataRes.sha;
            dataChanged = true;
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
