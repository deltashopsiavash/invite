#!/usr/bin/env bash
set -Eeuo pipefail
DOMAIN="${1:-}"
REPO_URL=https://github.com/deltashopsiavash/invite.git
APP_DIR=/opt/invite
fail(){ printf '❌ %s\n' "$*" >&2;exit 1; }
[ "$(id -u)" -eq 0 ] || fail 'از sudo استفاده کن.'
[ -n "$DOMAIN" ] || fail 'دامنه را وارد کن. نمونه: sudo bash install.sh invite.example.com'
if ! command -v git >/dev/null; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y
  apt-get install -y git
fi
if [ -e "$APP_DIR" ] && [ ! -d "$APP_DIR/.git" ]; then fail '/opt/invite وجود دارد و پروژه Git نیست.';fi
if [ -d "$APP_DIR/.git" ]; then
  [ "$(git -C "$APP_DIR" remote get-url origin)" = "$REPO_URL" ] || fail 'ریپوی موجود با این پروژه مطابقت ندارد.'
  [ -z "$(git -C "$APP_DIR" status --porcelain --untracked-files=no)" ] || fail 'فایل‌های پروژه تغییر کرده‌اند.'
  git -C "$APP_DIR" pull --ff-only origin main
else
  git clone --branch main --single-branch "$REPO_URL" "$APP_DIR"
fi
bash "$APP_DIR/scripts/deploy.sh" "$DOMAIN"
