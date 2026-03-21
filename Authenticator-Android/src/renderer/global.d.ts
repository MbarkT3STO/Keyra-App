export { };

declare global {
    interface DeviceRecord {
        id: string;
        name: string;
        platform: string;
        firstSeen: string;
        lastSeen: string;
    }

    interface Window {
        ui?: any;
        api: {
            signup(user: string, email: string, pass: string): Promise<{ success: boolean, message: string, code?: string }>;
            resendCode(email: string): Promise<{ success: boolean, message: string, code?: string }>;
            verifyEmail(email: string, code: string): Promise<{ success: boolean, message: string }>;
            login(user: string, pass: string): Promise<{ success: boolean, message: string }>;
            checkSession(): Promise<{ success: boolean, message: string }>;
            logout(): Promise<void>;
            getCurrentUser(): Promise<{ id: string, username: string, email: string, pendingEmail?: string, devices?: DeviceRecord[] } | null>;
            updateUserSettings(settings: any): Promise<void>;
            pollForUpdates(): Promise<{ changed: boolean, settings?: any }>;

            // Account Management
            changeUsername(newName: string): Promise<{ success: boolean, message: string }>;
            changePassword(newPassword: string): Promise<{ success: boolean, message: string }>;
            requestEmailChange(newEmail: string): Promise<{ success: boolean, message: string, code?: string }>;
            confirmEmailChange(code: string): Promise<{ success: boolean, message: string }>;
            cancelEmailChange(): Promise<{ success: boolean, message: string }>;
            resendEmailChangeCode(): Promise<{ success: boolean, message: string, code?: string }>;

            // Device Management
            getCurrentDeviceId(): string;
            revokeDevice(deviceId: string): Promise<{ success: boolean, message: string }>;

            generateTOTP(secret: string): Promise<string>;
            saveAccount(acc: any): Promise<void>;
            deleteAccount(id: string): Promise<void>;
            getRemainingSeconds(): Promise<number>;
            getAccounts(): Promise<any>;
            parseURI(uri: string): Promise<any>;
            minimize(): void;
            maximize(): void;
            close(): void;
        };
    }
}
