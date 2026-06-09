#!/usr/bin/env bash
# CloudMail Open Links Docker 一键部署/运维脚本
# 参考 bepusdt oneclick 的思路，补齐菜单、状态持久化、更新/重启/日志/卸载能力。
# chmod +x cloudmail-open-receiver.sh && bash cloudmail-open-receiver.sh

set -euo pipefail

if [[ -t 1 ]]; then
  R=$'\033[0;31m'; G=$'\033[0;32m'; Y=$'\033[1;33m'; B=$'\033[0;34m'; NC=$'\033[0m'
else
  R=''; G=''; Y=''; B=''; NC=''
fi

DEFAULT_APP_NAME="cloudmail-open-links"
DEFAULT_PORT="3118"
DEFAULT_HOSTNAME="0.0.0.0"
DEFAULT_GIT_REPO_URL="https://github.com/tztmr/cloudmail_open_links.git"
DEFAULT_INSTALL_DIR="${HOME}/cloudmail-open-links"
STATE_DIR="${HOME}/.cloudmail-open-links"
STATE_FILE="${STATE_DIR}/state.env"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

DRY_RUN=0
ACTION=""
APP_NAME="$DEFAULT_APP_NAME"
PROJECT_ROOT="$SCRIPT_DIR"
ENV_FILE=""
APP_PORT="$DEFAULT_PORT"
APP_HOSTNAME="$DEFAULT_HOSTNAME"
PROJECT_SOURCE="local"
GIT_REPO_URL="$DEFAULT_GIT_REPO_URL"
DOCKER_COMPOSE_CMD=()

info() { printf "${B}[INFO]${NC} %s\n" "$1"; }
ok()   { printf "${G}[OK]${NC} %s\n" "$1"; }
warn() { printf "${Y}[WARN]${NC} %s\n" "$1"; }
die()  { printf "${R}[ERROR]${NC} %s\n" "$1" >&2; exit 1; }

command_exists() { command -v "$1" >/dev/null 2>&1; }

trim() {
  local value="${1:-}"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "$value"
}

ensure_state_dir() {
  mkdir -p "$STATE_DIR"
  chmod 700 "$STATE_DIR" 2>/dev/null || true
}

save_state() {
  ensure_state_dir
  cat > "$STATE_FILE" <<EOF
PROJECT_ROOT='${PROJECT_ROOT}'
ENV_FILE='${ENV_FILE}'
APP_NAME='${APP_NAME}'
APP_PORT='${APP_PORT}'
APP_HOSTNAME='${APP_HOSTNAME}'
PROJECT_SOURCE='${PROJECT_SOURCE}'
GIT_REPO_URL='${GIT_REPO_URL}'
EOF
  chmod 600 "$STATE_FILE" 2>/dev/null || true
}

load_state() {
  [[ -f "$STATE_FILE" ]] || return 1
  set +u
  source "$STATE_FILE"
  set -u
  [[ -n "${PROJECT_ROOT:-}" && -n "${ENV_FILE:-}" && -n "${APP_NAME:-}" ]]
}

prompt_default() {
  local prompt="$1" def="${2:-}" answer=""
  if [[ -n "$def" ]]; then
    printf '%s [%s]: ' "$prompt" "$def" >&2
  else
    printf '%s: ' "$prompt" >&2
  fi
  read -r answer
  answer="$(trim "$answer")"
  [[ -z "$answer" ]] && answer="$def"
  printf '%s' "$answer"
}

ask_yes_no() {
  local prompt="$1" def="${2:-y}" answer="" hint="[Y/n]"
  [[ "$def" == "n" ]] && hint="[y/N]"
  while true; do
    printf '%s %s: ' "$prompt" "$hint" >&2
    read -r answer
    answer="$(trim "$answer")"
    [[ -z "$answer" ]] && answer="$def"
    answer="$(printf '%s' "$answer" | tr '[:upper:]' '[:lower:]')"
    case "$answer" in
      y|yes) return 0 ;;
      n|no) return 1 ;;
      *) warn "请输入 y 或 n" ;;
    esac
  done
}

usage() {
  cat <<'EOF'
用法：
  bash cloudmail-open-receiver.sh [--dry-run] [deploy|status|logs|restart|update|enable-ssl|uninstall|menu]

说明：
  不带命令时：
  - 交互终端下进入菜单
  - 非交互环境下默认执行 deploy

参数：
  --dry-run   仅打印将要执行的步骤，不真正安装/构建/启动
  -h, --help  显示帮助
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
    deploy|status|logs|restart|update|enable-ssl|uninstall|menu)
      [[ -n "$ACTION" ]] && die "一次只能执行一个命令"
      ACTION="$1"
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
  elif [[ -f "$PROJECT_ROOT/.env.example" ]]; then
    ENV_FILE="$PROJECT_ROOT/.env"
    if (( DRY_RUN )); then
      info "[dry-run] cp ${PROJECT_ROOT}/.env.example ${ENV_FILE}"
    else
      cp "$PROJECT_ROOT/.env.example" "$ENV_FILE"
    fi
    ok "已根据 .env.example 自动生成 ${ENV_FILE}，请按需检查配置"
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
  APP_PORT="$DEFAULT_PORT"
  APP_HOSTNAME="$DEFAULT_HOSTNAME"
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
  [[ -d "$PROJECT_ROOT" ]] || die "项目目录不存在：$PROJECT_ROOT"
  [[ -f "$PROJECT_ROOT/docker-compose.yml" ]] || die "项目目录缺少 docker-compose.yml：$PROJECT_ROOT"
}

require_state() {
  load_state || die "未找到部署记录，请先执行 deploy"
  ensure_project_root
  [[ -f "$ENV_FILE" ]] || die "部署记录中的环境文件不存在：$ENV_FILE"
}

clone_or_update_repo() {
  local install_dir="$1"
  GIT_REPO_URL="${GIT_REPO_URL:-$DEFAULT_GIT_REPO_URL}"
  PROJECT_SOURCE="git"
  PROJECT_ROOT="$install_dir"

  if [[ -d "${PROJECT_ROOT}/.git" ]]; then
    info "检测到已有仓库，拉取最新代码..."
    (
      cd "$PROJECT_ROOT"
      run_cmd git pull --ff-only
    )
  else
    info "脚本目录未检测到项目代码，开始拉取 GitHub 仓库..."
    run_cmd git clone "$GIT_REPO_URL" "$PROJECT_ROOT"
  fi
}

pick_compose_cmd() {
  if docker compose version >/dev/null 2>&1; then
    DOCKER_COMPOSE_CMD=(docker compose)
  elif command_exists docker-compose; then
    DOCKER_COMPOSE_CMD=(docker-compose)
  else
    die "未找到 docker compose"
  fi
}

install_docker_if_needed() {
  if command_exists docker; then
    pick_compose_cmd
    return 0
  fi

  command_exists curl || die "缺少 curl，无法自动安装 Docker"

  info "检测到未安装 Docker，开始自动安装..."
  if command_exists apt-get; then
    run_maybe_sudo_shell "curl -fsSL https://get.docker.com | bash"
  elif command_exists dnf; then
    run_maybe_sudo dnf install -y -q dnf-plugins-core
    run_maybe_sudo_shell "dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo"
    run_maybe_sudo dnf install -y -q docker-ce docker-ce-cli containerd.io docker-compose-plugin
  elif command_exists yum; then
    run_maybe_sudo yum install -y -q yum-utils
    run_maybe_sudo_shell "yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo"
    run_maybe_sudo yum install -y -q docker-ce docker-ce-cli containerd.io docker-compose-plugin
  else
    die "缺少 apt-get/dnf/yum，请手动安装 Docker"
  fi

  run_maybe_sudo systemctl enable docker 2>/dev/null || true
  run_maybe_sudo systemctl start docker 2>/dev/null || true
  pick_compose_cmd
}

detect_public_port() {
  local detected_port
  detected_port="$(
    sed -nE 's/^[[:space:]]*-[[:space:]]*"?(127\.0\.0\.1:)?([0-9]+):[0-9]+"?[[:space:]]*$/\2/p' \
      "$PROJECT_ROOT/docker-compose.yml" | head -n 1
  )"
  if [[ -n "$detected_port" ]]; then
    APP_PORT="$detected_port"
  else
    APP_PORT="$DEFAULT_PORT"
  fi
}

allow_firewall_port() {
  local port="$1"
  if command_exists ufw; then
    if ufw status 2>/dev/null | grep -q "Status: active"; then
      run_maybe_sudo ufw allow "${port}/tcp"
    fi
  fi
  if command_exists firewall-cmd && firewall-cmd --state >/dev/null 2>&1; then
    run_maybe_sudo firewall-cmd --permanent --add-port="${port}/tcp"
    run_maybe_sudo firewall-cmd --reload
  fi
}

nginx_conf_dir() {
  if [[ -n "${NGINX_CONF_DIR:-}" ]]; then
    printf '%s' "$NGINX_CONF_DIR"
  elif [[ -d /etc/nginx/conf.d ]]; then
    printf '/etc/nginx/conf.d'
  else
    printf '/etc/nginx/sites-available'
  fi
}

install_nginx_if_needed() {
  if command_exists nginx; then
    return 0
  fi
  info "未检测到 nginx，开始自动安装..."
  if command_exists apt-get; then
    run_maybe_sudo apt-get update -y -qq
    run_maybe_sudo apt-get install -y -qq nginx
  elif command_exists dnf; then
    run_maybe_sudo dnf install -y -q nginx
  elif command_exists yum; then
    run_maybe_sudo yum install -y -q nginx
  else
    die "缺少 apt-get/dnf/yum，请手动安装 nginx"
  fi
}

install_certbot_if_needed() {
  if command_exists certbot; then
    return 0
  fi
  info "未检测到 certbot，开始自动安装..."
  if command_exists apt-get; then
    run_maybe_sudo apt-get update -y -qq
    run_maybe_sudo apt-get install -y -qq certbot python3-certbot-nginx
  elif command_exists dnf; then
    run_maybe_sudo dnf install -y -q certbot python3-certbot-nginx || run_maybe_sudo dnf install -y -q certbot-nginx
  elif command_exists yum; then
    run_maybe_sudo yum install -y -q certbot python3-certbot-nginx || run_maybe_sudo yum install -y -q certbot-nginx
  else
    die "缺少 apt-get/dnf/yum，请手动安装 certbot"
  fi
}

setup_nginx_proxy_http() {
  local domain="$1" upstream_port="$2"
  local conf_dir conf_file
  conf_dir="$(nginx_conf_dir)"
  conf_file="${conf_dir}/${domain}.conf"
  run_maybe_sudo mkdir -p "$conf_dir"
  run_maybe_sudo_shell "cat > '${conf_file}' <<EOF
server {
    listen 80;
    server_name ${domain};

    location / {
        proxy_pass http://127.0.0.1:${upstream_port};
        proxy_http_version 1.1;
        proxy_set_header Host \\\$host;
        proxy_set_header X-Real-IP \\\$remote_addr;
        proxy_set_header X-Forwarded-For \\\$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \\\$scheme;
        proxy_read_timeout 120s;
    }
}
EOF"
  if [[ -d /etc/nginx/sites-enabled && "$conf_dir" == "/etc/nginx/sites-available" ]]; then
    run_maybe_sudo ln -sf "${conf_file}" "/etc/nginx/sites-enabled/${domain}.conf"
  fi
  run_maybe_sudo nginx -t
  run_maybe_sudo systemctl reload nginx 2>/dev/null || run_maybe_sudo nginx -s reload
}

prepare_runtime() {
  if [[ -f "$SCRIPT_DIR/docker-compose.yml" ]]; then
    PROJECT_ROOT="$SCRIPT_DIR"
    PROJECT_SOURCE="local"
  else
    clone_or_update_repo "$DEFAULT_INSTALL_DIR"
  fi
  ensure_project_root
  detect_env_file
  detect_public_port
  install_docker_if_needed
}

compose_up() {
  info "使用环境文件：$ENV_FILE"
  info "应用将通过 Docker 暴露端口：${APP_PORT}"
  (
    cd "$PROJECT_ROOT"
    run_cmd "${DOCKER_COMPOSE_CMD[@]}" up -d --build
  )
}

compose_ps() {
  (
    cd "$PROJECT_ROOT"
    run_cmd "${DOCKER_COMPOSE_CMD[@]}" ps
  )
}

compose_logs() {
  (
    cd "$PROJECT_ROOT"
    run_cmd "${DOCKER_COMPOSE_CMD[@]}" logs -f --tail 100 app
  )
}

compose_restart() {
  (
    cd "$PROJECT_ROOT"
    run_cmd "${DOCKER_COMPOSE_CMD[@]}" restart app
  )
}

compose_down() {
  (
    cd "$PROJECT_ROOT"
    run_cmd "${DOCKER_COMPOSE_CMD[@]}" down
  )
}

print_access_summary() {
  local server_ip
  server_ip="$(curl -s --connect-timeout 5 ifconfig.me 2>/dev/null || true)"
  [[ -z "$server_ip" ]] && server_ip="你的IP"

  echo
  ok "Docker 服务已启动。对外端口 ${APP_PORT}"
  echo
  echo "下一步建议："
  echo "  1. 确认环境文件：$ENV_FILE"
  echo "  2. 用 nginx + certbot 暴露 HTTPS"
  echo "  3. 登录 /admin 导入 provider 并确认后台 5 秒轮询开关已开启"
  echo
  echo "访问： http://${server_ip}:${APP_PORT}/admin  （首次导入邮箱并生成链接）"
}

deploy() {
  prepare_runtime
  compose_up
  allow_firewall_port "$APP_PORT"
  save_state
  print_access_summary
}

status_app() {
  require_state
  detect_public_port
  pick_compose_cmd
  info "当前部署：$APP_NAME"
  info "项目目录：$PROJECT_ROOT"
  info "环境文件：$ENV_FILE"
  info "对外端口：${APP_PORT}"
  compose_ps
}

logs_app() {
  require_state
  pick_compose_cmd
  info "查看容器日志：app"
  compose_logs
}

restart_app() {
  require_state
  pick_compose_cmd
  compose_restart
  save_state
  ok "服务已重启"
}

update_app() {
  require_state
  if [[ "${PROJECT_SOURCE:-local}" == "git" ]]; then
    [[ -d "${PROJECT_ROOT}/.git" || -d "$PROJECT_ROOT" ]] || die "部署记录中的仓库目录不存在：$PROJECT_ROOT"
    GIT_REPO_URL="${GIT_REPO_URL:-$DEFAULT_GIT_REPO_URL}"
    info "拉取 GitHub 最新代码..."
    (
      cd "$PROJECT_ROOT"
      run_cmd git pull --ff-only
    )
  fi
  detect_public_port
  pick_compose_cmd
  compose_up
  allow_firewall_port "$APP_PORT"
  save_state
  ok "应用更新完成"
}

enable_ssl() {
  local domain acme_email
  require_state
  detect_public_port
  install_nginx_if_needed
  install_certbot_if_needed
  domain="$(prompt_default "绑定域名（如 mail.example.com）" "")"
  [[ -n "$domain" ]] || die "域名不能为空"
  acme_email="$(prompt_default "证书邮箱" "admin@${domain}")"
  setup_nginx_proxy_http "$domain" "$APP_PORT"
  allow_firewall_port 80
  allow_firewall_port 443
  run_maybe_sudo certbot --nginx -d "$domain" --redirect -m "$acme_email" --agree-tos --non-interactive
  ok "HTTPS 已启用"
  echo "HTTPS 地址: https://${domain}"
}

uninstall_app() {
  require_state
  pick_compose_cmd
  warn "将停止并删除 Docker 容器，但不会删除项目目录 ${PROJECT_ROOT}"
  if [[ ! -t 0 ]] || ask_yes_no "确认继续卸载" "n"; then
    compose_down
    if (( DRY_RUN )); then
      info "[dry-run] rm -f $STATE_FILE"
    else
      rm -f "$STATE_FILE"
    fi
    ok "卸载完成"
  fi
}

print_menu() {
  echo
  echo "========= CloudMail Open Links 一键脚本 ========="
  echo "1) 一键部署"
  echo "2) 查看状态"
  echo "3) 查看日志"
  echo "4) 重启服务"
  echo "5) 更新应用"
  echo "6) 启用 HTTPS"
  echo "7) 卸载"
  echo "0) 退出"
  echo "================================================"
}

menu_loop() {
  local choice
  while true; do
    print_menu
    printf '请选择 [0-7]: ' >&2
    read -r choice
    choice="$(trim "$choice")"
    case "$choice" in
      1) deploy ;;
      2) status_app ;;
      3) logs_app ;;
      4) restart_app ;;
      5) update_app ;;
      6) enable_ssl ;;
      7) uninstall_app ;;
      0) exit 0 ;;
      *) warn "无效选项" ;;
    esac
  done
}

main() {
  case "${ACTION:-}" in
    deploy) deploy ;;
    status) status_app ;;
    logs) logs_app ;;
    restart) restart_app ;;
    update) update_app ;;
    enable-ssl) enable_ssl ;;
    uninstall) uninstall_app ;;
    menu) menu_loop ;;
    "")
      if [[ -t 0 ]]; then
        menu_loop
      else
        deploy
      fi
      ;;
  esac
}

main "$@"
