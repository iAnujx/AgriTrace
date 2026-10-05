const { expect } = require("chai");
const { ethers } = require("hardhat");

const Offer = { Pending: 0n, Accepted: 1n, Rejected: 2n, Cancelled: 3n };

describe("Farmer contract", function () {
  let tracker, farmers;
  let farmer, dist1, dist2, other;

  // fresh contracts for every test; tracker trusts the Farmer contract
  beforeEach(async function () {
    [farmer, dist1, dist2, other] = await ethers.getSigners();

    tracker = await (await ethers.getContractFactory("CropTracker")).deploy();
    farmers = await (await ethers.getContractFactory("Farmer")).deploy(await tracker.getAddress());
    await tracker.setRegistrar(await farmers.getAddress(), true);
  });

  const createWheat = (qty = 1000, signer = farmer) =>
    farmers.connect(signer).create_batch("wheat", qty, 200, "agra", "2026-09-01", "rabi");

  // ---------------------------------------------------------------- profile
  describe("profile", function () {
    it("stores and returns the profile name", async function () {
      await farmers.set_farmer_profile_name("ankush");
      expect(await farmers.get_farmer_profile_name()).to.equal("ankush");
    });

    it("assigns a role once and prevents reassignment", async function () {
      await farmers.set_user_role(0);
      expect(await farmers.get_user_role()).to.equal(0);
      await expect(farmers.set_user_role(1)).to.be.revertedWith("Role already assigned");
    });
  });

  // ----------------------------------------------------------- create_batch
  describe("create_batch", function () {
    it("auto-generates the batch id and stores the details", async function () {
      await createWheat();
      const b = await farmers.get_batch_details(1);
      expect(b.batch_id).to.equal(1);
      expect(b.crop_name).to.equal("wheat");
      expect(b.quantity).to.equal(1000);
      expect(b.expected_p_kg_price).to.equal(200);
      expect(b.farm_city_location).to.equal("agra");
      expect(b.harvest_date).to.equal("2026-09-01");
      expect(b.typeof_crop).to.equal("rabi");
    });

    it("gives every new batch the next id, no matter who creates it", async function () {
      await createWheat();
      await createWheat();
      await farmers.connect(other).create_batch("rice", 50, 90, "mathura", "2026-09-02", "kharif");
      expect((await farmers.get_batch_details(2)).batch_id).to.equal(2);
      expect((await farmers.connect(other).get_batch_details(3)).crop_name).to.equal("rice");
      await expect(farmers.connect(other).get_batch_details(1)).to.be.revertedWith("Batch not found");
    });

    it("registers the batch in CropTracker as the root fragment", async function () {
      await expect(createWheat())
        .to.emit(farmers, "batchregistered")
        .withArgs(1, "wheat", farmer.address)
        .and.to.emit(tracker, "BatchRegistered")
        .withArgs(1, farmer.address, 1, 1000);

      expect(await farmers.batch_root_fragment(1)).to.equal(1);
      const root = await tracker.getFragment(1);
      expect(root.identification).to.equal(1);
      expect(root.farmer).to.equal(farmer.address);
      expect(root.owner).to.equal(farmer.address); // the user, not the Farmer contract
      expect(root.parentId).to.equal(0);
      expect(root.size).to.equal(1000);
      expect(root.mf).to.equal(false);
      expect(root.df).to.equal(false);
    });

    it("rejects zero quantity", async function () {
      await expect(createWheat(0)).to.be.revertedWith("Quantity must be > 0");
    });

    it("fails if Farmer is not a registrar of the tracker", async function () {
      await tracker.setRegistrar(await farmers.getAddress(), false);
      await expect(createWheat()).to.be.revertedWith("Not registrar");
    });

    it("get_all_batches returns only the caller's batches; find_batch reads anyone's", async function () {
      await createWheat();
      await createWheat();
      await createWheat(10, other);
      expect((await farmers.get_all_batches()).length).to.equal(2);
      expect((await farmers.connect(other).get_all_batches()).length).to.equal(1);

      const [found, b] = await farmers.find_batch(other.address, 3);
      expect(found).to.equal(true);
      expect(b.quantity).to.equal(10);
      const [missing] = await farmers.find_batch(other.address, 1);
      expect(missing).to.equal(false);
    });
  });

  // ------------------------------------------------------------ offer_batch
  describe("offer_batch", function () {
    beforeEach(createWheat);

    it("creates a PENDING offer and moves nothing", async function () {
      await expect(farmers.offer_batch(1, 400, dist1.address, 210))
        .to.emit(farmers, "batchoffered")
        .withArgs(1, 1, farmer.address, dist1.address, 400, 210);

      const o = await farmers.offers(1);
      expect(o.farmer).to.equal(farmer.address);
      expect(o.distributor).to.equal(dist1.address);
      expect(o.batch_id).to.equal(1);
      expect(o.quantity).to.equal(400);
      expect(o.price).to.equal(210);
      expect(o.status).to.equal(Offer.Pending);
      expect(o.fragment_id).to.equal(0);

      // the distributor holds nothing yet, the farmer still holds everything
      expect(await tracker.fragmentCount()).to.equal(1);
      expect(await tracker.remaining(1)).to.equal(1000);
      expect((await farmers.get_batch_details(1)).quantity).to.equal(1000);
    });

    it("rejects bad quantity, unknown batch, zero distributor and other people's batches", async function () {
      await expect(farmers.offer_batch(1, 0, dist1.address, 1)).to.be.revertedWith("Invalid quantity");
      await expect(farmers.offer_batch(1, 1001, dist1.address, 1)).to.be.revertedWith("Invalid quantity");
      await expect(farmers.offer_batch(9, 10, dist1.address, 1)).to.be.revertedWith("Batch not found");
      await expect(farmers.offer_batch(1, 10, ethers.ZeroAddress, 1)).to.be.revertedWith("Zero distributor");
      await expect(
        farmers.connect(other).offer_batch(1, 10, dist1.address, 1)
      ).to.be.revertedWith("Batch not found");
    });

    it("offer views list by farmer and by distributor, every status", async function () {
      await createWheat(500, other); // batch 2 by `other`
      await farmers.offer_batch(1, 100, dist1.address, 1); // 1
      await farmers.offer_batch(1, 100, dist2.address, 1); // 2
      await farmers.offer_batch(1, 100, dist1.address, 1); // 3
      await farmers.connect(other).offer_batch(2, 50, dist1.address, 1); // 4
      await farmers.connect(dist1).reject_offer(3);

      const mine = await farmers.get_offers_by_farmer(farmer.address);
      expect(mine.map((o) => Number(o.id))).to.deep.equal([1, 2, 3]);
      expect((await farmers.get_offers_by_farmer(other.address)).map((o) => Number(o.id))).to.deep.equal([4]);

      const forD1 = await farmers.get_offers_for_distributor(dist1.address);
      expect(forD1.map((o) => Number(o.id))).to.deep.equal([1, 3, 4]);
      expect(forD1.map((o) => Number(o.status))).to.deep.equal([0, 2, 0]); // pending, rejected, pending
      expect((await farmers.get_offers_for_distributor(dist2.address)).length).to.equal(1);
      expect((await farmers.get_offers_for_distributor(other.address)).length).to.equal(0);
    });
  });

  // ----------------------------------------------------------- accept_offer
  describe("accept_offer", function () {
    beforeEach(async function () {
      await createWheat();
      await farmers.offer_batch(1, 400, dist1.address, 210); // offer 1
    });

    it("hands the stock over: fragment created, owned by the distributor", async function () {
      await expect(farmers.connect(dist1).accept_offer(1))
        .to.emit(farmers, "batchsent")
        .withArgs(1, 2, dist1.address, 400)
        .and.to.emit(tracker, "FragmentCreated");

      const f = await tracker.getFragment(2);
      expect(f.identification).to.equal(1);
      expect(f.parentId).to.equal(1);
      expect(f.offset).to.equal(0);
      expect(f.size).to.equal(400);
      expect(f.owner).to.equal(dist1.address);
      expect(f.mf).to.equal(true);
      expect(f.df).to.equal(false);
      expect(await tracker.remaining(1)).to.equal(600);

      const o = await farmers.offers(1);
      expect(o.status).to.equal(Offer.Accepted);
      expect(o.fragment_id).to.equal(2);
      expect(await farmers.fragment_sale_price(2)).to.equal(210);
      expect((await farmers.get_batch_details(1)).quantity).to.equal(600);
    });

    it("only the distributor named in the offer can accept", async function () {
      await expect(farmers.connect(dist2).accept_offer(1)).to.be.revertedWith(
        "Not the distributor of this offer"
      );
      await expect(farmers.accept_offer(1)).to.be.revertedWith("Not the distributor of this offer"); // not even the farmer
      expect((await farmers.offers(1)).status).to.equal(Offer.Pending);
    });

    it("cannot be accepted twice, nor after reject / cancel, nor if it does not exist", async function () {
      await farmers.connect(dist1).accept_offer(1);
      await expect(farmers.connect(dist1).accept_offer(1)).to.be.revertedWith("Offer not pending");
      await expect(farmers.connect(dist1).accept_offer(99)).to.be.revertedWith("Offer not found");

      await farmers.offer_batch(1, 10, dist1.address, 1); // 2
      await farmers.connect(dist1).reject_offer(2);
      await expect(farmers.connect(dist1).accept_offer(2)).to.be.revertedWith("Offer not pending");

      await farmers.offer_batch(1, 10, dist1.address, 1); // 3
      await farmers.cancel_offer(3);
      await expect(farmers.connect(dist1).accept_offer(3)).to.be.revertedWith("Offer not pending");
    });

    it("second accepted offer starts where the first ended; last one empties the batch", async function () {
      await farmers.offer_batch(1, 600, dist2.address, 220); // offer 2
      await farmers.connect(dist1).accept_offer(1);
      await farmers.connect(dist2).accept_offer(2);

      const f = await tracker.getFragment(3);
      expect(f.offset).to.equal(400); // no overlap with fragment 2 (0..400)
      expect(f.size).to.equal(600);
      expect(f.owner).to.equal(dist2.address);
      expect(await tracker.remaining(1)).to.equal(0);
      expect((await farmers.get_batch_details(1)).quantity).to.equal(0);
      expect(await tracker.getChildren(1)).to.deep.equal([2n, 3n]);
    });

    it("over-offered stock: the offer that no longer fits fails and stays pending", async function () {
      await farmers.offer_batch(1, 700, dist2.address, 1); // offer 2, ok alone (1000 >= 700)
      await farmers.connect(dist1).accept_offer(1); // 400 gone, 600 left
      await expect(farmers.connect(dist2).accept_offer(2)).to.be.revertedWith("Not enough left");
      expect((await farmers.offers(2)).status).to.equal(Offer.Pending);
    });

    it("fails if the farmer deleted the batch meanwhile", async function () {
      await createWheat(); // batch 2, never shipped
      await farmers.offer_batch(2, 50, dist1.address, 1); // offer 2
      await farmers.delete_recent_batch(2);
      await expect(farmers.connect(dist1).accept_offer(2)).to.be.revertedWith("Batch not found");
    });

    it("fails (and changes nothing) if Farmer lost its registrar role", async function () {
      await tracker.setRegistrar(await farmers.getAddress(), false);
      await expect(farmers.connect(dist1).accept_offer(1)).to.be.revertedWith("Not registrar");
      expect((await farmers.offers(1)).status).to.equal(Offer.Pending);
      expect((await farmers.get_batch_details(1)).quantity).to.equal(1000);
    });

    it("distributor can split the received fragment further in the tracker", async function () {
      await farmers.connect(dist1).accept_offer(1);
      await tracker.connect(dist1).fragment(2, [100, 300], [other.address, other.address], [false, false]);
      expect((await tracker.getFragment(3)).offset).to.equal(0);
      expect((await tracker.getFragment(4)).offset).to.equal(100);
      const path = await tracker.getLineage(4);
      expect(path.map((x) => Number(x.id))).to.deep.equal([4, 2, 1]);
    });
  });

  // ------------------------------------------------- reject / cancel offers
  describe("reject_offer / cancel_offer", function () {
    beforeEach(async function () {
      await createWheat();
      await farmers.offer_batch(1, 400, dist1.address, 210); // offer 1
    });

    it("distributor can reject: nothing moves and the farmer can offer the stock again", async function () {
      await expect(farmers.connect(dist1).reject_offer(1))
        .to.emit(farmers, "offerrejected")
        .withArgs(1);
      expect((await farmers.offers(1)).status).to.equal(Offer.Rejected);
      expect(await tracker.fragmentCount()).to.equal(1);
      expect((await farmers.get_batch_details(1)).quantity).to.equal(1000);

      await farmers.offer_batch(1, 1000, dist2.address, 5); // all of it, to someone else
      await farmers.connect(dist2).accept_offer(2);
      expect(await tracker.remaining(1)).to.equal(0);
    });

    it("only the named distributor can reject", async function () {
      await expect(farmers.connect(dist2).reject_offer(1)).to.be.revertedWith(
        "Not the distributor of this offer"
      );
      await expect(farmers.reject_offer(1)).to.be.revertedWith("Not the distributor of this offer");
    });

    it("farmer can cancel a pending offer; nobody else can", async function () {
      await expect(farmers.connect(dist1).cancel_offer(1)).to.be.revertedWith("Not the farmer of this offer");
      await expect(farmers.cancel_offer(1)).to.emit(farmers, "offercancelled").withArgs(1);
      expect((await farmers.offers(1)).status).to.equal(Offer.Cancelled);
      await expect(farmers.cancel_offer(1)).to.be.revertedWith("Offer not pending");
    });

    it("an accepted offer can no longer be cancelled or rejected", async function () {
      await farmers.connect(dist1).accept_offer(1);
      await expect(farmers.cancel_offer(1)).to.be.revertedWith("Offer not pending");
      await expect(farmers.connect(dist1).reject_offer(1)).to.be.revertedWith("Offer not pending");
    });
  });

  // ------------------------------------------------------------ auto_accept
  describe("auto_accept (distributor trusts a farmer)", function () {
    beforeEach(createWheat);

    it("is OFF by default: the offer waits for the distributor", async function () {
      expect(await farmers.auto_accept(dist1.address, farmer.address)).to.equal(false);
      await farmers.offer_batch(1, 100, dist1.address, 1);
      expect((await farmers.offers(1)).status).to.equal(Offer.Pending);
    });

    it("when ON, the offer is handed over immediately", async function () {
      await farmers.connect(dist1).set_auto_accept(farmer.address, true);
      await expect(farmers.offer_batch(1, 100, dist1.address, 7))
        .to.emit(farmers, "batchoffered")
        .and.to.emit(farmers, "batchsent")
        .withArgs(1, 2, dist1.address, 100);

      const o = await farmers.offers(1);
      expect(o.status).to.equal(Offer.Accepted);
      expect(o.fragment_id).to.equal(2);
      expect((await tracker.getFragment(2)).owner).to.equal(dist1.address);
      expect(await farmers.fragment_sale_price(2)).to.equal(7);
    });

    it("only covers the pair (distributor, farmer) that was approved", async function () {
      await farmers.connect(dist1).set_auto_accept(farmer.address, true);
      await createWheat(500, other);
      // other farmer -> dist1: not trusted, waits
      await farmers.connect(other).offer_batch(2, 10, dist1.address, 1);
      expect((await farmers.offers(1)).status).to.equal(Offer.Pending);
      // farmer -> dist2: dist2 never approved anyone, waits
      await farmers.offer_batch(1, 10, dist2.address, 1);
      expect((await farmers.offers(2)).status).to.equal(Offer.Pending);
      // nobody can switch it on for someone else: dist2 turning it on does not affect dist1's setting
      await farmers.connect(dist2).set_auto_accept(other.address, true);
      expect(await farmers.auto_accept(dist1.address, other.address)).to.equal(false);
    });

    it("can be switched OFF again", async function () {
      await farmers.connect(dist1).set_auto_accept(farmer.address, true);
      await farmers.connect(dist1).set_auto_accept(farmer.address, false);
      await farmers.offer_batch(1, 100, dist1.address, 1);
      expect((await farmers.offers(1)).status).to.equal(Offer.Pending);
    });
  });

  // ---------------------------------------------------- delete_recent_batch
  describe("delete_recent_batch", function () {
    it("deletes an unshipped batch, blocks deleting a shipped one", async function () {
      await createWheat();
      await createWheat();
      await farmers.offer_batch(2, 100, dist1.address, 210);
      // a pending offer ships nothing yet, so the batch can still be deleted ...
      await farmers.connect(dist1).accept_offer(1);
      // ... but once accepted it can not
      await expect(farmers.delete_recent_batch(2)).to.be.revertedWith("Batch already shipped");

      await farmers.delete_recent_batch(1);
      expect((await farmers.get_all_batches()).length).to.equal(1);
      await expect(farmers.delete_recent_batch(1)).to.be.revertedWith("Batch ID not found for deletion");
    });

    it("nobody can delete another farmer's batch", async function () {
      await createWheat();
      await expect(farmers.connect(other).delete_recent_batch(1)).to.be.revertedWith(
        "Batch ID not found for deletion"
      );
    });
  });
});
