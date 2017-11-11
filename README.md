# Demeter Crowdsale Contracts

This repository contains the contracts for the [Demeter.life][demetersite] corwdsale.

![Demeter.life logo](demeter.png)

## Contracts

Please see the [contracts/](contracts) directory.

## Develop

Contracts are written in [Solidity][solidity] and tested using [Truffle][truffle] and [testrpc][testrpc].

### Depenencies

```
# Install Truffle and testrpc packages globally:
npm install -g truffle ethereumjs-testrpc

# Install local node dependencies:
npm install
```

### Test

```
# Start a testrpc instance
scripts\start_testrpc.cmd

# Compile and test the contracts
truffle test
```

### Contract behaviour

This crowdsale is divided into 5 phases

-Phase 1: Investors can register on a whitelist.

-Phase 2: Whitelist is closed, referral is possible through referral code.

-Phase 3: Crowdsale starts for whitelisted and referred investors, investors can still be referred by whitelisted investors. Whitelisted investors buying tokens will get a bonus of 10%. Referred investors will get a 5% bonus while their referrer will get 5% as well. Non-whitelisted or referred investors cannot buy tokens.

-Phase 4: Crowdsale is opened to everyone. Whitelisted investor will get a 5% bonus. Referred investors will get a 2.5% bonus while their referrer will get 2.5% as well. Non-whitelisted or referred investor can buy tokens but will not get any bonus.

-Phase 5: Crowdsale is closed and tokens become transferable. When the crowdsale ends, funds are either trasferred to the company wallet or, if the minimum goal is not reached, sent to a RefundVault from which they can be withdrawn by the investors as a refund. The minimum goal can be adjusted by the owner during the sale.

[demetersite]: https://demeter.life
[solidity]: https://solidity.readthedocs.io/en/develop/
[truffle]: http://truffleframework.com/
[testrpc]: https://github.com/ethereumjs/testrpc
