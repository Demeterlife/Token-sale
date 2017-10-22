var DemeterCrowdsale = artifacts.require("DemeterCrowdsale");

module.exports = function(deployer) {
  /* No need to deploy the token contract, as the crowdsale will create one upon construction */
  deployer.deploy(DemeterCrowdsale,
    new Date("2017-10-18T00:00:00").getTime(), // _startTime
    new Date("2017-10-22T00:00:00").getTime(), // _endTime
    new Date("2017-10-18T00:00:00").getTime(), // _whiteListRegistrationEndTime
    new Date("2017-10-20T00:00:00").getTime(), // _whiteListEndTime
    1000, // rate
    web3.toWei(20, 'ether'), // _cap
    web3.toWei(10, 'ether'), // _goal
    "0x54e8c175e86ed0c6e676936f514a8180d9ef6fc3" // _wallet
  );
};
