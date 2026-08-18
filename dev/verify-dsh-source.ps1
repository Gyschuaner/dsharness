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

$WebAppPatchPath = Join-Path $SourceDirectory 'packages/bundle/web-app/cordis.patch.yml'
if (Test-Path -LiteralPath $WebAppPatchPath -PathType Leaf) {
    $WebAppPatch = Get-Content -LiteralPath $WebAppPatchPath -Raw -Encoding UTF8
    Check ($WebAppPatch -match '(?s)id:\s*agent-presets.*?default:\s*standard') '默认 Agent preset 仍为 standard'
} else {
    Check $false 'Web App preset 默认配置存在'
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
