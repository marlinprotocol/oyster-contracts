// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {Context} from "@openzeppelin/contracts/utils/Context.sol";
import {ERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {AttestationAuther} from "./AttestationAuther.sol";
import {IAttestationVerifier} from "./interfaces/IAttestationVerifier.sol";

contract AttestationAutherSample is
    Context, // _msgSender, _msgData
    ERC165, // supportsInterface
    AccessControl, // RBAC
    AttestationAuther // auther
{
    constructor(
        IAttestationVerifier attestationVerifier,
        uint256 maxAge,
        address admin
    ) AttestationAuther(attestationVerifier, maxAge) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    //-------------------------------- Overrides start --------------------------------//

    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC165, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    //-------------------------------- Overrides end --------------------------------//

    //-------------------------------- Initializer start --------------------------------//

    error AttestationAutherSampleNoImageProvided();

    function initialize(EnclaveImage[] memory images) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (!(images.length != 0)) revert AttestationAutherSampleNoImageProvided();

        __AttestationAuther_constructor(images);
    }

    function initializeWithFamilies(
        EnclaveImage[] memory images,
        bytes32[] memory families
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (!(images.length != 0)) revert AttestationAutherSampleNoImageProvided();

        __AttestationAuther_constructor(images, families);
    }

    //-------------------------------- Initializer start --------------------------------//

    //-------------------------------- Admin methods start --------------------------------//

    function whitelistEnclaveImage(
        bytes memory pcr0,
        bytes memory pcr1,
        bytes memory pcr2
    ) external onlyRole(DEFAULT_ADMIN_ROLE) returns (bytes32, bool) {
        return _whitelistEnclaveImage(EnclaveImage(pcr0, pcr1, pcr2));
    }

    function revokeEnclaveImage(bytes32 imageId) external onlyRole(DEFAULT_ADMIN_ROLE) returns (bool) {
        return _revokeEnclaveImage(imageId);
    }

    function whitelistEnclaveKey(
        bytes memory enclavePubKey,
        bytes32 imageId
    ) external onlyRole(DEFAULT_ADMIN_ROLE) returns (bool) {
        return _whitelistEnclaveKey(enclavePubKey, imageId);
    }

    function revokeEnclaveKey(address enclaveAddress) external onlyRole(DEFAULT_ADMIN_ROLE) returns (bool) {
        return _revokeEnclaveKey(enclaveAddress);
    }

    function addEnclaveImageToFamily(
        bytes32 imageId,
        bytes32 family
    ) external onlyRole(DEFAULT_ADMIN_ROLE) returns (bool) {
        return _addEnclaveImageToFamily(imageId, family);
    }

    function removeEnclaveImageFromFamily(
        bytes32 imageId,
        bytes32 family
    ) external onlyRole(DEFAULT_ADMIN_ROLE) returns (bool) {
        return _removeEnclaveImageFromFamily(imageId, family);
    }

    //-------------------------------- Admin methods end --------------------------------//

    //-------------------------------- Open methods start -------------------------------//

    bytes32 private constant DOMAIN_SEPARATOR =
        keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version)"),
                keccak256("marlin.oyster.AttestationAutherSample"),
                keccak256("1")
            )
        );

    struct Message {
        string message;
    }
    bytes32 private constant MESSAGE_TYPEHASH = keccak256("Message(string message)");

    function verify(bytes memory signature, string memory message) external view {
        bytes32 hashStruct = keccak256(abi.encode(MESSAGE_TYPEHASH, keccak256(bytes(message))));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, hashStruct));

        address signer = ECDSA.recover(digest, signature);

        _allowOnlyVerified(signer);
    }

    function verifyFamily(bytes memory signature, string memory message, bytes32 family) external view {
        bytes32 hashStruct = keccak256(abi.encode(MESSAGE_TYPEHASH, keccak256(bytes(message))));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, hashStruct));

        address signer = ECDSA.recover(digest, signature);

        _allowOnlyVerifiedFamily(signer, family);
    }

    //-------------------------------- Open methods end -------------------------------//
}
