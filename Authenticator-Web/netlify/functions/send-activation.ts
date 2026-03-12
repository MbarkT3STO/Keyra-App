import nodemailer from 'nodemailer';

export async function handler(event: any) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { to, subject, code } = JSON.parse(event.body);

        const host = process.env.SMTP_HOST || 'smtp-mail.outlook.com';
        const port = parseInt(process.env.SMTP_PORT || '587');
        const user = process.env.SMTP_USER;
        const pass = process.env.SMTP_PASS;
        const fromName = process.env.MAIL_FROM_NAME || 'Keyra Authenticator';

        if (!user || !pass) {
            return {
                statusCode: 500,
                body: JSON.stringify({ success: false, message: "SMTP credentials not configured on server." })
            };
        }

        const transporter = nodemailer.createTransport({
            host: host,
            port: port,
            secure: port === 465,
            auth: { user, pass },
            tls: {
                ciphers: 'SSLv3',
                rejectUnauthorized: false
            }
        });

        const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0f0a1e; color: #ffffff; margin: 0; padding: 0; }
                .container { max-width: 600px; margin: 20px auto; padding: 40px; background: #1a142e; border-radius: 20px; border: 1px solid rgba(255,255,255,0.1); }
                .logo { font-size: 28px; font-weight: bold; color: #6f2dbd; text-align: center; margin-bottom: 30px; letter-spacing: 2px; }
                h1 { text-align: center; color: #b19cd9; font-size: 24px; margin-bottom: 20px; }
                p { font-size: 16px; line-height: 1.6; color: #d0d0d0; text-align: center; }
                .code-box { background: rgba(111, 45, 189, 0.2); border: 2px solid #6f2dbd; border-radius: 12px; padding: 20px; margin: 30px 0; text-align: center; }
                .code { font-size: 42px; font-weight: 800; color: #ffffff; letter-spacing: 12px; }
                .footer { margin-top: 40px; font-size: 12px; color: #666; text-align: center; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="logo">KEYRA</div>
                <h1>Activate Your Vault</h1>
                <p>Use the code below to verify your email and unlock your Keyra Authenticator account.</p>
                <div class="code-box">
                    <div class="code">${code}</div>
                </div>
                <p>This code will expire in 10 minutes.</p>
                <div class="footer">&copy; 2026 Keyra Authenticator. Secure. Local-First. Premium.</div>
            </div>
        </body>
        </html>
        `;

        await transporter.sendMail({
            from: `"${fromName}" <${user}>`,
            to,
            subject,
            html: htmlContent
        });

        return {
            statusCode: 200,
            body: JSON.stringify({ success: true, message: "Email sent successfully." })
        };
    } catch (error: any) {
        console.error('SMTP Error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ success: false, message: error.message })
        };
    }
}
