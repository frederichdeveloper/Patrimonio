// Database IndexedDB Inizializzazione
let db = null;
let currentUserEmail = localStorage.getItem('patrimonio_session') || null;

const request = indexedDB.open("PatrimonioLocalDB", 1);

request.onupgradeneeded = (event) => {
  db = event.target.result;
  // Tabella Utenti
  if (!db.objectStoreNames.contains("users")) {
    db.createObjectStore("users", { keyPath: "email" });
  }
  // Tabella Transazioni
  if (!db.objectStoreNames.contains("transactions")) {
    const txStore = db.createObjectStore("transactions", { keyPath: "id", autoIncrement: true });
    txStore.createIndex("userEmail", "userEmail", { unique: false });
  }
};

request.onsuccess = (event) => {
  db = event.target.result;
  if (currentUserEmail) {
    showDashboard(currentUserEmail);
  }
};

// Funzione di utilità per criptare la password con SHA-256
async function hashPassword(password) {
  const msgBuffer = new TextEncoder().encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Elementi DOM
const authContainer = document.getElementById('authContainer');
const appDashboard = document.getElementById('appDashboard');
const userSection = document.getElementById('userSection');
const userEmailDisplay = document.getElementById('userEmail');
const authMessage = document.getElementById('authMessage');

// Registrazione Utente
document.getElementById('signUpBtn').addEventListener('click', async () => {
  const email = document.getElementById('authEmail').value.trim().toLowerCase();
  const password = document.getElementById('authPassword').value;

  if (!email || !password) {
    showMessage("Inserisci un'email e una password valide.", "text-danger");
    return;
  }

  const hashedPassword = await hashPassword(password);
  const tx = db.transaction(["users"], "readwrite");
  const store = tx.objectStore("users");

  const getUserRequest = store.get(email);
  getUserRequest.onsuccess = () => {
    if (getUserRequest.result) {
      showMessage("Un account con questa email esiste già.", "text-danger");
    } else {
      store.add({ email: email, password: hashedPassword });
      showMessage("Account creato con successo! Ora puoi accedere.", "text-success");
    }
  };
});

// Login Utente
document.getElementById('authForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('authEmail').value.trim().toLowerCase();
  const password = document.getElementById('authPassword').value;

  const hashedPassword = await hashPassword(password);
  const tx = db.transaction(["users"], "readonly");
  const store = tx.objectStore("users");

  const getUserRequest = store.get(email);
  getUserRequest.onsuccess = () => {
    const user = getUserRequest.result;
    if (user && user.password === hashedPassword) {
      localStorage.setItem('patrimonio_session', email);
      currentUserEmail = email;
      showDashboard(email);
    } else {
      showMessage("Email o password errati.", "text-danger");
    }
  };
});

// Logout
document.getElementById('logoutBtn').addEventListener('click', () => {
  localStorage.removeItem('patrimonio_session');
  currentUserEmail = null;
  authContainer.classList.remove('d-none');
  appDashboard.classList.add('d-none');
  userSection.classList.add('d-none');
});

// Mostra la Dashboard
function showDashboard(email) {
  authContainer.classList.add('d-none');
  appDashboard.classList.remove('d-none');
  userSection.classList.remove('d-none');
  userSection.classList.add('d-flex');
  userEmailDisplay.textContent = email;
  loadTransactions();
}

function showMessage(text, className) {
  authMessage.textContent = text;
  authMessage.className = `small mt-3 ${className}`;
}

// Aggiungi Movimento
document.getElementById('txForm').addEventListener('submit', (e) => {
  e.preventDefault();
  if (!currentUserEmail) return;

  const newTx = {
    userEmail: currentUserEmail,
    type: document.getElementById('type').value,
    amount: parseFloat(document.getElementById('amount').value),
    description: document.getElementById('description').value,
    account: document.getElementById('account').value,
    category: document.getElementById('category').value,
    date: new Date().toLocaleDateString('it-IT')
  };

  const tx = db.transaction(["transactions"], "readwrite");
  const store = tx.objectStore("transactions");
  store.add(newTx);

  tx.oncomplete = () => {
    document.getElementById('txForm').reset();
    loadTransactions();
  };
});

// Carica Movimenti dell'Utente Corrente
function loadTransactions() {
  const tx = db.transaction(["transactions"], "readonly");
  const store = tx.objectStore("transactions");
  const index = store.index("userEmail");
  const request = index.getAll(currentUserEmail);

  request.onsuccess = () => {
    const transactions = request.result;
    const txList = document.getElementById('txList');
    txList.innerHTML = '';

    let incomeSum = 0;
    let expenseSum = 0;

    transactions.reverse().forEach((item) => {
      const val = item.amount;
      if (item.type === 'income') incomeSum += val;
      else expenseSum += val;

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="small text-muted">${item.date}</td>
        <td class="fw-semibold">${item.description}</td>
        <td><span class="badge badge-account">${item.account}</span></td>
        <td><span class="badge badge-category">${item.category}</span></td>
        <td class="text-end fw-bold ${item.type === 'income' ? 'text-income' : 'text-expense'}">
          ${item.type === 'income' ? '+' : '-'}€ ${val.toFixed(2)}
        </td>
        <td class="text-end">
          <button class="btn btn-link text-danger p-0 border-0" onclick="deleteTx(${item.id})">
            <i class="bi bi-x-circle"></i>
          </button>
        </td>
      `;
      txList.appendChild(tr);
    });

    document.getElementById('totalBalance').textContent = `€ ${(incomeSum - expenseSum).toFixed(2)}`;
    document.getElementById('totalIncome').textContent = `€ ${incomeSum.toFixed(2)}`;
    document.getElementById('totalExpense').textContent = `€ ${expenseSum.toFixed(2)}`;
  };
}

// Elimina Transazione
window.deleteTx = function(id) {
  const tx = db.transaction(["transactions"], "readwrite");
  const store = tx.objectStore("transactions");
  store.delete(id);
  tx.oncomplete = () => loadTransactions();
};
