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
import "./SecretStore.sol";

/**
 * @title SecretManager Contract
 * @notice Manages the registration, staking, and job assignment of execution nodes.
 * @dev This contract is upgradeable and uses the UUPS (Universal Upgradeable Proxy Standard) pattern.
 */
contract SecretManager is
    Initializable, // initializer
    ContextUpgradeable, // _msgSender, _msgData
    ERC165Upgradeable, // supportsInterface
    AccessControlUpgradeable,
    UUPSUpgradeable // public upgrade
{
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;

    /// @notice Thrown when the provided ERC20 token address is zero.
    error SecretManagerZeroAddressUsdcToken();

    /**
     * @dev Initializes the logic contract without any admins, safeguarding against takeover.
     * @param attestationVerifier The attestation verifier contract.
     * @param maxAge Maximum age for attestations.
     * @param _token The ERC20 token used for staking.
     * @param _minStakeAmount Minimum stake amount required.
     * @param _slashPercentInBips Slashing percentage in basis points.
     * @param _slashMaxBips Maximum basis points for slashing.
     */
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(
        IERC20 _usdcToken,
        uint256 _noOfNodesToSelect,
        uint256 _globalMaxStoreSize,
        uint256 _globalMinStoreDuration,
        uint256 _globalMaxStoreDuration,
        uint256 _acknowledgementTimeout,
        uint256 _markAliveTimeout,
        uint256 _secretStoreFeeRate,
        address _stakingPaymentPool,
        address _secretStoreAddress
    ) {
        _disableInitializers();

        if (address(_usdcToken) == address(0)) revert SecretManagerZeroAddressUsdcToken();

        USDC_TOKEN = _usdcToken;
        NO_OF_NODES_TO_SELECT = _noOfNodesToSelect;

        // TODO: add checks
        GLOBAL_MAX_STORE_SIZE = _globalMaxStoreSize;
        GLOBAL_MIN_STORE_DURATION = _globalMinStoreDuration;
        GLOBAL_MAX_STORE_DURATION = _globalMaxStoreDuration;
        ACKNOWLEDGEMENT_TIMEOUT = _acknowledgementTimeout;
        MARK_ALIVE_TIMEOUT = _markAliveTimeout;
        SECRET_STORE_FEE_RATE = _secretStoreFeeRate;
        STAKING_PAYMENT_POOL = _stakingPaymentPool;
        SECRET_STORE = SecretStore(_secretStoreAddress);
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

    /// @notice Thrown when the provided admin address is zero.
    error SecretManagerZeroAddressAdmin();

    /**
     * @dev Initializes the contract with the given admin.
     * @param _admin The address of the admin.
     */
    function initialize(address _admin) public initializer {
        if (_admin == address(0)) revert SecretManagerZeroAddressAdmin();

        __Context_init_unchained();
        __ERC165_init_unchained();
        __AccessControl_init_unchained();
        __UUPSUpgradeable_init_unchained();

        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
    }

    //-------------------------------- Initializer end --------------------------------//

    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    IERC20 public immutable USDC_TOKEN;

    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    uint256 public immutable NO_OF_NODES_TO_SELECT;

    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    uint256 public immutable GLOBAL_MAX_STORE_SIZE;

    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    uint256 public immutable GLOBAL_MIN_STORE_DURATION;

    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    uint256 public immutable GLOBAL_MAX_STORE_DURATION;

    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    uint256 public immutable ACKNOWLEDGEMENT_TIMEOUT;

    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    uint256 public immutable MARK_ALIVE_TIMEOUT;

    /// @notice Fee rate per unit size per second per secret store.
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    uint256 public immutable SECRET_STORE_FEE_RATE;

    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    address public immutable STAKING_PAYMENT_POOL;

    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    SecretStore public immutable SECRET_STORE;

    //------------------------------------ SecretManager start -----------------------------------//

    bytes32 private constant DOMAIN_SEPARATOR =
        keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version)"),
                keccak256("marlin.oyster.SecretManager"),
                keccak256("1")
            )
        );

    bytes32 private constant ACKNOWLEDGE_TYPEHASH =
        keccak256("Acknowledge(uint256 secretId,uint256 signTimestamp)");

    bytes32 private constant ALIVE_TYPEHASH =
        keccak256("Alive(uint256 signTimestamp)");

    /// @notice Thrown when the signature timestamp has expired.
    error SecretManagerSignatureTooOld();

    struct SelectedEnclave {
        address enclaveAddress;
        bool hasAcknowledgedStore;
        uint256 selectTimestamp;
    }

    struct UserStorage {
        address owner;
        uint256 sizeLimit;
        uint256 usdcDeposit;
        uint256 startTimestamp;
        uint256 endTimestamp;
        uint256 lastUsdcUpdateTimestamp;
        SelectedEnclave[] selectedEnclaves;
    }

    // secretId => user store data
    mapping(uint256 => UserStorage) public userStorage;

    uint256 public secretId;

    event SecretCreated(
        uint256 indexed secretId,
        address indexed owner,
        uint256 sizeLimit,
        uint256 endTimestamp,
        uint256 usdcDeposit,
        address[] selectedEnclaves
    );

    event SecretStoreAcknowledgementSuccess(
        uint256 indexed secretId,
        address indexed enclaveAddress
    );

    event SecretStoreAcknowledgementFailed(
        uint256 indexed secretId
    );

    event SecretStoreAlive(
        address indexed enclaveAddress
    );

    event SecretStoreDead(
        uint256 indexed secretId,
        address indexed prevEnclaveAddress,
        address indexed newEnclaveAddress
    );

    event SecretResourceUnavailable(
        uint256 indexed secretId
    );

    event SecretEndTimestampUpdated(
        uint256 indexed secretId,
        uint256 endTimestamp
    );

    event SecretTerminated(
        uint256 indexed secretId
    );

    error SecretManagerInsufficientUsdcDeposit();
    error SecretManagerInvalidSizeLimit();
    error SecretManagerInvalidEndTimestamp();
    error SecretManagerUnavailableResources();
    error SecretManagerAcknowledgementTimeOver();
    error SecretManagerAcknowledgementTimeoutPending(address enclaveAddress);
    error SecretManagerAcknowledgedAlready();
    error SecretManagerMarkAliveTimeoutOver();
    error SecretManagerUnacknowledged();
    error SecretManagerEnclaveNotFound();
    error SecretManagerStoreIsAlive();
    error SecretManagerNotUserStoreOwner();
    error SecretManagerAlreadyTerminated();

    //-------------------------------- internal functions start ----------------------------------//

    function _createSecret(
        uint256 _sizeLimit,
        uint256 _endTimestamp,
        uint256 _usdcDeposit,
        address _owner
    ) internal {
        if(_sizeLimit == 0 || _sizeLimit > GLOBAL_MAX_STORE_SIZE)
            revert SecretManagerInvalidSizeLimit();

        if ((_endTimestamp < block.timestamp + GLOBAL_MIN_STORE_DURATION) || (_endTimestamp > block.timestamp + GLOBAL_MAX_STORE_DURATION)) 
            revert SecretManagerInvalidEndTimestamp();

        // TODO: how to calculate usdcDeposit
        uint256 minUsdcDeposit = (_endTimestamp - block.timestamp) * _sizeLimit * SECRET_STORE_FEE_RATE * NO_OF_NODES_TO_SELECT;
        _checkUsdcDeposit(_usdcDeposit, minUsdcDeposit);

        USDC_TOKEN.safeTransferFrom(_owner, address(this), _usdcDeposit);

        SelectedEnclave[] memory selectedEnclaves = SECRET_STORE.selectEnclaves(NO_OF_NODES_TO_SELECT, _sizeLimit);
        if (selectedEnclaves.length < NO_OF_NODES_TO_SELECT)
            revert SecretManagerUnavailableResources();

        uint256 id = ++secretId;
        userStorage[id].owner = _owner;
        userStorage[id].sizeLimit = _sizeLimit;
        userStorage[id].usdcDeposit = _usdcDeposit;
        userStorage[id].startTimestamp = block.timestamp;
        userStorage[id].endTimestamp = _endTimestamp;
        userStorage[id].lastUsdcUpdateTimestamp = block.timestamp;

        uint len = selectedEnclaves.length;
        address[] memory enclaveAddresses = new address[](len);
        for (uint256 index = 0; index < len; index++) {
            // cannot allocate memory array directly to storage var
            userStorage[id].selectedEnclaves.push(selectedEnclaves[index]);
            enclaveAddresses[index] = selectedEnclaves[index].enclaveAddress;
        }

        emit SecretCreated(secretId, _owner, _sizeLimit, _endTimestamp, _usdcDeposit, enclaveAddresses);
    }

    function _checkUsdcDeposit(
        uint256 _usdcDeposit,
        uint256 _minUsdcDeposit
    ) internal pure {
        if(_usdcDeposit < _minUsdcDeposit)
            revert SecretManagerInsufficientUsdcDeposit();
    }

    function _acknowledgeStore(
        uint256 _secretId,
        uint256 _signTimestamp,
        bytes memory _signature
    ) internal {
        address enclaveAddress = _verifyAcknowledgementSign(_secretId, _signTimestamp, _signature);

        uint256 enclaveIndex = _getSelectedEnclaveIndex(_secretId, enclaveAddress);
        if(block.timestamp > userStorage[_secretId].selectedEnclaves[enclaveIndex].selectTimestamp + ACKNOWLEDGEMENT_TIMEOUT)
            revert SecretManagerAcknowledgementTimeOver();

        userStorage[_secretId].selectedEnclaves[enclaveIndex].hasAcknowledgedStore = true;

        emit SecretStoreAcknowledgementSuccess(_secretId, enclaveAddress);
    }

    function _verifyAcknowledgementSign(
        uint256 _secretId,
        uint256 _signTimestamp,
        bytes memory _signature
    ) internal view returns(address signer) {
        _checkSignValidity(_signTimestamp);

        bytes32 hashStruct = keccak256(abi.encode(ACKNOWLEDGE_TYPEHASH, _secretId, _signTimestamp));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, hashStruct));
        signer = digest.recover(_signature);

        SECRET_STORE.allowOnlyVerified(signer);
    }

    function _checkSignValidity(uint256 _signTimestamp) internal view {
        if (block.timestamp > _signTimestamp + SECRET_STORE.ATTESTATION_MAX_AGE())
            revert SecretManagerSignatureTooOld();
    }

    function _getSelectedEnclaveIndex(
        uint256 _secretId,
        address _enclaveAddress
    ) internal view returns (uint256) {
        uint256 len = userStorage[_secretId].selectedEnclaves.length;
        for (uint256 index = 0; index < len; index++) {
            if(userStorage[_secretId].selectedEnclaves[index].enclaveAddress == _enclaveAddress)
                return index;
        }
        revert SecretManagerEnclaveNotFound();
    }

    function _acknowledgeStoreFailed(
        uint256 _secretId
    ) internal {
        UserStorage memory userStoreData = userStorage[_secretId];
        bool ackFailed;
        uint256 len = userStoreData.selectedEnclaves.length;
        for (uint256 index = 0; index < len; index++) {
            if(block.timestamp <= userStoreData.selectedEnclaves[index].selectTimestamp + ACKNOWLEDGEMENT_TIMEOUT)
                revert SecretManagerAcknowledgementTimeoutPending(userStoreData.selectedEnclaves[index].enclaveAddress);

            if(!userStoreData.selectedEnclaves[index].hasAcknowledgedStore)
                ackFailed = true;

            SECRET_STORE.releaseEnclave(userStoreData.selectedEnclaves[index].enclaveAddress, userStoreData.sizeLimit);
        }

        if(!ackFailed)
            revert SecretManagerAcknowledgedAlready();

        delete userStorage[_secretId];
        USDC_TOKEN.safeTransfer(userStoreData.owner, userStoreData.usdcDeposit);

        emit SecretStoreAcknowledgementFailed(_secretId);
    }

    function _markStoreAlive(
        uint256 _signTimestamp,
        bytes memory _signature
    ) internal {
        address enclaveAddress = _verifyStoreAliveSign(_signTimestamp, _signature);

        ( ,uint256 storageOccupied, , uint256 lastAliveTimestamp, address owner, ) = SECRET_STORE.secretStorage(enclaveAddress);
        SECRET_STORE.updateLastAliveTimestamp(enclaveAddress, _signTimestamp);

        uint256 usdcPayment = (block.timestamp - lastAliveTimestamp) * storageOccupied * SECRET_STORE_FEE_RATE;
        USDC_TOKEN.safeTransfer(owner, usdcPayment);

        emit SecretStoreAlive(enclaveAddress);
    }

    function _verifyStoreAliveSign(
        uint256 _signTimestamp,
        bytes memory _signature
    ) internal view returns(address signer) {
        _checkSignValidity(_signTimestamp);

        bytes32 hashStruct = keccak256(abi.encode(ALIVE_TYPEHASH, _signTimestamp));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, hashStruct));
        signer = digest.recover(_signature);

        SECRET_STORE.allowOnlyVerified(signer);
    }

    function _markStoreDead(
        address _enclaveAddress,
        uint256[] memory _secretIds
    ) internal {
        // FIX: get store data
        ( , , , uint256 lastAliveTimestamp, , ) = SECRET_STORE.secretStorage(_enclaveAddress);
        if(block.timestamp <= lastAliveTimestamp + MARK_ALIVE_TIMEOUT)
            revert SecretManagerStoreIsAlive();

        for (uint256 index = 0; index < _secretIds.length; index++) {
            uint256 enclaveIndex = _getSelectedEnclaveIndex(_secretIds[index], _enclaveAddress);
            _markEnclaveDead(_secretIds[index], _enclaveAddress, enclaveIndex);
        }

        SECRET_STORE.updateLastAliveTimestamp(_enclaveAddress, block.timestamp);
    }

    function _markEnclaveDead(
        uint256 _secretId,
        address _enclaveAddress,
        uint256 _enclaveIndex
    ) internal {
        if(!userStorage[_secretId].selectedEnclaves[_enclaveIndex].hasAcknowledgedStore)
            return;

        uint256 noOfSelectedEnclaves = userStorage[_secretId].selectedEnclaves.length;
        _updateUsdcDeposit(_secretId, noOfSelectedEnclaves);

        // case for when the termination condition is reached, we won't select any new enclave
        if(block.timestamp > userStorage[_secretId].endTimestamp) {
            _removeSelectedEnclave(_secretId, _enclaveIndex);
            if(userStorage[_secretId].selectedEnclaves.length == 0)
                _refundExcessDepositAndRemoveStore(_secretId);
        }
        // case for when the termination condition is pending, we will try to select a new enclave in place of the dead enclave
        else {
            SelectedEnclave[] memory selectedEnclaves = SECRET_STORE.selectEnclaves(1, userStorage[_secretId].sizeLimit);
            // case for when a new enclave can't be selected as they all are already occupied to their max storage capacity
            if (selectedEnclaves.length == 0) {
                _removeSelectedEnclave(_secretId, _enclaveIndex);
                emit SecretResourceUnavailable(_secretId);
            }
            // case for when a newly selected enclave will replace the dead enclave
            else {
                userStorage[_secretId].selectedEnclaves[_enclaveIndex] = SelectedEnclave({
                    enclaveAddress: selectedEnclaves[0].enclaveAddress,
                    hasAcknowledgedStore: false,
                    selectTimestamp: selectedEnclaves[0].selectTimestamp
                });
            }

            emit SecretStoreDead(
                _secretId,
                _enclaveAddress, 
                selectedEnclaves.length != 0 ? selectedEnclaves[0].enclaveAddress : address(0)
            );
        }

        // TODO: slash prev enclave(who's recipient)
        SECRET_STORE.slashEnclave(_enclaveAddress, userStorage[_secretId].sizeLimit, STAKING_PAYMENT_POOL);
    }

    function _updateUsdcDeposit(
        uint256 _secretId,
        uint256 _noOfSelectedEnclaves
    ) internal {
        uint256 endTime;
        if(block.timestamp > userStorage[_secretId].endTimestamp)
            endTime = userStorage[_secretId].endTimestamp;
        else
            endTime = block.timestamp;

        uint256 usdcPaid = (endTime - userStorage[_secretId].lastUsdcUpdateTimestamp) * userStorage[_secretId].sizeLimit * SECRET_STORE_FEE_RATE * _noOfSelectedEnclaves;
        userStorage[_secretId].usdcDeposit -= usdcPaid;
        userStorage[_secretId].lastUsdcUpdateTimestamp = endTime;
    }

    function _removeSelectedEnclave(
        uint256 _secretId,
        uint256 _index
    ) internal {
        uint256 len = userStorage[_secretId].selectedEnclaves.length;
        if(_index != len - 1)
            userStorage[_secretId].selectedEnclaves[_index] = userStorage[_secretId].selectedEnclaves[len - 1];
        userStorage[_secretId].selectedEnclaves.pop();
    }

    function _refundExcessDepositAndRemoveStore(
        uint256 _secretId
    ) internal {
        address owner = userStorage[_secretId].owner;
        uint256 remainingDeposit = userStorage[_secretId].usdcDeposit;
        delete userStorage[_secretId];
        USDC_TOKEN.safeTransfer(owner, remainingDeposit);
    }

    function _updateSecretEndTimestamp(
        uint256 _secretId,
        uint256 _endTimestamp,
        uint256 _usdcDeposit,
        address _owner
    ) internal {
        if(userStorage[_secretId].owner != _owner)
            revert SecretManagerNotUserStoreOwner();

        if(_endTimestamp < block.timestamp)
            revert SecretManagerInvalidEndTimestamp();

        uint256 currentEndTimestamp = userStorage[_secretId].endTimestamp;
        if(block.timestamp > currentEndTimestamp)
            revert SecretManagerAlreadyTerminated();

        _checkIfSecretAcknowledged(_secretId);

        if(_endTimestamp > currentEndTimestamp) {
            USDC_TOKEN.safeTransferFrom(_owner, address(this), _usdcDeposit);
            userStorage[_secretId].usdcDeposit += _usdcDeposit;

            uint256 minUsdcDeposit = (_endTimestamp - userStorage[_secretId].startTimestamp) * userStorage[_secretId].sizeLimit * SECRET_STORE_FEE_RATE * NO_OF_NODES_TO_SELECT;
            _checkUsdcDeposit(userStorage[_secretId].usdcDeposit, minUsdcDeposit);
        }
        else {
            uint256 removedDuration = currentEndTimestamp - _endTimestamp;
            uint256 usdcRefund = removedDuration * userStorage[_secretId].sizeLimit * SECRET_STORE_FEE_RATE * NO_OF_NODES_TO_SELECT;
            
            userStorage[_secretId].usdcDeposit -= usdcRefund;
            USDC_TOKEN.safeTransfer(_owner, usdcRefund);
        }

        userStorage[_secretId].endTimestamp = _endTimestamp;

        emit SecretEndTimestampUpdated(_secretId, _endTimestamp);
    }

    function _checkIfSecretAcknowledged(
        uint256 _secretId
    ) internal view {
        uint256 len = userStorage[_secretId].selectedEnclaves.length;
        for (uint256 index = 0; index < len; index++) {
            if(!userStorage[_secretId].selectedEnclaves[index].hasAcknowledgedStore)
                revert SecretManagerUnacknowledged();
        }
    }

    function _terminateSecret(
        uint256 _secretId
    ) internal {
        uint256 noOfSelectedEnclaves = userStorage[_secretId].selectedEnclaves.length;
        _updateUsdcDeposit(_secretId, noOfSelectedEnclaves);
        _refundExcessDepositAndRemoveStore(_secretId);

        emit SecretTerminated(_secretId);
    }

    //-------------------------------- internal functions end ----------------------------------//

    //------------------------------- external functions start ----------------------------------//

    function createSecret(
        uint256 _sizeLimit,
        uint256 _endTimestamp,
        uint256 _usdcDeposit
    ) external {
        _createSecret(_sizeLimit, _endTimestamp, _usdcDeposit, _msgSender());
    }

    function acknowledgeStore(
        uint256 _secretId,
        uint256 _signTimestamp,
        bytes memory _signature
    ) external {
        _acknowledgeStore(_secretId, _signTimestamp, _signature);
    }

    function acknowledgeStoreFailed(
        uint256 _secretId
    ) external {
        _acknowledgeStoreFailed(_secretId);
    }

    function markStoreAlive(
        uint256 _signTimestamp,
        bytes memory _signature
    ) external {
        _markStoreAlive(_signTimestamp, _signature);
    }

    function markStoreDead(
        address _enclaveAddress,
        uint256[] memory _secretIds
    ) external {
        _markStoreDead(_enclaveAddress, _secretIds);
    }

    function updateSecretEndTimestamp(
        uint256 _secretId,
        uint256 _endTimestamp,
        uint256 _usdcDeposit
    ) external {
        _updateSecretEndTimestamp(_secretId, _endTimestamp, _usdcDeposit, _msgSender());
    }

    function terminateSecret(
        uint256 _secretId
    ) external {
        _terminateSecret(_secretId);
    }

    function getSelectedEnclaves(uint256 _secretId) external view returns (SelectedEnclave[] memory) {
        return userStorage[_secretId].selectedEnclaves;
    }

    //-------------------------------- external functions end ----------------------------------//

    //-------------------------------- SecretManager functions end --------------------------------//
}