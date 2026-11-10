#!/bin/sh
# 容器入口：先修正挂载目录权限，再以非 root 用户 app(10001) 启动网页进程。
set -eu

DATA_DIR="${DATA_DIR:-/app/data}"

if [ "$(id -u)" = "0" ]; then
    mkdir -p "$DATA_DIR/uploads"
    # 绑定挂载的宿主机目录通常属于 root，交给 app 用户后才能写 SQLite 与上传文件
    chown -R app:app "$DATA_DIR" 2>/dev/null || true
    exec gosu app "$@"
fi

exec "$@"
