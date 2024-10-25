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
        bytes calldata _seal
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
}
