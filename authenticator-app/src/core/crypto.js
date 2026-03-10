import { safeStorage } from 'electron';
/**
 * Encrypt a plain secret string using Electron safeStorage.
 * safeStorage uses OS-level encryption (Keychain on macOS, Credential Manager on Windows)
 */
export function encryptSecret(plainSecret) {
    if (!safeStorage.isEncryptionAvailable()) {
        // Fallback if OS encryption is somehow broken or unavailable
        // In a production app you might implement a custom AES fallback with a master password,
        // but for this scope, returning the string is better than failing, or we could throw.
        console.warn("safeStorage is unavailable, saving secret unencrypted. THIS IS A SECURITY RISK.");
        return Buffer.from(plainSecret, 'utf-8').toString('base64');
    }
    const encryptedBuffer = safeStorage.encryptString(plainSecret);
    return encryptedBuffer.toString('base64');
}
/**
 * Decrypt an encrypted secret back to plaintext
 */
export function decryptSecret(encryptedSecretBase64) {
    if (!safeStorage.isEncryptionAvailable()) {
        // Fallback decryption
        return Buffer.from(encryptedSecretBase64, 'base64').toString('utf-8');
    }
    try {
        const encryptedBuffer = Buffer.from(encryptedSecretBase64, 'base64');
        return safeStorage.decryptString(encryptedBuffer);
    }
    catch (err) {
        console.error("Failed to decrypt secret", err);
        throw new Error("Unable to decrypt account secret.");
    }
}
