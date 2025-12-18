let provider, signer, account;
let usdt, contract;

const $ = (id) => document.getElementById(id);
const ZERO = "0x0000000000000000000000000000000000000000";

function setMsg(t, c="") {
  const el = $("txMessage");
  if (!el) return;
  el.textContent = t;
  el.style.color = c === "error" ? "red" : c === "success" ? "green" : "#0a2540";
}

async function connectWallet() {
  const eth = window.ethereum || window.bitget?.ethereum;
  if (!eth) return alert("Wallet not found");

  provider = new ethers.providers.Web3Provider(eth);
  await eth.request({ method: "eth_requestAccounts" });
  signer = provider.getSigner();
  account = await signer.getAddress();

  const net = await provider.getNetwork();
  if (net.chainId !== NETWORK.chainId) {
    alert("กรุณาใช้ BSC Mainnet");
    return;
  }

  $("btnConnect").textContent =
    account.slice(0,6)+"..."+account.slice(-4);

  usdt = new ethers.Contract(ADDR.USDT, ERC20_ABI, signer);
  contract = new ethers.Contract(ADDR.CONTRACT, CONTRACT_ABI, signer);

  loadPackages();
  updateRefLink();
}

async function loadPackages() {
  const sel = $("packageSelect");
  sel.innerHTML = "";

  const count = await contract.packageCount();
  for (let i=1;i<=count;i++){
    const p = await contract.packages(i);
    if (!p.active) continue;

    const usdt = ethers.utils.formatUnits(p.usdtIn, DECIMALS.USDT);
    const mtec = ethers.utils.formatUnits(p.mtecOut, DECIMALS.MTEC);

    const opt = document.createElement("option");
    opt.value = i;
    opt.textContent = `${usdt} USDT → ${mtec} MTEC`;
    sel.appendChild(opt);
  }
}

async function approveUSDT() {
  setMsg("Approving...");
  const tx = await usdt.approve(ADDR.CONTRACT, ethers.constants.MaxUint256);
  await tx.wait();
  setMsg("Approve success", "success");
}

function getRef() {
  const r = new URLSearchParams(location.search).get("ref");
  return r && ethers.utils.isAddress(r) ? r : ZERO;
}

async function buy() {
  const pid = $("packageSelect").value;
  setMsg("Processing...");
  const tx = await contract.buyPackage(pid, getRef(), { gasLimit: 600000 });
  await tx.wait();
  setMsg("Success!", "success");
}

function updateRefLink() {
  const url = new URL(location.href);
  url.searchParams.set("ref", account);
  $("refLink").value = url.toString();
}

async function copyRef() {
  await navigator.clipboard.writeText($("refLink").value);
  alert("Copied");
}

window.onload = () => {
  $("btnConnect").onclick = connectWallet;
  $("btnApprove").onclick = approveUSDT;
  $("btnBuy").onclick = buy;
  $("btnCopy").onclick = copyRef;
};
