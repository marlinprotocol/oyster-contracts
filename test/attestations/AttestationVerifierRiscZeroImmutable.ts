import { id, Signer } from "ethers";
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
