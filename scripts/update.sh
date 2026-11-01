#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="/opt/invite"
REPO_URL="https://github.com/deltashopsiavash/invite.git"
if [ "$(id -u)" -ne 0 ]; then
  echo '❌ برای آپدیت از sudo invite-update استفاده کنید.' >&2
  exit 1
fi
if [ ! -d "$APP_DIR/.git" ]; then
  echo '❌ سایت در /opt/invite نصب نشده است.' >&2
  exit 1
fi
if [ "$(git -C "$APP_DIR" remote get-url origin)" != "$REPO_URL" ]; then
  echo '❌ آدرس ریپوی پروژه مطابقت ندارد. آپدیت متوقف شد.' >&2
  exit 1
fi
if [ -n "$(git -C "$APP_DIR" status --porcelain --untracked-files=no)" ]; then
  echo '❌ فایل‌های Git روی سرور به صورت دستی تغییر کرده‌اند؛ برای جلوگیری از پاک شدن تغییرات، آپدیت متوقف شد.' >&2
  exit 1
fi

git -C "$APP_DIR" pull --ff-only origin main
echo '✅ آپدیت انجام شد! بدون بیلد و بدون ری‌استارت، با رفرش صفحه تغییرات نمایش داده می‌شوند.'