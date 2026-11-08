"""Per-frame iris/eye feature extraction (MediaPipe Face Mesh) and the
polynomial gaze-mapping model used for calibration + screen gaze estimation.
"""
import cv2
import numpy as np
import mediapipe as mp
from config import *


class GazeEngine:
    def __init__(self, camera_index=CAMERA_INDEX):
        self.camera_index = camera_index
        self.face_mesh = mp.solutions.face_mesh.FaceMesh(
            static_image_mode=False, max_num_faces=1, refine_landmarks=True,
            min_detection_confidence=0.5, min_tracking_confidence=0.5
        )

    def close(self):
        self.face_mesh.close()

    @staticmethod
    def _mean_xy(landmarks, ids, w, h):
        pts = np.array([[landmarks[i].x * w, landmarks[i].y * h] for i in ids], dtype=float)
        return pts.mean(axis=0)

    @staticmethod
    def _point(landmarks, idx, w, h):
        lm = landmarks[idx]
        return np.array([lm.x * w, lm.y * h])

    def extract(self, frame):
        """Returns a dict with the normalized gaze feature vector and raw
        iris pixel coordinates, or None if no face was detected in this
        frame."""
        h, w = frame.shape[:2]
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        result = self.face_mesh.process(rgb)
        if not result.multi_face_landmarks:
            return None
        lm = result.multi_face_landmarks[0].landmark

        left_iris = self._mean_xy(lm, LEFT_IRIS, w, h)
        right_iris = self._mean_xy(lm, RIGHT_IRIS, w, h)

        # Left eye: outer/inner corner + top/bottom lid points.
        left_outer = self._point(lm, LEFT_EYE_CORNERS[0], w, h)
        left_inner = self._point(lm, LEFT_EYE_CORNERS[1], w, h)
        left_top = self._point(lm, LEFT_EYE_VERTICAL[0], w, h)
        left_bottom = self._point(lm, LEFT_EYE_VERTICAL[1], w, h)

        # Right eye: same, mirrored landmark ids.
        right_outer = self._point(lm, RIGHT_EYE_CORNERS[0], w, h)
        right_inner = self._point(lm, RIGHT_EYE_CORNERS[1], w, h)
        right_top = self._point(lm, RIGHT_EYE_VERTICAL[0], w, h)
        right_bottom = self._point(lm, RIGHT_EYE_VERTICAL[1], w, h)

        left_eye_width = max(np.linalg.norm(left_outer - left_inner), 1.0)
        right_eye_width = max(np.linalg.norm(right_outer - right_inner), 1.0)
        left_eye_height = max(np.linalg.norm(left_top - left_bottom), 1.0)
        right_eye_height = max(np.linalg.norm(right_top - right_bottom), 1.0)

        # Iris position normalized within each eye socket, in [~-0.5, 0.5].
        left_norm = (
            (left_iris[0] - left_outer[0]) / left_eye_width,
            (left_iris[1] - (left_top[1] + left_bottom[1]) / 2) / left_eye_height,
        )
        right_norm = (
            (right_iris[0] - right_outer[0]) / right_eye_width,
            (right_iris[1] - (right_top[1] + right_bottom[1]) / 2) / right_eye_height,
        )
        feat = np.array([*left_norm, *right_norm], dtype=np.float32)

        return {
            'feature': feat,
            'left_iris_x': float(left_iris[0]), 'left_iris_y': float(left_iris[1]),
            'right_iris_x': float(right_iris[0]), 'right_iris_y': float(right_iris[1]),
            'face_detected': 1,
        }

    def annotate(self, frame, data):
        if data:
            for x, y in [(data['left_iris_x'], data['left_iris_y']),
                         (data['right_iris_x'], data['right_iris_y'])]:
                cv2.circle(frame, (int(x), int(y)), 4, (0, 255, 0), -1)
        return frame


def polynomial_design(X, order=GAZE_MODEL_ORDER):
    """Builds the polynomial feature matrix used to fit/predict the
    eye-feature -> screen-pixel mapping (order=2 -> includes all pairwise
    products of the 4 eye features, giving the fit a good nonlinearity
    budget without needing many calibration points)."""
    X = np.asarray(X, dtype=float)
    cols = [np.ones((len(X), 1))]
    if order >= 1:
        cols.append(X)
    if order >= 2:
        cols += [X[:, [i]] * X[:, [j]] for i in range(X.shape[1]) for j in range(i, X.shape[1])]
    return np.hstack(cols)


def fit_gaze_mapping(features, screen_xy):
    """Least-squares fit of eye features -> (screen_x, screen_y). Returns
    the coefficients plus mean/median fit error in pixels (diagnostic only;
    real calibration-quality numbers come from a held-out validation pass)."""
    X = polynomial_design(np.asarray(features), GAZE_MODEL_ORDER)
    Y = np.asarray(screen_xy, dtype=float)
    coef, *_ = np.linalg.lstsq(X, Y, rcond=None)
    pred = X @ coef
    err = np.sqrt(((pred - Y) ** 2).sum(axis=1))
    return coef, float(np.mean(err)), float(np.median(err))


def predict_screen(feature, coef):
    p = polynomial_design(np.asarray(feature).reshape(1, -1), GAZE_MODEL_ORDER)
    xy = p @ np.asarray(coef)
    return float(xy[0, 0]), float(xy[0, 1])
