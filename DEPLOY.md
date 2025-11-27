# Деплой через GitHub Actions

## Настройка GitHub Secrets

Для работы автоматического деплоя необходимо добавить SSH ключ в секреты GitHub:

1. Перейдите в настройки репозитория: `Settings` → `Secrets and variables` → `Actions`
2. Добавьте новый секрет с именем `SSH_PRIVATE_KEY`
3. Вставьте содержимое приватного SSH ключа (обычно `~/.ssh/id_rsa_aiternitas`)

## Как это работает

При каждом push в ветку `production`:

1. ✅ Проверка кода из репозитория
2. ✅ Установка Node.js 20 в GitHub Actions
3. ✅ Установка зависимостей (`npm ci`) в GitHub Actions
4. ✅ Сборка React приложения (`npm run build`) в GitHub Actions
5. ✅ Подключение к серверу через SSH
6. ✅ Копирование файлов на сервер (через rsync/tar)
7. ✅ Установка зависимостей на сервере (`npm ci`)
8. ✅ Сборка приложения на сервере (`npm run build`)
9. ✅ Перезапуск сервиса `aiternitas-main.service`
10. ✅ Проверка работоспособности приложения

## Проверка деплоя

После push в ветку `production`:

1. Перейдите в раздел `Actions` в GitHub репозитории
2. Найдите запущенный workflow "Deploy to Production"
3. Проверьте логи выполнения каждого шага

## Ручной деплой

Если нужно задеплоить вручную, используйте скрипт:

```bash
cd aiternitas.ru
./deploy-update.sh
```

## Требования на сервере

- Директория `/opt/aiternitas-main` (создается автоматически)
- Node.js 20+
- Systemd сервис `aiternitas-main.service`
- SSH доступ с ключом, добавленным в GitHub Secrets
- **Примечание:** Git на сервере больше не требуется, файлы копируются напрямую

