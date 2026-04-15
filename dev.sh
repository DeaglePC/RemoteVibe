#!/usr/bin/env bash
#
# dev.sh - 一键启动 RemoteVibe 前端 + 后端开发服务器
#
# 用法:
#   ./dev.sh          启动前端和后端
#   ./dev.sh server   仅启动后端
#   ./dev.sh web      仅启动前端
#

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVER_DIR="$ROOT_DIR/server"
WEB_DIR="$ROOT_DIR/web"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'
BOLD='\033[1m'

# 子进程 PID
SERVER_PID=""
WEB_PID=""

# 优雅终止单个进程：先 SIGTERM，等待 2 秒，如果还活着再 SIGKILL
graceful_kill() {
  local pid="$1"
  if [ -z "$pid" ] || ! kill -0 "$pid" 2>/dev/null; then
    return
  fi
  kill "$pid" 2>/dev/null || true
  # 等待最多 2 秒
  local i=0
  while [ $i -lt 20 ] && kill -0 "$pid" 2>/dev/null; do
    sleep 0.1
    i=$((i + 1))
  done
  # 如果还活着，强制杀掉
  if kill -0 "$pid" 2>/dev/null; then
    kill -9 "$pid" 2>/dev/null || true
  fi
}

# 清理函数：退出时只终止本脚本启动的子进程
cleanup() {
  echo ""
  echo -e "${YELLOW}🛑 正在关闭所有服务...${NC}"
  graceful_kill "$SERVER_PID"
  graceful_kill "$WEB_PID"
  wait 2>/dev/null || true
  echo -e "${GREEN}✅ 所有服务已关闭${NC}"
  exit 0
}

trap cleanup SIGINT SIGTERM EXIT

# 清理占用端口的旧进程（仅针对 LISTEN 状态，避免误杀其他应用）
kill_port() {
  local port="$1"
  local name="$2"
  local pids
  # 只查找 LISTEN 状态的进程（即真正占用端口的服务端进程）
  pids=$(lsof -ti :"$port" -sTCP:LISTEN 2>/dev/null || true)
  if [ -z "$pids" ]; then
    return
  fi
  # 显示将要终止的进程信息，帮助确认
  echo -e "${YELLOW}⚠️  端口 ${port} (${name}) 已被占用:${NC}"
  for pid in $pids; do
    local cmd
    cmd=$(ps -p "$pid" -o comm= 2>/dev/null || echo "unknown")
    echo -e "${YELLOW}   PID ${pid} (${cmd})${NC}"
  done
  # 先 SIGTERM 优雅退出
  echo "$pids" | xargs kill 2>/dev/null || true
  sleep 1
  # 检查是否还有残留，强制杀掉
  local remaining
  remaining=$(lsof -ti :"$port" -sTCP:LISTEN 2>/dev/null || true)
  if [ -n "$remaining" ]; then
    echo "$remaining" | xargs kill -9 2>/dev/null || true
    sleep 0.5
  fi
  echo -e "${GREEN}✅ 旧进程已清理${NC}"
}

# 检查依赖
check_deps() {
  local missing=0

  if ! command -v go &>/dev/null; then
    echo -e "${RED}❌ 未找到 go 命令，请先安装 Go${NC}"
    missing=1
  fi

  if ! command -v node &>/dev/null; then
    echo -e "${RED}❌ 未找到 node 命令，请先安装 Node.js${NC}"
    missing=1
  fi

  if ! command -v npm &>/dev/null; then
    echo -e "${RED}❌ 未找到 npm 命令，请先安装 npm${NC}"
    missing=1
  fi

  if [ "$missing" -eq 1 ]; then
    exit 1
  fi
}

# 启动后端
start_server() {
  echo -e "${CYAN}🚀 启动后端服务 (Go)...${NC}"

  # 清理占用后端端口的旧进程
  kill_port 3710 "后端"

  # 如果没有 config.yaml，自动从 example 复制
  if [ ! -f "$SERVER_DIR/config.yaml" ]; then
    echo -e "${YELLOW}⚠️  未找到 config.yaml，从 config.example.yaml 复制...${NC}"
    cp "$SERVER_DIR/config.example.yaml" "$SERVER_DIR/config.yaml"
  fi

  (
    cd "$SERVER_DIR"
    exec go run main.go 2>&1 | while IFS= read -r line; do
      echo -e "${GREEN}${BOLD}[SERVER]${NC} ${line}"
    done
  ) &
  SERVER_PID=$!
  echo -e "${GREEN}✅ 后端服务已启动 (PID: ${SERVER_PID})${NC}"
}

# 启动前端
start_web() {
  echo -e "${BLUE}🚀 启动前端服务 (Vite)...${NC}"

  # 清理占用前端端口的旧进程
  kill_port 5173 "前端"

  # 检查 node_modules 是否存在
  if [ ! -d "$WEB_DIR/node_modules" ]; then
    echo -e "${YELLOW}📦 首次运行，正在安装前端依赖...${NC}"
    (cd "$WEB_DIR" && npm install 2>&1 | while IFS= read -r line; do
      echo -e "${YELLOW}${BOLD}[NPM]${NC} ${line}"
    done)
    if [ ! -d "$WEB_DIR/node_modules" ]; then
      echo -e "${RED}❌ 前端依赖安装失败，请手动运行: cd web && npm install${NC}"
      return 1
    fi
  fi

  (
    cd "$WEB_DIR"
    exec npx vite --host 2>&1 | while IFS= read -r line; do
      echo -e "${BLUE}${BOLD}[WEB]${NC} ${line}"
    done
  ) &
  WEB_PID=$!
  echo -e "${BLUE}✅ 前端服务已启动 (PID: ${WEB_PID})${NC}"
}

# 打印 Banner
print_banner() {
  echo ""
  echo -e "${BOLD}${CYAN}╔══════════════════════════════════════════╗${NC}"
  echo -e "${BOLD}${CYAN}║       RemoteVibe Dev Environment         ║${NC}"
  echo -e "${BOLD}${CYAN}╚══════════════════════════════════════════╝${NC}"
  echo ""
}

# 打印启动信息
print_info() {
  echo ""
  echo -e "${BOLD}────────────────────────────────────────────${NC}"
  echo -e "  ${GREEN}后端${NC}  → http://localhost:3710"
  echo -e "  ${BLUE}前端${NC}  → http://localhost:5173"
  echo -e "  ${YELLOW}WS${NC}    → ws://localhost:5173/ws (代理到后端)"
  echo -e "${BOLD}────────────────────────────────────────────${NC}"
  echo -e "  按 ${RED}Ctrl+C${NC} 停止所有服务"
  echo ""
}

# 主逻辑
main() {
  print_banner

  local mode="${1:-all}"

  case "$mode" in
    server)
      check_deps
      start_server
      echo ""
      echo -e "  ${GREEN}后端${NC} → http://localhost:3710"
      echo -e "  按 ${RED}Ctrl+C${NC} 停止服务"
      ;;
    web)
      check_deps
      start_web
      echo ""
      echo -e "  ${BLUE}前端${NC} → http://localhost:5173"
      echo -e "  按 ${RED}Ctrl+C${NC} 停止服务"
      ;;
    all)
      check_deps
      start_server
      sleep 1
      start_web
      print_info
      ;;
    *)
      echo "用法: $0 [server|web|all]"
      echo ""
      echo "  all     启动前端和后端（默认）"
      echo "  server  仅启动后端"
      echo "  web     仅启动前端"
      exit 1
      ;;
  esac

  # 等待所有子进程，任一退出则全部退出
  wait
}

main "$@"
