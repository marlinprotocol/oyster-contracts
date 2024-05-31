import { BytesLike, getBytes, keccak256, parseUnits, solidityPacked, Wallet } from "ethers";
import { ethers, upgrades } from "hardhat";
import { AttestationVerifier } from "../typechain-types";

async function main() {
    //Create Enclave Image object
    const img = {
        PCR0 : getBytes("0xcfa7554f87ba13620037695d62a381a2d876b74c2e1b435584fe5c02c53393ac1c5cd5a8b6f92e866f9a65af751e0462"),
        PCR1 : getBytes("0xbcdf05fefccaa8e55bf2c8d6dee9e79bbff31e34bf28a99aa19e6b29c37ee80b214a414b7607236edf26fcb78654e63f"),
        PCR2 : getBytes("0x20caae8a6a69d9b1aecdf01a0b9c5f3eafd1f06cb51892bf47cef476935bfe77b5b75714b68a69146d650683a217c5b3"),
    };

    let wallet = walletForIndex(0);
    console.log("Attestation Verifer Enclave Private Key: ", wallet.signingKey.privateKey);
    let enclavePubKey = normalize(wallet.signingKey.publicKey);
    console.log("Attestation Verifer Enclave Public Key: ", enclavePubKey);
    // Admin address
    let signers = await ethers.getSigners();
    let admin_addr = await signers[0].getAddress();
    
    // Deploy Token Contract
    console.log("Deploying USDCoin...");
    const USDCoin = await ethers.getContractFactory("USDCoin");
    let usdc_token = await upgrades.deployProxy(USDCoin, [admin_addr], {
        kind: "uups",
    });

    let usdc_token_addr = usdc_token.target;
    console.log("USDCoin Deployed address: ", usdc_token_addr);
    const executorFeePerMs = 1; // 0.001 usd per ms
    const stakingRewardPerMs = 1; // 0.001 usd per ms
    const executionFeePerMs = executorFeePerMs + stakingRewardPerMs; 
    const gatewayFee = 100; // 0.1 usd
    const signMaxAge = 600;
    // Attestation Verifier
    const AttestationVerifier = await ethers.getContractFactory("AttestationVerifier");
    console.log("Deploying AttestationVerifier")
    let attestationverifier = await upgrades.deployProxy(
        AttestationVerifier,
        [
            [img],
            [enclavePubKey],
            admin_addr
        ],
        {
            kind : "uups"
        });
    let av_addr = attestationverifier.target;
    console.log("AttestationVerifier Deployed address: ", av_addr);

    // Request Chain Relay Contract
    let overallTimeout = 600;
    let minUserDeadline = 1000;
    let maxUserDeadline = 50000;
    const Relay = await ethers.getContractFactory("Relay");
    console.log("Deploying Relay...")
    let relay = await upgrades.deployProxy(
        Relay,
        [
            admin_addr,
            [img]
        ],
        {
            initializer : "initialize",
            kind : "uups",
            constructorArgs : [
                av_addr,
                signMaxAge,
                usdc_token_addr,
                minUserDeadline,
                maxUserDeadline,
                overallTimeout,
                executionFeePerMs,
                gatewayFee
            ]
        });
    let relay_addr = relay.target;
    console.log("ServerlessRelay Deployed address: ", relay_addr);
    console.log(av_addr,
        signMaxAge,
        usdc_token_addr,
        minUserDeadline,
        maxUserDeadline,
        overallTimeout,
        executionFeePerMs,
        gatewayFee
    );
}

function normalize(key: string): string {
	return '0x' + key.substring(4);
}

function walletForIndex(idx: number): Wallet {
	let wallet = ethers.HDNodeWallet.fromPhrase("test test test test test test test test test test test junk", undefined, "m/44'/60'/0'/0/" + idx.toString());

	return new Wallet(wallet.privateKey);
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
	jobId: number,
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

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
