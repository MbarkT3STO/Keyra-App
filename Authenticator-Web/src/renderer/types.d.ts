interface Window {
    api: {
        signup: (user: string, email: string, pass: string) => Promise<any>;
        resendCode: (email: string) => Promise<any>;
        verifyEmail: (email: string, code: string) => Promise<any>;
        login: (user: string, pass: string) => Promise<any>;
        checkSession: () => Promise<any>;
        logout: () => Promise<void>;
        getCurrentUser: () => Promise<any>;
        
        getAccounts: () => Promise<any[]>;
        saveAccount: (account: any) => Promise<void>;
        deleteAccount: (id: string) => Promise<void>;
        generateTOTP: (secret: string) => Promise<string>;
        getRemainingSeconds: () => Promise<number>;
        parseURI: (uri: string) => Promise<any>;

        minimize: () => void;
        maximize: () => void;
        close: () => void;
    };
    lucide: any;
    currentUserId: string;
}
