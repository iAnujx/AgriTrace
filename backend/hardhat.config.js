require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

// Order matters: deployAll.js reads signers as [farmer, distributor, retailer].
const accounts = [
  process.env.FARMER_PRIVATE_KEY,
  process.env.DISTRIBUTOR_PRIVATE_KEY,
  process.env.RETAILER_PRIVATE_KEY,
].filter(Boolean);

module.exports = {
  solidity: {
    version: "0.8.30",
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  networks: {
    sepolia: {
      // put the full URL (with key) in .env, never in source control
      url: process.env.SEPOLIA_RPC_URL || "",
      accounts,
    },
  },
};
