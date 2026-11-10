#!/usr/bin/env sh
# 毛布选色 · 色研所 —— Ubuntu / macOS 一键启动（普通用户，需在 docker 组）
set -eu
cd "$(dirname "$0")"

if ! command -v docker >/dev/null 2>&1; then
  echo "未找到 docker。请先安装 Docker Engine 或 Docker Desktop。"
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo "Docker 服务不可用。请确认 Docker 已启动，且当前用户在 docker 组内。"
  exit 1
fi

if docker compose version >/dev/null 2>&1; then
  DC="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  DC="docker-compose"
else
  echo "未找到 Docker Compose 插件，请安装 docker-compose-plugin。"
  exit 1
fi

if [ ! -f .env ]; then
  cp env.example .env
  echo "已从 env.example 生成 .env；生产环境请修改 ADMIN_PASSWORD 与 APP_SECRET。"
fi

PORT=$(sed -n 's/^APP_PORT=//p' .env | tail -n 1 | tr -d '\r')
PORT=${PORT:-8000}

echo "正在构建并启动容器……"
$DC up -d --build

echo "等待服务就绪……"
i=0
while [ "$i" -lt 60 ]; do
  if curl -fsS --max-time 2 "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1; then
    echo "已启动：http://localhost:${PORT}"
    echo "首次登录账号见 .env 的 ADMIN_USERNAME / ADMIN_PASSWORD，登录后请立即改密。"
    exit 0
  fi
  i=$((i + 1))
  sleep 2
done

echo "启动超时。请查看日志：$DC logs --tail=100"
exit 1
