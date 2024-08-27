import { setNextBlockBaseFeePerGas, time } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from "chai";
import { BytesLike, Signer, Wallet, ZeroAddress, keccak256, parseUnits, solidityPacked } from "ethers";
import { ethers, upgrades } from "hardhat";
import { AttestationAutherUpgradeable, AttestationVerifier, Relay, USDCoin, UserSample } from "../../typechain-types";
import { takeSnapshotBeforeAndAfterEveryTest } from "../../utils/testSuite";
import { testERC165 } from '../helpers/erc165';

const image1: AttestationAutherUpgradeable.EnclaveImageStruct = {
	PCR0: ethers.hexlify(ethers.randomBytes(48)),
	PCR1: ethers.hexlify(ethers.randomBytes(48)),
	PCR2: ethers.hexlify(ethers.randomBytes(48)),
};

const image2: AttestationAutherUpgradeable.EnclaveImageStruct = {
	PCR0: ethers.hexlify(ethers.randomBytes(48)),
	PCR1: ethers.hexlify(ethers.randomBytes(48)),
	PCR2: ethers.hexlify(ethers.randomBytes(48)),
};

const image3: AttestationAutherUpgradeable.EnclaveImageStruct = {
	PCR0: ethers.hexlify(ethers.randomBytes(48)),
	PCR1: ethers.hexlify(ethers.randomBytes(48)),
	PCR2: ethers.hexlify(ethers.randomBytes(48)),
};

function getImageId(image: AttestationAutherUpgradeable.EnclaveImageStruct): string {
	return keccak256(solidityPacked(["bytes", "bytes", "bytes"], [image.PCR0, image.PCR1, image.PCR2]));
}

describe("Relay - Init", function () {
	let signers: Signer[];
	let addrs: string[];
	let attestationVerifier: string;
	let token: string;

	let maxAge: number;
    let globalMinTimeout: number;  // in milliseconds
    let globalMaxTimeout: number;  // in milliseconds
    let overallTimeout: number;
    let executionFeePerMs: number;  // fee is in USDC
    let gatewayFeePerJob: number;
	let fixedGas: number;
	let callbackMeasureGas: number;

	before(async function () {
		signers = await ethers.getSigners();
		addrs = await Promise.all(signers.map((a) => a.getAddress()));

		attestationVerifier = addrs[1];
		token = addrs[1];
        maxAge = 600;
        globalMinTimeout = 10 * 1000;  // in milliseconds
        globalMaxTimeout = 100 * 1000;  // in milliseconds
        overallTimeout = 100;
        executionFeePerMs = 10;  // fee is in USDC
        gatewayFeePerJob = 10;
		fixedGas = 150000;
    	callbackMeasureGas = 4530;
	});

	takeSnapshotBeforeAndAfterEveryTest(async () => { });

	it("deploys with initialization disabled", async function () {
		const Relay = await ethers.getContractFactory("Relay");
		const relay = await Relay.deploy(
			attestationVerifier,
			maxAge,
			token,
			globalMinTimeout,
			globalMaxTimeout,
			overallTimeout,
			executionFeePerMs,
			gatewayFeePerJob,
			fixedGas,
			callbackMeasureGas
		);

		await expect(
			relay.initialize(addrs[0], [image1]),
		).to.be.revertedWithCustomError(Relay, "InvalidInitialization");
	});

	it("deploys as proxy and initializes", async function () {
		const Relay = await ethers.getContractFactory("Relay");
		const relay = await upgrades.deployProxy(
			Relay,
			[addrs[0], [image1]],
			{
				kind: "uups",
				initializer: "initialize",
				constructorArgs: [
					attestationVerifier,
					maxAge,
					token,
					globalMinTimeout,
					globalMaxTimeout,
					overallTimeout,
					executionFeePerMs,
					gatewayFeePerJob,
					fixedGas,
					callbackMeasureGas
				]
			},
		);

		expect(await relay.hasRole(await relay.DEFAULT_ADMIN_ROLE(), addrs[0])).to.be.true;
	});

	it("cannot deploy with zero address as token", async function () {
		const Relay = await ethers.getContractFactory("Relay");
		await expect(
			upgrades.deployProxy(
				Relay,
				[addrs[0], [image1]],
				{
					kind: "uups",
					initializer: "initialize",
					constructorArgs: [
						attestationVerifier,
						maxAge,
						ZeroAddress,
						globalMinTimeout,
						globalMaxTimeout,
						overallTimeout,
						executionFeePerMs,
						gatewayFeePerJob,
						fixedGas,
						callbackMeasureGas
					]
				},
			)
		).to.be.revertedWithCustomError(Relay, "RelayInvalidToken");
	});

	it("cannot initialize with zero address as admin", async function () {
		const Relay = await ethers.getContractFactory("Relay");
		await expect(
			upgrades.deployProxy(
				Relay,
				[
					ZeroAddress,
					[image1]
				],
				{
					kind: "uups",
					initializer: "initialize",
					constructorArgs: [
						attestationVerifier,
						maxAge,
						token,
						globalMinTimeout,
						globalMaxTimeout,
						overallTimeout,
						executionFeePerMs,
						gatewayFeePerJob,
						fixedGas,
						callbackMeasureGas
					]
				},
			)
		).to.be.revertedWithCustomError(Relay, "RelayZeroAddressAdmin");
	});

	it("cannot deploy with globalMaxTimeout smaller than globalMinTimeout", async function () {
		const Relay = await ethers.getContractFactory("Relay");
		await expect(
			upgrades.deployProxy(
				Relay,
				[addrs[0], [image1]],
				{
					kind: "uups",
					initializer: "initialize",
					constructorArgs: [
						attestationVerifier,
						maxAge,
						token,
						globalMaxTimeout,
						globalMinTimeout,
						overallTimeout,
						executionFeePerMs,
						gatewayFeePerJob,
						fixedGas,
						callbackMeasureGas
					]
				},
			)
		).to.be.revertedWithCustomError(Relay, "RelayInvalidGlobalTimeouts");
	});

	it("upgrades", async function () {
		const Relay = await ethers.getContractFactory("Relay");
		const relay = await upgrades.deployProxy(
			Relay,
			[
				addrs[0],
				[image1]
			],
			{
				kind: "uups",
				initializer: "initialize",
				constructorArgs: [
					attestationVerifier,
					maxAge,
					token,
					globalMinTimeout,
					globalMaxTimeout,
					overallTimeout,
					executionFeePerMs,
					gatewayFeePerJob,
					fixedGas,
					callbackMeasureGas
				]
			},
		);
		await upgrades.upgradeProxy(
			relay.target,
			Relay,
			{
				kind: "uups",
				constructorArgs: [
					attestationVerifier,
					maxAge,
					token,
					globalMinTimeout,
					globalMaxTimeout,
					overallTimeout,
					executionFeePerMs,
					gatewayFeePerJob,
					fixedGas,
					callbackMeasureGas
				]
			}
		);

		expect(await relay.hasRole(await relay.DEFAULT_ADMIN_ROLE(), addrs[0])).to.be.true;
	});

	it("does not upgrade without admin", async function () {
		const Relay = await ethers.getContractFactory("Relay");
		const relay = await upgrades.deployProxy(
			Relay,
			[addrs[0], [image1]],
			{
				kind: "uups",
				initializer: "initialize",
				constructorArgs: [
					attestationVerifier,
					maxAge,
					token,
					globalMinTimeout,
					globalMaxTimeout,
					overallTimeout,
					executionFeePerMs,
					gatewayFeePerJob,
					fixedGas,
					callbackMeasureGas
				]
			}
		);

		await expect(
			upgrades.upgradeProxy(
				relay.target, Relay.connect(signers[1]),
				{
					kind: "uups",
					constructorArgs: [
						attestationVerifier,
						maxAge,
						token,
						globalMinTimeout,
						globalMaxTimeout,
						overallTimeout,
						executionFeePerMs,
						gatewayFeePerJob,
						fixedGas,
						callbackMeasureGas
					]
				}
			)
		).to.be.revertedWithCustomError(Relay, "AccessControlUnauthorizedAccount");
	});
});

testERC165(
	"Relay - ERC165",
	async function(_signers: Signer[], addrs: string[]) {
		let attestationVerifier = addrs[1],
			token = addrs[1],
			maxAge = 600,
			globalMinTimeout = 10 * 1000,  // in milliseconds
			globalMaxTimeout = 100 * 1000,  // in milliseconds
			overallTimeout = 100,
			executionFeePerMs = 10,  // fee is in USDC
			gatewayFeePerJob = 10;
			let fixedGas = 150000;
			let callbackMeasureGas = 4530;
		const Relay = await ethers.getContractFactory("Relay");
		const relay = await upgrades.deployProxy(
			Relay,
			[addrs[0], [image1]],
			{
				kind: "uups",
				initializer: "initialize",
				constructorArgs: [
					attestationVerifier,
					maxAge,
					token,
					globalMinTimeout,
					globalMaxTimeout,
					overallTimeout,
					executionFeePerMs,
					gatewayFeePerJob,
					fixedGas,
					callbackMeasureGas
				]
			}
		);
		return relay;
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

describe("Relay - Whitelist/Revoke enclave", function () {
	let signers: Signer[];
	let addrs: string[];
	let wallets: Wallet[];
	let pubkeys: string[];
	let relay: Relay;

	before(async function () {
		signers = await ethers.getSigners();
		addrs = await Promise.all(signers.map((a) => a.getAddress()));
        wallets = signers.map((_, idx) => walletForIndex(idx));
		pubkeys = wallets.map((w) => normalize(w.signingKey.publicKey));

		let attestationVerifier = addrs[1],
			token = addrs[1];

		let admin = addrs[0],
			images = [image2],
			maxAge = 600,
			globalMinTimeout = 10 * 1000,  // in milliseconds
			globalMaxTimeout = 100 * 1000,  // in milliseconds
			overallTimeout = 100,
			executionFeePerMs = 10,  // fee is in USDC
			gatewayFeePerJob = 10,
			fixedGas = 150000,
			callbackMeasureGas = 4530;
		const Relay = await ethers.getContractFactory("Relay");
		relay = await upgrades.deployProxy(
			Relay,
			[admin, images],
			{
				kind: "uups",
				initializer: "initialize",
				constructorArgs: [
					attestationVerifier,
					maxAge,
					token,
					globalMinTimeout,
					globalMaxTimeout,
					overallTimeout,
					executionFeePerMs,
					gatewayFeePerJob,
					fixedGas,
					callbackMeasureGas
				]
			},
		) as unknown as Relay;
	});

	takeSnapshotBeforeAndAfterEveryTest(async () => { });

	it("can whitelist enclave image with admin account", async function () {
		await expect(relay.connect(signers[0]).whitelistEnclaveImage(image1.PCR0, image1.PCR1, image1.PCR2))
			.to.emit(relay, "EnclaveImageWhitelisted").withArgs(getImageId(image1), image1.PCR0, image1.PCR1, image1.PCR2);

		const { PCR0, PCR1, PCR2 } = await relay.getWhitelistedImage(getImageId(image1));
		expect({PCR0, PCR1, PCR2}).to.deep.equal(image1);
	});

	it("cannot whitelist enclave image without admin account", async function () {
		await expect(relay.connect(signers[1]).whitelistEnclaveImage(image1.PCR0, image1.PCR1, image1.PCR2))
			.to.be.revertedWithCustomError(relay, "AccessControlUnauthorizedAccount");
	});

	it("can revoke enclave image with admin account", async function () {
		await expect(relay.connect(signers[0]).revokeEnclaveImage(getImageId(image2)))
			.to.emit(relay, "EnclaveImageRevoked").withArgs(getImageId(image2));

		const { PCR0 } = await relay.getWhitelistedImage(getImageId(image2));
		expect(PCR0).to.equal("0x");
	});

	it("cannot revoke enclave image without admin account", async function () {
		await expect(relay.connect(signers[1]).revokeEnclaveImage(getImageId(image2)))
			.to.be.revertedWithCustomError(relay, "AccessControlUnauthorizedAccount");
	});
});

describe("Relay - Register gateway", function () {
	let signers: Signer[];
	let addrs: string[];
	let wallets: Wallet[];
	let pubkeys: string[];
	let token: USDCoin;
	let attestationVerifier: AttestationVerifier;
	let relay: Relay;

	before(async function () {
		signers = await ethers.getSigners();
		addrs = await Promise.all(signers.map((a) => a.getAddress()));
		wallets = signers.map((_, idx) => walletForIndex(idx));
		pubkeys = wallets.map((w) => normalize(w.signingKey.publicKey));

		const AttestationVerifier = await ethers.getContractFactory("AttestationVerifier");
		attestationVerifier = await upgrades.deployProxy(
			AttestationVerifier,
			[[image1], [pubkeys[14]], addrs[0]],
			{ kind: "uups" },
		) as unknown as AttestationVerifier;

		const USDCoin = await ethers.getContractFactory("USDCoin");
		token = await upgrades.deployProxy(
			USDCoin,
			[addrs[0]],
			{
				kind: "uups",
			}
		) as unknown as USDCoin;

		let admin = addrs[0],
			images = [image1, image2],
			maxAge = 600,
			globalMinTimeout = 10 * 1000,  // in milliseconds
			globalMaxTimeout = 100 * 1000,  // in milliseconds
			overallTimeout = 100,
			executionFeePerMs = 10,  // fee is in USDC
			gatewayFeePerJob = 10,
			fixedGas = 150000,
			callbackMeasureGas = 4530;
		const Relay = await ethers.getContractFactory("Relay");
		relay = await upgrades.deployProxy(
			Relay,
			[admin, images],
			{
				kind: "uups",
				initializer: "initialize",
				constructorArgs: [
					attestationVerifier.target,
					maxAge,
					token.target,
					globalMinTimeout,
					globalMaxTimeout,
					overallTimeout,
					executionFeePerMs,
					gatewayFeePerJob,
					fixedGas,
					callbackMeasureGas
				]
			},
		) as unknown as Relay;

	});

	takeSnapshotBeforeAndAfterEveryTest(async () => { });

	it("can register gateway", async function () {
		const timestamp = await time.latest() * 1000;
		let [signature, attestation] = await createAttestation(pubkeys[15], image2, wallets[14], timestamp - 540000);

		let signTimestamp = await time.latest();
		let signedDigest = await createGatewaySignature(addrs[1], signTimestamp, wallets[15]);

		await expect(relay.connect(signers[1]).registerGateway(signature, attestation, signedDigest, signTimestamp))
			.to.emit(relay, "GatewayRegistered").withArgs(addrs[1], addrs[15]);
		expect(await relay.getVerifiedKey(addrs[15])).to.equal(getImageId(image2));
	});

	it("cannot register gateway with expired signature", async function () {
		const timestamp = await time.latest() * 1000;
		let [signature, attestation] = await createAttestation(pubkeys[15], image2, wallets[14], timestamp - 540000);

		let signTimestamp = await time.latest() - 700;
		let signedDigest = await createGatewaySignature(addrs[1], signTimestamp, wallets[15]);

		await expect(relay.connect(signers[1]).registerGateway(signature, attestation, signedDigest, signTimestamp))
			.to.revertedWithCustomError(relay, "RelaySignatureTooOld");
	});

	it("cannot register gateway with invalid signer", async function () {
		const timestamp = await time.latest() * 1000;
		let [signature, attestation] = await createAttestation(pubkeys[15], image2, wallets[14], timestamp - 540000);

		let signTimestamp = await time.latest();
		let signedDigest = await createGatewaySignature(addrs[1], signTimestamp, wallets[16]);

		await expect(relay.connect(signers[1]).registerGateway(signature, attestation, signedDigest, signTimestamp))
			.to.revertedWithCustomError(relay, "RelayInvalidSigner");
	});

	it("cannot register gateway with same enclaveAddress twice", async function () {
		const timestamp = await time.latest() * 1000;
		let [signature, attestation] = await createAttestation(pubkeys[15], image2, wallets[14], timestamp - 540000);

		let signTimestamp = await time.latest();
		let signedDigest = await createGatewaySignature(addrs[1], signTimestamp, wallets[15]);

		await expect(relay.connect(signers[1]).registerGateway(signature, attestation, signedDigest, signTimestamp))
			.to.emit(relay, "GatewayRegistered").withArgs(addrs[1], addrs[15]);

		await expect(relay.connect(signers[1]).registerGateway(signature, attestation, signedDigest, signTimestamp))
			.to.revertedWithCustomError(relay, "RelayGatewayAlreadyExists");
	});

	it('can deregister gateway', async function () {
		const timestamp = await time.latest() * 1000;
		let [signature, attestation] = await createAttestation(pubkeys[15], image2, wallets[14], timestamp - 540000);

		let signTimestamp = await time.latest();
		let signedDigest = await createGatewaySignature(addrs[1], signTimestamp, wallets[15]);

		await relay.connect(signers[1]).registerGateway(signature, attestation, signedDigest, signTimestamp);

		await expect(relay.connect(signers[1]).deregisterGateway(addrs[15]))
			.to.emit(relay, "GatewayDeregistered").withArgs(addrs[15]);
	});

	it('cannot deregister gateway without gateway owner', async function () {
		const timestamp = await time.latest() * 1000;
		let [signature, attestation] = await createAttestation(pubkeys[15], image2, wallets[14], timestamp - 540000);

		let signTimestamp = await time.latest();
		let signedDigest = await createGatewaySignature(addrs[1], signTimestamp, wallets[15]);

		await relay.connect(signers[1]).registerGateway(signature, attestation, signedDigest, signTimestamp);

		await expect(relay.connect(signers[2]).deregisterGateway(addrs[15]))
			.to.revertedWithCustomError(relay, "RelayInvalidGatewayOwner");
	});

});

describe("Relay - Relay Job", function () {
	let signers: Signer[];
	let addrs: string[];
	let token: USDCoin;
	let wallets: Wallet[];
	let pubkeys: string[];
	let attestationVerifier: AttestationVerifier;
	let relay: Relay;

	before(async function () {
		signers = await ethers.getSigners();
		addrs = await Promise.all(signers.map((a) => a.getAddress()));
		wallets = signers.map((_, idx) => walletForIndex(idx));
		pubkeys = wallets.map((w) => normalize(w.signingKey.publicKey));

		const USDCoin = await ethers.getContractFactory("USDCoin");
		token = await upgrades.deployProxy(
			USDCoin,
			[addrs[0]],
			{
				kind: "uups",
			}
		) as unknown as USDCoin;

		const AttestationVerifier = await ethers.getContractFactory("AttestationVerifier");
		attestationVerifier = await upgrades.deployProxy(
			AttestationVerifier,
			[[image1], [pubkeys[14]], addrs[0]],
			{ kind: "uups" },
		) as unknown as AttestationVerifier;

		let admin = addrs[0],
			images = [image1, image2],
			maxAge = 600,
			globalMinTimeout = 10 * 1000,  // in milliseconds
			globalMaxTimeout = 100 * 1000,  // in milliseconds
			overallTimeout = 100,
			executionFeePerMs = 10,  // fee is in USDC
			gatewayFeePerJob = 10,
			fixedGas = 150000,
			callbackMeasureGas = 4530;
		const Relay = await ethers.getContractFactory("Relay");
		relay = await upgrades.deployProxy(
			Relay,
			[admin, images],
			{
				kind: "uups",
				initializer: "initialize",
				constructorArgs: [
					attestationVerifier.target,
					maxAge,
					token.target,
					globalMinTimeout,
					globalMaxTimeout,
					overallTimeout,
					executionFeePerMs,
					gatewayFeePerJob,
					fixedGas,
					callbackMeasureGas
				]
			},
		) as unknown as Relay;

		await token.transfer(addrs[2], 1000000);
		await token.connect(signers[2]).approve(relay.target, 1000000);

		const timestamp = await time.latest() * 1000;
		let [signature, attestation] = await createAttestation(pubkeys[15], image2, wallets[14], timestamp - 540000);

		let signTimestamp = await time.latest();
		let signedDigest = await createGatewaySignature(addrs[1], signTimestamp, wallets[15]);

		await relay.connect(signers[1]).registerGateway(signature, attestation, signedDigest, signTimestamp);
	});

	takeSnapshotBeforeAndAfterEveryTest(async () => { });

	it("can relay job", async function () {
		let codeHash = keccak256(solidityPacked(["string"], ["codehash"])),
			codeInputs = solidityPacked(["string"], ["codeInput"]),
			userTimeout = 50000,
			maxGasPrice = 100,
			callbackDeposit = parseUnits("1"),
			refundAccount = addrs[1],
			callbackContract = addrs[1],
			callbackGasLimit = 10000;
		await setNextBlockBaseFeePerGas(1);
		let tx = await relay.connect(signers[2])
			.relayJob(
				codeHash, codeInputs, userTimeout, maxGasPrice, refundAccount, callbackContract, callbackGasLimit,
				{ value: callbackDeposit }
			);
		await expect(tx).to.emit(relay, "JobRelayed");

		let key = await relay.jobCount();
		let job = await relay.jobs(key);

		expect(job.jobOwner).to.eq(addrs[2]);
	});

	it("cannot relay job with invalid user timeout", async function () {
		let codeHash = keccak256(solidityPacked(["string"], ["codehash"])),
			codeInputs = solidityPacked(["string"], ["codeInput"]),
			userTimeout = 500,
			maxGasPrice = 100,
			callbackDeposit = 100,
			refundAccount = addrs[1],
			callbackContract = addrs[1],
			callbackGasLimit = 10000;
		let tx = relay.connect(signers[2])
			.relayJob(
				codeHash, codeInputs, userTimeout, maxGasPrice, refundAccount, callbackContract, callbackGasLimit,
				{ value: callbackDeposit }
			);
		await expect(tx).to.revertedWithCustomError(relay, "RelayInvalidUserTimeout");

		userTimeout = 1000 * 1000;	// 1000ms
		tx = relay.connect(signers[2])
			.relayJob(
				codeHash, codeInputs, userTimeout, maxGasPrice, refundAccount, callbackContract, callbackGasLimit,
				{ value: callbackDeposit }
			);
		await expect(tx).to.revertedWithCustomError(relay, "RelayInvalidUserTimeout");
	});

	it("cannot relay job with insufficient callback deposit", async function () {
		let codeHash = keccak256(solidityPacked(["string"], ["codehash"])),
			codeInputs = solidityPacked(["string"], ["codeInput"]),
			userTimeout = 50000,
			maxGasPrice = 100,
			callbackDeposit = 0,
			refundAccount = addrs[1],
			callbackContract = addrs[1],
			callbackGasLimit = 10000;

		await setNextBlockBaseFeePerGas(1);

		let tx = relay.connect(signers[2])
			.relayJob(
				codeHash, codeInputs, userTimeout, maxGasPrice, refundAccount, callbackContract, callbackGasLimit,
				{ value: callbackDeposit }
			);
		await expect(tx).to.revertedWithCustomError(relay, "RelayInsufficientCallbackDeposit");
	});

	it("cannot relay job with invalid max gas price", async function () {
		let codeHash = keccak256(solidityPacked(["string"], ["codehash"])),
			codeInputs = solidityPacked(["string"], ["codeInput"]),
			userTimeout = 50000,
			maxGasPrice = 0,
			callbackDeposit = 100,
			refundAccount = addrs[1],
			callbackContract = addrs[1],
			callbackGasLimit = 10000;
		let tx = relay.connect(signers[2])
			.relayJob(
				codeHash, codeInputs, userTimeout, maxGasPrice, refundAccount, callbackContract, callbackGasLimit,
				{ value: callbackDeposit }
			);
		await expect(tx).to.revertedWithCustomError(relay, "RelayInsufficientMaxGasPrice");
	});
});

describe("Relay - Job Response", function () {
	let signers: Signer[];
	let addrs: string[];
	let token: USDCoin;
	let wallets: Wallet[];
	let pubkeys: string[];
	let attestationVerifier: AttestationVerifier;
	let relay: Relay;
	let callbackDeposit: bigint;

	before(async function () {
		signers = await ethers.getSigners();
		addrs = await Promise.all(signers.map((a) => a.getAddress()));
		wallets = signers.map((_, idx) => walletForIndex(idx));
		pubkeys = wallets.map((w) => normalize(w.signingKey.publicKey));

		const USDCoin = await ethers.getContractFactory("USDCoin");
		token = await upgrades.deployProxy(
			USDCoin,
			[addrs[0]],
			{
				kind: "uups",
			}
		) as unknown as USDCoin;

		const AttestationVerifier = await ethers.getContractFactory("AttestationVerifier");
		attestationVerifier = await upgrades.deployProxy(
			AttestationVerifier,
			[[image1], [pubkeys[14]], addrs[0]],
			{ kind: "uups" },
		) as unknown as AttestationVerifier;

		let admin = addrs[0],
			images = [image1, image2],
			maxAge = 600,
			globalMinTimeout = 10 * 1000,  // in milliseconds
			globalMaxTimeout = 100 * 1000,  // in milliseconds
			overallTimeout = 100,
			executionFeePerMs = 10,  // fee is in USDC
			gatewayFeePerJob = 10,
			fixedGas = 150000,
			callbackMeasureGas = 4530;
		const Relay = await ethers.getContractFactory("Relay");
		relay = await upgrades.deployProxy(
			Relay,
			[admin, images],
			{
				kind: "uups",
				initializer: "initialize",
				constructorArgs: [
					attestationVerifier.target,
					maxAge,
					token.target,
					globalMinTimeout,
					globalMaxTimeout,
					overallTimeout,
					executionFeePerMs,
					gatewayFeePerJob,
					fixedGas,
					callbackMeasureGas
				]
			},
		) as unknown as Relay;

		await token.transfer(addrs[2], 1000000);
		await token.connect(signers[2]).approve(relay.target, 1000000);

		const timestamp = await time.latest() * 1000;
		let [signature, attestation] = await createAttestation(pubkeys[15], image2, wallets[14], timestamp - 540000);

		let signTimestamp = await time.latest();
		let signedDigest = await createGatewaySignature(addrs[1], signTimestamp, wallets[15]);

		await relay.connect(signers[1]).registerGateway(signature, attestation, signedDigest, signTimestamp);

		let codeHash = keccak256(solidityPacked(["string"], ["codehash"])),
			codeInputs = solidityPacked(["string"], ["codeInput"]),
			userTimeout = 50000,
			maxGasPrice = 10,
			refundAccount = addrs[1],
			callbackContract = addrs[1],
			callbackGasLimit = 0;
		callbackDeposit = 1545300n;
		await setNextBlockBaseFeePerGas(1);
		await relay.connect(signers[2])
			.relayJob(
				codeHash, codeInputs, userTimeout, maxGasPrice, refundAccount, callbackContract, callbackGasLimit,
				{ value: callbackDeposit }
			);
	});

	takeSnapshotBeforeAndAfterEveryTest(async () => { });

	it("can submit response", async function () {
		let jobId: any = await relay.jobCount(),
			output = solidityPacked(["string"], ["it is the output"]),
			totalTime = 100,
			errorCode = 0,
			signTimestamp = await time.latest();

		let signedDigest = await createJobResponseSignature(jobId, output, totalTime, errorCode, signTimestamp, wallets[15]);
		let tx = relay.connect(signers[1]).jobResponse(signedDigest, jobId, output, totalTime, errorCode, signTimestamp);
		await expect(tx).to.emit(relay, "JobResponded");
	});

	it("cannot submit response with expired signature", async function () {
		let jobId: any = await relay.jobCount(),
			output = solidityPacked(["string"], ["it is the output"]),
			totalTime = 100,
			errorCode = 0,
			signTimestamp = await time.latest() - 700;

		let signedDigest = await createJobResponseSignature(jobId, output, totalTime, errorCode, signTimestamp, wallets[15]);

		let tx = relay.connect(signers[1]).jobResponse(signedDigest, jobId, output, totalTime, errorCode, signTimestamp);
		await expect(tx).to.revertedWithCustomError(relay, "RelaySignatureTooOld");
	});

	it("cannot submit response twice", async function () {
		let jobId: any = await relay.jobCount(),
			output = solidityPacked(["string"], ["it is the output"]),
			totalTime = 100,
			errorCode = 0,
			signTimestamp = await time.latest();

		let signedDigest = await createJobResponseSignature(jobId, output, totalTime, errorCode, signTimestamp, wallets[15]);
		let tx = relay.connect(signers[1]).jobResponse(signedDigest, jobId, output, totalTime, errorCode, signTimestamp);
		await expect(tx).to.emit(relay, "JobResponded");

		let tx2 = relay.connect(signers[1]).jobResponse(signedDigest, jobId, output, totalTime, errorCode, signTimestamp);
		await expect(tx2).to.revertedWithCustomError(relay, "RelayJobNotExists");
	});

	it("cannot submit output from unverified gateway", async function () {
		let jobId: any = await relay.jobCount(),
			output = solidityPacked(["string"], ["it is the output"]),
			totalTime = 100,
			errorCode = 0,
			signTimestamp = await time.latest();

		let signedDigest = await createJobResponseSignature(jobId, output, totalTime, errorCode, signTimestamp, wallets[16]);
		let tx = relay.connect(signers[1]).jobResponse(signedDigest, jobId, output, totalTime, errorCode, signTimestamp);
		await expect(tx).to.revertedWithCustomError(relay, "AttestationAutherKeyNotVerified");
	});

	it("cannot submit response after overall timeout is over", async function () {
		await time.increase(1100);
		let jobId: any = await relay.jobCount(),
			output = solidityPacked(["string"], ["it is the output"]),
			totalTime = 100,
			errorCode = 0,
			signTimestamp = await time.latest();

		let signedDigest = await createJobResponseSignature(jobId, output, totalTime, errorCode, signTimestamp, wallets[15]);
		let tx = relay.connect(signers[1]).jobResponse(signedDigest, jobId, output, totalTime, errorCode, signTimestamp);
		await expect(tx).to.revertedWithCustomError(relay, "RelayOverallTimeoutOver");
	});

	it("callback cost is greater than the deposit", async function () {
		let jobId: any = await relay.jobCount(),
			output = solidityPacked(["string"], ["it is the output"]),
			totalTime = 100,
			errorCode = 0,
			signTimestamp = await time.latest();

		let initBalance1 = await ethers.provider.getBalance(addrs[1]);
		let initBalance2 = await ethers.provider.getBalance(addrs[2]);
		await setNextBlockBaseFeePerGas(100);
		let signedDigest = await createJobResponseSignature(jobId, output, totalTime, errorCode, signTimestamp, wallets[15]);
		let tx = await relay.connect(signers[3]).jobResponse(signedDigest, jobId, output, totalTime, errorCode, signTimestamp);
		expect(await ethers.provider.getBalance(addrs[1])).to.equal(initBalance1 + callbackDeposit);
		expect(await ethers.provider.getBalance(addrs[2])).to.equal(initBalance2);
	});

});

describe("Relay - Job Cancel", function () {
	let signers: Signer[];
	let addrs: string[];
	let token: USDCoin;
	let wallets: Wallet[];
	let pubkeys: string[];
	let attestationVerifier: AttestationVerifier;
	let relay: Relay;

	before(async function () {
		signers = await ethers.getSigners();
		addrs = await Promise.all(signers.map((a) => a.getAddress()));
		wallets = signers.map((_, idx) => walletForIndex(idx));
		pubkeys = wallets.map((w) => normalize(w.signingKey.publicKey));

		const USDCoin = await ethers.getContractFactory("USDCoin");
		token = await upgrades.deployProxy(
			USDCoin,
			[addrs[0]],
			{
				kind: "uups",
			}
		) as unknown as USDCoin;

		const AttestationVerifier = await ethers.getContractFactory("AttestationVerifier");
		attestationVerifier = await upgrades.deployProxy(
			AttestationVerifier,
			[[image1], [pubkeys[14]], addrs[0]],
			{ kind: "uups" },
		) as unknown as AttestationVerifier;

		let admin = addrs[0],
			images = [image1, image2],
			maxAge = 600,
			globalMinTimeout = 10 * 1000,  // in milliseconds
			globalMaxTimeout = 100 * 1000,  // in milliseconds
			overallTimeout = 100,
			executionFeePerMs = 10,  // fee is in USDC
			gatewayFeePerJob = 10,
			fixedGas = 150000,
			callbackMeasureGas = 4530;
		const Relay = await ethers.getContractFactory("Relay");
		relay = await upgrades.deployProxy(
			Relay,
			[admin, images],
			{
				kind: "uups",
				initializer: "initialize",
				constructorArgs: [
					attestationVerifier.target,
					maxAge,
					token.target,
					globalMinTimeout,
					globalMaxTimeout,
					overallTimeout,
					executionFeePerMs,
					gatewayFeePerJob,
					fixedGas,
					callbackMeasureGas
				]
			},
		) as unknown as Relay;

		await token.transfer(addrs[2], 1000000);
		await token.connect(signers[2]).approve(relay.target, 1000000);

		const timestamp = await time.latest() * 1000;
		let [signature, attestation] = await createAttestation(pubkeys[15], image2, wallets[14], timestamp - 540000);

		let signTimestamp = await time.latest();
		let signedDigest = await createGatewaySignature(addrs[1], signTimestamp, wallets[15]);

		await relay.connect(signers[1]).registerGateway(signature, attestation, signedDigest, signTimestamp);

		let codeHash = keccak256(solidityPacked(["string"], ["codehash"])),
			codeInputs = solidityPacked(["string"], ["codeInput"]),
			userTimeout = 50000,
			maxGasPrice = 100,
			callbackDeposit = parseUnits("1"),
			refundAccount = addrs[1],
			callbackContract = addrs[1],
			callbackGasLimit = 10000;

		await setNextBlockBaseFeePerGas(1);
		await relay.connect(signers[2])
			.relayJob(
				codeHash, codeInputs, userTimeout, maxGasPrice, refundAccount, callbackContract, callbackGasLimit,
				{ value: callbackDeposit }
			);
	});

	takeSnapshotBeforeAndAfterEveryTest(async () => { });

	it("cannot cancel after job response", async function () {
		let jobId: any = await relay.jobCount(),
			output = solidityPacked(["string"], ["it is the output"]),
			totalTime = 100,
			errorCode = 0,
			signTimestamp = await time.latest();

		let signedDigest = await createJobResponseSignature(jobId, output, totalTime, errorCode, signTimestamp, wallets[15]);
		await expect(
			relay.connect(signers[1]).jobResponse(signedDigest, jobId, output, totalTime, errorCode, signTimestamp)
		).to.emit(relay, "JobResponded");

		await expect(
			relay.connect(signers[2]).jobCancel(jobId)
		).to.be.revertedWithCustomError(relay, "RelayJobNotExists");
	});

	it("cannot cancel before overall timeout", async function () {
		let jobId: any = await relay.jobCount();

		await expect(
			relay.connect(signers[2]).jobCancel(jobId)
		).to.revertedWithCustomError(relay, "RelayOverallTimeoutNotOver");
	});

	it("can cancel from job owner account after overall timeout", async function () {
		let jobId: any = await relay.jobCount();
		await time.increase(1100);

		await expect(
			relay.connect(signers[2]).jobCancel(jobId)
		).to.emit(relay, "JobCancelled").withArgs(jobId);

		let job = await relay.jobs(jobId);
		expect(job.jobOwner).to.eq(ZeroAddress);
	});

	it("can cancel from any other account except job owner after overall timeout", async function () {
		let jobId: any = await relay.jobCount();
		await time.increase(1100);

		await expect(
			relay.jobCancel(jobId)
		).to.emit(relay, "JobCancelled").withArgs(jobId);

		let job = await relay.jobs(jobId);
		expect(job.jobOwner).to.eq(ZeroAddress);
	});

});

describe("Relay - Job sent by UserSample contract", function () {
	let signers: Signer[];
	let addrs: string[];
	let token: USDCoin;
	let wallets: Wallet[];
	let pubkeys: string[];
	let attestationVerifier: AttestationVerifier;
	let relay: Relay;
	let userSample: UserSample;
	let	fixedGas: number;

	before(async function () {
		signers = await ethers.getSigners();
		addrs = await Promise.all(signers.map((a) => a.getAddress()));
		wallets = signers.map((_, idx) => walletForIndex(idx));
		pubkeys = wallets.map((w) => normalize(w.signingKey.publicKey));

		const USDCoin = await ethers.getContractFactory("USDCoin");
		token = await upgrades.deployProxy(
			USDCoin,
			[addrs[0]],
			{
				kind: "uups",
			}
		) as unknown as USDCoin;

		const AttestationVerifier = await ethers.getContractFactory("AttestationVerifier");
		attestationVerifier = await upgrades.deployProxy(
			AttestationVerifier,
			[[image1], [pubkeys[14]], addrs[0]],
			{ kind: "uups" },
		) as unknown as AttestationVerifier;

		let admin = addrs[0],
			images = [image1, image2],
			maxAge = 600,
			globalMinTimeout = 10 * 1000,  // in milliseconds
			globalMaxTimeout = 100 * 1000,  // in milliseconds
			overallTimeout = 100,
			executionFeePerMs = 10,  // fee is in USDC
			gatewayFeePerJob = 10,
			callbackMeasureGas = 4530;
		fixedGas = 150000;
		const Relay = await ethers.getContractFactory("Relay");
		relay = await upgrades.deployProxy(
			Relay,
			[admin, images],
			{
				kind: "uups",
				initializer: "initialize",
				constructorArgs: [
					attestationVerifier.target,
					maxAge,
					token.target,
					globalMinTimeout,
					globalMaxTimeout,
					overallTimeout,
					executionFeePerMs,
					gatewayFeePerJob,
					fixedGas,
					callbackMeasureGas
				]
			},
		) as unknown as Relay;

		const timestamp = await time.latest() * 1000;
		let [signature, attestation] = await createAttestation(pubkeys[15], image2, wallets[14], timestamp - 540000);

		let signTimestamp = await time.latest();
		let signedDigest = await createGatewaySignature(addrs[1], signTimestamp, wallets[15]);

		await relay.connect(signers[1]).registerGateway(signature, attestation, signedDigest, signTimestamp);

		const UserSample = await ethers.getContractFactory("UserSample");
		userSample = await UserSample.deploy(relay.target, token.target, addrs[10]) as unknown as UserSample;

		await token.transfer(userSample.target, 1000000);
	});

	takeSnapshotBeforeAndAfterEveryTest(async () => { });

	it("can submit response and execute callback", async function () {
		let codeHash = keccak256(solidityPacked(["string"], ["codehash"])),
			codeInputs = solidityPacked(["string"], ["codeInput"]),
			userTimeout = 50000,
			maxGasPrice = (await signers[0].provider?.getFeeData())?.gasPrice || parseUnits("1", 9),
			usdcDeposit = 1000000,
			callbackDeposit = parseUnits("1"),	// 1 eth
			refundAccount = addrs[1],
			callbackContract = userSample.target,
			callbackGasLimit = 20000;
		// deposit eth in UserSample contract before relaying jobs
		await signers[4].sendTransaction({to: userSample.target, value: callbackDeposit});
		await userSample.relayJob(
			codeHash, codeInputs, userTimeout, maxGasPrice, usdcDeposit, callbackDeposit, refundAccount, callbackContract, callbackGasLimit
		);

		let jobId: any = await relay.jobCount(),
			output = solidityPacked(["string"], ["it is the output"]),
			totalTime = 100,
			errorCode = 0,
			signTimestamp = await time.latest();

		// set tx.gasprice for next block
		await setNextBlockBaseFeePerGas(1);
		let signedDigest = await createJobResponseSignature(jobId, output, totalTime, errorCode, signTimestamp, wallets[15]);
		let initBalance = await ethers.provider.getBalance(addrs[1]);
		let tx = relay.connect(signers[2]).jobResponse(signedDigest, jobId, output, totalTime, errorCode, signTimestamp);
		await expect(tx).to.emit(relay, "JobResponded")
			.and.to.emit(userSample, "CalledBack").withArgs(
				jobId, callbackContract, codeHash, codeInputs, output, errorCode
		);

		let initBalAddrs10 = await ethers.provider.getBalance(addrs[10]);
		await userSample.connect(signers[10]).withdrawEth();
		let finalBalAddrs10 = await ethers.provider.getBalance(addrs[10]);
		// console.log("user sample owner bal: ", formatUnits(finalBalAddrs10), formatUnits(initBalAddrs10))
		expect(finalBalAddrs10).to.be.gt(initBalAddrs10);

		let jobOwner = userSample.target;
		let txReceipt = await (await tx).wait();
		console.log("FIXED_GAS : ", txReceipt?.gasUsed);
		// validate callback cost and refund
		let txGasPrice = txReceipt?.gasPrice || 0n;
		let callbackGas = 9246; // calculated using console.log
		console.log("txGasPrice: ", txGasPrice);
		let callbackCost = txGasPrice * (ethers.toBigInt(callbackGas + fixedGas));
		expect(await ethers.provider.getBalance(addrs[1])).to.equal(initBalance + callbackCost);
		expect(await ethers.provider.getBalance(jobOwner)).to.equal(callbackDeposit - callbackCost);

	});

	it("can submit response with gas price higher than maxGasPrice", async function () {
		let codeHash = keccak256(solidityPacked(["string"], ["codehash"])),
			codeInputs = solidityPacked(["string"], ["codeInput"]),
			userTimeout = 50000,
			maxGasPrice = (await signers[0].provider?.getFeeData())?.gasPrice || parseUnits("1", 9),
			usdcDeposit = 1000000,
			callbackDeposit = parseUnits("101"),	// 1 eth
			refundAccount = addrs[1],
			callbackContract = userSample.target,
			callbackGasLimit = 20000;
		await signers[0].sendTransaction({to: userSample.target, value: callbackDeposit});
		await userSample.relayJob(
			codeHash, codeInputs, userTimeout, maxGasPrice, usdcDeposit, callbackDeposit, refundAccount, callbackContract, callbackGasLimit
		);

		let jobId: any = await relay.jobCount(),
			output = solidityPacked(["string"], ["it is the output"]),
			totalTime = 100,
			errorCode = 0,
			signTimestamp = await time.latest();

		let initBalance = await ethers.provider.getBalance(addrs[1]);

		// set tx.gasprice for next block
		await setNextBlockBaseFeePerGas(maxGasPrice + 10n);
		let signedDigest = await createJobResponseSignature(jobId, output, totalTime, errorCode, signTimestamp, wallets[15]);
		let tx = relay.connect(signers[2]).jobResponse(signedDigest, jobId, output, totalTime, errorCode, signTimestamp);
		await expect(tx).to.emit(relay, "JobResponded")
			.and.to.not.emit(userSample, "CalledBack");

		// validate callback cost and refund
		let jobOwner = userSample.target;
		let txGasPrice = (await (await tx).wait())?.gasPrice || 0n;
		let callbackCost = txGasPrice * (ethers.toBigInt(fixedGas));
		expect(await ethers.provider.getBalance(addrs[1])).to.equal(initBalance + callbackCost);
		expect(await ethers.provider.getBalance(jobOwner)).to.equal(callbackDeposit - callbackCost);

	});

	// TODO
	// it("can submit response but fails to execute callback due to less callbackDeposit", async function () {
	// 	let codeHash = keccak256(solidityPacked(["string"], ["codehash"])),
	// 		codeInputs = solidityPacked(["string"], ["codeInput"]),
	// 		userTimeout = 50000,
	// 		maxGasPrice = 100,
	// 		callbackDeposit = 1,	// 1 wei
	// 		refundAccount = addrs[1];
	// 	await userSample.relayJob(
	// 		codeHash, codeInputs, userTimeout, maxGasPrice, refundAccount,
	// 		{value: callbackDeposit}
	// 	);

	// 	let jobId: any = await relay.jobCount(),
	// 		output = solidityPacked(["string"], ["it is the output"]),
	// 		totalTime = 100,
	// 		errorCode = 0,
	// 		signTimestamp = await time.latest();

	// 	console.log("job: ", jobId, await relay.jobs(jobId));

	// 	let signedDigest = await createJobResponseSignature(jobId, output, totalTime, errorCode, signTimestamp, wallets[15]);
	// 	let tx = relay.connect(signers[1]).jobResponse(signedDigest, jobId, output, totalTime, errorCode, signTimestamp);
	// 	await expect(tx).to.emit(relay, "JobResponded").and.to.not.emit(userSample, "CalledBack");
	// });

});

describe("Relay - Start Job Subscription", function () {
	let signers: Signer[];
	let addrs: string[];
	let token: USDCoin;
	let wallets: Wallet[];
	let pubkeys: string[];
	let attestationVerifier: AttestationVerifier;
	let relay: Relay;

	before(async function () {
		signers = await ethers.getSigners();
		addrs = await Promise.all(signers.map((a) => a.getAddress()));
		wallets = signers.map((_, idx) => walletForIndex(idx));
		pubkeys = wallets.map((w) => normalize(w.signingKey.publicKey));

		const USDCoin = await ethers.getContractFactory("USDCoin");
		token = await upgrades.deployProxy(
			USDCoin,
			[addrs[0]],
			{
				kind: "uups",
			}
		) as unknown as USDCoin;

		const AttestationVerifier = await ethers.getContractFactory("AttestationVerifier");
		attestationVerifier = await upgrades.deployProxy(
			AttestationVerifier,
			[[image1], [pubkeys[14]], addrs[0]],
			{ kind: "uups" },
		) as unknown as AttestationVerifier;

		let admin = addrs[0],
			images = [image1, image2],
			maxAge = 600,
			globalMinTimeout = 10 * 1000,  // in milliseconds
			globalMaxTimeout = 100 * 1000,  // in milliseconds
			overallTimeout = 100,
			executionFeePerMs = 10,  // fee is in USDC
			gatewayFeePerJob = 10,
			fixedGas = 150000,
			callbackMeasureGas = 4530;
		const Relay = await ethers.getContractFactory("Relay");
		relay = await upgrades.deployProxy(
			Relay,
			[admin, images],
			{
				kind: "uups",
				initializer: "initialize",
				constructorArgs: [
					attestationVerifier.target,
					maxAge,
					token.target,
					globalMinTimeout,
					globalMaxTimeout,
					overallTimeout,
					executionFeePerMs,
					gatewayFeePerJob,
					fixedGas,
					callbackMeasureGas
				]
			},
		) as unknown as Relay;

		await token.transfer(addrs[2], 10000000);
		await token.connect(signers[2]).approve(relay.target, 10000000);

		const timestamp = await time.latest() * 1000;
		let [signature, attestation] = await createAttestation(pubkeys[15], image2, wallets[14], timestamp - 540000);

		let signTimestamp = await time.latest();
		let signedDigest = await createGatewaySignature(addrs[1], signTimestamp, wallets[15]);

		await relay.connect(signers[1]).registerGateway(signature, attestation, signedDigest, signTimestamp);
	});

	takeSnapshotBeforeAndAfterEveryTest(async () => { });

	it("can start job subscription", async function () {
		let codeHash = keccak256(solidityPacked(["string"], ["codehash"])),
			codeInputs = solidityPacked(["string"], ["codeInput"]),
			userTimeout = 50000,
			maxGasPrice = 100,
			callbackDeposit = parseUnits("1"),
			refundAccount = addrs[1],
			callbackContract = addrs[1],
			callbackGasLimit = 1000000,
			periodicGap = 10,
			usdcDeposit = 2000000,
			startTimestamp = await time.latest(),
			terminationTimestamp = await time.latest() + 20;
		await setNextBlockBaseFeePerGas(1);
		let tx = await relay.connect(signers[2])
			.startJobSubscription(
				codeHash, codeInputs, userTimeout, maxGasPrice, refundAccount, callbackContract, callbackGasLimit, periodicGap, usdcDeposit, startTimestamp, terminationTimestamp,
				{ value: callbackDeposit }
			);
		await expect(tx).to.emit(relay, "JobSubscriptionStarted");

		let key = await relay.jobSubsCount();
		let jobSubs = await relay.jobSubscriptions(key);

		expect(jobSubs.job.jobOwner).to.eq(addrs[2]);
	});

	it("cannot start job subscription with invalid start timestamp", async function () {
		let codeHash = keccak256(solidityPacked(["string"], ["codehash"])),
			codeInputs = solidityPacked(["string"], ["codeInput"]),
			userTimeout = 50000,
			maxGasPrice = 100,
			callbackDeposit = parseUnits("1"),
			refundAccount = addrs[1],
			callbackContract = addrs[1],
			callbackGasLimit = 1000000,
			periodicGap = 10,
			usdcDeposit = 2000000,
			startTimestamp = await time.latest() + 10,
			terminationTimestamp = await time.latest();
		let tx = relay.connect(signers[2])
			.startJobSubscription(
				codeHash, codeInputs, userTimeout, maxGasPrice, refundAccount, callbackContract, callbackGasLimit, periodicGap, usdcDeposit, startTimestamp, terminationTimestamp,
				{ value: callbackDeposit }
			);
		await expect(tx).to.revertedWithCustomError(relay, "RelayInvalidStartTimestamp");
	});

	it("cannot start job subscription with invalid termination timestamp", async function () {
		let codeHash = keccak256(solidityPacked(["string"], ["codehash"])),
			codeInputs = solidityPacked(["string"], ["codeInput"]),
			userTimeout = 50000,
			maxGasPrice = 100,
			callbackDeposit = parseUnits("1"),
			refundAccount = addrs[1],
			callbackContract = addrs[1],
			callbackGasLimit = 1000000,
			periodicGap = 10,
			usdcDeposit = 2000000,
			startTimestamp = await time.latest() - 100,
			terminationTimestamp = await time.latest() - 10;
		let tx = relay.connect(signers[2])
			.startJobSubscription(
				codeHash, codeInputs, userTimeout, maxGasPrice, refundAccount, callbackContract, callbackGasLimit, periodicGap, usdcDeposit, startTimestamp, terminationTimestamp,
				{ value: callbackDeposit }
			);
		await expect(tx).to.revertedWithCustomError(relay, "RelayInvalidTerminationTimestamp");
	});

	it("cannot start job subscription with invalid user timeout", async function () {
		let codeHash = keccak256(solidityPacked(["string"], ["codehash"])),
			codeInputs = solidityPacked(["string"], ["codeInput"]),
			userTimeout = 500,
			maxGasPrice = 100,
			callbackDeposit = parseUnits("1"),
			refundAccount = addrs[1],
			callbackContract = addrs[1],
			callbackGasLimit = 1000000,
			periodicGap = 10,
			usdcDeposit = 2000000,
			startTimestamp = await time.latest(),
			terminationTimestamp = await time.latest() + 20;
		let tx = relay.connect(signers[2])
			.startJobSubscription(
				codeHash, codeInputs, userTimeout, maxGasPrice, refundAccount, callbackContract, callbackGasLimit, periodicGap, usdcDeposit, startTimestamp, terminationTimestamp,
				{ value: callbackDeposit }
			);
		await expect(tx).to.revertedWithCustomError(relay, "RelayInvalidUserTimeout");

		userTimeout = 1000 * 1000;
		tx = relay.connect(signers[2])
			.startJobSubscription(
				codeHash, codeInputs, userTimeout, maxGasPrice, refundAccount, callbackContract, callbackGasLimit, periodicGap, usdcDeposit, startTimestamp, terminationTimestamp,
				{ value: callbackDeposit }
			);
		await expect(tx).to.revertedWithCustomError(relay, "RelayInvalidUserTimeout");
	});

	it("cannot start job subscription with insufficient callback deposit", async function () {
		let codeHash = keccak256(solidityPacked(["string"], ["codehash"])),
			codeInputs = solidityPacked(["string"], ["codeInput"]),
			userTimeout = 50000,
			maxGasPrice = 100,
			callbackDeposit = 0,
			refundAccount = addrs[1],
			callbackContract = addrs[1],
			callbackGasLimit = 1000000,
			periodicGap = 10,
			usdcDeposit = 2000000,
			startTimestamp = await time.latest(),
			terminationTimestamp = await time.latest() + 20;

		await setNextBlockBaseFeePerGas(1);

		let tx = relay.connect(signers[2])
			.startJobSubscription(
				codeHash, codeInputs, userTimeout, maxGasPrice, refundAccount, callbackContract, callbackGasLimit, periodicGap, usdcDeposit, startTimestamp, terminationTimestamp,
				{ value: callbackDeposit }
			);
		await expect(tx).to.revertedWithCustomError(relay, "RelayInsufficientCallbackDeposit");
	});

	it("cannot start job subscription with invalid max gas price", async function () {
		let codeHash = keccak256(solidityPacked(["string"], ["codehash"])),
			codeInputs = solidityPacked(["string"], ["codeInput"]),
			userTimeout = 50000,
			maxGasPrice = 0,
			callbackDeposit = parseUnits("1"),
			refundAccount = addrs[1],
			callbackContract = addrs[1],
			callbackGasLimit = 1000000,
			periodicGap = 10,
			usdcDeposit = 2000000,
			startTimestamp = await time.latest(),
			terminationTimestamp = await time.latest() + 20;
		let tx = relay.connect(signers[2])
			.startJobSubscription(
				codeHash, codeInputs, userTimeout, maxGasPrice, refundAccount, callbackContract, callbackGasLimit, periodicGap, usdcDeposit, startTimestamp, terminationTimestamp,
				{ value: callbackDeposit }
			);
		await expect(tx).to.revertedWithCustomError(relay, "RelayInsufficientMaxGasPrice");
	});

	it("cannot start job subscription with insufficient usdc deposit", async function () {
		let codeHash = keccak256(solidityPacked(["string"], ["codehash"])),
			codeInputs = solidityPacked(["string"], ["codeInput"]),
			userTimeout = 50000,
			maxGasPrice = parseUnits("1", 9),
			callbackDeposit = parseUnits("1"),
			refundAccount = addrs[1],
			callbackContract = addrs[1],
			callbackGasLimit = 1000000,
			periodicGap = 10,
			usdcDeposit = 2000000,
			startTimestamp = await time.latest(),
			terminationTimestamp = await time.latest() + 50;
		let tx = relay.connect(signers[2])
			.startJobSubscription(
				codeHash, codeInputs, userTimeout, maxGasPrice, refundAccount, callbackContract, callbackGasLimit, periodicGap, usdcDeposit, startTimestamp, terminationTimestamp,
				{ value: callbackDeposit }
			);
		await expect(tx).to.revertedWithCustomError(relay, "RelayInsufficientUsdcDeposit");
	});
});

describe("Relay - Job Subscription Response", function () {
	let signers: Signer[];
	let addrs: string[];
	let token: USDCoin;
	let wallets: Wallet[];
	let pubkeys: string[];
	let attestationVerifier: AttestationVerifier;
	let relay: Relay;
	let callbackDeposit: bigint;

	before(async function () {
		signers = await ethers.getSigners();
		addrs = await Promise.all(signers.map((a) => a.getAddress()));
		wallets = signers.map((_, idx) => walletForIndex(idx));
		pubkeys = wallets.map((w) => normalize(w.signingKey.publicKey));

		const USDCoin = await ethers.getContractFactory("USDCoin");
		token = await upgrades.deployProxy(
			USDCoin,
			[addrs[0]],
			{
				kind: "uups",
			}
		) as unknown as USDCoin;

		const AttestationVerifier = await ethers.getContractFactory("AttestationVerifier");
		attestationVerifier = await upgrades.deployProxy(
			AttestationVerifier,
			[[image1], [pubkeys[14]], addrs[0]],
			{ kind: "uups" },
		) as unknown as AttestationVerifier;

		let admin = addrs[0],
			images = [image1, image2],
			maxAge = 600,
			globalMinTimeout = 10 * 1000,  // in milliseconds
			globalMaxTimeout = 100 * 1000,  // in milliseconds
			overallTimeout = 100,
			executionFeePerMs = 10,  // fee is in USDC
			gatewayFeePerJob = 10,
			fixedGas = 150000,
			callbackMeasureGas = 4530;
		const Relay = await ethers.getContractFactory("Relay");
		relay = await upgrades.deployProxy(
			Relay,
			[admin, images],
			{
				kind: "uups",
				initializer: "initialize",
				constructorArgs: [
					attestationVerifier.target,
					maxAge,
					token.target,
					globalMinTimeout,
					globalMaxTimeout,
					overallTimeout,
					executionFeePerMs,
					gatewayFeePerJob,
					fixedGas,
					callbackMeasureGas
				]
			},
		) as unknown as Relay;

		await token.transfer(addrs[2], 10000000);
		await token.connect(signers[2]).approve(relay.target, 10000000);

		const timestamp = await time.latest() * 1000;
		let [signature, attestation] = await createAttestation(pubkeys[15], image2, wallets[14], timestamp - 540000);

		let signTimestamp = await time.latest();
		let signedDigest = await createGatewaySignature(addrs[1], signTimestamp, wallets[15]);

		await relay.connect(signers[1]).registerGateway(signature, attestation, signedDigest, signTimestamp);

		let codeHash = keccak256(solidityPacked(["string"], ["codehash"])),
			codeInputs = solidityPacked(["string"], ["codeInput"]),
			userTimeout = 50000,
			maxGasPrice = 10,
			refundAccount = addrs[1],
			callbackContract = addrs[1],
			callbackGasLimit = 0,
			periodicGap = 10,
			usdcDeposit = 2000000,
			startTimestamp = await time.latest(),
			terminationTimestamp = await time.latest() + 20;
		callbackDeposit = parseUnits("1");
		await setNextBlockBaseFeePerGas(1);
		await relay.connect(signers[2])
			.startJobSubscription(
				codeHash, codeInputs, userTimeout, maxGasPrice, refundAccount, callbackContract, callbackGasLimit, periodicGap, usdcDeposit, startTimestamp, terminationTimestamp,
				{ value: callbackDeposit }
			);
	});

	takeSnapshotBeforeAndAfterEveryTest(async () => { });

	it("can submit response", async function () {
		let jobSubsId = await relay.jobSubsCount(),
			jobId = jobSubsId,	// last 127 bits(i.e. instanceCount) would be 0 for the first response
			output = solidityPacked(["string"], ["it is the output"]),
			totalTime = 100,
			errorCode = 0,
			signTimestamp = await time.latest();
		let gatewayUsdcBalInit = await token.balanceOf(addrs[1]);

		let signedDigest = await createJobResponseSignature(jobId, output, totalTime, errorCode, signTimestamp, wallets[15]);
		let tx = relay.connect(signers[1]).jobSubsResponse(signedDigest, jobId, output, totalTime, errorCode, signTimestamp);
		await expect(tx).to.emit(relay, "JobSubscriptionResponded");

		let jobSubs = await relay.jobSubscriptions(jobSubsId);
		expect(jobSubs.currentRuns).to.eq(1);
		let gatewayUsdcBalFinal = await token.balanceOf(addrs[1]);
		let gatewayPayout = totalTime * 10 + 10;
		expect(gatewayUsdcBalFinal).to.eq(gatewayUsdcBalInit + BigInt(gatewayPayout));
	});

	it("cannot submit response for an invalid job subscription", async function () {
		let jobId = 1,
			output = solidityPacked(["string"], ["it is the output"]),
			totalTime = 100,
			errorCode = 0,
			signTimestamp = await time.latest();

		let signedDigest = await createJobResponseSignature(jobId, output, totalTime, errorCode, signTimestamp, wallets[15]);
		let tx = relay.connect(signers[1]).jobSubsResponse(signedDigest, jobId, output, totalTime, errorCode, signTimestamp);
		await expect(tx).to.revertedWithCustomError(relay, "RelayInvalidJobSubscription");
	});

	it("cannot submit response after overall timeout is over", async function () {
		await time.increase(1100);
		let jobId = await relay.jobSubsCount(),
			output = solidityPacked(["string"], ["it is the output"]),
			totalTime = 100,
			errorCode = 0,
			signTimestamp = await time.latest();

		let signedDigest = await createJobResponseSignature(jobId, output, totalTime, errorCode, signTimestamp, wallets[15]);
		let tx = relay.connect(signers[1]).jobSubsResponse(signedDigest, jobId, output, totalTime, errorCode, signTimestamp);
		await expect(tx).to.revertedWithCustomError(relay, "RelayOverallTimeoutOver");
	});

	it("cannot submit response with instance count lower than current runs", async function () {
		let jobId = await relay.jobSubsCount(),
			output = solidityPacked(["string"], ["it is the output"]),
			totalTime = 100,
			errorCode = 0,
			signTimestamp = await time.latest();

		let signedDigest = await createJobResponseSignature(jobId, output, totalTime, errorCode, signTimestamp, wallets[15]);
		let tx = relay.connect(signers[1]).jobSubsResponse(signedDigest, jobId, output, totalTime, errorCode, signTimestamp);
		await expect(tx).to.emit(relay, "JobSubscriptionResponded");

		await time.increase(10);
		// sending another response with same instance count
		signedDigest = await createJobResponseSignature(jobId, output, totalTime, errorCode, signTimestamp, wallets[15]);
		tx = relay.connect(signers[1]).jobSubsResponse(signedDigest, jobId, output, totalTime, errorCode, signTimestamp);
		await expect(tx).to.revertedWithCustomError(relay, "RelayInvalidCurrentRuns");
	});

	it("cannot submit response with expired signature", async function () {
		let jobId: any = await relay.jobSubsCount(),
			output = solidityPacked(["string"], ["it is the output"]),
			totalTime = 100,
			errorCode = 0,
			signTimestamp = await time.latest() - 700;

		let signedDigest = await createJobResponseSignature(jobId, output, totalTime, errorCode, signTimestamp, wallets[15]);
		let tx = relay.connect(signers[1]).jobSubsResponse(signedDigest, jobId, output, totalTime, errorCode, signTimestamp);
		await expect(tx).to.revertedWithCustomError(relay, "RelaySignatureTooOld");
	});

	it("cannot submit output from unverified gateway", async function () {
		let jobId: any = await relay.jobSubsCount(),
			output = solidityPacked(["string"], ["it is the output"]),
			totalTime = 100,
			errorCode = 0,
			signTimestamp = await time.latest();

		let signedDigest = await createJobResponseSignature(jobId, output, totalTime, errorCode, signTimestamp, wallets[16]);
		let tx = relay.connect(signers[1]).jobSubsResponse(signedDigest, jobId, output, totalTime, errorCode, signTimestamp);
		await expect(tx).to.revertedWithCustomError(relay, "AttestationAutherKeyNotVerified");
	});

	it("callback cost is greater than the deposit", async function () {
		let jobId: any = await relay.jobSubsCount(),
			output = solidityPacked(["string"], ["it is the output"]),
			totalTime = 100,
			errorCode = 0,
			signTimestamp = await time.latest();

		let initBalance1 = await ethers.provider.getBalance(addrs[1]);
		let initBalance2 = await ethers.provider.getBalance(addrs[2]);
		await setNextBlockBaseFeePerGas(1e14);
		let signedDigest = await createJobResponseSignature(jobId, output, totalTime, errorCode, signTimestamp, wallets[15]);
		await relay.connect(signers[3]).jobSubsResponse(signedDigest, jobId, output, totalTime, errorCode, signTimestamp);
		expect(await ethers.provider.getBalance(addrs[1])).to.equal(initBalance1 + callbackDeposit);
		expect(await ethers.provider.getBalance(addrs[2])).to.equal(initBalance2);
	});

});

describe("Relay - Job Subscription Deposit", function () {
	let signers: Signer[];
	let addrs: string[];
	let token: USDCoin;
	let wallets: Wallet[];
	let pubkeys: string[];
	let attestationVerifier: AttestationVerifier;
	let relay: Relay;
	let callbackDeposit: bigint;

	before(async function () {
		signers = await ethers.getSigners();
		addrs = await Promise.all(signers.map((a) => a.getAddress()));
		wallets = signers.map((_, idx) => walletForIndex(idx));
		pubkeys = wallets.map((w) => normalize(w.signingKey.publicKey));

		const USDCoin = await ethers.getContractFactory("USDCoin");
		token = await upgrades.deployProxy(
			USDCoin,
			[addrs[0]],
			{
				kind: "uups",
			}
		) as unknown as USDCoin;

		const AttestationVerifier = await ethers.getContractFactory("AttestationVerifier");
		attestationVerifier = await upgrades.deployProxy(
			AttestationVerifier,
			[[image1], [pubkeys[14]], addrs[0]],
			{ kind: "uups" },
		) as unknown as AttestationVerifier;

		let admin = addrs[0],
			images = [image1, image2],
			maxAge = 600,
			globalMinTimeout = 10 * 1000,  // in milliseconds
			globalMaxTimeout = 100 * 1000,  // in milliseconds
			overallTimeout = 100,
			executionFeePerMs = 10,  // fee is in USDC
			gatewayFeePerJob = 10,
			fixedGas = 150000,
			callbackMeasureGas = 4530;
		const Relay = await ethers.getContractFactory("Relay");
		relay = await upgrades.deployProxy(
			Relay,
			[admin, images],
			{
				kind: "uups",
				initializer: "initialize",
				constructorArgs: [
					attestationVerifier.target,
					maxAge,
					token.target,
					globalMinTimeout,
					globalMaxTimeout,
					overallTimeout,
					executionFeePerMs,
					gatewayFeePerJob,
					fixedGas,
					callbackMeasureGas
				]
			},
		) as unknown as Relay;

		await token.transfer(addrs[2], 10000000);
		await token.connect(signers[2]).approve(relay.target, 10000000);

		const timestamp = await time.latest() * 1000;
		let [signature, attestation] = await createAttestation(pubkeys[15], image2, wallets[14], timestamp - 540000);

		let signTimestamp = await time.latest();
		let signedDigest = await createGatewaySignature(addrs[1], signTimestamp, wallets[15]);

		await relay.connect(signers[1]).registerGateway(signature, attestation, signedDigest, signTimestamp);

		let codeHash = keccak256(solidityPacked(["string"], ["codehash"])),
			codeInputs = solidityPacked(["string"], ["codeInput"]),
			userTimeout = 50000,
			maxGasPrice = 10,
			refundAccount = addrs[1],
			callbackContract = addrs[1],
			callbackGasLimit = 0,
			periodicGap = 50,
			usdcDeposit = 2000000,
			startTimestamp = await time.latest(),
			terminationTimestamp = await time.latest() + 100;
		callbackDeposit = parseUnits("1", 7);
		await setNextBlockBaseFeePerGas(1);
		await relay.connect(signers[2])
			.startJobSubscription(
				codeHash, codeInputs, userTimeout, maxGasPrice, refundAccount, callbackContract, callbackGasLimit, periodicGap, usdcDeposit, startTimestamp, terminationTimestamp,
				{ value: callbackDeposit }
			);
	});

	takeSnapshotBeforeAndAfterEveryTest(async () => { });

	it("can deposit USDC and ETH later", async function () {
		let jobSubsId: any = await relay.jobSubsCount(),
			usdcDeposit = 2000000n;
		let jobSubsInitial = await relay.jobSubscriptions(jobSubsId);

		let tx = relay.connect(signers[2])
			.depositJobSubscriptionFunds(jobSubsId, usdcDeposit, 
				{ value: callbackDeposit }
			);
		await expect(tx).to.emit(relay, "JobSubscriptionFundsDeposited")
			.withArgs(jobSubsId, addrs[2], usdcDeposit, callbackDeposit);

		let jobSubsFinal = await relay.jobSubscriptions(jobSubsId);
		expect(jobSubsFinal.job.usdcDeposit).to.eq(jobSubsInitial.job.usdcDeposit + usdcDeposit);
		expect(jobSubsFinal.job.callbackDeposit).to.eq(jobSubsInitial.job.callbackDeposit + callbackDeposit);
	});

	it("cannot deposit assets later for invalid job subsription", async function () {
		let jobSubsId = 1,
			usdcDeposit = 2000000n;

		let tx = relay.connect(signers[2])
			.depositJobSubscriptionFunds(jobSubsId, usdcDeposit, 
				{ value: callbackDeposit }
			);
		await expect(tx).to.revertedWithCustomError(relay, "RelayInvalidJobSubscription");
	});
});

describe("Relay - Update Job Subscription Params", function () {
	let signers: Signer[];
	let addrs: string[];
	let token: USDCoin;
	let wallets: Wallet[];
	let pubkeys: string[];
	let attestationVerifier: AttestationVerifier;
	let relay: Relay;
	let callbackDeposit: bigint;

	before(async function () {
		signers = await ethers.getSigners();
		addrs = await Promise.all(signers.map((a) => a.getAddress()));
		wallets = signers.map((_, idx) => walletForIndex(idx));
		pubkeys = wallets.map((w) => normalize(w.signingKey.publicKey));

		const USDCoin = await ethers.getContractFactory("USDCoin");
		token = await upgrades.deployProxy(
			USDCoin,
			[addrs[0]],
			{
				kind: "uups",
			}
		) as unknown as USDCoin;

		const AttestationVerifier = await ethers.getContractFactory("AttestationVerifier");
		attestationVerifier = await upgrades.deployProxy(
			AttestationVerifier,
			[[image1], [pubkeys[14]], addrs[0]],
			{ kind: "uups" },
		) as unknown as AttestationVerifier;

		let admin = addrs[0],
			images = [image1, image2],
			maxAge = 600,
			globalMinTimeout = 10 * 1000,  // in milliseconds
			globalMaxTimeout = 100 * 1000,  // in milliseconds
			overallTimeout = 100,
			executionFeePerMs = 10,  // fee is in USDC
			gatewayFeePerJob = 10,
			fixedGas = 150000,
			callbackMeasureGas = 4530;
		const Relay = await ethers.getContractFactory("Relay");
		relay = await upgrades.deployProxy(
			Relay,
			[admin, images],
			{
				kind: "uups",
				initializer: "initialize",
				constructorArgs: [
					attestationVerifier.target,
					maxAge,
					token.target,
					globalMinTimeout,
					globalMaxTimeout,
					overallTimeout,
					executionFeePerMs,
					gatewayFeePerJob,
					fixedGas,
					callbackMeasureGas
				]
			},
		) as unknown as Relay;

		await token.transfer(addrs[2], 10000000);
		await token.connect(signers[2]).approve(relay.target, 10000000);

		const timestamp = await time.latest() * 1000;
		let [signature, attestation] = await createAttestation(pubkeys[15], image2, wallets[14], timestamp - 540000);

		let signTimestamp = await time.latest();
		let signedDigest = await createGatewaySignature(addrs[1], signTimestamp, wallets[15]);

		await relay.connect(signers[1]).registerGateway(signature, attestation, signedDigest, signTimestamp);

		let codeHash = keccak256(solidityPacked(["string"], ["codehash"])),
			codeInputs = solidityPacked(["string"], ["codeInput"]),
			userTimeout = 50000,
			maxGasPrice = 10,
			refundAccount = addrs[1],
			callbackContract = addrs[1],
			callbackGasLimit = 0,
			periodicGap = 50,
			usdcDeposit = 2000000,
			startTimestamp = 0,
			terminationTimestamp = await time.latest() + 100;
		callbackDeposit = parseUnits("1", 7);
		await setNextBlockBaseFeePerGas(1);
		await relay.connect(signers[2])
			.startJobSubscription(
				codeHash, codeInputs, userTimeout, maxGasPrice, refundAccount, callbackContract, callbackGasLimit, periodicGap, usdcDeposit, startTimestamp, terminationTimestamp,
				{ value: callbackDeposit }
			);
	});

	takeSnapshotBeforeAndAfterEveryTest(async () => { });

	it("can update job params", async function () {
		let jobSubsId: any = await relay.jobSubsCount(),
			codeHash = keccak256(solidityPacked(["string"], ["codehash1"])),
			codeInputs = solidityPacked(["string"], ["codeInput1"]);

		let tx = relay.connect(signers[2]).updateJobSubsJobParams(jobSubsId, codeHash, codeInputs);
		await expect(tx).to.emit(relay, "JobSubscriptionJobParamsUpdated")
			.withArgs(jobSubsId, codeHash, codeInputs);

		let jobSubs = await relay.jobSubscriptions(jobSubsId);
		expect(jobSubs.job.codehash).to.eq(codeHash);
		expect(jobSubs.job.codeInputs).to.eq(codeInputs);
	});

	it("cannot update job params without job subscription owner account", async function () {
		let jobSubsId: any = await relay.jobSubsCount(),
			codeHash = keccak256(solidityPacked(["string"], ["codehash1"])),
			codeInputs = solidityPacked(["string"], ["codeInput1"]);

		let tx = relay.connect(signers[1]).updateJobSubsJobParams(jobSubsId, codeHash, codeInputs);
		await expect(tx).to.revertedWithCustomError(relay, "RelayNotJobSubscriptionOwner");
	});

	it("can update job termination params", async function () {
		let jobSubsId: any = await relay.jobSubsCount(),
			terminationTimestamp = await time.latest() + 110,
			usdcDeposit = 2000000n;
		
		let jobSubsInitial = await relay.jobSubscriptions(jobSubsId);
		
		let tx = relay.connect(signers[2])
			.updateJobSubsTerminationParams(jobSubsId, terminationTimestamp, usdcDeposit, 
				{ value: callbackDeposit }
			);
		await expect(tx).to.emit(relay, "JobSubscriptionTerminationParamsUpdated")
			.withArgs(jobSubsId, terminationTimestamp);

		let jobSubsFinal = await relay.jobSubscriptions(jobSubsId);
		expect(jobSubsFinal.terminationTimestamp).to.eq(terminationTimestamp);
		expect(jobSubsFinal.job.usdcDeposit).to.eq(jobSubsInitial.job.usdcDeposit + usdcDeposit);
		expect(jobSubsFinal.job.callbackDeposit).to.eq(jobSubsInitial.job.callbackDeposit + callbackDeposit);
	});

	it("cannot update job termination params without job subscription owner account", async function () {
		let jobSubsId: any = await relay.jobSubsCount(),
			terminationTimestamp = await time.latest() + 110,
			usdcDeposit = 2000000;

		let tx = relay.connect(signers[1])
			.updateJobSubsTerminationParams(jobSubsId, terminationTimestamp, usdcDeposit, 
				{ value: callbackDeposit }
			);
		await expect(tx).to.be.revertedWithCustomError(relay, "RelayNotJobSubscriptionOwner");
	});

	it("cannot update job termination params with invalid termination timestamp", async function () {
		let jobSubsId: any = await relay.jobSubsCount(),
			terminationTimestamp = await time.latest() + 90, // invalid termination timestamp as it doesn't exceed atleast OVERALL_TIMEOUT from the current timestamp
			usdcDeposit = 2000000;

		let tx = relay.connect(signers[2])
			.updateJobSubsTerminationParams(jobSubsId, terminationTimestamp, usdcDeposit, 
				{ value: callbackDeposit }
			);
		await expect(tx).to.be.revertedWithCustomError(relay, "RelayInvalidTerminationTimestamp");
	});

	it("cannot update job termination params after the termination condition is reached", async function () {
		let jobSubsId: any = await relay.jobSubsCount(),
			terminationTimestamp = await time.latest() + 250, // invalid termination timestamp as it doesn't exceed atleast OVERALL_TIMEOUT from the current timestamp
			usdcDeposit = 2000000;

		await time.increase(120);
		let tx = relay.connect(signers[2])
			.updateJobSubsTerminationParams(jobSubsId, terminationTimestamp, usdcDeposit, 
				{ value: callbackDeposit }
			);
		await expect(tx).to.be.revertedWithCustomError(relay, "RelayJobSubscriptionTerminated");
	});

	it("cannot update job termination params with insufficient callback deposit", async function () {
		let jobSubsId: any = await relay.jobSubsCount(),
			terminationTimestamp = await time.latest() + 1000,
			usdcDeposit = 2000000;

		let tx = relay.connect(signers[2])
			.updateJobSubsTerminationParams(jobSubsId, terminationTimestamp, usdcDeposit, 
				{ value: 0 }
			);
		await expect(tx).to.be.revertedWithCustomError(relay, "RelayInsufficientCallbackDeposit");
	});

	it("cannot update job termination params with insufficient USDC deposit", async function () {
		let jobSubsId: any = await relay.jobSubsCount(),
			terminationTimestamp = await time.latest() + 1000,
			usdcDeposit = 2000000;

		let tx = relay.connect(signers[2])
			.updateJobSubsTerminationParams(jobSubsId, terminationTimestamp, usdcDeposit, 
				{ value: parseUnits("1") }
			);
		await expect(tx).to.be.revertedWithCustomError(relay, "RelayInsufficientUsdcDeposit");
	});
});

describe("Relay - Job Subscription Withdrawal", function () {
	let signers: Signer[];
	let addrs: string[];
	let token: USDCoin;
	let wallets: Wallet[];
	let pubkeys: string[];
	let attestationVerifier: AttestationVerifier;
	let relay: Relay;
	let callbackDeposit: bigint;

	before(async function () {
		signers = await ethers.getSigners();
		addrs = await Promise.all(signers.map((a) => a.getAddress()));
		wallets = signers.map((_, idx) => walletForIndex(idx));
		pubkeys = wallets.map((w) => normalize(w.signingKey.publicKey));

		const USDCoin = await ethers.getContractFactory("USDCoin");
		token = await upgrades.deployProxy(
			USDCoin,
			[addrs[0]],
			{
				kind: "uups",
			}
		) as unknown as USDCoin;

		const AttestationVerifier = await ethers.getContractFactory("AttestationVerifier");
		attestationVerifier = await upgrades.deployProxy(
			AttestationVerifier,
			[[image1], [pubkeys[14]], addrs[0]],
			{ kind: "uups" },
		) as unknown as AttestationVerifier;

		let admin = addrs[0],
			images = [image1, image2],
			maxAge = 600,
			globalMinTimeout = 10 * 1000,  // in milliseconds
			globalMaxTimeout = 100 * 1000,  // in milliseconds
			overallTimeout = 100,
			executionFeePerMs = 10,  // fee is in USDC
			gatewayFeePerJob = 10,
			fixedGas = 150000,
			callbackMeasureGas = 4530;
		const Relay = await ethers.getContractFactory("Relay");
		relay = await upgrades.deployProxy(
			Relay,
			[admin, images],
			{
				kind: "uups",
				initializer: "initialize",
				constructorArgs: [
					attestationVerifier.target,
					maxAge,
					token.target,
					globalMinTimeout,
					globalMaxTimeout,
					overallTimeout,
					executionFeePerMs,
					gatewayFeePerJob,
					fixedGas,
					callbackMeasureGas
				]
			},
		) as unknown as Relay;

		await token.transfer(addrs[2], 10000000);
		await token.connect(signers[2]).approve(relay.target, 10000000);

		const timestamp = await time.latest() * 1000;
		let [signature, attestation] = await createAttestation(pubkeys[15], image2, wallets[14], timestamp - 540000);

		let signTimestamp = await time.latest();
		let signedDigest = await createGatewaySignature(addrs[1], signTimestamp, wallets[15]);

		await relay.connect(signers[1]).registerGateway(signature, attestation, signedDigest, signTimestamp);

		let codeHash = keccak256(solidityPacked(["string"], ["codehash"])),
			codeInputs = solidityPacked(["string"], ["codeInput"]),
			userTimeout = 50000,
			maxGasPrice = 10,
			refundAccount = addrs[1],
			callbackContract = addrs[1],
			callbackGasLimit = 0,
			periodicGap = 50,
			usdcDeposit = 2000000,
			startTimestamp = await time.latest(),
			terminationTimestamp = await time.latest() + 100;
		callbackDeposit = parseUnits("1", 7);
		await setNextBlockBaseFeePerGas(1);
		await relay.connect(signers[2])
			.startJobSubscription(
				codeHash, codeInputs, userTimeout, maxGasPrice, refundAccount, callbackContract, callbackGasLimit, periodicGap, usdcDeposit, startTimestamp, terminationTimestamp,
				{ value: callbackDeposit }
			);
	});

	takeSnapshotBeforeAndAfterEveryTest(async () => { });

	it("can withdraw funds from job subscription", async function () {
		let jobSubsId: any = await relay.jobSubsCount();
		let jobSubsInitial = await relay.jobSubscriptions(jobSubsId);
		let jobOwnerUsdcBalInit = await token.balanceOf(addrs[2]);
		let jobOwnerEthBalInit = await ethers.provider.getBalance(addrs[2]);

		await time.increase(210);
		let tx = await relay.connect(signers[2]).withdrawJobSubsFunds(jobSubsId);
		let txReceipt = await tx.wait();
		await expect(tx).to.emit(relay, "JobSubscriptionFundsWithdrawn");

		let jobSubsFinal = await relay.jobSubscriptions(jobSubsId);
		let jobOwnerUsdcBalFinal = await token.balanceOf(addrs[2]);
		let jobOwnerEthBalFinal = await ethers.provider.getBalance(addrs[2]);
		let gasCost = 0n;
		if(txReceipt)
			gasCost = txReceipt?.gasUsed * txReceipt?.gasPrice;

		expect(jobSubsFinal.job.jobOwner).to.eq(ZeroAddress);
		expect(jobOwnerUsdcBalFinal).to.be.eq(jobOwnerUsdcBalInit + jobSubsInitial.job.usdcDeposit);
		expect(jobOwnerEthBalFinal).to.be.eq(jobOwnerEthBalInit + jobSubsInitial.job.callbackDeposit - gasCost);
	});

	it("cannot withdraw funds from job subscription without job subscription owner account", async function () {
		let jobSubsId: any = await relay.jobSubsCount();

		let tx = relay.connect(signers[1]).withdrawJobSubsFunds(jobSubsId);
		await expect(tx).to.revertedWithCustomError(relay, "RelayNotJobSubscriptionOwner");
	});

	it("cannot withdraw funds from job subscription befre termination condition is met", async function () {
		let jobSubsId: any = await relay.jobSubsCount();

		let tx = relay.connect(signers[2]).withdrawJobSubsFunds(jobSubsId);
		await expect(tx).to.revertedWithCustomError(relay, "RelayTerminationConditionPending");
	});
});

describe("Relay - Job Subscription Termination", function () {
	let signers: Signer[];
	let addrs: string[];
	let token: USDCoin;
	let wallets: Wallet[];
	let pubkeys: string[];
	let attestationVerifier: AttestationVerifier;
	let relay: Relay;
	let callbackDeposit: bigint;

	before(async function () {
		signers = await ethers.getSigners();
		addrs = await Promise.all(signers.map((a) => a.getAddress()));
		wallets = signers.map((_, idx) => walletForIndex(idx));
		pubkeys = wallets.map((w) => normalize(w.signingKey.publicKey));

		const USDCoin = await ethers.getContractFactory("USDCoin");
		token = await upgrades.deployProxy(
			USDCoin,
			[addrs[0]],
			{
				kind: "uups",
			}
		) as unknown as USDCoin;

		const AttestationVerifier = await ethers.getContractFactory("AttestationVerifier");
		attestationVerifier = await upgrades.deployProxy(
			AttestationVerifier,
			[[image1], [pubkeys[14]], addrs[0]],
			{ kind: "uups" },
		) as unknown as AttestationVerifier;

		let admin = addrs[0],
			images = [image1, image2],
			maxAge = 600,
			globalMinTimeout = 10 * 1000,  // in milliseconds
			globalMaxTimeout = 100 * 1000,  // in milliseconds
			overallTimeout = 100,
			executionFeePerMs = 10,  // fee is in USDC
			gatewayFeePerJob = 10,
			fixedGas = 150000,
			callbackMeasureGas = 4530;
		const Relay = await ethers.getContractFactory("Relay");
		relay = await upgrades.deployProxy(
			Relay,
			[admin, images],
			{
				kind: "uups",
				initializer: "initialize",
				constructorArgs: [
					attestationVerifier.target,
					maxAge,
					token.target,
					globalMinTimeout,
					globalMaxTimeout,
					overallTimeout,
					executionFeePerMs,
					gatewayFeePerJob,
					fixedGas,
					callbackMeasureGas
				]
			},
		) as unknown as Relay;

		await token.transfer(addrs[2], 10000000);
		await token.connect(signers[2]).approve(relay.target, 10000000);

		const timestamp = await time.latest() * 1000;
		let [signature, attestation] = await createAttestation(pubkeys[15], image2, wallets[14], timestamp - 540000);

		let signTimestamp = await time.latest();
		let signedDigest = await createGatewaySignature(addrs[1], signTimestamp, wallets[15]);

		await relay.connect(signers[1]).registerGateway(signature, attestation, signedDigest, signTimestamp);

		let codeHash = keccak256(solidityPacked(["string"], ["codehash"])),
			codeInputs = solidityPacked(["string"], ["codeInput"]),
			userTimeout = 50000,
			maxGasPrice = 10,
			refundAccount = addrs[1],
			callbackContract = addrs[1],
			callbackGasLimit = 0,
			periodicGap = 50,
			usdcDeposit = 2000000,
			startTimestamp = await time.latest(),
			terminationTimestamp = await time.latest() + 100;
		callbackDeposit = parseUnits("1", 7);
		await setNextBlockBaseFeePerGas(1);
		await relay.connect(signers[2])
			.startJobSubscription(
				codeHash, codeInputs, userTimeout, maxGasPrice, refundAccount, callbackContract, callbackGasLimit, periodicGap, usdcDeposit, startTimestamp, terminationTimestamp,
				{ value: callbackDeposit }
			);
	});

	takeSnapshotBeforeAndAfterEveryTest(async () => { });

	it("can terminate job subscription", async function () {
		let jobSubsId: any = await relay.jobSubsCount(),
			terminationTimestamp = await time.latest() + 100;
		
		let jobSubsInitial = await relay.jobSubscriptions(jobSubsId);
		
		let tx = relay.connect(signers[2])
			.terminateJobSubscription(jobSubsId);
		await expect(tx).to.emit(relay, "JobSubscriptionTerminationParamsUpdated")
			.withArgs(jobSubsId, terminationTimestamp);

		let jobSubsFinal = await relay.jobSubscriptions(jobSubsId);
		expect(jobSubsFinal.terminationTimestamp).to.eq(terminationTimestamp);
		expect(jobSubsFinal.job.usdcDeposit).to.eq(jobSubsInitial.job.usdcDeposit);
		expect(jobSubsFinal.job.callbackDeposit).to.eq(jobSubsInitial.job.callbackDeposit);
	});

	it("cannot terminate without job subscription owner account", async function () {
		let jobSubsId: any = await relay.jobSubsCount();

		let tx = relay.connect(signers[1])
			.terminateJobSubscription(jobSubsId);
		await expect(tx).to.be.revertedWithCustomError(relay, "RelayNotJobSubscriptionOwner");
	});
});

describe.only("Relay - Job Subscription sent by UserSample contract", function () {
	let signers: Signer[];
	let addrs: string[];
	let token: USDCoin;
	let wallets: Wallet[];
	let pubkeys: string[];
	let attestationVerifier: AttestationVerifier;
	let relay: Relay;
	let userSample: UserSample;
	let	fixedGas: number;

	before(async function () {
		signers = await ethers.getSigners();
		addrs = await Promise.all(signers.map((a) => a.getAddress()));
		wallets = signers.map((_, idx) => walletForIndex(idx));
		pubkeys = wallets.map((w) => normalize(w.signingKey.publicKey));

		const USDCoin = await ethers.getContractFactory("USDCoin");
		token = await upgrades.deployProxy(
			USDCoin,
			[addrs[0]],
			{
				kind: "uups",
			}
		) as unknown as USDCoin;

		const AttestationVerifier = await ethers.getContractFactory("AttestationVerifier");
		attestationVerifier = await upgrades.deployProxy(
			AttestationVerifier,
			[[image1], [pubkeys[14]], addrs[0]],
			{ kind: "uups" },
		) as unknown as AttestationVerifier;

		let admin = addrs[0],
			images = [image1, image2],
			maxAge = 600,
			globalMinTimeout = 10 * 1000,  // in milliseconds
			globalMaxTimeout = 100 * 1000,  // in milliseconds
			overallTimeout = 100,
			executionFeePerMs = 10,  // fee is in USDC
			gatewayFeePerJob = 10,
			callbackMeasureGas = 4530;
		fixedGas = 150000;
		const Relay = await ethers.getContractFactory("Relay");
		relay = await upgrades.deployProxy(
			Relay,
			[admin, images],
			{
				kind: "uups",
				initializer: "initialize",
				constructorArgs: [
					attestationVerifier.target,
					maxAge,
					token.target,
					globalMinTimeout,
					globalMaxTimeout,
					overallTimeout,
					executionFeePerMs,
					gatewayFeePerJob,
					fixedGas,
					callbackMeasureGas
				]
			},
		) as unknown as Relay;

		const timestamp = await time.latest() * 1000;
		let [signature, attestation] = await createAttestation(pubkeys[15], image2, wallets[14], timestamp - 540000);

		let signTimestamp = await time.latest();
		let signedDigest = await createGatewaySignature(addrs[1], signTimestamp, wallets[15]);

		await relay.connect(signers[1]).registerGateway(signature, attestation, signedDigest, signTimestamp);

		const UserSample = await ethers.getContractFactory("UserSample");
		userSample = await UserSample.deploy(relay.target, token.target, addrs[10]) as unknown as UserSample;

		await token.transfer(userSample.target, 10000000);
	});

	takeSnapshotBeforeAndAfterEveryTest(async () => { });

	it("can submit response and execute callback", async function () {
		let codeHash = keccak256(solidityPacked(["string"], ["codehash"])),
			codeInputs = solidityPacked(["string"], ["codeInput"]),
			userTimeout = 50000,
			maxGasPrice = (await signers[0].provider?.getFeeData())?.gasPrice || parseUnits("1", 9),
			callbackDeposit = parseUnits("1"),	// 1 eth
			refundAccount = addrs[1],
			callbackContract = userSample.target,
			callbackGasLimit = 20000,
			periodicGap = 10,
			usdcDeposit = 2000000,
			startTimestamp = 0,
			terminationTimestamp = await time.latest() + 20;
		// deposit eth in UserSample contract before relaying jobs
		await signers[4].sendTransaction({to: userSample.target, value: callbackDeposit});
		await userSample.startJobSubscription(
			codeHash, codeInputs, userTimeout, maxGasPrice, callbackDeposit, refundAccount, callbackContract, callbackGasLimit, periodicGap, usdcDeposit,startTimestamp, terminationTimestamp
		);

		let jobId: any = await relay.jobSubsCount(),
			output = solidityPacked(["string"], ["it is the output"]),
			totalTime = 100,
			errorCode = 0,
			signTimestamp = await time.latest();

		// set tx.gasprice for next block
		await setNextBlockBaseFeePerGas(1);
		let signedDigest = await createJobResponseSignature(jobId, output, totalTime, errorCode, signTimestamp, wallets[15]);
		let initBalance = await ethers.provider.getBalance(addrs[1]);
		let tx = relay.connect(signers[2]).jobSubsResponse(signedDigest, jobId, output, totalTime, errorCode, signTimestamp);
		await expect(tx).to.emit(relay, "JobSubscriptionResponded")
			.and.to.emit(userSample, "CalledBack").withArgs(
				jobId, callbackContract, codeHash, codeInputs, output, errorCode
		);

		let jobOwner = userSample.target;
		let txReceipt = await (await tx).wait();
		// console.log("FIXED_GAS : ", txReceipt?.gasUsed);
		// validate callback cost and refund
		let txGasPrice = txReceipt?.gasPrice || 0n;
		let callbackGas = 9309; // calculated using console.log
		// console.log("txGasPrice: ", txGasPrice);
		let callbackCost = txGasPrice * (ethers.toBigInt(callbackGas + fixedGas));
		expect(await ethers.provider.getBalance(addrs[1])).to.equal(initBalance + callbackCost);
		expect((await relay.jobSubscriptions(jobId)).job.callbackDeposit).to.equal(callbackDeposit - callbackCost);

	});

	it("can submit response with gas price higher than maxGasPrice", async function () {
		let codeHash = keccak256(solidityPacked(["string"], ["codehash"])),
			codeInputs = solidityPacked(["string"], ["codeInput"]),
			userTimeout = 50000,
			maxGasPrice = (await signers[0].provider?.getFeeData())?.gasPrice || parseUnits("1", 9),
			callbackDeposit = parseUnits("1"),	// 1 eth
			refundAccount = addrs[1],
			callbackContract = userSample.target,
			callbackGasLimit = 20000,
			periodicGap = 10,
			usdcDeposit = 2000000,
			startTimestamp = 0,
			terminationTimestamp = await time.latest() + 20;
		// deposit eth in UserSample contract before relaying jobs
		await signers[4].sendTransaction({to: userSample.target, value: callbackDeposit});
		await userSample.startJobSubscription(
			codeHash, codeInputs, userTimeout, maxGasPrice, callbackDeposit, refundAccount, callbackContract, callbackGasLimit, periodicGap, usdcDeposit,startTimestamp, terminationTimestamp
		);

		let jobId: any = await relay.jobSubsCount(),
			output = solidityPacked(["string"], ["it is the output"]),
			totalTime = 100,
			errorCode = 0,
			signTimestamp = await time.latest();

		let initBalance = await ethers.provider.getBalance(addrs[1]);

		// set tx.gasprice for next block
		await setNextBlockBaseFeePerGas(maxGasPrice + 10n);
		let signedDigest = await createJobResponseSignature(jobId, output, totalTime, errorCode, signTimestamp, wallets[15]);
		let tx = relay.connect(signers[2]).jobSubsResponse(signedDigest, jobId, output, totalTime, errorCode, signTimestamp);
		await expect(tx).to.emit(relay, "JobSubscriptionResponded")
			.and.to.not.emit(userSample, "CalledBack");

		// validate callback cost and refund
		let jobOwner = userSample.target;
		let txGasPrice = (await (await tx).wait())?.gasPrice || 0n;
		let callbackCost = txGasPrice * (ethers.toBigInt(fixedGas));
		expect(await ethers.provider.getBalance(addrs[1])).to.equal(initBalance + callbackCost);
		expect((await relay.jobSubscriptions(jobId)).job.callbackDeposit).to.equal(callbackDeposit - callbackCost);
	});
});

function normalize(key: string): string {
	return '0x' + key.substring(4);
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

async function createGatewaySignature(
	owner: string,
	signTimestamp: number,
	sourceEnclaveWallet: Wallet
): Promise<string> {
	const domain = {
		name: 'marlin.oyster.Relay',
		version: '1',
	};

	const types = {
		Register: [
			{ name: 'owner', type: 'address' },
			{ name: 'signTimestamp', type: 'uint256' }
		]
	};

	const value = {
		owner,
		signTimestamp
	};

	const sign = await sourceEnclaveWallet.signTypedData(domain, types, value);
	return ethers.Signature.from(sign).serialized;
}

async function createJobResponseSignature(
	jobId: number | bigint,
    output: string,
	totalTime: number,
    errorCode: number,
	signTimestamp: number,
	sourceEnclaveWallet: Wallet
): Promise<string> {
	const domain = {
		name: 'marlin.oyster.Relay',
		version: '1'
	};

	const types = {
		JobResponse: [
			{ name: 'jobId', type: 'uint256' },
			{ name: 'output', type: 'bytes' },
			{ name: 'totalTime', type: 'uint256' },
			{ name: 'errorCode', type: 'uint8' },
			{ name: 'signTimestamp', type: 'uint256' }
		]
	};

	const value = {
		jobId,
		output,
		totalTime,
		errorCode,
		signTimestamp
	};

	const sign = await sourceEnclaveWallet.signTypedData(domain, types, value);
	return ethers.Signature.from(sign).serialized;
}

function walletForIndex(idx: number): Wallet {
	let wallet = ethers.HDNodeWallet.fromPhrase("test test test test test test test test test test test junk", undefined, "m/44'/60'/0'/0/" + idx.toString());

	return new Wallet(wallet.privateKey);
}