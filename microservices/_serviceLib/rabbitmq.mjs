import amqp from 'amqplib';
import dotenv from 'dotenv';

dotenv.config();

class RabbitMQ {
    constructor({
                    url,
                    queue,
                } = {}) {
        this.url = url || process.env.RABBITMQ_URL || 'amqp://localhost';
        this.queue = queue || process.env.RABBITMQ_QUEUE || 'default_queue';

        this.connection = null;
        this.channel = null;
        this.connected = false;
    }

    async connect() {
        if (this.connected) return;

        this.connection = await amqp.connect(this.url);
        this.channel = await this.connection.createChannel();

        await this.channel.assertQueue(this.queue, {
            durable: true,
        });

        this.connected = true;

        console.log(`[RabbitMQ] ✅ Connected`);
        console.log(`[RabbitMQ] 📦 Queue: ${this.queue}`);
    }

    async send(data) {
        if (!this.channel) await this.connect();

        const payload =
            typeof data === 'string'
                ? data
                : JSON.stringify(data);

        return this.channel.sendToQueue(
            this.queue,
            Buffer.from(payload),
            { persistent: true }
        );
    }

    async consume(callback) {
        if (!this.channel) await this.connect();

        await this.channel.consume(
            this.queue,
            async (msg) => {
                if (!msg) return;

                try {
                    const raw = msg.content.toString();

                    let data;
                    try {
                        data = JSON.parse(raw);
                    } catch {
                        data = raw;
                    }

                    await callback(data, msg);

                    this.channel.ack(msg);
                } catch (error) {
                    console.error('[RabbitMQ] Consumer error:', error);
                    this.channel.nack(msg, false, true);
                }
            },
            { noAck: false }
        );

        console.log(`[RabbitMQ] 👂 Listening "${this.queue}"`);
    }

    async close() {
        if (this.channel) await this.channel.close();
        if (this.connection) await this.connection.close();

        this.channel = null;
        this.connection = null;
        this.connected = false;
    }
}

//
// =====================
// SINGLETON INSTANCE
// =====================
//
const rabbit = new RabbitMQ({
    url: process.env.RABBITMQ_URL,
    queue: process.env.RABBITMQ_QUEUE || 'emails',
});

//
// init вызывается только из index.mjs
//
export async function initRabbit() {
    await rabbit.connect();

    console.log('[RabbitMQ] 🚀 Ready for use');
    return rabbit;
}

//
// 🔥 ВОТ ЭТО ТЫ И ИМПОРТИРУЕШЬ ВЕЗДЕ
//
export default rabbit;