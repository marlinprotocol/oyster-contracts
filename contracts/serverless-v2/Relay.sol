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
        uint256 _gatewayFeePerJob
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
        bytes memory PCR0,
        bytes memory PCR1,
        bytes memory PCR2
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
        bytes memory _signature,
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
        bytes memory _signature,
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
        bytes memory _signature,
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
        address jobOwner;
        bytes32 codehash;
        bytes codeInputs;
        address callbackContract;
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
        uint256 startTime
    );


    event JobResponded(uint256 indexed jobId, bytes output, uint256 totalTime, uint256 errorCode, bool success);

    event JobCancelled(uint256 indexed jobId);

    error RelayInvalidUserTimeout();
    error RelayJobNotExists();
    error RelayOverallTimeoutOver();
    error RelayInvalidJobOwner();
    error RelayOverallTimeoutNotOver();
    error RelayCallbackDepositTransferFailed();

    //-------------------------------- internal functions start -------------------------------//

    function _relayJob(
        bytes32 _codehash,
        bytes memory _codeInputs,
        uint256 _userTimeout, // in milliseconds
        uint256 _maxGasPrice,
        uint256 _callbackDeposit,
        address _refundAccount,
        address _callbackContract,
        address _jobOwner
    ) internal {
        if (_userTimeout <= GLOBAL_MIN_TIMEOUT || _userTimeout >= GLOBAL_MAX_TIMEOUT) revert RelayInvalidUserTimeout();

        if (jobCount + 1 == (block.chainid + 1) << 192) jobCount = block.chainid << 192;

        uint256 usdcDeposit = _userTimeout * EXECUTION_FEE_PER_MS + GATEWAY_FEE_PER_JOB;
        jobs[++jobCount] = Job({
            startTime: block.timestamp,
            maxGasPrice: _maxGasPrice,
            usdcDeposit: usdcDeposit,
            callbackDeposit: _callbackDeposit,
            jobOwner: _jobOwner,
            codehash: _codehash,
            codeInputs: _codeInputs,
            callbackContract: _callbackContract
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
            block.timestamp
        );
    }

    function _jobResponse(
        bytes memory _signature,
        uint256 _jobId,
        bytes memory _output,
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

        (bool success, uint callbackCost) = _callBackWithLimit(
            _jobId, job.jobOwner, job.callbackContract, job.callbackDeposit, job.codehash, job.codeInputs, _output, _errorCode
        );

        _releaseGasCostOnSuccess(gatewayOwners[enclaveAddress], job.jobOwner, job.callbackDeposit, callbackCost);
        emit JobResponded(_jobId, _output, _totalTime, _errorCode, success);
    }

    function _verifyJobResponseSign(
        bytes memory _signature,
        uint256 _jobId,
        bytes memory _output,
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
        uint256 gatewayPayoutUsdc = _totalTime * EXECUTION_FEE_PER_MS + GATEWAY_FEE_PER_JOB;
        uint256 jobOwnerPayoutUsdc = _usdcDeposit - gatewayPayoutUsdc;

        // release escrow to gateway
        TOKEN.safeTransfer(gatewayOwners[_enclaveAddress], gatewayPayoutUsdc);
        // release escrow to jobOwner
        TOKEN.safeTransfer(_jobOwner, jobOwnerPayoutUsdc);
    }

    function _jobCancel(uint256 _jobId, address _jobOwner) internal {
        if (jobs[_jobId].jobOwner != _jobOwner) revert RelayInvalidJobOwner();

        // check time case
        if (block.timestamp <= jobs[_jobId].startTime + OVERALL_TIMEOUT) revert RelayOverallTimeoutNotOver();

        uint256 callbackDeposit = jobs[_jobId].callbackDeposit;
        uint256 usdcDeposit = jobs[_jobId].usdcDeposit;
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
        address _jobOwner,
        address _callbackContract,
        uint256 _callbackDeposit,
        bytes32 _codehash,
        bytes memory _codeInputs,
        bytes memory _output,
        uint8 _errorCode
    ) internal returns (bool, uint) {
        uint startGas = gasleft();
        (bool success, ) = _callbackContract.call(
            abi.encodeWithSignature(
                "oysterResultCall(uint256,address,bytes32,bytes,bytes,uint8)",
                _jobId, _jobOwner, _codehash, _codeInputs, _output, _errorCode
            )
        );

        // calculate callback cost
        uint callbackCost = (startGas - gasleft()) * tx.gasprice;
        return (success, callbackCost);
    }

    function _releaseGasCostOnSuccess(
        address _gatewayOwner,
        address _jobOwner,
        uint256 _callbackDeposit,
        uint256 _callbackCost
    ) internal {
        // TODO: If paySuccess is false then deposit will be stucked forever. Find a way out.
        // transfer callback cost to gateway
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
        address _callbackContract
    ) external payable {
        _relayJob(_codehash, _codeInputs, _userTimeout, _maxGasPrice, msg.value, _refundAccount, _callbackContract, _msgSender());
    }

    function jobResponse(
        bytes memory _signature,
        uint256 _jobId,
        bytes memory _output,
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
}
