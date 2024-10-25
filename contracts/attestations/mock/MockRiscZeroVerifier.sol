// SPDX-License-Identifier: MIT

pragma solidity ^0.8.27;

import "../IRiscZeroVerifier.sol";

contract MockRiscZeroVerifier is IRiscZeroVerifier {
    bool public shouldFail;
    struct Call {
        bytes seal;
        bytes32 imageId;
        bytes32 journalDigest;
    }
    Call public call;

    function setFail(bool _shouldFail) external {
        shouldFail = _shouldFail;
    }

    function setExpectedCall(bytes calldata _seal, bytes32 _imageId, bytes32 _journalDigest) external {
        call = Call(_seal, _imageId, _journalDigest);
    }

    function verify(bytes calldata _seal, bytes32 _imageId, bytes32 _journalDigest) external view {
        if (shouldFail) {
            revert("verification failed");
        }

        require(
            keccak256(_seal) == keccak256(call.seal) &&
                _imageId == call.imageId &&
                _journalDigest == call.journalDigest,
            "mock: incorrect call params"
        );
    }
}
