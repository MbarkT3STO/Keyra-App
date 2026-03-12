import { accounts, syncVault } from './store.js';
// Removed renderAccounts as we use window.ui.refreshAccounts()

declare const jsQR: any; // from the script tag in index.html

const video = document.getElementById('qr-video') as HTMLVideoElement;
const canvas = document.getElementById('qr-canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const modalQR = document.getElementById('modal-qr')!;
const modalAdd = document.getElementById('modal-add')!;

let requestAnimationId: number | null = null;

export function setupScanner() {
    document.getElementById('btn-scan-qr')?.addEventListener('click', async () => {
        if ((window as any).ui) {
            (window as any).ui.hideModal();
            // Since we don't have showModal exposed as generic, we'll need to expose it or use a simplified approach
            // For now, let's just use current UI instance
        }
        await startVideo();
    });
}

async function startVideo() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        video.srcObject = stream;
        video.setAttribute("playsinline", "true"); // required to tell iOS safari we don't want fullscreen
        video.play();

        requestAnimationId = requestAnimationFrame(tick);
    } catch (err) {
        console.error("Camera access denied or unavailable", err);
        if ((window as any).ui) (window as any).ui.hideModal();
        // showToast would need to be exposed
    }
}

function stopVideo() {
    if (video.srcObject) {
        (video.srcObject as MediaStream).getTracks().forEach(track => track.stop());
        video.srcObject = null;
    }
    if (requestAnimationId) {
        cancelAnimationFrame(requestAnimationId);
        requestAnimationId = null;
    }
}

async function tick() {
    if (video.readyState === video.HAVE_ENOUGH_DATA && !modalQR.classList.contains('hidden')) {
        canvas.height = video.videoHeight;
        canvas.width = video.videoWidth;

        if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height, {
                inversionAttempts: "dontInvert",
            });

            if (code && code.data) {
                const success = await handleScannedData(code.data);
                if (success) {
                    stopVideo();
                    if ((window as any).ui) (window as any).ui.hideModal();
                    return; // Stop scanning
                }
            }
        }
    }

    // Continue scanning if not found and modal is still open
    if (!modalQR.classList.contains('hidden')) {
        requestAnimationId = requestAnimationFrame(tick);
    } else {
        stopVideo();
    }
}

async function handleScannedData(data: string): Promise<boolean> {
    try {
        if (!data.startsWith('otpauth://totp/')) return false;

        const parsed = await window.api.parseURI(data);

        // Ensure secret base32 validity
        await window.api.generateTOTP(parsed.secret);

        // Save
        const updated = await window.api.saveAccount({
            issuer: parsed.issuer,
            account: parsed.account,
            secret: parsed.secret
        });

        if ((window as any).ui) {
            await syncVault(() => (window as any).ui.refreshAccounts());
            (window as any).ui.showToast(`Added ${parsed.issuer} account!`);
        }
        return true;
    } catch (err) {
        console.error("Invalid QR Format", err);
        return false;
    }
}
