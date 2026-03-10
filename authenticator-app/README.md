# Keyra Authenticator

A premium, highly secure desktop authenticator application built with Electron, Vanilla TypeScript, and a stunning "Nightfall Bloom" glassmorphic UI.

## Features
- **Military-Grade Security**: localized zero-knowledge storage and TOTP generation.
- **Glassmorphic Aesthetic**: Deep violets and high-blur effects define the visually stunning interface.
- **Master PIN System**: Protect your app on startup and during Auto-Lock intervals.
- **Privacy First**: Hide OTP codes from shoulder surfers with a single toggle.
- **Data Portability**: Securely export and purge your vault at any time.

## Tech Stack
- **Framework**: Electron
- **Logic**: Vanilla TypeScript & JavaScript
- **Styling**: Pure CSS (No external frameworks)
- **Scanning**: jsQR

## Development

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Build and Run**
   ```bash
   npm run build
   npm start
   ```

## Security Note
Your vault data is saved securely to your local OS `AppData` directory. Be cautious when exporting your vault to JSON; ensure it is stored securely offline or within an encrypted drive.
