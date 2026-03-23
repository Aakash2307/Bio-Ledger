# 🚀 Trivia 

---

## 📁 Project Structure

```
Trivia/
│
├── frontend/
│   └── my-project/        # React/Vite frontend
│
├── backend/               # Python backend
│
├── .gitignore
└── README.md
```

---

## ⚙️ Tech Stack

### Frontend

* React (Vite)
* JavaScript
* CSS

### Backend

* Python
* FastAPI 
* SQLite / PostGre

---

## 🚀 Getting Started

### 1. Clone the Repository

```
git clone https://github.com/Aakash2307/trivia.git
cd trivia
```

---

## 💻 Frontend Setup

```
cd frontend/my-project
npm install
npm run dev
```

👉 Runs on: `http://localhost:5173` (default Vite port)

---

## 🧠 Backend Setup

```
cd backend
python -m venv venv
source venv/bin/activate      # Linux / Mac
# venv\Scripts\activate       # Windows

pip install -r requirements.txt
python app.py                 # or main.py
```

👉 Runs on: `http://localhost:5173` (or your configured port)

---

## 🔐 Environment Variables

Create a `.env` file in the backend (if required):

```
KEY=value
SECRET=your_secret
```

⚠️ Do NOT push `.env` files to GitHub.

---

## 👥 Collaboration Workflow

### 🔹 Branching Strategy

* `main` → stable code
* `feature-*` → new features
* `bugfix-*` → fixes

### 🔹 Workflow

```
git pull origin main
git checkout -b feature-name

# make changes

git add .
git commit -m "describe changes"
git push origin feature-name
```

👉 Then create a Pull Request (PR) on GitHub.

---

## 🚫 Ignored Files

The following are excluded using `.gitignore`:

* `node_modules/`
* `venv/`
* `.env`
* `.xlsx`, `.db` files
* build/dist folders

---

## 📌 Best Practices

* Do NOT push:

  * `node_modules`
  * `venv`
  * `.env`
* Write meaningful commit messages
* Pull latest changes before starting work
* Use branches — never push directly to `main`

---

## 📈 Future Improvements

* Authentication system
* AI integration enhancements
* Deployment (Docker / Cloud)
* Database migration to PostgreSQL

---

## 🤝 Contributors

Add your team members here.

---

## 📄 License

This project is private and intended for internal development.
