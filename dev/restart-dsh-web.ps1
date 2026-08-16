#Requires -Version 5.1
<#
restart-dsh-web.ps1 — 一键重启 dsh web（127.0.0.1:3080）

用法：
  .\restart-dsh-web.ps1             重启并等待服务恢复，最后验证 skill-manager apiVersion
  .\restart-dsh-web.ps1 -NoLaunch   只停不启动（想自己手动起时用）
  .\restart-dsh-web.ps1 -Port 3080  端口可改（默认 3080）

行为：
  1. 停掉 3080 端口监听进程 + 命令行里带 dsh web 的 node 进程（含 npx 包装层），等端口释放
  2. 新开一个 PowerShell 窗口运行 dsh web（日志可见，Ctrl+C 可停）
  3. 轮询等待 HTTP 恢复（最多 60 秒），再调 /api/skill-manager 验证新 host 已加载
     （本次功能需要 apiVersion >= 5；重启前运行中的进程是 4）

注意：
  - 这会重启正在服务本 Web GUI 的宿主进程：进行中的轮次会中断，
    会话持久化在磁盘，浏览器重连后原会话可恢复。
  - 用 dsh 直接启动，等价于之前的 npx -y @deepseek-ai/dsh web，但不经过 npx 网络解析。
#>
param(
	[int]$Port = 3080,
	[string]$HostAddr = '127.0.0.1',
	[switch]$NoLaunch
)

$ErrorActionPreference = 'Stop'
function Write-Step($m) { Write-Host "[restart] $m" -ForegroundColor Cyan }

# ── 1) 停止现有进程 ─────────────────────────────────────────────────────────
$portPids = @()
$conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($conn) { $portPids = @($conn | ForEach-Object OwningProcess | Sort-Object -Unique) }

$webPids = @()
Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Where-Object {
	$_ -and $_.CommandLine -and
	(($_.CommandLine -match 'bin\.js web') -or ($_.CommandLine -match '@deepseek-ai[/\\]dsh web'))
} | ForEach-Object { $webPids += $_.ProcessId }

$all = @($portPids + $webPids) | Where-Object { $_ } | Sort-Object -Unique

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
Write-Step "启动 dsh web（新开窗口，日志可见）"
Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoExit', '-NoProfile', '-Command', "dsh web --host $HostAddr --port $Port") | Out-Null

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
	Write-Host "等待服务超时，请看新窗口里的日志" -ForegroundColor Red
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
Write-Step "重启完成"
