// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title MedChain
 * @dev Privacy-centric healthcare access control on the blockchain.
 *
 * What this contract does:
 * 1. Patients register themselves on-chain
 * 2. Patients grant / revoke doctor access (stored immutably)
 * 3. Prescription file hashes are stored to prove integrity
 * 4. Anyone can verify if a doctor has access to a patient
 * 5. Full audit trail — every action emits an event
 *
 * NO medical data is stored on-chain — only hashes and permissions.
 * Actual data lives in MongoDB (off-chain). The blockchain is the
 * decentralized trust layer.
 */
contract MedChain {

    // ═══════════════════════════════════════════════
    // STRUCTS
    // ═══════════════════════════════════════════════

    struct Patient {
        address wallet;          // Patient's Ethereum wallet address
        string patientId;        // e.g. "PAT-2024-0847" (from MongoDB)
        bool isRegistered;
        uint256 registeredAt;
    }

    struct Doctor {
        address wallet;          // Doctor's Ethereum wallet address
        string doctorId;         // e.g. "DOC-0421"
        bool isRegistered;
        uint256 registeredAt;
    }

    struct AccessRecord {
        address doctor;
        bool isActive;
        uint256 grantedAt;
        uint256 revokedAt;       // 0 if still active
        uint256 expiresAt;       // 0 = permanent
    }

    struct PrescriptionRecord {
        string prescriptionId;   // e.g. "RX-2024-001"
        bytes32 fileHash;        // SHA-256 of the file
        address patient;
        uint256 storedAt;
        bool isActive;
    }

    // ═══════════════════════════════════════════════
    // STATE VARIABLES
    // ═══════════════════════════════════════════════

    address public owner;

    // wallet → Patient info
    mapping(address => Patient) public patients;

    // wallet → Doctor info
    mapping(address => Doctor) public doctors;

    // patient wallet → doctor wallet → AccessRecord
    mapping(address => mapping(address => AccessRecord)) public accessRecords;

    // prescriptionId → PrescriptionRecord
    mapping(string => PrescriptionRecord) public prescriptions;

    // patient wallet → list of prescription IDs
    mapping(address => string[]) public patientPrescriptions;

    // patient wallet → list of doctor wallets they've ever interacted with
    mapping(address => address[]) public patientDoctorList;

    // ═══════════════════════════════════════════════
    // EVENTS — stored permanently on blockchain
    // ═══════════════════════════════════════════════

    event PatientRegistered(
        address indexed patient,
        string patientId,
        uint256 timestamp
    );

    event DoctorRegistered(
        address indexed doctor,
        string doctorId,
        uint256 timestamp
    );

    event AccessGranted(
        address indexed patient,
        address indexed doctor,
        uint256 grantedAt,
        uint256 expiresAt
    );

    event AccessRevoked(
        address indexed patient,
        address indexed doctor,
        uint256 revokedAt
    );

    event PrescriptionStored(
        address indexed patient,
        string prescriptionId,
        bytes32 fileHash,
        uint256 timestamp
    );

    event PrescriptionAccessed(
        address indexed patient,
        address indexed doctor,
        string prescriptionId,
        uint256 timestamp
    );

    // ═══════════════════════════════════════════════
    // MODIFIERS
    // ═══════════════════════════════════════════════

    modifier onlyOwner() {
        require(msg.sender == owner, "MedChain: Only owner can call this");
        _;
    }

    modifier onlyRegisteredPatient() {
        require(patients[msg.sender].isRegistered, "MedChain: Not a registered patient");
        _;
    }

    modifier onlyRegisteredDoctor() {
        require(doctors[msg.sender].isRegistered, "MedChain: Not a registered doctor");
        _;
    }

    // ═══════════════════════════════════════════════
    // CONSTRUCTOR
    // ═══════════════════════════════════════════════

    constructor() {
        owner = msg.sender;
    }

    // ═══════════════════════════════════════════════
    // PATIENT FUNCTIONS
    // ═══════════════════════════════════════════════

    /**
     * @dev Register a patient on-chain.
     * Called once when patient creates account.
     * @param _patientId MongoDB patient ID for cross-reference
     */
    function registerPatient(string calldata _patientId) external {
        require(!patients[msg.sender].isRegistered, "MedChain: Already registered");
        require(bytes(_patientId).length > 0, "MedChain: Patient ID required");

        patients[msg.sender] = Patient({
            wallet: msg.sender,
            patientId: _patientId,
            isRegistered: true,
            registeredAt: block.timestamp
        });

        emit PatientRegistered(msg.sender, _patientId, block.timestamp);
    }

    /**
     * @dev Grant a doctor access to view this patient's records.
     * @param _doctor Doctor's wallet address
     * @param _durationDays 0 = permanent, otherwise days until expiry
     */
    function grantAccess(address _doctor, uint256 _durationDays)
        external
        onlyRegisteredPatient
    {
        require(_doctor != address(0), "MedChain: Invalid doctor address");
        require(doctors[_doctor].isRegistered, "MedChain: Doctor not registered");
        require(_doctor != msg.sender, "MedChain: Cannot grant access to yourself");

        uint256 expiresAt = 0;
        if (_durationDays > 0) {
            expiresAt = block.timestamp + (_durationDays * 1 days);
        }

        // If first time granting to this doctor, add to list
        if (accessRecords[msg.sender][_doctor].grantedAt == 0) {
            patientDoctorList[msg.sender].push(_doctor);
        }

        accessRecords[msg.sender][_doctor] = AccessRecord({
            doctor: _doctor,
            isActive: true,
            grantedAt: block.timestamp,
            revokedAt: 0,
            expiresAt: expiresAt
        });

        emit AccessGranted(msg.sender, _doctor, block.timestamp, expiresAt);
    }

    /**
     * @dev Revoke a doctor's access.
     * @param _doctor Doctor's wallet address
     */
    function revokeAccess(address _doctor) external onlyRegisteredPatient {
        require(
            accessRecords[msg.sender][_doctor].isActive,
            "MedChain: No active access for this doctor"
        );

        accessRecords[msg.sender][_doctor].isActive = false;
        accessRecords[msg.sender][_doctor].revokedAt = block.timestamp;

        emit AccessRevoked(msg.sender, _doctor, block.timestamp);
    }

    /**
     * @dev Check if a doctor currently has valid access to a patient.
     * @param _patient Patient's wallet address
     * @param _doctor Doctor's wallet address
     * @return bool True if doctor has active, non-expired access
     */
    function hasAccess(address _patient, address _doctor)
        external
        view
        returns (bool)
    {
        AccessRecord memory record = accessRecords[_patient][_doctor];

        if (!record.isActive) return false;

        // Check expiry
        if (record.expiresAt != 0 && block.timestamp > record.expiresAt) {
            return false;
        }

        return true;
    }

    // ═══════════════════════════════════════════════
    // PRESCRIPTION FUNCTIONS
    // ═══════════════════════════════════════════════

    /**
     * @dev Store a prescription's file hash on-chain.
     * This proves the file hasn't been tampered with.
     * @param _prescriptionId MongoDB prescription ID
     * @param _fileHash SHA-256 hash of the file (as bytes32)
     */
    function storePrescriptionHash(
        string calldata _prescriptionId,
        bytes32 _fileHash
    ) external onlyRegisteredPatient {
        require(bytes(_prescriptionId).length > 0, "MedChain: Prescription ID required");
        require(_fileHash != bytes32(0), "MedChain: File hash required");
        require(
            prescriptions[_prescriptionId].storedAt == 0,
            "MedChain: Prescription already stored"
        );

        prescriptions[_prescriptionId] = PrescriptionRecord({
            prescriptionId: _prescriptionId,
            fileHash: _fileHash,
            patient: msg.sender,
            storedAt: block.timestamp,
            isActive: true
        });

        patientPrescriptions[msg.sender].push(_prescriptionId);

        emit PrescriptionStored(msg.sender, _prescriptionId, _fileHash, block.timestamp);
    }

    /**
     * @dev Verify that a prescription file hasn't been tampered with.
     * @param _prescriptionId Prescription ID to check
     * @param _fileHash Hash of the file you want to verify
     * @return isValid True if hash matches what was stored
     * @return storedAt When it was stored
     * @return patient Who stored it
     */
    function verifyPrescription(
        string calldata _prescriptionId,
        bytes32 _fileHash
    ) external view returns (bool isValid, uint256 storedAt, address patient) {
        PrescriptionRecord memory record = prescriptions[_prescriptionId];
        return (
            record.fileHash == _fileHash && record.isActive,
            record.storedAt,
            record.patient
        );
    }

    /**
     * @dev Log that a doctor accessed a prescription. Emits an event.
     * @param _patient Patient's wallet address
     * @param _prescriptionId Prescription ID being accessed
     */
    function logPrescriptionAccess(
        address _patient,
        string calldata _prescriptionId
    ) external onlyRegisteredDoctor {
        require(
            this.hasAccess(_patient, msg.sender),
            "MedChain: No access to this patient's records"
        );

        emit PrescriptionAccessed(_patient, msg.sender, _prescriptionId, block.timestamp);
    }

    // ═══════════════════════════════════════════════
    // DOCTOR FUNCTIONS
    // ═══════════════════════════════════════════════

    /**
     * @dev Register a doctor on-chain.
     * @param _doctorId MongoDB doctor ID for cross-reference
     */
    function registerDoctor(string calldata _doctorId) external {
        require(!doctors[msg.sender].isRegistered, "MedChain: Already registered");
        require(bytes(_doctorId).length > 0, "MedChain: Doctor ID required");

        doctors[msg.sender] = Doctor({
            wallet: msg.sender,
            doctorId: _doctorId,
            isRegistered: true,
            registeredAt: block.timestamp
        });

        emit DoctorRegistered(msg.sender, _doctorId, block.timestamp);
    }

    // ═══════════════════════════════════════════════
    // VIEW FUNCTIONS
    // ═══════════════════════════════════════════════

    /**
     * @dev Get all access records for a patient.
     */
    function getPatientDoctors(address _patient)
        external
        view
        returns (address[] memory)
    {
        return patientDoctorList[_patient];
    }

    /**
     * @dev Get all prescriptions stored for a patient.
     */
    function getPatientPrescriptions(address _patient)
        external
        view
        returns (string[] memory)
    {
        return patientPrescriptions[_patient];
    }

    /**
     * @dev Get full access record between patient and doctor.
     */
    function getAccessRecord(address _patient, address _doctor)
        external
        view
        returns (
            bool isActive,
            uint256 grantedAt,
            uint256 revokedAt,
            uint256 expiresAt
        )
    {
        AccessRecord memory r = accessRecords[_patient][_doctor];
        return (r.isActive, r.grantedAt, r.revokedAt, r.expiresAt);
    }

    /**
     * @dev Get a prescription record.
     */
    function getPrescription(string calldata _prescriptionId)
        external
        view
        returns (
            bytes32 fileHash,
            address patient,
            uint256 storedAt,
            bool isActive
        )
    {
        PrescriptionRecord memory r = prescriptions[_prescriptionId];
        return (r.fileHash, r.patient, r.storedAt, r.isActive);
    }
}
