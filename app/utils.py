"""工具函数"""

import re
from typing import Optional
from .config import MimoAccount


def parse_curl(curl_command: str) -> Optional[MimoAccount]:
    """
    解析cURL命令提取Mimo账号凭证

    Args:
        curl_command: cURL命令字符串

    Returns:
        MimoAccount对象或None
    """
    account = {
        'service_token': '',
        'user_id': '',
        'xiaomichatbot_ph': ''
    }

    # 提取cookies（支持多种格式）
    cookie_match = re.search(r"(?:-b|--cookie)\s+'([^']+)'", curl_command)
    if not cookie_match:
        cookie_match = re.search(r'(?:-b|--cookie)\s+"([^"]+)"', curl_command)
    if not cookie_match:
        cookie_match = re.search(r"-H\s+'[Cc]ookie:\s*([^']+)'", curl_command)
    if not cookie_match:
        cookie_match = re.search(r'-H\s+"[Cc]ookie:\s*([^"]+)"', curl_command)
    if not cookie_match:
        return None

    cookies = cookie_match.group(1)

    # 提取serviceToken
    service_token_match = re.search(r'serviceToken="([^"]+)"', cookies)
    if service_token_match:
        account['service_token'] = service_token_match.group(1)

    # 提取userId
    user_id_match = re.search(r'userId=(\d+)', cookies)
    if user_id_match:
        account['user_id'] = user_id_match.group(1)

    # 提取xiaomichatbot_ph
    ph_match = re.search(r'xiaomichatbot_ph="([^"]+)"', cookies)
    if ph_match:
        account['xiaomichatbot_ph'] = ph_match.group(1)

    # 验证必需字段
    if not account['service_token']:
        return None

    return MimoAccount(**account)


def safe_utf8_len(text: str, max_len: int) -> int:
    """
    安全的UTF-8字符串长度计算，避免在多字节字符中间截断

    Args:
        text: 文本字符串
        max_len: 最大长度

    Returns:
        安全的截断长度
    """
    if max_len <= 0 or max_len >= len(text):
        return len(text)

    # Python 3的字符串是Unicode，不需要特殊处理UTF-8边界
    # 但为了与Go版本保持一致的逻辑，我们保留这个函数
    return max_len


def build_query_from_messages(messages: list, max_messages: int = 500, max_content_len: int = 12000) -> tuple:
    """
    从消息列表构建查询字符串，并解析特殊标签

    Args:
        messages: 消息列表
        max_messages: 最大消息数量
        max_content_len: 单条消息最大长度

    Returns:
        (查询字符串, 思考状态, 搜索状态)
        状态: True=on, False=off, None=未指定
    """
    thinking = None
    web_search = None

    # 检查所有消息（特别是system消息）中的标签
    for msg in messages:
        if "[think=on]" in msg.content:
            thinking = True
        elif "[think=off]" in msg.content:
            thinking = False

        if "[search=on]" in msg.content:
            web_search = True
        elif "[search=off]" in msg.content:
            web_search = False

    # 只保留最后N条消息用于对话
    if len(messages) > max_messages:
        messages = messages[-max_messages:]

    query_parts = []
    for msg in messages:
        content = msg.content
        # 移除控制标签，避免发送给AI
        content = content.replace("[think=on]", "").replace("[think=off]", "") \
                         .replace("[search=on]", "").replace("[search=off]", "").strip()

        if not content and msg.role == "system":
            continue

        # 截断过长的内容
        if len(content) > max_content_len:
            content = content[:max_content_len] + "..."
        query_parts.append(f"{msg.role}: {content}")

    return "\n".join(query_parts), thinking, web_search
