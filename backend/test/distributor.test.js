const { expect } = require("chai");
const { ethers } = require("hardhat");

const Offer = { Pending: 0n, Accepted: 1n, Rejected: 2n, Cancelled: 3n };
const Status = { OnShelf: 1n };

describe("distributor: offers to a Retailer", function () {
  let tracker, dist, farmerC, retailer, retailer2;
  let trackerAddr, distAddr, retailerAddr, retailer2Addr;
  let farmer, d1, d2, ro1, ro2, stranger;
  let batchId;
  const SHIPPED = 2n; // 600kg fragment held by d1

  beforeEach(async function () {
    [farmer, d1, d2, ro1, ro2, stranger] = await ethers.getSigners();

    tracker = await (await ethers.getContractFactory("CropTracker", farmer)).deploy();
    trackerAddr = await tracker.getAddress();
    dist = await (await ethers.getContractFactory("distributor", d1)).deploy(trackerAddr);
    distAddr = await dist.getAddress();
    farmerC = await (await ethers.getContractFactory("Farmer", farmer)).deploy(trackerAddr);
    const R = await ethers.getContractFactory("Retailer");
    retailer = await R.connect(ro1).deploy(trackerAddr, distAddr);
    retailer2 = await R.connect(ro2).deploy(trackerAddr, distAddr);
    retailerAddr = await retailer.getAddress();
    retailer2Addr = await retailer2.getAddress();

    await tracker.connect(farmer).setRegistrar(await farmerC.getAddress(), true);
    await tracker.connect(farmer).setRegistrar(distAddr, true);

    // farmer -> d1: 600kg of a 1000kg batch (offer + accept)
    await farmerC.connect(farmer).create_batch("wheat", 1000, 20, "meerut", "2026-09-01", "rabi");
    batchId = await tracker.batchCount();
    await farmerC.connect(farmer).offer_batch(batchId, 600, d1.address, 22);
    await farmerC.connect(d1).accept_offer(1);
  });

  describe("deployment", function () {
    it("stores the tracker", async function () {
      expect(await dist.tracker()).to.equal(trackerAddr);
    });

    it("rejects zero / non-contract tracker", async function () {
      const F = await ethers.getContractFactory("distributor");
      await expect(F.deploy(ethers.ZeroAddress)).to.be.revertedWith("Zero tracker");
      await expect(F.deploy(stranger.address)).to.be.revertedWith("Tracker not a contract");
    });
  });

  // ------------------------------------------------------------ offer_batch
  describe("offer_batch", function () {
    it("creates a PENDING offer and moves nothing", async function () {
      await expect(dist.connect(d1).offer_batch(SHIPPED, 200, retailerAddr, 28))
        .to.emit(dist, "batchoffered")
        .withArgs(1, SHIPPED, d1.address, retailerAddr, 200, 28);

      const o = await dist.offers(1);
      expect(o.sender).to.equal(d1.address);
      expect(o.retailer).to.equal(retailerAddr);
      expect(o.parent_fragment_id).to.equal(SHIPPED);
      expect(o.batch_id).to.equal(batchId);
      expect(o.quantity).to.equal(200);
      expect(o.price).to.equal(28);
      expect(o.status).to.equal(Offer.Pending);
      expect(o.fragment_id).to.equal(0);

      expect(await tracker.fragmentCount()).to.equal(2); // no new fragment
      expect(await tracker.remaining(SHIPPED)).to.equal(600);
      expect((await retailer.get_all_inventory()).length).to.equal(0);
    });

    it("rejects zero quantity, zero / EOA retailer", async function () {
      await expect(dist.connect(d1).offer_batch(SHIPPED, 0, retailerAddr, 1)).to.be.revertedWith(
        "Quantity must be > 0"
      );
      await expect(
        dist.connect(d1).offer_batch(SHIPPED, 10, ethers.ZeroAddress, 1)
      ).to.be.revertedWith("Zero retailer");
      await expect(dist.connect(d1).offer_batch(SHIPPED, 10, stranger.address, 1)).to.be.revertedWith(
        "Retailer must be a contract"
      );
    });

    it("rejects unknown fragment, someone else's fragment, too much, and a final fragment", async function () {
      await expect(dist.connect(d1).offer_batch(999, 10, retailerAddr, 1)).to.be.revertedWith(
        "Fragment not found"
      );
      await expect(dist.connect(d2).offer_batch(SHIPPED, 10, retailerAddr, 1)).to.be.revertedWith(
        "Not fragment owner"
      );
      await expect(dist.connect(stranger).offer_batch(SHIPPED, 10, retailerAddr, 1)).to.be.revertedWith(
        "Not fragment owner"
      );
      await expect(dist.connect(d1).offer_batch(SHIPPED, 601, retailerAddr, 1)).to.be.revertedWith(
        "Exceeds fragment size"
      );

      await tracker.connect(d1).fragment(SHIPPED, [10], [d1.address], [true]); // fragment 3, final
      await expect(dist.connect(d1).offer_batch(3, 5, retailerAddr, 1)).to.be.revertedWith(
        "DF set: cannot fragment"
      );
    });

    it("offer views list by sender and by retailer (every status)", async function () {
      await dist.connect(d1).offer_batch(SHIPPED, 100, retailerAddr, 1); // 1
      await dist.connect(d1).offer_batch(SHIPPED, 100, retailer2Addr, 1); // 2
      await dist.connect(ro1).reject_offer(1);

      const bySender = await dist.get_offers_by_sender(d1.address);
      expect(bySender.map((o) => Number(o.id))).to.deep.equal([1, 2]);
      expect((await dist.get_offers_by_sender(d2.address)).length).to.equal(0);

      const forR1 = await dist.get_offers_for_retailer(retailerAddr);
      expect(forR1.map((o) => Number(o.id))).to.deep.equal([1]);
      expect(forR1[0].status).to.equal(Offer.Rejected);
      const forR2 = await dist.get_offers_for_retailer(retailer2Addr);
      expect(forR2.map((o) => Number(o.status))).to.deep.equal([0]);
    });
  });

  // ----------------------------------------------------------- accept_offer
  describe("accept_offer", function () {
    beforeEach(async function () {
      await dist.connect(d1).offer_batch(SHIPPED, 200, retailerAddr, 28); // offer 1
    });

    it("hands the stock over and logs it in the Retailer inventory", async function () {
      await expect(dist.connect(ro1).accept_offer(1))
        .to.emit(dist, "batchforwarded")
        .withArgs(batchId, SHIPPED, 3, retailerAddr, 200, 28)
        .and.to.emit(retailer, "StockReceived")
        .withArgs(3, d1.address, 200, 28);

      const f = await tracker.getFragment(3);
      expect(f.owner).to.equal(retailerAddr);
      expect(f.size).to.equal(200);
      expect(f.parentId).to.equal(SHIPPED);
      expect(f.identification).to.equal(batchId);
      expect(f.df).to.equal(false); // retailer finalizes later
      expect(f.mf).to.equal(true);

      // distributor kept the rest
      expect(await tracker.remaining(SHIPPED)).to.equal(400);
      expect((await tracker.getFragment(SHIPPED)).owner).to.equal(d1.address);

      const o = await dist.offers(1);
      expect(o.status).to.equal(Offer.Accepted);
      expect(o.fragment_id).to.equal(3);
      expect(await dist.fragment_sale_price(3)).to.equal(28);

      const item = await retailer.get_item(3);
      expect(item.status).to.equal(Status.OnShelf);
      expect(item.quantity).to.equal(200);
      expect(item.distributor).to.equal(d1.address);
      expect(item.price).to.equal(28);
      expect(item.batchId).to.equal(batchId);
    });

    it("only the Retailer's owner can accept", async function () {
      await expect(dist.connect(d1).accept_offer(1)).to.be.revertedWith("Not the retailer owner"); // not even the sender
      await expect(dist.connect(ro2).accept_offer(1)).to.be.revertedWith("Not the retailer owner"); // other shop
      await expect(dist.connect(stranger).accept_offer(1)).to.be.revertedWith("Not the retailer owner");
      expect((await dist.offers(1)).status).to.equal(Offer.Pending);
      expect(await tracker.remaining(SHIPPED)).to.equal(600);
    });

    it("cannot be accepted twice, after reject / cancel, or if it does not exist", async function () {
      await dist.connect(ro1).accept_offer(1);
      await expect(dist.connect(ro1).accept_offer(1)).to.be.revertedWith("Offer not pending");
      await expect(dist.connect(ro1).accept_offer(99)).to.be.revertedWith("Offer not found");

      await dist.connect(d1).offer_batch(SHIPPED, 10, retailerAddr, 1); // 2
      await dist.connect(ro1).reject_offer(2);
      await expect(dist.connect(ro1).accept_offer(2)).to.be.revertedWith("Offer not pending");

      await dist.connect(d1).offer_batch(SHIPPED, 10, retailerAddr, 1); // 3
      await dist.connect(d1).cancel_offer(3);
      await expect(dist.connect(ro1).accept_offer(3)).to.be.revertedWith("Offer not pending");
    });

    it("sibling fragments get contiguous, non-overlapping ranges", async function () {
      await dist.connect(d1).offer_batch(SHIPPED, 300, retailer2Addr, 29); // offer 2
      await dist.connect(ro1).accept_offer(1);
      await dist.connect(ro2).accept_offer(2);
      const a = await tracker.getFragment(3);
      const b = await tracker.getFragment(4);
      expect(b.offset).to.equal(a.offset + a.size);
      expect(b.owner).to.equal(retailer2Addr);
      expect(await tracker.remaining(SHIPPED)).to.equal(100);
    });

    it("over-offered stock: the offer that no longer fits fails and stays pending", async function () {
      await dist.connect(d1).offer_batch(SHIPPED, 500, retailer2Addr, 1); // offer 2 (500 <= 600 alone)
      await dist.connect(ro1).accept_offer(1); // 200 gone, 400 left
      await expect(dist.connect(ro2).accept_offer(2)).to.be.revertedWith("Exceeds fragment size");
      expect((await dist.offers(2)).status).to.equal(Offer.Pending);
    });

    it("fails if the sender moved the stock away after offering", async function () {
      await tracker.connect(d1).transferFragment(SHIPPED, d2.address);
      await expect(dist.connect(ro1).accept_offer(1)).to.be.revertedWith("Not fragment owner");
      expect((await dist.offers(1)).status).to.equal(Offer.Pending);
    });

    it("fails (and changes nothing) if the distributor contract lost its registrar role", async function () {
      await tracker.connect(farmer).setRegistrar(distAddr, false);
      await expect(dist.connect(ro1).accept_offer(1)).to.be.revertedWith("Not registrar");
      expect((await dist.offers(1)).status).to.equal(Offer.Pending);
      expect(await tracker.remaining(SHIPPED)).to.equal(600);
    });

    it("is all-or-nothing: a Retailer wired to another distributor contract cannot log it, so nothing moves", async function () {
      // misconfigured shop: its distributorAddress is the tracker, not this contract
      const bad = await (await ethers.getContractFactory("Retailer", ro1)).deploy(trackerAddr, trackerAddr);
      await dist.connect(d1).offer_batch(SHIPPED, 50, await bad.getAddress(), 1); // offer 2
      await expect(dist.connect(ro1).accept_offer(2)).to.be.revertedWith("Only distributor contract");
      expect((await dist.offers(2)).status).to.equal(Offer.Pending);
      expect(await tracker.remaining(SHIPPED)).to.equal(600);
      expect(await tracker.fragmentCount()).to.equal(2);
    });
  });

  // ------------------------------------------------------- reject / cancel
  describe("reject_offer / cancel_offer", function () {
    beforeEach(async function () {
      await dist.connect(d1).offer_batch(SHIPPED, 200, retailerAddr, 28); // offer 1
    });

    it("retailer owner can reject: nothing moves and the stock can be offered again", async function () {
      await expect(dist.connect(ro1).reject_offer(1)).to.emit(dist, "offerrejected").withArgs(1);
      expect((await dist.offers(1)).status).to.equal(Offer.Rejected);
      expect(await tracker.fragmentCount()).to.equal(2);
      expect((await retailer.get_all_inventory()).length).to.equal(0);

      await dist.connect(d1).offer_batch(SHIPPED, 600, retailer2Addr, 5);
      await dist.connect(ro2).accept_offer(2);
      expect(await tracker.remaining(SHIPPED)).to.equal(0);
    });

    it("only the Retailer's owner can reject", async function () {
      await expect(dist.connect(d1).reject_offer(1)).to.be.revertedWith("Not the retailer owner");
      await expect(dist.connect(ro2).reject_offer(1)).to.be.revertedWith("Not the retailer owner");
    });

    it("sender can cancel a pending offer; nobody else can", async function () {
      await expect(dist.connect(ro1).cancel_offer(1)).to.be.revertedWith("Not the sender of this offer");
      await expect(dist.connect(d1).cancel_offer(1)).to.emit(dist, "offercancelled").withArgs(1);
      expect((await dist.offers(1)).status).to.equal(Offer.Cancelled);
      await expect(dist.connect(d1).cancel_offer(1)).to.be.revertedWith("Offer not pending");
    });

    it("an accepted offer can no longer be cancelled or rejected", async function () {
      await dist.connect(ro1).accept_offer(1);
      await expect(dist.connect(d1).cancel_offer(1)).to.be.revertedWith("Offer not pending");
      await expect(dist.connect(ro1).reject_offer(1)).to.be.revertedWith("Offer not pending");
    });
  });

  // ------------------------------------------------------------ auto_accept
  describe("auto_accept (retailer trusts a distributor)", function () {
    it("is OFF by default: the offer waits for the retailer", async function () {
      expect(await dist.auto_accept(retailerAddr, d1.address)).to.equal(false);
      await dist.connect(d1).offer_batch(SHIPPED, 100, retailerAddr, 1);
      expect((await dist.offers(1)).status).to.equal(Offer.Pending);
    });

    it("when ON, the offer is handed over and logged immediately", async function () {
      await dist.connect(ro1).set_auto_accept(retailerAddr, d1.address, true);
      await expect(dist.connect(d1).offer_batch(SHIPPED, 100, retailerAddr, 7))
        .to.emit(dist, "batchoffered")
        .and.to.emit(dist, "batchforwarded")
        .and.to.emit(retailer, "StockReceived")
        .withArgs(3, d1.address, 100, 7);

      expect((await dist.offers(1)).status).to.equal(Offer.Accepted);
      expect((await tracker.getFragment(3)).owner).to.equal(retailerAddr);
      expect((await retailer.get_item(3)).status).to.equal(Status.OnShelf);
    });

    it("only the Retailer's owner can switch it", async function () {
      await expect(
        dist.connect(d1).set_auto_accept(retailerAddr, d1.address, true)
      ).to.be.revertedWith("Not the retailer owner");
      await expect(
        dist.connect(ro2).set_auto_accept(retailerAddr, d1.address, true)
      ).to.be.revertedWith("Not the retailer owner");
    });

    it("only covers the (retailer, distributor) pair that was approved", async function () {
      await dist.connect(ro1).set_auto_accept(retailerAddr, d1.address, true);
      await farmerC.connect(farmer).offer_batch(batchId, 100, d2.address, 22);
      await farmerC.connect(d2).accept_offer(2); // fragment 3 -> d2

      await dist.connect(d2).offer_batch(3, 10, retailerAddr, 1); // d2 not trusted by retailer 1
      expect((await dist.offers(1)).status).to.equal(Offer.Pending);
      await dist.connect(d1).offer_batch(SHIPPED, 10, retailer2Addr, 1); // retailer 2 trusts nobody
      expect((await dist.offers(2)).status).to.equal(Offer.Pending);
    });

    it("can be switched OFF again", async function () {
      await dist.connect(ro1).set_auto_accept(retailerAddr, d1.address, true);
      await dist.connect(ro1).set_auto_accept(retailerAddr, d1.address, false);
      await dist.connect(d1).offer_batch(SHIPPED, 100, retailerAddr, 1);
      expect((await dist.offers(1)).status).to.equal(Offer.Pending);
    });
  });
});
