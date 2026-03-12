export interface MailOptions {
    to: string;
    subject: string;
    code: string;
}

/**
 * Sends an activation email via Netlify Function (Server-side SMTP).
 */
export async function sendActivationEmail(options: MailOptions): Promise<{ success: boolean; message: string }> {
    try {
        const response = await fetch('/.netlify/functions/send-activation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(options)
        });

        // If we get a 404, it means we are likely in 'npm run dev' without Netlify Functions
        if (response.status === 404 && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
            console.log(`[MAILER SIMULATION] Code for ${options.to}: ${options.code}`);
            return { success: true, message: "Simulation mode (Localhost). Check console." };
        }

        const contentType = response.headers.get("content-type");
        if (!response.ok || !contentType || !contentType.includes("application/json")) {
            const text = await response.text();
            throw new Error(`Server Error (${response.status}): ${text.slice(0, 100)}`);
        }

        const result = await response.json();
        return { 
            success: result.success, 
            message: result.message || (result.success ? "Email sent." : "Failed to send.") 
        };
    } catch (error: any) {
        // Network errors on localhost also trigger simulation
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            console.log(`[MAILER SIMULATION] Code for ${options.to}: ${options.code}`);
            return { success: true, message: "Simulation mode (Localhost). Check console." };
        }
        console.error(`[MAILER] Error:`, error);
        return { success: false, message: error.message || "Network error." };
    }
}
