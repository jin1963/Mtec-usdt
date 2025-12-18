// ===============================
// MTEC Auto-Stake CONFIG (BSC)
// ===============================

window.ADDR = {
  CONTRACT: "0xaC222708698da5E9Fc75aeaaD75b29102C9bBA90", // MTEC Auto-Stake Contract
  USDT: "0x55d398326f99059fF775485246999027B3197955",     // USDT (BEP20)
  MTEC: "0x2D36AC3c4D4484aC60dcE5f1D4d2B69A826F52A4"      // MTEC Token
};

window.DECIMALS = {
  USDT: 18,
  MTEC: 18
};

// ERC20 minimal ABI
window.ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)"
];

// ===== Contract ABI (ตัดเฉพาะที่ใช้จริง) =====
window.CONTRACT_ABI = [
  "function packageCount() view returns (uint256)",
  "function packages(uint256) view returns (uint256 usdtIn, uint256 mtecOut, bool active)",
  "function buyPackage(uint256 packageId, address ref) external",
  "function referrerOf(address) view returns (address)",
  "function getStakeCount(address user) view returns (uint256)"
];
