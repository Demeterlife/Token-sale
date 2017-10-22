require('babel-register');
require('babel-polyfill');

module.exports = {
  solc: {
    optimizer: {
      enabled: true,
      runs: 200
    }
  },
  networks: {
    development: {
      host: "localhost",
      port: 8545,
      gas: 0xFFFFFF,
      network_id: "*" // Match any network id
    },
    ropsten_parity: {
      host: "localhost",
      port: 9545,
      network_id: 3,
      gas: 5500000
    },
    ropsten_geth: {
      host: "localhost",
      port: 10545,
      network_id: 3
    },
    live: {
      host: "178.25.19.88", // Random IP for example purposes (do not use)
      port: 80,
      network_id: 1,        // Ethereum public network
      // optional config values:
      // gas
      // gasPrice
      // from - default address to use for any transaction Truffle makes during migrations
      // provider - web3 provider instance Truffle should use to talk to the Ethereum network.
      //          - if specified, host and port are ignored.
    }
  }
};
