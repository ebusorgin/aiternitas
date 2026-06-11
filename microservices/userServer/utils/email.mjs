import nodemailer from 'nodemailer';
import pool from '../db.mjs';
import { getBaseUrl } from './url.mjs';

// Логирование письма в базу данных.
// folder: inbox|sent|drafts|spam|trash. user_id: владелец письма (для фильтра по папкам).
export async function logEmailToDatabase(emailData) {
  try {
    const { sender, recipient, subject, body, headers, size, direction, status, errorMessage, clientIp, sentByUserId, folder, user_id: userId, read_at } = emailData;
    const dir = direction || 'outgoing';
    const defaultFolder = dir === 'incoming' ? 'inbox' : 'sent';
    const f = folder ?? defaultFolder;
    const uid = userId ?? (dir === 'outgoing' ? sentByUserId : null);
    await pool.query(
      `INSERT INTO emails (sender, recipient, subject, body, headers, size, client_ip, direction, status, error_message, sent_by_user_id, folder, user_id, read_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())`,
      [
        sender || 'unknown',
        recipient || 'unknown',
        subject || '',
        body || '',
        headers || '',
        size || 0,
        clientIp || null,
        dir,
        status || 'delivered',
        errorMessage || null,
        sentByUserId ?? null,
        f,
        uid,
        read_at ?? null
      ]
    );
    console.log(`✅ Письмо записано в БД: ${dir} от ${sender} к ${recipient}`);
  } catch (error) {
    console.error('❌ Ошибка записи письма в БД:', error.message);
  }
}

// Создание транспорта для отправки email.
// Без SMTP_HOST используется локальный Postfix (localhost:25) — свой почтовый сервер.
function createTransporter() {
  const smtpHost = process.env.SMTP_HOST || 'localhost';
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpPort = parseInt(process.env.SMTP_PORT || (smtpHost === 'localhost' ? '25' : '587'), 10);

  const isLocalhost = smtpHost === 'localhost' || smtpHost === '127.0.0.1';
  const secure = smtpPort === 465;
  const isProduction = process.env.NODE_ENV === 'production';
  const transportConfig = {
    host: smtpHost,
    port: smtpPort,
    secure,
    tls: { rejectUnauthorized: isProduction && !isLocalhost }
  };
  if (!isLocalhost && smtpPort !== 25 && smtpUser && smtpPass) {
    transportConfig.auth = { user: smtpUser, pass: smtpPass };
  }
  return nodemailer.createTransport(transportConfig);
}

// Отправка письма для верификации email (sentByUserId — для раздела «Исходящие»)
export async function sendVerificationEmail(email, name, verificationToken, clientIp = null, sentByUserId = null) {
  const verificationUrl = `${getBaseUrl()}/verify-email?token=${verificationToken}`;
  
  const mailOptions = {
    from: process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@aiternitas.ru',
    to: email,
    subject: 'Подтвердите ваш email - Aiternitas',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
          }
          .container {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 30px;
            border-radius: 10px;
            color: white;
          }
          .content {
            background: white;
            padding: 30px;
            border-radius: 10px;
            margin-top: 20px;
            color: #333;
          }
          .button {
            display: inline-block;
            padding: 12px 30px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            text-decoration: none;
            border-radius: 8px;
            margin: 20px 0;
            font-weight: 600;
          }
          .footer {
            margin-top: 20px;
            padding-top: 20px;
            border-top: 1px solid #ddd;
            font-size: 12px;
            color: #666;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1 style="margin: 0;">Aiternitas</h1>
        </div>
        <div class="content">
          <h2>Подтвердите ваш email</h2>
          <p>Здравствуйте, ${name}!</p>
          <p>Спасибо за регистрацию на Aiternitas. Для завершения регистрации, пожалуйста, подтвердите ваш email адрес, нажав на кнопку ниже:</p>
          <a href="${verificationUrl}" class="button">Подтвердить email</a>
          <p>Или скопируйте и вставьте эту ссылку в браузер:</p>
          <p style="word-break: break-all; color: #667eea;">${verificationUrl}</p>
          <p>Эта ссылка действительна в течение 24 часов.</p>
          <p>Если вы не регистрировались на Aiternitas, просто проигнорируйте это письмо.</p>
          <div class="footer">
            <p>© 2025 Aiternitas. Все права защищены.</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
      Здравствуйте, ${name}!
      
      Спасибо за регистрацию на Aiternitas. Для завершения регистрации, пожалуйста, подтвердите ваш email адрес, перейдя по ссылке:
      
      ${verificationUrl}
      
      Эта ссылка действительна в течение 24 часов.
      
      Если вы не регистрировались на Aiternitas, просто проигнорируйте это письмо.
      
      © 2025 Aiternitas. Все права защищены.
    `
  };

  const transporter = createTransporter();
  try {
      console.log(`📧 Попытка отправки письма на ${email}...`);
      
      // Проверяем подключение к SMTP серверу
      console.log('   Проверка подключения к SMTP серверу...');
      await transporter.verify();
      console.log('   ✅ Подключение к SMTP серверу успешно');
      
      // Отправляем письмо
      console.log('   Отправка письма...');
      const info = await transporter.sendMail(mailOptions);
      console.log(`✅ Email успешно отправлен на ${email}`);
      console.log(`   Message ID: ${info.messageId}`);
      console.log(`   Response: ${info.response}`);
      
      // Логируем исходящее письмо в БД
      const emailBody = mailOptions.html || mailOptions.text || '';
      const emailSize = Buffer.byteLength(emailBody, 'utf8');
      await logEmailToDatabase({
        sender: mailOptions.from,
        recipient: email,
        subject: mailOptions.subject,
        body: emailBody.substring(0, 50000), // Ограничиваем размер
        headers: JSON.stringify(info.envelope || {}),
        size: emailSize,
        clientIp: clientIp || null,
        direction: 'outgoing',
        status: 'delivered',
        sentByUserId
      });
      
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error('❌ Ошибка отправки email:');
      console.error(`   Тип ошибки: ${error.name}`);
      console.error(`   Сообщение: ${error.message}`);
      if (error.code) {
        console.error(`   Код ошибки: ${error.code}`);
      }
      if (error.response) {
        console.error(`   Ответ сервера: ${error.response}`);
      }
      if (error.responseCode) {
        console.error(`   Код ответа: ${error.responseCode}`);
      }
      if (error.command) {
        console.error(`   Команда: ${error.command}`);
      }
      
      // Логируем ошибку в БД
      const emailBody = mailOptions.html || mailOptions.text || '';
      const emailSize = Buffer.byteLength(emailBody, 'utf8');
      await logEmailToDatabase({
        sender: mailOptions.from,
        recipient: email,
        subject: mailOptions.subject,
        body: emailBody.substring(0, 50000),
        headers: '',
        size: emailSize,
        clientIp: clientIp || null,
        direction: 'outgoing',
        status: 'failed',
        errorMessage: error.message,
        sentByUserId
      });
      
      // В случае ошибки отправки, логируем ссылку для отладки
      console.log(`⚠️  Email не отправлен. Verification link for ${email}: ${verificationUrl}`);
      return { success: false, error: error.message, details: error };
  }
}

// Отправка письма для сброса пароля (sentByUserId опционально — для раздела «Исходящие»)
export async function sendPasswordResetEmail(email, name, resetToken, clientIp = null, sentByUserId = null) {
  const resetUrl = `${getBaseUrl()}/reset-password?token=${resetToken}`;

  const mailOptions = {
    from: process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@aiternitas.ru',
    to: email,
    subject: 'Восстановление пароля - Aiternitas',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
          .container { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px; color: white; }
          .content { background: white; padding: 30px; border-radius: 10px; margin-top: 20px; color: #333; }
          .button { display: inline-block; padding: 12px 30px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; border-radius: 8px; margin: 20px 0; font-weight: 600; }
          .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container"><h1 style="margin: 0;">Aiternitas</h1></div>
        <div class="content">
          <h2>Восстановление пароля</h2>
          <p>Здравствуйте, ${name}!</p>
          <p>Вы запросили восстановление пароля. Нажмите кнопку ниже, чтобы задать новый пароль:</p>
          <a href="${resetUrl}" class="button">Восстановить пароль</a>
          <p>Или скопируйте ссылку в браузер:</p>
          <p style="word-break: break-all; color: #667eea;">${resetUrl}</p>
          <p>Ссылка действительна 1 час. Если вы не запрашивали восстановление пароля, проигнорируйте это письмо.</p>
          <div class="footer"><p>© 2025 Aiternitas.</p></div>
        </div>
      </body>
      </html>
    `,
    text: `Здравствуйте, ${name}!\n\nВосстановление пароля: ${resetUrl}\n\nСсылка действительна 1 час.\n\n© 2025 Aiternitas.`
  };

  const transporter = createTransporter();
  try {
    await transporter.verify();
    const info = await transporter.sendMail(mailOptions);
    const emailBody = mailOptions.html || mailOptions.text || '';
    await logEmailToDatabase({
      sender: mailOptions.from,
      recipient: email,
      subject: mailOptions.subject,
      body: emailBody.substring(0, 50000),
      headers: JSON.stringify(info.envelope || {}),
      size: Buffer.byteLength(emailBody, 'utf8'),
      clientIp: clientIp || null,
      direction: 'outgoing',
      status: 'delivered',
      sentByUserId
    });
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Password reset email error:', error.message);
    await logEmailToDatabase({
      sender: mailOptions.from,
      recipient: email,
      subject: mailOptions.subject,
      body: (mailOptions.html || '').substring(0, 50000),
      headers: '',
      size: 0,
      clientIp: clientIp || null,
      direction: 'outgoing',
      status: 'failed',
      errorMessage: error.message,
      sentByUserId
    });
    return { success: false, error: error.message };
  }
}

/**
 * Уведомление о смене пароля (на основную почту пользователя).
 * clientIp — для отображения в письме (опционально).
 */
export async function sendPasswordChangedEmail(email, name, clientIp = null) {
  const dateStr = new Date().toLocaleString('ru-RU', {
    dateStyle: 'long',
    timeStyle: 'short'
  });

  const mailOptions = {
    from: process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@aiternitas.ru',
    to: email,
    subject: 'Пароль изменён - Aiternitas',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
          .container { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px; color: white; }
          .content { background: white; padding: 30px; border-radius: 10px; margin-top: 20px; color: #333; }
          .info-box { background: #f8fafc; border-left: 4px solid #667eea; padding: 14px 18px; margin: 20px 0; border-radius: 0 8px 8px 0; font-size: 14px; color: #475569; }
          .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container"><h1 style="margin: 0;">Aiternitas</h1></div>
        <div class="content">
          <h2>Пароль успешно изменён</h2>
          <p>Здравствуйте, ${name}!</p>
          <p>Мы уведомляем вас о том, что пароль от вашего аккаунта Aiternitas был изменён.</p>
          <div class="info-box">
            <strong>Дата и время:</strong> ${dateStr}
            ${clientIp ? `<br><strong>IP-адрес:</strong> ${clientIp}` : ''}
          </div>
          <p>Если это были не вы, рекомендуем сразу воспользоваться функцией <strong>«Забыли пароль?»</strong> на странице входа, чтобы сбросить пароль и защитить аккаунт.</p>
          <div class="footer"><p>© 2025 Aiternitas. Все права защищены.</p></div>
        </div>
      </body>
      </html>
    `,
    text: `Здравствуйте, ${name}!\n\nПароль от вашего аккаунта Aiternitas был изменён.\nДата и время: ${dateStr}${clientIp ? `\nIP: ${clientIp}` : ''}\n\nЕсли это были не вы, воспользуйтесь «Забыли пароль?» на странице входа.\n\n© 2025 Aiternitas.`
  };

  const transporter = createTransporter();
  try {
    await transporter.verify();
    const info = await transporter.sendMail(mailOptions);
    const emailBody = mailOptions.html || mailOptions.text || '';
    await logEmailToDatabase({
      sender: mailOptions.from,
      recipient: email,
      subject: mailOptions.subject,
      body: emailBody.substring(0, 50000),
      headers: JSON.stringify(info.envelope || {}),
      size: Buffer.byteLength(emailBody, 'utf8'),
      clientIp: clientIp || null,
      direction: 'outgoing',
      status: 'delivered'
    });
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Password changed notification email error:', error.message);
    await logEmailToDatabase({
      sender: mailOptions.from,
      recipient: email,
      subject: mailOptions.subject,
      body: (mailOptions.html || '').substring(0, 50000),
      headers: '',
      size: 0,
      clientIp: clientIp || null,
      direction: 'outgoing',
      status: 'failed',
      errorMessage: error.message
    });
    return { success: false, error: error.message };
  }
}

/**
 * Отправка произвольного письма от пользователя (раздел «Написать письмо»).
 * attachments: [{ filename, content: Buffer }]
 */
export async function sendUserEmail(fromEmail, fromName, to, subject, body, sentByUserId, clientIp = null, attachments = []) {
  // Для писем от пользователя приоритет — введённый адрес (mail_login@domain), а не SMTP_FROM
  const from = fromEmail || process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@aiternitas.ru';
  const mailOptions = {
    from: fromName ? `"${fromName.replace(/"/g, '')}" <${from}>` : from,
    to: to,
    subject: subject || '(без темы)',
    text: body || '',
    html: body ? body.replace(/\n/g, '<br>') : ''
  };
  if (attachments.length > 0) {
    mailOptions.attachments = attachments.map((a) => ({ filename: a.filename, content: a.content }));
  }

  const transporter = createTransporter();
  try {
    const info = await transporter.sendMail(mailOptions);
    const emailBody = mailOptions.html || mailOptions.text || '';
    await logEmailToDatabase({
      sender: from,
      recipient: to.toLowerCase().trim(),
      subject: mailOptions.subject,
      body: emailBody.substring(0, 50000),
      headers: JSON.stringify(info.envelope || {}),
      size: Buffer.byteLength(emailBody, 'utf8'),
      clientIp,
      direction: 'outgoing',
      status: 'delivered',
      sentByUserId
    });
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Ошибка отправки письма:', error.message);
    await logEmailToDatabase({
      sender: from,
      recipient: to,
      subject: mailOptions.subject,
      body: (mailOptions.html || '').substring(0, 50000),
      headers: '',
      size: 0,
      clientIp,
      direction: 'outgoing',
      status: 'failed',
      errorMessage: error.message,
      sentByUserId
    });
    return { success: false, error: error.message };
  }
}

