// Admin Configuration
const ADMIN_PASSWORD = "Kamburu@5318"; // CHANGE THIS to your own password
const ADMIN_SESSION_KEY = "payflex_admin_session";

// State
let currentTab = 'pending';
let allWithdrawals = [];
let filteredWithdrawals = [];
let selectedWithdrawal = null;

// Check if already logged in
function checkSession() {
    const session = sessionStorage.getItem(ADMIN_SESSION_KEY);
    if (session === 'true') {
        showDashboard();
        loadDashboardData();
    }
}

// Admin Login
function adminLogin() {
    const password = document.getElementById('adminPassword').value;
    
    if (password === ADMIN_PASSWORD) {
        sessionStorage.setItem(ADMIN_SESSION_KEY, 'true');
        showDashboard();
        loadDashboardData();
    } else {
        const errorDiv = document.getElementById('loginError');
        errorDiv.textContent = '❌ Invalid password!';
        errorDiv.style.display = 'block';
        setTimeout(() => {
            errorDiv.style.display = 'none';
        }, 3000);
    }
}

// Admin Logout
function adminLogout() {
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
    document.getElementById('loginScreen').style.display = 'block';
    document.getElementById('adminDashboard').style.display = 'none';
    document.getElementById('adminPassword').value = '';
}

// Show Dashboard
function showDashboard() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('adminDashboard').style.display = 'block';
}

// Load Dashboard Data
async function loadDashboardData() {
    try {
        await Promise.all([
            loadSummaryStats(),
            loadWithdrawals()
        ]);
    } catch (error) {
        console.error('Error loading dashboard:', error);
        showToast('Error loading data. Check console for details.');
    }
}

// Load Summary Statistics
async function loadSummaryStats() {
    try {
        // Get total users
        const usersSnapshot = await db.collection('users').get();
        document.getElementById('totalUsers').textContent = usersSnapshot.size;

        // Get paid withdrawals total
        const paidSnapshot = await db.collection('withdrawals')
            .where('status', '==', 'paid')
            .get();
        
        let totalPaid = 0;
        paidSnapshot.forEach(doc => {
            totalPaid += doc.data().amount || 0;
        });
        document.getElementById('totalPaidOut').textContent = `$${totalPaid.toFixed(2)}`;

        // Get pending stats
        const pendingSnapshot = await db.collection('withdrawals')
            .where('status', '==', 'pending')
            .get();
        
        document.getElementById('totalPending').textContent = pendingSnapshot.size;
        
        let pendingTotal = 0;
        pendingSnapshot.forEach(doc => {
            pendingTotal += doc.data().amount || 0;
        });
        document.getElementById('pendingAmount').textContent = `$${pendingTotal.toFixed(2)}`;

        // Today's requests
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const todaySnapshot = await db.collection('withdrawals')
            .where('requestedAt', '>=', today)
            .get();
        
        document.getElementById('todayRequests').textContent = todaySnapshot.size;

    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

// Load Withdrawals
async function loadWithdrawals() {
    try {
        let query = db.collection('withdrawals').orderBy('requestedAt', 'desc');
        
        if (currentTab !== 'all') {
            query = query.where('status', '==', currentTab);
        }
        
        const snapshot = await query.get();
        
        allWithdrawals = [];
        snapshot.forEach(doc => {
            allWithdrawals.push({
                id: doc.id,
                ...doc.data(),
                requestedAt: doc.data().requestedAt ? doc.data().requestedAt.toDate() : null
            });
        });
        
        filteredWithdrawals = [...allWithdrawals];
        renderWithdrawalsTable();
        
    } catch (error) {
        console.error('Error loading withdrawals:', error);
        document.getElementById('withdrawalsTable').innerHTML = 
            '<div class="loading">Error loading withdrawals. Please try again.</div>';
    }
}

// Render Withdrawals Table
function renderWithdrawalsTable() {
    const tableDiv = document.getElementById('withdrawalsTable');
    
    if (filteredWithdrawals.length === 0) {
        tableDiv.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #666;">
                <p style="font-size: 48px; margin-bottom: 10px;">📭</p>
                <p>No withdrawal requests found</p>
            </div>
        `;
        return;
    }
    
    let html = `
        <table>
            <thead>
                <tr>
                    <th>Date</th>
                    <th>User</th>
                    <th>Method</th>
                    <th>Account</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    filteredWithdrawals.forEach(withdrawal => {
        const date = withdrawal.requestedAt 
            ? withdrawal.requestedAt.toLocaleString() 
            : 'N/A';
        
        const statusClass = `status-${withdrawal.status}`;
        const statusText = withdrawal.status.charAt(0).toUpperCase() + withdrawal.status.slice(1);
        
        html += `
            <tr>
                <td>${date}</td>
                <td>
                    <strong>${withdrawal.firstName || withdrawal.username || 'Unknown'}</strong>
                    ${withdrawal.username ? `<br><small>@${withdrawal.username}</small>` : ''}
                </td>
                <td>${withdrawal.method.toUpperCase()}</td>
                <td>${withdrawal.accountDetails}</td>
                <td><strong>$${withdrawal.amount.toFixed(2)}</strong></td>
                <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                <td>${getActionButtons(withdrawal)}</td>
            </tr>
        `;
    });
    
    html += '</tbody></table>';
    tableDiv.innerHTML = html;
}

// Get Action Buttons based on status
function getActionButtons(withdrawal) {
    let buttons = '';
    
    switch(withdrawal.status) {
        case 'pending':
            buttons = `
                <button class="action-btn btn-process" onclick="processWithdrawal('${withdrawal.id}')">
                    🔄 Process
                </button>
                <button class="action-btn btn-approve" onclick="markAsPaid('${withdrawal.id}')">
                    ✅ Mark Paid
                </button>
                <button class="action-btn btn-reject" onclick="rejectWithdrawal('${withdrawal.id}')">
                    ❌ Reject
                </button>
            `;
            break;
            
        case 'processing':
            buttons = `
                <button class="action-btn btn-approve" onclick="markAsPaid('${withdrawal.id}')">
                    ✅ Mark Paid
                </button>
                <button class="action-btn btn-reject" onclick="rejectWithdrawal('${withdrawal.id}')">
                    ❌ Reject
                </button>
            `;
            break;
            
        case 'paid':
            buttons = `
                <span style="color: #28a745;">✅ Completed</span>
                ${withdrawal.adminNotes ? `<br><small>Notes: ${withdrawal.adminNotes}</small>` : ''}
            `;
            break;
            
        case 'rejected':
            buttons = `
                <span style="color: #dc3545;">❌ Rejected</span>
                ${withdrawal.adminNotes ? `<br><small>Reason: ${withdrawal.adminNotes}</small>` : ''}
            `;
            break;
    }
    
    return buttons;
}

// Process Withdrawal
function processWithdrawal(withdrawalId) {
    const withdrawal = allWithdrawals.find(w => w.id === withdrawalId);
    if (!withdrawal) return;
    
    if (confirm(`Start processing withdrawal for ${withdrawal.username || withdrawal.firstName}?\n\nAmount: $${withdrawal.amount.toFixed(2)}\nMethod: ${withdrawal.method}\nAccount: ${withdrawal.accountDetails}`)) {
        db.collection('withdrawals').doc(withdrawalId).update({
            status: 'processing',
            processedAt: firebase.firestore.FieldValue.serverTimestamp()
        }).then(() => {
            showToast('✅ Withdrawal marked as processing');
            loadDashboardData();
        }).catch(error => {
            console.error('Error:', error);
            showToast('❌ Error updating withdrawal');
        });
    }
}

// Mark as Paid
function markAsPaid(withdrawalId) {
    const withdrawal = allWithdrawals.find(w => w.id === withdrawalId);
    if (!withdrawal) return;
    
    if (confirm(`Confirm payment for ${withdrawal.username || withdrawal.firstName}?\n\nAmount: $${withdrawal.amount.toFixed(2)}\nMethod: ${withdrawal.method}\nAccount: ${withdrawal.accountDetails}\n\nThis action cannot be undone.`)) {
        const notes = prompt('Add payment confirmation notes (optional):', 'Payment sent successfully');
        
        db.collection('withdrawals').doc(withdrawalId).update({
            status: 'paid',
            paidAt: firebase.firestore.FieldValue.serverTimestamp(),
            adminNotes: notes || 'Payment completed'
        }).then(() => {
            showToast('✅ Payment marked as completed');
            loadDashboardData();
        }).catch(error => {
            console.error('Error:', error);
            showToast('❌ Error updating payment status');
        });
    }
}

// Reject Withdrawal
function rejectWithdrawal(withdrawalId) {
    const withdrawal = allWithdrawals.find(w => w.id === withdrawalId);
    if (!withdrawal) return;
    
    const reason = prompt('Enter rejection reason:', 'Invalid account details');
    
    if (reason) {
        if (confirm(`Reject withdrawal and refund $${withdrawal.amount.toFixed(2)} to user?\n\nReason: ${reason}`)) {
            // Update withdrawal status
            db.collection('withdrawals').doc(withdrawalId).update({
                status: 'rejected',
                rejectedAt: firebase.firestore.FieldValue.serverTimestamp(),
                adminNotes: reason
            }).then(async () => {
                // Refund the amount to user
                await db.collection('users').doc(withdrawal.userId).update({
                    balance: firebase.firestore.FieldValue.increment(withdrawal.amount)
                });
                
                showToast('✅ Withdrawal rejected and amount refunded');
                loadDashboardData();
            }).catch(error => {
                console.error('Error:', error);
                showToast('❌ Error rejecting withdrawal');
            });
        }
    }
}

// Switch Tab
function switchTab(tab) {
    currentTab = tab;
    
    // Update active tab button
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.textContent.toLowerCase().includes(tab)) {
            btn.classList.add('active');
        }
    });
    
    loadWithdrawals();
}

// Filter Withdrawals
function filterWithdrawals() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const methodFilter = document.getElementById('methodFilter').value;
    
    filteredWithdrawals = allWithdrawals.filter(withdrawal => {
        const matchesSearch = !searchTerm || 
            (withdrawal.username && withdrawal.username.toLowerCase().includes(searchTerm)) ||
            (withdrawal.firstName && withdrawal.firstName.toLowerCase().includes(searchTerm)) ||
            (withdrawal.accountDetails && withdrawal.accountDetails.toLowerCase().includes(searchTerm)) ||
            (withdrawal.method && withdrawal.method.toLowerCase().includes(searchTerm));
        
        const matchesMethod = methodFilter === 'all' || withdrawal.method === methodFilter;
        
        return matchesSearch && matchesMethod;
    });
    
    renderWithdrawalsTable();
}

// Export to CSV
function exportToCSV() {
    if (filteredWithdrawals.length === 0) {
        showToast('No data to export');
        return;
    }
    
    let csv = 'Date,User,Username,Method,Account,Amount,Status,Admin Notes\n';
    
    filteredWithdrawals.forEach(w => {
        const date = w.requestedAt ? w.requestedAt.toISOString() : '';
        csv += `"${date}","${w.firstName || ''}","${w.username || ''}","${w.method}","${w.accountDetails}","${w.amount}","${w.status}","${w.adminNotes || ''}"\n`;
    });
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payflex-withdrawals-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    
    showToast('✅ CSV exported successfully');
}

// Close Modal
function closeModal() {
    document.getElementById('actionModal').style.display = 'none';
}

// Show Toast
function showToast(message) {
    const existingToast = document.querySelector('.toast');
    if (existingToast) existingToast.remove();
    
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        if (toast.parentNode) toast.remove();
    }, 3000);
}

// Initialize
window.onload = function() {
    checkSession();
};

// Close modals on outside click
window.onclick = function(event) {
    if (event.target.classList.contains('modal')) {
        closeModal();
    }
};