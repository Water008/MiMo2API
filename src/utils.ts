import { MimoAccount } from "./config.ts";

export function parse_curl(curl_command: string): MimoAccount | null {
  const account: MimoAccount = {
    service_token: "",
    user_id: "",
    xiaomichatbot_ph: "",
  };

  // Extract cookies (supports multiple formats)
  let cookie_match = curl_command.match(/(?:-b|--cookie)\s+'([^']+)'/);
  if (!cookie_match) {
    cookie_match = curl_command.match(/(?:-b|--cookie)\s+"([^"]+)"/);
  }
  if (!cookie_match) {
    cookie_match = curl_command.match(/-H\s+'[Cc]ookie:\s*([^']+)'/);
  }
  if (!cookie_match) {
    cookie_match = curl_command.match(/-H\s+"[Cc]ookie:\s*([^"]+)"/);
  }
  if (!cookie_match) {
    return null;
  }

  const cookies = cookie_match[1];

  // Extract serviceToken
  const service_token_match = cookies.match(/serviceToken="([^"]+)"/);
  if (service_token_match) {
    account.service_token = service_token_match[1];
  }

  // Extract userId
  const user_id_match = cookies.match(/userId=(\d+)/);
  if (user_id_match) {
    account.user_id = user_id_match[1];
  }

  // Extract xiaomichatbot_ph
  const ph_match = cookies.match(/xiaomichatbot_ph="([^"]+)"/);
  if (ph_match) {
    account.xiaomichatbot_ph = ph_match[1];
  }

  // Validate required fields
  if (!account.service_token) {
    return null;
  }

  return account;
}

export function build_query_from_messages(
  messages: { role: string; content: string }[],
  max_messages: number = 10,
  max_content_len: number = 4000
): string {
  // Keep only the last N messages
  if (messages.length > max_messages) {
    messages = messages.slice(-max_messages);
  }

  const query_parts: string[] = [];
  for (const msg of messages) {
    let content = msg.content;
    // Truncate excessively long content
    if (content.length > max_content_len) {
      content = content.substring(0, max_content_len) + "...";
    }
    query_parts.push(`${msg.role}: ${content}`);
  }

  return query_parts.join("\n");
}
