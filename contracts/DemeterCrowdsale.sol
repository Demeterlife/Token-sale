pragma solidity ^0.4.15;

import './DemeterToken.sol';
import './WhiteListCrowdsale.sol';
import './zeppelin-solidity/lifecycle/Destructible.sol';
import './zeppelin-solidity/lifecycle/Pausable.sol';
import './zeppelin-solidity/crowdsale/RefundableCrowdsale.sol';

/**
 * @title DemeterCrowdsale
 * @dev This crowdsale is divided into 5 phases
 *
 * - Phase 1: Investors can register on a whitelist
 * - Phase 2: Whitelist is closed, referral is possible through referral code
 * - Phase 3: Crowdsale starts for whitelisted and referred investors, investors
 *   can still be referred by whitelisted investors. Whitelisted investors buying
 *   tokens will get a bonus of 10%. Referred investors will get a 5% bonus while
 *   their referrer will get 5% as well. Non-whitelisted or referred investors
 *   cannot buy tokens.
 * - Phase 4: Crowdsale is opened to everyone. Whitelisted investor will get a 5%
 *   bonus. Referred investors will get a 2.5% bonus while their referrer will get
 *   2.5% as well. Non-whitelisted or referred investor can buy tokens but will not
 *   get any bonus.
 * - Phase 5: Crowdsale is closed and tokens become transferable.
 *
 * When the crowdsale ends, funds are either trasferred to the company wallet or,
 * if the minimum goal is not reached, sent to a RefundVault from which they can
 * be withdrawn by the investors as a refund.
 * The minimum goal can be adjusted by the owner during the sale.
 */
contract DemeterCrowdsale is
  RefundableCrowdsale,
  WhiteListCrowdsale,
  Pausable,
  Destructible
{

  /**
   * @dev Each time an investor purchases, he gets this % of the minted tokens
   * (plus bonus if applicable), while the company gets 70% (minus bonus).
   */
  uint8 constant public PERC_TOKENS_TO_INVESTOR = 30;

  /**
   * @dev Portion of total tokens reserved for future token releases.
   * Documentation-only. Unused in code, as the release part is calculated by subtraction.
   */
  uint8 constant public PERC_TOKENS_TO_RELEASE = 25;

  /**
   * @dev Address to which the release tokens are credited.
   */
  // FIXME: use real wallet address
  address constant public RELEASE_WALLET = 0x9a3EF57F54c61C84D84620dDd4775Ca633485CCF;

  /**
   * Portion of total tokens reserved for dev. team.
   */
  uint8 constant public PERC_TOKENS_TO_DEV = 20;

  /**
   * @dev Address to which the dev. tokens are credited.
   */
  // FIXME: use real wallet address
  address constant public DEV_WALLET = 0xd9a58BDEA8858BFb65592E85381958C5bbf22089;

  /**
   * Portion of total tokens reserved for business dev.
   */
  uint8 constant public PERC_TOKENS_TO_BIZDEV = 25;

  /**
   * @dev Address to which the business dev. tokens are credited.
   */
  // FIXME: use real wallet address
  address constant public BIZDEV_WALLET = 0xC276885bC1d6DDE54249CC7DF8b1072f49DD1F39;

  /**
   * @dev Event fired whenever company tokens are issued for a purchase.
   * @param investor who made the purchase
   * @param value weis paid for purchase
   * @param amount amount of tokens minted for the company
   */
  event CompanyTokensIssued(
    address indexed investor,
    uint256 value,
    uint256 amount
  );

  /**
   * @dev DemeterCrowdsale construction.
   * @param _startTime beginning of crowdsale.
   * @param _endTime end of crowdsale.
   * @param _whiteListRegistrationEndTime time until which whitelist registration is still possible.
   * @param _whiteListEndTime time until which only whitelist purchases are accepted.
   * @param _rate how many tokens per ether in case of no whitelist or referral bonuses.
   * @param _cap crowdsale hard cap in wei.
   * @param _goal minimum crowdsale goal in wei; if not reached, causes refunds to be available.
   * @param _wallet where the raised ethers are transferred in case of successful crowdsale.
   */
  function DemeterCrowdsale(
    uint256 _startTime,
    uint256 _endTime,
    uint256 _whiteListRegistrationEndTime,
    uint256 _whiteListEndTime,
    uint256 _rate,
    uint256 _cap,
    uint256 _goal,
    address _wallet
  ) public
    Crowdsale(_startTime, _endTime, _rate, _wallet)
    CappedCrowdsale(_cap)
    RefundableCrowdsale(_goal)
    WhiteListCrowdsale(_whiteListRegistrationEndTime, _whiteListEndTime)
  {
    DemeterToken(token).setUnlockTime(_endTime);
  }

  /**
   * @dev Called when a purchase is made. Override to issue company tokens
   * in addition to bought and bonus tokens.
   * @param _beneficiary the investor that buys the tokens.
   */
  function buyTokens(address _beneficiary) public payable whenNotPaused {
    // buys tokens (including referral or whitelist tokens) and
    // transfers them to _beneficiary.
    super.buyTokens(_beneficiary);
    
    // mints additional tokens for the company and distributes them to the company wallets.
    issueCompanyTokens(_beneficiary, msg.value);
  }

  /**
   * @dev Transfers the current balance to the owner and terminates the contracts (both crowdsale and token).
   */
  function destroy() public onlyOwner {
    super.destroy();
    DemeterToken(token).destroy();
  }

  /**
   * @dev Transfers the current balance to _recipient and terminates the contracts.
   * @param _recipient address that will receive the balance.
   */
  function destroyAndSend(address _recipient) public onlyOwner {
    super.destroyAndSend(_recipient);
    DemeterToken(token).destroyAndSend(_recipient);
  }

  /**
   * @dev Allows the owner to change the minimum goal during the sale.
   * @param _goal new goal in wei.
   */
  function updateGoal(uint256 _goal) public onlyOwner {
    require(_goal >= 0 && _goal <= cap);
    require(!hasEnded());

    goal = _goal;
  }

  /**
   * @dev Mints additional tokens for the company and distributes them to the company wallets.
   * @param _investor the investor that bought tokens.
   * @param _weiAmount the amount paid in weis.
   */
  function issueCompanyTokens(address _investor, uint256 _weiAmount) internal {
    uint256 investorTokens = _weiAmount.mul(rate);
    uint256 bonusTokens = computeBonusTokens(_investor, _weiAmount);
    uint256 companyTokens = investorTokens.mul(100 - PERC_TOKENS_TO_INVESTOR).div(PERC_TOKENS_TO_INVESTOR);
    uint256 totalTokens = investorTokens.add(companyTokens);
    // distribute total tokens among the three wallets.
    uint256 devTokens = totalTokens.mul(PERC_TOKENS_TO_DEV).div(100);
    token.mint(DEV_WALLET, devTokens);
    // We take out bonus tokens from bizDev amount.
    uint256 bizDevTokens = (totalTokens.mul(PERC_TOKENS_TO_BIZDEV).div(100)).sub(bonusTokens);
    token.mint(BIZDEV_WALLET, bizDevTokens);
    uint256 actualCompanyTokens = companyTokens.sub(bonusTokens);
    uint256 releaseTokens = actualCompanyTokens.sub(bizDevTokens).sub(devTokens);
    token.mint(RELEASE_WALLET, releaseTokens);

    CompanyTokensIssued(_investor, _weiAmount, actualCompanyTokens);
  }

  /**
   * @dev Override to create our specific token contract.
   */
  function createTokenContract() internal returns (MintableToken) {
    return new DemeterToken();
  }

  /**
   * Immediately unlocks tokens. To be used in case of early close of the sale.
   */
  function unlockTokens() internal {
    if (DemeterToken(token).unlockTime() > block.timestamp) {
      DemeterToken(token).setUnlockTime(block.timestamp);
    }
  }

  /**
   * @dev Unlock the tokens immediately if the sale closes prematurely.
   */
  function finalization() internal {
    super.finalization();
    unlockTokens();
  }

}
