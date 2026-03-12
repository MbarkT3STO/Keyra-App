import { AuthenticatorAccount } from '../core/crypto';

export let accounts: AuthenticatorAccount[] = [];

export function setAccounts(newAccounts: AuthenticatorAccount[]) {
    accounts = newAccounts;
}

// Utility to fetch and sync
export async function syncVault(renderCallback: () => void) {
    const fresh = await window.api.getAccounts();
    setAccounts(fresh);
    renderCallback();
}
