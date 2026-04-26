// controllers/accessController.js — With blockchain integration

const Patient = require('../models/Patient');
const Doctor = require('../models/Doctor');
const blockchain = require('../blockchain/blockchainService');

// ── @route  POST /api/access/grant ─────────────────────────────
const grantAccess = async (req, res, next) => {
  try {
    const { doctorId, duration } = req.body;
    if (!doctorId) return res.status(400).json({ success: false, message: 'Doctor ID is required' });

    const doctor = await Doctor.findById(doctorId);
    if (!doctor) return res.status(404).json({ success: false, message: 'Doctor not found' });

    const patient = req.patient;

    const alreadyGranted = patient.approvedDoctors.find(
      (d) => d.doctorId.toString() === doctorId && d.isActive
    );
    if (alreadyGranted) {
      return res.status(400).json({ success: false, message: 'Access already granted to this doctor' });
    }

    // ── Blockchain: write grant transaction ──────────────────────
    const durationDays = (!duration || duration === 'permanent') ? 0 : parseInt(duration);
    const blockchainResult = await blockchain.grantAccess(
      patient.walletAddress || patient._id.toString(),
      doctor.walletAddress || doctor._id.toString(),
      durationDays
    );

    let expiresAt = null;
    if (duration && duration !== 'permanent') {
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + parseInt(duration));
    }

    patient.approvedDoctors.push({
      doctorId: doctor._id,
      doctorName: doctor.fullName,
      specialization: doctor.specialization,
      grantedAt: new Date(),
      expiresAt,
      blockchainTx: blockchainResult.txHash || '',
      isActive: true,
    });
    await patient.save();

    // Update doctor's cache
    const alreadyInDoctor = doctor.approvedPatients.find(
      (p) => p.patientId.toString() === patient._id.toString()
    );
    if (!alreadyInDoctor) {
      doctor.approvedPatients.push({ patientId: patient._id, patientName: patient.fullName, grantedAt: new Date(), isActive: true });
    } else {
      alreadyInDoctor.isActive = true;
    }
    await doctor.save();

    res.status(200).json({
      success: true,
      message: `Access granted to ${doctor.fullName}`,
      data: {
        doctorId: doctor._id,
        doctorName: doctor.fullName,
        specialization: doctor.specialization,
        grantedAt: new Date(),
        expiresAt,
        blockchainTx: blockchainResult.txHash,
        blockNumber: blockchainResult.blockNumber,
        simulated: blockchainResult.simulated || false,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ── @route  POST /api/access/revoke ────────────────────────────
const revokeAccess = async (req, res, next) => {
  try {
    const { doctorId } = req.body;
    if (!doctorId) return res.status(400).json({ success: false, message: 'Doctor ID is required' });

    const patient = req.patient;
    const accessEntry = patient.approvedDoctors.find(
      (d) => d.doctorId.toString() === doctorId && d.isActive
    );
    if (!accessEntry) {
      return res.status(404).json({ success: false, message: 'No active access found for this doctor' });
    }

    // ── Blockchain: write revoke transaction ──────────────────────
    const doctor = await Doctor.findById(doctorId);
    const blockchainResult = await blockchain.revokeAccess(
      patient.walletAddress || patient._id.toString(),
      doctor?.walletAddress || doctorId
    );

    accessEntry.isActive = false;
    await patient.save();

    if (doctor) {
      const patientEntry = doctor.approvedPatients.find(
        (p) => p.patientId.toString() === patient._id.toString()
      );
      if (patientEntry) { patientEntry.isActive = false; await doctor.save(); }
    }

    res.status(200).json({
      success: true,
      message: `Access revoked for ${accessEntry.doctorName}`,
      blockchainTx: blockchainResult.txHash,
      simulated: blockchainResult.simulated || false,
    });
  } catch (error) {
    next(error);
  }
};

// ── @route  GET /api/access/my-doctors ─────────────────────────
const getMyDoctors = async (req, res, next) => {
  try {
    const patient = await Patient.findById(req.patient._id)
      .populate('approvedDoctors.doctorId', 'fullName specialization hospital doctorId licenseNumber');
    const activeDoctors = patient.approvedDoctors.filter(
      (d) => d.isActive && (!d.expiresAt || d.expiresAt > new Date())
    );
    res.status(200).json({ success: true, count: activeDoctors.length, doctors: activeDoctors });
  } catch (error) { next(error); }
};

// ── @route  GET /api/access/my-patients ────────────────────────
const getMyPatients = async (req, res, next) => {
  try {
    const doctor = await Doctor.findById(req.doctor._id)
      .populate('approvedPatients.patientId', 'fullName patientId dateOfBirth bloodGroup prescriptions');
    const activePatients = doctor.approvedPatients.filter((p) => p.isActive);
    res.status(200).json({ success: true, count: activePatients.length, patients: activePatients });
  } catch (error) { next(error); }
};

// ── @route  GET /api/access/check/:patientId/:doctorId ─────────
const checkAccess = async (req, res, next) => {
  try {
    const { patientId, doctorId } = req.params;
    const patient = await Patient.findById(patientId);
    if (!patient) return res.status(404).json({ success: false, message: 'Patient not found' });
    const hasAccess = patient.isDoctorApproved(doctorId);
    res.status(200).json({ success: true, hasAccess });
  } catch (error) { next(error); }
};

// ── @route  GET /api/blockchain/status ─────────────────────────
const getBlockchainStatus = async (req, res, next) => {
  try {
    const status = blockchain.getStatus();
    res.status(200).json({ success: true, blockchain: status });
  } catch (error) { next(error); }
};

module.exports = { grantAccess, revokeAccess, getMyDoctors, getMyPatients, checkAccess, getBlockchainStatus };
