import { getBytes, Wallet } from "ethers";
import { ethers, upgrades } from "hardhat";

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
    
    // Admin address
    let signers = await ethers.getSigners();
    let admin_addr = await signers[0].getAddress();
    
    // Deploy Token Contract
    const Pond = await ethers.getContractFactory("Pond");
    let staking_token = await upgrades.deployProxy(Pond, ["Marlin", "POND"], {
        kind: "uups",
    });
    let staking_token_addr = staking_token.target;

    const USDCoin = await ethers.getContractFactory("USDCoin");
    let usdc_token = await upgrades.deployProxy(USDCoin, [admin_addr], {
        kind: "uups",
    });

    let usdc_token_addr = usdc_token.target;
    
    const executorFeePerMs = 1; // 0.001 usd per ms
    const stakingRewardPerMs = 1; // 0.001 usd per ms
    const executionFeePerMs = executorFeePerMs + stakingRewardPerMs; 
    const gatewayFee = 100; // 0.1 usd
    const stakingPaymentPoolAddress = await signers[0].getAddress();
    const usdcPaymentPoolAddress = await signers[0].getAddress();
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
    let overallTimeout = 120;
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

    // Common Chain Gateways Contract
    let epochInterval = 600;
    const Gateways = await ethers.getContractFactory("Gateways");
    console.log("Deploying Gateways...")
    let gatewaysContract = await upgrades.deployProxy(
        Gateways,
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
                staking_token_addr,
                epochInterval + overallTimeout,
                100, // 0.01 %
                1000000
            ]
        });

    let gatewaysAddress = gatewaysContract.target;
    console.log("Gateways Deployed address: ", gatewaysAddress);
    
    // Common Chain Executors Contract
    let minStake = 10n**18n;
    const Executors = await ethers.getContractFactory("Executors");
    console.log("Deploying Executors...")
    let executorsContract = await upgrades.deployProxy(
        Executors,
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
                staking_token_addr,
                minStake,
                100, // 0.01 %
                1000000
            ]
        });
    let executorsAddress = executorsContract.target;
    console.log("Executors Deployed address: ", executorsAddress);

    let executionBufferTime = 60,
        noOfNodesToSelect = 3;
    // Common Chain Jobs Contract
    const Jobs = await ethers.getContractFactory("Jobs");
    console.log("Deploying Jobs...")
    let jobsContract = await upgrades.deployProxy(
        Jobs,
        [
            admin_addr,
        ],
        {
            initializer : "initialize",
            kind : "uups",
            constructorArgs: [
                staking_token_addr,
                usdc_token_addr,
                signMaxAge,
                executionBufferTime,
                noOfNodesToSelect,
                1,
                1,
                stakingPaymentPoolAddress,
                usdcPaymentPoolAddress,
                executorsAddress
            ]
        });
    let jobsAddress = jobsContract.target;
    console.log("Jobs Deployed address: ", jobsAddress);
    await executorsContract.grantRole(await executorsContract.JOBS_ROLE(), jobsAddress);

     // Common Chain Gateway Jobs Contract
     let relayBufferTime = 120;
     const GatewayJobs = await ethers.getContractFactory("GatewayJobs");
     console.log("Deploying GatewayJobs...")
     let gatewayJobs = await upgrades.deployProxy(
         GatewayJobs,
         [
             admin_addr
         ],
         {
             initializer : "initialize",
             kind : "uups",
             constructorArgs : [
                 staking_token_addr,
                 usdc_token_addr,
                 signMaxAge,
                 relayBufferTime,
                 executionFeePerMs,
                 10n**16n, // 0.01 POND
                 10n**16n, // 0.01 POND
                 jobsAddress,
                 gatewaysAddress,
                 stakingPaymentPoolAddress
             ]
         });
    let gatewayJobsAddress = gatewayJobs.target;
    console.log("GatewayJobs Deployed address: ", gatewayJobsAddress);
    await gatewaysContract.grantRole(await gatewaysContract.GATEWAY_JOBS_ROLE(), gatewayJobsAddress);
}

function normalize(key: string): string {
	return '0x' + key.substring(4);
}

function walletForIndex(idx: number): Wallet {
	let wallet = ethers.HDNodeWallet.fromPhrase("test test test test test test test test test test test junk", undefined, "m/44'/60'/0'/0/" + idx.toString());

	return new Wallet(wallet.privateKey);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

/*
    ARBITRUM SEPOLIA -
    Attestation Verifer Enclave Private Key:  0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
    POND Deployed address: 0xA172C4F18b423801E94F9FbB9d4065831Ef4d575
    USDC Deployed address: 0xD330cF76192274bb3f10f2E574a1bDba4ED29352 (NEW) 
                        0xA9B0A14b99d0e4F42a0c6433a42c671A6B1E74Aa (OLD)
    AttestationVerifier Deployed address:  0xfF27c9A6a878A018FAaD0511fAf870F09C6b79a1
    ServerlessRelay Deployed address:  0xD02e33f98a08030B72A471Ae41e696a57cFecCc8 (NEW)
                                    0x187b8Aed16CA0ee242831f1bAcd5Aa88e3478C64 (OLD)
    Gateways Deployed address:  0x271437C9B2069F13Cc197B9e12A02ED276ae3A85
    Executors Deployed address:  0xc58Ffc9bfCc846E56Eeb9AaE5aBFAD00393a19C5
    Jobs Deployed address:  0xaba049A974a331A3b450FB8263710Ad140f64E4F
    GatewayJobs Deployed address:  0x8E26289186BEA242094611aE1dDa0A2F29587ce8
*/