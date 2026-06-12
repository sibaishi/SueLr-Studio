// @ts-nocheck
import assert from 'node:assert/strict';
import test from 'node:test';

test('email service reports disabled and no-ops when provider is none', async () => {
  const { EmailService } = await import(`../src/platform/notifications/email.service.ts?none=${Date.now()}`);
  let sent = false;
  const service = new EmailService(
    () => ({ provider: 'none' }),
    () => ({
      async sendMail() {
        sent = true;
      },
    }),
  );

  const status = service.getStatus();
  assert.equal(status.provider, 'none');
  assert.equal(status.configured, false);

  const result = await service.send({
    to: 'user@example.com',
    subject: 'hello',
    text: 'hello',
  });
  assert.equal(result.status, 'disabled');
  assert.equal(result.ok, false);
  assert.equal(sent, false);
});

test('email service validates SMTP configuration before sending', async () => {
  const { EmailService } = await import(`../src/platform/notifications/email.service.ts?smtpInvalid=${Date.now()}`);
  const service = new EmailService(() => ({ provider: 'smtp', from: 'SueLr Studio <no-reply@example.com>' }));

  assert.throws(
    () => service.assertValidConfig(),
    (error) => error?.code === 'EMAIL_SMTP_HOST_REQUIRED',
  );
});

test('email service sends through configured SMTP transport and records test result', async () => {
  const { EmailService } = await import(`../src/platform/notifications/email.service.ts?smtp=${Date.now()}`);
  const messages = [];
  const service = new EmailService(
    () => ({
      provider: 'smtp',
      from: 'SueLr Studio <no-reply@example.com>',
      smtp: { host: 'smtp.example.com', port: 2525, secure: false, user: 'smtp-user', pass: 'secret' },
    }),
    () => ({
      async sendMail(message) {
        messages.push(message);
      },
    }),
  );

  const status = service.getStatus();
  assert.equal(status.provider, 'smtp');
  assert.equal(status.configured, true);
  assert.equal(status.smtpHostSet, true);
  assert.equal(status.smtpUserSet, true);

  const result = await service.test('target@example.com');
  assert.equal(result.ok, true);
  assert.equal(result.status, 'sent');
  assert.equal(messages.length, 1);
  assert.equal(messages[0].to, 'target@example.com');
  assert.equal(service.getStatus().lastTestResult.status, 'sent');
});

test('email service reports SMTP transport failures without throwing', async () => {
  const { EmailService } = await import(`../src/platform/notifications/email.service.ts?smtpFail=${Date.now()}`);
  const service = new EmailService(
    () => ({
      provider: 'smtp',
      from: 'SueLr Studio <no-reply@example.com>',
      smtp: { host: 'smtp.example.com', port: 587, secure: false },
    }),
    () => ({
      async sendMail() {
        throw new Error('smtp offline');
      },
    }),
  );

  const result = await service.send({
    to: 'target@example.com',
    subject: 'hello',
    text: 'hello',
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'failed');
  assert.match(result.error, /smtp offline/);
});

