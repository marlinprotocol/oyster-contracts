// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "./IRiscZeroVerifier.sol";

interface IAttestationVerifierRiscZero {
    error AttestationVerifierRiscZeroImmutableInvalidImage();

    function verify(
        IRiscZeroVerifier _verifier,
        bytes32 _imageId,
        uint64 _timestampInMilliseconds,
        bytes calldata _pcrs,
        bytes calldata _rootPubKey,
        bytes calldata _pubKey,
        bytes calldata _userData
    ) external view;

    function verify(bytes calldata _data) external view;
}
