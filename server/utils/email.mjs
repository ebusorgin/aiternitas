import nodemailer from 'nodemailer';

// Создание транспорта для отправки email
function createTransporter() {
  // Проверяем наличие настроек SMTP
  const smtpHost = process.env.SMTP_HOST;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  
  console.log('📧 Проверка настроек SMTP:');
  console.log(`   SMTP_HOST: ${smtpHost ? '✅ установлен' : '❌ не установлен'}`);
  console.log(`   SMTP_USER: ${smtpUser ? '✅ установлен' : '❌ не установлен'}`);
  console.log(`   SMTP_PASS: ${smtpPass ? '✅ установлен' : '❌ не установлен'}`);
  
  // Если указаны настройки SMTP, используем их
  if (smtpHost && smtpUser && smtpPass) {
    const port = parseInt(process.env.SMTP_PORT || '587', 10);
    const secure = process.env.SMTP_PORT === '465';
    
    console.log(`   SMTP_PORT: ${port}`);
    console.log(`   SMTP_SECURE: ${secure}`);
    
    return nodemailer.createTransport({
      host: smtpHost,
      port: port,
      secure: secure,
      auth: {
        user: smtpUser,
        pass: smtpPass
      },
      // Дополнительные опции для надежности
      tls: {
        rejectUnauthorized: false // Для самоподписанных сертификатов
      }
    });
  }
  
  // Если нет настроек SMTP, возвращаем null (будет использоваться console.log)
  console.log('⚠️  SMTP не настроен. Письма не будут отправляться.');
  return null;
}

// Отправка письма для верификации email
export async function sendVerificationEmail(email, name, verificationToken) {
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

