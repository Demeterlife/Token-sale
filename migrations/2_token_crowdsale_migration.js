var DemeterCrowdsale = artifacts.require("DemeterCrowdsale");

module.exports = function(deployer) {
  /* No need to deploy the token contract, as the crowdsale will create one upon construction */
  deployer.deploy(DemeterCrowdsale,
    new Date('2017/11/18 11:00:00 UTC').getTime()/1000, // _startTime
    new Date('2017/12/18 10:59:59 UTC').getTime()/1000, // _endTime
    new Date('2017/11/15 10:59:59 UTC').getTime()/1000, // _whiteListRegistrationEndTime
    new Date('2017/11/23 10:59:59 UTC').getTime()/1000, // _whiteListEndTime
    2300, // rate
    web3.toWei(26086.96, 'ether'), // _cap
    web3.toWei(4000, 'ether'), // _goal
    "0x18061456803b185583C84780C55e667BC7B71F7D" // _wallet
  );
};
