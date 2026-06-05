"""Mimo2API Python版本 - 主程序入口"""

import os
import threading
import uvicorn
from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
from fastapi import Depends
from app.routes import router
from app.config import config_manager
from app.auth import verify_admin

# 创建管理应用
admin_app = FastAPI(
    title="Mimo2API Admin",
    description="Mimo2API 管理界面",
    version="1.0.0"
)

# 创建 OpenAI 兼容 API 应用
api_app = FastAPI(
    title="Mimo2API",
    description="将小米 Mimo AI 转换为 OpenAI 兼容 API",
    version="1.0.0"
)

for current_app in (admin_app, api_app):
    current_app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

admin_app.include_router(admin_router)
api_app.include_router(api_router)

# 静态文件目录
web_dir = Path(__file__).parent / "web"

# 提供管理界面
@app.get("/")
async def serve_admin(username: str = Depends(verify_admin)):
    """提供管理界面"""
    index_file = web_dir / "index.html"
    if index_file.exists():
        return FileResponse(index_file)
    return {"message": "Admin interface not found"}


def run_server(app: FastAPI, host: str, port: int):
    """运行服务"""
    uvicorn.run(app, host=host, port=port, log_level="info")


def main():
    """主函数"""
    admin_port = int(os.getenv("ADMIN_PORT", os.getenv("PORT", "8080")))
    api_port = int(os.getenv("API_PORT", "8081"))

    print(f"""
╔══════════════════════════════════════════════════════════╗
║                    Mimo2API Python                       ║
║          将小米 Mimo AI 转换为 OpenAI 兼容 API           ║
╚══════════════════════════════════════════════════════════╝

🚀 服务器启动中...
📊 管理界面: http://localhost:{admin_port}
📘 其他接口文档: http://localhost:{admin_port}/docs
📡 OpenAI聊天接口: http://localhost:{api_port}/v1/chat/completions
📖 聊天接口文档: http://localhost:{api_port}/docs

配置信息:
  - API Keys: {len(config_manager.config.api_keys.split(','))} 个
  - Mimo账号: {len(config_manager.config.mimo_accounts)} 个

按 Ctrl+C 停止服务器
""")

    admin_thread = threading.Thread(
        target=run_server,
        args=(admin_app, "0.0.0.0", admin_port),
        daemon=True
    )
    admin_thread.start()

    run_server(api_app, "0.0.0.0", api_port)


if __name__ == "__main__":
    main()
