param(
    [string]$Mode = "all"
)

$ErrorActionPreference = "Stop"

$rootDir = $PSScriptRoot
# 如果是直接通过 powershell .\dev.ps1 运行，$PSScriptRoot会有值；但在某些情况可能为空，保险起见备用：
if (-not $rootDir) { $rootDir = $PWD.Path }

$serverDir = Join-Path $rootDir "server"
$webDir = Join-Path $rootDir "web"

function Kill-Port($port, $name) {
    try {
        $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
        if ($conns) {
            Write-Host "⚠️  端口 $port ($name) 已被占用，正在终止旧进程..." -ForegroundColor Yellow
            foreach ($conn in $conns) {
                Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
            }
            Start-Sleep -Seconds 1
            Write-Host "✅ 旧进程已清理" -ForegroundColor Green
        }
    } catch { }
}

function Check-Deps {
    $missing = $false
    if (-not (Get-Command "go" -ErrorAction SilentlyContinue)) { Write-Host "❌ 未找到 go 命令" -ForegroundColor Red; $missing = $true }
    if (-not (Get-Command "node" -ErrorAction SilentlyContinue)) { Write-Host "❌ 未找到 node 命令" -ForegroundColor Red; $missing = $true }
    if (-not (Get-Command "npm" -ErrorAction SilentlyContinue)) { Write-Host "❌ 未找到 npm 命令" -ForegroundColor Red; $missing = $true }
    if ($missing) { exit 1 }
}

function Start-Server {
    Write-Host "🚀 启动后端服务 (Go)..." -ForegroundColor Cyan
    Kill-Port 3710 "后端"
    if (-not (Test-Path "$serverDir\config.yaml")) {
        Write-Host "⚠️  未找到 config.yaml，从 config.example.yaml 复制..." -ForegroundColor Yellow
        Copy-Item "$serverDir\config.example.yaml" "$serverDir\config.yaml"
    }
    
    Set-Location $serverDir
    $global:serverProcess = Start-Process -FilePath "go" -ArgumentList "run main.go" -PassThru -NoNewWindow
    Write-Host "✅ 后端服务已启动 (PID: $($global:serverProcess.Id))" -ForegroundColor Green
    Set-Location $rootDir
}

function Start-Web {
    Write-Host "🚀 启动前端服务 (Vite)..." -ForegroundColor Blue
    Kill-Port 5173 "前端"
    if (-not (Test-Path "$webDir\node_modules")) {
        Write-Host "📦 首次运行，正在安装前端依赖..." -ForegroundColor Yellow
        Set-Location $webDir
        # Windows环境下，要调用 npm/npx 建议带上 .cmd 后缀，确保能正确拉起
        $npmProcess = Start-Process -FilePath "npm.cmd" -ArgumentList "install" -Wait -NoNewWindow -PassThru
        if ($npmProcess.ExitCode -ne 0) {
            Write-Host "❌ 前端依赖安装失败，请手动运行: cd web; npm install" -ForegroundColor Red
            Set-Location $rootDir
            return
        }
    }
    
    Set-Location $webDir
    $global:webProcess = Start-Process -FilePath "npx.cmd" -ArgumentList "vite --host" -PassThru -NoNewWindow
    Write-Host "✅ 前端服务已启动 (PID: $($global:webProcess.Id))" -ForegroundColor Blue
    Set-Location $rootDir
}

function Print-Banner {
    Write-Host ""
    Write-Host "╔══════════════════════════════════════════╗" -ForegroundColor Cyan
    Write-Host "║       RemoteVibe Dev Environment         ║" -ForegroundColor Cyan
    Write-Host "╚══════════════════════════════════════════╝" -ForegroundColor Cyan
    Write-Host ""
}

function Print-Info {
    Write-Host ""
    Write-Host "────────────────────────────────────────────"
    Write-Host "  后端  → http://localhost:3710" -ForegroundColor Green
    Write-Host "  前端  → http://localhost:5173" -ForegroundColor Blue
    Write-Host "  WS    → ws://localhost:5173/ws (代理到后端)" -ForegroundColor Yellow
    Write-Host "────────────────────────────────────────────"
    Write-Host "  按 Ctrl+C 停止所有服务" -ForegroundColor Red
    Write-Host ""
}

[console]::TreatControlCAsInput = $false

try {
    Print-Banner
    Check-Deps

    switch ($Mode) {
        "server" { Start-Server; break }
        "web"    { Start-Web; break }
        "all"    { Start-Server; Start-Sleep 1; Start-Web; Print-Info; break }
        default  { 
            Write-Host "用法: .\dev.ps1 [server|web|all]"
            Write-Host ""
            Write-Host "  all     启动前端和后端（默认）"
            Write-Host "  server  仅启动后端"
            Write-Host "  web     仅启动前端"
            exit 1 
        }
    }

    # 主循环维持运行，等待用户按下 Ctrl+C 触发 finally 退出
    while ($true) {
        Start-Sleep -Seconds 1
    }
}
finally {
    Write-Host "`n🛑 正在关闭所有服务..." -ForegroundColor Yellow
    if ($null -ne $global:serverProcess -and -not $global:serverProcess.HasExited) {
        Stop-Process -Id $global:serverProcess.Id -Force -ErrorAction SilentlyContinue
    }
    if ($null -ne $global:webProcess -and -not $global:webProcess.HasExited) {
        Stop-Process -Id $global:webProcess.Id -Force -ErrorAction SilentlyContinue
    }
    Write-Host "✅ 所有服务已关闭" -ForegroundColor Green
}
