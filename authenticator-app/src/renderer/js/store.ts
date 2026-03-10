import { AuthenticatorAccount } from '../../core/crypto';

export let accounts: AuthenticatorAccount[] = [];

export function setAccounts(newAccounts: AuthenticatorAccount[]) {
    accounts = newAccounts;
    accounts.sort((a, b) => a.issuer.localeCompare(b.issuer));
}

// Utility to fetch and sync
export async function syncVault(renderCallback: () => void) {
    const fresh = await window.api.getAccounts();
    setAccounts(fresh);
    renderCallback();
}
