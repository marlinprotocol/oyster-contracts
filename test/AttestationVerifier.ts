import { expect } from "chai";
import { BytesLike, Signer, Wallet } from "ethers";
import { ethers, upgrades } from "hardhat";
import { AttestationVerifier, IAttestationVerifier } from "../typechain-types";
import { takeSnapshotBeforeAndAfterEveryTest } from "../utils/testSuite";
import { keccak256, solidityPacked } from "ethers";
import { testERC165 } from "./helpers/erc165";
import { testAdminRole } from "./helpers/rbac";
import { time } from '@nomicfoundation/hardhat-network-helpers';

const image1: AttestationVerifier.EnclaveImageStruct = {
    PCR0: ethers.hexlify(ethers.randomBytes(48)),
    PCR1: ethers.hexlify(ethers.randomBytes(48)),
    PCR2: ethers.hexlify(ethers.randomBytes(48)),
};

const image2: AttestationVerifier.EnclaveImageStruct = {
    PCR0: ethers.hexlify(ethers.randomBytes(48)),
    PCR1: ethers.hexlify(ethers.randomBytes(48)),
    PCR2: ethers.hexlify(ethers.randomBytes(48)),
};

const image3: AttestationVerifier.EnclaveImageStruct = {
    PCR0: ethers.hexlify(ethers.randomBytes(48)),
    PCR1: ethers.hexlify(ethers.randomBytes(48)),
    PCR2: ethers.hexlify(ethers.randomBytes(48)),
};

describe("AttestationVerifier - Init", function() {
    let signers: Signer[];
    let addrs: string[];
    let wallets: Wallet[];
    let pubkeys: string[];

    before(async function() {
        signers = await ethers.getSigners();
        addrs = await Promise.all(signers.map((a) => a.getAddress()));
        wallets = signers.map((_, idx) => walletForIndex(idx));
        pubkeys = wallets.map((w) => normalize(w.signingKey.publicKey));
    });

    takeSnapshotBeforeAndAfterEveryTest(async () => { });

    it("deploys with initialization disabled", async function() {
        const AttestationVerifier = await ethers.getContractFactory("AttestationVerifier");
        const attestationVerifier = await AttestationVerifier.deploy();

        await expect(
            attestationVerifier.initialize([], [], addrs[0]),
        ).to.be.revertedWithCustomError(attestationVerifier, "InvalidInitialization");

        await expect(
            attestationVerifier.initialize([image1, image2], [pubkeys[13], pubkeys[14]], addrs[0]),
        ).to.be.revertedWithCustomError(attestationVerifier, "InvalidInitialization");
    });

    it("deploys as proxy and initializes", async function() {
        const AttestationVerifier = await ethers.getContractFactory("AttestationVerifier");
        const attestationVerifier = await upgrades.deployProxy(
            AttestationVerifier,
            [[image1], [pubkeys[13]], addrs[0]],
            { kind: "uups" },
        );

        expect(await attestationVerifier.hasRole(await attestationVerifier.DEFAULT_ADMIN_ROLE(), addrs[0])).to.be.true;
        expect(await attestationVerifier.isVerified(addrs[13])).to.equal(getImageId(image1));
        {
            const { PCR0, PCR1, PCR2 } = await attestationVerifier.whitelistedImages(getImageId(image1));
            expect({ PCR0, PCR1, PCR2 }).to.deep.equal(image1);
        }
    });

    it("deploys as proxy and initializes with multiple images", async function() {
        const AttestationVerifier = await ethers.getContractFactory("AttestationVerifier");
        const attestationVerifier = await upgrades.deployProxy(
            AttestationVerifier,
            [[image1, image2, image3], [pubkeys[13], pubkeys[14], pubkeys[15]], addrs[0]],
            { kind: "uups" },
        );

        expect(await attestationVerifier.hasRole(await attestationVerifier.DEFAULT_ADMIN_ROLE(), addrs[0])).to.be.true;
        expect(await attestationVerifier.isVerified(addrs[13])).to.equal(getImageId(image1));
        {
            const { PCR0, PCR1, PCR2 } = await attestationVerifier.whitelistedImages(getImageId(image1));
            expect({ PCR0, PCR1, PCR2 }).to.deep.equal(image1);
        }
        expect(await attestationVerifier.isVerified(addrs[14])).to.equal(getImageId(image2));
        {
            const { PCR0, PCR1, PCR2 } = await attestationVerifier.whitelistedImages(getImageId(image2));
            expect({ PCR0, PCR1, PCR2 }).to.deep.equal(image2);
        }
        expect(await attestationVerifier.isVerified(addrs[15])).to.equal(getImageId(image3));
        {
            const { PCR0, PCR1, PCR2 } = await attestationVerifier.whitelistedImages(getImageId(image3));
            expect({ PCR0, PCR1, PCR2 }).to.deep.equal(image3);
        }
    });

    it("cannot initialize with mismatched lengths", async function() {
        const AttestationVerifier = await ethers.getContractFactory("AttestationVerifier");
        await expect(
            upgrades.deployProxy(
                AttestationVerifier,
                [[image1, image2], [pubkeys[13], pubkeys[14], pubkeys[15]], addrs[0]],
                { kind: "uups" },
            )
        ).to.be.revertedWithCustomError(AttestationVerifier, "AttestationVerifierInitLengthMismatch");
        await expect(
            upgrades.deployProxy(
                AttestationVerifier,
                [[image1, image2, image3], [pubkeys[13], pubkeys[14]], addrs[0]],
                { kind: "uups" },
            )
        ).to.be.revertedWithCustomError(AttestationVerifier, "AttestationVerifierInitLengthMismatch");
    });

    it("cannot initialize with no whitelisted images", async function() {
        const AttestationVerifier = await ethers.getContractFactory("AttestationVerifier");
        await expect(
            upgrades.deployProxy(
                AttestationVerifier,
                [[], [], addrs[0]],
                { kind: "uups" },
            )
        ).to.be.revertedWithCustomError(AttestationVerifier, "AttestationVerifierNoImageProvided");
    });

    it("cannot initialize with zero address as admin", async function() {
        const AttestationVerifier = await ethers.getContractFactory("AttestationVerifier");
        await expect(
            upgrades.deployProxy(
                AttestationVerifier,
                [[image1, image2, image3], [pubkeys[13], pubkeys[14], pubkeys[15]], ethers.ZeroAddress],
                { kind: "uups" },
            )
        ).to.be.revertedWithCustomError(AttestationVerifier, "AttestationVerifierInvalidAdmin");
    });

    it("upgrades", async function() {
        const AttestationVerifier = await ethers.getContractFactory("AttestationVerifier");
        const attestationVerifier = await upgrades.deployProxy(
            AttestationVerifier,
            [[image1, image2, image3], [pubkeys[13], pubkeys[14], pubkeys[15]], addrs[0]],
            { kind: "uups" },
        );
        await upgrades.upgradeProxy(await attestationVerifier.getAddress(), AttestationVerifier, { kind: "uups" });

        expect(await attestationVerifier.hasRole(await attestationVerifier.DEFAULT_ADMIN_ROLE(), addrs[0])).to.be.true;
        expect(await attestationVerifier.isVerified(addrs[13])).to.equal(getImageId(image1));
        {
            const { PCR0, PCR1, PCR2 } = await attestationVerifier.whitelistedImages(getImageId(image1));
            expect({ PCR0, PCR1, PCR2 }).to.deep.equal(image1);
        }
        expect(await attestationVerifier.isVerified(addrs[14])).to.equal(getImageId(image2));
        {
            const { PCR0, PCR1, PCR2 } = await attestationVerifier.whitelistedImages(getImageId(image2));
            expect({ PCR0, PCR1, PCR2 }).to.deep.equal(image2);
        }
        expect(await attestationVerifier.isVerified(addrs[15])).to.equal(getImageId(image3));
        {
            const { PCR0, PCR1, PCR2 } = await attestationVerifier.whitelistedImages(getImageId(image3));
            expect({ PCR0, PCR1, PCR2 }).to.deep.equal(image3);
        }
    });

    it("does not upgrade without admin", async function() {
        const AttestationVerifier = await ethers.getContractFactory("AttestationVerifier");
        const attestationVerifier = await upgrades.deployProxy(
            AttestationVerifier,
            [[image1, image2, image3], [pubkeys[13], pubkeys[14], pubkeys[15]], addrs[0]],
            { kind: "uups" },
        );

        await expect(
            upgrades.upgradeProxy(await attestationVerifier.getAddress(), AttestationVerifier.connect(signers[1]), {
                kind: "uups",
            }),
        ).to.be.revertedWithCustomError(attestationVerifier, "AccessControlUnauthorizedAccount");
    });
});

testERC165(
    "AttestationVerifier - ERC165",
    async function(signers: Signer[], addrs: string[]) {
        let wallets = signers.map((_, idx) => walletForIndex(idx));
        let pubkeys = wallets.map((w) => normalize(w.signingKey.publicKey))
        const AttestationVerifier = await ethers.getContractFactory("AttestationVerifier");
        const attestationVerifier = await upgrades.deployProxy(
            AttestationVerifier,
            [[image1, image2, image3], [pubkeys[13], pubkeys[14], pubkeys[15]], addrs[0]],
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
    },
);

testAdminRole("AttestationVerifier - Admin", async function(signers: Signer[], addrs: string[]) {
    let wallets = signers.map((_, idx) => walletForIndex(idx));
    let pubkeys = wallets.map((w) => normalize(w.signingKey.publicKey))
    const AttestationVerifier = await ethers.getContractFactory("AttestationVerifier");
    const attestationVerifier = await upgrades.deployProxy(
        AttestationVerifier,
        [[image1, image2, image3], [pubkeys[13], pubkeys[14], pubkeys[15]], addrs[0]],
        { kind: "uups" },
    );
    return attestationVerifier;
});

describe("AttestationVerifier - Whitelist image", function() {
    let signers: Signer[];
    let addrs: string[];
    let wallets: Wallet[];
    let pubkeys: string[];

    let attestationVerifier: AttestationVerifier;

    before(async function() {
        signers = await ethers.getSigners();
        addrs = await Promise.all(signers.map((a) => a.getAddress()));
        wallets = signers.map((_, idx) => walletForIndex(idx));
        pubkeys = wallets.map((w) => normalize(w.signingKey.publicKey))

        const AttestationVerifier = await ethers.getContractFactory("AttestationVerifier");
        attestationVerifier = await upgrades.deployProxy(
            AttestationVerifier,
            [[image1, image2], [pubkeys[13], pubkeys[14]], addrs[0]],
            { kind: "uups" },
        ) as unknown as AttestationVerifier;
    });

    takeSnapshotBeforeAndAfterEveryTest(async () => { });

    it("non admin cannot whitelist image", async function() {
        await expect(attestationVerifier.connect(signers[1]).whitelistEnclaveImage(image3.PCR0, image3.PCR1, image3.PCR2)).to.be.revertedWithCustomError(attestationVerifier, "AccessControlUnauthorizedAccount");
    });

    it("admin can whitelist image", async function() {
        {
            const { PCR0, PCR1, PCR2 } = await attestationVerifier.whitelistedImages(getImageId(image3));
            expect([PCR0, PCR1, PCR2]).to.deep.equal(["0x", "0x", "0x"]);
        }

        await expect(attestationVerifier.whitelistEnclaveImage(image3.PCR0, image3.PCR1, image3.PCR2))
            .to.emit(attestationVerifier, "EnclaveImageWhitelisted").withArgs(getImageId(image3), image3.PCR0, image3.PCR1, image3.PCR2);
        {
            const { PCR0, PCR1, PCR2 } = await attestationVerifier.whitelistedImages(getImageId(image3));
            expect({ PCR0, PCR1, PCR2 }).to.deep.equal(image3);
        }
    });

    it("admin cannot whitelist image with empty PCRs", async function() {
        await expect(attestationVerifier.whitelistEnclaveImage("0x", "0x", "0x")).to.be.revertedWithCustomError(attestationVerifier, "AttestationVerifierPCRsInvalid");
    });

    it("admin cannot whitelist image with invalid PCRs", async function() {
        await expect(attestationVerifier.whitelistEnclaveImage("0x1111111111", image3.PCR1, image3.PCR2)).to.be.revertedWithCustomError(attestationVerifier, "AttestationVerifierPCRsInvalid");
        await expect(attestationVerifier.whitelistEnclaveImage(image3.PCR0, "0x1111111111", image3.PCR2)).to.be.revertedWithCustomError(attestationVerifier, "AttestationVerifierPCRsInvalid");
        await expect(attestationVerifier.whitelistEnclaveImage(image3.PCR0, image3.PCR1, "0x1111111111")).to.be.revertedWithCustomError(attestationVerifier, "AttestationVerifierPCRsInvalid");
    });

    it("admin cannot rewhitelist image", async function() {
        await expect(attestationVerifier.whitelistEnclaveImage(image3.PCR0, image3.PCR1, image3.PCR2))
            .to.emit(attestationVerifier, "EnclaveImageWhitelisted").withArgs(getImageId(image3), image3.PCR0, image3.PCR1, image3.PCR2);
        {
            const { PCR0, PCR1, PCR2 } = await attestationVerifier.whitelistedImages(getImageId(image3));
            expect({ PCR0, PCR1, PCR2 }).to.deep.equal(image3);
        }

        await expect(attestationVerifier.whitelistEnclaveImage(image3.PCR0, image3.PCR1, image3.PCR2)).to.be.revertedWithCustomError(attestationVerifier, "AttestationVerifierImageAlreadyWhitelisted");
    });
});

describe("AttestationVerifier - Revoke image", function() {
    let signers: Signer[];
    let addrs: string[];
    let wallets: Wallet[];
    let pubkeys: string[];

    let attestationVerifier: AttestationVerifier;

    before(async function() {
        signers = await ethers.getSigners();
        addrs = await Promise.all(signers.map((a) => a.getAddress()));
        wallets = signers.map((_, idx) => walletForIndex(idx));
        pubkeys = wallets.map((w) => normalize(w.signingKey.publicKey))

        const AttestationVerifier = await ethers.getContractFactory("AttestationVerifier");
        attestationVerifier = await upgrades.deployProxy(
            AttestationVerifier,
            [[image1, image2], [pubkeys[13], pubkeys[14]], addrs[0]],
            { kind: "uups" },
        ) as unknown as AttestationVerifier;
    });

    takeSnapshotBeforeAndAfterEveryTest(async () => { });

    it("non admin cannot revoke image", async function() {
        await expect(attestationVerifier.connect(signers[1]).revokeEnclaveImage(getImageId(image1))).to.be.revertedWithCustomError(attestationVerifier, "AccessControlUnauthorizedAccount");
    });

    it("admin can revoke image", async function() {
        {
            const { PCR0, PCR1, PCR2 } = await attestationVerifier.whitelistedImages(getImageId(image1));
            expect({ PCR0, PCR1, PCR2 }).to.deep.equal(image1);
        }

        await expect(attestationVerifier.revokeEnclaveImage(getImageId(image1)))
            .to.emit(attestationVerifier, "EnclaveImageRevoked").withArgs(getImageId(image1));
        {
            const { PCR0, PCR1, PCR2 } = await attestationVerifier.whitelistedImages(getImageId(image1));
            expect([PCR0, PCR1, PCR2]).to.deep.equal(["0x", "0x", "0x"]);
        }
    });

    it("admin cannot revoke unwhitelisted image", async function() {
        await expect(attestationVerifier.revokeEnclaveImage(getImageId(image3))).to.be.revertedWithCustomError(attestationVerifier, "AttestationVerifierImageNotWhitelisted");
    });
});

describe("AttestationVerifier - Whitelist enclave", function() {
    let signers: Signer[];
    let addrs: string[];
    let wallets: Wallet[];
    let pubkeys: string[];

    let attestationVerifier: AttestationVerifier;

    before(async function() {
        signers = await ethers.getSigners();
        addrs = await Promise.all(signers.map((a) => a.getAddress()));
        wallets = signers.map((_, idx) => walletForIndex(idx));
        pubkeys = wallets.map((w) => normalize(w.signingKey.publicKey))

        const AttestationVerifier = await ethers.getContractFactory("AttestationVerifier");
        attestationVerifier = await upgrades.deployProxy(
            AttestationVerifier,
            [[image1, image2], [pubkeys[13], pubkeys[14]], addrs[0]],
            { kind: "uups" },
        ) as unknown as AttestationVerifier;
    });

    takeSnapshotBeforeAndAfterEveryTest(async () => { });

    it("non admin cannot whitelist enclave", async function() {
        await expect(attestationVerifier.connect(signers[1]).whitelistEnclaveKey(pubkeys[15], getImageId(image1))).to.be.revertedWithCustomError(attestationVerifier, "AccessControlUnauthorizedAccount");
    });

    it("admin can whitelist enclave", async function() {
        expect(await attestationVerifier.isVerified(addrs[15])).to.equal(ethers.ZeroHash);

        await expect(attestationVerifier.whitelistEnclaveKey(pubkeys[15], getImageId(image1)))
            .to.emit(attestationVerifier, "EnclaveKeyWhitelisted").withArgs(pubkeys[15], getImageId(image1));
        expect(await attestationVerifier.isVerified(addrs[15])).to.equal(getImageId(image1));
    });

    it("admin cannot whitelist enclave with unwhitelisted image", async function() {
        await expect(attestationVerifier.whitelistEnclaveKey(pubkeys[15], getImageId(image3))).to.be.revertedWithCustomError(attestationVerifier, "AttestationVerifierImageNotWhitelisted");
    });

    it("admin cannot rewhitelist enclave", async function() {
        expect(await attestationVerifier.isVerified(addrs[15])).to.equal(ethers.ZeroHash);

        await expect(attestationVerifier.whitelistEnclaveKey(pubkeys[15], getImageId(image1)))
            .to.emit(attestationVerifier, "EnclaveKeyWhitelisted").withArgs(pubkeys[15], getImageId(image1));
        expect(await attestationVerifier.isVerified(addrs[15])).to.equal(getImageId(image1));

        await expect(attestationVerifier.whitelistEnclaveKey(pubkeys[15], getImageId(image1))).to.be.revertedWithCustomError(attestationVerifier, "AttestationVerifierKeyAlreadyVerified");
    });
});

describe("AttestationVerifier - Revoke enclave", function() {
    let signers: Signer[];
    let addrs: string[];
    let wallets: Wallet[];
    let pubkeys: string[];

    let attestationVerifier: AttestationVerifier;

    before(async function() {
        signers = await ethers.getSigners();
        addrs = await Promise.all(signers.map((a) => a.getAddress()));
        wallets = signers.map((_, idx) => walletForIndex(idx));
        pubkeys = wallets.map((w) => normalize(w.signingKey.publicKey))

        const AttestationVerifier = await ethers.getContractFactory("AttestationVerifier");
        attestationVerifier = await upgrades.deployProxy(
            AttestationVerifier,
            [[image1, image2], [pubkeys[13], pubkeys[14]], addrs[0]],
            { kind: "uups" },
        ) as unknown as AttestationVerifier;
    });

    takeSnapshotBeforeAndAfterEveryTest(async () => { });

    it("non admin cannot revoke enclave", async function() {
        await expect(attestationVerifier.connect(signers[1]).revokeEnclaveKey(pubkeys[14])).to.be.revertedWithCustomError(attestationVerifier, "AccessControlUnauthorizedAccount");
    });

    it("admin can revoke enclave", async function() {
        expect(await attestationVerifier.isVerified(addrs[14])).to.equal(getImageId(image2));

        await expect(attestationVerifier.revokeEnclaveKey(pubkeys[14]))
            .to.emit(attestationVerifier, "EnclaveKeyRevoked").withArgs(pubkeys[14]);
        expect(await attestationVerifier.isVerified(addrs[14])).to.equal(ethers.ZeroHash);
    });

    it("admin cannot revoke unwhitelisted enclave", async function() {
        await expect(attestationVerifier.revokeEnclaveKey(pubkeys[15])).to.be.revertedWithCustomError(attestationVerifier, "AttestationVerifierKeyNotVerified");
    });
});

describe("AttestationVerifier - Verify enclave key", function() {
    let signers: Signer[];
    let addrs: string[];
    let wallets: Wallet[];
    let pubkeys: string[];

    let attestationVerifier: AttestationVerifier;

    before(async function() {
        signers = await ethers.getSigners();
        addrs = await Promise.all(signers.map((a) => a.getAddress()));
        wallets = signers.map((_, idx) => walletForIndex(idx));
        pubkeys = wallets.map((w) => normalize(w.signingKey.publicKey))

        const AttestationVerifier = await ethers.getContractFactory("AttestationVerifier");
        attestationVerifier = await upgrades.deployProxy(
            AttestationVerifier,
            [[image1, image2], [pubkeys[13], pubkeys[14]], addrs[0]],
            { kind: "uups" },
        ) as unknown as AttestationVerifier;
    });

    takeSnapshotBeforeAndAfterEveryTest(async () => { });

    it("can verify enclave key", async function() {
        const timestamp = await time.latest() * 1000;
        let [signature, attestation] = await createAttestation(pubkeys[15], image1, wallets[14], timestamp - 240000);

        await expect(attestationVerifier.connect(signers[1]).verifyEnclaveKey(signature, attestation))
            .to.emit(attestationVerifier, "EnclaveKeyVerified").withArgs(pubkeys[15], getImageId(image1));
        expect(await attestationVerifier.isVerified(addrs[15])).to.equal(getImageId(image1));
    });

    it("cannot verify enclave key with too old attestation", async function() {
        const timestamp = await time.latest() * 1000;
        let [signature, attestation] = await createAttestation(pubkeys[15], image1, wallets[14], timestamp - 360000);

        await expect(attestationVerifier.connect(signers[1]).verifyEnclaveKey(signature, attestation))
            .to.be.revertedWithCustomError(attestationVerifier, "AttestationVerifierAttestationTooOld");
    });

    it("cannot verify enclave key with invalid data", async function() {
        const timestamp = await time.latest() * 1000;
        let [signature, attestation] = await createAttestation(pubkeys[15], image1, wallets[14], timestamp - 240000);

        await expect(attestationVerifier.connect(signers[1]).verifyEnclaveKey(signature, { ...attestation, enclavePubKey: pubkeys[16] }))
            .to.be.revertedWithCustomError(attestationVerifier, "AttestationVerifierKeyNotVerified");
        await expect(attestationVerifier.connect(signers[1]).verifyEnclaveKey(signature, { ...attestation, PCR0: attestation.PCR1 }))
            .to.be.revertedWithCustomError(attestationVerifier, "AttestationVerifierImageNotWhitelisted");
        await expect(attestationVerifier.connect(signers[1]).verifyEnclaveKey(signature, { ...attestation, PCR1: attestation.PCR0 }))
            .to.be.revertedWithCustomError(attestationVerifier, "AttestationVerifierImageNotWhitelisted");
        await expect(attestationVerifier.connect(signers[1]).verifyEnclaveKey(signature, { ...attestation, PCR2: attestation.PCR0 }))
            .to.be.revertedWithCustomError(attestationVerifier, "AttestationVerifierImageNotWhitelisted");
        await expect(attestationVerifier.connect(signers[1]).verifyEnclaveKey(signature, { ...attestation, PCR0: image2.PCR0, PCR1: image2.PCR1, PCR2: image2.PCR2 }))
            .to.be.revertedWithCustomError(attestationVerifier, "AttestationVerifierKeyNotVerified");
        await expect(attestationVerifier.connect(signers[1]).verifyEnclaveKey(signature, { ...attestation, timestampInMilliseconds: timestamp - 200000 }))
            .to.be.revertedWithCustomError(attestationVerifier, "AttestationVerifierKeyNotVerified");
    });

    it("cannot verify enclave key with invalid public key", async function() {
        const timestamp = await time.latest() * 1000;
        let [signature, attestation] = await createAttestation(ethers.ZeroAddress, image1, wallets[14], timestamp - 240000);

        await expect(attestationVerifier.connect(signers[1]).verifyEnclaveKey(signature, attestation))
            .to.be.revertedWithCustomError(attestationVerifier, "AttestationVerifierPubkeyLengthInvalid");
    });

    it("cannot verify enclave key with unwhitelisted image", async function() {
        const timestamp = await time.latest() * 1000;
        let [signature, attestation] = await createAttestation(pubkeys[15], image3, wallets[14], timestamp - 240000);

        await expect(attestationVerifier.connect(signers[1]).verifyEnclaveKey(signature, attestation))
            .to.be.revertedWithCustomError(attestationVerifier, "AttestationVerifierImageNotWhitelisted");
    });

    it("cannot reverify enclave key", async function() {
        const timestamp = await time.latest() * 1000;
        let [signature, attestation] = await createAttestation(pubkeys[15], image1, wallets[14], timestamp - 240000);

        await expect(attestationVerifier.connect(signers[1]).verifyEnclaveKey(signature, attestation))
            .to.emit(attestationVerifier, "EnclaveKeyVerified").withArgs(pubkeys[15], getImageId(image1));
        expect(await attestationVerifier.isVerified(addrs[15])).to.equal(getImageId(image1));

        await expect(attestationVerifier.connect(signers[1]).verifyEnclaveKey(signature, attestation))
            .to.be.revertedWithCustomError(attestationVerifier, "AttestationVerifierKeyAlreadyVerified");
    });

    it("cannot verify enclave key with unwhitelisted key", async function() {
        const timestamp = await time.latest() * 1000;
        let [signature, attestation] = await createAttestation(pubkeys[15], image1, wallets[16], timestamp - 240000);

        await expect(attestationVerifier.connect(signers[1]).verifyEnclaveKey(signature, attestation))
            .to.be.revertedWithCustomError(attestationVerifier, "AttestationVerifierKeyNotVerified");
    });

    it("cannot verify enclave key with revoked key", async function() {
        const timestamp = await time.latest() * 1000;
        let [signature, attestation] = await createAttestation(pubkeys[15], image1, wallets[14], timestamp - 240000);

        await attestationVerifier.revokeEnclaveKey(pubkeys[14]);

        await expect(attestationVerifier.connect(signers[1]).verifyEnclaveKey(signature, attestation))
            .to.be.revertedWithCustomError(attestationVerifier, "AttestationVerifierKeyNotVerified");
    });

    it("cannot verify enclave key with revoked image", async function() {
        const timestamp = await time.latest() * 1000;
        let [signature, attestation] = await createAttestation(pubkeys[15], image1, wallets[14], timestamp - 240000);

        await attestationVerifier.revokeEnclaveImage(getImageId(image2));

        await expect(attestationVerifier.connect(signers[1]).verifyEnclaveKey(signature, attestation))
            .to.be.revertedWithCustomError(attestationVerifier, "AttestationVerifierImageNotWhitelisted");
    });
});

describe("AttestationVerifier - Safe verify with params", function() {
    let signers: Signer[];
    let addrs: string[];
    let wallets: Wallet[];
    let pubkeys: string[];

    let attestationVerifier: AttestationVerifier;

    before(async function() {
        signers = await ethers.getSigners();
        addrs = await Promise.all(signers.map((a) => a.getAddress()));
        wallets = signers.map((_, idx) => walletForIndex(idx));
        pubkeys = wallets.map((w) => normalize(w.signingKey.publicKey))

        const AttestationVerifier = await ethers.getContractFactory("AttestationVerifier");
        attestationVerifier = await upgrades.deployProxy(
            AttestationVerifier,
            [[image1, image2], [pubkeys[13], pubkeys[14]], addrs[0]],
            { kind: "uups" },
        ) as unknown as AttestationVerifier;
    });

    takeSnapshotBeforeAndAfterEveryTest(async () => { });

    it("can verify", async function() {
        let [signature, attestation] = await createAttestation(pubkeys[15], image3, wallets[14], 300000);

        await expect(attestationVerifier.connect(signers[1])['verify(bytes,(bytes,bytes,bytes,bytes,uint256))'](
            signature, attestation,
        )).to.not.be.reverted;
    });

    it("cannot verify with invalid data", async function() {
        let [signature, attestation] = await createAttestation(pubkeys[15], image3, wallets[14], 300000);

        await expect(attestationVerifier.connect(signers[1])['verify(bytes,(bytes,bytes,bytes,bytes,uint256))'](
            signature, { ...attestation, enclavePubKey: pubkeys[16] },
        )).to.be.revertedWithCustomError(attestationVerifier, "AttestationVerifierKeyNotVerified");
        await expect(attestationVerifier.connect(signers[1])['verify(bytes,(bytes,bytes,bytes,bytes,uint256))'](
            signature, { ...attestation, PCR0: attestation.PCR1 },
        )).to.be.revertedWithCustomError(attestationVerifier, "AttestationVerifierKeyNotVerified");
        await expect(attestationVerifier.connect(signers[1])['verify(bytes,(bytes,bytes,bytes,bytes,uint256))'](
            signature, { ...attestation, PCR1: attestation.PCR0 },
        )).to.be.revertedWithCustomError(attestationVerifier, "AttestationVerifierKeyNotVerified");
        await expect(attestationVerifier.connect(signers[1])['verify(bytes,(bytes,bytes,bytes,bytes,uint256))'](
            signature, { ...attestation, PCR2: attestation.PCR0 },
        )).to.be.revertedWithCustomError(attestationVerifier, "AttestationVerifierKeyNotVerified");
        await expect(attestationVerifier.connect(signers[1])['verify(bytes,(bytes,bytes,bytes,bytes,uint256))'](
            signature, { ...attestation, PCR0: image2.PCR0, PCR1: image2.PCR1, PCR2: image2.PCR2 },
        )).to.be.revertedWithCustomError(attestationVerifier, "AttestationVerifierKeyNotVerified");
        await expect(attestationVerifier.connect(signers[1])['verify(bytes,(bytes,bytes,bytes,bytes,uint256))'](
            signature, { ...attestation, timestampInMilliseconds: 200000 },
        )).to.be.revertedWithCustomError(attestationVerifier, "AttestationVerifierKeyNotVerified");
    });

    it("cannot verify with unwhitelisted key", async function() {
        let [signature, attestation] = await createAttestation(pubkeys[15], image3, wallets[16], 300000);

        await expect(attestationVerifier.connect(signers[1])['verify(bytes,(bytes,bytes,bytes,bytes,uint256))'](
            signature, attestation,
        )).to.be.revertedWithCustomError(attestationVerifier, "AttestationVerifierKeyNotVerified");
    });

    it("cannot verify with revoked key", async function() {
        let [signature, attestation] = await createAttestation(pubkeys[15], image3, wallets[14], 300000);

        await attestationVerifier.revokeEnclaveKey(pubkeys[14]);

        await expect(attestationVerifier.connect(signers[1])['verify(bytes,(bytes,bytes,bytes,bytes,uint256))'](
            signature, attestation,
        )).to.be.revertedWithCustomError(attestationVerifier, "AttestationVerifierKeyNotVerified");
    });

    it("cannot verify with revoked image", async function() {
        let [signature, attestation] = await createAttestation(pubkeys[15], image3, wallets[14], 300000);

        await attestationVerifier.revokeEnclaveImage(getImageId(image2));

        await expect(attestationVerifier.connect(signers[1])['verify(bytes,(bytes,bytes,bytes,bytes,uint256))'](
            signature, attestation,
        )).to.be.revertedWithCustomError(attestationVerifier, "AttestationVerifierImageNotWhitelisted");
    });
});

describe("AttestationVerifier - Safe verify with bytes", function() {
    let signers: Signer[];
    let addrs: string[];
    let wallets: Wallet[];
    let pubkeys: string[];

    let attestationVerifier: AttestationVerifier;

    before(async function() {
        signers = await ethers.getSigners();
        addrs = await Promise.all(signers.map((a) => a.getAddress()));
        wallets = signers.map((_, idx) => walletForIndex(idx));
        pubkeys = wallets.map((w) => normalize(w.signingKey.publicKey))

        const AttestationVerifier = await ethers.getContractFactory("AttestationVerifier");
        attestationVerifier = await upgrades.deployProxy(
            AttestationVerifier,
            [[image1, image2], [pubkeys[13], pubkeys[14]], addrs[0]],
            { kind: "uups" },
        ) as unknown as AttestationVerifier;
    });

    takeSnapshotBeforeAndAfterEveryTest(async () => { });

    it("can verify", async function() {
        let [signature, attestation] = await createAttestation(pubkeys[15], image3, wallets[14], 300000);

        await expect(attestationVerifier.connect(signers[1])['verify(bytes)'](
            ethers.AbiCoder.defaultAbiCoder().encode(
                ["bytes", "(bytes,bytes,bytes,bytes,uint256)"],
                [signature, Object.values(attestation)],
            ),
        )).to.not.be.reverted;
    });

    it("cannot verify with invalid data", async function() {
        let [signature, attestation] = await createAttestation(pubkeys[15], image3, wallets[14], 300000);

        await expect(attestationVerifier.connect(signers[1])['verify(bytes)'](
            ethers.AbiCoder.defaultAbiCoder().encode(
                ["bytes", "(bytes,bytes,bytes,bytes,uint256)"],
                [signature, Object.values({ ...attestation, enclavePubKey: pubkeys[16] })],
            ),
        )).to.be.revertedWithCustomError(attestationVerifier, "AttestationVerifierKeyNotVerified");
        await expect(attestationVerifier.connect(signers[1])['verify(bytes)'](
            ethers.AbiCoder.defaultAbiCoder().encode(
                ["bytes", "(bytes,bytes,bytes,bytes,uint256)"],
                [signature, Object.values({ ...attestation, PCR0: attestation.PCR1 })],
            ),
        )).to.be.revertedWithCustomError(attestationVerifier, "AttestationVerifierKeyNotVerified");
        await expect(attestationVerifier.connect(signers[1])['verify(bytes)'](
            ethers.AbiCoder.defaultAbiCoder().encode(
                ["bytes", "(bytes,bytes,bytes,bytes,uint256)"],
                [signature, Object.values({ ...attestation, PCR1: attestation.PCR0 })],
            ),
        )).to.be.revertedWithCustomError(attestationVerifier, "AttestationVerifierKeyNotVerified");
        await expect(attestationVerifier.connect(signers[1])['verify(bytes)'](
            ethers.AbiCoder.defaultAbiCoder().encode(
                ["bytes", "(bytes,bytes,bytes,bytes,uint256)"],
                [signature, Object.values({ ...attestation, PCR2: attestation.PCR0 })],
            ),
        )).to.be.revertedWithCustomError(attestationVerifier, "AttestationVerifierKeyNotVerified");
        await expect(attestationVerifier.connect(signers[1])['verify(bytes)'](
            ethers.AbiCoder.defaultAbiCoder().encode(
                ["bytes", "(bytes,bytes,bytes,bytes,uint256)"],
                [signature, Object.values({ ...attestation, PCR0: image2.PCR0, PCR1: image2.PCR1, PCR2: image2.PCR2 })],
            ),
        )).to.be.revertedWithCustomError(attestationVerifier, "AttestationVerifierKeyNotVerified");
        await expect(attestationVerifier.connect(signers[1])['verify(bytes)'](
            ethers.AbiCoder.defaultAbiCoder().encode(
                ["bytes", "(bytes,bytes,bytes,bytes,uint256)"],
                [signature, Object.values({ ...attestation, timestampInMilliseconds: 200000 })],
            ),
        )).to.be.revertedWithCustomError(attestationVerifier, "AttestationVerifierKeyNotVerified");
    });

    it("cannot verify with unwhitelisted key", async function() {
        let [signature, attestation] = await createAttestation(pubkeys[15], image3, wallets[16], 300000);

        await expect(attestationVerifier.connect(signers[1])['verify(bytes)'](
            ethers.AbiCoder.defaultAbiCoder().encode(
                ["bytes", "(bytes,bytes,bytes,bytes,uint256)"],
                [signature, Object.values(attestation)],
            ),
        )).to.be.revertedWithCustomError(attestationVerifier, "AttestationVerifierKeyNotVerified");
    });

    it("cannot verify with revoked key", async function() {
        let [signature, attestation] = await createAttestation(pubkeys[15], image3, wallets[14], 300000);

        await attestationVerifier.revokeEnclaveKey(pubkeys[14]);

        await expect(attestationVerifier.connect(signers[1])['verify(bytes)'](
            ethers.AbiCoder.defaultAbiCoder().encode(
                ["bytes", "(bytes,bytes,bytes,bytes,uint256)"],
                [signature, Object.values(attestation)],
            ),
        )).to.be.revertedWithCustomError(attestationVerifier, "AttestationVerifierKeyNotVerified");
    });

    it("cannot verify with revoked image", async function() {
        let [signature, attestation] = await createAttestation(pubkeys[15], image3, wallets[14], 300000);

        await attestationVerifier.revokeEnclaveImage(getImageId(image2));

        await expect(attestationVerifier.connect(signers[1])['verify(bytes)'](
            ethers.AbiCoder.defaultAbiCoder().encode(
                ["bytes", "(bytes,bytes,bytes,bytes,uint256)"],
                [signature, Object.values(attestation)],
            ),
        )).to.be.revertedWithCustomError(attestationVerifier, "AttestationVerifierImageNotWhitelisted");
    });
});

function getImageId(image: AttestationVerifier.EnclaveImageStruct): string {
    return keccak256(solidityPacked(["bytes", "bytes", "bytes"], [image.PCR0, image.PCR1, image.PCR2]));
}

function normalize(key: string): string {
    return '0x' + key.substring(4);
}

const domain = {
    name: 'marlin.oyster.AttestationVerifier',
    version: '1',
};

const types = {
    Attestation: [
        { name: 'enclavePubKey', type: 'bytes' },
        { name: 'PCR0', type: 'bytes' },
        { name: 'PCR1', type: 'bytes' },
        { name: 'PCR2', type: 'bytes' },
        { name: 'timestampInMilliseconds', type: 'uint256' },
    ]
}

type Attestation = {
    enclavePubKey: string,
    PCR0: BytesLike,
    PCR1: BytesLike,
    PCR2: BytesLike,
    timestampInMilliseconds: number,
}

async function createAttestation(
    enclaveKey: string,
    image: AttestationVerifier.EnclaveImageStruct,
    sourceEnclaveKey: Wallet,
    timestamp: number,
): Promise<[string, Attestation]> {
    const sign = await sourceEnclaveKey.signTypedData(domain, types, {
        enclavePubKey: enclaveKey,
        PCR0: image.PCR0,
        PCR1: image.PCR1,
        PCR2: image.PCR2,
        timestampInMilliseconds: timestamp,
    });
    return [ethers.Signature.from(sign).serialized, {
        enclavePubKey: enclaveKey,
        PCR0: image.PCR0,
        PCR1: image.PCR1,
        PCR2: image.PCR2,
        timestampInMilliseconds: timestamp,
    }];
}

function walletForIndex(idx: number): Wallet {
    let wallet = ethers.HDNodeWallet.fromPhrase("test test test test test test test test test test test junk", undefined, "m/44'/60'/0'/0/" + idx.toString());

    return new Wallet(wallet.privateKey);
}
