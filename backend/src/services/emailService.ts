import nodemailer from "nodemailer";
import type { AppEnv } from "../config/env.js";

export interface EmailService {
  sendOtpCode(to: string, code: string, expiresMinutes: number): Promise<void>;
}

export function createEmailService(env: AppEnv): EmailService {
  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    connectionTimeout: 10000,
    auth: env.SMTP_USER && env.SMTP_PASS
      ? { user: env.SMTP_USER, pass: env.SMTP_PASS }
      : undefined
  });

  return {
    async sendOtpCode(to: string, code: string, expiresMinutes: number) {
      const subject = "Nintendo GameTime - 登录验证码";
      const html = `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color: #e60012;">Nintendo GameTime</h2>
          <p>您的登录验证码是：</p>
          <p style="font-size: 32px; font-weight: bold; letter-spacing: 8px;
                     color: #333; background: #f5f5f5; padding: 16px; text-align: center;
                     border-radius: 8px;">
            ${code}
          </p>
          <p style="color: #666;">验证码 ${expiresMinutes} 分钟内有效，请勿泄露给他人。</p>
          <p style="color: #999; font-size: 12px;">如果这不是您的操作，请忽略此邮件。</p>
        </div>
      `;

      await transporter.sendMail({
        from: env.SMTP_FROM || env.SMTP_USER,
        to,
        subject,
        html
      });
    }
  };
}
