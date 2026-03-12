import * as nodemailer from 'nodemailer';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Initialize dotenv from the root directory
dotenv.config({ path: path.join(__dirname, '../../.env') });

export interface MailOptions {
    to: string;
    subject: string;
    code: string;
}

/**
 * Sends an activation email using SMTP (e.g. Gmail).
 * Falls back to simulation mode if no SMTP credentials are set.
 */
export async function sendActivationEmail(options: MailOptions): Promise<{ success: boolean; message: string }> {
    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT || '587');
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const fromName = process.env.MAIL_FROM_NAME || 'Keyra Authenticator';

    if (!host || !user || !pass) {
        console.log(`[MAILER] No SMTP credentials found. Falling back to simulation for ${options.to}`);
        return { success: false, message: "Simulation mode active." };
    }

    const transporter = nodemailer.createTransport({
        host: host,
        port: port,
        secure: port === 465, // true for 465, false for other ports
        auth: {
            user: user,
            pass: pass
        },
        tls: {
            ciphers: 'SSLv3'
        }
    });

    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0f0a1e; color: #ffffff; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 0 auto; padding: 40px; background: linear-gradient(135deg, #1a142e 0%, #0f0a1e 100%); border-radius: 20px; border: 1px solid rgba(255,255,255,0.1); }
            .logo { font-size: 28px; font-weight: bold; color: #6f2dbd; text-align: center; margin-bottom: 30px; letter-spacing: 2px; }
            h1 { text-align: center; color: #b19cd9; font-size: 24px; margin-bottom: 20px; }
            p { font-size: 16px; line-height: 1.6; color: #d0d0d0; text-align: center; }
            .code-box { background: rgba(111, 45, 189, 0.2); border: 2px solid #6f2dbd; border-radius: 12px; padding: 20px; margin: 30px 0; text-align: center; }
            .code { font-size: 42px; font-weight: 800; color: #ffffff; letter-spacing: 12px; }
            .footer { margin-top: 40px; font-size: 12px; color: #666; text-align: center; }
            .highlight { color: #6f2dbd; font-weight: bold; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="logo">KEYRA</div>
            <h1>Activate Your Vault</h1>
            <p>Welcome to the next level of security. Use the code below to verify your email and unlock your <span class="highlight">Keyra Authenticator</span> account.</p>
            
            <div class="code-box">
                <div class="code">${options.code}</div>
            </div>
            
            <p>This code will expire in 10 minutes. If you didn't request this email, you can safely ignore it.</p>
            
            <div class="footer">
                &copy; 2026 Keyra Authenticator. All rights reserved.<br>
                Secure. Local-First. Premium.
            </div>
        </div>
    </body>
    </html>
    `;

    try {
        await transporter.sendMail({
            from: `"${fromName}" <${user}>`,
            to: options.to,
            subject: options.subject,
            html: htmlContent
        });

        console.log(`[MAILER] Activation email sent successfully to ${options.to}`);
        return { success: true, message: "Email sent." };
    } catch (error: any) {
        if (error.code === 'EAUTH') {
            console.error(`[MAILER] Authentication Error: SMTP AUTH is likely disabled for this account.`);
            console.error(`[MAILER] Visit: https://aka.ms/smtp_auth_disabled`);
            return { 
                success: false, 
                message: "Authentication failed. SMTP AUTH might be disabled in your Outlook settings." 
            };
        }
        console.error(`[MAILER] SMTP Error:`, error);
        return { success: false, message: "SMTP error. Check logs." };
    }
}
