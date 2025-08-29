// Check if MetaMask is installed in the browser
if (typeof window.ethereum === "undefined") {
  alert("Please install MetaMask to use VinSwap!"); // Alert user if MetaMask is not installed
}

// Declare necessary variables
let provider, signer, userAccount;
let vinTokenAddress = "0x941F63807401efCE8afe3C9d88d368bAA287Fac4"; // VIN Token Contract Address
let vinSwapAddress = "0xFFE8C8E49f065b083ce3F45014b443Cb6c5F6e38"; // VIN Swap Contract Address
let rpcUrl = "https://rpc.viction.xyz"; // Viction RPC URL

let fromToken = "VIC"; // Default token to swap from
let toToken = "VIN"; // Default token to swap to
const balances = { VIC: 0, VIN: 0 }; // Object to store user token balances

// Function to connect wallet
async function connectWallet() {
  try {
    // Check if MetaMask is installed
    if (!window.ethereum) {
      alert("Please install MetaMask!"); // Alert if MetaMask is missing
      return;
    }

    // Connect to the provider and signer
    provider = new ethers.providers.Web3Provider(window.ethereum);
    await provider.send("eth_requestAccounts", []); // Request user's accounts
    signer = provider.getSigner(); // Get signer object
    userAccount = await signer.getAddress(); // Get the user's wallet address

    document.getElementById("wallet-address").innerText = userAccount; // Display wallet address

    // Hide unnecessary sections when wallet is connected
    document.querySelector(".main-content").style.display = "none";
    document.querySelector(".connect-container").style.display = "none";
    document.getElementById("swap-interface").style.display = "block";
    document.getElementById("add-viction").style.display = "none";  // Hide Viction Network and VIN Token instructions

    await getBalances(); // Get user token balances
  } catch (error) {
    console.error("Wallet connection failed:", error); // Log error in case of failure
    alert("Wallet connection failed!"); // Alert user if connection fails
  }
}

// Function to fetch token balances
async function getBalances() {
  try {
    if (!userAccount) return; // If user account is not set, exit function

    // Get VIC balance
    const vicProvider = new ethers.providers.JsonRpcProvider(rpcUrl);
    const vicBalanceRaw = await vicProvider.getBalance(userAccount);
    balances.VIC = ethers.utils.formatEther(vicBalanceRaw); // Convert VIC balance to ether format

    // Get VIN balance
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
    balances.VIN = ethers.utils.formatUnits(vinBalanceRaw, 18); // Format VIN balance with 18 decimals

    updateBalanceDisplay(); // Update balance display on the page
  } catch (error) {
    console.error("Error fetching balances:", error); // Log any errors while fetching balances
  }
}

// Function to update balance display on the page
function updateBalanceDisplay() {
  document.getElementById("from-balance").textContent = parseFloat(balances[fromToken]).toFixed(6); // Display 'from' token balance
  document.getElementById("to-balance").textContent = parseFloat(balances[toToken]).toFixed(6); // Display 'to' token balance
}

// Event listener for connecting the wallet when the button is clicked
document.getElementById("connect-wallet").addEventListener("click", connectWallet);

// Event listener for disconnecting the wallet
document.getElementById("disconnect-wallet").addEventListener("click", () => {
  userAccount = null; // Clear user account
  document.getElementById("wallet-address").innerText = "Not Connected"; // Display 'Not Connected' message
  document.getElementById("swap-interface").style.display = "none"; // Hide swap interface
  document.querySelector(".main-content").style.display = "block"; // Show main content
  document.querySelector(".connect-container").style.display = "flex"; // Show connect container
  document.getElementById("add-viction").style.display = "block";  // Show "Add Viction Network & VIN Token" section
});

// Event listener to swap tokens (VIC <-> VIN)
document.getElementById("swap-direction").addEventListener("click", () => {
  [fromToken, toToken] = [toToken, fromToken]; // Swap the 'from' and 'to' tokens

  // Update the token symbols and logos in the interface
  document.getElementById("from-token-symbol").textContent = fromToken;
  document.getElementById("to-token-symbol").textContent = toToken;

  [document.getElementById("from-token-logo").src, document.getElementById("to-token-logo").src] =
    [document.getElementById("to-token-logo").src, document.getElementById("from-token-logo").src];

  updateBalanceDisplay(); // Update balance display after swapping
});

// Function to update swap output (amount of 'to' token based on 'from' token input)
const fromAmountInput = document.getElementById("from-amount");
const toAmountInput = document.getElementById("to-amount");
const maxButton = document.getElementById("max-button");

function updateSwapOutput() {
  let inputAmount = parseFloat(fromAmountInput.value) || 0; // Get the input amount from the user
  let outputAmount = 0;

  if (fromToken === "VIC") {
    let netVic = inputAmount - 0.01; // Subtract transaction fee
    outputAmount = netVic >= 0.001 ? netVic / 100 : 0; // Convert VIC to VIN if valid
  } else {
    let vicAmount = inputAmount * 100; // Convert VIN to VIC
    outputAmount = vicAmount > 0.01 ? vicAmount - 0.01 : 0; // Deduct transaction fee
  }

  toAmountInput.value = outputAmount > 0 ? outputAmount.toFixed(6) : "0.000000"; // Display output amount in 'to' token field
}

// Event listener for user input to update swap output
fromAmountInput.addEventListener("input", updateSwapOutput);

// Event listener for "Max" button to set the maximum amount to swap
maxButton.addEventListener("click", () => {
  let maxAmount = parseFloat(document.getElementById("from-balance").textContent.trim()) || 0; // Get the max amount from the balance
  if (maxAmount > 0) {
    fromAmountInput.value = maxAmount.toFixed(6); // Set input field to max amount
    updateSwapOutput(); // Update output after setting max amount
  }
});

// Event listener for "Swap Now" button to execute the swap
document.getElementById("swap-now").addEventListener("click", async () => {
  try {
    if (!userAccount) {
      alert("❌ Please connect your wallet!"); // Alert if wallet is not connected
      return;
    }

    let fromAmount = parseFloat(document.getElementById("from-amount").value); // Get the amount to swap
    if (isNaN(fromAmount) || fromAmount <= 0) {
      alert("❌ Invalid amount!"); // Alert if the amount is invalid
      return;
    }

    const provider = new ethers.providers.Web3Provider(window.ethereum); // Get the provider
    const network = await provider.getNetwork(); // Get the current network
    if (network.chainId !== 88) {
      await switchToVICNetwork(); // Switch to VIC network if not already connected
    }

    const signer = provider.getSigner(); // Get the signer for transactions
    const swapABI = [
      "function swapVicToVin() payable", // ABI for swapping VIC to VIN
      "function swapVinToVic(uint256 vinAmount) external" // ABI for swapping VIN to VIC
    ];
    const swapContract = new ethers.Contract(vinSwapAddress, swapABI, signer); // Instantiate the swap contract

    let tx;
    if (fromToken === "VIC") {
      if (fromAmount < 0.011) {
        alert("❌ Minimum swap: 0.011 VIC"); // Alert if VIC amount is less than minimum
        return;
      }
      tx = await swapContract.swapVicToVin({ value: ethers.utils.parseEther(fromAmount.toString()) }); // Execute VIC to VIN swap
    } else {
      if (fromAmount < 0.00011) {
        alert("❌ Minimum swap: 0.00011 VIN"); // Alert if VIN amount is less than minimum
        return;
      }
      const vinTokenContract = new ethers.Contract(vinTokenAddress, [
        "function approve(address spender, uint256 amount) external returns (bool)" // ABI for approving VIN tokens
      ], signer);
      const vinAmount = ethers.utils.parseUnits(fromAmount.toString(), 18); // Convert VIN amount
      const approveTx = await vinTokenContract.approve(vinSwapAddress, vinAmount); // Approve swap contract to spend VIN
      await approveTx.wait(); // Wait for approval to complete
      tx = await swapContract.swapVinToVic(vinAmount); // Execute VIN to VIC swap
    }

    await tx.wait(); // Wait for transaction to complete
    alert("✅ Swap successful!"); // Notify user of successful swap
    await getBalances(); // Update token balances after swap
  } catch (error) {
    console.error("Swap failed:", error); // Log any errors during the swap process
    alert("❌ Swap failed!"); // Notify user if the swap fails
  }
});

// Function to switch to the Viction network
async function switchToVICNetwork() {
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0x58" }] // VIC network chain ID
    });
  } catch (error) {
    console.error("Network switch error:", error); // Log network switch errors
    alert("⚠️ Please add Viction network manually in MetaMask."); // Alert user to manually add VIC network
  }
}
