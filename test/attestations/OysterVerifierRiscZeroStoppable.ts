import { id, Signer, AbiCoder, Contract, ZeroAddress } from "ethers";
import { ethers } from "hardhat";
import { expect } from "chai";

import { OysterVerifierRiscZeroStoppable } from "../../typechain-types";

import { takeSnapshotBeforeAndAfterEveryTest } from "../../utils/testSuite";

describe("OysterVerifierRiscZeroStoppable - Init", function() {
  let signers: Signer[];
  let addrs: string[];

  before(async function() {
    signers = await ethers.getSigners();
    addrs = await Promise.all(signers.map((a) => a.getAddress()));
  });

  takeSnapshotBeforeAndAfterEveryTest(async () => { });

  it("deploys", async function() {
    const Contract = await ethers.getContractFactory("OysterVerifierRiscZeroStoppable");
    const contract = (await Contract.deploy(addrs[10], addrs[1])) as unknown as OysterVerifierRiscZeroStoppable;

    expect(await contract.VERIFIER()).to.equal(addrs[10]);
    expect(await contract.owner()).to.equal(addrs[1]);
    expect(await contract.paused()).to.equal(false);
  });

  it("does not deploy with zero owner", async function() {
    const Contract = await ethers.getContractFactory("OysterVerifierRiscZeroStoppable");

    await expect(Contract.deploy(addrs[10], ZeroAddress)).to.be.revertedWithCustomError(
      Contract,
      "OwnableInvalidOwner",
    );
  });
});

describe("OysterVerifierRiscZeroStoppable - Pause", function() {
  let signers: Signer[];
  let addrs: string[];

  let contract: OysterVerifierRiscZeroStoppable;

  before(async function() {
    signers = await ethers.getSigners();
    addrs = await Promise.all(signers.map((a) => a.getAddress()));

    const Contract = await ethers.getContractFactory("OysterVerifierRiscZeroStoppable");
    contract = (await Contract.deploy(addrs[10], addrs[1])) as unknown as OysterVerifierRiscZeroStoppable;

    expect(await contract.VERIFIER()).to.equal(addrs[10]);
    expect(await contract.owner()).to.equal(addrs[1]);
    expect(await contract.paused()).to.equal(false);
  });

  takeSnapshotBeforeAndAfterEveryTest(async () => { });

  it("admin can pause", async function() {
    await contract.connect(signers[1]).pause();

    expect(await contract.paused()).to.equal(true);
  });

  it("admin can pause after unpause", async function() {
    await contract.connect(signers[1]).pause();
    await contract.connect(signers[1]).unpause();
    expect(await contract.paused()).to.equal(false);

    await contract.connect(signers[1]).pause();

    expect(await contract.paused()).to.equal(true);
  });

  it("admin cannot pause when already paused", async function() {
    await contract.connect(signers[1]).pause();

    await expect(contract.connect(signers[1]).pause()).to.be.revertedWithCustomError(contract, "EnforcedPause");
  });

  it("non admin cannot pause", async function() {
    await expect(contract.pause()).to.be.revertedWithCustomError(contract, "OwnableUnauthorizedAccount");
  });
});

describe("OysterVerifierRiscZeroStoppable - Unpause", function() {
  let signers: Signer[];
  let addrs: string[];

  let contract: OysterVerifierRiscZeroStoppable;

  before(async function() {
    signers = await ethers.getSigners();
    addrs = await Promise.all(signers.map((a) => a.getAddress()));

    const Contract = await ethers.getContractFactory("OysterVerifierRiscZeroStoppable");
    contract = (await Contract.deploy(addrs[10], addrs[1])) as unknown as OysterVerifierRiscZeroStoppable;

    expect(await contract.VERIFIER()).to.equal(addrs[10]);
    expect(await contract.owner()).to.equal(addrs[1]);
    expect(await contract.paused()).to.equal(false);
  });

  takeSnapshotBeforeAndAfterEveryTest(async () => { });

  it("admin can unpause", async function() {
    await contract.connect(signers[1]).pause();
    expect(await contract.paused()).to.equal(true);

    await contract.connect(signers[1]).unpause();

    expect(await contract.paused()).to.equal(false);
  });

  it("admin cannot unpause when never paused", async function() {
    await expect(contract.connect(signers[1]).unpause()).to.be.revertedWithCustomError(contract, "ExpectedPause");
  });

  it("admin cannot unpause when unpaused", async function() {
    await contract.connect(signers[1]).pause();
    await contract.connect(signers[1]).unpause();
    expect(await contract.paused()).to.equal(false);

    await expect(contract.connect(signers[1]).unpause()).to.be.revertedWithCustomError(contract, "ExpectedPause");
  });

  it("non admin cannot unpause", async function() {
    await contract.connect(signers[1]).pause();
    expect(await contract.paused()).to.equal(true);

    await expect(contract.unpause()).to.be.revertedWithCustomError(contract, "OwnableUnauthorizedAccount");
  });
});

describe("OysterVerifierRiscZeroStoppable - Verify", function() {
  let signers: Signer[];
  let addrs: string[];

  let contract: OysterVerifierRiscZeroStoppable;
  let mock: Contract;

  before(async function() {
    signers = await ethers.getSigners();
    addrs = await Promise.all(signers.map((a) => a.getAddress()));

    const Mock = await ethers.getContractFactory("MockOysterVerifierRiscZero");
    mock = await Mock.deploy();

    const Contract = await ethers.getContractFactory("OysterVerifierRiscZeroStoppable");
    contract = (await Contract.deploy(await mock.getAddress(), addrs[1])) as unknown as OysterVerifierRiscZeroStoppable;

    expect(await contract.VERIFIER()).to.equal(await mock.getAddress());
    expect(await contract.owner()).to.equal(addrs[1]);
    expect(await contract.paused()).to.equal(false);
  });

  takeSnapshotBeforeAndAfterEveryTest(async () => { });

  it("verifies", async function() {
    await mock.setFail(false);
    await mock.setExpectedDecodedCall(id("some image"), addrs[10], id("some journal"), id("some seal"));

    await expect(contract.verify(id("some image"), addrs[10], id("some journal"), id("some seal"))).to.not.be.reverted;
  });

  it("reverts if verifier reverts", async function() {
    await mock.setFail(true);

    await expect(contract.verify(id("some image"), addrs[10], id("some journal"), id("some seal"))).to.be.revertedWith(
      "verification failed",
    );
  });
});

describe("OysterVerifierRiscZeroStoppable - Verify bytes", function() {
  let signers: Signer[];
  let addrs: string[];

  let contract: OysterVerifierRiscZeroStoppable;
  let mock: Contract;

  before(async function() {
    signers = await ethers.getSigners();
    addrs = await Promise.all(signers.map((a) => a.getAddress()));

    const Mock = await ethers.getContractFactory("MockOysterVerifierRiscZero");
    mock = await Mock.deploy();

    const Contract = await ethers.getContractFactory("OysterVerifierRiscZeroStoppable");
    contract = (await Contract.deploy(await mock.getAddress(), addrs[1])) as unknown as OysterVerifierRiscZeroStoppable;

    expect(await contract.VERIFIER()).to.equal(await mock.getAddress());
    expect(await contract.owner()).to.equal(addrs[1]);
    expect(await contract.paused()).to.equal(false);
  });

  takeSnapshotBeforeAndAfterEveryTest(async () => { });

  it("verifies", async function() {
    let encodedBytes = AbiCoder.defaultAbiCoder().encode(
      ["bytes32", "address", "bytes32", "bytes"],
      [id("some image"), addrs[10], id("some journal"), id("some seal")],
    );

    await mock.setFail(false);
    await mock.setExpectedEncodedCall(encodedBytes);

    await expect(contract.verify(encodedBytes)).to.not.be.reverted;
  });

  it("reverts if verifier reverts", async function() {
    await mock.setFail(true);

    await expect(
      contract.verify(
        AbiCoder.defaultAbiCoder().encode(
          ["bytes32", "address", "bytes32", "bytes"],
          [id("some image"), addrs[10], id("some journal"), id("some seal")],
        ),
      ),
    ).to.be.revertedWith("verification failed");
  });
});
