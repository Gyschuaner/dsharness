#Requires -Version 5.1
[CmdletBinding()]
param(
    [string]$SourceDirectory,
    [int]$Port = 3080,
    [switch]$RequireWeb,
    [switch]$SkipCliVersion
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent $PSScriptRoot
$Lock = Get-Content -LiteralPath (Join-Path $RepoRoot 'upstream.lock.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if ([string]::IsNullOrWhiteSpace($SourceDirectory)) {
    $SourceDirectory = Join-Path (Split-Path -Parent $RepoRoot) 'deepseek-harness'
}
$SourceDirectory = [IO.Path]::GetFullPath($SourceDirectory)

$Failures = New-Object 'System.Collections.Generic.List[string]'
function Check([bool]$Condition, [string]$Message) {
    if ($Condition) {
        Write-Host "[ok] $Message" -ForegroundColor Green
    } else {
        Write-Host "[fail] $Message" -ForegroundColor Red
        $Failures.Add($Message)
    }
}

function Read-Text([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return '' }
    return Get-Content -LiteralPath $Path -Raw -Encoding UTF8
}

function Get-GitTree([string]$Path) {
    $tree = (& git -C $Path rev-parse 'HEAD^{tree}').Trim()
    if ($LASTEXITCODE -ne 0) { return '' }
    return $tree
}

function Get-HttpStatus([string]$Uri) {
    $Client = [System.Net.Http.HttpClient]::new()
    try {
        $Client.Timeout = [TimeSpan]::FromSeconds(5)
        $Response = $Client.GetAsync($Uri, [System.Net.Http.HttpCompletionOption]::ResponseHeadersRead).GetAwaiter().GetResult()
        try { return [int]$Response.StatusCode } finally { $Response.Dispose() }
    } finally {
        $Client.Dispose()
    }
}

$NodeCommand = Get-Command node -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
$NodeVersion = ''
if ($NodeCommand) {
    $NodeVersion = (& $NodeCommand.Source --version).Trim().TrimStart('v')
}
Check ($NodeVersion -eq $Lock.nodeVersion) "Node $($Lock.nodeVersion)"

$PnpmVersion = ''
if ($NodeCommand -and (Get-Command corepack -CommandType Application -ErrorAction SilentlyContinue)) {
    $PreviousLocation = Get-Location
    try {
        Set-Location -LiteralPath $SourceDirectory
        $PnpmVersion = (& corepack pnpm --version 2>$null).Trim()
    } catch {
        $PnpmVersion = ''
    } finally {
        Set-Location -LiteralPath $PreviousLocation
    }
}
Check ($PnpmVersion -eq $Lock.pnpmVersion) "pnpm $($Lock.pnpmVersion)"

$GitDirectory = Join-Path $SourceDirectory '.git'
Check (Test-Path -LiteralPath $GitDirectory) "源码目录是 Git 仓库：$SourceDirectory"
if (Test-Path -LiteralPath $GitDirectory) {
    $Tree = Get-GitTree $SourceDirectory
    Check ($Tree -eq $Lock.resultTree) "源码 tree $($Lock.resultTree)"
    $Status = @(& git -C $SourceDirectory status --porcelain=v1 --untracked-files=all)
    $TrackedDirty = @($Status | Where-Object { $_ -and $_ -notmatch '^\?\? ' })
    Check ($TrackedDirty.Count -eq 0) '源码工作区无已跟踪文件修改'
    $Untracked = @($Status | Where-Object { $_ -and $_ -match '^\?\? ' })
    if ($Untracked.Count -gt 0) {
        Write-Host "[warn] 忽略未跟踪文件（不参与锁定 tree）：$($Untracked -join '; ')" -ForegroundColor Yellow
    }
}

foreach ($Patch in $Lock.patches) {
    $PatchPath = Join-Path $RepoRoot $Patch.path
    $HashMatches = $false
    if (Test-Path -LiteralPath $PatchPath -PathType Leaf) {
        $ActualHash = (Get-FileHash -LiteralPath $PatchPath -Algorithm SHA256).Hash.ToUpperInvariant()
        $HashMatches = $ActualHash -eq $Patch.sha256.ToUpperInvariant()
    }
    Check $HashMatches "补丁校验 $($Patch.path)"
}

$RootPackage = Read-Text (Join-Path $SourceDirectory 'package.json')
Check ($RootPackage -match '"version"\s*:\s*"0\.1\.2-alpha\.1"') '源码版本 0.1.2-alpha.1'
Check ($RootPackage -match '"packageManager"\s*:\s*"pnpm@11\.7\.0"') '源码 packageManager 为 pnpm@11.7.0'

$CliEntry = Join-Path $SourceDirectory 'apps/cli/lib/bin.js'
$GatewaySource = Join-Path $SourceDirectory 'packages/api/gateway/src/index.ts'
$GatewayBundle = Join-Path $SourceDirectory 'packages/api/gateway/lib/index.js'
$SessionControllerSource = Join-Path $SourceDirectory 'packages/api/session-controller/src/commands.ts'
$SessionControllerBundle = Join-Path $SourceDirectory 'packages/api/session-controller/lib/index.js'
$AcpSource = Join-Path $SourceDirectory 'packages/acp/acp/src/index.ts'
$AcpBundle = Join-Path $SourceDirectory 'packages/acp/acp/lib/index.js'
$AttachmentSource = Join-Path $SourceDirectory 'packages/attachment/attachment-local/src/index.ts'
$AttachmentBundle = Join-Path $SourceDirectory 'packages/attachment/attachment-local/lib/index.js'
$DeepSeekAdapterSource = Join-Path $SourceDirectory 'packages/llm/llm-deepseek/src/adapter.ts'
$DeepSeekAdapterBundle = Join-Path $SourceDirectory 'packages/llm/llm-deepseek/lib/index.js'
$VisionSourcePath = Join-Path $SourceDirectory 'packages/vision/vision-bridge/src/index.ts'
$VisionBundlePath = Join-Path $SourceDirectory 'packages/vision/vision-bridge/lib/index.js'
$VisionRowPath = Join-Path $SourceDirectory 'packages/vision/vision-bridge/src/client/VisionInspectRow.tsx'
$VisionStylePath = Join-Path $SourceDirectory 'packages/vision/vision-bridge/src/client/VisionInspectRow.module.css'
$VisionThrottlePath = Join-Path $SourceDirectory 'packages/vision/vision-bridge/src/client/use-throttled-visual-update.ts'
$BaseCordisPath = Join-Path $SourceDirectory 'packages/bundle/base/cordis.patch.yml'
$ToolTypesPath = Join-Path $SourceDirectory 'packages/core/tools/src/types.ts'
$KnownEventsPath = Join-Path $SourceDirectory 'packages/core/session/src/known-event-types.ts'

$Artifacts = [ordered]@{
    'CLI' = $CliEntry
    'Gateway' = $GatewayBundle
    'Session Controller' = $SessionControllerBundle
    'ACP' = $AcpBundle
    'attachment-local' = $AttachmentBundle
    'vision-bridge' = $VisionBundlePath
}
foreach ($Artifact in $Artifacts.GetEnumerator()) {
    Check (Test-Path -LiteralPath $Artifact.Value -PathType Leaf) "$($Artifact.Key) 构建产物存在"
}

$VisionSource = Read-Text $VisionSourcePath
$VisionBundle = Read-Text $VisionBundlePath
Check (Test-Path -LiteralPath $VisionSourcePath -PathType Leaf) 'vision-bridge 源码存在'
Check ($VisionSource -match 'ctx\.provide\(''imageInputBridge''') 'vision-bridge 源码提供 imageInputBridge'
Check ($VisionSource -match 'stream:\s*true' -and $VisionSource -match 'exec\.reportProgress\(') 'vision-bridge 源码使用 SSE progress'
Check ($VisionSource -match 'vision/image-import' -and $VisionSource -match 'imageHostPath') 'vision-bridge 源码使用原生图片引用事件与路径'
Check ($VisionSource -match 'Qwen3\.8-Flash-Next-FP8') 'vision-bridge 源码默认视觉模型为 Qwen3.8-Flash-Next-FP8'
Check ($VisionBundle -match 'imageInputBridge' -and $VisionBundle -match 'reportProgress') 'vision-bridge 构建产物包含准入与 progress'
Check ($VisionBundle -match 'vision/image-import' -and $VisionBundle -match 'Qwen3\.8-Flash-Next-FP8') 'vision-bridge 构建产物包含事件与模型'
Check (Test-Path -LiteralPath $VisionRowPath -PathType Leaf) 'vision-bridge Look 行源码存在'
Check (Test-Path -LiteralPath $VisionStylePath -PathType Leaf) 'vision-bridge Look 行样式存在'
Check (Test-Path -LiteralPath $VisionThrottlePath -PathType Leaf) 'vision-bridge 流式更新节流源码存在'

$AttachmentSourceText = Read-Text $AttachmentSource
$AttachmentBundleText = Read-Text $AttachmentBundle
Check ($AttachmentSourceText -match 'imageHostPath' -and $AttachmentSourceText -match 'readImageRequest') 'attachment-local 源码提供宿主路径与请求图片投影'
Check ($AttachmentBundleText -match 'imageHostPath' -and $AttachmentBundleText -match 'readImageRequest') 'attachment-local 构建产物提供宿主路径与请求图片投影'
$DeepSeekAdapterSourceText = Read-Text $DeepSeekAdapterSource
$DeepSeekAdapterBundleText = Read-Text $DeepSeekAdapterBundle
Check ($DeepSeekAdapterSourceText -match 'readImageRequest') 'DeepSeek 原生适配器源码接入请求图片投影'
Check ($DeepSeekAdapterBundleText -match 'readImageRequest') 'DeepSeek 原生适配器构建产物接入请求图片投影'

$SessionControllerSourceText = Read-Text $SessionControllerSource
$SessionControllerBundleText = Read-Text $SessionControllerBundle
Check ($SessionControllerSourceText -match 'MODEL_DOES_NOT_SUPPORT_IMAGES') 'Session Controller 源码保留模型图片能力拒绝原因'
Check ($SessionControllerBundleText -match 'MODEL_DOES_NOT_SUPPORT_IMAGES') 'Session Controller 构建产物保留模型图片能力拒绝原因'
Check ((Read-Text $GatewaySource) -match 'TypertRemote|TypertRemoteService|WebSocket|websocket') 'Gateway 源码为 alpha1 Typert Remote 入口'
Check ((Read-Text $AcpSource) -match 'supportsAcpImagePrompts|PromptRequest') 'ACP 源码保留图片 prompt 能力'

$ToolTypes = Read-Text $ToolTypesPath
$KnownEvents = Read-Text $KnownEventsPath
Check ($ToolTypes -match "'tool/progress'\s*:\s*ToolProgressEventData") 'Tool progress 事件类型已登记'
Check ($KnownEvents -match "'tool/progress'" -and $KnownEvents -match "'vision/image-import'") 'Tool progress 与视觉导入事件已登记到持久化词表'

$BaseCordis = Read-Text $BaseCordisPath
$VisionRowMatch = [regex]::Match($BaseCordis, '(?ms)- id:\s*vision-bridge.*?(?=\r?\n\s*- id:|\z)')
Check ($VisionRowMatch.Success) 'base bundle 包含 vision-bridge 行'
if ($VisionRowMatch.Success) {
    $VisionRow = $VisionRowMatch.Value
    Check ($VisionRow -match 'disabled:\s*false') 'base bundle 默认启用 vision-bridge'
    Check ($VisionRow -match 'Qwen3\.8-Flash-Next-FP8') 'base bundle 固定 Qwen3.8-Flash-Next-FP8'
    Check ($VisionRow -match 'ai\.chuansgu\.top/v1') 'base bundle 包含 DP Gateway 默认地址'
}
Check (-not (Test-Path -LiteralPath (Join-Path $RepoRoot 'plugins/image-context-guard'))) 'image-context-guard 已从源码目录移除'
Check ($BaseCordis -notmatch 'image-context-guard') 'base bundle 不再加载 image-context-guard'

if (Test-Path -LiteralPath $CliEntry -PathType Leaf) {
    $ConfigDump = (& $NodeCommand.Source $CliEntry --profile web --dump-config 2>&1 | Out-String)
    $ConfigExitCode = $LASTEXITCODE
    Check ($ConfigExitCode -eq 0) 'alpha1 CLI 可以读取 web profile 配置'
    if ($ConfigExitCode -eq 0) {
        Check ($ConfigDump -match '(?ms)- id:\s*vision-bridge.*?disabled:\s*false') 'web profile 默认启用 vision-bridge'
        Check ($ConfigDump -match 'Qwen3\.8-Flash-Next-FP8') 'web profile 视觉模型为 Qwen3.8-Flash-Next-FP8'
        Check ($ConfigDump -match 'ai\.chuansgu\.top/v1') 'web profile 视觉请求走 DP Gateway'
        Check ($ConfigDump -notmatch 'image-context-guard') 'web profile 不包含 image-context-guard'
        foreach ($PluginId in @('extension-manager', 'skill-manager', 'plugin-manager', 'mcp-manager', 'better-sidebar-smooth', 'vision-bridge')) {
            Check ($ConfigDump -match "id:\s*$([regex]::Escape($PluginId))") "web profile 默认插件行 $PluginId"
        }
    }
}

if (-not $SkipCliVersion) {
    $DshCommand = Get-Command dsh -ErrorAction SilentlyContinue
    if ($DshCommand) {
        $DshVersion = (& dsh --version).Trim()
        Check ($DshVersion -eq $Lock.dshVersion) "dsh $($Lock.dshVersion)"
    } else {
        Check $false 'dsh 命令已注册'
    }
}

if ($RequireWeb) {
    try {
        $AnonymousStatus = Get-HttpStatus "http://127.0.0.1:$Port/"
        Check ($AnonymousStatus -eq 401) "dsh web 端口 $Port 匿名访问返回 HTTP 401"
    } catch {
        Check $false "dsh web 端口 $Port 可访问"
    }

    $RuntimeMetadataPath = Join-Path $env:USERPROFILE ".dsh\logs\dsh-web-$Port.latest.json"
    Check (Test-Path -LiteralPath $RuntimeMetadataPath -PathType Leaf) "dsh web 端口 $Port 运行元数据存在"
    if (Test-Path -LiteralPath $RuntimeMetadataPath -PathType Leaf) {
        $RuntimeMetadata = Get-Content -LiteralPath $RuntimeMetadataPath -Raw -Encoding UTF8 | ConvertFrom-Json
        Check ([int]$RuntimeMetadata.anonymousHttpStatus -eq 401) '运行元数据记录匿名 HTTP 401'
        Check ([int]$RuntimeMetadata.authenticatedHttpStatus -eq 200) '运行元数据记录认证 HTTP 200'
        Check ([int]$RuntimeMetadata.skillManagerApiVersion -ge 6) '运行元数据记录 skill-manager apiVersion >= 6'
        Check ([int]$RuntimeMetadata.pluginManagerApiVersion -ge 1) '运行元数据记录 plugin-manager apiVersion >= 1'
        Check ($RuntimeMetadata.sourceTree -eq $Lock.resultTree) '运行元数据源码 tree 与锁文件一致'
        Check ($RuntimeMetadata.expectedTree -eq $Lock.resultTree) '运行元数据期望 tree 与锁文件一致'
        Check ([IO.Path]::GetFullPath([string]$RuntimeMetadata.buildDirectory) -eq $SourceDirectory) '运行元数据构建目录与本次校验目录一致'
        $Listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
        Check ($null -ne $Listener -and [int]$Listener.OwningProcess -eq [int]$RuntimeMetadata.pid) '运行元数据 PID 与监听进程一致'
    }
}

if ($Failures.Count -gt 0) {
    throw "DSH alpha1 锁定源码、构建产物或运行入口校验失败，共 $($Failures.Count) 项。"
}

Write-Host 'DSH 0.1.2-alpha.1 锁定源码、原生图片链路、插件组合与运行入口校验通过。' -ForegroundColor Cyan
