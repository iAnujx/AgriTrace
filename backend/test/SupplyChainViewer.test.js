const { expect } = require("chai");
const { ethers } = require("hardhat");

const Status = { InTransit: 0n, OnShelf: 1n, Finalized: 2n, Damaged: 3n };

describe("SupplyChainViewer", function () {
  let tracker, distC, farmerC, retailer, viewer;
  let trackerAddr, distAddr, farmerAddr, retailerAddr, viewerAddr;
  let farmer, distributor, retailerOwner, stranger;
  let batchId, shipped, lot; // fragment ids

  beforeEach(async function () {
    [farmer, distributor, retailerOwner, stranger] = await ethers.getSigners();

    tracker = await (await ethers.getContractFactory("CropTracker", farmer)).deploy();
    trackerAddr = await tracker.getAddress();
    distC = await (await ethers.getContractFactory("distributor", distributor)).deploy(trackerAddr);
    distAddr = await distC.getAddress();
    farmerC = await (await ethers.getContractFactory("Farmer", farmer)).deploy(trackerAddr);
    farmerAddr = await farmerC.getAddress();
    retailer = await (await ethers.getContractFactory("Retailer", retailerOwner)).deploy(trackerAddr, distAddr);
    retailerAddr = await retailer.getAddress();
    viewer = await (await ethers.getContractFactory("SupplyChainViewer", stranger)).deploy(
      trackerAddr,
      farmerAddr,
      distAddr
    );
    viewerAddr = await viewer.getAddress();

    await tracker.connect(farmer).setRegistrar(farmerAddr, true);
    await tracker.connect(farmer).setRegistrar(distAddr, true);

    // farmer: 1000kg -> offers 600kg, distributor accepts (fragment 2)
    await farmerC.connect(farmer).create_batch("wheat", 1000, 20, "meerut", "2026-09-01", "rabi");
    batchId = await tracker.batchCount();
    await farmerC.connect(farmer).offer_batch(batchId, 600, distributor.address, 22);
    await farmerC.connect(distributor).accept_offer(1);
    shipped = 2n;

    // distributor offers 200kg to the shop, the shop's owner accepts (fragment 3, logged on the shelf)
    await distC.connect(distributor).offer_batch(shipped, 200, retailerAddr, 28);
    await distC.connect(retailerOwner).accept_offer(1);
    lot = 3n;
  });

  describe("deployment", function () {
    it("stores tracker and farmer addresses", async function () {
      expect(await viewer.tracker()).to.equal(trackerAddr);
      expect(await viewer.farmerContract()).to.equal(farmerAddr);
      expect(await viewer.distributorContract()).to.equal(distAddr);
    });

    it("rejects non-contract addresses", async function () {
      const F = await ethers.getContractFactory("SupplyChainViewer");
      await expect(F.deploy(stranger.address, farmerAddr, distAddr)).to.be.revertedWith("Tracker not a contract");
      await expect(F.deploy(trackerAddr, stranger.address, distAddr)).to.be.revertedWith("Farmer not a contract");
      await expect(F.deploy(trackerAddr, farmerAddr, stranger.address)).to.be.revertedWith("Distributor not a contract");
    });

    it("has no write functions", async function () {
      const writes = viewer.interface.fragments.filter(
        (f) => f.type === "function" && !["view", "pure"].includes(f.stateMutability)
      );
      expect(writes.length).to.equal(0);
    });
  });

  describe("getProductDetails", function () {
    it("lot accepted by the retailer: lineage + origin + shelf info", async function () {
      const d = await viewer.getProductDetails(lot);

      expect(d.fragment.id).to.equal(lot);
      expect(d.fragment.size).to.equal(200n);
      expect(d.fragment.owner).to.equal(retailerAddr);
      expect(d.unallocated).to.equal(200n);

      expect(d.lineage.map((f) => Number(f.id))).to.deep.equal([3, 2, 1]);
      expect(d.custody.length).to.equal(1);

      expect(d.origin.found).to.equal(true);
      expect(d.origin.farmer).to.equal(farmer.address);
      expect(d.origin.cropName).to.equal("wheat");
      expect(d.origin.cropType).to.equal("rabi");
      expect(d.origin.farmLocation).to.equal("meerut");
      expect(d.origin.harvestDate).to.equal("2026-09-01");
      expect(d.origin.expectedPricePerKg).to.equal(20n);

      expect(d.retail.atRetailer).to.equal(true);
      expect(d.retail.status).to.equal(Status.OnShelf);
    });

    it("a pending offer shows nothing at the retailer yet", async function () {
      await distC.connect(distributor).offer_batch(shipped, 100, retailerAddr, 30); // offer 2, not accepted
      // the offered kg are still the distributor's: fragment 4 does not exist
      await expect(viewer.getProductDetails(4)).to.be.revertedWith("Fragment not found");
      expect((await viewer.getProductDetails(shipped)).unallocated).to.equal(400n);
    });

    it("follows the retailer's price and finalizing", async function () {
      let d = await viewer.getProductDetails(lot);
      expect(d.retail.atRetailer).to.equal(true);
      expect(d.retail.retailer).to.equal(retailerAddr);
      expect(d.retail.distributor).to.equal(distributor.address);
      expect(d.retail.price).to.equal(28n); // what the distributor charged

      await retailer.connect(retailerOwner).set_price(lot, 35);
      d = await viewer.getProductDetails(lot);
      expect(d.retail.price).to.equal(35n);
      expect(d.retail.status).to.equal(Status.OnShelf);
      expect(d.fragment.df).to.equal(false);

      await retailer.connect(retailerOwner).mark_as_final(lot);
      d = await viewer.getProductDetails(lot);
      expect(d.retail.status).to.equal(Status.Finalized);
      expect(d.fragment.df).to.equal(true);
      expect(d.fragment.mf).to.equal(false);

    });

    it("shows Damaged status", async function () {
      await retailer.connect(retailerOwner).report_damaged(lot, "water damage");
      const d = await viewer.getProductDetails(lot);
      expect(d.retail.status).to.equal(Status.Damaged);
    });

    it("in-between lot held by a distributor wallet: no retail info, remainder shown", async function () {
      const d = await viewer.getProductDetails(shipped);
      expect(d.fragment.owner).to.equal(distributor.address);
      expect(d.unallocated).to.equal(400n); // 600 - 200 carved
      expect(d.retail.atRetailer).to.equal(false);
      expect(d.lineage.map((f) => Number(f.id))).to.deep.equal([2, 1]);
    });

    it("root batch: farmer still holds the unsent part", async function () {
      const d = await viewer.getProductDetails(1);
      expect(d.fragment.owner).to.equal(farmer.address);
      expect(d.fragment.size).to.equal(1000n);
      expect(d.unallocated).to.equal(400n);
      expect(d.lineage.length).to.equal(1);
      expect(d.origin.cropName).to.equal("wheat");
    });

    it("custody history follows transfers", async function () {
      await tracker.connect(distributor).transferFragment(shipped, stranger.address);
      const d = await viewer.getProductDetails(shipped);
      expect(d.custody.map((c) => c.holder)).to.deep.equal([distributor.address, stranger.address]);
    });

    it("origin.found = false when the batch has no Farmer record", async function () {
      await tracker.connect(farmer).setRegistrar(farmer.address, true);
      await tracker.connect(farmer).registerBatch(stranger.address, 50); // fragment 4, bypasses Farmer
      const d = await viewer.getProductDetails(4);
      expect(d.origin.found).to.equal(false);
      expect(d.origin.farmer).to.equal(stranger.address);
      expect(d.origin.cropName).to.equal("");
    });

    it("hopPrices: price at every hand-over, farmer price then distributor price", async function () {
      const d = await viewer.getProductDetails(lot);
      // lineage = [lot(3), shipped(2), root(1)]
      expect(d.hopPrices.map(Number)).to.deep.equal([28, 22, 0]);
    });

    it("hopPrices is 0 for a fragment carved straight in the tracker (no price recorded)", async function () {
      await tracker.connect(distributor).fragment(shipped, [50], [stranger.address], [false]); // fragment 4
      const d = await viewer.getProductDetails(4);
      expect(d.hopPrices.map(Number)).to.deep.equal([0, 22, 0]);
    });

    it("reverts for an unknown fragment", async function () {
      await expect(viewer.getProductDetails(999)).to.be.revertedWith("Fragment not found");
    });
  });

  describe("hostile holder contract", function () {
    it("does not break the view when the holder returns garbage / reverts", async function () {
      // viewer itself is a contract with no get_item(): its call reverts -> ignored
      await tracker.connect(distributor).transferFragment(shipped, viewerAddr);
      const d = await viewer.getProductDetails(shipped);
      expect(d.fragment.owner).to.equal(viewerAddr);
      expect(d.retail.atRetailer).to.equal(false);
    });

    it("ignores a holder that answers for a different fragment id", async function () {
      // Retailer holds fragment 3 but the item is logged under id 3 only;
      // asking the retailer about a fragment it does not list must not report stock
      await tracker.connect(distributor).fragment(shipped, [100], [retailerAddr], [false]); // fragment 4, not logged
      const d = await viewer.getProductDetails(4);
      expect(d.retail.atRetailer).to.equal(false);
    });
  });

  describe("verifyLabel", function () {
    it("passes genuine labels and rejects forged ones", async function () {
      const f = await tracker.getFragment(lot);
      expect(await viewer.verifyLabel(lot, batchId, f.offset, f.size)).to.equal(true);
      expect(await viewer.verifyLabel(lot, batchId, f.offset, f.size + 1n)).to.equal(false);
      expect(await viewer.verifyLabel(lot, batchId + 1n, f.offset, f.size)).to.equal(false);
      expect(await viewer.verifyLabel(999, batchId, 0, 1)).to.equal(false);
    });
  });
});
