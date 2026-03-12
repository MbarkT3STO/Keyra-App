import * as crypto from 'crypto';

export interface AuthenticatorAccount {
    id: string;      // Unique identifier
    issuer: string;  // e.g. "GitHub"
    account: string; // e.g. "user@example.com"
    secret: string;  // Plaintext before saving, Encypted in storage
    isFavorite?: boolean;
    category?: string;
}

/**
 * Browser-safe secret encryption (no-op/simple base64 shim)
 * In the web version, we rely on the main vault encryption.
 */
export function encryptSecret(plainSecret: string): string {
    return Buffer.from(plainSecret, 'utf-8').toString('base64');
}

export function decryptSecret(encryptedSecretBase64: string): string {
    return Buffer.from(encryptedSecretBase64, 'base64').toString('utf-8');
}

// ─── Multi-User Symmetric Encryption (AES-256-GCM) ─────────────────────────

const ITERATIONS = 100000;
const KEY_LENGTH = 32; // 256 bits
const DIGEST = 'sha256';

export function hashPassword(password: string): { hash: string, salt: string } {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST).toString('hex');
    return { hash, salt };
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
    const attemptedHash = crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST).toString('hex');
    return hash === attemptedHash;
}

export function deriveKey(password: string, salt: string): Buffer {
    return crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST);
}

/**
 * Encrypts arbitrary string data (like a serialized JSON vault) using AES-256-GCM
 */
export function encryptVault(plainData: string, key: Buffer): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    let encrypted = cipher.update(plainData, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    const authTag = cipher.getAuthTag();

    // Format: iv:authTag:encrypted payload
    return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
}

/**
 * Decrypts AES-256-GCM encrypted string data
 */
export function decryptVault(encryptedData: string, key: Buffer): string {
    const parts = encryptedData.split(':');
    if (parts.length !== 3) throw new Error("Invalid encrypted vault format");

    const [ivStr, authTagStr, encryptedPayload] = parts;
    const iv = Buffer.from(ivStr, 'base64');
    const authTag = Buffer.from(authTagStr, 'base64');

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedPayload, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
}
