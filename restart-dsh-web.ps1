#Requires -Version 5.1
<#
restart-dsh-web.ps1 — 一键重启 dsh web（127.0.0.1:3080）

用法：
  .\restart-dsh-web.ps1             重启并等待服务恢复，最后验证 skill-manager apiVersion
  .\restart-dsh-web.ps1 -EnableVisionBridge 为旧 profile 临时应用 DP Gateway vision_inspect 覆盖（当前 web profile 默认已启用）
  .\restart-dsh-web.ps1 -NoLaunch   只停不启动（想自己手动起时用）
  .\restart-dsh-web.ps1 -Port 3080  端口可改（默认 3080）

行为：
  1. 校验锁定源码 tree、Node/pnpm 工具链，并在停止旧进程前执行 frozen install + 完整构建
  2. 校验 Host/vision-bridge 构建产物和实际 web profile，拒绝复用 stale lib
  3. 直接用刚构建的 apps/cli/lib/bin.js 启动独立 Node 进程，默认隐藏窗口并把日志写入 ~/.dsh/logs
  4. 轮询等待 HTTP 恢复，再校验监听 PID、实际命令行和插件 API

注意：
  - 这会重启正在服务本 Web GUI 的宿主进程：进行中的轮次会中断，
    会话持久化在磁盘，浏览器重连后原会话可恢复。
  - 默认源码目录是 dsharness 同级的 deepseek-harness，可用 -DshSourceDirectory 显式覆盖。
  - 如果目标端口由非 DSH 进程占用，脚本会停止并保留该进程，不会强制结束未知服务。
#>
param(
	[ValidateRange(1, 65535)]
	[int]$Port = 3080,
	[string]$HostAddr = '127.0.0.1',
	[string]$DshSourceDirectory = (Join-Path (Split-Path -Parent $PSScriptRoot) 'deepseek-harness'),
	[string]$LogDirectory = (Join-Path $env:USERPROFILE '.dsh\logs'),
	[ValidateRange(1, 600)]
	[int]$StartupTimeoutSeconds = 60,
	[ValidateRange(0, 1000)]
	[int]$MinimumSkillManagerApiVersion = 6,
	[switch]$EnableVisionBridge,
	[switch]$NoLaunch
)

$ErrorActionPreference = 'Stop'
function Write-Step($m) { Write-Host "[restart] $m" -ForegroundColor Cyan }

$RepoRoot = $PSScriptRoot
$LockPath = Join-Path $RepoRoot 'upstream.lock.json'
if (-not (Test-Path -LiteralPath $LockPath -PathType Leaf)) {
	throw "找不到可复现构建锁文件：$LockPath"
}
$Lock = Get-Content -LiteralPath $LockPath -Raw -Encoding UTF8 | ConvertFrom-Json

function Invoke-Native([string]$FilePath, [string[]]$Arguments, [string]$WorkingDirectory) {
	Push-Location $WorkingDirectory
	try {
		& $FilePath @Arguments
		if ($LASTEXITCODE -ne 0) {
			throw "$FilePath $($Arguments -join ' ') 执行失败，退出码 $LASTEXITCODE。"
		}
	} finally {
		Pop-Location
	}
}

function Get-GitTree([string]$RepositoryPath) {
	$tree = (& git -C $RepositoryPath rev-parse 'HEAD^{tree}').Trim()
	if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($tree)) {
		throw "无法读取源码 Git tree：$RepositoryPath"
	}
	return $tree
}

function Ensure-CleanBuildWorktree([string]$SourceDirectory, [string]$SourceHead) {
	$sourceParent = Split-Path -Parent $SourceDirectory
	$sourceLeaf = Split-Path -Leaf $SourceDirectory
	$buildDirectory = Join-Path $sourceParent "$sourceLeaf-runtime"
	$gitMarker = Join-Path $buildDirectory '.git'
	if (-not (Test-Path -LiteralPath $buildDirectory)) {
		Write-Step "创建干净构建 worktree：$buildDirectory"
		$null = Invoke-Native 'git' @('worktree', 'add', '--detach', $buildDirectory, $SourceHead) $SourceDirectory
	} elseif (-not (Test-Path -LiteralPath $gitMarker)) {
		throw "构建目录已存在但不是受 Git 管理的 worktree：$buildDirectory"
	}

	$runtimeStatus = @(& git -C $buildDirectory status --porcelain=v1 --untracked-files=all)
	$runtimeTrackedChanges = @($runtimeStatus | Where-Object { $_ -and $_ -notmatch '^\?\? ' })
	if ($runtimeTrackedChanges.Count -gt 0) {
		throw "构建 worktree 存在已跟踪文件修改，拒绝覆盖：$($runtimeTrackedChanges -join '; ')"
	}
	$runtimeHead = (& git -C $buildDirectory rev-parse HEAD).Trim()
	if ($runtimeHead -ne $SourceHead) {
		Write-Step "更新构建 worktree：$runtimeHead -> $SourceHead"
		$null = Invoke-Native 'git' @('checkout', '--detach', $SourceHead) $buildDirectory
	}
	return [IO.Path]::GetFullPath($buildDirectory)
}

$parsedAddress = $null
if ($HostAddr -ne 'localhost' -and -not [Net.IPAddress]::TryParse($HostAddr, [ref]$parsedAddress)) {
	throw "HostAddr 只能是 localhost 或合法 IP 地址：$HostAddr"
}

function Get-ProcessInfo([int]$ProcessId) {
	Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction SilentlyContinue
}

function Test-DshWebCommandLine([string]$CommandLine, [int]$ExpectedPort) {
	if ([string]::IsNullOrWhiteSpace($CommandLine)) { return $false }
	$escapedPort = [regex]::Escape([string]$ExpectedPort)
	$isDshWeb = $CommandLine -match '(?i)(?:bin\.js|@deepseek-ai[/\\]dsh|(?:^|\s)dsh(?:\.cmd)?).*?\bweb(?:\s|$)'
	$portPattern = '(?i)--port(?:=|\s+)"?{0}"?(?:\s|$)' -f $escapedPort
	$usesExpectedPort = $CommandLine -match $portPattern
	return $isDshWeb -and $usesExpectedPort
}

function Test-DshWebProcess($process) {
	if (-not $process -or -not $process.CommandLine) { return $false }
	return Test-DshWebCommandLine ([string]$process.CommandLine) $Port
}

function Get-LogTail([string]$Path) {
	if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return '' }
	return ((Get-Content -LiteralPath $Path -Tail 20 -ErrorAction SilentlyContinue) -join [Environment]::NewLine)
}

# 启动前先验证依赖，避免停掉健康服务后才发现本地源码不可用。
$resolvedSourceDirectory = $null
$buildSourceDirectory = $null
$cliEntry = $null
$nodePath = $null
$resolvedLogDirectory = $null
$visionPatchPath = Join-Path $PSScriptRoot 'dev\vision-bridge.dp-gateway.patch.yml'
$sourceHead = $null
$sourceTree = $null
$buildMetadataPath = $null
if (-not $NoLaunch) {
	$resolvedSourceDirectory = [IO.Path]::GetFullPath($DshSourceDirectory)
	if (-not (Test-Path -LiteralPath (Join-Path $resolvedSourceDirectory '.git'))) {
		throw "源码目录不是 Git 仓库：$resolvedSourceDirectory"
	}
	$sourceHead = (& git -C $resolvedSourceDirectory rev-parse HEAD).Trim()
	$sourceTree = Get-GitTree $resolvedSourceDirectory
	if ($sourceTree -ne $Lock.resultTree) {
		throw "源码 tree 不是锁定的最新完整版本。预期 $($Lock.resultTree)，实际 $sourceTree。请先运行 dev\\install-dsh-source.ps1，或传入已命中锁定 tree 的 -DshSourceDirectory。"
	}
	$sourceStatus = @(& git -C $resolvedSourceDirectory status --porcelain=v1 --untracked-files=all)
	$trackedChanges = @($sourceStatus | Where-Object { $_ -and $_ -notmatch '^\?\? ' })
	if ($trackedChanges.Count -gt 0) {
		throw "源码目录存在已跟踪文件修改，拒绝构建以避免启动非锁定版本：$($trackedChanges -join '; ')"
	}
	$untrackedChanges = @($sourceStatus | Where-Object { $_ -and $_ -match '^\?\? ' })
	if ($untrackedChanges.Count -gt 0) {
		Write-Host "源码目录有未跟踪文件（不参与锁定 tree）：$($untrackedChanges -join '; ')" -ForegroundColor Yellow
	}
	$buildSourceDirectory = Ensure-CleanBuildWorktree $resolvedSourceDirectory $sourceHead
	$buildTree = Get-GitTree $buildSourceDirectory
	if ($buildTree -ne $Lock.resultTree) {
		throw "构建 worktree tree 不匹配锁定结果。预期 $($Lock.resultTree)，实际 $buildTree。"
	}
	$cliEntry = Join-Path $buildSourceDirectory 'apps\cli\lib\bin.js'
	$nodeCommand = Get-Command node.exe -CommandType Application -ErrorAction Stop | Select-Object -First 1
	$nodePath = $nodeCommand.Source
	if (-not $nodePath) { throw '找不到 node.exe。' }
	$nodeVersion = (& $nodePath --version).Trim().TrimStart('v')
	if ($nodeVersion -ne $Lock.nodeVersion) {
		throw "Node 版本必须是 $($Lock.nodeVersion)，当前为 $nodeVersion。"
	}
	$corepack = Get-Command corepack -CommandType Application -ErrorAction Stop | Select-Object -First 1
	$previousLocation = Get-Location
	try {
		Set-Location -LiteralPath $buildSourceDirectory
		$pnpmVersion = (& $corepack.Source pnpm --version).Trim()
	} finally {
		Set-Location -LiteralPath $previousLocation
	}
	if ($pnpmVersion -ne $Lock.pnpmVersion) {
		throw "pnpm 版本必须是 $($Lock.pnpmVersion)，当前为 $pnpmVersion。"
	}
	$resolvedLogDirectory = [IO.Path]::GetFullPath($LogDirectory)
	New-Item -ItemType Directory -Path $resolvedLogDirectory -Force | Out-Null
	$buildMetadataPath = Join-Path $resolvedLogDirectory "dsh-web-$Port.build.json"

	Write-Step "源码 tree 已锁定：$sourceTree（$sourceHead）"
	Write-Step "同步锁定依赖并构建最新 Host/Client/Web 产物"
	$previousCi = $env:CI
	try {
		$env:CI = 'true'
		Invoke-Native $corepack.Source @('pnpm', 'install', '--frozen-lockfile') $buildSourceDirectory
		Invoke-Native $corepack.Source @('pnpm', 'run', 'build') $buildSourceDirectory
	} finally {
		$env:CI = $previousCi
	}

	$hostBundle = Join-Path $buildSourceDirectory 'packages\host\apiproxy\lib\index.js'
	$visionBundle = Join-Path $buildSourceDirectory 'packages\vision\vision-bridge\lib\index.js'
	foreach ($artifact in @($cliEntry, $hostBundle, $visionBundle)) {
		if (-not (Test-Path -LiteralPath $artifact -PathType Leaf)) {
			throw "构建完成但缺少产物：$artifact"
		}
	}
$hostBundleText = Get-Content -LiteralPath $hostBundle -Raw -Encoding UTF8
	$visionBundleText = Get-Content -LiteralPath $visionBundle -Raw -Encoding UTF8
	if ($hostBundleText -notmatch 'imageInputBridge') {
		throw "Host apiproxy 构建产物未包含 imageInputBridge 准入集成：$hostBundle"
	}
	if ($visionBundleText -notmatch 'imageInputBridge') {
		throw "vision-bridge 构建产物未包含 imageInputBridge provider：$visionBundle"
	}

	$configDumpArguments = @('--profile', 'web')
	if ($EnableVisionBridge) {
		if (-not (Test-Path -LiteralPath $visionPatchPath -PathType Leaf)) {
			throw "视觉桥覆盖不存在：$visionPatchPath"
		}
		$configDumpArguments += @('--patch', $visionPatchPath)
	}
	$configDumpArguments += '--dump-config'
	$configDump = (& $nodePath $cliEntry @configDumpArguments 2>&1 | Out-String)
	if ($LASTEXITCODE -ne 0) {
		throw "无法读取 web profile 配置：$configDump"
	}
	if ($configDump -notmatch '(?ms)- id: vision-bridge.*?disabled: false') {
		throw 'web profile 未启用 vision-bridge，拒绝启动不完整组合。'
	}
	if ($configDump -match 'image-context-guard') {
		throw 'web profile 仍包含已移除的 image-context-guard，拒绝启动旧组合。'
	}

	[ordered]@{
		sourceDirectory = $resolvedSourceDirectory
		buildDirectory = $buildSourceDirectory
		sourceHead = $sourceHead
		sourceTree = $sourceTree
		buildTree = $buildTree
		expectedTree = $Lock.resultTree
		builtAt = (Get-Date).ToString('o')
		nodeVersion = $nodeVersion
		pnpmVersion = $pnpmVersion
		cli = $cliEntry
		hostApiproxy = $hostBundle
		visionBridge = $visionBundle
		visionBridgeEnabled = $true
	} | ConvertTo-Json | Set-Content -LiteralPath $buildMetadataPath -Encoding UTF8
	Write-Step "最新构建和 profile 校验通过；构建元数据：$buildMetadataPath"
}

# ── 1) 停止现有进程 ─────────────────────────────────────────────────────────
$portPids = @()
$conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($conn) { $portPids = @($conn | ForEach-Object OwningProcess | Sort-Object -Unique) }

$webPids = @()
Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Where-Object {
	$_ -and (Test-DshWebCommandLine $_.CommandLine $Port)
} | ForEach-Object { $webPids += $_.ProcessId }

$unknownListeners = @()
foreach ($listenerProcessId in $portPids) {
	$listener = Get-ProcessInfo $listenerProcessId
	if (-not (Test-DshWebProcess $listener)) {
		$unknownListeners += $listenerProcessId
	}
}
if ($unknownListeners.Count -gt 0) {
	throw "端口 $Port 由非 DSH 进程占用（PID：$($unknownListeners -join ', ')），拒绝停止，为避免误伤未停止它。"
}

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
	Write-Step "跳过启动（-NoLaunch）"
	exit 0
}

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$stdoutLog = Join-Path $resolvedLogDirectory "dsh-web-$Port-$timestamp.stdout.log"
$stderrLog = Join-Path $resolvedLogDirectory "dsh-web-$Port-$timestamp.stderr.log"
$metadataPath = Join-Path $resolvedLogDirectory "dsh-web-$Port.latest.json"
$arguments = @("`"$cliEntry`"", '--profile', 'web')
if ($EnableVisionBridge) {
	$arguments += @('--patch', "`"$visionPatchPath`"")
	Write-Step "兼容性覆盖 vision-bridge（profile 默认已启用）"
}
$arguments += @('--host', $HostAddr, '--port', [string]$Port)

Write-Step "隐藏启动本地源码 dsh web：$cliEntry"
$startedProcess = Start-Process -FilePath $nodePath `
	-ArgumentList $arguments `
	-WorkingDirectory $buildSourceDirectory `
	-WindowStyle Hidden `
	-RedirectStandardOutput $stdoutLog `
	-RedirectStandardError $stderrLog `
	-PassThru

[ordered]@{
	pid = $startedProcess.Id
	startedAt = (Get-Date).ToString('o')
	host = $HostAddr
	port = $Port
	node = $nodePath
	cli = $cliEntry
	sourceHead = $sourceHead
	sourceTree = $sourceTree
	expectedTree = $Lock.resultTree
	buildMetadata = $buildMetadataPath
	buildDirectory = $buildSourceDirectory
	stdout = $stdoutLog
	stderr = $stderrLog
} | ConvertTo-Json | Set-Content -LiteralPath $metadataPath -Encoding UTF8
Write-Step "后台 PID：$($startedProcess.Id)；日志：$stdoutLog / $stderrLog"

# ── 3) 等待恢复 + 验证 ──────────────────────────────────────────────────────
Write-Step "等待 http://${HostAddr}:${Port} 恢复（最多 $StartupTimeoutSeconds 秒）…"
$deadline = (Get-Date).AddSeconds($StartupTimeoutSeconds)
$up = $false
while ((Get-Date) -lt $deadline) {
	if ($startedProcess.HasExited) { break }
	try {
		$r = Invoke-WebRequest -Uri "http://${HostAddr}:${Port}/" -UseBasicParsing -TimeoutSec 3
		if ($r.StatusCode -eq 200) { $up = $true; break }
	} catch { }
	Start-Sleep -Milliseconds 500
}
if (-not $up) {
	if (-not $startedProcess.HasExited) {
		Stop-Process -Id $startedProcess.Id -Force -ErrorAction SilentlyContinue
	}
	$stderrTail = Get-LogTail $stderrLog
	throw "服务未在限定时间内恢复。stderr 尾部：$stderrTail"
}

$listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $listener) {
	Stop-Process -Id $startedProcess.Id -Force -ErrorAction SilentlyContinue
	throw "HTTP 已响应，但没有找到端口 $Port 的监听进程。"
}
$actualProcess = Get-ProcessInfo $listener.OwningProcess
if (-not $actualProcess -or $listener.OwningProcess -ne $startedProcess.Id) {
	Stop-Process -Id $startedProcess.Id -Force -ErrorAction SilentlyContinue
	throw "端口 $Port 的监听 PID 与刚启动的进程不一致。期望 $($startedProcess.Id)，实际 $($listener.OwningProcess)。"
}
if (-not (Test-DshWebCommandLine $actualProcess.CommandLine $Port) -or
	$actualProcess.CommandLine.IndexOf($cliEntry, [StringComparison]::OrdinalIgnoreCase) -lt 0) {
	Stop-Process -Id $startedProcess.Id -Force -ErrorAction SilentlyContinue
	throw "监听进程没有使用期望的本地源码 CLI：$($actualProcess.CommandLine)"
}
Write-Step "服务已恢复：HTTP 200，PID $($startedProcess.Id)，本地源码命令行校验通过"

try {
	$j = Invoke-RestMethod -Uri "http://${HostAddr}:${Port}/api/skill-manager" -Method Post -ContentType 'application/json; charset=utf-8' -Body '{"op":"list"}'
	$api = $j.value.apiVersion
	if ($api -ge $MinimumSkillManagerApiVersion) {
		Write-Host "skill-manager host：apiVersion $api ✓" -ForegroundColor Green
	} else {
		Write-Host "skill-manager host：apiVersion $api，低于期望的 $MinimumSkillManagerApiVersion；请检查 ~/.dsh/plugins/skill-manager" -ForegroundColor Yellow
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
