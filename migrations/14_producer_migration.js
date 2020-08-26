let Producer = artifacts.require("Producer.sol");
let ProducerProxy = artifacts.require("ProducerProxy.sol");

// module.exports = async function (deployer, network, accounts) {
//     deployer.deploy(Producer);
// }

module.exports = async function(deployer) {
    await deployer
    .deploy(Producer)
    .then(function () {
      return deployer.deploy(ProducerProxy, Producer.address);
    });
}