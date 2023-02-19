import { ethers, network, upgrades } from "hardhat";
import { BigNumber as BN } from "bignumber.js";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { isAddress, keccak256 } from "ethers/lib/utils";
import { expect } from "chai";
import { Contract } from "ethers";
import dotenv from "dotenv";

dotenv.config();

type Balances = {
  user: string;
  balance: string;
};

type Counter = {
  address: string;
  balance: number;
  count: number;
  expected_P_e: string;
};

let totalNumberOfElementsUsedInTest: number; //to be used globally on this test.

describe("Testing Cluster Selector", function () {
  let clusterSelector: Contract;
  let admin: SignerWithAddress;
  let user: SignerWithAddress;
  let updater: SignerWithAddress;

  let numberOfClustersToSelect: number = 5;
  let numberOfAddressesWithLargeBalances = 10;
  let numberOfElementsInTree = 300 - numberOfAddressesWithLargeBalances;

  let numberOfSelections: number = 1000; // number of trials

  totalNumberOfElementsUsedInTest = numberOfElementsInTree + numberOfAddressesWithLargeBalances;

  if (process.env.TEST_ENV == "prod") {
    numberOfAddressesWithLargeBalances = 10;
    numberOfClustersToSelect = 5;
    numberOfElementsInTree = 20000 - numberOfAddressesWithLargeBalances;
    numberOfSelections = 1000;
  }

  beforeEach(async () => {
    [admin, user, updater] = await ethers.getSigners();
    const blockNum = await ethers.provider.getBlockNumber();
    const blockData = await ethers.provider.getBlock(blockNum);

    const Pond = await ethers.getContractFactory("Pond");
    const pond = await upgrades.deployProxy(Pond, ["Marlin POND", "POND"], {
      kind: "uups",
    });

    let ClusterSelector = await ethers.getContractFactory("ClusterSelector");
    clusterSelector = await upgrades.deployProxy(ClusterSelector, [
      admin.address,
      "0x000000000000000000000000000000000000dEaD",
      numberOfClustersToSelect,
      pond.address,
      new BN(10).pow(20).toString()
    ], {
      kind: "uups",
      constructorArgs: [blockData.timestamp, 4*60*60]
    });
  });

  it("Check deployment", async () => {
    expect(isAddress(clusterSelector.address)).eq(true);
  });

  it("User can't insert", async () => {
    const address = randomAddressGenerator("1");
    let role = await clusterSelector.UPDATER_ROLE();
    await expect(clusterSelector.connect(user).insert_unchecked(address, 1)).to.be.revertedWith(
      `AccessControl: account ${user.address.toLowerCase()} is missing role ${role}`
    );
  });

  describe("Test after inserting", function () {
    let snapshot: any;
    beforeEach(async () => {
      let role = await clusterSelector.UPDATER_ROLE();
      await clusterSelector.connect(admin).grantRole(role, updater.address);

      snapshot = await network.provider.request({
        method: "evm_snapshot",
        params: [],
      });
    });

    afterEach(async function () {
      await network.provider.request({
        method: "evm_revert",
        params: [snapshot],
      });
    });

    it("Add a number", async () => {
      const address = randomAddressGenerator("salt");
      await clusterSelector.connect(updater).insert_unchecked(address, 1);
      const index = await clusterSelector.callStatic.addressToIndexMap(address);
      const node = await clusterSelector.callStatic.nodes(index);
      expect(node.value).eq(1);
    });

    it("Multiple entry call", async () => {
      const addresses = [];
      const balances = [];
      for (let index = 0; index < 200; index++) {
        const address = randomAddressGenerator("salt" + index);
        addresses.push(address);
        balances.push(getRandomNumber());
      }

      await clusterSelector.connect(updater).insertMultiple_unchecked(addresses, balances);
    });

    it("Total Clusters less than clusters to select", async () => {
      const allAddresses = [];
      const noOfElements = Math.floor(Math.random() * numberOfClustersToSelect) + 1;
      for (let index = 0; index < noOfElements; index++) {
        const address = randomAddressGenerator("salt" + index);
        await clusterSelector.connect(updater).insert_unchecked(address, getRandomNumber());

        if (index % 100 == 0 || index == noOfElements - 1) {
          console.log(`Elements in tree ${index}/${noOfElements}`);
        }

        allAddresses.push(ethers.utils.getAddress(address));
      }

      await clusterSelector.selectClusters();
      const clustersSelected = await clusterSelector.callStatic.selectClusters();
      expect(clustersSelected.length).to.equal(allAddresses.length);
      for (let j = 0; j < clustersSelected.length; j++) {
        expect(allAddresses.includes(clustersSelected[j])).to.be.true;
      }
    });

    it("Multiple entries", async () => {
      const allAddresses = [];
      for (let index = 0; index < numberOfElementsInTree; index++) {
        const address = randomAddressGenerator("salt" + index);
        await clusterSelector.connect(updater).insert_unchecked(address, getRandomNumber());

        if (index % 100 == 0 || index == numberOfElementsInTree - 1) {
          console.log(`Elements in tree ${index}/${numberOfElementsInTree}`);
        }

        allAddresses.push(address);
      }

      const epochLength = parseInt((await clusterSelector.EPOCH_LENGTH()).toString());

      let largeAddresses = await addAddressWithLargeBalance(numberOfAddressesWithLargeBalances, clusterSelector, updater);

      for (let index = 0; index < largeAddresses.length; index++) {
        const element = largeAddresses[index];
        allAddresses.push(element.toLowerCase());
      }

      // element at index 1 is root
      let data = await clusterSelector.callStatic.nodes(1);
      const totalValueInTree = new BN(data.leftSum.toString()).plus(data.value.toString()).plus(data.rightSum.toString()).toFixed(0);

      let counter: Counter[] = [];

      for (let index = 0; index < numberOfSelections; index++) {
        let selected = await getSelectedClusters(updater, clusterSelector);
        await ethers.provider.send("evm_increaseTime", [epochLength + 1]);
        await ethers.provider.send("evm_mine", []);

        selected.forEach((value) => {
          const addresses = counter.map((a) => a.address);
          if (addresses.includes(value.user)) {
            let indexOfAddress = 0;
            for (let index = 0; index < addresses.length; index++) {
              const element = addresses[index];
              if (element == value.user) {
                indexOfAddress = index;
                break;
              }
            }
            counter[indexOfAddress].count += 1;
          } else {
            counter.push({
              address: value.user,
              count: 1,
              balance: parseInt(value.balance),
              expected_P_e: balToSelectionProbability(value.balance, totalValueInTree, numberOfClustersToSelect),
            });
          }
        });

        if (index % 100 == 0 || index == numberOfSelections - 1) {
          console.log(`Searches Complete ${index}/${numberOfSelections}`);
        }
      }

      counter = counter.sort((a, b) => (b.count == a.count ? b.balance - a.balance : b.count - a.count));
      console.table(
        counter.map((a) => {
          return {
            address: a.address,
            balance: a.balance,
            expected_P_e: a.expected_P_e,
            observed_P_e: a.count / numberOfSelections,
            diff: new BN(a.expected_P_e).minus(new BN(a.count).div(numberOfSelections)).toString(),
          };
        })
      );

      const unselected = await getUnSelectedClustersData(
        updater,
        clusterSelector,
        allAddresses,
        counter.map((a) => a.address)
      );
      let unselectedCounter: Counter[] = [];

      unselected.forEach((value) => {
        unselectedCounter.push({
          address: value.user,
          balance: parseInt(value.balance),
          count: 0,
          expected_P_e: balToSelectionProbability(value.balance, totalValueInTree, numberOfClustersToSelect),
        });
      });

      unselectedCounter = unselectedCounter.sort((a, b) => (b.count == a.count ? b.balance - a.balance : b.count - a.count));
      console.table(
        unselectedCounter.map((a) => {
          return {
            address: a.address,
            balance: a.balance,
            expected_P_e: a.expected_P_e,
            observed_P_e: a.count / numberOfSelections,
            diff: new BN(a.expected_P_e).minus(new BN(a.count).div(numberOfSelections)).toString(),
          };
        })
      );
    }).timeout(1000000);
  });
});

function containsDuplicates(array: string[]) {
  if (array.length !== new Set(array).size) {
    return true;
  }

  return false;
}

async function getUnSelectedClustersData(
  account: SignerWithAddress,
  clusterSelector: Contract,
  allAddresses: string[],
  selectedAddresses: string[]
): Promise<Balances[]> {
  allAddresses = allAddresses.map((a) => a.toLowerCase());
  selectedAddresses = selectedAddresses.map((a) => a.toLowerCase());

  const unselectedAddresses = [];
  for (let index = 0; index < allAddresses.length; index++) {
    const element = allAddresses[index];
    if (selectedAddresses.includes(element)) {
      continue;
    } else {
      unselectedAddresses.push(element);
    }
  }

  const balances: Balances[] = [];
  for (let index = 0; index < unselectedAddresses.length; index++) {
    const element = unselectedAddresses[index];

    const selectedNodeIndex = (await clusterSelector.callStatic.addressToIndexMap(element)).toString();
    const data = await clusterSelector.connect(account).callStatic.nodes(selectedNodeIndex);

    balances.push({ user: element, balance: data.value.toString() });
  }

  return balances;
}

async function getSelectedClusters(account: SignerWithAddress, clusterSelector: Contract): Promise<Balances[]> {
  await clusterSelector.connect(account).selectClusters();
  const clustersSelected = await clusterSelector.connect(account).callStatic.selectClusters();

  const balances: Balances[] = [];

  let selectedOnes = (clustersSelected as string[]).map((a) => a.toLowerCase());

  if (containsDuplicates(selectedOnes)) {
    console.log({ selectedOnes });
    throw new Error("Cluster is selected multiple times in same epoch");
  }

  for (let index = 0; index < clustersSelected.length; index++) {
    const element = clustersSelected[index];

    const selectedNodeIndex = (await clusterSelector.callStatic.addressToIndexMap(element)).toString();
    const data = await clusterSelector.callStatic.nodes(selectedNodeIndex);

    balances.push({ user: element, balance: data.value.toString() });
  }

  // console.table(balances);

  return balances;
}

function randomAddressGenerator(rand: string): string {
  let address = keccak256(Buffer.from(rand + new Date().valueOf().toString()))
    .toString()
    .slice(0, 42);
  return address;
}

function balToSelectionProbability(bal: string | number, total: string | number, numberOfClustersToSelect: string | number): string {
  const balance = new BN(bal);
  let totalBalance = new BN(total);
  const avgBalance = new BN(total).div(totalNumberOfElementsUsedInTest);

  let peNotSelected = new BN(1).minus(balance.dividedBy(totalBalance));

  for (let index = 0; index < numberOfClustersToSelect; index++) {
    totalBalance = totalBalance.minus(avgBalance);
    peNotSelected = peNotSelected.multipliedBy(new BN(1).minus(balance.dividedBy(totalBalance)));
  }
  return new BN(1).minus(peNotSelected).toPrecision(8);
}

function getRandomNumber(): number {
  const uint32max: number = 4294967295;

  return Math.floor((Math.random() * uint32max) / totalNumberOfElementsUsedInTest / 100) + 1; // divide by another 100 for safe side to avoid overflow.
}

async function addAddressWithLargeBalance(
  numberOfAddressesWithLargeBalances: number,
  clusterSelector: Contract,
  updater: SignerWithAddress
): Promise<string[]> {
  const addressesToNote: string[] = [];
  for (let index = 0; index < numberOfAddressesWithLargeBalances; index++) {
    const rndInt = Math.floor(Math.random() * ((numberOfAddressesWithLargeBalances * totalNumberOfElementsUsedInTest) / 100)) + 1;
    let largeBalAddress = randomAddressGenerator("some string" + index);

    // element at index 1 is root
    let data = await clusterSelector.callStatic.nodes(1);

    let largeBalance = new BN(data.leftSum.toString()).plus(data.value.toString()).plus(data.rightSum.toString()).div(rndInt).toFixed(0);

    await clusterSelector.connect(updater).insert_unchecked(largeBalAddress, "1");
    await clusterSelector.connect(updater).update_unchecked(largeBalAddress, largeBalance);

    addressesToNote.push(largeBalAddress);
  }

  return addressesToNote;
}