import nodemailer from 'nodemailer';

// Создание транспорта для отправки email
function createTransporter() {
  // Если указаны настройки SMTP, используем их
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_PORT === '465',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
  }
  
  // Если нет настроек SMTP, возвращаем null (будет использоваться console.log)
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
      await transporter.verify();
      const info = await transporter.sendMail(mailOptions);
      console.log(`✅ Email отправлен: ${info.messageId}`);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error('❌ Ошибка отправки email:', error);
      // В случае ошибки отправки, логируем ссылку для отладки
      console.log(`⚠️  Email не отправлен. Verification link for ${email}: ${verificationUrl}`);
      return { success: false, error: error.message };
    }
  } else {
    // Если SMTP не настроен, логируем ссылку
    console.log(`⚠️  SMTP не настроен. Verification link for ${email}: ${verificationUrl}`);
    return { success: false, error: 'SMTP not configured' };
  }
}

