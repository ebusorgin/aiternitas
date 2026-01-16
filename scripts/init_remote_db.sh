#!/bin/bash

echo "=== Инициализация базы данных на сервере ==="
cd /opt/aiternitas-main

echo "Запуск инициализации БД..."
node scripts/init_remote_db.mjs

echo "Проверка таблиц после инициализации..."
node scripts/verify_db_tasks.mjs

echo "=== Готово ==="
