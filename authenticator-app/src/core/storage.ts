import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { AuthenticatorAccount, EncryptedAccount, encryptSecret, decryptSecret } from './crypto';
import * as crypto from 'crypto'; // For UUID

const STORE_PATH = path.join(app.getPath('userData'), 'accounts.json');

export function getAccounts(): AuthenticatorAccount[] {
    try {
        if (!fs.existsSync(STORE_PATH)) {
            return [];
        }

        const data = fs.readFileSync(STORE_PATH, 'utf-8');
        const encryptedAccounts: EncryptedAccount[] = JSON.parse(data);

        return encryptedAccounts.map(acc => {
            try {
                return {
                    id: acc.id,
                    issuer: acc.issuer,
                    account: acc.account,
                    secret: decryptSecret(acc.encryptedSecret),
                    isFavorite: acc.isFavorite || false,
                    category: acc.category || 'All'
                };
            } catch (e) {
                console.error(`Failed to decrypt account ${acc.id}`);
                return null;
            }
        }).filter(a => a !== null) as AuthenticatorAccount[];
    } catch (error) {
        console.error('Failed to read accounts', error);
        return [];
    }
}

export function saveAccounts(accounts: AuthenticatorAccount[]): void {
    try {
        const encryptedAccounts: EncryptedAccount[] = accounts.map(acc => ({
            id: acc.id || crypto.randomUUID(),
            issuer: acc.issuer,
            account: acc.account,
            encryptedSecret: encryptSecret(acc.secret),
            isFavorite: acc.isFavorite || false,
            category: acc.category || 'All'
        }));

        fs.writeFileSync(STORE_PATH, JSON.stringify(encryptedAccounts, null, 2), 'utf-8');
    } catch (error) {
        console.error('Failed to save accounts', error);
        throw error;
    }
}

export function backupAccounts(filePath: string, accounts: AuthenticatorAccount[]): void {
    // A simple unencrypted backup - in production, this should be encrypted with a password
    fs.writeFileSync(filePath, JSON.stringify(accounts, null, 2), 'utf-8');
}
