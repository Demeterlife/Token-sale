import ether from './zeppelin-solidity/helpers/ether'
import { advanceBlock } from './zeppelin-solidity/helpers/advanceToBlock'
import { increaseTimeTo, duration } from './zeppelin-solidity/helpers/increaseTime'
import latestTime from './zeppelin-solidity/helpers/latestTime'
import EVMThrow from './zeppelin-solidity/helpers/EVMThrow'

const BigNumber = web3.BigNumber;

const should = require('chai')
  .use(require('chai-as-promised'))
  .use(require('chai-bignumber')(BigNumber))
  .should();

const DemeterCrowdsale = artifacts.require('DemeterCrowdsale');
const DemeterToken = artifacts.require('DemeterToken');

contract('DemeterCrowdsale', function ([
  whiteListedInvestor, // default sender for all transactions
  nonWhiteListedInvestor,
  referredInvestor,
  normalInvestor,
  otherAddress,
  owner
]) {

  const RATE = new BigNumber(3000);
  const CAP = ether(20);
  const LESS_THAN_CAP = ether(18);
  const GOAL = ether(10);
  const LESS_THAN_GOAL = ether(8);

  const INVESTED_AMOUNT = ether(1);
  const EXPECTED_TOKEN_AMOUNT = RATE.mul(INVESTED_AMOUNT);

  const PERC_TOKENS_TO_INVESTOR = 30;
  const WHITELIST_BONUS_RATE = 10;
  const REFERRAL_BONUS_RATE = 5;

  const PERC_TOKENS_TO_DEV = 20;
  const PERC_TOKENS_TO_BIZDEV = 25;

  const WALLET = "0x18061456803b185583C84780C55e667BC7B71F7D".toLowerCase(); // multi-sig wallet
  const RELEASE_WALLET = "0x867D85437d27cA97e1EB574250efbba487aca637".toLowerCase();
  const DEV_WALLET = "0x70323222694584c68BD5a29194bb72c248e715F7".toLowerCase();
  const BIZDEV_WALLET = "0xE43053e265F04f690021735E02BBA559Cea681D6".toLowerCase();

  const REFCODE1 = "REFCODE1";
  const REFCODE2 = "REFCODE2";

  before(async function () {
    // Advance to the next block to correctly read time in the solidity "now" function interpreted by testrpc
    await advanceBlock();
  })

  beforeEach(async function () {
    this.startTime = latestTime() + duration.weeks(1);
    this.whiteListRegistrationEndTime = this.startTime - duration.seconds(1);
    this.whiteListEndTime = this.startTime + duration.days(2);
    this.endTime = this.startTime + duration.weeks(1);

    this.beforeStartTime = this.startTime - duration.hours(1);
    this.beforeWhiteListRegistrationEndTime = this.whiteListRegistrationEndTime - duration.hours(1);
    this.afterWhiteListRegistrationEndTime = this.whiteListRegistrationEndTime + duration.seconds(1);
    this.afterEndTime = this.endTime + duration.seconds(1);
    this.beforeEndTime = this.endTime + duration.hours(1);
    this.afterWhiteListEndTime = this.whiteListEndTime + duration.seconds(1);

    this.crowdsale = await DemeterCrowdsale.new(
      this.startTime,
      this.endTime,
      this.whiteListRegistrationEndTime,
      this.whiteListEndTime,
      RATE,
      CAP,
      GOAL,
      WALLET,
      { from: owner });
    this.token = DemeterToken.at(await this.crowdsale.token());

    // Crowdsale is setup with a small white list of 1 whiteListedInvestor.
    // Taking a chance to exercise loadWhiteList here as addWhiteListedInvestor is tested elsewhere.
    await this.crowdsale.loadWhiteList([whiteListedInvestor], [web3.sha3(REFCODE1)], { from: owner });
    //await this.crowdsale.addWhiteListedInvestor(whiteListedInvestor, REFCODE1);
  });

  it('should create crowdsale with correct parameters', async function () {
    this.crowdsale.should.exist;
    this.token.should.exist;

    (await this.crowdsale.owner()).should.be.equal(owner);
    (await this.crowdsale.startTime()).should.be.bignumber.equal(this.startTime);
    (await this.crowdsale.endTime()).should.be.bignumber.equal(this.endTime);
    (await this.crowdsale.rate()).should.be.bignumber.equal(RATE);
    (await this.crowdsale.wallet()).should.be.equal(WALLET);
    (await this.crowdsale.cap()).should.be.bignumber.equal(CAP);
    (await this.crowdsale.goal()).should.be.bignumber.equal(GOAL);
  });

  it('should be the owner of the token contract', async function () {
    const owner = await this.token.owner();
    owner.should.equal(this.crowdsale.address);
  });

  it('should be ended only after end', async function () {
    await increaseTimeTo(this.startTime);
    var ended = await this.crowdsale.hasEnded();
    ended.should.be.false;
    await increaseTimeTo(this.afterEndTime);
    ended = await this.crowdsale.hasEnded();
    ended.should.be.true;
  });

  it('should not accept payments before start', async function () {
    await this.crowdsale.send(INVESTED_AMOUNT).should.be.rejectedWith(EVMThrow);
    await this.crowdsale.buyTokens(whiteListedInvestor, { value: INVESTED_AMOUNT }).should.be.rejectedWith(EVMThrow);
  });

  it('should accept payments during the sale', async function () {
    await increaseTimeTo(this.startTime);
    await this.crowdsale.send(INVESTED_AMOUNT).should.be.fulfilled;
    await this.crowdsale.buyTokens(whiteListedInvestor, { value: INVESTED_AMOUNT }).should.be.fulfilled;
  });

  it('should reject payments after end', async function () {
    await increaseTimeTo(this.afterEnd);
    await this.crowdsale.send(INVESTED_AMOUNT).should.be.rejectedWith(EVMThrow);
    await this.crowdsale.buyTokens(whiteListedInvestor, { value: INVESTED_AMOUNT }).should.be.rejectedWith(EVMThrow);
  });

  it('should reject payments over cap', async function () {
    await increaseTimeTo(this.startTime);
    await this.crowdsale.send(CAP);
    await this.crowdsale.send(1).should.be.rejectedWith(EVMThrow);
  });

  it('should allow finalization and transfer funds to wallet if the goal is reached', async function () {
    await increaseTimeTo(this.startTime);
    await this.crowdsale.send(GOAL);

    const beforeFinalization = web3.eth.getBalance(WALLET);
    await increaseTimeTo(this.afterEndTime);
    await this.crowdsale.finalize({ from: owner });

    const afterFinalization = web3.eth.getBalance(WALLET);
    afterFinalization.minus(beforeFinalization).should.be.bignumber.equal(GOAL);
  });

  it('should allow refunds if the goal is not reached', async function () {
    const balanceBeforeInvestment = web3.eth.getBalance(whiteListedInvestor);

    await increaseTimeTo(this.startTime);
    await this.crowdsale.sendTransaction({ value: LESS_THAN_GOAL, gasPrice: 0 });

    await increaseTimeTo(this.afterEndTime);
    await this.crowdsale.finalize({ from: owner });
    await this.crowdsale.claimRefund({ gasPrice: 0 }).should.be.fulfilled;

    const balanceAfterRefund = web3.eth.getBalance(whiteListedInvestor);
    balanceBeforeInvestment.should.be.bignumber.equal(balanceAfterRefund);
  });

  it('should allow immediate finalization and transfer funds to wallet if the cap is reached', async function () {
    await increaseTimeTo(this.startTime);
    await this.crowdsale.send(CAP);

    const beforeFinalization = web3.eth.getBalance(WALLET);

    await this.crowdsale.finalize({ from: owner });

    const afterFinalization = web3.eth.getBalance(WALLET);
    afterFinalization.minus(beforeFinalization).should.be.bignumber.equal(CAP);
  });

  describe('TimeLockedToken', function () {

    it('should not allow transfering tokens before the end of the crowdsale', async function () {
      await increaseTimeTo(this.afterWhiteListEndTime);
      await this.crowdsale.sendTransaction({ value: INVESTED_AMOUNT, from: normalInvestor });
      await this.token.transfer(otherAddress, EXPECTED_TOKEN_AMOUNT, { from: normalInvestor }).should.be.rejectedWith(EVMThrow);
    });

    it('should allow transfering tokens after the end of the crowdsale', async function () {
      await increaseTimeTo(this.afterWhiteListEndTime);
      await this.crowdsale.sendTransaction({ value: INVESTED_AMOUNT, from: normalInvestor });
      await increaseTimeTo(this.afterEndTime);
      await this.token.transfer(otherAddress, EXPECTED_TOKEN_AMOUNT, { from: normalInvestor }).should.be.fulfilled;
    });

  });

  describe('Creating a DemeterCrowdsale', function () {

    it('should fail with zero cap', async function () {
      await DemeterCrowdsale.new(
        this.startTime,
        this.endTime,
        this.whiteListRegistrationEndTime,
        this.whiteListEndTime,
        RATE,
        0,
        GOAL,
        WALLET,
        { from: owner }).should.be.rejectedWith(EVMThrow);
    });

    it('should fail with zero goal', async function () {
      await DemeterCrowdsale.new(
        this.startTime,
        this.endTime,
        this.whiteListRegistrationEndTime,
        this.whiteListEndTime,
        RATE,
        CAP,
        0,
        WALLET,
        { from: owner }).should.be.rejectedWith(EVMThrow);
    });

    it('should fail if whiteListEndTime is before startTime', async function () {
      await DemeterCrowdsale.new(
        this.startTime,
        this.endTime,
        this.whiteListRegistrationEndTime,
        this.beforeStartTime,
        RATE,
        CAP,
        GOAL,
        WALLET,
        { from: owner }).should.be.rejectedWith(EVMThrow);
    });

  });

  describe('WhiteListCrowdsale', function () {

    it('should send event ReferredBonusTokensEmitted', async function () {
      await increaseTimeTo(this.startTime);
      await this.crowdsale.addReferredInvestor(REFCODE1, referredInvestor);
      const { logs } = await this.crowdsale.sendTransaction({ value: INVESTED_AMOUNT, from: referredInvestor });
      const event = logs.find(e => e.event === 'ReferredBonusTokensEmitted');
      should.exist(event);
      event.args.beneficiary.should.equal(referredInvestor);
      event.args.amount.should.be.bignumber.equal(EXPECTED_TOKEN_AMOUNT.mul(REFERRAL_BONUS_RATE).div(100));
    });

    it('should send event WhiteListBonusTokensEmitted', async function () {
      await increaseTimeTo(this.startTime);
      await this.crowdsale.addReferredInvestor(REFCODE1, referredInvestor);
      const { logs } = await this.crowdsale.sendTransaction({ value: INVESTED_AMOUNT, from: referredInvestor });
      const event = logs.find(e => e.event === 'WhiteListBonusTokensEmitted');
      should.exist(event);
      event.args.beneficiary.should.equal(whiteListedInvestor);
      event.args.amount.should.be.bignumber.equal(EXPECTED_TOKEN_AMOUNT.mul(REFERRAL_BONUS_RATE).div(100));
    });

    it('should assign bonus tokens to the whitelisted whiteListedInvestor and referred whiteListedInvestor during the whitelist period', async function () {
      await increaseTimeTo(this.startTime);
      await this.crowdsale.addReferredInvestor(REFCODE1, referredInvestor);
      await this.crowdsale.sendTransaction({ value: INVESTED_AMOUNT, from: referredInvestor });
      const totalBonus = EXPECTED_TOKEN_AMOUNT.mul(WHITELIST_BONUS_RATE).div(100);
      const investorBalance = await this.token.balanceOf(whiteListedInvestor);
      const referrerBonus = EXPECTED_TOKEN_AMOUNT.mul(REFERRAL_BONUS_RATE).div(100);
      investorBalance.should.be.bignumber.equal(referrerBonus);
      const referredInvestorBalance = await this.token.balanceOf(referredInvestor);
      const referredBonus = totalBonus.sub(referrerBonus);
      referredInvestorBalance.should.be.bignumber.equal(EXPECTED_TOKEN_AMOUNT.add(referredBonus));
    })

    it('should assign half bonus tokens to the whitelisted whiteListedInvestor and referred whiteListedInvestor after the whitelist period', async function () {
      await increaseTimeTo(this.afterWhiteListEndTime);
      await this.crowdsale.addReferredInvestor(REFCODE1, referredInvestor);
      await this.crowdsale.sendTransaction({ value: INVESTED_AMOUNT, from: referredInvestor });
      const totalBonus = EXPECTED_TOKEN_AMOUNT.mul(WHITELIST_BONUS_RATE / 2).div(100);
      const investorBalance = await this.token.balanceOf(whiteListedInvestor);
      const referrerBonus = EXPECTED_TOKEN_AMOUNT.mul(REFERRAL_BONUS_RATE / 2).div(100);
      investorBalance.should.be.bignumber.equal(referrerBonus);
      const referredInvestorBalance = await this.token.balanceOf(referredInvestor);
      const referredBonus = totalBonus.sub(referrerBonus);
      referredInvestorBalance.should.be.bignumber.equal(EXPECTED_TOKEN_AMOUNT.add(referredBonus));
    });

    it('should send event WhiteListBonusTokensEmitted', async function () {
      await increaseTimeTo(this.startTime);
      const { logs } = await this.crowdsale.sendTransaction({ value: INVESTED_AMOUNT, from: whiteListedInvestor });
      const event = logs.find(e => e.event === 'WhiteListBonusTokensEmitted');
      should.exist(event);
      event.args.beneficiary.should.equal(whiteListedInvestor);
      event.args.amount.should.be.bignumber.equal(EXPECTED_TOKEN_AMOUNT.mul(WHITELIST_BONUS_RATE).div(100));
    });

    it('should assign bonus tokens to the whitelisted whiteListedInvestor during the whitelist period', async function () {
      await increaseTimeTo(this.startTime);
      await this.crowdsale.sendTransaction({ value: INVESTED_AMOUNT, from: whiteListedInvestor });
      const tokenBalance = await this.token.balanceOf(whiteListedInvestor);
      tokenBalance.should.be.bignumber.equal(EXPECTED_TOKEN_AMOUNT.mul(100 + WHITELIST_BONUS_RATE).div(100));
    })

    it('should assign half bonus tokens to the whitelisted whiteListedInvestor after the whitelist period', async function () {
      await increaseTimeTo(this.afterWhiteListEndTime);
      await this.crowdsale.sendTransaction({ value: INVESTED_AMOUNT, from: whiteListedInvestor });
      const tokenBalance = await this.token.balanceOf(whiteListedInvestor);
      tokenBalance.should.be.bignumber.equal(EXPECTED_TOKEN_AMOUNT.mul(100 + WHITELIST_BONUS_RATE / 2).div(100));
    });

    it('should not assign bonus tokens to the non whitelisted whiteListedInvestor after the whitelist period', async function () {
      await increaseTimeTo(this.afterWhiteListEndTime);
      await this.crowdsale.sendTransaction({ value: INVESTED_AMOUNT, from: normalInvestor });
      const tokenBalance = await this.token.balanceOf(normalInvestor);
      tokenBalance.should.be.bignumber.equal(EXPECTED_TOKEN_AMOUNT);
    });

    it('should send event CompanyTokensIssued during the whitelist period for whitelisted purchase', async function () {
      await increaseTimeTo(this.startTime);
      const { logs } = await this.crowdsale.sendTransaction({ value: INVESTED_AMOUNT, from: whiteListedInvestor });
      const event = logs.find(e => e.event === 'CompanyTokensIssued');
      should.exist(event);
      event.args.investor.should.equal(whiteListedInvestor);
      event.args.value.should.be.bignumber.equal(INVESTED_AMOUNT);
      const companyTokens = EXPECTED_TOKEN_AMOUNT.mul(100 - PERC_TOKENS_TO_INVESTOR).div(PERC_TOKENS_TO_INVESTOR);
      const totalTokens = EXPECTED_TOKEN_AMOUNT.add(companyTokens);
      const bonusTokens = EXPECTED_TOKEN_AMOUNT.mul(WHITELIST_BONUS_RATE).div(100);
      const devTokens = totalTokens.mul(PERC_TOKENS_TO_DEV).div(100);
      const bizDevTokens = (totalTokens.mul(PERC_TOKENS_TO_BIZDEV).div(100)).sub(bonusTokens);
      const actualCompanyTokens = companyTokens.sub(bonusTokens);
      const releaseTokens = actualCompanyTokens.sub(bizDevTokens).sub(devTokens);
      event.args.amount.should.be.bignumber.equal(actualCompanyTokens);
    });

    it('should send event CompanyTokensIssued after the whitelist period for whitelisted purchase', async function () {
      await increaseTimeTo(this.afterWhiteListEndTime);
      const { logs } = await this.crowdsale.sendTransaction({ value: INVESTED_AMOUNT, from: whiteListedInvestor });
      const event = logs.find(e => e.event === 'CompanyTokensIssued');
      should.exist(event);
      event.args.investor.should.equal(whiteListedInvestor);
      event.args.value.should.be.bignumber.equal(INVESTED_AMOUNT);
      const companyTokens = EXPECTED_TOKEN_AMOUNT.mul(100 - PERC_TOKENS_TO_INVESTOR).div(PERC_TOKENS_TO_INVESTOR);
      const totalTokens = EXPECTED_TOKEN_AMOUNT.add(companyTokens);
      const bonusTokens = EXPECTED_TOKEN_AMOUNT.mul(WHITELIST_BONUS_RATE / 2).div(100);
      const devTokens = totalTokens.mul(PERC_TOKENS_TO_DEV).div(100);
      const bizDevTokens = (totalTokens.mul(PERC_TOKENS_TO_BIZDEV).div(100)).sub(bonusTokens);
      const actualCompanyTokens = companyTokens.sub(bonusTokens);
      const releaseTokens = actualCompanyTokens.sub(bizDevTokens).sub(devTokens);
      event.args.amount.should.be.bignumber.equal(actualCompanyTokens);
    });

    it('should send event CompanyTokensIssued after the whitelist period for normal purchase', async function () {
      await increaseTimeTo(this.afterWhiteListEndTime);
      const { logs } = await this.crowdsale.sendTransaction({ value: INVESTED_AMOUNT, from: normalInvestor });
      const event = logs.find(e => e.event === 'CompanyTokensIssued');
      should.exist(event);
      event.args.investor.should.equal(normalInvestor);
      event.args.value.should.be.bignumber.equal(INVESTED_AMOUNT);
      const companyTokens = EXPECTED_TOKEN_AMOUNT.mul(100 - PERC_TOKENS_TO_INVESTOR).div(PERC_TOKENS_TO_INVESTOR);
      event.args.amount.should.be.bignumber.equal(companyTokens);
    });

    it('should assign tokens to the company and whiteListedInvestor during the whitelist period for whitelisted purchase', async function () {
      await increaseTimeTo(this.startTime);
      await this.crowdsale.sendTransaction({ value: INVESTED_AMOUNT, from: whiteListedInvestor });
      const tokenBalance = await this.token.balanceOf(whiteListedInvestor);
      const companyTokens = EXPECTED_TOKEN_AMOUNT.mul(100 - PERC_TOKENS_TO_INVESTOR).div(PERC_TOKENS_TO_INVESTOR);
      const totalTokens = EXPECTED_TOKEN_AMOUNT.add(companyTokens);
      const bonusTokens = EXPECTED_TOKEN_AMOUNT.mul(WHITELIST_BONUS_RATE).div(100);
      tokenBalance.should.be.bignumber.equal(EXPECTED_TOKEN_AMOUNT.add(bonusTokens));

      const devTokens = totalTokens.mul(PERC_TOKENS_TO_DEV).div(100);
      const devTokenBalance = await this.token.balanceOf(DEV_WALLET);
      devTokenBalance.should.be.bignumber.equal(devTokens);

      const bizDevTokens = (totalTokens.mul(PERC_TOKENS_TO_BIZDEV).div(100)).sub(bonusTokens);
      const bizDevTokenBalance = await this.token.balanceOf(BIZDEV_WALLET);
      bizDevTokenBalance.should.be.bignumber.equal(bizDevTokens);

      const actualCompanyTokens = companyTokens.sub(bonusTokens);
      const releaseTokens = actualCompanyTokens.sub(bizDevTokens).sub(devTokens);
      const releaseTokenBalance = await this.token.balanceOf(RELEASE_WALLET);
      releaseTokenBalance.should.be.bignumber.equal(releaseTokens);
    });

    it('should assign tokens to the company and whiteListedInvestor during the whitelist period for referred purchase', async function () {
      await increaseTimeTo(this.startTime);
      await this.crowdsale.addReferredInvestor(REFCODE1, referredInvestor);
      await this.crowdsale.sendTransaction({ value: INVESTED_AMOUNT, from: referredInvestor });
      const tokenBalance = await this.token.balanceOf(referredInvestor);
      const companyTokens = EXPECTED_TOKEN_AMOUNT.mul(100 - PERC_TOKENS_TO_INVESTOR).div(PERC_TOKENS_TO_INVESTOR);
      const totalTokens = EXPECTED_TOKEN_AMOUNT.add(companyTokens);
      const investorBonusTokens = EXPECTED_TOKEN_AMOUNT.mul(REFERRAL_BONUS_RATE).div(100);
      tokenBalance.should.be.bignumber.equal(EXPECTED_TOKEN_AMOUNT.add(investorBonusTokens));
      const totalBonusTokens = EXPECTED_TOKEN_AMOUNT.mul(WHITELIST_BONUS_RATE).div(100);

      const devTokens = totalTokens.mul(PERC_TOKENS_TO_DEV).div(100);
      const devTokenBalance = await this.token.balanceOf(DEV_WALLET);
      devTokenBalance.should.be.bignumber.equal(devTokens);

      const bizDevTokens = (totalTokens.mul(PERC_TOKENS_TO_BIZDEV).div(100)).sub(totalBonusTokens);
      const bizDevTokenBalance = await this.token.balanceOf(BIZDEV_WALLET);
      bizDevTokenBalance.should.be.bignumber.equal(bizDevTokens);

      const actualCompanyTokens = companyTokens.sub(totalBonusTokens);
      const releaseTokens = actualCompanyTokens.sub(bizDevTokens).sub(devTokens);
      const releaseTokenBalance = await this.token.balanceOf(RELEASE_WALLET);
      releaseTokenBalance.should.be.bignumber.equal(releaseTokens);
    });

    it('should assign tokens to the company and whiteListedInvestor after the whitelist period for whitelisted purchase', async function () {
      await increaseTimeTo(this.afterWhiteListEndTime);
      await this.crowdsale.sendTransaction({ value: INVESTED_AMOUNT, from: whiteListedInvestor });
      const tokenBalance = await this.token.balanceOf(whiteListedInvestor);
      const companyTokens = EXPECTED_TOKEN_AMOUNT.mul(100 - PERC_TOKENS_TO_INVESTOR).div(PERC_TOKENS_TO_INVESTOR);
      const totalTokens = EXPECTED_TOKEN_AMOUNT.add(companyTokens);
      const bonusTokens = EXPECTED_TOKEN_AMOUNT.mul(WHITELIST_BONUS_RATE / 2).div(100);
      tokenBalance.should.be.bignumber.equal(EXPECTED_TOKEN_AMOUNT.add(bonusTokens));

      const devTokens = totalTokens.mul(PERC_TOKENS_TO_DEV).div(100);
      const devTokenBalance = await this.token.balanceOf(DEV_WALLET);
      devTokenBalance.should.be.bignumber.equal(devTokens);

      const bizDevTokens = (totalTokens.mul(PERC_TOKENS_TO_BIZDEV).div(100)).sub(bonusTokens);
      const bizDevTokenBalance = await this.token.balanceOf(BIZDEV_WALLET);
      bizDevTokenBalance.should.be.bignumber.equal(bizDevTokens);

      const actualCompanyTokens = companyTokens.sub(bonusTokens);
      const releaseTokens = actualCompanyTokens.sub(bizDevTokens).sub(devTokens);
      const releaseTokenBalance = await this.token.balanceOf(RELEASE_WALLET);
      releaseTokenBalance.should.be.bignumber.equal(releaseTokens);
    });

    it('should assign tokens to the company and whiteListedInvestor after the whitelist period for referred purchase', async function () {
      await increaseTimeTo(this.afterWhiteListEndTime);
      await this.crowdsale.addReferredInvestor(REFCODE1, referredInvestor);
      await this.crowdsale.sendTransaction({ value: INVESTED_AMOUNT, from: referredInvestor });
      const tokenBalance = await this.token.balanceOf(referredInvestor);
      const companyTokens = EXPECTED_TOKEN_AMOUNT.mul(100 - PERC_TOKENS_TO_INVESTOR).div(PERC_TOKENS_TO_INVESTOR);
      const totalTokens = EXPECTED_TOKEN_AMOUNT.add(companyTokens);
      const investorBonusTokens = EXPECTED_TOKEN_AMOUNT.mul(REFERRAL_BONUS_RATE / 2).div(100);
      tokenBalance.should.be.bignumber.equal(EXPECTED_TOKEN_AMOUNT.add(investorBonusTokens));
      const totalBonusTokens = EXPECTED_TOKEN_AMOUNT.mul(REFERRAL_BONUS_RATE).div(100);

      const devTokens = totalTokens.mul(PERC_TOKENS_TO_DEV).div(100);
      const devTokenBalance = await this.token.balanceOf(DEV_WALLET);
      devTokenBalance.should.be.bignumber.equal(devTokens);

      const bizDevTokens = (totalTokens.mul(PERC_TOKENS_TO_BIZDEV).div(100)).sub(totalBonusTokens);
      const bizDevTokenBalance = await this.token.balanceOf(BIZDEV_WALLET);
      bizDevTokenBalance.should.be.bignumber.equal(bizDevTokens);

      const actualCompanyTokens = companyTokens.sub(totalBonusTokens);
      const releaseTokens = actualCompanyTokens.sub(bizDevTokens).sub(devTokens);
      const releaseTokenBalance = await this.token.balanceOf(RELEASE_WALLET);
      releaseTokenBalance.should.be.bignumber.equal(releaseTokens);
    });

    it('should assign tokens to the company and whiteListedInvestor after the whitelist period for normal purchase', async function () {
      await increaseTimeTo(this.afterWhiteListEndTime);
      await this.crowdsale.sendTransaction({ value: INVESTED_AMOUNT, from: normalInvestor });
      const tokenBalance = await this.token.balanceOf(normalInvestor);
      tokenBalance.should.be.bignumber.equal(EXPECTED_TOKEN_AMOUNT);
      const companyTokens = EXPECTED_TOKEN_AMOUNT.mul(100 - PERC_TOKENS_TO_INVESTOR).div(PERC_TOKENS_TO_INVESTOR);
      const totalTokens = EXPECTED_TOKEN_AMOUNT.add(companyTokens);

      const devTokens = (totalTokens.mul(PERC_TOKENS_TO_DEV).div(100));
      const devTokenBalance = await this.token.balanceOf(DEV_WALLET);
      devTokenBalance.should.be.bignumber.equal(devTokens);

      const bizDevTokens = totalTokens.mul(PERC_TOKENS_TO_BIZDEV).div(100);
      const bizDevTokenBalance = await this.token.balanceOf(BIZDEV_WALLET);
      bizDevTokenBalance.should.be.bignumber.equal(bizDevTokens);

      const releaseTokens = companyTokens.sub(bizDevTokens).sub(devTokens);
      const releaseTokenBalance = await this.token.balanceOf(RELEASE_WALLET);
      releaseTokenBalance.should.be.bignumber.equal(releaseTokens);
    });

    it('should increase totalSupply at each purchase', async function () {
      await increaseTimeTo(this.afterWhiteListEndTime);
      await this.crowdsale.send(INVESTED_AMOUNT);
      const totalSupply = await this.token.totalSupply();
      const companyTokens = EXPECTED_TOKEN_AMOUNT.mul(100 - PERC_TOKENS_TO_INVESTOR).div(PERC_TOKENS_TO_INVESTOR);
      const totalTokens = EXPECTED_TOKEN_AMOUNT.add(companyTokens);
      totalSupply.should.be.bignumber.equal(totalTokens);
    });

    it('should increase totalSupply at each delegate purchase', async function () {
      await increaseTimeTo(this.afterWhiteListEndTime);
      await this.crowdsale.buyTokens(nonWhiteListedInvestor, { value: INVESTED_AMOUNT, from: normalInvestor });
      const totalSupply = await this.token.totalSupply();
      const companyTokens = EXPECTED_TOKEN_AMOUNT.mul(100 - PERC_TOKENS_TO_INVESTOR).div(PERC_TOKENS_TO_INVESTOR);
      const totalTokens = EXPECTED_TOKEN_AMOUNT.add(companyTokens);
      totalSupply.should.be.bignumber.equal(totalTokens);
    });

    it('should assign bizDev tokens minus bonus tokens for whitelisted purchase during whitelist period', async function () {
      await increaseTimeTo(this.startTime);
      await this.crowdsale.sendTransaction({ value: INVESTED_AMOUNT, from: whiteListedInvestor });
      const bonusTokens = EXPECTED_TOKEN_AMOUNT.mul(WHITELIST_BONUS_RATE).div(100);
      const companyTokens = EXPECTED_TOKEN_AMOUNT.mul(100 - PERC_TOKENS_TO_INVESTOR).div(PERC_TOKENS_TO_INVESTOR);
      const totalTokens = EXPECTED_TOKEN_AMOUNT.add(companyTokens);
      // We take out bonus tokens from bizDev amount.
      const bizDevTokens = totalTokens.mul(PERC_TOKENS_TO_BIZDEV).div(100).sub(bonusTokens);
      const bizDevTokenBalance = await this.token.balanceOf(BIZDEV_WALLET);
      bizDevTokenBalance.should.be.bignumber.equal(bizDevTokens);
    });

    it('should assign bizDev tokens minus bonus tokens for whitelisted purchase after whitelist period', async function () {
      await increaseTimeTo(this.afterWhiteListEndTime);
      await this.crowdsale.sendTransaction({ value: INVESTED_AMOUNT, from: whiteListedInvestor });
      const bonusTokens = EXPECTED_TOKEN_AMOUNT.mul(WHITELIST_BONUS_RATE / 2).div(100);
      const companyTokens = EXPECTED_TOKEN_AMOUNT.mul(100 - PERC_TOKENS_TO_INVESTOR).div(PERC_TOKENS_TO_INVESTOR);
      const totalTokens = EXPECTED_TOKEN_AMOUNT.add(companyTokens);
      // We take out bonus tokens from bizDev amount.
      const bizDevTokens = totalTokens.mul(PERC_TOKENS_TO_BIZDEV).div(100).sub(bonusTokens);
      const bizDevTokenBalance = await this.token.balanceOf(BIZDEV_WALLET);
      bizDevTokenBalance.should.be.bignumber.equal(bizDevTokens);
    });

    it('should assign bizDev tokens minus bonus tokens for referred purchase during whitelist period', async function () {
      await increaseTimeTo(this.startTime);
      await this.crowdsale.addReferredInvestor(REFCODE1, referredInvestor);
      await this.crowdsale.sendTransaction({ value: INVESTED_AMOUNT, from: referredInvestor });
      // Don't use REFERRAL_BONUS_RATE here, as we are considering the total bonus (split between referral and referrer).
      const bonusTokens = EXPECTED_TOKEN_AMOUNT.mul(WHITELIST_BONUS_RATE).div(100);
      const companyTokens = EXPECTED_TOKEN_AMOUNT.mul(100 - PERC_TOKENS_TO_INVESTOR).div(PERC_TOKENS_TO_INVESTOR);
      const totalTokens = EXPECTED_TOKEN_AMOUNT.add(companyTokens);
      // We take out bonus tokens from bizDev amount.
      const bizDevTokens = totalTokens.mul(PERC_TOKENS_TO_BIZDEV).div(100).sub(bonusTokens);
      const bizDevTokenBalance = await this.token.balanceOf(BIZDEV_WALLET);
      bizDevTokenBalance.should.be.bignumber.equal(bizDevTokens);
    });

    it('should assign bizDev tokens minus bonus tokens for referred purchase after whitelist period', async function () {
      await increaseTimeTo(this.afterWhiteListEndTime);
      await this.crowdsale.addReferredInvestor(REFCODE1, referredInvestor);
      await this.crowdsale.sendTransaction({ value: INVESTED_AMOUNT, from: referredInvestor });
      // Don't use REFERRAL_BONUS_RATE here, as we are considering the total bonus (split between referral and referrer).
      const bonusTokens = EXPECTED_TOKEN_AMOUNT.mul(WHITELIST_BONUS_RATE / 2).div(100);
      const companyTokens = EXPECTED_TOKEN_AMOUNT.mul(100 - PERC_TOKENS_TO_INVESTOR).div(PERC_TOKENS_TO_INVESTOR);
      const totalTokens = EXPECTED_TOKEN_AMOUNT.add(companyTokens);
      // We take out bonus tokens from bizDev amount.
      const bizDevTokens = totalTokens.mul(PERC_TOKENS_TO_BIZDEV).div(100).sub(bonusTokens);
      const bizDevTokenBalance = await this.token.balanceOf(BIZDEV_WALLET);
      bizDevTokenBalance.should.be.bignumber.equal(bizDevTokens);
    });

    it('should assign full bizDev tokens for normal purchase after whitelist period', async function () {
      await increaseTimeTo(this.afterWhiteListEndTime);
      await this.crowdsale.sendTransaction({ value: INVESTED_AMOUNT, from: normalInvestor });
      const companyTokens = EXPECTED_TOKEN_AMOUNT.mul(100 - PERC_TOKENS_TO_INVESTOR).div(PERC_TOKENS_TO_INVESTOR);
      const totalTokens = EXPECTED_TOKEN_AMOUNT.add(companyTokens);
      const bizDevTokens = totalTokens.mul(PERC_TOKENS_TO_BIZDEV).div(100);
      const bizDevTokenBalance = await this.token.balanceOf(BIZDEV_WALLET);
      bizDevTokenBalance.should.be.bignumber.equal(bizDevTokens);
    });

    it('should allow addition to referred list', async function () {
      const { logs } = await this.crowdsale.addReferredInvestor(REFCODE1, referredInvestor);
      const event = logs.find(e => e.event === 'ReferredInvestorAdded');
      should.exist(event);
      event.args.referredInvestor.should.equal(referredInvestor);
      event.args.referralCode.should.be.equal(REFCODE1);
      const isReferred = await this.crowdsale.isReferred(referredInvestor);
      isReferred.should.be.true;
    });

    it('should not allow addition if already referred', async function () {
      await this.crowdsale.addReferredInvestor(REFCODE1, referredInvestor);
      await this.crowdsale.addReferredInvestor(REFCODE1, referredInvestor).should.be.rejectedWith(EVMThrow);
    });

    it('should not allow addition if referral code is not valid', async function () {
      const referralCode = "INVALID1";
      await this.crowdsale.addReferredInvestor(referralCode, referredInvestor).should.be.rejectedWith(EVMThrow);
    });

    it('should not allow addition if referred investor is whitelisted', async function () {
      await this.crowdsale.addReferredInvestor(REFCODE1, whiteListedInvestor).should.be.rejectedWith(EVMThrow);
    });

    it('should not allow addition if referred investor is 0x0', async function () {
      await this.crowdsale.addReferredInvestor(REFCODE1, 0x0).should.be.rejectedWith(EVMThrow);
    });

    it('should reject payments of referred investor before start', async function () {
      await this.crowdsale.addReferredInvestor(REFCODE1, referredInvestor);
      await increaseTimeTo(this.beforeStartTime);
      await this.crowdsale.sendTransaction({ from: referredInvestor, value: INVESTED_AMOUNT }).should.be.rejectedWith(EVMThrow);
      await this.crowdsale.buyTokens(referredInvestor, { value: INVESTED_AMOUNT, from: otherAddress }).should.be.rejectedWith(EVMThrow);
    });

    it('should allow purchase from referred investor during whitelist period', async function () {
      await this.crowdsale.addReferredInvestor(REFCODE1, referredInvestor);
      await increaseTimeTo(this.startTime);
      await this.crowdsale.sendTransaction({ from: referredInvestor, value: INVESTED_AMOUNT }).should.be.fulfilled;
      await this.crowdsale.buyTokens(referredInvestor, { value: INVESTED_AMOUNT, from: otherAddress }).should.be.fulfilled;
    });

    it('should allow purchase from referred investor after whitelist period', async function () {
      await this.crowdsale.addReferredInvestor(REFCODE1, referredInvestor);
      await increaseTimeTo(this.afterWhiteListEndTime);
      await this.crowdsale.sendTransaction({ value: INVESTED_AMOUNT, from: referredInvestor }).should.be.fulfilled;
      await this.crowdsale.buyTokens(referredInvestor, { value: INVESTED_AMOUNT, from: otherAddress }).should.be.fulfilled;
    });

    it('should reject purchase from referred investor after end', async function () {
      await this.crowdsale.addReferredInvestor(REFCODE1, referredInvestor);
      await increaseTimeTo(this.afterEndTime);
      await this.crowdsale.sendTransaction({ value: INVESTED_AMOUNT, from: referredInvestor }).should.be.rejectedWith(EVMThrow);
      await this.crowdsale.buyTokens(referredInvestor, { value: INVESTED_AMOUNT, from: otherAddress }).should.be.rejectedWith(EVMThrow);
    });

    it('should allow addition to the whitelist during the whitelist registration period', async function () {
      await increaseTimeTo(this.beforeWhiteListRegistrationEndTime);
      const { logs } = await this.crowdsale.addWhiteListedInvestor(nonWhiteListedInvestor, REFCODE2);
      const event = logs.find(e => e.event === 'WhiteListedInvestorAdded');
      should.exist(event);
      event.args.investor.should.equal(nonWhiteListedInvestor);
      event.args.referralCode.should.equal(REFCODE2);
    });

    it('should not allow addition to the whitelist after the whitelist registration period', async function () {
      await increaseTimeTo(this.afterWhiteListRegistrationEndTime);
      await this.crowdsale.addWhiteListedInvestor(nonWhiteListedInvestor, REFCODE2).should.be.rejectedWith(EVMThrow);
    });

    it('should not allow addition of 0x0 address', async function () {
      await this.crowdsale.addWhiteListedInvestor(0, REFCODE2).should.be.rejectedWith(EVMThrow);
    });

    it('should not allow addition of already whitelisted investor', async function () {
      await this.crowdsale.addWhiteListedInvestor(whiteListedInvestor, REFCODE1).should.be.rejectedWith(EVMThrow);
    });

    it('should not allow adding already used referral code', async function () {
      await this.crowdsale.addWhiteListedInvestor(nonWhiteListedInvestor, REFCODE1).should.be.rejectedWith(EVMThrow);
    });

    it('should reject payments from whitelisted investor before start', async function () {
      await increaseTimeTo(this.beforeStartTime);
      await this.crowdsale.sendTransaction({ from: whiteListedInvestor, value: INVESTED_AMOUNT }).should.be.rejectedWith(EVMThrow);
      await this.crowdsale.buyTokens(whiteListedInvestor, { from: otherAddress, value: INVESTED_AMOUNT }).should.be.rejectedWith(EVMThrow);
    });

    it('should reject payments from non whitelisted investor before start', async function () {
      await increaseTimeTo(this.beforeStartTime);
      await this.crowdsale.sendTransaction({ from: nonWhiteListedInvestor, value: INVESTED_AMOUNT }).should.be.rejectedWith(EVMThrow);
      await this.crowdsale.buyTokens(nonWhiteListedInvestor, { from: otherAddress, value: INVESTED_AMOUNT }).should.be.rejectedWith(EVMThrow);
    });

    it('should allow payments from whitelisted investor during whitelist period', async function () {
      await increaseTimeTo(this.startTime);
      await this.crowdsale.sendTransaction({ from: whiteListedInvestor, value: INVESTED_AMOUNT }).should.be.fulfilled;
      await this.crowdsale.buyTokens(whiteListedInvestor, { value: INVESTED_AMOUNT, from: otherAddress }).should.be.fulfilled;
    });

    it('should reject payments from non whitelisted investor during whitelist period', async function () {
      await increaseTimeTo(this.startTime);
      await this.crowdsale.sendTransaction({ from: nonWhiteListedInvestor, value: INVESTED_AMOUNT }).should.be.rejectedWith(EVMThrow);
      await this.crowdsale.buyTokens(nonWhiteListedInvestor, { value: INVESTED_AMOUNT, from: otherAddress }).should.be.rejectedWith(EVMThrow);
    });

    it('should allow payments from non whitelisted investor after whitelist period', async function () {
      await increaseTimeTo(this.afterWhiteListEndTime);
      await this.crowdsale.sendTransaction({ value: INVESTED_AMOUNT, from: nonWhiteListedInvestor }).should.be.fulfilled;
      await this.crowdsale.buyTokens(nonWhiteListedInvestor, { value: INVESTED_AMOUNT, from: otherAddress }).should.be.fulfilled;
    });

    it('should reject payments from whitelisted investor after end', async function () {
      await increaseTimeTo(this.afterEndTime);
      await this.crowdsale.sendTransaction({ value: INVESTED_AMOUNT, from: whiteListedInvestor }).should.be.rejectedWith(EVMThrow);
      await this.crowdsale.buyTokens(whiteListedInvestor, { value: INVESTED_AMOUNT, from: otherAddress }).should.be.rejectedWith(EVMThrow);
    });

    it('should reject payments from non whitelisted investor after end', async function () {
      await increaseTimeTo(this.afterEndTime);
      await this.crowdsale.sendTransaction({ value: INVESTED_AMOUNT, from: nonWhiteListedInvestor }).should.be.rejectedWith(EVMThrow);
      await this.crowdsale.buyTokens(nonWhiteListedInvestor, { value: INVESTED_AMOUNT, from: otherAddress }).should.be.rejectedWith(EVMThrow);
    });

    describe('Direct purchase after whitelist period', function () {

      beforeEach(async function () {
        await increaseTimeTo(this.afterWhiteListEndTime);
      });

      it('should be logged correctly', async function () {
        const { logs } = await this.crowdsale.sendTransaction({ value: INVESTED_AMOUNT, from: whiteListedInvestor });
        const event = logs.find(e => e.event === 'TokenPurchase');
        should.exist(event);
        event.args.purchaser.should.equal(whiteListedInvestor);
        event.args.beneficiary.should.equal(whiteListedInvestor);
        event.args.value.should.be.bignumber.equal(INVESTED_AMOUNT);
        event.args.amount.should.be.bignumber.equal(EXPECTED_TOKEN_AMOUNT);
      });

      it('should assign tokens to investor', async function () {
        await this.crowdsale.sendTransaction({ value: INVESTED_AMOUNT, from: whiteListedInvestor });
        const tokenBalance = await this.token.balanceOf(whiteListedInvestor);
        tokenBalance.should.be.bignumber.equal(EXPECTED_TOKEN_AMOUNT.mul(100 + (WHITELIST_BONUS_RATE / 2)).div(100));
      });

    });

    describe('Delegate purchase after whitelist period', function () {

      beforeEach(async function () {
        await increaseTimeTo(this.afterWhiteListEndTime);
      })

      it('should be logged correctly', async function () {
        const { logs } = await this.crowdsale.buyTokens(whiteListedInvestor, { value: INVESTED_AMOUNT, from: otherAddress });
        const event = logs.find(e => e.event === 'TokenPurchase')
        should.exist(event);
        event.args.purchaser.should.equal(otherAddress);
        event.args.beneficiary.should.equal(whiteListedInvestor);
        event.args.value.should.be.bignumber.equal(INVESTED_AMOUNT);
        event.args.amount.should.be.bignumber.equal(EXPECTED_TOKEN_AMOUNT);
      });

      it('should assign tokens to beneficiary', async function () {
        await this.crowdsale.buyTokens(whiteListedInvestor, { value: INVESTED_AMOUNT, from: otherAddress });
        const tokenBalance = await this.token.balanceOf(whiteListedInvestor);
        tokenBalance.should.be.bignumber.equal(EXPECTED_TOKEN_AMOUNT.mul(100 + (WHITELIST_BONUS_RATE / 2)).div(100));
      });

    });

  });

  describe('CappedCrowdsale', function () {

    beforeEach(async function () {
      await increaseTimeTo(this.afterWhiteListEndTime);
    });

    it('should accept payments within cap', async function () {
      await this.crowdsale.send(CAP.minus(LESS_THAN_CAP)).should.be.fulfilled;
      await this.crowdsale.send(LESS_THAN_CAP).should.be.fulfilled;
    });

    it('should reject payments after reaching the cap', async function () {
      await this.crowdsale.send(CAP);
      await this.crowdsale.send(1).should.be.rejectedWith(EVMThrow);
    });

    it('should end when cap is reached', async function () {
      await this.crowdsale.send(CAP);
      const hasEnded = await this.crowdsale.hasEnded();
      hasEnded.should.be.true;
    });

    it('should reject payments exceeding the cap', async function () {
      await this.crowdsale.send(CAP.plus(1)).should.be.rejectedWith(EVMThrow);
    });

    it('should not end if under cap', async function () {
      var hasEnded = await this.crowdsale.hasEnded();
      hasEnded.should.be.false;
      await this.crowdsale.send(LESS_THAN_CAP);
      hasEnded = await this.crowdsale.hasEnded();
      hasEnded.should.be.false;
    });

    it('should not end if just under cap', async function () {
      await this.crowdsale.send(CAP.minus(1));
      const hasEnded = await this.crowdsale.hasEnded();
      hasEnded.should.be.false;
    });

  });

  describe('RefundableCrowdsale', function () {

    it('should deny refunds before end', async function () {
      await this.crowdsale.claimRefund().should.be.rejectedWith(EVMThrow);
      await increaseTimeTo(this.beforeEndTime);
      await this.crowdsale.claimRefund().should.be.rejectedWith(EVMThrow);
    });

    it('should deny refunds after end if goal was reached', async function () {
      await increaseTimeTo(this.startTime);
      await this.crowdsale.sendTransaction({ value: GOAL, from: whiteListedInvestor });
      await increaseTimeTo(this.endTime);
      await this.crowdsale.claimRefund({ from: whiteListedInvestor }).should.be.rejectedWith(EVMThrow);
    });

    it('should allow refunds after end if goal was not reached', async function () {
      await increaseTimeTo(this.startTime);
      await this.crowdsale.sendTransaction({ value: LESS_THAN_GOAL, from: whiteListedInvestor });
      await increaseTimeTo(this.endTime);
      await this.crowdsale.finalize({ from: owner });
      const pre = web3.eth.getBalance(whiteListedInvestor);
      await this.crowdsale.claimRefund({ from: whiteListedInvestor, gasPrice: 0 }).should.be.fulfilled;
      const post = web3.eth.getBalance(whiteListedInvestor);
      post.minus(pre).should.be.bignumber.equal(LESS_THAN_GOAL);
    });

    it('should forward funds to wallet after end if goal was reached', async function () {
      await increaseTimeTo(this.startTime);
      await this.crowdsale.sendTransaction({ value: GOAL, from: whiteListedInvestor });
      await increaseTimeTo(this.endTime);
      const wallet = await this.crowdsale.wallet();
      const pre = web3.eth.getBalance(wallet);
      await this.crowdsale.finalize({ from: owner });
      const post = web3.eth.getBalance(wallet);
      post.minus(pre).should.be.bignumber.equal(GOAL);
    });

  });

  describe('Pausable', function () {

    it('should reject a pause request made by anyone but the owner', async function () {
      await increaseTimeTo(this.startTime);
      await this.crowdsale.pause({ from: whiteListedInvestor }).should.be.rejectedWith(EVMThrow);
    });

    it('should reject payments when paused', async function () {
      await increaseTimeTo(this.startTime);
      await this.crowdsale.pause({ from: owner }).should.be.fulfilled;
      await this.crowdsale.sendTransaction({ from: whiteListedInvestor, value: INVESTED_AMOUNT }).should.be.rejectedWith(EVMThrow);
      await increaseTimeTo(this.afterWhiteListEndTime);
      await this.crowdsale.addReferredInvestor(REFCODE1, referredInvestor);
      await this.crowdsale.buyTokens(referredInvestor, { from: otherAddress, value: INVESTED_AMOUNT }).should.be.rejectedWith(EVMThrow);
    });

    it('should accept payments again when unpaused', async function () {
      await increaseTimeTo(this.startTime);
      await this.crowdsale.pause({ from: owner }).should.be.fulfilled;
      await this.crowdsale.unpause({ from: owner }).should.be.fulfilled;
      await this.crowdsale.sendTransaction({ from: whiteListedInvestor, value: INVESTED_AMOUNT }).should.be.fulfilled;
      await increaseTimeTo(this.afterWhiteListEndTime);
      await this.crowdsale.addReferredInvestor(REFCODE1, referredInvestor);
      await this.crowdsale.buyTokens(referredInvestor, { from: otherAddress, value: INVESTED_AMOUNT }).should.be.fulfilled;
    });

  });

  describe('Ownable', function () {

    it('should allow the owner to transfer ownership to a different address', async function () {
      await this.crowdsale.transferOwnership(otherAddress, { from: owner }).should.be.fulfilled;
    });

    it('should disallow anyone but the owner from taking over ownership', async function () {
      await this.crowdsale.transferOwnership(otherAddress).should.be.rejectedWith(EVMThrow);
    });

  });

  describe('Destructible', function () {

    it('should be destructible by the owner while the vault is active', async function () {
      await increaseTimeTo(this.startTime);
      await this.crowdsale.destroy({ from: owner }).should.be.fulfilled;
    });

    it('should send funds to the wallet when destroyed', async function () {
      await increaseTimeTo(this.startTime);
      await this.crowdsale.sendTransaction({ from: whiteListedInvestor, value: INVESTED_AMOUNT });
      const beforeDestruction = web3.eth.getBalance(WALLET);
      // Set gasPrice to 0 in case owner == WALLET 
      await this.crowdsale.destroy({ from: owner, gasPrice: 0 }).should.be.fulfilled;
      const afterDestruction = web3.eth.getBalance(WALLET);
      afterDestruction.minus(beforeDestruction).should.be.bignumber.equal(INVESTED_AMOUNT);
    });

    it('should not be destructible while the vault is closed', async function () {
      await increaseTimeTo(this.startTime);
      await this.crowdsale.send(GOAL);
      await increaseTimeTo(this.afterEndTime);
      await this.crowdsale.finalize({ from: owner });
      await this.crowdsale.destroy({ from: owner }).should.be.rejectedWith(EVMThrow);
    });

    it('should not be destructible while the vault is refunding', async function () {
      await increaseTimeTo(this.startTime);
      await this.crowdsale.send(LESS_THAN_GOAL);
      await increaseTimeTo(this.afterEndTime);
      await this.crowdsale.finalize({ from: owner });
      await this.crowdsale.destroy({ from: owner }).should.be.rejectedWith(EVMThrow);
    });

  });

});
