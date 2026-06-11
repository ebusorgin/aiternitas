import fetch from 'node-fetch';

const AI_SERVER_URL = process.env.AI_SERVER_URL || 'http://localhost:4003';

export async function callLocalLLM(prompt, model = 'llama3:latest', systemPrompt = '', requireJson = false) {
  try {
    const response = await fetch(`${AI_SERVER_URL}/api/ai/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        prompt,
        model,
        systemPrompt,
        requireJson
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`AI Server error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return data.response;
  } catch (error) {
    console.error('[AI Client] Error calling aiServer:', error);
    throw error;
  }
}
