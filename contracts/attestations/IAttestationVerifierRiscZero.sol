// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "./IRiscZeroVerifier.sol";

/// @title IAttestationVerifierRiscZero
/// @notice Interface for verifying attestations using RISC Zero
interface IAttestationVerifierRiscZero {
    /// @notice Error thrown when an unknown image is encountered
    error AttestationVerifierRiscZeroUnknownImage();

    /// @notice Verifies an attestation using RISC Zero
    /// @param _imageId The ID of the image to verify
    /// @param _verifier The RISC Zero verifier contract
    /// @param _journalDigest The digest of the journal
    /// @param _seal The seal data
    function verify(
        bytes32 _imageId,
        IRiscZeroVerifier _verifier,
        bytes32 _journalDigest,
        bytes calldata _seal
    ) external view;

    /// @notice Verifies an attestation using encoded data
    /// @param _data The encoded attestation data
    function verify(bytes calldata _data) external view;
}
