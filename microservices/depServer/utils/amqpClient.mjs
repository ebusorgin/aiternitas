import amqplib from 'amqplib';

const AMQP_URL = process.env.AMQP_URL || 'amqp://aiternitas:aiternitassecret@localhost:5672';
let connection = null;
let channel = null;

export async function getChannel() {
  if (channel) return channel;
  try {
    connection = await amqplib.connect(AMQP_URL);
    channel = await connection.createChannel();
    console.log('[AMQP] Connected to RabbitMQ');
    return channel;
  } catch (error) {
    console.error('[AMQP] Connection failed:', error.message);
    setTimeout(getChannel, 5000); // Retry
  }
}

export async function publishTask(queue, taskData) {
  const ch = await getChannel();
  if (!ch) return false;
  await ch.assertQueue(queue, { durable: true });
  return ch.sendToQueue(queue, Buffer.from(JSON.stringify(taskData)), { persistent: true });
}

export async function consumeTasks(queue, callback) {
  const ch = await getChannel();
  if (!ch) return;
  await ch.assertQueue(queue, { durable: true });
  ch.prefetch(1);
  console.log(`[AMQP] Waiting for tasks in ${queue}...`);
  ch.consume(queue, async (msg) => {
    if (msg !== null) {
      try {
        const data = JSON.parse(msg.content.toString());
        await callback(data);
        ch.ack(msg);
      } catch (err) {
        console.error('[AMQP] Error processing task:', err);
        // Решаем, делать ли nack или ack в зависимости от ошибки. 
        // Пока делаем nack, чтобы задача не потерялась
        ch.nack(msg, false, false); 
      }
    }
  });
}
