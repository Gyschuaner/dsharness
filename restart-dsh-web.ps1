#Requires -Version 5.1
<#
restart-dsh-web.ps1 — 一键重启 dsh web（127.0.0.1:3080）

用法：
  .\restart-dsh-web.ps1             重启并等待服务恢复，最后验证 skill-manager apiVersion
  .\restart-dsh-web.ps1 -EnableVisionBridge 为旧 profile 临时应用 DP Gateway vision_inspect 覆盖（当前 web profile 默认已启用）
  .\restart-dsh-web.ps1 -BrowserHandoffFile <临时路径> 供受控内置浏览器验收读取本次进程登录 URL
  .\restart-dsh-web.ps1 -NoLaunch   只停不启动（想自己手动起时用）
  .\restart-dsh-web.ps1 -Port 3080  端口可改（默认 3080）

行为：
  1. 校验锁定源码 tree、Node/pnpm 工具链，并在停止旧进程前干净构建本仓库插件和上游 Host/Client/Web
  2. 校验每个本地插件 export、Gateway/Session Controller/ACP/attachment/vision 构建产物和实际 web profile，拒绝复用 stale lib
  3. 直接用刚构建的 apps/cli/lib/bin.js 启动独立 Node 进程，默认隐藏窗口并把日志写入 ~/.dsh/logs
  4. 读取并立即脱敏 alpha1 一次性登录 URL，校验匿名 401、认证 HTML 的完整 boot graph、全部首屏脚本、监听 PID、实际命令行和插件 API

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
	[string]$BrowserHandoffFile,
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

function Invoke-AuthenticatedJsonGet($Client, [string]$Uri) {
	$response = $Client.GetAsync($Uri).GetAwaiter().GetResult()
	try {
		$body = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
		if ([int]$response.StatusCode -ne 200) {
			throw "HTTP $([int]$response.StatusCode)"
		}
		return $body | ConvertFrom-Json
	} finally {
		$response.Dispose()
	}
}

function Write-BrowserHandoff([string]$Path, [Uri]$LaunchUri) {
	if ([string]::IsNullOrWhiteSpace($Path)) { return }
	$tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd(
		[IO.Path]::DirectorySeparatorChar,
		[IO.Path]::AltDirectorySeparatorChar
	)
	$resolvedPath = [IO.Path]::GetFullPath($Path)
	$tempPrefix = $tempRoot + [IO.Path]::DirectorySeparatorChar
	if (-not $resolvedPath.StartsWith($tempPrefix, [StringComparison]::OrdinalIgnoreCase)) {
		throw "BrowserHandoffFile 必须位于系统临时目录：$tempRoot"
	}
	if (Test-Path -LiteralPath $resolvedPath) {
		throw "BrowserHandoffFile 已存在，拒绝覆盖：$resolvedPath"
	}
	$parent = Split-Path -Parent $resolvedPath
	if (-not (Test-Path -LiteralPath $parent -PathType Container)) {
		throw "BrowserHandoffFile 父目录不存在：$parent"
	}
	$bytes = [Text.UTF8Encoding]::new($false).GetBytes($LaunchUri.AbsoluteUri)
	$stream = [IO.File]::Open($resolvedPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
	try {
		$stream.Write($bytes, 0, $bytes.Length)
		$stream.Flush()
	} finally {
		$stream.Dispose()
	}
	Write-Step "已创建受控浏览器登录交接文件：$resolvedPath"
}

function Get-WebBootEvidence([string]$Html) {
	$match = [regex]::Match(
		$Html,
		'globalThis\["__DSH_BOOT__"\]\s*=\s*(\{.*?\})</script>',
		[Text.RegularExpressions.RegexOptions]::Singleline
	)
	if (-not $match.Success) {
		throw '认证首页没有注入 __DSH_BOOT__。'
	}
	try {
		$boot = $match.Groups[1].Value | ConvertFrom-Json
	} catch {
		throw "认证首页的 __DSH_BOOT__ 不是合法 JSON：$($_.Exception.Message)"
	}

	$entries = @($boot.entries)
	$batches = @($boot.batches)
	$clientModulesId = '@deepseek-ai/dsh-client-modules'
	$clientModulesEntries = @($entries | Where-Object { $_.id -eq $clientModulesId })
	$bootstrapBatches = @($batches | Where-Object { $_.phase -eq 'bootstrap' })
	$applicationBatches = @($batches | Where-Object { $_.phase -eq 'application' })
	$clientModulesBatches = @($bootstrapBatches | Where-Object { @($_.entries) -contains $clientModulesId })

	if ($entries.Count -eq 0) { throw '认证首页的 client boot graph entries 为空。' }
	if ($batches.Count -eq 0) { throw '认证首页的 client boot graph batches 为空。' }
	if ($clientModulesEntries.Count -ne 1) { throw "client boot graph 中应有且只有一个 $clientModulesId entry。" }
	if ($clientModulesBatches.Count -ne 1) { throw "$clientModulesId 未进入唯一 bootstrap batch。" }
	if ($applicationBatches.Count -eq 0) { throw 'client boot graph 缺少 application batch。' }
	if (-not $Html.Contains("$clientModulesId/client.js")) {
		throw "认证首页 HTML 没有预加载 $clientModulesId/client.js。"
	}

	return [pscustomobject]@{
		Graph = $boot
		EntryCount = $entries.Count
		BatchCount = $batches.Count
		BootstrapBatchCount = $bootstrapBatches.Count
		ApplicationBatchCount = $applicationBatches.Count
		ClientModulesPreloaded = $true
	}
}

function Assert-WebBootBatches($Client, [string]$BaseUri, $Evidence) {
	$verified = 0
	foreach ($batch in @($Evidence.Graph.batches)) {
		if ([string]::IsNullOrWhiteSpace([string]$batch.url)) {
			throw "client boot batch $($batch.rev) 缺少 URL。"
		}
		$batchUri = [Uri]::new([Uri]$BaseUri, [string]$batch.url)
		$response = $Client.GetAsync($batchUri).GetAwaiter().GetResult()
		try {
			$body = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
			if ([int]$response.StatusCode -ne 200) {
				throw "client boot batch $($batch.phase) 返回 HTTP $([int]$response.StatusCode)：$batchUri"
			}
			if ([string]::IsNullOrWhiteSpace($body)) {
				throw "client boot batch $($batch.phase) 返回了空脚本：$batchUri"
			}
			$verified += 1
		} finally {
			$response.Dispose()
		}
	}
	return $verified
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
$localPluginArtifacts = @()
$localPluginPnpmVersion = $null
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

	$repoPackage = Get-Content -LiteralPath (Join-Path $RepoRoot 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
	if ($repoPackage.packageManager -notmatch '^pnpm@(.+)$') {
		throw "本仓库 package.json 必须锁定 pnpm packageManager，当前为：$($repoPackage.packageManager)"
	}
	$expectedLocalPluginPnpmVersion = $Matches[1]
	$previousLocation = Get-Location
	try {
		Set-Location -LiteralPath $RepoRoot
		$localPluginPnpmVersion = (& $corepack.Source pnpm --version).Trim()
	} finally {
		Set-Location -LiteralPath $previousLocation
	}
	if ($localPluginPnpmVersion -ne $expectedLocalPluginPnpmVersion) {
		throw "本仓库插件 pnpm 版本必须是 $expectedLocalPluginPnpmVersion，当前为 $localPluginPnpmVersion。"
	}

	Write-Step "同步锁定依赖并干净构建本仓库插件"
	$previousCi = $env:CI
	try {
		$env:CI = 'true'
		Invoke-Native $corepack.Source @('pnpm', 'install', '--frozen-lockfile') $RepoRoot
		Invoke-Native $corepack.Source @('pnpm', 'run', 'clean') $RepoRoot
		Invoke-Native $corepack.Source @('pnpm', 'run', 'build') $RepoRoot
	} finally {
		$env:CI = $previousCi
	}

	$pluginPackageFiles = @(Get-ChildItem -LiteralPath (Join-Path $RepoRoot 'plugins') -Directory | ForEach-Object {
		Join-Path $_.FullName 'package.json'
	} | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf })
	foreach ($pluginPackageFile in $pluginPackageFiles) {
		$pluginPackage = Get-Content -LiteralPath $pluginPackageFile -Raw -Encoding UTF8 | ConvertFrom-Json
		foreach ($export in $pluginPackage.exports.PSObject.Properties) {
			if ($export.Value -isnot [string] -or -not $export.Value.StartsWith('./lib/', [StringComparison]::Ordinal)) { continue }
			$relativeArtifact = $export.Value.Substring(2).Replace('/', [IO.Path]::DirectorySeparatorChar)
			$artifact = Join-Path (Split-Path -Parent $pluginPackageFile) $relativeArtifact
			if (-not (Test-Path -LiteralPath $artifact -PathType Leaf)) {
				throw "本仓库插件构建完成但缺少 export 产物：$($pluginPackage.name) $($export.Name) -> $artifact"
			}
			$localPluginArtifacts += [ordered]@{
				package = $pluginPackage.name
				export = $export.Name
				path = [IO.Path]::GetFullPath($artifact)
				sha256 = (Get-FileHash -LiteralPath $artifact -Algorithm SHA256).Hash
			}
		}
	}
	if ($localPluginArtifacts.Count -eq 0) {
		throw '本仓库插件构建未发现任何 lib export 产物。'
	}
	$shadowBillingHostBundle = Join-Path $RepoRoot 'plugins\shadow-billing\lib\index.js'
	$shadowBillingFoldBundle = Join-Path $RepoRoot 'plugins\shadow-billing\lib\fold.js'
	$shadowBillingClientBundle = Join-Path $RepoRoot 'plugins\shadow-billing\lib\client.js'
	$shadowBillingHostText = Get-Content -LiteralPath $shadowBillingHostBundle -Raw -Encoding UTF8
	$shadowBillingFoldText = Get-Content -LiteralPath $shadowBillingFoldBundle -Raw -Encoding UTF8
	$shadowBillingClientText = Get-Content -LiteralPath $shadowBillingClientBundle -Raw -Encoding UTF8
	if ($shadowBillingHostText -notmatch 'repaired' -or $shadowBillingFoldText -notmatch 'repairUnknownUsage') {
		throw "shadow-billing Host 产物未包含 alpha1 unknown 修复链路：$shadowBillingHostBundle / $shadowBillingFoldBundle"
	}
	if (($shadowBillingClientText -notmatch 'extension\.manager\.section') -or ($shadowBillingClientText -notmatch "id:\s*'billing'") -or ($shadowBillingClientText -match 'conversation\.session\.header\.utilities|conversation\.view|sb-badge')) {
		throw "shadow-billing Client 产物必须只把 Billing 注册到扩展区：$shadowBillingClientBundle"
	}
	if (($shadowBillingClientText -notmatch 'billing-dashboard') -or ($shadowBillingClientText -notmatch 'Token 用量') -or
		($shadowBillingClientText -notmatch 'bl-chartTooltip') -or ($shadowBillingClientText -notmatch 'data-billing-bar') -or
		($shadowBillingClientText -notmatch '¥1\.50') -or ($shadowBillingClientText -notmatch '¥4\.50')) {
		throw "shadow-billing Client 产物未包含 DSH-032 定稿仪表盘或当前价目：$shadowBillingClientBundle"
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
	$uiChatBundle = Join-Path $buildSourceDirectory 'packages\client\ui-chat\lib\client.js'
	$uiToolBundle = Join-Path $buildSourceDirectory 'packages\client\ui-tool\lib\client.js'
	foreach ($artifact in @($cliEntry, $gatewayBundle, $sessionControllerBundle, $acpBundle, $attachmentLocalBundle, $visionBundle, $uiChatBundle, $uiToolBundle)) {
		if (-not (Test-Path -LiteralPath $artifact -PathType Leaf)) {
			throw "构建完成但缺少产物：$artifact"
		}
	}
	$gatewayBundleText = Get-Content -LiteralPath $gatewayBundle -Raw -Encoding UTF8
	$sessionControllerBundleText = Get-Content -LiteralPath $sessionControllerBundle -Raw -Encoding UTF8
	$acpBundleText = Get-Content -LiteralPath $acpBundle -Raw -Encoding UTF8
	$attachmentLocalBundleText = Get-Content -LiteralPath $attachmentLocalBundle -Raw -Encoding UTF8
	$visionBundleText = Get-Content -LiteralPath $visionBundle -Raw -Encoding UTF8
	$uiChatBundleText = Get-Content -LiteralPath $uiChatBundle -Raw -Encoding UTF8
	$uiToolBundleText = Get-Content -LiteralPath $uiToolBundle -Raw -Encoding UTF8
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
	if ($uiChatBundleText -notmatch 'tool-activity' -or $uiChatBundleText -notmatch 'activityStartTime') {
		throw "ui-chat 构建产物未包含流式工具计时起点桥接：$uiChatBundle"
	}
	if ($uiChatBundleText -notmatch 'data-reasoning-activity' -or $uiChatBundleText -notmatch 'reasoningTimings') {
		throw "ui-chat 构建产物未包含思考读秒与流式时序投影：$uiChatBundle"
	}
	if ($uiToolBundleText -notmatch 'activityStartedTime' -or $uiToolBundleText -notmatch 'node\.data\.startedTime') {
		throw "ui-tool 构建产物未从流式活动起点计算耗时：$uiToolBundle"
	}
	if ($uiToolBundleText -notmatch 'callHead' -or $uiToolBundleText -notmatch 'column-gap:8px' -or
		$uiToolBundleText -notmatch 'justify-content:flex-start' -or $uiToolBundleText -match 'data-has-tool-timer') {
		throw "ui-tool 构建产物未把工具耗时恢复为标题/摘要后的内联布局：$uiToolBundle"
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
		localPluginPnpmVersion = $localPluginPnpmVersion
		localPluginArtifacts = $localPluginArtifacts
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
	clientBootEntryCount = $null
	clientBootBatchCount = $null
	clientBootBatchHttp200Count = $null
	clientModulesPreloaded = $null
	skillManagerApiVersion = $null
	pluginManagerApiVersion = $null
	shadowBillingRepairCount = $null
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
$webBootEvidence = $null
$webBootBatchHttp200Count = $null
$startupGateError = $null
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
			Write-BrowserHandoff $BrowserHandoffFile $launchUri
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
				$authResponse = $candidateClient.GetAsync($launchUri).GetAwaiter().GetResult()
				if ([int]$authResponse.StatusCode -eq 200) {
					try {
						$authHtml = $authResponse.Content.ReadAsStringAsync().GetAwaiter().GetResult()
						$webBootEvidence = Get-WebBootEvidence $authHtml
						$webBootBatchHttp200Count = Assert-WebBootBatches $candidateClient "http://${HostAddr}:${Port}/" $webBootEvidence
						$authenticatedClient = $candidateClient
						$up = $true
					} catch {
						$startupGateError = $_.Exception.Message
						$candidateClient.Dispose()
					} finally {
						$authResponse.Dispose()
					}
					break
				}
				$authResponse.Dispose()
				$candidateClient.Dispose()
			}
		} catch {
			$startupGateError = $_.Exception.Message
			break
		}
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
	$gateDetail = if ([string]::IsNullOrWhiteSpace($startupGateError)) { '' } else { "启动门禁：$startupGateError；" }
	throw "服务未在限定时间内恢复。${gateDetail}stderr 尾部：$stderrTail"
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
Write-Step "服务已恢复：匿名 HTTP 401、认证 HTTP 200、boot graph $($webBootEvidence.EntryCount) entries/$($webBootEvidence.BatchCount) batches（全部脚本 HTTP 200），PID $($startedProcess.Id)，本地源码命令行校验通过"

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

$shadowBillingRepairCount = $null
try {
	$shadowStatusDeadline = (Get-Date).AddSeconds(5)
	$shadowStatus = $null
	do {
		$shadowStatus = Invoke-AuthenticatedJsonGet $authenticatedClient "http://${HostAddr}:${Port}/api/shadow-billing/status"
		$lastFold = $shadowStatus.value.lastFold
		if ($null -ne $lastFold -and $lastFold.PSObject.Properties.Name -contains 'repaired') { break }
		Start-Sleep -Milliseconds 100
	} while ((Get-Date) -lt $shadowStatusDeadline)
	if ($null -eq $lastFold -or $lastFold.PSObject.Properties.Name -notcontains 'repaired') {
		$runtimeErrors.Add('shadow-billing Host 未加载带 repaired 字段的最新 alpha1 折叠实现。')
	} else {
		$shadowBillingRepairCount = [int]$lastFold.repaired
		Write-Host "shadow-billing host：repaired $shadowBillingRepairCount ✓" -ForegroundColor Green
	}
} catch {
	$runtimeErrors.Add("shadow-billing API 验证失败：$($_.Exception.Message)")
}
$authenticatedClient.Dispose()

if ($runtimeErrors.Count -gt 0) {
	Stop-Process -Id $startedProcess.Id -Force -ErrorAction SilentlyContinue
	throw "本地运行门禁失败：$($runtimeErrors -join '；')"
}

$runtimeMetadata.anonymousHttpStatus = 401
$runtimeMetadata.authenticatedHttpStatus = 200
$runtimeMetadata.clientBootEntryCount = $webBootEvidence.EntryCount
$runtimeMetadata.clientBootBatchCount = $webBootEvidence.BatchCount
$runtimeMetadata.clientBootBatchHttp200Count = $webBootBatchHttp200Count
$runtimeMetadata.clientModulesPreloaded = $webBootEvidence.ClientModulesPreloaded
$runtimeMetadata.skillManagerApiVersion = $skillManagerApiVersion
$runtimeMetadata.pluginManagerApiVersion = $pluginManagerApiVersion
$runtimeMetadata.shadowBillingRepairCount = $shadowBillingRepairCount
$runtimeMetadata.verifiedAt = (Get-Date).ToString('o')
$runtimeMetadata | ConvertTo-Json | Set-Content -LiteralPath $metadataPath -Encoding UTF8
Write-Step "重启完成"
