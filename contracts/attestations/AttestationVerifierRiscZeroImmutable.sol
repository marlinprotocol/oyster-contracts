// SPDX-License-Identifier: MIT

pragma solidity ^0.8.27;

import "./IRiscZeroVerifier.sol";

contract AttestationVerifierRiscZeroImmutable {
    bytes32 public immutable IMAGE_ID;

    constructor(bytes32 imageId) {
        IMAGE_ID = imageId;
    }

    error AttestationVerifierRiscZeroImmutableImageMismatch();

    function _verify(
        IRiscZeroVerifier _verifier,
        bytes32 _imageId,
        bytes32 _journalDigest,
        bytes memory _seal
    ) internal view {
        require(_imageId == IMAGE_ID, AttestationVerifierRiscZeroImmutableImageMismatch());

        _verifier.verify(_seal, _imageId, _journalDigest);
    }

    function verify(
        IRiscZeroVerifier _verifier,
        bytes32 _imageId,
        bytes32 _journalDigest,
        bytes calldata _seal
    ) external view {
        _verify(_verifier, _imageId, _journalDigest, _seal);
    }

    function verify(bytes calldata _data) external view {
        (IRiscZeroVerifier _verifier, bytes32 _imageId, bytes32 _journalDigest, bytes memory _seal) = abi.decode(
            _data,
            (IRiscZeroVerifier, bytes32, bytes32, bytes)
        );
        _verify(_verifier, _imageId, _journalDigest, _seal);
    }
}
