// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {ContextUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol";
import {ERC165Upgradeable} from "@openzeppelin/contracts-upgradeable/utils/introspection/ERC165Upgradeable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {LockUpgradeable} from "./lock/LockUpgradeable.sol";

contract MarketV1 is
    Initializable, // initializer
    ContextUpgradeable, // _msgSender, _msgData
    ERC165Upgradeable, // supportsInterface
    AccessControlUpgradeable, // RBAC
    UUPSUpgradeable, // public upgrade
    LockUpgradeable // time locks
{
    // in case we add more contracts in the inheritance chain
    // solhint-disable-next-line var-name-mixedcase
    uint256[500] private __gap_0;

    /// @custom:oz-upgrades-unsafe-allow constructor
    // disable all initializers and reinitializers
    // safeguard against takeover of the logic contract
    constructor() {
        _disableInitializers();
    }

    //-------------------------------- Overrides start --------------------------------//

    error MarketV1CannotRemoveAllAdmins();

    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override(ERC165Upgradeable, AccessControlUpgradeable) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    // solhint-disable-next-line no-empty-blocks
    function _authorizeUpgrade(address /*account*/) internal view override onlyRole(DEFAULT_ADMIN_ROLE) {}

    //-------------------------------- Overrides end --------------------------------//

    //-------------------------------- Initializer start --------------------------------//

    // solhint-disable-next-line var-name-mixedcase
    uint256[50] private __gap_1;

    error MarketV1InitLengthMismatch();

    function initialize(
        address _admin,
        IERC20 _token,
        bytes32[] memory _selectors,
        uint256[] memory _lockWaitTimes
    ) public initializer {
        if (!(_selectors.length == _lockWaitTimes.length)) revert MarketV1InitLengthMismatch();

        __Context_init_unchained();
        __ERC165_init_unchained();
        __AccessControl_init_unchained();
        __UUPSUpgradeable_init_unchained();
        __Lock_init_unchained(_selectors, _lockWaitTimes);

        _grantRole(DEFAULT_ADMIN_ROLE, _admin);

        _updateToken(_token);
    }

    //-------------------------------- Initializer end --------------------------------//

    //-------------------------------- Providers start --------------------------------//

    struct Provider {
        string cp; // url of control plane
    }

    mapping(address => Provider) public providers;

    // solhint-disable-next-line var-name-mixedcase
    uint256[49] private __gap_2;

    error MarketV1ProviderNotFound();
    error MarketV1ProviderAlreadyExists();
    error MarketV1ProviderInvalidCp();

    event ProviderAdded(address indexed provider, string cp);
    event ProviderRemoved(address indexed provider);
    event ProviderUpdatedWithCp(address indexed provider, string newCp);

    function _providerAdd(address _provider, string memory _cp) internal {
        if (!(bytes(providers[_provider].cp).length == 0)) revert MarketV1ProviderAlreadyExists();
        if (!(bytes(_cp).length != 0)) revert MarketV1ProviderInvalidCp();

        providers[_provider] = Provider(_cp);

        emit ProviderAdded(_provider, _cp);
    }

    function _providerRemove(address _provider) internal {
        if (!(bytes(providers[_provider].cp).length != 0)) revert MarketV1ProviderNotFound();

        delete providers[_provider];

        emit ProviderRemoved(_provider);
    }

    function _providerUpdateWithCp(address _provider, string memory _cp) internal {
        if (!(bytes(providers[_provider].cp).length != 0)) revert MarketV1ProviderNotFound();
        if (!(bytes(_cp).length != 0)) revert MarketV1ProviderInvalidCp();

        providers[_provider].cp = _cp;

        emit ProviderUpdatedWithCp(_provider, _cp);
    }

    function providerAdd(string memory _cp) external {
        return _providerAdd(_msgSender(), _cp);
    }

    function providerRemove() external {
        return _providerRemove(_msgSender());
    }

    function providerUpdateWithCp(string memory _cp) external {
        return _providerUpdateWithCp(_msgSender(), _cp);
    }

    //-------------------------------- Providers end --------------------------------//

    //-------------------------------- Jobs start --------------------------------//

    bytes32 public constant RATE_LOCK_SELECTOR = keccak256("RATE_LOCK");

    struct Job {
        bytes metadata;
        address owner;
        address provider;
        uint256 rate;
        uint256 balance;
        uint256 lastSettled;
    }

    mapping(bytes32 => Job) public jobs;
    uint256 public jobIndex;

    IERC20 public token;
    uint256 public constant EXTRA_DECIMALS = 12;

    // solhint-disable-next-line var-name-mixedcase
    uint256[47] private __gap_3;

    error MarketV1JobOnlyOwner();
    error MarketV1JobNotFound();
    error MarketV1JobNotEnoughBalance();
    error MarketV1JobNonZeroRate();
    error MarketV1JobNoRequest();

    event TokenUpdated(IERC20 indexed oldToken, IERC20 indexed newToken);

    event JobOpened(
        bytes32 indexed job,
        bytes metadata,
        address indexed owner,
        address indexed provider,
        uint256 rate,
        uint256 balance,
        uint256 timestamp
    );
    event JobSettled(bytes32 indexed job, uint256 amount, uint256 timestamp);
    event JobClosed(bytes32 indexed job);
    event JobDeposited(bytes32 indexed job, address indexed from, uint256 amount);
    event JobWithdrew(bytes32 indexed job, address indexed to, uint256 amount);
    event JobReviseRateInitiated(bytes32 indexed job, uint256 newRate);
    event JobReviseRateCancelled(bytes32 indexed job);
    event JobReviseRateFinalized(bytes32 indexed job, uint256 newRate);
    event JobMetadataUpdated(bytes32 indexed job, bytes metadata);

    modifier onlyJobOwner(bytes32 _job) {
        if (!(jobs[_job].owner == _msgSender())) revert MarketV1JobOnlyOwner();
        _;
    }

    function _updateToken(IERC20 _token) internal {
        emit TokenUpdated(token, _token);
        token = _token;
    }

    function _deposit(address _from, uint256 _amount) internal {
        token.transferFrom(_from, address(this), _amount);
    }

    function _withdraw(address _to, uint256 _amount) internal {
        token.transfer(_to, _amount);
    }

    function _jobOpen(
        bytes memory _metadata,
        address _owner,
        address _provider,
        uint256 _rate,
        uint256 _balance
    ) internal {
        _deposit(_owner, _balance);
        uint256 _jobIndex = jobIndex;
        jobIndex = _jobIndex + 1;
        bytes32 _job = bytes32(_jobIndex);
        jobs[_job] = Job(_metadata, _owner, _provider, _rate, _balance, block.timestamp);

        emit JobOpened(_job, _metadata, _owner, _provider, _rate, _balance, block.timestamp);
    }

    function _jobSettle(bytes32 _job) internal {
        address _provider = jobs[_job].provider;
        uint256 _rate = jobs[_job].rate;
        uint256 _balance = jobs[_job].balance;
        uint256 _lastSettled = jobs[_job].lastSettled;

        uint256 _usageDuration = block.timestamp - _lastSettled;
        uint256 _amount = (_rate * _usageDuration + 10 ** EXTRA_DECIMALS - 1) / 10 ** EXTRA_DECIMALS;

        if (_amount > _balance) {
            _amount = _balance;
            _balance = 0;
        } else {
            _balance -= _amount;
        }

        _withdraw(_provider, _amount);

        jobs[_job].balance = _balance;
        jobs[_job].lastSettled = block.timestamp;

        emit JobSettled(_job, _amount, block.timestamp);
    }

    function _jobClose(bytes32 _job) internal {
        _jobSettle(_job);
        uint256 _balance = jobs[_job].balance;
        if (_balance > 0) {
            address _owner = jobs[_job].owner;
            _withdraw(_owner, _balance);
        }

        delete jobs[_job];
        _revertLock(RATE_LOCK_SELECTOR, _job);

        emit JobClosed(_job);
    }

    function _jobDeposit(bytes32 _job, address _from, uint256 _amount) internal {
        if (!(jobs[_job].owner != address(0))) revert MarketV1JobNotFound();

        _deposit(_from, _amount);
        jobs[_job].balance += _amount;

        emit JobDeposited(_job, _from, _amount);
    }

    function _jobWithdraw(bytes32 _job, address _to, uint256 _amount) internal {
        if (!(jobs[_job].owner != address(0))) revert MarketV1JobNotFound();

        _jobSettle(_job);

        // leftover adjustment
        uint256 _leftover = (jobs[_job].rate * _lockWaitTime(RATE_LOCK_SELECTOR) + 10 ** EXTRA_DECIMALS - 1) /
            10 ** EXTRA_DECIMALS;
        if (!(jobs[_job].balance >= _leftover)) revert MarketV1JobNotEnoughBalance();
        uint256 _maxAmount = jobs[_job].balance - _leftover;
        if (!(_amount <= _maxAmount)) revert MarketV1JobNotEnoughBalance();

        jobs[_job].balance -= _amount;
        _withdraw(_to, _amount);

        emit JobWithdrew(_job, _to, _amount);
    }

    function _jobReviseRate(bytes32 _job, uint256 _newRate) internal {
        if (!(jobs[_job].owner != address(0))) revert MarketV1JobNotFound();

        _jobSettle(_job);

        jobs[_job].rate = _newRate;

        emit JobReviseRateFinalized(_job, _newRate);
    }

    function _jobMetadataUpdate(bytes32 _job, bytes memory _metadata) internal {
        jobs[_job].metadata = _metadata;
        emit JobMetadataUpdated(_job, _metadata);
    }

    function jobOpen(bytes calldata _metadata, address _provider, uint256 _rate, uint256 _balance) external {
        return _jobOpen(_metadata, _msgSender(), _provider, _rate, _balance);
    }

    function jobSettle(bytes32 _job) external {
        return _jobSettle(_job);
    }

    function jobClose(bytes32 _job) external onlyJobOwner(_job) {
        // 0 rate jobs can be closed without notice
        if (jobs[_job].rate == 0) {
            return _jobClose(_job);
        }

        // non-0 rate jobs can be closed after proper notice
        uint256 _newRate = _unlock(RATE_LOCK_SELECTOR, _job);
        // 0 rate implies closing to the control plane
        if (!(_newRate == 0)) revert MarketV1JobNonZeroRate();

        return _jobClose(_job);
    }

    function jobDeposit(bytes32 _job, uint256 _amount) external {
        return _jobDeposit(_job, _msgSender(), _amount);
    }

    function jobWithdraw(bytes32 _job, uint256 _amount) external onlyJobOwner(_job) {
        return _jobWithdraw(_job, _msgSender(), _amount);
    }

    function jobReviseRateInitiate(bytes32 _job, uint256 _newRate) external onlyJobOwner(_job) {
        _lock(RATE_LOCK_SELECTOR, _job, _newRate);
        emit JobReviseRateInitiated(_job, _newRate);
    }

    function jobReviseRateCancel(bytes32 _job) external onlyJobOwner(_job) {
        if (!(_lockStatus(RATE_LOCK_SELECTOR, _job) != LockStatus.None)) revert MarketV1JobNoRequest();
        _revertLock(RATE_LOCK_SELECTOR, _job);
        emit JobReviseRateCancelled(_job);
    }

    function jobReviseRateFinalize(bytes32 _job) external onlyJobOwner(_job) {
        uint256 _newRate = _unlock(RATE_LOCK_SELECTOR, _job);
        return _jobReviseRate(_job, _newRate);
    }

    function jobMetadataUpdate(bytes32 _job, bytes calldata _metadata) external onlyJobOwner(_job) {
        return _jobMetadataUpdate(_job, _metadata);
    }

    //-------------------------------- Jobs end --------------------------------//
}
