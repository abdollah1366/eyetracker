"""Freely usable SNAP-IV parent rating scale — item bank + deterministic scoring.

SNAP-IV (Swanson, Nolan & Pelham-IV) is a publicly available ADHD screening
instrument built on the DSM symptom criteria. It is used here instead of the
proprietary Conners scales: Conners item text and norms are copyrighted by MHS
and must be supplied under licence, whereas this instrument can be shipped and
scored openly for research use.

The item bank lives on the server so the client renders exactly the items the
server scores. Answers are never trusted for the computed subscales — the
server recomputes them from the raw 0..3 responses before persisting.

IMPORTANT: this is a research screening instrument, not a clinical diagnosis.
"""

from __future__ import annotations

from typing import Any

INSTRUMENT_ID = "SNAP-IV-26"
TITLE_FA = "پرسشنامه والدین (SNAP-IV)"
DISCLAIMER_FA = (
    "این پرسشنامه یک ابزار غربالگری پژوهشی است و تشخیص بالینی محسوب نمیشود. "
    "نتایج باید توسط متخصص و در کنار مصاحبه بالینی تفسیر شوند."
)

LIKERT_OPTIONS: tuple[dict[str, Any], ...] = (
    {"value": 0, "label_fa": "اصلاً"},
    {"value": 1, "label_fa": "کمی"},
    {"value": 2, "label_fa": "زیاد"},
    {"value": 3, "label_fa": "خیلی زیاد"},
)

SECTIONS: tuple[dict[str, Any], ...] = (
    {
        "key": "inattention",
        "title_fa": "عدم توجه",
        "description_fa": "نه سؤال مربوط به تمرکز، سازماندهی و جزئیات",
        "item_ids": tuple(range(1, 10)),
    },
    {
        "key": "hyperactivity",
        "title_fa": "بیشفعالی / تکانشگری",
        "description_fa": "نه سؤال مربوط به تحرک، صحبت و انتظار نوبت",
        "item_ids": tuple(range(10, 19)),
    },
    {
        "key": "odd",
        "title_fa": "نافرمانی مقابلهجو",
        "description_fa": "هشت سؤال مربوط به تعامل و قوانین",
        "item_ids": tuple(range(19, 27)),
    },
)

# (id, section, Persian item text). IDs are stable and never reused.
SNAP4_ITEMS: tuple[dict[str, Any], ...] = (
    {"id": 1, "section": "inattention", "text_fa": "اغلب به جزئیات توجه کافی ندارد و در کارها اشتباهات سهلانگارانه میکند."},
    {"id": 2, "section": "inattention", "text_fa": "اغلب در حفظ توجه خود هنگام انجام کارها و فعالیتهای تفریحی دشواری دارد."},
    {"id": 3, "section": "inattention", "text_fa": "اغلب هنگام صحبت کردن دیگران به نظر نمیرسد که گوش میدهد."},
    {"id": 4, "section": "inattention", "text_fa": "اغلب دستورالعملها را دنبال نمیکند و نمیتواند تکالیف مدرسه یا کارهای خانه را به اتمام برساند."},
    {"id": 5, "section": "inattention", "text_fa": "اغلب در سازماندهی کارها و فعالیتها دشواری دارد."},
    {"id": 6, "section": "inattention", "text_fa": "اغلب از کارهایی که نیاز به تلاش فکری پایدار دارند اجتناب میکند یا آنها را دوست ندارد."},
    {"id": 7, "section": "inattention", "text_fa": "اغلب وسایلی را که برای کارها یا فعالیتها لازم است گم میکند."},
    {"id": 8, "section": "inattention", "text_fa": "اغلب به راحتی توسط محرکهای خارجی حواسش پرت میشود."},
    {"id": 9, "section": "inattention", "text_fa": "اغلب در کارهای روزمره فراموشکار است."},
    {"id": 10, "section": "hyperactivity", "text_fa": "اغلب دستها یا پاهایش را تکان میدهد یا در جای خود بالا و پایین میرود."},
    {"id": 11, "section": "hyperactivity", "text_fa": "اغلب در موقعیتهایی که انتظار میرود در جای خود بماند، از جای خود بلند میشود."},
    {"id": 12, "section": "hyperactivity", "text_fa": "اغلب در اطراف میدود یا بالا میرود (در نوجوانان ممکن است فقط احساس بیقراری کند)."},
    {"id": 13, "section": "hyperactivity", "text_fa": "اغلب نمیتواند به آرامی در بازیها یا فعالیتهای تفریحی شرکت کند."},
    {"id": 14, "section": "hyperactivity", "text_fa": "اغلب «روی موتور» است و مدام در حرکت است."},
    {"id": 15, "section": "hyperactivity", "text_fa": "اغلب بیش از حد صحبت میکند."},
    {"id": 16, "section": "hyperactivity", "text_fa": "اغلب قبل از تمام شدن سؤال، جواب را میدهد."},
    {"id": 17, "section": "hyperactivity", "text_fa": "اغلب در انتظار نوبت خود دشواری دارد."},
    {"id": 18, "section": "hyperactivity", "text_fa": "اغلب حرف دیگران را قطع میکند یا بر آنها پیشی میگیرد."},
    {"id": 19, "section": "odd", "text_fa": "اغلب با بزرگترها بحث میکند."},
    {"id": 20, "section": "odd", "text_fa": "اغلب از قوانین یا مقررات سرپیچی میکند."},
    {"id": 21, "section": "odd", "text_fa": "اغلب عمداً کاری میکند که دیگران را ناراحت کند."},
    {"id": 22, "section": "odd", "text_fa": "اغلب تقصیر اشتباهات خود را به گردن دیگری میاندازد."},
    {"id": 23, "section": "odd", "text_fa": "اغلب نسبت به اشتباهات یا شکستهای خود حساس است و به راحتی ناراحت میشود."},
    {"id": 24, "section": "odd", "text_fa": "اغلب بدخلق یا پرخاشجو است."},
    {"id": 25, "section": "odd", "text_fa": "اغلب از کسانی که با او مهربان بودهاند کینه میگیرد."},
    {"id": 26, "section": "odd", "text_fa": "اغلب دروغ میگوید."},
)

# Screening convention for SNAP-IV subscale means (research use only).
SEVERITY_BANDS: tuple[tuple[float, str, str], ...] = (
    (1.5, "elevated", "بالا"),
    (1.0, "borderline", "مرزی"),
    (0.0, "normal", "طبیعی"),
)


def _severity(mean: float) -> tuple[str, str]:
    for cutoff, code, label in SEVERITY_BANDS:
        if mean >= cutoff:
            return code, label
    return "normal", "طبیعی"


def instrument_definition() -> dict[str, Any]:
    """Return the item bank the client must render (single source of truth)."""
    return {
        "instrument": INSTRUMENT_ID,
        "title_fa": TITLE_FA,
        "disclaimer_fa": DISCLAIMER_FA,
        "likert": [dict(option) for option in LIKERT_OPTIONS],
        "sections": [
            {
                "key": section["key"],
                "title_fa": section["title_fa"],
                "description_fa": section["description_fa"],
                "item_ids": list(section["item_ids"]),
            }
            for section in SECTIONS
        ],
        "items": [dict(item) for item in SNAP4_ITEMS],
    }


def score_snap4(answers: dict[int, int]) -> dict[str, Any]:
    """Compute subscale means from raw answers. Caller validates completeness."""
    subscales: dict[str, Any] = {}
    adhd_values: list[int] = []

    for section in SECTIONS:
        values = [answers[item_id] for item_id in section["item_ids"] if item_id in answers]
        mean = round(sum(values) / len(values), 3) if values else 0.0
        code, label = _severity(mean)
        subscales[section["key"]] = {
            "count": len(values),
            "sum": sum(values),
            "mean": mean,
            "severity_code": code,
            "severity_fa": label,
        }
        if section["key"] != "odd":
            adhd_values.extend(values)

    adhd_mean = round(sum(adhd_values) / len(adhd_values), 3) if adhd_values else 0.0
    adhd_code, adhd_label = _severity(adhd_mean)
    subscales["adhd_total"] = {
        "count": len(adhd_values),
        "sum": sum(adhd_values),
        "mean": adhd_mean,
        "severity_code": adhd_code,
        "severity_fa": adhd_label,
    }

    return {
        "instrument": INSTRUMENT_ID,
        "answers": {str(key): answers[key] for key in sorted(answers)},
        "subscales": subscales,
        "answered": len(answers),
        "total_items": len(SNAP4_ITEMS),
        "disclaimer_fa": DISCLAIMER_FA,
    }
