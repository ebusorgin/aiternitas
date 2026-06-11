FROM python:3.11-alpine

# Устанавливаем базовые системные утилиты и Node.js
RUN apk update && apk add --no-cache \
    curl \
    bash \
    jq \
    nodejs \
    npm \
    gcc \
    musl-dev \
    libffi-dev \
    openssl-dev

# Устанавливаем популярные Python библиотеки для парсинга и работы с API
RUN pip install --no-cache-dir \
    requests \
    beautifulsoup4 \
    lxml \
    pandas \
    python-dateutil

WORKDIR /scripts

CMD ["sh"]
