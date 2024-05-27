import { time } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from "chai";
import { BytesLike, Signer, Wallet, ZeroAddress, keccak256, solidityPacked } from "ethers";
import { ethers, upgrades } from "hardhat";
import { AttestationAutherUpgradeable, AttestationVerifier, Executors, Jobs, Pond, USDCoin, JobsUser } from "../../typechain-types";
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
	let staking_token: string;
	let usdc_token: string;
	let executors: string;
	let staking_payment_pool: string;
	let usdc_payment_pool: string;

	before(async function () {
		signers = await ethers.getSigners();
		addrs = await Promise.all(signers.map((a) => a.getAddress()));

		staking_token = addrs[1];
		usdc_token = addrs[1];
		executors = addrs[1];
		staking_payment_pool = addrs[1];
		usdc_payment_pool = addrs[1];
	});

	takeSnapshotBeforeAndAfterEveryTest(async () => { });

	it("deploys with initialization disabled", async function () {

		const Jobs = await ethers.getContractFactory("Jobs");
		const jobs = await Jobs.deploy(
			staking_token,
			usdc_token,
			100,
			100,
			3,
			1,
			1,
			staking_payment_pool,
			usdc_payment_pool,
			executors
		);

		await expect(
			jobs.initialize(addrs[0]),
		).to.be.revertedWithCustomError(jobs, "InvalidInitialization");
	});

	it("deploys as proxy and initializes", async function () {
		const Jobs = await ethers.getContractFactory("Jobs");
		const jobs = await upgrades.deployProxy(
			Jobs,
			[addrs[0]],
			{
				kind: "uups",
				initializer: "initialize",
				constructorArgs: [
					staking_token,
					usdc_token,
					100,
					100,
					3,
					1,
					1,
					staking_payment_pool,
					usdc_payment_pool,
					executors
				]
			},
		);

		expect(await jobs.hasRole(await jobs.DEFAULT_ADMIN_ROLE(), addrs[0])).to.be.true;
	});

	it("cannot initialize with zero address as admin", async function () {
		const Jobs = await ethers.getContractFactory("Jobs");
		await expect(
			upgrades.deployProxy(
				Jobs,
				[ZeroAddress],
				{
					kind: "uups",
					initializer: "initialize",
					constructorArgs: [
						staking_token,
						usdc_token,
						100,
						100,
						3,
						1,
						1,
						staking_payment_pool,
						usdc_payment_pool,
						executors
					]
				},
			)
		).to.be.revertedWithCustomError(Jobs, "JobsZeroAddressAdmin");
	});

	it("cannot initialize with zero address as staking token", async function () {
		const Jobs = await ethers.getContractFactory("Jobs");
		await expect(
			upgrades.deployProxy(
				Jobs,
				[addrs[0]],
				{
					kind: "uups",
					initializer: "initialize",
					constructorArgs: [
						ZeroAddress,
						usdc_token,
						100,
						100,
						3,
						1,
						1,
						staking_payment_pool,
						usdc_payment_pool,
						executors
					]
				},
			)
		).to.be.revertedWithCustomError(Jobs, "JobsZeroAddressStakingToken");
	});

	it("cannot initialize with zero address as usdc token", async function () {
		const Jobs = await ethers.getContractFactory("Jobs");
		await expect(
			upgrades.deployProxy(
				Jobs,
				[addrs[0]],
				{
					kind: "uups",
					initializer: "initialize",
					constructorArgs: [
						staking_token,
						ZeroAddress,
						100,
						100,
						3,
						1,
						1,
						staking_payment_pool,
						usdc_payment_pool,
						executors
					]
				},
			)
		).to.be.revertedWithCustomError(Jobs, "JobsZeroAddressUsdcToken");
	});

	it("upgrades", async function () {
		const Jobs = await ethers.getContractFactory("Jobs");
		const jobs = await upgrades.deployProxy(
			Jobs,
			[addrs[0]],
			{
				kind: "uups",
				initializer: "initialize",
				constructorArgs: [
					staking_token,
					usdc_token,
					100,
					100,
					3,
					1,
					1,
					staking_payment_pool,
					usdc_payment_pool,
					executors
				]
			},
		);

		// Deploy new executor contract
		const Executors = await ethers.getContractFactory("Executors");
		const executors2 = await upgrades.deployProxy(
			Executors,
			[addrs[0], [image1]],
			{
				kind: "uups",
				initializer: "initialize",
				constructorArgs: [
					addrs[0],
					600,
					staking_token,
					10**10,
					10**2,
					10**6
				]
			},
		);
		await upgrades.upgradeProxy(
			jobs.target,
			Jobs,
			{
				kind: "uups",
				constructorArgs: [
					addrs[2],
					addrs[2],
					200,
					200,
					5,
					2,
					2,
					addrs[2],
					addrs[2],
					executors2.target
				]
			}
		);

		expect(await jobs.hasRole(await jobs.DEFAULT_ADMIN_ROLE(), addrs[0])).to.be.true;
		expect(await jobs.STAKING_TOKEN()).to.be.eq(addrs[2]);
		expect(await jobs.USDC_TOKEN()).to.be.eq(addrs[2]);
		expect(await jobs.SIGN_MAX_AGE()).to.be.eq(200);
		expect(await jobs.EXECUTION_BUFFER_TIME()).to.be.eq(200);
		expect(await jobs.NO_OF_NODES_TO_SELECT()).to.be.eq(5);
		expect(await jobs.EXECUTOR_FEE_PER_MS()).to.be.eq(2);
		expect(await jobs.STAKING_REWARD_PER_MS()).to.be.eq(2);
		expect(await jobs.STAKING_PAYMENT_POOL()).to.be.eq(addrs[2]);
		expect(await jobs.USDC_PAYMENT_POOL()).to.be.eq(addrs[2]);
		expect(await jobs.EXECUTORS()).to.be.eq(executors2.target);
	});

	it("does not upgrade without admin", async function () {
		const Jobs = await ethers.getContractFactory("Jobs");
		const jobs = await upgrades.deployProxy(
			Jobs,
			[addrs[0]],
			{
				kind: "uups",
				initializer: "initialize",
				constructorArgs: [
					staking_token,
					usdc_token,
					100,
					100,
					3,
					1,
					1,
					staking_payment_pool,
					usdc_payment_pool,
					executors
				]
			},
		);

		await expect(
			upgrades.upgradeProxy(jobs.target, Jobs.connect(signers[1]), {
				kind: "uups",
				constructorArgs: [
					staking_token,
					usdc_token,
					100,
					100,
					3,
					1,
					1,
					staking_payment_pool,
					usdc_payment_pool,
					executors
				]
			}),
		).to.be.revertedWithCustomError(Jobs, "AccessControlUnauthorizedAccount");
	});

});

testERC165(
	"Jobs - ERC165",
	async function(_signers: Signer[], addrs: string[]) {
		const Jobs = await ethers.getContractFactory("Jobs");
		const jobs = await upgrades.deployProxy(
			Jobs,
			[addrs[0]],
			{
				kind: "uups",
				initializer: "initialize",
				constructorArgs: [
					addrs[1],
					addrs[1],
					100,
					100,
					3,
					1,
					1,
					addrs[1],
					addrs[1],
					addrs[1]
				]
			},
		);
		return jobs;
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

describe("Jobs - Create", function () {
	let signers: Signer[];
	let addrs: string[];
	let staking_token: Pond;
	let usdc_token: USDCoin;
	let wallets: Wallet[];
	let pubkeys: string[];
	let attestationVerifier: AttestationVerifier;
	let executors: Executors;
	let jobs: Jobs;
	let staking_payment_pool: string;
	let usdc_payment_pool: string;

	before(async function () {
		signers = await ethers.getSigners();
		addrs = await Promise.all(signers.map((a) => a.getAddress()));
		wallets = signers.map((_, idx) => walletForIndex(idx));
		pubkeys = wallets.map((w) => normalize(w.signingKey.publicKey));
		staking_payment_pool = addrs[1];
		usdc_payment_pool = addrs[1];

		const Pond = await ethers.getContractFactory("Pond");
		staking_token = await upgrades.deployProxy(Pond, ["Marlin", "POND"], {
			kind: "uups",
		}) as unknown as Pond;

		const USDCoin = await ethers.getContractFactory("USDCoin");
		usdc_token = await upgrades.deployProxy(USDCoin, [addrs[0]], {
			kind: "uups",
		}) as unknown as USDCoin;

		const AttestationVerifier = await ethers.getContractFactory("AttestationVerifier");
		attestationVerifier = await upgrades.deployProxy(
			AttestationVerifier,
			[[image1], [pubkeys[14]], addrs[0]],
			{ kind: "uups" },
		) as unknown as AttestationVerifier;

		let executor_images = [image4, image5, image6, image7]
		const Executors = await ethers.getContractFactory("Executors");
		executors = await upgrades.deployProxy(
			Executors,
			[addrs[0], executor_images],
			{
				kind: "uups",
				initializer: "initialize",
				constructorArgs: [
					attestationVerifier.target,
					600,
					staking_token.target,
					10**10,
					10**2,
					10**6
				]
			},
		) as unknown as Executors;

		const Jobs = await ethers.getContractFactory("Jobs");
		jobs = await upgrades.deployProxy(
			Jobs,
			[addrs[0]],
			{
				kind: "uups",
				initializer: "initialize",
				constructorArgs: [
					attestationVerifier.target,
					usdc_token.target,
					100,
					100,
					3,
					1,
					1,
					staking_payment_pool,
					usdc_payment_pool,
					executors.target
				]
			},
		) as unknown as Jobs;

		// Grant role to jobs contract on executor
		await executors.grantRole(keccak256(ethers.toUtf8Bytes("JOBS_ROLE")), jobs.target);
		const timestamp = await time.latest() * 1000;

		// Register Executors. Owner is addrs[1]
		await staking_token.transfer(addrs[1], 10n**20n);
		await staking_token.connect(signers[1]).approve(executors.target, 10n**20n);

		let jobCapacity = 3, stakeAmount = 10n**19n;


		for (let index = 0; index < 4; index++) {
			let signTimestamp = await time.latest() - 540;
			// Executor index using wallet 17 + index as enclave address
			let [attestationSign, attestation] = await createAttestation(pubkeys[17 + index], executor_images[index],
																		 wallets[14], timestamp - 540000);
			let signedDigest = await createExecutorSignature(addrs[1], jobCapacity, signTimestamp,
															 wallets[17 + index]);

			await executors.connect(signers[1]).registerExecutor(
				attestationSign,
				attestation,
				jobCapacity,
				signTimestamp,
				signedDigest,
				stakeAmount
			);
		}

		await usdc_token.transfer(addrs[1], 10n**6n);
		await usdc_token.connect(signers[1]).approve(jobs.target, 10n**6n);
	});

	takeSnapshotBeforeAndAfterEveryTest(async () => { });

	it("can relay job", async function () {
		// let reqChainId = (await ethers.provider.getNetwork()).chainId;
		let codeHash = keccak256(solidityPacked(["string"], ["codehash"])),
			codeInputs = solidityPacked(["string"], ["codeInput"]),
			deadline = 10000,
			jobOwner = addrs[1];

		let tx = await jobs.connect(signers[1]).createJob(codeHash, codeInputs, deadline);
		await tx.wait();
		await expect(tx).to.emit(jobs, "JobCreated");

		// Since it is a first job.
		let jobId = 0;
		let job = await jobs.jobs(jobId);

		expect(job.jobOwner).to.eq(jobOwner);
		expect(job.deadline).to.eq(deadline);
		expect(job.execStartTime).to.eq((await tx.getBlock())?.timestamp);


		let selectedExecutors = await jobs.getSelectedExecutors(jobId);
		for (let index = 0; index < selectedExecutors.length; index++) {
			const executor = selectedExecutors[index];
			expect([addrs[17], addrs[18], addrs[19], addrs[20]]).to.contain(executor);
		}
	});

	it("cannot relay job when a minimum no. of executor nodes are not available", async function () {
		await executors.connect(signers[1]).drainExecutor(addrs[19]);
		await executors.connect(signers[1]).drainExecutor(addrs[20]);

		let codeHash = keccak256(solidityPacked(["string"], ["codehash"])),
			codeInputs = solidityPacked(["string"], ["codeInput"]),
			deadline = 10000;

		await expect(jobs.connect(signers[1]).createJob(codeHash, codeInputs, deadline))
			.to.revertedWithCustomError(jobs, "JobsUnavailableResources");
	});

	it("cannot relay job after all the executors are fully occupied", async function () {
		await executors.connect(signers[1]).drainExecutor(addrs[20]);

		let codeHash = keccak256(solidityPacked(["string"], ["codehash"])),
			codeInputs = solidityPacked(["string"], ["codeInput"]),
			deadline = 10000;

		for (let index = 1; index <= 3; index++) {
			await expect(jobs.connect(signers[1]).createJob(codeHash, codeInputs, deadline))
				.to.emit(jobs, "JobCreated");
		}

		await expect(jobs.connect(signers[1]).createJob(codeHash, codeInputs, deadline))
			.to.revertedWithCustomError(jobs, "JobsUnavailableResources");
	});
});

describe("Jobs - Output", function () {
	let signers: Signer[];
	let addrs: string[];
	let staking_token: Pond;
	let usdc_token: USDCoin;
	let wallets: Wallet[];
	let pubkeys: string[];
	let attestationVerifier: AttestationVerifier;
	let executors: Executors;
	let jobs: Jobs;
	let staking_payment_pool: string;
	let usdc_payment_pool: string;

	before(async function () {
		signers = await ethers.getSigners();
		addrs = await Promise.all(signers.map((a) => a.getAddress()));
		wallets = signers.map((_, idx) => walletForIndex(idx));
		pubkeys = wallets.map((w) => normalize(w.signingKey.publicKey));
		staking_payment_pool = addrs[4];
		usdc_payment_pool = addrs[4];

		const Pond = await ethers.getContractFactory("Pond");
		staking_token = await upgrades.deployProxy(Pond, ["Marlin", "POND"], {
			kind: "uups",
		}) as unknown as Pond;

		const USDCoin = await ethers.getContractFactory("USDCoin");
		usdc_token = await upgrades.deployProxy(USDCoin, [addrs[0]], {
			kind: "uups",
		}) as unknown as USDCoin;

		const AttestationVerifier = await ethers.getContractFactory("AttestationVerifier");
		attestationVerifier = await upgrades.deployProxy(
			AttestationVerifier,
			[[image1], [pubkeys[14]], addrs[0]],
			{ kind: "uups" },
		) as unknown as AttestationVerifier;
		let executor_images = [image4, image5, image6, image7]
		const Executors = await ethers.getContractFactory("Executors");
		executors = await upgrades.deployProxy(
			Executors,
			[addrs[0], executor_images],
			{
				kind: "uups",
				initializer: "initialize",
				constructorArgs: [
					attestationVerifier.target,
					600,
					staking_token.target,
					10**10,
					10**2,
					10**6
				]
			},
		) as unknown as Executors;


		const Jobs = await ethers.getContractFactory("Jobs");
		jobs = await upgrades.deployProxy(
			Jobs,
			[addrs[0]],
			{
				kind: "uups",
				initializer: "initialize",
				constructorArgs: [
					staking_token.target,
					usdc_token.target,
					600,
					100,
					3,
					1,
					1,
					staking_payment_pool,
					usdc_payment_pool,
					executors.target
				]
			},
		) as unknown as Jobs;

		// Grant role to jobs contract on executor
		await executors.grantRole(keccak256(ethers.toUtf8Bytes("JOBS_ROLE")), jobs.target);

		// Register Executors. Owner is addrs[1]
		await staking_token.transfer(addrs[1], 10n**20n);
		await staking_token.connect(signers[1]).approve(executors.target, 10n**20n);

		let jobCapacity = 20, stakeAmount = 10n**19n;
		const timestamp = await time.latest() * 1000;

		for (let index = 0; index < 3; index++) {
			let signTimestamp = await time.latest() - 540;
			// Executor index using wallet 17 + index as enclave address
			let [attestationSign, attestation] = await createAttestation(pubkeys[17 + index], executor_images[index],
																		 wallets[14], timestamp - 540000);
			let signedDigest = await createExecutorSignature(addrs[1], jobCapacity, signTimestamp,
															 wallets[17 + index]);

			await executors.connect(signers[1]).registerExecutor(
				attestationSign,
				attestation,
				jobCapacity,
				signTimestamp,
				signedDigest,
				stakeAmount
			);
		}
		// RELAY JOB
		await usdc_token.transfer(addrs[3], 10n**6n);
		await usdc_token.connect(signers[3]).approve(jobs.target, 10n**6n);


		let codeHash = keccak256(solidityPacked(["string"], ["codehash"])),
			codeInputs = solidityPacked(["string"], ["codeInput"]),
			deadline = 10000;
		await jobs.connect(signers[3]).createJob(codeHash, codeInputs, deadline);
	});

	takeSnapshotBeforeAndAfterEveryTest(async () => { });

	// submit 1 output
	it("can submit output by selected executor node", async function () {
		let jobId = 0,
			output = solidityPacked(["string"], ["it is the output"]),
			totalTime = 100,
			errorCode = 0,
			signTimestamp = await time.latest() - 540;

		let signedDigest = await createOutputSignature(jobId, output, totalTime, errorCode, signTimestamp, wallets[17]);
		let tx = await jobs.connect(signers[1]).submitOutput(
			signedDigest,
			jobId,
			output,
			totalTime,
			errorCode,
			signTimestamp
		);
		await expect(tx).to.emit(jobs, "JobResponded")
			.and.to.emit(jobs, "JobResultCallbackCalled").withArgs(jobId, true);
		// check active jobs for submitter
		let executor = await executors.executors(addrs[17]);
		expect(executor.activeJobs).to.eq(0);
		// check active job for pending submitter
		executor = await executors.executors(addrs[18]);
		expect(executor.activeJobs).to.eq(1);

		executor = await executors.executors(addrs[19]);
		expect(executor.activeJobs).to.eq(1);

		// check usdc balance of executor
		expect(await usdc_token.balanceOf(addrs[1])).to.eq(100n*4n/9n);
		// check usdc balance of payment pool
		expect(await usdc_token.balanceOf(usdc_payment_pool)).to.eq(100n);
		// check usdc balance of job owner
		expect(await usdc_token.balanceOf(addrs[3])).to.eq(10n**6n - 100n*2n);
		// check stakes of all executors
		for (let index = 17; index < 20; index++) {
			const executor = await executors.executors(addrs[index]);
			expect(executor.stakeAmount).to.eq(10n**19n);
		}
	});

	// submit 2 output
	it("two output submits by selected executor nodes", async function () {
		let jobId = 0,
			output = solidityPacked(["string"], ["it is the output"]),
			totalTime = 100,
			errorCode = 0,
			signTimestamp = await time.latest() - 540;

		let signedDigest = await createOutputSignature(jobId, output, totalTime, errorCode, signTimestamp, wallets[17]);
		let tx = await jobs.connect(signers[1]).submitOutput(
			signedDigest,
			jobId,
			output,
			totalTime,
			errorCode,
			signTimestamp
		);
		await expect(tx).to.emit(jobs, "JobResponded")
			.and.to.emit(jobs, "JobResultCallbackCalled").withArgs(jobId, true);

		// submit 2nd output
		output = solidityPacked(["string"], ["it is the output"]);
		signedDigest = await createOutputSignature(jobId, output, totalTime, errorCode, signTimestamp, wallets[18]);
		tx = await jobs.connect(signers[1]).submitOutput(
			signedDigest,
			jobId,
			output,
			totalTime,
			errorCode,
			signTimestamp
		);
		await expect(tx).to.emit(jobs, "JobResponded").to.not.emit(jobs, "JobResultCallbackCalled");

		// check active jobs for submitter
		let executor = await executors.executors(addrs[17]);
		expect(executor.activeJobs).to.eq(0);
		executor = await executors.executors(addrs[18]);
		expect(executor.activeJobs).to.eq(0);

		// check active job for pending submitter
		executor = await executors.executors(addrs[19]);
		expect(executor.activeJobs).to.eq(1);

		// check usdc balance of executor
		expect(await usdc_token.balanceOf(addrs[1])).to.eq(100n*7n/9n);
		// check usdc balance of payment pool
		expect(await usdc_token.balanceOf(usdc_payment_pool)).to.eq(100n);
		// check usdc balance of job owner
		expect(await usdc_token.balanceOf(addrs[3])).to.eq(10n**6n - 100n*2n);
		// check stakes of all executors
		for (let index = 17; index < 20; index++) {
			const executor = await executors.executors(addrs[index]);
			expect(executor.stakeAmount).to.eq(10n**19n);
		}
	});

	// submit 3 output
	it("three output submits by selected executor nodes", async function () {
		let jobId = 0,
			output = solidityPacked(["string"], ["it is the output"]),
			totalTime = 100,
			errorCode = 0,
			signTimestamp = await time.latest() - 540;

		let signedDigest = await createOutputSignature(jobId, output, totalTime, errorCode, signTimestamp, wallets[17]);
		let tx = await jobs.connect(signers[1]).submitOutput(
			signedDigest,
			jobId,
			output,
			totalTime,
			errorCode,
			signTimestamp
		);
		await expect(tx).to.emit(jobs, "JobResponded")
			.and.to.emit(jobs, "JobResultCallbackCalled").withArgs(jobId, true);

		// submit 2nd output
		signedDigest = await createOutputSignature(jobId, output, totalTime, errorCode, signTimestamp, wallets[18]);
		tx = await jobs.connect(signers[1]).submitOutput(
			signedDigest,
			jobId,
			output,
			totalTime,
			errorCode,
			signTimestamp
		);
		await expect(tx).to.emit(jobs, "JobResponded")
			.and.to.not.emit(jobs, "JobResultCallbackCalled");

		// submit 3rd output
		signedDigest = await createOutputSignature(jobId, output, totalTime, errorCode, signTimestamp, wallets[19]);
		tx = await jobs.connect(signers[1]).submitOutput(
			signedDigest,
			jobId,
			output,
			totalTime,
			errorCode,
			signTimestamp
		);
		await expect(tx).to.emit(jobs, "JobResponded").to.not.emit(jobs, "JobResultCallbackCalled");

		// check active jobs for submitter
		let executor = await executors.executors(addrs[17]);
		expect(executor.activeJobs).to.eq(0);

		executor = await executors.executors(addrs[18]);
		expect(executor.activeJobs).to.eq(0);

		executor = await executors.executors(addrs[19]);
		expect(executor.activeJobs).to.eq(0);

		// check usdc balance of executor
		expect(await usdc_token.balanceOf(addrs[1])).to.eq(100n);
		// check usdc balance of payment pool
		expect(await usdc_token.balanceOf(usdc_payment_pool)).to.eq(100n);
		// check usdc balance of job owner
		expect(await usdc_token.balanceOf(addrs[3])).to.eq(10n**6n - 100n*2n);
		// check stakes of all executors
		for (let index = 17; index < 20; index++) {
			const executor = await executors.executors(addrs[index]);
			expect(executor.stakeAmount).to.eq(10n**19n);
		}
	});

	it("verify job result callback", async function () {
		// deploy job user
		const JobsUser = await ethers.getContractFactory("JobsUser");
		let jobsUser = await JobsUser.deploy(jobs.target, usdc_token.target) as unknown as JobsUser;
		let codeHash = keccak256(solidityPacked(["string"], ["codehash"])),
			codeInputs = solidityPacked(["string"], ["codeInput"]),
			usdcDeposit = 1000000,
			deadline = 10000;
		await usdc_token.transfer(jobsUser.target, 10n**6n);
		await jobsUser.createJob(codeHash, codeInputs, deadline, usdcDeposit);

		let jobId = 1,
			output = solidityPacked(["string"], ["it is the output"]),
			totalTime = 100,
			errorCode = 0,
			signTimestamp = await time.latest() - 540;

		let signedDigest = await createOutputSignature(jobId, output, totalTime, errorCode, signTimestamp, wallets[17]);
		let tx = await jobs.connect(signers[1]).submitOutput(
			signedDigest,
			jobId,
			output,
			totalTime,
			errorCode,
			signTimestamp
		);
		await expect(tx).to.emit(jobs, "JobResponded")
			.and.to.emit(jobs, "JobResultCallbackCalled").withArgs(jobId, true)
			.and.to.emit(jobsUser, "CalledBack").withArgs(jobId, output, errorCode, totalTime);
	});

	it("cannot submit output with expired signature", async function () {
		let jobId = 0,
			output = solidityPacked(["string"], ["it is the output"]),
			totalTime = 100,
			errorCode = 0,
			signTimestamp = await time.latest() - 800;

		let signedDigest = await createOutputSignature(jobId, output, totalTime, errorCode, signTimestamp, wallets[17]);
		await expect(jobs.connect(signers[1]).submitOutput(
			signedDigest,
			jobId,
			output,
			totalTime,
			errorCode,
			signTimestamp
		)).to.revertedWithCustomError(jobs, "JobsSignatureTooOld");
	});

	it("cannot submit output after execution time is over", async function () {
		await time.increase(20000);

		let jobId = 0,
			output = solidityPacked(["string"], ["it is the output"]),
			totalTime = 100,
			errorCode = 0,
			signTimestamp = await time.latest() - 540;

		let signedDigest = await createOutputSignature(jobId, output, totalTime, errorCode, signTimestamp, wallets[17]);

		await expect(jobs.connect(signers[1]).submitOutput(
			signedDigest,
			jobId,
			output,
			totalTime,
			errorCode,
			signTimestamp
			))
			.to.be.revertedWithCustomError(jobs, "JobsExecutionTimeOver");
	});

	it("cannot submit output twice", async function () {
		let jobId = 0,
			output = solidityPacked(["string"], ["it is the output"]),
			totalTime = 100,
			errorCode = 0,
			signTimestamp = await time.latest() - 540;

		let signedDigest = await createOutputSignature(jobId, output, totalTime, errorCode, signTimestamp, wallets[17]);
		let tx = await jobs.connect(signers[1]).submitOutput(
			signedDigest,
			jobId,
			output,
			totalTime,
			errorCode,
			signTimestamp
		);
		await expect(tx).to.emit(jobs, "JobResponded");

		await expect(jobs.connect(signers[1]).submitOutput(
			signedDigest,
			jobId,
			output,
			totalTime,
			errorCode,
			signTimestamp
			))
			.to.revertedWithCustomError(jobs, "JobsExecutorAlreadySubmittedOutput");
	});

	it("cannot submit output from unselected executor node", async function () {
		let jobCapacity = 20,
			stakeAmount = 10,
			timestamp = await time.latest() * 1000;

		let signTimestamp = await time.latest() - 540;
		// Executor index using wallet 17 + index as enclave address
		let [attestationSign, attestation] = await createAttestation(pubkeys[20], image4,
																		wallets[14], timestamp - 540000);
		let signedDigest = await createExecutorSignature(addrs[1], jobCapacity, signTimestamp,
															wallets[20]);

		await executors.connect(signers[1]).registerExecutor(
			attestationSign,
			attestation,
			jobCapacity,
			signTimestamp,
			signedDigest,
			stakeAmount
		);

		let jobId = 0,
			output = solidityPacked(["string"], ["it is the output"]),
			totalTime = 100,
			errorCode = 0;
		signTimestamp = await time.latest() - 540;
		signedDigest = await createOutputSignature(jobId, output, totalTime, errorCode, signTimestamp, wallets[20]);
		await expect(jobs.connect(signers[1]).submitOutput(
			signedDigest,
			jobId,
			output,
			totalTime,
			errorCode,
			signTimestamp
			))
			.to.revertedWithCustomError(jobs, "JobsNotSelectedExecutor");
	});

	it("can submit output after executor initiates draining", async function () {
		let jobId = 0,
			output = solidityPacked(["string"], ["it is the output"]),
			totalTime = 100,
			errorCode = 0,
			signTimestamp = await time.latest() - 540;

		await executors.connect(signers[1]).drainExecutor(addrs[17]);

		let signedDigest = await createOutputSignature(jobId, output, totalTime, errorCode, signTimestamp, wallets[17]);
		await expect(jobs.connect(signers[1]).submitOutput(
			signedDigest,
			jobId,
			output,
			totalTime,
			errorCode,
			signTimestamp
			))
			.to.emit(jobs, "JobResponded");

		let executor = await executors.executors(addrs[17]);
		expect(executor.draining).to.be.true;
	});
});

describe("Jobs - Slashing", function () {
	let signers: Signer[];
	let addrs: string[];
	let staking_token: Pond;
	let usdc_token: USDCoin;
	let wallets: Wallet[];
	let pubkeys: string[];
	let attestationVerifier: AttestationVerifier;
	let executors: Executors;
	let jobs: Jobs;
	let staking_payment_pool: string;
	let usdc_payment_pool: string;

	before(async function () {
		signers = await ethers.getSigners();
		addrs = await Promise.all(signers.map((a) => a.getAddress()));
		wallets = signers.map((_, idx) => walletForIndex(idx));
		pubkeys = wallets.map((w) => normalize(w.signingKey.publicKey));
		staking_payment_pool = addrs[2];
		usdc_payment_pool = addrs[2];

		const Pond = await ethers.getContractFactory("Pond");
		staking_token = await upgrades.deployProxy(Pond, ["Marlin", "POND"], {
			kind: "uups",
		}) as unknown as Pond;

		const USDCoin = await ethers.getContractFactory("USDCoin");
		usdc_token = await upgrades.deployProxy(USDCoin, [addrs[0]], {
			kind: "uups",
		}) as unknown as USDCoin;

		const AttestationVerifier = await ethers.getContractFactory("AttestationVerifier");
		attestationVerifier = await upgrades.deployProxy(
			AttestationVerifier,
			[[image1], [pubkeys[14]], addrs[0]],
			{ kind: "uups" },
		) as unknown as AttestationVerifier;

		let executor_images = [image4, image5, image6, image7]

		const Executors = await ethers.getContractFactory("Executors");
		executors = await upgrades.deployProxy(
			Executors,
			[addrs[0], executor_images],
			{
				kind: "uups",
				initializer: "initialize",
				constructorArgs: [
					attestationVerifier.target,
					600,
					staking_token.target,
					10**10,
					10**2,
					10**6
				]
			},
		) as unknown as Executors;

		const Jobs = await ethers.getContractFactory("Jobs");
		jobs = await upgrades.deployProxy(
			Jobs,
			[addrs[0]],
			{
				kind: "uups",
				initializer: "initialize",
				constructorArgs: [
					staking_token.target,
					usdc_token.target,
					600,
					100,
					3,
					1,
					1,
					staking_payment_pool,
					usdc_payment_pool,
					executors.target
				]
			},
		) as unknown as Jobs;

		await executors.grantRole(keccak256(ethers.toUtf8Bytes("JOBS_ROLE")), jobs.target);


		// Grant role to jobs contract on executor
		await staking_token.transfer(addrs[1], 10n**20n);
		await staking_token.connect(signers[1]).approve(executors.target, 10n**20n);

		let jobCapacity = 20, stakeAmount = 10n**19n;
		const timestamp = await time.latest() * 1000;
		for (let index = 0; index < 3; index++) {
			let signTimestamp = await time.latest() - 540;
			// Executor index using wallet 17 + index as enclave address
			let [attestationSign, attestation] = await createAttestation(pubkeys[17 + index], executor_images[index],
																		 wallets[14], timestamp - 540000);
			let signedDigest = await createExecutorSignature(addrs[1], jobCapacity, signTimestamp,
															 wallets[17 + index]);

			await executors.connect(signers[1]).registerExecutor(
				attestationSign,
				attestation,
				jobCapacity,
				signTimestamp,
				signedDigest,
				stakeAmount
			);
		}

		// RELAY JOB, caller address 3
		await usdc_token.transfer(addrs[3], 10n**6n);
		await usdc_token.connect(signers[3]).approve(jobs.target, 10n**6n);


		let codeHash = keccak256(solidityPacked(["string"], ["codehash"])),
			codeInputs = solidityPacked(["string"], ["codeInput"]),
			deadline = 10000;
		await jobs.connect(signers[3]).createJob(codeHash, codeInputs, deadline);
	});

	takeSnapshotBeforeAndAfterEveryTest(async () => { });

	it("can slash after deadline over", async function () {
		await time.increase(await time.latest() + 100000);
		let jobId = 0;
		let tx = await jobs.slashOnExecutionTimeout(jobId);
		await expect(tx).to.emit(jobs, "SlashedOnExecutionTimeout").withArgs(jobId, addrs[17])
			.and.to.emit(jobs, "SlashedOnExecutionTimeout").withArgs(jobId, addrs[18])
			.and.to.emit(jobs, "SlashedOnExecutionTimeout").withArgs(jobId, addrs[19])
			.and.to.emit(jobs, "JobFailureCallbackCalled").withArgs(jobId, true);
		// check job does not exists
		let job = await jobs.jobs(jobId);
		expect(job.execStartTime).to.be.eq(0);

		// check slashed amount that job owner is getting
		expect(await staking_token.balanceOf(addrs[3])).to.be.eq(3n*10n**15n);
		// check USDC balance of owner should be same
		expect(await usdc_token.balanceOf(addrs[3])).to.be.eq(10n**6n);
	});

	it("cannot slash non-existing job with id greater than total job count", async function () {
		let jobId = 2;
		let tx = jobs.slashOnExecutionTimeout(jobId);
		await expect(tx).to.revertedWithPanic(0x32);
	});

	it("cannot slash before deadline over", async function () {
		let jobId = 0;
		let tx = jobs.slashOnExecutionTimeout(jobId);
		await expect(tx).to.revertedWithCustomError(jobs, "JobsDeadlineNotOver");
	});

	it("cannot slash twice", async function () {
		await time.increase(await time.latest() + 100000);
		let jobId = 0;
		let tx = await jobs.slashOnExecutionTimeout(jobId);
		await expect(tx).to.emit(jobs, "SlashedOnExecutionTimeout");

		let tx2 = jobs.slashOnExecutionTimeout(jobId);
		await expect(tx2).to.revertedWithCustomError(jobs, "JobsInvalidJob");
	});

	it("can slash after executor initiates drain", async function () {
		await executors.connect(signers[1]).drainExecutor(addrs[17]);

		await time.increase(await time.latest() + 100000);
		let jobId = 0;

		await expect(jobs.slashOnExecutionTimeout(jobId))
			.to.emit(jobs, "SlashedOnExecutionTimeout");

		let executor = await executors.executors(addrs[17]);
		expect(executor.draining).to.be.true;
	});

	it("slash after only one executor submits output", async function () {
		let jobId = 0,
			output = solidityPacked(["string"], ["it is the output"]),
			totalTime = 100,
			errorCode = 0,
			signTimestamp = await time.latest() - 540;

		let signedDigest = await createOutputSignature(jobId, output, totalTime, errorCode, signTimestamp, wallets[17]);
		await jobs.connect(signers[1]).submitOutput(
			signedDigest,
			jobId,
			output,
			totalTime,
			errorCode,
			signTimestamp
		);

		await time.increase(await time.latest() + 100000);
		await expect(jobs.slashOnExecutionTimeout(jobId))
			.to.emit(jobs, "SlashedOnExecutionTimeout").withArgs(jobId, addrs[18])
			.and.to.emit(jobs, "SlashedOnExecutionTimeout").withArgs(jobId, addrs[19]);
		// check job does not exists
		let job = await jobs.jobs(jobId);
		expect(job.execStartTime).to.be.eq(0);

		// check slashed amount payment pool is getting
		expect(await staking_token.balanceOf(staking_payment_pool)).to.be.eq(2n*10n**15n);
		// check payments received by payment pool in USDC
		let expected_balance = 100n*2n - 100n*1n*4n/9n;
		expect(await usdc_token.balanceOf(usdc_payment_pool)).to.be.eq((expected_balance));
	});

	it("slash after two executors submits output", async function () {
		let jobId = 0,
			output = solidityPacked(["string"], ["it is the output"]),
			totalTime = 100,
			errorCode = 0,
			signTimestamp = await time.latest() - 540;

		let signedDigest = await createOutputSignature(jobId, output, totalTime, errorCode, signTimestamp, wallets[17]);
		await jobs.connect(signers[1]).submitOutput(
			signedDigest,
			jobId,
			output,
			totalTime,
			errorCode,
			signTimestamp
		);

		signedDigest = await createOutputSignature(jobId, output, totalTime, errorCode, signTimestamp, wallets[18]);
		await jobs.connect(signers[1]).submitOutput(
			signedDigest,
			jobId,
			output,
			totalTime,
			errorCode,
			signTimestamp
		);

		await time.increase(await time.latest() + 100000);
		await expect(jobs.slashOnExecutionTimeout(jobId))
			.to.emit(jobs, "SlashedOnExecutionTimeout").withArgs(jobId, addrs[19]);
		// check job does not exists
		let job = await jobs.jobs(jobId);
		expect(job.execStartTime).to.be.eq(0);

		// check slashed amount payment pool is getting
		expect(await staking_token.balanceOf(staking_payment_pool)).to.be.eq(1n*10n**15n);
		// check payments received by payment pool in USDC
		let expected_balance = 100n*2n - 100n*1n*7n/9n;
		expect(await usdc_token.balanceOf(usdc_payment_pool)).to.be.eq((expected_balance));
	});

	it("slash after all executors submits output", async function () {
		let jobId = 0,
			output = solidityPacked(["string"], ["it is the output"]),
			totalTime = 100,
			errorCode = 0,
			signTimestamp = await time.latest() - 540;

		let signedDigest = await createOutputSignature(jobId, output, totalTime, errorCode, signTimestamp, wallets[17]);
		await jobs.connect(signers[1]).submitOutput(
			signedDigest,
			jobId,
			output,
			totalTime,
			errorCode,
			signTimestamp
		);

		signedDigest = await createOutputSignature(jobId, output, totalTime, errorCode, signTimestamp, wallets[18]);
		await jobs.connect(signers[1]).submitOutput(
			signedDigest,
			jobId,
			output,
			totalTime,
			errorCode,
			signTimestamp
		);

		signedDigest = await createOutputSignature(jobId, output, totalTime, errorCode, signTimestamp, wallets[19]);
		await jobs.connect(signers[1]).submitOutput(
			signedDigest,
			jobId,
			output,
			totalTime,
			errorCode,
			signTimestamp
		);

		await time.increase(await time.latest() + 100000);
		await expect(jobs.slashOnExecutionTimeout(jobId))
			.to.revertedWithCustomError(jobs, "JobsInvalidJob");
	});

	it("verify job failed callback", async function () {
		// deploy job user
		const JobsUser = await ethers.getContractFactory("JobsUser");
		let jobsUser = await JobsUser.deploy(jobs.target, usdc_token.target) as unknown as JobsUser;
		let codeHash = keccak256(solidityPacked(["string"], ["codehash"])),
			codeInputs = solidityPacked(["string"], ["codeInput"]),
			usdcDeposit = 1000000,
			deadline = 10000;
		await usdc_token.transfer(jobsUser.target, 10n**6n);
		await jobsUser.createJob(codeHash, codeInputs, deadline, usdcDeposit);

		await time.increase(await time.latest() + 100000);
		let jobId = 1;
		let tx = await jobs.slashOnExecutionTimeout(jobId);
		await expect(tx).to.emit(jobs, "SlashedOnExecutionTimeout").withArgs(jobId, addrs[17])
			.and.to.emit(jobs, "SlashedOnExecutionTimeout").withArgs(jobId, addrs[18])
			.and.to.emit(jobs, "SlashedOnExecutionTimeout").withArgs(jobId, addrs[19])
			.and.to.emit(jobs, "JobFailureCallbackCalled").withArgs(jobId, true)
			.and.to.emit(jobsUser, "FailedCallback").withArgs(jobId, 3n*10n**15n);
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
			{ name: 'signTimestamp', type: 'uint256'}
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