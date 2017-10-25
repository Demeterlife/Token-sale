pragma solidity ^0.4.15;

import './zeppelin-solidity/crowdsale/CappedCrowdsale.sol';
import './zeppelin-solidity/ownership/Ownable.sol';

/**
 * @title WhiteListCrowdsale
 * @dev Extension of Crowsdale with a period where only whitelisted investors
 * can participate in the crowdsale. The registration to the whitelist is open
 * to the public during a different time frame. White listed investors can purchase
 * tokens and receive a bonus during the whitelist time frame.
 * 
 * Other investors, know as referred investors, can be added to a second-level
 * whitelist and be associated each to a first-level whitelisted investor through
 * a referral code. One such investor can participate during the exclusive whitelist
 * time frame splitting the bonus tokens with his referrer.
 *
 * After the whitelist period, whitelisted and referred investors can still
 * purchase tokens and get half the bonus they would have gotten during the
 * whitelist period.
 *
 * No other investor can participate during the whitelist time frame. Everybody
 * can participate after the whitelist period has ended and before the token sale
 * terminates.
 */
contract WhiteListCrowdsale is
  CappedCrowdsale,
  Ownable
{

  /**
   * @dev Rate of bonus tokens received by investors during the whitelist period of the crowdsale.
   */
  uint8 public constant WHITELIST_BONUS_RATE = 10;

  /**
   * @dev Rate of bonus tokens received by a referring investor,
   * expressed as % of total bonus tokens issued for the purchase.
   */
  uint8 constant REFERRAL_SHARE_RATE = 50;

  /**
   * @dev Timestamp until which it is possible to add an investor to the whitelist.
   */
  uint256 public whiteListRegistrationEndTime;

  /**
   * @dev Timestamp after which anyone can participate in the crowdsale.
   */
  uint256 public whiteListEndTime;

  /**
   * @dev Whitelisted addresses.
   */
  mapping(address => bool) public isWhiteListed;

  /**
   * @dev Referral codes associated to their referring addresses.
   */
  mapping(bytes32 => address) internal referralCodes;

  /**
   * @dev Maps referred investors to their referrers (referred => referring).
   */
  mapping(address => address) internal referrals;

  /**
   * @dev Event fired when an address is added to the whitelist.
   * @param investor whitelisted investor
   * @param referralCode referral code of the whitelisted investor
   */
  event WhiteListedInvestorAdded(
    address indexed investor,
    string referralCode
  );

  /**
   * event for bonus token emmited
   * @param referralCode referral code of the whitelisted investor
   * @param referredInvestor address of the referred investor
   */
  event ReferredInvestorAdded(
    string referralCode,
    address referredInvestor
  );

  /**
   * @dev Event fired when bonus tokens are emitted for referred purchases.
   * @param beneficiary who got the tokens
   * @param amount bonus tokens issued
   */
  event ReferredBonusTokensEmitted(
    address indexed beneficiary,
    uint256 amount
  );

  /**
   * @dev Event fired when bonus tokens are emitted for whitelist or referred purchases.
   * @param beneficiary who got the tokens
   * @param amount bonus tokens issued
   */
  event WhiteListBonusTokensEmitted(
    address indexed beneficiary,
    uint256 amount
  );

  /**
   * @dev WhiteListCrowdsale construction.
   * @param _whiteListRegistrationEndTime time until which white list registration is still possible
   * @param _whiteListEndTime time until which only white list purchases are accepted
   */
  function WhiteListCrowdsale(uint256 _whiteListRegistrationEndTime, uint256 _whiteListEndTime) public {
    require(_whiteListEndTime > startTime);

    whiteListEndTime = _whiteListEndTime;
    whiteListRegistrationEndTime = _whiteListRegistrationEndTime;
  }

  /**
   * @dev Overriding Crowdsale#buyTokens to add extra whitelist and referral logic.
   * @param _beneficiary address that is buying tokens.
   */
  function buyTokens(address _beneficiary) public payable
  {
    require(validWhiteListedPurchase(_beneficiary));

    // Buys tokens and transfers them to _beneficiary.
    super.buyTokens(_beneficiary);
    
    uint256 bonusTokens = computeBonusTokens(_beneficiary, msg.value);
    if (isReferred(_beneficiary))
    {
      uint256 bonusTokensForReferral = bonusTokens.mul(REFERRAL_SHARE_RATE).div(100);
      uint256 bonusTokensForReferred = bonusTokens.sub(bonusTokensForReferral);
      token.mint(_beneficiary, bonusTokensForReferred);
      token.mint(referrals[_beneficiary], bonusTokensForReferral);
      ReferredBonusTokensEmitted(_beneficiary, bonusTokensForReferred);
      WhiteListBonusTokensEmitted(referrals[_beneficiary], bonusTokensForReferral);
    }
    else if (isWhiteListed[_beneficiary])
    {
      token.mint(_beneficiary, bonusTokens);
      WhiteListBonusTokensEmitted(_beneficiary, bonusTokens);
    }
  }

  /**
   * @dev Adds an investor to the whitelist if registration is open. Fails otherwise.
   * @param _investor whitelisted investor
   * @param _referralCode investor's referral code
   */
  function addWhiteListedInvestor(address _investor, string _referralCode) public
  {
    require(block.timestamp <= whiteListRegistrationEndTime);
    require(_investor != 0);
    require(!isWhiteListed[_investor]);
    bytes32 referralCodeHash = keccak256(_referralCode);
    require(referralCodes[referralCodeHash] == 0x0);
    
    isWhiteListed[_investor] = true;
    referralCodes[referralCodeHash] = _investor;
    WhiteListedInvestorAdded(_investor, _referralCode);
  }

  /**
   * @dev Adds up to 30 whitelisted investors. To be called one or more times
   * for initial whitelist loading.
   * @param _investors whitelisted investors
   * @param _referralCodes keccak-256 hashes of corresponding investor referral codes.
   */
  function loadWhiteList(address[] _investors, bytes32[] _referralCodes) public onlyOwner
  {
    require(_investors.length <= 30);
    require(_investors.length == _referralCodes.length);

    for (uint i = 0; i < _investors.length; i++)
    {
      isWhiteListed[_investors[i]] = true;
      referralCodes[_referralCodes[i]] = _investors[i];
    }
  }

  /**
   * @dev Adds a referred investor to the second-level whitelist.
   * @param _referredInvestor whitelisted investor
   * @param _referralCode investor's referral code
   */
  function addReferredInvestor(string _referralCode, address _referredInvestor) public
  {
    require(!hasEnded());
    require(!isWhiteListed[_referredInvestor]);
    require(_referredInvestor != 0);
    require(referrals[_referredInvestor] == 0x0);
    bytes32 referralCodeHash = keccak256(_referralCode);
    require(referralCodes[referralCodeHash] != 0);

    referrals[_referredInvestor] = referralCodes[referralCodeHash];
    ReferredInvestorAdded(_referralCode, _referredInvestor);
  }

  /**
   * @dev Returns true if _investor is a referred investor.
   * @param _investor address to check against the list of referred investors.
   */
  function isReferred(address _investor) public constant returns (bool)
  {
    return referrals[_investor] != 0x0;
  }

  /**
   * @dev Returns true if _investor is a whitelisted or referred investor,
   * or the whitelist period has ended (and the crowdsale hasn't) and everyone can buy.
   * @param _investor investor who is making the purchase.
   */
  function validWhiteListedPurchase(address _investor) internal constant returns (bool)
  {
    return isWhiteListed[_investor] || isReferred(_investor) || block.timestamp > whiteListEndTime;
  }

  /**
   * @dev Returns the number of bonus tokens for a whitelisted or referred purchase.
   * Returns zero if the purchase is not from a whitelisted or referred investor.
   * @param _weiAmount purchase amount.
   */
  function computeBonusTokens(address _beneficiary, uint256 _weiAmount) internal constant returns (uint256)
  {
    if (isReferred(_beneficiary) || isWhiteListed[_beneficiary]) {
      uint256 bonusTokens = _weiAmount.mul(rate).mul(WHITELIST_BONUS_RATE).div(100);
      if (block.timestamp > whiteListEndTime) {
        bonusTokens = bonusTokens.div(2);
      }
      return bonusTokens;
    }
    else
    {
      return 0;
    }
  }

}
