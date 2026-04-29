// Telegram Web App initialization
const tg = window.Telegram.WebApp;
tg.expand();

// User data
let currentUser = null;
let userData = null;
let adsWatchedToday = 0;
let lastAdWatchTime = null;

// Smart Links
const SMARTLINK_1 = "https://omg10.com/4/8629588";
const SMARTLINK_2 = "https://omg10.com/4/8627792";

// Initialize app
async function initApp() {
    try {
        // Get Telegram user data
        const initData = tg.initDataUnsafe;
        if (initData && initData.user) {
            currentUser = initData.user;
            await loadUserData();
            updateUI();
            startTaskTimers();
        } else {
            showToast('Please open this app from Telegram');
        }
    } catch (error) {
        console.error('Initialization error:', error);
    }
}

// Load user data from Firebase
async function loadUserData() {
    try {
        const userRef = db.collection('users').doc(currentUser.id.toString());
        const doc = await userRef.get();
        
        if (doc.exists) {
            userData = doc.data();
        } else {
            // Create new user
            userData = {
                telegramId: currentUser.id,
                username: currentUser.username || '',
                firstName: currentUser.first_name || '',
                balance: 0,
                totalAdsWatched: 0,
                referralCount: 0,
                referralCode: generateReferralCode(),
                referredBy: null,
                tasksCompleted: {},
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            
            // Check for referral
            const urlParams = new URLSearchParams(window.location.search);
            const refCode = urlParams.get('ref');
            if (refCode) {
                await processReferral(refCode);
            }
            
            await userRef.set(userData);
        }
        
        // Load today's ad count
        await loadTodayAdCount();
    } catch (error) {
        console.error('Error loading user data:', error);
    }
}

// Generate referral code
function generateReferralCode() {
    return 'PAYFLEX' + Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Process referral
async function processReferral(refCode) {
    try {
        // Find referrer
        const usersRef = db.collection('users');
        const snapshot = await usersRef.where('referralCode', '==', refCode).limit(1).get();
        
        if (!snapshot.empty) {
            const referrerDoc = snapshot.docs[0];
            const referrerId = referrerDoc.id;
            
            // Prevent self-referral
            if (referrerId === currentUser.id.toString()) {
                console.log('Self-referral detected');
                return;
            }
            
            // Check if already referred
            const referralRef = db.collection('referrals').doc(`${referrerId}_${currentUser.id}`);
            const referralDoc = await referralRef.get();
            
            if (!referralDoc.exists) {
                // Create referral record
                await referralRef.set({
                    referrerId: referrerId,
                    referredId: currentUser.id.toString(),
                    reward: 0.5,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                
                // Update referrer's balance
                await db.collection('users').doc(referrerId).update({
                    balance: firebase.firestore.FieldValue.increment(0.5),
                    referralCount: firebase.firestore.FieldValue.increment(1)
                });
                
                // Update current user
                userData.referredBy = referrerId;
                await db.collection('users').doc(currentUser.id.toString()).update({
                    referredBy: referrerId
                });
            }
        }
    } catch (error) {
        console.error('Error processing referral:', error);
    }
}

// Load today's ad count
async function loadTodayAdCount() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const adsRef = db.collection('users').doc(currentUser.id.toString())
        .collection('adViews');
    
    const snapshot = await adsRef
        .where('timestamp', '>=', today)
        .get();
    
    adsWatchedToday = snapshot.size;
    
    // Get last ad watch time
    if (snapshot.size > 0) {
        const lastAd = snapshot.docs[snapshot.size - 1].data();
        lastAdWatchTime = lastAd.timestamp.toDate();
    }
}

// Update UI
function updateUI() {
    if (!userData) return;
    
    // Update balance
    document.getElementById('balance').textContent = `$${userData.balance.toFixed(2)}`;
    
    // Update stats
    document.getElementById('adsWatched').textContent = userData.totalAdsWatched || 0;
    document.getElementById('referralCount').textContent = userData.referralCount || 0;
    
    // Update progress bar
    const progress = Math.min((userData.balance / 5) * 100, 100);
    document.getElementById('withdrawalProgress').style.width = `${progress}%`;
    document.getElementById('progressText').textContent = 
        `$${userData.balance.toFixed(2)} / $5.00`;
    
    // Update ad watch button
    updateAdWatchButton();
}

// Update ad watch button
function updateAdWatchButton() {
    const btn = document.getElementById('watchAdBtn');
    const now = new Date();
    
    if (adsWatchedToday >= 10) {
        btn.disabled = true;
        btn.textContent = '📺 Daily Limit Reached';
        return;
    }
    
    if (lastAdWatchTime) {
        const hoursSinceLastAd = (now - lastAdWatchTime) / (1000 * 60 * 60);
        if (hoursSinceLastAd < 3) {
            btn.disabled = true;
            const remainingTime = Math.ceil(3 - hoursSinceLastAd);
            btn.textContent = `⏰ Wait ${remainingTime}h`;
            return;
        }
    }
    
    btn.disabled = false;
    btn.textContent = '📺 Watch Ad ($0.05)';
}

// Watch ad function
async function watchAd() {
    try {
        // Anti-spam check
        if (adsWatchedToday >= 10) {
            showToast('Daily ad limit reached!');
            return;
        }
        
        const now = new Date();
        if (lastAdWatchTime) {
            const hoursSinceLastAd = (now - lastAdWatchTime) / (1000 * 60 * 60);
            if (hoursSinceLastAd < 3) {
                showToast(`Please wait ${Math.ceil(3 - hoursSinceLastAd)} hours`);
                return;
            }
        }
        
        // Disable button temporarily to prevent quick clicking
        const btn = document.getElementById('watchAdBtn');
        btn.disabled = true;
        
        // Open smartlink
        window.open(SMARTLINK_2, '_blank');
        
        // Record ad view
        const adViewRef = db.collection('users').doc(currentUser.id.toString())
            .collection('adViews').doc();
        
        await adViewRef.set({
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            reward: 0.05
        });
        
        // Update user balance
        await db.collection('users').doc(currentUser.id.toString()).update({
            balance: firebase.firestore.FieldValue.increment(0.05),
            totalAdsWatched: firebase.firestore.FieldValue.increment(1)
        });
        
        // Update local data
        userData.balance += 0.05;
        userData.totalAdsWatched += 1;
        adsWatchedToday += 1;
        lastAdWatchTime = now;
        
        updateUI();
        showToast('+$0.05 earned!');
        
        // Re-enable button after delay
        setTimeout(() => {
            btn.disabled = false;
            updateAdWatchButton();
        }, 5000);
        
    } catch (error) {
        console.error('Error watching ad:', error);
        showToast('Error processing reward');
        document.getElementById('watchAdBtn').disabled = false;
    }
}

// Complete task function
async function completeTask(taskId, taskName) {
    try {
        // Check if task is already completed today
        const today = new Date().toDateString();
        const taskKey = `${taskId}_${today}`;
        
        if (userData.tasksCompleted && userData.tasksCompleted[taskKey]) {
            showToast('Task already completed today!');
            return;
        }
        
        // Open appropriate link
        if (taskId <= 13) {
            window.open(SMARTLINK_1, '_blank');
        } else if (taskId === 14) {
            window.open('https://t.me/+TCJNKW2sFFc2YWY0', '_blank');
        } else if (taskId === 15) {
            window.open('https://www.youtube.com/@hummingbirdtvke2255', '_blank');
        }
        
        // Record task completion
        if (!userData.tasksCompleted) {
            userData.tasksCompleted = {};
        }
        userData.tasksCompleted[taskKey] = true;
        
        // Update Firebase
        await db.collection('users').doc(currentUser.id.toString()).update({
            balance: firebase.firestore.FieldValue.increment(0.10),
            tasksCompleted: userData.tasksCompleted
        });
        
        // Update local data
        userData.balance += 0.10;
        updateUI();
        showToast('+$0.10 earned!');
        
        // Start timer for this task
        startTaskTimer(taskId);
        
    } catch (error) {
        console.error('Error completing task:', error);
        showToast('Error completing task');
    }
}

// Start task timers
function startTaskTimers() {
    for (let i = 1; i <= 15; i++) {
        startTaskTimer(i);
    }
}

function startTaskTimer(taskId) {
    const today = new Date().toDateString();
    const taskKey = `${taskId}_${today}`;
    
    if (userData.tasksCompleted && userData.tasksCompleted[taskKey]) {
        const btn = document.getElementById(`task-btn-${taskId}`);
        if (btn) {
            btn.disabled = true;
            updateTaskTimer(taskId);
        }
    }
}

function updateTaskTimer(taskId) {
    const btn = document.getElementById(`task-btn-${taskId}`);
    const timerSpan = document.getElementById(`timer-${taskId}`);
    
    if (!btn || !timerSpan) return;
    
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    
    const timeLeft = tomorrow - now;
    const hours = Math.floor(timeLeft / (1000 * 60 * 60));
    const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);
    
    timerSpan.textContent = `${hours}h ${minutes}m ${seconds}s`;
    btn.textContent = 'Completed';
    
    if (timeLeft <= 0) {
        btn.disabled = false;
        btn.textContent = 'Start';
        timerSpan.textContent = '';
    } else {
        setTimeout(() => updateTaskTimer(taskId), 1000);
    }
}

// Generate task list
function generateTasks() {
    const tasksList = document.getElementById('tasksList');
    const tasks = [
        'Visit Website A', 'Complete Survey B', 'Download App C',
        'Sign Up on Platform D', 'Watch Video E', 'Read Article F',
        'Test App G', 'Review Product H', 'Share Post I',
        'Like Page J', 'Follow Account K', 'Comment on Post L',
        'Subscribe to Newsletter M', 'Join Telegram Channel', 'Subscribe to YouTube'
    ];
    
    tasksList.innerHTML = '';
    
    tasks.forEach((task, index) => {
        const taskId = index + 1;
        const taskItem = document.createElement('div');
        taskItem.className = 'task-item';
        taskItem.innerHTML = `
            <div class="task-info">
                <span class="task-name">${task}</span>
                <span class="task-reward">+$0.10</span>
                <span class="task-timer" id="timer-${taskId}"></span>
            </div>
            <button class="task-btn" id="task-btn-${taskId}" onclick="completeTask(${taskId}, '${task}')">
                Start
            </button>
        `;
        tasksList.appendChild(taskItem);
    });
}

// Show/hide tabs
function showTab(tab) {
    const navBtns = document.querySelectorAll('.nav-btn');
    navBtns.forEach(btn => btn.classList.remove('active'));
    
    if (tab === 'tasks') {
        document.querySelector('.tasks-section').style.display = 'block';
        document.querySelector('.nav-btn:nth-child(1)').classList.add('active');
    } else if (tab === 'invite') {
        document.getElementById('inviteModal').style.display = 'flex';
        updateInviteModal();
    } else if (tab === 'more') {
        document.getElementById('moreModal').style.display = 'flex';
    }
}

// Update invite modal
function updateInviteModal() {
    const referralLink = `https://t.me/PayFlex01Bot?start=${userData.referralCode}`;
    document.getElementById('referralLink').value = referralLink;
    document.getElementById('referralCountModal').textContent = userData.referralCount || 0;
}

// Copy referral link
function copyReferralLink() {
    const linkInput = document.getElementById('referralLink');
    linkInput.select();
    document.execCommand('copy');
    showToast('Referral link copied!');
}

// Withdrawal request
async function requestWithdrawal(event) {
    event.preventDefault();
    
    if (userData.balance < 5) {
        showToast('Minimum withdrawal is $5.00');
        return;
    }
    
    const method = document.getElementById('withdrawalMethod').value;
    const accountDetails = document.getElementById('accountDetails').value;
    const amount = parseFloat(document.getElementById('amount').value);
    
    if (!method || !accountDetails || !amount) {
        showToast('Please fill all fields');
        return;
    }
    
    if (amount < 5 || amount > userData.balance) {
        showToast('Invalid amount');
        return;
    }
    
    try {
        // Create withdrawal request
        await db.collection('withdrawals').add({
            userId: currentUser.id.toString(),
            username: currentUser.username || currentUser.first_name,
            method: method,
            accountDetails: accountDetails,
            amount: amount,
            status: 'pending',
            requestedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Deduct from balance
        await db.collection('users').doc(currentUser.id.toString()).update({
            balance: firebase.firestore.FieldValue.increment(-amount)
        });
        
        userData.balance -= amount;
        updateUI();
        closeModal('withdrawalModal');
        showToast('Withdrawal request submitted!');
        
    } catch (error) {
        console.error('Withdrawal error:', error);
        showToast('Error submitting request');
    }
}

// Close modal
function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

// Show toast
function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.remove();
    }, 3000);
}

// Event Listeners
document.getElementById('watchAdBtn').addEventListener('click', watchAd);
document.getElementById('withdrawBtn').addEventListener('click', () => {
    document.getElementById('withdrawalModal').style.display = 'flex';
});
document.getElementById('withdrawalForm').addEventListener('submit', requestWithdrawal);

// Initialize
window.onload = () => {
    initApp();
    generateTasks();
};