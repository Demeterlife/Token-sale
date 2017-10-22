pragma solidity ^0.4.15;

import './zeppelin-solidity/token/MintableToken.sol';

/**
 * @title TimeLocked Token.
 * @dev ERC20 token that is not transferable until a specified timestamp.
 */
contract TimeLockedToken is MintableToken
{

  /**
   * @dev Timestamp after which tokens can be transferred.
   */
  uint256 public unlockTime = 0;

  /**
   * @dev Checks whether it can transfer or otherwise throws.
   */
  modifier canTransfer() {
    require(unlockTime == 0 || block.timestamp > unlockTime);
    _;
  }

  /**
   * @dev Sets the date and time since which tokens can be transfered.
   * It can only be moved back, and not in the past.
   * @param _unlockTime New unlock timestamp.
   */
  function setUnlockTime(uint256 _unlockTime) public onlyOwner {
    require(unlockTime == 0 || _unlockTime < unlockTime);
    require(_unlockTime >= block.timestamp);

    unlockTime = _unlockTime;
  }

  /**
   * @dev Checks modifier and allows transfer if tokens are not locked.
   * @param _to The address that will recieve the tokens.
   * @param _value The amount of tokens to be transferred.
   */
  function transfer(address _to, uint256 _value) public canTransfer returns (bool) {
    return super.transfer(_to, _value);
  }

  /**
  * @dev Checks modifier and allows transfer if tokens are not locked.
  * @param _from The address that will send the tokens.
  * @param _to The address that will recieve the tokens.
  * @param _value The amount of tokens to be transferred.
  */
  function transferFrom(address _from, address _to, uint256 _value) public canTransfer returns (bool) {
    return super.transferFrom(_from, _to, _value);
  }

}
