-- Создание таблицы для хранения всех писем (входящих и исходящих)
CREATE TABLE IF NOT EXISTS emails (
    id SERIAL PRIMARY KEY,
    sender VARCHAR(255) NOT NULL,
    recipient VARCHAR(255) NOT NULL,
    subject TEXT,
    body TEXT,
    headers TEXT,
    size INTEGER,
    client_ip VARCHAR(45),
    direction VARCHAR(10) NOT NULL CHECK (direction IN ('incoming', 'outgoing')),
    status VARCHAR(50) DEFAULT 'delivered',
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Индексы для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_emails_recipient ON emails(recipient);
CREATE INDEX IF NOT EXISTS idx_emails_sender ON emails(sender);
CREATE INDEX IF NOT EXISTS idx_emails_direction ON emails(direction);
CREATE INDEX IF NOT EXISTS idx_emails_created_at ON emails(created_at);
CREATE INDEX IF NOT EXISTS idx_emails_status ON emails(status);

-- Индекс для поиска по домену получателя
CREATE INDEX IF NOT EXISTS idx_emails_recipient_domain ON emails((recipient::text));

-- Функция для автоматического обновления updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Триггер для автоматического обновления updated_at
DROP TRIGGER IF EXISTS update_emails_updated_at ON emails;
CREATE TRIGGER update_emails_updated_at
    BEFORE UPDATE ON emails
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Представление для просмотра последних писем
CREATE OR REPLACE VIEW emails_recent AS
SELECT 
    id,
    sender,
    recipient,
    subject,
    LEFT(body, 200) as body_preview,
    size,
    direction,
    status,
    created_at
FROM emails
ORDER BY created_at DESC
LIMIT 100;

-- Комментарии к таблице и колонкам
COMMENT ON TABLE emails IS 'Таблица для хранения всех входящих и исходящих писем';
COMMENT ON COLUMN emails.sender IS 'Email отправителя';
COMMENT ON COLUMN emails.recipient IS 'Email получателя';
COMMENT ON COLUMN emails.subject IS 'Тема письма';
COMMENT ON COLUMN emails.body IS 'Тело письма';
COMMENT ON COLUMN emails.headers IS 'Заголовки письма';
COMMENT ON COLUMN emails.size IS 'Размер письма в байтах';
COMMENT ON COLUMN emails.client_ip IS 'IP адрес клиента';
COMMENT ON COLUMN emails.direction IS 'Направление: incoming (входящее) или outgoing (исходящее)';
COMMENT ON COLUMN emails.status IS 'Статус доставки: delivered, failed, pending и т.д.';

