# How the Sol 2380 telecom dataset was derived

This document explains where every part of `sol-telecom-2380.json` comes from: the real astronomy, the Star Trek canon, the simulation that fills in everything canon leaves open, and the choices that were simply invented. It is fan work set in the Star Trek universe and is not official.

## Contents

1. [What you get](#1-what-you-get)
   - [Why 2380](#why-2380)
2. [The worlds](#2-the-worlds)
3. [What canon fixes](#3-what-canon-fixes)
4. [The simulation](#4-the-simulation)
5. [Communications](#5-communications)
6. [Population](#6-population)
7. [Telecom companies](#7-telecom-companies)
8. [Results](#8-results)
9. [What is invented](#9-what-is-invented)
10. [Regenerating the data](#10-regenerating-the-data)
11. [Sources](#11-sources)

## 1. What you get

| File | What it is |
|---|---|
| `sol-telecom-2380.json` | The dataset: 33 worlds, 51 companies (46 still trading), 10 regions and 140 dated events, as of 2380. |
| `sol-telecom-2380.d.ts` | TypeScript types for the dataset, with every field documented. |
| `colonization-sim.js` | The simulation that produced it. Runs in Node with no dependencies. |

The dataset is one run of the simulation (seed 1701), so every number in it is consistent with every other: a company only serves worlds that exist and are settled, a world's providers all list that world, and every ID resolves. Where this document quotes a median across many runs, it says so.

### Using it in a JavaScript app

```js
import data from "./sol-telecom-2380.json" with { type: "json" };

const worlds = new Map(data.worlds.map((w) => [w.id, w]));
const companies = new Map(data.companies.map((c) => [c.id, c]));

// Everyone selling service on Titan, with the owner for divisions
const titan = worlds.get("titan");
const offers = titan.providerIds.map((id) => {
  const c = companies.get(id);
  return { brand: c.name, kind: c.kindLabel, owner: c.ownerId ? companies.get(c.ownerId).name : c.name, sectors: c.sectors };
});

// Industrial networks that work in high radiation
const hardened = data.companies.filter((c) => c.status !== "merged" && c.environment === "radiation");
```

IDs are stable kebab-case strings (`titan`, `ares-interplanetary`), so they work as URL slugs. Numbers are raw, with units in the field names (`radiusKm`, `surfaceGravityMs2`). A company's `status` tells you whether to sell it:

- **`active`:** an independent company.
- **`division`:** bought by a larger company but still sold under its own name. `ownerId` names the parent.
- **`merged`:** folded into its buyer's network. It is no longer sold, and is kept only for history.

### Why 2380

The snapshot year was chosen to give a mature market with as few complications from canon as possible:

- **The market is mature.** It fills in by about 2350. Every one of the 33 worlds is settled, 10 have passed a million people, and 32 have five or more providers. Running to 2400 instead gives an almost identical market.
- **It is close to canon's settled, everyday Federation.** *Star Trek: Lower Decks* is set in 2380 and 2381.
- **It comes after the Dominion War** (2373 to 2375), which brought two attacks to Sol: the Borg at Earth in 2373 (*Star Trek: First Contact*) and the Breen strike on Earth in 2375 (DS9 "The Changing Face of Evil"). Both are recent enough to explain why customers value redundant routes and separate providers, and neither left lasting damage.
- **It comes before the later upheavals.** These are the attack on Mars in 2385, which destroyed Utopia Planitia and set the planet's atmosphere ablaze; the ban on synthetics that followed it (PIC "Remembrance"); the Romulan supernova in 2387; and Frontier Day in 2401, when Starfleet's centrally linked fleet was turned against it (PIC "Võx"). Any of these would undercut the simulation's premise of Mars as the system's shipyard and busiest world.

## 2. The worlds

The 33 worlds are every body in the Solar System that could host a colony with its own ring of relay satellites, filtered from 477 known planets, dwarf planets and moons. A body qualifies if both of these hold:

1. **It is a real world.** Its surface gravity is at least 0.06 m/s², the level of Saturn's moon Mimas, the smallest body known to have pulled itself round. Anything smaller is a rubble pile or a captured fragment.
2. **Satellites can orbit it.** Stable orbits exist above its surface. A satellite stays bound only within about half a body's Hill radius, where its gravity beats its parent's. For moons close to a giant planet, that zone can sit below ground.

The 33 are the 8 planets, 5 dwarf planets (Ceres, Pluto, Haumea, Makemake, Eris) and 20 moons: the Moon; Io, Europa, Ganymede and Callisto; Mimas, Enceladus, Tethys, Dione, Rhea, Titan and Iapetus; Miranda, Ariel, Umbriel, Titania and Oberon; Triton; Charon; and Dysnomia.

Physical figures come from NASA's Jet Propulsion Laboratory, read in November 2026:

- **Orbits:** moon orbits from the satellite mean-elements table.
- **Masses:** moon masses from the satellite physical-parameters table.
- **Planets:** planet and dwarf-planet figures from the planetary physical-parameters table.
- **Radii:** taken from Wikipedia's list of natural satellites.

`mainElements` is a summary of each world's composition, most important element first: hydrogen and helium for the gas giants, oxygen and hydrogen (water ice) for the icy moons, iron and silicon for the rocky worlds.

## 3. What canon fixes

Every Star Trek fact was checked against Memory Alpha, the fan-run canon wiki. Only events shown or stated on screen count as canon here. Reference books and licensed novels were set aside. Several Memory Alpha pages could not be opened directly and were read from mirror copies, which may lag the live wiki; the sources list marks them.

### Starting conditions

These are built into the simulation as fact.

| Fact | What is stated on screen | How it is used |
|---|---|---|
| First warp flight, 2063 | Zefram Cochrane flies the *Phoenix* on 5 April 2063 (*Star Trek: First Contact*). | Background: why settlement accelerates. |
| Ships keep getting faster | Earth passes warp 2 in the 2140s, launches a warp 5 ship in 2151 and reaches warp 7 by 2161. Ships cruise at warp 6 in the 2260s and exceed warp 9 in the 24th century. | A "reach" score that rises every year from 2151. |
| Subspace radio, 2151 | Earth has subspace communication by 2151 and needs amplifiers to reach distant ships (ENT "Fortunate Son", "Silent Enemy"). *Enterprise* deploys the first, Echo One, in August 2151. Relay networks replace amplifiers by the 24th century (TNG "Aquiel"). | Constellations are subspace from 2151; older ones convert. |
| Subspace speed | "Approximately 52,000 times the speed of light" (Spock, SNW "All Those Who Wander"). Data's figure in TNG "Where No One Has Gone Before" works out to about 52,090. | Latency figures, at 52,000 times light speed. |
| The Moon, by 2069 | New Berlin is built between 2063 and 2069 (ENT "Terra Nova"). The Orpheus Mining Complex is built in 2090 (ENT "Demons"). | Settled before the start, dated 2069. |
| Mars, 2103 | Settlements exist by 2069, tied to Utopia Planitia (ENT "Terra Nova"). Mars is colonized in 2103 (VOY "The 37's"). Terraforming is under way by 2155 (ENT "Demons", "Terra Prime"). | Settled before the start, dated 2103; first relay 2069. |
| Utopia Planitia | Named with New Berlin as built before 2069 (ENT "Terra Nova"). Builds starships in the 24th century (TNG "Booby Trap", VOY "Relativity"). | The single shipyard all expeditions leave from. |
| Jupiter Station, 2151 | A station in orbit of Jupiter repairs and loads ships in 2151 (ENT "Fortunate Son"). | Jupiter starts with an orbital station. |
| Deuterium is fuel | Deuterium fuels matter-antimatter reactors, and 22nd-century colonies extract it (ENT "Marauders"). | Hydrogen-bearing worlds count as fuel sources. |
| Terraforming takes about 30 years by 2364 | TNG "Home Soil". | Caps how fast Venus can be finished. |

### Deadlines

For these worlds canon gives no founding date, only a year by which people are already there. The simulation is not steered toward them. All six were met in every one of 400 runs.

| World | What canon says | Simulated (median) |
|---|---|---|
| Ganymede | Inhabited by 2268: Scott has a drink he found there (TOS "By Any Other Name"). | Colonized 2171 |
| Titan | A mine is operating by 2259 (SNW "Memento Mori"); a research colony exists, undated (DIS "People of Earth"). | Colonized 2190 |
| Venus | Chakotay trains in its storms in the 2340s (VOY "Future's End, Part II"); terraforming stations by 2371 (DS9 "Past Tense, Part I"). | Colonized 2183 |
| Mimas | An emergency evacuation station by 2368 (TNG "The First Duty"). | Colonized 2205 |
| Saturn | Navigational control satellites in orbit by 2368 (TNG "The First Duty"). | Constellation 2173 |
| The Moon | Over 50 million people in 2373 (*Star Trek: First Contact*). | 55 million |

### Set aside

| Claim | Why it is not used |
|---|---|
| A lunar government in 2039 | From the reference book *Star Trek: Star Charts*, not an episode. |
| Research outposts on Ganymede and Europa in the early 2100s | Not found on screen. Europa has no settlement recorded before an emergency centre in 3190 (DIS "Coming Home"). The Jovian Run (TNG "Chain of Command, Part II") is a 24th-century shuttle route with no founding date. |
| Asteroid-belt mining for shipyards | Not found. Canon mentions the belt for pilot training (VOY "Future's End, Part II"). |
| Dilithium mining on Io, 2049; Pluto Base, 2039 | Both come from reference books. |
| Communication networks before 2151 | Canon dates no relay network in the Sol system before subspace, only exploration: Pioneer 11 at Saturn in 1979 (TNG "Loud as a Whisper") and the crewed Europa Mission in 2024 (PIC "Assimilation"). The pre-subspace constellations in the dataset are inferred. |

FYI on money: Picard says in *First Contact* that money doesn't exist in the 24th century, while Federation credits appear in the original series and latinum circulates in DS9. A credit economy in 2380 fits best as trade between worlds or with partners outside the Federation.

## 4. The simulation

`colonization-sim.js` is an agent-based simulation that runs year by year from 2151 to 2380. It has four kinds of agent:

- **Shipyard:** Utopia Planitia at Mars, the only place expeditions are built. It starts with two construction slips and gains one for every three units of industry across the colonies, up to eight.
- **Expedition:** built at the shipyard and sent to one world. It takes some years to set up, then succeeds or fails on a roll that gets easier as technology improves.
- **Colony:** one per settled world. Grows its industry and population every year. Colonies do not launch expeditions; their mining output feeds the shipyard.
- **Company:** an interplanetary telecom company (section 7).

Every year runs the same steps:

1. Pre-subspace constellations whose turn has come are converted to subspace.
2. Expeditions that arrive roll for success.
3. A successful expedition first puts up a subspace constellation. If the target is a moon, its parent planet gets one immediately beforehand as the hub.
4. The colony is founded a few years later. The gap shrinks from about 6 to 9 years in the 2150s to 1 to 3 years by the late 2200s.
5. The shipyard fills its free slips with new expeditions.
6. Each colony's population grows.
7. Companies are founded, spun off and bought.

Two rules always hold: no world is colonized before it has a constellation, and no moon gets a constellation before its parent. Neither was broken in 400 runs.

### Choosing targets

Each world gets a **value** and a **difficulty**, and the shipyard picks targets that are worth it and reachable.

- **Value (why go):** colonies exist to mine fuel for warp drives and materials for ships and stations. Hydrogen-bearing worlds count as fuel sources; iron, silicon, magnesium and carbon count as building stock; bigger worlds hold more. Moons of the giant planets get a bonus as bases for skimming the planet's atmosphere.
- **Difficulty (why wait):** penalties for orbiting faster than Earth, gravity above Earth's, being closer to the Sun than Earth, having no solid surface, and distance from Mars. A world in a system that already has a colony gets a small discount, as a staging point.

The "reach" score starts at 1.5 in 2151 and rises by 0.06 a year. The odds of an expedition succeeding depend on reach minus difficulty, so hard worlds come later. The four giant planets end up with orbital stations, never surface colonies.

## 5. Communications

Each world's `history` records its relay constellation:

- **`constellationEstablished`:** the year the first constellation went up.
- **`constellationStartedAs`:** `conventional` for light-speed relays built before 2151, `subspace` for everything after.
- **`subspaceSince`:** the year the world had subspace relays.

Earth, the Moon, Mars and Jupiter Station had conventional constellations before 2151:

- **Dates:** canon dates none of them. Earth's is set at 1962, the year of Telstar 1, the first real active relay satellite. Mars's is 2069, when settlements are first mentioned. The others are two years before their colony.
- **Conversion:** Earth converts to subspace in 2151 and the rest follow by 2157, most developed first.

`communications` gives each world's one-way subspace delay to Earth at closest and farthest approach, at 52,000 times light speed:

| World | One-way delay to Earth, closest | Farthest | Solar conjunction every |
|---|---|---|---|
| Moon | 0.025 ms | 0.025 ms | never |
| Mars | 5 ms | 24 ms | 780 days |
| Venus | 3 ms | 17 ms | 584 days |
| Ceres | 17 ms | 36 ms | 467 days |
| Jupiter | 40 ms | 60 ms | 399 days |
| Titan | 82 ms | 101 ms | 378 days |
| Triton | 280 ms | 299 ms | 367 days |
| Pluto | 369 ms | 388 ms | 367 days |
| Eris | 642 ms | 661 ms | 366 days |

Even Eris is under a second away, so every network in the system is about as fast as today's internet. Companies compete on reliability, clock synchronization, bandwidth and how well they survive harsh environments, not on raw speed.

`solarConjunctionWithEarthEveryDays` is how often the Sun passes between the world and Earth. Canon never says whether a body between two speakers blocks subspace. Natural phenomena such as ion storms and nebulae often disrupt ships' systems in Star Trek, so the likeliest reading is that a planet in the way does nothing, but a link that passes close to the Sun degrades. This is the same reason real spacecraft lose radio contact around solar conjunction. Whether to model it is left to your app.

## 6. Population

Canon gives one population figure for the Sol system outside Earth: over 50 million people on the Moon in 2373, about 300 years after New Berlin. Everything else in `population` is estimated from that anchor.

- **Growth:** every colony starts with 5,000 people and grows toward what its world can hold. The base growth rate is the one that takes a small Moon base to 50 million in about 300 years. It rises as technology improves, so later colonies fill up faster.
- **Capacity:** a Moon-like world holds about 55 million people in enclosed habitats. Capacity falls steeply with lower gravity and with heat from the Sun. Io is cut to 2% for its radiation and volcanism.
- **Terraforming:** Mars holds three times the Moon because it is being terraformed. Venus stays a 20,000-person station network until its terraforming finishes, which canon places after 2371.
- **Stations:** Mimas and Venus are treated as outposts, and the giant planets hold 50,000 people each on orbital stations.

Earth's population is not modelled.

In this run about 309 million people live off Earth in 2380. Ten worlds have passed a million, from the Moon in 2220 to Io in 2350; the other 22 hold between 6,000 and 890,000.

## 7. Telecom companies

Companies are agents in the simulation. They use their own random stream, so adding them changed none of the colonization or population results.

### Four kinds

| Kind | How it comes about |
|---|---|
| Interplanetary backbone | One grows out of each pre-subspace network: Earth, the Moon, Mars and Jupiter Station. A backbone keeps long-haul service to every region it opened, and competes in any region of 500,000 people or more. |
| Regional carrier | Spun off by the backbone that opened a region, once the region has 50,000 people and its first hub is 20 years old. |
| Local gateway | One when a world passes a million people, plus one per extra 50 million, up to six. Earth gets a fixed five because its population isn't modelled. |
| Specialist | One per niche when its trigger is met (below). |

Because every expedition leaves from Utopia Planitia, the Mars backbone opens most of the system and is the parent of nearly every regional carrier. Jupiter Station's network is the one older, separate lineage.

### Specialist niches

Each niche founds one company when enough of its worlds are settled, or enough people live on them. The company serves every settled world on its list.

- **Science:** research networks for the subsurface-ocean moons and for Titan's research colony, a deep-space observatory network at the edge of the system, and a solar observatory network on Mercury and Venus.
- **Industry:** terraforming control (Mars and Venus), supply-chain logistics for the Utopia Planitia shipyard, mining telemetry on Ceres and in the Jovian, Saturnian and outer moons, and deuterium fuel logistics at the gas giants.
- **Commerce:** trade clearing and system timekeeping for Earth, the Moon and Mars, and again for the outer system.
- **Navigation:** traffic control at Jupiter and beyond Saturn, and the navigational control satellites at Saturn that canon places there by 2368.
- **Harsh environments:** relays hardened for Jovian radiation, for the cold of the outer system and for heat and solar storms near the Sun, plus links for the gas-giant stations.
- **Emergency:** a system-wide emergency and evacuation network, founded once Mimas is settled, after canon's evacuation station there.

### Spin-offs, startups and buyouts

- **Spin-offs:** each new gateway or specialist has a 45% chance of being spun off from the carrier serving its home world; otherwise it is an independent startup.
- **Buyouts:** every year, each company older than 20 has a small chance of being bought: 0.25% for gateways and specialists, 0.12% for regional carriers, 0.15% for backbones, and at least two backbones always survive.
- **What happens after a buyout:** a carrier or gateway that is bought folds into its buyer's network. A specialist that is bought keeps trading under its own name as a division.

### Names

Names are generated from real surface features on each world (Kraken Mare on Titan, Tharsis on Mars, Loki on Io) or regional roots (Cassini, Herschel, Tombaugh), plus a word for the role. Well-known real telecom brands were avoided, but the names have not been checked against trademark registers. A different seed produces a different set of companies with the same structure.

## 8. Results

### Worlds

"Median colonized" is across 400 runs; everything else is this run.

| World | Region | Constellation | Subspace since | Colonized | Median colonized (400 runs) | Passed 1 million | Population in 2380 | Providers |
|---|---|---|---|---|---|---|---|---|
| Earth | Earth–Luna | 1962 (conventional) | 2151 | homeworld | homeworld | — | not modelled | 8 |
| Moon | Earth–Luna | 2067 (conventional) | 2154 | 2069 | 2069 | 2220 | 54.7 million | 8 |
| Mars | Mars | 2069 (conventional) | 2155 | 2103 | 2103 | 2237 | 152 million | 11 |
| Jupiter | Jovian | 2149 (conventional) | 2156 | 2151 | 2151 | — | 50 thousand | 10 |
| Io | Jovian | 2156 (subspace) | 2156 | 2163 | 2176 | 2350 | 1.08 million | 9 |
| Europa | Jovian | 2160 (subspace) | 2160 | 2167 | 2173 | 2317 | 14.2 million | 11 |
| Ceres | Belt | 2162 (subspace) | 2162 | 2170 | 2183 | — | 295 thousand | 4 |
| Ganymede | Jovian | 2162 (subspace) | 2162 | 2170 | 2171 | 2287 | 34.7 million | 11 |
| Callisto | Jovian | 2174 (subspace) | 2174 | 2183 | 2175 | 2323 | 11.7 million | 11 |
| Titan | Saturnian | 2182 (subspace) | 2182 | 2187 | 2190 | 2311 | 21.7 million | 12 |
| Venus | Inner | 2185 (subspace) | 2185 | 2193 | 2183 | — | 20 thousand | 6 |
| Dione | Saturnian | 2188 (subspace) | 2188 | 2196 | 2196 | — | 161 thousand | 8 |
| Tethys | Saturnian | 2190 (subspace) | 2190 | 2198 | 2197 | — | 39 thousand | 8 |
| Titania | Uranian | 2191 (subspace) | 2191 | 2198 | 2207 | — | 628 thousand | 7 |
| Rhea | Saturnian | 2193 (subspace) | 2193 | 2200 | 2195 | — | 237 thousand | 8 |
| Enceladus | Saturnian | 2196 (subspace) | 2196 | 2201 | 2200 | — | 19 thousand | 9 |
| Umbriel | Uranian | 2195 (subspace) | 2195 | 2201 | 2207 | — | 200 thousand | 6 |
| Triton | Neptunian | 2197 (subspace) | 2197 | 2204 | 2215 | 2313 | 5.87 million | 13 |
| Charon | Plutonian | 2198 (subspace) | 2198 | 2204 | 2222 | — | 310 thousand | 9 |
| Mimas | Saturnian | 2200 (subspace) | 2200 | 2206 | 2205 | — | 20 thousand | 8 |
| Haumea | Far Kuiper | 2203 (subspace) | 2203 | 2209 | 2225 | — | 890 thousand | 8 |
| Iapetus | Saturnian | 2202 (subspace) | 2202 | 2209 | 2193 | — | 143 thousand | 8 |
| Miranda | Uranian | 2203 (subspace) | 2203 | 2210 | 2211 | — | 6 thousand | 6 |
| Makemake | Far Kuiper | 2206 (subspace) | 2206 | 2213 | 2226 | — | 855 thousand | 8 |
| Ariel | Uranian | 2207 (subspace) | 2207 | 2213 | 2208 | — | 196 thousand | 6 |
| Pluto | Plutonian | 2198 (subspace) | 2198 | 2217 | 2221 | 2331 | 2.81 million | 11 |
| Oberon | Uranian | 2216 (subspace) | 2216 | 2222 | 2207 | — | 566 thousand | 7 |
| Eris | Far Kuiper | 2219 (subspace) | 2219 | 2226 | 2230 | 2339 | 4.75 million | 10 |
| Mercury | Inner | 2229 (subspace) | 2229 | 2234 | 2248 | — | 77 thousand | 5 |
| Dysnomia | Far Kuiper | 2230 (subspace) | 2230 | 2235 | 2233 | — | 12 thousand | 8 |
| Saturn | Saturnian | 2182 (subspace) | 2182 | 2236 | 2250 | — | 50 thousand | 9 |
| Uranus | Uranian | 2191 (subspace) | 2191 | 2260 | 2261 | — | 50 thousand | 8 |
| Neptune | Neptunian | 2197 (subspace) | 2197 | 2270 | 2278 | — | 50 thousand | 9 |

### Companies

In this run 51 companies are founded and 46 brands trade in 2380: 4 backbones, 6 regional carriers, 15 local gateways and 21 specialists, 5 of them divisions of larger companies. Every settled world has between 4 and 13 providers. Across 400 runs, a median of 51 companies are founded and 45 brands trade in 2380.

| Company | Kind | Headquarters | Founded | Origin | Status in 2380 | Worlds served |
|---|---|---|---|---|---|---|
| Terran Transit | Interplanetary backbone | Earth | 1962 | Pre-subspace network | Independent | 30 |
| Tycho Transit | Interplanetary backbone | Moon | 2067 | Pre-subspace network | Independent | 30 |
| Ares Interplanetary | Interplanetary backbone | Mars | 2069 | Pre-subspace network | Independent | 33 |
| Jovian Subspace | Interplanetary backbone | Jupiter | 2149 | Pre-subspace network | Independent | 30 |
| Arcadia Terraforming Control | Specialist | Mars | 2155 | Startup | Independent | 2 |
| Pacific Access | Local gateway | Earth | 2159 | Startup | Independent | 1 |
| Atlantic Access | Local gateway | Earth | 2160 | Startup | Merged into Terran Transit (2184) | — |
| Valles Yard Logistics | Specialist | Mars | 2160 | Startup | Independent | 1 |
| Himalia Hardened Relay | Specialist | Io | 2163 | Spun off from Jovian Subspace | Division of Jovian Subspace (bought 2281) | 5 |
| Sahel Access | Local gateway | Earth | 2165 | Startup | Merged into Terran Transit (2187) | — |
| Loki Mining Telemetry | Specialist | Io | 2167 | Spun off from Jovian Subspace | Independent | 5 |
| Pele Traffic Control | Specialist | Io | 2167 | Spun off from Jovian Subspace | Independent | 5 |
| Boreal Uplink | Local gateway | Earth | 2170 | Startup | Independent | 1 |
| Ceres Mining Telemetry | Specialist | Ceres | 2170 | Startup | Independent | 1 |
| Conamara Ocean Research | Specialist | Europa | 2170 | Startup | Independent | 6 |
| Austral Access | Local gateway | Earth | 2174 | Spun off from Terran Transit | Merged into Terran Transit (2234) | — |
| Ontario Research Network | Specialist | Titan | 2187 | Spun off from Ares Interplanetary | Independent | 1 |
| Caloris Solar Relay | Specialist | Venus | 2193 | Startup | Division of Ares Interplanetary (bought 2230) | 2 |
| Kraken Mining Telemetry | Specialist | Titan | 2198 | Startup | Independent | 7 |
| Xanadu Navigation | Specialist | Titan | 2198 | Spun off from Ares Interplanetary | Independent | 8 |
| Sycorax Mining Telemetry | Specialist | Titania | 2204 | Startup | Independent | 6 |
| Nereid Cryo Relay | Specialist | Triton | 2204 | Startup | Independent | 7 |
| Equatorial Emergency Net | Specialist | Earth | 2206 | Startup | Division of Terran Transit (bought 2299) | 33 |
| Cassini Link | Regional carrier | Titan | 2209 | Spun off from Ares Interplanetary | Independent | 8 |
| Le Verrier Deep Field | Specialist | Triton | 2209 | Spun off from Ares Interplanetary | Division of Ares Interplanetary (bought 2308) | 7 |
| Prospero Traffic Control | Specialist | Titania | 2217 | Startup | Division of Ares Interplanetary (bought 2362) | 7 |
| Tranquility Uplink | Local gateway | Moon | 2224 | Spun off from Terran Transit | Independent | 1 |
| Herschel Comms | Regional carrier | Titania | 2225 | Spun off from Ares Interplanetary | Merged into Ares Interplanetary (2370) | — |
| Selene Clearing | Specialist | Earth | 2227 | Spun off from Terran Transit | Independent | 3 |
| Maxwell Solar Observatory | Specialist | Venus | 2234 | Startup | Independent | 2 |
| Amalthea Fuel Logistics | Specialist | Jupiter | 2236 | Spun off from Jovian Subspace | Independent | 4 |
| Galilean Station Link | Specialist | Jupiter | 2236 | Spun off from Jovian Subspace | Independent | 4 |
| Tharsis Uplink | Local gateway | Mars | 2237 | Startup | Merged into Ares Interplanetary (2280) | — |
| Namaka Relay | Regional carrier | Makemake | 2242 | Spun off from Ares Interplanetary | Independent | 4 |
| Vesta Relay | Regional carrier | Ceres | 2245 | Spun off from Ares Interplanetary | Independent | 1 |
| Nix Relay | Regional carrier | Charon | 2251 | Spun off from Ares Interplanetary | Independent | 2 |
| Galle Relay | Regional carrier | Triton | 2255 | Spun off from Ares Interplanetary | Independent | 2 |
| Lakshmi Link | Regional carrier | Mercury | 2276 | Spun off from Ares Interplanetary | Independent | 2 |
| Galileo Uplink | Local gateway | Ganymede | 2288 | Spun off from Jovian Subspace | Independent | 1 |
| Uruk Clearing | Specialist | Ganymede | 2303 | Spun off from Jovian Subspace | Independent | 7 |
| Ligeia Access | Local gateway | Titan | 2312 | Spun off from Cassini Link | Independent | 1 |
| Cipango Access | Local gateway | Triton | 2315 | Startup | Independent | 1 |
| Pwyll Access | Local gateway | Europa | 2318 | Startup | Independent | 1 |
| Heimdall Gateway | Local gateway | Callisto | 2323 | Startup | Independent | 1 |
| Chryse Uplink | Local gateway | Mars | 2332 | Spun off from Ares Interplanetary | Independent | 1 |
| Wright Gateway | Local gateway | Pluto | 2335 | Spun off from Nix Relay | Independent | 1 |
| Eris Gateway | Local gateway | Eris | 2340 | Startup | Independent | 1 |
| Clavius Access | Local gateway | Moon | 2344 | Spun off from Terran Transit | Independent | 1 |
| Olympus Uplink | Local gateway | Mars | 2349 | Startup | Independent | 1 |
| Tvashtar Access | Local gateway | Io | 2354 | Startup | Independent | 1 |
| Hellas Access | Local gateway | Mars | 2379 | Spun off from Ares Interplanetary | Independent | 1 |

## 9. What is invented

Canon supplies the starting conditions and the deadlines. Everything below is a choice made for the setting:

- **The tuning.** The difficulty weights, the pace of technology, the shipyard's slips, industry growth and launch rates produce a plausible order of settlement, not a prediction.
- **Two founding years.** The Moon's 2069 and Jupiter Station's 2151 are the latest years canon allows; either could be earlier.
- **Pre-subspace relays.** Canon dates none. Their years and the conversion schedule are inferred.
- **Venus and Mimas as outposts.** Canon describes stations there; capping their growth is a reading of that.
- **A single shipyard.** Routing every expedition through Utopia Planitia is the simulation's premise. Canon also shows ships built elsewhere, such as in Earth orbit.
- **Population.** Everything except the Moon's 50 million: the growth curve, each world's capacity, and Mars at three times the Moon.
- **The companies.** Their kinds, niches, founding rules, buyouts and names.
- **Moon orbital speed.** A moon's speed is measured around its parent, so no moon is penalized for speed. Only Mercury and Venus orbit faster than Earth.

## 10. Regenerating the data

```sh
node colonization-sim.js 1701        # one run; writes sol-telecom-2380.json and CSVs
node colonization-sim.js 1701 400    # the same, plus medians across 400 runs
```

The snapshot year is `endYear` in `CONFIG`; if you change it, set the last entry of `population.snapshotYears` to match. Every setting is in the `CONFIG` block at the top of `colonization-sim.js`: canon starting conditions, the difficulty weights, population, the shipyard, and the company regions, niches and name parts. The seed fixes the run, so the same seed always produces the same dataset. Changing a setting or the seed changes the companies and dates, so regenerate the JSON and the types stay valid.

## 11. Sources

Star Trek canon, from Memory Alpha:

- [Warp drive](https://memory-alpha.fandom.com/wiki/Warp_drive)
- [Subspace communication](https://memory-alpha.fandom.com/wiki/Subspace_communication)
- [Echo One](https://memory-alpha.fandom.com/wiki/Echo_One)
- [Communication relay station](https://memory-alpha.fandom.com/wiki/Communication_relay_station)
- [Communications blackout](https://memory-alpha.fandom.com/wiki/Communications_blackout)
- [2385](https://memory-alpha.fandom.com/wiki/2385) and [Fleet formation mode](https://memory-alpha.fandom.com/wiki/Fleet_formation_mode), for the events after 2380
- [Luna (mirror copy)](https://sonicgame.netlify.app/host-https-memory-alpha.fandom.com/wiki/Luna)
- [Martian colonies (mirror copy)](https://file-hippo.netlify.app/host-https-memory-alpha.fandom.com/wiki/Martian_colonies)
- [Utopia Planitia Fleet Yards](https://memory-alpha.fandom.com/wiki/Utopia_Planitia_Fleet_Yards)
- [Orpheus Mining Complex](https://memory-alpha.fandom.com/wiki/Orpheus_Mining_Complex)
- [Jupiter Station](https://memory-alpha.fandom.com/wiki/Jupiter_Station)
- [Jovian Run](https://memory-alpha.fandom.com/wiki/Jovian_Run)
- [Ganymede](https://memory-alpha.fandom.com/wiki/Ganymede)
- [Europa](https://memory-alpha.fandom.com/wiki/Europa)
- [Io Facility](https://memory-alpha.fandom.com/wiki/Io_Facility)
- [Titan](https://memory-alpha.fandom.com/wiki/Titan)
- [Saturn (mirror copy)](https://sonicgame.netlify.app/host-https-memory-alpha.fandom.com/wiki/Saturn)
- [The First Duty (episode)](https://memory-alpha.fandom.com/wiki/The_First_Duty_(episode))
- [Venus (mirror copy)](https://sonicgame.netlify.app/host-https-memory-alpha.fandom.com/wiki/Venus)
- [Asteroid belt (Sol system)](https://memory-alpha.fandom.com/wiki/Asteroid_belt_(Sol_system))
- [Deuterium (mirror copy)](https://file-hippo.netlify.app/host-https-memory-alpha.fandom.com/wiki/Deuterium)
- [Terraform (mirror copy)](https://sonicgame.netlify.app/host-https-memory-alpha.fandom.com/wiki/Terraform)
- [Sol system (mirror copy)](https://moviedown.netlify.app/host-http-memory-alpha.wikia.com/wiki/Sol_system)
- [Jupiter (mirror copy)](https://apis.emri.workers.dev/https-memory-alpha.fandom.com/wiki/Jupiter), [Io (mirror copy)](https://sonicgame.netlify.app/host-https-memory-alpha.fandom.com/wiki/Io), [Pluto (mirror copy)](https://sonicgame.netlify.app/host-https-memory-alpha.fandom.com/wiki/Pluto)

Astronomy:

- [JPL Planetary Satellite Mean Elements](https://ssd.jpl.nasa.gov/sats/elem/sep.html)
- [JPL Planetary Satellite Physical Parameters](https://ssd.jpl.nasa.gov/sats/phys_par/sep.html)
- [JPL Planetary Physical Parameters](https://ssd.jpl.nasa.gov/planets/phys_par.html)
- [Wikipedia list of natural satellites (March 2026 snapshot)](https://wiki.krisyotam.com/content/wikipedia_en_all_nopic_2026-03/List_of_moons)
- [NASA: What's up, solar conjunction](https://science.nasa.gov/resource/whats-up-solar-conjunction)

Star Trek and related marks belong to their owners. This dataset and document are unofficial fan work.
