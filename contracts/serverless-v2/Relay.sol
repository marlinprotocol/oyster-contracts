// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/introspection/ERC165Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "../AttestationAutherUpgradeable.sol";
import "../interfaces/IAttestationVerifier.sol";

/**
 * @title Relay
 * @notice This contract manages job relay, gateway registration, and job subscription functionalities.
 * @dev This contract is upgradeable and uses the UUPS (Universal Upgradeable Proxy Standard) pattern.
 */
contract Relay is
    Initializable, // initializer
    ContextUpgradeable, // _msgSender, _msgData
    ERC165Upgradeable, // supportsInterface
    AccessControlUpgradeable,
    UUPSUpgradeable, // public upgrade
    AttestationAutherUpgradeable
{
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;

    error RelayInvalidToken();
    error RelayInvalidGlobalTimeouts();

    /**
     * @notice Initializes the logic contract with essential parameters and disables further 
     * initializations of the logic contract.
     * @param attestationVerifier The contract responsible for verifying attestations.
     * @param maxAge The maximum age for attestations.
     * @param _token The ERC20 token used for payments and deposits.
     * @param _globalMinTimeout The minimum timeout value for jobs.
     * @param _globalMaxTimeout The maximum timeout value for jobs.
     * @param _overallTimeout The overall timeout value for job execution.
     * @param _executionFeePerMs The fee per millisecond for job execution.
     * @param _gatewayFeePerJob The fixed fee per job for the gateway.
     * @param _fixedGas The fixed gas amount for job responses without callback.
     * @param _callbackMeasureGas The gas amount used for measuring callback gas.
     */
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(
        IAttestationVerifier attestationVerifier,
        uint256 maxAge,
        IERC20 _token,
        uint256 _globalMinTimeout, // in milliseconds
        uint256 _globalMaxTimeout, // in milliseconds
        uint256 _overallTimeout,
        uint256 _executionFeePerMs, // fee is in USDC
        uint256 _gatewayFeePerJob,
        uint256 _fixedGas,
        uint256 _callbackMeasureGas
    ) AttestationAutherUpgradeable(attestationVerifier, maxAge) {
        _disableInitializers();

        if (address(_token) == address(0)) revert RelayInvalidToken();
        TOKEN = _token;

        if (_globalMinTimeout >= _globalMaxTimeout) revert RelayInvalidGlobalTimeouts();
        GLOBAL_MIN_TIMEOUT = _globalMinTimeout;
        GLOBAL_MAX_TIMEOUT = _globalMaxTimeout;
        OVERALL_TIMEOUT = _overallTimeout;

        EXECUTION_FEE_PER_MS = _executionFeePerMs;
        GATEWAY_FEE_PER_JOB = _gatewayFeePerJob;

        FIXED_GAS = _fixedGas;
        CALLBACK_MEASURE_GAS = _callbackMeasureGas;
    }

    //-------------------------------- Overrides start --------------------------------//

    /// @inheritdoc ERC165Upgradeable
    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override(ERC165Upgradeable, AccessControlUpgradeable) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    /// @inheritdoc UUPSUpgradeable
    function _authorizeUpgrade(address /*account*/) internal view override onlyRole(DEFAULT_ADMIN_ROLE) {}

    //-------------------------------- Overrides end --------------------------------//

    //-------------------------------- Initializer start --------------------------------//

    error RelayZeroAddressAdmin();

    /**
     * @notice Initializes the Relay contract with the specified admin and enclave images.
     * @param _admin The address to be granted the DEFAULT_ADMIN_ROLE.
     * @param _images The initial enclave images to be whitelisted.
     */
    function initialize(address _admin, EnclaveImage[] memory _images) public initializer {
        if (_admin == address(0)) revert RelayZeroAddressAdmin();

        __Context_init_unchained();
        __ERC165_init_unchained();
        __AccessControl_init_unchained();
        __UUPSUpgradeable_init_unchained();
        __AttestationAuther_init_unchained(_images);

        _grantRole(DEFAULT_ADMIN_ROLE, _admin);

        jobCount = block.chainid << 192;
    }

    //-------------------------------- Initializer end --------------------------------//

    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    IERC20 public immutable TOKEN;

    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    uint256 public immutable GLOBAL_MIN_TIMEOUT;

    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    uint256 public immutable GLOBAL_MAX_TIMEOUT;

    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    uint256 public immutable OVERALL_TIMEOUT;

    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    uint256 public immutable EXECUTION_FEE_PER_MS;

    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    uint256 public immutable GATEWAY_FEE_PER_JOB;

    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    uint256 public immutable FIXED_GAS; // Should equal to gas of jobResponse without callback - gas refunds

    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    uint256 public immutable CALLBACK_MEASURE_GAS; // gas consumed for measurement of callback gas

    bytes32 private constant DOMAIN_SEPARATOR =
        keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version)"),
                keccak256("marlin.oyster.Relay"),
                keccak256("1")
            )
        );

    //-------------------------------- Admin methods start --------------------------------//

    /** 
     * @notice Whitelist an enclave image without verifying any attestations.
     * @param PCR0 The first PCR value of the enclave image.
     * @param PCR1 The second PCR value of the enclave image.
     * @param PCR2 The third PCR value of the enclave image.
     * @return Computed image id and true if the image was freshly whitelisted, false otherwise.
     */
    function whitelistEnclaveImage(
        bytes calldata PCR0,
        bytes calldata PCR1,
        bytes calldata PCR2
    ) external onlyRole(DEFAULT_ADMIN_ROLE) returns (bytes32, bool) {
        return _whitelistEnclaveImage(EnclaveImage(PCR0, PCR1, PCR2));
    }

    /** 
     * @notice Revoke an enclave image.
     * @param imageId Image to be revoked.
     * @return true if the image was freshly revoked, false otherwise.
     */
    function revokeEnclaveImage(bytes32 imageId) external onlyRole(DEFAULT_ADMIN_ROLE) returns (bool) {
        return _revokeEnclaveImage(imageId);
    }

    //-------------------------------- Admin methods end ----------------------------------//

    //-------------------------------- Gateway start --------------------------------//

    // enclaveAddress => owner
    mapping(address => address) public gatewayOwners;

    bytes32 private constant REGISTER_TYPEHASH = keccak256("Register(address owner,uint256 signTimestamp)");

    event GatewayRegistered(address indexed owner, address indexed enclaveAddress);

    event GatewayDeregistered(address indexed enclaveAddress);

    error RelayGatewayAlreadyExists();
    error RelayInvalidGateway();
    error RelaySignatureTooOld();
    error RelayInvalidSigner();

    //-------------------------------- internal functions start --------------------------------//

    function _registerGateway(
        bytes memory _attestationSignature,
        IAttestationVerifier.Attestation memory _attestation,
        bytes calldata _signature,
        uint256 _signTimestamp,
        address _owner
    ) internal {
        // attestation verification
        _verifyEnclaveKey(_attestationSignature, _attestation);

        address enclaveAddress = _pubKeyToAddress(_attestation.enclavePubKey);

        // signature verification
        _verifyRegisterSign(_owner, _signTimestamp, _signature, enclaveAddress);

        if (gatewayOwners[enclaveAddress] != address(0)) revert RelayGatewayAlreadyExists();
        gatewayOwners[enclaveAddress] = _owner;

        emit GatewayRegistered(_owner, enclaveAddress);
    }

    function _verifyRegisterSign(
        address _owner,
        uint256 _signTimestamp,
        bytes calldata _signature,
        address _enclaveAddress
    ) internal view {
        if (block.timestamp > _signTimestamp + ATTESTATION_MAX_AGE) revert RelaySignatureTooOld();

        bytes32 hashStruct = keccak256(abi.encode(REGISTER_TYPEHASH, _owner, _signTimestamp));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, hashStruct));
        address signer = digest.recover(_signature);

        if (signer != _enclaveAddress) revert RelayInvalidSigner();
    }

    function _deregisterGateway(address _enclaveAddress, address _owner) internal {
        if (gatewayOwners[_enclaveAddress] != _owner) revert RelayInvalidGateway();

        _revokeEnclaveKey(gatewayOwners[_enclaveAddress]);
        delete gatewayOwners[_enclaveAddress];

        emit GatewayDeregistered(_enclaveAddress);
    }

    //-------------------------------- internal functions end ----------------------------------//

    //-------------------------------- external functions start --------------------------------//

    /**
     * @notice Registers a gateway by providing attestation and signature details.
     * @dev This function verifies the enclave key and signature before registering the gateway.
     * @param _attestationSignature The attestation signature from the enclave.
     * @param _attestation The attestation details including the enclave public key.
     * @param _signature The signature from the owner for registering the gateway.
     * @param _signTimestamp The timestamp at which the owner signed the registration.
     */
    function registerGateway(
        bytes memory _attestationSignature,
        IAttestationVerifier.Attestation memory _attestation,
        bytes calldata _signature,
        uint256 _signTimestamp
    ) external {
        _registerGateway(_attestationSignature, _attestation, _signature, _signTimestamp, _msgSender());
    }

    /**
     * @notice Deregisters a gateway by its enclave address.
     * @dev This function checks the caller's ownership of the gateway before deregistration.
     * @param _enclaveAddress The address of the enclave to be deregistered.
     */
    function deregisterGateway(address _enclaveAddress) external {
        _deregisterGateway(_enclaveAddress, _msgSender());
    }

    //-------------------------------- external functions end ---------------------------//

    //-------------------------------- Gateway End --------------------------------//

    //-------------------------------- Job start --------------------------------//

    struct Job {
        uint256 startTime;
        uint256 maxGasPrice;
        uint256 usdcDeposit;
        uint256 callbackDeposit;
        uint256 callbackGasLimit;
        address jobOwner;
        address callbackContract;
        bytes32 codehash;
        bytes codeInputs;
    }

    mapping(uint256 => Job) public jobs;

    uint256 public jobCount;

    bytes32 private constant JOB_RESPONSE_TYPEHASH =
        keccak256("JobResponse(uint256 jobId,bytes output,uint256 totalTime,uint8 errorCode,uint256 signTimestamp)");
    
    event JobRelayed(
        uint256 indexed jobId,
        bytes32 codehash,
        bytes codeInputs,
        uint256 userTimeout, // in milliseconds
        uint256 maxGasPrice,
        uint256 usdcDeposit,
        uint256 callbackDeposit,
        address refundAccount,
        address callbackContract,
        uint256 startTime,
        uint256 callbackGasLimit
    );

    event JobResponded(uint256 indexed jobId, bytes output, uint256 totalTime, uint256 errorCode, bool success);

    event JobCancelled(uint256 indexed jobId);

    error RelayInvalidUserTimeout();
    error RelayJobNotExists();
    error RelayOverallTimeoutOver();
    error RelayInvalidJobOwner();
    error RelayOverallTimeoutNotOver();
    error RelayCallbackDepositTransferFailed();
    error RelayInsufficientCallbackDeposit();
    error RelayInsufficientMaxGasPrice();

    //-------------------------------- internal functions start -------------------------------//

    function _relayJob(
        bytes32 _codehash,
        bytes memory _codeInputs,
        uint256 _userTimeout, // in milliseconds
        uint256 _maxGasPrice,
        uint256 _callbackDeposit,
        address _refundAccount,
        address _callbackContract,
        uint256 _callbackGasLimit,
        address _jobOwner
    ) internal {
        if (_userTimeout <= GLOBAL_MIN_TIMEOUT || _userTimeout >= GLOBAL_MAX_TIMEOUT) revert RelayInvalidUserTimeout();

        if (jobCount + 1 == (block.chainid + 1) << 192) jobCount = block.chainid << 192;

        if (_maxGasPrice < tx.gasprice) revert RelayInsufficientMaxGasPrice();

        if (_maxGasPrice * (_callbackGasLimit + FIXED_GAS + CALLBACK_MEASURE_GAS) > _callbackDeposit)
            revert RelayInsufficientCallbackDeposit();

        uint256 usdcDeposit = _userTimeout * EXECUTION_FEE_PER_MS + GATEWAY_FEE_PER_JOB;
        jobs[++jobCount] = Job({
            startTime: block.timestamp,
            maxGasPrice: _maxGasPrice,
            usdcDeposit: usdcDeposit,
            callbackDeposit: _callbackDeposit,
            jobOwner: _jobOwner,
            codehash: _codehash,
            codeInputs: _codeInputs,
            callbackContract: _callbackContract,
            callbackGasLimit: _callbackGasLimit
        });

        // deposit escrow amount(USDC)
        TOKEN.safeTransferFrom(_jobOwner, address(this), usdcDeposit);

        emit JobRelayed(
            jobCount,
            _codehash,
            _codeInputs,
            _userTimeout,
            _maxGasPrice,
            usdcDeposit,
            _callbackDeposit,
            _refundAccount,
            _callbackContract,
            block.timestamp,
            _callbackGasLimit
        );
    }

    function _jobResponse(
        bytes calldata _signature,
        uint256 _jobId,
        bytes calldata _output,
        uint256 _totalTime,
        uint8 _errorCode,
        uint256 _signTimestamp
    ) internal {
        Job memory job = jobs[_jobId];
        if (job.jobOwner == address(0)) revert RelayJobNotExists();

        // check time case
        if (block.timestamp > job.startTime + OVERALL_TIMEOUT) revert RelayOverallTimeoutOver();

        // signature check
        address enclaveAddress = _verifyJobResponseSign(
            _signature,
            _jobId,
            _output,
            _totalTime,
            _errorCode,
            _signTimestamp
        );

        delete jobs[_jobId];
        _releaseEscrowAmount(enclaveAddress, job.jobOwner, _totalTime, job.usdcDeposit);

        (bool success, uint256 callbackGas) = _callBackWithLimit(
            _jobId,
            job,
            _output,
            _errorCode
        );

        uint256 callbackCost = (callbackGas + FIXED_GAS) * tx.gasprice;

        _releaseGasCostOnSuccess(gatewayOwners[enclaveAddress], job.jobOwner, job.callbackDeposit, callbackCost);
        emit JobResponded(_jobId, _output, _totalTime, _errorCode, success);
    }

    function _verifyJobResponseSign(
        bytes calldata _signature,
        uint256 _jobId,
        bytes calldata _output,
        uint256 _totalTime,
        uint8 _errorCode,
        uint256 _signTimestamp
    ) internal view returns (address) {
        if (block.timestamp > _signTimestamp + ATTESTATION_MAX_AGE) revert RelaySignatureTooOld();

        bytes32 hashStruct = keccak256(
            abi.encode(JOB_RESPONSE_TYPEHASH, _jobId, keccak256(_output), _totalTime, _errorCode, _signTimestamp)
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, hashStruct));
        address signer = digest.recover(_signature);

        _allowOnlyVerified(signer);
        return signer;
    }

    function _releaseEscrowAmount(
        address _enclaveAddress,
        address _jobOwner,
        uint256 _totalTime,
        uint256 _usdcDeposit
    ) internal {
        uint256 gatewayPayoutUsdc;
        uint256 jobOwnerPayoutUsdc;
        unchecked {
            gatewayPayoutUsdc = _totalTime * EXECUTION_FEE_PER_MS + GATEWAY_FEE_PER_JOB;
            jobOwnerPayoutUsdc = _usdcDeposit - gatewayPayoutUsdc;
        }

        // release escrow to gateway
        TOKEN.safeTransfer(gatewayOwners[_enclaveAddress], gatewayPayoutUsdc);
        TOKEN.safeTransfer(_jobOwner, jobOwnerPayoutUsdc);
    }

    function _jobCancel(uint256 _jobId, address _jobOwner) internal {
        Job storage job = jobs[_jobId];
        if (job.jobOwner != _jobOwner) revert RelayInvalidJobOwner();

        // check time case
        if (block.timestamp <= job.startTime + OVERALL_TIMEOUT) revert RelayOverallTimeoutNotOver();

        uint256 callbackDeposit = job.callbackDeposit;
        uint256 usdcDeposit = job.usdcDeposit;
        delete jobs[_jobId];

        // return back escrow amount to the user
        TOKEN.safeTransfer(_jobOwner, usdcDeposit);

        // return back callback deposit to the user
        (bool success, ) = _jobOwner.call{value: callbackDeposit}("");
        if (!success) revert RelayCallbackDepositTransferFailed();

        emit JobCancelled(_jobId);
    }

    function _callBackWithLimit(
        uint256 _jobId,
        Job memory _job,
        bytes calldata _output,
        uint8 _errorCode
    ) internal returns (bool success, uint callbackGas) {
        if (tx.gasprice <= _job.maxGasPrice) {
            uint startGas = gasleft();
            (success, ) = _job.callbackContract.call{gas: _job.callbackGasLimit}(
                abi.encodeWithSignature(
                    "oysterResultCall(uint256,address,bytes32,bytes,bytes,uint8)",
                    _jobId,
                    _job.jobOwner,
                    _job.codehash,
                    _job.codeInputs,
                    _output,
                    _errorCode
                )
            );
            // calculate callback cost
            callbackGas = startGas - gasleft();
        }
    }

    function _releaseGasCostOnSuccess(
        address _gatewayOwner,
        address _jobOwner,
        uint256 _callbackDeposit,
        uint256 _callbackCost
    ) internal {
        // TODO: If paySuccess is false then deposit will be stucked forever. Find a way out.
        // transfer callback cost to gateway
        _callbackCost = _callbackCost > _callbackDeposit ? _callbackDeposit : _callbackCost;
        (bool paySuccess, ) = _gatewayOwner.call{value: _callbackCost}("");
        // transfer remaining native asset to the jobOwner
        (paySuccess, ) = _jobOwner.call{value: _callbackDeposit - _callbackCost}("");
    }

    //-------------------------------- internal functions end ----------------------------------//

    //-------------------------------- external functions start --------------------------------//

    /**
     * @notice Function for users to relay a job to the enclave for execution.
     * @dev The job parameters are validated before relaying to the enclave.
     *      The job escrow amount (USDC+ETH) is transferred to the contract.
     * @param _codehash The transaction hash storing the code to be executed by the enclave.
     * @param _codeInputs The excrypted inputs to the code to be executed.
     * @param _userTimeout The maximum execution time allowed for the job in milliseconds.
     * @param _maxGasPrice The maximum gas price the job owner is willing to pay, to get back the job response.
     * @param _refundAccount The account to receive any remaining/slashed tokens.
     * @param _callbackContract The contract address to be called upon submitting job response.
     * @param _callbackGasLimit The gas limit for the callback function.
     */
    function relayJob(
        bytes32 _codehash,
        bytes memory _codeInputs,
        uint256 _userTimeout,
        uint256 _maxGasPrice,
        address _refundAccount, // Common chain slashed token will be sent to this address
        address _callbackContract,
        uint256 _callbackGasLimit
    ) external payable {
        _relayJob(
            _codehash,
            _codeInputs,
            _userTimeout,
            _maxGasPrice,
            msg.value,
            _refundAccount,
            _callbackContract,
            _callbackGasLimit,
            _msgSender()
        );
    }

    /**
     * @notice Function for gateways to respond to a job that has been executed by the enclave.
     * @dev The response includes output data, execution time, and error code.
     * @param _signature The signature of the gateway enclave.
     * @param _jobId The unique identifier of the job.
     * @param _output The output data from the job execution.
     * @param _totalTime The total time taken for job execution in milliseconds.
     * @param _errorCode The error code returned from the job execution.
     * @param _signTimestamp The timestamp at which the response was signed by the enclave.
     */
    function jobResponse(
        bytes calldata _signature,
        uint256 _jobId,
        bytes calldata _output,
        uint256 _totalTime,
        uint8 _errorCode,
        uint256 _signTimestamp
    ) external {
        _jobResponse(_signature, _jobId, _output, _totalTime, _errorCode, _signTimestamp);
    }

    /**
     * @notice Cancels a job whose response hasn't been submitted after the deadline.
     * @dev The function checks the job owner and ensures the overall timeout has been reached before cancellation.
     * @param _jobId The unique identifier of the job to be cancelled.
     */
    function jobCancel(uint256 _jobId) external {
        _jobCancel(_jobId, _msgSender());
    }

    //-------------------------------- external functions end --------------------------------//

    //-------------------------------- Job End --------------------------------//

    //-------------------------------- Job Subscription Start --------------------------------//

    struct JobSubscription {
        uint256 periodicGap;
        // uint256 maxRuns;
        uint256 terminationTimestamp;
        uint256 currentRuns;
        uint256 lastRunTimestamp;
        uint256 userTimeout;
        address refundAccount;
        Job job;
    }

    // jobSubsId => JobSubscription
    mapping(uint256 => JobSubscription) public jobSubscriptions;

    uint256 public jobSubsCount;

    event JobSubscriptionStarted(
        uint256 indexed jobSubsId,
        address indexed jobSubscriber,
        uint256 periodicGap,
        uint256 usdcDeposit,
        uint256 terminationTimestamp,
        uint256 userTimeout,
        address refundAccount,
        bytes32 codehash,
        bytes codeInputs,
        uint256 startTime
    );

    event JobSubsResponded(
        uint256 indexed jobSubsId,
        bytes output,
        uint256 totalTime,
        uint256 errorCode,
        bool success,
        uint256 currentRuns,
        uint256 lastRunTimestamp
    );

    event JobSubscriptionDeposited(
        uint256 indexed jobSubsId,
        address indexed depositor,
        uint256 usdcDeposit,
        uint256 callbackDeposit
    );

    event JobSubscriptionWithdrawn(
        uint256 indexed jobSubsId,
        address indexed withdrawer,
        uint256 usdcAmountWithdrawn,
        uint256 callbackAmountWithdrawn,
        bool success
    );

    event JobSubsJobParamsUpdated(
        uint256 indexed jobSubsId,
        bytes32 _codehash,
        bytes _codeInputs
    );

    event JobSubsTerminationParamsUpdated(
        uint256 indexed jobSubsId,
        // uint256 maxRuns,
        uint256 terminationTimestamp
    );

    error InvalidJobSubscription();
    error RelayInsufficientUsdcDeposit();
    error InvalidTerminationTimestamp();

    //-------------------------------- internal functions start --------------------------------//

    function _startJobSubscription(
        bytes32 _codehash,
        bytes calldata _codeInputs,
        uint256 _userTimeout,
        uint256 _maxGasPrice,
        address _refundAccount,
        address _callbackContract,
        uint256 _callbackGasLimit,
        uint256 _periodicGap,
        uint256 _usdcDeposit,
        uint256 _terminationTimestamp
    ) internal {
        // TODO: Can _terminationTimestamp = 0 and _maxRuns = 0 while starting subscription??

        if (_userTimeout <= GLOBAL_MIN_TIMEOUT || _userTimeout >= GLOBAL_MAX_TIMEOUT) 
            revert RelayInvalidUserTimeout();

        if (_maxGasPrice < tx.gasprice) 
            revert RelayInsufficientMaxGasPrice();

        uint256 totalRuns = (_terminationTimestamp - block.timestamp) / _periodicGap;
        if (_maxGasPrice * (_callbackGasLimit + FIXED_GAS + CALLBACK_MEASURE_GAS) * totalRuns > msg.value)
            revert RelayInsufficientCallbackDeposit();

        uint256 minUsdcDeposit = (_userTimeout * EXECUTION_FEE_PER_MS + GATEWAY_FEE_PER_JOB) * totalRuns;
        if(_usdcDeposit < minUsdcDeposit)
            revert RelayInsufficientUsdcDeposit();

        Job memory job = Job({
            startTime: block.timestamp,
            maxGasPrice: _maxGasPrice,
            usdcDeposit: _usdcDeposit,
            callbackDeposit: msg.value,
            jobOwner: _msgSender(),
            codehash: _codehash,
            codeInputs: _codeInputs,
            callbackContract: _callbackContract,
            callbackGasLimit: _callbackGasLimit
        });

        _createJobSubscription(
            job,
            _userTimeout,
            _refundAccount,
            _periodicGap,
            _terminationTimestamp
        );

        // deposit escrow amount(USDC) for the periodic jobs
        TOKEN.safeTransferFrom(_msgSender(), address(this), _usdcDeposit);
    }

    function _createJobSubscription(
        Job memory _job,
        uint256 _userTimeout,
        address _refundAccount,
        uint256 _periodicGap,
        uint256 _terminationTimestamp
    ) internal {
        jobSubscriptions[++jobSubsCount] = JobSubscription({
            periodicGap: _periodicGap,
            terminationTimestamp: _terminationTimestamp,
            currentRuns: 0,
            lastRunTimestamp: 0,
            userTimeout: _userTimeout,
            refundAccount: _refundAccount,
            job: _job
        });

        emit JobSubscriptionStarted(
            jobSubsCount,
            _msgSender(),
            _periodicGap,
            _job.usdcDeposit,
            _terminationTimestamp,
            _userTimeout,
            _refundAccount,
            _job.codehash,
            _job.codeInputs,
            block.timestamp
        );
    }

    function _jobSubsResponse(
        bytes calldata _signature,
        uint256 _jobSubsId,
        bytes calldata _output,
        uint256 _totalTime,
        uint8 _errorCode,
        uint256 _signTimestamp
    ) internal {
        Job memory job = jobSubscriptions[_jobSubsId].job;
        if (job.jobOwner == address(0)) 
            revert InvalidJobSubscription();

        // check time case
        // if (block.timestamp > job.startTime + OVERALL_TIMEOUT) revert RelayOverallTimeoutOver();

        // signature check
        // this gateway sign verification func can be reused, just need to replace jobId with jobSubsId
        address enclaveAddress = _verifyJobResponseSign(
            _signature,
            _jobSubsId,
            _output,
            _totalTime,
            _errorCode,
            _signTimestamp
        );

        jobSubscriptions[_jobSubsId].currentRuns += 1;
        jobSubscriptions[_jobSubsId].lastRunTimestamp = block.timestamp;

        _releaseJobSubsEscrowAmount(enclaveAddress, _totalTime, job.usdcDeposit);

        (bool success, uint256 callbackGas) = _callBackWithLimit(
            _jobSubsId,
            job,
            _output,
            _errorCode
        );

        // TODO: FIXED_GAS will be different for this function
        uint256 callbackCost = (callbackGas + FIXED_GAS) * tx.gasprice;

        _releaseJobSubsGasCostOnSuccess(gatewayOwners[enclaveAddress], job.callbackDeposit, callbackCost);

        uint256 currentRuns = jobSubscriptions[_jobSubsId].currentRuns;
        emit JobSubsResponded(
            _jobSubsId,
            _output,
            _totalTime,
            _errorCode,
            success,
            currentRuns,
            block.timestamp
        );
    }

    function _releaseJobSubsEscrowAmount(
        address _enclaveAddress,
        uint256 _totalTime,
        uint256 _usdcDeposit
    ) internal {
        uint256 gatewayPayoutUsdc;
        uint256 jobOwnerPayoutUsdc;
        unchecked {
            gatewayPayoutUsdc = _totalTime * EXECUTION_FEE_PER_MS + GATEWAY_FEE_PER_JOB;
            jobOwnerPayoutUsdc = _usdcDeposit - gatewayPayoutUsdc;
        }

        // release escrow to gateway
        TOKEN.safeTransfer(gatewayOwners[_enclaveAddress], gatewayPayoutUsdc);

        jobSubscriptions[jobSubsCount].job.usdcDeposit = jobOwnerPayoutUsdc;
    }

    function _releaseJobSubsGasCostOnSuccess(
        address _gatewayOwner,
        uint256 _callbackDeposit,
        uint256 _callbackCost
    ) internal {
        // TODO: If paySuccess is false then deposit will be stucked forever. Find a way out.
        // transfer callback cost to gateway
        _callbackCost = _callbackCost > _callbackDeposit ? _callbackDeposit : _callbackCost;
        (bool paySuccess, ) = _gatewayOwner.call{value: _callbackCost}("");

        // transfer remaining native asset to the jobOwner
        jobSubscriptions[jobSubsCount].job.callbackDeposit -= _callbackCost;
    }

    function _depositForJobSubscription(
        uint256 _jobSubsId,
        uint256 _usdcDeposit
    ) internal {
        if(jobSubscriptions[_jobSubsId].job.jobOwner == address(0))
            revert InvalidJobSubscription();

        _depositTokens(_jobSubsId, _usdcDeposit);
    }

    function _depositTokens(
        uint256 _jobSubsId,
        uint256 _usdcDeposit
    ) internal {
        TOKEN.safeTransferFrom(_msgSender(), address(this), _usdcDeposit);

        jobSubscriptions[_jobSubsId].job.usdcDeposit += _usdcDeposit;
        jobSubscriptions[_jobSubsId].job.callbackDeposit += msg.value;
        emit JobSubscriptionDeposited(_jobSubsId, _msgSender(), _usdcDeposit, msg.value);
    }

    // function withdrawTokenForJob(
    //     uint256 _jobSubsId,
    //     uint256 _usdcAmount,
    //     uint256 _callbackAmount
    // ) external {
    //     if(jobSubscriptions[_jobSubsId].job.jobOwner == address(0))
    //         revert InvalidJobSubscription();

    //     jobSubscriptions[_jobSubsId].job.usdcDeposit -= _usdcAmount;
    //     jobSubscriptions[_jobSubsId].job.callbackDeposit -= _callbackAmount;
    //     TOKEN.safeTransfer(_msgSender(), _usdcAmount);
    //     // TODO: do we need to check this bool success
    //     (bool success, ) = _msgSender().call{value: _callbackAmount}("");

    //     emit JobSubscriptionWithdrawn(_jobSubsId, _msgSender(), _usdcAmount, _callbackAmount, success);
    // }

    function _updateJobParams(
        uint256 _jobSubsId,
        bytes32 _codehash,
        bytes calldata _codeInputs
    ) internal {
        if(jobSubscriptions[_jobSubsId].job.jobOwner == address(0))
            revert InvalidJobSubscription();

        jobSubscriptions[_jobSubsId].job.codehash = _codehash;
        jobSubscriptions[_jobSubsId].job.codeInputs = _codeInputs;

        emit JobSubsJobParamsUpdated(_jobSubsId, _codehash, _codeInputs);
    }

    function _updateJobTerminationParams(
        uint256 _jobSubsId,
        // uint256 _maxRuns,
        uint256 _terminationTimestamp,
        uint256 _usdcDeposit
    ) internal {
        if(jobSubscriptions[_jobSubsId].job.jobOwner == address(0))
            revert InvalidJobSubscription();

        if(_terminationTimestamp <= block.timestamp + OVERALL_TIMEOUT)
            revert InvalidTerminationTimestamp();

        _depositTokens(_jobSubsId, _usdcDeposit);

        JobSubscription memory jobSubs = jobSubscriptions[_jobSubsId];
        uint256 remainingRuns = (_terminationTimestamp - block.timestamp) / jobSubs.periodicGap;

        if (jobSubs.job.maxGasPrice * (jobSubs.job.callbackGasLimit + FIXED_GAS + CALLBACK_MEASURE_GAS) * remainingRuns > jobSubs.job.callbackDeposit)
            revert RelayInsufficientCallbackDeposit();

        uint256 minUsdcDeposit = (jobSubs.userTimeout * EXECUTION_FEE_PER_MS + GATEWAY_FEE_PER_JOB) * remainingRuns;
        if(jobSubs.job.usdcDeposit < minUsdcDeposit)
            revert RelayInsufficientUsdcDeposit();

        jobSubscriptions[_jobSubsId].terminationTimestamp = _terminationTimestamp;

        emit JobSubsTerminationParamsUpdated(_jobSubsId, _terminationTimestamp);
    }

    //-------------------------------- internal functions end --------------------------------//

    //-------------------------------- external functions start --------------------------------//

    /**
     * @notice Starts a subscription for periodic job execution.
     * @dev The subscription parameters are validated, and the necessary deposits(USDC+ETH) are made.
     * @param _codehash The transaction hash storing the code to be executed periodically.
     * @param _codeInputs The encrypted inputs to the code to be executed periodically.
     * @param _userTimeout The maximum execution time allowed for each job in milliseconds.
     * @param _maxGasPrice The maximum gas price the subscriber is willing to pay to get back the job response.
     * @param _refundAccount The account to receive any remaining/slashed tokens.
     * @param _callbackContract The contract address to be called upon submitting job response.
     * @param _callbackGasLimit The gas limit for the callback function.
     * @param _periodicGap The time gap between each job relay in milliseconds.
     * @param _usdcDeposit The amount of USDC to be deposited for the subscription.
     * @param _terminationTimestamp The timestamp after which no further jobs are relayed.
     */
    function startJobSubscription(
        bytes32 _codehash,
        bytes calldata _codeInputs,
        uint256 _userTimeout,
        uint256 _maxGasPrice,
        address _refundAccount,
        address _callbackContract,
        uint256 _callbackGasLimit,
        uint256 _periodicGap,
        uint256 _usdcDeposit,
        uint256 _terminationTimestamp
    ) external payable {
        _startJobSubscription(
            _codehash,
            _codeInputs,
            _userTimeout,
            _maxGasPrice,
            _refundAccount,
            _callbackContract,
            _callbackGasLimit,
            _periodicGap,
            _usdcDeposit,
            _terminationTimestamp
        );
    }

    /**
     * @notice Function for the gateway to respond to a periodic job within a subscription.
     * @dev The response includes output data, execution time, and error code.
     * @param _signature The signature of the gateway enclave verifying the job response.
     * @param _jobSubsId The unique identifier of the job subscription.
     * @param _output The output data from the job execution.
     * @param _totalTime The total time taken for job execution in milliseconds.
     * @param _errorCode The error code returned from the job execution.
     * @param _signTimestamp The timestamp at which the response was signed by the enclave.
     */
    function jobSubsResponse(
        bytes calldata _signature,
        uint256 _jobSubsId,
        bytes calldata _output,
        uint256 _totalTime,
        uint8 _errorCode,
        uint256 _signTimestamp
    ) external {
        _jobSubsResponse(_signature, _jobSubsId, _output, _totalTime, _errorCode, _signTimestamp);
    }

    /**
     * @notice Deposits additional USDC and native assets(ETH) for a job subscription.
     * @dev This function allows the subscriber to top up their subscription balance.
     * @param _jobSubsId The unique identifier of the job subscription.
     * @param _usdcDeposit The amount of USDC to be deposited.
     */
    function depositForJobSubscription(
        uint256 _jobSubsId,
        uint256 _usdcDeposit
    ) external payable {
        _depositForJobSubscription(_jobSubsId, _usdcDeposit);
    }

    /**
     * @notice Updates the job parameters for a specific job subscription.
     * @dev This function allows the subscriber to modify the job execution code and input parameters
     *      for an existing subscription. The new parameters will be used in subsequent
     *      job executions within the subscription.
     * @param _jobSubsId The unique identifier of the job subscription to be updated.
     * @param _codehash The new transaction hash storing the code that will be executed by the enclave.
     * @param _codeInputs The new encrypted input parameters for the code to be executed.
     */
    function updateJobParams(
        uint256 _jobSubsId,
        bytes32 _codehash,
        bytes calldata _codeInputs
    ) external {
        _updateJobParams(_jobSubsId, _codehash, _codeInputs);
    }

    /**
     * @notice Updates the termination parameters for a specific job subscription.
     * @dev This function allows the subscriber to modify the termination time associated with an 
     *      existing job subscription. It means user might have to deposit additional USDC+ETH if 
     *      termination time is increased, and enought funds weren't deposited initially.
     * @param _jobSubsId The unique identifier of the job subscription to be updated.
     * @param _terminationTimestamp The new timestamp (in seconds) when the job subscription will terminate.
     * @param _usdcDeposit The additional amount of USDC to be deposited.
     */
    function updateJobTerminationParams(
        uint256 _jobSubsId,
        uint256 _terminationTimestamp,
        uint256 _usdcDeposit
    ) external payable {
        _updateJobTerminationParams(_jobSubsId, _terminationTimestamp, _usdcDeposit);
    }

    //-------------------------------- external functions end --------------------------------//

    //-------------------------------- Job Subscription End --------------------------------//
}
