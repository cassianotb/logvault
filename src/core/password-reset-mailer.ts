import nodemailer, { type Transporter } from 'nodemailer';

export interface PasswordResetMessage {
  email: string;
  name: string;
  resetUrl: string;
  expiresInMinutes: number;
}

export interface PasswordResetMailer {
  isConfigured(): Promise<boolean>;
  send(message: PasswordResetMessage): Promise<void>;
}

export interface SmtpPasswordResetMailerConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  from: string;
}

export interface DynamicSmtpPasswordResetMailerConfig extends SmtpPasswordResetMailerConfig {
  enabled: boolean;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  })[character] ?? character);
}

export class SmtpPasswordResetMailer implements PasswordResetMailer {
  private readonly configured: boolean;
  private readonly transporter: Transporter | null;

  constructor(private readonly config: SmtpPasswordResetMailerConfig) {
    this.configured = Boolean(config.host && config.from);
    this.transporter = this.configured ? nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.user ? { user: config.user, pass: config.password } : undefined
    }) : null;
  }

  async isConfigured(): Promise<boolean> {
    return this.configured;
  }

  async send(message: PasswordResetMessage): Promise<void> {
    if (!this.transporter) throw new Error('SMTP não configurado');
    const safeName = escapeHtml(message.name);
    const safeUrl = escapeHtml(message.resetUrl);
    await this.transporter.sendMail({
      from: this.config.from,
      to: message.email,
      subject: 'Recuperação de senha · LogVault',
      text: [
        `Olá, ${message.name}.`,
        '',
        'Recebemos uma solicitação para redefinir a senha da sua conta no LogVault.',
        `Use o link abaixo em até ${message.expiresInMinutes} minutos:`,
        message.resetUrl,
        '',
        'Se você não solicitou a alteração, ignore esta mensagem.'
      ].join('\n'),
      html: `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#17243b">
          <h2 style="margin-bottom:20px">Recuperação de senha</h2>
          <p>Olá, ${safeName}.</p>
          <p>Recebemos uma solicitação para redefinir a senha da sua conta no LogVault.</p>
          <p><a href="${safeUrl}" style="display:inline-block;padding:12px 18px;border-radius:7px;background:#1f6feb;color:#fff;text-decoration:none;font-weight:700">Criar nova senha</a></p>
          <p style="color:#647087;font-size:13px">Este link expira em ${message.expiresInMinutes} minutos e pode ser usado uma única vez.</p>
          <p style="color:#647087;font-size:13px">Se você não solicitou a alteração, ignore esta mensagem.</p>
        </div>`
    });
  }
}

export class DynamicSmtpPasswordResetMailer implements PasswordResetMailer {
  constructor(private readonly provider: () => Promise<DynamicSmtpPasswordResetMailerConfig | null>) {}

  async isConfigured(): Promise<boolean> {
    const config = await this.provider();
    return Boolean(config?.enabled && config.host && config.from);
  }

  async send(message: PasswordResetMessage): Promise<void> {
    const config = await this.provider();
    if (!config?.enabled) throw new Error('Recuperação por e-mail desativada');
    await new SmtpPasswordResetMailer(config).send(message);
  }
}

export async function sendSmtpTestMessage(config: SmtpPasswordResetMailerConfig, recipient: string): Promise<void> {
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.user ? { user: config.user, pass: config.password } : undefined
  });
  await transporter.sendMail({
    from: config.from,
    to: recipient,
    subject: 'Teste de e-mail · LogVault',
    text: 'Configuração SMTP validada com sucesso pelo LogVault.',
    html: '<div style="font-family:Arial,sans-serif;color:#17243b"><h2>Configuração SMTP validada</h2><p>O LogVault conseguiu enviar esta mensagem usando as configurações salvas na plataforma.</p></div>'
  });
}
