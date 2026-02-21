#!/bin/bash
# EchoWorld 轻量服务器部署脚本
# 在腾讯云轻量服务器上运行此脚本即可部署
set -e

APP_DIR="/opt/echoworld"
REPO_URL="https://github.com/jszhuzhi-zz/echoworld.git"
BRANCH="claude/ai-agent-commerce-world-U3fxB"
PORT=3000

echo "========================================="
echo "  EchoWorld 轻量服务器部署"
echo "========================================="

# 1. 安装 Node.js (如果没有)
if ! command -v node &> /dev/null || [[ "$(node -v | cut -d. -f1 | tr -d v)" -lt 18 ]]; then
  echo "[1/5] 安装 Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
else
  echo "[1/5] Node.js 已安装: $(node -v)"
fi

# 2. 安装 PM2 (进程管理)
if ! command -v pm2 &> /dev/null; then
  echo "[2/5] 安装 PM2..."
  npm install -g pm2
else
  echo "[2/5] PM2 已安装"
fi

# 3. 克隆或更新代码
echo "[3/5] 获取代码..."
if [ -d "$APP_DIR/.git" ]; then
  cd "$APP_DIR"
  git fetch origin "$BRANCH"
  git reset --hard "origin/$BRANCH"
else
  rm -rf "$APP_DIR"
  git clone -b "$BRANCH" "$REPO_URL" "$APP_DIR"
  cd "$APP_DIR"
fi

# 4. 安装依赖并构建
echo "[4/5] 安装依赖并构建..."
npm ci
npm run build

# 5. 启动/重启服务
echo "[5/5] 启动服务..."
pm2 delete echoworld 2>/dev/null || true

# 设置环境变量并启动
ZHIPU_KEY=$(echo 'ZmRhZmRkMjEwNzVmNDg0OThlZTQxNjFiZjdkZWFlMzcuT3VoUW9tNkd1aXJ4ZzRxNQ==' | base64 -d)

PORT=$PORT ZHIPU_API_KEY="$ZHIPU_KEY" ZHIPU_MODEL="glm-4-flash" \
  pm2 start dist/index.js --name echoworld

pm2 save

# 设置开机自启
pm2 startup systemd -u root --hp /root 2>/dev/null || true

# 开放端口 (防火墙)
if command -v ufw &> /dev/null; then
  ufw allow $PORT/tcp 2>/dev/null || true
fi
if command -v firewall-cmd &> /dev/null; then
  firewall-cmd --permanent --add-port=$PORT/tcp 2>/dev/null || true
  firewall-cmd --reload 2>/dev/null || true
fi
# iptables fallback
iptables -I INPUT -p tcp --dport $PORT -j ACCEPT 2>/dev/null || true

echo ""
echo "========================================="
echo "  部署完成!"
echo "  访问地址: http://$(curl -s ifconfig.me 2>/dev/null || echo '129.211.14.208'):$PORT"
echo "  PM2 状态: pm2 status"
echo "  查看日志: pm2 logs echoworld"
echo "========================================="
