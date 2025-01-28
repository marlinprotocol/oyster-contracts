// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity ^0.8.0;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract JobsUser {
    using SafeERC20 for IERC20;

    address public jobs;

    /// @notice refers to USDC token
    IERC20 public token;

    constructor(address _jobs, address _token) {
        jobs = _jobs;
        token = IERC20(_token);
    }

    event CalledBack(uint256 indexed jobId, bytes outputs, uint8 errorCode, uint256 execTime);

    event FailedCallback(uint256 indexed jobId, uint256 slashedAmount);

    function createJob(
        uint8 _env,
        bytes32 _codehash,
        bytes memory _codeInputs,
        uint256 _userTimeout,
        uint256 _usdcDeposit
    ) external payable returns (bool success) {
        token.safeIncreaseAllowance(jobs, _usdcDeposit);

        // solhint-disable-next-line avoid-low-level-calls
        (bool _success, ) = jobs.call(
            abi.encodeWithSignature(
                "createJob(uint8,bytes32,bytes,uint256)",
                _env,
                _codehash,
                _codeInputs,
                _userTimeout
            )
        );
        return _success;
    }

    function oysterResultCall(uint256 _jobId, bytes calldata _output, uint8 _errorCode, uint256 _execTime) public {
        emit CalledBack(_jobId, _output, _errorCode, _execTime);
    }

    function oysterFailureCall(uint256 _jobId, uint256 _slashedAmount) public {
        emit FailedCallback(_jobId, _slashedAmount);
    }

    receive() external payable {}
}
