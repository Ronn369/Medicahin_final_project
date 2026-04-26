// test/MedChain.test.js — Hardhat tests for MedChain contract

const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("MedChain Contract", function () {
  let MedChain, medchain;
  let owner, patient, doctor, stranger;

  // Deploy fresh contract before each test
  beforeEach(async function () {
    [owner, patient, doctor, stranger] = await ethers.getSigners();
    MedChain = await ethers.getContractFactory("MedChain");
    medchain = await MedChain.deploy();
    await medchain.waitForDeployment();
  });

  // ── Deployment ──────────────────────────────────────────────
  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await medchain.owner()).to.equal(owner.address);
    });
  });

  // ── Patient Registration ────────────────────────────────────
  describe("Patient Registration", function () {
    it("Should register a patient successfully", async function () {
      await medchain.connect(patient).registerPatient("PAT-2024-001");
      const p = await medchain.patients(patient.address);
      expect(p.isRegistered).to.equal(true);
      expect(p.patientId).to.equal("PAT-2024-001");
    });

    it("Should emit PatientRegistered event", async function () {
      await expect(medchain.connect(patient).registerPatient("PAT-2024-001"))
        .to.emit(medchain, "PatientRegistered")
        .withArgs(patient.address, "PAT-2024-001", await getTimestamp());
    });

    it("Should not allow double registration", async function () {
      await medchain.connect(patient).registerPatient("PAT-2024-001");
      await expect(
        medchain.connect(patient).registerPatient("PAT-2024-002")
      ).to.be.revertedWith("MedChain: Already registered");
    });
  });

  // ── Doctor Registration ─────────────────────────────────────
  describe("Doctor Registration", function () {
    it("Should register a doctor successfully", async function () {
      await medchain.connect(doctor).registerDoctor("DOC-0421");
      const d = await medchain.doctors(doctor.address);
      expect(d.isRegistered).to.equal(true);
      expect(d.doctorId).to.equal("DOC-0421");
    });
  });

  // ── Access Control ──────────────────────────────────────────
  describe("Access Control", function () {
    beforeEach(async function () {
      await medchain.connect(patient).registerPatient("PAT-001");
      await medchain.connect(doctor).registerDoctor("DOC-001");
    });

    it("Should grant access to a doctor", async function () {
      await medchain.connect(patient).grantAccess(doctor.address, 0);
      expect(await medchain.hasAccess(patient.address, doctor.address)).to.equal(true);
    });

    it("Should emit AccessGranted event", async function () {
      await expect(medchain.connect(patient).grantAccess(doctor.address, 0))
        .to.emit(medchain, "AccessGranted");
    });

    it("Should revoke access from a doctor", async function () {
      await medchain.connect(patient).grantAccess(doctor.address, 0);
      await medchain.connect(patient).revokeAccess(doctor.address);
      expect(await medchain.hasAccess(patient.address, doctor.address)).to.equal(false);
    });

    it("Should not allow unregistered doctor to be granted access", async function () {
      await expect(
        medchain.connect(patient).grantAccess(stranger.address, 0)
      ).to.be.revertedWith("MedChain: Doctor not registered");
    });

    it("Should return false for doctor with no access", async function () {
      expect(await medchain.hasAccess(patient.address, doctor.address)).to.equal(false);
    });
  });

  // ── Prescription Hashing ────────────────────────────────────
  describe("Prescription Hashing", function () {
    beforeEach(async function () {
      await medchain.connect(patient).registerPatient("PAT-001");
    });

    it("Should store a prescription hash", async function () {
      const hash = ethers.keccak256(ethers.toUtf8Bytes("test-file-content"));
      await medchain.connect(patient).storePrescriptionHash("RX-001", hash);
      const record = await medchain.getPrescription("RX-001");
      expect(record.fileHash).to.equal(hash);
      expect(record.patient).to.equal(patient.address);
    });

    it("Should verify a valid prescription hash", async function () {
      const hash = ethers.keccak256(ethers.toUtf8Bytes("test-file-content"));
      await medchain.connect(patient).storePrescriptionHash("RX-001", hash);
      const [isValid] = await medchain.verifyPrescription("RX-001", hash);
      expect(isValid).to.equal(true);
    });

    it("Should reject a tampered prescription hash", async function () {
      const hash = ethers.keccak256(ethers.toUtf8Bytes("original-content"));
      const tamperedHash = ethers.keccak256(ethers.toUtf8Bytes("tampered-content"));
      await medchain.connect(patient).storePrescriptionHash("RX-001", hash);
      const [isValid] = await medchain.verifyPrescription("RX-001", tamperedHash);
      expect(isValid).to.equal(false);
    });

    it("Should not allow duplicate prescription ID", async function () {
      const hash = ethers.keccak256(ethers.toUtf8Bytes("content"));
      await medchain.connect(patient).storePrescriptionHash("RX-001", hash);
      await expect(
        medchain.connect(patient).storePrescriptionHash("RX-001", hash)
      ).to.be.revertedWith("MedChain: Prescription already stored");
    });
  });
});

async function getTimestamp() {
  const block = await ethers.provider.getBlock("latest");
  return block.timestamp + 1; // approximate next block
}
