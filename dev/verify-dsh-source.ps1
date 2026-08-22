#Requires -Version 5.1
[CmdletBinding()]
param(
    [string]$SourceDirectory,
    [int]$Port = 3080,
    [switch]$RequireWeb
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent $PSScriptRoot
$Lock = Get-Content -LiteralPath (Join-Path $RepoRoot 'upstream.lock.json') -Raw | ConvertFrom-Json
if ([string]::IsNullOrWhiteSpace($SourceDirectory)) {
    $SourceDirectory = Join-Path (Split-Path -Parent $RepoRoot) 'deepseek-harness'
}
$SourceDirectory = [IO.Path]::GetFullPath($SourceDirectory)

$Failures = New-Object System.Collections.Generic.List[string]
function Check([bool]$Condition, [string]$Message) {
    if ($Condition) {
        Write-Host "[ok] $Message" -ForegroundColor Green
    } else {
        Write-Host "[fail] $Message" -ForegroundColor Red
        $Failures.Add($Message)
    }
}

Check ((& node --version).Trim().TrimStart('v') -eq $Lock.nodeVersion) "Node $($Lock.nodeVersion)"
$PreviousLocation = Get-Location
try {
    Set-Location -LiteralPath $SourceDirectory
    $PnpmVersion = (& corepack pnpm --version).Trim()
}
finally {
    Set-Location -LiteralPath $PreviousLocation
}
Check ($PnpmVersion -eq $Lock.pnpmVersion) "pnpm $($Lock.pnpmVersion)"
Check (Test-Path -LiteralPath (Join-Path $SourceDirectory '.git')) "源码目录是 Git 仓库：$SourceDirectory"

if (Test-Path -LiteralPath (Join-Path $SourceDirectory '.git')) {
    $Tree = (& git -C $SourceDirectory rev-parse 'HEAD^{tree}').Trim()
    Check ($Tree -eq $Lock.resultTree) "源码树 $($Lock.resultTree)"
    $Dirty = @(& git -C $SourceDirectory status --porcelain)
    Check ($Dirty.Count -eq 0) '源码工作区无未提交修改'
}

foreach ($Patch in $Lock.patches) {
    $PatchPath = Join-Path $RepoRoot $Patch.path
    $HashMatches = (Test-Path -LiteralPath $PatchPath -PathType Leaf) -and ((Get-FileHash -LiteralPath $PatchPath -Algorithm SHA256).Hash -eq $Patch.sha256)
    Check $HashMatches "补丁校验 $($Patch.path)"
}

$CompactionConfigPath = Join-Path $SourceDirectory 'packages/compaction/compaction-basic/src/config.ts'
$CompactionBundlePath = Join-Path $SourceDirectory 'packages/compaction/compaction-basic/lib/index.js'
if (Test-Path -LiteralPath $CompactionConfigPath -PathType Leaf) {
    $CompactionConfig = Get-Content -LiteralPath $CompactionConfigPath -Raw -Encoding UTF8
    Check ($CompactionConfig -match 'maxTokens:\s*config\.maxTokens\s*\?\?\s*32768') 'Compact 源码默认摘要预算为 32768 tokens'
} else {
    Check $false 'Compact 源码配置存在'
}
if (Test-Path -LiteralPath $CompactionBundlePath -PathType Leaf) {
    $CompactionBundle = Get-Content -LiteralPath $CompactionBundlePath -Raw -Encoding UTF8
    Check ($CompactionBundle -match 'maxTokens:\s*config\.maxTokens\s*\?\?\s*32768') 'Compact 构建产物默认摘要预算为 32768 tokens'
} else {
    Check $false 'Compact 构建产物存在'
}

$QwenPresetDirectory = Join-Path $SourceDirectory 'apps/cli/config/agent-presets/qwen-native'
$QwenCompositionPath = Join-Path $QwenPresetDirectory 'agent.cordis.yml'
$QwenMetadataPath = Join-Path $QwenPresetDirectory 'preset.yml'
Check (Test-Path -LiteralPath $QwenCompositionPath -PathType Leaf) '内置 qwen-native composition'
Check (Test-Path -LiteralPath $QwenMetadataPath -PathType Leaf) '内置 qwen-native 元数据'
if ((Test-Path -LiteralPath $QwenCompositionPath -PathType Leaf) -and (Test-Path -LiteralPath $QwenMetadataPath -PathType Leaf)) {
    $QwenComposition = Get-Content -LiteralPath $QwenCompositionPath -Raw -Encoding UTF8
    $QwenMetadata = Get-Content -LiteralPath $QwenMetadataPath -Raw -Encoding UTF8
    Check ($QwenComposition -match 'You are Qwen' -and $QwenComposition -match '\{\{model\}\}' -and $QwenComposition -match '\{\{cwd\}\}') 'qwen-native persona 变量完整'
    Check ($QwenMetadata -match '(?m)^name:\s*Qwen 原生模式\s*$') 'qwen-native 显示名称'
}

$VisionBridgeSourcePath = Join-Path $SourceDirectory 'packages/vision/vision-bridge/src/index.ts'
$VisionBridgeBundlePath = Join-Path $SourceDirectory 'packages/vision/vision-bridge/lib/index.js'
$VisionBridgeRowPath = Join-Path $SourceDirectory 'packages/vision/vision-bridge/src/client/VisionInspectRow.tsx'
$ToolEventTypesPath = Join-Path $SourceDirectory 'packages/core/tools/src/types.ts'
$KnownEventTypesPath = Join-Path $SourceDirectory 'packages/core/session/src/known-event-types.ts'
$BaseCordisPatchPath = Join-Path $SourceDirectory 'packages/bundle/base/cordis.patch.yml'
Check (Test-Path -LiteralPath $VisionBridgeSourcePath -PathType Leaf) 'DSH-005 vision-bridge 源码存在'
Check (Test-Path -LiteralPath $VisionBridgeBundlePath -PathType Leaf) 'DSH-005 vision-bridge 构建产物存在'
if (Test-Path -LiteralPath $VisionBridgeSourcePath -PathType Leaf) {
    $VisionBridgeSource = Get-Content -LiteralPath $VisionBridgeSourcePath -Raw -Encoding UTF8
    Check ($VisionBridgeSource -match 'stream:\s*true' -and $VisionBridgeSource -match 'exec\.reportProgress\(delta\)') 'DSH-020 视觉层使用 SSE 并上报流式进度'
}
if (Test-Path -LiteralPath $VisionBridgeRowPath -PathType Leaf) {
    $VisionBridgeRow = Get-Content -LiteralPath $VisionBridgeRowPath -Raw -Encoding UTF8
    Check ($VisionBridgeRow -match 'title="Look"' -and $VisionBridgeRow -match 'progressText' -and $VisionBridgeRow -match '>ing<') 'DSH-020 Look ing 行消费视觉流式进度'
} else {
    Check $false 'DSH-020 vision-inspect 客户端呈现存在'
}
if ((Test-Path -LiteralPath $ToolEventTypesPath -PathType Leaf) -and (Test-Path -LiteralPath $KnownEventTypesPath -PathType Leaf)) {
    $ToolEventTypes = Get-Content -LiteralPath $ToolEventTypesPath -Raw -Encoding UTF8
    $KnownEventTypes = Get-Content -LiteralPath $KnownEventTypesPath -Raw -Encoding UTF8
    Check ($ToolEventTypes -match "'tool/progress':\s*ToolProgressEventData" -and $ToolEventTypes -match 'deriveMessages\(\).*ignores it' -and $KnownEventTypes -match "'tool/progress'") 'DSH-020 tool/progress 可回放且不进入模型消息'
} else {
    Check $false 'DSH-020 tool/progress 事件定义存在'
}
if (Test-Path -LiteralPath $BaseCordisPatchPath -PathType Leaf) {
    $BaseCordisPatch = Get-Content -LiteralPath $BaseCordisPatchPath -Raw -Encoding UTF8
    Check ($BaseCordisPatch -match '(?s)id:\s*vision-bridge.*?disabled:\s*true.*?model:\s*Qwen3\.6-35B-A3B') 'vision-bridge 在 base bundle 中默认关闭'
} else {
    Check $false 'Base Cordis 配置存在'
}

$VisionGatewayOverlayPath = Join-Path $RepoRoot 'dev/vision-bridge.dp-gateway.patch.yml'
if (Test-Path -LiteralPath $VisionGatewayOverlayPath -PathType Leaf) {
    $VisionGatewayOverlay = Get-Content -LiteralPath $VisionGatewayOverlayPath -Raw -Encoding UTF8
    Check ($VisionGatewayOverlay -match "baseURL:\s*'https://ai\.chuansgu\.top/v1'") '视觉桥固定通过 DP Gateway'
    Check ($VisionGatewayOverlay -match '(?m)^\s*apiKeyEnv:\s*DPGATEWAY_API_KEY\s*$') '视觉桥使用 DPGATEWAY_API_KEY 凭据引用'
    Check ($VisionGatewayOverlay -match '(?m)^\s*model:\s*Qwen3\.6-35B-A3B\s*$') '视觉桥目标模型为 Qwen3.6-35B-A3B'
} else {
    Check $false 'DP Gateway profile 覆盖存在'
}

$WebAppPatchPath = Join-Path $SourceDirectory 'packages/bundle/web-app/cordis.patch.yml'
if (Test-Path -LiteralPath $WebAppPatchPath -PathType Leaf) {
    $WebAppPatch = Get-Content -LiteralPath $WebAppPatchPath -Raw -Encoding UTF8
    Check ($WebAppPatch -match '(?s)id:\s*agent-presets.*?default:\s*standard') '默认 Agent preset 仍为 standard'
} else {
    Check $false 'Web App preset 默认配置存在'
}

$ContinuationSourcePath = Join-Path $SourceDirectory 'packages/guard/max-token-continuation/src/index.ts'
$ContinuationBundlePath = Join-Path $SourceDirectory 'packages/guard/max-token-continuation/lib/index.js'
$ConversationLocalePath = Join-Path $SourceDirectory 'packages/client/ui-conversation/src/client/locales.ts'
$ContinuationReminder = '上一轮因输出 token 上限被截断，已有输出已保留，从停止的位置继续同一个任务。'
if (Test-Path -LiteralPath $ContinuationSourcePath -PathType Leaf) {
    $ContinuationSource = Get-Content -LiteralPath $ContinuationSourcePath -Raw -Encoding UTF8
    Check ($ContinuationSource.Contains($ContinuationReminder) -and $ContinuationSource -match "reason\.kind\s*!==\s*'max-tokens'") 'Max-token 自动续跑源码与精确 reminder'
} else {
    Check $false 'Max-token 自动续跑源码存在'
}
if (Test-Path -LiteralPath $ContinuationBundlePath -PathType Leaf) {
    $ContinuationBundle = Get-Content -LiteralPath $ContinuationBundlePath -Raw -Encoding UTF8
    Check ($ContinuationBundle.Contains($ContinuationReminder)) 'Max-token 自动续跑构建产物包含精确 reminder'
} else {
    Check $false 'Max-token 自动续跑构建产物存在'
}
if (Test-Path -LiteralPath $ConversationLocalePath -PathType Leaf) {
    $ConversationLocale = Get-Content -LiteralPath $ConversationLocalePath -Raw -Encoding UTF8
    Check ($ConversationLocale.Contains('回答被截断，已有输出保留在对话中。') -and -not $ConversationLocale.Contains('发送“继续”可让模型接着输出。')) '截断提示无需手工发送继续'
} else {
    Check $false '会话界面 locale 源码存在'
}

if (Get-Command dsh -ErrorAction SilentlyContinue) {
    Check ((& dsh --version).Trim() -eq $Lock.dshVersion) "dsh $($Lock.dshVersion)"
} else {
    Check $false 'dsh 命令已注册'
}

if ($RequireWeb) {
    try {
        $Response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$Port/" -TimeoutSec 5
        Check ($Response.StatusCode -eq 200) "dsh web 端口 $Port 返回 HTTP 200"
    } catch {
        Check $false "dsh web 端口 $Port 可访问"
    }
}

if ($Failures.Count -gt 0) {
    throw "DSH 校验失败，共 $($Failures.Count) 项。"
}

Write-Host 'DSH 锁定源码、工具链与运行入口校验通过。' -ForegroundColor Cyan
