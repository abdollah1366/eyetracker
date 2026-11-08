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
        pts = np.array([[landmarks[i].x*w, landmarks[i].y*h] for i in ids], dtype=float)
        return pts.mean(axis=0)

    def extract(self, frame):
        h, w = frame.shape[:2]
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        result = self.face_mesh.process(rgb)
        if not result.multi_face_landmarks:
            return None
        lm = result.multi_face_landmarks[0].landmark
        li = self._mean_xy(lm, LEFT_IRIS, w, h)
        ri = self._mean_xy(lm, RIGHT_IRIS, w, h)
        lc = np.array([lm[LEFT_EYE_CORNERS[0]].x*w, lm[LEFT_EYE_CORNERS[0]].y*h])
        rc = np.array([lm[LEFT_EYE_CORNERS[1]].x*w, lm[LEFT_EYE_CORNERS[1]].y*h])
        lcv = np.array([lm[LEFT_EYE_VERTICAL[0]].x*w, lm[LEFT_EYE_VERTICAL[0]].y*h])
        lcv2 = np.array([lm[LEFT_EYE_VERTICAL[1]].x*w, lm[LEFT_EYE_VERTICAL[1]].y*h])
        rlc = np.array([lm[RIGHT_EYE_CORNERS[0]].x*w, lm[RIGHT_EYE_CORNERS[0]].y*h])
        rrc = np.array([lm[RIGHT_EYE_CORNERS[1]].x*w, lm[RIGHT_EYE_CORNERS[1]].y*h])
        rcv = np.array([lm[RIGHT_EYE_VERTICAL[0]].x*w, lm[RIGHT_EYE_VERTICAL[0]].y*h])
        rcv2 = np.array([lm[RIGHT_EYE_VERTICAL[1]].x*w, lm[RIGHT_EYE_VERTICAL[1]].y*h])

        lwidth = max(np.linalg.norm(lc-rc), 1.0)
        rwidth = max(np.linalg.norm(rlc-rrc), 1.0)
        lheight = max(np.linalg.norm(lcv-lcv2), 1.0)
        rheight = max(np.linalg.norm(rcv-rcv2), 1.0)
        lnorm = ((li[0]-lc[0])/lwidth, (li[1]-((lcv[1]+lcv2[1])/2))/lheight)
        rnorm = ((ri[0]-rlc[0])/rwidth, (ri[1]-((rcv[1]+rcv2[1])/2))/rheight)
        feat = np.array([*lnorm, *rnorm], dtype=np.float32)
        return {
            'feature': feat,
            'left_iris_x': float(li[0]), 'left_iris_y': float(li[1]),
            'right_iris_x': float(ri[0]), 'right_iris_y': float(ri[1]),
            'face_detected': 1,
        }

    def annotate(self, frame, data):
        if data:
            for x, y in [(data['left_iris_x'], data['left_iris_y']), (data['right_iris_x'], data['right_iris_y'])]:
                cv2.circle(frame, (int(x), int(y)), 4, (0,255,0), -1)
        return frame


def polynomial_design(X, order=GAZE_MODEL_ORDER):
    X = np.asarray(X, dtype=float)
    cols = [np.ones((len(X), 1))]
    if order >= 1: cols.append(X)
    if order >= 2:
        cols += [X[:, [i]]*X[:, [j]] for i in range(X.shape[1]) for j in range(i, X.shape[1])]
    return np.hstack(cols)


def fit_gaze_mapping(features, screen_xy):
    X = polynomial_design(np.asarray(features), GAZE_MODEL_ORDER)
    Y = np.asarray(screen_xy, dtype=float)
    coef, *_ = np.linalg.lstsq(X, Y, rcond=None)
    pred = X @ coef
    err = np.sqrt(((pred-Y)**2).sum(axis=1))
    return coef, float(np.mean(err)), float(np.median(err))


def predict_screen(feature, coef):
    p = polynomial_design(np.asarray(feature).reshape(1,-1), GAZE_MODEL_ORDER)
    xy = p @ np.asarray(coef)
    return float(xy[0,0]), float(xy[0,1])
