#!/usr/bin/env bash
# CloudMail Open Links 一键部署参考脚本（简化版，基于原 dx888_cloudmail 的 oneclick 思路）
# 用途：快速在 Linux 服务器上用 PM2 跑 Next.js + 后台 API 自动同步
#
# 使用：
#   chmod +x cloudmail-open-receiver.sh
#   bash cloudmail-open-receiver.sh
#   bash cloudmail-open-receiver.sh --dry-run
#
# 它会：
#   - 安装 Node 22 + PM2（如需要）
#   - npm ci + build
#   - 启动 web 服务 (pm2)
#
# 准备工作：
#   - 上传整个目录到服务器
#   - 先在本地或服务器上 cp .env.example .env.production.local 并填好
#   - 推荐先用 nginx 反代应用端口 + HTTPS（参考原 SERVER_DEPLOY.md）

set -euo pipefail

APP_NAME="cloudmail-open-links"
DEFAULT_PORT="3118"
DEFAULT_HOSTNAME="0.0.0.0"
DRY_RUN=0
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR"
ENV_FILE=""
APP_PORT="$DEFAULT_PORT"
APP_HOSTNAME="$DEFAULT_HOSTNAME"

info() { printf "\033[0;34m[INFO]\033[0m %s\n" "$1"; }
ok()   { printf "\033[0;32m[OK]\033[0m %s\n" "$1"; }
warn() { printf "\033[1;33m[WARN]\033[0m %s\n" "$1"; }
die()  { printf "\033[0;31m[ERROR]\033[0m %s\n" "$1" >&2; exit 1; }

command_exists() { command -v "$1" >/dev/null 2>&1; }

usage() {
  cat <<'EOF'
用法：
  bash cloudmail-open-receiver.sh [--dry-run]

参数：
  --dry-run   仅打印将要执行的步骤，不真正安装/构建/启动
EOF
}

while (( $# > 0 )); do
  case "$1" in
    --dry-run)
      DRY_RUN=1
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "未知参数：$1"
      ;;
  esac
  shift
done

run_cmd() {
  if (( DRY_RUN )); then
    info "[dry-run] $*"
    return 0
  fi
  "$@"
}

run_shell_cmd() {
  if (( DRY_RUN )); then
    info "[dry-run] $1"
    return 0
  fi
  bash -lc "$1"
}

run_maybe_sudo_shell() {
  local command="$1"
  if (( EUID == 0 )); then
    run_shell_cmd "$command"
  elif command_exists sudo; then
    if (( DRY_RUN )); then
      info "[dry-run] sudo bash -lc $command"
      return 0
    fi
    sudo bash -lc "$command"
  else
    die "需要 root 或 sudo 权限来安装系统依赖"
  fi
}

run_maybe_sudo() {
  if (( EUID == 0 )); then
    run_cmd "$@"
  elif command_exists sudo; then
    if (( DRY_RUN )); then
      info "[dry-run] sudo $*"
      return 0
    fi
    sudo "$@"
  else
    die "需要 root 或 sudo 权限来安装系统依赖"
  fi
}

detect_env_file() {
  if [[ -f "$PROJECT_ROOT/.env.production.local" ]]; then
    ENV_FILE="$PROJECT_ROOT/.env.production.local"
  elif [[ -f "$PROJECT_ROOT/.env" ]]; then
    ENV_FILE="$PROJECT_ROOT/.env"
  else
    die "未找到 .env.production.local 或 .env，请先复制 .env.example 并完成配置"
  fi
}

read_env_value() {
  local key="$1"
  local value
  value="$(
    sed -nE "s/^[[:space:]]*${key}[[:space:]]*=[[:space:]]*(.*)[[:space:]]*$/\1/p" "$ENV_FILE" | tail -n 1
  )"
  value="${value%\"}"
  value="${value#\"}"
  value="${value%\'}"
  value="${value#\'}"
  printf '%s' "$value"
}

load_runtime_env() {
  local env_port env_hostname
  env_port="$(read_env_value PORT || true)"
  env_hostname="$(read_env_value HOSTNAME || true)"

  if [[ -n "$env_port" ]]; then
    APP_PORT="$env_port"
  fi
  if [[ -n "$env_hostname" ]]; then
    APP_HOSTNAME="$env_hostname"
  fi
}

ensure_project_root() {
  if [[ ! -f "$PROJECT_ROOT/package.json" ]]; then
    die "脚本目录缺少 package.json：$PROJECT_ROOT"
  fi
  cd "$PROJECT_ROOT"
}

ensure_node() {
  if command_exists node; then
    local major
    major="$(node -p 'process.versions.node.split(".")[0]')" || true
    if [[ "$major" =~ ^[0-9]+$ ]] && (( major >= 20 )); then
      ok "Node $(node -v)"
      return
    fi
  fi

  command_exists curl || die "缺少 curl，无法自动安装 Node.js"
  command_exists apt-get || die "缺少 apt-get，请手动安装 Node.js 20+"

  info "安装 Node.js 22 LTS..."
  run_maybe_sudo_shell "curl -fsSL https://deb.nodesource.com/setup_22.x | bash -"
  run_maybe_sudo apt-get install -y -qq nodejs
}

ensure_pm2() {
  if command_exists pm2; then
    ok "PM2 已安装"
    return
  fi
  info "安装 PM2..."
  run_cmd npm install -g pm2
}

ensure_project_root
detect_env_file
load_runtime_env
ensure_node
ensure_pm2

info "使用环境文件：$ENV_FILE"
info "应用将监听 ${APP_HOSTNAME}:${APP_PORT}"
info "安装依赖并构建..."
run_cmd npm ci
run_cmd npm run build

info "启动 Web 服务 (PM2)..."
if (( DRY_RUN )); then
  info "[dry-run] pm2 delete $APP_NAME"
else
  pm2 delete "$APP_NAME" 2>/dev/null || true
fi
run_cmd env PORT="$APP_PORT" HOSTNAME="$APP_HOSTNAME" pm2 start npm --name "$APP_NAME" --cwd "$PROJECT_ROOT" -- start
if (( DRY_RUN )); then
  info "[dry-run] pm2 save"
else
  pm2 save >/dev/null 2>&1 || true
fi

ok "Web 已启动。端口 ${APP_PORT}，主机 ${APP_HOSTNAME}"

echo
echo "下一步建议："
echo "  1. 确认环境文件：$ENV_FILE"
echo "  2. 用 nginx + certbot 暴露 HTTPS（参考原 dx888_cloudmail/SERVER_DEPLOY.md）"
echo "  3. 登录 /admin 导入 provider 并确认后台 5 秒轮询开关已开启"
echo
echo "访问： http://你的IP:${APP_PORT}/admin  （首次导入邮箱并生成链接）"
