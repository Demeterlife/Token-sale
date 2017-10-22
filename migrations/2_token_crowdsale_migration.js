var DemeterCrowdsale = artifacts.require("DemeterCrowdsale");

module.exports = function(deployer) {
  /* No need to deploy the token contract, as the crowdsale will create one upon construction */
  deployer.deploy(DemeterCrowdsale,
    new Date('2017/10/24 12:00:00 GMT+0200').getTime(), // _startTime
    new Date('2017/10/26 12:00:00 GMT+0200').getTime(), // _endTime
    new Date('2017/10/24 12:00:00 GMT+0200').getTime(), // _whiteListRegistrationEndTime
    new Date('2017/10/25 12:00:00 GMT+0200').getTime(), // _whiteListEndTime
    100, // rate
    web3.toWei(10, 'ether'), // _cap
    web3.toWei(5, 'ether'), // _goal
    "0x18061456803b185583C84780C55e667BC7B71F7D" // _wallet
  );
};