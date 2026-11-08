import argparse,csv,time,json
from pathlib import Path
import cv2,numpy as np
from config import *
from gaze_engine import GazeEngine
from screen_calibrator import load_calibration,map_feature
from quality import QualityMonitor


def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--participant-id',required=True); ap.add_argument('--label',choices=['ADHD','CONTROL','UNKNOWN'],default='UNKNOWN'); ap.add_argument('--camera',type=int,default=CAMERA_INDEX); ap.add_argument('--duration',type=float,default=STIMULUS_DURATION_SEC); args=ap.parse_args()
    cal=load_calibration()
    if not cal: raise RuntimeError('No calibration found. Run screen_calibrator.py first.')
    folder=STIMULI_DIR/'ADHD'
    files=sorted([p for p in folder.iterdir() if p.suffix.lower() in {'.jpg','.jpeg','.png'}])
    if len(files)!=10: print(f'WARNING: protocol target is 10 stimuli; found {len(files)}. No stimulus will be duplicated automatically.')
    if not files: raise RuntimeError('No stimuli found.')
    cap=cv2.VideoCapture(args.camera); engine=GazeEngine(args.camera)
    if not cap.isOpened(): raise RuntimeError('Webcam could not be opened.')
    out=DATA_DIR/f'{args.participant_id}_eye.csv'; q=QualityMonitor()
    rows=[]; win='ADHD Eye Tracking'; cv2.namedWindow(win,cv2.WINDOW_NORMAL); cv2.setWindowProperty(win,cv2.WND_PROP_FULLSCREEN,cv2.WINDOW_FULLSCREEN)
    sw,sh=cal['screen_width'],cal['screen_height']
    for stim in files:
        img=cv2.imread(str(stim)); img=cv2.resize(img,(sw,sh))
        start=time.time(); frame_id=0
        while time.time()-start<args.duration:
            ret,frame=cap.read()
            if not ret: continue
            d=engine.extract(frame); valid=q.update(frame,d)
            gx=gy=None
            if d:
                gx,gy=map_feature(d['feature'],cal); gx=max(0,min(sw-1,gx)); gy=max(0,min(sh-1,gy))
            t=time.time()
            rows.append([args.participant_id,args.label,t,stim.name,frame_id,gx,gy,int(bool(d)),d['left_iris_x'] if d else None,d['left_iris_y'] if d else None,d['right_iris_x'] if d else None,d['right_iris_y'] if d else None])
            cv2.imshow(win,img); key=cv2.waitKey(1)&255
            if key==27: break
            frame_id+=1
        if key==27: break
    cap.release(); engine.close(); cv2.destroyAllWindows()
    with open(out,'w',newline='',encoding='utf-8') as f:
        w=csv.writer(f); w.writerow(['participant_id','label','timestamp','stimulus','frame_id','gaze_x','gaze_y','gaze_valid','left_iris_x','left_iris_y','right_iris_x','right_iris_y']); w.writerows(rows)
    quality=q.result(cal['mean_error_px']); (out.with_suffix('.quality.json')).write_text(json.dumps(quality,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'data_file':str(out),'quality':quality},ensure_ascii=False,indent=2))

if __name__=='__main__': main()
