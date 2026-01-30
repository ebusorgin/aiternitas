import nodemailer from 'nodemailer';
import pool from '../db.mjs';

// Логирование письма в базу данных
async function logEmailToDatabase(emailData) {
  try {
    const { sender, recipient, subject, body, headers, size, direction, status, errorMessage, clientIp } = emailData;
    
    await pool.query(
      `INSERT INTO emails (sender, recipient, subject, body, headers, size, client_ip, direction, status, error_message, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())`,
      [
        sender || 'unknown',
        recipient || 'unknown',
        subject || '',
        body || '',
        headers || '',
        size || 0,
        clientIp || null,
        direction || 'outgoing',
        status || 'delivered',
        errorMessage || null
      ]
    );
    console.log(`✅ Письмо записано в БД: ${direction} от ${sender} к ${recipient}`);
  } catch (error) {
    console.error('❌ Ошибка записи письма в БД:', error.message);
    // Не прерываем выполнение, если логирование не удалось
  }
}

// Создание транспорта для отправки email
function createTransporter() {
  // Проверяем наличие настроек SMTP
  const smtpHost = process.env.SMTP_HOST;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
  
  console.log('📧 Проверка настроек SMTP:');
  console.log(`   SMTP_HOST: ${smtpHost ? '✅ установлен' : '❌ не установлен'}`);
  console.log(`   SMTP_PORT: ${smtpPort}`);
  
  // Если указан хост, создаем транспорт
  if (smtpHost) {
    const secure = smtpPort === 465;
    const isLocalhost = smtpHost === 'localhost' || smtpHost === '127.0.0.1';
    
    console.log(`   SMTP_SECURE: ${secure}`);
    console.log(`   SMTP_LOCALHOST: ${isLocalhost ? '✅ да' : '❌ нет'}`);
    
    // В production проверяем сертификат SMTP; в dev допускаем самоподписанные
    const isProduction = process.env.NODE_ENV === 'production';
    const transportConfig = {
      host: smtpHost,
      port: smtpPort,
      secure: secure,
      tls: {
        rejectUnauthorized: isProduction
      }
    };
    
    // Для localhost на порту 25 аутентификация не требуется
    if (isLocalhost && smtpPort === 25) {
      console.log(`   SMTP_USER: не требуется для localhost:25`);
      console.log(`   SMTP_PASS: не требуется для localhost:25`);
      // Не добавляем auth для localhost
    } else if (smtpUser && smtpPass) {
      console.log(`   SMTP_USER: ✅ установлен`);
      console.log(`   SMTP_PASS: ✅ установлен`);
      transportConfig.auth = {
        user: smtpUser,
        pass: smtpPass
      };
    } else {
      console.log(`   SMTP_USER: ⚠️  не установлен (используется без аутентификации)`);
      console.log(`   SMTP_PASS: ⚠️  не установлен (используется без аутентификации)`);
    }
    
    return nodemailer.createTransport(transportConfig);
  }
  
  // Если нет хоста, возвращаем null
  console.log('⚠️  SMTP_HOST не установлен. Письма не будут отправляться.');
  return null;
}

// Отправка письма для верификации email
export async function sendVerificationEmail(email, name, verificationToken, clientIp = null) {
  const verificationUrl = `${process.env.FRONTEND_URL || 'http://localhost:3001'}/verify-email?token=${verificationToken}`;
  
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
  
  if (transporter) {
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
        status: 'delivered'
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
        errorMessage: error.message
      });
      
      // В случае ошибки отправки, логируем ссылку для отладки
      console.log(`⚠️  Email не отправлен. Verification link for ${email}: ${verificationUrl}`);
      return { success: false, error: error.message, details: error };
    }
  } else {
    // Если SMTP не настроен, логируем ссылку
    console.log(`⚠️  SMTP не настроен. Verification link for ${email}: ${verificationUrl}`);
    console.log(`   Для настройки SMTP добавьте в .env или переменные окружения:`);
    console.log(`   SMTP_HOST=smtp.gmail.com`);
    console.log(`   SMTP_PORT=587`);
    console.log(`   SMTP_USER=your-email@gmail.com`);
    console.log(`   SMTP_PASS=your-app-password`);
    return { success: false, error: 'SMTP not configured' };
  }
}

// Отправка письма для сброса пароля
export async function sendPasswordResetEmail(email, name, resetToken, clientIp = null) {
  const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3001'}/reset-password?token=${resetToken}`;

  const mailOptions = {
    from: process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@aiternitas.ru',
    to: email,
    subject: 'Сброс пароля - Aiternitas',
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
          <h2>Сброс пароля</h2>
          <p>Здравствуйте, ${name}!</p>
          <p>Вы запросили сброс пароля. Нажмите кнопку ниже, чтобы задать новый пароль:</p>
          <a href="${resetUrl}" class="button">Сбросить пароль</a>
          <p>Или скопируйте ссылку в браузер:</p>
          <p style="word-break: break-all; color: #667eea;">${resetUrl}</p>
          <p>Ссылка действительна 1 час. Если вы не запрашивали сброс, проигнорируйте это письмо.</p>
          <div class="footer"><p>© 2025 Aiternitas.</p></div>
        </div>
      </body>
      </html>
    `,
    text: `Здравствуйте, ${name}!\n\nСброс пароля: ${resetUrl}\n\nСсылка действительна 1 час.\n\n© 2025 Aiternitas.`
  };

  const transporter = createTransporter();
  if (!transporter) {
    return { success: false, error: 'SMTP not configured' };
  }
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
      errorMessage: error.message
    });
    return { success: false, error: error.message };
  }
}

