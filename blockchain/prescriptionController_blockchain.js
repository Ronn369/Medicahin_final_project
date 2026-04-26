// controllers/prescriptionController.js — With blockchain hash storage

const Prescription = require('../models/Prescription');
const Patient = require('../models/Patient');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');
const blockchain = require('../blockchain/blockchainService');

const getFileHash = (filePath) => {
  const fileBuffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(fileBuffer).digest('hex');
};

const callAIService = async (filePath, prescriptionId) => {
  const aiServiceUrl = process.env.AI_SERVICE_URL || 'http://localhost:8000';
  const form = new FormData();
  form.append('file', fs.createReadStream(filePath));
  form.append('prescription_id', prescriptionId.toString());
  const response = await axios.post(`${aiServiceUrl}/analyze`, form, {
    headers: { ...form.getHeaders() },
    timeout: 90000,
  });
  return response.data;
};

const runAIAnalysis = async (prescriptionId, filePath) => {
  try {
    await Prescription.findByIdAndUpdate(prescriptionId, { 'aiAnalysis.status': 'processing' });
    const aiResult = await callAIService(filePath, prescriptionId);
    await Prescription.findByIdAndUpdate(prescriptionId, {
      'aiAnalysis.status': 'completed',
      'aiAnalysis.analyzedAt': new Date(),
      'aiAnalysis.medicines': (aiResult.medicines || []).map((m) => ({
        name: m.name || '', dosage: m.dosage || '', frequency: m.frequency || '', duration: m.duration || '',
      })),
      'aiAnalysis.recommendations': aiResult.recommendations || [],
      'aiAnalysis.warnings': aiResult.warnings || [],
      'aiAnalysis.notes': [
        aiResult.diagnosis ? `Diagnosis: ${aiResult.diagnosis}` : '',
        aiResult.follow_up ? `Follow-up: ${aiResult.follow_up}` : '',
        aiResult.notes || '',
        aiResult.warnings_disclaimer || '',
      ].filter(Boolean).join(' | '),
      'aiAnalysis.rawResponse': JSON.stringify(aiResult),
    });
    console.log(`✅ AI analysis saved for ${prescriptionId}`);
  } catch (error) {
    console.error(`❌ AI analysis failed for ${prescriptionId}:`, error.message);
    await Prescription.findByIdAndUpdate(prescriptionId, { 'aiAnalysis.status': 'failed' });
  }
};

// ── @route  POST /api/prescriptions/upload ─────────────────────
const uploadPrescription = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'Please upload a file' });

    const patient = req.patient;
    const fileHash = getFileHash(req.file.path);

    const prescription = await Prescription.create({
      patient: patient._id,
      patientId: patient.patientId,
      uploadedBy: patient._id,
      fileName: req.file.originalname,
      filePath: req.file.path,
      fileType: req.file.mimetype,
      fileSize: req.file.size,
      aiAnalysis: { status: 'pending' },
      blockchain: { fileHash },
    });

    patient.prescriptions.push(prescription._id);
    await patient.save();

    // ── Blockchain: store hash in background ──────────────────────
    blockchain.storePrescriptionHash(prescription.prescriptionId, fileHash)
      .then(async (result) => {
        if (result.txHash) {
          await Prescription.findByIdAndUpdate(prescription._id, {
            'blockchain.txHash': result.txHash,
            'blockchain.blockNumber': result.blockNumber || 0,
            'blockchain.isVerified': true,
            'blockchain.verifiedAt': new Date(),
          });
          console.log(`⛓  Prescription hash stored on-chain | Tx: ${result.txHash}`);
        }
      })
      .catch((err) => console.error('Blockchain hash storage failed:', err.message));

    // ── AI analysis in background ─────────────────────────────────
    runAIAnalysis(prescription._id, req.file.path)
      .catch((err) => console.error('BG analysis error:', err.message));

    res.status(201).json({
      success: true,
      message: 'Prescription uploaded. AI analysis started.',
      prescription: {
        id: prescription._id,
        prescriptionId: prescription.prescriptionId,
        fileName: prescription.fileName,
        fileHash: prescription.blockchain.fileHash,
        aiStatus: 'pending',
        createdAt: prescription.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ── @route  GET /api/prescriptions/my ──────────────────────────
const getMyPrescriptions = async (req, res, next) => {
  try {
    const prescriptions = await Prescription.find({ patient: req.patient._id, isActive: true }).sort({ createdAt: -1 });
    res.status(200).json({ success: true, count: prescriptions.length, prescriptions });
  } catch (error) { next(error); }
};

// ── @route  GET /api/prescriptions/:id ─────────────────────────
const getPrescription = async (req, res, next) => {
  try {
    const prescription = await Prescription.findById(req.params.id).populate('patient', 'fullName patientId');
    if (!prescription || !prescription.isActive) {
      return res.status(404).json({ success: false, message: 'Prescription not found' });
    }
    const isOwner = prescription.patient._id.toString() === req.user._id.toString();
    let hasAccess = isOwner;
    if (!isOwner && req.userRole === 'doctor') {
      const patient = await Patient.findById(prescription.patient._id);
      hasAccess = patient.isDoctorApproved(req.doctor._id);
      if (hasAccess) {
        prescription.accessLog.push({ doctor: req.doctor._id, doctorName: req.doctor.fullName, accessedAt: new Date() });
        await prescription.save();
      }
    }
    if (!hasAccess) return res.status(403).json({ success: false, message: 'Access denied — patient has not approved your access' });
    res.status(200).json({ success: true, prescription });
  } catch (error) { next(error); }
};

// ── @route  GET /api/prescriptions/patient/:patientId ──────────
const getPatientPrescriptions = async (req, res, next) => {
  try {
    const { patientId } = req.params;
    const patient = await Patient.findById(patientId);
    if (!patient) return res.status(404).json({ success: false, message: 'Patient not found' });
    const hasAccess = patient.isDoctorApproved(req.doctor._id);
    if (!hasAccess) return res.status(403).json({ success: false, message: 'Access denied — patient has not approved your access' });
    const prescriptions = await Prescription.find({ patient: patientId, isActive: true }).sort({ createdAt: -1 });
    res.status(200).json({ success: true, patient: { id: patient._id, fullName: patient.fullName, patientId: patient.patientId }, count: prescriptions.length, prescriptions });
  } catch (error) { next(error); }
};

// ── @route  GET /api/prescriptions/:id/status ──────────────────
const getAnalysisStatus = async (req, res, next) => {
  try {
    const prescription = await Prescription.findById(req.params.id).select('aiAnalysis blockchain prescriptionId');
    if (!prescription) return res.status(404).json({ success: false, message: 'Prescription not found' });
    res.status(200).json({
      success: true,
      prescriptionId: prescription.prescriptionId,
      aiStatus: prescription.aiAnalysis.status,
      aiAnalysis: prescription.aiAnalysis.status === 'completed' ? prescription.aiAnalysis : null,
      blockchain: prescription.blockchain,
    });
  } catch (error) { next(error); }
};

// ── @route  POST /api/prescriptions/:id/verify ─────────────────
const verifyPrescription = async (req, res, next) => {
  try {
    const prescription = await Prescription.findById(req.params.id);
    if (!prescription) return res.status(404).json({ success: false, message: 'Not found' });
    const result = await blockchain.verifyPrescription(
      prescription.prescriptionId,
      prescription.blockchain.fileHash
    );
    res.status(200).json({ success: true, prescriptionId: prescription.prescriptionId, ...result });
  } catch (error) { next(error); }
};

module.exports = { uploadPrescription, getMyPrescriptions, getPrescription, getPatientPrescriptions, getAnalysisStatus, verifyPrescription };
