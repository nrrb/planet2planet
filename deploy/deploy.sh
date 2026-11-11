#!/usr/bin/env bash
# Deploys Planet2Planet to one Amazon Lightsail instance. See docs/adr/0006-aws-deployment.md.
#
#   deploy/deploy.sh deploy    create anything missing, build, upload and start (safe to repeat)
#   deploy/deploy.sh status    show the instance, the address, DNS and HTTPS
#   deploy/deploy.sh ssh       open a shell on the server
#   deploy/deploy.sh destroy   delete the instance, static IP and key pair (asks first)
#
# Settings (environment variables, all optional):
#   AWS_PROFILE=planet2planet  AWS_REGION=us-east-1  DOMAIN=planet2planet.com
#   BUNDLE=micro_3_0           SEED=1 (reload the data)     SNAPSHOTS=1 (daily Lightsail snapshots, extra cost)
#   BUDGET_EMAIL=you@example   (create a $10 a month AWS Budgets alert)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE="$ROOT/.deploy"
export AWS_PROFILE="${AWS_PROFILE:-planet2planet}"
export AWS_REGION="${AWS_REGION:-us-east-1}"
export AWS_PAGER=""
DOMAIN="${DOMAIN:-planet2planet.com}"
NAME="${INSTANCE_NAME:-planet2planet}"
BUNDLE="${BUNDLE:-micro_3_0}"
BLUEPRINT="ubuntu_24_04"
ZONE="${AWS_REGION}a"
REMOTE_DIR="/home/ubuntu/planet2planet"
REPO_URL="${REPO_URL:-https://github.com/nrrb/planet2planet}"
KEY="$STATE/id_ed25519"

say() { printf '\n==> %s\n' "$*"; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }
ls_() { aws lightsail "$@"; }

need() { command -v "$1" >/dev/null 2>&1 || die "$1 is required but was not found"; }

preflight() {
  for c in aws ssh ssh-keygen rsync openssl npm dig; do need "$c"; done
  aws sts get-caller-identity --query Arn --output text >/dev/null 2>&1 ||
    die "the AWS profile '$AWS_PROFILE' is not signed in (try: aws sso login --profile $AWS_PROFILE)"
  echo "AWS profile $AWS_PROFILE, region $AWS_REGION"
  mkdir -p "$STATE"
  chmod 700 "$STATE"
}

instance_ip() {
  ls_ get-static-ip --static-ip-name "$NAME-ip" --query 'staticIp.ipAddress' --output text 2>/dev/null || true
}

instance_exists() {
  ls_ get-instance --instance-name "$NAME" >/dev/null 2>&1
}

ssh_opts=(-i "$KEY" -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new
  -o "UserKnownHostsFile=$STATE/known_hosts" -o ConnectTimeout=10 -o LogLevel=ERROR)
remote() { ssh "${ssh_opts[@]}" "ubuntu@$(instance_ip)" "$@"; }
rsync_ssh() { echo "ssh ${ssh_opts[*]}"; }

make_secrets() {
  # Generated once, kept out of git, and reused on every later deploy.
  if [ ! -f "$STATE/env" ]; then
    say "Generating production secrets in .deploy/env"
    (
      umask 077
      {
        echo "DOMAIN=$DOMAIN"
        echo "POSTGRES_DB=planet2planet"
        echo "POSTGRES_USER=planet2planet"
        echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)"
        echo "SECRET_KEY=$(openssl rand -hex 48)"
      } >"$STATE/env"
    )
  fi
  # A changed DOMAIN must reach the server, but the passwords must not change.
  if ! grep -qx "DOMAIN=$DOMAIN" "$STATE/env"; then
    sed -i.bak "s|^DOMAIN=.*|DOMAIN=$DOMAIN|" "$STATE/env" && rm -f "$STATE/env.bak"
  fi
}

make_key() {
  if [ ! -f "$KEY" ]; then
    say "Creating an SSH key in .deploy/"
    ssh-keygen -q -t ed25519 -N "" -C "planet2planet-deploy" -f "$KEY"
  fi
  if ! ls_ get-key-pair --key-pair-name "$NAME" >/dev/null 2>&1; then
    ls_ import-key-pair --key-pair-name "$NAME" --public-key-base64 "$(cat "$KEY.pub")" >/dev/null
  fi
}

user_data() {
  cat <<'USERDATA'
#!/bin/bash
set -eux
export DEBIAN_FRONTEND=noninteractive
if [ ! -f /swapfile ]; then
  fallocate -l 1G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
apt-get update -y
apt-get install -y docker.io docker-compose-v2 unattended-upgrades cron
usermod -aG docker ubuntu
# SSH by key only.
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart ssh
systemctl enable --now docker
touch /var/lib/planet2planet-ready
USERDATA
}

create_infrastructure() {
  make_key
  if ! instance_exists; then
    say "Creating the Lightsail instance ($BUNDLE, $BLUEPRINT, $ZONE)"
    user_data >"$STATE/user-data.sh"
    ls_ create-instances --instance-names "$NAME" --availability-zone "$ZONE" \
      --blueprint-id "$BLUEPRINT" --bundle-id "$BUNDLE" --key-pair-name "$NAME" \
      --user-data "file://$STATE/user-data.sh" \
      --tags key=project,value=planet2planet >/dev/null
  fi
  if ! ls_ get-static-ip --static-ip-name "$NAME-ip" >/dev/null 2>&1; then
    say "Allocating a static IP"
    ls_ allocate-static-ip --static-ip-name "$NAME-ip" >/dev/null
  fi
  say "Waiting for the instance to run"
  until [ "$(ls_ get-instance-state --instance-name "$NAME" --query 'state.name' --output text)" = running ]; do sleep 5; done
  local attached
  attached="$(ls_ get-static-ip --static-ip-name "$NAME-ip" --query 'staticIp.isAttached' --output text)"
  [ "$attached" = True ] || ls_ attach-static-ip --static-ip-name "$NAME-ip" --instance-name "$NAME" >/dev/null
  # Only SSH (key only), HTTP and HTTPS are reachable.
  ls_ put-instance-public-ports --instance-name "$NAME" --port-infos \
    fromPort=22,toPort=22,protocol=tcp fromPort=80,toPort=80,protocol=tcp \
    fromPort=443,toPort=443,protocol=tcp >/dev/null
  if [ "${SNAPSHOTS:-0}" = 1 ]; then
    ls_ enable-add-on --resource-name "$NAME" \
      --add-on-request 'addOnType=AutoSnapshot,autoSnapshotAddOnRequest={snapshotTimeOfDay=06:00}' >/dev/null || true
  fi
}

wait_for_server() {
  say "Waiting for the server to finish its first-time setup (a few minutes on a new instance)"
  local i
  for i in $(seq 1 90); do
    if remote 'test -f /var/lib/planet2planet-ready && docker info >/dev/null 2>&1' 2>/dev/null; then return; fi
    sleep 10
  done
  die "the server did not become ready; try: deploy/deploy.sh ssh"
}

build_frontend() {
  say "Building the frontend"
  (cd "$ROOT/frontend" && npm ci --silent && VITE_REPO_URL="$REPO_URL" npm run build)
}

upload() {
  say "Uploading"
  local host
  host="ubuntu@$(instance_ip)"
  remote "mkdir -p $REMOTE_DIR/backups"
  rsync -az --delete -e "$(rsync_ssh)" --exclude '__pycache__' --exclude '.pytest_cache' \
    --exclude '.ruff_cache' --exclude '*.egg-info' --exclude 'staticfiles' \
    "$ROOT/backend/" "$host:$REMOTE_DIR/backend/"
  rsync -az --delete -e "$(rsync_ssh)" "$ROOT/frontend/dist/" "$host:$REMOTE_DIR/frontend-dist/"
  rsync -az -e "$(rsync_ssh)" "$ROOT/docker-compose.prod.yml" "$ROOT/Caddyfile" "$host:$REMOTE_DIR/"
  rsync -az -e "$(rsync_ssh)" "$STATE/env" "$host:$REMOTE_DIR/.env"
  remote "chmod 600 $REMOTE_DIR/.env"
}

compose() { echo "cd $REMOTE_DIR && docker compose -f docker-compose.prod.yml"; }

start_stack() {
  say "Starting the stack"
  remote "$(compose) up -d --build --remove-orphans"
  say "Waiting for the API"
  local i probe
  probe="import urllib.request as u; u.urlopen(u.Request('http://localhost:8000/api/worlds/', headers={'Host': '$DOMAIN'}))"
  for i in $(seq 1 60); do
    if remote "$(compose) exec -T backend python -c \"$probe\"" >/dev/null 2>&1; then return; fi
    sleep 3
  done
  die "the API did not come up; check with: deploy/deploy.sh ssh, then docker compose -f docker-compose.prod.yml logs backend"
}

seed() {
  if [ "${SEED:-0}" = 1 ] || ! remote "test -f $REMOTE_DIR/.seeded"; then
    say "Loading the data"
    remote "$(compose) exec -T backend sh -c 'python manage.py load_dataset && python manage.py load_orbital_elements && python manage.py build_network && python manage.py generate_plans && python manage.py load_canon_facts && python manage.py load_simulation && python manage.py check_data' && touch $REMOTE_DIR/.seeded"
    remote "$(compose) restart backend" >/dev/null
  fi
}

install_backup() {
  say "Installing the nightly database backup (kept 14 days in $REMOTE_DIR/backups)"
  remote "sudo tee /etc/cron.d/planet2planet-backup >/dev/null" <<CRON
# Nightly dump of the database. The data can be rebuilt from the repository, but inquiries cannot.
17 3 * * * ubuntu $(compose) exec -T db sh -c 'pg_dump -U "\$POSTGRES_USER" "\$POSTGRES_DB"' | gzip > $REMOTE_DIR/backups/planet2planet-\$(date +\%F).sql.gz && find $REMOTE_DIR/backups -name '*.sql.gz' -mtime +14 -delete
CRON
}

budget_alert() {
  [ -n "${BUDGET_EMAIL:-}" ] || return 0
  local account
  account="$(aws sts get-caller-identity --query Account --output text)"
  if aws budgets describe-budget --account-id "$account" --budget-name planet2planet-monthly >/dev/null 2>&1; then return; fi
  say "Creating a \$10 a month budget alert"
  aws budgets create-budget --account-id "$account" \
    --budget '{"BudgetName":"planet2planet-monthly","BudgetLimit":{"Amount":"10","Unit":"USD"},"TimeUnit":"MONTHLY","BudgetType":"COST"}' \
    --notifications-with-subscribers "[{\"Notification\":{\"NotificationType\":\"ACTUAL\",\"ComparisonOperator\":\"GREATER_THAN\",\"Threshold\":80,\"ThresholdType\":\"PERCENTAGE\"},\"Subscribers\":[{\"SubscriptionType\":\"EMAIL\",\"Address\":\"$BUDGET_EMAIL\"}]}]"
}

dns_report() {
  local ip resolved
  ip="$(instance_ip)"
  resolved="$(dig +short A "$DOMAIN" @1.1.1.1 2>/dev/null | tail -1 || true)"
  if [ "$resolved" = "$ip" ]; then
    echo "DNS: $DOMAIN points at $ip"
    return 0
  fi
  cat <<MSG

DNS needs one change at your registrar (Namecheap: Domain List > Manage > Advanced DNS):

    Type   Host   Value
    A      @      $ip
    A      www    $ip

Delete any "URL Redirect" or parking records on @ and www. ${resolved:+Right now $DOMAIN resolves to $resolved.}
The server is already running. Caddy fetches the HTTPS certificate on its own a minute or so
after the records resolve. Check with: make deploy-status
MSG
  return 1
}

cmd_deploy() {
  preflight
  make_secrets
  create_infrastructure
  wait_for_server
  build_frontend
  upload
  start_stack
  seed
  install_backup
  budget_alert
  say "Done"
  echo "Server: $(instance_ip)"
  if dns_report; then echo "Site:   https://$DOMAIN"; fi
}

cmd_status() {
  preflight
  if ! instance_exists; then echo "No instance named $NAME in $AWS_REGION."; return; fi
  ls_ get-instance --instance-name "$NAME" --query 'instance.[name,state.name,bundleId,publicIpAddress]' --output text
  dns_report || true
  local code
  if code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "https://$DOMAIN/api/worlds/" 2>/dev/null)"; then
    echo "HTTPS: https://$DOMAIN/api/worlds/ answered $code"
  fi
}

cmd_ssh() {
  preflight
  exec ssh "${ssh_opts[@]}" "ubuntu@$(instance_ip)"
}

cmd_destroy() {
  preflight
  echo "This deletes the Lightsail instance '$NAME' (and its database), its static IP and its key pair"
  echo "in $AWS_REGION, in the account for profile '$AWS_PROFILE'."
  read -r -p "Type 'destroy $NAME' to continue: " answer
  [ "$answer" = "destroy $NAME" ] || die "cancelled"
  if instance_exists; then ls_ delete-instance --instance-name "$NAME" --force-delete-add-ons >/dev/null; fi
  ls_ release-static-ip --static-ip-name "$NAME-ip" >/dev/null 2>&1 || true
  ls_ delete-key-pair --key-pair-name "$NAME" >/dev/null 2>&1 || true
  echo "Deleted. Local secrets remain in .deploy/ (git-ignored); remove them if you will not redeploy."
  echo "Remember to remove the A records for $DOMAIN at your registrar."
}

case "${1:-}" in
  deploy) cmd_deploy ;;
  status) cmd_status ;;
  ssh) cmd_ssh ;;
  destroy) cmd_destroy ;;
  *) sed -n '2,12p' "${BASH_SOURCE[0]}"; exit 2 ;;
esac
