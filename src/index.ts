import { Hono } from 'hono';
import { convertToModelMessages, generateObject, generateText, streamText } from 'ai';
import { createWorkersAI } from 'workers-ai-provider';
import { Ai } from '@cloudflare/workers-types';
import z from "zod";
import { createClient } from '@supabase/supabase-js'
import { env } from 'hono/adapter'
import { uuid } from 'zod/v4';
import { createMistral } from "@ai-sdk/mistral";
type Env = {
  AI: Ai;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
};

const app = new Hono<{ Bindings: Env }>();

const mistral = createMistral({
  apiKey: "cAdRTLCViAHCn0ddFFEe50ULu04MbUvZ",
});


const MCPInputSchema = z
  .union([
    z.object({ fileName: z.string().min(1) }), // represents uploaded file
    z.object({
      serverLink: z.string().url("Must be a valid URL"),
      apiKey: z.string().min(1, "API Key is required"),
    }),
  ])
  .refine(
    (data) => {
      const hasFile = "fileName" in data && data.fileName;
      const hasServer = "serverLink" in data && data.serverLink && data.apiKey;
      return hasFile !== hasServer;
    },
    { message: "Provide either a file or MCP server link + API key" }
  );


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

app.post('/template', async (c) => {

  try {
    let workersai = createWorkersAI({ binding: c.env.AI });

    const { SUPABASE_URL, SUPABASE_ANON_KEY } = env<{ SUPABASE_URL: string, SUPABASE_ANON_KEY: string }>(c)
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    const { messages, text, projectId }: { messages: any, text: string, projectId: any } =
      await c.req.json();


    console.log("projectId", projectId)


    const { text: copy } = await generateText({
      model: mistral("mistral-medium-latest"),

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


    const { object: PromptMetaData } = await generateObject({
      model: mistral("mistral-medium-latest"),
      maxRetries: 3,
      schema: z.object({
        Identity: z.string(),
        Instructions: z.string(),
        Tone: z.string(),
      }),
      messages: [
        {
          role: 'user',
          content: `Evaluate this System prompt for Business requirements and user intent:
   and extract the proper Identity, Instructions  and Tone for the ai agent for the business
    Prompt to evaluate: ${copy}`
        }
      ],
    });

    console.log("PromptMetaData", PromptMetaData);

    // ✅ Validation before inserting
    if (!PromptMetaData?.Identity || !PromptMetaData?.Instructions || !PromptMetaData?.Tone) {
      return c.json({ error: "Incomplete metadata generated" }, 400);
    }





    const { data, error } = await supabase
      .from('ProjectMetadata')
      .upsert({ id: projectId, identity: PromptMetaData?.Identity, instructions: PromptMetaData?.Instructions, tone: PromptMetaData?.Tone })
      .select()

    if (error || !data) {
      console.error("Supabase insert error:", error);
      return c.json({ error: error?.message || "Failed to insert metadata" }, 500);
    }

    console.log("ProjectMetadata", data);

    c.status(200)
    return c.json({ success: true, projectMetadata: data }, {
      headers: {
        'Content-Type': 'text/x-unknown',
        'content-encoding': 'identity',
        'transfer-encoding': 'chunked',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Credentials': 'true',
      }
    });
  } catch (err: any) {
    console.error("Error in /template:", err);
    return c.json({ error: err.message || "Internal Server Error" }, 500);
  }

});


app.post('/chat', async (c) => {
  try {

    let workersai = createWorkersAI({ binding: c.env.AI });
    const { messages } = await c.req.json(); // ✅ FIX: Extract messages from request


    const result = await streamText({
      model: mistral("mistral-medium-latest"),
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
  } catch (err: any) {
    console.error("Error in /chat:", err);
    return c.json({ error: err.message || "Internal Server Error" }, 500);
  }

});



export default app;






// /template 

// /chat


// import {
//   convertToModelMessages,
//   createUIMessageStream,
//   createUIMessageStreamResponse,
//   generateText,
//   ModelMessage,
//   PrepareStepFunction,
//   stepCountIs,
//   streamObject,
//   streamText,
//   tool,
//   UIMessage,
// } from "ai";
// import { createMistral } from "@ai-sdk/mistral";
// import { generateObject } from "ai";
// import z from "zod";
// import fs from "fs";
// import path from "path";
// import { createGoogleGenerativeAI } from "@ai-sdk/google";
// import { createGateway } from "@ai-sdk/gateway";
// const google = createGoogleGenerativeAI({
//   apiKey: "AIzaSyD7qTXxvPibDvKhU_hduloMMap9B6YuHzM",
// });

// const gateway = createGateway({
//   apiKey: process.env.AI_GATEWAY_API_KEY, // the default environment variable for the API key
//   baseURL: "https://ai-gateway.vercel.sh/v1/ai", // the default base URL
// });
// const mistral = createMistral({
//   apiKey: "cAdRTLCViAHCn0ddFFEe50ULu04MbUvZ",
// });

// export const maxDuration = 30;


// export async function POST(req: Request) {
//   const { messages, customKey }: { messages: UIMessage[]; customKey: string } =
//     await req.json();

//   // First step: Generate marketing copy


//   // Perform quality check on copy
//   const { object: PromptMetaData } = await generateObject({
//     model: mistral("mistral-medium-latest"),
//     schema: z.object({
//       Identity: z.string(),
//       Instructions: z.string(),
//       Tone: z.string(),
//     }),
//     prompt: `Evaluate this System prompt for Business requirements and user intent:
//    and extract the proper Identity, Instructions  and Tone for the ai agent for the business

//     Prompt to evaluate: ${copy}`,
//   });

//   console.log("PromptMetaData", PromptMetaData);


//   // If quality check fails, regenerate with more specific instructions

//   // const stream = createUIMessageStream({
//   //   originalMessages: messages,
//   //   execute: async ({ writer }) => {
//   //     const result = streamText({
//   //       system:
//   //         "You are an AI agent builder. When users ask you to create or develop an AI agent for a business, you must first gather MCP server information by calling the gatherMcpInformation tool ",
//   //       model: mistral("mistral-large-latest"),
//   //       messages: convertToModelMessages(messages),
//   //       tools: {
//   //         gatherMcpInformation: tool({
//   //           description:
//   //             "when asked to develope agnet show the Option to upload the Open Api schema file or connect the mcp server Link and API key ",
//   //           inputSchema: MCPInputSchema,
//   //           outputSchema: z.string(),
//   //         }),
//   //       },
//   //       stopWhen: stepCountIs(5),

//   //       toolChoice: "required",
//   //       prepareStep: ({ steps, stepNumber, messages }) => {
//   //         if (stepNumber > 10) {
//   //           return {
//   //             toolChoice: {
//   //               type: "tool",
//   //               toolName: "gatherMcpInformation",
//   //             },
//   //           };
//   //         }

//   //         return undefined;
//   //       },
//   //     });

//   //     let res = result.toolCalls?.then((toolCalls) => {
//   //       console.log("toolCalls", toolCalls);
//   //     });

//   //     console.log("toolscal", res);
//   //     writer.merge(result.toUIMessageStream({ originalMessages: messages }));
//   //   },
//   // });

//   return createUIMessageStreamResponse({ stream });
// }

