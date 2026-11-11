# ADR 0003: Plans, offers and pricing

Status: accepted (M4)

Everything here is invented for the product (PLAN.md 6); none of it is canon.

## Plans

- `generate_plans` stamps plans from templates by company kind (backbone: 5 plans, regional:
  2, gateway: 2) plus niche specialist plans, and sets each company's `price_positioning`
  (0.85 cheap to 1.25 premium; older is pricier, startups cheaper, seeded jitter).
- Merged companies get no plans and no positioning.
- The Emergency Priority plan is an **add-on**, not an offer. Offers show it as an option
  (except on Contingency, which includes the priority lane).
- Hardening plans carry the company's environment; environment slugs are kebab-case
  (`gas-giant-orbit`).

## Offers

- **End-to-end:** any non-gateway company covering both ends, for each standalone plan.
  Allowed carriers are the company plus its divisions. Diverse Path and Contingency add a
  contracted partner backbone from another corporate family (the cheapest) and need a second,
  backbone-disjoint route; they do not exist within one region.
- **Packages** (different regions only): access plan at each end, plus a standard-tier
  backbone transit plan. **Ruling:** an end with no access partner is served by the transit
  carrier's own mesh, so Jupiter to Saturn still gets packages (Jupiter has no gateway or
  regional carrier; Saturn has Cassini Link). At least one end must have a partner. Each
  carrier is confined to its own leg when routing. At most three per transit carrier,
  family-first then cheapest.
- Offer ids are a hash of origin, destination, plans and partners.

## Formula

As PLAN.md 6.3, with these choices: provider positioning applies per line (each plan to its
own company; hop fees to the lead); the family discount (5%) and waived handoffs apply when
every carrier on a route shares one corporate family (spin-off, ownership or acquisition
links); environment surcharges apply once per distinct environment required at either end.
Breakdown lines come from rounded running totals so they always sum to the price.

## Known tuning

Packages always cost more than the lead carrier's own end-to-end plan, because they add
partner plans without removing any cost. They are there to show partner choice, not savings.
Prices are all in `PricingParameter` and can be retuned in Django admin.
