// app.js - Kaojino MTEC Package Auto-Stake (ethers.js)

let injected, provider, signer, currentAccount = null;
let usdt, mtec, sale;

const zero = "0x0000000000000000000000000000000000000000";

function $(id) { return document.getElementById(id); }

function shortAddr(a) {
  if (!a) return "-";
  return a.slice(0, 6) + "..." + a.slice(a.length - 4);
}

function setMsg(text = "", type = "") {
  const el = $("txMessage");
  if (!el) return;
  el.textContent = text;

  el.classList.remove("success", "error");
  if (type === "success") el.classList.add("success");
  if (type === "error") el.classList.add("error");
}

function getInjectedProvider() {
  if (window.bitget && window.bitget.ethereum) return window.bitget.ethereum;
  if (window.bitkeep && window.bitkeep.ethereum) return window.bitkeep.ethereum;
  if (window.ethereum) return window.ethereum;
  return null;
}

function getRefFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const ref = params.get("ref");
  if (ref && ethers.utils.isAddress(ref)) return ref;
  return zero;
}

async function init() {
  $("contractAddr").textContent = window.ADDR.CONTRACT;

  $("btnConnect").onclick = connectWallet;
  $("btnCopy").onclick = copyRefLink;

  $("btnReloadPkgs").onclick = () => loadPackages(true);
  $("btnReloadStakes").onclick = () => loadMyStakes(true);

  $("btnApprove").onclick = approveUSDTUnlimited;

  updateRefLinkUI();

  // auto init provider (optional)
  injected = getInjectedProvider();
}

async function connectWallet() {
  try {
    injected = getInjectedProvider();
    if (!injected) {
      alert("ไม่พบ Wallet (MetaMask/Bitget) ในเบราว์เซอร์");
      return;
    }

    provider = new ethers.providers.Web3Provider(injected, "any");
    const accounts = await injected.request({ method: "eth_requestAccounts" });
    currentAccount = accounts?.[0];
    if (!currentAccount) throw new Error("No account");

    const net = await provider.getNetwork();
    $("netName").textContent = `${window.NETWORK.name} (chainId ${net.chainId})`;
    if (net.chainId !== window.NETWORK.chainIdDec) {
      alert("กรุณาเลือกเครือข่าย BNB Smart Chain (Mainnet) ก่อน");
      throw new Error("Wrong network: " + net.chainId);
    }

    signer = provider.getSigner();

    usdt = new ethers.Contract(window.ADDR.USDT, window.ERC20_MINI_ABI, signer);
    mtec = new ethers.Contract(window.ADDR.MTEC, window.ERC20_MINI_ABI, signer);
    sale = new ethers.Contract(window.ADDR.CONTRACT, window.SALE_ABI, signer);

    $("btnConnect").textContent = shortAddr(currentAccount);
    $("walletAddr").textContent = currentAccount;

    updateRefLinkUI();

    // listen changes
    if (injected.on) {
      injected.on("accountsChanged", () => window.location.reload());
      injected.on("chainChanged", () => window.location.reload());
    }

    setMsg("Connected.", "success");

    await refreshBalances();
    await loadParams();
    await loadPackages();
    await loadMyStakes();
  } catch (e) {
    console.error(e);
    setMsg("Connect failed: " + (e?.message || e), "error");
  }
}

async function refreshBalances() {
  if (!signer || !currentAccount) return;
  try {
    const [u, m] = await Promise.all([
      usdt.balanceOf(currentAccount),
      mtec.balanceOf(currentAccount)
    ]);
    $("usdtBalance").textContent = fmtUnits(u, window.DECIMALS.USDT, 4);
    $("mtecBalance").textContent = fmtUnits(m, window.DECIMALS.MTEC, 4);
  } catch (e) {
    console.warn("refreshBalances:", e);
  }
}

async function loadParams() {
  if (!sale) return;
  try {
    const [apy, lock, en, r1, r2, r3] = await Promise.all([
      sale.apyBasisPoints(),
      sale.lockDuration(),
      sale.enabled(),
      sale.ref1Bps(),
      sale.ref2Bps(),
      sale.ref3Bps()
    ]);

    const apyPct = (Number(apy) / 100).toFixed(2);
    const lockDays = Math.round(Number(lock) / 86400);

    $("paramsBox").textContent =
      `APY ${apyPct}% • Lock ${lockDays} days • Referral ${Number(r1)/100}% / ${Number(r2)/100}% / ${Number(r3)/100}% • ${en ? "Enabled" : "Disabled"}`;

    const ref = getRefFromUrl();
    $("refHint").textContent =
      ref !== zero
        ? `คุณเปิดผ่านลิงก์แนะนำ: ${shortAddr(ref)}`
        : `ถ้าต้องการผูก ref ให้เปิดผ่านลิงก์ ?ref=0x... ก่อนซื้อครั้งแรก`;
  } catch (e) {
    console.warn("loadParams:", e);
  }
}

async function loadPackages(force = false) {
  if (!sale) return;
  try {
    setMsg("Loading packages...", "");
    const box = $("packages");
    box.innerHTML = "";

    const maxScan = window.UI_CONST?.MAX_PACKAGES_TO_SCAN || 50;

    // try packageCount (may be highest id)
    let pc = 0;
    try { pc = Number(await sale.packageCount()); } catch (_) {}
    const upper = Math.max(pc, maxScan);

    let found = 0;

    for (let id = 1; id <= upper; id++) {
      let p;
      try {
        p = await sale.packages(id);
      } catch (_) {
        continue;
      }
      const usdtIn = p.usdtIn;
      const mtecOut = p.mtecOut;
      const active = p.active;

      // skip empty
      if (usdtIn.eq(0) && mtecOut.eq(0) && !active) continue;

      // render
      found++;
      box.appendChild(renderPackageCard(id, usdtIn, mtecOut, active));
    }

    if (!found) {
      box.innerHTML = `<div class="muted">ยังไม่พบแพ็คเกจ (owner ต้องตั้ง setPackage ก่อน)</div>`;
    }

    setMsg("", "");
  } catch (e) {
    console.error(e);
    setMsg("Load packages failed: " + (e?.message || e), "error");
  }
}

function renderPackageCard(id, usdtInBN, mtecOutBN, active) {
  const div = document.createElement("div");
  div.className = "pkgCard";

  const usdtIn = fmtUnits(usdtInBN, window.DECIMALS.USDT, 4);
  const mtecOut = fmtUnits(mtecOutBN, window.DECIMALS.MTEC, 4);

  div.innerHTML = `
    <div class="pkgTop">
      <div>
        <div class="badge">Package #${id}</div>
        <div class="muted" style="margin-top:6px;">${active ? "Active" : "Inactive"}</div>
      </div>
      <div class="muted">${active ? "✅" : "⛔"}</div>
    </div>

    <div class="kv"><div class="k">Pay</div><div class="v">${usdtIn} USDT</div></div>
    <div class="kv"><div class="k">Stake Principal</div><div class="v">${mtecOut} MTEC</div></div>

    <div class="hint">
      Referral ถูกหักจากผู้ซื้อทันที (USDT) • เงินต้น/กำไรจ่ายเป็น MTEC เมื่อครบสัญญา
    </div>

    <div class="smallBtnRow">
      <button class="btnPrimary" ${active ? "" : "disabled"} data-buy="${id}">Buy Package</button>
      <button class="btnOutline" data-preview="${id}">Preview</button>
    </div>
  `;

  // bind buttons
  div.querySelector('[data-buy]')?.addEventListener("click", async (ev) => {
    const pid = Number(ev.currentTarget.getAttribute("data-buy"));
    await buyPackage(pid);
  });

  div.querySelector('[data-preview]')?.addEventListener("click", async () => {
    await previewPackage(id);
  });

  return div;
}

async function previewPackage(id) {
  try {
    if (!sale) { await connectWallet(); if (!sale) return; }
    const p = await sale.packages(id);
    const usdtIn = fmtUnits(p.usdtIn, window.DECIMALS.USDT, 6);
    const mtecOut = fmtUnits(p.mtecOut, window.DECIMALS.MTEC, 6);

    // show ref chain (if any)
    const [r1, r2, r3] = await sale.getReferrers(currentAccount);

    alert(
      `Package #${id}\n` +
      `Pay: ${usdtIn} USDT\n` +
      `Stake Principal: ${mtecOut} MTEC\n\n` +
      `Your referrers:\n` +
      `L1: ${r1}\nL2: ${r2}\nL3: ${r3}`
    );
  } catch (e) {
    console.warn(e);
    alert("Preview failed: " + (e?.message || e));
  }
}

async function approveUSDTUnlimited() {
  try {
    if (!usdt) { await connectWallet(); if (!usdt) return; }

    setMsg("Approving USDT (unlimited)...", "");
    const tx = await usdt.approve(window.ADDR.CONTRACT, ethers.constants.MaxUint256, {
      gasLimit: window.UI_CONST?.GAS?.approve || 120000
    });
    await tx.wait();
    setMsg("Approve success.", "success");
  } catch (e) {
    console.error(e);
    setMsg("Approve failed: " + errText(e), "error");
  }
}

async function ensureAllowance(requiredBN) {
  const allowance = await usdt.allowance(currentAccount, window.ADDR.CONTRACT);
  if (allowance.gte(requiredBN)) return true;

  setMsg("USDT allowance not enough. Sending approve...", "");
  const tx = await usdt.approve(window.ADDR.CONTRACT, ethers.constants.MaxUint256, {
    gasLimit: window.UI_CONST?.GAS?.approve || 120000
  });
  await tx.wait();
  return true;
}

async function buyPackage(packageId) {
  try {
    if (!sale || !usdt) { await connectWallet(); if (!sale) return; }

    // read package to know required USDT
    const p = await sale.packages(packageId);
    if (!p.active) {
      setMsg("Package is inactive.", "error");
      return;
    }

    // allowance check + auto approve
    await ensureAllowance(p.usdtIn);

    const ref = getRefFromUrl();

    setMsg(`Buying package #${packageId}...`, "");
    const tx = await sale.buyPackage(packageId, ref, {
      gasLimit: window.UI_CONST?.GAS?.buy || 650000
    });

    await tx.wait();

    setMsg("Buy success! Your stake is created.", "success");

    await refreshBalances();
    await loadMyStakes(true);
  } catch (e) {
    console.error(e);
    setMsg("Buy failed: " + errText(e), "error");
  }
}

async function loadMyStakes(force = false) {
  if (!sale || !currentAccount) return;

  try {
    setMsg("Loading your stakes...", "");
    const box = $("stakes");
    box.innerHTML = "";

    const count = Number(await sale.getStakeCount(currentAccount));
    if (!count) {
      box.innerHTML = `<div class="muted">ยังไม่มี stake</div>`;
      setMsg("", "");
      return;
    }

    for (let i = 0; i < count; i++) {
      const s = await sale.getStake(currentAccount, i);
      const pending = await sale.pendingReward(currentAccount, i);
      const can = await sale.canClaim(currentAccount, i);

      box.appendChild(renderStakeCard(i, s, pending, can));
    }

    setMsg("", "");
  } catch (e) {
    console.error(e);
    setMsg("Load stakes failed: " + errText(e), "error");
  }
}

function renderStakeCard(index, s, pendingBN, canClaimBool) {
  const div = document.createElement("div");
  div.className = "stakeCard";

  const principal = fmtUnits(s.principalMTEC, window.DECIMALS.MTEC, 6);
  const pending = fmtUnits(pendingBN, window.DECIMALS.MTEC, 6);
  const usdtPaid = fmtUnits(s.usdtPaid, window.DECIMALS.USDT, 6);
  const usdtNet = fmtUnits(s.usdtNet, window.DECIMALS.USDT, 6);

  const apyPct = (Number(s.apyBPAtStake) / 100).toFixed(2);
  const lockDays = Math.round(Number(s.lockAtStake) / 86400);

  const start = new Date(Number(s.startTime) * 1000);
  const end = new Date((Number(s.startTime) + Number(s.lockAtStake)) * 1000);

  div.innerHTML = `
    <div class="stakeTop">
      <div>
        <div class="badge">Stake #${index}</div>
        <div class="muted" style="margin-top:6px;">${s.claimed ? "Claimed" : (canClaimBool ? "Claimable ✅" : "Locked 🔒")}</div>
      </div>
      <div class="muted">${s.claimed ? "✅" : (canClaimBool ? "🟦" : "⏳")}</div>
    </div>

    <div class="kv"><div class="k">USDT Paid</div><div class="v">${usdtPaid}</div></div>
    <div class="kv"><div class="k">USDT Net</div><div class="v">${usdtNet}</div></div>

    <div class="kv"><div class="k">Principal</div><div class="v">${principal} MTEC</div></div>
    <div class="kv"><div class="k">Pending Reward</div><div class="v">${pending} MTEC</div></div>

    <div class="kv"><div class="k">APY</div><div class="v">${apyPct}%</div></div>
    <div class="kv"><div class="k">Lock</div><div class="v">${lockDays} days</div></div>

    <div class="kv"><div class="k">Start</div><div class="v">${start.toLocaleString()}</div></div>
    <div class="kv"><div class="k">Maturity</div><div class="v">${end.toLocaleString()}</div></div>

    <div class="kv"><div class="k">Ref (L1)</div><div class="v">${s.ref1}</div></div>

    <div class="smallBtnRow">
      <button class="btnPrimary" ${(!canClaimBool || s.claimed) ? "disabled" : ""} data-claim="${index}">Claim</button>
      <button class="btnOutline" data-refresh="1">Refresh</button>
    </div>
  `;

  div.querySelector('[data-claim]')?.addEventListener("click", async (ev) => {
    const idx = Number(ev.currentTarget.getAttribute("data-claim"));
    await claimStake(idx);
  });
  div.querySelector('[data-refresh]')?.addEventListener("click", async () => {
    await refreshBalances();
    await loadMyStakes(true);
    await loadParams();
  });

  return div;
}

async function claimStake(index) {
  try {
    if (!sale) { await connectWallet(); if (!sale) return; }

    setMsg(`Claiming stake #${index}...`, "");
    const tx = await sale.claim(index, {
      gasLimit: window.UI_CONST?.GAS?.claim || 450000
    });
    await tx.wait();

    setMsg("Claim success!", "success");
    await refreshBalances();
    await loadMyStakes(true);
  } catch (e) {
    console.error(e);
    setMsg("Claim failed: " + errText(e), "error");
  }
}

// ---------- Referral link UI ----------
function updateRefLinkUI() {
  const base = window.location.origin + window.location.pathname;
  const link = currentAccount ? `${base}?ref=${currentAccount}` : base;
  if ($("refLink")) $("refLink").value = link;
}

function copyRefLink() {
  const input = $("refLink");
  if (!input) return;
  input.select();
  document.execCommand("copy");
  alert("Copied referral link");
}

// ---------- Helpers ----------
function fmtUnits(bn, decimals, fixed = 4) {
  try {
    const v = ethers.utils.formatUnits(bn, decimals);
    const n = Number(v);
    if (!isFinite(n)) return v;
    return n.toLocaleString(undefined, { maximumFractionDigits: fixed });
  } catch {
    return String(bn);
  }
}

function errText(e) {
  return (
    e?.data?.message ||
    e?.error?.message ||
    e?.reason ||
    e?.message ||
    String(e)
  );
}

// ---------- start ----------
window.addEventListener("load", init);
