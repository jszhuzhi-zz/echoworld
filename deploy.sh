#!/bin/bash
# ==============================================
# EchoWorld 腾讯云一键部署脚本
# 支持: 云服务器(CVM) / 轻量应用服务器 / CloudBase
# ==============================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  EchoWorld 腾讯云部署脚本 v1.0${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# 检测部署模式
DEPLOY_MODE="${1:-auto}"

check_deps() {
  echo -e "${YELLOW}[1/6] 检查依赖...${NC}"

  if ! command -v node &> /dev/null; then
    echo -e "${RED}Node.js 未安装，正在安装...${NC}"
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
  fi

  NODE_VER=$(node -v)
  echo -e "  Node.js: ${GREEN}${NODE_VER}${NC}"

  if ! command -v npm &> /dev/null; then
    echo -e "${RED}npm 未找到${NC}"
    exit 1
  fi
  echo -e "  npm: ${GREEN}$(npm -v)${NC}"
}

install_deps() {
  echo -e "${YELLOW}[2/6] 安装项目依赖...${NC}"
  npm ci --production=false
  echo -e "  ${GREEN}依赖安装完成${NC}"
}

build_project() {
  echo -e "${YELLOW}[3/6] 编译TypeScript...${NC}"
  npm run build
  echo -e "  ${GREEN}编译完成${NC}"
}

setup_env() {
  echo -e "${YELLOW}[4/6] 配置环境变量...${NC}"

  if [ ! -f .env ]; then
    cat > .env << 'ENVEOF'
PORT=3000
ZHIPU_API_KEY=fdafdd21075f48498ee4161bf7deae37.OuhQom6Guirxg4q5
ZHIPU_MODEL=glm-4-flash
ENVEOF
    echo -e "  ${GREEN}.env 文件已创建${NC}"
  else
    echo -e "  ${GREEN}.env 文件已存在${NC}"
  fi

  # 加载环境变量
  set -a
  source .env
  set +a
}

setup_systemd() {
  echo -e "${YELLOW}[5/6] 配置系统服务...${NC}"

  WORK_DIR=$(pwd)

  sudo tee /etc/systemd/system/echoworld.service > /dev/null << EOF
[Unit]
Description=EchoWorld AI Agent Commerce World
After=network.target

[Service]
Type=simple
User=$(whoami)
WorkingDirectory=${WORK_DIR}
EnvironmentFile=${WORK_DIR}/.env
ExecStart=$(which node) ${WORK_DIR}/dist/index.js
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

  sudo systemctl daemon-reload
  sudo systemctl enable echoworld
  echo -e "  ${GREEN}Systemd 服务已配置${NC}"
}

start_service() {
  echo -e "${YELLOW}[6/6] 启动服务...${NC}"

  sudo systemctl restart echoworld
  sleep 2

  if systemctl is-active --quiet echoworld; then
    echo -e "  ${GREEN}EchoWorld 启动成功！${NC}"
  else
    echo -e "  ${RED}启动失败，查看日志: journalctl -u echoworld -f${NC}"
    exit 1
  fi
}

setup_nginx() {
  echo -e "${YELLOW}[可选] 配置Nginx反向代理...${NC}"

  if ! command -v nginx &> /dev/null; then
    echo -e "  Nginx 未安装，跳过..."
    return
  fi

  sudo tee /etc/nginx/sites-available/echoworld > /dev/null << 'EOF'
server {
    listen 80;
    server_name _;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }
}
EOF

  sudo ln -sf /etc/nginx/sites-available/echoworld /etc/nginx/sites-enabled/
  sudo nginx -t && sudo systemctl reload nginx
  echo -e "  ${GREEN}Nginx 配置完成${NC}"
}

deploy_docker() {
  echo -e "${YELLOW}Docker 模式部署...${NC}"

  if ! command -v docker &> /dev/null; then
    echo -e "${RED}Docker 未安装${NC}"
    echo "请先安装Docker: curl -fsSL https://get.docker.com | sh"
    exit 1
  fi

  docker build -t echoworld:latest .

  # 停止旧容器
  docker stop echoworld 2>/dev/null || true
  docker rm echoworld 2>/dev/null || true

  # 启动新容器
  docker run -d \
    --name echoworld \
    --restart unless-stopped \
    -p 3000:3000 \
    --env-file .env \
    echoworld:latest

  echo -e "${GREEN}Docker 容器已启动${NC}"
}

# 主流程
case "$DEPLOY_MODE" in
  docker)
    setup_env
    deploy_docker
    ;;
  cloudbase)
    echo -e "${YELLOW}CloudBase 部署模式${NC}"
    npm install -g @cloudbase/cli
    setup_env
    install_deps
    build_project
    tcb login --apiKeyId "${TCB_KEY_ID}" --apiKey "${TCB_KEY_SECRET}"
    tcb framework deploy
    ;;
  *)
    check_deps
    install_deps
    build_project
    setup_env
    setup_systemd
    start_service
    setup_nginx
    ;;
esac

# 获取公网IP
PUBLIC_IP=$(curl -s --max-time 5 http://metadata.tencentcs.com/latest/meta-data/public-ipv4 2>/dev/null || \
            curl -s --max-time 5 http://ifconfig.me 2>/dev/null || \
            echo "localhost")

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  部署完成！${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "  前端面板: ${BLUE}http://${PUBLIC_IP}:3000/${NC}"
echo -e "  API地址:  ${BLUE}http://${PUBLIC_IP}:3000/api/world${NC}"
echo ""
echo -e "  管理命令:"
echo -e "    查看日志:  ${YELLOW}journalctl -u echoworld -f${NC}"
echo -e "    重启服务:  ${YELLOW}sudo systemctl restart echoworld${NC}"
echo -e "    停止服务:  ${YELLOW}sudo systemctl stop echoworld${NC}"
echo ""
