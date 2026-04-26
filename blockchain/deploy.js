// scripts/deploy.js — Deploy MedChain contract and save address

const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("\n🚀 Deploying MedChain contract...\n");

  // Get deployer account
  const [deployer] = await ethers.getSigners();
  console.log(`📋 Deployer address: ${deployer.address}`);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`💰 Deployer balance: ${ethers.formatEther(balance)} ETH\n`);

  // Deploy
  const MedChain = await ethers.getContractFactory("MedChain");
  const medchain = await MedChain.deploy();
  await medchain.waitForDeployment();

  const contractAddress = await medchain.getAddress();
  console.log(`✅ MedChain deployed to: ${contractAddress}`);

  // Get network info
  const network = await ethers.provider.getNetwork();
  console.log(`📡 Network: ${network.name} (chainId: ${network.chainId})`);

  // ── Save contract address + ABI for backend use ──────────────
  const deploymentInfo = {
    contractAddress,
    network: network.name,
    chainId: Number(network.chainId),
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
  };

  // Save deployment info
  const deploymentPath = path.join(__dirname, "../deployment.json");
  fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));
  console.log(`\n💾 Deployment info saved to: deployment.json`);

  // Save ABI for backend
  const artifactPath = path.join(
    __dirname,
    "../artifacts/contracts/MedChain.sol/MedChain.json"
  );

  if (fs.existsSync(artifactPath)) {
    const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
    const abiPath = path.join(__dirname, "../MedChainABI.json");
    fs.writeFileSync(abiPath, JSON.stringify(artifact.abi, null, 2));
    console.log(`💾 ABI saved to: MedChainABI.json`);
  }

  // ── Update backend .env with contract address ────────────────
  const backendEnvPath = path.join(__dirname, "../../medchain-backend/.env");
  if (fs.existsSync(backendEnvPath)) {
    let envContent = fs.readFileSync(backendEnvPath, "utf8");
    envContent = envContent.replace(
      /CONTRACT_ADDRESS=.*/,
      `CONTRACT_ADDRESS=${contractAddress}`
    );
    fs.writeFileSync(backendEnvPath, envContent);
    console.log(`✅ Backend .env updated with contract address`);
  }

  console.log("\n══════════════════════════════════════════");
  console.log("  ✅ Deployment Complete!");
  console.log(`  Contract: ${contractAddress}`);
  console.log("  Next: Run 'node scripts/setup-test-accounts.js'");
  console.log("══════════════════════════════════════════\n");
}

main().catch((error) => {
  console.error("Deployment failed:", error);
  process.exit(1);
});
