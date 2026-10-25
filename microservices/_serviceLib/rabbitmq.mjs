import amqp from 'amqplib';
import { randomUUID } from 'node:crypto';

class RabbitMQ {
    constructor() {
        this.url = process.env.RABBITMQ_URL;

        this.exchange = 'events';

        this.queue = null;
        this.service = null;
        this.bindings = [];

        this.connection = null;
        this.channel = null;
        this.connected = false;

        // RPC-over-bus: correlationId -> { resolve, timer }. Replies that match
        // an entry here are auto-resolved inside consume(); unmatched reply.*
        // events (e.g. the socket gateway's own inflight map) are forwarded to
        // the service's consume() callback so existing bridges keep working.
        this._pending = new Map();
    }

    async connect(serviceName = 'user', opts = {}) {
        if (this.connected) return;

        this.service = serviceName;
        this.queue = `${serviceName}_service`;

        // Доп. routing keys поверх собственного `<service>.#`
        // (например socket-гейт слушает reply.# и рассылки других доменов)
        // Every service always listens to its own replies (`reply.<service>`)
        // so request()/respond() work without extra plumbing. Plus any
        // caller-supplied keys (e.g. the socket gate also consumes push.# / user.#).
        this.bindings = [...new Set([
            `${this.service}.#`,
            `reply.${this.service}`,
            ...(Array.isArray(opts.bindings) ? opts.bindings : [])
        ])];

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

        // 3. bind all routing keys
        for (const pattern of this.bindings) {
            await this.channel.bindQueue(
                this.queue,
                this.exchange,
                pattern
            );
        }

        this.connected = true;

        console.log(`[RabbitMQ] Connected as ${this.service}`);
        console.log(`[RabbitMQ] Queue: ${this.queue}`);
        console.log(`[RabbitMQ] Bindings: ${this.bindings.join(', ')}`);
    }

    // publish to all services
    async publish(routingKey, data, corrId = null) {
        if (!this.channel) await this.connect(this.service);

        const payload = Buffer.from(
            typeof data === 'string' ? data : JSON.stringify(data)
        );

        return this.channel.publish(
            this.exchange,
            routingKey,
            payload,
            {
                persistent: true,
                ...(corrId ? { correlationId: corrId } : {})
            }
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

    // Publish a reply event. `replyTo` is a routing key (e.g. `reply.socket`);
    // corrId MUST be echoed back from the request envelope (`corrId`) so that the
    // requesting side (socket gateway) can resolve the awaiting client ACK.
    async reply(replyTo, data, corrId = null) {
        return this.publish(replyTo, data, corrId);
    }

    // Request/response RPC over the bus. Publishes `routingKey` carrying the
    // merged `data` plus a corrId + replyTo, and returns a Promise resolved when
    // the matching `reply.<service>` arrives in consume(). Requires the caller
    // service to be consuming (rabbit.consume) so its replies get delivered.
    request(routingKey, data = {}, timeoutMs = 30000) {
        if (!this.channel) {
            return Promise.reject(new Error('RabbitMQ not connected - call initRabbit first'));
        }
        const corrId = randomUUID();
        const replyTo = `reply.${this.service}`;

        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this._pending.delete(corrId);
                reject(new Error(`RPC_TIMEOUT ${routingKey}`));
            }, timeoutMs);
            this._pending.set(corrId, { resolve, timer });

            const payload = {
                ...(data && typeof data === 'object' ? data : { data }),
                corrId,
                replyTo
            };

            this.channel.publish(
                this.exchange,
                routingKey,
                Buffer.from(JSON.stringify(payload)),
                { persistent: false, correlationId: corrId, replyTo }
            );
        });
    }

    // Reply to a bus request: sends `{ corrId, ...result }` back to the caller's
    // replyTo routing key. `envelope` is the request payload (has corrId/replyTo).
    async respond(envelope, result = {}) {
        const replyTo = envelope?.replyTo;
        const corrId = envelope?.corrId;
        if (!replyTo) return false;
        return this.publish(replyTo, { corrId, ...result }, corrId);
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

                    // Auto-resolve RPC replies issued via request(); anything not
                    // belonging to us is forwarded to the service handler below.
                    if (event.startsWith('reply.')) {
                        const corrId =
                            (data && data.corrId) || msg.properties?.correlationId;
                        const pending = corrId && this._pending.get(corrId);
                        if (pending) {
                            clearTimeout(pending.timer);
                            this._pending.delete(corrId);
                            pending.resolve(data);
                            this.channel.ack(msg);
                            return;
                        }
                    }

                    await callback(event, data, msg.properties);

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

export async function initRabbit(serviceName, opts = {}) {
    await rabbit.connect(serviceName, opts);

    console.log('[RabbitMQ] Ready');
    return rabbit;
}

export default rabbit;