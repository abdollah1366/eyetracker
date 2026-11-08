import numpy as np
import pandas as pd

def extract_features(df):
    out={}
    if df.empty:return out
    valid=df[df.gaze_valid==1].copy(); out['valid_gaze_ratio']=float(len(valid)/len(df))
    if valid.empty:return out
    for c in ['gaze_x','gaze_y']:
        out[c+'_mean']=float(valid[c].mean()); out[c+'_std']=float(valid[c].std(ddof=0))
    pts=valid[['gaze_x','gaze_y']].to_numpy(float)
    if len(pts)>1:
        d=np.sqrt(np.diff(pts[:,0])**2+np.diff(pts[:,1])**2); dt=np.diff(valid.timestamp.to_numpy(float))
        out['scanpath_length_px']=float(d.sum()); out['mean_gaze_step_px']=float(d.mean()); out['mean_gaze_velocity_px_s']=float(np.mean(d/np.maximum(dt,1e-3)))
    else: out.update(scanpath_length_px=0.0,mean_gaze_step_px=0.0,mean_gaze_velocity_px_s=0.0)
    return out
