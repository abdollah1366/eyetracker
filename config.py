"""Shared paths and tunable constants for the whole pipeline.

Importing this module also creates the local data directories (eye_data,
outputs, models, calibrations) if they don't exist yet.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / 'eye_data'
OUTPUT_DIR = ROOT / 'outputs'
STIMULI_DIR = ROOT / 'stimuli'
MODELS_DIR = ROOT / 'models'
CALIBRATION_DIR = ROOT / 'calibrations'
DB_PATH = ROOT / 'clients.db'

for p in (DATA_DIR, OUTPUT_DIR, MODELS_DIR, CALIBRATION_DIR):
    p.mkdir(parents=True, exist_ok=True)

CAMERA_INDEX = 0
CALIBRATION_POINTS = 9
CALIBRATION_DWELL_SEC = 1.5
CALIBRATION_SETTLE_SEC = 0.35
STIMULUS_DURATION_SEC = 10.0
MIN_VALID_GAZE_RATIO = 0.70
MAX_TRACKING_GAP_SEC = 0.75
MIN_CALIBRATION_POINTS = 7
GAZE_MODEL_ORDER = 2

# MediaPipe Face Mesh refined landmarks.
LEFT_IRIS = [468, 469, 470, 471, 472]
RIGHT_IRIS = [473, 474, 475, 476, 477]
LEFT_EYE_CORNERS = (33, 133)
RIGHT_EYE_CORNERS = (362, 263)
LEFT_EYE_VERTICAL = (159, 145)
RIGHT_EYE_VERTICAL = (386, 374)
