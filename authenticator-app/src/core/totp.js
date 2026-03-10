import * as crypto from 'crypto';
/**
 * Base32 decode a string into a Buffer
 */
function base32Decode(encoded) {
    const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = 0;
    let value = 0;
    let index = 0;
    // Remove padding and ignore case/spaces
    encoded = encoded.replace(/=+$/, '').toUpperCase().replace(/\s/g, '');
    const output = Buffer.alloc(Math.ceil((encoded.length * 5) / 8));
    for (let i = 0; i < encoded.length; i++) {
        const char = encoded[i];
        const val = ALPHABET.indexOf(char);
        if (val === -1) {
            throw new Error(`Invalid base32 character: ${char}`);
        }
        value = (value << 5) | val;
        bits += 5;
        if (bits >= 8) {
            output[index++] = (value >>> (bits - 8)) & 255;
            bits -= 8;
        }
    }
    return output.subarray(0, index);
}
/**
 * Generate a TOTP code based on RFC 6238
 * @param secret Base32 encoded secret key
 * @param time Current time in milliseconds (defaults to Date.now())
 * @param timeStep Time step in seconds (defaults to 30)
 * @param digits Number of digits to return (defaults to 6)
 * @returns Generated TOTP string
 */
export function generateTOTP(secret, time = Date.now(), timeStep = 30, digits = 6) {
    // Decode secret
    const keyBuffer = base32Decode(secret);
    // Calculate counter value
    const counter = Math.floor(time / 1000 / timeStep);
    const counterBuffer = Buffer.alloc(8);
    // Write 64-bit integer to buffer (Big endian)
    // JavaScript integers are 53-bit precision, so max value is safe for many years
    let tempCounter = counter;
    for (let i = 7; i >= 0; i--) {
        counterBuffer[i] = tempCounter & 0xff;
        tempCounter = tempCounter >> 8;
    }
    // Generate HMAC-SHA1
    const hmac = crypto.createHmac('sha1', keyBuffer);
    hmac.update(counterBuffer);
    const digest = hmac.digest();
    // Dynamic Truncation
    const offset = digest[digest.length - 1] & 0xf;
    let binary = ((digest[offset] & 0x7f) << 24) |
        ((digest[offset + 1] & 0xff) << 16) |
        ((digest[offset + 2] & 0xff) << 8) |
        (digest[offset + 3] & 0xff);
    // Return formatted digits
    let otp = (binary % Math.pow(10, digits)).toString();
    while (otp.length < digits) {
        otp = '0' + otp;
    }
    return otp;
}
/**
 * Calculates remaining seconds for the current TOTP validity window
 * @param timeStep default 30s
 */
export function getRemainingSeconds(timeStep = 30) {
    const epoch = Math.round(new Date().getTime() / 1000.0);
    return timeStep - (epoch % timeStep);
}
