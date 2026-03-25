// Modelo de datos actualizado
let accounts = {
  Efectivo: {
    balance: 0,
    type: 'corriente',
    treatment: 'activos',
    description: 'Cuenta de efectivo',
    displayName: 'Efectivo',
    isSettled: false
  },
  Banco: {
    balance: 0,
    type: 'corriente',
    treatment: 'activos',
    description: 'Cuenta bancaria principal',
    displayName: 'Banco',
    isSettled: false
  },
  Tarjeta: {
    balance: 0,
    type: 'credito',
    treatment: 'pasivos',
    description: 'Tarjeta de crédito principal',
    displayName: 'Tarjeta',
    isSettled: false
  }
};

// Safe replace helper to avoid NotFoundError when blur/other handlers remove nodes before replaceWith runs
function safeReplaceWith(oldEl, newEl){
  try {
    // try native replaceWith first
    oldEl.replaceWith(newEl);
  } catch (err) {
    // fallback to replaceChild if oldEl is no longer attached the way replaceWith expects
    if (oldEl && oldEl.parentNode) {
      try { oldEl.parentNode.replaceChild(newEl, oldEl); } catch(e) { /* swallow */ }
    } else {
      // as last resort try to insert newEl where possible
      if (document.body && !newEl.isConnected) document.body.appendChild(newEl);
    }
  }
}

let selectedAccount = null;
let transactions = [];
let selectedTransactionId = null;
let accountsOrder = {
  activos: [],
  pasivos: []
};
let transactionsOrder = [];
let isPanelsHidden = false;

let commissionRates = {
  debito: 1.5,
  credito: 3.0
};

let ivaRate = 19.0;

let salonSales = [];
let salesBoletas = {};

let isCardFilterActive = false;
let isDateFilterActive = false;
let selectedFilterDate = null;

let hairdresserCommissions = {
  aldo: {
    rec: 0,
    com: 100,
    ret: 14.5
  },
  marcos: {
    rec: 3, 
    com: 35,
    ret: 14.5
  },
  otro: {
    rec: 3,
    com: 35,
    ret: 14.5
  }
};

let figaroIndicators = {
  diasHabilesMes: null,
  metaMes: null,
  selectedWeek: 1
};

function formatCurrency(amount) {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
}

function updateAccountButtons() {
  const deleteBtn = document.querySelector('.delete-account-btn');
  
  if (selectedAccount) {
    deleteBtn.disabled = false;
  } else {
    deleteBtn.disabled = true;
  }
}

function updateTotalBalance() {
  const transbankValue = salonSales
    .filter(sale => sale.paymentType === 'credito' || sale.paymentType === 'debito')
    .filter(sale => !sale.paid)
    .reduce((sum, sale) => sum + sale.netAmount, 0);

  // Update Transbank debt value in external data panel
  const transbankDataContent = document.querySelector('.data-box:first-child .data-content p');
  transbankDataContent.textContent = formatCurrency(transbankValue);

  // Calculate Aldo retention
  const aldoSales = salonSales.filter(sale => sale.hairdresser === 'ALDO');
  const aldoTotalSales = aldoSales.reduce((sum, sale) => sum + sale.amount, 0);
  const aldoRetention = aldoTotalSales * (hairdresserCommissions.aldo.ret / 100);

  // Update Aldo retention value in external data panel
  const aldoRetentionContent = document.getElementById('aldoRetentionValue');
  aldoRetentionContent.textContent = formatCurrency(aldoRetention);

  // Get the diferencia semanal value 
  const diferenciaSemanalElement = document.querySelector('.data-box:nth-child(2) .data-content p');
  const diferenciaSemanalValue = diferenciaSemanalElement ? 
    parseFloat(diferenciaSemanalElement.textContent.replace(/[^0-9-]/g, '')) : 0;

  // Calculate activos total (including transbank value)
  const activosTotal = Object.entries(accounts).reduce((sum, [_, account]) => {
    if (account.treatment === 'activos') {
      return sum + account.balance;
    }
    return sum;
  }, 0) + transbankValue;

  // Calculate pasivos total (including diferencia semanal as negative)
  const pasivosTotal = Object.entries(accounts).reduce((sum, [_, account]) => {
    if (account.treatment === 'pasivos') {
      return sum + account.balance;
    }
    return sum;
  }, 0) - Math.abs(diferenciaSemanalValue); // Add diferencia semanal as negative

  // Calculate total balance (activos - pasivos)
  const total = activosTotal - Math.abs(pasivosTotal);
  
  // Update total display
  document.getElementById('totalAmount').textContent = formatCurrency(total);
}

function updateAccountsList() {
  const activosList = document.getElementById('activosList');
  const pasivosList = document.getElementById('pasivosList');
  
  activosList.innerHTML = '';
  pasivosList.innerHTML = '';
  
  let activosTotal = 0;
  let pasivosTotal = 0;

  const activosAccounts = Object.keys(accounts).filter(key => accounts[key].treatment === 'activos');
  const pasivosAccounts = Object.keys(accounts).filter(key => accounts[key].treatment === 'pasivos');

  activosAccounts.forEach(key => {
    if (!accountsOrder.activos.includes(key)) {
      accountsOrder.activos.push(key);
    }
  });
  pasivosAccounts.forEach(key => {
    if (!accountsOrder.pasivos.includes(key)) {
      accountsOrder.pasivos.push(key);
    }
  });

  accountsOrder.activos = accountsOrder.activos.filter(key => accounts[key]);
  accountsOrder.pasivos = accountsOrder.pasivos.filter(key => accounts[key]);
  
  const transbankValue = salonSales
    .filter(sale => sale.paymentType === 'credito' || sale.paymentType === 'debito')
    .filter(sale => !sale.paid)
    .reduce((sum, sale) => sum + sale.netAmount, 0);
  
  accountsOrder.activos.forEach(accountKey => {
    const accountData = accounts[accountKey];
    const div = createAccountElement(accountKey, accountData, activosList);
    activosTotal += accountData.balance;
  });
  
  // Add transbank value to activosTotal
  activosTotal += transbankValue;

  accountsOrder.pasivos.forEach(accountKey => {
    const accountData = accounts[accountKey];
    const div = createAccountElement(accountKey, accountData, pasivosList);
    pasivosTotal += accountData.balance;
  });

  // Add DIFERENCIA SEMANAL FIGARO value to pasivosTotal as a negative value
  const diferenciaSemanalElement = document.querySelector('.data-box:nth-child(2) .data-content p');
  if (diferenciaSemanalElement) {
    const diferenciaSemanalValue = parseFloat(diferenciaSemanalElement.textContent.replace(/[^0-9-]/g, ''));
    if (!isNaN(diferenciaSemanalValue)) {
      // Add as negative value since it represents a cost/expense
      pasivosTotal += -Math.abs(diferenciaSemanalValue);
    }
  }
  
  document.getElementById('activosTotal').textContent = formatCurrency(activosTotal);
  document.getElementById('pasivosTotal').textContent = formatCurrency(pasivosTotal);

  [activosList, pasivosList].forEach(container => {
    container.addEventListener('dragover', handleDragOver);
    container.addEventListener('drop', handleDrop);
    container.addEventListener('dragenter', handleDragEnter);
    container.addEventListener('dragleave', handleDragLeave);
  });
}

function createAccountElement(accountKey, accountData, container) {
  const div = document.createElement('div');
  div.className = `account-item ${accountKey === selectedAccount ? 'selected' : ''}`;
  div.draggable = true;
  div.setAttribute('data-account', accountKey);
  
  let warningIcon = '';
  if (accountData.isSettled) {
    const hasUnsettledTransactions = transactions.some(t => 
      t.account === accountKey && !t.settled && !t.locked
    );
    const hasLockedUnsettledTransactions = transactions.some(t => 
      t.account === accountKey && t.locked && !t.settled
    );
    if (hasUnsettledTransactions || hasLockedUnsettledTransactions) {
      warningIcon = '<span class="warning-icon">⚠️</span>';
    }
  }
  
  div.innerHTML = `
    <div class="account-name-container">
      ${warningIcon}
      <span class="account-name editable">${accountData.displayName}</span>
    </div>
    <span class="account-balance">${formatCurrency(accountData.balance)}</span>
  `;
  
  const accountNameElement = div.querySelector('.account-name');
  accountNameElement.addEventListener('dblclick', () => {
    makeAccountNameEditable(div, accountKey);
  });
  
  div.addEventListener('click', () => {
    selectedTransactionId = null;
    const previousSelected = document.querySelector('.account-item.selected');
    if (previousSelected) {
      previousSelected.classList.remove('selected');
    }
    
    if (selectedAccount === accountKey) {
      selectedAccount = null;
      updateAccountButtons();
    } else {
      selectedAccount = accountKey;
      div.classList.add('selected');
      updateAccountButtons();
    }
    
    updateTransactionsList();
  });

  div.addEventListener('dragstart', handleDragStart);
  div.addEventListener('dragend', handleDragEnd);
  
  container.appendChild(div);
  return div;
}

function makeAccountNameEditable(accountElement, accountKey) {
  const nameElement = accountElement.querySelector('.account-name');
  const currentName = accounts[accountKey].displayName;
  
  const input = document.createElement('input');
  input.type = 'text';
  input.value = currentName;
  input.className = 'edit-account-name';
  input.style.width = '100%';
  input.style.padding = '4px';
  input.style.border = '1px solid #3498db';
  input.style.borderRadius = '4px';
  
  nameElement.replaceWith(input);
  input.focus();

  function saveEdit() {
    const newName = input.value.trim();
    if (newName) {
      const newAccountKey = newName.toLowerCase();
      
      if (accounts[newAccountKey] && newAccountKey !== accountKey) {
        alert('Ya existe una cuenta con este nombre');
        input.value = currentName;
        return;
      }
      
      const accountData = accounts[accountKey];
      delete accounts[accountKey];
      accounts[newAccountKey] = {
        ...accountData,
        displayName: newName
      };
      
      transactions.forEach(transaction => {
        if (transaction.account === accountKey) {
          transaction.account = newAccountKey;
        }
        if (transaction.destinationAccount === accountKey) {
          transaction.destinationAccount = newAccountKey;
        }
      });
      
      if (selectedAccount === accountKey) {
        selectedAccount = newAccountKey;
      }
      
      ['activos', 'pasivos'].forEach(treatment => {
        const index = accountsOrder[treatment].indexOf(accountKey);
        if (index !== -1) {
          accountsOrder[treatment][index] = newAccountKey;
        }
      });
      
      saveToLocalStorage();
      updateAccountsList();
      updateAccountSelectors();
      updateTransactionsList();
    }
    
    const newNameElement = document.createElement('span');
    newNameElement.className = 'account-name editable';
    newNameElement.textContent = newName || currentName;
    safeReplaceWith(input, newNameElement);
    
    newNameElement.addEventListener('dblclick', () => {
      makeAccountNameEditable(accountElement, newName.toLowerCase() || accountKey);
    });
  }
  
  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveEdit();
    }
  });
  
  input.addEventListener('blur', saveEdit);
}

function handleDragStart(e) {
  e.target.classList.add('dragging');
  e.dataTransfer.setData('text/plain', e.target.getAttribute('data-account'));
}

function handleDragEnd(e) {
  e.target.classList.remove('dragging');
}

function handleDragOver(e) {
  e.preventDefault();
}

function handleDragEnter(e) {
  e.preventDefault();
  if (e.target.classList.contains('accounts-list')) {
    e.target.classList.add('drag-over');
  }
}

function handleDragLeave(e) {
  if (e.target.classList.contains('accounts-list')) {
    e.target.classList.remove('drag-over');
  }
}

function handleDrop(e) {
  e.preventDefault();
  
  const accountKey = e.dataTransfer.getData('text/plain');
  const draggedElement = document.querySelector(`[data-account="${accountKey}"]`);
  const dropZone = e.target.closest('.accounts-list');
  
  if (!dropZone || !draggedElement) return;
  
  dropZone.classList.remove('drag-over');
  
  const isSameContainer = draggedElement.parentNode === dropZone;
  const treatment = dropZone.id === 'activosList' ? 'activos' : 'pasivos';
  
  const siblings = Array.from(dropZone.children);
  const dropTarget = e.target.closest('.account-item');
  const dropIndex = dropTarget ? siblings.indexOf(dropTarget) : siblings.length;
  
  accountsOrder[accounts[accountKey].treatment] = accountsOrder[accounts[accountKey].treatment].filter(key => key !== accountKey);
  
  if (!isSameContainer) {
    accounts[accountKey].treatment = treatment;
  }
  
  accountsOrder[treatment].splice(dropIndex, 0, accountKey);
  
  updateAccountsList();
  updateTotalBalance();
  saveToLocalStorage();
}

function updateTransactionsList() {
  const transactionsList = document.getElementById('transactionsList');
  transactionsList.innerHTML = '';
  
  if (!selectedAccount) {
    transactionsList.innerHTML = '<p style="text-align: center; color: #666;">Seleccione una cuenta para ver sus movimientos</p>';
    return;
  }
  
  const buttonContainer = document.createElement('div');
  buttonContainer.style.position = 'absolute';
  buttonContainer.style.top = '20px';
  buttonContainer.style.right = '20px';
  
  if (accounts[selectedAccount].type === 'credito') {
    const toggleAllSettledBtn = document.createElement('button');
    toggleAllSettledBtn.className = 'toggle-all-settled-btn';
    
    const accountTransactions = transactions.filter(t => t.account === selectedAccount);
    const allSettled = accountTransactions.length > 0 && 
                      accountTransactions.every(t => t.settled);
    
    toggleAllSettledBtn.textContent = allSettled ? 'Reactivar Todo' : 'Saldar Todo';
    toggleAllSettledBtn.onclick = () => {
      toggleAllTransactionsSettlement(selectedAccount);
    };
    buttonContainer.appendChild(toggleAllSettledBtn);

    const addInstallmentBtn = document.createElement('button');
    addInstallmentBtn.className = 'add-installment-btn';
    addInstallmentBtn.textContent = '+ Cuota';
    addInstallmentBtn.onclick = () => {
      addNewInstallment(selectedAccount);
    };
    buttonContainer.appendChild(addInstallmentBtn);
  }
  
  const clearAllBtn = document.createElement('button');
  clearAllBtn.className = 'clear-all-btn';
  clearAllBtn.textContent = 'Borrar todo';
  clearAllBtn.onclick = () => {
    if (confirm(`¿Está seguro que desea eliminar todas las transacciones de la cuenta "${accounts[selectedAccount].displayName}"?`)) {
      clearAllTransactions(selectedAccount);
    }
  };
  
  buttonContainer.appendChild(clearAllBtn);
  transactionsList.appendChild(buttonContainer);
  
  let accountTransactions = transactions
    .filter(t => t.account === selectedAccount);

  if (transactionsOrder.length) {
    accountTransactions.sort((a, b) => {
      const indexA = transactionsOrder.indexOf(a.id);
      const indexB = transactionsOrder.indexOf(b.id);
      return indexA - indexB;
    });
  }

  accountTransactions.forEach(transaction => {
    if (!transactionsOrder.includes(transaction.id)) {
      transactionsOrder.push(transaction.id);
    }
  });

  if (accountTransactions.length === 0) {
    transactionsList.innerHTML = '<p style="text-align: center; color: #666;">No hay movimientos para esta cuenta</p>';
    return;
  }

  accountTransactions.forEach(transaction => {
    const div = document.createElement('div');
    div.className = `transaction-item ${transaction.type} ${transaction.settled ? 'settled' : ''} ${transaction.id === selectedTransactionId ? 'selected' : ''}`;
    div.draggable = true;
    div.setAttribute('data-transaction-id', transaction.id);
    const accountDisplayName = accounts[transaction.account]?.displayName || transaction.account;
    
    let buttonsHtml = `<button class="delete-transaction-btn" data-id="${transaction.id}" ${transaction.locked ? 'disabled' : ''}>Eliminar</button>`;
    
    if (accounts[selectedAccount].isSettled) {
      buttonsHtml = `
        <button class="settled-transaction-btn ${transaction.settled ? 'active' : ''}" data-id="${transaction.id}">
          Saldado
        </button>
        ${buttonsHtml}
      `;
    }
    
    let installmentHtml = '';
    if (accounts[selectedAccount].type === 'credito' && transaction.currentInstallment && transaction.totalInstallments) {
      installmentHtml = `
        <span class="installment-info">
          <div class="installment-controls">
            <span class="installment-number">
              ${transaction.currentInstallment}/${transaction.totalInstallments}
            </span>
            <div class="installment-arrows">
              <button class="installment-arrow" data-id="${transaction.id}" data-action="up" 
                      ${transaction.currentInstallment >= transaction.totalInstallments ? 'disabled' : ''}>
                ▲
              </button>
              <button class="installment-arrow" data-id="${transaction.id}" data-action="down"
                      ${transaction.currentInstallment <= 1 ? 'disabled' : ''}>
                ▼
              </button>
            </div>
          </div>
        </span>
      `;
    }
    
    div.innerHTML = `
      <button class="lock-transaction-btn ${transaction.locked ? 'locked' : ''}" data-id="${transaction.id}">
        ${transaction.locked ? '🔒' : '🔓'}
      </button>
      <span>${new Date(transaction.date).toLocaleDateString()}</span>
      <span class="transaction-description editable">${transaction.description}</span>
      ${installmentHtml}
      <span>${accountDisplayName}</span>
      <span class="transaction-amount editable">
        ${formatCurrency(transaction.amount)}
        ${accounts[transaction.account]?.type === 'dolar' && transaction.usdAmount ? 
          `<span class="usd-amount-indicator">USD ${transaction.usdAmount.toFixed(2)}</span>` 
          : ''}
      </span>
      <div class="transaction-buttons">
        ${buttonsHtml}
      </div>
    `;

    const descriptionSpan = div.querySelector('.transaction-description');
    const amountSpan = div.querySelector('.transaction-amount');
    
    descriptionSpan.addEventListener('dblclick', () => {
      makeTransactionFieldEditable(div, transaction.id, 'description');
    });
    
    amountSpan.addEventListener('dblclick', () => {
      makeTransactionFieldEditable(div, transaction.id, 'amount');
    });

    div.addEventListener('click', (e) => {
      if (!e.target.classList.contains('delete-transaction-btn') && 
          !e.target.classList.contains('settled-transaction-btn') &&
          !e.target.classList.contains('edit-transaction-description')) {
        
        const previousSelected = document.querySelector('.transaction-item.selected');
        if (previousSelected) {
          previousSelected.classList.remove('selected');
        }
        
        if (selectedTransactionId === transaction.id) {
          selectedTransactionId = null;
          div.classList.remove('selected');
        } else {
          selectedTransactionId = transaction.id;
          div.classList.add('selected');
        }
      }
    });
    
    div.addEventListener('dragstart', handleTransactionDragStart);
    div.addEventListener('dragend', handleTransactionDragEnd);
    div.addEventListener('dragover', handleTransactionDragOver);
    div.addEventListener('drop', handleTransactionDrop);
    
    transactionsList.appendChild(div);
  });
  
  updateAccountBalance(selectedAccount);
}

function clearAllTransactions(accountKey) {
  selectedTransactionId = null;
  const accountTransactions = transactions.filter(t => t.account === accountKey && !t.locked);
  
  accounts[accountKey].balance = 0;
  
  transactions = transactions.filter(t => t.account !== accountKey || t.locked);
  
  const lockedTransactions = transactions.filter(t => t.account === accountKey && t.locked);
  lockedTransactions.forEach(t => {
    if (t.type === 'ingreso') {
      accounts[accountKey].balance += t.amount;
    } else if (t.type === 'gasto') {
      accounts[accountKey].balance -= t.amount;
    }
  });
  
  updateTotalBalance();
  updateAccountsList();
  updateTransactionsList();
  saveToLocalStorage();
}

function toggleTransactionSettlement(transactionId) {
  const transaction = transactions.find(t => t.id === transactionId);
  if (!transaction) return;
  
  transaction.settled = !transaction.settled;
  
  updateAccountBalance(transaction.account);
  updateTotalBalance();
  updateAccountsList();
  
  const transactionElement = document.querySelector(`[data-transaction-id="${transactionId}"]`);
  if (transactionElement) {
    transactionElement.classList.toggle('settled', transaction.settled);
    const settledBtn = transactionElement.querySelector('.settled-transaction-btn');
    if (settledBtn) {
      settledBtn.classList.toggle('active', transaction.settled);
    }
  }
  
  saveToLocalStorage();
}

function updateAccountBalance(accountKey) {
  if (!accountKey || !accounts[accountKey]) return;
  
  const accountTransactions = transactions.filter(t => t.account === accountKey);
  let balance = 0;
  
  accountTransactions.forEach(transaction => {
    if (transaction.settled) return;
    
    if (transaction.type === 'ingreso') {
      balance += transaction.amount;
    } else if (transaction.type === 'gasto') {
      balance -= transaction.amount;
    }
  });
  
  accounts[accountKey].balance = balance;
  saveToLocalStorage();
}

function makeTransactionFieldEditable(transactionElement, transactionId, fieldType) {
  const fieldSpan = transactionElement.querySelector(`.transaction-${fieldType}`);
  let currentValue = fieldSpan.textContent;
  
  if (fieldType === 'amount') {
    currentValue = currentValue.replace(/[^0-9.-]+/g, "");
  }
  
  const input = document.createElement('input');
  input.type = fieldType === 'amount' ? 'number' : 'text';
  if (fieldType === 'amount') {
    input.step = '0.01';
    input.min = '0';
  }
  input.value = currentValue;
  input.className = `edit-transaction-${fieldType}`;
  input.style.width = '100%';
  input.style.padding = '4px';
  input.style.border = '1px solid #3498db';
  input.style.borderRadius = '4px';
  
  safeReplaceWith(fieldSpan, input);
  input.focus();

  function saveEdit() {
    const newValue = input.value.trim();
    if (newValue) {
      const transaction = transactions.find(t => t.id === transactionId);
      if (transaction) {
        if (fieldType === 'amount') {
          if (transaction.type === 'ingreso') {
            accounts[transaction.account].balance -= transaction.amount;
          } else if (transaction.type === 'gasto') {
            accounts[transaction.account].balance += transaction.amount;
          }
          
          transaction.amount = parseFloat(newValue);
          
          if (transaction.type === 'ingreso') {
            accounts[transaction.account].balance += transaction.amount;
          } else if (transaction.type === 'gasto') {
            accounts[transaction.account].balance -= transaction.amount;
          }
          
          updateTotalBalance();
          updateAccountsList();
        } else {
          transaction[fieldType] = newValue;
        }
        saveToLocalStorage();
      }
    }
    
    const newSpan = document.createElement('span');
    newSpan.className = `transaction-${fieldType} editable`;
    newSpan.textContent = fieldType === 'amount' ? formatCurrency(parseFloat(newValue)) : (newValue || currentValue);
    safeReplaceWith(input, newSpan);
    
    newSpan.addEventListener('dblclick', () => {
      makeTransactionFieldEditable(transactionElement, transactionId, fieldType);
    });
  }
  
  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveEdit();
    }
  });
  
  input.addEventListener('blur', saveEdit);
}

function toggleAllTransactionsSettlement(accountKey) {
  const accountTransactions = transactions.filter(t => t.account === accountKey);
  
  const allSettled = accountTransactions.length > 0 && 
                    accountTransactions.every(t => t.settled);
  
  accountTransactions.forEach(transaction => {
    transaction.settled = !allSettled;
  });
  
  updateAccountBalance(accountKey);
  updateTotalBalance();
  updateAccountsList(); 
  updateTransactionsList();
  saveToLocalStorage();
}

function updateAccountSelectors() {
  const accountSelects = document.querySelectorAll('#account, #destinationAccount');
  accountSelects.forEach(select => {
    const currentValue = select.value;
    select.innerHTML = '';
    
    const accountEntries = Object.entries(accounts);
    
    if (accountEntries.length === 0) {
      const option = document.createElement('option');
      option.value = "";
      option.textContent = "No hay cuentas disponibles";
      option.disabled = true;
      select.appendChild(option);
    } else {
      const promptOption = document.createElement('option');
      promptOption.value = "";
      promptOption.textContent = "Seleccione una cuenta";
      select.appendChild(promptOption);
      
      accountEntries.forEach(([accountKey, accountData]) => {
        const option = document.createElement('option');
        option.value = accountKey;
        option.textContent = accountData.displayName;
        select.appendChild(option);
      });
    }
    
    if (accounts[currentValue]) {
      select.value = currentValue;
    } else {
      select.value = '';
    }
  });
  
  const transactionForm = document.getElementById('transactionForm');
  const submitButton = transactionForm.querySelector('button[type="submit"]');
  const accountSelect = document.getElementById('account');
  
  if (Object.keys(accounts).length === 0) {
    accountSelect.value = "";
    submitButton.disabled = true;
    submitButton.title = "Debe crear al menos una cuenta para registrar transacciones";
  } else {
    submitButton.disabled = false;
    submitButton.title = "";
  }
}

function accountFormEventHandler(e) {
  e.preventDefault();
  
  const isEditing = document.getElementById('isEditing').value === 'true';
  const accountName = document.getElementById('accountName').value.trim();
  const accountKey = accountName.toLowerCase();
  const accountType = document.getElementById('accountType').value;
  const accountTreatment = document.getElementById('accountTreatment').value;
  const initialBalance = parseFloat(document.getElementById('initialBalance').value);
  const isSettled = document.getElementById('isSettled').checked;
  
  if (!isEditing && accounts[accountKey]) {
    alert('Esta cuenta ya existe');
    return;
  }
  
  if (isEditing) {
    const oldAccountData = accounts[selectedAccount];
    delete accounts[selectedAccount];
    accounts[accountKey] = {
      ...oldAccountData,
      displayName: accountName
    };
    selectedAccount = accountKey;
  } else {
    accounts[accountKey] = {
      balance: initialBalance,
      type: accountType,
      treatment: accountTreatment,
      description: '',
      displayName: accountName,
      isSettled: isSettled
    };
    
    if (initialBalance !== 0) {
      addTransaction({
        amount: Math.abs(initialBalance),
        type: initialBalance > 0 ? 'ingreso' : 'gasto',
        account: accountKey,
        description: 'Saldo inicial'
      });
    }
  }
  
  updateAccountsList();
  updateAccountSelectors();
  saveToLocalStorage();
  
  modal.style.display = 'none';
  accountForm.reset();
}

const modal = document.getElementById('accountModal');
const addAccountBtn = document.querySelector('.add-account-btn');
const deleteAccountBtn = document.querySelector('.delete-account-btn');
const closeBtn = document.querySelector('.close');
const accountForm = document.getElementById('accountForm');

function openModal(isEditing = false) {
  const modalTitle = document.getElementById('modalTitle');
  const submitButton = document.getElementById('accountFormSubmit');
  const accountNameInput = document.getElementById('accountName');
  const accountTypeSelect = document.getElementById('accountType');
  const treatmentSelect = document.getElementById('accountTreatment');
  const balanceInput = document.getElementById('initialBalance');
  const isSettledCheckbox = document.getElementById('isSettled');
  document.getElementById('isEditing').value = false;
  
  modalTitle.textContent = 'Nueva Cuenta';
  submitButton.textContent = 'Crear Cuenta';
  accountNameInput.disabled = false;
  accountTypeSelect.disabled = false;
  treatmentSelect.disabled = false;
  balanceInput.disabled = false;
  isSettledCheckbox.disabled = false;
  accountForm.reset();
  
  modal.style.display = 'block';
}

addAccountBtn.onclick = () => openModal(false);

deleteAccountBtn.onclick = () => {
  if (!selectedAccount) return;
  
  if (confirm(`¿Está seguro que desea eliminar la cuenta "${selectedAccount}"?`)) {
    transactions = transactions.filter(t => t.account !== selectedAccount);
    
    delete accounts[selectedAccount];
    selectedAccount = null;
    
    updateAccountsList();
    updateAccountButtons();
    updateAccountSelectors(); 
    updateTransactionsList(); 
    saveToLocalStorage();
  }
};

closeBtn.onclick = () => {
  modal.style.display = 'none';
  accountForm.reset();
};

window.onclick = (event) => {
  if (event.target === modal) {
    modal.style.display = 'none';
    accountForm.reset();
  }
};

accountForm.addEventListener('submit', accountFormEventHandler);

function saveToLocalStorage() {
  localStorage.setItem('finanzasAccounts', JSON.stringify(accounts));
  localStorage.setItem('finanzasTransactions', JSON.stringify(transactions));
  localStorage.setItem('finanzasAccountsOrder', JSON.stringify(accountsOrder));
  localStorage.setItem('finanzasTransactionsOrder', JSON.stringify(transactionsOrder));
  localStorage.setItem('figaro_indicators', JSON.stringify(figaroIndicators));
}

function loadFromLocalStorage() {
  const savedAccounts = localStorage.getItem('finanzasAccounts');
  const savedTransactions = localStorage.getItem('finanzasTransactions');
  const savedAccountsOrder = localStorage.getItem('finanzasAccountsOrder');
  const savedTransactionsOrder = localStorage.getItem('finanzasTransactionsOrder');
  const savedIndicators = localStorage.getItem('figaro_indicators');
  
  if (savedAccounts) accounts = JSON.parse(savedAccounts);
  if (savedTransactions) transactions = JSON.parse(savedTransactions);
  if (savedAccountsOrder) accountsOrder = JSON.parse(savedAccountsOrder);
  if (savedTransactionsOrder) transactionsOrder = JSON.parse(savedTransactionsOrder);
  if (savedIndicators) figaroIndicators = JSON.parse(savedIndicators);
  
  updateTotalBalance();
  updateAccountsList();
  updateTransactionsList();
  updateAccountSelectors();
  
  updateBalanceIndicators();
  setInterval(updateBalanceIndicators, 60000);
  
  const today = new Date();
  today.setMinutes(today.getMinutes() + today.getTimezoneOffset());
  document.getElementById('date').valueAsDate = today;
  
  updateBalanceIndicators();
  setInterval(updateBalanceIndicators, 60000);
  updateFigaroIndicatorsPanel(); // Call updateFigaroIndicatorsPanel first
  updateTotalBalance();       // Then call updateTotalBalance to use the updated indicator value
}

function addTransaction(transaction) {
  // Validate amount is a valid number
  if (!transaction.amount || isNaN(transaction.amount)) {
    return; // Exit if amount is invalid
  }

  const transactionData = {
    ...transaction,
    id: Date.now(),
    date: new Date(`${transaction.date}T00:00:00`), 
    settled: false,
    locked: false,
    currentInstallment: accounts[transaction.account].type === 'credito' ? 
      parseInt(document.getElementById('currentInstallment').value) || 1 : null,
    totalInstallments: accounts[transaction.account].type === 'credito' ? 
      parseInt(document.getElementById('totalInstallments').value) || 1 : null,
    usdAmount: accounts[transaction.account].type === 'dolar' ? 
      parseFloat(document.getElementById('usdAmount').value) || null : null
  };
  
  if (transaction.type === 'transferencia') {
    const withdrawalTransaction = {
      ...transactionData,
      type: 'gasto',
      description: `Transferencia a ${accounts[transaction.destinationAccount].displayName}: ${transaction.description}`
    };
    transactions.push(withdrawalTransaction);
    accounts[transaction.account].balance -= transaction.amount;
    
    const depositTransaction = {
      ...transactionData,
      type: 'ingreso',
      account: transaction.destinationAccount,
      description: `Transferencia desde ${accounts[transaction.account].displayName}: ${transaction.description}`
    };
    transactions.push(depositTransaction);
    accounts[transaction.destinationAccount].balance += transaction.amount;
  } else {
    transactions.push(transactionData);
    if (transaction.type === 'ingreso') {
      accounts[transaction.account].balance += transaction.amount;
    } else if (transaction.type === 'gasto') {
      accounts[transaction.account].balance -= transaction.amount;
    }
  }
  
  updateTotalBalance();
  updateAccountsList();
  updateTransactionsList();
  saveToLocalStorage();
}

function deleteTransaction(transactionId) {
  selectedTransactionId = null;
  const transaction = transactions.find(t => t.id === transactionId);
  if (!transaction) return;
  
  if (transaction.type === 'ingreso') {
    accounts[transaction.account].balance -= transaction.amount;
  } else if (transaction.type === 'gasto') {
    accounts[transaction.account].balance += transaction.amount;
  }
  
  transactions = transactions.filter(t => t.id !== transactionId);
  
  updateTotalBalance();
  updateAccountsList();
  updateTransactionsList();
  saveToLocalStorage();
}

function updateTransactionInstallment(transactionId, action) {
  const transaction = transactions.find(t => t.id === transactionId);
  if (!transaction) return;
  
  if (action === 'up' && transaction.currentInstallment < transaction.totalInstallments) {
    transaction.currentInstallment++;
  } else if (action === 'down' && transaction.currentInstallment > 1) {
    transaction.currentInstallment--;
  }
  
  saveToLocalStorage();
  updateTransactionsList();
}

function addNewInstallment(accountKey) {
  let installmentTransactions = transactions.filter(t => 
    t.account === accountKey && 
    t.currentInstallment && 
    t.totalInstallments &&
    t.currentInstallment < t.totalInstallments &&
    !t.settled 
  );
  
  installmentTransactions.forEach(transaction => {
    transaction.currentInstallment++;
    
    if (transaction.currentInstallment >= transaction.totalInstallments) {
      transaction.settled = true;
    }
  });
  
  saveToLocalStorage();
  updateTransactionsList();
  updateAccountsList(); 
}

document.getElementById('transactionForm').addEventListener('submit', (e) => {
  e.preventDefault();
  
  const amount = parseFloat(document.getElementById('amount').value);
  
  // Validate amount before proceeding
  if (!amount || isNaN(amount)) {
    return; // Don't submit if amount is invalid
  }

  const currentAccount = document.getElementById('account').value;
  const currentType = document.getElementById('type').value;
  
  const transaction = {
    date: document.getElementById('date').value,
    amount: amount, // Use validated amount
    type: currentType,
    account: currentAccount,
    description: document.getElementById('description').value
  };
  
  if (transaction.type === 'transferencia') {
    transaction.destinationAccount = document.getElementById('destinationAccount').value;
    if (!transaction.destinationAccount) {
      alert('Por favor seleccione una cuenta de destino');
      return;
    }
    if (transaction.destinationAccount === transaction.account) {
      alert('La cuenta de origen y destino no pueden ser la misma');
      return;
    }
  }
  
  addTransaction(transaction);
  
  document.getElementById('description').value = '';
  document.getElementById('amount').value = '';
  document.getElementById('usdAmount').value = ''; 
  document.getElementById('currentInstallment').value = ''; 
  document.getElementById('totalInstallments').value = ''; 
  
  const destinationAccountGroup = document.getElementById('destinationAccountGroup');
  destinationAccountGroup.style.display = 'none';
  document.getElementById('destinationAccount').disabled = true;
  document.getElementById('destinationAccount').required = false;
  document.getElementById('destinationAccount').value = '';
  
  document.getElementById('date').valueAsDate = new Date();
  
  document.querySelectorAll('.type-button').forEach(btn => {
    if (btn.dataset.type === currentType) {
      btn.classList.add('selected');
    } else {
      btn.classList.remove('selected');
    }
  });
});

document.getElementById('amount').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    const amount = parseFloat(e.target.value);
    if (!amount || isNaN(amount)) {
      return; // Don't submit if amount is invalid
    }
    document.getElementById('transactionForm').requestSubmit();
  }
});

document.getElementById('transactionsList').addEventListener('click', (e) => {
  if (e.target.classList.contains('delete-transaction-btn')) {
    const transactionId = parseInt(e.target.dataset.id);
    if (confirm('¿Está seguro que desea eliminar esta transacción?')) {
      deleteTransaction(transactionId);
    }
  } else if (e.target.classList.contains('settled-transaction-btn')) {
    const transactionId = parseInt(e.target.dataset.id);
    toggleTransactionSettlement(transactionId);
    updateTransactionsList();
  } else if (e.target.classList.contains('installment-arrow')) {
    const transactionId = parseInt(e.target.dataset.id);
    const action = e.target.dataset.action;
    updateTransactionInstallment(transactionId, action);
  } else if (e.target.classList.contains('lock-transaction-btn')) {
    const transactionId = parseInt(e.target.dataset.id);
    toggleTransactionLock(transactionId);
  }
});

function handleTransactionDragStart(e) {
  e.target.classList.add('dragging');
  e.dataTransfer.setData('text/plain', e.target.getAttribute('data-transaction-id'));
}

function handleTransactionDragEnd(e) {
  e.target.classList.remove('dragging');
  updateTransactionsOrder();
}

function handleTransactionDragOver(e) {
  e.preventDefault();
  const draggedElement = document.querySelector('.transaction-item.dragging');
  if (!draggedElement) return;

  const transactionsList = document.getElementById('transactionsList');
  const siblings = [...transactionsList.querySelectorAll('.transaction-item:not(.dragging)')];

  const nextSibling = siblings.find(sibling => {
    const box = sibling.getBoundingClientRect();
    const offset = e.clientY - box.top - box.height / 2;
    return offset < 0;
  });

  if (nextSibling) {
    transactionsList.insertBefore(draggedElement, nextSibling);
  } else {
    transactionsList.appendChild(draggedElement);
  }
}

function handleTransactionDrop(e) {
  e.preventDefault();
  const draggedId = parseInt(e.dataTransfer.getData('text/plain'));
  const items = document.querySelectorAll('.transaction-item');
  const newOrder = Array.from(items).map(item => 
    parseInt(item.getAttribute('data-transaction-id'))
  );
  
  // Update transactions order
  transactionsOrder = newOrder;
  
  // Get current selected account
  const currentAccount = selectedAccount;
  
  // Check if this is a TCR account and transaction is locked
  if (currentAccount && 
      currentAccount.toLowerCase().startsWith('tcr') && 
      accounts[currentAccount].treatment === 'pasivos') {
    
    const transaction = transactions.find(t => t.id === draggedId);
    if (transaction && transaction.locked) {
      // Re-render TCR projection to reflect new order
      if (document.getElementById('tcrProjectionModal').style.display === 'block') {
        showTCRProjection();
      }
    }
  }
  
  saveToLocalStorage();
}

function updateTransactionsOrder() {
  const transactionItems = document.querySelectorAll('.transaction-item');
  const newOrder = Array.from(transactionItems).map(item => 
    parseInt(item.getAttribute('data-transaction-id'))
  );
  
  transactionsOrder = newOrder;
  
  saveToLocalStorage();
}

function toggleTransactionLock(transactionId) {
  const transaction = transactions.find(t => t.id === transactionId);
  if (!transaction) return;
  
  transaction.locked = !transaction.locked;
  saveToLocalStorage();
  updateTransactionsList();
}

async function updateBalanceIndicators() {
  const now = new Date();
  
  // Set timezone to Punta Arenas, Chile time
  const timeOptions = { 
    hour: '2-digit', 
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: 'America/Punta_Arenas'
  };
  
  const dateOptions = {
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric',
    timeZone: 'America/Punta_Arenas'
  };

  const dateStr = now.toLocaleDateString('es-CL', dateOptions);
  const timeStr = now.toLocaleTimeString('es-CL', timeOptions);
  
  document.getElementById('currentDate').textContent = dateStr;
  document.getElementById('currentTime').textContent = timeStr;

  try {
    const response = await fetch('https://mindicador.cl/api/dolar');
    const data = await response.json();
    const usdValue = formatCurrency(data.serie[0].valor);
    
    document.getElementById('currentDate').textContent = dateStr;
    document.getElementById('currentTime').textContent = timeStr;
    document.getElementById('usdValue').textContent = usdValue;

    // Get the ingresoFaltanteValue from the figaroIndicators panel
    const ingresoFaltanteValueElement = document.getElementById('ingresoFaltanteValue');
    const ingresoFaltanteValue = ingresoFaltanteValueElement ?
      parseFloat(ingresoFaltanteValueElement.textContent.replace(/[^0-9-]/g, '')) : 0;

    // Update the ingresoFaltanteValue in the summary panel
    document.getElementById('ingresoFaltanteValueSummary').textContent = formatCurrency(ingresoFaltanteValue);

    // Calculate and update pronostico
    const balanceTotal = parseFloat(document.getElementById('totalAmount').textContent.replace(/[^0-9-]/g, ''));
    const pronostico = balanceTotal + ingresoFaltanteValue;
    document.getElementById('pronosticoValue').textContent = formatCurrency(pronostico);

  } catch (error) {
    console.error('Error al obtener el valor del dólar:', error);
    document.getElementById('usdValue').textContent = 'No disponible';
    document.getElementById('ingresoFaltanteValueSummary').textContent = 'No disponible';
    document.getElementById('pronosticoValue').textContent = 'No disponible';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loadFromLocalStorage();

  const modal = document.getElementById('accountModal');
  const addAccountBtn = document.querySelector('.add-account-btn');
  const deleteAccountBtn = document.querySelector('.delete-account-btn');
  const closeBtn = document.querySelector('.close');

  addAccountBtn.onclick = () => openModal(false);

  deleteAccountBtn.onclick = () => {
    if (!selectedAccount) return;
  
    if (confirm(`¿Está seguro que desea eliminar la cuenta "${selectedAccount}"?`)) {
      transactions = transactions.filter(t => t.account !== selectedAccount);
      
      delete accounts[selectedAccount];
      selectedAccount = null;
      
      updateAccountsList();
      updateAccountButtons();
      updateAccountSelectors(); 
      updateTransactionsList(); 
      saveToLocalStorage();
    }
  };

  document.getElementById('account').addEventListener('change', (e) => {
    toggleInstallmentFields();
    toggleUSDAmountField();
  });

  function toggleInstallmentFields() {
    const accountSelect = document.getElementById('account');
    const installmentFields = document.querySelector('.installment-fields');
    const selectedAccountKey = accountSelect.value;
    
    if (selectedAccountKey && accounts[selectedAccountKey].type === 'credito') {
      installmentFields.style.display = 'block';
      document.getElementById('currentInstallment').disabled = false;
      document.getElementById('totalInstallments').disabled = false;
      document.getElementById('currentInstallment').required = true;
      document.getElementById('totalInstallments').required = true;
    } else {
      installmentFields.style.display = 'none';
      document.getElementById('currentInstallment').disabled = true;
      document.getElementById('totalInstallments').disabled = true;
      document.getElementById('currentInstallment').required = false;
      document.getElementById('totalInstallments').required = false;
    }
  }

  function toggleUSDAmountField() {
    const accountSelect = document.getElementById('account');
    const usdAmountField = document.querySelector('.usd-amount-field');
    const selectedAccountKey = accountSelect.value;
    
    if (selectedAccountKey && accounts[selectedAccountKey].type === 'dolar') {
      usdAmountField.style.display = 'block';
      document.getElementById('usdAmount').addEventListener('input', updateCLPAmount);
    } else {
      usdAmountField.style.display = 'none';
      document.getElementById('usdAmount').removeEventListener('input', updateCLPAmount);
    }
  }

  async function updateCLPAmount(e) {
    try {
      const response = await fetch('https://mindicador.cl/api/dolar');
      const data = await response.json();
      const usdRate = data.serie[0].valor;
      const usdAmount = parseFloat(e.target.value) || 0;
      const clpAmount = usdAmount * usdRate;
      document.getElementById('amount').value = clpAmount.toFixed(2);
    } catch (error) {
      console.error('Error al convertir USD a CLP:', error);
    }
  }

  document.getElementById('transactionForm').addEventListener('submit', async (e) => {
    const accountSelect = document.getElementById('account');
    const selectedAccountKey = accountSelect.value;
    
    if (accounts[selectedAccountKey]?.type === 'dolar') {
      e.preventDefault();
      const usdAmount = parseFloat(document.getElementById('usdAmount').value) || 0;
      try {
        const response = await fetch('https://mindicador.cl/api/dolar');
        const data = await response.json();
        const usdRate = data.serie[0].valor;
        const clpAmount = usdAmount * usdRate;
        document.getElementById('amount').value = clpAmount.toFixed(2);
        document.getElementById('transactionForm').requestSubmit();
      } catch (error) {
        console.error('Error al obtener el tipo de cambio. Por favor intente nuevamente.');
        alert('Error al obtener el tipo de cambio. Por favor intente nuevamente.');
      }
    }
  });

  document.querySelectorAll('.type-button').forEach(button => {
    button.addEventListener('click', (e) => {
      e.preventDefault();
      document.querySelectorAll('.type-button').forEach(btn => {
        btn.classList.remove('selected');
      });
      button.classList.add('selected');
      const type = button.dataset.type;
      document.getElementById('type').value = type;
      
      const destinationAccountGroup = document.getElementById('destinationAccountGroup');
      const destinationAccountSelect = document.getElementById('destinationAccount');
      if (type === 'transferencia') {
        destinationAccountGroup.style.display = 'block';
        destinationAccountSelect.disabled = false;
        destinationAccountSelect.required = true;
        setTimeout(() => {
          destinationAccountGroup.classList.add('show');
        }, 10);
      } else {
        destinationAccountGroup.classList.remove('show');
        setTimeout(() => {
          destinationAccountGroup.style.display = 'none';
          destinationAccountSelect.disabled = true;
          destinationAccountSelect.required = false;
          destinationAccountSelect.value = '';
        }, 300);
      }
    });
  });

  document.getElementById('amount').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const amount = parseFloat(e.target.value);
      if (!amount || isNaN(amount)) {
        return; // Don't submit if amount is invalid
      }
      document.getElementById('transactionForm').requestSubmit();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Delete' && selectedTransactionId !== null) {
      const transaction = transactions.find(t => t.id === selectedTransactionId);
      if (transaction && confirm('¿Está seguro que desea eliminar esta transacción?')) {
        deleteTransaction(selectedTransactionId);
      }
    }
  });

  const hideButton = document.getElementById('hideButton');
  const transactionsContainer = document.querySelector('.transactions-container');

  hideButton.addEventListener('click', () => {
    isPanelsHidden = !isPanelsHidden;
    
    if (isPanelsHidden) {
      transactionsContainer.classList.add('hidden');
      hideButton.textContent = 'Mostrar';
      hideButton.classList.add('showing');
    } else {
      transactionsContainer.classList.remove('hidden');
      hideButton.textContent = 'Ocultar';
      hideButton.classList.remove('showing');
    }
  });

  const hairdresserButtons = document.querySelectorAll('.hairdresser-button');

  hairdresserButtons.forEach(button => {
    button.addEventListener('click', (e) => {
      e.preventDefault();
      hairdresserButtons.forEach(btn => btn.classList.remove('selected'));
      button.classList.add('selected');
      document.getElementById('hairdresser').value = button.dataset.hairdresser;
    });
  });
});

document.addEventListener('DOMContentLoaded', () => {
  loadFromLocalStorage();

  const modal = document.getElementById('accountModal');
  const addAccountBtn = document.querySelector('.add-account-btn');
  const deleteAccountBtn = document.querySelector('.delete-account-btn');
  const closeBtn = document.querySelector('.close');

  addAccountBtn.onclick = () => openModal(false);

  deleteAccountBtn.onclick = () => {
    if (!selectedAccount) return;
  
    if (confirm(`¿Está seguro que desea eliminar la cuenta "${selectedAccount}"?`)) {
      transactions = transactions.filter(t => t.account !== selectedAccount);
      
      delete accounts[selectedAccount];
      selectedAccount = null;
      
      updateAccountsList();
      updateAccountButtons();
      updateAccountSelectors(); 
      updateTransactionsList(); 
      saveToLocalStorage();
    }
  };

  document.getElementById('account').addEventListener('change', (e) => {
    toggleInstallmentFields();
    toggleUSDAmountField();
  });

  function toggleInstallmentFields() {
    const accountSelect = document.getElementById('account');
    const installmentFields = document.querySelector('.installment-fields');
    const selectedAccountKey = accountSelect.value;
    
    if (selectedAccountKey && accounts[selectedAccountKey].type === 'credito') {
      installmentFields.style.display = 'block';
      document.getElementById('currentInstallment').disabled = false;
      document.getElementById('totalInstallments').disabled = false;
      document.getElementById('currentInstallment').required = true;
      document.getElementById('totalInstallments').required = true;
    } else {
      installmentFields.style.display = 'none';
      document.getElementById('currentInstallment').disabled = true;
      document.getElementById('totalInstallments').disabled = true;
      document.getElementById('currentInstallment').required = false;
      document.getElementById('totalInstallments').required = false;
    }
  }

  function toggleUSDAmountField() {
    const accountSelect = document.getElementById('account');
    const usdAmountField = document.querySelector('.usd-amount-field');
    const selectedAccountKey = accountSelect.value;
    
    if (selectedAccountKey && accounts[selectedAccountKey].type === 'dolar') {
      usdAmountField.style.display = 'block';
      document.getElementById('usdAmount').addEventListener('input', updateCLPAmount);
    } else {
      usdAmountField.style.display = 'none';
      document.getElementById('usdAmount').removeEventListener('input', updateCLPAmount);
    }
  }

  async function updateCLPAmount(e) {
    try {
      const response = await fetch('https://mindicador.cl/api/dolar');
      const data = await response.json();
      const usdRate = data.serie[0].valor;
      const usdAmount = parseFloat(e.target.value) || 0;
      const clpAmount = usdAmount * usdRate;
      document.getElementById('amount').value = clpAmount.toFixed(2);
    } catch (error) {
      console.error('Error al convertir USD a CLP:', error);
    }
  }

  document.getElementById('transactionForm').addEventListener('submit', async (e) => {
    const accountSelect = document.getElementById('account');
    const selectedAccountKey = accountSelect.value;
    
    if (accounts[selectedAccountKey]?.type === 'dolar') {
      e.preventDefault();
      const usdAmount = parseFloat(document.getElementById('usdAmount').value) || 0;
      try {
        const response = await fetch('https://mindicador.cl/api/dolar');
        const data = await response.json();
        const usdRate = data.serie[0].valor;
        const clpAmount = usdAmount * usdRate;
        document.getElementById('amount').value = clpAmount.toFixed(2);
        document.getElementById('transactionForm').requestSubmit();
      } catch (error) {
        console.error('Error al obtener el tipo de cambio. Por favor intente nuevamente.');
        alert('Error al obtener el tipo de cambio. Por favor intente nuevamente.');
      }
    }
  });

  document.querySelectorAll('.type-button').forEach(button => {
    button.addEventListener('click', (e) => {
      e.preventDefault();
      document.querySelectorAll('.type-button').forEach(btn => {
        btn.classList.remove('selected');
      });
      button.classList.add('selected');
      const type = button.dataset.type;
      document.getElementById('type').value = type;
      
      const destinationAccountGroup = document.getElementById('destinationAccountGroup');
      const destinationAccountSelect = document.getElementById('destinationAccount');
      if (type === 'transferencia') {
        destinationAccountGroup.style.display = 'block';
        destinationAccountSelect.disabled = false;
        destinationAccountSelect.required = true;
        setTimeout(() => {
          destinationAccountGroup.classList.add('show');
        }, 10);
      } else {
        destinationAccountGroup.classList.remove('show');
        setTimeout(() => {
          destinationAccountGroup.style.display = 'none';
          destinationAccountSelect.disabled = true;
          destinationAccountSelect.required = false;
          destinationAccountSelect.value = '';
        }, 300);
      }
    });
  });

  document.getElementById('amount').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const amount = parseFloat(e.target.value);
      if (!amount || isNaN(amount)) {
        return; // Don't submit if amount is invalid
      }
      document.getElementById('transactionForm').requestSubmit();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Delete' && selectedTransactionId !== null) {
      const transaction = transactions.find(t => t.id === selectedTransactionId);
      if (transaction && confirm('¿Está seguro que desea eliminar esta transacción?')) {
        deleteTransaction(selectedTransactionId);
      }
    }
  });

  const hideButton = document.getElementById('hideButton');
  const transactionsContainer = document.querySelector('.transactions-container');

  hideButton.addEventListener('click', () => {
    isPanelsHidden = !isPanelsHidden;
    
    if (isPanelsHidden) {
      transactionsContainer.classList.add('hidden');
      hideButton.textContent = 'Mostrar';
      hideButton.classList.add('showing');
    } else {
      transactionsContainer.classList.remove('hidden');
      hideButton.textContent = 'Ocultar';
      hideButton.classList.remove('showing');
    }
  });

  const hairdresserButtons = document.querySelectorAll('.hairdresser-button');

  hairdresserButtons.forEach(button => {
    button.addEventListener('click', (e) => {
      e.preventDefault();
      hairdresserButtons.forEach(btn => btn.classList.remove('selected'));
      button.classList.add('selected');
      document.getElementById('hairdresser').value = button.dataset.hairdresser;
    });
  });
});

document.addEventListener('DOMContentLoaded', () => {
  const cardFilterBtn = document.getElementById('cardFilter');
  cardFilterBtn.addEventListener('click', () => {
    isCardFilterActive = !isCardFilterActive;
    cardFilterBtn.classList.toggle('active', isCardFilterActive);
    updateSalonSalesDisplay();
  });

  const dateFilterInput = document.getElementById('dateFilterInput');

  dateFilterInput.addEventListener('change', (e) => {
    selectedFilterDate = e.target.value;
    isDateFilterActive = !!selectedFilterDate;
    updateSalonSalesDisplay();
  });

  dateFilterInput.addEventListener('click', (e) => {
    if (e.target.value === '') {
      selectedFilterDate = null;
      isDateFilterActive = false;
      updateSalonSalesDisplay();
    }
  });
});

function addSalonSale(sale) {
  // Strict validation for amount 
  if (!sale.amount || isNaN(sale.amount) || sale.amount <= 0) {
    console.log('Invalid amount detected, sale not added');
    return;
  }

  const newSale = {
    ...sale,
    id: Date.now(),
    amount: parseFloat(sale.amount), // Ensure amount is a number
    paid: false,
    commission: 0,
    commissionWithIVA: 0,
    netAmount: parseFloat(sale.amount) // Ensure netAmount is a number
  };

  // Calculate commissions
  const isCardPayment = sale.paymentType === 'debito' || sale.paymentType === 'credito';
  const hairdresserConfig = hairdresserCommissions[sale.hairdresser.toLowerCase()];

  // Only calculate REC for card payments
  const recAmount = isCardPayment ? 
    sale.amount * (hairdresserConfig.rec / 100) : 0;
    
  // Always calculate COM
  const comAmount = sale.amount * (hairdresserConfig.com / 100);
  
  newSale.commission = recAmount + comAmount;

  if (isCardPayment) {
    const commissionRate = sale.paymentType === 'debito' ? 
      commissionRates.debito / 100 : 
      commissionRates.credito / 100;
    
    newSale.commissionWithIVA = newSale.commission * (1 + ivaRate / 100);
    newSale.netAmount = newSale.amount - newSale.commissionWithIVA;
  }

  salonSales.unshift(newSale);
  saveSalonToLocalStorage();
  
  // Update all relevant panels
  updateSalonSalesDisplay();
  updateHairdresserPanels();
  updateFigaroSemanasPanel();
  updateFigaroIndicatorsPanel();
}

// Update the Aldo/Marcos/Otro sales panels to show correct REC calculations
function updateHairdresserVentasPanel(hairdresser, panel) {
  const ventasPanel = panel.querySelector('.ventas-table');
  
  const sales = salonSales
    .filter(sale => sale.hairdresser === hairdresser.toUpperCase())
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  sales.forEach(sale => {
    const isCardPayment = sale.paymentType === 'debito' || sale.paymentType === 'credito';
    const hairdresserConfig = hairdresserCommissions[hairdresser.toLowerCase()];
    
    // Only calculate REC for card payments
    const recAmount = isCardPayment ? 
      sale.amount * (hairdresserConfig.rec / 100) : 0;
      
    // Always calculate COM  
    const comAmount = sale.amount * (hairdresserConfig.com / 100);
    const totalPercentage = recAmount + comAmount;
    
    const row = document.createElement('div');
    row.className = 'ventas-table-row';
    row.innerHTML = `
      <div class="ventas-table-cell">Sem ${sale.week}</div>
      <div class="ventas-table-cell">${formatDate(sale.date)}</div>
      <div class="ventas-table-cell">${sale.serviceCode}</div>
      <div class="ventas-table-cell amount">${formatCurrency(sale.amount)}</div>
      <div class="ventas-table-cell payment-type ${sale.paymentType}">${sale.paymentType}</div>
      <div class="ventas-table-cell amount">${isCardPayment ? formatCurrency(recAmount) : '-'}</div>
      <div class="ventas-table-cell amount">${formatCurrency(comAmount)}</div>
      <div class="ventas-table-cell amount">${formatCurrency(totalPercentage)}</div>
    `;
    
    ventasPanel.appendChild(row);
  });
}

function updateSalonSalesDisplay() {
  const salesList = document.getElementById('salonSalesList');
  salesList.innerHTML = '';

  let displayedSales = [...salonSales];

  if (isCardFilterActive) {
    displayedSales = displayedSales.filter(sale => 
      sale.paymentType === 'debito' || sale.paymentType === 'credito'
    );
  }

  if (isDateFilterActive && selectedFilterDate) {
    displayedSales = displayedSales.filter(sale => 
      new Date(sale.date).toISOString().split('T')[0] === selectedFilterDate
    );
  }

  let totalVentas = 0;
  let totalVentaTarjeta = 0;
  let totalNeto = 0;
  let totalNetoTarjeta = 0;
  let totalComisiones = 0;
  let totalComisionesIVA = 0;

  salonSales.forEach(sale => {
    let commissionRate = 0;
    if (sale.paymentType === 'debito') {
      commissionRate = commissionRates.debito / 100;
    } else if (sale.paymentType === 'credito') {
      commissionRate = commissionRates.credito / 100;
    }
    
    sale.commission = sale.amount * commissionRate;
    sale.commissionWithIVA = sale.commission * (1 + ivaRate / 100);
    sale.netAmount = sale.amount - sale.commissionWithIVA;

    totalVentas += sale.amount;
    totalNeto += sale.netAmount;

    if (sale.paymentType === 'debito' || sale.paymentType === 'credito') {
      totalVentaTarjeta += sale.amount;
      totalNetoTarjeta += sale.netAmount;
      totalComisiones += sale.commission;
      totalComisionesIVA += sale.commissionWithIVA;
    }
  });

  const totalPaidAmount = salonSales
    .filter(sale => sale.paid && sale.paymentDate)
    .reduce((total, sale) => total + sale.netAmount, 0);

  const pendingAmount = totalNetoTarjeta - totalPaidAmount;

  const commissionRatesHtml = `
    <div class="commission-rates">
      <span class="commission-rate" data-type="debito">Débito: ${commissionRates.debito}%</span> | 
      <span class="commission-rate" data-type="credito">Crédito: ${commissionRates.credito}%</span>
    </div>
  `;

  const totalsPanel = document.querySelector('.totals-panel');
  totalsPanel.innerHTML = `
    <div class="totals-grid">
      <div class="total-item">
        <span class="total-label">Total Ventas:</span>
        <span class="total-value">${formatCurrency(totalVentas)}</span>
      </div>
      <div class="total-item">
        <span class="total-label">Total Venta Tarjeta:</span>
        <span class="total-value">${formatCurrency(totalVentaTarjeta)}</span>
      </div>
      <div class="total-item">
        <span class="total-label">Total Neto:</span>
        <span class="total-value">${formatCurrency(totalNeto)}</span>
      </div>
      <div class="total-item total-neto-tarjeta">  
        <span class="total-label">Total Neto Tarjeta:</span>
        <span class="total-value">${formatCurrency(totalNetoTarjeta)}</span>
      </div>
      <div class="total-item">
        <span class="total-label">Comisión:</span>
        <span class="total-value">${commissionRatesHtml}</span>
      </div>
      <div class="total-item">
        <span class="total-label">Total Comisiones:</span>
        <span class="total-value">${formatCurrency(totalComisionesIVA)}</span>
      </div>
      <div class="total-item">
        <span class="total-label">IVA:</span>
        <span class="total-value">
          <span class="iva-rate" data-type="iva">${ivaRate}%</span>
        </span>
      </div>
      <div class="total-item">
        <span class="total-label">Deuda Transbank:</span>
        <span class="total-value">${formatCurrency(pendingAmount)}</span>
      </div>
    </div>
  `;

  document.querySelectorAll('.commission-rate').forEach(rate => {
    rate.addEventListener('dblclick', (e) => {
      const type = e.target.dataset.type;
      const currentValue = commissionRates[type];

      const input = document.createElement('input');
      input.type = 'number';
      input.step = '0.1';
      input.min = '0';
      input.max = '100';
      input.value = currentValue;
      input.className = 'edit-commission-rate';

      rate.replaceWith(input);
      input.focus();

      function saveEdit() {
        const newValue = parseFloat(input.value);
        if (!isNaN(newValue) && newValue >= 0 && newValue <= 100) {
          commissionRates[type] = newValue;
          saveSalonToLocalStorage();
          updateSalonSalesDisplay();
        }
      }

      input.addEventListener('blur', saveEdit);
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          saveEdit();
        }
      });
    });
  });

  const ivaRateElement = document.querySelector('.iva-rate');
  ivaRateElement.addEventListener('dblclick', (e) => {
    const input = document.createElement('input');
    input.type = 'number';
    input.step = '0.1';
    input.min = '0';
    input.max = '100';
    input.value = ivaRate;
    input.className = 'edit-commission-rate';

    e.target.replaceWith(input);
    input.focus();

    function saveEdit() {
      const newValue = parseFloat(input.value);
      if (!isNaN(newValue) && newValue >= 0 && newValue <= 100) {
        ivaRate = newValue;
        saveSalonToLocalStorage();
        updateSalonSalesDisplay();
      }
    }

    input.addEventListener('blur', saveEdit);
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        saveEdit();
      }
    });
  });

  displayedSales.forEach(sale => {
    const div = document.createElement('div');
    div.className = `sale-item ${sale.paymentType}`;
    div.draggable = true;
    div.setAttribute('data-sale-id', sale.id);

    const dateSelector = sale.paymentType !== 'efectivo' ? `
      <input type="date" 
             class="payment-date-selector" 
             data-id="${sale.id}"
             value="${sale.paymentDate ? new Date(sale.paymentDate).toISOString().split('T')[0] : ''}"
             style="padding: 4px; border: 1px solid #ddd; border-radius: 4px; font-size: 0.9em;">
    ` : '-';

    div.innerHTML = `
      <span>Sem ${sale.week}</span>
      <span>${formatDate(sale.date)}</span>
      <span>${sale.hairdresser}</span>
      <span class="transaction-description editable">${sale.serviceCode}</span>
      <span class="transaction-amount editable">
        ${formatCurrency(sale.amount)}
      </span>
      <span class="payment-type ${sale.paymentType}">${sale.paymentType.toUpperCase()}</span>
      <span>${formatCurrency(sale.commission)}</span>
      <span>${formatCurrency(sale.commissionWithIVA)}</span>
      <span>${formatCurrency(sale.netAmount)}</span>
      <span>${dateSelector}</span>
      <span class="payment-status ${sale.paid ? 'paid' : 'unpaid'}">${sale.paid ? '✔' : '✖'}</span>
      <div class="sale-actions">
        <button class="delete-sale-btn" data-id="${sale.id}" title="Eliminar">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
          </svg>
        </button>
      </div>
    `;

    const serviceCodeField = div.querySelector('.transaction-description');
    const amountField = div.querySelector('.transaction-amount');

    serviceCodeField.addEventListener('dblclick', () => {
      makeFieldEditable(serviceCodeField, sale.id, 'serviceCode');
    });

    amountField.addEventListener('dblclick', () => {
      makeFieldEditable(amountField, sale.id, 'amount');
    });

    div.addEventListener('dragstart', handleSaleDragStart);
    div.addEventListener('dragend', handleSaleDragEnd);
    div.addEventListener('dragover', handleSaleDragOver);
    div.addEventListener('drop', handleSaleDrop);
    div.addEventListener('dragenter', handleSaleDragEnter);
    div.addEventListener('dragleave', handleSaleDragLeave);

    salesList.appendChild(div);
  });

  document.querySelectorAll('.payment-date-selector').forEach(selector => {
    selector.addEventListener('change', (e) => {
      const saleId = parseInt(e.target.dataset.id);
      const sale = salonSales.find(s => s.id === saleId);
      if (sale) {
        sale.paymentDate = e.target.value ? new Date(e.target.value) : null;
        saveSalonToLocalStorage();
      }
    });
  });

  updateTotalAbonosPanel();
  updateTotalBalance();
  updateAccountsList();
  updateAldoVentasPanel();
  updateMarcosVentasPanel();
  updateOtroVentasPanel();
}

document.addEventListener('DOMContentLoaded', () => {
  const salonForm = document.getElementById('salonForm');
  const paymentButtons = document.querySelectorAll('.payment-button');
  const salonAmountInput = document.getElementById('salonAmount');

  salonAmountInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault(); // Prevent form submission

      const sale = {
        week: document.getElementById('salonWeek').value,
        date: new Date(document.getElementById('salonDate').value),
        hairdresser: document.getElementById('hairdresser').value,
        serviceCode: document.getElementById('serviceCode').value.trim(),
        amount: parseFloat(document.getElementById('salonAmount').value),
        paymentType: document.getElementById('paymentType').value
      };

      // Validate amount and service code
      if (!sale.serviceCode || !sale.amount || isNaN(sale.amount)) {
        return; // Don't submit if required fields are empty
      }

      addSalonSale(sale);

      document.getElementById('serviceCode').value = '';
      document.getElementById('salonAmount').value = '';

      document.getElementById('serviceCode').focus();
    }
  });

  paymentButtons.forEach(button => {
    button.addEventListener('click', (e) => {
      e.preventDefault();
      paymentButtons.forEach(btn => btn.classList.remove('selected'));
      button.classList.add('selected');
      document.getElementById('paymentType').value = button.dataset.type;
    });
  });

  salonForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const sale = {
      week: document.getElementById('salonWeek').value,
      date: new Date(document.getElementById('salonDate').value),
      hairdresser: document.getElementById('hairdresser').value,
      serviceCode: document.getElementById('serviceCode').value,
      amount: parseFloat(document.getElementById('salonAmount').value),
      paymentType: document.getElementById('paymentType').value
    };

    // Validate amount and service code
    if (!sale.serviceCode || !sale.amount || isNaN(sale.amount)) {
      return; // Exit if amount is invalid
    }

    addSalonSale(sale);

    document.getElementById('serviceCode').value = '';
    document.getElementById('salonAmount').value = '';

    document.getElementById('serviceCode').focus();
  });

  loadSalonFormState();

  const today = new Date();
  today.setMinutes(today.getMinutes() + today.getTimezoneOffset());
  if (!document.getElementById('salonDate').value) {
    document.getElementById('salonDate').valueAsDate = today;
  }

  if (!document.getElementById('salonWeek').value) {
    const weekNumber = Math.ceil(today.getDate() / 7);
    document.getElementById('salonWeek').value = Math.min(weekNumber, 5);
  }
});

function saveSalonFormState() {
  const formState = {
    week: document.getElementById('salonWeek').value,
    date: document.getElementById('salonDate').value,
    hairdresser: document.getElementById('hairdresser').value,
    paymentType: document.getElementById('paymentType').value
  };
  localStorage.setItem('salonFormState', JSON.stringify(formState));
}

function loadSalonFormState() {
  const savedState = localStorage.getItem('salonFormState');
  if (savedState) {
    const formState = JSON.parse(savedState);

    document.getElementById('salonWeek').value = formState.week;

    document.getElementById('salonDate').value = formState.date;

    document.getElementById('hairdresser').value = formState.hairdresser;
    document.querySelectorAll('.hairdresser-button').forEach(btn => {
      btn.classList.toggle('selected', btn.dataset.hairdresser === formState.hairdresser);
    });

    document.getElementById('paymentType').value = formState.paymentType;
    document.querySelectorAll('.payment-button').forEach(btn => {
      btn.classList.toggle('selected', btn.dataset.type === formState.paymentType);
    });
  }
}

document.getElementById('salonSalesList').addEventListener('click', (e) => {
  if (e.target.classList.contains('delete-sale-btn')) {
    const saleId = parseInt(e.target.dataset.id);
    if (confirm('¿Está seguro que desea eliminar esta venta?')) {
      deleteSalonSale(saleId);
    }
  }
});

function makeFieldEditable(element, saleId, fieldName) {
  const currentValue = fieldName === 'amount' ? 
    element.textContent.replace(/[^0-9.-]+/g, "") : 
    element.textContent;

  const input = document.createElement('input');
  input.type = fieldName === 'amount' ? 'number' : 'text';
  if (fieldName === 'amount') {
    input.step = '0.01';
    input.min = '0';
  }
  input.value = currentValue;
  input.className = `edit-${fieldName}-field`;
  input.style.width = '100%';
  input.style.padding = '4px';
  input.style.border = '1px solid #3498db';
  input.style.borderRadius = '4px';
  input.style.fontSize = 'inherit';

  element.replaceWith(input);
  input.focus();

  function saveEdit() {
    const newValue = input.value.trim();
    if (newValue) {
      const sale = salonSales.find(s => s.id === saleId);
      if (sale) {
        if (fieldName === 'amount') {
          sale.amount = parseFloat(newValue);
        } else {
          sale[fieldName] = newValue;
        }
        updateSalonSalesDisplay();
        saveSalonToLocalStorage();
      }
    }

    const newSpan = document.createElement('span');
    newSpan.textContent = fieldName === 'amount' ? 
      formatCurrency(parseFloat(newValue)) : 
      (newValue || currentValue);
    newSpan.addEventListener('dblclick', () => {
      makeFieldEditable(newSpan, saleId, fieldName);
    });
    input.replaceWith(newSpan);
  }

  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveEdit();
    }
  });

  input.addEventListener('blur', saveEdit);
}

function toggleDailyPaymentStatus(date) {
  const salesForDate = salonSales.filter(sale => 
    sale.paymentDate && new Date(sale.paymentDate).toISOString().split('T')[0] === date
  );

  const allPaid = salesForDate.length > 0 && salesForDate.every(sale => sale.paid);

  salesForDate.forEach(sale => {
    sale.paid = !allPaid;
  });

  saveSalonToLocalStorage();
  updateSalonSalesDisplay();
}

const backupBtn = document.getElementById('backupButton');
const backupDropdown = document.getElementById('backupDropdown');

backupBtn.addEventListener('click', () => {
  backupDropdown.classList.toggle('show');
});

document.addEventListener('click', (e) => {
  if (!backupBtn.contains(e.target) && !backupDropdown.contains(e.target)) {
    backupDropdown.classList.remove('show');
  }
});

document.getElementById('backupSave').addEventListener('click', () => {
  const data = {
    accounts,
    transactions,
    accountsOrder,
    transactionsOrder,
    salonSales,
    commissionRates,
    ivaRate,
    salesBoletas,
    figaroIndicators
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `finanzas_backup_${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  backupDropdown.classList.remove('show');
});

document.getElementById('backupRestore').addEventListener('click', () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';

  input.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);

        if (!data.accounts || !data.transactions || !data.accountsOrder || !data.transactionsOrder) {
          throw new Error('Formato de respaldo inválido: faltan datos financieros');
        }

        accounts = data.accounts;
        transactions = data.transactions;
        accountsOrder = data.accountsOrder;
        transactionsOrder = data.transactionsOrder;

        if (data.salonSales) salonSales = data.salonSales;
        if (data.commissionRates) commissionRates = data.commissionRates;
        if (data.ivaRate) ivaRate = data.ivaRate;
        if (data.salesBoletas) salesBoletas = data.salesBoletas;
        if (data.figaroIndicators) figaroIndicators = data.figaroIndicators;

        updateTotalBalance();
        updateAccountsList();
        updateTransactionsList();
        updateAccountSelectors();
        updateSalonSalesDisplay();
        
        saveToLocalStorage();
        saveSalonToLocalStorage();

        // Persist and show the filename of the restored backup
        try {
          if (file && file.name) {
            localStorage.setItem('last_backup_name', file.name);
            const el = document.getElementById('lastBackupName');
            if (el) el.textContent = file.name;
          }
        } catch (e) { /* ignore storage/display errors */ }

        alert('Respaldo restaurado exitosamente');
      } catch (error) {
        alert('Error al restaurar el respaldo: ' + error.message);
      }
    };
    reader.readAsText(file);
  });

  input.click();
  backupDropdown.classList.remove('show');
});

function saveSalonToLocalStorage() {
  localStorage.setItem('figaro_sales', JSON.stringify(salonSales));
  localStorage.setItem('figaro_commission_rates', JSON.stringify(commissionRates));
  localStorage.setItem('figaro_iva_rate', JSON.stringify(ivaRate));
  localStorage.setItem('hairdresserCommissions', JSON.stringify(hairdresserCommissions));
  localStorage.setItem('sales_boletas', JSON.stringify(salesBoletas));
  localStorage.setItem('figaro_indicators', JSON.stringify(figaroIndicators));
}

function loadSalonFromLocalStorage() {
  const savedSales = localStorage.getItem('figaro_sales');
  const savedRates = localStorage.getItem('figaro_commission_rates');
  const savedIvaRate = localStorage.getItem('figaro_iva_rate');
  const savedHairdresserCommissions = localStorage.getItem('hairdresserCommissions');
  const savedBoletas = localStorage.getItem('sales_boletas');
  const savedIndicators = localStorage.getItem('figaro_indicators');

  if (savedSales) salonSales = JSON.parse(savedSales);
  if (savedRates) commissionRates = JSON.parse(savedRates);
  if (savedIvaRate) ivaRate = JSON.parse(savedIvaRate);
  if (savedHairdresserCommissions) hairdresserCommissions = JSON.parse(savedHairdresserCommissions);
  if (savedBoletas) salesBoletas = JSON.parse(savedBoletas);
  if (savedIndicators) figaroIndicators = JSON.parse(savedIndicators);

  updateSalonSalesDisplay();
  updateHairdresserPanels();
}

function updateTotalAbonosPanel() {
  const totalAbonosPanel = document.querySelector('.total-abonos-panel');

  const salesWithPaymentDates = salonSales.filter(sale => 
    sale.paymentDate
  );

  const salesByDate = salesWithPaymentDates.reduce((acc, sale) => {
    const date = new Date(sale.paymentDate).toISOString().split('T')[0];
    if (!acc[date]) {
      acc[date] = {
        debito: 0,
        credito: 0,
        paid: false 
      };
    }
    if (sale.paymentType === 'debito') {
      acc[date].debito += sale.netAmount;
    } else if (sale.paymentType === 'credito') {
      acc[date].credito += sale.netAmount;
    }
    return acc;
  }, {});

  totalAbonosPanel.innerHTML = '';
  const header = document.createElement('h2');
  header.textContent = 'Total Abonos';
  totalAbonosPanel.appendChild(header);

  const paidTotalPanel = document.createElement('div');
  paidTotalPanel.className = 'paid-transactions-total';
  const totalPaidAmount = salonSales
    .filter(sale => sale.paid && sale.paymentDate)
    .reduce((total, sale) => total + sale.netAmount, 0);
  paidTotalPanel.innerHTML = `
    <div class="paid-transactions-amount">${formatCurrency(totalPaidAmount)}</div>
  `;
  totalAbonosPanel.appendChild(paidTotalPanel);

  Object.entries(salesByDate)
    .sort(([dateA], [dateB]) => new Date(dateB) - new Date(dateA)) 
    .forEach(([date, totals]) => {
      const dailyPanel = document.createElement('div');
      dailyPanel.className = 'daily-totals-panel';
      
      const totalDay = totals.debito + totals.credito;

      const salesForDate = salonSales.filter(sale => 
        sale.paymentDate && new Date(sale.paymentDate).toISOString().split('T')[0] === date
      );
      const allPaid = salesForDate.length > 0 && salesForDate.every(sale => sale.paid);

      dailyPanel.innerHTML = `
        <h3>Fecha: ${formatDate(date)}</h3>
        <div class="daily-totals-grid">
          <div class="daily-total-item">
            <span class="daily-total-label">Débito:</span>
            <span class="daily-total-value">${formatCurrency(totals.debito)}</span>
          </div>
          <div class="daily-total-item">
            <span class="daily-total-label">Crédito:</span>
            <span class="daily-total-value">${formatCurrency(totals.credito)}</span>
          </div>
          <div class="daily-total-item">
            <span class="daily-total-label">Total Día:</span>
            <span class="daily-total-value">${formatCurrency(totalDay)}</span>
          </div>
        </div>
        <button class="daily-paid-btn ${allPaid ? 'paid' : ''}" data-date="${date}">
          ${allPaid ? 'Pagado' : 'Marcar como Pagado'}
        </button>
      `;

      totalAbonosPanel.appendChild(dailyPanel);

      const paidBtn = dailyPanel.querySelector('.daily-paid-btn');
      paidBtn.addEventListener('click', () => toggleDailyPaymentStatus(date));
    });

  if (Object.keys(salesByDate).length === 0) {
    const noDataMessage = document.createElement('p');
    noDataMessage.className = 'no-data-message';
    noDataMessage.textContent = 'No hay abonos registrados';
    totalAbonosPanel.appendChild(noDataMessage);
  }
}

function formatDate(date) {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() + d.getTimezoneOffset());
  return d.toLocaleDateString('es-CL', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
}

const calculatorInput = document.getElementById('calculatorInput');
const showCalculatorBtn = document.getElementById('showCalculator');
const backToTransactionBtn = document.getElementById('backToTransaction');
const transactionPanel = document.getElementById('transactionPanel');
const calculatorPanel = document.getElementById('calculatorPanel');

let currentInput = '';
let currentOperation = null;
let previousInput = null;

showCalculatorBtn.addEventListener('click', () => {
  transactionPanel.style.display = 'none';
  calculatorPanel.style.display = 'block';
  calculatorInput.value = '';
  currentInput = '';
  currentOperation = null;
  previousInput = null;
});

backToTransactionBtn.addEventListener('click', () => {
  calculatorPanel.style.display = 'none';
  transactionPanel.style.display = 'block';
});

function calculate() {
  if (previousInput === null || currentOperation === null) return;

  const prev = parseFloat(previousInput);
  const current = parseFloat(currentInput);
  let result;

  switch(currentOperation) {
    case '+':
      result = prev + current;
      break;
    case '-':
      result = prev - current;
      break;
    case '*':
      result = prev * current;
      break;
    case '/':
      result = prev / current;
      break;
    default:
      return;
  }

  currentInput = result.toString();
  calculatorInput.value = currentInput;
  previousInput = null;
  currentOperation = null;
}

document.querySelectorAll('.calc-key').forEach(key => {
  key.addEventListener('click', () => handleCalculatorInput(key.dataset.key));

  key.addEventListener('mousedown', () => key.classList.add('active'));
  key.addEventListener('mouseup', () => key.classList.remove('active'));
  key.addEventListener('mouseleave', () => key.classList.remove('active'));
});

document.addEventListener('keydown', (e) => {
  if (calculatorPanel.style.display === 'block') {
    const key = e.key.toLowerCase();
    if (key === 'enter') {
      handleCalculatorInput('=');
    } else if (key === 'escape') {
      handleCalculatorInput('c');
    } else if (key === 'backspace') {
      handleCalculatorInput('backspace');
    } else if (/[\d\+\-\*\/\.\=]/.test(key)) {
      handleCalculatorInput(key);
    }

    const button = document.querySelector(`.calc-key[data-key="${key}"]`);
    if (button) {
      button.classList.add('active');
      setTimeout(() => button.classList.remove('active'), 100);
    }
  }
});

function handleCalculatorInput(key) {
  if (key === 'c') {
    currentInput = '';
    previousInput = null;
    currentOperation = null;
    calculatorInput.value = '';
    return;
  }

  if (key === 'backspace') {
    currentInput = currentInput.slice(0, -1);
    calculatorInput.value = currentInput;
    return;
  }

  if (/[\d\.]/.test(key)) {
    if (key === '.' && currentInput.includes('.')) return;
    currentInput += key;
    calculatorInput.value = currentInput;
  }

  if (/[\+\-\*\/]/.test(key)) {
    if (currentInput === '') return;
    if (previousInput !== null) {
      calculate();
    }
    previousInput = currentInput;
    currentInput = '';
    currentOperation = key;
  }

  if (key === '=') {
    if (previousInput === null || currentInput === '') return;
    calculate();
  }
}

function handleSaleDragStart(e) {
  e.target.classList.add('dragging');
  e.dataTransfer.setData('text/plain', e.target.getAttribute('data-sale-id'));
}

function handleSaleDragEnd(e) {
  e.target.classList.remove('dragging');
  document.querySelectorAll('.sale-item').forEach(item => {
    item.classList.remove('drag-over');
  });
}

function handleSaleDragOver(e) {
  e.preventDefault();
  const draggedElement = document.querySelector('.sale-item.dragging');
  if (!draggedElement) return;

  const list = document.getElementById('salonSalesList');
  const siblings = [...list.querySelectorAll('.sale-item:not(.dragging)')];

  const nextSibling = siblings.find(sibling => {
    const box = sibling.getBoundingClientRect();
    const offset = e.clientY - box.top - box.height / 2;
    return offset < 0;
  });

  if (nextSibling) {
    list.insertBefore(draggedElement, nextSibling);
  } else {
    list.appendChild(draggedElement);
  }
}

function handleSaleDragEnter(e) {
  e.preventDefault();
  if (e.target.classList.contains('sale-item') && !e.target.classList.contains('dragging')) {
    e.target.classList.add('drag-over');
  }
}

function handleSaleDragLeave(e) {
  if (e.target.classList.contains('sale-item')) {
    e.target.classList.remove('drag-over');
  }
}

function handleSaleDrop(e) {
  e.preventDefault();
  const draggedId = parseInt(e.dataTransfer.getData('text/plain'));
  const items = document.querySelectorAll('.sale-item');
  const newOrder = Array.from(items).map(item => 
    parseInt(item.getAttribute('data-sale-id'))
  );
  salonSales.sort((a, b) => {
    const indexA = newOrder.indexOf(a.id);
    const indexB = newOrder.indexOf(b.id);
    return indexA - indexB;
  });

  saveSalonToLocalStorage();
}

function deleteSalonSale(saleId) {
  salonSales = salonSales.filter(sale => sale.id !== saleId);
  saveSalonToLocalStorage();
  updateSalonSalesDisplay();
}

document.addEventListener('DOMContentLoaded', () => {
  const deleteAllBtn = document.getElementById('deleteAllSales');
  deleteAllBtn.addEventListener('click', () => {
    if (confirm('¿Está seguro que desea eliminar todas las ventas? Esta acción no se puede deshacer.')) {
      salonSales = [];
      saveSalonToLocalStorage();
      updateSalonSalesDisplay();
    }
  });
});

document.addEventListener('DOMContentLoaded', () => {
  loadSalonFromLocalStorage();

  const salonForm = document.getElementById('salonForm');
  const paymentButtons = document.querySelectorAll('.payment-button');
  const salonAmountInput = document.getElementById('salonAmount');

  const today = new Date();
  today.setMinutes(today.getMinutes() + today.getTimezoneOffset());
  document.getElementById('salonDate').valueAsDate = today;

  paymentButtons.forEach(button => {
    button.addEventListener('click', (e) => {
      e.preventDefault();
      paymentButtons.forEach(btn => btn.classList.remove('selected'));
      button.classList.add('selected');
      document.getElementById('paymentType').value = button.dataset.type;
    });
  });

  salonForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const sale = {
      week: document.getElementById('salonWeek').value,
      date: new Date(document.getElementById('salonDate').value),
      hairdresser: document.getElementById('hairdresser').value,
      serviceCode: document.getElementById('serviceCode').value,
      amount: parseFloat(document.getElementById('salonAmount').value),
      paymentType: document.getElementById('paymentType').value
    };

    // Validate amount and service code
    if (!sale.serviceCode || !sale.amount || isNaN(sale.amount)) {
      return; // Exit if amount is invalid
    }

    addSalonSale(sale);

    document.getElementById('serviceCode').value = '';
    document.getElementById('salonAmount').value = '';

    document.getElementById('serviceCode').focus();
  });

  loadSalonFormState();

  const todayDate = new Date();
  todayDate.setMinutes(todayDate.getMinutes() + todayDate.getTimezoneOffset());
  if (!document.getElementById('salonDate').value) {
    document.getElementById('salonDate').valueAsDate = todayDate;
  }

  if (!document.getElementById('salonWeek').value) {
    const weekNumber = Math.ceil(todayDate.getDate() / 7);
    document.getElementById('salonWeek').value = Math.min(weekNumber, 5);
  }
});

document.addEventListener('DOMContentLoaded', () => {
  loadFromLocalStorage();

  const salonForm = document.getElementById('salonForm');
  const paymentButtons = document.querySelectorAll('.payment-button');
  const salonAmountInput = document.getElementById('salonAmount');

  // Set today's date for salonDate
  const today = new Date();
  today.setMinutes(today.getMinutes() + today.getTimezoneOffset());
  document.getElementById('salonDate').valueAsDate = today;

  paymentButtons.forEach(button => {
    button.addEventListener('click', (e) => {
      e.preventDefault();
      paymentButtons.forEach(btn => {
        btn.classList.remove('selected');
      });
      button.classList.add('selected');
      document.getElementById('paymentType').value = button.dataset.type;
    });
  });

  salonForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const sale = {
      week: document.getElementById('salonWeek').value,
      date: new Date(document.getElementById('salonDate').value),
      hairdresser: document.getElementById('hairdresser').value,
      serviceCode: document.getElementById('serviceCode').value,
      amount: parseFloat(document.getElementById('salonAmount').value),
      paymentType: document.getElementById('paymentType').value
    };

    // Validate amount and service code
    if (!sale.serviceCode || !sale.amount || isNaN(sale.amount)) {
      return; // Exit if amount is invalid
    }

    addSalonSale(sale);

    document.getElementById('serviceCode').value = '';
    document.getElementById('salonAmount').value = '';

    // Reset date to today after submission
    document.getElementById('salonDate').valueAsDate = new Date();

    document.getElementById('serviceCode').focus();
  });

  // ... rest of existing code ...
  document.addEventListener('DOMContentLoaded', () => {
    // Add event listeners for hairdresser panel buttons
    const blackPanelButtons = document.querySelectorAll('.black-panel-button');
    blackPanelButtons.forEach(button => {
      button.addEventListener('click', () => {
        blackPanelButtons.forEach(btn => btn.classList.remove('selected'));
        button.classList.add('selected');
        // Future functionality can be added here
      });
    });
  });
});

document.addEventListener('DOMContentLoaded', () => {
  const aldoButton = document.getElementById('aldoButton');
  const marcosButton = document.querySelector('.black-panel-button:nth-child(2)'); // Select Marcos button
  const otroButton = document.querySelector('.black-panel-button:nth-child(3)'); // Select Otro button
  const aldoPanels = document.querySelector('.aldo-panels');
  const marcosPanels = document.querySelector('.marcos-panels');
  const otroPanels = document.querySelector('.otro-panels');
  
  aldoButton.addEventListener('click', () => {
    aldoButton.classList.toggle('selected');
    aldoPanels.classList.toggle('show');
    
    // Hide other panels if they're showing
    marcosButton.classList.remove('selected');
    otroButton.classList.remove('selected');
    marcosPanels.classList.remove('show');
    otroPanels.classList.remove('show');
  });

  marcosButton.addEventListener('click', () => {
    marcosButton.classList.toggle('selected');
    marcosPanels.classList.toggle('show');
    
    // Hide other panels if they're showing
    aldoButton.classList.remove('selected');
    otroButton.classList.remove('selected');
    aldoPanels.classList.remove('show');
    otroPanels.classList.remove('show');
    
    updateMarcosVentasPanel();
  });

  otroButton.addEventListener('click', () => {
    otroButton.classList.toggle('selected');
    otroPanels.classList.toggle('show');
    
    // Hide other panels if they're showing
    aldoButton.classList.remove('selected');
    marcosButton.classList.remove('selected');
    aldoPanels.classList.remove('show');
    marcosPanels.classList.remove('show');
    
    updateOtroVentasPanel();
  });

  // Add functionality for all black panel buttons
  const blackPanelButtons = document.querySelectorAll('.black-panel-button');
  blackPanelButtons.forEach(button => {
    button.addEventListener('click', (e) => {
      if (e.target !== aldoButton && e.target !== marcosButton && e.target !== otroButton) {
        // If clicking another button, hide all panels
        aldoButton.classList.remove('selected');
        marcosButton.classList.remove('selected');
        otroButton.classList.remove('selected');
        aldoPanels.classList.remove('show');
        marcosPanels.classList.remove('show');
        otroPanels.classList.remove('show');
      }
      
      blackPanelButtons.forEach(btn => {
        if (btn !== e.target) {
          btn.classList.remove('selected');
        }
      });
    });
  });
});

function updateAldoSemanasPanel() {
  const semanasPanel = document.querySelector('.semanas-aldo .aldo-content');
  semanasPanel.innerHTML = '';

  // Get all Aldo's sales
  const aldoSales = salonSales.filter(sale => sale.hairdresser === 'ALDO');

  // Group sales by week
  const salesByWeek = {};
  for (let week = 1; week <= 5; week++) {
    salesByWeek[week] = {
      totalVentas: 0,
      totalTarjeta: 0,
      totalPorc: 0
    };
  }

  aldoSales.forEach(sale => {
    const weekNumber = parseInt(sale.week);
    const weekData = salesByWeek[weekNumber];
    weekData.totalVentas += sale.amount;
    
    if (sale.paymentType === 'debito' || sale.paymentType === 'credito') {
      weekData.totalTarjeta += sale.amount;
    }

    const hairdresserConfig = hairdresserCommissions.aldo;
    const recAmount = (sale.paymentType === 'debito' || sale.paymentType === 'credito') ?
      sale.amount * (hairdresserConfig.rec / 100) : 0;
    const comAmount = sale.amount * (hairdresserConfig.com / 100);
    weekData.totalPorc += (recAmount + comAmount);
  });

  // Create weekly summary cards in order from week 1 to 5
  Object.entries(salesByWeek)
    .sort(([weekA], [weekB]) => parseInt(weekA) - parseInt(weekB)) 
    .forEach(([week, data]) => {
      const weekCard = document.createElement('div');
      weekCard.className = 'week-summary-card';
      
      const diferencia = data.totalTarjeta - data.totalPorc;

      weekCard.innerHTML = `
        <h4>Semana ${week}</h4>
        <div class="week-summary-grid">
          <div class="week-summary-item">
            <span class="summary-label">Total Ventas Aldo:</span>
            <span class="summary-value">${formatCurrency(data.totalVentas)}</span>
          </div>
          <div class="week-summary-item">
            <span class="summary-label">Total Venta Tarjeta Aldo:</span>
            <span class="summary-value">${formatCurrency(data.totalTarjeta)}</span>
          </div>
          <div class="week-summary-item">
            <span class="summary-label">Total Porc. Aldo:</span>
            <span class="summary-value">${formatCurrency(data.totalPorc)}</span>
          </div>
          <div class="week-summary-item">
            <span class="summary-label">Dif. Aldo:</span>
            <span class="summary-value">${formatCurrency(diferencia)}</span>
          </div>
        </div>
      `;

      semanasPanel.appendChild(weekCard);
    });

  if (Object.keys(salesByWeek).length === 0) {
    semanasPanel.innerHTML = '<p class="no-data-message">No hay datos para mostrar</p>';
  }
}

function updateMarcosSemanasPanel() {
  const semanasPanel = document.querySelector('.semanas-marcos .marcos-content');
  semanasPanel.innerHTML = '';

  // Get all Marcos' sales
  const marcosSales = salonSales.filter(sale => sale.hairdresser === 'MARCOS');

  // Group sales by week
  const salesByWeek = {};
  for (let week = 1; week <= 5; week++) {
    salesByWeek[week] = {
      totalVentas: 0,
      totalTarjeta: 0,
      totalPorc: 0
    };
  }

  marcosSales.forEach(sale => {
    const weekNumber = parseInt(sale.week);
    const weekData = salesByWeek[weekNumber];
    weekData.totalVentas += sale.amount;
    
    if (sale.paymentType === 'debito' || sale.paymentType === 'credito') {
      weekData.totalTarjeta += sale.amount;
    }

    const hairdresserConfig = hairdresserCommissions.marcos;
    const recAmount = (sale.paymentType === 'debito' || sale.paymentType === 'credito') ?
      sale.amount * (hairdresserConfig.rec / 100) : 0;
    const comAmount = sale.amount * (hairdresserConfig.com / 100);
    weekData.totalPorc += (recAmount + comAmount);
  });

  // Create weekly summary cards in order from week 1 to 5
  Object.entries(salesByWeek)
    .sort(([weekA], [weekB]) => parseInt(weekA) - parseInt(weekB)) 
    .forEach(([week, data]) => {
      const weekCard = document.createElement('div');
      weekCard.className = 'week-summary-card';
      
      const diferencia = data.totalTarjeta - data.totalPorc;

      weekCard.innerHTML = `
        <h4>Semana ${week}</h4>
        <div class="week-summary-grid">
          <div class="week-summary-item">
            <span class="summary-label">Total Ventas Marcos:</span>
            <span class="summary-value">${formatCurrency(data.totalVentas)}</span>
          </div>
          <div class="week-summary-item">
            <span class="summary-label">Total Venta Tarjeta Marcos:</span>
            <span class="summary-value">${formatCurrency(data.totalTarjeta)}</span>
          </div>
          <div class="week-summary-item">
            <span class="summary-label">Total Porc. Marcos:</span>
            <span class="summary-value">${formatCurrency(data.totalPorc)}</span>
          </div>
          <div class="week-summary-item">
            <span class="summary-label">Dif. Marcos:</span>
            <span class="summary-value">${formatCurrency(diferencia)}</span>
          </div>
        </div>
      `;

      semanasPanel.appendChild(weekCard);
    });

  if (Object.keys(salesByWeek).length === 0) {
    semanasPanel.innerHTML = '<p class="no-data-message">No hay datos para mostrar</p>';
  }
}

function updateAldoVentasPanel() {
  const ventasPanel = document.querySelector('.ventas-aldo .aldo-content');
  ventasPanel.innerHTML = '';

  const table = document.createElement('div');
  table.className = 'ventas-table';

  const header = document.createElement('div');
  header.className = 'ventas-table-header';
  header.innerHTML = `
    <div class="ventas-table-cell">Semana</div>
    <div class="ventas-table-cell">Fecha</div>
    <div class="ventas-table-cell">Código</div>
    <div class="ventas-table-cell">Monto</div>
    <div class="ventas-table-cell">Tipo Pago</div>
    <div class="ventas-table-cell">REC</div>
    <div class="ventas-table-cell">COM</div>
    <div class="ventas-table-cell">Porc. Aldo</div>
  `;
  table.appendChild(header);

  const aldoSales = salonSales
    .filter(sale => sale.hairdresser === 'ALDO')
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  aldoSales.forEach(sale => {
    const isCardPayment = sale.paymentType === 'debito' || sale.paymentType === 'credito';
    const hairdresserConfig = hairdresserCommissions.aldo;
    // Only calculate REC for card payments
    const recAmount = isCardPayment ? 
      sale.amount * (hairdresserConfig.rec / 100) : 0;
      
    // Always calculate COM  
    const comAmount = sale.amount * (hairdresserConfig.com / 100);
    const totalPercentage = recAmount + comAmount;
    
    const row = document.createElement('div');
    row.className = 'ventas-table-row';
    row.innerHTML = `
      <div class="ventas-table-cell">Sem ${sale.week}</div>
      <div class="ventas-table-cell">${formatDate(sale.date)}</div>
      <div class="ventas-table-cell">${sale.serviceCode}</div>
      <div class="ventas-table-cell amount">${formatCurrency(sale.amount)}</div>
      <div class="ventas-table-cell payment-type ${sale.paymentType}">${sale.paymentType}</div>
      <div class="ventas-table-cell amount">${isCardPayment ? formatCurrency(recAmount) : '-'}</div>
      <div class="ventas-table-cell amount">${formatCurrency(comAmount)}</div>
      <div class="ventas-table-cell amount">${formatCurrency(totalPercentage)}</div>
    `;
    
    table.appendChild(row);
  });

  ventasPanel.appendChild(table);
  updateAldoSemanasPanel();
}

function updateMarcosVentasPanel() {
  const ventasPanel = document.querySelector('.ventas-marcos .marcos-content');
  ventasPanel.innerHTML = '';

  const table = document.createElement('div');
  table.className = 'ventas-table';

  const header = document.createElement('div');
  header.className = 'ventas-table-header';
  header.innerHTML = `
    <div class="ventas-table-cell">Semana</div>
    <div class="ventas-table-cell">Fecha</div>
    <div class="ventas-table-cell">Código</div>
    <div class="ventas-table-cell">Monto</div>
    <div class="ventas-table-cell">Tipo Pago</div>
    <div class="ventas-table-cell">REC</div>
    <div class="ventas-table-cell">COM</div>
    <div class="ventas-table-cell">Porc. Marcos</div>
  `;
  table.appendChild(header);

  const marcosSales = salonSales
    .filter(sale => sale.hairdresser === 'MARCOS')
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  marcosSales.forEach(sale => {
    const isCardPayment = sale.paymentType === 'debito' || sale.paymentType === 'credito';
    const hairdresserConfig = hairdresserCommissions.marcos;
    // Only calculate REC for card payments
    const recAmount = isCardPayment ? 
      sale.amount * (hairdresserConfig.rec / 100) : 0;
      
    // Always calculate COM  
    const comAmount = sale.amount * (hairdresserConfig.com / 100);
    const totalPercentage = recAmount + comAmount;
    
    const row = document.createElement('div');
    row.className = 'ventas-table-row';
    row.innerHTML = `
      <div class="ventas-table-cell">Sem ${sale.week}</div>
      <div class="ventas-table-cell">${formatDate(sale.date)}</div>
      <div class="ventas-table-cell">${sale.serviceCode}</div>
      <div class="ventas-table-cell amount">${formatCurrency(sale.amount)}</div>
      <div class="ventas-table-cell payment-type ${sale.paymentType}">${sale.paymentType}</div>
      <div class="ventas-table-cell amount">${isCardPayment ? formatCurrency(recAmount) : '-'}</div>
      <div class="ventas-table-cell amount">${formatCurrency(comAmount)}</div>
      <div class="ventas-table-cell amount">${formatCurrency(totalPercentage)}</div>
    `;
    
    table.appendChild(row);
  });

  ventasPanel.appendChild(table);
}

function updateOtroVentasPanel() {
  const ventasPanel = document.querySelector('.ventas-otro .otro-content');
  ventasPanel.innerHTML = '';

  const table = document.createElement('div');
  table.className = 'ventas-table';

  const header = document.createElement('div');
  header.className = 'ventas-table-header';
  header.innerHTML = `
    <div class="ventas-table-cell">Semana</div>
    <div class="ventas-table-cell">Fecha</div>
    <div class="ventas-table-cell">Código</div>
    <div class="ventas-table-cell">Monto</div>
    <div class="ventas-table-cell">Tipo Pago</div>
    <div class="ventas-table-cell">REC</div>
    <div class="ventas-table-cell">COM</div>
    <div class="ventas-table-cell">Porc. Otro</div>
  `;
  table.appendChild(header);

  const otroSales = salonSales
    .filter(sale => sale.hairdresser === 'OTRO')
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  otroSales.forEach(sale => {
    const isCardPayment = sale.paymentType === 'debito' || sale.paymentType === 'credito';
    const hairdresserConfig = hairdresserCommissions.otro;
    // Only calculate REC for card payments
    const recAmount = isCardPayment ? 
      sale.amount * (hairdresserConfig.rec / 100) : 0;
      
    // Always calculate COM  
    const comAmount = sale.amount * (hairdresserConfig.com / 100);
    const totalPercentage = recAmount + comAmount;
    
    const row = document.createElement('div');
    row.className = 'ventas-table-row';
    row.innerHTML = `
      <div class="ventas-table-cell">Sem ${sale.week}</div>
      <div class="ventas-table-cell">${formatDate(sale.date)}</div>
      <div class="ventas-table-cell">${sale.serviceCode}</div>
      <div class="ventas-table-cell amount">${formatCurrency(sale.amount)}</div>
      <div class="ventas-table-cell payment-type ${sale.paymentType}">${sale.paymentType}</div>
      <div class="ventas-table-cell amount">${isCardPayment ? formatCurrency(recAmount) : '-'}</div>
      <div class="ventas-table-cell amount">${formatCurrency(comAmount)}</div>
      <div class="ventas-table-cell amount">${formatCurrency(totalPercentage)}</div>
    `;
    
    table.appendChild(row);
  });

  ventasPanel.appendChild(table);
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.commission-value').forEach(element => {
    element.addEventListener('dblclick', editCommissionValue);
  });
});

function editCommissionValue(e) {
  const element = e.target;
  const currentValue = parseFloat(element.textContent);
  const type = element.dataset.type;
  const hairdresser = element.dataset.hairdresser;

  // Create input element
  const input = document.createElement('input');
  input.type = 'number';
  input.value = currentValue;
  input.min = 0;
  input.max = 100;
  input.step = 0.1;
  input.style.width = '50px';
  input.style.fontSize = 'inherit';
  input.style.padding = '2px';
  input.style.textAlign = 'center';

  // Replace span with input
  element.replaceWith(input);
  input.focus();
  input.select();

  function saveEdit() {
    const newValue = parseFloat(input.value);
    if (!isNaN(newValue) && newValue >= 0 && newValue <= 100) {
      hairdresserCommissions[hairdresser][type] = newValue;
      
      // Create new span element
      const newSpan = document.createElement('span');
      newSpan.className = 'commission-value';
      newSpan.dataset.type = type;
      newSpan.dataset.hairdresser = hairdresser;
      newSpan.textContent = newValue + '%';
      
      // Add event listener to new span
      newSpan.addEventListener('dblclick', editCommissionValue);
      
      input.replaceWith(newSpan);
      
      // Save to localStorage
      localStorage.setItem('hairdresserCommissions', JSON.stringify(hairdresserCommissions));
      
      // Update any related calculations if needed
      updateHairdresserPanels();
    } else {
      // If invalid value, revert to previous value
      const revertSpan = document.createElement('span');
      revertSpan.className = 'commission-value';
      revertSpan.dataset.type = type;
      revertSpan.dataset.hairdresser = hairdresser;
      revertSpan.textContent = hairdresserCommissions[hairdresser][type] + '%';
      revertSpan.addEventListener('dblclick', editCommissionValue);
      safeReplaceWith(input, revertSpan);
    }
  }

  input.addEventListener('blur', saveEdit);
  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveEdit();
    }
  });
}

// Load commission rates from localStorage on page load
function loadCommissionRates() {
  const savedCommissions = localStorage.getItem('hairdresserCommissions');
  if (savedCommissions) {
    hairdresserCommissions = JSON.parse(savedCommissions);
    
    // Update displayed values
    document.querySelectorAll('.commission-value').forEach(element => {
      const type = element.dataset.type;
      const hairdresser = element.dataset.hairdresser;
      element.textContent = hairdresserCommissions[hairdresser][type] + '%';
    });
  }
}

// Call this function when page loads
document.addEventListener('DOMContentLoaded', loadCommissionRates);

// Add this to your existing updateHairdresserPanels function
function updateHairdresserPanels() {
  updateAldoVentasPanel();
  updateAldoSemanasPanel();
  updateAldoTotalesPanel();
  updateAldoBoletasPanel();
  updateMarcosVentasPanel();
  updateMarcosSemanasPanel();
  updateMarcosTotalesPanel();
  updateMarcosBoletasPanel(); 
  updateOtroVentasPanel();
  updateOtroSemanasPanel();
  updateOtroTotalesPanel();
  updateOtroBoletasPanel();
  updateFigaroTotalesFinales(); // Add this line
}

function updateOtroSemanasPanel() {
  const semanasPanel = document.querySelector('.semanas-otro .otro-content');
  semanasPanel.innerHTML = '';

  // Get all Otro's sales
  const otroSales = salonSales.filter(sale => sale.hairdresser === 'OTRO');

  // Group sales by week
  const salesByWeek = {};
  for (let week = 1; week <= 5; week++) {
    salesByWeek[week] = {
      totalVentas: 0,
      totalTarjeta: 0,
      totalPorc: 0
    };
  }

  otroSales.forEach(sale => {
    const weekNumber = parseInt(sale.week);
    const weekData = salesByWeek[weekNumber];
    weekData.totalVentas += sale.amount;
    
    if (sale.paymentType === 'debito' || sale.paymentType === 'credito') {
      weekData.totalTarjeta += sale.amount;
    }

    const hairdresserConfig = hairdresserCommissions.otro;
    const recAmount = (sale.paymentType === 'debito' || sale.paymentType === 'credito') ?
      sale.amount * (hairdresserConfig.rec / 100) : 0;
    const comAmount = sale.amount * (hairdresserConfig.com / 100);
    weekData.totalPorc += (recAmount + comAmount);
  });

  // Create weekly summary cards in order from week 1 to 5
  Object.entries(salesByWeek)
    .sort(([weekA], [weekB]) => parseInt(weekA) - parseInt(weekB))
    .forEach(([week, data]) => {
      const weekCard = document.createElement('div');
      weekCard.className = 'week-summary-card';
      
      const diferencia = data.totalTarjeta - data.totalPorc;

      weekCard.innerHTML = `
        <h4>Semana ${week}</h4>
        <div class="week-summary-grid">
          <div class="week-summary-item">
            <span class="summary-label">Total Ventas Otro:</span>
            <span class="summary-value">${formatCurrency(data.totalVentas)}</span>
          </div>
          <div class="week-summary-item">
            <span class="summary-label">Total Venta Tarjeta Otro:</span>
            <span class="summary-value">${formatCurrency(data.totalTarjeta)}</span>
          </div>
          <div class="week-summary-item">
            <span class="summary-label">Total Porc. Otro:</span>
            <span class="summary-value">${formatCurrency(data.totalPorc)}</span>
          </div>
          <div class="week-summary-item">
            <span class="summary-label">Dif. Otro:</span>
            <span class="summary-value">${formatCurrency(diferencia)}</span>
          </div>
        </div>
      `;

      semanasPanel.appendChild(weekCard);
    });

  if (Object.keys(salesByWeek).length === 0) {
    semanasPanel.innerHTML = '<p class="no-data-message">No hay datos para mostrar</p>';
  }
}

function updateAldoTotalesPanel() {
  const totalesPanel = document.querySelector('.totales-aldo .aldo-content');
  totalesPanel.innerHTML = '';

  // Get all Aldo's sales
  const aldoSales = salonSales.filter(sale => sale.hairdresser === 'ALDO');

  // Calculate totals
  const totals = {
    totalVentas: 0,
    totalTarjeta: 0,
    totalPorc: 0
  };

  aldoSales.forEach(sale => {
    totals.totalVentas += sale.amount;
    
    if (sale.paymentType === 'debito' || sale.paymentType === 'credito') {
      totals.totalTarjeta += sale.amount;
    }

    const hairdresserConfig = hairdresserCommissions.aldo;
    const recAmount = (sale.paymentType === 'debito' || sale.paymentType === 'credito') ?
      sale.amount * (hairdresserConfig.rec / 100) : 0;
    const comAmount = sale.amount * (hairdresserConfig.com / 100);
    totals.totalPorc += (recAmount + comAmount);
  });

  // Calculate retention
  const retencion = totals.totalVentas * (hairdresserCommissions.aldo.ret / 100);

  // Create total items
  const totalsHTML = `
    <div class="final-total-item">
      <span class="final-total-label">TF Ventas Aldo:</span>
      <span class="final-total-value">${formatCurrency(totals.totalVentas)}</span>
    </div>
    <div class="final-total-item">
      <span class="final-total-label">TF Venta Tarjeta Aldo:</span>
      <span class="final-total-value">${formatCurrency(totals.totalTarjeta)}</span>
    </div>
    <div class="final-total-item">
      <span class="final-total-label">TF Porc. Aldo:</span>
      <span class="final-total-value">${formatCurrency(totals.totalPorc)}</span>
    </div>
    <div class="final-total-item">
      <span class="final-total-label">Retención Aldo:</span>
      <span class="final-total-value">${formatCurrency(retencion)}</span>
    </div>
  `;

  totalesPanel.innerHTML = totalsHTML;
}

function updateMarcosTotalesPanel() {
  const totalesPanel = document.querySelector('.totales-marcos .marcos-content');
  totalesPanel.innerHTML = '';

  // Get all Marcos' sales
  const marcosSales = salonSales.filter(sale => sale.hairdresser === 'MARCOS');

  // Calculate totals
  const totals = {
    totalVentas: 0,
    totalTarjeta: 0,
    totalPorc: 0
  };

  marcosSales.forEach(sale => {
    totals.totalVentas += sale.amount;
    
    if (sale.paymentType === 'debito' || sale.paymentType === 'credito') {
      totals.totalTarjeta += sale.amount;
    }

    const hairdresserConfig = hairdresserCommissions.marcos;
    const recAmount = (sale.paymentType === 'debito' || sale.paymentType === 'credito') ?
      sale.amount * (hairdresserConfig.rec / 100) : 0;
    const comAmount = sale.amount * (hairdresserConfig.com / 100);
    totals.totalPorc += (recAmount + comAmount);
  });

  // Calculate retention
  const retencion = totals.totalVentas * (hairdresserCommissions.marcos.ret / 100);

  // Create total items
  const totalsHTML = `
    <div class="final-total-item">
      <span class="final-total-label">TF Ventas Marcos:</span>
      <span class="final-total-value">${formatCurrency(totals.totalVentas)}</span>
    </div>
    <div class="final-total-item">
      <span class="final-total-label">TF Venta Tarjeta Marcos:</span>
      <span class="final-total-value">${formatCurrency(totals.totalTarjeta)}</span>
    </div>
    <div class="final-total-item">
      <span class="final-total-label">TF Porc. Marcos:</span>
      <span class="final-total-value">${formatCurrency(totals.totalPorc)}</span>
    </div>
    <div class="final-total-item">
      <span class="final-total-label">Retención Marcos:</span>
      <span class="final-total-value">${formatCurrency(retencion)}</span>
    </div>
  `;

  totalesPanel.innerHTML = totalsHTML;
}

function updateOtroTotalesPanel() {
  const totalesPanel = document.querySelector('.totales-otro .otro-content');
  totalesPanel.innerHTML = '';

  // Get all Otro's sales
  const otroSales = salonSales.filter(sale => sale.hairdresser === 'OTRO');

  // Calculate totals
  const totals = {
    totalVentas: 0,
    totalTarjeta: 0,
    totalPorc: 0
  };

  otroSales.forEach(sale => {
    totals.totalVentas += sale.amount;
    
    if (sale.paymentType === 'debito' || sale.paymentType === 'credito') {
      totals.totalTarjeta += sale.amount;
    }

    const hairdresserConfig = hairdresserCommissions.otro;
    const recAmount = (sale.paymentType === 'debito' || sale.paymentType === 'credito') ?
      sale.amount * (hairdresserConfig.rec / 100) : 0;
    const comAmount = sale.amount * (hairdresserConfig.com / 100);
    totals.totalPorc += (recAmount + comAmount);
  });

  // Calculate retention
  const retencion = totals.totalVentas * (hairdresserCommissions.otro.ret / 100);

  // Create total items
  const totalsHTML = `
    <div class="final-total-item">
      <span class="final-total-label">TF Ventas Otro:</span>
      <span class="final-total-value">${formatCurrency(totals.totalVentas)}</span>
    </div>
    <div class="final-total-item">
      <span class="final-total-label">TF Venta Tarjeta Otro:</span>
      <span class="final-total-value">${formatCurrency(totals.totalTarjeta)}</span>
    </div>
    <div class="final-total-item">
      <span class="final-total-label">TF Porc. Otro:</span>
      <span class="final-total-value">${formatCurrency(totals.totalPorc)}</span>
    </div>
    <div class="final-total-item">
      <span class="final-total-label">Retención Otro:</span>
      <span class="final-total-value">${formatCurrency(retencion)}</span>
    </div>
  `;

  totalesPanel.innerHTML = totalsHTML;
}

function updateAldoBoletasPanel() {
  const boletasPanel = document.querySelector('.boletas-aldo .aldo-content');
  boletasPanel.innerHTML = '';

  // Get all Aldo's sales
  const aldoSales = salonSales.filter(sale => sale.hairdresser === 'ALDO');

  // Group sales by date
  const salesByDate = aldoSales.reduce((acc, sale) => {
    const date = new Date(sale.date).toISOString().split('T')[0];
    if (!acc[date]) {
      acc[date] = {
        efectivo: 0,
        tarjeta: 0
      };
    }
    if (sale.paymentType === 'efectivo') {
      acc[date].efectivo += sale.amount;
    } else {
      acc[date].tarjeta += sale.amount;
    }
    return acc;
  }, {});

  if (Object.keys(salesByDate).length === 0) {
    boletasPanel.innerHTML = '<p class="no-sales-message">No hay ventas registradas</p>';
    return;
  }

  // Create daily cards sorted by date (newest first)
  Object.entries(salesByDate)
    .sort(([dateA], [dateB]) => new Date(dateB) - new Date(dateA))
    .forEach(([date, totals]) => {
      const dailyCard = document.createElement('div');
      dailyCard.className = 'daily-sales-card';
      
      const totalDay = totals.efectivo + totals.tarjeta;
      const boletaKey = `aldo_${date}`;

      dailyCard.innerHTML = `
        <h4>Fecha: ${formatDate(date)}</h4>
        <div class="daily-sales-grid">
          <div class="daily-sales-item">
            <span class="daily-sales-label">
              Total Ventas Efectivo:
              <input type="text" 
                     class="boleta-input"
                     data-type="efectivo"
                     data-date="${date}"
                     data-hairdresser="aldo"
                     placeholder="N° Boleta"
                     value="${salesBoletas[`${boletaKey}_efectivo`] || ''}"
              >
            </span>
            <span class="daily-sales-value">${formatCurrency(totals.efectivo)}</span>
          </div>
          <div class="daily-sales-item">
            <span class="daily-sales-label">
              Total Ventas Tarjeta:
              <input type="text"
                     class="boleta-input"
                     data-type="tarjeta"
                     data-date="${date}"
                     data-hairdresser="aldo"
                     placeholder="N° Boleta"
                     value="${salesBoletas[`${boletaKey}_tarjeta`] || ''}"
              >
            </span>
            <span class="daily-sales-value">${formatCurrency(totals.tarjeta)}</span>
          </div>
          <div class="daily-sales-item total-day">
            <span class="daily-sales-label">Total Ventas Día:</span>
            <span class="daily-sales-value">${formatCurrency(totalDay)}</span>
          </div>
        </div>
      `;

      boletasPanel.appendChild(dailyCard);
    });

  // Add event listeners for boleta inputs
  boletasPanel.querySelectorAll('.boleta-input').forEach(input => {
    input.addEventListener('change', (e) => {
      const { date, type, hairdresser } = e.target.dataset;
      const key = `${hairdresser}_${date}_${type}`;
      salesBoletas[key] = e.target.value;
      saveSalonToLocalStorage();
    });
  });
}

function updateMarcosBoletasPanel() {
  const boletasPanel = document.querySelector('.boletas-marcos .marcos-content');
  boletasPanel.innerHTML = '';

  // Get all Marcos' sales
  const marcosSales = salonSales.filter(sale => sale.hairdresser === 'MARCOS');

  // Group sales by date
  const salesByDate = marcosSales.reduce((acc, sale) => {
    const date = new Date(sale.date).toISOString().split('T')[0];
    if (!acc[date]) {
      acc[date] = {
        efectivo: 0,
        tarjeta: 0
      };
    }
    if (sale.paymentType === 'efectivo') {
      acc[date].efectivo += sale.amount;
    } else {
      acc[date].tarjeta += sale.amount;
    }
    return acc;
  }, {});

  if (Object.keys(salesByDate).length === 0) {
    boletasPanel.innerHTML = '<p class="no-sales-message">No hay ventas registradas</p>';
    return;
  }

  // Create daily cards sorted by date (newest first)
  Object.entries(salesByDate)
    .sort(([dateA], [dateB]) => new Date(dateB) - new Date(dateA))
    .forEach(([date, totals]) => {
      const dailyCard = document.createElement('div');
      dailyCard.className = 'daily-sales-card';
      
      const totalDay = totals.efectivo + totals.tarjeta;
      const boletaKey = `marcos_${date}`;

      dailyCard.innerHTML = `
        <h4>Fecha: ${formatDate(date)}</h4>
        <div class="daily-sales-grid">
          <div class="daily-sales-item">
            <span class="daily-sales-label">
              Total Ventas Efectivo:
              <input type="text" 
                     class="boleta-input"
                     data-type="efectivo"
                     data-date="${date}"
                     data-hairdresser="marcos"
                     placeholder="N° Boleta"
                     value="${salesBoletas[`${boletaKey}_efectivo`] || ''}"
              >
            </span>
            <span class="daily-sales-value">${formatCurrency(totals.efectivo)}</span>
          </div>
          <div class="daily-sales-item">
            <span class="daily-sales-label">
              Total Ventas Tarjeta:
              <input type="text"
                     class="boleta-input"
                     data-type="tarjeta"
                     data-date="${date}"
                     data-hairdresser="marcos"
                     placeholder="N° Boleta"
                     value="${salesBoletas[`${boletaKey}_tarjeta`] || ''}"
              >
            </span>
            <span class="daily-sales-value">${formatCurrency(totals.tarjeta)}</span>
          </div>
          <div class="daily-sales-item total-day">
            <span class="daily-sales-label">Total Ventas Día:</span>
            <span class="daily-sales-value">${formatCurrency(totalDay)}</span>
          </div>
        </div>
      `;

      boletasPanel.appendChild(dailyCard);
    });

  // Add event listeners for boleta inputs
  boletasPanel.querySelectorAll('.boleta-input').forEach(input => {
    input.addEventListener('change', (e) => {
      const { date, type, hairdresser } = e.target.dataset;
      const key = `${hairdresser}_${date}_${type}`;
      salesBoletas[key] = e.target.value;
      saveSalonToLocalStorage();
    });
  });
}

function updateOtroBoletasPanel() {
  const boletasPanel = document.querySelector('.boletas-otro .otro-content');
  boletasPanel.innerHTML = '';

  // Get all Otro's sales
  const otroSales = salonSales.filter(sale => sale.hairdresser === 'OTRO');

  // Group sales by date
  const salesByDate = otroSales.reduce((acc, sale) => {
    const date = new Date(sale.date).toISOString().split('T')[0];
    if (!acc[date]) {
      acc[date] = {
        efectivo: 0,
        tarjeta: 0
      };
    }
    if (sale.paymentType === 'efectivo') {
      acc[date].efectivo += sale.amount;
    } else {
      acc[date].tarjeta += sale.amount;
    }
    return acc;
  }, {});

  if (Object.keys(salesByDate).length === 0) {
    boletasPanel.innerHTML = '<p class="no-sales-message">No hay ventas registradas</p>';
    return;
  }

  // Create daily cards sorted by date (newest first)
  Object.entries(salesByDate)
    .sort(([dateA], [dateB]) => new Date(dateB) - new Date(dateA))
    .forEach(([date, totals]) => {
      const dailyCard = document.createElement('div');
      dailyCard.className = 'daily-sales-card';
      
      const totalDay = totals.efectivo + totals.tarjeta;
      const boletaKey = `otro_${date}`;

      dailyCard.innerHTML = `
        <h4>Fecha: ${formatDate(date)}</h4>
        <div class="daily-sales-grid">
          <div class="daily-sales-item">
            <span class="daily-sales-label">
              Total Ventas Efectivo:
              <input type="text" 
                     class="boleta-input"
                     data-type="efectivo"
                     data-date="${date}"
                     data-hairdresser="otro"
                     placeholder="N° Boleta"
                     value="${salesBoletas[`${boletaKey}_efectivo`] || ''}"
              >
            </span>
            <span class="daily-sales-value">${formatCurrency(totals.efectivo)}</span>
          </div>
          <div class="daily-sales-item">
            <span class="daily-sales-label">
              Total Ventas Tarjeta:
              <input type="text"
                     class="boleta-input"
                     data-type="tarjeta"
                     data-date="${date}"
                     data-hairdresser="otro"
                     placeholder="N° Boleta"
                     value="${salesBoletas[`${boletaKey}_tarjeta`] || ''}"
              >
            </span>
            <span class="daily-sales-value">${formatCurrency(totals.tarjeta)}</span>
          </div>
          <div class="daily-sales-item total-day">
            <span class="daily-sales-label">Total Ventas Día:</span>
            <span class="daily-sales-value">${formatCurrency(totalDay)}</span>
          </div>
        </div>
      `;

      boletasPanel.appendChild(dailyCard);
    });

  // Add event listeners for boleta inputs
  boletasPanel.querySelectorAll('.boleta-input').forEach(input => {
    input.addEventListener('change', (e) => {
      const { date, type, hairdresser } = e.target.dataset;
      const key = `${hairdresser}_${date}_${type}`;
      salesBoletas[key] = e.target.value;
      saveSalonToLocalStorage();
    });
  });
}

function updateHairdresserPanels() {
  updateAldoVentasPanel();
  updateAldoSemanasPanel();
  updateAldoTotalesPanel();
  updateAldoBoletasPanel();
  updateMarcosVentasPanel();
  updateMarcosSemanasPanel();
  updateMarcosTotalesPanel();
  updateMarcosBoletasPanel();
  updateOtroVentasPanel();
  updateOtroSemanasPanel();
  updateOtroTotalesPanel();
  updateOtroBoletasPanel();
}

function updateFigaroSemanasPanel() {
  const semanasContent = document.querySelector('.figaro-semanas-content');
  semanasContent.innerHTML = '';

  // Add fixed labels column
  const labelsColumn = document.createElement('div');
  labelsColumn.className = 'figaro-totals-labels';
  
  const labels = [
    'Total Ventas',
    'Total Venta Tarjeta',
    'Total Porc.',
    'Diferencia',  
    'Venta Semanal',
    'Venta Tarjeta Semanal',
    'Porc. Semanal',
    'Diferencia Semanal',
    'Prom. Porc. Día'  // Added this label
  ];
  
  labels.forEach(label => {
    const div = document.createElement('div');
    div.className = 'total-label';
    div.textContent = label;
    labelsColumn.appendChild(div);
  });
  
  semanasContent.appendChild(labelsColumn);

  // Process data for each week
  const weeksData = {};
  
  // Initialize data structure for weeks 1-5
  for (let week = 1; week <= 5; week++) {
    weeksData[week] = {
      ALDO: {
        totalVentas: 0,
        totalTarjeta: 0,
        totalPorc: 0,
        diferencia: 0
      },
      MARCOS: {
        totalVentas: 0,
        totalTarjeta: 0,
        totalPorc: 0,
        diferencia: 0
      },
      OTRO: {
        totalVentas: 0,
        totalTarjeta: 0,
        totalPorc: 0,
        diferencia: 0
      },
      ventaSemanal: 0,
      ventaTarjetaSemanal: 0,
      porcSemanal: 0,
      diferenciaSemanal: 0,
      salesDays: new Set() // Add a Set to track unique days with sales
    };
  }

  // Calculate totals for each hairdresser by week
  salonSales.forEach(sale => {
    const weekData = weeksData[sale.week][sale.hairdresser];
    
    weekData.totalVentas += sale.amount;
    
    if (sale.paymentType === 'debito' || sale.paymentType === 'credito') {
      weekData.totalTarjeta += sale.amount;
      weeksData[sale.week].ventaTarjetaSemanal += sale.amount;
    }

    const hairdresserConfig = hairdresserCommissions[sale.hairdresser.toLowerCase()];
    const recAmount = (sale.paymentType === 'debito' || sale.paymentType === 'credito') ?
      sale.amount * (hairdresserConfig.rec / 100) : 0;
    const comAmount = sale.amount * (hairdresserConfig.com / 100);
    weekData.totalPorc += (recAmount + comAmount);
    
    weekData.diferencia = weekData.totalTarjeta - weekData.totalPorc;
    
    // Add to weekly totals
    weeksData[sale.week].ventaSemanal += sale.amount;
    weeksData[sale.week].porcSemanal += (recAmount + comAmount);
    
    // Add the sale date to track unique days
    weeksData[sale.week].salesDays.add(new Date(sale.date).toISOString().split('T')[0]);
    
    // Add to diferenciaSemanal only for MARCOS and OTRO
    if (sale.hairdresser === 'MARCOS' || sale.hairdresser === 'OTRO') {
      weeksData[sale.week].diferenciaSemanal = 
        weeksData[sale.week].MARCOS.diferencia + 
        weeksData[sale.week].OTRO.diferencia;
    }
  });

  // Create week panels
  Object.entries(weeksData)
    .sort(([weekA], [weekB]) => parseInt(weekA) - parseInt(weekB)) 
    .forEach(([week, weekData]) => {
      const hasData = Object.values(weekData).some(hairdresser => 
        typeof hairdresser === 'object' && hairdresser.totalVentas > 0
      );
      
      if (!hasData) return;

      const weekContainer = document.createElement('div');
      weekContainer.className = 'week-summary-container';
      
      // Calculate promedio porc semanal
      const promPorcSemanal = weekData.salesDays.size > 0 ? 
        weekData.porcSemanal / weekData.salesDays.size : 0;

      weekContainer.innerHTML = `
        <h4>Semana ${week}</h4>
        <div class="hairdresser-values">
          ${['ALDO', 'MARCOS', 'OTRO'].map(hairdresser => {
            const data = weekData[hairdresser];
            if (data.totalVentas === 0) return '';
            
            return `
              <div class="hairdresser-column">
                <h5>${hairdresser}</h5>
                <div class="value-row">${formatCurrency(data.totalVentas)}</div>
                <div class="value-row">${formatCurrency(data.totalTarjeta)}</div>
                <div class="value-row">${formatCurrency(data.totalPorc)}</div>
                <div class="value-row ${data.diferencia >= 0 ? 'positive' : 'negative'}">
                  ${formatCurrency(data.diferencia)}
                </div>
              </div>
            `;
          }).filter(Boolean).join('')}
        </div>
        <div class="venta-semanal">
          ${formatCurrency(weekData.ventaSemanal)}
        </div>
        <div class="venta-tarjeta-semanal">
          ${formatCurrency(weekData.ventaTarjetaSemanal)}
        </div>
        <div class="porc-semanal">
          ${formatCurrency(weekData.porcSemanal)}
        </div>
        <div class="diferencia-semanal">
          ${formatCurrency(weekData.diferenciaSemanal)}
        </div>
        <div class="prom-porc-semanal">
          ${formatCurrency(promPorcSemanal)}
        </div>
      `;

      semanasContent.appendChild(weekContainer);
    });
}

document.addEventListener('DOMContentLoaded', () => {
  loadSalonFromLocalStorage();
  updateFigaroSemanasPanel();
});

function updateFigaroTotalesFinales() {
  // Get all Aldo's sales
  const aldoSales = salonSales.filter(sale => sale.hairdresser === 'ALDO');
  const marcosSales = salonSales.filter(sale => sale.hairdresser === 'MARCOS');
  const otroSales = salonSales.filter(sale => sale.hairdresser === 'OTRO');

  // Determine hairdressers with sales
  const hasAldoSales = aldoSales.length > 0;
  const hasMarcosSales = marcosSales.length > 0;
  const hasOtroSales = otroSales.length > 0;

  // Calculate totals for each hairdresser
  const totals = {
    ALDO: {
      ventas: aldoSales.reduce((sum, sale) => sum + sale.amount, 0),
      ventaTarjeta: aldoSales
        .filter(sale => sale.paymentType === 'debito' || sale.paymentType === 'credito')
        .reduce((sum, sale) => sum + sale.amount, 0),
      porc: aldoSales.reduce((sum, sale) => {
        const recAmount = (sale.paymentType === 'debito' || sale.paymentType === 'credito') ?
          sale.amount * (hairdresserCommissions.aldo.rec / 100) : 0;
        const comAmount = sale.amount * (hairdresserCommissions.aldo.com / 100);
        return sum + (recAmount + comAmount);
      }, 0)
    },
    MARCOS: {
      ventas: marcosSales.reduce((sum, sale) => sum + sale.amount, 0),
      ventaTarjeta: marcosSales
        .filter(sale => sale.paymentType === 'debito' || sale.paymentType === 'credito')
        .reduce((sum, sale) => sum + sale.amount, 0),
      porc: marcosSales.reduce((sum, sale) => {
        const recAmount = (sale.paymentType === 'debito' || sale.paymentType === 'credito') ?
          sale.amount * (hairdresserCommissions.marcos.rec / 100) : 0;
        const comAmount = sale.amount * (hairdresserCommissions.marcos.com / 100);
        return sum + (recAmount + comAmount);
      }, 0)
    },
    OTRO: {
      ventas: otroSales.reduce((sum, sale) => sum + sale.amount, 0),
      ventaTarjeta: otroSales
        .filter(sale => sale.paymentType === 'debito' || sale.paymentType === 'credito')
        .reduce((sum, sale) => sum + sale.amount, 0),
      porc: otroSales.reduce((sum, sale) => {
        const recAmount = (sale.paymentType === 'debito' || sale.paymentType === 'credito') ?
          sale.amount * (hairdresserCommissions.otro.rec / 100) : 0;
        const comAmount = sale.amount * (hairdresserCommissions.otro.com / 100);
        return sum + (recAmount + comAmount);
      }, 0)
    }
  };

  const tableBody = document.querySelector('.totales-table tbody');
  tableBody.innerHTML = ''; // Clear existing rows

  const headerRow = document.querySelector('.totales-table thead tr');
  headerRow.innerHTML = ''; // Clear existing headers

  headerRow.innerHTML += `<th style="text-align: left;">TOTALES</th>`;
  if (hasAldoSales) headerRow.innerHTML += `<th>ALDO</th>`;
  if (hasMarcosSales) headerRow.innerHTML += `<th>MARCOS</th>`;
  if (hasOtroSales) headerRow.innerHTML += `<th>OTRO</th>`;


  const rowTypes = [
    { label: 'TF Ventas', dataKeys: ['ventas'] },
    { label: 'TF Venta Tarjeta', dataKeys: ['ventaTarjeta'] },
    { label: 'TF Porc.', dataKeys: ['porc'] },
    { label: 'Retención', dataKeys: ['ventas'], calculateRetention: true },
    { label: 'Líquido', dataKeys: ['ventas', 'porc'], calculateLiquido: true } // Add new row type
  ];

  rowTypes.forEach(rowType => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td style="text-align: left;">${rowType.label}</td>`;
    if (hasAldoSales) {
      const aldoValue = rowType.calculateRetention ? 
        totals.ALDO.ventas * (hairdresserCommissions.aldo.ret / 100) :
        rowType.calculateLiquido ?
        totals.ALDO.ventas - totals.ALDO.porc : // Calculate líquido
        totals.ALDO[rowType.dataKeys[0]];
      tr.innerHTML += `<td>${formatCurrency(aldoValue)}</td>`;
    }
    if (hasMarcosSales) {
      const marcosValue = rowType.calculateRetention ? 
        totals.MARCOS.ventas * (hairdresserCommissions.marcos.ret / 100) :
        rowType.calculateLiquido ?
        totals.MARCOS.ventas - totals.MARCOS.porc : // Calculate líquido
        totals.MARCOS[rowType.dataKeys[0]];
      tr.innerHTML += `<td>${formatCurrency(marcosValue)}</td>`;
    }
    if (hasOtroSales) {
      const otroValue = rowType.calculateRetention ? 
        totals.OTRO.ventas * (hairdresserCommissions.otro.ret / 100) :
        rowType.calculateLiquido ?
        totals.OTRO.ventas - totals.OTRO.porc : // Calculate líquido
        totals.OTRO[rowType.dataKeys[0]];
      tr.innerHTML += `<td>${formatCurrency(otroValue)}</td>`;
    }
    tableBody.appendChild(tr);
  });
}

function updateHairdresserPanels() {
  updateAldoVentasPanel();
  updateAldoSemanasPanel();
  updateAldoTotalesPanel();
  updateAldoBoletasPanel();
  updateMarcosVentasPanel();
  updateMarcosSemanasPanel();
  updateMarcosTotalesPanel();
  updateMarcosBoletasPanel();
  updateOtroVentasPanel();
  updateOtroSemanasPanel();
  updateOtroTotalesPanel();
  updateOtroBoletasPanel();
  updateFigaroTotalesFinales(); // Add this line
}

function updateFigaroResumenMensualPanel() {
  const resumenMensualContent = document.getElementById('resumenMensualContent');
  resumenMensualContent.innerHTML = '';

  const aldoSales = salonSales.filter(sale => sale.hairdresser === 'ALDO');
  const marcosSales = salonSales.filter(sale => sale.hairdresser === 'MARCOS');
  const otroSales = salonSales.filter(sale => sale.hairdresser === 'OTRO');

  const totals = {
    ALDO: {
      ventas: aldoSales.reduce((sum, sale) => sum + sale.amount, 0),
      ventaTarjeta: aldoSales
        .filter(sale => sale.paymentType === 'debito' || sale.paymentType === 'credito')
        .reduce((sum, sale) => sum + sale.amount, 0),
      porc: aldoSales.reduce((sum, sale) => {
        const recAmount = (sale.paymentType === 'debito' || sale.paymentType === 'credito') ?
          sale.amount * (hairdresserCommissions.aldo.rec / 100) : 0;
        const comAmount = sale.amount * (hairdresserCommissions.aldo.com / 100);
        return sum + (recAmount + comAmount);
      }, 0)
    },
    MARCOS: {
      ventas: marcosSales.reduce((sum, sale) => sum + sale.amount, 0),
      ventaTarjeta: marcosSales
        .filter(sale => sale.paymentType === 'debito' || sale.paymentType === 'credito')
        .reduce((sum, sale) => sum + sale.amount, 0),
      porc: marcosSales.reduce((sum, sale) => {
        const recAmount = (sale.paymentType === 'debito' || sale.paymentType === 'credito') ?
          sale.amount * (hairdresserCommissions.marcos.rec / 100) : 0;
        const comAmount = sale.amount * (hairdresserCommissions.marcos.com / 100);
        return sum + (recAmount + comAmount);
      }, 0)
    },
    OTRO: {
      ventas: otroSales.reduce((sum, sale) => sum + sale.amount, 0),
      ventaTarjeta: otroSales
        .filter(sale => sale.paymentType === 'debito' || sale.paymentType === 'credito')
        .reduce((sum, sale) => sum + sale.amount, 0),
      porc: otroSales.reduce((sum, sale) => {
        const recAmount = (sale.paymentType === 'debito' || sale.paymentType === 'credito') ?
          sale.amount * (hairdresserCommissions.otro.rec / 100) : 0;
        const comAmount = sale.amount * (hairdresserCommissions.otro.com / 100);
        return sum + (recAmount + comAmount);
      }, 0)
    }
  };

  const resumenTotals = {
    ventas: totals.ALDO.ventas + totals.MARCOS.ventas + totals.OTRO.ventas,
    ventaTarjeta: totals.ALDO.ventaTarjeta + totals.MARCOS.ventaTarjeta + totals.OTRO.ventaTarjeta,
    porc: totals.ALDO.porc + totals.MARCOS.porc + totals.OTRO.porc
  };

  const uniqueSaleDays = new Set(salonSales.map(sale => new Date(sale.date).toISOString().split('T')[0]));
  const numberOfSaleDays = uniqueSaleDays.size;

  const promPorcDía = numberOfSaleDays > 0 ? 
    resumenTotals.porc / numberOfSaleDays : 0;

  const resumenHTML = `
    <div class="resumen-mensual-item">
      <span class="resumen-mensual-label">TF Ventas:</span>
      <span class="resumen-mensual-value">${formatCurrency(resumenTotals.ventas)}</span>
    </div>
    <div class="resumen-mensual-item">
      <span class="resumen-mensual-label">TF Venta Tarjeta:</span>
      <span class="resumen-mensual-value">${formatCurrency(resumenTotals.ventaTarjeta)}</span>
    </div>
    <div class="resumen-mensual-item" style="background-color: rgba(39, 174, 96, 0.8); color: white; font-weight: bold;">
      <span class="resumen-mensual-label" style="color: white; font-weight: bold;">TF Porc.:</span>
      <span class="resumen-mensual-value" style="color: white; font-weight: bold;">${formatCurrency(resumenTotals.porc)}</span>
    </div>
    <div class="resumen-mensual-item">
      <span class="resumen-mensual-label">Prom. Porc. Día:</span>
      <span class="resumen-mensual-value">${formatCurrency(promPorcDía)}</span>
    </div>
  `;

  resumenMensualContent.innerHTML = resumenHTML;
}

function updateHairdresserPanels() {
  updateAldoVentasPanel();
  updateAldoSemanasPanel();
  updateAldoTotalesPanel();
  updateAldoBoletasPanel();
  updateMarcosVentasPanel();
  updateMarcosSemanasPanel();
  updateMarcosTotalesPanel();
  updateMarcosBoletasPanel();
  updateOtroVentasPanel();
  updateOtroSemanasPanel();
  updateOtroTotalesPanel();
  updateOtroBoletasPanel();
  updateFigaroTotalesFinales();
  updateFigaroResumenMensualPanel(); // Call the new function here
}

function updateFigaroIndicatorsPanel() {
  const indicatorsContent = document.querySelector('.figaro-panel.indicadores .figaro-content');

  // Calculate unique worked days from sales
  const uniqueSalesDays = new Set(
    salonSales.map(sale => new Date(sale.date).toISOString().split('T')[0])
  );
  const diasTrabajados = uniqueSalesDays.size;

  // Calculate meta dia
  const metaDia = figaroIndicators.diasHabilesMes && figaroIndicators.metaMes ?
    figaroIndicators.metaMes / figaroIndicators.diasHabilesMes : 0;

  // Calculate total porcentajes and promedio diario
  const totalPorcentajes = salonSales.reduce((total, sale) => {
    const hairdresser = sale.hairdresser.toLowerCase();
    const recAmount = (sale.paymentType === 'debito' || sale.paymentType === 'credito') ?
      sale.amount * (hairdresserCommissions[hairdresser].rec / 100) : 0;
    const comAmount = sale.amount * (hairdresserCommissions[hairdresser].com / 100);
    return total + (recAmount + comAmount);
  }, 0);

  const promPorcDia = diasTrabajados > 0 ? totalPorcentajes / diasTrabajados : 0;

  // Calculate proyeccion
  const proyeccion = promPorcDia * (figaroIndicators.diasHabilesMes || 0);

  // Calculate ingreso faltante (proyeccion - totalPorcentajes)
  const ingresoFaltante = proyeccion - totalPorcentajes;

  // Calculate diferencia semanal for selected week from Semanas Figaro panel
  const selectedWeek = figaroIndicators.selectedWeek || 1;
  
  // Find the diferencia semanal value for the selected week in the Semanas Figaro panel
  let diferenciaSemanal = 0;
  const weekContainers = document.querySelectorAll('.figaro-semanas-content .week-summary-container');
  
  weekContainers.forEach(container => {
    const weekHeader = container.querySelector('h4');
    if (weekHeader && weekHeader.textContent === `Semana ${selectedWeek}`) {
      const diferenciaSemanalElement = container.querySelector('.diferencia-semanal');
      if (diferenciaSemanalElement) {
        const value = diferenciaSemanalElement.textContent.trim();
        diferenciaSemanal = parseFloat(value.replace(/[^0-9-.,]/g, '').replace(/\./g, '').replace(',', '.')) || 0;
      }
    }
  });

  indicatorsContent.innerHTML = `
    <div class="indicator-item">
      <span class="indicator-label">PROYECCION:</span>
      <span class="indicator-value" id="proyeccionValue">
        ${formatCurrency(proyeccion)}
      </span>
    </div>
    <div class="indicator-item">
      <span class="indicator-label">INGRESO FALTANTE:</span>
      <span class="indicator-value" id="ingresoFaltanteValue">
        ${formatCurrency(ingresoFaltante)}
      </span>
    </div>
    <div class="indicator-item">
      <span class="indicator-label">SEMANAS:</span>
      <span class="indicator-value has-select">
        <select id="weekSelector">
          ${[1, 2, 3, 4, 5].map(week => `
            <option value="${week}" ${figaroIndicators.selectedWeek === week ? 'selected' : ''}>
              Semana ${week}
            </option>
          `).join('')}
        </select>
      </span>
    </div>
    <div class="indicator-item">
      <span class="indicator-label">DIFERENCIA SEMANAL:</span>
      <span class="indicator-value" id="diferenciaSemanalValue">
        ${formatCurrency(diferenciaSemanal)}
      </span>
    </div>
    <div class="indicator-item">
      <span class="indicator-label">META MES:</span>
      <span class="indicator-value editable" id="metaMesValue">
        ${formatCurrency(figaroIndicators.metaMes) || 'Click para editar'}
      </span>
    </div>
    <div class="indicator-item">
      <span class="indicator-label">META DIA:</span>
      <span class="indicator-value" id="metaDiaValue">
        ${formatCurrency(metaDia)}
      </span>
    </div>
    <div class="indicator-item">
      <span class="indicator-label">DIAS HABILES MES:</span>
      <span class="indicator-value editable" id="diasHabilesMesValue">
        ${figaroIndicators.diasHabilesMes || 'Click para editar'}
      </span>
    </div>
    <div class="indicator-item">
      <span class="indicator-label">DIAS TRABAJADOS:</span>
      <span class="indicator-value" id="diasTrabajadosValue">
        ${diasTrabajados}
      </span>
    </div>
    <div class="indicator-item">
      <span class="indicator-label">DIAS RESTANTES:</span>
      <span class="indicator-value" id="diasRestantesValue">
        ${figaroIndicators.diasHabilesMes - diasTrabajados}
      </span>
    </div>
  `;

  // Update DIF. SEMANAL FIGARO value in external data panel
  const difSemanalFigaroValueElement = document.querySelector('.data-box:nth-child(2) .data-content p');
  difSemanalFigaroValueElement.textContent = formatCurrency(diferenciaSemanal);

  // ... rest of existing code ...
  // Add event listeners for week selection and editable values
  const weekSelector = document.getElementById('weekSelector');
  weekSelector.addEventListener('change', (e) => {
    figaroIndicators.selectedWeek = parseInt(e.target.value);
    saveToLocalStorage();
    updateFigaroIndicatorsPanel();
  });

  // Add event listeners for editable values (diasHabilesMes and metaMes)
  const diasHabilesMesValue = document.getElementById('diasHabilesMesValue');
  const metaMesValue = document.getElementById('metaMesValue');

  diasHabilesMesValue.addEventListener('dblclick', () => {
    makeIndicatorEditable(diasHabilesMesValue, 'diasHabilesMes', 'number');
  });

  metaMesValue.addEventListener('dblclick', () => {
    makeIndicatorEditable(metaMesValue, 'metaMes', 'money');
  });

  updateTotalBalance(); // Add this line to update total balance
  updateAccountsList(); // Add this line to update accounts list
}

function makeIndicatorEditable(element, fieldName, type) {
  const currentValue = type === 'money' ? 
    (figaroIndicators[fieldName] || 0) : 
    (figaroIndicators[fieldName] || 'Click para editar');

  const input = document.createElement('input');
  input.type = 'number';
  input.min = type === 'number' ? '1' : '0';
  input.max = type === 'number' ? '31' : '';
  input.step = type === 'money' ? '1000' : '1';
  input.value = currentValue;
  input.className = 'edit-indicator-value';
  
  element.replaceWith(input);
  input.focus();
  input.select();

  function saveEdit() {
    const newValue = type === 'money' ? 
      parseFloat(input.value) : 
      parseInt(input.value);

    if (!isNaN(newValue) && newValue >= 0 && (type !== 'number' || newValue <= 31)) {
      figaroIndicators[fieldName] = newValue;
      saveToLocalStorage();
    }
    
    const span = document.createElement('span');
    span.className = 'indicator-value editable';
    span.id = element.id;
    span.textContent = type === 'money' ? 
      formatCurrency(figaroIndicators[fieldName] || 0) : 
      (figaroIndicators[fieldName] || 'Click para editar');
    
    safeReplaceWith(input, span);
    
    span.addEventListener('dblclick', (e) => {
      makeIndicatorEditable(e.target, fieldName, type);
    });

    updateFigaroIndicatorsPanel();
  }

  input.addEventListener('blur', saveEdit);
  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveEdit();
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  loadFromLocalStorage();
  updateFigaroIndicatorsPanel();
});

function saveToLocalStorage() {
  localStorage.setItem('finanzasAccounts', JSON.stringify(accounts));
  localStorage.setItem('finanzasTransactions', JSON.stringify(transactions));
  localStorage.setItem('finanzasAccountsOrder', JSON.stringify(accountsOrder));
  localStorage.setItem('finanzasTransactionsOrder', JSON.stringify(transactionsOrder));
  localStorage.setItem('figaro_indicators', JSON.stringify(figaroIndicators));
}

function loadFromLocalStorage() {
  const savedAccounts = localStorage.getItem('finanzasAccounts');
  const savedTransactions = localStorage.getItem('finanzasTransactions');
  const savedAccountsOrder = localStorage.getItem('finanzasAccountsOrder');
  const savedTransactionsOrder = localStorage.getItem('finanzasTransactionsOrder');
  const savedIndicators = localStorage.getItem('figaro_indicators');
  
  if (savedAccounts) accounts = JSON.parse(savedAccounts);
  if (savedTransactions) transactions = JSON.parse(savedTransactions);
  if (savedAccountsOrder) accountsOrder = JSON.parse(savedAccountsOrder);
  if (savedTransactionsOrder) transactionsOrder = JSON.parse(savedTransactionsOrder);
  if (savedIndicators) figaroIndicators = JSON.parse(savedIndicators);
  
  updateTotalBalance();
  updateAccountsList();
  updateTransactionsList();
  updateAccountSelectors();
  
  updateBalanceIndicators();
  setInterval(updateBalanceIndicators, 60000);
  
  const today = new Date();
  today.setMinutes(today.getMinutes() + today.getTimezoneOffset());
  document.getElementById('date').valueAsDate = today;
  
  updateBalanceIndicators();
  setInterval(updateBalanceIndicators, 60000);
  updateFigaroIndicatorsPanel(); // Call updateFigaroIndicatorsPanel first
  updateTotalBalance();       // Then call updateTotalBalance to use the updated indicator value
}

document.addEventListener('DOMContentLoaded', () => {
  const timeOptions = { 
    timeZone: 'America/Punta_Arenas',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  };

  // Set the initial transaction date based on Punta Arenas timezone
  const today = new Date();
  const puntaArenasDate = today.toLocaleDateString('es-CL', timeOptions);
  const [day, month, year] = puntaArenasDate.split('-');
  const formattedDate = `${year}-${month}-${day}`;
  document.getElementById('date').value = formattedDate;

  const updateFormDate = () => {
    const currentDate = new Date();
    const puntaArenasFormattedDate = currentDate.toLocaleDateString('es-CL', timeOptions);
    const [d, m, y] = puntaArenasFormattedDate.split('-');
    document.getElementById('date').value = `${y}-${m}-${d}`;
  };

  // Update the form date whenever the balance indicators update
  setInterval(updateFormDate, 60000); // Update every minute along with other indicators

  // ...rest of the event listeners and initializations
});

function showTCRProjection() {
  const modal = document.getElementById('tcrProjectionModal');
  const monthsHeader = modal.querySelector('.tcr-months-header');
  const content = modal.querySelector('.tcr-content');
  
  // Clear previous content
  monthsHeader.innerHTML = '';
  content.innerHTML = '';

  // Get locked TCR transactions respecting the order
  const tcrTransactions = transactions
    .sort((a, b) => {
      const indexA = transactionsOrder.indexOf(a.id);
      const indexB = transactionsOrder.indexOf(b.id);
      return indexA - indexB;
    })
    .filter(t => {
      const account = accounts[t.account];
      return t.locked && 
             account && 
             account.treatment === 'pasivos' && 
             t.account.toLowerCase().startsWith('tcr');
    });

  // Group transactions by account
  const accountGroups = {};
  tcrTransactions.forEach(t => {
    if (!accountGroups[t.account]) {
      accountGroups[t.account] = [];
    }
    accountGroups[t.account].push(t);
  });

  // Create month headers and calculate monthly totals
  const monthlyTotals = new Array(12).fill(0);
  
  // Add month headers
  for (let i = 0; i < 12; i++) {
    const monthCell = document.createElement('div');
    monthCell.className = 'tcr-month-cell';
    monthCell.innerHTML = `
      Mes ${i + 1}
      <span class="tcr-month-total">${formatCurrency(0)}</span>
    `;
    monthsHeader.appendChild(monthCell);
  }

  // Create content for each account
  Object.entries(accountGroups).forEach(([account, transactions]) => {
    const accountGroup = document.createElement('div');
    accountGroup.className = 'tcr-account-group';
    
    const accountHeader = document.createElement('div');
    accountHeader.className = 'tcr-account-header';
    accountHeader.textContent = accounts[account].displayName;
    accountGroup.appendChild(accountHeader);

    transactions.forEach(t => {
      const row = document.createElement('div');
      row.className = 'tcr-transaction-row';
      
      // Add description cell
      const descCell = document.createElement('div');
      descCell.className = 'tcr-transaction-cell';
      descCell.textContent = t.description;
      row.appendChild(descCell);

      // Calculate monthly payments
      const amount = t.type === 'gasto' ? t.amount : -t.amount;
      
      // Changed logic here - if no totalInstallments defined or equals 1, repeat for all months
      const isFixedPayment = !t.totalInstallments || t.totalInstallments === 1;
      const remainingInstallments = !isFixedPayment ? 
        (t.totalInstallments - t.currentInstallment + 1) : 
        12; // Fixed payments show for all 12 months
      
      for (let i = 0; i < 12; i++) {
        const cell = document.createElement('div');
        cell.className = 'tcr-amount-cell';
        
        if (isFixedPayment) {
          // Fixed monthly payment - show for all months
          cell.textContent = formatCurrency(amount);
          monthlyTotals[i] += amount;
        } else {
          // Installment payment - only show for remaining months
          if (i < remainingInstallments) {
            cell.textContent = formatCurrency(amount);
            monthlyTotals[i] += amount;
          } else {
            cell.className += ' tcr-empty-cell';
            cell.textContent = '-';
          }
        }
        
        row.appendChild(cell);
      }

      accountGroup.appendChild(row);
    });

    content.appendChild(accountGroup);
  });

  // Update month totals
  const monthCells = monthsHeader.querySelectorAll('.tcr-month-cell');
  monthCells.forEach((cell, i) => {
    cell.querySelector('.tcr-month-total').textContent = formatCurrency(monthlyTotals[i]);
  });

  modal.style.display = 'block';

  // Add close button handler
  const closeBtn = modal.querySelector('.tcr-close');
  closeBtn.onclick = () => modal.style.display = 'none';

  // Close when clicking outside
  window.onclick = (e) => {
    if (e.target === modal) {
      modal.style.display = 'none';
    }
  };
}

document.getElementById('proyTCR').onclick = showTCRProjection;

// Totales TCR modal logic
(function(){
  const totalesBtn = document.getElementById('totalesTCR');
  const modal = document.getElementById('totalesTCRModal');
  const closeBtn = modal?.querySelector('.totales-tcr-close');
  const listContainer = document.getElementById('totalesTCRList');

  function buildTotalesTCRList(){
    if(!listContainer) return;
    listContainer.innerHTML = '';
    const entries = Object.entries(accounts)
      .filter(([key, acc]) => acc.treatment === 'pasivos' && acc.type === 'credito');

    if(entries.length === 0){
      listContainer.innerHTML = '<div class="totales-empty">No se encontraron cuentas de tipo Tarjeta de Crédito en pasivos.</div>';
      return;
    }

    const ul = document.createElement('div');
    ul.className = 'totales-tcr-items';
    entries.forEach(([key, acc]) => {
      // Ensure there's a stored cupo total field
      if (acc.tcrLimit === undefined || acc.tcrLimit === null) {
        // default to 0 if not present
        acc.tcrLimit = 0;
      }

      // Compute Cupo Utilizado by summing all transactions for this account,
      // counting for each transaction the number of remaining installments (including current).
      const usedSum = transactions
        .filter(t => t.account === key)
        .reduce((sum, t) => {
          const amt = Math.abs(Number(t.amount || 0));
          // Determine remaining installments: if totalInstallments present and >1 use that, otherwise 1
          const totalInst = Number(t.totalInstallments) || 1;
          const currentInst = Number(t.currentInstallment) || 1;
          const remaining = Math.max(1, totalInst - currentInst + 1);
          return sum + (amt * remaining);
        }, 0);

      const limitNum = Number(acc.tcrLimit || 0);
      const disponible = limitNum - usedSum;

      const row = document.createElement('div');
      row.className = 'totales-tcr-item';

      row.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:6px;width:60%;">
          <div class="totales-tcr-name" title="${key}">${acc.displayName || key}</div>
          <div style="display:flex;gap:8px;align-items:center;">
            <label style="font-size:0.85em;color:#ccc;min-width:88px;">Cupo Total:</label>
            <input class="tcr-cupo-input" data-account="${key}" value="${formatCurrency(limitNum)}" style="width:120px;padding:6px;border-radius:6px;border:1px solid rgba(255,255,255,0.08);background:transparent;color:white;text-align:right;">
          </div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;width:40%;">
          <div style="font-size:1em;color:#fff;">Cupo Disponible: <strong class="tcr-disponible" data-account="${key}" data-raw="${disponible}" style="margin-left:6px;">${formatCurrency(disponible)}</strong></div>
          <div style="font-size:0.95em;color:#fff;">Cupo Utilizado: <strong class="tcr-utilizado" data-account="${key}" style="margin-left:6px;">${formatCurrency(usedSum)}</strong></div>
        </div>
      `;

      ul.appendChild(row);

      // apply positive/negative class based on disponible value
      try {
        const dispoEl = row.querySelector(`.tcr-disponible[data-account="${key}"]`);
        if (dispoEl) {
          if (Number(disponible) < 0) {
            dispoEl.classList.add('negative');
            dispoEl.classList.remove('positive');
          } else {
            dispoEl.classList.add('positive');
            dispoEl.classList.remove('negative');
          }
          // ensure displayed formatted value is consistent
          dispoEl.textContent = formatCurrency(disponible);
        }
      } catch (err) {
        // ignore any DOM timing issues
      }
    });
    listContainer.appendChild(ul);

    // Add event listeners for inputs (accept/display currency formatted values)
    listContainer.querySelectorAll('.tcr-cupo-input').forEach(input => {
      input.addEventListener('change', (e) => {
        const accountKey = e.target.dataset.account;
        // Parse formatted currency string back to number
        const raw = e.target.value || '';
        const cleaned = String(raw).replace(/\s/g,'').replace(/\$/g,'').replace(/CLP/g,'').replace(/,/g,'').replace(/\./g,'');
        // cleaned may be like "123456" or include decimal separator if user typed dot/comma; attempt robust parse:
        let numeric = parseFloat(raw.toString().replace(/[^0-9\-,\.]/g, '').replace(/\./g, '').replace(/,/g, '.'));
        if (isNaN(numeric)) {
          // fallback to integer extraction
          numeric = parseFloat(cleaned) || 0;
        }
        if (numeric < 0) numeric = 0;
        // store on account object
        if (!accounts[accountKey]) accounts[accountKey] = {};
        accounts[accountKey].tcrLimit = numeric;
        // Update displayed disponible for this account based on recalculated used sum
        const dispoEl = listContainer.querySelector(`.tcr-disponible[data-account="${accountKey}"]`);
        const utilizadoEl = listContainer.querySelector(`.tcr-utilizado[data-account="${accountKey}"]`);
        const used = transactions
          .filter(t => t.account === accountKey)
          .reduce((sum, t) => {
            const amt = Math.abs(Number(t.amount || 0));
            const totalInst = Number(t.totalInstallments) || 1;
            const currentInst = Number(t.currentInstallment) || 1;
            const remaining = Math.max(1, totalInst - currentInst + 1);
            return sum + (amt * remaining);
          }, 0);
        const disp = accounts[accountKey].tcrLimit - used;
        if (dispoEl) dispoEl.textContent = formatCurrency(disp);
        if (utilizadoEl) utilizadoEl.textContent = formatCurrency(used);
        // Rewrite the input value to a consistent currency format
        e.target.value = formatCurrency(accounts[accountKey].tcrLimit);
        // persist and refresh lists elsewhere
        saveToLocalStorage();
      });

      // allow Enter key to blur and trigger change, and keep currency formatting on blur
      input.addEventListener('keypress', (ev) => {
        if (ev.key === 'Enter') {
          ev.preventDefault();
          input.blur();
        }
      });

      input.addEventListener('blur', (ev) => {
        // ensure currency formatting on blur even if user didn't change (keeps consistent display)
        const accountKey = ev.target.dataset.account;
        const val = accounts[accountKey] && accounts[accountKey].tcrLimit ? accounts[accountKey].tcrLimit : 0;
        ev.target.value = formatCurrency(Number(val || 0));
      });

      // on focus show raw number for easier editing
      input.addEventListener('focus', (ev) => {
        const accountKey = ev.target.dataset.account;
        const val = accounts[accountKey] && accounts[accountKey].tcrLimit ? accounts[accountKey].tcrLimit : 0;
        ev.target.value = val || '';
      });
    });
  }

  function showTotalesModal(){
    buildTotalesTCRList();
    if(modal){
      modal.style.display = 'block';
      modal.setAttribute('aria-hidden','false');
    }
  }

  function hideTotalesModal(){
    if(modal){
      modal.style.display = 'none';
      modal.setAttribute('aria-hidden','true');
    }
  }

  if(totalesBtn){
    totalesBtn.addEventListener('click', (e) => {
      e.preventDefault();
      showTotalesModal();
    });
  }

  if(closeBtn){
    closeBtn.addEventListener('click', hideTotalesModal);
  }

  window.addEventListener('click', (e) => {
    if(e.target === modal){
      hideTotalesModal();
    }
  });

  // Rebuild list when accounts change by wrapping saveToLocalStorage to also update view
  const originalSave = saveToLocalStorage;
  window.saveToLocalStorage = function(){
    originalSave();
    // if modal open, refresh content
    if(modal && modal.style.display === 'block'){
      buildTotalesTCRList();
    }
  };
})();

function generateExcelReport() {
  // Create workbook
  const wb = XLSX.utils.book_new();

  // Generate sheets for sales data
  const salesSheet = generateSalesSheet();
  XLSX.utils.book_append_sheet(wb, salesSheet, "Ventas");

  // Generate sheets for each hairdresser
  const hairdressers = ['ALDO', 'MARCOS', 'OTRO'];
  hairdressers.forEach(hairdresser => {
    const totalsSheet = generateHairdresserTotalsSheet(hairdresser);
    XLSX.utils.book_append_sheet(wb, totalsSheet, `Totales ${hairdresser}`);
    
    const weeklySheet = generateHairdresserWeeklySheet(hairdresser);
    XLSX.utils.book_append_sheet(wb, weeklySheet, `Semanas ${hairdresser}`);
  });

  // Generate summary sheet
  const summarySheet = generateSummarySheet();
  XLSX.utils.book_append_sheet(wb, summarySheet, "Resumen");

  // Save the file
  const date = new Date().toISOString().split('T')[0];
  XLSX.writeFile(wb, `reporte_figaro_${date}.xlsx`);
}

function generateSalesSheet() {
  // Prepare sales data (round numeric values to integers) and include related boleta number if present
  const salesData = salonSales.map(sale => {
    // Determine date key used for boleta storage (ISO yyyy-mm-dd)
    const saleDateKey = new Date(sale.date).toISOString().split('T')[0];

    // Determine boleta type key: 'efectivo' for cash, 'tarjeta' for card payments
    const boletaType = (sale.paymentType === 'efectivo') ? 'efectivo' : 'tarjeta';

    // Hairdresser key stored in boletas is lowercase (e.g., 'aldo', 'marcos', 'otro')
    const hairdresserKey = sale.hairdresser ? sale.hairdresser.toLowerCase() : '';

    // Compose lookup key used in salesBoletas storage
    const boletaKey = `${hairdresserKey}_${saleDateKey}_${boletaType}`;

    // Lookup boleta number (may be undefined)
    const boletaNumber = salesBoletas[boletaKey] || '';

    return {
      'Semana': `Semana ${sale.week}`,
      'Fecha': formatDate(sale.date),
      'Peluquero': sale.hairdresser,
      'Código': sale.serviceCode,
      'Monto': Math.round(Number(sale.amount || 0)),
      'Tipo Pago': sale.paymentType.toUpperCase(),
      'Comisión': Math.round(Number(sale.commission || 0)),
      'Comisión + IVA': Math.round(Number(sale.commissionWithIVA || 0)),
      'Monto Neto': Math.round(Number(sale.netAmount || 0)),
      'Fecha Abono': sale.paymentDate ? formatDate(sale.paymentDate) : '',
      'Pagado': sale.paid ? 'Sí' : 'No',
      'Boleta': boletaNumber
    };
  });

  return XLSX.utils.json_to_sheet(salesData);
}

function generateHairdresserTotalsSheet(hairdresser) {
  const sales = salonSales.filter(sale => sale.hairdresser === hairdresser);
  const config = hairdresserCommissions[hairdresser.toLowerCase()];
  
  const totalVentas = sales.reduce((sum, sale) => sum + sale.amount, 0);
  const totalTarjeta = sales.filter(sale => 
    sale.paymentType === 'debito' || sale.paymentType === 'credito'
  ).reduce((sum, sale) => sum + sale.amount, 0);
  
  const totalPorc = sales.reduce((sum, sale) => {
    const recAmount = (sale.paymentType === 'debito' || sale.paymentType === 'credito') ?
      sale.amount * (config.rec / 100) : 0;
    const comAmount = sale.amount * (config.com / 100);
    return sum + (recAmount + comAmount);
  }, 0);
  
  const retencion = totalVentas * (config.ret / 100);
  const liquido = totalVentas - totalPorc;

  // Round all numeric values to integers for the report
  const data = [
    ['Concepto', 'Monto'],
    ['TF Ventas', Math.round(totalVentas)],
    ['TF Venta Tarjeta', Math.round(totalTarjeta)],
    ['TF Porc.', Math.round(totalPorc)],
    ['Retención', Math.round(retencion)],
    ['Líquido', Math.round(liquido)]
  ];

  return XLSX.utils.aoa_to_sheet(data);
}

function generateHairdresserWeeklySheet(hairdresser) {
  const weeks = [1, 2, 3, 4, 5];
  const weeklyData = weeks.map(week => {
    const weekSales = salonSales.filter(sale => 
      sale.hairdresser === hairdresser && sale.week === week
    );
    
    if (weekSales.length === 0) return null;

    const totalVentas = weekSales.reduce((sum, sale) => sum + sale.amount, 0);
    const totalTarjeta = weekSales.filter(sale => 
      sale.paymentType === 'debito' || sale.paymentType === 'credito'
    ).reduce((sum, sale) => sum + sale.amount, 0);
    
    const config = hairdresserCommissions[hairdresser.toLowerCase()];
    const totalPorc = weekSales.reduce((sum, sale) => {
      const recAmount = (sale.paymentType === 'debito' || sale.paymentType === 'credito') ?
        sale.amount * (config.rec / 100) : 0;
      const comAmount = sale.amount * (config.com / 100);
      return sum + (recAmount + comAmount);
    }, 0);

    return {
      'Semana': `Semana ${week}`,
      'Total Ventas': Math.round(totalVentas),
      'Total Venta Tarjeta': Math.round(totalTarjeta),
      'Total Porc.': Math.round(totalPorc),
      'Diferencia': Math.round(totalTarjeta - totalPorc)
    };
  }).filter(data => data !== null);

  return XLSX.utils.json_to_sheet(weeklyData);
}

function generateSummarySheet() {
  // Calculate general totals and round values to integers for report
  const totalVentas = salonSales.reduce((sum, sale) => sum + sale.amount, 0);
  const totalTarjeta = salonSales.filter(sale => 
    sale.paymentType === 'debito' || sale.paymentType === 'credito'
  ).reduce((sum, sale) => sum + sale.amount, 0);
  
  const totalPorc = salonSales.reduce((sum, sale) => {
    const config = hairdresserCommissions[sale.hairdresser.toLowerCase()];
    const recAmount = (sale.paymentType === 'debito' || sale.paymentType === 'credito') ?
      sale.amount * (config.rec / 100) : 0;
    const comAmount = sale.amount * (config.com / 100);
    return sum + (recAmount + comAmount);
  }, 0);

  const uniqueDays = new Set(salonSales.map(sale => 
    new Date(sale.date).toISOString().split('T')[0]
  ));
  const promPorcDia = uniqueDays.size > 0 ? totalPorc / uniqueDays.size : 0;

  const data = [
    ['Concepto', 'Monto'],
    ['TF Ventas', Math.round(totalVentas)],
    ['TF Venta Tarjeta', Math.round(totalTarjeta)],
    ['TF Porc.', Math.round(totalPorc)],
    ['Prom. Porc. Día', Math.round(promPorcDia)],
    ['Días Trabajados', uniqueDays.size],
    ['Meta Mes', Math.round(figaroIndicators.metaMes || 0)],
    ['Días Hábiles Mes', Math.round(figaroIndicators.diasHabilesMes || 0)]
  ];

  return XLSX.utils.aoa_to_sheet(data);
}

// Add event listener for the report button
document.addEventListener('DOMContentLoaded', () => {
  const reportButton = document.querySelector('.figaro-year-btn');
  reportButton.addEventListener('click', generateExcelReport);
});

// -----------------------------------------------------------
// Google Identity Services + Drive backup integration
// -----------------------------------------------------------

// Client ID provided (must be used exactly as requested)
const GOOGLE_CLIENT_ID = "414250903378-8f1nmeemkv7jdo6nhr1mveaam3jcvumc.apps.googleusercontent.com";

// Drive token client and token storage
let driveTokenClient;
let driveAccessToken = null;
let currentGoogleUser = null;

 // Initialize Google Identity and Token client once GSI script loads
 window.addEventListener('load', () => {
   try {
     // Initialize One Tap / Sign-In button rendering
     if (window.google && google.accounts && google.accounts.id) {
       google.accounts.id.initialize({
         client_id: GOOGLE_CLIENT_ID,
         callback: handleCredentialResponse
       });

       // Render standard button (text=continue_with shows "Continuar con Google"-like)
       google.accounts.id.renderButton(
         document.getElementById("googleSignInButton"),
         { theme: "outline", size: "large", text: "continue_with" }
       );
     }

     // Initialize token client for Drive (requesting drive.file scope)
     if (window.google && google.accounts && google.accounts.oauth2) {
       driveTokenClient = google.accounts.oauth2.initTokenClient({
         client_id: GOOGLE_CLIENT_ID,
         scope: 'https://www.googleapis.com/auth/drive.file',
         callback: (tokenResponse) => {
           // tokenResponse contains access_token (or error)
           if (tokenResponse && tokenResponse.access_token) {
             driveAccessToken = tokenResponse.access_token;
             try { localStorage.setItem('drive_access_token', driveAccessToken); } catch(e){/*ignore*/}
             console.log('Drive access token obtenido');
           } else {
             console.error('No se obtuvo access_token de Drive', tokenResponse);
           }
         }
       });
     }

     // Wire up UI buttons
     const saveBtn = document.getElementById('saveToDriveBtn');
     const loadBtn = document.getElementById('loadFromDriveBtn');
     if (saveBtn) saveBtn.addEventListener('click', saveBackupToDrive);
     if (loadBtn) loadBtn.addEventListener('click', loadLatestBackupFromDrive);

     // If we have a stored JWT, restore user session without requiring re-login
     try {
       const storedJwt = localStorage.getItem('google_jwt');
       if (storedJwt && storedJwt.length > 10) {
         const payload = JSON.parse(atob(storedJwt.split('.')[1]));
         const name = payload.name || payload['given_name'] || '';
         const email = payload.email || '';
         const picture = payload.picture || '';
         onGoogleUserLoggedIn({ name, email, picture });
       }
       // restore driveAccessToken if previously saved (note: tokens may expire)
       const storedDriveToken = localStorage.getItem('drive_access_token');
       if (storedDriveToken) {
         driveAccessToken = storedDriveToken;
       }

       // Restore and show last backup filename if available
       try {
         const lastName = localStorage.getItem('last_backup_name');
         if (lastName) {
           const el = document.getElementById('lastBackupName');
           if (el) el.textContent = lastName;
         }
       } catch(e){ /* ignore */ }
     } catch (err) {
       // ignore restore errors
       console.warn('No se pudo restaurar sesión Google desde localStorage:', err);
     }
   } catch (err) {
     console.error('Error inicializando Google Identity:', err);
   }
 });

 // Handle credential response from google.accounts.id (JWT)
 function handleCredentialResponse(response) {
   try {
     const jwt = response.credential;
     // Persist JWT so session can survive refresh
     try { localStorage.setItem('google_jwt', jwt); } catch(e){/* ignore */ }
     // Decode payload (JWT format: header.payload.signature)
     const payload = JSON.parse(atob(jwt.split('.')[1]));
     const name = payload.name || payload['given_name'] || '';
     const email = payload.email || '';
     const picture = payload.picture || '';
     const userData = { name, email, picture };
     onGoogleUserLoggedIn(userData);
   } catch (err) {
     console.error('Error procesando credential response:', err);
   }
 }

 // Called when user is authenticated via Google Sign-In button
 function onGoogleUserLoggedIn(userData) {
   console.log('Usuario Google autenticado:', userData);
   // Persist user data so session survives sleep/background
   try { localStorage.setItem('googleUser', JSON.stringify(userData)); } catch (e) { /* ignore */ }
   window.currentGoogleUser = userData;
   currentGoogleUser = userData;
   // Hide Google sign-in button and show info + "Cerrar sesión" button
   const btn = document.getElementById('googleSignInButton');
   const info = document.getElementById('googleUserInfo');
   const signOutBtn = document.getElementById('googleSignOutBtn');
   if (btn) btn.style.display = 'none';
   if (info) {
     info.style.display = 'block';
     info.textContent = `Sesión iniciada como ${userData.name} (${userData.email})`;
   }
   if (signOutBtn) {
     signOutBtn.style.display = 'inline-block';
     signOutBtn.textContent = 'Cerrar sesión';
     signOutBtn.onclick = () => {
       // Disable auto-select, clear local storage and tokens, reload to initial state
       try {
         if (google && google.accounts && google.accounts.id && google.accounts.id.disableAutoSelect) {
           google.accounts.id.disableAutoSelect();
         }
       } catch (err) { /* ignore */ }
       try { localStorage.removeItem('googleUser'); } catch(e){/*ignore*/}
       try { localStorage.removeItem('google_jwt'); } catch(e){/*ignore*/}
       try { localStorage.removeItem('drive_access_token'); } catch(e){/*ignore*/}
       driveAccessToken = null;
       currentGoogleUser = null;
       window.currentGoogleUser = null;
       // force reload to clear any UI state and re-render sign-in
       location.reload();
     };
   }

   // Request Drive access token (consent prompt first time)
   requestDriveToken(true).then(() => {
     // Token obtained; do NOT auto-load backups from Drive on page refresh or sign-in.
     console.log('Drive token obtenido; carga de respaldos desde Drive se realizará solo con el botón "Cargar".');
   }).catch(err => {
     console.warn('No se obtuvo token de Drive:', err);
   });
 }

// Request (or ensure) driveAccessToken; if promptConsent true use prompt:'consent'
// We expose a helper ensureValidToken() that attempts silent renewal and validates token.
function requestDriveToken(promptConsent = false) {
  return new Promise((resolve, reject) => {
    if (!driveTokenClient) {
      return reject(new Error('driveTokenClient no está inicializado'));
    }
    // If we already have a token, resolve immediately
    if (driveAccessToken) return resolve(driveAccessToken);

    try {
      // The token client uses callback style; wrap it to set driveAccessToken via callback
      driveTokenClient.requestAccessToken({
        prompt: promptConsent ? 'consent' : ''
      });
      // Poll until token is set by the token client callback
      const checkInterval = setInterval(() => {
        if (driveAccessToken) {
          clearInterval(checkInterval);
          resolve(driveAccessToken);
        }
      }, 200);

      setTimeout(() => {
        if (!driveAccessToken) {
          clearInterval(checkInterval);
          reject(new Error('Timeout esperando access token de Drive'));
        }
      }, 20000);
    } catch (err) {
      reject(err);
    }
  });
}

// Ensure we have a valid driveAccessToken, try silent renewal and test token; recursive on expiry
async function ensureValidToken() {
  // Try to obtain token silently if none
  if (!driveAccessToken) {
    return new Promise((resolve, reject) => {
      if (!driveTokenClient) return reject(new Error('driveTokenClient no está inicializado'));
      try {
        // requestAccessToken with empty prompt to attempt silent renewal
        driveTokenClient.requestAccessToken({ prompt: '' });
        const waitInterval = setInterval(() => {
          if (driveAccessToken) {
            clearInterval(waitInterval);
            try { localStorage.setItem('drive_access_token', driveAccessToken); } catch(e){/*ignore*/}
            console.log('Token renovado automáticamente');
            resolve();
          }
        }, 200);
        setTimeout(() => {
          if (!driveAccessToken) {
            clearInterval(waitInterval);
            reject(new Error('Timeout esperando token silencioso'));
          }
        }, 20000);
      } catch (err) {
        reject(err);
      }
    });
  }

  // If we have a token, test it with a light request
  try {
    const test = await fetch('https://www.googleapis.com/drive/v3/about?fields=user', {
      headers: { 'Authorization': 'Bearer ' + driveAccessToken }
    });
    if (test.status === 401) {
      console.log('Token expiró, renovando...');
      driveAccessToken = null;
      try { localStorage.removeItem('drive_access_token'); } catch(e){/*ignore*/}
      return ensureValidToken();
    }
    // token valid
    return;
  } catch (e) {
    // network or other error, attempt renewal
    driveAccessToken = null;
    try { localStorage.removeItem('drive_access_token'); } catch(e){/*ignore*/}
    return ensureValidToken();
  }
}

// Build the app state to backup (adaptable; currently includes main structures)
function getAppState() {
  // Return the key app state objects; adapt fields as your app evolves
  return {
    accounts,
    transactions,
    accountsOrder,
    transactionsOrder,
    salonSales,
    commissionRates,
    ivaRate,
    salesBoletas,
    figaroIndicators,
    hairdresserCommissions
  };
}

// Restore app state from loaded backup object (basic implementation)
function restoreAppState(state) {
  console.log('Restaurando estado desde respaldo:', state);
  // NOTE: apply incoming state to app variables (this is a simple application; adapt with validation)
  if (state.accounts) accounts = state.accounts;
  if (state.transactions) transactions = state.transactions;
  if (state.accountsOrder) accountsOrder = state.accountsOrder;
  if (state.transactionsOrder) transactionsOrder = state.transactionsOrder;
  if (state.salonSales) salonSales = state.salonSales;
  if (state.commissionRates) commissionRates = state.commissionRates;
  if (typeof state.ivaRate !== 'undefined') ivaRate = state.ivaRate;
  if (state.salesBoletas) salesBoletas = state.salesBoletas;
  if (state.figaroIndicators) figaroIndicators = state.figaroIndicators;
  if (state.hairdresserCommissions) hairdresserCommissions = state.hairdresserCommissions;

  // Refresh UI so it reflects restored data
  try {
    saveToLocalStorage();
    saveSalonToLocalStorage();
    updateAccountsList();
    updateAccountSelectors();
    updateTransactionsList();
    updateSalonSalesDisplay();
    updateHairdresserPanels();
    updateFigaroSemanasPanel();
    updateFigaroIndicatorsPanel();
    updateTotalBalance();
  } catch (err) {
    console.warn('Error actualizando UI después de restaurar estado:', err);
  }
}

 // Save backup to Drive inside fixed folder ID; filename format: YYYY-MM-DD_HH.MM-finanzas.json
async function saveBackupToDrive() {
  try {
    // Ensure logged in user
    if (!currentGoogleUser && !window.currentGoogleUser) {
      alert('Primero inicie sesión con Google para guardar el respaldo.');
      return;
    }

    // Ensure we have a valid Drive access token (renew silently if needed)
    try {
      await ensureValidToken();
    } catch (err) {
      // If ensureValidToken failed, prompt consent once to allow save
      console.warn('No se pudo renovar token silencioso, solicitando consentimiento...', err);
      await requestDriveToken(true);
    }

    if (!driveAccessToken) {
      alert('No se pudo obtener token de acceso para Google Drive.');
      return;
    }

    const appState = getAppState();

    // Build filename using local browser time
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const YYYY = now.getFullYear();
    const MM = pad(now.getMonth() + 1);
    const DD = pad(now.getDate());
    const hh = pad(now.getHours());
    const mm = pad(now.getMinutes());
    const fileName = `${YYYY}-${MM}-${DD}_${hh}.${mm}-finanzas.json`;

    const metadata = {
      name: fileName,
      mimeType: 'application/json',
      parents: ['1nyPnBXUbMRuSBUNd45K7EN9OLkxbaMNO']
    };

    const blob = new Blob([JSON.stringify(appState, null, 2)], { type: 'application/json' });

    const form = new FormData();
    const metaBlob = new Blob([JSON.stringify(metadata)], { type: 'application/json' });
    form.append('metadata', metaBlob);
    form.append('file', blob);

    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,parents,createdTime', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + driveAccessToken
      },
      body: form
    });

    if (!res.ok) {
      const text = await res.text();
      console.error('Error al subir backup a Drive:', res.status, text);
      alert('Error al guardar respaldo en Google Drive: ' + res.statusText);
      return;
    }

    const result = await res.json();
    console.log('Respaldo guardado en Drive:', result);

    // Immediately restore the just-saved state locally and update the "Último respaldo cargado" indicator
    try {
      // Restore application state from the appState we just uploaded
      restoreAppState(appState);

      // Persist and show the filename of the restored backup
      try {
        localStorage.setItem('last_backup_name', fileName);
        const el = document.getElementById('lastBackupName');
        if (el) el.textContent = fileName;
      } catch (e) {
        console.warn('No se pudo guardar/mostrar el nombre del respaldo:', e);
      }

      // Also persist that we used this backup (for consistency)
      saveToLocalStorage();
      saveSalonToLocalStorage();

      alert(`Respaldo guardado y cargado correctamente como "${result.name}"`);
    } catch (restoreErr) {
      console.error('Error restaurando respaldo localmente después de guardar:', restoreErr);
      alert(`Respaldo guardado en Drive como "${result.name}", pero ocurrió un error al cargarlo localmente.`);
    }
  } catch (err) {
    console.error('Excepción guardando respaldo en Drive:', err);
    alert('Ocurrió un error al guardar respaldo en Drive: ' + (err.message || err));
  }
}

// Load the latest backup (by createdTime desc) from the fixed folder and restore it
async function loadLatestBackupFromDrive() {
  try {
    if (!currentGoogleUser && !window.currentGoogleUser) {
      alert('Primero inicie sesión con Google para cargar respaldos.');
      return;
    }

    // Ensure valid token (silent renewal when possible)
    try {
      await ensureValidToken();
    } catch (err) {
      console.warn('No se pudo renovar token silencioso, solicitando consentimiento...', err);
      await requestDriveToken(true);
    }
    if (!driveAccessToken) {
      alert('No se pudo obtener token de acceso para Google Drive.');
      return;
    }

    // List files in the folder with mimeType application/json ordered by createdTime desc
    const q = encodeURIComponent(`'1nyPnBXUbMRuSBUNd45K7EN9OLkxbaMNO' in parents and mimeType='application/json'`);
    const fields = encodeURIComponent('files(id,name,createdTime)');
    const listUrl = `https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc&fields=${fields}`;

    const listRes = await fetch(listUrl, {
      method: 'GET',
      headers: { Authorization: 'Bearer ' + driveAccessToken }
    });

    if (!listRes.ok) {
      const t = await listRes.text();
      console.error('Error listando archivos en Drive:', listRes.status, t);
      alert('Error listando respaldos en Drive: ' + listRes.statusText);
      return;
    }

    const listJson = await listRes.json();
    const files = listJson.files || [];
    if (files.length === 0) {
      alert('No se encontraron archivos de respaldo en la carpeta RESPALDOS FINANZAS.');
      return;
    }

    const latest = files[0];
    const fileId = latest.id;

    const getUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
    const getRes = await fetch(getUrl, {
      method: 'GET',
      headers: { Authorization: 'Bearer ' + driveAccessToken }
    });

    if (!getRes.ok) {
      const t = await getRes.text();
      console.error('Error descargando respaldo:', getRes.status, t);
      alert('Error descargando respaldo desde Drive: ' + getRes.statusText);
      return;
    }

    const state = await getRes.json();
    restoreAppState(state);

    // Persist and show the filename of the loaded backup from Drive
    try {
      if (latest && latest.name) {
        localStorage.setItem('last_backup_name', latest.name);
        const el = document.getElementById('lastBackupName');
        if (el) el.textContent = latest.name;
      }
    } catch (e) { /* ignore */ }

    alert(`Respaldo "${latest.name}" cargado correctamente.`);
  } catch (err) {
    console.error('Excepción cargando respaldo de Drive:', err);
    alert('Ocurrió un error al cargar respaldo: ' + (err.message || err));
  }
}