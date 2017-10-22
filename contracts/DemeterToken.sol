
pragma solidity ^0.4.15;

import './zeppelin-solidity/lifecycle/Destructible.sol';
import './TimeLockedToken.sol';

/**
 * @title Demeter Token.
 * @dev Specific Demeter token.
 */
contract DemeterToken is TimeLockedToken, Destructible
{
  string public name = "Demeter";
  string public symbol = "DMT";
  uint256 public decimals = 18;
}
