// scripts/setup-test-accounts.js
// Registers test patient & doctor on the deployed contract

const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("\n🔧 Setting up test accounts on MedChain...\n");

  // Load deployment info
  const deploymentPath = path.join(__dirname, "../deployment.json");
  if (!fs.existsSync(deploymentPath)) {
    throw new Error("deployment.json not found. Run deploy.js first.");
  }
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));

  // Load ABI
  const abiPath = path.join(__dirname, "../MedChainABI.json");
  const abi = JSON.parse(fs.readFileSync(abiPath, "utf8"));

  // Get test signers (Hardhat provides 20 funded accounts)
  const signers = await ethers.getSigners();
  const [owner, patientSigner, doctorSigner] = signers;

  console.log(`Owner:   ${owner.address}`);
  console.log(`Patient: ${patientSigner.address}`);
  console.log(`Doctor:  ${doctorSigner.address}\n`);

  const contract = new ethers.Contract(deployment.contractAddress, abi, owner);

  // Register patient
  const patientTx = await contract
    .connect(patientSigner)
    .registerPatient("PAT-2024-0847");
  await patientTx.wait();
  console.log(`✅ Patient registered | Tx: ${patientTx.hash}`);

  // Register doctor
  const doctorTx = await contract
    .connect(doctorSigner)
    .registerDoctor("DOC-0421");
  await doctorTx.wait();
  console.log(`✅ Doctor registered  | Tx: ${doctorTx.hash}`);

  // Grant access (patient → doctor)
  const grantTx = await contract
    .connect(patientSigner)
    .grantAccess(doctorSigner.address, 0); // 0 = permanent
  await grantTx.wait();
  console.log(`✅ Access granted     | Tx: ${grantTx.hash}`);

  // Verify
  const hasAccess = await contract.hasAccess(
    patientSigner.address,
    doctorSigner.address
  );
  console.log(`\n🔍 Access verified on-chain: ${hasAccess}`);

  // Save test accounts info
  const testAccounts = {
    patient: {
      address: patientSigner.address,
      patientId: "PAT-2024-0847",
    },
    doctor: {
      address: doctorSigner.address,
      doctorId: "DOC-0421",
    },
    contractAddress: deployment.contractAddress,
  };

  fs.writeFileSync(
    path.join(__dirname, "../test-accounts.json"),
    JSON.stringify(testAccounts, null, 2)
  );
  console.log("\n💾 Test accounts saved to test-accounts.json");
  console.log("\n✅ Setup complete!\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
