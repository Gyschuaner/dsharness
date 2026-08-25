#!/bin/bash

set -u

PORT=3080
HOST_ADDR="127.0.0.1"
NO_LAUNCH=0
WAIT_SECONDS=60
MIN_SKILL_MANAGER_API_VERSION=6
MIN_PLUGIN_MANAGER_API_VERSION=1
MIN_MCP_MANAGER_API_VERSION=1
SERVER_PID=""

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

默认在相邻的 deepseek-harness-main-build、deepseek-harness 中选择与
upstream.lock.json 一致的源码构建。需要显式覆盖位置时可设置：
  DSH_SOURCE_DIR   与 upstream.lock.json 一致的 deepseek-harness 源码目录
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

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"

stop_started_server() {
	if [ -n "${SERVER_PID:-}" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
		kill "$SERVER_PID" 2>/dev/null || true
		wait "$SERVER_PID" 2>/dev/null || true
	fi
	SERVER_PID=""
}

cleanup_started_server() {
	stop_started_server
}

trap cleanup_started_server EXIT
trap 'exit 130' INT TERM

read_lock_value() {
	local key="$1"
	local lock_file="$2"
	sed -n "s/^[[:space:]]*\"$key\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p" "$lock_file" | head -n 1
}

source_matches_lock() {
	local source_dir="$1"
	local source_package="$source_dir/apps/cli/package.json"
	local source_version
	local source_tree

	[ -f "$source_package" ] || return 1
	source_version="$(sed -n 's/^[[:space:]]*\"version\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p' "$source_package" | head -n 1)"
	source_tree="$(git -C "$source_dir" rev-parse --verify HEAD^{tree} 2>/dev/null || true)"
	[ "$source_version" = "$EXPECTED_VERSION" ] && [ "$source_tree" = "$EXPECTED_TREE" ]
}

verify_composed_profile() {
	local config
	local missing=""
	local plugin_name
	local expected_plugins=(
		dsh-better-sidebar
		dsh-better-sidebar-smooth
		dsh-extension-manager
		dsh-skill-manager
		dsh-mcp-manager
		dsh-plugin-manager
		@deepseek-ai/dsh-vision-bridge
	)

	config="$("$SOURCE_NODE" "$SOURCE_CLI" --profile web --dump-config 2>&1)" || {
		fail "无法解析 web profile 组合树：$config"
	}
	for plugin_name in "${expected_plugins[@]}"; do
		case "$config" in
			*"$plugin_name"*) ;;
			*) missing="$missing $plugin_name" ;;
		esac
	done
	[ -z "$missing" ] || fail "web profile 组合树缺少插件：$missing"
	step "web profile 组合树校验通过（${#expected_plugins[@]} 个插件）"
}

# 先确认新版源码构建可用，再停止当前服务。这样源码未构建或 Node
# 工具链缺失时，不会把仍可使用的 3080 一并关掉，也不会静默回退到
# ~/.npm/_npx 中可能已经过期的 DSH。
if [ "$NO_LAUNCH" -eq 0 ]; then
	LOCK_FILE="$SCRIPT_DIR/upstream.lock.json"
	[ -f "$LOCK_FILE" ] || fail "找不到版本锁文件：$LOCK_FILE"
	EXPECTED_VERSION="$(read_lock_value dshVersion "$LOCK_FILE")"
	EXPECTED_TREE="$(read_lock_value resultTree "$LOCK_FILE")"
	[ -n "$EXPECTED_VERSION" ] || fail "无法从 $LOCK_FILE 读取 dshVersion"
	[ -n "$EXPECTED_TREE" ] || fail "无法从 $LOCK_FILE 读取 resultTree"

	SOURCE_DIR=""
	if [ -n "${DSH_SOURCE_DIR:-}" ]; then
		SOURCE_DIR="$(cd "$DSH_SOURCE_DIR" 2>/dev/null && pwd -P || true)"
		[ -n "$SOURCE_DIR" ] || fail "DSH_SOURCE_DIR 不存在或不可进入：${DSH_SOURCE_DIR}"
	else
		for candidate in \
			"$SCRIPT_DIR/../deepseek-harness-main-build" \
			"$SCRIPT_DIR/../deepseek-harness"; do
			candidate="$(cd "$candidate" 2>/dev/null && pwd -P || true)"
			[ -n "$candidate" ] || continue
			if source_matches_lock "$candidate"; then
				SOURCE_DIR="$candidate"
				break
			fi
		done
	fi
	[ -n "$SOURCE_DIR" ] || fail "找不到与 $LOCK_FILE 一致的 DSH 源码构建；请设置 DSH_SOURCE_DIR 指向 dshVersion=${EXPECTED_VERSION}、resultTree=${EXPECTED_TREE} 的目录"
	if ! source_matches_lock "$SOURCE_DIR"; then
		ACTUAL_VERSION="$(sed -n 's/^[[:space:]]*\"version\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p' "$SOURCE_DIR/apps/cli/package.json" 2>/dev/null | head -n 1)"
		ACTUAL_TREE="$(git -C "$SOURCE_DIR" rev-parse --verify HEAD^{tree} 2>/dev/null || true)"
		fail "源码构建未命中锁定版本：目录=${SOURCE_DIR}，version=${ACTUAL_VERSION:-<未知>}（期望 ${EXPECTED_VERSION}），tree=${ACTUAL_TREE:-<未知>}（期望 ${EXPECTED_TREE}）"
	fi

	SOURCE_NODE="${DSH_SOURCE_NODE:-$HOME/.cache/dsharness/toolchains/node-v24.11.1-darwin-arm64/bin/node}"
	SOURCE_CLI="$SOURCE_DIR/apps/cli/lib/bin.js"
	SOURCE_PACKAGE="$SOURCE_DIR/apps/cli/package.json"

	[ -x "$SOURCE_NODE" ] || fail "找不到源码构建所需的 Node.js：$SOURCE_NODE"
	[ -f "$SOURCE_CLI" ] || fail "找不到 DSH 源码构建产物：${SOURCE_CLI}；请先构建 deepseek-harness"
	[ -f "$SOURCE_PACKAGE" ] || fail "找不到 DSH CLI package.json：$SOURCE_PACKAGE"

	PACKAGE_VERSION="$(sed -n 's/^[[:space:]]*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$SOURCE_PACKAGE" | head -n 1)"
	SOURCE_VERSION="$("$SOURCE_NODE" "$SOURCE_CLI" --version 2>/dev/null || true)"
	[ -n "$PACKAGE_VERSION" ] || fail "无法从 $SOURCE_PACKAGE 读取源码版本"
	[ "$PACKAGE_VERSION" = "$EXPECTED_VERSION" ] || fail "源码 package 版本不符合锁定版本：${PACKAGE_VERSION}（期望 ${EXPECTED_VERSION}）"
	[ "$SOURCE_VERSION" = "$PACKAGE_VERSION" ] || fail "源码构建版本不一致：package.json=${PACKAGE_VERSION}，构建产物=${SOURCE_VERSION}；请重新构建"

	LAUNCHER=("$SOURCE_NODE" "$SOURCE_CLI")
	LAUNCHER_NAME="DSH 源码构建版 $SOURCE_VERSION"
	step "使用锁定源码：${SOURCE_DIR}（version ${SOURCE_VERSION}，tree ${EXPECTED_TREE}）"
	verify_composed_profile
fi

listener_pids() {
	lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true
}

is_dsh_web_pid() {
	local pid="$1"
	local command_line
	command_line="$(ps -p "$pid" -o command= 2>/dev/null || true)"
	case " $command_line " in
		*"/apps/cli/lib/bin.js web "*|*"/apps/cli/lib/bin.js --profile web "*|*" dsh web "*|*"/dsh web "*|*" @deepseek-ai/dsh"*" web "*) return 0 ;;
		*) printf '%s' "$command_line"; return 1 ;;
	esac
}

PIDS="$(listener_pids)"
if [ -z "$PIDS" ]; then
	step "端口 $PORT 没有现有 dsh web 进程，直接启动"
else
	for pid in $PIDS; do
		if ! command_line="$(is_dsh_web_pid "$pid")"; then
			fail "端口 $PORT 由非 dsh web 进程 PID ${pid} 占用，拒绝停止：${command_line:-<无法读取命令行>}"
		fi
	done
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

verify_api_version() {
	local label="$1"
	local endpoint="$2"
	local body="$3"
	local minimum="$4"
	local response
	local api_version

	response="$(curl -fsS --max-time 5 \
		-X POST \
		-H 'Content-Type: application/json; charset=utf-8' \
		--data "$body" \
		"http://$HOST_ADDR:$PORT$endpoint" 2>/dev/null || true)"
	api_version="$(printf '%s' "$response" | sed -n 's/.*"apiVersion"[[:space:]]*:[[:space:]]*\([0-9][0-9]*\).*/\1/p')"
	if [ -z "$api_version" ]; then
		printf '\033[31m[restart] %s API 验证失败\033[0m\n' "$label"
		return 1
	fi
	if [ "$api_version" -lt "$minimum" ]; then
		printf '\033[31m[restart] %s apiVersion %s，低于期望的 %s\033[0m\n' "$label" "$api_version" "$minimum"
		return 1
	fi
	printf '\033[32m[restart] %s：apiVersion %s ✓\033[0m\n' "$label" "$api_version"
	return 0
}

verify_client_asset() {
	local plugin_name="$1"
	if curl -fsS --max-time 5 -o /dev/null "http://$HOST_ADDR:$PORT/plugins/$plugin_name/client.js"; then
		printf '\033[32m[restart] %s client.js ✓\033[0m\n' "$plugin_name"
		return 0
	fi
	printf '\033[31m[restart] %s client.js 缺失或不可访问\033[0m\n' "$plugin_name"
	return 1
}

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
		fail "等待服务超时，请检查启动日志：$LOG_FILE"
	fi
	step "服务已起来"

	local listener_pid
	local listener_command
	local command_uses_source=0
	listener_pid="$(listener_pids | head -n 1)"
	listener_command="$(ps -p "$listener_pid" -o command= 2>/dev/null || true)"
	case " $listener_command " in
		*"$SOURCE_CLI"*) command_uses_source=1 ;;
	esac
	if [ -z "$listener_pid" ] || [ "$listener_pid" != "$SERVER_PID" ] || [ "$command_uses_source" -ne 1 ]; then
		fail "监听进程不是本次锁定源码构建：期望 PID ${SERVER_PID} / ${SOURCE_CLI}，实际 PID ${listener_pid:-<未知>} / ${listener_command:-<未知>}"
	fi
	step "监听 PID 与锁定源码命令行校验通过：$SERVER_PID"

	local verification_failed=0
	local plugin_name
	local client_plugins=(
		dsh-better-sidebar
		dsh-better-sidebar-smooth
		dsh-extension-manager
		dsh-skill-manager
		dsh-mcp-manager
		dsh-plugin-manager
	)

	verify_api_version "skill-manager host" "/api/skill-manager" '{"op":"list"}' "$MIN_SKILL_MANAGER_API_VERSION" || verification_failed=1
	verify_api_version "plugin-manager host" "/api/plugin-manager" '{"op":"capabilities"}' "$MIN_PLUGIN_MANAGER_API_VERSION" || verification_failed=1
	verify_api_version "mcp-manager host" "/api/mcp-manager" '{"op":"capabilities"}' "$MIN_MCP_MANAGER_API_VERSION" || verification_failed=1
	for plugin_name in "${client_plugins[@]}"; do
		verify_client_asset "$plugin_name" || verification_failed=1
	done
	if [ "$verification_failed" -ne 0 ]; then
		fail "插件启动门禁失败；服务不会保持在不完整状态，请查看 $LOG_FILE"
	fi
	step "重启完成：http://${HOST_ADDR}:${PORT}（按 Ctrl+C 停止）"
}

step "通过 $LAUNCHER_NAME 启动 dsh web；日志同时保存到 $LOG_FILE"

"${LAUNCHER[@]}" web --host "$HOST_ADDR" --port "$PORT" >>"$LOG_FILE" 2>&1 &
SERVER_PID=$!

verify_after_launch

wait "$SERVER_PID"
LAUNCH_STATUS=$?
SERVER_PID=""

if [ "$LAUNCH_STATUS" -ne 0 ]; then
	fail "dsh web 已退出，状态码 ${LAUNCH_STATUS}；请查看 $LOG_FILE"
fi
step "dsh web 已停止"
