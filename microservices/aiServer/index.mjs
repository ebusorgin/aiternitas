import './config.mjs';

import rabbit, { initRabbit } from '../_serviceLib/rabbitmq.mjs';
import AIService from './services/aiService.mjs';
import dotenv from 'dotenv';
dotenv.config();
await initRabbit(process.env.RABBITMQ_QUEUE);

const ai = new AIService({
  model: process.env.AI_MODEL || "llama3.1:8b",
});

// optional warmup


console.log('[AI Worker] 🚀 started');

// очередь входящих запросов
await rabbit.consume(async (msg,data) => {
  console.log('[AI Worker] request:', msg,data);
  const { userId, text, conversationId, model } = data;


  switch (msg) {
    case 'ai.chat.message':
      const answer = await ai.ask(text, model);
      console.log('[AI Worker] answer:', answer);
      await rabbit.publish('user.chat.message', { userId, conversationId, answer });


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