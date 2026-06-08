#!/usr/bin/env bash
# CloudMail Open Links 一键部署参考脚本（简化版，基于原 dx888_cloudmail 的 oneclick 思路）
# 用途：快速在 Linux 服务器上用 PM2 跑 Next.js + 后台 API 自动同步
#
# 使用：
#   chmod +x cloudmail-open-receiver.sh
#   bash cloudmail-open-receiver.sh
#
# 它会：
#   - 安装 Node 22 + PM2（如需要）
#   - npm ci + build
#   - 启动 web 服务 (pm2)
#
# 准备工作：
#   - 上传整个目录到服务器
#   - 先在本地或服务器上 cp .env.example .env.production.local 并填好
#   - 推荐先用 nginx 反代 3000 端口 + HTTPS（参考原 SERVER_DEPLOY.md）

set -euo pipefail

APP_NAME="cloudmail-open-links"
DEFAULT_PORT="3000"
INSTALL_DIR="$(pwd)"

info() { printf "\033[0;34m[INFO]\033[0m %s\n" "$1"; }
ok()   { printf "\033[0;32m[OK]\033[0m %s\n" "$1"; }
warn() { printf "\033[1;33m[WARN]\033[0m %s\n" "$1"; }

command_exists() { command -v "$1" >/dev/null 2>&1; }

ensure_node() {
  if command_exists node; then
    local major
    major="$(node -p 'process.versions.node.split(".")[0]')" || true
    if (( major >= 20 )); then
      ok "Node $(node -v)"
      return
    fi
  fi
  info "安装 Node.js 22 LTS..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -qq nodejs || true
}

ensure_pm2() {
  if command_exists pm2; then return; fi
  info "安装 PM2..."
  npm install -g pm2
}

if [[ ! -f package.json ]]; then
  echo "请在项目根目录运行此脚本"
  exit 1
fi

ensure_node
ensure_pm2

info "安装依赖并构建..."
npm ci
npm run build

info "启动 Web 服务 (PM2)..."
pm2 delete "$APP_NAME" 2>/dev/null || true
pm2 start npm --name "$APP_NAME" -- start
pm2 save >/dev/null 2>&1 || true

ok "Web 已启动。端口默认 3000，可在 .env 里配 PORT"

echo
echo "下一步建议："
echo "  1. 配置 .env.production.local (Mongo / ADMIN_PASSWORD / provider token)"
echo "  2. 用 nginx + certbot 暴露 HTTPS（参考原 dx888_cloudmail/SERVER_DEPLOY.md）"
echo "  3. 登录 /admin 导入 provider 并确认后台 5 秒轮询开关已开启"
echo
echo "访问： http://你的IP:3000/admin  （首次导入邮箱并生成链接）"
