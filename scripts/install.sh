#!/usr/bin/env bash
set -Eeuo pipefail

REPO_URL="https://github.com/deltashopsiavash/invite.git"
APP_DIR="/opt/invite"
CADDY_MAIN="/etc/caddy/Caddyfile"
CADDY_SITE="/etc/caddy/sites/invite.caddy"
DOMAIN="${1:-}"

fail() { printf '\n❌ %s\n' "$*" >&2; exit 1; }
info() { printf '\n▶ %s\n' "$*"; }

if [ "$(id -u)" -ne 0 ]; then
  fail 'این دستور باید با sudo اجرا بشه.'
fi

if [ -z "$DOMAIN" ]; then
  if [ -t 0 ]; then
    read -rp 'دامنه را وارد کنید (مثلاً invite.example.com): ' DOMAIN
  else
    fail 'دامنه را در انتهای دستور وارد کنید: curl -fsSL https://raw.githubusercontent.com/deltashopsiavash/invite/main/scripts/install.sh | sudo bash -s -- invite.example.com'
  fi
fi
DOMAIN="$(printf '%s' "$DOMAIN" | tr '[:upper:]' '[:lower:]')"
if [[ ! "$DOMAIN" =~ ^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]([a-z0-9-]{0,61}[a-z0-9])?$ ]] || [ "${#DOMAIN}" -gt 253 ]; then
  fail 'دامنه نامعتبر است. فقط نام دامنه (بدون https:// یا /) وارد کنید.'
fi

if [ -e "$APP_DIR" ] && [ ! -d "$APP_DIR/.git" ]; then
  fail "$APP_DIR وجود دارد ولی پوشهٔ Git نیست. برای امنیت، آن را تغییر نمی‌دهیم."
fi

info 'نصب پیش‌نیازها (Git و Caddy)...'
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y git caddy ca-certificates

info 'دریافت آخرین نسخهٔ سایت از GitHub...'
if [ -d "$APP_DIR/.git" ]; then
  origin_url="$(git -C "$APP_DIR" remote get-url origin 2>/dev/null || true)"
  [ "$origin_url" = "$REPO_URL" ] || fail 'آدرس origin با ریپوی این پروژه مطابقت ندارد؛ فایل‌ها دست‌نخورده باقی ماندند.'
  git -C "$APP_DIR" pull --ff-only origin main
else
  git clone --branch main --single-branch "$REPO_URL" "$APP_DIR"
fi

[ -f "$APP_DIR/site/index.html" ] || fail 'فایل اصلی سایت در ریپو موجود نیست.'
chmod -R a+rX "$APP_DIR/site"
cat > /usr/local/bin/invite-update <<'WRAPPER'
#!/usr/bin/env bash
exec /bin/bash /opt/invite/scripts/update.sh "$@"
WRAPPER
chmod 755 /usr/local/bin/invite-update

info 'تنظیم دامنه و HTTPS خودکار...'
install -d -m 755 /etc/caddy/sites
cat > "$CADDY_SITE" <<CADDY
$DOMAIN {
    root * /opt/invite/site
    encode zstd gzip
    header {
        X-Content-Type-Options nosniff
        Referrer-Policy strict-origin-when-cross-origin
        X-Frame-Options DENY
        Cache-Control "no-cache, must-revalidate"
    }
    file_server
}
CADDY

# Only append our import once; preserve existing site configuration.
if ! grep -Fqx 'import /etc/caddy/sites/*.caddy' "$CADDY_MAIN"; then
  printf '\n# Invitation website (managed by /opt/invite/scripts/install.sh)\nimport /etc/caddy/sites/*.caddy\n' >> "$CADDY_MAIN"
fi

caddy fmt --overwrite "$CADDY_SITE" >/dev/null
caddy validate --config "$CADDY_MAIN" --adapter caddyfile || fail 'تنظیمات Caddy معتبر نیست. تنظیمات سایت‌های دیگر سرور را بررسی کنید.'
systemctl enable caddy
systemctl restart caddy

printf '\n✅ سایت نصب شد: https://%s\n' "$DOMAIN"
printf 'برای آپدیت‌های بعدی فقط این دستور را بزنید: sudo invite-update\n'
printf '\n⚠️ دامنه باید به IP سرور اشاره کند و پورت‌های TCP 80 و 443 باز باشند تا Caddy گواهی SSL بگیرد.\n'