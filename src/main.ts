import { Hono } from "hono";
import { basicAuth } from "hono/basic-auth";
import { cors } from "hono/cors";
import { serveStatic } from "hono/deno";
import { streamSSE } from "hono/streaming";

import { config_manager, MimoAccount } from "./config.ts";
import { parse_curl, build_query_from_messages } from "./utils.ts";
import { MimoClient } from "./mimo_client.ts";

// --- Admin App ---
const adminApp = new Hono();

adminApp.use("/*", cors());

adminApp.use(
  "/api/*",
  async (c, next) => {
    const config = config_manager.get_config();
    const auth = basicAuth({
      username: "admin",
      password: config.admin_password,
    });
    return auth(c, next);
  }
);

adminApp.use(
  "/",
  async (c, next) => {
    const config = config_manager.get_config();
    const auth = basicAuth({
      username: "admin",
      password: config.admin_password,
    });
    return auth(c, next);
  }
);


adminApp.get("/api/config", (c) => {
  return c.json(config_manager.get_config());
});

adminApp.post("/api/config", async (c) => {
  try {
    const body = await c.req.json();
    await config_manager.update_config(body);
    return c.json({ status: "ok" });
  } catch (e) {
    return c.json({ error: "invalid" }, 400);
  }
});

adminApp.post("/api/parse-curl", async (c) => {
  try {
    const body = await c.req.json();
    const account = parse_curl(body.curl);
    if (!account) {
      return c.json({ error: "parse failed" }, 400);
    }
    return c.json(account);
  } catch (e) {
     return c.json({ error: "invalid" }, 400);
  }
});

adminApp.post("/api/test-account", async (c) => {
  try {
    const body = await c.req.json();
    const account: MimoAccount = {
      service_token: body.service_token,
      user_id: body.user_id,
      xiaomichatbot_ph: body.xiaomichatbot_ph,
    };
    const client = new MimoClient(account);
    const { content } = await client.call_api("hi", false);
    return c.json({ success: true, response: content });
  } catch (e: any) {
    return c.json({ success: false, error: e.message });
  }
});

// Serve the web UI (adjust path relative to execution root)
adminApp.use("/*", serveStatic({ root: "./web" }));
adminApp.get("/", serveStatic({ path: "./web/index.html" }));


// --- API App ---
const apiApp = new Hono();
apiApp.use("/*", cors());

apiApp.get("/v1/models", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ error: { message: "invalid api key" } }, 401);
  }
  const token = authHeader.replace("Bearer ", "").trim();
  if (!config_manager.validate_api_key(token)) {
    return c.json({ error: { message: "invalid api key" } }, 401);
  }

  try {
    const configRes = await fetch("https://aistudio.xiaomimimo.com/open-apis/bot/config");
    if (!configRes.ok) {
       throw new Error("Failed to fetch models from Xiaomi");
    }
    const configData = await configRes.json();

    // Extract models from modelConfigListNg that have an `isDefault` property (true or false)
    const modelConfigList = configData?.data?.modelConfigListNg || [];
    let models = [];

    for (const m of modelConfigList) {
       if (m.isDefault !== undefined && m.model) {
           models.push(m.model);
       }
    }

    if (models.length === 0) {
        models = ["mimo-v2-flash-studio"]; // Fallback if list structure changes
    }

    const openaiModels = models.map((id: string) => ({
       id,
       object: "model",
       created: Math.floor(Date.now() / 1000),
       owned_by: "xiaomi",
    }));

    return c.json({
      object: "list",
      data: openaiModels,
    });
  } catch (e: any) {
    return c.json({ error: { message: e.message } }, 500);
  }
});

apiApp.post("/v1/chat/completions", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ error: { message: "invalid api key" } }, 401);
  }
  const token = authHeader.replace("Bearer ", "").trim();
  if (!config_manager.validate_api_key(token)) {
    return c.json({ error: { message: "invalid api key" } }, 401);
  }

  const account = config_manager.get_next_account();
  if (!account) {
    return c.json({ error: { message: "no mimo account" } }, 503);
  }

  let body;
  try {
     body = await c.req.json();
  } catch(e) {
     return c.json({ error: { message: "invalid json body", type: "invalid_request_error" } }, 400);
  }

  const query = build_query_from_messages(body.messages || []);
  const thinking = !!body.reasoning_effort;
  const model = body.model || "mimo-v2-flash-studio";
  const isStream = !!body.stream;
  const client = new MimoClient(account);

  // Error handling standard helper
  const handleModelError = (content: string) => {
    if (content.includes("模型名称错误") || content.includes("Model name error")) {
       return { error: { message: `The model \`${model}\` does not exist`, type: "invalid_request_error", param: "model", code: "model_not_found" } };
    }
    if (content.includes("服务器繁忙") || content.includes("Server busy")) {
       return { error: { message: "The server had an error while processing your request. Sorry about that!", type: "server_error" } };
    }
    return null;
  };

  if (isStream) {
    return streamSSE(c, async (stream) => {
      const msg_id = `chatcmpl-${crypto.randomUUID().replace(/-/g, "").substring(0, 24)}`;
      const created = Math.floor(Date.now() / 1000);

      await stream.writeSSE({
        data: JSON.stringify({
          id: msg_id,
          object: "chat.completion.chunk",
          created,
          model,
          choices: [{ index: 0, delta: { role: "assistant" } }],
        }),
      });

      let buffer = "";
      let in_think = false;

      try {
        let isFirstChunk = true;
        for await (const sse_data of client.stream_api(query, thinking, model)) {
          let content = sse_data.content || "";
          if (!content) continue;

          if (isFirstChunk) {
            const err = handleModelError(content);
            if (err) {
               await stream.writeSSE({ data: JSON.stringify(err) });
               await stream.writeSSE({ data: "[DONE]" });
               return;
            }
            isFirstChunk = false;
          }

          buffer += content;
          let text = buffer.replace(/\x00/g, "");

          while (true) {
            if (!in_think) {
              const idx = text.indexOf("<think>");
              if (idx !== -1) {
                if (idx > 0) {
                  await stream.writeSSE({
                    data: JSON.stringify({
                      id: msg_id,
                      object: "chat.completion.chunk",
                      created,
                      model,
                      choices: [{ index: 0, delta: { content: text.substring(0, idx) } }],
                    }),
                  });
                }
                in_think = true;
                text = text.substring(idx + 7);
                continue;
              }

              const safe = text.length - 7;
              if (safe > 0) {
                 await stream.writeSSE({
                    data: JSON.stringify({
                      id: msg_id,
                      object: "chat.completion.chunk",
                      created,
                      model,
                      choices: [{ index: 0, delta: { content: text.substring(0, safe) } }],
                    }),
                  });
                 text = text.substring(safe);
              }
              break;
            } else {
              const idx = text.indexOf("</think>");
              if (idx !== -1) {
                if (idx > 0) {
                  await stream.writeSSE({
                    data: JSON.stringify({
                      id: msg_id,
                      object: "chat.completion.chunk",
                      created,
                      model,
                      choices: [{ index: 0, delta: { reasoning: text.substring(0, idx) } }],
                    }),
                  });
                }
                in_think = false;
                text = text.substring(idx + 8);
                continue;
              }

              const safe = text.length - 8;
              if (safe > 0) {
                 await stream.writeSSE({
                    data: JSON.stringify({
                      id: msg_id,
                      object: "chat.completion.chunk",
                      created,
                      model,
                      choices: [{ index: 0, delta: { reasoning: text.substring(0, safe) } }],
                    }),
                  });
                 text = text.substring(safe);
              }
              break;
            }
          }
          buffer = text;
        }

        if (buffer) {
           await stream.writeSSE({
              data: JSON.stringify({
                id: msg_id,
                object: "chat.completion.chunk",
                created,
                model,
                choices: [{ index: 0, delta: in_think ? { reasoning: buffer } : { content: buffer } }],
              }),
            });
        }

        await stream.writeSSE({
          data: JSON.stringify({
            id: msg_id,
            object: "chat.completion.chunk",
            created,
            model,
            choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
          }),
        });
        await stream.writeSSE({ data: "[DONE]" });

      } catch (e: any) {
        await stream.writeSSE({ data: JSON.stringify({ error: { message: e.message } }) });
      }
    });
  }

  // Non-streaming
  try {
    const { content, think_content, usage } = await client.call_api(query, thinking, model);

    const err = handleModelError(content);
    if (err) return c.json(err, 400);

    let full_content = content;
    if (think_content) {
      full_content = `<think>${think_content}</think>\n${content}`;
    }

    return c.json({
      id: `chatcmpl-${crypto.randomUUID().replace(/-/g, "").substring(0, 24)}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: model,
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: full_content },
          finish_reason: "stop",
        },
      ],
      usage: {
        prompt_tokens: usage.promptTokens,
        completion_tokens: usage.completionTokens,
        total_tokens: usage.promptTokens + usage.completionTokens,
      },
    });
  } catch (e: any) {
    return c.json({ error: { message: e.message } }, 500);
  }
});


// --- Main ---
async function main() {
  await config_manager.load();

  const adminPort = parseInt(Deno.env.get("ADMIN_PORT") || Deno.env.get("PORT") || "8080");
  const apiPort = parseInt(Deno.env.get("API_PORT") || "8081");

  console.log(`
╔══════════════════════════════════════════════════════════╗
║                    Mimo2API Deno/Hono                    ║
║          Convert Xiaomi Mimo AI to OpenAI compatible API  ║
╚══════════════════════════════════════════════════════════╝
`);
  console.log(`🚀 Server starting...`);
  console.log(`📊 Admin UI: http://localhost:${adminPort}`);
  console.log(`📡 OpenAI Chat API: http://localhost:${apiPort}/v1/chat/completions\n`);

  Deno.serve({ port: adminPort }, adminApp.fetch);
  Deno.serve({ port: apiPort }, apiApp.fetch);
}

if (import.meta.main) {
  main();
}
