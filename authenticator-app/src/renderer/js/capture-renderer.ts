declare const jsQR: any;

const overlay = document.getElementById('screen-capture-overlay')!;
const selectionBox = document.getElementById('selection-box')!;

let isDragging = false;
let startX = 0;
let startY = 0;

window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        (window as any).api.closeCaptureWindow();
    }
});

overlay.addEventListener('mousedown', (e) => {
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    updateSelection(startX, startY, startX, startY);
    selectionBox.style.display = 'block';
});

overlay.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    updateSelection(startX, startY, e.clientX, e.clientY);
});

overlay.addEventListener('mouseup', async (e) => {
    if (!isDragging) return;
    isDragging = false;
    
    const rect = {
        x: Math.min(startX, e.clientX),
        y: Math.min(startY, e.clientY),
        width: Math.abs(startX - e.clientX),
        height: Math.abs(startY - e.clientY)
    };

    if (rect.width > 5 && rect.height > 5) {
        await captureAndScan(rect);
    } else {
        (window as any).api.closeCaptureWindow();
    }
});

function updateSelection(x1: number, y1: number, x2: number, y2: number) {
    const left = Math.min(x1, x2);
    const top = Math.min(y1, y2);
    const width = Math.abs(x1 - x2);
    const height = Math.abs(y1 - y2);

    selectionBox.style.left = `${left}px`;
    selectionBox.style.top = `${top}px`;
    selectionBox.style.width = `${width}px`;
    selectionBox.style.height = `${height}px`;
}

async function captureAndScan(rect: { x: number; y: number; width: number; height: number }) {
    try {
        const sources = await (window as any).api.getDesktopSources();
        const entireScreenSource = sources.find((s: any) => s.name === 'Entire Screen' || s.name === 'Screen 1') || sources[0];

        if (!entireScreenSource) {
            (window as any).api.closeCaptureWindow();
            return;
        }

        const stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
                mandatory: {
                    chromeMediaSource: 'desktop',
                    chromeMediaSourceId: entireScreenSource.id,
                    minWidth: window.screen.width,
                    maxWidth: window.screen.width,
                    minHeight: window.screen.height,
                    maxHeight: window.screen.height
                }
            } as any
        });

        const video = document.createElement('video');
        video.srcObject = stream;
        await video.play();

        const canvas = document.createElement('canvas');
        canvas.width = window.screen.width;
        canvas.height = window.screen.height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Stop stream
        stream.getTracks().forEach(track => track.stop());

        // Now crop to the selection
        const cropCanvas = document.createElement('canvas');
        cropCanvas.width = rect.width;
        cropCanvas.height = rect.height;
        const cropCtx = cropCanvas.getContext('2d')!;
        cropCtx.drawImage(canvas, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);

        const imageData = cropCtx.getImageData(0, 0, cropCanvas.width, cropCanvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);

        if (code && code.data) {
            (window as any).api.sendCaptureResult(code.data);
        } else {
            // No QR found, just close
            (window as any).api.closeCaptureWindow();
        }
    } catch (err) {
        console.error("Capture failed:", err);
        (window as any).api.closeCaptureWindow();
    }
}
