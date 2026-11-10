# Planet2Planet

A telecom comparison-shopping site set in the Sol system in 2380, in the Star Trek universe.
Pick two worlds and compare the interplanetary subspace plans that connect them on price,
latency, route and resilience.

See [PLAN.md](PLAN.md) for the full build plan.

## Fan work disclaimer

Planet2Planet is unofficial fan work. It is not affiliated with, endorsed by or sponsored by
Paramount, CBS Studios or any Star Trek rights holder. It uses no Star Trek logos, insignia,
images or interface designs. Canon facts come from on-screen sources; pricing, company names
and the solar conjunction rule are invented for this project.

## Quick start

```sh
cp .env.example .env
make up
```

Then load the data and start the frontend:

```sh
make seed                 # migrate, then load the dataset, network and plans
cd frontend && npm install && npm run dev
```

Open the URL Vite prints (usually http://127.0.0.1:5173). The API runs on
http://127.0.0.1:8000, with Swagger docs at `/api/docs/` and the admin at `/admin/`
(`docker compose run --rm backend python manage.py createsuperuser` first).

Requires Docker with Compose, and `make`. Node LTS and Python 3.12+ are only needed to run
tools outside containers.

## Layout

- `backend/`: Django + DRF API and PostgreSQL data (from M1)
- `frontend/`: React + Vite app, including the Pixi map code
- `tools/`: the simulation script that regenerates the dataset
- `docs/`: derivation notes and architecture decision records

## Licence

[MIT](LICENSE). The fan disclaimer above applies to all content.
