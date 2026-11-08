import sys
import sqlite3
from PyQt5.QtWidgets import (
    QApplication, QLabel, QWidget, QPushButton, QVBoxLayout, QHBoxLayout,
    QComboBox, QStackedLayout, QListWidget, QMessageBox,
    QLineEdit, QTextEdit, QFormLayout, QTableWidget, QTableWidgetItem, QHeaderView
)
from PyQt5.QtCore import Qt

class ClientDatabaseWidget(QWidget):
    def __init__(self):
        super().__init__()
        self.conn = sqlite3.connect("clients.db")
        self.init_ui()
        self.load_data()

    def init_ui(self):
        layout = QVBoxLayout()

        # فرم افزودن کلاینت جدید
        form = QFormLayout()
        self.name_input = QLineEdit()
        self.age_input = QLineEdit()
        self.gender_input = QComboBox()
        self.gender_input.addItems(["Select", "Male", "Female", "Other"])
        self.phone_input = QLineEdit()
        self.email_input = QLineEdit()
        self.notes_input = QTextEdit()
        add_btn = QPushButton("Add Client")
        add_btn.clicked.connect(self.add_client)

        form.addRow("Name:", self.name_input)
        form.addRow("Age:", self.age_input)
        form.addRow("Gender:", self.gender_input)
        form.addRow("Phone:", self.phone_input)
        form.addRow("Email:", self.email_input)
        form.addRow("Notes:", self.notes_input)
        form.addRow(add_btn)

        # بخش جستجو
        search_layout = QHBoxLayout()
        self.search_input = QLineEdit()
        self.search_input.setPlaceholderText("Search by name or phone...")
        search_button = QPushButton("Search")
        search_button.clicked.connect(self.search_clients)
        reset_button = QPushButton("Reset")
        reset_button.clicked.connect(self.load_data)
        search_layout.addWidget(self.search_input)
        search_layout.addWidget(search_button)
        search_layout.addWidget(reset_button)

        # جدول نمایش کلاینت‌ها
        self.table = QTableWidget()
        self.table.setColumnCount(7)
        self.table.setHorizontalHeaderLabels(["ID", "Name", "Age", "Gender", "Phone", "Email", "Notes"])
        self.table.horizontalHeader().setSectionResizeMode(QHeaderView.Stretch)
        self.table.setEditTriggers(QTableWidget.NoEditTriggers)
        self.table.cellDoubleClicked.connect(self.edit_client_form)

        delete_btn = QPushButton("Delete Selected Client")
        delete_btn.clicked.connect(self.delete_selected_client)

        layout.addLayout(form)
        layout.addLayout(search_layout)
        layout.addWidget(self.table)
        layout.addWidget(delete_btn)
        self.setLayout(layout)

    def add_client(self):
        name = self.name_input.text().strip()
        age = self.age_input.text().strip()
        gender = self.gender_input.currentText()
        phone = self.phone_input.text().strip()
        email = self.email_input.text().strip()
        notes = self.notes_input.toPlainText().strip()

        if not name or not age or gender == "Select":
            QMessageBox.warning(self, "Input Error", "Please fill in all required fields.")
            return

        try:
            cursor = self.conn.cursor()
            cursor.execute("""
                INSERT INTO clients (name, age, gender, phone, email, notes)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (name, age, gender, phone, email, notes))
            self.conn.commit()
            QMessageBox.information(self, "Success", "Client added successfully.")
            self.clear_form()
            self.load_data()
        except Exception as e:
            QMessageBox.critical(self, "Database Error", str(e))

    def clear_form(self):
        self.name_input.clear()
        self.age_input.clear()
        self.gender_input.setCurrentIndex(0)
        self.phone_input.clear()
        self.email_input.clear()
        self.notes_input.clear()

    def load_data(self):
        cursor = self.conn.cursor()
        cursor.execute("SELECT id, name, age, gender, phone, email, notes FROM clients")
        rows = cursor.fetchall()
        self.table.setRowCount(0)
        for row_idx, row_data in enumerate(rows):
            self.table.insertRow(row_idx)
            for col_idx, item in enumerate(row_data):
                self.table.setItem(row_idx, col_idx, QTableWidgetItem(str(item)))

    def search_clients(self):
        keyword = self.search_input.text().strip()
        if not keyword:
            return
        cursor = self.conn.cursor()
        cursor.execute("""
            SELECT id, name, age, gender, phone, email, notes
            FROM clients
            WHERE name LIKE ? OR phone LIKE ?
        """, (f"%{keyword}%", f"%{keyword}%"))
        rows = cursor.fetchall()
        self.table.setRowCount(0)
        for row_idx, row_data in enumerate(rows):
            self.table.insertRow(row_idx)
            for col_idx, item in enumerate(row_data):
                self.table.setItem(row_idx, col_idx, QTableWidgetItem(str(item)))

    def delete_selected_client(self):
        row = self.table.currentRow()
        if row == -1:
            QMessageBox.warning(self, "Selection Error", "Please select a client to delete.")
            return
        client_id = self.table.item(row, 0).text()
        confirm = QMessageBox.question(self, "Confirm Delete", f"Are you sure you want to delete client ID {client_id}?", QMessageBox.Yes | QMessageBox.No)
        if confirm == QMessageBox.Yes:
            cursor = self.conn.cursor()
            cursor.execute("DELETE FROM clients WHERE id=?", (client_id,))
            self.conn.commit()
            self.load_data()

    def edit_client_form(self, row, column):
        client_id = self.table.item(row, 0).text()
        client_data = [self.table.item(row, i).text() for i in range(1, 7)]

        dialog = QWidget()
        dialog.setWindowTitle(f"Edit Client ID {client_id}")
        dialog.setGeometry(200, 200, 400, 300)

        form = QFormLayout()
        name = QLineEdit(client_data[0])
        age = QLineEdit(client_data[1])
        gender = QComboBox()
        gender.addItems(["Male", "Female", "Other"])
        gender.setCurrentText(client_data[2])
        phone = QLineEdit(client_data[3])
        email = QLineEdit(client_data[4])
        notes = QTextEdit(client_data[5])

        form.addRow("Name:", name)
        form.addRow("Age:", age)
        form.addRow("Gender:", gender)
        form.addRow("Phone:", phone)
        form.addRow("Email:", email)
        form.addRow("Notes:", notes)

        save_btn = QPushButton("Save Changes")
        save_btn.clicked.connect(lambda: self.save_edit(client_id, name.text(), age.text(), gender.currentText(), phone.text(), email.text(), notes.toPlainText(), dialog))
        form.addRow(save_btn)

        dialog.setLayout(form)
        dialog.show()

    def save_edit(self, client_id, name, age, gender, phone, email, notes, dialog):
        cursor = self.conn.cursor()
        cursor.execute("""
            UPDATE clients SET
                name = ?,
                age = ?,
                gender = ?,
                phone = ?,
                email = ?,
                notes = ?
            WHERE id = ?
        """, (name, age, gender, phone, email, notes, client_id))
        self.conn.commit()
        dialog.close()
        self.load_data()
        QMessageBox.information(self, "Updated", "Client data updated successfully.")
