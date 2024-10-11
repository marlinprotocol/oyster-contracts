// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface IAttestationVerifier {
    struct Attestation {
        bytes enclavePubKey;
        bytes pcr0;
        bytes pcr1;
        bytes pcr2;
        uint256 timestampInMilliseconds;
    }
    function verify(bytes memory signature, Attestation memory attestation) external view;
    function verify(bytes memory data) external view;
}
