// SPDX-License-Identifier: MIT

pragma solidity ^0.8.27;

import "../IOysterVerifierRiscZero.sol";

contract MockOysterVerifierRiscZero is IOysterVerifierRiscZero {
    bool public shouldFail;
    struct DecodedCall {
        bytes32 imageId;
        IRiscZeroVerifier verifier;
        bytes32 journalDigest;
        bytes seal;
    }
    DecodedCall public decodedCall;
    struct EncodedCall {
        bytes data;
    }
    EncodedCall public encodedCall;

    function setFail(bool _shouldFail) external {
        shouldFail = _shouldFail;
    }

    function setExpectedDecodedCall(
        bytes32 _imageId,
        IRiscZeroVerifier _verifier,
        bytes32 _journalDigest,
        bytes calldata _seal
    ) external {
        decodedCall = DecodedCall(_imageId, _verifier, _journalDigest, _seal);
    }

    function setExpectedEncodedCall(bytes calldata _data) external {
        encodedCall = EncodedCall(_data);
    }

    function verify(
        bytes32 _imageId,
        IRiscZeroVerifier _verifier,
        bytes32 _journalDigest,
        bytes calldata _seal
    ) external view {
        if (shouldFail) {
            revert("verification failed");
        }

        require(
            _imageId == decodedCall.imageId &&
                _verifier == decodedCall.verifier &&
                _journalDigest == decodedCall.journalDigest &&
                keccak256(_seal) == keccak256(decodedCall.seal),
            "mock: incorrect call params"
        );
    }

    function verify(bytes calldata _data) external view {
        if (shouldFail) {
            revert("verification failed");
        }

        require(keccak256(_data) == keccak256(encodedCall.data), "mock: incorrect call params");
    }
}
