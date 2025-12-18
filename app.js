// app.js — MTEC Auto-Stake (FINAL) for Bitget + MetaMask

let injected = null;
let provider = null;
let signer = null;
let account = null;

let usdt = null;
let contract = null;

const ZERO = "0x0000000000000000000000000000000000000000";

function $(id) { return document.getElementById(id); }

function setMsg(text, type = "info") {
  const el = $("txMessage");
  if (!el) return;
  el.textContent = text || "";
  el.className = "msg " + type;
}

function shortAddr(a) {
  if (!a) return "-";
  return a.slice(0, 6) + "..." + a.slice(-4);
}

/**
 * Provider priority:
 * 1) window.bitget.ethereum (Bitget/BitKeep บางรุ่น)
 * 2) window.ethereum (MetaMask/อื่นๆ)
 */
function getInjected() {
  if (window.bitget && window.bitget.ethereum) return window.bitget.ethereum;
  if (window.ethereum) return window.ethereum;
  return null;
}

function getRefFromUrl() {
  const p = new URLSearchParams(window.location.search);
  const r = p.get("ref");
  if (r && ethers.utils.isAddress(r)) return r;
  return ZERO;
}

function buildRefLink() {
  const base = window.location.origin + window.location.pathname;
  const link = account ? `${base}?ref=${account}` : base;
  if ($("refLink")) $("refLink").value = link;
}

async function copyRef() {
  const input = $("refLink");
  if (!input) return;
  try {
    await navigator.clipboard.writeText(input.value);
  } catch {
    input.select();
    document.execCommand("copy");
  }
  setMsg("Copied referral link ✓", "success");
}

function assertConfig() {
  const ok =
    window.ADDR && window.ADDR.CONTRACT && window.ADDR.USDT && window.ADDR.MTEC &&
    window.ERC20_ABI && window.CONTRACT_ABI && window.DECIMALS;

  if (!ok) {
    setMsg("Missing config.js variables (ADDR / ERC20_ABI / CONTRACT_ABI / DECIMALS)", "error");
    throw new Error("Missing config.js variables");
  }
}

async function ensureBSC() {
  // อ่าน chainId แบบ robust (Bitget บางทีรายงาน chainId 1 ตอนเริ่ม)
  let chainId = null;

  try {
    const net = await provider.getNetwork();
    chainId = net?.chainId;
  } catch {}

  // fallback: อ่านจาก injected.chainId (hex)
  if (!chainId) {
    try {
      const hex = injected.chainId;
      if (hex) chainId = parseInt(hex, 16);
    } catch {}
  }

  $("chainText").textContent = `chainId: ${chainId ?? "-"}`;

  if (chainId === window.NETWORK.chainId) return;

  // พยายามสลับ chain อัตโนมัติ (Bitget/MetaMask ส่วนใหญ่รองรับ)
  try {
    await injected.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: window.NETWORK.chainIdHex }]
    });
    const net2 = await provider.getNetwork();
    $("chainText").textContent = `chainId: ${net2.chainId}`;
    if (net2.chainId !== window.NETWORK.chainId) throw new Error("switch failed");
  } catch (e) {
    // ถ้าไม่มี chain ใน wallet → add
    try {
      await injected.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: window.NETWORK.chainIdHex,
          chainName: window.NETWORK.chainName,
          rpcUrls: window.NETWORK.rpcUrls,
          nativeCurrency: window.NETWORK.nativeCurrency,
          blockExplorerUrls: window.NETWORK.blockExplorerUrls
        }]
      });
    } catch {}
    throw new Error("กรุณาเลือก BSC Mainnet ใน Wallet");
  }
}

async function loadPackages() {
  const sel = $("packageSelect");
  if (!sel) return;

  sel.innerHTML = "";
  let count = 0;

  try {
    count = (await contract.packageCount()).toNumber();
  } catch (e) {
    // ถ้าอ่านไม่ได้ ก็ให้โชว์ว่าง
    count = 0;
  }

  const opts = [];

  for (let i = 1; i <= count; i++) {
    try {
      const p = await contract.packages(i);
      const active = p.active;
      if (!active) continue;

      const usdtIn = ethers.utils.formatUnits(p.usdtIn, window.DECIMALS.USDT);
      const mtecOut = ethers.utils.formatUnits(p.mtecOut, window.DECIMALS.MTEC);

      opts.push({ id: i, label: `แพ็คเกจ #${i} — ${usdtIn} USDT → ${mtecOut} MTEC` });
    } catch {}
  }

  if (!opts.length) {
    const o = document.createElement("option");
    o.value = "";
    o.textContent = "ไม่มีแพ็คเกจที่เปิดใช้งาน";
    sel.appendChild(o);
    sel.disabled = true;
    $("btnBuy").disabled = true;
    $("btnApprove").disabled = true;
    return;
  }

  sel.disabled = false;
  $("btnBuy").disabled = false;
  $("btnApprove").disabled = false;

  for (const it of opts) {
    const o = document.createElement("option");
    o.value = String(it.id);
    o.textContent = it.label;
    sel.appendChild(o);
  }
}

async function connect() {
  setMsg("", "info");
  assertConfig();

  injected = getInjected();
  if (!injected) {
    setMsg("ไม่พบ Wallet (Bitget / MetaMask)", "error");
    return;
  }

  // สำคัญ: ต้อง "any" เพื่อให้ chainChanged ไม่พังบนบาง wallet
  provider = new ethers.providers.Web3Provider(injected, "any");

  // ขอ account
  const accounts = await injected.request({ method: "eth_requestAccounts" });
  if (!accounts || !accounts.length) throw new Error("No account");
  account = accounts[0];

  signer = provider.getSigner();

  // สร้าง contract
  usdt = new ethers.Contract(window.ADDR.USDT, window.ERC20_ABI, signer);
  contract = new ethers.Contract(window.ADDR.CONTRACT, window.CONTRACT_ABI, signer);

  $("walletText").textContent = `wallet: ${shortAddr(account)}`;
  $("contractText").textContent = window.ADDR.CONTRACT;

  // เช็ค/สลับเป็น BSC
  await ensureBSC();

  // เปลี่ยนปุ่ม connect
  $("btnConnect").textContent = shortAddr(account);

  // referral link
  buildRefLink();

  // โหลดแพ็คเกจ
  await loadPackages();

  setMsg("Connected ✓", "success");

  // listeners
  if (injected.on) {
    injected.removeAllListeners?.("accountsChanged");
    injected.removeAllListeners?.("chainChanged");

    injected.on("accountsChanged", () => window.location.reload());
    injected.on("chainChanged", () => window.location.reload());
  }
}

async function approveUSDT() {
  try {
    if (!account) await connect();
    await ensureBSC();

    setMsg("Approving USDT...", "info");
    const tx = await usdt.approve(window.ADDR.CONTRACT, ethers.constants.MaxUint256);
    if (!tx?.hash) throw new Error("No tx hash");
    await tx.wait();

    setMsg("Approve success ✓", "success");
  } catch (e) {
    setMsg("Approve failed: " + (e?.data?.message || e?.message || e), "error");
  }
}

async function buyPackage() {
  try {
    if (!account) await connect();
    await ensureBSC();

    const sel = $("packageSelect");
    const id = sel?.value;
    if (!id) {
      setMsg("กรุณาเลือกแพ็คเกจ", "error");
      return;
    }

    const ref = getRefFromUrl();

    // เช็ค allowance (ถ้าไม่พอ ให้แจ้ง)
    const need = (await contract.packages(id)).usdtIn;
    const allow = await usdt.allowance(account, window.ADDR.CONTRACT);

    if (allow.lt(need)) {
      setMsg("USDT allowance ไม่พอ — กด Approve ก่อน", "error");
      return;
    }

    setMsg("Sending buy transaction...", "info");

    const tx = await contract.buyPackage(id, ref);
    if (!tx?.hash) throw new Error("No tx hash");
    await tx.wait();

    setMsg("Buy & Auto-Stake success ✓", "success");
  } catch (e) {
    setMsg("Buy failed: " + (e?.data?.message || e?.reason || e?.message || e), "error");
  }
}

function init() {
  try {
    assertConfig();
  } catch {}

  $("btnConnect")?.addEventListener("click", connect);
  $("btnApprove")?.addEventListener("click", approveUSDT);
  $("btnBuy")?.addEventListener("click", buyPackage);
  $("btnCopy")?.addEventListener("click", copyRef);

  $("contractText").textContent = window.ADDR?.CONTRACT || "-";
  buildRefLink();
}

window.addEventListener("load", init);
