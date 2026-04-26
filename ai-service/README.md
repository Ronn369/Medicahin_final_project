# MedChain AI Service
### FastAPI + Claude Vision API — Prescription Analysis

---

## 📁 Project Structure

```
medchain-ai/
├── main.py                  ← FastAPI app (all routes)
├── requirements.txt         ← Python dependencies
├── .env.example             ← Copy to .env and add your API key
├── utils/
│   ├── image_utils.py       ← Image → base64 conversion
│   └── analyzer.py          ← Claude Vision API calls
├── uploads/                 ← Temp file storage (auto-created)
├── index_updated.html       ← Updated frontend (copy over old one)
└── prescriptionController_updated.js  ← Updated backend controller
```

---

## ⚡ Quick Start

### Step 1 — Create virtual environment (recommended)
```bash
cd medchain-ai
python -m venv venv

# Activate it:
# Windows:
venv\Scripts\activate

# Mac/Linux:
source venv/bin/activate
```

### Step 2 — Install dependencies
```bash
pip install -r requirements.txt
```

### Step 3 — Set your API key
```bash
cp .env.example .env
```
Open `.env` and set:
```
ANTHROPIC_API_KEY=your_api_key_here
```
Get your key from: https://console.anthropic.com/

### Step 4 — Start the AI service
```bash
python main.py
```

You should see:
```
══════════════════════════════════════════════════
  🤖 MedChain AI Service Starting...
  📡 Port: 8000
  🔑 Anthropic API Key: ✅ Configured
  📁 Upload dir: /path/to/uploads
══════════════════════════════════════════════════
INFO:     Uvicorn running on http://0.0.0.0:8000
```

### Step 5 — Verify it works
Open browser: http://localhost:8000/health
```json
{
  "status": "running",
  "service": "MedChain AI",
  "anthropic_key_configured": true
}
```

Interactive API docs: http://localhost:8000/docs

---

## 🔗 Updating Backend & Frontend

After starting the AI service, copy these two files:

**1. Updated prescription controller** (fixes AI service integration):
```bash
# From medchain-ai/ folder:
cp prescriptionController_updated.js ../medchain-backend/controllers/prescriptionController.js
```

**2. Install form-data in backend** (needed for file upload to AI):
```bash
cd ../medchain-backend
npm install form-data
```

**3. Updated frontend** (connects to real backend):
```bash
cp index_updated.html ../healthcare-frontend/index.html
```

---

## 🌐 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /health | Health check + API key status |
| POST | /analyze | Analyze prescription (synchronous) |
| POST | /analyze/async | Analyze in background (returns job_id) |
| GET | /status/{job_id} | Poll background job status |
| POST | /analyze/text | Analyze from typed text (no image) |
| GET | /jobs | List recent jobs |
| GET | /docs | Interactive Swagger UI |

---

## 🧪 Test Without Frontend

### Test via Swagger UI (easiest)
Open: http://localhost:8000/docs
Click `/analyze` → Try it out → Upload a prescription image

### Test via curl
```bash
curl -X POST http://localhost:8000/analyze \
  -F "file=@/path/to/prescription.jpg" \
  -F "prescription_id=test-001"
```

### Test text analysis
```bash
curl -X POST http://localhost:8000/analyze/text \
  -F "medicine_text=Tab. Metformin 500mg twice daily after meals x 30 days. Tab. Amlodipine 5mg once daily x 30 days."
```

---

## 🏃 Running All 3 Services Together

Open 3 separate terminals:

**Terminal 1 — MongoDB**
```bash
mongod
```

**Terminal 2 — Backend (port 5000)**
```bash
cd medchain-backend
npm run dev
```

**Terminal 3 — AI Service (port 8000)**
```bash
cd medchain-ai
source venv/bin/activate   # or venv\Scripts\activate on Windows
python main.py
```

**Frontend** — open `index.html` in browser (or use Live Server)

---

## ⚠️ Common Errors

| Error | Fix |
|-------|-----|
| `ANTHROPIC_API_KEY not set` | Add key to `.env` file |
| `ModuleNotFoundError` | Run `pip install -r requirements.txt` |
| `Connection refused` (from backend) | Make sure AI service is running on port 8000 |
| `overloaded_error` from Claude | Retry — API is busy, built-in retry logic handles this |
| Image analysis returns low quality | Use clear, well-lit photo of prescription |
