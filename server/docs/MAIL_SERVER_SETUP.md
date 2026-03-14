# Настройка почтового сервера для aiternitas.ru

Сервер принимает почту вида `user@aiternitas.ru` и отправляет письма через свой SMTP (без сторонних сервисов).

---

## 1. Установка пакетов (Debian/Ubuntu)

```bash
sudo apt update
sudo apt install -y postfix dovecot-core dovecot-imapd opendkim opendkim-tools rspamd
# При установке Postfix выбрать "Internet Site", system mail name: aiternitas.ru
```

---

## 2. Postfix: приём и доставка

### 2.1 Основной конфиг `/etc/postfix/main.cf`

```bash
sudo nano /etc/postfix/main.cf
```

Добавить/изменить:

```
myhostname = mail.aiternitas.ru
mydomain = aiternitas.ru
myorigin = $mydomain
inet_interfaces = all
mydestination = $myhostname, localhost.$mydomain, localhost
relayhost =
mynetworks = 127.0.0.0/8 [::1]/128
mailbox_size_limit = 0
recipient_delimiter = +
inet_protocols = all

# Виртуальные ящики: доставка в приложение по порту 2525
virtual_alias_domains = aiternitas.ru
virtual_transport = lmtp:127.0.0.1:2525
# Если приложение принимает SMTP, а не LMTP, используйте:
# virtual_transport = smtp:127.0.0.1:2525

# Submission (587) для отправки из приложения
submission inet n       -       y       -       -       smtpd
  -o syslog_name=postfix/submission
  -o smtpd_tls_security_level=encrypt
  -o smtpd_sasl_auth_enable=yes
  -o smtpd_client_restrictions=permit_sasl_authenticated,reject
  -o milter_macro_daemon_name=ORIGINATING
```

Или доставка в приложение через pipe (альтернатива): настройка `master.cf` с `pipe` и скриптом, который шлёт в API. Проще всего — приложение слушает порт 2525 (SMTP), Postfix передаёт туда по SMTP/LMTP.

**Текущая схема**: приложение уже слушает порт **2525** (см. `server/mail/receiver.mjs`). Postfix должен передавать письма для `@aiternitas.ru` на `127.0.0.1:2525`. Для этого в Postfix используется **transport map**: все получатели `*@aiternitas.ru` → smtp:127.0.0.1:2525.

### 2.2 Transport map

```bash
# /etc/postfix/transport
aiternitas.ru    smtp:127.0.0.1:2525
```

```bash
sudo postmap /etc/postfix/transport
```

В `main.cf` добавить:

```
transport_maps = hash:/etc/postfix/transport
# Разрешить доставку на 2525 только для нашего домена
relay_domains = aiternitas.ru
```

### 2.3 Разрешить приём для домена

В `main.cf`:

```
relay_domains = aiternitas.ru
```

Перезапуск:

```bash
sudo systemctl restart postfix
```

---

## 3. Отправка из приложения (localhost)

Приложение отправляет письма через **localhost:25** (или 587 с аутентификацией). Рекомендуется:

- В `.env.production` **не задавать** `SMTP_HOST` — тогда приложение использует `localhost:25` и Postfix отправляет письма в интернет.

Либо явно:

```
SMTP_HOST=localhost
SMTP_PORT=25
```

Postfix по умолчанию разрешает отправку с localhost (`mynetworks = 127.0.0.0/8`).

---

## 4. DNS записи для aiternitas.ru

### 4.1 MX

```
aiternitas.ru.    MX  10  mail.aiternitas.ru.
```

(или тот хост, где реально крутится Postfix)

### 4.2 SPF

```
aiternitas.ru.    TXT  "v=spf1 mx ~all"
```

или строже:

```
aiternitas.ru.    TXT  "v=spf1 mx a:mail.aiternitas.ru -all"
```

### 4.3 DKIM

После настройки OpenDKIM (см. ниже) в DNS публикуется запись вида:

```
selector._domainkey.aiternitas.ru.  TXT  "v=DKIM1; k=rsa; p=..."
```

### 4.4 DMARC (рекомендуется)

```
_dmarc.aiternitas.ru.  TXT  "v=DMARC1; p=quarantine; rua=mailto:dmarc@aiternitas.ru"
```

---

## 5. OpenDKIM (подпись исходящих)

```bash
sudo nano /etc/opendkim.conf
```

Пример:

```
Domain                  aiternitas.ru
Selector                mail
KeyFile                 /etc/opendkim/keys/aiternitas.ru/mail.private
Socket                  inet:12301@localhost
```

Создать ключ:

```bash
sudo mkdir -p /etc/opendkim/keys/aiternitas.ru
sudo opendkim-genkey -D /etc/opendkim/keys/aiternitas.ru/ -d aiternitas.ru -s mail
sudo chown -R opendkim:opendkim /etc/opendkim/keys
```

В Postfix `main.cf`:

```
milter_default_action = accept
milter_protocol = 6
smtpd_milters = inet:127.0.0.1:12301
non_smtpd_milters = inet:127.0.0.1:12301
```

Перезапуск:

```bash
sudo systemctl restart opendkim postfix
```

Публичный ключ для DNS: содержимое файла `mail.txt` в каталоге ключей.

**Текущая DKIM-запись для aiternitas.ru** (добавьте TXT в DNS):

```
Имя:  mail._domainkey.aiternitas.ru
Тип:  TXT
Значение: v=DKIM1; h=sha256; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAnwRCx+OQAU6q4wNQYG890RtuVasoXcdUnhZhoXkt3YJAKm9OgRhMDqL3w1jyT3fMmX7VTCP38KY4trQkVLN86FQKanuY256U38Kz5SuG4HGwJl0x9B2Rzspr6IpvXjuCKlxFFWyqeN7gKrAdWKDkueAHS5V8rjY2/MRaHSvYeVDOUMvw6pRuH4eBtQseFHG7im6S7ewV7OeDXm24dj64GikLPLbDkiLW4phawE3RxCN4l9S5KFEQK4QUvUr8mtNYOV09udF5YFYSwuoZ1f1Z0c+o6CmSwy+0jZPeI1dHGjx+9Cs4zr4Wz2Vx11iDAPryrXGDjbftx4+mHjQ3RtO5WwIDAQAB
```

---

## 6. Rspamd (антиспам)

Базовый запуск и интеграция с Postfix:

```bash
sudo systemctl enable rspamd
sudo systemctl start rspamd
```

В Postfix `main.cf` добавить в начало (перед другими milter):

```
smtpd_milters = inet:127.0.0.1:11332
```

(порт 11332 — Rspamd milter). Порядок milter: сначала Rspamd, потом OpenDKIM.

---

## 7. Dovecot (IMAP) — опционально

Если нужен доступ к ящикам из Thunderbird/Outlook по IMAP, настраивается Dovecot с виртуальными пользователями и maildir. Данные можно хранить в БД приложения и синхронизировать с Dovecot (сложнее) или позже перейти на хранение в maildir. Для первой версии веб-почты достаточно API + БД; Dovecot можно добавить отдельным этапом.

---

## 8. TLS (Let's Encrypt)

Для submission (587) и IMAPS (993):

```bash
sudo apt install certbot
sudo certbot certonly --standalone -d mail.aiternitas.ru
```

В Postfix для порта 587 указать сертификаты:

```
smtpd_tls_cert_file = /etc/letsencrypt/live/mail.aiternitas.ru/fullchain.pem
smtpd_tls_key_file = /etc/letsencrypt/live/mail.aiternitas.ru/privkey.pem
```

---

## 9. Итог

- **Входящие**: MX → Postfix → приложение (порт 2525).
- **Исходящие**: приложение → Postfix (localhost:25) → интернет.
- **DNS**: MX, SPF, DKIM, DMARC для aiternitas.ru.
- Антиспам (Rspamd) и подпись DKIM — по желанию, но рекомендуются для доставляемости.

После настройки проверьте приём: отправьте письмо на `ваш_логин@aiternitas.ru` с внешнего ящика и убедитесь, что оно появляется во «Входящих» в веб-интерфейсе.
