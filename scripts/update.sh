#!/usr/bin/env bash
set -Eeuo pipefail
APP_DIR=/opt/invite
REPO_URL=https://github.com/deltashopsiavash/invite.git
[ "$(id -u)" -eq 0 ] || { echo '❌ از sudo invite-update استفاده کن.' >&2; exit 1; }
[ -d "$APP_DIR/.git" ] || { echo '❌ این سرور هنوز نصب نشده. از دستور نصب تازه در README گیت‌هاب استفاده کن.' >&2; exit 1; }
[ "$(git -C "$APP_DIR" remote get-url origin)" = "$REPO_URL" ] || { echo '❌ آدرس ریپو تغییر کرده است.' >&2; exit 1; }
[ -z "$(git -C "$APP_DIR" status --porcelain --untracked-files=no)" ] || { echo '❌ فایل‌های پروژه روی سرور تغییر کرده‌اند. ابتدا تغییرات را بررسی کن.' >&2; exit 1; }
git -C "$APP_DIR" pull --ff-only origin main
bash "$APP_DIR/scripts/deploy.sh"
echo '✅ آپدیت انجام شد و دیتابیس و عکس‌های قبلی حفظ شدند.'
