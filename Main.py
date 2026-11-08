"""PyQt5 desktop app: the single entry point for the research pipeline
(participant registry, calibration, data collection, clinical scores,
model training, status). Run with: python Main.py
"""
import sys, subprocess, sqlite3
from PyQt5.QtWidgets import QApplication,QWidget,QVBoxLayout,QHBoxLayout,QPushButton,QLabel,QListWidget,QStackedWidget,QMessageBox,QInputDialog,QLineEdit,QFormLayout,QTableWidget,QTableWidgetItem,QComboBox
from PyQt5.QtCore import Qt
from config import DB_PATH, ROOT

class App(QWidget):
    def __init__(self):
        super().__init__(); self.setWindowTitle('ADHD Eye Tracking — CDSS Research'); self.resize(1200,760)
        self.current=None
        self.ensure_db()
        self.menu=QListWidget(); self.menu.addItems(['Dashboard','Participants','Calibration','Data Collection','Clinical Data','Model Training','Research Status']); self.menu.setFixedWidth(190)
        self.stack=QStackedWidget(); self.menu.currentRowChanged.connect(self.stack.setCurrentIndex)
        self.build_dashboard(); self.build_participants(); self.build_calibration(); self.build_collection(); self.build_clinical(); self.build_training(); self.build_status()
        lay=QHBoxLayout(self); lay.addWidget(self.menu); lay.addWidget(self.stack); self.menu.setCurrentRow(0)

    def ensure_db(self):
        c=sqlite3.connect(DB_PATH); c.execute('''CREATE TABLE IF NOT EXISTS clients(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,age INTEGER,gender TEXT,phone TEXT,email TEXT,notes TEXT,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)'''); c.commit(); c.close()

    def page(self,title):
        w=QWidget(); l=QVBoxLayout(w); h=QLabel(title); h.setStyleSheet('font-size:22px;font-weight:bold'); l.addWidget(h); self.stack.addWidget(w); return w,l

    def build_dashboard(self):
        w,l=self.page('سامانه پشتیبان تصمیم پژوهشی ADHD'); l.addWidget(QLabel('Webcam Eye Tracking → Calibration → Quality Gate → Features → ML\n\nاین نرم‌افزار تشخیص قطعی ADHD صادر نمی‌کند.'))
        b=QPushButton('اجرای کالیبراسیون'); b.clicked.connect(self.calibrate); l.addWidget(b); b=QPushButton('شروع جمع‌آوری داده'); b.clicked.connect(lambda:self.menu.setCurrentRow(3)); l.addWidget(b)

    def build_participants(self):
        w,l=self.page('مراجعان / Participant Registry'); form=QFormLayout(); self.name=QLineEdit(); self.age=QLineEdit(); self.gender=QComboBox(); self.gender.addItems(['','Male','Female','Other']); add=QPushButton('ثبت'); add.clicked.connect(self.add_client)
        form.addRow('نام:',self.name); form.addRow('سن:',self.age); form.addRow('جنسیت:',self.gender); form.addRow(add); l.addLayout(form)
        self.table=QTableWidget(0,4); self.table.setHorizontalHeaderLabels(['ID','Name','Age','Gender']); l.addWidget(self.table); self.load_clients()

    def add_client(self):
        if not self.name.text().strip() or not self.age.text().isdigit(): QMessageBox.warning(self,'خطا','نام و سن را وارد کنید.'); return
        c=sqlite3.connect(DB_PATH); c.execute('INSERT INTO clients(name,age,gender) VALUES(?,?,?)',(self.name.text().strip(),int(self.age.text()),self.gender.currentText())); c.commit(); c.close(); self.load_clients(); self.name.clear(); self.age.clear()

    def load_clients(self):
        if not hasattr(self,'table'): return
        c=sqlite3.connect(DB_PATH); rows=c.execute('SELECT id,name,age,gender FROM clients ORDER BY id DESC').fetchall(); c.close(); self.table.setRowCount(0)
        for r,row in enumerate(rows):
            self.table.insertRow(r)
            for j,v in enumerate(row): self.table.setItem(r,j,QTableWidgetItem(str(v)))

    def build_calibration(self):
        w,l=self.page('Calibration'); l.addWidget(QLabel('کالیبراسیون 9 نقطه‌ای با ویژگی‌های iris/eye و نگاشت چندجمله‌ای به مختصات صفحه.'))
        b=QPushButton('Start 9-Point Calibration'); b.clicked.connect(self.calibrate); l.addWidget(b); self.cal_status=QLabel('وضعیت: بررسی نشده'); l.addWidget(self.cal_status)

    def calibrate(self):
        try:
            p=ROOT/'screen_calibrator.py'; r=subprocess.run([sys.executable,str(p)],cwd=ROOT,capture_output=True,text=True)
            if r.returncode: raise RuntimeError(r.stderr or r.stdout)
            self.cal_status.setText('کالیبراسیون با موفقیت ذخیره شد.'); QMessageBox.information(self,'Calibration',r.stdout[-1500:])
        except Exception as e: QMessageBox.critical(self,'Calibration Error',str(e))

    def build_collection(self):
        w,l=self.page('Data Collection'); l.addWidget(QLabel('برچسب باید از معیار مرجع پژوهش بیاید؛ UNKNOWN برای جلسه بدون برچسب است.'))
        f=QFormLayout(); self.pid=QLineEdit(); self.label=QComboBox(); self.label.addItems(['UNKNOWN','ADHD','CONTROL']); f.addRow('Participant ID:',self.pid); f.addRow('Reference Label:',self.label); l.addLayout(f)
        b=QPushButton('Start Eye Tracking Session'); b.clicked.connect(self.collect); l.addWidget(b); self.qstatus=QLabel(''); l.addWidget(self.qstatus)

    def collect(self):
        if not self.pid.text().strip(): QMessageBox.warning(self,'خطا','Participant ID را وارد کنید.'); return
        try:
            r=subprocess.run([sys.executable,str(ROOT/'record_eye_data.py'),'--participant-id',self.pid.text().strip(),'--label',self.label.currentText()],cwd=ROOT,capture_output=True,text=True)
            if r.returncode: raise RuntimeError(r.stderr or r.stdout)
            self.qstatus.setText(r.stdout[-2500:]); QMessageBox.information(self,'Done','جلسه ثبت شد. Quality report در eye_data ذخیره شده است.')
        except Exception as e: QMessageBox.critical(self,'Collection Error',str(e))

    def build_clinical(self):
        w,l=self.page('Clinical Data — Conners / IVA-2')
        l.addWidget(QLabel('فقط نمرات خروجی ابزار مجاز ثبت می‌شود؛ متن پرسشنامه یا الگوریتم اختصاصی آن بازتولید نمی‌شود.'))
        f=QFormLayout(); self.cpid=QLineEdit(); self.conners=QLineEdit(); self.iva=QLineEdit(); self.cversion=QLineEdit(); self.ivaversion=QLineEdit()
        f.addRow('Participant ID:',self.cpid); f.addRow('Conners version:',self.cversion); f.addRow('Conners score(s):',self.conners); f.addRow('IVA-2 version:',self.ivaversion); f.addRow('IVA-2 score(s):',self.iva); l.addLayout(f)
        b=QPushButton('Save Structured Clinical Data'); b.clicked.connect(self.save_clinical); l.addWidget(b); self.clinical_status=QLabel(''); l.addWidget(self.clinical_status)

    def save_clinical(self):
        if not self.cpid.text().strip(): QMessageBox.warning(self,'خطا','Participant ID را وارد کنید.'); return
        c=sqlite3.connect(DB_PATH); c.execute("CREATE TABLE IF NOT EXISTS clinical_assessments(id INTEGER PRIMARY KEY AUTOINCREMENT,participant_id TEXT,conners_version TEXT,conners_scores TEXT,iva_version TEXT,iva_scores TEXT,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)")
        c.execute('INSERT INTO clinical_assessments(participant_id,conners_version,conners_scores,iva_version,iva_scores) VALUES(?,?,?,?,?)',(self.cpid.text().strip(),self.cversion.text().strip(),self.conners.text().strip(),self.ivaversion.text().strip(),self.iva.text().strip())); c.commit(); c.close(); self.clinical_status.setText('اطلاعات ساختاریافته ذخیره شد.')

    def build_training(self):
        w,l=self.page('Model Training'); l.addWidget(QLabel('مدل فقط با داده واقعی و برچسب‌دار آموزش داده می‌شود. Validation در سطح participant انجام می‌شود.'))
        b=QPushButton('Build Dataset + Train Eye-only Model'); b.clicked.connect(self.train); l.addWidget(b); self.model_status=QLabel('هیچ مدلی بارگذاری نشده است.'); l.addWidget(self.model_status)

    def train(self):
        try:
            r=subprocess.run([sys.executable,str(ROOT/'train_model.py')],cwd=ROOT,capture_output=True,text=True)
            if r.returncode: raise RuntimeError(r.stderr or r.stdout)
            self.model_status.setText(r.stdout); QMessageBox.information(self,'Training complete','مدل واقعی پژوهشی آموزش و ارزیابی شد. نتیجه در models ذخیره شد.')
        except Exception as e: QMessageBox.critical(self,'Training Error',str(e))

    def build_status(self):
        w,l=self.page('Research Status'); self.status=QLabel(); l.addWidget(self.status); b=QPushButton('Refresh'); b.clicked.connect(self.refresh_status); l.addWidget(b); self.refresh_status()

    def refresh_status(self):
        import glob,os
        files=glob.glob(str(ROOT/'eye_data'/'*_eye.csv')); labeled=0
        for f in files:
            try:
                import pandas as pd; d=pd.read_csv(f); labeled += int(not d.empty and d.label.iloc[0] in ['ADHD','CONTROL'])
            except: pass
        self.status.setText(f'Sessions: {len(files)}\nLabeled sessions: {labeled}\nModel: {"Available" if (ROOT/"models/adhd_eye_model.joblib").exists() else "Not trained"}')

if __name__=='__main__':
    app=QApplication(sys.argv); win=App(); win.show(); sys.exit(app.exec_())
