// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "./IRiscZeroVerifier.sol";

interface IAttestationVerifierRiscZero {
    error AttestationVerifierRiscZeroUnknownImage();

    function verify(
        bytes32 _imageId,
        IRiscZeroVerifier _verifier,
        bytes32 _journalDigest,
        bytes calldata _seal
    ) external view;

    function verify(bytes calldata _data) external view;
}
