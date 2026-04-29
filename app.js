// Telegram Web App initialization
const tg = window.Telegram.WebApp;
tg.expand();

// User data
let currentUser = null;
let userData = null;
let adsWatchedInWindow = 0;
let adWatchWindowStart = null;
let lastAdWatchTime = null;

// Smart Links
const SMARTLINK_1 = "https://omg10.com/4/8629588";
const SMARTLINK_2 = "https://omg10.com/4/8627792";

// Ad watching limits
const MAX_ADS_PER_WINDOW = 10;
const AD_WINDOW_HOURS = 3;

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
            startAdWindowTimer();
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
        
        // Load ad tracking data
        await loadAdTrackingData();
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
                console.log('Self-referral detected and blocked');
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
                
                showToast('Welcome! You were referred successfully.');
            }
        }
    } catch (error) {
        console.error('Error processing referral:', error);
    }
}

// Load ad tracking data
async function loadAdTrackingData() {
    try {
        const now = firebase.firestore.Timestamp.now();
        const windowStart = new Date(now.toDate().getTime() - (AD_WINDOW_HOURS * 60 * 60 * 1000));
        
        const adsRef = db.collection('users').doc(currentUser.id.toString())
            .collection('adViews');
        
        // Get ads in current window
        const snapshot = await adsRef
            .where('timestamp', '>=', firebase.firestore.Timestamp.fromDate(windowStart))
            .orderBy('timestamp', 'desc')
            .get();
        
        if (!snapshot.empty) {
            const ads = snapshot.docs;
            adsWatchedInWindow = ads.length;
            
            // Get the earliest ad in the window to calculate window start
            const earliestAd = ads[ads.length - 1].data();
            adWatchWindowStart = earliestAd.timestamp.toDate();
            
            // Get the latest ad for cooldown
            lastAdWatchTime = ads[0].data().timestamp.toDate();
        }
        
        console.log(`Ads watched in current window: ${adsWatchedInWindow}`);
    } catch (error) {
        console.error('Error loading ad tracking:', error);
    }
}

// Start ad window timer
function startAdWindowTimer() {
    updateAdWindowStatus();
    // Check every minute
    setInterval(updateAdWindowStatus, 60000);
}

// Update ad window status
function updateAdWindowStatus() {
    if (!adWatchWindowStart) return;
    
    const now = new Date();
    const windowEnd = new Date(adWatchWindowStart.getTime() + (AD_WINDOW_HOURS * 60 * 60 * 1000));
    
    if (now >= windowEnd) {
        // Window has expired, reset
        adsWatchedInWindow = 0;
        adWatchWindowStart = null;
        console.log('Ad window reset');
    }
    
    updateAdWatchButton();
}

// Update ad watch button
function updateAdWatchButton() {
    const btn = document.getElementById('watchAdBtn');
    const now = new Date();
    
    // Check if we're in a window and it's active
    if (adWatchWindowStart && adsWatchedInWindow >= MAX_ADS_PER_WINDOW) {
        const windowEnd = new Date(adWatchWindowStart.getTime() + (AD_WINDOW_HOURS * 60 * 60 * 1000));
        
        if (now < windowEnd) {
            // Window is still active but limit reached
            btn.disabled = true;
            const remainingMs = windowEnd - now;
            const remainingHours = Math.floor(remainingMs / (1000 * 60 * 60));
            const remainingMinutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
            btn.innerHTML = `<span class="btn-icon">⏰</span> Reset in ${remainingHours}h ${remainingMinutes}m`;
            return;
        } else {
            // Window expired, reset counters
            adsWatchedInWindow = 0;
            adWatchWindowStart = null;
        }
    }
    
    if (adsWatchedInWindow >= MAX_ADS_PER_WINDOW) {
        btn.disabled = true;
        btn.innerHTML = '<span class="btn-icon">📺</span> Daily Limit Reached';
        return;
    }
    
    btn.disabled = false;
    
    // Show remaining ads in current window
    if (adWatchWindowStart) {
        const remaining = MAX_ADS_PER_WINDOW - adsWatchedInWindow;
        btn.innerHTML = `<span class="btn-icon">📺</span> Watch Ad ($0.05) - ${remaining} left`;
    } else {
        btn.innerHTML = '<span class="btn-icon">📺</span> Watch Ad ($0.05)';
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

// Watch ad function
async function watchAd() {
    try {
        // Check if button is disabled
        const btn = document.getElementById('watchAdBtn');
        if (btn.disabled) {
            return;
        }
        
        const now = new Date();
        
        // Check if we need to start a new window
        if (!adWatchWindowStart) {
            adWatchWindowStart = now;
            adsWatchedInWindow = 0;
        } else {
            // Check if current window has expired
            const windowEnd = new Date(adWatchWindowStart.getTime() + (AD_WINDOW_HOURS * 60 * 60 * 1000));
            if (now >= windowEnd) {
                // Start new window
                adWatchWindowStart = now;
                adsWatchedInWindow = 0;
            }
        }
        
        // Check limit
        if (adsWatchedInWindow >= MAX_ADS_PER_WINDOW) {
            showToast(`You can watch ${MAX_ADS_PER_WINDOW} ads every ${AD_WINDOW_HOURS} hours`);
            return;
        }
        
        // Disable button immediately to prevent quick clicking
        btn.disabled = true;
        btn.innerHTML = '<span class="btn-icon">⏳</span> Processing...';
        
        // Record ad view in Firebase
        const adViewRef = db.collection('users').doc(currentUser.id.toString())
            .collection('adViews').doc();
        
        const adData = {
            timestamp: firebase.firestore.Timestamp.now(),
            reward: 0.05,
            windowStart: firebase.firestore.Timestamp.fromDate(adWatchWindowStart)
        };
        
        await adViewRef.set(adData);
        
        // Update user balance
        await db.collection('users').doc(currentUser.id.toString()).update({
            balance: firebase.firestore.FieldValue.increment(0.05),
            totalAdsWatched: firebase.firestore.FieldValue.increment(1)
        });
        
        // Open smartlink after recording
        window.open(SMARTLINK_2, '_blank');
        
        // Update local data
        userData.balance += 0.05;
        userData.totalAdsWatched += 1;
        adsWatchedInWindow += 1;
        lastAdWatchTime = now;
        
        updateUI();
        
        const remaining = MAX_ADS_PER_WINDOW - adsWatchedInWindow;
        showToast(`+$0.05 earned! (${remaining} ads remaining)`);
        
        // Re-enable button after short delay with updated status
        setTimeout(() => {
            btn.disabled = false;
            updateAdWatchButton();
        }, 3000);
        
    } catch (error) {
        console.error('Error watching ad:', error);
        showToast('Error processing reward. Please try again.');
        const btn = document.getElementById('watchAdBtn');
        btn.disabled = false;
        updateAdWatchButton();
    }
}

// Complete task function
async function completeTask(taskId, taskName) {
    try {
        const btn = document.getElementById(`task-btn-${taskId}`);
        if (btn.disabled) {
            showToast('Task already completed today!');
            return;
        }
        
        // Check if task is already completed today
        const today = new Date().toDateString();
        const taskKey = `${taskId}_${today}`;
        
        if (userData.tasksCompleted && userData.tasksCompleted[taskKey]) {
            showToast('Task already completed today!');
            return;
        }
        
        // Disable button immediately
        btn.disabled = true;
        btn.textContent = 'Processing...';
        
        // Open appropriate link
        let linkOpened = false;
        if (taskId <= 13) {
            window.open(SMARTLINK_1, '_blank');
            linkOpened = true;
        } else if (taskId === 14) {
            window.open('https://t.me/+TCJNKW2sFFc2YWY0', '_blank');
            linkOpened = true;
        } else if (taskId === 15) {
            window.open('https://www.youtube.com/@hummingbirdtvke2255', '_blank');
            linkOpened = true;
        }
        
        if (!linkOpened) {
            showToast('Error opening task link');
            btn.disabled = false;
            btn.textContent = 'Start';
            return;
        }
        
        // Record task completion
        if (!userData.tasksCompleted) {
            userData.tasksCompleted = {};
        }
        userData.tasksCompleted[taskKey] = {
            completedAt: new Date().toISOString(),
            taskName: taskName
        };
        
        // Update Firebase
        await db.collection('users').doc(currentUser.id.toString()).update({
            balance: firebase.firestore.FieldValue.increment(0.10),
            tasksCompleted: userData.tasksCompleted
        });
        
        // Update local data
        userData.balance += 0.10;
        updateUI();
        showToast(`+$0.10 earned! Task completed.`);
        
        // Start 24-hour timer
        startTaskTimer(taskId, taskKey);
        
    } catch (error) {
        console.error('Error completing task:', error);
        showToast('Error completing task');
        const btn = document.getElementById(`task-btn-${taskId}`);
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Start';
        }
    }
}

// Start task timers
function startTaskTimers() {
    const today = new Date().toDateString();
    
    for (let i = 1; i <= 15; i++) {
        const taskKey = `${i}_${today}`;
        
        if (userData.tasksCompleted && userData.tasksCompleted[taskKey]) {
            startTaskTimer(i, taskKey);
        } else {
            // Check if task was completed in previous days
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayKey = `${i}_${yesterday.toDateString()}`;
            
            if (userData.tasksCompleted && userData.tasksCompleted[yesterdayKey]) {
                const completedTime = new Date(userData.tasksCompleted[yesterdayKey].completedAt);
                const resetTime = new Date(completedTime.getTime() + (24 * 60 * 60 * 1000));
                
                if (new Date() < resetTime) {
                    // Still in cooldown
                    startTaskTimer(i, taskKey, completedTime);
                }
            }
        }
    }
}

function startTaskTimer(taskId, taskKey, completedTime = null) {
    const btn = document.getElementById(`task-btn-${taskId}`);
    const timerSpan = document.getElementById(`timer-${taskId}`);
    
    if (!btn || !timerSpan) return;
    
    btn.disabled = true;
    
    // Get completion time
    let completionTimestamp;
    
    if (completedTime) {
        completionTimestamp = completedTime;
    } else if (userData.tasksCompleted && userData.tasksCompleted[taskKey]) {
        completionTimestamp = new Date(userData.tasksCompleted[taskKey].completedAt);
    } else {
        completionTimestamp = new Date();
    }
    
    updateTaskTimerDisplay(taskId, completionTimestamp);
}

function updateTaskTimerDisplay(taskId, completionTimestamp) {
    const btn = document.getElementById(`task-btn-${taskId}`);
    const timerSpan = document.getElementById(`timer-${taskId}`);
    
    if (!btn || !timerSpan) return;
    
    const now = new Date();
    const resetTime = new Date(completionTimestamp.getTime() + (24 * 60 * 60 * 1000));
    const timeLeft = resetTime - now;
    
    if (timeLeft <= 0) {
        // Timer expired
        btn.disabled = false;
        btn.textContent = 'Start';
        timerSpan.textContent = '';
        
        // Clean up old task data
        const today = new Date().toDateString();
        const taskKey = `${taskId}_${today}`;
        delete userData.tasksCompleted[taskKey];
        return;
    }
    
    // Display countdown
    const hours = Math.floor(timeLeft / (1000 * 60 * 60));
    const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);
    
    btn.textContent = 'Completed';
    timerSpan.textContent = `⏰ ${hours}h ${minutes}m ${seconds}s`;
    timerSpan.style.color = '#ff9800';
    
    // Update every second
    setTimeout(() => updateTaskTimerDisplay(taskId, completionTimestamp), 1000);
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
        document.getElementById('inviteModal').style.display = 'none';
        document.getElementById('moreModal').style.display = 'none';
        document.querySelector('.nav-btn:nth-child(1)').classList.add('active');
    } else if (tab === 'invite') {
        document.getElementById('inviteModal').style.display = 'flex';
        document.getElementById('moreModal').style.display = 'none';
        document.querySelector('.nav-btn:nth-child(2)').classList.add('active');
        updateInviteModal();
    } else if (tab === 'more') {
        document.getElementById('moreModal').style.display = 'flex';
        document.getElementById('inviteModal').style.display = 'none';
        document.querySelector('.nav-btn:nth-child(3)').classList.add('active');
    }
}

// Update invite modal
function updateInviteModal() {
    if (!userData || !userData.referralCode) return;
    
    const referralLink = `https://t.me/PayFlex01Bot/PayFlex?startapp=${userData.referralCode}`;
    document.getElementById('referralLink').value = referralLink;
    document.getElementById('referralCountModal').textContent = userData.referralCount || 0;
}

// Copy referral link - FIXED
function copyReferralLink() {
    const linkInput = document.getElementById('referralLink');
    
    // Modern clipboard API
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(linkInput.value)
            .then(() => {
                showToast('✅ Referral link copied!');
            })
            .catch(err => {
                console.error('Clipboard error:', err);
                // Fallback method
                fallbackCopyText(linkInput.value);
            });
    } else {
        // Fallback for older browsers or Telegram webview
        fallbackCopyText(linkInput.value);
    }
}

// Fallback copy method
function fallbackCopyText(text) {
    const linkInput = document.getElementById('referralLink');
    
    // Select the text
    linkInput.select();
    linkInput.setSelectionRange(0, 99999); // For mobile devices
    
    try {
        // Try execCommand
        const successful = document.execCommand('copy');
        if (successful) {
            showToast('✅ Referral link copied!');
        } else {
            showToast('❌ Failed to copy. Link: ' + text);
        }
    } catch (err) {
        console.error('Fallback copy error:', err);
        // Show the link in a prompt as last resort
        showToast('📋 Manual copy: ' + text);
    }
}

// Withdrawal request
async function requestWithdrawal(event) {
    event.preventDefault();
    
    if (userData.balance < 5) {
        showToast('⚠️ Minimum withdrawal is $5.00');
        return;
    }
    
    const method = document.getElementById('withdrawalMethod').value;
    const accountDetails = document.getElementById('accountDetails').value;
    const amount = parseFloat(document.getElementById('amount').value);
    
    if (!method || !accountDetails || !amount) {
        showToast('⚠️ Please fill all fields');
        return;
    }
    
    if (amount < 5 || amount > userData.balance) {
        showToast('⚠️ Amount must be between $5.00 and your balance');
        return;
    }
    
    // Confirm withdrawal
    if (!confirm(`Confirm withdrawal of $${amount.toFixed(2)} via ${method}?`)) {
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
        
        // Clear form
        document.getElementById('withdrawalForm').reset();
        
        showToast('✅ Withdrawal of $' + amount.toFixed(2) + ' requested! Processing may take 24-48 hours.');
        
    } catch (error) {
        console.error('Withdrawal error:', error);
        showToast('❌ Error submitting request. Please try again.');
    }
}

// Close modal
function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

// Show toast
function showToast(message) {
    // Remove existing toasts
    const existingToast = document.querySelector('.toast');
    if (existingToast) {
        existingToast.remove();
    }
    
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    
    // Remove after 3 seconds
    setTimeout(() => {
        if (toast.parentNode) {
            toast.remove();
        }
    }, 3000);
}

// Event Listeners
document.getElementById('watchAdBtn').addEventListener('click', watchAd);
document.getElementById('withdrawBtn').addEventListener('click', () => {
    if (userData.balance < 5) {
        showToast('⚠️ You need $5.00 minimum to withdraw');
    } else {
        document.getElementById('withdrawalModal').style.display = 'flex';
        document.getElementById('amount').setAttribute('max', userData.balance);
        document.getElementById('amount').setAttribute('placeholder', `Min $5.00 - Max $${userData.balance.toFixed(2)}`);
    }
});
document.getElementById('withdrawalForm').addEventListener('submit', requestWithdrawal);

// Close modals when clicking outside
window.addEventListener('click', (event) => {
    if (event.target.classList.contains('modal')) {
        event.target.style.display = 'none';
    }
});

// Initialize
window.onload = () => {
    initApp();
    generateTasks();
};

// Periodic UI update for ad window timer
setInterval(() => {
    if (userData) {
        updateAdWindowStatus();
    }
}, 30000); // Update every 30 seconds