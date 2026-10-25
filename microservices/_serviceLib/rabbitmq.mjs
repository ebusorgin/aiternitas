import amqp from 'amqplib';

class RabbitMQ {
    constructor() {
        this.url = process.env.RABBITMQ_URL;

        this.exchange = 'events';

        this.queue = null;
        this.service = null;

        this.connection = null;
        this.channel = null;
        this.connected = false;
    }

    async connect(serviceName = 'user') {
        if (this.connected) return;

        this.service = serviceName;
        this.queue = `${serviceName}_service`;

        this.connection = await amqp.connect(this.url);
        this.channel = await this.connection.createChannel();

        // 1. exchange
        await this.channel.assertExchange(
            this.exchange,
            'topic',
            { durable: true }
        );

        // 2. queue
        await this.channel.assertQueue(this.queue, {
            durable: true
        });

        // 3. bind only own events
        await this.channel.bindQueue(
            this.queue,
            this.exchange,
            `${this.service}.#`
        );

        this.connected = true;

        console.log(`[RabbitMQ] Connected as ${this.service}`);
        console.log(`[RabbitMQ] Queue: ${this.queue}`);
        console.log(`[RabbitMQ] Binding: ${this.service}.#`);
    }

    // publish to all services
    async publish(routingKey, data) {
        if (!this.channel) await this.connect(this.service);

        const payload = Buffer.from(
            typeof data === 'string' ? data : JSON.stringify(data)
        );

        return this.channel.publish(
            this.exchange,
            routingKey,
            payload,
            { persistent: true }
        );
    }

    // Fire-and-forget alias. Accepts (routingKey, data) or (data) with default
    // routing to `<service>.message`.
    async send(routingKey, data) {
        if (typeof routingKey === 'object' || routingKey === null) {
            data = routingKey;
            routingKey = `${this.service}.message`;
        }
        return this.publish(routingKey, data);
    }

    // Publish a reply event. `replyTo` is a routing key (e.g. `user.chat.message`);
    // correlationId is passed through in the message properties for request/response.
    async reply(replyTo, data, correlationId = null) {
        if (!this.channel) await this.connect(this.service);

        const payload = Buffer.from(
            typeof data === 'string' ? data : JSON.stringify(data)
        );

        return this.channel.publish(this.exchange, replyTo, payload, {
            persistent: true,
            ...(correlationId ? { correlationId } : {})
        });
    }

    async consume(callback) {
        if (!this.channel) await this.connect(this.service);

        await this.channel.consume(
            this.queue,
            async (msg) => {
                if (!msg) return;

                try {
                    const event = msg.fields.routingKey;

                    let data;
                    try {
                        data = JSON.parse(msg.content.toString());
                    } catch {
                        data = msg.content.toString();
                    }

                    await callback(event, data);

                    this.channel.ack(msg);
                } catch (err) {
                    console.error('[RabbitMQ] error:', err);
                    this.channel.nack(msg, false, true);
                }
            },
            { noAck: false }
        );

        console.log(`[RabbitMQ] Listening ${this.queue}`);
    }

    // Close channel + connection (used by graceful shutdown).
    async close() {
        try {
            if (this.channel) { await this.channel.close(); this.channel = null; }
            if (this.connection) { await this.connection.close(); this.connection = null; }
        } finally {
            this.connected = false;
        }
    }
}

const rabbit = new RabbitMQ();

export async function initRabbit(serviceName) {
    await rabbit.connect(serviceName);

    console.log('[RabbitMQ] Ready');
    return rabbit;
}

export default rabbit;