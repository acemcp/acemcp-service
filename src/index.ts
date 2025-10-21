import { Hono } from 'hono';
import { convertToModelMessages, generateObject, generateText, streamText } from 'ai';
import { createWorkersAI } from 'workers-ai-provider';
import { Ai } from '@cloudflare/workers-types';

type Env = {
  AI: Ai;
};

const app = new Hono<{ Bindings: Env }>();

app.options('*', async (c) => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    },
  });
});

app.post('/', async (c) => {




  const { messages, text }: { messages: any, text: string } =
    await c.req.json();

  const workersai = createWorkersAI({ binding: c.env.AI });



  console.log("customKey", text)

  const { text: copy } = await generateText({
    model: workersai('@cf/meta/llama-4-scout-17b-16e-instruct'),

    prompt: `Write a System prompt for ${text} the business requirements and also focus of the user intent 
   
<Identity>
You are a helpful <Persona>Who or what the model is acting as. Also called "role" or "vision</Persona> who is an expert in ${text}
</Identity>
<Instructions>
 Only output a single word in your response with no additional formatting
  or commentary.
 Your response should only be one of the words "Positive", "Negative", or
  "Neutral" depending on the sentiment of the product review you are given.
</Instructions>
    }


    <Tone>Respond in a casual and technical manner.</Tone>
    exmple : 

    <OBJECTIVE_AND_PERSONA>
You are a [insert a persona, such as a "math teacher" or "automotive expert"]. Your task is to...
</OBJECTIVE_AND_PERSONA>

<INSTRUCTIONS>
To complete the task, you need to follow these steps:
1.
2.
...
</INSTRUCTIONS>

------------- Optional Components ------------

<CONSTRAINTS>
Dos and don'ts for the following aspects
1. Dos
2. Don'ts
</CONSTRAINTS>

<CONTEXT>
The provided context
</CONTEXT>

<OUTPUT_FORMAT>
The output format must be
1.
2.
...
</OUTPUT_FORMAT>

<FEW_SHOT_EXAMPLES>
Here we provide some examples:
1. Example #1
Input:
Thoughts:
Output:
...
</FEW_SHOT_EXAMPLES>

<RECAP>
Re-emphasize the key aspects of the prompt, especially the constraints, output format, etc.
</RECAP>
    `,
  });



  console.log("copy", copy)

  const { object } = await generateObject({
    model: workersai('@cf/meta/llama-4-scout-17b-16e-instruct'),
    output: 'enum',
    enum: ['action', 'comedy', 'drama', 'horror', 'sci-fi'],
    prompt:
      'Classify the genre of this movie plot: ' +
      '"A group of astronauts travel through a wormhole in search of a ' +
      'new habitable planet for humanity."',
  });


  console.log("object", object)



  const result = await streamText({
    model: workersai('@cf/meta/llama-4-scout-17b-16e-instruct'),
    messages: convertToModelMessages(messages)
  });

  return result.toUIMessageStreamResponse({
    headers: {
      'Content-Type': 'text/x-unknown',
      'content-encoding': 'identity',
      'transfer-encoding': 'chunked',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Credentials': 'true',
    }
  });
});

export default app;
