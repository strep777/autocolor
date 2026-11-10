@echo off
setlocal EnableExtensions
chcp 65001 >nul
title 毛布选色 · 色研所 - 停止
cd /d "%~dp0"

echo.
echo  正在停止「毛布选色 · 色研所」...
echo.

rem ---------- Docker ----------
where docker >nul 2>&1
if not errorlevel 1 (
    docker info >nul 2>&1
    if not errorlevel 1 (
        docker compose version >nul 2>&1
        if not errorlevel 1 (
            docker compose down
        ) else (
            where docker-compose >nul 2>&1
            if not errorlevel 1 docker-compose down
        )
    )
)

rem ---------- 本地 Python 服务 ----------
rem 同时兼容 start.bat、serve.bat 以及由计划任务/SYSTEM 启动的实例。
rem 若普通权限无法结束，会自动请求管理员权限。
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0stop-server.ps1"
if errorlevel 2 (
    echo.
    echo  未能完全停止服务。
    echo  请右键选择「以管理员身份运行」本文件后重试。
    echo.
    pause
    exit /b 1
)
if errorlevel 1 (
    echo.
    echo  停止脚本执行失败，请查看上方提示。
    echo.
    pause
    exit /b 1
)

echo.
echo  已停止。数据保存在 data 目录，不会丢失。
echo.
exit /b 0
