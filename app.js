// app.js - MTEC Package Auto-Stake (Bitget/MetaMask friendly, ethers v5)

let provider, signer, account;
let usdt, mtec, contract;

let isConnecting = false;
let warnedWrongChain = false;

const $ = (id) => document.getElementById(id);
const ZERO = "0x0000000000000000000000000000000000000000";

function setMsg(t, type = "info") {
  const el = $("txMessage");
  if (!el) return;
  el.textContent = t || "";
  el.style.color =
    type === "error" ? "#e11d48" : type === "success" ? "#16a34a" : "#0a2540";
}

function getInjectedProvider() {
  // Bitget
  if (window.bitget && window.bitget.ethereum) return window.bitget.ethereum;
  // BitKeep (บางเครื่องยังมี)
  if (window.bitkeep && window.bitkeep.ethereum) return window.bitkeep.ethereum;
  // MetaMask/อื่นๆ
  if (window.ethereum) return window.ethereum;
  return null;
}

async function ensureBSC(injected) {
  // ใช้ eth_chainId ตรงๆ (แก้ปัญหา iOS/Bitget ที่ provider.getNetwork() เพี้ยน)
  const chainIdHex = await injected.request({ method: "eth_chainId" });
  if (chainIdHex !== "0x38") {
    if (!warnedWrongChain) {
      warnedWrongChain = true;
      alert("กรุณาใช้ BSC Mainnet");
    }
    return false;
  }
  warnedWrongChain = false;
  return true;
}

function shortAddr(a) {
  if (!a) return "-";
  return a.slice(0, 6) + "..." + a.slice(-4);
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
    // fallback สำหรับบาง wallet browser
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
    const injected = getInjectedProvider();
    if (!injected) {
      alert("ไม่พบ Wallet (Bitget/MetaMask)");
      return;
    }

    // ขอ account ก่อน
    await injected.request({ method: "eth_requestAccounts" });

    // เช็ค BSC ให้ชัวร์ (แก้เตือนเด้งตลอด)
    const ok = await ensureBSC(injected);
    if (!ok) return;

    provider = new ethers.providers.Web3Provider(injected, "any");
    signer = provider.getSigner();
    account = await signer.getAddress();

    // init contracts
    usdt = new ethers.Contract(ADDR.USDT, ERC20_ABI, signer);
    mtec = new ethers.Contract(ADDR.MTEC, ERC20_ABI, signer); // (ไม่ได้ใช้ก็ไม่เป็นไร)
    contract = new ethers.Contract(ADDR.CONTRACT, CONTRACT_ABI, signer);

    const btn = $("btnConnect");
    if (btn) btn.textContent = shortAddr(account);

    updateRefLink();
    await loadPackages();

    // listener ให้รีโหลดเมื่อเปลี่ยน chain/account (ลดอาการเพี้ยนใน mobile)
    if (injected.on) {
      injected.removeAllListeners?.("chainChanged");
      injected.removeAllListeners?.("accountsChanged");
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
      setMsg("กรุณาเชื่อมต่อกระเป๋าก่อน", "error");
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

    // เช็ค BSC ก่อนทำธุรกรรม
    const ok = await ensureBSC(injected);
    if (!ok) return;

    if (!signer || !account) await connectWallet();
    if (!usdt) return;

    setMsg("Approving USDT...", "info");
    const tx = await usdt.approve(ADDR.CONTRACT, ethers.constants.MaxUint256);
    if (!tx || !tx.hash) throw new Error("Wallet did not return tx");

    await tx.wait();
    setMsg("Approve success ✓", "success");

    const btn = $("btnApprove");
    if (btn) btn.textContent = "Approved ✓";
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

    // เช็ค BSC ก่อนทำธุรกรรม
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
    const tx = await contract.buyPackage(packageId, ref, { gasLimit: 800000 });
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

  updateRefLink();
}

window.addEventListener("load", init);
