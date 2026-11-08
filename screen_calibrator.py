import cv2, json, time
import numpy as np
from pathlib import Path
from config import *
from gaze_engine import GazeEngine, fit_gaze_mapping, predict_screen

CAL_FILE=CALIBRATION_DIR/'calibration.json'

def calibration_points(w,h):
    m=80; return [(m,m),(w//2,m),(w-m,m),(m,h//2),(w//2,h//2),(w-m,h//2),(m,h-m),(w//2,h-m),(w-m,h-m)]

def run_calibration(camera_index=CAMERA_INDEX):
    cap=cv2.VideoCapture(camera_index)
    if not cap.isOpened(): raise RuntimeError('Webcam could not be opened.')
    ok, frame=cap.read()
    if not ok: cap.release(); raise RuntimeError('Could not read webcam frame.')
    # Use actual primary display size reported by OpenCV after fullscreen setup.
    sw,sh=1920,1080
    try:
        import tkinter as tk
        root=tk.Tk(); root.withdraw(); sw=root.winfo_screenwidth(); sh=root.winfo_screenheight(); root.destroy()
    except Exception: pass
    pts=calibration_points(sw,sh); engine=GazeEngine(camera_index)
    win='Calibration'; cv2.namedWindow(win,cv2.WINDOW_NORMAL); cv2.setWindowProperty(win,cv2.WND_PROP_FULLSCREEN,cv2.WINDOW_FULLSCREEN)
    features=[]; targets=[]
    for target in pts:
        samples=[]; start=time.time(); settle=start+CALIBRATION_SETTLE_SEC
        while time.time()-start<CALIBRATION_DWELL_SEC:
            ret,frame=cap.read()
            canvas=np.zeros((sh,sw,3),np.uint8); cv2.circle(canvas,target,18,(0,255,0),-1)
            cv2.putText(canvas,'Calibration: look at the green point', (40,60),cv2.FONT_HERSHEY_SIMPLEX,1,(255,255,255),2)
            cv2.imshow(win,canvas); key=cv2.waitKey(1)&255
            if key==27: engine.close(); cap.release(); cv2.destroyAllWindows(); return None
            d=engine.extract(frame)
            if d and time.time()>=settle: samples.append(d['feature'])
        if samples:
            features.append(np.median(np.asarray(samples),axis=0)); targets.append(target)
    engine.close(); cap.release(); cv2.destroyAllWindows()
    if len(features)<MIN_CALIBRATION_POINTS: raise RuntimeError(f'Calibration failed: only {len(features)} valid points.')
    coef,mean_err,med_err=fit_gaze_mapping(features,targets)
    payload={'screen_width':sw,'screen_height':sh,'coef':coef.tolist(),'mean_error_px':mean_err,'median_error_px':med_err,'points':len(features),'created_at':time.time()}
    CAL_FILE.write_text(json.dumps(payload,indent=2),encoding='utf-8')
    return payload

def load_calibration():
    if not CAL_FILE.exists(): return None
    return json.loads(CAL_FILE.read_text(encoding='utf-8'))

def map_feature(feature,cal): return predict_screen(feature,np.asarray(cal['coef']))

if __name__=='__main__':
    r=run_calibration(); print(json.dumps(r,indent=2) if r else 'Calibration cancelled.')
