import './config.mjs';

import rabbit, { initRabbit } from '../_serviceLib/rabbitmq.mjs';
import AIService from './services/aiService.mjs';

await initRabbit();

const ai = new AIService({
  model: process.env.AI_MODEL || "llama3.1:8b",
});

// optional warmup
await ai.getModels();

console.log('[AI Worker] 🚀 started');

// очередь входящих запросов
await rabbit.consume(async (msg) => {
  console.log('[AI Worker] request:', msg);
  const { userId, text, conversationId, model } = msg.data;


  switch (msg.type) {
    case 'sandbox:chat:message':
      const answer = await ai.ask(text, model);
      console.log('[AI Worker] answer:', answer);
      // await rabbit.send({userId, conversationId, answer});
      break;
    default:
      break;
  }




  try {

  } catch (err) {
    console.error('[AI Worker] error:', err);

    await rabbit.send({
      userId,
      text,
      conversationId,
      status: 'error',
      error: err.message
    });
  }
});