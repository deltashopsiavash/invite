#!/usr/bin/env bash
set -Eeuo pipefail
DOMAIN="${1:-}"
REPO_URL=https://github.com/deltashopsiavash/invite.git
APP_DIR=/opt/invite
fail(){ printf '❌ %s\n' "$*" >&2;exit 1; }
[ "$(id -u)" -eq 0 ] || fail 'از sudo استفاده کن.'
if [ -z "$DOMAIN" ]; then
  echo 'دامنه سایت را وارد کن (بدون https://). مثال: domain.ir'
  if [ -r /dev/tty ]; then
    IFS= read -r -p 'دامنه: ' DOMAIN </dev/tty || true
  fi
  [ -n "$DOMAIN" ] || fail 'دامنه وارد نشد. برای نصب بدون حالت تعاملی: curl -fsSL https://raw.githubusercontent.com/deltashopsiavash/invite/main/scripts/install.sh | sudo bash -s -- domain.ir'
fi
DOMAIN="$(printf '%s' "$DOMAIN" | tr '[:upper:]' '[:lower:]')"
[[ "$DOMAIN" =~ ^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]([a-z0-9-]{0,61}[a-z0-9])?$ ]] || fail 'دامنه نامعتبر است؛ فقط نام دامنه را بنویس.'
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
