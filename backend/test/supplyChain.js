const { expect } = require("chai");
const { ethers } = require("hardhat");

// End-to-end supply chain tracking: farmer -> distributors -> retailers -> consumer.
// Prints the full history of the batch so you can read the provenance.
describe("Supply chain tracking: full batch history", function () {
  let tracker, farmers;
  let farmer, d1, d2, r1, r2, consumer, attacker;
  let name; // address -> readable label
  const BATCH = 1;

  const label = (a) => name[a.toLowerCase()] || a;
  const range = (f) => `${f.offset}..${f.offset + f.size}kg`;

  before(async function () {
    [farmer, d1, d2, r1, r2, consumer, attacker] = await ethers.getSigners();
    name = {
      [farmer.address.toLowerCase()]: "Farmer",
      [d1.address.toLowerCase()]: "Distributor1",
      [d2.address.toLowerCase()]: "Distributor2",
      [r1.address.toLowerCase()]: "Retailer1",
      [r2.address.toLowerCase()]: "Retailer2",
      [consumer.address.toLowerCase()]: "Consumer",
    };

    tracker = await (await ethers.getContractFactory("CropTracker")).deploy();
    farmers = await (await ethers.getContractFactory("Farmer")).deploy(await tracker.getAddress());
    await tracker.setRegistrar(await farmers.getAddress(), true);

    // 1. farmer harvests 1000kg wheat -> id + root fragment made by contract
    await farmers.connect(farmer).create_batch("wheat", 1000, 20, "agra", "2026-09-01", "rabi");

    // 2. farmer offers 600kg to Distributor1 and 300kg to Distributor2 (100kg stays).
    //    Distributor1 accepts by hand; Distributor2 trusts this farmer (auto_accept).
    await farmers.connect(farmer).offer_batch(BATCH, 600, d1.address, 22); // offer 1
    await farmers.connect(d1).accept_offer(1); // fragment 2
    await farmers.connect(d2).set_auto_accept(farmer.address, true);
    await farmers.connect(farmer).offer_batch(BATCH, 300, d2.address, 22); // offer 2 -> fragment 3

    // 3. Distributor1 splits its 600kg: 200 -> Retailer1, 400 -> Retailer2
    await tracker
      .connect(d1)
      .fragment(2, [200, 400], [r1.address, r2.address], [false, false]); // fragments 4, 5

    // 4. Retailer2 cuts its 400kg into four final 100kg retail packs
    await tracker
      .connect(r2)
      .fragment(5, [100, 100, 100, 100], Array(4).fill(r2.address), Array(4).fill(true)); // 6..9

    // 5. Retailer2 sells pack 6 to a consumer
    await tracker.connect(r2).transferFragment(6, consumer.address);
  });

  it("root totals: size of the whole batch and what the farmer still holds", async function () {
    expect((await tracker.getFragment(1)).size).to.equal(1000);
    expect(await tracker.remaining(1)).to.equal(100); // farmer still holds 100kg
    expect(await tracker.batchCount()).to.equal(1);
  });

  it("every fragment ever made (from events), printed as a tree", async function () {
    const ev = await tracker.queryFilter(tracker.filters.FragmentCreated(null, null, BATCH));
    const all = await Promise.all(ev.map((e) => tracker.getFragment(e.args.id)));
    expect(all.length).to.equal(9);

    // every fragment carries the same identification
    all.forEach((f) => expect(f.identification).to.equal(BATCH));

    // rebuild tree from parentId
    const kids = {};
    all.forEach((f) => (kids[f.parentId] = [...(kids[f.parentId] || []), f]));
    const lines = [];
    const walk = (f, depth) => {
      const flags = f.df ? "DF (final pack)" : f.mf ? "MF (can split)" : "root";
      const left = f.size - f.allocated;
      const rest = !f.df && f.allocated > 0 && left > 0 ? `, ${left}kg unsplit` : "";
      lines.push(
        `${"   ".repeat(depth)}#${f.id} [${range(f)}] ${f.size}kg  ${flags}  holder=${label(f.owner)}${rest}`
      );
      (kids[f.id] || []).forEach((c) => walk(c, depth + 1));
    };
    walk(all[0], 0);
    console.log("\n  --- Batch 1 fragment tree ---\n  " + lines.join("\n  ") + "\n");

    // flags: only root has MF=false/DF=false and no parent; finals DF=true MF=false
    expect(all[0].parentId).to.equal(0);
    expect(all[0].mf).to.equal(false);
    expect(all[0].df).to.equal(false);
    for (const f of all.slice(5)) {
      expect(f.df).to.equal(true);
      expect(f.mf).to.equal(false);
    }
    // siblings never overlap: sorted ranges under each parent are contiguous
    for (const pid of Object.keys(kids).filter((p) => p !== "0")) {
      const sib = kids[pid].sort((a, b) => Number(a.offset - b.offset));
      for (let i = 1; i < sib.length; i++) {
        expect(sib[i].offset).to.equal(sib[i - 1].offset + sib[i - 1].size);
      }
    }
  });

  it("getLineage: scan pack #6 -> full path back to the farm", async function () {
    const path = await tracker.getLineage(6);
    console.log("  --- Lineage of retail pack #6 ---");
    path.forEach((f) =>
      console.log(`  #${f.id} [${range(f)}] current holder = ${label(f.owner)}`)
    );
    console.log();
    expect(path.map((f) => Number(f.id))).to.deep.equal([6, 5, 2, 1]);
    expect(path[3].farmer).to.equal(farmer.address); // root = Farmer
    expect(path[3].parentId).to.equal(0);
  });

  it("getCustodyHistory: who held pack #6 and the 400kg lot #5", async function () {
    const pack = await tracker.getCustodyHistory(6);
    const lot = await tracker.getCustodyHistory(5);
    console.log("  --- Custody of pack #6 ---");
    pack.forEach((c, i) => console.log(`  ${i + 1}. ${label(c.holder)}`));
    console.log();
    expect(pack.map((c) => c.holder)).to.deep.equal([r2.address, consumer.address]);
    expect(lot.map((c) => c.holder)).to.deep.equal([r2.address]);
    expect((await tracker.getFragment(6)).owner).to.equal(consumer.address);
  });

  it("event log: FragmentCreated rebuilds the history off-chain", async function () {
    const ev = await tracker.queryFilter(tracker.filters.FragmentCreated(null, null, BATCH));
    expect(ev.length).to.equal(9);
    expect(ev.map((e) => Number(e.args.id))).to.deep.equal([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(Number(ev[5].args.parentId)).to.equal(5);
    expect(ev[5].args.df).to.equal(true);
    const reg = await tracker.queryFilter(tracker.filters.BatchRegistered(null, farmer.address, BATCH));
    expect(reg.length).to.equal(1);
  });

  it("Farmer contract agrees with the tracker", async function () {
    const b = await farmers.connect(farmer).get_batch_details(BATCH);
    expect(b.quantity).to.equal(100); // 1000 - 600 - 300
    expect(b.quantity).to.equal(await tracker.remaining(1));

    const o1 = await farmers.offers(1); // accepted by hand
    const o2 = await farmers.offers(2); // accepted automatically
    expect(o1.status).to.equal(1n);
    expect(o2.status).to.equal(1n);
    expect(o1.fragment_id).to.equal(2);
    expect(o2.fragment_id).to.equal(3);
    expect((await tracker.getFragment(2)).owner).to.equal(d1.address);
    expect((await tracker.getFragment(3)).owner).to.equal(d2.address);
  });

  it("verifyFragment: genuine label passes, forged labels fail", async function () {
    expect(await tracker.verifyFragment(6, BATCH, 200, 100)).to.equal(true);
    expect(await tracker.verifyFragment(6, BATCH, 300, 100)).to.equal(false); // wrong offset (that is pack 7)
    expect(await tracker.verifyFragment(6, BATCH, 200, 150)).to.equal(false); // inflated size
    expect(await tracker.verifyFragment(6, 2, 200, 100)).to.equal(false); // other batch
    expect(await tracker.verifyFragment(10, BATCH, 200, 100)).to.equal(false); // pack never existed
  });

  it("counterfeit attempts all revert", async function () {
    // cannot cut a final pack again
    await expect(
      tracker.connect(consumer).fragment(6, [10], [consumer.address], [true])
    ).to.be.revertedWith("DF set: cannot fragment");
    // cannot create more than the lot holds (lot #5 is fully allocated)
    await expect(
      tracker.connect(r2).fragment(5, [1], [r2.address], [true])
    ).to.be.revertedWith("Exceeds fragment size");
    // attacker cannot split someone else's lot
    await expect(
      tracker.connect(attacker).fragment(4, [10], [attacker.address], [true])
    ).to.be.revertedWith("Not fragment owner");
    // old holder cannot act after selling
    await expect(
      tracker.connect(r2).transferFragment(6, r2.address)
    ).to.be.revertedWith("Not fragment owner");
    // attacker cannot offer (or take) stock out of the farmer's batch
    await expect(
      farmers.connect(attacker).offer_batch(BATCH, 10, attacker.address, 1)
    ).to.be.revertedWith("Batch not found");
    await farmers.connect(farmer).offer_batch(BATCH, 50, d1.address, 1); // offer 3, pending for d1
    await expect(farmers.connect(attacker).accept_offer(3)).to.be.revertedWith(
      "Not the distributor of this offer"
    );
    // attacker cannot register a batch directly in the tracker
    await expect(
      tracker.connect(attacker).registerBatch(attacker.address, 1000)
    ).to.be.revertedWith("Not registrar");
  });
});
