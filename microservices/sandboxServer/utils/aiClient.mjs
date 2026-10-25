import rabbit from '../../_serviceLib/rabbitmq.mjs';

// LLM call routed through the shared event bus (aiServer is a pure consumer,
// no HTTP port). Returns the raw model string (JSON string when requireJson=true).
// Timeout is generous because local Ollama generations can run for minutes.
export async function callLocalLLM(prompt, model = 'llama3:latest', systemPrompt = '', requireJson = false) {
  const reply = await rabbit.request(
    'ai.generate',
    { prompt, model, systemPrompt, requireJson },
    300000
  );
  if (reply?.error) throw new Error(`AI Server error: ${reply.error}`);
  return reply?.response;
}

// Streaming LLM call over the bus: aiServer pushes each token-delta to
// `chunkTo` (a client socketId) as `push.socket { event: chunkEvent }` and
// returns the full accumulated text in the single RPC reply. When chunkTo is
// absent this degrades to a normal (non-pushed) generation.
export async function callLocalLLMStream(prompt, { model = 'llama3:latest', systemPrompt = '', chunkTo, chunkEvent } = {}) {
  const reply = await rabbit.request(
    'ai.generate.stream',
    { prompt, model, systemPrompt, chunkTo, chunkEvent },
    300000
  );
  if (reply?.error) throw new Error(`AI Server error: ${reply.error}`);
  return reply?.response;
}
