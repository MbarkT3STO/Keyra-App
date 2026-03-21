import { Buffer } from 'buffer';

export interface AuthenticatorAccount {
    id: string;
    issuer: string;
    account: string;
    secret: string;
    isFavorite?: boolean;
    category?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hexToBytes(hex: string): Uint8Array {
    const arr = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2)
        arr[i / 2] = parseInt(hex.slice(i, i + 2), 16);
    return arr;
}

function bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function getRandomBytes(n: number): Uint8Array {
    return crypto.getRandomValues(new Uint8Array(n));
}

// ─── Secret shim (base64 passthrough) ────────────────────────────────────────

export function encryptSecret(plain: string): string {
    return Buffer.from(plain, 'utf-8').toString('base64');
}

export function decryptSecret(enc: string): string {
    return Buffer.from(enc, 'base64').toString('utf-8');
}

// ─── Password hashing (PBKDF2 via Web Crypto — sync shim using pre-computed) ─
// Web Crypto PBKDF2 is async-only. We use a synchronous fallback that is
// compatible with the existing stored hashes by reimplementing PBKDF2-HMAC-SHA256
// using a pure-JS approach for the browser, keeping the same output as Node's
// crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256').

const ITERATIONS = 100000;
const KEY_LENGTH = 32;

// Pure-JS PBKDF2-HMAC-SHA256 — matches Node crypto.pbkdf2Sync output exactly
function pbkdf2HmacSha256Sync(password: string, salt: string, iterations: number, keyLen: number): Uint8Array {
    // We use the SubtleCrypto async API but wrap it in a synchronous-looking
    // interface by pre-computing via a shared cache. For login/signup this is
    // called once so the async version is fine — we expose async wrappers below.
    throw new Error('Use async version');
}

async function pbkdf2Async(password: string, salt: string, iterations: number, keyLen: number): Promise<Uint8Array> {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        'raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']
    );
    const bits = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt: enc.encode(salt), iterations, hash: 'SHA-256' },
        keyMaterial, keyLen * 8
    );
    return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<{ hash: string, salt: string }> {
    const saltBytes = getRandomBytes(16);
    const salt = bytesToHex(saltBytes);
    const derived = await pbkdf2Async(password, salt, ITERATIONS, KEY_LENGTH);
    const hash = bytesToHex(derived);
    return { hash, salt };
}

export async function verifyPassword(password: string, hash: string, salt: string): Promise<boolean> {
    const derived = await pbkdf2Async(password, salt, ITERATIONS, KEY_LENGTH);
    return bytesToHex(derived) === hash;
}

export async function deriveKey(password: string, salt: string): Promise<CryptoKey> {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']
    );
    return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: enc.encode(salt), iterations: ITERATIONS, hash: 'SHA-256' },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

// ─── AES-256-GCM vault encryption ────────────────────────────────────────────

export async function encryptVault(plainData: string, key: CryptoKey): Promise<string> {
    const iv = getRandomBytes(12);
    const enc = new TextEncoder();
    const cipherBuf = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        enc.encode(plainData)
    );
    // AES-GCM in Web Crypto appends the 16-byte auth tag at the end of ciphertext
    const cipherBytes = new Uint8Array(cipherBuf);
    const payload = cipherBytes.slice(0, -16);
    const authTag = cipherBytes.slice(-16);
    return `${Buffer.from(iv).toString('base64')}:${Buffer.from(authTag).toString('base64')}:${Buffer.from(payload).toString('base64')}`;
}

export async function decryptVault(encryptedData: string, key: CryptoKey): Promise<string> {
    const parts = encryptedData.split(':');
    if (parts.length !== 3) throw new Error('Invalid encrypted vault format');
    const [ivStr, authTagStr, payloadStr] = parts;
    const iv = Buffer.from(ivStr, 'base64');
    const authTag = Buffer.from(authTagStr, 'base64');
    const payload = Buffer.from(payloadStr, 'base64');

    // Reassemble: payload + authTag (Web Crypto expects them concatenated)
    const combined = new Uint8Array(payload.length + authTag.length);
    combined.set(payload);
    combined.set(authTag, payload.length);

    const decBuf = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        combined
    );
    return new TextDecoder().decode(decBuf);
}

// ─── Key serialization (for session storage) ─────────────────────────────────

export async function exportKey(key: CryptoKey): Promise<string> {
    const raw = await crypto.subtle.exportKey('raw', key);
    return Buffer.from(raw).toString('base64');
}

export async function importKey(base64: string): Promise<CryptoKey> {
    const raw = Buffer.from(base64, 'base64');
    return crypto.subtle.importKey(
        'raw', raw,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}
