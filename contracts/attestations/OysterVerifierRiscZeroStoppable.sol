// SPDX-License-Identifier: MIT

pragma solidity ^0.8.27;

import "./IOysterVerifierRiscZero.sol";

/// @title OysterVerifierRiscZeroStoppable
/// @notice Contract for verifying proofs generated using a specific RiscZero guest image.
/// The contract is immutable.
contract OysterVerifierRiscZeroStoppable is IOysterVerifierRiscZero {
    /// @notice The RiscZero guest image id
    IOysterVerifierRiscZero public immutable VERIFIER;

    /// @notice Constructs the OysterVerifierRiscZeroStoppable contract
    /// @param _verifier The immutable verifier to forward calls to
    constructor(IOysterVerifierRiscZero _verifier) {
        VERIFIER = _verifier;
    }

    /// @notice Verifies a proof generated using a specific RiscZero guest image
    /// @param _imageId The RiscZero guest image id
    /// @param _verifier The RiscZero verifier contract
    /// @param _journalDigest The journal digest
    /// @param _seal The seal data
    function verify(
        bytes32 _imageId,
        IRiscZeroVerifier _verifier,
        bytes32 _journalDigest,
        bytes calldata _seal
    ) external view {
        VERIFIER.verify(_imageId, _verifier, _journalDigest, _seal);
    }

    /// @notice Verifies a proof generated using a specific RiscZero guest image
    /// @param _data ABI encoded parameters
    function verify(bytes calldata _data) external view {
        VERIFIER.verify(_data);
    }
}
