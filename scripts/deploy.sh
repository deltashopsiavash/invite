#!/usr/bin/env bash
set -Eeuo pipefail
APP_DIR=/opt/invite
DATA_DIR=/var/lib/invite
SITE_CONF=/etc/caddy/sites/invite.caddy
MAIN_CONF=/etc/caddy/Caddyfile
DOMAIN="${1:-}"
fail(){ printf '❌ %s\n' "$*" >&2; exit 1; }
msg(){ printf '\n▶ %s\n' "$*"; }
[ "$(id -u)" -eq 0 ] || fail 'دستور باید با sudo اجرا شود.'
[ -f "$APP_DIR/package.json" ] || fail 'فایل package.json پیدا نشد.'
[ -f "$APP_DIR/server/index.js" ] || fail 'فایل بک‌اند پیدا نشد.'

if [ -z "$DOMAIN" ] && [ -f "$SITE_CONF" ]; then
  DOMAIN="$(awk '/^[[:space:]]*[A-Za-z0-9.-]+[[:space:]]+[{][[:space:]]*$/{print $1;exit}' "$SITE_CONF")"
fi
DOMAIN="$(printf '%s' "$DOMAIN" | tr '[:upper:]' '[:lower:]')"
[[ "$DOMAIN" =~ ^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]([a-z0-9-]{0,61}[a-z0-9])?$ ]] || fail 'دامنه پیدا نشد. نمونه: sudo bash /opt/invite/scripts/deploy.sh siavash.deltamarket5.ir'
[ "${#DOMAIN}" -le 253 ] || fail 'نام دامنه بیش از اندازه بلند است.'

if ! command -v node >/dev/null || ! command -v npm >/dev/null || ! command -v caddy >/dev/null || ! command -v openssl >/dev/null; then
  msg 'نصب پیش‌نیازهای لازم...'
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y
  apt-get install -y nodejs npm caddy openssl ca-certificates curl
fi
MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$MAJOR" -ge 18 ] || fail 'برای نسخه دوم Node.js 18 یا بالاتر نیاز است.'
command -v curl >/dev/null || fail 'ابزار curl نصب نیست.'
msg 'آماده‌سازی مسیر ذخیره‌سازی دائمی...'
if ! id invite >/dev/null 2>&1; then
  useradd --system --home-dir "$DATA_DIR" --shell /usr/sbin/nologin invite
fi
install -d -o invite -g invite -m 700 "$DATA_DIR" "$DATA_DIR/uploads" "$DATA_DIR/backups"
chmod -R a+rX "$APP_DIR/site"

if [ -f "$DATA_DIR/invite.sqlite" ]; then
  BACKUP="$DATA_DIR/backups/invite-$(date -u +%Y%m%d-%H%M%S).sqlite"
  cp -p "$DATA_DIR/invite.sqlite" "$BACKUP"
  chown invite:invite "$BACKUP"
  find "$DATA_DIR/backups" -maxdepth 1 -type f -name 'invite-*.sqlite' | sort -r | tail -n +6 | xargs -r rm -f
fi

msg 'نصب وابستگی‌های Node.js (فقط در صورت نیاز)...'
NEW_HASH="$(sha256sum "$APP_DIR/package.json" | cut -d ' ' -f1)"
OLD_HASH="$(cat "$DATA_DIR/deps.sha256" 2>/dev/null || true)"
if [ "$NEW_HASH" != "$OLD_HASH" ] || [ ! -d "$APP_DIR/node_modules/sql.js" ]; then
  (cd "$APP_DIR" && npm install --omit=dev --no-audit --no-fund --package-lock=false)
  printf '%s' "$NEW_HASH" > "$DATA_DIR/deps.sha256"
  chown invite:invite "$DATA_DIR/deps.sha256"
else
  echo 'وابستگی‌ها تغییری نکرده‌اند.'
fi
(cd "$APP_DIR" && npm run check)

FIRST_PASSWORD="$(openssl rand -hex 16)"
BOOT_STATUS="$(printf '%s' "$FIRST_PASSWORD" | runuser -u invite -- env INVITE_DATA_DIR="$DATA_DIR" node "$APP_DIR/server/index.js" bootstrap)"
if [ "$BOOT_STATUS" = 'CREATED' ]; then
  msg 'حساب مدیریت تازه ساخته شد.'
else
  FIRST_PASSWORD=''
  msg 'حساب مدیریت قبلی حفظ شد.'
fi

msg 'ایجاد سرویس API با دسترسی محدود...'
NODE_BINARY="$(command -v node)"
cat > /etc/systemd/system/invite-api.service <<UNIT
[Unit]
Description=Invite V2 API
After=network.target

[Service]
Type=simple
User=invite
Group=invite
WorkingDirectory=/opt/invite
Environment=NODE_ENV=production
Environment=INVITE_DATA_DIR=/var/lib/invite
Environment=INVITE_PORT=3477
ExecStart=$NODE_BINARY /opt/invite/server/index.js
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/invite
CapabilityBoundingSet=

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable invite-api >/dev/null
systemctl restart invite-api
READY=no
for i in $(seq 1 25); do
  if curl -fsS --max-time 2 http://127.0.0.1:3477/api/health >/dev/null 2>&1; then READY=yes;break;fi
  sleep 1
done
if [ "$READY" != yes ]; then
  journalctl -u invite-api -n 35 --no-pager || true
  fail 'بک‌اند راه نیفتاد؛ تنظیمات قبلی Caddy تغییری نکردند.'
fi

msg 'اتصال API به دامنه با حفظ HTTPS خودکار...'
install -d -m 755 /etc/caddy/sites
[ -f "$SITE_CONF" ] && cp -p "$SITE_CONF" "$SITE_CONF.before-v2"
cat > "$SITE_CONF" <<CONF
$DOMAIN {
    encode zstd gzip
    header {
        X-Content-Type-Options nosniff
        Referrer-Policy strict-origin-when-cross-origin
        X-Frame-Options DENY
        Cache-Control "no-cache, must-revalidate"
    }
    handle /api/* {
        reverse_proxy 127.0.0.1:3477
    }
    handle /uploads/* {
        reverse_proxy 127.0.0.1:3477
    }
    redir /admin /admin/ 308
    handle /admin/* {
        root * /opt/invite/site
        file_server
    }
    handle /assets/* {
        root * /opt/invite/site
        file_server
    }
    handle {
        root * /opt/invite/site
        try_files {path} /index.html
        file_server
    }
}
CONF
if ! grep -Fqx 'import /etc/caddy/sites/*.caddy' "$MAIN_CONF"; then
  printf '\nimport /etc/caddy/sites/*.caddy\n' >> "$MAIN_CONF"
fi
if ! caddy validate --config "$MAIN_CONF" --adapter caddyfile; then
  if [ -f "$SITE_CONF.before-v2" ]; then cp "$SITE_CONF.before-v2" "$SITE_CONF";else rm -f "$SITE_CONF";fi
  fail 'تنظیمات Caddy نامعتبر بود؛ تنظیم قبلی بازیابی شد.'
fi
systemctl enable caddy >/dev/null
systemctl reload caddy || systemctl restart caddy

cat > /usr/local/bin/invite-update <<'WRAP'
#!/usr/bin/env bash
exec /bin/bash /opt/invite/scripts/update.sh "$@"
WRAP
chmod 755 /usr/local/bin/invite-update
printf '\n✅ نسخه دوم فعال شد: https://%s/\n' "$DOMAIN"
printf '🔐 پنل مدیریت: https://%s/admin/\n' "$DOMAIN"
if [ -n "$FIRST_PASSWORD" ]; then
  printf '\n============================================\n'
  printf 'رمز مدیریت اولیه (فقط همین بار نمایش داده می‌شود):\n%s\n' "$FIRST_PASSWORD"
  printf '============================================\n'
  printf 'رمز را در جای امن نگهداری کن و در پنل تغییر بده.\n'
else
  printf 'رمز فعلی مدیریت بدون تغییر باقی ماند.\n'
fi
printf 'آپدیت‌های بعدی: sudo invite-update\n'
