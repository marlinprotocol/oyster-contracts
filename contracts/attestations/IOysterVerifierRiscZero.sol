// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "./IRiscZeroVerifier.sol";

/// @title IOysterVerifierRiscZero
/// @notice Interface for verifying proofs generated using RiscZero
interface IOysterVerifierRiscZero {
    /// @notice Error thrown when an unknown image is encountered
    error OysterVerifierRiscZeroUnknownImage();

    /// @notice Verifies a proof generated using RiscZero
    /// @param _imageId The RiscZero guest image id
    /// @param _verifier The RiscZero verifier contract
    /// @param _journalDigest The journal digest
    /// @param _seal The seal data
    function verify(
        bytes32 _imageId,
        IRiscZeroVerifier _verifier,
        bytes32 _journalDigest,
        bytes calldata _seal
    ) external view;

    /// @notice Verifies a proof generated using RiscZero
    /// @param _data ABI encoded parameters
    function verify(bytes calldata _data) external view;
}
