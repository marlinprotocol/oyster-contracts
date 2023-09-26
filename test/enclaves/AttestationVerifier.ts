import { expect } from "chai";
import { Contract, Signer } from "ethers";
import { ethers, upgrades } from "hardhat";
import { AttestationVerifier } from "../../typechain-types";
import { takeSnapshotBeforeAndAfterEveryTest } from "../../utils/testSuite";
import { keccak256, parseUnits, solidityPack } from "ethers/lib/utils";
import { testERC165 } from "../helpers/erc165";
import { testAdminRole } from "../helpers/rbac";
import { getAttestationVerifier } from "../../utils/typechainConvertor";

const image1: AttestationVerifier.EnclaveImageStruct = {
    PCR0: parseUnits("1", 115).toHexString(),
    PCR1: parseUnits("2", 114).toHexString(),
    PCR2: parseUnits("3", 114).toHexString(),
};

const image2: AttestationVerifier.EnclaveImageStruct = {
    PCR0: parseUnits("4", 114).toHexString(),
    PCR1: parseUnits("5", 114).toHexString(),
    PCR2: parseUnits("6", 114).toHexString(),
};

const image3: AttestationVerifier.EnclaveImageStruct = {
    PCR0: parseUnits("7", 114).toHexString(),
    PCR1: parseUnits("8", 114).toHexString(),
    PCR2: parseUnits("9", 114).toHexString(),
};

describe("Attestation Verifier Deploy and Init", function() {
    let signers: Signer[];
	let addrs: string[];

    let enclaveKeyMap: Record<string, AttestationVerifier.EnclaveImageStruct> = {};

	before(async function() {
		signers = await ethers.getSigners();
		addrs = await Promise.all(signers.map((a) => a.getAddress()));

        expect(addrs.length).to.be.greaterThanOrEqual(15, "Number of addresses are too less");

        enclaveKeyMap[addrs[13]] = image1;
        enclaveKeyMap[addrs[14]] = image2;
	});

	takeSnapshotBeforeAndAfterEveryTest(async () => {});

    it("deploys with initialization disabled", async function() {
        const AttestationVerifier = await ethers.getContractFactory("AttestationVerifier");
        const attestationVerifier = await AttestationVerifier.deploy();

        await expect(
            attestationVerifier.initialize([], []),
        ).to.be.revertedWith("Initializable: contract is already initialized");

        await expect(
            attestationVerifier.initialize(Object.values(enclaveKeyMap), Object.keys(enclaveKeyMap)),
        ).to.be.revertedWith("Initializable: contract is already initialized");
    });

    it("deploys as proxy and initializes", async function() {
        const AttestationVerifier = await ethers.getContractFactory("AttestationVerifier");
        const attestationVerifier = await upgrades.deployProxy(
            AttestationVerifier,
            [[image1], [addrs[13]]],
            { kind: "uups" },
        );

        const imageId = await attestationVerifier.isVerified(addrs[13]);

        expect(imageId).to.equal(keccak256(solidityPack(["bytes", "bytes", "bytes"], [image1.PCR0, image1.PCR1, image1.PCR2])));
        let {PCR0, PCR1, PCR2} = await attestationVerifier.whitelistedImages(imageId);
        expect({PCR0, PCR1, PCR2}).to.deep.equal(image1);
    });

    it("deploys as proxy and initialize with multiple images", async function() {
        const AttestationVerifier = await ethers.getContractFactory("AttestationVerifier");
        const attestationVerifier = await upgrades.deployProxy(
            AttestationVerifier,
            [Object.values(enclaveKeyMap), Object.keys(enclaveKeyMap)],
            { kind: "uups" },
        );

        for(let i=0; i < Object.keys(enclaveKeyMap).length; i++) {
            const imageId = await attestationVerifier.isVerified(Object.keys(enclaveKeyMap)[i]);
            const image = Object.values(enclaveKeyMap)[i];
            expect(imageId).to.equal(keccak256(solidityPack(["bytes", "bytes", "bytes"], [image.PCR0, image.PCR1, image.PCR2])));
            const {PCR0, PCR1, PCR2} = await attestationVerifier.whitelistedImages(imageId);
            expect({PCR0, PCR1, PCR2}).to.deep.equal(image);
        }
    });

    it("does not initialize with mismatched lengths", async function() {
        const AttestationVerifier = await ethers.getContractFactory("AttestationVerifier");
        await expect(
            upgrades.deployProxy(
                AttestationVerifier,
                [Object.values(enclaveKeyMap).slice(-1), Object.keys(enclaveKeyMap)],
                { kind: "uups" },
            )
        ).to.be.revertedWith("AV:I-Image and key length mismatch");
    });

    it("upgrades", async function() {
		const AttestationVerifier = await ethers.getContractFactory("AttestationVerifier");
        const attestationVerifier = await upgrades.deployProxy(
            AttestationVerifier,
            [Object.values(enclaveKeyMap), Object.keys(enclaveKeyMap)],
            { kind: "uups" },
        );
		await upgrades.upgradeProxy(attestationVerifier.address, AttestationVerifier, { kind: "uups" });

        for(let verifierKey in enclaveKeyMap) {
            const image = enclaveKeyMap[verifierKey];
            expect(await attestationVerifier.isVerified(verifierKey)).to.equal(keccak256(solidityPack(["bytes", "bytes", "bytes"], [image.PCR0, image.PCR1, image.PCR2])));
        }

		expect(
			await attestationVerifier.hasRole(await attestationVerifier.DEFAULT_ADMIN_ROLE(), addrs[0]),
		).to.be.true;
	});

	it("does not upgrade without admin", async function() {
		const AttestationVerifier = await ethers.getContractFactory("AttestationVerifier");
        const attestationVerifier = await upgrades.deployProxy(
            AttestationVerifier,
            [Object.values(enclaveKeyMap), Object.keys(enclaveKeyMap)],
            { kind: "uups" },
        );

		await expect(
			upgrades.upgradeProxy(attestationVerifier.address, AttestationVerifier.connect(signers[1]), {
				kind: "uups",
			}),
		).to.be.revertedWith("only admin");
	});

    it("cannot revoke all admins", async function() {
        const AttestationVerifier = await ethers.getContractFactory("AttestationVerifier");
        const attestationVerifier = await upgrades.deployProxy(
            AttestationVerifier,
            [Object.values(enclaveKeyMap), Object.keys(enclaveKeyMap)],
            { kind: "uups" },
        );

        await expect(
            attestationVerifier.revokeRole(await attestationVerifier.DEFAULT_ADMIN_ROLE(), addrs[0]),
        ).to.be.revertedWith("AV:RR-All admins cannot be removed");
    });
});

testERC165(
	"Attestation Verifier ERC165",
	async function(_signers: Signer[], addrs: string[]) {
		const AttestationVerifier = await ethers.getContractFactory("AttestationVerifier");
        const attestationVerifier = await upgrades.deployProxy(
            AttestationVerifier,
            [[image1], [addrs[0]]],
            { kind: "uups" },
        );
		return attestationVerifier;
	},
	{
		IAccessControl: [
			"hasRole(bytes32,address)",
			"getRoleAdmin(bytes32)",
			"grantRole(bytes32,address)",
			"revokeRole(bytes32,address)",
			"renounceRole(bytes32,address)",
		],
		IAccessControlEnumerable: [
			"getRoleMember(bytes32,uint256)",
			"getRoleMemberCount(bytes32)",
		],
	},
);

testAdminRole("Attestation Verifier Admin", async function(_signers: Signer[], addrs: string[]) {
	const AttestationVerifier = await ethers.getContractFactory("AttestationVerifier");
    const attestationVerifier = await upgrades.deployProxy(
        AttestationVerifier,
        [[image1], [addrs[0]]],
        { kind: "uups" },
    );
    return attestationVerifier;
});

describe("Attestation Verifier - whitelisting images", function() {
    let signers: Signer[];
	let addrs: string[];

    let enclaveKeyMap: Record<string, AttestationVerifier.EnclaveImageStruct> = {};
    let attestationVerifier: AttestationVerifier;

	before(async function() {
		signers = await ethers.getSigners();
		addrs = await Promise.all(signers.map((a) => a.getAddress()));

        expect(addrs.length).to.be.greaterThanOrEqual(15, "Number of addresses are too less");

        enclaveKeyMap[addrs[13]] = image1;
        enclaveKeyMap[addrs[14]] = image2;
        const AttestationVerifier = await ethers.getContractFactory("AttestationVerifier");
        const attestationVerifierGeneric = await upgrades.deployProxy(
            AttestationVerifier,
            [Object.values(enclaveKeyMap), Object.keys(enclaveKeyMap)],
            { kind: "uups" },
        );
        attestationVerifier = getAttestationVerifier(attestationVerifierGeneric.address, signers[0]);
	});

	takeSnapshotBeforeAndAfterEveryTest(async () => {});

    it("whitelist image", async function() {
        const imageId = await attestationVerifier.isVerified(addrs[0]);
        expect(imageId).to.equal();
        expect(imageId).to.equal(keccak256(solidityPack(["bytes", "bytes", "bytes"], [image1.PCR0, image1.PCR1, image1.PCR2])));
        let {PCR0, PCR1, PCR2} = await attestationVerifier.whitelistedImages(imageId);
        expect({PCR0, PCR1, PCR2}).to.deep.equal(image1);
    });
});