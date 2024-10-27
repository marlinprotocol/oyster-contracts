// SPDX-License-Identifier: MIT

pragma solidity ^0.8.27;

import "./IOysterVerifierRiscZero.sol";

/// @title OysterVerifierRiscZeroStoppable
/// @notice Contract for verifying proofs generated using a specific RiscZero guest image.
/// The contract is immutable.
contract OysterVerifierRiscZeroStoppable is IOysterVerifierRiscZero {
    /// @notice The RiscZero guest image id
    bytes32 public immutable IMAGE_ID;

    /// @notice Constructs the OysterVerifierRiscZeroStoppable contract
    /// @param _imageId The RiscZero guest image id
    constructor(bytes32 _imageId) {
        IMAGE_ID = _imageId;
    }

    /// @notice Internal function to foward verification calls to the verifier
    /// @param _imageId The RiscZero guest image id
    /// @param _verifier The RiscZero verifier contract
    /// @param _journalDigest The journal digest
    /// @param _seal The seal data
    /// @dev Reverts if the image id does not match IMAGE_ID
    function _verify(
        bytes32 _imageId,
        IRiscZeroVerifier _verifier,
        bytes32 _journalDigest,
        bytes memory _seal
    ) internal view {
        require(_imageId == IMAGE_ID, OysterVerifierRiscZeroUnknownImage());

        _verifier.verify(_seal, _imageId, _journalDigest);
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
        _verify(_imageId, _verifier, _journalDigest, _seal);
    }

    /// @notice Verifies a proof generated using a specific RiscZero guest image
    /// @param _data ABI encoded parameters
    function verify(bytes calldata _data) external view {
        (bytes32 _imageId, IRiscZeroVerifier _verifier, bytes32 _journalDigest, bytes memory _seal) = abi.decode(
            _data,
            (bytes32, IRiscZeroVerifier, bytes32, bytes)
        );
        _verify(_imageId, _verifier, _journalDigest, _seal);
    }
}
