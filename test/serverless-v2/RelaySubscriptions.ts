import { setNextBlockBaseFeePerGas, time } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from "chai";
import { BytesLike, Signer, Wallet, ZeroAddress, keccak256, parseUnits, solidityPacked } from "ethers";
import { ethers, upgrades } from "hardhat";
import { AttestationAutherUpgradeable, AttestationVerifier, Relay, RelaySubscriptions, USDCoin, UserSample } from "../../typechain-types";
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

describe("RelaySubscriptions - Init", function () {
	let signers: Signer[];
	let addrs: string[];

	before(async function () {
		signers = await ethers.getSigners();
		addrs = await Promise.all(signers.map((a) => a.getAddress()));
	});

	takeSnapshotBeforeAndAfterEveryTest(async () => { });

	it("deploys with initialization disabled", async function () {
		const RelaySubscriptions = await ethers.getContractFactory("RelaySubscriptions");
		const relaySubscriptions = await RelaySubscriptions.deploy(addrs[1]);

		await expect(
			relaySubscriptions.initialize(addrs[0]),
		).to.be.revertedWithCustomError(RelaySubscriptions, "InvalidInitialization");
	});

	it("deploys as proxy and initializes", async function () {
		const RelaySubscriptions = await ethers.getContractFactory("RelaySubscriptions");
		const relaySubscriptions = await upgrades.deployProxy(
			RelaySubscriptions,
			[addrs[0]],
			{
				kind: "uups",
				initializer: "initialize",
				constructorArgs: [
					addrs[1]
				]
			},
		);

		expect(await relaySubscriptions.hasRole(await relaySubscriptions.DEFAULT_ADMIN_ROLE(), addrs[0])).to.be.true;
	});

	it("cannot deploy with RelaySubscriptions contract as zero address", async function () {
		const RelaySubscriptions = await ethers.getContractFactory("RelaySubscriptions");
		await expect(
			upgrades.deployProxy(
				RelaySubscriptions,
				[addrs[0]],
				{
					kind: "uups",
					initializer: "initialize",
					constructorArgs: [
						ZeroAddress
					]
				},
			)
		).to.be.revertedWithCustomError(RelaySubscriptions, "RelaySubscriptionsInvalidRelay");
	});

	it("cannot initialize with admin as zero address", async function () {
		const RelaySubscriptions = await ethers.getContractFactory("RelaySubscriptions");
		await expect(
			upgrades.deployProxy(
				RelaySubscriptions,
				[
					ZeroAddress
				],
				{
					kind: "uups",
					initializer: "initialize",
					constructorArgs: [
						addrs[1]
					]
				},
			)
		).to.be.revertedWithCustomError(RelaySubscriptions, "RelaySubscriptionsZeroAddressAdmin");
	});

	it("upgrades", async function () {
		const RelaySubscriptions = await ethers.getContractFactory("RelaySubscriptions");
		const relaySubscriptions = await upgrades.deployProxy(
			RelaySubscriptions,
			[
				addrs[0]
			],
			{
				kind: "uups",
				initializer: "initialize",
				constructorArgs: [
					addrs[1]
				]
			},
		) as unknown as RelaySubscriptions;
		await upgrades.upgradeProxy(
			relaySubscriptions.target,
			RelaySubscriptions,
			{
				kind: "uups",
				constructorArgs: [
					addrs[2]
				]
			}
		);

		expect(await relaySubscriptions.hasRole(await relaySubscriptions.DEFAULT_ADMIN_ROLE(), addrs[0])).to.be.true;
		expect(await relaySubscriptions.RELAY()).to.eq(addrs[2]);
	});

	it("does not upgrade without admin", async function () {
		const RelaySubscriptions = await ethers.getContractFactory("RelaySubscriptions");
		const relaySubscriptions = await upgrades.deployProxy(
			RelaySubscriptions,
			[addrs[0]],
			{
				kind: "uups",
				initializer: "initialize",
				constructorArgs: [
					addrs[1]
				]
			}
		);

		await expect(
			upgrades.upgradeProxy(
				relaySubscriptions.target, RelaySubscriptions.connect(signers[1]),
				{
					kind: "uups",
					constructorArgs: [
						addrs[2]
					]
				}
			)
		).to.be.revertedWithCustomError(RelaySubscriptions, "AccessControlUnauthorizedAccount");
	});
});

testERC165(
	"RelaySubscriptions - ERC165",
	async function(_signers: Signer[], addrs: string[]) {
		let admin = addrs[0],
			relay = addrs[1];
		const RelaySubscriptions = await ethers.getContractFactory("RelaySubscriptions");
		const relaySubscriptions = await upgrades.deployProxy(
			RelaySubscriptions,
			[admin],
			{
				kind: "uups",
				initializer: "initialize",
				constructorArgs: [
					relay
				]
			},
		);
		return relaySubscriptions;
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

describe("RelaySubscriptions - Start Job Subscription", function () {
	let signers: Signer[];
	let addrs: string[];
	let token: USDCoin;
	let wallets: Wallet[];
	let pubkeys: string[];
	let attestationVerifier: AttestationVerifier;
	let relay: Relay;
	let relaySubscriptions: RelaySubscriptions;

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

		const RelaySubscriptions = await ethers.getContractFactory("RelaySubscriptions");
		relaySubscriptions = await upgrades.deployProxy(
			RelaySubscriptions,
			[admin],
			{
				kind: "uups",
				initializer: "initialize",
				constructorArgs: [
					relay.target
				]
			},
		) as unknown as RelaySubscriptions;

		await token.transfer(addrs[2], 10000000);
		await token.connect(signers[2]).approve(relaySubscriptions.target, 10000000);

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
		let tx = await relaySubscriptions.connect(signers[2])
			.startJobSubscription(
				codeHash, codeInputs, userTimeout, maxGasPrice, refundAccount, callbackContract, callbackGasLimit, periodicGap, usdcDeposit, startTimestamp, terminationTimestamp,
				{ value: callbackDeposit }
			);
		await expect(tx).to.emit(relaySubscriptions, "JobSubscriptionStarted");

		let key = await relaySubscriptions.jobSubsCount();
		let jobSubs = await relaySubscriptions.jobSubscriptions(key);

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
		let tx = relaySubscriptions.connect(signers[2])
			.startJobSubscription(
				codeHash, codeInputs, userTimeout, maxGasPrice, refundAccount, callbackContract, callbackGasLimit, periodicGap, usdcDeposit, startTimestamp, terminationTimestamp,
				{ value: callbackDeposit }
			);
		await expect(tx).to.revertedWithCustomError(relaySubscriptions, "RelaySubscriptionsInvalidStartTimestamp");
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
		let tx = relaySubscriptions.connect(signers[2])
			.startJobSubscription(
				codeHash, codeInputs, userTimeout, maxGasPrice, refundAccount, callbackContract, callbackGasLimit, periodicGap, usdcDeposit, startTimestamp, terminationTimestamp,
				{ value: callbackDeposit }
			);
		await expect(tx).to.revertedWithCustomError(relaySubscriptions, "RelaySubscriptionsInvalidTerminationTimestamp");
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
		let tx = relaySubscriptions.connect(signers[2])
			.startJobSubscription(
				codeHash, codeInputs, userTimeout, maxGasPrice, refundAccount, callbackContract, callbackGasLimit, periodicGap, usdcDeposit, startTimestamp, terminationTimestamp,
				{ value: callbackDeposit }
			);
		await expect(tx).to.revertedWithCustomError(relaySubscriptions, "RelaySubscriptionsInvalidUserTimeout");

		userTimeout = 1000 * 1000;
		tx = relaySubscriptions.connect(signers[2])
			.startJobSubscription(
				codeHash, codeInputs, userTimeout, maxGasPrice, refundAccount, callbackContract, callbackGasLimit, periodicGap, usdcDeposit, startTimestamp, terminationTimestamp,
				{ value: callbackDeposit }
			);
		await expect(tx).to.revertedWithCustomError(relaySubscriptions, "RelaySubscriptionsInvalidUserTimeout");
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

		let tx = relaySubscriptions.connect(signers[2])
			.startJobSubscription(
				codeHash, codeInputs, userTimeout, maxGasPrice, refundAccount, callbackContract, callbackGasLimit, periodicGap, usdcDeposit, startTimestamp, terminationTimestamp,
				{ value: callbackDeposit }
			);
		await expect(tx).to.revertedWithCustomError(relaySubscriptions, "RelaySubscriptionsInsufficientCallbackDeposit");
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
		let tx = relaySubscriptions.connect(signers[2])
			.startJobSubscription(
				codeHash, codeInputs, userTimeout, maxGasPrice, refundAccount, callbackContract, callbackGasLimit, periodicGap, usdcDeposit, startTimestamp, terminationTimestamp,
				{ value: callbackDeposit }
			);
		await expect(tx).to.revertedWithCustomError(relaySubscriptions, "RelaySubscriptionsInsufficientMaxGasPrice");
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
		let tx = relaySubscriptions.connect(signers[2])
			.startJobSubscription(
				codeHash, codeInputs, userTimeout, maxGasPrice, refundAccount, callbackContract, callbackGasLimit, periodicGap, usdcDeposit, startTimestamp, terminationTimestamp,
				{ value: callbackDeposit }
			);
		await expect(tx).to.revertedWithCustomError(relaySubscriptions, "RelaySubscriptionsInsufficientUsdcDeposit");
	});
});

describe("RelaySubscriptions - Job Subscription Response", function () {
	let signers: Signer[];
	let addrs: string[];
	let token: USDCoin;
	let wallets: Wallet[];
	let pubkeys: string[];
	let attestationVerifier: AttestationVerifier;
	let relay: Relay;
	let callbackDeposit: bigint;
	let relaySubscriptions: RelaySubscriptions;

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

		const RelaySubscriptions = await ethers.getContractFactory("RelaySubscriptions");
		relaySubscriptions = await upgrades.deployProxy(
			RelaySubscriptions,
			[admin],
			{
				kind: "uups",
				initializer: "initialize",
				constructorArgs: [
					relay.target
				]
			},
		) as unknown as RelaySubscriptions;

		await token.transfer(addrs[2], 10000000);
		await token.connect(signers[2]).approve(relaySubscriptions.target, 10000000);

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
		await relaySubscriptions.connect(signers[2])
			.startJobSubscription(
				codeHash, codeInputs, userTimeout, maxGasPrice, refundAccount, callbackContract, callbackGasLimit, periodicGap, usdcDeposit, startTimestamp, terminationTimestamp,
				{ value: callbackDeposit }
			);
	});

	takeSnapshotBeforeAndAfterEveryTest(async () => { });

	it("can submit response", async function () {
		let jobSubsId = await relaySubscriptions.jobSubsCount(),
			jobId = jobSubsId,	// last 127 bits(i.e. instanceCount) would be 0 for the first response
			output = solidityPacked(["string"], ["it is the output"]),
			totalTime = 100,
			errorCode = 0,
			signTimestamp = await time.latest();
		let gatewayUsdcBalInit = await token.balanceOf(addrs[1]);

		let signedDigest = await createJobResponseSignature(jobId, output, totalTime, errorCode, signTimestamp, wallets[15]);
		let tx = relaySubscriptions.connect(signers[1]).jobSubsResponse(signedDigest, jobId, output, totalTime, errorCode, signTimestamp);
		await expect(tx).to.emit(relaySubscriptions, "JobSubscriptionResponded");

		let jobSubs = await relaySubscriptions.jobSubscriptions(jobSubsId);
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
		let tx = relaySubscriptions.connect(signers[1]).jobSubsResponse(signedDigest, jobId, output, totalTime, errorCode, signTimestamp);
		await expect(tx).to.revertedWithCustomError(relaySubscriptions, "RelaySubscriptionsInvalidJobSubscription");
	});

	it("cannot submit response after overall timeout is over", async function () {
		await time.increase(1100);
		let jobId = await relaySubscriptions.jobSubsCount(),
			output = solidityPacked(["string"], ["it is the output"]),
			totalTime = 100,
			errorCode = 0,
			signTimestamp = await time.latest();

		let signedDigest = await createJobResponseSignature(jobId, output, totalTime, errorCode, signTimestamp, wallets[15]);
		let tx = relaySubscriptions.connect(signers[1]).jobSubsResponse(signedDigest, jobId, output, totalTime, errorCode, signTimestamp);
		await expect(tx).to.revertedWithCustomError(relaySubscriptions, "RelaySubscriptionsOverallTimeoutOver");
	});

	it("cannot submit response with instance count lower than current runs", async function () {
		let jobId = await relaySubscriptions.jobSubsCount(),
			output = solidityPacked(["string"], ["it is the output"]),
			totalTime = 100,
			errorCode = 0,
			signTimestamp = await time.latest();

		let signedDigest = await createJobResponseSignature(jobId, output, totalTime, errorCode, signTimestamp, wallets[15]);
		let tx = relaySubscriptions.connect(signers[1]).jobSubsResponse(signedDigest, jobId, output, totalTime, errorCode, signTimestamp);
		await expect(tx).to.emit(relaySubscriptions, "JobSubscriptionResponded");

		await time.increase(10);
		// sending another response with same instance count
		signedDigest = await createJobResponseSignature(jobId, output, totalTime, errorCode, signTimestamp, wallets[15]);
		tx = relaySubscriptions.connect(signers[1]).jobSubsResponse(signedDigest, jobId, output, totalTime, errorCode, signTimestamp);
		await expect(tx).to.revertedWithCustomError(relaySubscriptions, "RelaySubscriptionsInvalidCurrentRuns");
	});

	it("cannot submit response with expired signature", async function () {
		let jobId: any = await relaySubscriptions.jobSubsCount(),
			output = solidityPacked(["string"], ["it is the output"]),
			totalTime = 100,
			errorCode = 0,
			signTimestamp = await time.latest() - 700;

		let signedDigest = await createJobResponseSignature(jobId, output, totalTime, errorCode, signTimestamp, wallets[15]);
		let tx = relaySubscriptions.connect(signers[1]).jobSubsResponse(signedDigest, jobId, output, totalTime, errorCode, signTimestamp);
		await expect(tx).to.revertedWithCustomError(relaySubscriptions, "RelaySubscriptionsSignatureTooOld");
	});

	it("cannot submit output from unverified gateway", async function () {
		let jobId: any = await relaySubscriptions.jobSubsCount(),
			output = solidityPacked(["string"], ["it is the output"]),
			totalTime = 100,
			errorCode = 0,
			signTimestamp = await time.latest();

		let signedDigest = await createJobResponseSignature(jobId, output, totalTime, errorCode, signTimestamp, wallets[16]);
		let tx = relaySubscriptions.connect(signers[1]).jobSubsResponse(signedDigest, jobId, output, totalTime, errorCode, signTimestamp);
		await expect(tx).to.revertedWithCustomError(relay, "AttestationAutherKeyNotVerified");
	});

	it("callback cost is greater than the deposit", async function () {
		let jobId: any = await relaySubscriptions.jobSubsCount(),
			output = solidityPacked(["string"], ["it is the output"]),
			totalTime = 100,
			errorCode = 0,
			signTimestamp = await time.latest();

		let initBalance1 = await ethers.provider.getBalance(addrs[1]);
		let initBalance2 = await ethers.provider.getBalance(addrs[2]);
		await setNextBlockBaseFeePerGas(1e14);
		let signedDigest = await createJobResponseSignature(jobId, output, totalTime, errorCode, signTimestamp, wallets[15]);
		await relaySubscriptions.connect(signers[3]).jobSubsResponse(signedDigest, jobId, output, totalTime, errorCode, signTimestamp);
		expect(await ethers.provider.getBalance(addrs[1])).to.equal(initBalance1 + callbackDeposit);
		expect(await ethers.provider.getBalance(addrs[2])).to.equal(initBalance2);
	});

});

describe("RelaySubscriptions - Job Subscription Deposit", function () {
	let signers: Signer[];
	let addrs: string[];
	let token: USDCoin;
	let wallets: Wallet[];
	let pubkeys: string[];
	let attestationVerifier: AttestationVerifier;
	let relay: Relay;
	let callbackDeposit: bigint;
	let relaySubscriptions: RelaySubscriptions;

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

		const RelaySubscriptions = await ethers.getContractFactory("RelaySubscriptions");
		relaySubscriptions = await upgrades.deployProxy(
			RelaySubscriptions,
			[admin],
			{
				kind: "uups",
				initializer: "initialize",
				constructorArgs: [
					relay.target
				]
			},
		) as unknown as RelaySubscriptions;

		await token.transfer(addrs[2], 10000000);
		await token.connect(signers[2]).approve(relaySubscriptions.target, 10000000);

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
		await relaySubscriptions.connect(signers[2])
			.startJobSubscription(
				codeHash, codeInputs, userTimeout, maxGasPrice, refundAccount, callbackContract, callbackGasLimit, periodicGap, usdcDeposit, startTimestamp, terminationTimestamp,
				{ value: callbackDeposit }
			);
	});

	takeSnapshotBeforeAndAfterEveryTest(async () => { });

	it("can deposit USDC and ETH later", async function () {
		let jobSubsId: any = await relaySubscriptions.jobSubsCount(),
			usdcDeposit = 2000000n;
		let jobSubsInitial = await relaySubscriptions.jobSubscriptions(jobSubsId);

		let tx = relaySubscriptions.connect(signers[2])
			.depositJobSubscriptionFunds(jobSubsId, usdcDeposit, 
				{ value: callbackDeposit }
			);
		await expect(tx).to.emit(relaySubscriptions, "JobSubscriptionFundsDeposited")
			.withArgs(jobSubsId, addrs[2], usdcDeposit, callbackDeposit);

		let jobSubsFinal = await relaySubscriptions.jobSubscriptions(jobSubsId);
		expect(jobSubsFinal.job.usdcDeposit).to.eq(jobSubsInitial.job.usdcDeposit + usdcDeposit);
		expect(jobSubsFinal.job.callbackDeposit).to.eq(jobSubsInitial.job.callbackDeposit + callbackDeposit);
	});

	it("cannot deposit assets later for invalid job subsription", async function () {
		let jobSubsId = 1,
			usdcDeposit = 2000000n;

		let tx = relaySubscriptions.connect(signers[2])
			.depositJobSubscriptionFunds(jobSubsId, usdcDeposit, 
				{ value: callbackDeposit }
			);
		await expect(tx).to.revertedWithCustomError(relaySubscriptions, "RelaySubscriptionsInvalidJobSubscription");
	});
});

describe("RelaySubscriptions - Update Job Subscription Params", function () {
	let signers: Signer[];
	let addrs: string[];
	let token: USDCoin;
	let wallets: Wallet[];
	let pubkeys: string[];
	let attestationVerifier: AttestationVerifier;
	let relay: Relay;
	let callbackDeposit: bigint;
	let relaySubscriptions: RelaySubscriptions;

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

		const RelaySubscriptions = await ethers.getContractFactory("RelaySubscriptions");
		relaySubscriptions = await upgrades.deployProxy(
			RelaySubscriptions,
			[admin],
			{
				kind: "uups",
				initializer: "initialize",
				constructorArgs: [
					relay.target
				]
			},
		) as unknown as RelaySubscriptions;

		await token.transfer(addrs[2], 10000000);
		await token.connect(signers[2]).approve(relaySubscriptions.target, 10000000);

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
		await relaySubscriptions.connect(signers[2])
			.startJobSubscription(
				codeHash, codeInputs, userTimeout, maxGasPrice, refundAccount, callbackContract, callbackGasLimit, periodicGap, usdcDeposit, startTimestamp, terminationTimestamp,
				{ value: callbackDeposit }
			);
	});

	takeSnapshotBeforeAndAfterEveryTest(async () => { });

	it("can update job params", async function () {
		let jobSubsId: any = await relaySubscriptions.jobSubsCount(),
			codeHash = keccak256(solidityPacked(["string"], ["codehash1"])),
			codeInputs = solidityPacked(["string"], ["codeInput1"]);

		let tx = relaySubscriptions.connect(signers[2]).updateJobSubsJobParams(jobSubsId, codeHash, codeInputs);
		await expect(tx).to.emit(relaySubscriptions, "JobSubscriptionJobParamsUpdated")
			.withArgs(jobSubsId, codeHash, codeInputs);

		let jobSubs = await relaySubscriptions.jobSubscriptions(jobSubsId);
		expect(jobSubs.job.codehash).to.eq(codeHash);
		expect(jobSubs.job.codeInputs).to.eq(codeInputs);
	});

	it("cannot update job params without job subscription owner account", async function () {
		let jobSubsId: any = await relaySubscriptions.jobSubsCount(),
			codeHash = keccak256(solidityPacked(["string"], ["codehash1"])),
			codeInputs = solidityPacked(["string"], ["codeInput1"]);

		let tx = relaySubscriptions.connect(signers[1]).updateJobSubsJobParams(jobSubsId, codeHash, codeInputs);
		await expect(tx).to.revertedWithCustomError(relaySubscriptions, "RelaySubscriptionsNotJobSubscriptionOwner");
	});

	it("can update job termination params", async function () {
		let jobSubsId: any = await relaySubscriptions.jobSubsCount(),
			terminationTimestamp = await time.latest() + 110,
			usdcDeposit = 2000000n;
		
		let jobSubsInitial = await relaySubscriptions.jobSubscriptions(jobSubsId);
		
		let tx = relaySubscriptions.connect(signers[2])
			.updateJobSubsTerminationParams(jobSubsId, terminationTimestamp, usdcDeposit, 
				{ value: callbackDeposit }
			);
		await expect(tx).to.emit(relaySubscriptions, "JobSubscriptionTerminationParamsUpdated")
			.withArgs(jobSubsId, terminationTimestamp);

		let jobSubsFinal = await relaySubscriptions.jobSubscriptions(jobSubsId);
		expect(jobSubsFinal.terminationTimestamp).to.eq(terminationTimestamp);
		expect(jobSubsFinal.job.usdcDeposit).to.eq(jobSubsInitial.job.usdcDeposit + usdcDeposit);
		expect(jobSubsFinal.job.callbackDeposit).to.eq(jobSubsInitial.job.callbackDeposit + callbackDeposit);
	});

	it("cannot update job termination params without job subscription owner account", async function () {
		let jobSubsId: any = await relaySubscriptions.jobSubsCount(),
			terminationTimestamp = await time.latest() + 110,
			usdcDeposit = 2000000;

		let tx = relaySubscriptions.connect(signers[1])
			.updateJobSubsTerminationParams(jobSubsId, terminationTimestamp, usdcDeposit, 
				{ value: callbackDeposit }
			);
		await expect(tx).to.be.revertedWithCustomError(relaySubscriptions, "RelaySubscriptionsNotJobSubscriptionOwner");
	});

	it("cannot update job termination params with invalid termination timestamp", async function () {
		let jobSubsId: any = await relaySubscriptions.jobSubsCount(),
			terminationTimestamp = await time.latest() + 90, // invalid termination timestamp as it doesn't exceed atleast OVERALL_TIMEOUT from the current timestamp
			usdcDeposit = 2000000;

		let tx = relaySubscriptions.connect(signers[2])
			.updateJobSubsTerminationParams(jobSubsId, terminationTimestamp, usdcDeposit, 
				{ value: callbackDeposit }
			);
		await expect(tx).to.be.revertedWithCustomError(relaySubscriptions, "RelaySubscriptionsInvalidTerminationTimestamp");
	});

	it("cannot update job termination params after the termination condition is reached", async function () {
		let jobSubsId: any = await relaySubscriptions.jobSubsCount(),
			terminationTimestamp = await time.latest() + 250, // invalid termination timestamp as it doesn't exceed atleast OVERALL_TIMEOUT from the current timestamp
			usdcDeposit = 2000000;

		await time.increase(120);
		let tx = relaySubscriptions.connect(signers[2])
			.updateJobSubsTerminationParams(jobSubsId, terminationTimestamp, usdcDeposit, 
				{ value: callbackDeposit }
			);
		await expect(tx).to.be.revertedWithCustomError(relaySubscriptions, "RelaySubscriptionsJobSubscriptionTerminated");
	});

	it("cannot update job termination params with insufficient callback deposit", async function () {
		let jobSubsId: any = await relaySubscriptions.jobSubsCount(),
			terminationTimestamp = await time.latest() + 1000,
			usdcDeposit = 2000000;

		let tx = relaySubscriptions.connect(signers[2])
			.updateJobSubsTerminationParams(jobSubsId, terminationTimestamp, usdcDeposit, 
				{ value: 0 }
			);
		await expect(tx).to.be.revertedWithCustomError(relaySubscriptions, "RelaySubscriptionsInsufficientCallbackDeposit");
	});

	it("cannot update job termination params with insufficient USDC deposit", async function () {
		let jobSubsId: any = await relaySubscriptions.jobSubsCount(),
			terminationTimestamp = await time.latest() + 1000,
			usdcDeposit = 2000000;

		let tx = relaySubscriptions.connect(signers[2])
			.updateJobSubsTerminationParams(jobSubsId, terminationTimestamp, usdcDeposit, 
				{ value: parseUnits("1") }
			);
		await expect(tx).to.be.revertedWithCustomError(relaySubscriptions, "RelaySubscriptionsInsufficientUsdcDeposit");
	});
});

describe("RelaySubscriptions - Job Subscription Withdrawal", function () {
	let signers: Signer[];
	let addrs: string[];
	let token: USDCoin;
	let wallets: Wallet[];
	let pubkeys: string[];
	let attestationVerifier: AttestationVerifier;
	let relay: Relay;
	let callbackDeposit: bigint;
	let relaySubscriptions: RelaySubscriptions;

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

		const RelaySubscriptions = await ethers.getContractFactory("RelaySubscriptions");
		relaySubscriptions = await upgrades.deployProxy(
			RelaySubscriptions,
			[admin],
			{
				kind: "uups",
				initializer: "initialize",
				constructorArgs: [
					relay.target
				]
			},
		) as unknown as RelaySubscriptions;

		await token.transfer(addrs[2], 10000000);
		await token.connect(signers[2]).approve(relaySubscriptions.target, 10000000);

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
		await relaySubscriptions.connect(signers[2])
			.startJobSubscription(
				codeHash, codeInputs, userTimeout, maxGasPrice, refundAccount, callbackContract, callbackGasLimit, periodicGap, usdcDeposit, startTimestamp, terminationTimestamp,
				{ value: callbackDeposit }
			);
	});

	takeSnapshotBeforeAndAfterEveryTest(async () => { });

	it("can withdraw funds from job subscription", async function () {
		let jobSubsId: any = await relaySubscriptions.jobSubsCount();
		let jobSubsInitial = await relaySubscriptions.jobSubscriptions(jobSubsId);
		let jobOwnerUsdcBalInit = await token.balanceOf(addrs[2]);
		let jobOwnerEthBalInit = await ethers.provider.getBalance(addrs[2]);

		await time.increase(210);
		let tx = await relaySubscriptions.connect(signers[2]).withdrawJobSubsFunds(jobSubsId);
		let txReceipt = await tx.wait();
		await expect(tx).to.emit(relaySubscriptions, "JobSubscriptionFundsWithdrawn");

		let jobSubsFinal = await relaySubscriptions.jobSubscriptions(jobSubsId);
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
		let jobSubsId: any = await relaySubscriptions.jobSubsCount();

		let tx = relaySubscriptions.connect(signers[1]).withdrawJobSubsFunds(jobSubsId);
		await expect(tx).to.revertedWithCustomError(relaySubscriptions, "RelaySubscriptionsNotJobSubscriptionOwner");
	});

	it("cannot withdraw funds from job subscription befre termination condition is met", async function () {
		let jobSubsId: any = await relaySubscriptions.jobSubsCount();

		let tx = relaySubscriptions.connect(signers[2]).withdrawJobSubsFunds(jobSubsId);
		await expect(tx).to.revertedWithCustomError(relaySubscriptions, "RelaySubscriptionsTerminationConditionPending");
	});
});

describe("RelaySubscriptions - Job Subscription Termination", function () {
	let signers: Signer[];
	let addrs: string[];
	let token: USDCoin;
	let wallets: Wallet[];
	let pubkeys: string[];
	let attestationVerifier: AttestationVerifier;
	let relay: Relay;
	let callbackDeposit: bigint;
	let relaySubscriptions: RelaySubscriptions;

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

		const RelaySubscriptions = await ethers.getContractFactory("RelaySubscriptions");
		relaySubscriptions = await upgrades.deployProxy(
			RelaySubscriptions,
			[admin],
			{
				kind: "uups",
				initializer: "initialize",
				constructorArgs: [
					relay.target
				]
			},
		) as unknown as RelaySubscriptions;

		await token.transfer(addrs[2], 10000000);
		await token.connect(signers[2]).approve(relaySubscriptions.target, 10000000);

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
		await relaySubscriptions.connect(signers[2])
			.startJobSubscription(
				codeHash, codeInputs, userTimeout, maxGasPrice, refundAccount, callbackContract, callbackGasLimit, periodicGap, usdcDeposit, startTimestamp, terminationTimestamp,
				{ value: callbackDeposit }
			);
	});

	takeSnapshotBeforeAndAfterEveryTest(async () => { });

	it("can terminate job subscription", async function () {
		let jobSubsId: any = await relaySubscriptions.jobSubsCount(),
			terminationTimestamp = await time.latest() + 100;
		
		let jobSubsInitial = await relaySubscriptions.jobSubscriptions(jobSubsId);
		
		let tx = relaySubscriptions.connect(signers[2])
			.terminateJobSubscription(jobSubsId);
		await expect(tx).to.emit(relaySubscriptions, "JobSubscriptionTerminationParamsUpdated")
			.withArgs(jobSubsId, terminationTimestamp);

		let jobSubsFinal = await relaySubscriptions.jobSubscriptions(jobSubsId);
		expect(jobSubsFinal.terminationTimestamp).to.eq(terminationTimestamp);
		expect(jobSubsFinal.job.usdcDeposit).to.eq(jobSubsInitial.job.usdcDeposit);
		expect(jobSubsFinal.job.callbackDeposit).to.eq(jobSubsInitial.job.callbackDeposit);
	});

	it("cannot terminate without job subscription owner account", async function () {
		let jobSubsId: any = await relaySubscriptions.jobSubsCount();

		let tx = relaySubscriptions.connect(signers[1])
			.terminateJobSubscription(jobSubsId);
		await expect(tx).to.be.revertedWithCustomError(relaySubscriptions, "RelaySubscriptionsNotJobSubscriptionOwner");
	});
});

describe("RelaySubscriptions - Job Subscription sent by UserSample contract", function () {
	let signers: Signer[];
	let addrs: string[];
	let token: USDCoin;
	let wallets: Wallet[];
	let pubkeys: string[];
	let attestationVerifier: AttestationVerifier;
	let relay: Relay;
	let userSample: UserSample;
	let	fixedGas: number;
	let relaySubscriptions: RelaySubscriptions;

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

		const RelaySubscriptions = await ethers.getContractFactory("RelaySubscriptions");
		relaySubscriptions = await upgrades.deployProxy(
			RelaySubscriptions,
			[admin],
			{
				kind: "uups",
				initializer: "initialize",
				constructorArgs: [
					relay.target
				]
			},
		) as unknown as RelaySubscriptions;

		const timestamp = await time.latest() * 1000;
		let [signature, attestation] = await createAttestation(pubkeys[15], image2, wallets[14], timestamp - 540000);

		let signTimestamp = await time.latest();
		let signedDigest = await createGatewaySignature(addrs[1], signTimestamp, wallets[15]);

		await relay.connect(signers[1]).registerGateway(signature, attestation, signedDigest, signTimestamp);

		const UserSample = await ethers.getContractFactory("UserSample");
		userSample = await UserSample.deploy(relay.target, relaySubscriptions.target, token.target, addrs[10]) as unknown as UserSample;

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

		let jobId: any = await relaySubscriptions.jobSubsCount(),
			output = solidityPacked(["string"], ["it is the output"]),
			totalTime = 100,
			errorCode = 0,
			signTimestamp = await time.latest();

		// set tx.gasprice for next block
		await setNextBlockBaseFeePerGas(1);
		let signedDigest = await createJobResponseSignature(jobId, output, totalTime, errorCode, signTimestamp, wallets[15]);
		let initBalance = await ethers.provider.getBalance(addrs[1]);
		let tx = relaySubscriptions.connect(signers[2]).jobSubsResponse(signedDigest, jobId, output, totalTime, errorCode, signTimestamp);
		await expect(tx).to.emit(relaySubscriptions, "JobSubscriptionResponded")
			.and.to.emit(userSample, "CalledBack").withArgs(
				jobId, callbackContract, codeHash, codeInputs, output, errorCode
		);

		let jobOwner = userSample.target;
		let txReceipt = await (await tx).wait();
		// console.log("FIXED_GAS : ", txReceipt?.gasUsed);
		// validate callback cost and refund
		let txGasPrice = txReceipt?.gasPrice || 0n;
		let callbackGas = 9271; // calculated using console.log
		// console.log("txGasPrice: ", txGasPrice);
		let callbackCost = txGasPrice * (ethers.toBigInt(callbackGas + fixedGas));
		expect(await ethers.provider.getBalance(addrs[1])).to.equal(initBalance + callbackCost);
		expect((await relaySubscriptions.jobSubscriptions(jobId)).job.callbackDeposit).to.equal(callbackDeposit - callbackCost);

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

		let jobId: any = await relaySubscriptions.jobSubsCount(),
			output = solidityPacked(["string"], ["it is the output"]),
			totalTime = 100,
			errorCode = 0,
			signTimestamp = await time.latest();

		let initBalance = await ethers.provider.getBalance(addrs[1]);

		// set tx.gasprice for next block
		await setNextBlockBaseFeePerGas(maxGasPrice + 10n);
		let signedDigest = await createJobResponseSignature(jobId, output, totalTime, errorCode, signTimestamp, wallets[15]);
		let tx = relaySubscriptions.connect(signers[2]).jobSubsResponse(signedDigest, jobId, output, totalTime, errorCode, signTimestamp);
		await expect(tx).to.emit(relaySubscriptions, "JobSubscriptionResponded")
			.and.to.not.emit(userSample, "CalledBack");

		// validate callback cost and refund
		let jobOwner = userSample.target;
		let txGasPrice = (await (await tx).wait())?.gasPrice || 0n;
		let callbackCost = txGasPrice * (ethers.toBigInt(fixedGas));
		expect(await ethers.provider.getBalance(addrs[1])).to.equal(initBalance + callbackCost);
		expect((await relaySubscriptions.jobSubscriptions(jobId)).job.callbackDeposit).to.equal(callbackDeposit - callbackCost);
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
		name: 'marlin.oyster.RelaySubscriptions',
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