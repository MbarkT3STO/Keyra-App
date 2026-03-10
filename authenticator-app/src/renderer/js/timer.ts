import { renderAccounts } from './ui.js';
import { accounts } from './store.js';

/**
 * Handle Nightfall Bloom countdown syncing.
 */
export function runTimer() {
    setInterval(async () => {
        const remaining = await window.api.getRemainingSeconds();

        // 88 matches the r=14 in ui.ts
        const circumference = 88;
        const progress = (remaining / 30) * circumference;

        document.querySelectorAll('.timer-fill').forEach(ring => {
            (ring as SVGElement).style.strokeDashoffset = (circumference - progress).toString();
        });

        const pct = (remaining / 30) * 100;
        document.querySelectorAll('.progress-bar').forEach(bar => {
            (bar as HTMLElement).style.width = `${pct}%`;

            if (remaining <= 5) {
                bar.classList.add('warn');
            } else {
                bar.classList.remove('warn');
            }
        });

        // Re-generate TOTPs every 30s cycle
        if (remaining === 30 || remaining === 0) {
            const si = document.getElementById('search-input') as HTMLInputElement;
            renderAccounts(si ? si.value.toLowerCase() : '');
        }

    }, 1000);
}
