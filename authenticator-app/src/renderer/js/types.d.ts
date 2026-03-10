import { AuthenticatorAccount } from '../core/crypto';

declare global {
    interface Window {
        api: {
            getAccounts: () => Promise<AuthenticatorAccount[]>;
            saveAccount: (account: Partial<AuthenticatorAccount>) => Promise<void>;
            deleteAccount: (id: string) => Promise<void>;
            generateTOTP: (secret: string) => Promise<string>;
            getRemainingSeconds: () => Promise<number>;
            parseURI: (uri: string) => Promise<{ issuer: string, account: string, secret: string }>;
            minimize: () => void;
            maximize: () => void;
            close: () => void;
        };
    }
}
