// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity ^0.8.0;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {RelaySubscriptions} from "./RelaySubscriptions.sol";

contract UserSample is Ownable {
    using SafeERC20 for IERC20;

    address public relayAddress;
    address public relaySubscriptionsAddress;

    /// @notice refers to USDC token
    IERC20 public token;

    event OwnerEthWithdrawal();

    error EthWithdrawalFailed();

    constructor(
        address _relayAddress,
        address _relaySubscriptionsAddress,
        address _token,
        address _owner
    ) Ownable(_owner) {
        relayAddress = _relayAddress;
        relaySubscriptionsAddress = _relaySubscriptionsAddress;
        token = IERC20(_token);
    }

    event CalledBack(
        uint256 indexed jobId,
        address jobOwner,
        bytes32 codehash,
        bytes codeInputs,
        bytes outputs,
        uint8 errorCode
    );

    // bytes32 txhash = 0xc7d9122f583971d4801747ab24cf3e83984274b8d565349ed53a73e0a547d113;

    function relayJob(
        uint8 _env,
        bytes32 _codehash,
        bytes memory _codeInputs,
        uint256 _userTimeout,
        uint256 _maxGasPrice,
        uint256 _usdcDeposit,
        uint256 _callbackDeposit,
        address _refundAccount,
        address _callbackContract,
        uint256 _callbackGasLimit
    ) external returns (bool) {
        // usdcDeposit = _userTimeout * EXECUTION_FEE_PER_MS + GATEWAY_FEE_PER_JOB;
        token.safeIncreaseAllowance(relayAddress, _usdcDeposit);

        // solhint-disable-next-line avoid-low-level-calls
        (bool success, ) = relayAddress.call{value: _callbackDeposit}(
            abi.encodeWithSignature(
                "relayJob(uint8,bytes32,bytes,uint256,uint256,address,address,uint256)",
                _env,
                _codehash,
                _codeInputs,
                _userTimeout,
                _maxGasPrice,
                _refundAccount,
                _callbackContract,
                _callbackGasLimit
            )
        );
        return success;
    }

    function oysterResultCall(
        uint256 _jobId,
        address _jobOwner,
        bytes32 _codehash,
        bytes calldata _codeInputs,
        bytes calldata _output,
        uint8 _errorCode
    ) public {
        emit CalledBack(_jobId, _jobOwner, _codehash, _codeInputs, _output, _errorCode);
    }

    function startJobSubscription(
        RelaySubscriptions.JobSubscriptionParams memory _jobSubsParams,
        uint256 _callbackDeposit
    ) external returns (bool) {
        // usdcDeposit = _userTimeout * EXECUTION_FEE_PER_MS + GATEWAY_FEE_PER_JOB;
        token.safeIncreaseAllowance(relaySubscriptionsAddress, _jobSubsParams.usdcDeposit);

        // solhint-disable-next-line avoid-low-level-calls
        (bool success, ) = relaySubscriptionsAddress.call{value: _callbackDeposit}(
            abi.encodeWithSignature(
                "startJobSubscription((uint8,uint256,uint256,uint256,uint256,address,bytes32,bytes,uint256,uint256,uint256,address))",
                _jobSubsParams
            )
        );
        return success;
    }

    function withdrawEth() external onlyOwner {
        // solhint-disable-next-line avoid-low-level-calls
        (bool success, ) = msg.sender.call{value: address(this).balance}("");
        if (!success) revert EthWithdrawalFailed();

        emit OwnerEthWithdrawal();
    }

    receive() external payable {}
}
