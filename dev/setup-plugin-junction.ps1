<#
setup-plugin-junction.ps1 — 把运行时的 ~/.dsh/plugins/<name> 用 junction 指到本仓库

背景：DSH web profile 通过 "dsh-<name>": "link:C:/Users/<user>/.dsh/plugins/<name>"
把插件挂进加载链。把该目录换成指向本仓库 plugins/<name> 的目录联接（junction）后，
"仓库内开发" 与 "运行时加载" 就是同一份文件，无需改 profile 的 link 路径，
也无需重启当前运行实例（下次冷启动自然加载仓库版本）。

行为（安全、可回退）：
  1. 校验本仓库 plugins/<name> 存在且非空；
  2. 若 ~/.dsh/plugins/<name> 已是 junction → 直接校验指向，结束；
  3. 若为普通目录 → 先校验"仓库副本与原件逐文件哈希一致"（不一致则中止，防误覆盖），
     再把原件改名为 <name>.bak-<yyyyMMddHHmmss> 备份，然后建 junction；
  4. 若备份已存在同名 junction 回退场景，可用 -Restore <备份路径> 恢复。

用法：
  .\dev\setup-plugin-junction.ps1 -PluginName skill-manager
  .\dev\setup-plugin-junction.ps1 -PluginName skill-manager -DryRun
  .\dev\setup-plugin-junction.ps1 -PluginName skill-manager -Restore "C:\Users\<u>\.dsh\plugins\skill-manager.bak-20260816235900"
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$PluginName,

    # 注意：默认值在脚本体内解析（Windows PowerShell 5.1 参数默认值作用域里 $PSScriptRoot 为空）
    [string]$RepoRoot,

    [string]$DshPluginsDir,

    [switch]$DryRun,

    # 回退用：提供备份路径则进入恢复模式（同时需要 -PluginName 定位目标目录）
    [string]$Restore
)

$ErrorActionPreference = 'Stop'
if (-not $RepoRoot) {
    if (-not $PSScriptRoot) { throw "无法确定仓库根目录（$PSScriptRoot 为空），请显式传 -RepoRoot" }
    $RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
}
if (-not $DshPluginsDir) { $DshPluginsDir = Join-Path $env:USERPROFILE '.dsh\plugins' }
$repoPlugin = Join-Path $RepoRoot "plugins\$PluginName"
$livePlugin = Join-Path $DshPluginsDir $PluginName

function Step($m) { Write-Host "[junction] $m" -ForegroundColor Cyan }

# ── 恢复模式（提供 -Restore 备份路径时）─────────────────────────────────────
if ($Restore) {
    if (-not (Test-Path $Restore)) { throw "备份不存在：$Restore" }
    if (Test-Path $livePlugin) {
        $item = Get-Item $livePlugin -Force
        if ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
            cmd /c "rmdir `"$livePlugin`"" | Out-Null
            Step "已移除现有 junction"
        } else { throw "目标已存在普通目录，拒绝覆盖：$livePlugin" }
    }
    Move-Item -LiteralPath $Restore -Destination $livePlugin
    Step "已从备份恢复：$livePlugin"
    return
}

# ── 常规模式 ────────────────────────────────────────────────────────────────
if (-not (Test-Path $repoPlugin)) { throw "仓库内插件不存在：$repoPlugin" }
$repoFiles = Get-ChildItem -Recurse -File $repoPlugin
if ($repoFiles.Count -eq 0) { throw "仓库内插件为空：$repoPlugin" }
Step "仓库插件：$repoPlugin（$($repoFiles.Count) 个文件）"

if (Test-Path $livePlugin) {
    $live = Get-Item $livePlugin -Force
    if ($live.Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
        $target = (Get-Item $livePlugin).Target
        Step "$livePlugin 已是 junction -> $target"
        if ($target -and $target.TrimEnd('\') -ieq $repoPlugin.TrimEnd('\')) {
            Step "指向正确，无需变更。"
            return
        } else {
            throw "junction 指向 $target，与仓库 $repoPlugin 不一致，请人工确认后处理。"
        }
    }

    # 普通目录：逐文件哈希比对，确保仓库副本 == 原件（防止把旧仓库版本当新代码覆盖）
    Step "校验 仓库副本 与 原件 逐文件哈希一致 …"
    $liveFiles = Get-ChildItem -Recurse -File $livePlugin
    $diff = @()
    foreach ($lf in $liveFiles) {
        $rel = $lf.FullName.Substring($livePlugin.Length + 1)
        $rp = Join-Path $repoPlugin $rel
        if (-not (Test-Path $rp)) { $diff += "仅原件存在: $rel"; continue }
        $h1 = (Get-FileHash $lf.FullName -Algorithm SHA256).Hash
        $h2 = (Get-FileHash $rp -Algorithm SHA256).Hash
        if ($h1 -ne $h2) { $diff += "哈希不一致: $rel" }
    }
    foreach ($rf in $repoFiles) {
        $rel = $rf.FullName.Substring($repoPlugin.Length + 1)
        if (-not (Test-Path (Join-Path $livePlugin $rel))) { $diff += "仅仓库存在: $rel" }
    }
    if ($diff.Count -gt 0) {
        Step "检测到差异，中止（请先在仓库内同步最新代码再重试）：" -ForegroundColor Red
        $diff | ForEach-Object { "  - $_" }
        throw "存在差异，未修改运行时目录。"
    }
    Step "哈希一致 ✓"

    if ($DryRun) { Step "[DryRun] 将备份原件并建 junction，未做任何修改。"; return }

    $ts = Get-Date -Format 'yyyyMMddHHmmss'
    $backup = "$livePlugin.bak-$ts"
    Step "备份原件 -> $backup"
    Move-Item -LiteralPath $livePlugin -Destination $backup
    Step "创建 junction $livePlugin -> $repoPlugin"
    cmd /c "mklink /J `"$livePlugin`" `"$repoPlugin`"" | Out-Null
    Step "完成。备份保留在 $backup，确认无误后可删除。"
} else {
    if ($DryRun) { Step "[DryRun] 将建 junction，未做任何修改。"; return }
    Step "运行时目录不存在，直接建 junction $livePlugin -> $repoPlugin"
    cmd /c "mklink /J `"$livePlugin`" `"$repoPlugin`"" | Out-Null
    Step "完成。"
}

# ── 收尾校验 ────────────────────────────────────────────────────────────────
$check = Get-Item $livePlugin -Force
if ($check.Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
    Step "junction 校验：指向 $($check.Target)"
    $sample = Get-ChildItem -Recurse -File $livePlugin | Select-Object -First 3
    "可读取文件（样例）："
    $sample | ForEach-Object { "  {0,10}  {1}" -f $_.Length, $_.Name }
} else {
    throw "junction 校验失败：$livePlugin 不是 reparse point"
}
