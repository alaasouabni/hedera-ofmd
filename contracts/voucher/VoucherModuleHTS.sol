// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import "../hts/HederaTokenService.sol";
import "../hts/IHederaTokenService.sol";
import "../hts/HederaResponseCodes.sol";
import "../hts/KeyHelper.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IERC20 {
    function transfer(address to, uint256 amt) external returns (bool);
    function transferFrom(
        address from,
        address to,
        uint256 amt
    ) external returns (bool);
    function balanceOf(address a) external view returns (uint256);
    function decimals() external view returns (uint8);
}

contract VoucherModuleHTS is HederaTokenService, KeyHelper, ReentrancyGuard {
    uint8 constant V_DECIMALS = 8;

    address public owner;
    address public immutable hOFD; // ERC-20 OFD on HSCS
    address public immutable treasury; // MDR fees receive here

    // HTS voucher token address (EVM-style address for the tokenId)
    address public vOFD;
    bool public created;
    uint16 public mdrBps = 50; // 0.50%

    // allowlist roles
    mapping(address => bool) public isSponsor;
    mapping(address => bool) public isMerchant;
    mapping(address => bool) public isSupplier;

    event HTSCreated(address token);
    event RoleSet(address indexed who, string role, bool on);
    event Issue(
        address indexed sponsor,
        address indexed merchant,
        uint256 amount
    );
    event Spend(
        address indexed merchant,
        address indexed supplier,
        uint256 amount
    );
    event Redeem(
        address indexed supplier,
        uint256 gross,
        uint256 fee,
        uint256 net
    );
    event MDRSet(uint16 bps);
    event HBARReceived(address indexed from, uint256 amount);
    event HBARFallback(address sender, uint256 amount, bytes data);
    event HBARWithdrawn(address indexed to, uint256 amount);

    modifier onlyOwner() {
        require(msg.sender == owner, "not-owner");
        _;
    }
    modifier onlySponsor() {
        require(isSponsor[msg.sender], "not-sponsor");
        _;
    }

    constructor(
        address _hOFD,
        address _treasury,
        address[] memory initialSponsors
    ) {
        owner = msg.sender;
        hOFD = _hOFD;
        treasury = _treasury;
        for (uint i; i < initialSponsors.length; i++)
            isSponsor[initialSponsors[i]] = true;
    }

    /// Create the HTS token AFTER deployment to avoid constructor-time precompile pitfalls
    function createVoucherToken() external payable onlyOwner nonReentrant {
        require(!created, "already-created");

        IHederaTokenService.HederaToken memory token;
        token.name = "Voucher OFD";
        token.symbol = "VOFD";
        token.treasury = address(this);
        token.memo = "Merchant voucher backed by OFD";
        token.tokenSupplyType = false; // INFINITE
        token.maxSupply = 0;

        // Safer for treasury minting: do NOT freeze by default.
        token.freezeDefault = false;

        // Keys: supply, kyc, freeze, wipe (optional)
        IHederaTokenService.TokenKey[]
            memory keys = new IHederaTokenService.TokenKey[](4);
        keys[0] = getSingleKey(
            KeyHelper.KeyType.SUPPLY,
            KeyHelper.KeyValueType.CONTRACT_ID,
            address(this)
        );
        keys[1] = getSingleKey(
            KeyHelper.KeyType.KYC,
            KeyHelper.KeyValueType.CONTRACT_ID,
            address(this)
        );
        keys[2] = getSingleKey(
            KeyHelper.KeyType.FREEZE,
            KeyHelper.KeyValueType.CONTRACT_ID,
            address(this)
        );
        keys[3] = getSingleKey(
            KeyHelper.KeyType.WIPE,
            KeyHelper.KeyValueType.CONTRACT_ID,
            address(this)
        );
        token.tokenKeys = keys;

        (, address createdToken) = HederaTokenService.createFungibleToken(
            token,
            0,
            8
        );
        emit HTSCreated(createdToken);

        vOFD = createdToken;
        created = true;
    }

    // ---------- Admin ----------
    function setRole(
        address who,
        string calldata role,
        bool on
    ) external onlyOwner {
        bytes32 r = keccak256(bytes(role));
        if (r == keccak256("sponsor")) isSponsor[who] = on;
        else if (r == keccak256("merchant")) isMerchant[who] = on;
        else if (r == keccak256("supplier")) isSupplier[who] = on;
        else revert("role?");
        emit RoleSet(who, role, on);
    }

    function setMDR(uint16 bps) external onlyOwner {
        require(bps <= 1000, "too-high");
        mdrBps = bps;
        emit MDRSet(bps);
    }

    // ---------- Association & KYC helpers (accounts must associate via wallet/SDK) ----------
    function grantKycAndUnfreeze(
        address account
    ) external onlyOwner nonReentrant {
        require(isMerchant[account] || isSupplier[account], "not allowlisted");
        // grant KYC
        int rc1 = HederaTokenService.grantTokenKyc(vOFD, account);
        require(rc1 == HederaResponseCodes.SUCCESS, "kyc");
        // unfreeze
        int rc2 = HederaTokenService.unfreezeToken(vOFD, account);
        require(rc2 == HederaResponseCodes.SUCCESS, "unfreeze");
    }

    // ---------- Business flows ----------
    // 1) Sponsor deposits hOFD -> mints vOFD to Merchant (requires merchant associated + KYC + unfrozen)
    function issueVoucher(
        address merchant,
        uint256 amount
    ) external onlySponsor nonReentrant {
        require(isMerchant[merchant], "not-merchant");
        (int rK, bool kM) = HederaTokenService.isKyc(vOFD, merchant);
        (int rF, bool fM) = HederaTokenService.isFrozen(vOFD, merchant);
        require(
            rK == HederaResponseCodes.SUCCESS && kM,
            "merchant KYC missing"
        );
        require(rF == HederaResponseCodes.SUCCESS && !fM, "merchant frozen");
        require(
            IERC20(hOFD).transferFrom(msg.sender, address(this), amount),
            "pull-hOFD"
        );
        int64 vAmt = _toVUnits(amount);
        // Mint to treasury, then transfer to merchant
        (int rcMint, , ) = HederaTokenService.mintToken(
            vOFD,
            vAmt,
            new bytes[](0)
        );
        require(rcMint == HederaResponseCodes.SUCCESS, "mint");
        int rc = HederaTokenService.transferToken(
            vOFD,
            address(this),
            merchant,
            vAmt
        );
        require(rc == HederaResponseCodes.SUCCESS, "xfer to merchant");
        emit Issue(msg.sender, merchant, amount);
    }

    // 2) Merchant spends voucher to Supplier (HTS transfer)
    function spendVoucher(
        address supplier,
        uint256 amountHOFD
    ) external nonReentrant {
        require(isMerchant[msg.sender], "not-merchant");
        require(isSupplier[supplier], "not-supplier");
        int64 vAmt = _toVUnits(amountHOFD);
        int rc = HederaTokenService.transferToken(
            vOFD,
            msg.sender,
            supplier,
            vAmt
        );
        require(
            rc == HederaResponseCodes.SUCCESS,
            "HTS xfer needs allowance or wallet transfer"
        );
        emit Spend(msg.sender, supplier, amountHOFD);
    }

    // 3) Supplier redeems -> send hOFD net (fee to treasury), burn vOFD (pull to treasury then burn)
    function redeem(uint256 amount) external nonReentrant {
        require(isSupplier[msg.sender], "not-supplier");
        (int rK, bool kM) = HederaTokenService.isKyc(vOFD, msg.sender);
        (int rF, bool fM) = HederaTokenService.isFrozen(vOFD, msg.sender);
        require(
            rK == HederaResponseCodes.SUCCESS && kM,
            "supplier KYC missing"
        );
        require(rF == HederaResponseCodes.SUCCESS && !fM, "supplier frozen");
        // Move supplier's vOFD back to treasury
        int64 vAmt = _toVUnits(amount);
        int rcT = HederaTokenService.transferToken(
            vOFD,
            msg.sender,
            address(this),
            vAmt
        );
        require(rcT == HederaResponseCodes.SUCCESS, "xfer supplier->treasury");
        
        // Burn from treasury
        (int rcB, ) = HederaTokenService.burnToken(vOFD, vAmt, new int64[](0));
        require(rcB == HederaResponseCodes.SUCCESS, "burn");

        uint256 fee = (amount * mdrBps) / 10_000;
        uint256 net = amount - fee;
        require(IERC20(hOFD).transfer(treasury, fee), "fee-xfer");
        require(IERC20(hOFD).transfer(msg.sender, net), "net-xfer");
        emit Redeem(msg.sender, amount, fee, net);
    }

    function _toVUnits(uint256 amountHOFD) internal pure returns (int64) {
        // 18 -> 8 decimals
        uint256 q = amountHOFD / 1e10;
        require(q * 1e10 == amountHOFD, "amount must be multiple of 1e10");
        require(q <= uint64(type(int64).max), "vOFD int64 overflow");
        return int64(uint64(q));
    }

    // Accept HBAR
    receive() external payable {
        emit HBARReceived(msg.sender, msg.value);
    }

    fallback() external payable {
        emit HBARFallback(msg.sender, msg.value, msg.data);
    }

    // function withdrawHBAR() external onlyOwner {
    //     uint256 balance = address(this).balance;
    //     require(balance > 0, "No HBAR to withdraw");
    //     (bool success, ) = owner().call{value: balance}("");
    //     require(success, "Failed to withdraw HBAR");
    //     emit HBARWithdrawn(owner(), balance);
    // }
}
