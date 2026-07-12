# Mimo2API

Mimo2API is a proxy server designed to convert the Xiaomi Mimo AI API into an OpenAI-compatible API format. It allows you to use Xiaomi's AI models on any client or application that supports the standard OpenAI API.

## Features

- **OpenAI Compatible**: Fully compatible with the standard OpenAI API structure (`/v1/chat/completions`, `/v1/models`).
- **Deep Thinking Support**: Seamlessly parses and returns `<think>` tags via standard `reasoning` chunks, perfect for advanced clients (like NextChat, Chatbox).
- **Stream Support**: Full Server-Sent Events (SSE) streaming capabilities.
- **Load Balancing**: Set up multiple Xiaomi accounts; the proxy will automatically round-robin requests among them to prevent rate limiting.
- **Web UI**: Built-in Admin Interface for managing your configuration, API keys, and accounts visually.
- **Deno & Hono**: High performance and native async operations built on modern Deno with the Hono framework.

## Quick Start

### 1. Install Deno
Make sure you have Deno installed on your system. Follow instructions on [deno.land](https://deno.land/#installation).

### 2. Start the Server
Run the startup task directly:
```bash
deno task start
```
The server will start two services:
- **Admin UI**: `http://localhost:8080`
- **OpenAI API**: `http://localhost:8081`

### 3. Configuration
Visit the Admin UI at `http://localhost:8080`.
1. **API Keys**: Configure custom API Keys to protect your proxy. The default is `sk-default`.
2. **Add Accounts**:
   - Log into [aistudio.xiaomimimo.com](https://aistudio.xiaomimimo.com).
   - Open Developer Tools -> Network.
   - Send a message and find the `chat` request.
   - Right-click the request -> Copy as cURL.
   - Paste the cURL command into the Admin UI to automatically parse and add your account tokens.

## API Endpoints

| Endpoint | Method | Description | Authentication |
|----------|--------|-------------|----------------|
| `/v1/chat/completions` | POST | OpenAI-compatible chat API | Bearer Token |
| `/v1/models` | GET | List available models | Bearer Token |
| `/api/config` | GET/POST | Get/Update configurations | Basic Auth (admin) |
| `/api/parse-curl` | POST | Parse cURL to extract credentials | Basic Auth (admin) |
| `/api/test-account` | POST | Test Xiaomi account validity | Basic Auth (admin) |
| `/` | GET | Admin Web UI | Basic Auth (admin) |

## Example Usage

### Standard Chat Request
```bash
curl http://localhost:8081/v1/chat/completions \
  -H "Authorization: Bearer sk-default" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "mimo-v2-flash-studio",
    "messages": [
      {"role": "user", "content": "Hello!"}
    ]
  }'
```

### Reasoning Effort (Deep Thinking)
Enable `<think>` tokens extraction by adding `reasoning_effort`:
```bash
curl http://localhost:8081/v1/chat/completions \
  -H "Authorization: Bearer sk-default" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "mimo-v2-flash-studio",
    "messages": [
      {"role": "user", "content": "Explain quantum entanglement."}
    ],
    "reasoning_effort": "high",
    "stream": true
  }'
```

## Development

Run with hot-reload enabled during development:
```bash
deno task dev
```

## License
MIT
