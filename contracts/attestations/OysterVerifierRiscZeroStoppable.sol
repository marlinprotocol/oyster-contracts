// SPDX-License-Identifier: MIT

pragma solidity ^0.8.27;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "./IOysterVerifierRiscZero.sol";

/// @title OysterVerifierRiscZeroStoppable
/// @notice Contract for verifying proofs generated using a specific RiscZero guest image.
/// The contract is pausable and unpausable by the contract owner.
/// It is meant to be used primarily in case bugs are found in the guest.
contract OysterVerifierRiscZeroStoppable is IOysterVerifierRiscZero, Ownable, Pausable {
    /// @notice The RiscZero guest image id
    IOysterVerifierRiscZero public immutable VERIFIER;

    /// @notice Constructs the OysterVerifierRiscZeroStoppable contract
    /// @param _verifier The immutable verifier to forward calls to
    /// @param _owner The address to be set as the owner of the contract
    constructor(IOysterVerifierRiscZero _verifier, address _owner) Ownable(_owner) {
        VERIFIER = _verifier;
    }

    /// @notice Allows the owner to pause the contract
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Allows the owner to unpause the contract
    function unpause() external onlyOwner {
        _unpause();
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
    ) external view whenNotPaused {
        VERIFIER.verify(_imageId, _verifier, _journalDigest, _seal);
    }

    /// @notice Verifies a proof generated using a specific RiscZero guest image
    /// @param _data ABI encoded parameters
    function verify(bytes calldata _data) external view whenNotPaused {
        VERIFIER.verify(_data);
    }
}
