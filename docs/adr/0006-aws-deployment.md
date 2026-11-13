# ADR 0006: AWS deployment on one Lightsail instance

Status: superseded by [ADR 0007](0007-static-hosting.md). The deployment scripts and compose files now live only on the `full-stack-aws` branch.

## Decision

`make deploy` puts the whole site on one Amazon Lightsail instance (Ubuntu 24.04, `micro_3_0`: 1 GB RAM,
2 vCPUs, 40 GB disk, about $7 a month, public IPv4 included) in `us-east-1`, using the AWS CLI profile
`planet2planet`. The domain is `planet2planet.com`, registered at Namecheap.

On the server, `docker-compose.prod.yml` runs three containers:

- **Caddy** terminates HTTPS (certificates are requested and renewed automatically), serves the built
  React files, and proxies `/api`, `/admin` and `/static` to Django.
- **Django under gunicorn**, two workers, as a non-root user. WhiteNoise serves the admin's static files.
- **PostgreSQL 16** with a named volume and no published port, tuned for 1 GB (`shared_buffers=128MB`).

A 1 GB swap file gives headroom. Security updates install automatically. SSH is by key only, and the
Lightsail firewall opens only ports 22, 80 and 443.

## What `deploy/deploy.sh` does

It is safe to run again. Each step checks before it creates.

1. Generates an SSH key and the production secrets (database password, `SECRET_KEY`) into `.deploy/`, which
   is git-ignored. Later deploys reuse them.
2. Creates the instance, a static IP, and the firewall rules.
3. Waits for first-time setup (Docker, swap), builds the frontend on your machine, and uploads the backend,
   the built files, the Compose file and the Caddyfile with rsync.
4. Builds the backend image on the server, starts the stack, and loads the data on the first deploy
   (`SEED=1` reloads it).
5. Installs a nightly `pg_dump` kept for 14 days. Optional extras: `SNAPSHOTS=1` for daily Lightsail
   snapshots, and `BUDGET_EMAIL=...` for a $10 a month AWS Budgets alert.
6. Checks DNS. If the domain does not yet point at the server, it prints the two Namecheap records to add.

`make deploy-status` shows the instance, DNS and HTTPS. `make deploy-ssh` opens a shell. `make destroy`
deletes the instance, static IP and key pair after you type a confirmation.

## Rulings

- **Upload with rsync instead of a container registry.** PLAN.md section 17 suggested building images in
  GitHub Actions and pulling them from GitHub Container Registry. One command from a laptop is simpler,
  needs no registry credentials on the server, and the backend image is small. Cost if wrong: deploys depend
  on the deployer's machine, so a CI deploy job is the natural next step.
- **Backups stay on the server.** A Lightsail instance cannot use an IAM role, so sending dumps to S3 would
  mean putting long-lived credentials on the box. The data is rebuilt from the repository; only visitor
  inquiries are unique, so a nightly local dump is enough for a demo. Turn on `SNAPSHOTS=1` for an off-box copy.
- **SSH is open to the internet, by key only.** The deployer's IP changes, so it cannot be pinned in the firewall.
- **DNS is manual.** Namecheap's API needs a separate whitelist and key, so the script prints the records
  instead. Caddy gets the certificate on its own once they resolve.
- **Stopping does not save money.** Lightsail bills a stopped instance. To pause, snapshot and delete it.

## Growing later

Move the static files to S3 and CloudFront, use a 2 GB bundle (`BUNDLE=small_3_0`), or move PostgreSQL to a
managed database. Each is a configuration change.
