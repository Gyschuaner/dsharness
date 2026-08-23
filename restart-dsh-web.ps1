#Requires -Version 5.1
<#
restart-dsh-web.ps1 — 一键重启 dsh web（127.0.0.1:3080）

用法：
  .\restart-dsh-web.ps1             重启并等待服务恢复，最后验证 skill-manager apiVersion
  .\restart-dsh-web.ps1 -EnableVisionBridge  通过 DP Gateway 启用 vision_inspect
  .\restart-dsh-web.ps1 -NoLaunch   只停不启动（想自己手动起时用）
  .\restart-dsh-web.ps1 -Port 3080  端口可改（默认 3080）

行为：
  1. 仅在确认 3080 端口监听者属于 dsh web 后停止该进程，等端口释放
  2. 在隐藏窗口运行 dsh web，标准输出和错误写入系统临时目录
  3. 轮询等待 HTTP 恢复（最多 60 秒），再调 Skill / Plugin Manager API 验证 host 已加载
     （本次功能需要 apiVersion >= 5；重启前运行中的进程是 4）

注意：
  - 这会重启正在服务本 Web GUI 的宿主进程：进行中的轮次会中断，
    会话持久化在磁盘，浏览器重连后原会话可恢复。
  - 用 dsh 直接启动，等价于之前的 npx -y @deepseek-ai/dsh web，但不经过 npx 网络解析。
#>
param(
	[ValidateRange(1, 65535)]
	[int]$Port = 3080,
	[string]$HostAddr = '127.0.0.1',
	[switch]$EnableVisionBridge,
	[switch]$NoLaunch
)

$ErrorActionPreference = 'Stop'
function Write-Step($m) { Write-Host "[restart] $m" -ForegroundColor Cyan }

$parsedAddress = $null
if ($HostAddr -ne 'localhost' -and -not [Net.IPAddress]::TryParse($HostAddr, [ref]$parsedAddress)) {
	throw "HostAddr 只能是 localhost 或合法 IP 地址：$HostAddr"
}

function Test-DshWebProcess($process) {
	if (-not $process -or -not $process.CommandLine) { return $false }
	$line = [string]$process.CommandLine
	return ($line -match '(?i)(?:^|[\\/\s])dsh(?:\.cmd|\.exe)?(?:"|\s).*(?:^|\s)web(?:\s|$)') -or
		($line -match '(?i)apps[\\/]cli[\\/]lib[\\/]bin\.js.*(?:^|\s)web(?:\s|$)') -or
		($line -match '(?i)@deepseek-ai[\\/]dsh.*(?:^|\s)web(?:\s|$)')
}

# ── 1) 停止现有进程 ─────────────────────────────────────────────────────────
$portPids = @()
$conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($conn) { $portPids = @($conn | ForEach-Object OwningProcess | Sort-Object -Unique) }

foreach ($portPid in $portPids) {
	$listener = Get-CimInstance Win32_Process -Filter "ProcessId = $portPid" -ErrorAction SilentlyContinue
	if (-not (Test-DshWebProcess $listener)) {
		$command = if ($listener -and $listener.CommandLine) { $listener.CommandLine } else { '<无法读取命令行>' }
		throw "端口 $Port 由非 dsh web 进程 PID $portPid 占用，拒绝停止：$command"
	}
}

$all = @($portPids) | Where-Object { $_ } | Sort-Object -Unique

if ($all.Count -eq 0) {
	Write-Step "端口 $Port 没有现有 dsh web 进程，直接启动"
} else {
	Write-Step "停止进程：$($all -join ', ')"
	foreach ($p in $all) {
		try {
			Stop-Process -Id $p -Force -ErrorAction Stop
			Write-Host "  已停 PID $p"
		} catch {
			Write-Host "  PID $p 未停成（可能已退出）：$($_.Exception.Message)" -ForegroundColor Yellow
		}
	}
	# 等端口释放（最多 10 秒）
	$deadline = (Get-Date).AddSeconds(10)
	while ((Get-Date) -lt $deadline) {
		if (-not (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)) { break }
		Start-Sleep -Milliseconds 300
	}
	if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) {
		Write-Host "端口 $Port 仍被占用，放弃重启，请手动处理" -ForegroundColor Red
		exit 1
	}
	Write-Step "端口 $Port 已释放"
}

# ── 2) 启动 ─────────────────────────────────────────────────────────────────
if ($NoLaunch) {
	Write-Step "跳过启动（-NoLaunch），请自行运行：dsh web --host $HostAddr --port $Port"
	exit 0
}
$LogStamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$StdoutLog = Join-Path ([IO.Path]::GetTempPath()) "dsh-web-$Port-$LogStamp.out.log"
$StderrLog = Join-Path ([IO.Path]::GetTempPath()) "dsh-web-$Port-$LogStamp.err.log"
$VisionPatchPath = Join-Path $PSScriptRoot 'dev\vision-bridge.dp-gateway.patch.yml'
$DshExecutable = (Get-Command dsh -ErrorAction Stop).Source
$DshArgs = @('web', '--no-open', '--host', $HostAddr, '--port', [string]$Port)
if ($EnableVisionBridge) {
	if (-not (Test-Path -LiteralPath $VisionPatchPath -PathType Leaf)) {
		throw "视觉桥覆盖不存在：$VisionPatchPath"
	}
	$DshArgs = @('--profile', 'web', '--patch', $VisionPatchPath, 'web', '--no-open', '--host', $HostAddr, '--port', [string]$Port)
	Write-Step "启用 vision-bridge（覆盖：$VisionPatchPath）"
}
Write-Step "在隐藏窗口启动 dsh web（日志：$StdoutLog；$StderrLog）"
Start-Process -FilePath $DshExecutable -WindowStyle Hidden -ArgumentList $DshArgs -RedirectStandardOutput $StdoutLog -RedirectStandardError $StderrLog | Out-Null

# ── 3) 等待恢复 + 验证 ──────────────────────────────────────────────────────
Write-Step "等待 http://${HostAddr}:${Port} 恢复（最多 60 秒）…"
$deadline = (Get-Date).AddSeconds(60)
$up = $false
while ((Get-Date) -lt $deadline) {
	try {
		$r = Invoke-WebRequest -Uri "http://${HostAddr}:${Port}/" -UseBasicParsing -TimeoutSec 3
		if ($r.StatusCode -eq 200) { $up = $true; break }
	} catch { }
	Start-Sleep -Milliseconds 500
}
if (-not $up) {
	Write-Host "等待服务超时，请查看日志：$StdoutLog；$StderrLog" -ForegroundColor Red
	exit 1
}
Write-Step "服务已起来"

try {
	$j = Invoke-RestMethod -Uri "http://${HostAddr}:${Port}/api/skill-manager" -Method Post -ContentType 'application/json; charset=utf-8' -Body '{"op":"list"}'
	$api = $j.value.apiVersion
	if ($api -ge 5) {
		Write-Host "skill-manager host：apiVersion $api ✓（全局默认关闭策略已生效，浏览器刷新页面即可用新功能）" -ForegroundColor Green
	} else {
		Write-Host "skill-manager host：apiVersion $api —— 未加载到新版代码，请检查 ~/.dsh/plugins/skill-manager" -ForegroundColor Yellow
	}
} catch {
	Write-Host "skill-manager API 验证失败（不影响 dsh web 本身）：$($_.Exception.Message)" -ForegroundColor Yellow
}
try {
	$j = Invoke-RestMethod -Uri "http://${HostAddr}:${Port}/api/plugin-manager" -Method Post -ContentType 'application/json; charset=utf-8' -Body '{"op":"capabilities"}'
	$api = $j.value.apiVersion
	if ($api -ge 1) {
		Write-Host "plugin-manager host：apiVersion $api ✓" -ForegroundColor Green
	} else {
		Write-Host "plugin-manager host：apiVersion $api —— 未加载到可用版本" -ForegroundColor Yellow
	}
} catch {
	Write-Host "plugin-manager API 验证失败（请检查 profile 依赖与 Cordis 行）：$($_.Exception.Message)" -ForegroundColor Yellow
}
Write-Step "重启完成"
