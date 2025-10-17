import { Hono } from 'hono'
// import { serve } from '@hono/node-server';
//add if want to use the node bindings 
import { streamText } from 'ai';


import { createMistral } from '@ai-sdk/mistral';

const mistral = createMistral({
  apiKey: "cAdRTLCViAHCn0ddFFEe50ULu04MbUvZ"
});
const app = new Hono();

app.post('/', async c => {
  const result = streamText({
    model: mistral("mistral-large-latest"),
    prompt: 'Invent a new holiday and describe its traditions.',
  });
  return result.toUIMessageStreamResponse();
});

export default app;