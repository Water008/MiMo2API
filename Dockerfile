FROM python:3.11-slim

WORKDIR /app

# 安装依赖
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 复制项目文件
COPY . .

# 创建 /data 目录并设置权限
RUN mkdir -p /data && chmod 777 /data

# 设置环境变量
ENV PORT=7860
ENV DATA_DIR=/data

# 暴露端口
EXPOSE 7860

# 启动命令
CMD ["python", "main.py"]
