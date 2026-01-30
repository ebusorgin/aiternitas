/**
 * Приём входящей почты на сервере (свой почтовый сервер).
 * Слушает порт MAIL_PORT (по умолчанию 2525). Все входящие письма сохраняются в БД (emails, direction='incoming').
 */
import { SMTPServer } from 'smtp-server';
import { simpleParser } from 'mailparser';
import pool from '../db.mjs';
import { logEmailToDatabase } from '../utils/email.mjs';

const MAIL_PORT = parseInt(process.env.MAIL_PORT || '2525', 10);

/**
 * Запуск SMTP-сервера для приёма входящей почты.
 * Письма сохраняются в таблицу emails (direction='incoming'); получатель определяется по users.email.
 */
export function startMailReceiver() {
  const server = new SMTPServer({
    authOptional: true,
    disabledCommands: ['AUTH'],
    onConnect(session, callback) {
      callback();
    },
    onMailFrom(address, session, callback) {
      callback();
    },
    onRcptTo(address, session, callback) {
      callback();
    },
    async onData(stream, session, callback) {
      try {
        const parsed = await simpleParser(stream, { maxHtmlLength: 50000 });
        const from = session.envelope?.mailFrom?.address || parsed.from?.value?.[0]?.address || parsed.from?.text || 'unknown';
        const toAddresses = session.envelope?.rcptTo?.map((r) => r.address) || parsed.to ? (Array.isArray(parsed.to) ? parsed.to : [parsed.to]).flat().map((t) => (typeof t === 'string' ? t : t?.value?.[0]?.address || t?.text)).filter(Boolean) : [];
        const subject = parsed.subject || '(без темы)';
        const text = parsed.text || '';
        const html = parsed.html || '';
        const body = html || text;
        const size = Buffer.byteLength(body, 'utf8');

        let recipients = toAddresses.length ? toAddresses : [];
        if (recipients.length === 0 && parsed.to) {
          const toVal = parsed.to.value || (parsed.to.address ? [parsed.to] : []);
          recipients = Array.isArray(toVal) ? toVal.map((t) => t?.address || t) : [parsed.to?.text || 'unknown'];
        }
        if (recipients.length === 0) recipients = ['unknown'];
        for (const recipient of recipients) {
          const normalized = (recipient && typeof recipient === 'string' ? recipient : recipient?.address || 'unknown').toLowerCase().trim();
          await logEmailToDatabase({
            sender: from,
            recipient: normalized,
            subject,
            body: body.substring(0, 50000),
            headers: JSON.stringify(parsed.headers || {}),
            size,
            clientIp: session.remoteAddress || null,
            direction: 'incoming',
            status: 'delivered',
            sentByUserId: null
          });
        }
        callback();
      } catch (err) {
        console.error('❌ Ошибка обработки входящего письма:', err.message);
        callback(err);
      }
    }
  });

  server.on('error', (err) => {
    console.error('❌ SMTP-сервер (входящая почта):', err.message);
  });

  server.listen(MAIL_PORT, '0.0.0.0', () => {
    console.log(`📬 Входящая почта: SMTP-сервер слушает порт ${MAIL_PORT}`);
  });

  return server;
}
