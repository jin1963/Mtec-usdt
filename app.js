// app.js - MTEC Auto-Stake (ethers v5) - Bitget iOS safe

let provider, signer, account;
let usdt, contract;

let isConnecting = false;
let warnedWrongChain = false;

const $ = (id) => document.getElementById(id);
const ZERO = "0x0000000000000000000000000000000000000000";

function setMsg(t, type = "info") {
  const el = $("txMessage");
  if (!el) return;
  el.textContent = t || "";
  el.style.color =
    type === "error" ? "#e11d48" : type === "success" ? "#0ea5e9" : "#0f172a";
}

function shortAddr(a) {
  if (!a) return "-";
  return a.slice(0, 6) + "..." + a.slice(-4);
}

function getInjectedProvider() {
  if (window.bitget && window.bitget.ethereum) return window.bitget.ethereum;
  if (window.bitkeep && window.bitkeep.ethereum) return window.bitkeep.ethereum;
  if (window.ethereum) return window.ethereum;
  return null;
}

// normalize chainId -> number (รองรับ "0x38", "56", 56, "0x0038")
function normalizeChainId(chainIdRaw) {
  if (chainIdRaw == null) return null;

  if (typeof chainIdRaw === "number") return chainIdRaw;

  if (typeof chainIdRaw === "string") {
    const s = chainIdRaw.trim();
    if (s.startsWith("0x") || s.startsWith("0X")) return parseInt(s, 16);
    const n = parseInt(s, 10);
    return Number.isFinite(n) ? n : null;
  }

  return null;
}

async function getChainIdNum(injected) {
  // ใช้ eth_chainId ตรงๆ ก่อน
  try {
    const raw = await injected.request({ method: "eth_chainId" });
    return normalizeChainId(raw);
  } catch (e) {}

  // fallback
  try {
    const raw = await provider?.send?.("eth_chainId", []);
    return normalizeChainId(raw);
  } catch (e) {}

  // fallback สุดท้าย (บาง wallet)
  try {
    const net = await provider?.getNetwork?.();
    return net?.chainId ?? null;
  } catch (e) {}

  return null;
}

async function ensureBSC(injected) {
  const chainIdNum = await getChainIdNum(injected);

  // อัปเดต badge ให้เห็นชัด
  if ($("netBadge")) $("netBadge").textContent = chainIdNum ? `chainId ${chainIdNum}` : "unknown chain";

  if (chainIdNum !== 56) {
    if (!warnedWrongChain) {
      warnedWrongChain = true;
      alert("กรุณาใช้ BSC Mainnet");
    }
    return false;
  }

  warnedWrongChain = false;
  return true;
}

function getRefFromUrl() {
  const r = new URLSearchParams(location.search).get("ref");
  return r && ethers.utils.isAddress(r) ? r : ZERO;
}

function updateRefLink() {
  const input = $("refLink");
  if (!input) return;

  const url = new URL(window.location.href);
  if (account) url.searchParams.set("ref", account);
  else url.searchParams.delete("ref");

  input.value = url.toString();
}

async function copyRef() {
  const input = $("refLink");
  if (!input) return;

  try {
    await navigator.clipboard.writeText(input.value);
    alert("Copied");
  } catch (e) {
    input.removeAttribute("readonly");
    input.select();
    input.setSelectionRange(0, 99999);
    document.execCommand("copy");
    input.setAttribute("readonly", "true");
    alert("Copied");
  }
}

async function connectWallet() {
  if (isConnecting) return;
  isConnecting = true;

  try {
    setMsg("");

    const injected = getInjectedProvider();
    if (!injected) {
      alert("ไม่พบ Wallet (Bitget/MetaMask)");
      return;
    }

    // ขอ accounts ก่อน
    await injected.request({ method: "eth_requestAccounts" });

    // สร้าง provider
    provider = new ethers.providers.Web3Provider(injected, "any");

    // เช็ค BSC แบบ normalize (แก้ Bitget iOS เด้งเตือนซ้ำ)
    const ok = await ensureBSC(injected);
    if (!ok) return;

    signer = provider.getSigner();
    account = await signer.getAddress();

    // init contracts (พึ่ง config.js)
    if (!window.ADDR || !window.ERC20_ABI || !window.CONTRACT_ABI || !window.DECIMALS) {
      throw new Error("Missing config.js variables (ADDR / ERC20_ABI / CONTRACT_ABI / DECIMALS)");
    }

    usdt = new ethers.Contract(ADDR.USDT, ERC20_ABI, signer);
    contract = new ethers.Contract(ADDR.CONTRACT, CONTRACT_ABI, signer);

    if ($("btnConnect")) $("btnConnect").textContent = shortAddr(account);
    if ($("addrBadge")) $("addrBadge").textContent = shortAddr(account);
    if ($("contractAddr")) $("contractAddr").textContent = ADDR.CONTRACT;

    updateRefLink();
    await loadPackages();

    // ลดเพี้ยน: เปลี่ยน chain/account -> reload
    if (injected.on) {
      try {
        injected.removeAllListeners?.("chainChanged");
        injected.removeAllListeners?.("accountsChanged");
      } catch (e) {}
      injected.on("chainChanged", () => window.location.reload());
      injected.on("accountsChanged", () => window.location.reload());
    }

    setMsg("Connected ✓", "success");
  } catch (e) {
    console.error(e);
    setMsg("Connect failed: " + (e?.message || e), "error");
  } finally {
    isConnecting = false;
  }
}

async function loadPackages() {
  const sel = $("packageSelect");
  if (!sel) return;

  sel.innerHTML = `<option value="">Loading...</option>`;

  try {
    if (!contract) {
      sel.innerHTML = `<option value="">กรุณาเชื่อมต่อกระเป๋า</option>`;
      return;
    }

    const count = await contract.packageCount();
    sel.innerHTML = "";

    let added = 0;
    for (let i = 1; i <= Number(count); i++) {
      const p = await contract.packages(i);
      if (!p.active) continue;

      const usdtIn = ethers.utils.formatUnits(p.usdtIn, DECIMALS.USDT);
      const mtecOut = ethers.utils.formatUnits(p.mtecOut, DECIMALS.MTEC);

      const opt = document.createElement("option");
      opt.value = String(i);
      opt.textContent = `${usdtIn} USDT → ${mtecOut} MTEC`;
      sel.appendChild(opt);
      added++;
    }

    if (added === 0) {
      sel.innerHTML = `<option value="">No active packages</option>`;
    }
  } catch (e) {
    console.error(e);
    sel.innerHTML = `<option value="">Load packages failed</option>`;
    setMsg("Load packages failed: " + (e?.reason || e?.message || e), "error");
  }
}

async function approveUSDT() {
  try {
    setMsg("");

    const injected = getInjectedProvider();
    if (!injected) return alert("ไม่พบ Wallet");

    if (!provider) provider = new ethers.providers.Web3Provider(injected, "any");
    const ok = await ensureBSC(injected);
    if (!ok) return;

    if (!signer || !account) await connectWallet();
    if (!usdt) return;

    setMsg("Approving USDT...", "info");
    const tx = await usdt.approve(ADDR.CONTRACT, ethers.constants.MaxUint256);
    if (!tx || !tx.hash) throw new Error("Wallet did not return tx");
    await tx.wait();

    setMsg("Approve success ✓", "success");
    if ($("btnApprove")) $("btnApprove").textContent = "Approved ✓";
  } catch (e) {
    console.error(e);
    setMsg("Approve failed: " + (e?.data?.message || e?.reason || e?.message || e), "error");
  }
}

async function buyPackage() {
  try {
    setMsg("");

    const injected = getInjectedProvider();
    if (!injected) return alert("ไม่พบ Wallet");

    if (!provider) provider = new ethers.providers.Web3Provider(injected, "any");
    const ok = await ensureBSC(injected);
    if (!ok) return;

    if (!signer || !account) await connectWallet();
    if (!contract) return;

    const sel = $("packageSelect");
    const packageId = sel?.value;
    if (!packageId) {
      alert("กรุณาเลือกแพ็คเกจ");
      return;
    }

    const ref = getRefFromUrl();

    setMsg("Sending transaction...", "info");
    // ใส่ gasLimit เผื่อ wallet estimate เพี้ยน
    const tx = await contract.buyPackage(packageId, ref, { gasLimit: 900000 });
    if (!tx || !tx.hash) throw new Error("Wallet did not return tx");
    await tx.wait();

    setMsg("Success ✓", "success");
  } catch (e) {
    console.error(e);
    setMsg("Buy failed: " + (e?.data?.message || e?.reason || e?.message || e), "error");
  }
}

function init() {
  if ($("btnConnect")) $("btnConnect").onclick = connectWallet;
  if ($("btnApprove")) $("btnApprove").onclick = approveUSDT;
  if ($("btnBuy")) $("btnBuy").onclick = buyPackage;
  if ($("btnCopy")) $("btnCopy").onclick = copyRef;

  if ($("contractAddr") && window.ADDR?.CONTRACT) $("contractAddr").textContent = ADDR.CONTRACT;
  updateRefLink();
}

window.addEventListener("load", init);
