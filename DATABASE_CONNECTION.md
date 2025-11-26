# Настройка подключения к PostgreSQL

## Проблема с DBeaver

PostgreSQL в Open Server слушает на нестандартном IP адресе `127.127.126.56`, а не на `localhost` или `127.0.0.1`.

## Решение для DBeaver

При создании подключения в DBeaver используйте следующие настройки:

### Основной пользователь (severomorets):
- **Host:** `127.127.126.56` (НЕ `localhost`!)
- **Port:** `5432`
- **Database:** `aiternitas`
- **Username:** `severomorets`
- **Password:** `carFds43`

### Административный пользователь (postgres):
- **Host:** `127.127.126.56` (НЕ `localhost`!)
- **Port:** `5432`
- **Database:** `aiternitas` (или `postgres` для системных операций)
- **Username:** `postgres`
- **Password:** `carFds43`

## Альтернативное решение

Если хотите использовать `localhost` в DBeaver, нужно настроить PostgreSQL чтобы он слушал на стандартном адресе:

1. Найдите файл `postgresql.conf` в папке установки PostgreSQL Open Server
2. Найдите параметр `listen_addresses`
3. Измените на: `listen_addresses = '*'` или `listen_addresses = '127.0.0.1,127.127.126.56'`
4. Перезапустите PostgreSQL

## Текущие настройки в коде

В файле `.env` и `server/db.mjs` используется:
- `DB_HOST=127.127.126.56` (для локальной разработки)
- `DB_HOST=localhost` (для продакшена на сервере)

## Создание пользователя

Для создания нового пользователя используйте скрипт:

```bash
# Создание пользователя severomorets с паролем carFds43
node create-user.js severomorets carFds43

# Или с другими параметрами
node create-user.js username password
```

## Установка пароля

Если нужно установить или изменить пароль для существующего пользователя:

```bash
# Для пользователя postgres
node setup-password.js carFds43

# Или напрямую через SQL
node -e "import('pg').then(({Pool}) => { const pool = new Pool({host: '127.127.126.56', port: 5432, user: 'postgres', password: 'carFds43', database: 'postgres'}); pool.query(\"ALTER USER postgres WITH PASSWORD 'carFds43'\").then(() => { console.log('✅ Пароль установлен'); pool.end(); }); })"
```

## Проверка подключения

```bash
# Проверка через Node.js с паролем
node -e "import('pg').then(({Pool}) => { const pool = new Pool({host: '127.127.126.56', port: 5432, user: 'postgres', password: 'carFds43', database: 'aiternitas'}); pool.query('SELECT COUNT(*) FROM users').then(r => { console.log('✅ Подключение успешно. Пользователей:', r.rows[0].count); pool.end(); }); })"
```

## Настройки для .env файла

Создайте файл `.env` в корне проекта со следующим содержимым:

### Вариант 1: Пользователь severomorets (рекомендуется для разработки)
```
DB_HOST=127.127.126.56
DB_PORT=5432
DB_USER=severomorets
DB_PASSWORD=carFds43
DB_NAME=aiternitas
SESSION_SECRET=your-secret-key-here
NODE_ENV=development
PORT=3001
HOST=0.0.0.0
```

### Вариант 2: Пользователь postgres (административный)
```
DB_HOST=127.127.126.56
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=carFds43
DB_NAME=aiternitas
SESSION_SECRET=your-secret-key-here
NODE_ENV=development
PORT=3001
HOST=0.0.0.0
```

