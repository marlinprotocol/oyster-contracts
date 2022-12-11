// SPDX-License-Identifier: Unlicensed
pragma solidity ^0.8.0;
import "./IClusterSelector.sol";

interface IEpochSelector is IClusterSelector {
    function getCurrentEpoch() external view returns (uint256);

    function getClusters(uint256 epoch) external view returns (address[] memory clusters);

    function getTotalElements() external view returns(uint256);

    function selectClusters() external returns (address[] memory nodes);

    /// @notice Delete a node from tree if it is stored
    /// @param key Address of the node
    function deleteIfPresent(address key) external;

    /// @notice Update the number of clusters to select
    /// @param numberOfClusters New number of clusters to select
    function updateNumberOfClustersToSelect(uint256 numberOfClusters) external;
}
