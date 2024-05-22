// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/introspection/ERC165Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./Executors.sol";

contract Jobs is
    Initializable, // initializer
    ContextUpgradeable, // _msgSender, _msgData
    ERC165Upgradeable, // supportsInterface
    AccessControlUpgradeable,
    UUPSUpgradeable // public upgrade
{
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;

    error JobsZeroAddressToken();

    /// @custom:oz-upgrades-unsafe-allow constructor
    // initializes the logic contract without any admins
    // safeguard against takeover of the logic contract
    constructor(
        IERC20 _token,
        uint256 _signMaxAge,
        uint256 _executionBufferTime,
        uint256 _noOfNodesToSelect,
        uint256 _executorFeePerMs,
        uint256 _stakingRewardPerMs
    ) {
        _disableInitializers();

        if(address(_token) == address(0))
            revert JobsZeroAddressToken();
        TOKEN = _token;
        SIGN_MAX_AGE = _signMaxAge;
        EXECUTION_BUFFER_TIME = _executionBufferTime;
        NO_OF_NODES_TO_SELECT = _noOfNodesToSelect;

        EXECUTOR_FEE_PER_MS = _executorFeePerMs;
        STAKING_REWARD_PER_MS = _stakingRewardPerMs;
    }

    //-------------------------------- Overrides start --------------------------------//

    function supportsInterface(
        bytes4 interfaceId
    )
        public
        view
        virtual
        override(ERC165Upgradeable, AccessControlUpgradeable)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    function _authorizeUpgrade(
        address /*account*/
    ) internal view override onlyRole(DEFAULT_ADMIN_ROLE) {}

    //-------------------------------- Overrides end --------------------------------//

    //-------------------------------- Initializer start --------------------------------//

    error JobsZeroAddressAdmin();

    function initialize(
        address _admin,
        Executors _executors,
        address _paymentPoolAddress
    ) public initializer {
        if(_admin == address(0))
            revert JobsZeroAddressAdmin();

        __Context_init_unchained();
        __ERC165_init_unchained();
        __AccessControl_init_unchained();
        __UUPSUpgradeable_init_unchained();

        _grantRole(DEFAULT_ADMIN_ROLE, _admin);

        executors = _executors;
        jobCount = 0;
        paymentPool = _paymentPoolAddress;
    }

    //-------------------------------- Initializer end --------------------------------//

    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    IERC20 public immutable TOKEN;

    /// @notice Maximum age of a valid signature, in seconds.
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    uint256 public immutable SIGN_MAX_AGE;

    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    uint256 public immutable EXECUTION_BUFFER_TIME;

    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    uint256 public immutable NO_OF_NODES_TO_SELECT;

    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    uint256 public immutable EXECUTOR_FEE_PER_MS;

    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    uint256 public immutable STAKING_REWARD_PER_MS;

    Executors public executors;

    address public paymentPool;

    //-------------------------------- Admin methods start --------------------------------//

    function setExecutorsContract(Executors _executors) external onlyRole(DEFAULT_ADMIN_ROLE) {
        executors = _executors;
    }

    function setPaymentPool(address _paymentPoolAddress) external onlyRole(DEFAULT_ADMIN_ROLE) {
        paymentPool = _paymentPoolAddress;
    }

    //-------------------------------- Admin methods end ----------------------------------//

    //-------------------------------- Job start --------------------------------//

    struct Job {
        uint256 jobId;
        uint256 deadline;   // in milliseconds
        uint256 execStartTime;
        address jobOwner;
        uint256 executionTime;   // it stores the execution time for first output submitted only (in milliseconds)
        uint8 outputCount;
    }

    uint256 public jobCount;

    // jobKey => Job
    mapping(uint256 => Job) public jobs;

    // jobKey => executors
    mapping(uint256 => address[]) public selectedExecutors;
    // jobKey => selectedExecutor => hasExecuted
    mapping(uint256 => mapping(address => bool)) public hasExecutedJob;

    bytes32 private constant DOMAIN_SEPARATOR =
        keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version)"),
                keccak256("marlin.oyster.Jobs"),
                keccak256("1")
            )
        );
    bytes32 private constant SUBMIT_OUTPUT_TYPEHASH =
        keccak256("SubmitOutput(uint256 jobId,bytes output,uint256 totalTime,uint8 errorCode,uint256 signTimestampInMs)");

    event JobCreated(
        uint256 indexed jobId,
        bytes32 codehash,
        bytes codeInputs,
        uint256 deadline,   // in milliseconds
        address jobOwner,
        address[] selectedExecutors
    );

    event JobResponded(
        uint256 indexed jobId,
        bytes output,
        uint256 totalTime,
        uint8 errorCode,
        uint8 outputCount
    );

    event JobSucceeded(
        uint256 indexed jobId,
        bool callback_success
    );

    event JobTimeoutFailure(
        uint256 indexed jobId,
        bool callback_success
    );

    error JobsRelayTimeOver();
    error JobsJobMarkedEndedAsResourceUnavailable();
    error JobsInvalidSequenceId();
    error JobsJobAlreadyRelayed();
    error JobsUnsupportedChain();
    error JobsSignatureTooOld();
    error JobsExecutionTimeOver();
    error JobsNotSelectedExecutor();
    error JobsExecutorAlreadySubmittedOutput();

    //-------------------------------- internal functions start --------------------------------//

    function _createJob(
        bytes32 _codehash,
        bytes memory _codeInputs,
        uint256 _deadline,  // in milliseconds
        address _jobOwner
    ) internal returns (uint256 jobId, uint8 errorCode) {

        errorCode = 0;
        address[] memory selectedNodes = executors.selectExecutors(NO_OF_NODES_TO_SELECT);
        // if no executors are selected, then return with error code 1
        if(selectedNodes.length < NO_OF_NODES_TO_SELECT) {
            errorCode = 1;
            return (0, errorCode);
        }
        jobId = ++jobCount;
        selectedExecutors[jobId] = selectedNodes;

        // deposit escrow amount(USDC)
        TOKEN.safeTransferFrom(_jobOwner, address(this), _deadline * (EXECUTOR_FEE_PER_MS + STAKING_REWARD_PER_MS));

        _create(jobId, _codehash, _codeInputs, _deadline, _jobOwner, selectedNodes);
    }

    function _create(
        uint256 _jobId,
        bytes32 _codehash,
        bytes memory _codeInputs,
        uint256 _deadline,  // in milliseconds
        address _jobOwner,
        address[] memory _selectedNodes
    ) internal {
        jobs[_jobId].jobId = _jobId;
        jobs[_jobId].deadline = _deadline;
        jobs[_jobId].execStartTime = block.timestamp;
        jobs[_jobId].jobOwner = _jobOwner;

        emit JobCreated(_jobId, _codehash, _codeInputs, _deadline, _jobOwner, _selectedNodes);
    }

    function _submitOutput(
        bytes memory _signature,
        uint256 _jobId,
        bytes memory _output,
        uint256 _totalTime,
        uint8 _errorCode,
        uint256 _signTimestampInMs
    ) internal {
        if((block.timestamp * 1000) > (jobs[_jobId].execStartTime * 1000) + jobs[_jobId].deadline + (EXECUTION_BUFFER_TIME * 1000))
            revert JobsExecutionTimeOver();

        // signature check
        address enclaveAddress = _verifyOutputSign(_signature, _jobId, _output, _totalTime, _errorCode, _signTimestampInMs);

        if(!_isJobExecutor(_jobId, enclaveAddress))
            revert JobsNotSelectedExecutor();
        if(hasExecutedJob[_jobId][enclaveAddress])
            revert JobsExecutorAlreadySubmittedOutput();

        executors.releaseExecutor(enclaveAddress);
        hasExecutedJob[_jobId][enclaveAddress] = true;

        uint8 outputCount = ++jobs[_jobId].outputCount;
        if(outputCount == 1)
            jobs[_jobId].executionTime = _totalTime;

        // on reward distribution, 1st output executor node gets max reward
        // reward ratio - 2:1:0
        _transferRewardPayout(_jobId, outputCount, enclaveAddress);

        // TODO: add callback gas
        if (outputCount == 1) {
            address jobOwner = jobs[_jobId].jobOwner;
            (bool success,) = jobOwner.call(
                abi.encodeWithSignature("oysterResultCall(uint256,bytes,uint8,uint256)", _jobId, _output, _errorCode,
                                        _totalTime)
            );
            emit JobSucceeded(_jobId, success);
        }
        emit JobResponded(_jobId, _output, _totalTime, _errorCode, outputCount);
    }

    function _verifyOutputSign(
        bytes memory _signature,
        uint256 _jobId,
        bytes memory _output,
        uint256 _totalTime,
        uint8 _errorCode,
        uint256 _signTimestampInMs
    ) internal view returns (address) {
        if (block.timestamp > (_signTimestampInMs / 1000) + SIGN_MAX_AGE)
            revert JobsSignatureTooOld();

        bytes32 hashStruct = keccak256(
            abi.encode(
                SUBMIT_OUTPUT_TYPEHASH,
                _jobId,
                keccak256(_output),
                _totalTime,
                _errorCode,
                _signTimestampInMs
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, hashStruct));
        address signer = digest.recover(_signature);

        executors.allowOnlyVerified(signer);
        return signer;
    }

    function _transferRewardPayout(
        uint256 _jobId,
        uint256 _outputCount,
        address _enclaveAddress
    ) internal {
        (address owner, , , , ) = executors.executors(_enclaveAddress);
        uint256 executionTime = jobs[_jobId].executionTime;
        address jobOwner = jobs[_jobId].jobOwner;
        uint256 deadline = jobs[_jobId].deadline;
        // for first output
        if(_outputCount == 1) {
            // transfer payout to executor
            TOKEN.safeTransfer(owner, (executionTime * EXECUTOR_FEE_PER_MS * 2) / 3);
            // transfer payout to payment pool
            TOKEN.safeTransfer(paymentPool, executionTime * STAKING_REWARD_PER_MS);
            // transfer to job owner
            TOKEN.safeTransfer(jobOwner, (deadline - executionTime) * (EXECUTOR_FEE_PER_MS + STAKING_REWARD_PER_MS));
        }
        // for second output
        else if(_outputCount == 2) {
            // transfer payout to executor
            TOKEN.safeTransfer(owner, (executionTime * EXECUTOR_FEE_PER_MS) / 3);
        }
        // for 3rd output
        else {
            // All payments have already been made during first and second submission

            // cleanup job data after 3rd output submitted
            _cleanJobData(_jobId);
        }
    }

    function _cleanJobData(
        uint256 _jobId
    ) internal {
        delete jobs[_jobId];

        uint256 len = selectedExecutors[_jobId].length;
        for (uint256 index = 0; index < len; index++) {
            address enclaveAddress = selectedExecutors[_jobId][index];
            delete hasExecutedJob[_jobId][enclaveAddress];
        }

        delete selectedExecutors[_jobId];
    }

    function _isJobExecutor(
        uint256 _jobId,
        address _enclaveAddress
    ) internal view returns (bool) {
        address[] memory selectedNodes = selectedExecutors[_jobId];
        uint256 len = selectedExecutors[_jobId].length;
        for (uint256 index = 0; index < len; index++) {
            if(selectedNodes[index] == _enclaveAddress)
                return true;
        }
        return false;
    }

    //-------------------------------- internal functions end ----------------------------------//


    //-------------------------------- external functions start --------------------------------//

    function createJob(
        bytes32 _codehash,
        bytes memory _codeInputs,
        uint256 _deadline  // in milliseconds
    ) external returns (uint256, uint8) {
        return _createJob(_codehash, _codeInputs, _deadline, _msgSender());
    }

    function submitOutput(
        bytes memory _signature,
        uint256 _jobId,
        bytes memory _output,
        uint256 _totalTime,
        uint8 _errorCode,
        uint256 _signTimestampInMs
    ) external {
        _submitOutput(_signature, _jobId, _output, _totalTime, _errorCode, _signTimestampInMs);
    }

    function isJobExecutor(
        uint256 _jobId,
        address _enclaveAddress
    ) public view returns (bool) {
        return _isJobExecutor(_jobId, _enclaveAddress);
    }

    //-------------------------------- external functions end ----------------------------------//

    //-------------------------------- Job end --------------------------------//


    //-------------------------------- Timeout start --------------------------------//

    event SlashedOnExecutionTimeout(
        uint256 indexed jobId,
        address indexed enclaveAddress
    );

    error JobsInvalidJob();
    error JobsDeadlineNotOver();

    //-------------------------------- internal functions start ----------------------------------//

    function _slashOnExecutionTimeout(
        uint256 _jobId
    ) internal {
        if(jobs[_jobId].jobId == 0)
            revert JobsInvalidJob();

        // check for time
        if((block.timestamp * 1000) <= (jobs[_jobId].execStartTime * 1000) + jobs[_jobId].deadline + (EXECUTION_BUFFER_TIME * 1000))
            revert JobsDeadlineNotOver();

        address jobOwner = jobs[_jobId].jobOwner;
        uint8 outputCount = jobs[_jobId].outputCount;
        bool isNoOutputSubmitted = (outputCount == 0);
        uint256 deadline = jobs[_jobId].deadline;
        uint256 executionTime = jobs[_jobId].executionTime;
        delete jobs[_jobId];

        _releaseEscrowAmount(jobOwner, outputCount, deadline, executionTime);

        // slash Execution node
        uint256 len = selectedExecutors[_jobId].length;
        uint256 slashAmount = 0;
        for (uint256 index = 0; index < len; index++) {
            address enclaveAddress = selectedExecutors[_jobId][index];

            if(!hasExecutedJob[_jobId][enclaveAddress]) {
                slashAmount += executors.slashExecutor(
                    enclaveAddress,
                    isNoOutputSubmitted,
                    jobOwner
                );
                emit SlashedOnExecutionTimeout(_jobId, enclaveAddress);
            }
            delete hasExecutedJob[_jobId][enclaveAddress];
        }

        delete selectedExecutors[_jobId];
        if (isNoOutputSubmitted) {
            // TODO: add gas limit
            (bool success,) = jobOwner.call(
                abi.encodeWithSignature("oysterFailureCall(uint256,uint256)", _jobId, slashAmount)
            );
            emit JobTimeoutFailure(_jobId, success);
        }
    }

    function _releaseEscrowAmount(
        address _jobOwner,
        uint8 _outputCount,
        uint256 _deadline,
        uint256 _executionTime
    ) internal {
        uint256 jobOwnerDeposit = _deadline * (EXECUTOR_FEE_PER_MS + STAKING_REWARD_PER_MS);

        if(_outputCount == 0) {
            // transfer back the whole escrow amount to gateway if no output submitted
            TOKEN.safeTransfer(_jobOwner, jobOwnerDeposit);
        } else if (_outputCount == 1) {
            // Note: No need to pay job owner the remaining, it has already been paid when first output is submitted
            // transfer the expected reward of second submitter to payment pool
            TOKEN.safeTransfer(paymentPool, (_executionTime * EXECUTOR_FEE_PER_MS) / 3);
        }
    }

    //-------------------------------- internal functions end ----------------------------------//

    //-------------------------------- external functions start ----------------------------------//

    function slashOnExecutionTimeout(
        uint256 _jobId
    ) external {
        _slashOnExecutionTimeout(_jobId);
    }

    //-------------------------------- external functions end ----------------------------------//

    //-------------------------------- Timeout end --------------------------------//

    function getSelectedExecutors(
        uint256 _jobId
    ) external view returns (address[] memory) {
        return selectedExecutors[_jobId];
    }
}