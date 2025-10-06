// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import "../hts/HederaTokenService.sol";
import "../hts/HederaResponseCodes.sol";

contract HTSAssociationHelper is HederaTokenService {
    event Associated(address indexed account, address indexed token, int rc);

    /// EOA calls this to associate itself with an HTS token.
    function associateSelf(address token) external {
        int rc = HederaTokenService.associateToken(msg.sender, token);
        require(
            rc == HederaResponseCodes.SUCCESS ||
            rc == HederaResponseCodes.TOKEN_ALREADY_ASSOCIATED_TO_ACCOUNT,
            "associate failed"
        );
        emit Associated(msg.sender, token, rc);
    }
}
