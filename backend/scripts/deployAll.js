// Deploys the whole supply chain and wires the permissions.
//
//   npx hardhat run scripts/deployAll.js --network sepolia
//   npx hardhat run scripts/deployAll.js            (local, in-process network)
//
// Signer order comes from hardhat.config.js:
//   [0] farmerSigner      (FARMER_PRIVATE_KEY)       owns CropTracker
//   [1] distributorSigner (DISTRIBUTOR_PRIVATE_KEY)  deploys distributor
//   [2] retailerSigner    (RETAILER_PRIVATE_KEY)     owns Retailer
const fs = require("fs");
const path = require("path");
const { ethers, network } = require("hardhat");

// Rough minimum so a deploy does not die half way (the 4 deploys + 3 txs are
// well below this on Sepolia). Adjust if gas prices spike.
const MIN_BALANCE = ethers.parseEther("0.01");

async function deployed(label, contract, signer) {
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  console.log(`  ${label.padEnd(12)} ${address}  (deployer: ${signer.address})`);
  return address;
}

async function sendTx(label, txPromise) {
  const tx = await txPromise;
  console.log(`  ${label}\n    tx: ${tx.hash}`);
  const receipt = await tx.wait();
  if (receipt.status !== 1) throw new Error(`${label} failed`);
  console.log(`    mined in block ${receipt.blockNumber}`);
}

async function main() {
  const signers = await ethers.getSigners();
  if (signers.length < 3) {
    throw new Error(
      `Need 3 signers (farmer, distributor, retailer) but got ${signers.length}. ` +
        "Set FARMER_PRIVATE_KEY, DISTRIBUTOR_PRIVATE_KEY and RETAILER_PRIVATE_KEY in .env."
    );
  }
  const [farmerSigner, distributorSigner, retailerSigner] = signers;

  const addrs = new Set(signers.slice(0, 3).map((s) => s.address));
  if (network.name !== "hardhat" && addrs.size !== 3) {
    throw new Error("Farmer, distributor and retailer must be three different accounts.");
  }

  console.log(`Network : ${network.name} (chainId ${(await ethers.provider.getNetwork()).chainId})`);
  console.log("Farmer      :", farmerSigner.address);
  console.log("Distributor :", distributorSigner.address);
  console.log("Retailer    :", retailerSigner.address);

  for (const [name, s] of [
    ["farmer", farmerSigner],
    ["distributor", distributorSigner],
    ["retailer", retailerSigner],
  ]) {
    const bal = await ethers.provider.getBalance(s.address);
    console.log(`Balance ${name.padEnd(11)}: ${ethers.formatEther(bal)} ETH`);
    if (bal < MIN_BALANCE) {
      throw new Error(
        `${name} account ${s.address} has less than ${ethers.formatEther(MIN_BALANCE)} ETH. Fund it first.`
      );
    }
  }

  // ---- deploy ----------------------------------------------------------
  console.log("\n[1-4] Deploying contracts");

  // 1. CropTracker (owner = farmerSigner, only the owner can add registrars)
  const Tracker = await ethers.getContractFactory("CropTracker", farmerSigner);
  const tracker = await Tracker.deploy();
  const trackerAddress = await deployed("CropTracker", tracker, farmerSigner);

  // 2. distributor(tracker): sells stock on to Retailer contracts
  const Distributor = await ethers.getContractFactory("distributor", distributorSigner);
  const distributor = await Distributor.deploy(trackerAddress);
  const distributorAddress = await deployed("distributor", distributor, distributorSigner);

  // 3. Farmer(tracker)
  const Farmer = await ethers.getContractFactory("Farmer", farmerSigner);
  const farmer = await Farmer.deploy(trackerAddress);
  const farmerAddress = await deployed("Farmer", farmer, farmerSigner);

  // 4. Retailer(tracker, distributor) (owner = retailerSigner). The distributor
  //    contract is the only one allowed to log stock after the owner accepts.
  const Retailer = await ethers.getContractFactory("Retailer", retailerSigner);
  const retailer = await Retailer.deploy(trackerAddress, distributorAddress);
  const retailerAddress = await deployed("Retailer", retailer, retailerSigner);

  // 4b. SupplyChainViewer(tracker, Farmer, distributor): read-only, no permissions needed
  const Viewer = await ethers.getContractFactory("SupplyChainViewer", farmerSigner);
  const viewer = await Viewer.deploy(trackerAddress, farmerAddress, distributorAddress);
  const viewerAddress = await deployed("Viewer", viewer, farmerSigner);

  // ---- permissions -----------------------------------------------------
  console.log("\n[5-6] Wiring permissions");

  // 5. Farmer contract may register batches / fragment for farmers
  await sendTx(
    `tracker.setRegistrar(Farmer, true)  [by farmer]`,
    tracker.connect(farmerSigner).setRegistrar(farmerAddress, true)
  );

  // 6. distributor contract may carve fragments for distributor wallets
  //     (distributor.send_batch -> tracker.fragmentFor). The tracker still
  //     checks that the calling wallet owns the fragment.
  await sendTx(
    `tracker.setRegistrar(distributor, true)  [by farmer]`,
    tracker.connect(farmerSigner).setRegistrar(distributorAddress, true)
  );

  // ---- verify the wiring actually landed ---------------------------------
  const checks = {
    "tracker.isRegistrar(Farmer)": await tracker.isRegistrar(farmerAddress),
    "tracker.isRegistrar(Retailer) is OFF (not needed)": !(await tracker.isRegistrar(retailerAddress)),
    "tracker.isRegistrar(distributor)": await tracker.isRegistrar(distributorAddress),
    "distributor.tracker == tracker": (await distributor.tracker()) === trackerAddress,
    "retailer.owner == retailerSigner": (await retailer.owner()) === retailerSigner.address,
    "retailer.distributorAddress == distributor":
      (await retailer.distributorAddress()) === distributorAddress,
    "retailer.cropTrackerAddress == tracker":
      (await retailer.cropTrackerAddress()) === trackerAddress,
    "viewer wired to tracker, Farmer and distributor":
      (await viewer.tracker()) === trackerAddress &&
      (await viewer.farmerContract()) === farmerAddress &&
      (await viewer.distributorContract()) === distributorAddress,
  };
  for (const [k, v] of Object.entries(checks)) {
    console.log(`  ${v ? "OK  " : "FAIL"} ${k}`);
    if (!v) throw new Error(`Post-deploy check failed: ${k}`);
  }

  // ---- 8. summary ------------------------------------------------------
  const out = {
    network: network.name,
    chainId: Number((await ethers.provider.getNetwork()).chainId),
    deployedAt: new Date().toISOString(),
    accounts: {
      farmer: farmerSigner.address,
      distributor: distributorSigner.address,
      retailer: retailerSigner.address,
    },
    contracts: {
      CropTracker: trackerAddress,
      distributor: distributorAddress,
      Farmer: farmerAddress,
      Retailer: retailerAddress,
      SupplyChainViewer: viewerAddress,
    },
  };

  console.log("\n[8] Deployed addresses");
  console.table(out.contracts);

  // the lines the frontend needs in its .env
  const frontendEnv = [
    `VITE_CHAIN_ID=${out.chainId}`,
    `VITE_TRACKER_ADDRESS=${trackerAddress}`,
    `VITE_FARMER_ADDRESS=${farmerAddress}`,
    `VITE_DISTRIBUTOR_ADDRESS=${distributorAddress}`,
    `VITE_VIEWER_ADDRESS=${viewerAddress}`,
    `VITE_RETAILER_ADDRESS=${retailerAddress}`,
  ].join("\n");

  if (network.name !== "hardhat") {
    const dir = path.join(__dirname, "..", "deployments");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${network.name}.json`);
    fs.writeFileSync(file, JSON.stringify(out, null, 2));
    fs.writeFileSync(path.join(dir, `${network.name}.frontend.env`), frontendEnv + "\n");
    console.log(`Saved to ${path.relative(process.cwd(), file)}`);
    console.log(`Frontend settings saved to deployments/${network.name}.frontend.env`);
  }
  console.log("\nPut these lines in the frontend's .env:\n" + frontendEnv);

  console.log(
    "\nRuntime flow (every hop needs a yes from the receiver):\n" +
      "  farmer      Farmer.create_batch -> Farmer.offer_batch(batchId, kg, distributorWallet, price)\n" +
      "  distributor Farmer.get_offers_for_distributor(me) -> Farmer.accept_offer(id)  (or reject_offer)\n" +
      "  distributor distributor.offer_batch(fragmentId, kg, <Retailer address>, price)\n" +
      "  retailer    distributor.get_offers_for_retailer(<Retailer>) -> distributor.accept_offer(id)\n" +
      "              (stock is logged on the shelf automatically)\n" +
      "  retailer    Retailer.set_price -> Retailer.mark_as_final(fragmentId)\n" +
      "  optional    set_auto_accept(...) on Farmer / distributor to skip asking for a trusted sender\n" +
      "  anyone      SupplyChainViewer.getProductDetails(fragmentId)"
);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\nDeployment failed:", err);
    process.exit(1);
  });
