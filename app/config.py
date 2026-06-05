"""配置管理模块"""

import json
import threading
from pathlib import Path
from typing import List, Optional
from dataclasses import dataclass, asdict


@dataclass
class MimoAccount:
    """Mimo账号配置"""
    service_token: str
    user_id: str
    xiaomichatbot_ph: str

    def to_dict(self):
        return asdict(self)


@dataclass
class Config:
    """应用配置"""
    api_keys: str = "sk-default"
    admin_password: str = "admin"
    mimo_accounts: List[MimoAccount] = None

    def __post_init__(self):
        if self.mimo_accounts is None:
            self.mimo_accounts = []

    def to_dict(self):
        return {
            "api_keys": self.api_keys,
            "admin_password": self.admin_password,
            "mimo_accounts": [acc.to_dict() for acc in self.mimo_accounts]
        }


class ConfigManager:
    """配置管理器 - 线程安全"""

    def __init__(self, config_file: str = "config.json"):
        self.config_file = Path(config_file)
        self.config = Config()
        self.lock = threading.RLock()
        self.account_idx = 0
        self.load()

    def load(self):
        """加载配置"""
        if not self.config_file.exists():
            self.save()
            return

        try:
            with open(self.config_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                accounts = [
                    MimoAccount(**acc) for acc in data.get('mimo_accounts', [])
                ]
                self.config = Config(
                    api_keys=data.get('api_keys', 'sk-default'),
                    admin_password=data.get('admin_password', 'admin'),
                    mimo_accounts=accounts
                )
        except Exception as e:
            print(f"加载配置失败: {e}")
            self.config = Config()
            self.save()

    def save(self):
        """保存配置"""
        with self.lock:
            try:
                with open(self.config_file, 'w', encoding='utf-8') as f:
                    json.dump(self.config.to_dict(), f, indent=2, ensure_ascii=False)
            except Exception as e:
                print(f"保存配置失败: {e}")

    def validate_api_key(self, key: str) -> bool:
        """验证API Key"""
        with self.lock:
            keys = [k.strip() for k in self.config.api_keys.split(',')]
            return key in keys

    def get_next_account(self) -> Optional[MimoAccount]:
        """获取下一个账号（轮询）"""
        with self.lock:
            if not self.config.mimo_accounts:
                return None
            account = self.config.mimo_accounts[self.account_idx % len(self.config.mimo_accounts)]
            self.account_idx += 1
            return account

    def update_config(self, new_config: dict):
        """更新配置"""
        with self.lock:
            accounts = [
                MimoAccount(**acc) for acc in new_config.get('mimo_accounts', [])
            ]
            self.config = Config(
                api_keys=new_config.get('api_keys', 'sk-default'),
                admin_password=new_config.get('admin_password', 'admin'),
                mimo_accounts=accounts
            )
            self.save()

    def get_config(self) -> dict:
        """获取配置"""
        with self.lock:
            return self.config.to_dict()


# 全局配置管理器实例
config_manager = ConfigManager()
