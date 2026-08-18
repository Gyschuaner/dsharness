#!/bin/bash

set -u

PORT=3080
HOST_ADDR="127.0.0.1"
NO_LAUNCH=0
WAIT_SECONDS=60

usage() {
	cat <<'EOF'
restart-dsh-web.command — macOS 一键重启 dsh web

用法：
  ./restart-dsh-web.command
  ./restart-dsh-web.command --no-launch
  ./restart-dsh-web.command --port 3080 --host 127.0.0.1

选项：
  --port PORT       监听端口，默认 3080
  --host ADDRESS    监听地址，默认 127.0.0.1
  --no-launch       只停止现有服务，不重新启动
  -h, --help        显示帮助

也可以在 Finder 中双击本文件运行。

默认启动相邻的 deepseek-harness 源码构建。需要覆盖位置时可设置：
  DSH_SOURCE_DIR   deepseek-harness 源码目录
  DSH_SOURCE_NODE  用于运行源码构建的 Node.js 可执行文件
EOF
}

step() {
	printf '\033[36m[restart] %s\033[0m\n' "$1"
}

fail() {
	printf '\033[31m[restart] %s\033[0m\n' "$1" >&2
	exit 1
}

while [ "$#" -gt 0 ]; do
	case "$1" in
		--port)
			[ "$#" -ge 2 ] || fail "--port 缺少端口值"
			PORT="$2"
			shift 2
			;;
		--host)
			[ "$#" -ge 2 ] || fail "--host 缺少地址"
			HOST_ADDR="$2"
			shift 2
			;;
		--no-launch)
			NO_LAUNCH=1
			shift
			;;
		-h|--help)
			usage
			exit 0
			;;
		*)
			fail "未知参数：$1"
			;;
	esac
done

case "$PORT" in
	''|*[!0-9]*) fail "端口必须是 1 到 65535 的整数" ;;
esac
[ "$PORT" -ge 1 ] && [ "$PORT" -le 65535 ] || fail "端口必须是 1 到 65535 的整数"

export PATH="$HOME/.local/node/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"

command -v lsof >/dev/null 2>&1 || fail "找不到 lsof"
command -v curl >/dev/null 2>&1 || fail "找不到 curl"

# 先确认新版源码构建可用，再停止当前服务。这样源码未构建或 Node
# 工具链缺失时，不会把仍可使用的 3080 一并关掉，也不会静默回退到
# ~/.npm/_npx 中可能已经过期的 DSH。
if [ "$NO_LAUNCH" -eq 0 ]; then
	SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"
	SOURCE_DIR="${DSH_SOURCE_DIR:-$(cd "$SCRIPT_DIR/.." && pwd -P)/deepseek-harness}"
	SOURCE_NODE="${DSH_SOURCE_NODE:-$HOME/.cache/dsharness/toolchains/node-v24.11.1-darwin-arm64/bin/node}"
	SOURCE_CLI="$SOURCE_DIR/apps/cli/lib/bin.js"
	SOURCE_PACKAGE="$SOURCE_DIR/apps/cli/package.json"

	[ -x "$SOURCE_NODE" ] || fail "找不到源码构建所需的 Node.js：$SOURCE_NODE"
	[ -f "$SOURCE_CLI" ] || fail "找不到 DSH 源码构建产物：$SOURCE_CLI；请先构建 deepseek-harness"
	[ -f "$SOURCE_PACKAGE" ] || fail "找不到 DSH CLI package.json：$SOURCE_PACKAGE"

	EXPECTED_VERSION="$(sed -n 's/^[[:space:]]*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$SOURCE_PACKAGE" | head -n 1)"
	SOURCE_VERSION="$("$SOURCE_NODE" "$SOURCE_CLI" --version 2>/dev/null || true)"
	[ -n "$EXPECTED_VERSION" ] || fail "无法从 $SOURCE_PACKAGE 读取源码版本"
	[ "$SOURCE_VERSION" = "$EXPECTED_VERSION" ] || fail "源码构建版本不一致：package.json=$EXPECTED_VERSION，构建产物=$SOURCE_VERSION；请重新构建"

	LAUNCHER=("$SOURCE_NODE" "$SOURCE_CLI")
	LAUNCHER_NAME="DSH 源码构建版 $SOURCE_VERSION"
fi

listener_pids() {
	lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true
}

PIDS="$(listener_pids)"
if [ -z "$PIDS" ]; then
	step "端口 $PORT 没有现有 dsh web 进程，直接启动"
else
	step "停止端口 $PORT 的监听进程：$(printf '%s' "$PIDS" | tr '\n' ' ')"
	for pid in $PIDS; do
		if kill "$pid" 2>/dev/null; then
			printf '  已发送停止信号给 PID %s\n' "$pid"
		else
			printf '  PID %s 可能已经退出\n' "$pid"
		fi
	done

	DEADLINE=$((SECONDS + 10))
	while [ "$SECONDS" -lt "$DEADLINE" ]; do
		[ -z "$(listener_pids)" ] && break
		sleep 0.3
	done
	[ -z "$(listener_pids)" ] || fail "端口 $PORT 在 10 秒后仍被占用，请手动检查"
	step "端口 $PORT 已释放"
fi

if [ "$NO_LAUNCH" -eq 1 ]; then
	step "已停止服务；按要求跳过重新启动"
	exit 0
fi

LOG_DIR="$HOME/Library/Logs/dsharness"
LOG_FILE="$LOG_DIR/dsh-web-$PORT.log"
mkdir -p "$LOG_DIR"
: >"$LOG_FILE"

verify_after_launch() {
	step "等待 http://$HOST_ADDR:$PORT 恢复（最多 ${WAIT_SECONDS} 秒）"
	local deadline=$((SECONDS + WAIT_SECONDS))
	local up=0
	while [ "$SECONDS" -lt "$deadline" ]; do
		if curl -fsS --max-time 3 "http://$HOST_ADDR:$PORT/" >/dev/null 2>&1; then
			up=1
			break
		fi
		sleep 0.5
	done

	if [ "$up" -ne 1 ]; then
		printf '\033[31m[restart] 等待服务超时，请检查上方启动日志或 %s\033[0m\n' "$LOG_FILE" >&2
		return
	fi
	step "服务已起来"

	local api_response
	local api_version
	api_response="$(curl -fsS --max-time 5 \
		-X POST \
		-H 'Content-Type: application/json; charset=utf-8' \
		--data '{"op":"list"}' \
		"http://$HOST_ADDR:$PORT/api/skill-manager" 2>/dev/null || true)"
	api_version="$(printf '%s' "$api_response" | sed -n 's/.*"apiVersion"[[:space:]]*:[[:space:]]*\([0-9][0-9]*\).*/\1/p')"

	if [ -n "$api_version" ] && [ "$api_version" -ge 5 ]; then
		printf '\033[32mskill-manager host：apiVersion %s ✓\033[0m\n' "$api_version"
	elif [ -n "$api_version" ]; then
		printf '\033[33mskill-manager host：apiVersion %s，可能尚未加载新版插件\033[0m\n' "$api_version"
	else
		printf '\033[33mskill-manager API 验证失败，但 dsh web 本身已经启动\033[0m\n'
	fi
	step "重启完成：http://${HOST_ADDR}:${PORT}（按 Ctrl+C 停止）"
}

step "通过 $LAUNCHER_NAME 启动 dsh web；日志同时保存到 $LOG_FILE"
verify_after_launch &
VERIFY_PID=$!

"${LAUNCHER[@]}" web --host "$HOST_ADDR" --port "$PORT" 2>&1 | tee -a "$LOG_FILE"
LAUNCH_STATUS=${PIPESTATUS[0]}

kill "$VERIFY_PID" 2>/dev/null || true
wait "$VERIFY_PID" 2>/dev/null || true

if [ "$LAUNCH_STATUS" -ne 0 ]; then
	fail "dsh web 已退出，状态码 ${LAUNCH_STATUS}；请查看 $LOG_FILE"
fi
step "dsh web 已停止"
