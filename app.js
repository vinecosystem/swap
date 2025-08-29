// Kiểm tra MetaMask
if (typeof window.ethereum === "undefined") {
  alert("Please install MetaMask to use VinSwap!");
}

// Biến toàn cục
let provider, signer, userAccount;
let vinTokenAddress = "0x941F63807401efCE8afe3C9d88d368bAA287Fac4";
let vinSwapAddress = "0xFFE8C8E49f065b083ce3F45014b443Cb6c5F6e38";
let rpcUrl = "https://rpc.viction.xyz";

let fromToken = "VIC";
let toToken = "VIN";
const balances = { VIC: 0, VIN: 0 };

// Kết nối ví
async function connectWallet() {
  try {
    if (!window.ethereum) {
      alert("Please install MetaMask!");
      return;
    }

    provider = new ethers.providers.Web3Provider(window.ethereum);
    await provider.send("eth_requestAccounts", []);
    signer = provider.getSigner();
    userAccount = await signer.getAddress();

    document.getElementById("wallet-address").innerText = userAccount;

    // Ẩn phần giới thiệu, hiện swap
    document.querySelector(".main-content").style.display = "none";
    document.querySelector(".connect-container").style.display = "none";
    document.getElementById("swap-interface").style.display = "block";
    document.getElementById("add-viction").style.display = "none";  // Ẩn phần "Add Viction Network & VIN Token"

    await getBalances();
  } catch (error) {
    console.error("Wallet connection failed:", error);
    alert("Wallet connection failed!");
  }
}

// Lấy số dư
async function getBalances() {
  try {
    if (!userAccount) return;

    const vicProvider = new ethers.providers.JsonRpcProvider(rpcUrl);
    const vicBalanceRaw = await vicProvider.getBalance(userAccount);
    balances.VIC = ethers.utils.formatEther(vicBalanceRaw);

    const vinABI = [
      {
        "constant": true,
        "inputs": [{ "name": "owner", "type": "address" }],
        "name": "balanceOf",
        "outputs": [{ "name": "balance", "type": "uint256" }],
        "stateMutability": "view",
        "type": "function"
      }
    ];
    const vinTokenContract = new ethers.Contract(vinTokenAddress, vinABI, vicProvider);
    const vinBalanceRaw = await vinTokenContract.balanceOf(userAccount);
    balances.VIN = ethers.utils.formatUnits(vinBalanceRaw, 18);

    updateBalanceDisplay();
  } catch (error) {
    console.error("Error fetching balances:", error);
  }
}

function updateBalanceDisplay() {
  document.getElementById("from-balance").textContent = parseFloat(balances[fromToken]).toFixed(6);
  document.getElementById("to-balance").textContent = parseFloat(balances[toToken]).toFixed(6);
}

// Kết nối ví khi người dùng nhấn nút "Connect Wallet"
document.getElementById("connect-wallet").addEventListener("click", connectWallet);

// Ngắt kết nối ví
document.getElementById("disconnect-wallet").addEventListener("click", () => {
  userAccount = null;
  document.getElementById("wallet-address").innerText = "Not Connected";
  document.getElementById("swap-interface").style.display = "none";
  document.querySelector(".main-content").style.display = "block";
  document.querySelector(".connect-container").style.display = "flex";
  document.getElementById("add-viction").style.display = "block";  // Hiển thị lại phần "Add Viction Network & VIN Token"
});

// Swap chiều
document.getElementById("swap-direction").addEventListener("click", () => {
  [fromToken, toToken] = [toToken, fromToken];

  document.getElementById("from-token-symbol").textContent = fromToken;
  document.getElementById("to-token-symbol").textContent = toToken;

  [document.getElementById("from-token-logo").src, document.getElementById("to-token-logo").src] =
    [document.getElementById("to-token-logo").src, document.getElementById("from-token-logo").src];

  updateBalanceDisplay();
});

// Cập nhật kết quả đầu ra
const fromAmountInput = document.getElementById("from-amount");
const toAmountInput = document.getElementById("to-amount");
const maxButton = document.getElementById("max-button");

function updateSwapOutput() {
  let inputAmount = parseFloat(fromAmountInput.value) || 0;
  let outputAmount = 0;

  if (fromToken === "VIC") {
    let netVic = inputAmount - 0.01;
    outputAmount = netVic >= 0.001 ? netVic / 100 : 0;
  } else {
    let vicAmount = inputAmount * 100;
    outputAmount = vicAmount > 0.01 ? vicAmount - 0.01 : 0;
  }

  toAmountInput.value = outputAmount > 0 ? outputAmount.toFixed(6) : "0.000000";
}

fromAmountInput.addEventListener("input", updateSwapOutput);

maxButton.addEventListener("click", () => {
  let maxAmount = parseFloat(document.getElementById("from-balance").textContent.trim()) || 0;
  if (maxAmount > 0) {
    fromAmountInput.value = maxAmount.toFixed(6);
    updateSwapOutput();
  }
});

// Thực hiện Swap
document.getElementById("swap-now").addEventListener("click", async () => {
  try {
    if (!userAccount) {
      alert("❌ Please connect your wallet!");
      return;
    }

    let fromAmount = parseFloat(document.getElementById("from-amount").value);
    if (isNaN(fromAmount) || fromAmount <= 0) {
      alert("❌ Invalid amount!");
      return;
    }

    const provider = new ethers.providers.Web3Provider(window.ethereum);
    const network = await provider.getNetwork();
    if (network.chainId !== 88) {
      await switchToVICNetwork();
    }

    const signer = provider.getSigner();
    const swapABI = [
      "function swapVicToVin() payable",
      "function swapVinToVic(uint256 vinAmount) external"
    ];
    const swapContract = new ethers.Contract(vinSwapAddress, swapABI, signer);

    let tx;
    if (fromToken === "VIC") {
      if (fromAmount < 0.011) {
        alert("❌ Minimum swap: 0.011 VIC");
        return;
      }
      tx = await swapContract.swapVicToVin({ value: ethers.utils.parseEther(fromAmount.toString()) });
    } else {
      if (fromAmount < 0.00011) {
        alert("❌ Minimum swap: 0.00011 VIN");
        return;
      }
      const vinTokenContract = new ethers.Contract(vinTokenAddress, [
        "function approve(address spender, uint256 amount) external returns (bool)"
      ], signer);
      const vinAmount = ethers.utils.parseUnits(fromAmount.toString(), 18);
      const approveTx = await vinTokenContract.approve(vinSwapAddress, vinAmount);
      await approveTx.wait();
      tx = await swapContract.swapVinToVic(vinAmount);
    }

    await tx.wait();
    alert("✅ Swap successful!");
    await getBalances();
  } catch (error) {
    console.error("Swap failed:", error);
    alert("❌ Swap failed!");
  }
});

async function switchToVICNetwork() {
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0x58" }]
    });
  } catch (error) {
    console.error("Network switch error:", error);
    alert("⚠️ Please add Viction network manually in MetaMask.");
  }
}
