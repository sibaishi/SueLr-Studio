// @ts-expect-error Nodemailer does not ship bundled TypeScript declarations in this backend package.
import nodemailer from 'nodemailer';
import { ValidationError } from '../../app/errors/index.ts';
import type { DynamicValue } from '../../modules/types.ts';
import { createLogger } from '../logging/logger.ts';

const logger = createLogger({ module: 'email-service' });

export type EmailSendResult = {
  ok: boolean;
  status: 'disabled' | 'sent' | 'failed';
  message: string;
  error?: string;
};

export type EmailStatus = {
  provider: 'none' | 'smtp';
  configured: boolean;
  from: string;
  smtpHostSet: boolean;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUserSet: boolean;
};

export type EmailMessage = {
  to?: string;
  subject: string;
  text: string;
};

export type EmailConfig = {
  provider: 'none' | 'smtp';
  from: string;
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    pass: string;
  };
};

export type EmailTransport = {
  sendMail(message: { from: string; to: string; subject: string; text: string }): Promise<unknown>;
};

export type EmailTransportFactory = (config: EmailConfig) => EmailTransport;
export type EmailConfigProvider = () => DynamicValue;

const DEFAULT_FROM = 'SueLr Studio <no-reply@studio.suelr.com>';

function cleanString(value: unknown, maxLength = 4000): string {
  return String(value || '')
    .trim()
    .slice(0, maxLength);
}

function parseBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function parsePort(value: unknown, fallback = 587): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 65535 ? parsed : fallback;
}

function normalizeProvider(value: unknown): 'none' | 'smtp' {
  return value === 'smtp' ? 'smtp' : 'none';
}

function createNodemailerTransport(config: EmailConfig): EmailTransport {
  return nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: config.smtp.user || config.smtp.pass ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
  });
}

export function buildEmailConfig(input: DynamicValue = {}): EmailConfig {
  const value = input && typeof input === 'object' ? input : {};
  const smtp = value.smtp && typeof value.smtp === 'object' ? value.smtp : {};
  return {
    provider: normalizeProvider(value.provider ?? process.env.EMAIL_PROVIDER),
    from: cleanString(value.from ?? process.env.EMAIL_FROM, 320) || DEFAULT_FROM,
    smtp: {
      host: cleanString(smtp.host ?? process.env.SMTP_HOST, 320),
      port: parsePort(smtp.port ?? process.env.SMTP_PORT, 587),
      secure: parseBoolean(smtp.secure ?? process.env.SMTP_SECURE, false),
      user: cleanString(smtp.user ?? process.env.SMTP_USER, 320),
      pass: cleanString(smtp.pass ?? process.env.SMTP_PASS, 4000),
    },
  };
}

export class EmailService {
  private configProvider: EmailConfigProvider;
  private readonly transportFactory: EmailTransportFactory;
  private lastTestResult: EmailSendResult | null = null;

  constructor(
    configProvider: EmailConfigProvider = () => ({}),
    transportFactory: EmailTransportFactory = createNodemailerTransport,
  ) {
    this.configProvider = configProvider;
    this.transportFactory = transportFactory;
  }

  setConfigProvider(configProvider: EmailConfigProvider): void {
    this.configProvider = configProvider;
  }

  getConfig(): EmailConfig {
    return buildEmailConfig(this.configProvider());
  }

  getStatus(): EmailStatus & { lastTestResult: EmailSendResult | null } {
    const config = this.getConfig();
    return {
      provider: config.provider,
      configured: config.provider === 'smtp' && Boolean(config.smtp.host && config.from),
      from: config.from,
      smtpHostSet: Boolean(config.smtp.host),
      smtpPort: config.smtp.port,
      smtpSecure: config.smtp.secure,
      smtpUserSet: Boolean(config.smtp.user),
      lastTestResult: this.lastTestResult,
    };
  }

  assertValidConfig(config = this.getConfig()): void {
    if (config.provider === 'none') return;
    if (!config.smtp.host) throw new ValidationError('EMAIL_SMTP_HOST_REQUIRED', 'SMTP 主机不能为空');
    if (!config.from) throw new ValidationError('EMAIL_FROM_REQUIRED', '发件人不能为空');
  }

  async send(message: EmailMessage): Promise<EmailSendResult> {
    const config = this.getConfig();
    if (config.provider === 'none') {
      return { ok: false, status: 'disabled', message: '邮件通知未配置，已跳过发送' };
    }

    const to = cleanString(message.to, 320);
    if (!to) {
      return { ok: false, status: 'disabled', message: '收件人邮箱为空，已跳过发送' };
    }

    try {
      this.assertValidConfig(config);
      await this.transportFactory(config).sendMail({
        from: config.from,
        to,
        subject: message.subject,
        text: message.text,
      });
      return { ok: true, status: 'sent', message: '邮件已发送' };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.warn('email send failed', { error: errorMessage });
      return { ok: false, status: 'failed', message: '邮件发送失败', error: errorMessage };
    }
  }

  async test(to: string): Promise<EmailSendResult> {
    const result = await this.send({
      to,
      subject: 'SueLr Studio 邮件测试',
      text: '这是一封 SueLr Studio 管理端测试邮件。',
    });
    this.lastTestResult = result;
    return result;
  }
}

export const emailService = new EmailService();
