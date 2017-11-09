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
    ropsten: {
      host: "localhost",
      port: 9545,
      network_id: 3, // Ropsten network
      gas: 5500000
    },
    live: {
      host: "192.168.1.128",
      port: 8545,
      network_id: 1,        // Ethereum public network
      gas: 5500000
    }
  }
};
