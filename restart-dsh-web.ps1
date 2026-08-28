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
  2. 校验 Gateway/Session Controller/ACP/attachment/vision 构建产物和实际 web profile，拒绝复用 stale lib
  3. 直接用刚构建的 apps/cli/lib/bin.js 启动独立 Node 进程，默认隐藏窗口并把日志写入 ~/.dsh/logs
  4. 读取并立即脱敏 alpha1 一次性登录 URL，校验匿名 401、认证 HTTP 200、监听 PID、实际命令行和插件 API

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

function Read-SharedText([string]$Path) {
	$stream = [IO.File]::Open($Path, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite)
	try {
		$reader = [IO.StreamReader]::new($stream, [Text.UTF8Encoding]::new($false), $true, 4096, $true)
		try { return $reader.ReadToEnd() } finally { $reader.Dispose() }
	} finally {
		$stream.Dispose()
	}
}

function Protect-StartupLog([string]$Path) {
	if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return }
	$content = Read-SharedText $Path
	$redacted = [regex]::Replace($content, '([?&]token=)[A-Za-z0-9_-]+', '$1<redacted>')
	if ($redacted -eq $content) { return }

	$bytes = [Text.UTF8Encoding]::new($false).GetBytes($redacted)
	$lastError = $null
	for ($attempt = 0; $attempt -lt 20; $attempt += 1) {
		try {
			$stream = [IO.File]::Open($Path, [IO.FileMode]::Open, [IO.FileAccess]::ReadWrite, [IO.FileShare]::ReadWrite)
			try {
				$stream.SetLength(0)
				$stream.Position = 0
				$stream.Write($bytes, 0, $bytes.Length)
				$stream.Flush()
			} finally {
				$stream.Dispose()
			}
			return
		} catch {
			$lastError = $_.Exception.Message
			Start-Sleep -Milliseconds 50
		}
	}
	throw "无法从启动日志中清除一次性 Web token：$lastError"
}

function Get-HttpStatus([string]$Uri) {
	$client = [System.Net.Http.HttpClient]::new()
	try {
		$client.Timeout = [TimeSpan]::FromSeconds(3)
		$response = $client.GetAsync($Uri, [System.Net.Http.HttpCompletionOption]::ResponseHeadersRead).GetAwaiter().GetResult()
		try { return [int]$response.StatusCode } finally { $response.Dispose() }
	} finally {
		$client.Dispose()
	}
}

function Invoke-AuthenticatedJsonPost($Client, [string]$Uri, [string]$Json) {
	$content = [System.Net.Http.StringContent]::new($Json, [Text.Encoding]::UTF8, 'application/json')
	try {
		$response = $Client.PostAsync($Uri, $content).GetAwaiter().GetResult()
		try {
			$body = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
			if ([int]$response.StatusCode -ne 200) {
				throw "HTTP $([int]$response.StatusCode)"
			}
			return $body | ConvertFrom-Json
		} finally {
			$response.Dispose()
		}
	} finally {
		$content.Dispose()
	}
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
		Invoke-Native $corepack.Source @('pnpm', 'run', 'clean') $buildSourceDirectory
		Invoke-Native $corepack.Source @('pnpm', 'run', 'build') $buildSourceDirectory
	} finally {
		$env:CI = $previousCi
	}

	$gatewayBundle = Join-Path $buildSourceDirectory 'packages\api\gateway\lib\index.js'
	$sessionControllerBundle = Join-Path $buildSourceDirectory 'packages\api\session-controller\lib\index.js'
	$acpBundle = Join-Path $buildSourceDirectory 'packages\acp\acp\lib\index.js'
	$attachmentLocalBundle = Join-Path $buildSourceDirectory 'packages\attachment\attachment-local\lib\index.js'
	$visionBundle = Join-Path $buildSourceDirectory 'packages\vision\vision-bridge\lib\index.js'
	foreach ($artifact in @($cliEntry, $gatewayBundle, $sessionControllerBundle, $acpBundle, $attachmentLocalBundle, $visionBundle)) {
		if (-not (Test-Path -LiteralPath $artifact -PathType Leaf)) {
			throw "构建完成但缺少产物：$artifact"
		}
	}
	$gatewayBundleText = Get-Content -LiteralPath $gatewayBundle -Raw -Encoding UTF8
	$sessionControllerBundleText = Get-Content -LiteralPath $sessionControllerBundle -Raw -Encoding UTF8
	$acpBundleText = Get-Content -LiteralPath $acpBundle -Raw -Encoding UTF8
	$attachmentLocalBundleText = Get-Content -LiteralPath $attachmentLocalBundle -Raw -Encoding UTF8
	$visionBundleText = Get-Content -LiteralPath $visionBundle -Raw -Encoding UTF8
	if ($gatewayBundleText -notmatch 'TypertRemote|TypertRemoteService') {
		throw "Gateway 构建产物未包含 alpha1 Typert Remote 入口：$gatewayBundle"
	}
	if ($sessionControllerBundleText -notmatch 'MODEL_DOES_NOT_SUPPORT_IMAGES') {
		throw "Session Controller 构建产物未包含原生图片能力拒绝分支：$sessionControllerBundle"
	}
	if ($acpBundleText -notmatch 'image|attachment') {
		throw "ACP 构建产物未包含图片/附件处理路径：$acpBundle"
	}
	if ($attachmentLocalBundleText -notmatch 'imageHostPath' -or $attachmentLocalBundleText -notmatch 'readImageRequest') {
		throw "attachment-local 构建产物未包含原生图片路径/请求投影：$attachmentLocalBundle"
	}
	if ($visionBundleText -notmatch 'imageInputBridge' -or $visionBundleText -notmatch 'reportProgress') {
		throw "vision-bridge 构建产物未包含 imageInputBridge provider 与 progress：$visionBundle"
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
	if ($configDump -notmatch 'Qwen3\.8-Flash-Next-FP8') {
		throw 'web profile 未固定到 Qwen3.8-Flash-Next-FP8，拒绝启动旧视觉路由。'
	}
	if ($configDump -notmatch 'ai\.chuansgu\.top/v1') {
		throw 'web profile 未配置 DP Gateway 视觉地址，拒绝启动不完整组合。'
	}
	if ($configDump -match 'image-context-guard') {
		throw 'web profile 仍包含已移除的 image-context-guard，拒绝启动旧组合。'
	}
	foreach ($pluginId in @('extension-manager', 'skill-manager', 'plugin-manager', 'mcp-manager', 'better-sidebar-smooth', 'vision-bridge')) {
		if ($configDump -notmatch "id:\s*$([regex]::Escape($pluginId))") {
			throw "web profile 缺少默认插件行：$pluginId"
		}
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
		gateway = $gatewayBundle
		sessionController = $sessionControllerBundle
		acp = $acpBundle
		attachmentLocal = $attachmentLocalBundle
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
$arguments += @('--host', $HostAddr, '--port', [string]$Port, '--no-open')

Write-Step "隐藏启动本地源码 dsh web：$cliEntry"
$startedProcess = Start-Process -FilePath $nodePath `
	-ArgumentList $arguments `
	-WorkingDirectory $buildSourceDirectory `
	-WindowStyle Hidden `
	-RedirectStandardOutput $stdoutLog `
	-RedirectStandardError $stderrLog `
	-PassThru

$runtimeMetadata = [ordered]@{
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
	anonymousHttpStatus = $null
	authenticatedHttpStatus = $null
	skillManagerApiVersion = $null
	pluginManagerApiVersion = $null
	verifiedAt = $null
}
$runtimeMetadata | ConvertTo-Json | Set-Content -LiteralPath $metadataPath -Encoding UTF8
Write-Step "后台 PID：$($startedProcess.Id)；日志：$stdoutLog / $stderrLog"

# ── 3) 等待恢复 + 验证 ──────────────────────────────────────────────────────
Write-Step "等待 http://${HostAddr}:${Port} 恢复（最多 $StartupTimeoutSeconds 秒）…"
$deadline = (Get-Date).AddSeconds($StartupTimeoutSeconds)
$up = $false
$authenticatedClient = $null
$launchUri = $null
while ((Get-Date) -lt $deadline) {
	if ($startedProcess.HasExited) { break }
	if ($null -eq $launchUri -and (Test-Path -LiteralPath $stdoutLog -PathType Leaf)) {
		$startupOutput = Read-SharedText $stdoutLog
		$match = [regex]::Match($startupOutput, 'dsh web: (http://[^\s]+)')
		if ($match.Success) {
			$launchUri = [Uri]$match.Groups[1].Value
			$token = $launchUri.Query -replace '^\?token=', ''
			if ($launchUri.Scheme -ne 'http' -or $launchUri.Host -ne $HostAddr -or
				$launchUri.Port -ne $Port -or $token -notmatch '^[A-Za-z0-9_-]{43}$') {
				Protect-StartupLog $stdoutLog
				throw 'alpha1 CLI 返回了非预期的一次性 Web 登录地址。'
			}
			Protect-StartupLog $stdoutLog
		}
	}
	if ($null -ne $launchUri) {
		try {
			$anonymousStatus = Get-HttpStatus "http://${HostAddr}:${Port}/"
			if ($anonymousStatus -eq 401) {
				$handler = [System.Net.Http.HttpClientHandler]::new()
				$handler.AllowAutoRedirect = $true
				$handler.CookieContainer = [System.Net.CookieContainer]::new()
				$candidateClient = [System.Net.Http.HttpClient]::new($handler, $true)
				$candidateClient.Timeout = [TimeSpan]::FromSeconds(5)
				$authResponse = $candidateClient.GetAsync($launchUri, [System.Net.Http.HttpCompletionOption]::ResponseHeadersRead).GetAwaiter().GetResult()
				if ([int]$authResponse.StatusCode -eq 200) {
					$authenticatedClient = $candidateClient
					$up = $true
					$authResponse.Dispose()
					break
				}
				$authResponse.Dispose()
				$candidateClient.Dispose()
			}
		} catch { }
	}
	Start-Sleep -Milliseconds 500
}
Protect-StartupLog $stdoutLog
if (-not $up) {
	if ($null -ne $authenticatedClient) { $authenticatedClient.Dispose() }
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
Write-Step "服务已恢复：匿名 HTTP 401、认证 HTTP 200，PID $($startedProcess.Id)，本地源码命令行校验通过"

$runtimeErrors = New-Object 'System.Collections.Generic.List[string]'
$skillManagerApiVersion = $null
try {
	$j = Invoke-AuthenticatedJsonPost $authenticatedClient "http://${HostAddr}:${Port}/api/skill-manager" '{"op":"list"}'
	$skillManagerApiVersion = [int]$j.value.apiVersion
	if ($skillManagerApiVersion -ge $MinimumSkillManagerApiVersion) {
		Write-Host "skill-manager host：apiVersion $skillManagerApiVersion ✓" -ForegroundColor Green
	} else {
		$runtimeErrors.Add("skill-manager apiVersion $skillManagerApiVersion 低于期望的 $MinimumSkillManagerApiVersion。")
	}
} catch {
	$runtimeErrors.Add("skill-manager API 验证失败：$($_.Exception.Message)")
}

$pluginManagerApiVersion = $null
try {
	$j = Invoke-AuthenticatedJsonPost $authenticatedClient "http://${HostAddr}:${Port}/api/plugin-manager" '{"op":"capabilities"}'
	$pluginManagerApiVersion = [int]$j.value.apiVersion
	if ($pluginManagerApiVersion -ge 1) {
		Write-Host "plugin-manager host：apiVersion $pluginManagerApiVersion ✓" -ForegroundColor Green
	} else {
		$runtimeErrors.Add("plugin-manager apiVersion $pluginManagerApiVersion 低于期望的 1。")
	}
} catch {
	$runtimeErrors.Add("plugin-manager API 验证失败：$($_.Exception.Message)")
}
$authenticatedClient.Dispose()

if ($runtimeErrors.Count -gt 0) {
	Stop-Process -Id $startedProcess.Id -Force -ErrorAction SilentlyContinue
	throw "本地运行门禁失败：$($runtimeErrors -join '；')"
}

$runtimeMetadata.anonymousHttpStatus = 401
$runtimeMetadata.authenticatedHttpStatus = 200
$runtimeMetadata.skillManagerApiVersion = $skillManagerApiVersion
$runtimeMetadata.pluginManagerApiVersion = $pluginManagerApiVersion
$runtimeMetadata.verifiedAt = (Get-Date).ToString('o')
$runtimeMetadata | ConvertTo-Json | Set-Content -LiteralPath $metadataPath -Encoding UTF8
Write-Step "重启完成"
