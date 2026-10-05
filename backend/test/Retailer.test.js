const { expect } = require("chai");
const { ethers, network } = require("hardhat");

const Status = { InTransit: 0n, OnShelf: 1n, Finalized: 2n, Damaged: 3n };

describe("Retailer", function () {
  let tracker, distC, farmerC, retailer;
  let trackerAddr, distAddr, farmerAddr, retailerAddr;
  let farmer, distributor, retailerOwner, stranger;

  const PRICE = 30n;

  // ---- helpers -----------------------------------------------------------

  /// become a contract address for one call (Hardhat only)
  async function asContract(addr) {
    await network.provider.send("hardhat_setBalance", [addr, "0x56BC75E2D63100000"]);
    return ethers.getImpersonatedSigner(addr);
  }

  /// farmer harvests `harvest` kg, offers `qty` kg, the distributor accepts
  async function distributorReceives(harvest = 1000, qty = 600) {
    await farmerC.connect(farmer).create_batch("wheat", harvest, 20, "meerut", "2026-09-01", "rabi");
    const batchId = await tracker.batchCount();
    await farmerC.connect(farmer).offer_batch(batchId, qty, distributor.address, 22);
    await farmerC.connect(distributor).accept_offer(await farmerC.offerCount());
    const fragmentId = (await farmerC.offers(await farmerC.offerCount())).fragment_id;
    return { batchId, fragmentId };
  }

  /// the whole permission flow: distributor offers `qty` kg, retailer owner accepts
  async function stockArrives(harvest = 1000, shipped = 600, qty = 200) {
    const { batchId, fragmentId: parent } = await distributorReceives(harvest, shipped);
    await distC.connect(distributor).offer_batch(parent, qty, retailerAddr, PRICE);
    const offerId = await distC.offerCount();
    await distC.connect(retailerOwner).accept_offer(offerId);
    const fragmentId = (await distC.offers(offerId)).fragment_id;
    return { batchId, parent, fragmentId, qty: BigInt(qty) };
  }

  /// a fragment the retailer contract holds but has NOT logged (put there by a
  /// direct tracker call, i.e. NOT through the permission flow)
  async function heldButUnlogged(size = 100) {
    const { batchId, fragmentId: parent } = await distributorReceives();
    await tracker.connect(distributor).fragment(parent, [size], [retailerAddr], [false]);
    return { batchId, parent, fragmentId: (await tracker.fragmentCount()), size: BigInt(size) };
  }

  // ---- setup -------------------------------------------------------------

  beforeEach(async function () {
    [farmer, distributor, retailerOwner, stranger] = await ethers.getSigners();

    tracker = await (await ethers.getContractFactory("CropTracker", farmer)).deploy();
    trackerAddr = await tracker.getAddress();
    distC = await (await ethers.getContractFactory("distributor", distributor)).deploy(trackerAddr);
    distAddr = await distC.getAddress();
    farmerC = await (await ethers.getContractFactory("Farmer", farmer)).deploy(trackerAddr);
    farmerAddr = await farmerC.getAddress();
    retailer = await (
      await ethers.getContractFactory("Retailer", retailerOwner)
    ).deploy(trackerAddr, distAddr);
    retailerAddr = await retailer.getAddress();

    // only the two contracts that act for users need to be registrars
    await tracker.connect(farmer).setRegistrar(farmerAddr, true);
    await tracker.connect(farmer).setRegistrar(distAddr, true);
  });

  // ---- constructor -------------------------------------------------------

  describe("deployment", function () {
    it("sets owner, tracker and distributor contract", async function () {
      expect(await retailer.owner()).to.equal(retailerOwner.address);
      expect(await retailer.cropTrackerAddress()).to.equal(trackerAddr);
      expect(await retailer.distributorAddress()).to.equal(distAddr);
    });

    it("rejects zero tracker, EOA tracker and EOA distributor", async function () {
      const F = await ethers.getContractFactory("Retailer");
      await expect(F.deploy(ethers.ZeroAddress, distAddr)).to.be.revertedWith("Zero tracker");
      await expect(F.deploy(stranger.address, distAddr)).to.be.revertedWith("Tracker not a contract");
      await expect(F.deploy(trackerAddr, stranger.address)).to.be.revertedWith(
        "Distributor not a contract"
      );
    });
  });

  // ---- receive_stock: through the permission flow -------------------------

  describe("receive_stock (after the owner accepts an offer)", function () {
    it("registers inventory as OnShelf and emits StockReceived", async function () {
      const { batchId, fragmentId: parent } = await distributorReceives();
      await distC.connect(distributor).offer_batch(parent, 200, retailerAddr, PRICE);

      // offering alone puts nothing in the inventory
      expect((await retailer.get_all_inventory()).length).to.equal(0);

      await expect(distC.connect(retailerOwner).accept_offer(1))
        .to.emit(retailer, "StockReceived")
        .withArgs(3n, distributor.address, 200n, PRICE);

      const item = await retailer.get_item(3);
      expect(item.fragmentId).to.equal(3n);
      expect(item.batchId).to.equal(batchId);
      expect(item.quantity).to.equal(200n);
      expect(item.distributor).to.equal(distributor.address);
      expect(item.price).to.equal(PRICE);
      expect(item.status).to.equal(Status.OnShelf);
      expect(item.receivedTimestamp).to.be.gt(0n);

      // public mapping + list agree with the getter
      expect((await retailer.inventory(3)).quantity).to.equal(200n);
      expect(await retailer.inventoryList(0)).to.equal(3n);
    });

    it("get_all_inventory returns every received item in order", async function () {
      const a = await stockArrives(1000, 600, 200);
      const b = await stockArrives(500, 300, 100);
      const all = await retailer.get_all_inventory();
      expect(all.length).to.equal(2);
      expect(all[0].fragmentId).to.equal(a.fragmentId);
      expect(all[1].fragmentId).to.equal(b.fragmentId);
      expect(all[1].quantity).to.equal(100n);
    });

    it("get_all_inventory is empty before any stock", async function () {
      expect((await retailer.get_all_inventory()).length).to.equal(0);
    });

    it("an offer the owner rejects never reaches the inventory", async function () {
      const { fragmentId: parent } = await distributorReceives();
      await distC.connect(distributor).offer_batch(parent, 200, retailerAddr, PRICE);
      await distC.connect(retailerOwner).reject_offer(1);
      expect((await retailer.get_all_inventory()).length).to.equal(0);
      await expect(retailer.get_item(3)).to.be.revertedWith("Item not found");
    });
  });

  // ---- receive_stock: who may call it and what it re-checks --------------

  describe("receive_stock protection", function () {
    it("nobody but the distributor contract can call it, not even the owner", async function () {
      const s = await heldButUnlogged();
      for (const who of [retailerOwner, stranger, distributor, farmer]) {
        await expect(
          retailer.connect(who).receive_stock(s.fragmentId, s.batchId, s.size, distributor.address, PRICE)
        ).to.be.revertedWith("Only distributor contract");
      }
      expect((await retailer.get_all_inventory()).length).to.equal(0);
    });

    describe("re-checks every claim against CropTracker (called as the distributor contract)", function () {
      let asDist;
      beforeEach(async function () {
        asDist = await asContract(distAddr);
      });

      const call = (s, o = {}) =>
        retailer
          .connect(asDist)
          .receive_stock(
            o.fragmentId ?? s.fragmentId,
            o.batchId ?? s.batchId,
            o.qty ?? s.size,
            o.distributor ?? distributor.address,
            PRICE
          );

      it("accepts a correct claim", async function () {
        const s = await heldButUnlogged();
        await expect(call(s)).to.emit(retailer, "StockReceived");
      });

      it("reverts when the fragment is not held by the retailer", async function () {
        const { fragmentId, batchId } = await distributorReceives(); // held by the distributor wallet
        await expect(
          retailer.connect(asDist).receive_stock(fragmentId, batchId, 600, distributor.address, PRICE)
        ).to.be.revertedWith("Fragment not held by retailer");
      });

      it("reverts for an unknown fragment", async function () {
        const s = await heldButUnlogged();
        await expect(call(s, { fragmentId: 9999n })).to.be.revertedWith("Fragment not found");
      });

      it("reverts on batch id mismatch and on quantity mismatch (cannot inflate stock)", async function () {
        const s = await heldButUnlogged();
        await expect(call(s, { batchId: s.batchId + 1n })).to.be.revertedWith("Batch id mismatch");
        await expect(call(s, { qty: s.size + 1n })).to.be.revertedWith("Quantity mismatch");
      });

      it("reverts on zero quantity and zero distributor", async function () {
        const s = await heldButUnlogged();
        await expect(call(s, { qty: 0n })).to.be.revertedWith("Quantity must be > 0");
        await expect(call(s, { distributor: ethers.ZeroAddress })).to.be.revertedWith("Zero distributor");
      });

      it("reverts when the same fragment is logged twice", async function () {
        const s = await heldButUnlogged();
        await call(s);
        await expect(call(s)).to.be.revertedWith("Fragment already received");
      });

      it("reverts when the retailer already split the fragment", async function () {
        const s = await heldButUnlogged(100);
        const asRetailer = await asContract(retailerAddr);
        await tracker.connect(asRetailer).fragment(s.fragmentId, [10], [stranger.address], [true]);
        await expect(call(s)).to.be.revertedWith("Fragment already split");
      });
    });
  });

  // ---- set_price ---------------------------------------------------------

  describe("set_price", function () {
    it("owner changes the shelf price; it starts as the distributor's price", async function () {
      const s = await stockArrives();
      expect((await retailer.get_item(s.fragmentId)).price).to.equal(PRICE);
      await expect(retailer.connect(retailerOwner).set_price(s.fragmentId, 45))
        .to.emit(retailer, "StockPriceChanged")
        .withArgs(s.fragmentId, 45n);
      expect((await retailer.get_item(s.fragmentId)).price).to.equal(45n);
    });

    it("reverts for non-owner, unknown stock and stock no longer on the shelf", async function () {
      const s = await stockArrives();
      await expect(retailer.connect(stranger).set_price(s.fragmentId, 1)).to.be.revertedWith("Not owner");
      await expect(retailer.connect(retailerOwner).set_price(777, 1)).to.be.revertedWith("Item not found");
      await retailer.connect(retailerOwner).mark_as_final(s.fragmentId);
      await expect(retailer.connect(retailerOwner).set_price(s.fragmentId, 1)).to.be.revertedWith(
        "Item not on shelf"
      );
    });
  });

  // ---- mark_as_final -----------------------------------------------------

  describe("mark_as_final", function () {
    it("sets Finalized, sets DF on CropTracker and emits StockFinalized", async function () {
      const s = await stockArrives();

      let frag = await tracker.getFragment(s.fragmentId);
      expect(frag.df).to.equal(false);
      expect(frag.mf).to.equal(true);

      const tx = retailer.connect(retailerOwner).mark_as_final(s.fragmentId);
      await expect(tx).to.emit(tracker, "FragmentFinalized").withArgs(s.fragmentId);
      await expect(tx).to.emit(retailer, "StockFinalized");

      expect((await retailer.get_item(s.fragmentId)).status).to.equal(Status.Finalized);
      frag = await tracker.getFragment(s.fragmentId);
      expect(frag.df).to.equal(true);
      expect(frag.mf).to.equal(false);
    });

    it("reverts with onlyOwner for any other caller", async function () {
      const s = await stockArrives();
      await expect(retailer.connect(stranger).mark_as_final(s.fragmentId)).to.be.revertedWith("Not owner");
      await expect(retailer.connect(distributor).mark_as_final(s.fragmentId)).to.be.revertedWith("Not owner");
      expect((await retailer.get_item(s.fragmentId)).status).to.equal(Status.OnShelf);
      expect((await tracker.getFragment(s.fragmentId)).df).to.equal(false);
    });

    it("reverts for unknown stock", async function () {
      await expect(retailer.connect(retailerOwner).mark_as_final(42)).to.be.revertedWith("Item not found");
    });

    it("cannot be finalized twice", async function () {
      const s = await stockArrives();
      await retailer.connect(retailerOwner).mark_as_final(s.fragmentId);
      await expect(retailer.connect(retailerOwner).mark_as_final(s.fragmentId)).to.be.revertedWith(
        "Item not on shelf"
      );
    });

    it("cannot finalize damaged stock", async function () {
      const s = await stockArrives();
      await retailer.connect(retailerOwner).report_damaged(s.fragmentId, "rotten");
      await expect(retailer.connect(retailerOwner).mark_as_final(s.fragmentId)).to.be.revertedWith(
        "Item not on shelf"
      );
    });

    it("works when the distributor already shipped the fragment as final (DF)", async function () {
      const { batchId, fragmentId: parent } = await distributorReceives();
      // a final unit put straight into the retailer's hands (direct tracker call)
      await tracker.connect(distributor).fragment(parent, [150], [retailerAddr], [true]);
      const childId = await tracker.fragmentCount();
      expect((await tracker.getFragment(childId)).df).to.equal(true);

      const asDist = await asContract(distAddr);
      await retailer.connect(asDist).receive_stock(childId, batchId, 150, distributor.address, PRICE);
      await expect(retailer.connect(retailerOwner).mark_as_final(childId)).to.emit(retailer, "StockFinalized");
      expect((await retailer.get_item(childId)).status).to.equal(Status.Finalized);
    });
  });

  // ---- report_damaged ----------------------------------------------------

  describe("report_damaged", function () {
    it("sets Damaged and emits the reason", async function () {
      const s = await stockArrives();
      await expect(retailer.connect(retailerOwner).report_damaged(s.fragmentId, "Water damage in transit"))
        .to.emit(retailer, "StockReportedDamaged")
        .withArgs(s.fragmentId, "Water damage in transit");
      expect((await retailer.get_item(s.fragmentId)).status).to.equal(Status.Damaged);
      expect((await tracker.getFragment(s.fragmentId)).df).to.equal(false); // tracker untouched
    });

    it("reverts for non-owner", async function () {
      const s = await stockArrives();
      await expect(retailer.connect(stranger).report_damaged(s.fragmentId, "x")).to.be.revertedWith(
        "Not owner"
      );
    });

    it("reverts for unknown stock, empty reason and repeat reports", async function () {
      const s = await stockArrives();
      await expect(retailer.connect(retailerOwner).report_damaged(777, "x")).to.be.revertedWith(
        "Item not found"
      );
      await expect(retailer.connect(retailerOwner).report_damaged(s.fragmentId, "")).to.be.revertedWith(
        "Reason required"
      );
      await retailer.connect(retailerOwner).report_damaged(s.fragmentId, "mold");
      await expect(
        retailer.connect(retailerOwner).report_damaged(s.fragmentId, "mold again")
      ).to.be.revertedWith("Item not on shelf");
    });

    it("cannot damage already finalized stock", async function () {
      const s = await stockArrives();
      await retailer.connect(retailerOwner).mark_as_final(s.fragmentId);
      await expect(retailer.connect(retailerOwner).report_damaged(s.fragmentId, "too late")).to.be.revertedWith(
        "Item not on shelf"
      );
    });
  });

  describe("get_item", function () {
    it("reverts for an item that was never received", async function () {
      await expect(retailer.get_item(1)).to.be.revertedWith("Item not found");
    });
  });

  // ---- end to end --------------------------------------------------------

  describe("end-to-end", function () {
    it("create_batch -> offer -> accept -> offer -> accept -> mark_as_final, every hop needs a yes", async function () {
      // 1. farmer registers 1000kg
      await expect(
        farmerC.connect(farmer).create_batch("wheat", 1000, 20, "meerut", "2026-09-01", "rabi")
      ).to.emit(farmerC, "batchregistered");
      const batchId = await tracker.batchCount();
      const root = await farmerC.batch_root_fragment(batchId);

      // 2. farmer offers 600kg; nothing moves until the distributor accepts
      await farmerC.connect(farmer).offer_batch(batchId, 600, distributor.address, 22);
      expect(await tracker.remaining(root)).to.equal(1000n);
      await expect(farmerC.connect(distributor).accept_offer(1)).to.emit(farmerC, "batchsent");
      const parent = (await tracker.getChildren(root))[0];
      expect((await tracker.getFragment(parent)).owner).to.equal(distributor.address);
      expect(await tracker.remaining(root)).to.equal(400n);

      // 3. distributor offers 250kg to the shop; again nothing moves
      await distC.connect(distributor).offer_batch(parent, 250, retailerAddr, 31);
      expect(await tracker.remaining(parent)).to.equal(600n);
      expect((await retailer.get_all_inventory()).length).to.equal(0);

      // 4. the shop's owner accepts: fragment is carved AND logged in one go
      await expect(distC.connect(retailerOwner).accept_offer(1))
        .to.emit(retailer, "StockReceived")
        .withArgs(3n, distributor.address, 250n, 31n);
      const fragmentId = 3n;
      expect((await tracker.getFragment(fragmentId)).owner).to.equal(retailerAddr);
      expect(await tracker.remaining(parent)).to.equal(350n);
      expect((await retailer.get_item(fragmentId)).status).to.equal(Status.OnShelf);

      // 5. shop sets its own price and finalizes the unit
      await retailer.connect(retailerOwner).set_price(fragmentId, 40);
      await expect(retailer.connect(retailerOwner).mark_as_final(fragmentId)).to.emit(retailer, "StockFinalized");
      expect((await retailer.get_item(fragmentId)).status).to.equal(Status.Finalized);

      // 6. anti-counterfeit: label verifies and lineage reaches the farmer
      const frag = await tracker.getFragment(fragmentId);
      expect(frag.df).to.equal(true);
      expect(await tracker.verifyFragment(fragmentId, batchId, frag.offset, frag.size)).to.equal(true);
      const lineage = await tracker.getLineage(fragmentId);
      expect(lineage.map((f) => Number(f.id))).to.deep.equal([3, 2, 1]);
      expect(lineage[2].farmer).to.equal(farmer.address);

      // a finalized unit can no longer be split (and an outsider could not anyway)
      await expect(
        tracker.connect(retailerOwner).fragment(fragmentId, [1], [stranger.address], [true])
      ).to.be.reverted;

      // the distributor still holds 350kg and can keep selling it
      await distC.connect(distributor).offer_batch(parent, 350, retailerAddr, 31);
      await distC.connect(retailerOwner).accept_offer(2);
      expect(await tracker.remaining(parent)).to.equal(0n);
    });

    it("auto_accept on both hops: one offer each and the stock is on the shelf", async function () {
      await farmerC.connect(distributor).set_auto_accept(farmer.address, true);
      await distC.connect(retailerOwner).set_auto_accept(retailerAddr, distributor.address, true);

      await farmerC.connect(farmer).create_batch("wheat", 1000, 20, "meerut", "2026-09-01", "rabi");
      await farmerC.connect(farmer).offer_batch(1, 600, distributor.address, 22); // lands at d: fragment 2
      await distC.connect(distributor).offer_batch(2, 250, retailerAddr, 31); // lands at shop: fragment 3

      const item = await retailer.get_item(3);
      expect(item.status).to.equal(Status.OnShelf);
      expect(item.quantity).to.equal(250n);
      await retailer.connect(retailerOwner).mark_as_final(3);
      expect((await tracker.getFragment(3)).df).to.equal(true);
    });
  });
});
