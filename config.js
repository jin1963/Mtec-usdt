// config.js - Kaojino MTEC Package Auto-Stake (USDT) + Referral USDT 3 Levels

window.NETWORK = { chainIdHex: "0x38", chainIdDec: 56, name: "BNB Smart Chain" }; // BSC Mainnet

window.ADDR = {
  CONTRACT: "0xaC222708698da5E9Fc75aeaaD75b29102C9bBA90",
  USDT: "0x55d398326f99059fF775485246999027B3197955",
  MTEC: "0x2D36AC3c4D4484aC60dcE5f1D4d2B69A826F52A4"
};

window.DECIMALS = { USDT: 18, MTEC: 18 };

window.ERC20_MINI_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)"
];

// Minimal ABI needed for the dApp
window.SALE_ABI = [
  "function buyPackage(uint256 packageId, address ref) external",
  "function claim(uint256 index) external",
  "function getStakeCount(address user) view returns (uint256)",
  "function getStake(address user, uint256 index) view returns (uint256 principalMTEC,uint256 startTime,bool claimed,uint256 apyBPAtStake,uint256 lockAtStake,uint256 usdtPaid,uint256 usdtNet,address ref1)",
  "function pendingReward(address user, uint256 index) view returns (uint256)",
  "function canClaim(address user, uint256 index) view returns (bool)",
  "function packageCount() view returns (uint256)",
  "function packages(uint256) view returns (uint256 usdtIn, uint256 mtecOut, bool active)",
  "function getReferrers(address user) view returns (address r1,address r2,address r3)",
  "function ref1Bps() view returns (uint256)",
  "function ref2Bps() view returns (uint256)",
  "function ref3Bps() view returns (uint256)",
  "function apyBasisPoints() view returns (uint256)",
  "function lockDuration() view returns (uint256)",
  "function enabled() view returns (bool)"
];

window.UI_CONST = {
  MAX_PACKAGES_TO_SCAN: 50,
  GAS: { approve: 120000, buy: 650000, claim: 450000 }
};
