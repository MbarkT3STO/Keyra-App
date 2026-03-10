export function parseOTPAuthURI(uri) {
    // Expected format: otpauth://totp/Issuer:accountName?secret=SECRET&issuer=Issuer
    if (!uri.startsWith('otpauth://totp/')) {
        throw new Error('Invalid URI: only otpauth://totp/ is supported');
    }
    const url = new URL(uri);
    const secret = url.searchParams.get('secret');
    if (!secret) {
        throw new Error('Invalid URI: missing secret parameter');
    }
    let issuer = url.searchParams.get('issuer') || 'Unknown';
    let account = 'Unknown';
    // Pathname is usually /Issuer:accountName OR /accountName
    // remove the leading slash
    const label = decodeURIComponent(url.pathname.substring(1));
    if (label.includes(':')) {
        const parts = label.split(':');
        issuer = issuer !== 'Unknown' ? issuer : parts[0].trim();
        account = parts[1].trim();
    }
    else {
        account = label.trim();
    }
    return { secret, issuer, account };
}
