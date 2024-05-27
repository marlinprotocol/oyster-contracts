import { time } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from "chai";
import { BytesLike, Signer, Wallet, ZeroAddress, keccak256, parseUnits, solidityPacked } from "ethers";
import { ethers, upgrades } from "hardhat";
import { AttestationAutherUpgradeable, AttestationVerifier, Executors, GatewayJobs, Gateways, Jobs, Pond, USDCoin } from "../../typechain-types";
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

const image4: AttestationAutherUpgradeable.EnclaveImageStruct = {
	PCR0: ethers.hexlify(ethers.randomBytes(48)),
	PCR1: ethers.hexlify(ethers.randomBytes(48)),
	PCR2: ethers.hexlify(ethers.randomBytes(48)),
};

const image5: AttestationAutherUpgradeable.EnclaveImageStruct = {
	PCR0: ethers.hexlify(ethers.randomBytes(48)),
	PCR1: ethers.hexlify(ethers.randomBytes(48)),
	PCR2: ethers.hexlify(ethers.randomBytes(48)),
};

const image6: AttestationAutherUpgradeable.EnclaveImageStruct = {
	PCR0: ethers.hexlify(ethers.randomBytes(48)),
	PCR1: ethers.hexlify(ethers.randomBytes(48)),
	PCR2: ethers.hexlify(ethers.randomBytes(48)),
};

const image7: AttestationAutherUpgradeable.EnclaveImageStruct = {
	PCR0: ethers.hexlify(ethers.randomBytes(48)),
	PCR1: ethers.hexlify(ethers.randomBytes(48)),
	PCR2: ethers.hexlify(ethers.randomBytes(48)),
};

describe("Jobs - Init", function () {
	let signers: Signer[];
	let addrs: string[];
	let token: string;
	let gateways: string;

    let jobs: string;
	let tokenUsdc: string;
	let signMaxAge: number;
	let relayBufferTime: number;
	let executionFeePerMs: number;
	let slashCompForGateway: number;

	before(async function () {
		signers = await ethers.getSigners();
		addrs = await Promise.all(signers.map((a) => a.getAddress()));

		token = addrs[1];
		gateways = addrs[1];
		jobs = addrs[1];
		tokenUsdc = addrs[1];
		signMaxAge = 600;
		relayBufferTime = 100;
		executionFeePerMs = 10;
		slashCompForGateway = 10;
	});

	takeSnapshotBeforeAndAfterEveryTest(async () => { });

	it("deploys with initialization disabled", async function () {

		const GatewayJobs = await ethers.getContractFactory("GatewayJobs");
		const gatewayJobs = await GatewayJobs.deploy(token, tokenUsdc, signMaxAge, relayBufferTime, executionFeePerMs, slashCompForGateway);

		await expect(
			gatewayJobs.initialize(addrs[0], jobs, gateways),
		).to.be.revertedWithCustomError(gatewayJobs, "InvalidInitialization");
	});

	it("deploys as proxy and initializes", async function () {
		const GatewayJobs = await ethers.getContractFactory("GatewayJobs");
		const gatewayJobs = await upgrades.deployProxy(
			GatewayJobs,
			[addrs[0], jobs, gateways],
			{
				kind: "uups",
				initializer: "initialize",
				constructorArgs: [token, tokenUsdc, signMaxAge, relayBufferTime, executionFeePerMs, slashCompForGateway]
			},
		);

		expect(await gatewayJobs.hasRole(await gatewayJobs.DEFAULT_ADMIN_ROLE(), addrs[0])).to.be.true;
	});

	it("cannot initialize with zero address as admin", async function () {
		const GatewayJobs = await ethers.getContractFactory("GatewayJobs");
		await expect(
			upgrades.deployProxy(
				GatewayJobs,
				[ZeroAddress, jobs, gateways],
				{
					kind: "uups",
					initializer: "initialize",
					constructorArgs: [token, tokenUsdc, signMaxAge, relayBufferTime, executionFeePerMs, slashCompForGateway]
				}
			)
		).to.be.revertedWithCustomError(GatewayJobs, "GatewayJobsZeroAddressAdmin");
	});

	it("upgrades", async function () {
		const GatewayJobs = await ethers.getContractFactory("GatewayJobs");
		const gatewayJobs = await upgrades.deployProxy(
			GatewayJobs,
			[addrs[0], jobs, gateways],
			{
				kind: "uups",
				initializer: "initialize",
				constructorArgs: [token, tokenUsdc, signMaxAge, relayBufferTime, executionFeePerMs, slashCompForGateway]
			}
		);
		await upgrades.upgradeProxy(
			gatewayJobs.target,
			GatewayJobs,
			{
				kind: "uups",
				constructorArgs: [token, tokenUsdc, signMaxAge, relayBufferTime, executionFeePerMs, slashCompForGateway]
			}
		);

		expect(await gatewayJobs.hasRole(await gatewayJobs.DEFAULT_ADMIN_ROLE(), addrs[0])).to.be.true;
	});

	it("does not upgrade without admin", async function () {
		const GatewayJobs = await ethers.getContractFactory("GatewayJobs");
		const gatewayJobs = await upgrades.deployProxy(
			GatewayJobs,
			[addrs[0], jobs, gateways],
			{
				kind: "uups",
				initializer: "initialize",
				constructorArgs: [token, tokenUsdc, signMaxAge, relayBufferTime, executionFeePerMs, slashCompForGateway]
			},
		);

		await expect(
			upgrades.upgradeProxy(gatewayJobs.target, GatewayJobs.connect(signers[1]), {
				kind: "uups",
				constructorArgs: [token, tokenUsdc, signMaxAge, relayBufferTime, executionFeePerMs, slashCompForGateway]
			}),
		).to.be.revertedWithCustomError(GatewayJobs, "AccessControlUnauthorizedAccount");
	});

	it("can set gateway contract only with admin role", async function () {
		const GatewayJobs = await ethers.getContractFactory("GatewayJobs");
		const gatewayJobs = await upgrades.deployProxy(
			GatewayJobs,
			[addrs[0], jobs, gateways],
			{
				kind: "uups",
				initializer: "initialize",
				constructorArgs: [token, tokenUsdc, signMaxAge, relayBufferTime, executionFeePerMs, slashCompForGateway]
			},
		) as unknown as GatewayJobs;
		
		await expect(gatewayJobs.connect(signers[1]).setGatewaysContract(addrs[1]))
			.to.be.revertedWithCustomError(gatewayJobs, "AccessControlUnauthorizedAccount");
		await expect(gatewayJobs.setGatewaysContract(addrs[1])).to.not.be.rejected;
	});

	it("can set executor contract only with admin role", async function () {
		const GatewayJobs = await ethers.getContractFactory("GatewayJobs");
		const gatewayJobs = await upgrades.deployProxy(
			GatewayJobs,
			[addrs[0], jobs, gateways],
			{
				kind: "uups",
				initializer: "initialize",
				constructorArgs: [token, tokenUsdc, signMaxAge, relayBufferTime, executionFeePerMs, slashCompForGateway]
			},
		) as unknown as GatewayJobs;
		
		await expect(gatewayJobs.connect(signers[1]).setJobsContract(addrs[1]))
			.to.be.revertedWithCustomError(gatewayJobs, "AccessControlUnauthorizedAccount");
		await expect(gatewayJobs.setJobsContract(addrs[1])).to.not.be.rejected;
	});
});

testERC165(
	"GatewayJobs - ERC165",
	async function(_signers: Signer[], addrs: string[]) {
		let token = addrs[1],
			gateways = addrs[1],
			jobs = addrs[1],
			tokenUsdc = addrs[1],
			signMaxAge = 600,
			relayBufferTime = 100,
			executionFeePerMs = 10,
			slashCompForGateway = 10;
		const GatewayJobs = await ethers.getContractFactory("GatewayJobs");
		const gatewayJobs = await upgrades.deployProxy(
			GatewayJobs,
			[addrs[0], jobs, gateways],
			{
				kind: "uups",
				initializer: "initialize",
				constructorArgs: [token, tokenUsdc, signMaxAge, relayBufferTime, executionFeePerMs, slashCompForGateway]
			},
		);
		return gatewayJobs;
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

describe("Jobs - Relay", function () {
	let signers: Signer[];
	let addrs: string[];
	let token: Pond;
	let wallets: Wallet[];
	let pubkeys: string[];
	let attestationVerifier: AttestationVerifier;
	let gateways: Gateways;
	let executors: Executors;
	let jobs: Jobs;
	let gatewayJobs: GatewayJobs;
	let tokenUsdc: USDCoin;

	before(async function () {
		signers = await ethers.getSigners();
		addrs = await Promise.all(signers.map((a) => a.getAddress()));
		wallets = signers.map((_, idx) => walletForIndex(idx));
		pubkeys = wallets.map((w) => normalize(w.signingKey.publicKey));

		const Pond = await ethers.getContractFactory("Pond");
		token = await upgrades.deployProxy(Pond, ["Marlin", "POND"], {
			kind: "uups",
		}) as unknown as Pond;

		const USDCoin = await ethers.getContractFactory("USDCoin");
		tokenUsdc = await upgrades.deployProxy(
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
			images = [image2, image3],
			paymentPoolAddress = addrs[1],
			maxAge = 600, 
        	deregisterOrUnstakeTimeout = 600,
        	reassignCompForReporterGateway = 100,
        	slashPercentInBips = 1,
        	slashMaxBips = 100;
		const Gateways = await ethers.getContractFactory("Gateways");
		gateways = await upgrades.deployProxy(
			Gateways,
			[admin, images, paymentPoolAddress],
			{
				kind: "uups",
				initializer: "initialize",
				constructorArgs: [attestationVerifier.target, maxAge, token.target, deregisterOrUnstakeTimeout, reassignCompForReporterGateway, slashPercentInBips, slashMaxBips]
			},
		) as unknown as Gateways;

		images = [image4, image5, image6, image7];
		let minStakeAmount = 1;
		const Executors = await ethers.getContractFactory("Executors");
		executors = await upgrades.deployProxy(
			Executors,
			[admin, images],
			{
				kind: "uups",
				initializer: "initialize",
				constructorArgs: [attestationVerifier.target, maxAge, token.target, minStakeAmount, slashPercentInBips, slashMaxBips]
			},
		) as unknown as Executors;

		let signMaxAge = 600,
			executionBufferTime = 100,
        	noOfNodesToSelect = 3,
        	executorFeePerMs = 10,
        	stakingRewardPerMs = 10,
        	stakingPaymentPoolAddress = addrs[0],
        	usdcPaymentPoolAddress = addrs[0];
		const Jobs = await ethers.getContractFactory("Jobs");
		jobs = await upgrades.deployProxy(
			Jobs,
			[admin],
			{
				kind: "uups",
				initializer: "initialize",
				constructorArgs: [
					token.target, 
					tokenUsdc.target, 
					signMaxAge, 
					executionBufferTime, 
					noOfNodesToSelect, 
					executorFeePerMs, 
					stakingRewardPerMs, 
					stakingPaymentPoolAddress, 
					usdcPaymentPoolAddress, 
					executors.target
				]
			},
		) as unknown as Jobs;

		let relayBufferTime = 100,
			executionFeePerMs = 20,
			slashCompForGateway = 10;
		const GatewayJobs = await ethers.getContractFactory("GatewayJobs");
		gatewayJobs = await upgrades.deployProxy(
			GatewayJobs,
			[admin, jobs.target, gateways.target],
			{
				kind: "uups",
				initializer: "initialize",
				constructorArgs: [token.target, tokenUsdc.target, signMaxAge, relayBufferTime, executionFeePerMs, slashCompForGateway]
			},
		) as unknown as GatewayJobs;

		await executors.grantRole(await executors.JOBS_ROLE(), jobs.target);

		let chainIds = [1];
		let reqChains = [
			{
				contractAddress: addrs[1],
				httpRpcUrl: "https://eth.rpc",
				wsRpcUrl: "wss://eth.rpc"
			}
		]
		await gateways.addChainGlobal(chainIds, reqChains);

		let amount = parseUnits("1000");	// 1000 POND
		await token.transfer(addrs[1], amount);
		await token.connect(signers[1]).approve(gateways.target, amount);
		await token.connect(signers[1]).approve(executors.target, amount);

		amount = parseUnits("1000", 6);
		await tokenUsdc.transfer(addrs[1], amount);
		await tokenUsdc.connect(signers[1]).approve(gatewayJobs.target, amount);

		// REGISTER GATEWAYS
		let timestamp = await time.latest() * 1000,
			stakeAmount = 10,
			signTimestamp = await time.latest();
		// 1st gateway
		let [signature, attestation] = await createAttestation(pubkeys[15], image2, wallets[14], timestamp - 540000);
		let signedDigest = await createGatewaySignature(addrs[1], chainIds, signTimestamp, wallets[15]);
		await gateways.connect(signers[1]).registerGateway(signature, attestation, chainIds, signedDigest, stakeAmount, signTimestamp);
		
		// 2nd gateway
		[signature, attestation] = await createAttestation(pubkeys[16], image3, wallets[14], timestamp - 540000);
		signedDigest = await createGatewaySignature(addrs[1], chainIds, signTimestamp, wallets[16]);
		await gateways.connect(signers[1]).registerGateway(signature, attestation, chainIds, signedDigest, stakeAmount, signTimestamp);

		// REGISTER EXECUTORS
		let execStakeAmount = parseUnits("10"),	// 10 POND
			jobCapacity = 3;
		// 1st executor
		[signature, attestation] = await createAttestation(pubkeys[17], image4, wallets[14], timestamp - 540000);
		signedDigest = await createExecutorSignature(addrs[1], jobCapacity, signTimestamp, wallets[17]);
		await executors.connect(signers[1]).registerExecutor(signature, attestation, jobCapacity, signTimestamp, signedDigest, execStakeAmount);

		// 2nd executor
		[signature, attestation] = await createAttestation(pubkeys[18], image5, wallets[14], timestamp - 540000);
		signedDigest = await createExecutorSignature(addrs[1], jobCapacity, signTimestamp, wallets[18]);
		await executors.connect(signers[1]).registerExecutor(signature, attestation, jobCapacity, signTimestamp, signedDigest, execStakeAmount);

		// 3rd executor
		[signature, attestation] = await createAttestation(pubkeys[19], image6, wallets[14], timestamp - 540000);
		signedDigest = await createExecutorSignature(addrs[1], jobCapacity, signTimestamp, wallets[19]);
		await executors.connect(signers[1]).registerExecutor(signature, attestation, jobCapacity, signTimestamp, signedDigest, execStakeAmount);

		// 4th executor
		[signature, attestation] = await createAttestation(pubkeys[20], image7, wallets[14], timestamp - 540000);
		signedDigest = await createExecutorSignature(addrs[1], jobCapacity, signTimestamp, wallets[20]);
		await executors.connect(signers[1]).registerExecutor(signature, attestation, jobCapacity, signTimestamp, signedDigest, execStakeAmount);

	});

	takeSnapshotBeforeAndAfterEveryTest(async () => { });

	it("can relay job", async function () {
		// let reqChainId = (await ethers.provider.getNetwork()).chainId;
		let jobId: any = (BigInt(1) << BigInt(192)) + BigInt(1),
			codeHash = keccak256(solidityPacked(["string"], ["codehash"])),
			codeInputs = solidityPacked(["string"], ["codeInput"]),
			deadline = 10000,
			jobRequestTimestamp = await time.latest(),
			sequenceId = 1,
			jobOwner = addrs[1],
			signTimestamp = await time.latest();
		let signedDigest = await createRelayJobSignature(jobId, codeHash, codeInputs, deadline, jobRequestTimestamp, sequenceId, jobOwner, signTimestamp, wallets[15]);

		let tx = await gatewayJobs.connect(signers[1]).relayJob(signedDigest, jobId, codeHash, codeInputs, deadline, jobRequestTimestamp, sequenceId, jobOwner, signTimestamp);
		await expect(tx).to.emit(gatewayJobs, "JobRelayed");

		let job = await gatewayJobs.relayJobs(jobId);
		expect(job.jobOwner).to.eq(jobOwner);

		let execJobId = 0;
		expect(await gatewayJobs.execJobs(execJobId)).to.eq(jobId);
		
		let selectedExecutors = await jobs.getSelectedExecutors(execJobId);
		for (let index = 0; index < selectedExecutors.length; index++) {
			const executor = selectedExecutors[index];
			expect([addrs[17], addrs[18], addrs[19], addrs[20]]).to.contain(executor);
		}
	});

	it("cannot relay job after relay time is over", async function () {
		let jobId: any = (BigInt(1) << BigInt(192)) + BigInt(1),
			codeHash = keccak256(solidityPacked(["string"], ["codehash"])),
			codeInputs = solidityPacked(["string"], ["codeInput"]),
			deadline = 10000,
			jobRequestTimestamp = await time.latest(),
			sequenceId = 1,
			jobOwner = addrs[1],
			signTimestamp = await time.latest();
		let signedDigest = await createRelayJobSignature(jobId, codeHash, codeInputs, deadline, jobRequestTimestamp, sequenceId, jobOwner, signTimestamp, wallets[15]);

		await time.increase(1000);
		await expect(gatewayJobs.connect(signers[15]).relayJob(signedDigest, jobId, codeHash, codeInputs, deadline, jobRequestTimestamp, sequenceId, jobOwner, signTimestamp))
			.to.be.revertedWithCustomError(gatewayJobs, "GatewayJobsRelayTimeOver");
	});

	it("cannot relay job with wrong sequence id", async function () {
		let jobId: any = (BigInt(1) << BigInt(192)) + BigInt(1),
			codeHash = keccak256(solidityPacked(["string"], ["codehash"])),
			codeInputs = solidityPacked(["string"], ["codeInput"]),
			deadline = 10000,
			jobRequestTimestamp = await time.latest(),
			sequenceId = 2,
			jobOwner = addrs[1],
			signTimestamp = await time.latest();
		let signedDigest = await createRelayJobSignature(jobId, codeHash, codeInputs, deadline, jobRequestTimestamp, sequenceId, jobOwner, signTimestamp, wallets[15]);

		await expect(gatewayJobs.connect(signers[15]).relayJob(signedDigest, jobId, codeHash, codeInputs, deadline, jobRequestTimestamp, sequenceId, jobOwner, signTimestamp))
			.to.be.revertedWithCustomError(gatewayJobs, "GatewayJobsInvalidRelaySequenceId");
	});

	it("cannot relay a job twice with same job id", async function () {
		let jobId: any = (BigInt(1) << BigInt(192)) + BigInt(1),
			codeHash = keccak256(solidityPacked(["string"], ["codehash"])),
			codeInputs = solidityPacked(["string"], ["codeInput"]),
			deadline = 10000,
			jobRequestTimestamp = await time.latest(),
			sequenceId = 1,
			jobOwner = addrs[1],
			signTimestamp = await time.latest();
		let signedDigest = await createRelayJobSignature(jobId, codeHash, codeInputs, deadline, jobRequestTimestamp, sequenceId, jobOwner, signTimestamp, wallets[15]);
		await gatewayJobs.connect(signers[1]).relayJob(signedDigest, jobId, codeHash, codeInputs, deadline, jobRequestTimestamp, sequenceId, jobOwner, signTimestamp);

		await expect(gatewayJobs.connect(signers[1]).relayJob(signedDigest, jobId, codeHash, codeInputs, deadline, jobRequestTimestamp, sequenceId, jobOwner, signTimestamp))
			.to.be.revertedWithCustomError(gatewayJobs, "GatewayJobsAlreadyRelayed");
	});

	it("cannot relay job with unsupported chain id", async function () {
		let jobId: any = (BigInt(2) << BigInt(192)) + BigInt(1),
			codeHash = keccak256(solidityPacked(["string"], ["codehash"])),
			codeInputs = solidityPacked(["string"], ["codeInput"]),
			deadline = 10000,
			jobRequestTimestamp = await time.latest(),
			sequenceId = 1,
			jobOwner = addrs[1],
			signTimestamp = await time.latest();
		let signedDigest = await createRelayJobSignature(jobId, codeHash, codeInputs, deadline, jobRequestTimestamp, sequenceId, jobOwner, signTimestamp, wallets[15]);

		await expect(gatewayJobs.connect(signers[15]).relayJob(signedDigest, jobId, codeHash, codeInputs, deadline, jobRequestTimestamp, sequenceId, jobOwner, signTimestamp))
			.to.be.revertedWithCustomError(gatewayJobs, "GatewayJobsUnsupportedChain");
	});

	it("cannot relay job when a minimum no. of executor nodes are not available", async function () {
		await executors.connect(signers[1]).drainExecutor(addrs[19]);
		await executors.connect(signers[1]).deregisterExecutor(addrs[19]);

		await executors.connect(signers[1]).drainExecutor(addrs[20]);
		await executors.connect(signers[1]).deregisterExecutor(addrs[20]);

		let jobId: any = (BigInt(1) << BigInt(192)) + BigInt(1),
			codeHash = keccak256(solidityPacked(["string"], ["codehash"])),
			codeInputs = solidityPacked(["string"], ["codeInput"]),
			deadline = 10000,
			jobRequestTimestamp = await time.latest(),
			sequenceId = 1,
			jobOwner = addrs[1],
			signTimestamp = await time.latest();
		let signedDigest = await createRelayJobSignature(jobId, codeHash, codeInputs, deadline, jobRequestTimestamp, sequenceId, jobOwner, signTimestamp, wallets[15]);

		await expect(gatewayJobs.connect(signers[1]).relayJob(signedDigest, jobId, codeHash, codeInputs, deadline, jobRequestTimestamp, sequenceId, jobOwner, signTimestamp))
			.to.emit(gatewayJobs, "JobResourceUnavailable").withArgs(jobId, addrs[15]);

		expect((await gatewayJobs.relayJobs(jobId)).isResourceUnavailable).to.be.true;
	});

	it("cannot relay job again if it's marked as ended due to unavailable executors", async function () {
		await executors.connect(signers[1]).drainExecutor(addrs[19]);
		await executors.connect(signers[1]).deregisterExecutor(addrs[19]);

		await executors.connect(signers[1]).drainExecutor(addrs[20]);
		await executors.connect(signers[1]).deregisterExecutor(addrs[20]);

		let jobId: any = (BigInt(1) << BigInt(192)) + BigInt(1),
			codeHash = keccak256(solidityPacked(["string"], ["codehash"])),
			codeInputs = solidityPacked(["string"], ["codeInput"]),
			deadline = 10000,
			jobRequestTimestamp = await time.latest(),
			sequenceId = 1,
			jobOwner = addrs[1],
			signTimestamp = await time.latest();
		let signedDigest = await createRelayJobSignature(jobId, codeHash, codeInputs, deadline, jobRequestTimestamp, sequenceId, jobOwner, signTimestamp, wallets[15]);

		await expect(gatewayJobs.connect(signers[1]).relayJob(signedDigest, jobId, codeHash, codeInputs, deadline, jobRequestTimestamp, sequenceId, jobOwner, signTimestamp))
			.to.emit(gatewayJobs, "JobResourceUnavailable").withArgs(jobId, addrs[15]);

		// relay again
		await expect(gatewayJobs.connect(signers[1]).relayJob(signedDigest, jobId, codeHash, codeInputs, deadline, jobRequestTimestamp, sequenceId, jobOwner, signTimestamp))
			.to.be.revertedWithCustomError(gatewayJobs, "GatewayJobsResourceUnavailable");
	});

	it("cannot relay job after all the executors are fully occupied", async function () {
		await executors.connect(signers[1]).drainExecutor(addrs[20]);
		await executors.connect(signers[1]).deregisterExecutor(addrs[20]);

		for (let index = 1; index <= 3; index++) {
			let jobId: any = (BigInt(1) << BigInt(192)) + BigInt(index),
				codeHash = keccak256(solidityPacked(["string"], ["codehash"])),
				codeInputs = solidityPacked(["string"], ["codeInput"]),
				deadline = 10000,
				jobRequestTimestamp = await time.latest(),
				sequenceId = 1,
				jobOwner = addrs[1],
				signTimestamp = await time.latest();
			let signedDigest = await createRelayJobSignature(jobId, codeHash, codeInputs, deadline, jobRequestTimestamp, sequenceId, jobOwner, signTimestamp, wallets[15]);
			
			await expect(await gatewayJobs.connect(signers[1]).relayJob(signedDigest, jobId, codeHash, codeInputs, deadline, jobRequestTimestamp, sequenceId, jobOwner, signTimestamp))
				.to.emit(gatewayJobs, "JobRelayed");
		}

		let jobId: any = (BigInt(1) << BigInt(192)) + BigInt(4),
			codeHash = keccak256(solidityPacked(["string"], ["codehash"])),
			codeInputs = solidityPacked(["string"], ["codeInput"]),
			deadline = 10000,
			jobRequestTimestamp = await time.latest(),
			sequenceId = 1,
			jobOwner = addrs[1],
			signTimestamp = await time.latest();
		let signedDigest = await createRelayJobSignature(jobId, codeHash, codeInputs, deadline, jobRequestTimestamp, sequenceId, jobOwner, signTimestamp, wallets[15]);

		await expect(gatewayJobs.connect(signers[1]).relayJob(signedDigest, jobId, codeHash, codeInputs, deadline, jobRequestTimestamp, sequenceId, jobOwner, signTimestamp))
			.to.emit(gatewayJobs, "JobResourceUnavailable").withArgs(jobId, addrs[15]);

		expect((await gatewayJobs.relayJobs(jobId)).isResourceUnavailable).to.be.true;

		// SUBMIT OUTPUT AND THEN RELAY JOB WILL WORK
		jobId = 0;
		let	output = solidityPacked(["string"], ["it is the output"]),
			totalTime = 100,
			errorCode = 0;
		
		signedDigest = await createOutputSignature(jobId, output, totalTime, errorCode, signTimestamp, wallets[17]);
		await jobs.connect(signers[1]).submitOutput(signedDigest, jobId, output, totalTime, errorCode, signTimestamp);

		signedDigest = await createOutputSignature(jobId, output, totalTime, errorCode, signTimestamp, wallets[18]);
		await jobs.connect(signers[1]).submitOutput(signedDigest, jobId, output, totalTime, errorCode, signTimestamp);

		signedDigest = await createOutputSignature(jobId, output, totalTime, errorCode, signTimestamp, wallets[19]);
		await jobs.connect(signers[1]).submitOutput(signedDigest, jobId, output, totalTime, errorCode, signTimestamp);

		// RELAY AGAIN WORKS
		jobId = (BigInt(1) << BigInt(192)) + BigInt(5);
		signedDigest = await createRelayJobSignature(jobId, codeHash, codeInputs, deadline, jobRequestTimestamp, sequenceId, jobOwner, signTimestamp, wallets[15]);
			
		await expect(gatewayJobs.connect(signers[1]).relayJob(signedDigest, jobId, codeHash, codeInputs, deadline, jobRequestTimestamp, sequenceId, jobOwner, signTimestamp))
			.to.emit(gatewayJobs, "JobRelayed");
	});
});

describe("Jobs - Reassign Gateway", function () {
	let signers: Signer[];
	let addrs: string[];
	let token: Pond;
	let wallets: Wallet[];
	let pubkeys: string[];
	let attestationVerifier: AttestationVerifier;
	let gateways: Gateways;
	let executors: Executors;
	let jobs: Jobs;
	let tokenUsdc: USDCoin;
	let gatewayJobs: GatewayJobs;

	before(async function () {
		signers = await ethers.getSigners();
		addrs = await Promise.all(signers.map((a) => a.getAddress()));
		wallets = signers.map((_, idx) => walletForIndex(idx));
		pubkeys = wallets.map((w) => normalize(w.signingKey.publicKey));

		const Pond = await ethers.getContractFactory("Pond");
		token = await upgrades.deployProxy(Pond, ["Marlin", "POND"], {
			kind: "uups",
		}) as unknown as Pond;

		const USDCoin = await ethers.getContractFactory("USDCoin");
		tokenUsdc = await upgrades.deployProxy(
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
			images = [image2, image3],
			paymentPoolAddress = addrs[1],
			maxAge = 600, 
        	deregisterOrUnstakeTimeout = 600,
        	reassignCompForReporterGateway = 10,
        	slashPercentInBips = 1,
        	slashMaxBips = 100;
		const Gateways = await ethers.getContractFactory("Gateways");
		gateways = await upgrades.deployProxy(
			Gateways,
			[admin, images, paymentPoolAddress],
			{
				kind: "uups",
				initializer: "initialize",
				constructorArgs: [attestationVerifier.target, maxAge, token.target, deregisterOrUnstakeTimeout, reassignCompForReporterGateway, slashPercentInBips, slashMaxBips]
			},
		) as unknown as Gateways;

		images = [image4, image5, image6, image7];
		let minStakeAmount = 1;
		const Executors = await ethers.getContractFactory("Executors");
		executors = await upgrades.deployProxy(
			Executors,
			[admin, images],
			{
				kind: "uups",
				initializer: "initialize",
				constructorArgs: [attestationVerifier.target, maxAge, token.target, minStakeAmount, slashPercentInBips, slashMaxBips]
			},
		) as unknown as Executors;

		let signMaxAge = 600,
			executionBufferTime = 100,
        	noOfNodesToSelect = 3,
        	executorFeePerMs = 10,
        	stakingRewardPerMs = 10,
        	stakingPaymentPoolAddress = addrs[0],
        	usdcPaymentPoolAddress = addrs[0];
		const Jobs = await ethers.getContractFactory("Jobs");
		jobs = await upgrades.deployProxy(
			Jobs,
			[admin],
			{
				kind: "uups",
				initializer: "initialize",
				constructorArgs: [
					token.target, 
					tokenUsdc.target, 
					signMaxAge, 
					executionBufferTime, 
					noOfNodesToSelect, 
					executorFeePerMs, 
					stakingRewardPerMs, 
					stakingPaymentPoolAddress, 
					usdcPaymentPoolAddress, 
					executors.target
				]
			},
		) as unknown as Jobs;

		let relayBufferTime = 100,
			executionFeePerMs = 20,
			slashCompForGateway = 10;
		const GatewayJobs = await ethers.getContractFactory("GatewayJobs");
		gatewayJobs = await upgrades.deployProxy(
			GatewayJobs,
			[admin, jobs.target, gateways.target],
			{
				kind: "uups",
				initializer: "initialize",
				constructorArgs: [token.target, tokenUsdc.target, signMaxAge, relayBufferTime, executionFeePerMs, slashCompForGateway]
			},
		) as unknown as GatewayJobs;

		await gateways.grantRole(await gateways.GATEWAY_JOBS_ROLE(), gatewayJobs.target);
		await executors.grantRole(await executors.JOBS_ROLE(), jobs.target);

		let chainIds = [1];
		let reqChains = [
			{
				contractAddress: addrs[1],
				httpRpcUrl: "https://eth.rpc",
				wsRpcUrl: "ws://eth.rpc"
			}
		]
		await gateways.addChainGlobal(chainIds, reqChains);

		let amount = parseUnits("1000");	// 1000 POND
		await token.transfer(addrs[1], amount);
		await token.connect(signers[1]).approve(gateways.target, amount);
		await token.connect(signers[1]).approve(executors.target, amount);

		amount = parseUnits("1000", 6);		// 1000 USDC
		await tokenUsdc.transfer(addrs[1], amount);
		await tokenUsdc.connect(signers[1]).approve(gatewayJobs.target, amount);

		// REGISTER GATEWAYS
		let timestamp = await time.latest() * 1000,
			stakeAmount = 1000,
			signTimestamp = await time.latest();
		// 1st gateway
		let [signature, attestation] = await createAttestation(pubkeys[15], image2, wallets[14], timestamp - 540000);
		let signedDigest = await createGatewaySignature(addrs[1], chainIds, signTimestamp, wallets[15]);
		await gateways.connect(signers[1]).registerGateway(signature, attestation, chainIds, signedDigest, stakeAmount, signTimestamp);
		
		// 2nd gateway
		[signature, attestation] = await createAttestation(pubkeys[16], image3, wallets[14], timestamp - 540000);
		signedDigest = await createGatewaySignature(addrs[1], chainIds, signTimestamp, wallets[16]);
		await gateways.connect(signers[1]).registerGateway(signature, attestation, chainIds, signedDigest, stakeAmount, signTimestamp);

		// REGISTER EXECUTORS
		let execStakeAmount = parseUnits("10"),	// 10 POND
			jobCapacity = 3;
		// 1st executor
		[signature, attestation] = await createAttestation(pubkeys[17], image4, wallets[14], timestamp - 540000);
		signedDigest = await createExecutorSignature(addrs[1], jobCapacity, signTimestamp, wallets[17]);
		await executors.connect(signers[1]).registerExecutor(signature, attestation, jobCapacity, signTimestamp, signedDigest, execStakeAmount);

		// 2nd executor
		[signature, attestation] = await createAttestation(pubkeys[18], image5, wallets[14], timestamp - 540000);
		signedDigest = await createExecutorSignature(addrs[1], jobCapacity, signTimestamp, wallets[18]);
		await executors.connect(signers[1]).registerExecutor(signature, attestation, jobCapacity, signTimestamp, signedDigest, execStakeAmount);

		// 3rd executor
		[signature, attestation] = await createAttestation(pubkeys[19], image6, wallets[14], timestamp - 540000);
		signedDigest = await createExecutorSignature(addrs[1], jobCapacity, signTimestamp, wallets[19]);
		await executors.connect(signers[1]).registerExecutor(signature, attestation, jobCapacity, signTimestamp, signedDigest, execStakeAmount);
	});

	takeSnapshotBeforeAndAfterEveryTest(async () => { });

	it("can reassign after job output not relayed", async function () {
		let jobId: any = (BigInt(1) << BigInt(192)) + BigInt(1),
			gatewayKeyOld = addrs[15],
			sequenceId = 1,
			jobRequestTimestamp = await time.latest() + 100,
			jobOwner = addrs[1],
			signTimestamp = await time.latest();

		let signedDigest = await createReassignGatewaySignature(jobId, gatewayKeyOld, sequenceId, jobRequestTimestamp, signTimestamp, wallets[16]);
		let tx = await gatewayJobs.connect(signers[1]).reassignGatewayRelay(gatewayKeyOld, jobId, signedDigest, sequenceId, jobRequestTimestamp, jobOwner, signTimestamp);
		await expect(tx).to.emit(gatewayJobs, "GatewayReassigned");
	});

	it("cannot reassign for wrong sequenceId", async function () {
		let jobId: any = (BigInt(1) << BigInt(192)) + BigInt(1),
			gatewayKeyOld = addrs[15],
			sequenceId = 2,
			jobRequestTimestamp = await time.latest() + 10,
			jobOwner = addrs[1],
			signTimestamp = await time.latest();

		let signedDigest = await createReassignGatewaySignature(jobId, gatewayKeyOld, sequenceId, jobRequestTimestamp, signTimestamp, wallets[16]);
		let tx = gatewayJobs.connect(signers[16]).reassignGatewayRelay(gatewayKeyOld, jobId, signedDigest, sequenceId, jobRequestTimestamp, jobOwner, signTimestamp);
		await expect(tx).to.revertedWithCustomError(gatewayJobs, "GatewayJobsInvalidRelaySequenceId");
	});

	it("cannot reassign after relay time is over", async function () {
		let jobId: any = (BigInt(1) << BigInt(192)) + BigInt(1),
			gatewayKeyOld = addrs[15],
			sequenceId = 1,
			jobRequestTimestamp = await time.latest() + 10,
			jobOwner = addrs[1],
			signTimestamp = await time.latest();

		let signedDigest = await createReassignGatewaySignature(jobId, gatewayKeyOld, sequenceId, jobRequestTimestamp, signTimestamp, wallets[16]);
		
		await time.increase(1000);
		let tx = gatewayJobs.connect(signers[16]).reassignGatewayRelay(gatewayKeyOld, jobId, signedDigest, sequenceId, jobRequestTimestamp, jobOwner, signTimestamp);
		await expect(tx).to.revertedWithCustomError(gatewayJobs, "GatewayJobsRelayTimeOver");
	});

	it("cannot reassign new gateway if job is marked as ended due to unavailable executors", async function () {
		await executors.connect(signers[1]).drainExecutor(addrs[19]);
		await executors.connect(signers[1]).deregisterExecutor(addrs[19]);

		let jobId: any = (BigInt(1) << BigInt(192)) + BigInt(1),
			codeHash = keccak256(solidityPacked(["string"], ["codehash"])),
			codeInputs = solidityPacked(["string"], ["codeInput"]),
			deadline = 10000,
			jobRequestTimestamp = await time.latest(),
			sequenceId = 1,
			jobOwner = addrs[1],
			signTimestamp = await time.latest();
		let signedDigest = await createRelayJobSignature(jobId, codeHash, codeInputs, deadline, jobRequestTimestamp, sequenceId, jobOwner, signTimestamp, wallets[15]);

		await expect(gatewayJobs.connect(signers[1]).relayJob(signedDigest, jobId, codeHash, codeInputs, deadline, jobRequestTimestamp, sequenceId, jobOwner, signTimestamp))
			.to.emit(gatewayJobs, "JobResourceUnavailable").withArgs(jobId, addrs[15]);

		let gatewayKeyOld = addrs[15];
		jobRequestTimestamp = await time.latest() + 10;
		signedDigest = await createReassignGatewaySignature(jobId, gatewayKeyOld, sequenceId, jobRequestTimestamp, signTimestamp, wallets[16]);
		
		// reassign new gateway
		await expect(gatewayJobs.connect(signers[1]).reassignGatewayRelay(gatewayKeyOld, jobId, signedDigest, sequenceId, jobRequestTimestamp, jobOwner, signTimestamp))
			.to.be.revertedWithCustomError(gatewayJobs, "GatewayJobsResourceUnavailable");
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
	chainIds: number[],
	signTimestamp: number,
	sourceEnclaveWallet: Wallet
): Promise<string> {
	const domain = {
		name: 'marlin.oyster.Gateways',
		version: '1',
	};

	const types = {
		Register: [
			{ name: 'owner', type: 'address' },
			{ name: 'chainIds', type: 'uint256[]' },
			{ name: 'signTimestamp', type: 'uint256' }
		]
	};

	const value = {
		owner,
		chainIds,
		signTimestamp
	};

	const sign = await sourceEnclaveWallet.signTypedData(domain, types, value);
	return ethers.Signature.from(sign).serialized;
}

async function createExecutorSignature(
	owner: string,
	jobCapacity: number,
	signTimestamp: number,
	sourceEnclaveWallet: Wallet
): Promise<string> {
	const domain = {
		name: 'marlin.oyster.Executors',
		version: '1',
	};

	const types = {
		Register: [
			{ name: 'owner', type: 'address' },
			{ name: 'jobCapacity', type: 'uint256' },
			{ name: 'signTimestamp', type: 'uint256' }
		]
	};

	const value = {
		owner,
		jobCapacity,
		signTimestamp
	};

	const sign = await sourceEnclaveWallet.signTypedData(domain, types, value);
	return ethers.Signature.from(sign).serialized;
}

async function createRelayJobSignature(
	jobId: number,
    codeHash: string,
	codeInputs: string,
    deadline: number,
	jobRequestTimestamp: number,
	sequenceId: number,
	jobOwner: string,
	signTimestamp: number,
	sourceEnclaveWallet: Wallet
): Promise<string> {
	const domain = {
		name: 'marlin.oyster.GatewayJobs',
		version: '1',
	};

	const types = {
		RelayJob: [
			{ name: 'jobId', type: 'uint256' },
			{ name: 'codeHash', type: 'bytes32' },
			{ name: 'codeInputs', type: 'bytes' },
			{ name: 'deadline', type: 'uint256' },
			{ name: 'jobRequestTimestamp', type: 'uint256' },
			{ name: 'sequenceId', type: 'uint8' },
			{ name: 'jobOwner', type: 'address' },
			{ name: 'signTimestamp', type: 'uint256' },
		]
	};

	const value = {
		jobId, 
		codeHash, 
		codeInputs, 
		deadline, 
		jobRequestTimestamp, 
		sequenceId, 
		jobOwner,
		signTimestamp
	};

	const sign = await sourceEnclaveWallet.signTypedData(domain, types, value);
	return ethers.Signature.from(sign).serialized;
}

async function createOutputSignature(
	jobId: number,
    output: string,
	totalTime: number,
    errorCode: number,
	signTimestamp: number,
	sourceEnclaveWallet: Wallet
): Promise<string> {
	const domain = {
		name: 'marlin.oyster.Jobs',
		version: '1',
	};

	const types = {
		SubmitOutput: [
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

async function createReassignGatewaySignature(
	jobId: number,
    gatewayOld: string,
	sequenceId: number,
	jobRequestTimestamp: number,
	signTimestamp: number,
	sourceEnclaveWallet: Wallet
): Promise<string> {
	const domain = {
		name: 'marlin.oyster.GatewayJobs',
		version: '1',
	};

	const types = {
		ReassignGateway: [
			{ name: 'jobId', type: 'uint256' },
			{ name: 'gatewayOld', type: 'address' },
			{ name: 'sequenceId', type: 'uint8' },
			{ name: 'jobRequestTimestamp', type: 'uint256' },
			{ name: 'signTimestamp', type: 'uint256' }
		]
	};

	const value = {
		jobId,
		gatewayOld,
		sequenceId,
		jobRequestTimestamp,
		signTimestamp
	};

	const sign = await sourceEnclaveWallet.signTypedData(domain, types, value);
	return ethers.Signature.from(sign).serialized;
}

function walletForIndex(idx: number): Wallet {
	let wallet = ethers.HDNodeWallet.fromPhrase("test test test test test test test test test test test junk", undefined, "m/44'/60'/0'/0/" + idx.toString());

	return new Wallet(wallet.privateKey);
}