# ✅ MedChain — Complete Setup & Run Guide
## Run All 4 Services in VS Code (Frontend + Backend + AI + Blockchain)

---

## 📁 FINAL FOLDER STRUCTURE
After all steps, you should have this on your computer:

```
MedChain/
├── healthcare-frontend/
│   └── index.html                ← Your UI (open in browser)
│
├── medchain-backend/             ← Node.js API (port 5000)
│   ├── server.js
│   ├── .env
│   ├── blockchain/
│   │   ├── blockchainService.js  ← copy from medchain-blockchain
│   │   └── MedChainABI.json      ← copy after deploying contract
│   └── ... (all other files)
│
├── medchain-ai/                  ← Python AI service (port 8000)
│   ├── main.py
│   ├── .env
│   └── ... (all other files)
│
└── medchain-blockchain/          ← Hardhat (port 8545)
    ├── contracts/MedChain.sol
    ├── scripts/deploy.js
    └── ... (all other files)
```

---

## ⚙️ ONE-TIME SETUP (Do this only once)

### STEP 1 — Install Node.js and Python
- Node.js: https://nodejs.org → Download LTS → Install
- Python: https://python.org → Download 3.10+ → Install
  ✅ Check "Add Python to PATH" during install
- Verify: open any terminal and run:
  ```
  node -v       → should show v18.x or higher
  python --version  → should show 3.10+
  ```

### STEP 2 — Install MongoDB
Option A (Recommended — Cloud, Free):
1. Go to https://mongodb.com/atlas → Sign Up Free
2. Create a free cluster
3. Click Connect → Drivers → Copy the URI
   It looks like: mongodb+srv://user:pass@cluster0.xxx.mongodb.net/medchain
4. Save this URI — you'll need it in Step 4

Option B (Local):
1. Download from https://www.mongodb.com/try/download/community
2. Install and start with: `mongod`

### STEP 3 — Get Anthropic API Key
1. Go to https://console.anthropic.com
2. Sign up / Login
3. Go to API Keys → Create Key
4. Copy the key (starts with sk-ant-...)
5. Save it — you'll need it in Step 6

---

## 🔧 PROJECT SETUP (Per folder)

### STEP 4 — Setup Backend
Open VS Code terminal in the `medchain-backend/` folder:

```bash
cd medchain-backend
npm install
npm install ethers form-data
```

Create your .env file:
```bash
# Windows:
copy .env.example .env

# Mac/Linux:
cp .env.example .env
```

Open `.env` and set these values:
```
PORT=5000
MONGO_URI=mongodb+srv://youruser:yourpass@cluster0.xxx.mongodb.net/medchain
JWT_SECRET=any_long_random_string_abc123xyz789_make_it_long
AI_SERVICE_URL=http://localhost:8000
BLOCKCHAIN_RPC_URL=http://localhost:8545
CONTRACT_ADDRESS=                    ← leave blank for now, fill after Step 9
NODE_ENV=development
```

Create the blockchain folder inside backend:
```bash
mkdir blockchain
```
Copy these two files into `medchain-backend/blockchain/`:
- `medchain-blockchain/frontend-integration/blockchainService.js`
- `medchain-blockchain/frontend-integration/accessController_blockchain.js` → rename to `accessController.js` and move to `medchain-backend/controllers/`
- `medchain-blockchain/frontend-integration/prescriptionController_blockchain.js` → rename to `prescriptionController.js` and move to `medchain-backend/controllers/`

### STEP 5 — Setup AI Service
Open a NEW VS Code terminal in `medchain-ai/` folder:

```bash
cd medchain-ai

# Create virtual environment
python -m venv venv

# Activate it:
# Windows:
venv\Scripts\activate
# Mac/Linux:
source venv/bin/activate

# You should see (venv) in your terminal prompt now

# Install dependencies
pip install -r requirements.txt
```

Create .env file:
```bash
# Windows:
copy .env.example .env
# Mac/Linux:
cp .env.example .env
```

Open `.env` and set:
```
ANTHROPIC_API_KEY=sk-ant-your-key-here
PORT=8000
```

### STEP 6 — Setup Blockchain
Open a NEW VS Code terminal in `medchain-blockchain/` folder:

```bash
cd medchain-blockchain
npm install
```

Create .env file:
```bash
# Windows:
copy .env.example .env
# Mac/Linux:
cp .env.example .env
```
Leave it blank for now (local dev doesn't need a private key).

---

## 🚀 RUNNING THE PROJECT (Every time you work)
Open 4 terminals in VS Code. Use the Split Terminal feature:
Terminal → New Terminal, then click the split icon ⊟

### TERMINAL 1 — Blockchain Node
```bash
cd medchain-blockchain
npx hardhat node
```
✅ You should see:
```
Started HTTP and WebSocket JSON-RPC server at http://127.0.0.1:8545/

Accounts
========
Account #0: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 (10000 ETH)
Account #1: 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 (10000 ETH)
...
```
⚠️ KEEP THIS RUNNING. Do not close it.

### TERMINAL 2 — Deploy Contract (run ONCE after starting node)
Open a NEW terminal (keep Terminal 1 open):
```bash
cd medchain-blockchain
npx hardhat run scripts/deploy.js --network localhost
```
✅ You should see:
```
🚀 Deploying MedChain contract...
✅ MedChain deployed to: 0x5FbDB2315678afecb367f032d93F642f64180aa3
💾 Deployment info saved to: deployment.json
💾 ABI saved to: MedChainABI.json
✅ Backend .env updated with contract address
```

Now copy the ABI to backend:
```bash
# Windows:
copy MedChainABI.json ..\medchain-backend\blockchain\MedChainABI.json

# Mac/Linux:
cp MedChainABI.json ../medchain-backend/blockchain/MedChainABI.json
```

Your backend's `.env` CONTRACT_ADDRESS should now be auto-filled.
Check medchain-backend/.env — you should see:
```
CONTRACT_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3
```

### TERMINAL 3 — Backend API
```bash
cd medchain-backend
npm run dev
```
✅ You should see:
```
🚀 MedChain Backend running on port 5000
✅ MongoDB Connected: cluster0.xxx.mongodb.net
⛓  Blockchain service connected: http://localhost:8545
📄 Contract: 0x5FbDB2315678afecb367f032d93F642f64180aa3
```

### TERMINAL 4 — AI Service
```bash
cd medchain-ai

# Activate venv first:
# Windows:
venv\Scripts\activate
# Mac/Linux:
source venv/bin/activate

python main.py
```
✅ You should see:
```
══════════════════════════════════════════════════
  🤖 MedChain AI Service Starting...
  📡 Port: 8000
  🔑 Anthropic API Key: ✅ Configured
══════════════════════════════════════════════════
INFO: Uvicorn running on http://0.0.0.0:8000
```

### FRONTEND
Open `healthcare-frontend/index.html`:
- Right-click → Open with Live Server (VS Code extension)
  OR
- Just double-click the file to open in browser

---

## ✅ VERIFY EVERYTHING IS WORKING

Open these URLs in your browser:

| Service | URL | Expected Response |
|---------|-----|-------------------|
| Backend health | http://localhost:5000/api/health | `{"success":true,"message":"🏥 MedChain API is running"}` |
| AI health | http://localhost:8000/health | `{"status":"running","anthropic_key_configured":true}` |
| AI docs | http://localhost:8000/docs | Interactive Swagger UI |
| Blockchain | http://localhost:8545 | (JSON-RPC endpoint — no browser UI) |

On the Dashboard page of your frontend, all 3 status badges should turn **green**.

---

## 🧪 QUICK TEST — End-to-End Flow

1. Open `index.html` in browser
2. Click **Patient** → Register with email + password
3. Upload a prescription image (any photo of text works for testing)
4. Wait 15–30 seconds for AI analysis
5. Click **View Summary** → See DO's and DON'Ts
6. Click **Doctor** → Register as a doctor
7. As a patient: go to Doctor Access → Grant (paste the Doctor's MongoDB ID from their profile)
8. As a doctor: login → see the patient in your list → view their prescriptions
9. Dashboard shows blockchain tx hashes for every action

---

## ❌ TROUBLESHOOTING

| Problem | Solution |
|---------|----------|
| `EADDRINUSE 5000` | Another app using port 5000. Change PORT in .env to 5001 |
| `EADDRINUSE 8000` | Change PORT in medchain-ai/.env to 8001, update AI_SERVICE_URL in backend .env |
| `MongoServerError: bad auth` | Check MONGO_URI username/password. Special chars in password need URL-encoding |
| `Cannot find module 'form-data'` | Run `npm install form-data` in medchain-backend |
| `ModuleNotFoundError: anthropic` | Activate venv, then `pip install -r requirements.txt` |
| Blockchain: `CONTRACT_ADDRESS not set` | Deploy contract first (Terminal 2), then restart backend |
| Hardhat node exits | Restart Terminal 1 with `npx hardhat node`, then redeploy |
| AI taking too long | Normal — Claude API can take 20–30s for complex images. Wait. |
| `CORS error` in browser | Make sure backend is running on port 5000. Check CLIENT_URL in .env |

---

## 📋 COPY-PASTE COMMANDS SUMMARY

One-time setup:
```bash
# Backend
cd medchain-backend && npm install && npm install ethers form-data

# AI
cd medchain-ai && python -m venv venv && venv\Scripts\activate && pip install -r requirements.txt

# Blockchain
cd medchain-blockchain && npm install
```

Every time you run:
```bash
# Terminal 1
cd medchain-blockchain && npx hardhat node

# Terminal 2 (first time only, or after restarting Terminal 1)
cd medchain-blockchain && npx hardhat run scripts/deploy.js --network localhost

# Terminal 3
cd medchain-backend && npm run dev

# Terminal 4
cd medchain-ai && venv\Scripts\activate && python main.py
```

---

## 🌐 ARCHITECTURE SUMMARY

```
Browser (index.html)
      │
      │ HTTP (port 5000)
      ▼
Node.js Backend ──────── MongoDB (Atlas)
      │
      │ HTTP (port 8000)
      ▼
FastAPI AI Service ────── Claude API (Anthropic)
      
Node.js Backend ──────── Hardhat Blockchain (port 8545)
                               │
                         MedChain.sol contract
                         (access control + file hashes)
```

Every prescription upload:
1. File saved to disk + SHA256 hash computed
2. AI analyzes image → medicines + DO's/DON'Ts
3. File hash stored on blockchain → tamper-proof record
4. Access control enforced: doctor can only read if patient approved

---

## 🔑 DEFAULT TEST CREDENTIALS
(After running setup-test-accounts.js)

Patient wallet:  0x70997970C51812dc3A010C7d01b50e0d17dc79C8
Doctor wallet:   0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC

For MongoDB accounts, register fresh via the frontend.
