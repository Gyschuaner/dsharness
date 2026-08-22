#Requires -Version 5.1
<#
.SYNOPSIS
Builds the locked DeepSeek Harness source tree and registers the dsh command.

.DESCRIPTION
The script creates or reuses only a source tree that matches upstream.lock.json.
It never reads or copies ~/.dsh credentials, sessions, attachments, or settings.
#>
[CmdletBinding()]
param(
    [string]$SourceDirectory,
    [switch]$SkipRegister,
    [switch]$StartWeb
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent $PSScriptRoot
$LockPath = Join-Path $RepoRoot 'upstream.lock.json'
$Lock = Get-Content -LiteralPath $LockPath -Raw | ConvertFrom-Json

if ([string]::IsNullOrWhiteSpace($SourceDirectory)) {
    $SourceDirectory = Join-Path (Split-Path -Parent $RepoRoot) 'deepseek-harness'
}
$SourceDirectory = [IO.Path]::GetFullPath($SourceDirectory)

function Write-Step([string]$Message) {
    Write-Host "[dsh-build] $Message" -ForegroundColor Cyan
}

function Require-Command([string]$Name) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "缺少命令 $Name。请先安装后重新运行。"
    }
}

function Invoke-Native([string]$FilePath, [string[]]$Arguments, [string]$WorkingDirectory) {
    Push-Location $WorkingDirectory
    try {
        & $FilePath @Arguments
        if ($LASTEXITCODE -ne 0) {
            throw "$FilePath 执行失败，退出码 $LASTEXITCODE。"
        }
    } finally {
        Pop-Location
    }
}

function Get-GitTree([string]$RepositoryPath) {
    $tree = (& git -C $RepositoryPath rev-parse 'HEAD^{tree}').Trim()
    if ($LASTEXITCODE -ne 0) {
        throw "无法读取 $RepositoryPath 的 Git tree。"
    }
    return $tree
}

function Test-LinkTarget([string]$LinkPath, [string]$ExpectedDirectory) {
    if (-not (Test-Path -LiteralPath $LinkPath)) {
        return $false
    }
    $Link = Get-Item -LiteralPath $LinkPath -Force
    foreach ($Target in @($Link.Target)) {
        if ([string]::IsNullOrWhiteSpace($Target)) {
            continue
        }
        $ResolvedTarget = if ([IO.Path]::IsPathRooted($Target)) {
            [IO.Path]::GetFullPath($Target)
        } else {
            [IO.Path]::GetFullPath((Join-Path (Split-Path -Parent $LinkPath) $Target))
        }
        if ($ResolvedTarget.TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar) -eq
            $ExpectedDirectory.TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar)) {
            return $true
        }
    }
    return $false
}

Require-Command 'git'
Require-Command 'node'
Require-Command 'corepack'
Require-Command 'npm'

$NodeVersion = (& node --version).Trim().TrimStart('v')
if ($NodeVersion -ne $Lock.nodeVersion) {
    throw "Node 版本必须是 $($Lock.nodeVersion)，当前为 $NodeVersion。请切换版本后重试。"
}

foreach ($Patch in $Lock.patches) {
    $PatchPath = Join-Path $RepoRoot $Patch.path
    if (-not (Test-Path -LiteralPath $PatchPath -PathType Leaf)) {
        throw "缺少补丁：$PatchPath"
    }
    $ActualHash = (Get-FileHash -LiteralPath $PatchPath -Algorithm SHA256).Hash
    if ($ActualHash -ne $Patch.sha256) {
        throw "补丁校验失败：$($Patch.path)，预期 $($Patch.sha256)，实际 $ActualHash。"
    }
}

$CreatedSource = $false
if (-not (Test-Path -LiteralPath $SourceDirectory)) {
    Write-Step "创建源码目录 $SourceDirectory"
    New-Item -ItemType Directory -Path $SourceDirectory | Out-Null
    $CreatedSource = $true
    Invoke-Native 'git' @('init') $SourceDirectory
    Invoke-Native 'git' @('remote', 'add', 'upstream', $Lock.repository) $SourceDirectory
    Invoke-Native 'git' @('-c', 'http.version=HTTP/1.1', 'fetch', '--depth=1', 'upstream', $Lock.baseCommit) $SourceDirectory
    Invoke-Native 'git' @('checkout', '-b', 'dsharness/reproducible', 'FETCH_HEAD') $SourceDirectory
} elseif (-not (Test-Path -LiteralPath (Join-Path $SourceDirectory '.git'))) {
    throw "目标目录已存在但不是 Git 仓库：$SourceDirectory。脚本不会覆盖，请指定新的 -SourceDirectory。"
}

$Dirty = @(& git -C $SourceDirectory status --porcelain)
if ($LASTEXITCODE -ne 0) {
    throw "无法检查 $SourceDirectory 的工作区状态。"
}
if ($Dirty.Count -gt 0) {
    throw "目标源码目录存在未提交修改：$SourceDirectory。脚本不会覆盖，请先处理修改或指定新目录。"
}

$CurrentTree = Get-GitTree $SourceDirectory
if ($CurrentTree -eq $Lock.baseTree) {
    foreach ($Patch in $Lock.patches) {
        $PatchPath = Join-Path $RepoRoot $Patch.path
        Write-Step "应用补丁 $($Patch.path)"
        Invoke-Native 'git' @('-c', 'user.name=dsharness-bootstrap', '-c', 'user.email=dsharness@local.invalid', 'am', '--3way', $PatchPath) $SourceDirectory
    }
    $CurrentTree = Get-GitTree $SourceDirectory
}

if ($CurrentTree -ne $Lock.resultTree) {
    $CreatedText = if ($CreatedSource) { '新建目录' } else { '既有目录' }
    throw "$CreatedText 的源码树不符合锁定结果。预期 $($Lock.resultTree)，实际 $CurrentTree。脚本未执行 reset 或删除操作。"
}

Write-Step "源码树已验证：$CurrentTree"
$PreviousLocation = Get-Location
try {
    Set-Location -LiteralPath $SourceDirectory
    $PnpmVersion = (& corepack pnpm --version).Trim()
    if ($LASTEXITCODE -ne 0) {
        throw 'Corepack 无法启动 pnpm。'
    }
}
finally {
    Set-Location -LiteralPath $PreviousLocation
}
if ($PnpmVersion -ne $Lock.pnpmVersion) {
    throw "pnpm 版本必须是 $($Lock.pnpmVersion)，当前为 $PnpmVersion。"
}

Write-Step '安装锁定依赖'
$PreviousCi = $env:CI
try {
    $env:CI = 'true'
    Invoke-Native 'corepack' @('pnpm', 'install', '--frozen-lockfile') $SourceDirectory
} finally {
    $env:CI = $PreviousCi
}
Write-Step '执行完整构建'
Invoke-Native 'corepack' @('pnpm', 'run', 'build') $SourceDirectory

if (-not $SkipRegister) {
    $CliDirectory = [IO.Path]::GetFullPath((Join-Path $SourceDirectory 'apps\cli'))
    $NpmGlobalPrefix = (& npm prefix --global).Trim()
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($NpmGlobalPrefix)) {
        throw '无法读取 npm 全局安装目录。'
    }

    $GlobalPackagePath = Join-Path $NpmGlobalPrefix 'node_modules\@deepseek-ai\dsh'
    $AlreadyLinked = Test-LinkTarget $GlobalPackagePath $CliDirectory

    if ($AlreadyLinked) {
        Write-Step "全局 dsh 已指向 $CliDirectory，跳过重复注册"
    } else {
        Write-Step '注册全局 dsh 命令'
        Push-Location $CliDirectory
        try {
            & npm link
            $LinkExitCode = $LASTEXITCODE
        } finally {
            Pop-Location
        }
        $LinkedAfterCommand = Test-LinkTarget $GlobalPackagePath $CliDirectory
        if (-not $LinkedAfterCommand) {
            throw "npm link 执行后全局 dsh 未指向 $CliDirectory，退出码 $LinkExitCode。"
        }
        if ($LinkExitCode -ne 0) {
            Write-Step "npm link 返回 $LinkExitCode，但全局链接后置验证已通过；继续执行版本校验"
        }
    }
    $DshVersion = (& dsh --version).Trim()
    if ($LASTEXITCODE -ne 0 -or $DshVersion -ne $Lock.dshVersion) {
        throw "dsh 注册后版本异常，预期 $($Lock.dshVersion)，实际 $DshVersion。"
    }
    Write-Step "dsh $DshVersion 已注册"
}

if ($StartWeb) {
    & (Join-Path $RepoRoot 'restart-dsh-web.ps1')
    if ($LASTEXITCODE -ne 0) {
        throw 'dsh web 启动或冒烟失败。'
    }
}

[pscustomobject]@{
    sourceDirectory = $SourceDirectory
    sourceTree = $CurrentTree
    dshVersion = $Lock.dshVersion
    nodeVersion = $NodeVersion
    pnpmVersion = $PnpmVersion
    registered = -not $SkipRegister
    webStarted = [bool]$StartWeb
}
