import './config.mjs';
import rabbit from '../_serviceLib/rabbitmq.mjs';

async function start() {
    console.log('[RabbitMQ Reader] starting...');

    await rabbit.connect();

    await rabbit.consume(async (msg) => {
        console.log('==============================');
        console.log('[RabbitMQ] MESSAGE RECEIVED');
        console.log('Data:', msg);
        console.log('Time:', new Date().toISOString());
        console.log('==============================');
    });

    console.log('[RabbitMQ Reader] listening...');
}

start().catch((err) => {
    console.error('[RabbitMQ Reader] error:', err);
    process.exit(1);
});