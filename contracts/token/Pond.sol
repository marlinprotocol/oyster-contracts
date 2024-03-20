// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

// stripped down Pond contract for use in tests
// DO NOT use as a real token
contract Pond is
    Initializable,  // initializer
    ERC20Upgradeable,  // token
    ERC1967UpgradeUpgradeable,  // delegate slots, proxy admin, private upgrade
    UUPSUpgradeable  // public upgrade
{
    // in case we add more contracts in the inheritance chain
    uint256[500] private __gap0;

    /// @custom:oz-upgrades-unsafe-allow constructor
    // initializes the logic contract without any admins
    // safeguard against takeover of the logic contract
    constructor() initializer {}

    function initialize(
        string memory _name,
        string memory _symbol
    ) public initializer {
        __Context_init_unchained();
        __ERC20_init_unchained(_name, _symbol);
        __ERC1967Upgrade_init_unchained();
        __UUPSUpgradeable_init_unchained();

        _mint(msg.sender, 10000000000e18);
    }

    function _authorizeUpgrade(address /*account*/) internal view override {}
}
