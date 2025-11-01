import { Hono } from "hono";
import {
  convertToModelMessages,
  generateObject,
  generateText,
  streamText,
  UIMessage,
  stepCountIs,
} from "ai";
import { createWorkersAI } from "workers-ai-provider";
import { Ai } from "@cloudflare/workers-types";
import z from "zod";
import { createClient } from "@supabase/supabase-js";
import { env } from "hono/adapter";
import { experimental_createMCPClient as createMCPClient } from "@ai-sdk/mcp";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createMistral } from "@ai-sdk/mistral";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { cors } from "hono/cors";

type Env = {
  AI: Ai;
};

const app = new Hono<{ Bindings: Env }>();

app.use(
  "*",
  cors({
    origin: (origin) => {
      // Whitelist your frontend URLs
      const allowed = [
        "http://localhost:3000",
        "https://your-frontend.vercel.app",
      ];
      if (allowed.includes(origin)) return origin;
      return "*"; // fallback
    },
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
    credentials: true,
  })
);

app.options("*", async (c) => {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
    },
  });
});

app.post("/template", async (c) => {
  let workersai = createWorkersAI({ binding: c.env.AI });

  const { SUPABASE_URL, SUPABASE_ANON_KEY } = env<{
    SUPABASE_URL: string;
    SUPABASE_ANON_KEY: string;
  }>(c);
  const supabase = createClient(
    "https://sfaqwyumdxebchjxyyyv.supabase.co",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNmYXF3eXVtZHhlYmNoanh5eXl2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAxODA4MjAsImV4cCI6MjA3NTc1NjgyMH0.c6lfauF-dlq0txeC0FiBbBQ5HuNDNxTYTsd0AEZKshU"
  );

  const {
    messages,
    text,
    projectId,
  }: { messages: any; text: string; projectId: any } = await c.req.json();

  console.log("projectId in templeate", projectId);

  const { text: copy } = await generateText({
    model: workersai("@cf/meta/llama-4-scout-17b-16e-instruct"),

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

  console.log("copy", copy);

  const { object: PromptMetaData } = await generateObject({
    model: workersai("@cf/meta/llama-4-scout-17b-16e-instruct"),
    schema: z.object({
      Identity: z.string(),
      Instructions: z.string(),
      Tone: z.string(),
    }),
    prompt: `Evaluate this System prompt for Business requirements and user intent:
   and extract the proper Identity, Instructions  and Tone for the ai agent for the business

    Prompt to evaluate: ${copy}`,
  });

  const { data: ProjectMetadata, error: projectError } = await supabase
    .from("ProjectMetadata")
    .upsert([
      {
        id: projectId,
        identity: PromptMetaData.Identity,
        instructions: PromptMetaData.Instructions,
        tone: PromptMetaData.Tone,
      },
    ])
    .select();

  if (ProjectMetadata && ProjectMetadata[0]) {
    return new Response("OK", {
      status: 200,
      headers: {
        "Content-Type": "text/plain",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  if (projectError) {
    return new Response(JSON.stringify({ error: projectError.message }), {
      status: 500,
    });
  }
});

app.post("/chat", async (c) => {
  const { messages }: { messages: UIMessage[] } = await c.req.json();
  let workersai = createWorkersAI({ binding: c.env.AI });

  const result = await streamText({
    model: workersai("@cf/meta/llama-4-scout-17b-16e-instruct"),
    messages: convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse({
    headers: {
      "Content-Type": "text/x-unknown",
      "content-encoding": "identity",
      "transfer-encoding": "chunked",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Credentials": "true",
    },
  });
});

app.post("/mcp", async (c) => {
  const { messages, projectId }: { messages: UIMessage[]; projectId: any } =
    await c.req.json();
  let workersai = createWorkersAI({ binding: c.env.AI });
  const mistral = createMistral({
    apiKey: "cAdRTLCViAHCn0ddFFEe50ULu04MbUvZ",
  });

  const google = createGoogleGenerativeAI({
    apiKey: "AIzaSyBAh9uhf8UYMdBH6YnFsqk6S4U3a38d8R0",
  });

  console.log("projectId", projectId);
  // Cache combined tools per projectId
  let mcpToolsCache: Record<string, any> = {};

  const { SUPABASE_URL, SUPABASE_ANON_KEY } = env<{
    SUPABASE_URL: string;
    SUPABASE_ANON_KEY: string;
  }>(c);
  const supabase = createClient(
    "https://sfaqwyumdxebchjxyyyv.supabase.co",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNmYXF3eXVtZHhlYmNoanh5eXl2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAxODA4MjAsImV4cCI6MjA3NTc1NjgyMH0.c6lfauF-dlq0txeC0FiBbBQ5HuNDNxTYTsd0AEZKshU"
  );

  async function getMCPTools(projectId: string) {
    console.log("projectId in func", projectId);

    if (!mcpToolsCache[projectId]) {
      console.log("projectId", projectId);

      const { data: configs, error } = await supabase
        .from("MCPConfig")
        .select("*")
        .eq("projectId", projectId);

      console.log("configs", configs);

      if (error) {
        throw new Error("Failed to fetch MCP configs", error);
      }

      if (!configs || configs.length === 0) {
        throw new Error("No MCP configs found for project");
      }

      const allTools: any = {};

      for (const config of configs) {
        const transportOptions =
          config.authHeader && config.authToken
            ? {
                requestInit: {
                  headers: {
                    [config.authHeader]: config.authToken.startsWith("Bearer ")
                      ? config.authToken
                      : `Bearer ${config.authToken}`,
                  },
                },
              }
            : undefined;

        const transport = new StreamableHTTPClientTransport(
          new URL(config.serverUrl),
          transportOptions
        );

        const mcpClient = await createMCPClient({
          transport: transport as any,
        });
        const tools = await mcpClient.tools();

        // Merge tools, assuming no conflicts in tool names
        Object.assign(allTools, tools);
      }

      mcpToolsCache = { ...mcpToolsCache, ...allTools };
    }
    return mcpToolsCache;
  }

  let { data: ProjectMetadata, error } = await supabase
    .from("ProjectMetadata")
    .select("*")
    .eq("id", projectId);

  if (error) {
    console.log("error", error);
  }

  console.log("ProjectMetadata", ProjectMetadata);

  let [ProjectMetadataObj]: any = ProjectMetadata;
  let { identity, instructions, tone }: any = ProjectMetadataObj;

  if (!projectId) {
    return new Response("Project ID required", { status: 400 });
  }
  //fetch config
  let tools = await getMCPTools(projectId);

  try {
    const result = streamText({
      system: `You are a helpful  ${identity} assistant with access to mcp tools
      
      follow this instructions ${instructions}
      
      maintain tone ${tone}

      if you dont have any answers then say "I dont have any answers"
      
      `,
      model: workersai("@cf/meta/llama-4-scout-17b-16e-instruct"),
      tools,
      toolChoice: "auto",
      stopWhen: [stepCountIs(10)],
      messages: convertToModelMessages(messages),
    });

    return result.toUIMessageStreamResponse({
      headers: {
        // add these headers to ensure that the
        // response is chunked and streamed
        "Content-Type": "text/x-unknown",
        "content-encoding": "identity",
        "transfer-encoding": "chunked",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Credentials": "true",
      },
    });
  } catch (error) {
    console.error("Error occurred while processing request:", error);
    return new Response(
      error instanceof Error ? error.message : "Internal Server Error",
      {
        status: 500,
      }
    );
  }
});

export default app;
