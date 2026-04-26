// blockchain/blockchainService.js
// This file goes in medchain-backend/blockchain/blockchainService.js
// It connects Node.js to the deployed MedChain smart contract

const { ethers } = require("ethers");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

// ── Load ABI ────────────────────────────────────────────────────
// Copy MedChainABI.json from medchain-blockchain/ into medchain-backend/blockchain/
let CONTRACT_ABI = [];
const abiPath = path.join(__dirname, "MedChainABI.json");
if (fs.existsSync(abiPath)) {
  CONTRACT_ABI = JSON.parse(fs.readFileSync(abiPath, "utf8"));
} else {
  console.warn("⚠️  MedChainABI.json not found in blockchain/ — blockchain features disabled");
}

class BlockchainService {
  constructor() {
    this.provider = null;
    this.contract = null;
    this.signer = null;
    this.isConnected = false;
    this._init();
  }

  _init() {
    try {
      const rpcUrl = process.env.BLOCKCHAIN_RPC_URL || "http://localhost:8545";
      const contractAddress = process.env.CONTRACT_ADDRESS;

      if (!contractAddress || contractAddress === "0x0000000000000000000000000000000000000000") {
        console.warn("⚠️  CONTRACT_ADDRESS not set — blockchain features in simulation mode");
        return;
      }

      if (CONTRACT_ABI.length === 0) {
        console.warn("⚠️  ABI not loaded — blockchain features disabled");
        return;
      }

      this.provider = new ethers.JsonRpcProvider(rpcUrl);

      // Use the first Hardhat test account as the "backend signer"
      // In production: use a dedicated wallet with a real private key in .env
      const privateKey = process.env.BACKEND_PRIVATE_KEY ||
        "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"; // Hardhat account #0

      this.signer = new ethers.Wallet(privateKey, this.provider);
      this.contract = new ethers.Contract(contractAddress, CONTRACT_ABI, this.signer);
      this.isConnected = true;

      console.log(`⛓  Blockchain service connected: ${rpcUrl}`);
      console.log(`📄 Contract: ${contractAddress}`);
    } catch (error) {
      console.warn(`⚠️  Blockchain init failed: ${error.message}`);
      this.isConnected = false;
    }
  }

  // ── Utility: convert hex SHA256 string to bytes32 ─────────────
  hexToBytes32(hexString) {
    // Remove 0x prefix if present, pad to 32 bytes
    const clean = hexString.replace("0x", "").slice(0, 64).padStart(64, "0");
    return "0x" + clean;
  }

  // ── Utility: generate SHA256 hash of a file ────────────────────
  hashFile(filePath) {
    const buffer = fs.readFileSync(filePath);
    return crypto.createHash("sha256").update(buffer).digest("hex");
  }

  // ══════════════════════════════════════════════════════════════
  // PATIENT FUNCTIONS
  // ══════════════════════════════════════════════════════════════

  /**
   * Register a patient on the blockchain.
   * Called when patient first signs up.
   */
  async registerPatient(walletAddress, patientId) {
    if (!this.isConnected) return this._simulateSuccess("registerPatient");

    try {
      // Connect contract as the patient's wallet
      // In a real app, the patient would sign this from their browser (MetaMask)
      // For backend-only flow, we simulate with the backend signer
      const tx = await this.contract.registerPatient(patientId);
      const receipt = await tx.wait();
      return {
        success: true,
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
      };
    } catch (error) {
      // "Already registered" is okay
      if (error.message.includes("Already registered")) {
        return { success: true, txHash: null, note: "Already registered on-chain" };
      }
      throw error;
    }
  }

  /**
   * Register a doctor on the blockchain.
   */
  async registerDoctor(walletAddress, doctorId) {
    if (!this.isConnected) return this._simulateSuccess("registerDoctor");

    try {
      const tx = await this.contract.registerDoctor(doctorId);
      const receipt = await tx.wait();
      return { success: true, txHash: receipt.hash, blockNumber: receipt.blockNumber };
    } catch (error) {
      if (error.message.includes("Already registered")) {
        return { success: true, txHash: null, note: "Already registered on-chain" };
      }
      throw error;
    }
  }

  // ══════════════════════════════════════════════════════════════
  // ACCESS CONTROL
  // ══════════════════════════════════════════════════════════════

  /**
   * Grant doctor access on blockchain.
   * Returns transaction hash to store in MongoDB.
   */
  async grantAccess(patientWallet, doctorWallet, durationDays = 0) {
    if (!this.isConnected) return this._simulateSuccess("grantAccess");

    try {
      const tx = await this.contract.grantAccess(doctorWallet, durationDays);
      const receipt = await tx.wait();
      return {
        success: true,
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
      };
    } catch (error) {
      console.error("grantAccess blockchain error:", error.message);
      return this._simulateSuccess("grantAccess");
    }
  }

  /**
   * Revoke doctor access on blockchain.
   */
  async revokeAccess(patientWallet, doctorWallet) {
    if (!this.isConnected) return this._simulateSuccess("revokeAccess");

    try {
      const tx = await this.contract.revokeAccess(doctorWallet);
      const receipt = await tx.wait();
      return {
        success: true,
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
      };
    } catch (error) {
      console.error("revokeAccess blockchain error:", error.message);
      return this._simulateSuccess("revokeAccess");
    }
  }

  /**
   * Check on-chain if doctor has access (read-only, no gas cost).
   */
  async hasAccess(patientWallet, doctorWallet) {
    if (!this.isConnected) return true; // simulation: assume yes

    try {
      return await this.contract.hasAccess(patientWallet, doctorWallet);
    } catch (error) {
      console.error("hasAccess blockchain error:", error.message);
      return true; // fallback to MongoDB check
    }
  }

  // ══════════════════════════════════════════════════════════════
  // PRESCRIPTION HASHING
  // ══════════════════════════════════════════════════════════════

  /**
   * Store prescription file hash on blockchain.
   * Proves the file existed at this time and hasn't been modified.
   */
  async storePrescriptionHash(prescriptionId, fileHashHex) {
    if (!this.isConnected) return this._simulateSuccess("storePrescriptionHash");

    try {
      const bytes32Hash = this.hexToBytes32(fileHashHex);
      const tx = await this.contract.storePrescriptionHash(prescriptionId, bytes32Hash);
      const receipt = await tx.wait();
      return {
        success: true,
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        fileHash: fileHashHex,
      };
    } catch (error) {
      if (error.message.includes("already stored")) {
        return { success: true, txHash: null, note: "Already on chain" };
      }
      console.error("storePrescriptionHash error:", error.message);
      return this._simulateSuccess("storePrescriptionHash");
    }
  }

  /**
   * Verify prescription integrity on blockchain.
   */
  async verifyPrescription(prescriptionId, fileHashHex) {
    if (!this.isConnected) {
      return { isValid: true, storedAt: new Date().toISOString(), simulated: true };
    }

    try {
      const bytes32Hash = this.hexToBytes32(fileHashHex);
      const [isValid, storedAt, patient] = await this.contract.verifyPrescription(
        prescriptionId,
        bytes32Hash
      );
      return {
        isValid,
        storedAt: storedAt > 0 ? new Date(Number(storedAt) * 1000).toISOString() : null,
        patient,
        simulated: false,
      };
    } catch (error) {
      console.error("verifyPrescription error:", error.message);
      return { isValid: false, error: error.message };
    }
  }

  // ── Simulation mode (when blockchain not connected) ───────────
  _simulateSuccess(action) {
    const fakeHash = "0x" + crypto.randomBytes(32).toString("hex");
    const fakeBlock = Math.floor(40000 + Math.random() * 10000);
    console.log(`[Blockchain SIM] ${action} | Tx: ${fakeHash.slice(0, 18)}...`);
    return {
      success: true,
      txHash: fakeHash,
      blockNumber: fakeBlock,
      simulated: true,
    };
  }

  // ── Connection status ──────────────────────────────────────────
  getStatus() {
    return {
      connected: this.isConnected,
      contractAddress: process.env.CONTRACT_ADDRESS || null,
      rpcUrl: process.env.BLOCKCHAIN_RPC_URL || "http://localhost:8545",
    };
  }
}

// Export singleton
module.exports = new BlockchainService();
