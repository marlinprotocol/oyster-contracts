import { id, Signer, AbiCoder } from "ethers";
import { ethers } from "hardhat";
import { expect } from "chai";

import { AttestationVerifierRiscZeroImmutable } from "../../typechain-types";

import { takeSnapshotBeforeAndAfterEveryTest } from "../../utils/testSuite";

describe("AttestationVerifierRiscZeroImmutable - Init", function() {
  let signers: Signer[];
  let addrs: string[];

  before(async function() {
    signers = await ethers.getSigners();
    addrs = await Promise.all(signers.map((a) => a.getAddress()));
  });

  takeSnapshotBeforeAndAfterEveryTest(async () => { });

  it("deploys", async function() {
    const Contract = await ethers.getContractFactory("AttestationVerifierRiscZeroImmutable");
    const contract = (await Contract.deploy(id("some image"))) as unknown as AttestationVerifierRiscZeroImmutable;

    expect(await contract.IMAGE_ID()).to.equal(id("some image"));
  });
});

describe("AttestationVerifierRiscZeroImmutable - Verify", function() {
  let signers: Signer[];
  let addrs: string[];

  let contract: AttestationVerifierRiscZeroImmutable;

  before(async function() {
    signers = await ethers.getSigners();
    addrs = await Promise.all(signers.map((a) => a.getAddress()));

    const Contract = await ethers.getContractFactory("AttestationVerifierRiscZeroImmutable");
    contract = (await Contract.deploy(id("some image"))) as unknown as AttestationVerifierRiscZeroImmutable;

    expect(await contract.IMAGE_ID()).to.equal(id("some image"));
  });

  takeSnapshotBeforeAndAfterEveryTest(async () => { });

  it("verifies", async function() {
    const Mock = await ethers.getContractFactory("MockRiscZeroVerifier");
    let mock = await Mock.deploy();
    await mock.setFail(false);
    await mock.setExpectedCall(id("some seal"), id("some image"), id("some journal"));

    await expect(contract.verify(id("some image"), await mock.getAddress(), id("some journal"), id("some seal"))).to.not
      .be.reverted;
  });

  it("reverts if verifier reverts", async function() {
    const Mock = await ethers.getContractFactory("MockRiscZeroVerifier");
    let mock = await Mock.deploy();
    await mock.setFail(true);

    await expect(
      contract.verify(id("some image"), await mock.getAddress(), id("some journal"), id("some seal")),
    ).to.be.revertedWith("verification failed");
  });
});

describe("AttestationVerifierRiscZeroImmutable - Verify bytes", function() {
  let signers: Signer[];
  let addrs: string[];

  let contract: AttestationVerifierRiscZeroImmutable;

  before(async function() {
    signers = await ethers.getSigners();
    addrs = await Promise.all(signers.map((a) => a.getAddress()));

    const Contract = await ethers.getContractFactory("AttestationVerifierRiscZeroImmutable");
    contract = (await Contract.deploy(id("some image"))) as unknown as AttestationVerifierRiscZeroImmutable;

    expect(await contract.IMAGE_ID()).to.equal(id("some image"));
  });

  takeSnapshotBeforeAndAfterEveryTest(async () => { });

  it("verifies", async function() {
    const Mock = await ethers.getContractFactory("MockRiscZeroVerifier");
    let mock = await Mock.deploy();
    await mock.setFail(false);
    await mock.setExpectedCall(id("some seal"), id("some image"), id("some journal"));

    await expect(
      contract.verify(
        AbiCoder.defaultAbiCoder().encode(
          ["bytes32", "address", "bytes32", "bytes"],
          [id("some image"), await mock.getAddress(), id("some journal"), id("some seal")],
        ),
      ),
    ).to.not.be.reverted;
  });

  it("reverts if verifier reverts", async function() {
    const Mock = await ethers.getContractFactory("MockRiscZeroVerifier");
    let mock = await Mock.deploy();
    await mock.setFail(true);

    await expect(
      contract.verify(
        AbiCoder.defaultAbiCoder().encode(
          ["bytes32", "address", "bytes32", "bytes"],
          [id("some image"), await mock.getAddress(), id("some journal"), id("some seal")],
        ),
      ),
    ).to.be.revertedWith("verification failed");
  });
});
