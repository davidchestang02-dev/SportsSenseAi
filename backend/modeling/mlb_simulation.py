from __future__ import annotations

from random import Random
from typing import Mapping

from .common import clamp, round_to


def _sample_event(probabilities: list[tuple[str, float]], rng: Random) -> str:
    draw = rng.random()
    running = 0.0
    for label, probability in probabilities:
        running += probability
        if draw <= running:
            return label
    return probabilities[-1][0]


def simulate_batter(profile: Mapping[str, float], n_sims: int = 5000, seed: int = 7, plate_appearances: float = 4.3) -> dict[str, float]:
    rng = Random(seed)
    hits = 0
    tb_over = 0
    runs = 0
    rbis = 0
    hrh = 0
    total_tb = 0

    probabilities = [
        ("single", float(profile["p_single"])),
        ("double", float(profile["p_double"])),
        ("triple", float(profile["p_triple"])),
        ("hr", float(profile["p_hr"])),
        ("bb", float(profile["p_bb"])),
        ("k", float(profile["p_k"])),
        ("out", float(profile.get("p_out", 0.0))),
    ]

    for _ in range(n_sims):
        pa = max(3, int(round(plate_appearances + rng.uniform(-1.0, 1.0))))
        sim_hits = 0
        sim_tb = 0
        for _ in range(pa):
            event = _sample_event(probabilities, rng)
            if event == "single":
                sim_hits += 1
                sim_tb += 1
            elif event == "double":
                sim_hits += 1
                sim_tb += 2
            elif event == "triple":
                sim_hits += 1
                sim_tb += 3
            elif event == "hr":
                sim_hits += 1
                sim_tb += 4

        sim_runs = int(round(sim_hits * 0.42 + sim_tb * 0.08))
        sim_rbis = int(round(sim_hits * 0.46 + sim_tb * 0.07))
        sim_hrh = sim_hits + sim_runs + sim_rbis

        hits += int(sim_hits >= 1)
        tb_over += int(sim_tb >= 2)
        runs += int(sim_runs >= 1)
        rbis += int(sim_rbis >= 1)
        hrh += int(sim_hrh >= 2)
        total_tb += sim_tb

    return {
        "P_hits_1p": round_to(hits / n_sims, 4),
        "P_tb_2p": round_to(tb_over / n_sims, 4),
        "P_runs_1p": round_to(runs / n_sims, 4),
        "P_rbis_1p": round_to(rbis / n_sims, 4),
        "P_hrh_2p": round_to(hrh / n_sims, 4),
        "avg_total_bases": round_to(total_tb / n_sims, 4),
    }


def simulate_pitcher(profile: Mapping[str, float], n_sims: int = 5000, seed: int = 11) -> dict[str, float]:
    rng = Random(seed)
    strikeouts = 0.0
    earned_runs = 0.0
    innings = float(profile.get("innings", 5.5))
    k_rate = float(profile.get("k_rate", 0.25))
    er_rate = float(profile.get("er_rate", 0.45))

    for _ in range(n_sims):
        sampled_innings = clamp(innings + rng.uniform(-1.2, 1.0), 3.5, 8.0)
        sampled_k = sampled_innings * k_rate * 3 * rng.uniform(0.88, 1.12)
        sampled_er = sampled_innings * er_rate * rng.uniform(0.82, 1.18)
        strikeouts += sampled_k
        earned_runs += sampled_er

    return {
        "k_proj": round_to(strikeouts / n_sims, 4),
        "er_proj": round_to(earned_runs / n_sims, 4),
    }


def blend_projection(deterministic: Mapping[str, float], simulated: Mapping[str, float], simulation_weight: float = 0.55) -> dict[str, float]:
    blended: dict[str, float] = {}
    for key, deterministic_value in deterministic.items():
        sim_value = float(simulated.get(key, deterministic_value))
        blended[key] = round_to(deterministic_value * (1 - simulation_weight) + sim_value * simulation_weight, 4)
    return blended
