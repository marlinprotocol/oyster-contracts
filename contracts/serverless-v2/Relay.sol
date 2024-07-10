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

    /// @custom:oz-upgrades-unsafe-allow constructor
    // initializes the logic contract without any admins
    // safeguard against takeover of the logic contract
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

    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override(ERC165Upgradeable, AccessControlUpgradeable) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    function _authorizeUpgrade(address /*account*/) internal view override onlyRole(DEFAULT_ADMIN_ROLE) {}

    //-------------------------------- Overrides end --------------------------------//

    //-------------------------------- Initializer start --------------------------------//

    error RelayZeroAddressAdmin();

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

    function whitelistEnclaveImage(
        bytes calldata PCR0,
        bytes calldata PCR1,
        bytes calldata PCR2
    ) external onlyRole(DEFAULT_ADMIN_ROLE) returns (bytes32, bool) {
        return _whitelistEnclaveImage(EnclaveImage(PCR0, PCR1, PCR2));
    }

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

    function registerGateway(
        bytes memory _attestationSignature,
        IAttestationVerifier.Attestation memory _attestation,
        bytes calldata _signature,
        uint256 _signTimestamp
    ) external {
        _registerGateway(_attestationSignature, _attestation, _signature, _signTimestamp, _msgSender());
    }

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

    function jobCancel(uint256 _jobId) external {
        _jobCancel(_jobId, _msgSender());
    }

    //-------------------------------- external functions end --------------------------------//

    //-------------------------------- Job End --------------------------------//

    //-------------------------------- Job Subscription Start --------------------------------//

    struct JobSubscription {
        uint256 periodicGap;
        uint256 maxRuns;
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
        uint256 maxRuns,
        uint256 terminationTimestamp,
        uint256 userTimeout,
        address refundAccount
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
        uint256 maxRuns,
        uint256 terminationTimestamp
    );

    error InvalidJobSubscription();
    error RelayInsufficientUsdcDeposit();

    // user will execute this to start job subscription, and internally it will also call relayJob() to relay the first job in this txn only
    function startJobSubscription(
        bytes32 _codehash,
        bytes calldata _codeInputs,
        uint256 _userTimeout,
        uint256 _maxGasPrice,
        address _refundAccount,
        address _callbackContract,
        uint256 _callbackGasLimit,
        // NEW PARAMS
        uint256 _periodicGap,
        uint256 _usdcDeposit,
        uint256 _maxRuns,
        uint256 _terminationTimestamp
    ) external payable {
        // TODO: Can _terminationTimestamp = 0 and _maxRuns = 0 while starting subscription??

        if (_userTimeout <= GLOBAL_MIN_TIMEOUT || _userTimeout >= GLOBAL_MAX_TIMEOUT) 
            revert RelayInvalidUserTimeout();

        if (_maxGasPrice < tx.gasprice) 
            revert RelayInsufficientMaxGasPrice();

        if (_maxGasPrice * (_callbackGasLimit + FIXED_GAS + CALLBACK_MEASURE_GAS) > msg.value)
            revert RelayInsufficientCallbackDeposit();

        uint256 minUsdcDeposit = _userTimeout * EXECUTION_FEE_PER_MS + GATEWAY_FEE_PER_JOB;
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

        jobSubscriptions[++jobSubsCount] = JobSubscription({
            periodicGap: _periodicGap,
            maxRuns: _maxRuns,
            terminationTimestamp: _terminationTimestamp,
            currentRuns: 0,
            lastRunTimestamp: 0,
            userTimeout: _userTimeout,
            refundAccount: _refundAccount,
            job: job
        });

        // deposit escrow amount(USDC) for the periodic jobs
        TOKEN.safeTransferFrom(_msgSender(), address(this), _usdcDeposit);

        // emit JobSubscriptionStarted(jobSubsCount, _msgSender(), _periodicGap, _usdcDeposit, _maxRuns, _terminationTimestamp, _userTimeout, _refundAccount);
    }

    function jobSubsResponse(
        bytes calldata _signature,
        uint256 _jobSubsId,
        bytes calldata _output,
        uint256 _totalTime,
        uint8 _errorCode,
        uint256 _signTimestamp
    ) external {
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
        // emit JobSubsResponded(_jobSubsId, _output, _totalTime, _errorCode, success, jobSubscriptions[_jobSubsId].currentRuns, block.timestamp);
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

        jobSubscriptions[jobSubsCount].job.usdcDeposit += jobOwnerPayoutUsdc;
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
        jobSubscriptions[jobSubsCount].job.callbackDeposit += (_callbackDeposit - _callbackCost);
    }

    function depositTokenForJob(
        uint256 _jobSubsId,
        uint256 _usdcDeposit
    ) external payable {
        if(jobSubscriptions[_jobSubsId].job.jobOwner == address(0))
            revert InvalidJobSubscription();

        TOKEN.safeTransferFrom(_msgSender(), address(this), _usdcDeposit);

        jobSubscriptions[_jobSubsId].job.usdcDeposit += _usdcDeposit;
        jobSubscriptions[_jobSubsId].job.callbackDeposit += msg.value;
        emit JobSubscriptionDeposited(_jobSubsId, _msgSender(), _usdcDeposit, msg.value);
    }

    function withdrawTokenForJob(
        uint256 _jobSubsId,
        uint256 _usdcAmount,
        uint256 _callbackAmount
    ) external {
        if(jobSubscriptions[_jobSubsId].job.jobOwner == _msgSender())
            revert InvalidJobSubscription();

        jobSubscriptions[_jobSubsId].job.usdcDeposit -= _usdcAmount;
        jobSubscriptions[_jobSubsId].job.callbackDeposit -= _callbackAmount;
        TOKEN.safeTransfer(_msgSender(), _usdcAmount);
        // TODO: do we need to check this bool success
        (bool success, ) = _msgSender().call{value: _callbackAmount}("");

        emit JobSubscriptionWithdrawn(_jobSubsId, _msgSender(), _usdcAmount, _callbackAmount, success);
    }

    function updateJobParams(
        uint256 _jobSubsId,
        bytes32 _codehash,
        bytes calldata _codeInputs
    ) external {
        if(jobSubscriptions[_jobSubsId].job.jobOwner == _msgSender())
            revert InvalidJobSubscription();

        jobSubscriptions[_jobSubsId].job.codehash = _codehash;
        jobSubscriptions[_jobSubsId].job.codeInputs = _codeInputs;

        emit JobSubsJobParamsUpdated(_jobSubsId, _codehash, _codeInputs);
    }

    function updateJobTerminationParams(
        uint256 _jobSubsId,
        uint256 _maxRuns,
        uint256 _terminationTimestamp
    ) external {
        if(jobSubscriptions[_jobSubsId].job.jobOwner == _msgSender())
            revert InvalidJobSubscription();

        jobSubscriptions[_jobSubsId].maxRuns = _maxRuns;
        jobSubscriptions[_jobSubsId].terminationTimestamp = _terminationTimestamp;

        emit JobSubsTerminationParamsUpdated(_jobSubsId, _maxRuns, _terminationTimestamp);
    }

    //-------------------------------- Job Subscription End --------------------------------//
}
