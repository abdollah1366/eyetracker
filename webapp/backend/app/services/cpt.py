"""Open Continuous Performance Test (CPT) inspired by the IVA paradigm.

This is an intentionally open implementation: the target is the digit ``1`` and
the non-target is ``2``, in both a visual block and an auditory block. It does
not reproduce IVA-2 item content, norms, or proprietary scoring tables.

The server owns the trial protocol and recomputes every metric from the raw
per-trial responses. The client only reports when the participant responded;
it never supplies the scores that get persisted.

All metrics are computed per modality (visual / auditory) and overall:
hits, misses (omissions), false alarms (commissions), correct rejections,
hit rate, false-alarm rate, d-prime, mean hit RT and hit-RT standard deviation.
"""

from __future__ import annotations

import random
from statistics import NormalDist
from typing import Any

PROTOCOL_VERSION = "IVA-CPT-1"
TRIALS_PER_MODALITY = 20
TARGET_DIGIT = 1
NON_TARGET_DIGIT = 2
MODALITIES = ("visual", "auditory")
STIMULUS_DURATION_MS = 600
INTER_TRIAL_INTERVAL_MS = 1400


def _digit_sequence(rng: random.Random, n: int) -> list[int]:
    """Balanced 1/2 sequence (n/2 targets) with no run longer than three."""
    for _ in range(200):
        digits = [TARGET_DIGIT] * (n // 2) + [NON_TARGET_DIGIT] * (n - n // 2)
        rng.shuffle(digits)
        longest = 1
        run = 1
        for i in range(1, len(digits)):
            run = run + 1 if digits[i] == digits[i - 1] else 1
            longest = max(longest, run)
        if longest <= 3:
            return digits
    # Deterministic fallback: strict alternation is always valid.
    return [TARGET_DIGIT if i % 2 == 0 else NON_TARGET_DIGIT for i in range(n)]


def protocol() -> dict[str, Any]:
    """Return the deterministic, server-owned trial protocol."""
    rng = random.Random(20261122)
    trials: list[dict[str, Any]] = []
    index = 0
    for modality in MODALITIES:
        for digit in _digit_sequence(rng, TRIALS_PER_MODALITY):
            trials.append({"index": index, "modality": modality, "digit": digit})
            index += 1
    return {
        "protocol_version": PROTOCOL_VERSION,
        "stimulus_duration_ms": STIMULUS_DURATION_MS,
        "inter_trial_interval_ms": INTER_TRIAL_INTERVAL_MS,
        "total_trials": len(trials),
        "target_digit": TARGET_DIGIT,
        "non_target_digit": NON_TARGET_DIGIT,
        "trials": trials,
    }


def _adjusted_rate(rate: float, trials: int) -> float:
    """Avoid infinite z-scores for 0% / 100% rates (Wright 0.5/N correction)."""
    if trials <= 0:
        return 0.5
    if rate <= 0.0:
        return 0.5 / trials
    if rate >= 1.0:
        return 1.0 - 0.5 / trials
    return rate


def _dprime(hit_rate: float, fa_rate: float, n_targets: int, n_non_targets: int) -> float:
    dist = NormalDist()
    z_hit = dist.inv_cdf(_adjusted_rate(hit_rate, n_targets))
    z_fa = dist.inv_cdf(_adjusted_rate(fa_rate, n_non_targets))
    return round(z_hit - z_fa, 3)


def _mean(values: list[float]) -> float:
    return round(sum(values) / len(values), 1) if values else 0.0


def _sd(values: list[float]) -> float:
    if len(values) < 2:
        return 0.0
    mean = sum(values) / len(values)
    variance = sum((v - mean) ** 2 for v in values) / (len(values) - 1)
    return round(variance**0.5, 1)


def _score_group(trials: list[dict[str, Any]], results: dict[int, dict[str, Any]]) -> dict[str, Any]:
    hits = misses = false_alarms = correct_rejections = 0
    multiple_responses = 0
    hit_rts: list[float] = []

    for trial in trials:
        result = results[trial["index"]]
        reaction = result.get("reaction_ms")
        count = int(result.get("response_count") or 0)
        responded = reaction is not None

        if trial["digit"] == TARGET_DIGIT:
            if responded:
                hits += 1
                hit_rts.append(float(reaction))
                if count > 1:
                    multiple_responses += 1
            else:
                misses += 1
        else:
            if responded:
                false_alarms += 1
            else:
                correct_rejections += 1

    n_targets = hits + misses
    n_non_targets = false_alarms + correct_rejections
    hit_rate = round(hits / n_targets, 3) if n_targets else 0.0
    fa_rate = round(false_alarms / n_non_targets, 3) if n_non_targets else 0.0

    return {
        "hits": hits,
        "misses": misses,
        "false_alarms": false_alarms,
        "correct_rejections": correct_rejections,
        "hit_rate": hit_rate,
        "false_alarm_rate": fa_rate,
        "d_prime": _dprime(hit_rate, fa_rate, n_targets, n_non_targets),
        "mean_hit_rt_ms": _mean(hit_rts),
        "rt_sd_ms": _sd(hit_rts),
        "multiple_responses": multiple_responses,
        "target_count": n_targets,
        "non_target_count": n_non_targets,
    }


def score_cpt(results: list[dict[str, Any]]) -> dict[str, Any]:
    """Recompute all scores from raw per-trial results. Caller validates shape."""
    proto = protocol()
    trials = proto["trials"]
    by_index = {result["trial_index"]: result for result in results}

    per_modality: dict[str, Any] = {}
    for modality in MODALITIES:
        group = [trial for trial in trials if trial["modality"] == modality]
        per_modality[modality] = _score_group(group, by_index)

    all_hit_rts: list[float] = []
    for result in results:
        if result.get("reaction_ms") is not None:
            trial = trials[result["trial_index"]]
            if trial["digit"] == TARGET_DIGIT:
                all_hit_rts.append(float(result["reaction_ms"]))

    overall_targets = sum(per_modality[m]["target_count"] for m in MODALITIES)
    overall_non_targets = sum(per_modality[m]["non_target_count"] for m in MODALITIES)
    overall_hits = sum(per_modality[m]["hits"] for m in MODALITIES)
    overall_fa = sum(per_modality[m]["false_alarms"] for m in MODALITIES)
    overall_hit_rate = round(overall_hits / overall_targets, 3) if overall_targets else 0.0
    overall_fa_rate = round(overall_fa / overall_non_targets, 3) if overall_non_targets else 0.0

    return {
        "instrument": "IVA-CPT",
        "protocol_version": PROTOCOL_VERSION,
        "target_digit": TARGET_DIGIT,
        "non_target_digit": NON_TARGET_DIGIT,
        "per_modality": per_modality,
        "overall": {
            "hits": overall_hits,
            "false_alarms": overall_fa,
            "hit_rate": overall_hit_rate,
            "false_alarm_rate": overall_fa_rate,
            "d_prime": _dprime(overall_hit_rate, overall_fa_rate, overall_targets, overall_non_targets),
            "mean_hit_rt_ms": _mean(all_hit_rts),
            "rt_sd_ms": _sd(all_hit_rts),
        },
        "disclaimer_fa": (
            "این آزمون یک ابزار غربالگری پژوهشی است و تشخیص بالینی محسوب نمیشود. "
            "نتایج باید توسط متخصص و در کنار سایر اطلاعات تفسیر شوند."
        ),
    }
