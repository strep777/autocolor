@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
title 毛布选色 · 色研所 - 启动器
cd /d "%~dp0"

rem 端口优先级：环境变量 > .env 中的 APP_PORT > 8000
if "%APP_PORT%"=="" if exist ".env" (
    for /f "tokens=1,* delims==" %%A in (.env) do (
        if /i "%%A"=="APP_PORT" set "APP_PORT=%%B"
    )
)
if "%APP_PORT%"=="" set "APP_PORT=8000"
set "PORT=%APP_PORT%"
set "URL=http://localhost:%PORT%"

echo.
echo  ============================================
echo    毛布选色 · 色研所   PlushColor
echo  ============================================
echo.

rem ---------- 0. 已经在运行？直接打开 ----------
call :health
if not errorlevel 1 (
    echo  服务已经在运行，正在打开浏览器...
    start "" "%URL%"
    timeout /t 2 >nul
    exit /b 0
)

rem 端口被其他程序占用（但不是本项目）时，自动换一个可用端口
call :port_busy %PORT%
if not errorlevel 1 (
    set "FALLBACK="
    for %%P in (8011 8012 8013 8014 8015 8020) do (
        if not defined FALLBACK (
            call :port_busy %%P
            if errorlevel 1 set "FALLBACK=%%P"
        )
    )
    if not defined FALLBACK (
        echo  [启动失败] 8000-8020 范围内没有可用端口，请关闭占用程序后重试。
        pause
        exit /b 1
    )
    echo  端口 %PORT% 已被其他程序占用，自动改用 !FALLBACK!。
    set "PORT=!FALLBACK!"
    set "URL=http://localhost:!PORT!"
)

rem ---------- 1. 优先使用 Docker ----------
where docker >nul 2>&1
if not errorlevel 1 (
    docker info >nul 2>&1
    if not errorlevel 1 (
        docker compose version >nul 2>&1
        if not errorlevel 1 (
            set "DC=docker compose"
        ) else (
            where docker-compose >nul 2>&1
            if not errorlevel 1 set "DC=docker-compose"
        )
        if defined DC (
            echo  [1/2] 正在构建并启动 Docker 容器...
            !DC! up -d --build
            if errorlevel 1 (
                echo.
                echo  Docker 启动失败，尝试改用本机 Python 运行...
                goto :local
            )
            echo  [2/2] 等待服务就绪...
            call :wait
            if errorlevel 1 goto :fail
            start "" "%URL%"
            echo.
            echo  已启动：%URL%
            echo  停止服务请双击 stop.bat
            timeout /t 3 >nul
            exit /b 0
        )
    )
)

:local
echo  未检测到可用的 Docker，使用本机 Python 启动（普通用户权限）。
echo.

rem ---------- 2. 准备 Python 虚拟环境 ----------
set "PY=.venv\Scripts\python.exe"
if not exist "%PY%" (
    echo  [1/4] 创建 Python 虚拟环境...
    where py >nul 2>&1
    if not errorlevel 1 (
        py -3 -m venv .venv
    ) else (
        python -m venv .venv
    )
    if errorlevel 1 goto :nodeps
    "%PY%" -m pip install --upgrade pip setuptools wheel
    if errorlevel 1 goto :nodeps
)

"%PY%" -c "import fastapi, sqlalchemy, cryptography" >nul 2>&1
if errorlevel 1 (
    echo  [2/4] 安装后端依赖（首次可能需要几分钟）...
    "%PY%" -m pip install -r backend\requirements.txt
    if errorlevel 1 goto :nodeps
)

rem ---------- 3. 准备前端构建产物 ----------
if not exist "frontend\dist\index.html" (
    where npm >nul 2>&1
    if errorlevel 1 goto :nodeps
    echo  [3/4] 构建前端页面（首次可能需要几分钟）...
    pushd frontend
    if not exist "node_modules" (
        call npm install --no-audit --no-fund
    )
    call npm run build
    popd
    if not exist "frontend\dist\index.html" goto :nodeps
) else (
    echo  [3/4] 前端页面已就绪。
)

rem ---------- 4. 启动 ----------
echo  [4/4] 启动服务...
start "PlushColor" /min "%PY%" -m uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port %PORT%
call :wait
if errorlevel 1 goto :fail

start "" "%URL%"
echo.
echo  本机访问：%URL%
echo  局域网访问：http://本机IP:%PORT%（用 ipconfig 查看 IPv4 地址）
echo  停止服务请双击 stop.bat
timeout /t 3 >nul
exit /b 0

:wait
for /l %%i in (1,1,45) do (
    call :health
    if not errorlevel 1 exit /b 0
    timeout /t 2 >nul
)
exit /b 1

:health
curl -f -s -o nul --max-time 2 "http://127.0.0.1:%PORT%/api/health"
exit /b %errorlevel%

:port_busy
netstat -ano | findstr /r /c:":%~1 .*LISTENING" >nul 2>&1
exit /b %errorlevel%

:nodeps
echo.
echo  [启动失败] 当前电脑缺少 Docker，或未安装 Python / Node.js。
echo   推荐安装 Docker Desktop 后重新双击 start.bat；
echo   或安装 Python 3.10+ 与 Node.js 20+ 再试。
echo.
pause
exit /b 1

:fail
echo.
echo  [启动失败] 服务未能在 90 秒内就绪，请查看窗口中的错误日志。
echo   端口 %PORT% 可能被占用；也可修改环境变量 APP_PORT 后重试。
echo.
pause
exit /b 1
