from pathlib import Path
import json, joblib, numpy as np, pandas as pd
from sklearn.pipeline import Pipeline
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import StratifiedGroupKFold, cross_val_predict
from sklearn.metrics import roc_auc_score, accuracy_score, precision_score, recall_score, f1_score, confusion_matrix

MODEL_PATH = Path(__file__).resolve().parent/'models'/'adhd_eye_model.joblib'
META_PATH = Path(__file__).resolve().parent/'models'/'adhd_eye_model.json'

def train_eye_model(dataset_csv):
    df=pd.read_csv(dataset_csv)
    if 'label' not in df or 'participant_id' not in df: raise ValueError('Dataset must contain participant_id and label.')
    df=df[df.label.isin([0,1])].copy()
    drop={'label','participant_id'}
    features=[c for c in df.columns if c not in drop and pd.api.types.is_numeric_dtype(df[c])]
    if len(df)<30 or df.label.nunique()<2: raise ValueError('Insufficient labeled data for training.')
    X=df[features]; y=df.label.astype(int); groups=df.participant_id
    pipe=Pipeline([('imputer',SimpleImputer(strategy='median')),('scale',StandardScaler()),('model',LogisticRegression(max_iter=3000, class_weight='balanced'))])
    n_splits=min(5, int(y.value_counts().min()))
    if n_splits<2: raise ValueError('At least 2 participants per class are required.')
    cv=StratifiedGroupKFold(n_splits=n_splits, shuffle=True, random_state=42)
    p=cross_val_predict(pipe,X,y,groups=groups,cv=cv,method='predict_proba')[:,1]
    pred=(p>=0.5).astype(int)
    metrics={'n':len(df),'participants':int(groups.nunique()),'auc':float(roc_auc_score(y,p)),'accuracy':float(accuracy_score(y,pred)),'sensitivity':float(recall_score(y,pred,zero_division=0)),'precision':float(precision_score(y,pred,zero_division=0)),'f1':float(f1_score(y,pred,zero_division=0)),'confusion_matrix':confusion_matrix(y,pred).tolist(),'features':features}
    pipe.fit(X,y); MODEL_PATH.parent.mkdir(exist_ok=True); joblib.dump(pipe,MODEL_PATH); META_PATH.write_text(json.dumps(metrics,ensure_ascii=False,indent=2),encoding='utf-8')
    return metrics

def predict(feature_dict):
    if not MODEL_PATH.exists(): return None
    meta=json.loads(META_PATH.read_text(encoding='utf-8')); pipe=joblib.load(MODEL_PATH)
    row=pd.DataFrame([{f:feature_dict.get(f,np.nan) for f in meta['features']}])
    return float(pipe.predict_proba(row)[0,1])
