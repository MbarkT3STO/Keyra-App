export interface AuthenticatorAccount {
    id: string;      // Unique identifier
    issuer: string;  // e.g. "GitHub"
    account: string; // e.g. "user@example.com"
    secret: string;  // Plaintext before saving, Encypted in storage
    isFavorite?: boolean;
    category?: string;
}

export interface UserRecord {
    id: string;
    username: string;
    email: string;
    hash: string;
    salt: string;
    isActivated: boolean;
    activationCode?: string;
    encryptedVaultData: string;
}

const USERS_KEY = 'keyra_users';

export function getUsers(): UserRecord[] {
    try {
        const data = localStorage.getItem(USERS_KEY);
        return data ? JSON.parse(data) : [];
    } catch (error) {
        console.error('Failed to read users from localStorage', error);
        return [];
    }
}

export function saveUsers(users: UserRecord[]): void {
    try {
        localStorage.setItem(USERS_KEY, JSON.stringify(users));
    } catch (error) {
        console.error('Failed to save users to localStorage', error);
        throw error;
    }
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
