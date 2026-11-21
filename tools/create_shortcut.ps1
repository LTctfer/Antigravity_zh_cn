<#
.SYNOPSIS
  在桌面创建“Antigravity (中文版)”无感自愈快捷方式（零黑框，自动沿用原版图标）。
#>
[CmdletBinding()]
param(
    [string]$Dir = ''
)

$ErrorActionPreference = 'Stop'

$ps1Path = Join-Path $PSScriptRoot 'install.ps1'
if (-not (Test-Path $ps1Path)) {
    throw "未找到 $ps1Path"
}

# 读取 install.ps1 中的 Find-AntigravityDir 逻辑或直接探测
$candidates = @(
    $Dir,
    (Join-Path $env:LOCALAPPDATA 'Programs\antigravity'),
    (Join-Path $env:LOCALAPPDATA 'Programs\Antigravity'),
    (Join-Path $env:ProgramFiles 'Antigravity'),
    (Join-Path ${env:ProgramFiles(x86)} 'Antigravity')
)
$appDir = $null
foreach ($c in $candidates) {
    if ($c -and (Test-Path (Join-Path $c 'Antigravity.exe'))) {
        $appDir = (Resolve-Path $c).Path
        break
    }
}
if (-not $appDir) {
    throw '未找到 Antigravity.exe，请用 -Dir 指定安装目录。'
}

$userDir = Join-Path $env:USERPROFILE '.antigravity-zhcn'
if (-not (Test-Path $userDir)) {
    New-Item -ItemType Directory -Path $userDir -Force | Out-Null
}

# 将自愈脚本与资源固化到用户目录，删掉原下载文件夹也不影响快捷方式工作
$repoRoot = Split-Path $PSScriptRoot -Parent
Copy-Item $ps1Path (Join-Path $userDir 'install.ps1') -Force
$pack = Join-Path $repoRoot 'build\zh-cn.pack.js'
$hook = Join-Path $repoRoot 'src\main-hook.js'
if (Test-Path $pack) { Copy-Item $pack (Join-Path $userDir 'zh-cn.pack.js') -Force }
if (Test-Path $hook) { Copy-Item $hook (Join-Path $userDir 'main-hook.js') -Force }

# 使用 wscript.exe 运行 launch.vbs 实现彻底无黑框启动
$vbsPath = Join-Path $userDir 'launch.vbs'
$vbsContent = @"
Set ws = CreateObject("WScript.Shell")
ps1 = ws.ExpandEnvironmentStrings("%USERPROFILE%\.antigravity-zhcn\install.ps1")
cmd = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File """ & ps1 & """ -Launch -Silent -Dir ""$appDir"""
ws.Run cmd, 0, False
"@
[System.IO.File]::WriteAllText($vbsPath, $vbsContent, [System.Text.Encoding]::Default)

$desktop = [Environment]::GetFolderPath('Desktop')
$lnkPath = Join-Path $desktop 'Antigravity (中文版).lnk'
$wsh = New-Object -ComObject WScript.Shell
$sc = $wsh.CreateShortcut($lnkPath)
$sc.TargetPath = "$env:SystemRoot\System32\wscript.exe"
$sc.Arguments = "`"$vbsPath`""
$sc.WorkingDirectory = $appDir
$sc.IconLocation = (Join-Path $appDir 'Antigravity.exe') + ',0'
$sc.Description = '启动 Antigravity 简体中文版（官方升级后自动修复汉化）'
$sc.Save()

Write-Host "已创建桌面快捷方式：$lnkPath"
Write-Host "  工作方式：启动前自动校验补丁，若官方更新覆盖则静默重注后再拉起，全程无黑框。"
