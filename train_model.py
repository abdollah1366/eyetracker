import argparse,glob,pandas as pd
from pathlib import Path
from feature_extraction import extract_features
from ml_model import train_eye_model

ap=argparse.ArgumentParser(); ap.add_argument('--data-dir',default='eye_data'); ap.add_argument('--output',default='outputs/ml_dataset.csv'); args=ap.parse_args()
rows=[]
for fn in glob.glob(str(Path(args.data_dir)/'*_eye.csv')):
    df=pd.read_csv(fn)
    if df.empty or df.label.iloc[0] not in ('ADHD','CONTROL'): continue
    f=extract_features(df); f.update({'participant_id':df.participant_id.iloc[0],'label':1 if df.label.iloc[0]=='ADHD' else 0}); rows.append(f)
if not rows: raise SystemExit('No labeled eye-tracking sessions found.')
out=pd.DataFrame(rows); Path(args.output).parent.mkdir(exist_ok=True); out.to_csv(args.output,index=False)
print(train_eye_model(args.output))
