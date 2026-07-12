import { MimoAccount } from "./config.ts";

export class MimoClient {
  private readonly API_URL = "https://aistudio.xiaomimimo.com/open-apis/bot/chat";
  private account: MimoAccount;

  constructor(account: MimoAccount) {
    this.account = account;
  }

  private _create_headers(): HeadersInit {
    return {
      "Accept": "*/*",
      "Content-Type": "application/json",
      "Origin": "https://aistudio.xiaomimimo.com",
      "Referer": "https://aistudio.xiaomimimo.com/",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
      "x-timezone": "Asia/Shanghai",
      "Cookie": `serviceToken=${this.account.service_token}; userId=${this.account.user_id}; xiaomichatbot_ph=${this.account.xiaomichatbot_ph}`,
    };
  }

  private _create_request_body(query: string, thinking: boolean, model: string): any {
    return {
      msgId: crypto.randomUUID().replace(/-/g, ""),
      conversationId: crypto.randomUUID().replace(/-/g, ""),
      query: query,
      modelConfig: {
        enableThinking: thinking,
        temperature: 0.8,
        topP: 0.95,
        webSearchStatus: "disabled",
        model: model,
      },
      multiMedias: [],
    };
  }

  static _parse_think_tags(text: string): { content: string; think_content: string } {
    const start = text.indexOf("<think>");
    if (start === -1) {
      return { content: text, think_content: "" };
    }

    const end = text.indexOf("</think>");
    if (end === -1) {
      return { content: text, think_content: "" };
    }

    const think_content = text.substring(start + 7, end);
    const content = text.substring(end + 8);

    return { content, think_content };
  }

  async call_api(
    query: string,
    thinking: boolean = false,
    model: string = "mimo-v2-flash-studio"
  ): Promise<{ content: string; think_content: string; usage: any }> {
    const body = this._create_request_body(query, thinking, model);
    const url = new URL(this.API_URL);
    url.searchParams.append("xiaomichatbot_ph", this.account.xiaomichatbot_ph);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000);

    try {
      const response = await fetch(url.toString(), {
        method: "POST",
        headers: this._create_headers(),
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      if (!response.body) {
         throw new Error("Empty response body");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullText = "";
      let usage = { promptTokens: 0, completionTokens: 0 };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data:")) {
            const dataStr = line.substring(5).trim();
            try {
              const sseData = JSON.parse(dataStr);
              if (sseData.type === "text") {
                fullText += sseData.content || "";
              }
              if ("promptTokens" in sseData) {
                usage = {
                  promptTokens: sseData.promptTokens || 0,
                  completionTokens: sseData.completionTokens || 0,
                };
              }
            } catch (e) {
              // Ignore JSON parse errors for incomplete lines or non-JSON data
            }
          }
        }
      }

      fullText = fullText.replace(/\x00/g, "");
      const { content, think_content } = MimoClient._parse_think_tags(fullText);

      return { content, think_content, usage };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async *stream_api(
    query: string,
    thinking: boolean = false,
    model: string = "mimo-v2-flash-studio"
  ): AsyncGenerator<any, void, unknown> {
    const body = this._create_request_body(query, thinking, model);
    const url = new URL(this.API_URL);
    url.searchParams.append("xiaomichatbot_ph", this.account.xiaomichatbot_ph);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000);

    try {
      const response = await fetch(url.toString(), {
        method: "POST",
        headers: this._create_headers(),
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      if (!response.body) {
          throw new Error("Empty response body");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data:")) {
            const dataStr = line.substring(5).trim();
            try {
              const sseData = JSON.parse(dataStr);
              if (sseData.type === "text" && sseData.content) {
                yield sseData;
              }
            } catch (e) {
              // Ignore
            }
          }
        }
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
