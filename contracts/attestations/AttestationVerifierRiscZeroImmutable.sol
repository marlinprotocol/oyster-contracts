// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

contract AttestationVerifierRiscZeroImmutable {
    bytes32 public immutable IMAGE_ID;

    constructor(bytes32 imageId) {
        IMAGE_ID = imageId;
    }
}
