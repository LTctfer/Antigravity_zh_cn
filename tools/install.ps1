<#
.SYNOPSIS
  Antigravity 简体中文语言层 - 免 Python 原生 PowerShell 安装 / 更新 / 修复 / 还原工具

.EXAMPLE
  # 本地直接安装（无需 Python）
  powershell -ExecutionPolicy Bypass -File tools\install.ps1 -Force

  # 仅更新外置词库（无需重启 Antigravity，按 Alt+Shift+R 立即热生效）
  powershell -ExecutionPolicy Bypass -File tools\install.ps1 -UpdateDict

  # 一行命令在线安装（无需 Git，无需 Python）
  irm https://raw.githubusercontent.com/LTctfer/Antigravity_zh_cn/main/tools/install.ps1 | iex
#>
[CmdletBinding()]
param(
    [string]$Dir = '',
    [switch]$Status,
    [switch]$Restore,
    [switch]$Force,
    [switch]$Restart,
    [switch]$Ensure,
    [switch]$Launch,
    [switch]$UpdateDict,
    [switch]$Online,
    [switch]$Silent
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$RAW_BASE = 'https://raw.githubusercontent.com/LTctfer/Antigravity_zh_cn/main'
$USER_DIR = Join-Path $env:USERPROFILE '.antigravity-zhcn'
$EXT_PACK = Join-Path $USER_DIR 'zh-cn.pack.js'
$EXT_HOOK = Join-Path $USER_DIR 'main-hook.js'
$EXT_PS1  = Join-Path $USER_DIR 'install.ps1'
$MARK     = "require('./zh-cn/main-hook.js')"
$BLOCK_SIZE = 4194304

function Write-Info([string]$msg) {
    if (-not $Silent) { Write-Host $msg }
}

function Find-AntigravityDir([string]$explicit) {
    if ($explicit) {
        $resolved = (Resolve-Path $explicit).Path
        if (Test-Path (Join-Path $resolved 'resources\app.asar')) { return $resolved }
        throw "未在指定目录找到 resources\app.asar：$explicit"
    }
    $candidates = @(
        (Join-Path $env:LOCALAPPDATA 'Programs\antigravity'),
        (Join-Path $env:LOCALAPPDATA 'Programs\Antigravity'),
        (Join-Path $env:ProgramFiles 'Antigravity'),
        (Join-Path ${env:ProgramFiles(x86)} 'Antigravity')
    )
    foreach ($c in $candidates) {
        if ($c -and (Test-Path (Join-Path $c 'resources\app.asar'))) {
            return $c
        }
    }
    throw '未找到 Antigravity 安装目录，请使用 -Dir 指定包含 Antigravity.exe 的目录。'
}

function Get-Sha256Bytes([byte[]]$bytes) {
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        $hash = $sha.ComputeHash($bytes)
        return ([System.BitConverter]::ToString($hash)).Replace('-', '').ToLowerInvariant()
    } finally {
        $sha.Dispose()
    }
}

function Get-Sha256File([string]$path) {
    $sha = [System.Security.Cryptography.SHA256]::Create()
    $fs = [System.IO.File]::OpenRead($path)
    try {
        $hash = $sha.ComputeHash($fs)
        return ([System.BitConverter]::ToString($hash)).Replace('-', '').ToLowerInvariant()
    } finally {
        $fs.Dispose()
        $sha.Dispose()
    }
}

function Get-AsarIntegrity([byte[]]$data) {
    $blocks = New-Object System.Collections.Generic.List[string]
    if ($data.Length -eq 0) {
        $blocks.Add((Get-Sha256Bytes ([byte[]]@())))
    } else {
        for ($i = 0; $i -lt $data.Length; $i += $BLOCK_SIZE) {
            $len = [Math]::Min($BLOCK_SIZE, $data.Length - $i)
            $chunk = New-Object byte[] $len
            [Array]::Copy($data, $i, $chunk, 0, $len)
            $blocks.Add((Get-Sha256Bytes $chunk))
        }
    }
    return [ordered]@{
        algorithm = 'SHA256'
        hash      = (Get-Sha256Bytes $data)
        blockSize = $BLOCK_SIZE
        blocks    = @($blocks)
    }
}

function Escape-JsonString([string]$s) {
    $sb = New-Object System.Text.StringBuilder ($s.Length + 8)
    [void]$sb.Append('"')
    for ($i = 0; $i -lt $s.Length; $i++) {
        $ch = $s[$i]
        $code = [int]$ch
        switch ($ch) {
            '"'  { [void]$sb.Append('\"') }
            '\'  { [void]$sb.Append('\\') }
            "`b" { [void]$sb.Append('\b') }
            "`f" { [void]$sb.Append('\f') }
            "`n" { [void]$sb.Append('\n') }
            "`r" { [void]$sb.Append('\r') }
            "`t" { [void]$sb.Append('\t') }
            default {
                if ($code -lt 32) {
                    [void]$sb.Append(('\u{0:x4}' -f $code))
                } else {
                    [void]$sb.Append($ch)
                }
            }
        }
    }
    [void]$sb.Append('"')
    return $sb.ToString()
}

function ConvertTo-CompactJson($obj) {
    if ($null -eq $obj) { return 'null' }
    if ($obj -is [bool]) { if ($obj) { return 'true' } else { return 'false' } }
    if ($obj -is [int] -or $obj -is [long] -or $obj -is [double] -or $obj -is [decimal]) {
        return [string]$obj
    }
    if ($obj -is [string]) { return (Escape-JsonString $obj) }
    if ($obj -is [System.Collections.IDictionary]) {
        $parts = New-Object System.Collections.Generic.List[string]
        foreach ($k in $obj.Keys) {
            $parts.Add((Escape-JsonString ([string]$k)) + ':' + (ConvertTo-CompactJson $obj[$k]))
        }
        return '{' + ($parts -join ',') + '}'
    }
    if ($obj -is [PSCustomObject]) {
        $parts = New-Object System.Collections.Generic.List[string]
        foreach ($prop in $obj.PSObject.Properties) {
            $parts.Add((Escape-JsonString $prop.Name) + ':' + (ConvertTo-CompactJson $prop.Value))
        }
        return '{' + ($parts -join ',') + '}'
    }
    if ($obj -is [System.Collections.IEnumerable]) {
        $parts = New-Object System.Collections.Generic.List[string]
        foreach ($item in $obj) {
            $parts.Add((ConvertTo-CompactJson $item))
        }
        return '[' + ($parts -join ',') + ']'
    }
    return (Escape-JsonString ([string]$obj))
}

function Read-AsarHeader([string]$asarPath) {
    $fs = [System.IO.File]::OpenRead($asarPath)
    try {
        $head = New-Object byte[] 16
        if ($fs.Read($head, 0, 16) -lt 16) {
            throw "无效的 asar 文件：$asarPath"
        }
        $hsize = [System.BitConverter]::ToUInt32($head, 4)
        $jsize = [System.BitConverter]::ToUInt32($head, 12)
        $raw = New-Object byte[] $jsize
        [void]$fs.Read($raw, 0, $jsize)
        $jsonText = [System.Text.Encoding]::UTF8.GetString($raw)
        $headerObj = $jsonText | ConvertFrom-Json
        return @{
            Header = $headerObj
            Base   = 8 + [int64]$hsize
        }
    } finally {
        $fs.Dispose()
    }
}

function Walk-AsarEntries($node, [string]$prefix, $list) {
    if ($null -eq $node.files) { return }
    foreach ($prop in $node.files.PSObject.Properties) {
        $p = $prefix + '/' + $prop.Name
        $meta = $prop.Value
        if ($null -ne $meta.files) {
            Walk-AsarEntries $meta $p $list
        } else {
            $list.Add([PSCustomObject]@{ Path = $p; Meta = $meta })
        }
    }
}

function Read-AsarEntryBytes([string]$asarPath, $meta, [int64]$base) {
    if ($meta.unpacked) { return $null }
    $offset = [int64]$meta.offset
    $size = [int]$meta.size
    $buf = New-Object byte[] $size
    $fs = [System.IO.File]::OpenRead($asarPath)
    try {
        [void]$fs.Seek($base + $offset, [System.IO.SeekOrigin]::Begin)
        $readTotal = 0
        while ($readTotal -lt $size) {
            $n = $fs.Read($buf, $readTotal, $size - $readTotal)
            if ($n -le 0) { break }
            $readTotal += $n
        }
    } finally {
        $fs.Dispose()
    }
    return $buf
}

function Repack-Asar([string]$srcAsar, [string]$dstAsar, [hashtable]$replacements) {
    $info = Read-AsarHeader $srcAsar
    $base = $info.Base
    $rawEntries = New-Object System.Collections.Generic.List[object]
    Walk-AsarEntries $info.Header '' $rawEntries

    $entryMap = @{}
    foreach ($e in $rawEntries) {
        $entryMap[$e.Path] = $e.Meta
    }
    foreach ($k in $replacements.Keys) {
        if (-not $entryMap.ContainsKey($k)) {
            $entryMap[$k] = [PSCustomObject]@{}
        }
    }

    $sortedPaths = @($entryMap.Keys | Sort-Object)
    $root = [ordered]@{ files = [ordered]@{} }
    $offset = [int64]0

    $payloadStream = New-Object System.IO.MemoryStream
    $srcFs = [System.IO.File]::OpenRead($srcAsar)
    try {
        foreach ($path in $sortedPaths) {
            $parts = $path.TrimStart('/').Split('/')
            $node = $root
            for ($i = 0; $i -lt $parts.Length - 1; $i++) {
                $part = $parts[$i]
                if (-not $node.files.Contains($part)) {
                    $node.files[$part] = [ordered]@{ files = [ordered]@{} }
                }
                $node = $node.files[$part]
            }

            $oldMeta = $entryMap[$path]
            $newMeta = [ordered]@{}
            foreach ($prop in $oldMeta.PSObject.Properties) {
                if ($prop.Name -notin @('offset', 'size', 'integrity', 'unpacked')) {
                    $newMeta[$prop.Name] = $prop.Value
                }
            }

            $data = $null
            if ($replacements.ContainsKey($path)) {
                $data = $replacements[$path]
            } elseif ($oldMeta.unpacked) {
                $data = $null
            } else {
                $size = [int]$oldMeta.size
                $data = New-Object byte[] $size
                [void]$srcFs.Seek($base + [int64]$oldMeta.offset, [System.IO.SeekOrigin]::Begin)
                $readTotal = 0
                while ($readTotal -lt $size) {
                    $n = $srcFs.Read($data, $readTotal, $size - $readTotal)
                    if ($n -le 0) { break }
                    $readTotal += $n
                }
            }

            if ($null -eq $data) {
                $newMeta['unpacked'] = $true
                if ($null -ne $oldMeta.size) { $newMeta['size'] = [int]$oldMeta.size }
                if ($null -ne $oldMeta.integrity) { $newMeta['integrity'] = $oldMeta.integrity }
            } else {
                $newMeta['size'] = $data.Length
                $newMeta['offset'] = [string]$offset
                $newMeta['integrity'] = Get-AsarIntegrity $data
                $offset += $data.Length
                if ($data.Length -gt 0) {
                    $payloadStream.Write($data, 0, $data.Length)
                }
            }
            $node.files[$parts[$parts.Length - 1]] = $newMeta
        }

        $jsonStr = ConvertTo-CompactJson $root
        $jsonBytes = [System.Text.Encoding]::UTF8.GetBytes($jsonStr)
        $padded = ($jsonBytes.Length + 3) -band (-bnot 3)
        $padLen = $padded - $jsonBytes.Length

        $outFs = [System.IO.File]::Create($dstAsar)
        try {
            $bw = New-Object System.IO.BinaryWriter($outFs)
            $bw.Write([uint32]4)
            $bw.Write([uint32](8 + $padded))
            $bw.Write([uint32](4 + $padded))
            $bw.Write([uint32]$jsonBytes.Length)
            $bw.Write($jsonBytes)
            if ($padLen -gt 0) {
                $bw.Write((New-Object byte[] $padLen))
            }
            $payloadStream.Position = 0
            $payloadStream.CopyTo($outFs)
        } finally {
            $outFs.Dispose()
        }
    } finally {
        $srcFs.Dispose()
        $payloadStream.Dispose()
    }
    return $sortedPaths.Count
}

function Patch-MainJs([byte[]]$srcBytes) {
    $text = [System.Text.Encoding]::UTF8.GetString($srcBytes)
    if ($text.Contains($MARK)) { return $srcBytes }
    $inject = $MARK + ";`n"
    $trimmed = $text.TrimStart()
    if ($trimmed.StartsWith('"use strict";')) {
        $cut = $text.IndexOf('"use strict";') + '"use strict";'.Length
        $out = $text.Substring(0, $cut) + "`n" + $inject + $text.Substring($cut)
    } elseif ($trimmed.StartsWith("'use strict';")) {
        $cut = $text.IndexOf("'use strict';") + "'use strict';".Length
        $out = $text.Substring(0, $cut) + "`n" + $inject + $text.Substring($cut)
    } else {
        $out = $inject + $text
    }
    return [System.Text.Encoding]::UTF8.GetBytes($out)
}

function Download-File([string]$url, [string]$dest) {
    $dir = Split-Path $dest -Parent
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    $wc = New-Object System.Net.WebClient
    $wc.Headers.Add('User-Agent', 'Antigravity-zh-cn-ps1')
    $wc.DownloadFile($url, $dest)
}

function Resolve-Assets([switch]$ForceOnline) {
    $repoRoot = if ($PSScriptRoot) { Split-Path $PSScriptRoot -Parent } else { (Get-Location).Path }
    $localPack = Join-Path $repoRoot 'build\zh-cn.pack.js'
    $localHook = Join-Path $repoRoot 'src\main-hook.js'
    $localMeta = Join-Path $repoRoot 'build\meta.json'
    $localPs1  = Join-Path $repoRoot 'tools\install.ps1'

    if (-not $ForceOnline -and (Test-Path $localPack) -and (Test-Path $localHook)) {
        if (-not (Test-Path $USER_DIR)) { New-Item -ItemType Directory -Path $USER_DIR -Force | Out-Null }
        Copy-Item $localPack $EXT_PACK -Force
        Copy-Item $localHook $EXT_HOOK -Force
        if (Test-Path $localPs1) { Copy-Item $localPs1 $EXT_PS1 -Force }
        $ver = '1.0.0'
        if (Test-Path $localMeta) {
            try { $ver = ((Get-Content $localMeta -Raw -Encoding UTF8) | ConvertFrom-Json).version } catch {}
        }
        return @{ Pack = $localPack; Hook = $localHook; Version = $ver }
    }

    if (-not $ForceOnline -and (Test-Path $EXT_PACK) -and (Test-Path $EXT_HOOK)) {
        return @{ Pack = $EXT_PACK; Hook = $EXT_HOOK; Version = '1.0.0' }
    }

    Write-Info '正在从 GitHub 下载中文语言包组件...'
    Download-File "$RAW_BASE/build/zh-cn.pack.js" $EXT_PACK
    Download-File "$RAW_BASE/src/main-hook.js" $EXT_HOOK
    try { Download-File "$RAW_BASE/tools/install.ps1" $EXT_PS1 } catch {}
    return @{ Pack = $EXT_PACK; Hook = $EXT_HOOK; Version = '1.0.0' }
}

function Test-AppRunning {
    return [bool](Get-Process -Name 'Antigravity' -ErrorAction SilentlyContinue)
}

function Get-StatusObj([string]$appDir) {
    $res = Join-Path $appDir 'resources'
    $asarPath = Join-Path $res 'app.asar'
    $bakPath  = Join-Path $res 'app.asar.zh-cn.bak'
    $manPath  = Join-Path $res 'zh-cn.manifest.json'

    $installed = $false
    if (Test-Path $asarPath) {
        try {
            $info = Read-AsarHeader $asarPath
            $entries = New-Object System.Collections.Generic.List[object]
            Walk-AsarEntries $info.Header '' $entries
            $hasPack = $false
            $mainMeta = $null
            foreach ($e in $entries) {
                if ($e.Path -eq '/dist/zh-cn/zh-cn.pack.js') { $hasPack = $true }
                elseif ($e.Path -eq '/dist/main.js') { $mainMeta = $e.Meta }
            }
            if ($hasPack -and $mainMeta) {
                $mainBytes = Read-AsarEntryBytes $asarPath $mainMeta $info.Base
                $headLen = [Math]::Min(4096, $mainBytes.Length)
                $headStr = [System.Text.Encoding]::UTF8.GetString($mainBytes, 0, $headLen)
                $installed = $headStr.Contains($MARK)
            }
        } catch {}
    }
    $man = $null
    if (Test-Path $manPath) {
        try { $man = (Get-Content $manPath -Raw -Encoding UTF8) | ConvertFrom-Json } catch {}
    }
    return [ordered]@{
        installDir   = $appDir
        asar         = $asarPath
        backup       = (Test-Path $bakPath)
        installed    = $installed
        externalPack = if (Test-Path $EXT_PACK) { $EXT_PACK } else { $null }
        manifest     = $man
        running      = (Test-AppRunning)
    }
}

function Test-PatchedFast([string]$appDir) {
    $res = Join-Path $appDir 'resources'
    $asarPath = Join-Path $res 'app.asar'
    $manPath  = Join-Path $res 'zh-cn.manifest.json'
    if (-not (Test-Path $asarPath)) { return $false }
    if (Test-Path $manPath) {
        try {
            $man = (Get-Content $manPath -Raw -Encoding UTF8) | ConvertFrom-Json
            if ($man.patchedSha256) {
                if ((Get-Sha256File $asarPath) -eq $man.patchedSha256) {
                    return $true
                }
            }
        } catch {}
    }
    return (Get-StatusObj $appDir).installed
}

function Install-ZhCn([string]$appDir, [switch]$AllowForce, [switch]$ForceOnline) {
    $res = Join-Path $appDir 'resources'
    $asarPath = Join-Path $res 'app.asar'
    $bakPath  = Join-Path $res 'app.asar.zh-cn.bak'
    $manPath  = Join-Path $res 'zh-cn.manifest.json'

    if ((Test-AppRunning) -and (-not $AllowForce)) {
        throw 'Antigravity 正在运行，请先完全退出或加 -Force 强制替换。'
    }

    $assets = Resolve-Assets -ForceOnline:$ForceOnline
    $curHash = Get-Sha256File $asarPath
    $oldMan = $null
    if (Test-Path $manPath) {
        try { $oldMan = (Get-Content $manPath -Raw -Encoding UTF8) | ConvertFrom-Json } catch {}
    }
    $curPatched = (Get-StatusObj $appDir).installed

    if (-not (Test-Path $bakPath)) {
        Copy-Item $asarPath $bakPath -Force
        Write-Info "已备份原始 app.asar -> $bakPath"
    } elseif ((-not $curPatched) -and ($null -eq $oldMan -or $oldMan.originalSha256 -ne $curHash)) {
        Copy-Item $asarPath $bakPath -Force
        Write-Info "检测到 Antigravity 已升级，已刷新备份 -> $bakPath"
    }

    $origHash = Get-Sha256File $bakPath
    $packBytes = [System.IO.File]::ReadAllBytes($assets.Pack)
    $hookBytes = [System.IO.File]::ReadAllBytes($assets.Hook)

    $info = Read-AsarHeader $asarPath
    $entries = New-Object System.Collections.Generic.List[object]
    Walk-AsarEntries $info.Header '' $entries
    $mainMeta = $null
    foreach ($e in $entries) {
        if ($e.Path -eq '/dist/main.js') { $mainMeta = $e.Meta; break }
    }
    if ($null -eq $mainMeta) {
        throw 'asar 内缺少 dist/main.js，版本结构可能已变化。'
    }
    $mainBytes = Read-AsarEntryBytes $asarPath $mainMeta $info.Base
    $patchedMain = Patch-MainJs $mainBytes

    $replacements = @{
        '/dist/zh-cn/zh-cn.pack.js' = $packBytes
        '/dist/zh-cn/main-hook.js'  = $hookBytes
        '/dist/main.js'             = $patchedMain
    }

    $tmpPath = "$asarPath.zh-cn.tmp"
    $fileCount = Repack-Asar $asarPath $tmpPath $replacements

    $aside = "$asarPath.locked"
    if (Test-Path $aside) { Remove-Item $aside -Force -ErrorAction SilentlyContinue }
    try {
        [System.IO.File]::Move($asarPath, $aside)
        try {
            [System.IO.File]::Move($tmpPath, $asarPath)
        } catch {
            if (-not (Test-Path $asarPath) -and (Test-Path $aside)) {
                [System.IO.File]::Move($aside, $asarPath)
            }
            throw
        }
        try { [System.IO.File]::Delete($aside) } catch {}
    } catch {
        if (Test-Path $tmpPath) { Remove-Item $tmpPath -Force -ErrorAction SilentlyContinue }
        if (-not $AllowForce) {
            throw "替换 app.asar 失败（Antigravity 可能正在运行）：$_"
        }
        throw "强制替换 app.asar 失败（文件被进程锁定，请先完全退出 Antigravity）：$_"
    }

    $manifest = [ordered]@{
        name           = 'Antigravity 简体中文语言层'
        version        = $assets.Version
        installedAt    = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
        originalSha256 = $origHash
        patchedSha256  = (Get-Sha256File $asarPath)
        entries        = $fileCount
        marker         = $MARK
    }
    $manJson = ($manifest | ConvertTo-Json -Depth 10)
    [System.IO.File]::WriteAllText($manPath, $manJson, (New-Object System.Text.UTF8Encoding $false))

    Write-Info "安装完成：$appDir"
    Write-Info "外置词库：$EXT_PACK"
}

function Restore-ZhCn([string]$appDir) {
    $res = Join-Path $appDir 'resources'
    $asarPath = Join-Path $res 'app.asar'
    $bakPath  = Join-Path $res 'app.asar.zh-cn.bak'
    $manPath  = Join-Path $res 'zh-cn.manifest.json'
    if (-not (Test-Path $bakPath)) { throw "没有找到备份，无法还原：$bakPath" }
    if (Test-AppRunning) { throw 'Antigravity 正在运行，请先完全退出后再还原。' }
    Copy-Item $bakPath $asarPath -Force
    if (Test-Path $manPath) { Remove-Item $manPath -Force }
    Write-Info '已还原英文原版，重启 Antigravity 生效。'
}

function Start-Antigravity([string]$appDir) {
    $exe = Join-Path $appDir 'Antigravity.exe'
    if (-not (Test-Path $exe)) { throw "未找到主程序：$exe" }
    Start-Process -FilePath $exe -WorkingDirectory $appDir
    Write-Info "已启动：$exe"
}

function Stop-Antigravity {
    if (Test-AppRunning) {
        Write-Info '正在关闭 Antigravity...'
        Get-Process -Name 'Antigravity' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
        for ($i = 0; $i -lt 20; $i++) {
            if (-not (Test-AppRunning)) { break }
            Start-Sleep -Milliseconds 250
        }
    }
}

function Restart-Antigravity([string]$appDir) {
    Stop-Antigravity
    Start-Antigravity $appDir
}

# 主执行流程
if ($UpdateDict) {
    $assets = Resolve-Assets -ForceOnline:$Online
    Write-Info "外置词库已更新：$($assets.Pack) -> $EXT_PACK"
    Write-Info '提示：若 Antigravity 正在运行，直接按 Alt+Shift+R 即可热重载生效！'
    return
}

$appDir = Find-AntigravityDir $Dir

if ($Status) {
    (Get-StatusObj $appDir | ConvertTo-Json -Depth 10)
    return
}

if ($Restore) {
    if ($Restart) { Stop-Antigravity }
    Restore-ZhCn $appDir
    if ($Restart) { Start-Antigravity $appDir }
    return
}

if ($Ensure -or $Launch) {
    if (Test-PatchedFast $appDir) {
        Write-Info '汉化补丁状态正常（无需重打）。'
    } else {
        Write-Info '检测到补丁未安装或已被官方更新覆盖，正在自动修复...'
        if ($Restart) { Stop-Antigravity }
        Install-ZhCn $appDir -AllowForce -ForceOnline:$Online
    }
    if ($Launch) {
        Start-Antigravity $appDir
    }
    return
}

# 默认：若无参数且通过 irm | iex 执行（PSScriptRoot 为空），默认自动使用 Force + 在线模式
$isOneLiner = [string]::IsNullOrEmpty($PSScriptRoot)
$useForce = $Force -or $isOneLiner
$useOnline = $Online -or $isOneLiner

if ($Restart) { Stop-Antigravity }
Install-ZhCn $appDir -AllowForce:$useForce -ForceOnline:$useOnline
if ($Restart) {
    Start-Antigravity $appDir
} elseif ($isOneLiner) {
    Write-Info ''
    Write-Info '安装完成！若 Antigravity 正在运行，请完全退出并重新打开即可生效。'
}
