import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { encryptSecret, decryptSecret } from './crypto';
import * as crypto from 'crypto'; // For UUID
const STORE_PATH = path.join(app.getPath('userData'), 'accounts.json');
export function getAccounts() {
    try {
        if (!fs.existsSync(STORE_PATH)) {
            return [];
        }
        const data = fs.readFileSync(STORE_PATH, 'utf-8');
        const encryptedAccounts = JSON.parse(data);
        return encryptedAccounts.map(acc => {
            try {
                return {
                    id: acc.id,
                    issuer: acc.issuer,
                    account: acc.account,
                    secret: decryptSecret(acc.encryptedSecret)
                };
            }
            catch (e) {
                console.error(`Failed to decrypt account ${acc.id}`);
                return null;
            }
        }).filter(a => a !== null);
    }
    catch (error) {
        console.error('Failed to read accounts', error);
        return [];
    }
}
export function saveAccounts(accounts) {
    try {
        const encryptedAccounts = accounts.map(acc => ({
            id: acc.id || crypto.randomUUID(),
            issuer: acc.issuer,
            account: acc.account,
            encryptedSecret: encryptSecret(acc.secret)
        }));
        fs.writeFileSync(STORE_PATH, JSON.stringify(encryptedAccounts, null, 2), 'utf-8');
    }
    catch (error) {
        console.error('Failed to save accounts', error);
        throw error;
    }
}
export function backupAccounts(filePath, accounts) {
    // A simple unencrypted backup - in production, this should be encrypted with a password
    fs.writeFileSync(filePath, JSON.stringify(accounts, null, 2), 'utf-8');
}
