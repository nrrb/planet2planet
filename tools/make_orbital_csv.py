"""Regenerates backend/data/orbital-elements.csv and moon-phases.csv.

Planets: E.M. Standish and J.G. Williams, "Keplerian Elements for Approximate Positions of
the Major Planets", JPL SSD, Table 2a (valid 3000 BC to 3000 AD) and Table 2b (extra terms
for Jupiter to Neptune). https://ssd.jpl.nasa.gov/planets/approx_pos.html
Earth uses the Earth-Moon barycentre row.

Dwarf planets: JPL Small-Body Database (osculating elements, full precision), converted to a
mean longitude at J2000 and a constant mean motion.

Moon phases are invented: fixed, spread by the golden angle, so moons never line up.
Run: python3 tools/make_orbital_csv.py
"""

import csv
import json
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "backend" / "data"
J2000_JD = 2451545.0

# slug: (a, a_rate, e, e_rate, long_peri, long_peri_rate, mean_long, mean_long_rate, b, c, s, f)
PLANETS = {
    "mercury": (0.38709843, 0.0, 0.20563661, 0.00002123, 77.45771895, 0.15940013, 252.25166724, 149472.67486623),
    "venus": (0.72332102, -0.00000026, 0.00676399, -0.00005107, 131.76755713, 0.05679648, 181.97970850, 58517.81560260),
    "earth": (1.00000018, -0.00000003, 0.01673163, -0.00003661, 102.93005885, 0.31795260, 100.46691572, 35999.37306329),
    "mars": (1.52371243, 0.00000097, 0.09336511, 0.00009149, -23.91744784, 0.45223625, -4.56813164, 19140.29934243),
    "jupiter": (5.20248019, -0.00002864, 0.04853590, 0.00018026, 14.27495244, 0.18199196, 34.33479152, 3034.90371757,
                -0.00012452, 0.06064060, -0.35635438, 38.35125000),
    "saturn": (9.54149883, -0.00003065, 0.05550825, -0.00032044, 92.86136063, 0.54179478, 50.07571329, 1222.11494724,
               0.00025899, -0.13434469, 0.87320147, 38.35125000),
    "uranus": (19.18797948, -0.00020455, 0.04685740, -0.00001550, 172.43404441, 0.09266985, 314.20276625, 428.49512595,
               0.00058331, -0.97731848, 0.17689245, 7.67025000),
    "neptune": (30.06952752, 0.00006447, 0.00895439, 0.00000818, 46.68158724, 0.01009938, 304.22289287, 218.46515314,
                -0.00041348, 0.68346318, -0.10162547, 7.67025000),
}

# slug: (epoch_jd, a, e, w, om, ma, n_deg_per_day) from SBDB, full precision
DWARFS = {
    "ceres": (2461200.5, 2.765552595034094, 0.07969229514816586, 73.29421453021587, 80.24862682043221, 274.4193463761342, 0.21430445064843),
    "pluto": (2457588.5, 39.58862938517124, 0.2518378778576892, 113.7090015158565, 110.2923840543057, 38.68366347318184, 0.003956838955553025),
    "haumea": (2461200.5, 43.06029023650952, 0.1944430148898797, 240.6905472508661, 121.7860561329425, 223.2104118812299, 0.003488097731816818),
    "makemake": (2461200.5, 45.57093317300052, 0.1588889953992523, 297.0922733397207, 79.2948338209406, 169.9379962048232, 0.003203850120050116),
    "eris": (2461200.5, 67.93394687853566, 0.4382385347971672, 150.7949235840312, 36.00477044417249, 211.774434275007, 0.001760247770619088),
}

HEADER = ["slug", "a_au", "a_rate", "e", "e_rate", "long_peri_deg", "long_peri_rate",
          "mean_long_deg", "mean_long_rate", "b", "c", "s", "f", "source"]


def main() -> None:
    rows = []
    for slug, v in PLANETS.items():
        extra = list(v[8:]) if len(v) > 8 else ["", "", "", ""]
        rows.append([slug, *v[:8], *extra, "JPL SSD Table 2a/2b (Standish & Williams)"])
    for slug, (epoch, a, e, w, om, ma, n) in DWARFS.items():
        long_peri = (w + om) % 360
        mean_long = ((ma + w + om) - n * (epoch - J2000_JD)) % 360
        rows.append([slug, a, 0, e, 0, long_peri, 0, mean_long, n * 36525, "", "", "", "",
                     "JPL Small-Body Database, osculating elements"])
    with open(DATA / "orbital-elements.csv", "w", newline="") as f:
        out = csv.writer(f)
        out.writerow(HEADER)
        out.writerows(rows)

    dataset = json.loads((DATA / "sol-telecom-2380.json").read_text())
    moons: dict[str, list[dict]] = {}
    for w in dataset["worlds"]:
        if w["type"] == "moon":
            moons.setdefault(w["parentId"], []).append(w)
    with open(DATA / "moon-phases.csv", "w", newline="") as f:
        out = csv.writer(f)
        out.writerow(["slug", "phase_deg"])
        for ms in moons.values():
            for i, w in enumerate(sorted(ms, key=lambda w: w["physical"]["orbitRadiusKm"])):
                out.writerow([w["id"], round((i * 137.50776 + 20) % 360, 4)])


if __name__ == "__main__":
    main()
