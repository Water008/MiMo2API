"""Mimo API客户端"""

import os
import json
import uuid
import httpx
from typing import Optional, Tuple, AsyncIterator
from .config import MimoAccount


class MimoClient:
    """Mimo API客户端"""

    API_URL = "https://aistudio.xiaomimimo.com/open-apis/bot/chat"
    TIMEOUT = 120.0

    def __init__(self, account: MimoAccount):
        self.account = account

    def _create_headers(self) -> dict:
        """创建请求头"""
        ua = os.getenv("MIMO_USER_AGENT", "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Mobile Safari/537.36")
        tz = os.getenv("MIMO_TIMEZONE", "Asia/Dhaka")

        return {
            "Accept": "*/*",
            "Content-Type": "application/json",
            "Origin": "https://aistudio.xiaomimimo.com",
            "Referer": "https://aistudio.xiaomimimo.com/",
            "User-Agent": ua,
            "x-timezone": tz,
        }

    def _create_cookies(self) -> dict:
        """创建Cookies"""
        return {
            "serviceToken": self.account.service_token,
            "userId": self.account.user_id,
            "xiaomichatbot_ph": self.account.xiaomichatbot_ph,
        }

    def _create_request_body(self, query: str, thinking: bool, model: str, web_search: bool = False) -> dict:
        """创建请求体"""
        return {
            "msgId": uuid.uuid4().hex[:32],
            "conversationId": uuid.uuid4().hex[:32],
            "query": query,
            "isEditedQuery": False,
            "modelConfig": {
                "enableThinking": thinking,
                "temperature": 0.8,
                "topP": 0.95,
                "webSearchStatus": "enabled" if web_search else "disabled",
                "model": model
            },
            "multiMedias": []
        }

    async def call_api(self, query: str, thinking: bool = False, model: str = "mimo-v2-flash-studio", web_search: bool = False) -> Tuple[str, str, dict]:
        """
        调用Mimo API（非流式）

        Returns:
            (content, think_content, usage)
        """
        body = self._create_request_body(query, thinking, model, web_search)

        async with httpx.AsyncClient(timeout=self.TIMEOUT) as client:
            response = await client.post(
                self.API_URL,
                params={"xiaomichatbot_ph": self.account.xiaomichatbot_ph},
                headers=self._create_headers(),
                cookies=self._create_cookies(),
                json=body
            )
            response.raise_for_status()

            result = []
            usage = {"promptTokens": 0, "completionTokens": 0}

            # 解析SSE流
            async for line in response.aiter_lines():
                if line.startswith("data:"):
                    data = line[5:].strip()
                    try:
                        sse_data = json.loads(data)
                        if sse_data.get("type") == "text":
                            result.append(sse_data.get("content", ""))
                        # 提取usage信息
                        if "promptTokens" in sse_data:
                            usage = {
                                "promptTokens": sse_data.get("promptTokens", 0),
                                "completionTokens": sse_data.get("completionTokens", 0)
                            }
                    except json.JSONDecodeError:
                        continue

            # 合并结果并解析<think>标签
            full_text = "".join(result).replace("\x00", "")
            content, think_content = self._parse_think_tags(full_text)

            return content, think_content, usage

    async def stream_api(self, query: str, thinking: bool = False, model: str = "mimo-v2-flash-studio", web_search: bool = False) -> AsyncIterator[dict]:
        """
        调用Mimo API（流式）

        Yields:
            SSE数据字典
        """
        body = self._create_request_body(query, thinking, model, web_search)

        async with httpx.AsyncClient(timeout=self.TIMEOUT) as client:
            async with client.stream(
                "POST",
                self.API_URL,
                params={"xiaomichatbot_ph": self.account.xiaomichatbot_ph},
                headers=self._create_headers(),
                cookies=self._create_cookies(),
                json=body
            ) as response:
                response.raise_for_status()

                async for line in response.aiter_lines():
                    if line.startswith("data:"):
                        data = line[5:].strip()
                        try:
                            sse_data = json.loads(data)
                            if sse_data.get("type") == "text" and sse_data.get("content"):
                                yield sse_data
                        except json.JSONDecodeError:
                            continue

    @staticmethod
    def _parse_think_tags(text: str) -> Tuple[str, str]:
        """
        解析<think>标签

        Returns:
            (content, think_content)
        """
        start = text.find("<think>")
        if start == -1:
            return text, ""

        end = text.find("</think>")
        if end == -1:
            return text, ""

        think_content = text[start + 7:end]
        content = text[end + 8:]

        return content, think_content
