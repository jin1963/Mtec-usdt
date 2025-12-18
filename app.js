let provider, signer, account;
let usdt, contract;

const ZERO = "0x0000000000000000000000000000000000000000";
const $ = (id) => document.getElementById(id);

function setMsg(t, type = "info") {
  const el = $("txMessage");
  if (!el) return;
  el.textContent = t || "";
  el.style.color =
    type === "error" ? "#ef4444" :
    type === "success" ? "#2563eb" : "#334155";
}

function getInjected() {
  if (window.bitget?.ethereum) return window.bitget.ethereum;
  if (window.ethereum) return window.ethereum;
  return null;
}

function short(a) {
  return a ? a.slice(0, 6) + "..." + a.slice(-4) : "";
}

async function connectWallet() {
  try {
    const injected = getInjected();
    if (!injected) return alert("ไม่พบ Wallet");

    await injected.request({ method: "eth_requestAccounts" });

    provider = new ethers.providers.Web3Provider(injected, "any");
    const net = await provider.getNetwork();

    $("netBadge").textContent = "chainId " + net.chainId;
    if (net.chainId !== 56) {
      alert("กรุณาใช้ BSC Mainnet");
      return;
    }

    signer = provider.getSigner();
    account = await signer.getAddress();

    // ตรวจ config
    if (!window.ADDR || !window.ERC20_ABI || !window.CONTRACT_ABI || !window.DECIMALS) {
      throw new Error("Missing config.js variables");
    }

    usdt = new ethers.Contract(ADDR.USDT, ERC20_ABI, signer);
    contract = new ethers.Contract(ADDR.CONTRACT, CONTRACT_ABI, signer);

    $("btnConnect").textContent = short(account);
    $("addrBadge").textContent = short(account);
    $("contractAddr").textContent = ADDR.CONTRACT;

    updateRef();
    await loadPackages();

    setMsg("Connected ✓", "success");
  } catch (e) {
    console.error(e);
    setMsg("Connect failed: " + e.message, "error");
  }
}

async function loadPackages() {
  const sel = $("packageSelect");
  sel.innerHTML = "";

  const count = await contract.packageCount();
  let added = 0;

  for (let i = 1; i <= count; i++) {
    const p = await contract.packages(i);
    if (!p.active) continue;

    const usdtIn = ethers.utils.formatUnits(p.usdtIn, 18);
    const mtecOut = ethers.utils.formatUnits(p.mtecOut, 18);

    const opt = document.createElement("option");
    opt.value = i;
    opt.textContent = `${usdtIn} USDT → ${mtecOut} MTEC`;
    sel.appendChild(opt);
    added++;
  }

  if (!added) {
    sel.innerHTML = `<option value="">ไม่มีแพ็คเกจที่เปิดใช้งาน</option>`;
  }
}

async function approveUSDT() {
  try {
    setMsg("Approving USDT...");
    const tx = await usdt.approve(ADDR.CONTRACT, ethers.constants.MaxUint256);
    await tx.wait();
    setMsg("Approve สำเร็จ", "success");
  } catch (e) {
    setMsg("Approve failed: " + e.message, "error");
  }
}

async function buyPackage() {
  try {
    const id = $("packageSelect").value;
    if (!id) return alert("กรุณาเลือกแพ็คเกจ");

    const ref = new URLSearchParams(location.search).get("ref") || ZERO;

    setMsg("Sending transaction...");
    const tx = await contract.buyPackage(id, ref);
    await tx.wait();

    setMsg("Buy & Auto-Stake สำเร็จ ✓", "success");
  } catch (e) {
    setMsg("Buy failed: " + e.message, "error");
  }
}

function updateRef() {
  const url = new URL(location.href);
  if (account) url.searchParams.set("ref", account);
  $("refLink").value = url.toString();
}

async function copyRef() {
  await navigator.clipboard.writeText($("refLink").value);
  alert("Copied");
}

window.addEventListener("load", () => {
  $("btnConnect").onclick = connectWallet;
  $("btnApprove").onclick = approveUSDT;
  $("btnBuy").onclick = buyPackage;
  $("btnCopy").onclick = copyRef;
});
