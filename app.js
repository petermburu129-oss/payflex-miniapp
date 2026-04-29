// Telegram Web App initialization
const tg = window.Telegram.WebApp;
tg.expand();

// User data
let currentUser = null;
let userData = null;
let adsWatchedInWindow = 0;
let adWatchWindowStart = null;
let lastAdWatchTime = null;

// Smart Links - Updated with all 11 links
const SMARTLINKS = {
    watchAd: "https://omg10.com/4/8627792", // Smart link 2 for watch ad
    tasks: [
        "https://omg10.com/4/8629588",  // Task 1 - Smart link 1
        "https://omg10.com/4/10942086", // Task 2 - Smart link 3
        "https://omg10.com/4/10942064", // Task 3 - Smart link 4
        "https://omg10.com/4/10942063", // Task 4 - Smart link 5
        "https://omg10.com/4/10942065", // Task 5 - Smart link 6
        "https://omg10.com/4/10942067", // Task 6 - Smart link 7
        "https://omg10.com/4/10942066", // Task 7 - Smart link 8
        "https://omg10.com/4/10286779", // Task 8 - Smart link 9
        "https://omg10.com/4/10921529", // Task 9 - Smart link 10
        "https://omg10.com/4/10286778", // Task 10 - Smart link 11
    ],
    telegram: "https://t.me/+TCJNKW2sFFc2YWY0",
    youtube: "https://www.youtube.com/@hummingbirdtvke2255"
};

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
            await loadReferralCount(); // Load referral count separately
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
            const refCode = urlParams.get('startapp') || urlParams.get('ref');
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

// Load referral count from referrals collection
async function loadReferralCount() {
    try {
        const referralsRef = db.collection('referrals');
        const snapshot = await referralsRef
            .where('referrerId', '==', currentUser.id.toString())
            .get();
        
        const actualReferralCount = snapshot.size;
        
        // Update if different from stored value
        if (userData.referralCount !== actualReferralCount) {
            userData.referralCount = actualReferralCount;
            await db.collection('users').doc(currentUser.id.toString()).update({
                referralCount: actualReferralCount
            });
        }
        
        console.log(`Referral count loaded: ${actualReferralCount}`);
    } catch (error) {
        console.error('Error loading referral count:', error);
    }
}

// Generate referral code
function generateReferralCode() {
    return 'PAYFLEX' + Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Process referral
async function processReferral(refCode) {
    try {
        // Prevent self-referral by checking if the refCode matches current user's code
        if (userData.referralCode === refCode) {
            console.log('Self-referral detected and blocked');
            return;
        }
        
        // Find referrer
        const usersRef = db.collection('users');
        const snapshot = await usersRef.where('referralCode', '==', refCode).limit(1).get();
        
        if (!snapshot.empty) {
            const referrerDoc = snapshot.docs[0];
            const referrerId = referrerDoc.id;
            
            // Prevent self-referral by ID
            if (referrerId === currentUser.id.toString()) {
                console.log('Self-referral detected and blocked');
                return;
            }
            
            // Check if already referred (prevent multiple referrals)
            const existingReferral = await db.collection('referrals')
                .where('referredId', '==', currentUser.id.toString())
                .limit(1)
                .get();
            
            if (!existingReferral.empty) {
                console.log('User already referred');
                return;
            }
            
            // Create referral record
            const referralRef = db.collection('referrals').doc(`${referrerId}_${currentUser.id}`);
            
            await referralRef.set({
                referrerId: referrerId,
                referredId: currentUser.id.toString(),
                referredUsername: currentUser.username || currentUser.first_name,
                reward: 0.5,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                status: 'completed'
            });
            
            // Update referrer's balance and count
            await db.collection('users').doc(referrerId).update({
                balance: firebase.firestore.FieldValue.increment(0.5),
                referralCount: firebase.firestore.FieldValue.increment(1)
            });
            
            // Update current user
            userData.referredBy = referrerId;
            await db.collection('users').doc(currentUser.id.toString()).update({
                referredBy: referrerId
            });
            
            // Reload referral count for referrer
            const referrerData = (await db.collection('users').doc(referrerId).get()).data();
            console.log(`Referral processed. ${referrerData.firstName} now has ${referrerData.referralCount} referrals`);
            
            showToast('Welcome! You were referred successfully.');
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
            
            // Get the latest ad for tracking
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
    // Check every 30 seconds
    setInterval(updateAdWindowStatus, 30000);
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
        btn.innerHTML = '<span class="btn-icon">📺</span> Limit Reached';
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
        
        // Open smartlink AFTER recording (important for tracking)
        window.open(SMARTLINKS.watchAd, '_blank');
        
        // Update local data
        userData.balance += 0.05;
        userData.totalAdsWatched += 1;
        adsWatchedInWindow += 1;
        lastAdWatchTime = now;
        
        updateUI();
        
        const remaining = MAX_ADS_PER_WINDOW - adsWatchedInWindow;
        showToast(`+$0.05 earned! (${remaining} ads remaining in this window)`);
        
        // Re-enable button after delay with updated status
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
        if (!btn) {
            console.error(`Button for task ${taskId} not found`);
            return;
        }
        
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
        
        // Determine which link to open based on task ID
        let linkToOpen;
        if (taskId <= 10) {
            // Tasks 1-10 use smartlinks
            linkToOpen = SMARTLINKS.tasks[taskId - 1];
        } else if (taskId === 11) {
            // Task 11 - Telegram channel
            linkToOpen = SMARTLINKS.telegram;
        } else if (taskId === 12) {
            // Task 12 - YouTube channel
            linkToOpen = SMARTLINKS.youtube;
        }
        
        if (!linkToOpen) {
            showToast('Error: Invalid task link');
            btn.disabled = false;
            btn.textContent = 'Start';
            return;
        }
        
        // Open the link
        window.open(linkToOpen, '_blank');
        
        // Record task completion
        if (!userData.tasksCompleted) {
            userData.tasksCompleted = {};
        }
        userData.tasksCompleted[taskKey] = {
            completedAt: new Date().toISOString(),
            taskName: taskName,
            linkUsed: linkToOpen
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
        showToast('Error completing task. Please try again.');
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
    
    for (let i = 1; i <= 12; i++) {
        const taskKey = `${i}_${today}`;
        
        if (userData.tasksCompleted && userData.tasksCompleted[taskKey]) {
            startTaskTimer(i, taskKey);
        } else {
            // Check if task was completed recently (within 24 hours)
            for (const [key, value] of Object.entries(userData.tasksCompleted || {})) {
                if (key.startsWith(`${i}_`)) {
                    const completedTime = new Date(value.completedAt);
                    const resetTime = new Date(completedTime.getTime() + (24 * 60 * 60 * 1000));
                    
                    if (new Date() < resetTime) {
                        // Still in cooldown
                        startTaskTimer(i, taskKey, completedTime);
                    }
                    break;
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

// Generate task list - Updated with 12 tasks
function generateTasks() {
    const tasksList = document.getElementById('tasksList');
    
    // 12 tasks: 10 smartlink tasks + Telegram + YouTube
    const tasks = [
        { name: 'Complete Offer 1', type: 'smartlink' },
        { name: 'Complete Offer 2', type: 'smartlink' },
        { name: 'Complete Offer 3', type: 'smartlink' },
        { name: 'Complete Offer 4', type: 'smartlink' },
        { name: 'Complete Offer 5', type: 'smartlink' },
        { name: 'Complete Offer 6', type: 'smartlink' },
        { name: 'Complete Offer 7', type: 'smartlink' },
        { name: 'Complete Offer 8', type: 'smartlink' },
        { name: 'Complete Offer 9', type: 'smartlink' },
        { name: 'Complete Offer 10', type: 'smartlink' },
        { name: '📢 Join Telegram Channel', type: 'telegram' },
        { name: '▶️ Subscribe to YouTube', type: 'youtube' }
    ];
    
    tasksList.innerHTML = '';
    
    tasks.forEach((task, index) => {
        const taskId = index + 1;
        const taskItem = document.createElement('div');
        taskItem.className = 'task-item';
        
        let icon = '🔗';
        if (task.type === 'telegram') icon = '📢';
        if (task.type === 'youtube') icon = '▶️';
        
        taskItem.innerHTML = `
            <div class="task-info">
                <span class="task-name">${icon} ${task.name}</span>
                <span class="task-reward">+$0.10</span>
                <span class="task-timer" id="timer-${taskId}"></span>
            </div>
            <button class="task-btn" id="task-btn-${taskId}" onclick="completeTask(${taskId}, '${task.name.replace(/'/g, "\\'")}')">
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
    
    // Hide all modals first
    document.getElementById('inviteModal').style.display = 'none';
    document.getElementById('moreModal').style.display = 'none';
    
    if (tab === 'tasks') {
        document.querySelector('.tasks-section').style.display = 'block';
        document.querySelector('.nav-btn:nth-child(1)').classList.add('active');
    } else if (tab === 'invite') {
        document.getElementById('inviteModal').style.display = 'flex';
        document.querySelector('.nav-btn:nth-child(2)').classList.add('active');
        updateInviteModal();
    } else if (tab === 'more') {
        document.getElementById('moreModal').style.display = 'flex';
        document.querySelector('.nav-btn:nth-child(3)').classList.add('active');
    }
}

// Update invite modal - FIXED with proper referral count
function updateInviteModal() {
    if (!userData || !userData.referralCode) return;
    
    // Use the correct format for Telegram mini app deep linking
    const referralLink = `https://t.me/PayFlex01Bot/PayFlex?startapp=${userData.referralCode}`;
    document.getElementById('referralLink').value = referralLink;
    
    // Show actual referral count from loaded data
    const count = userData.referralCount || 0;
    document.getElementById('referralCountModal').textContent = count;
    document.getElementById('referralCount').textContent = count;
    
    console.log('Invite modal updated. Referral count:', count);
}

// Copy referral link - Multiple methods for compatibility
function copyReferralLink() {
    const linkInput = document.getElementById('referralLink');
    const linkText = linkInput.value;
    
    // Method 1: Modern clipboard API
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(linkText)
            .then(() => {
                showToast('✅ Referral link copied! Share with friends to earn $0.50 each.');
            })
            .catch(err => {
                console.error('Clipboard API error:', err);
                // Try fallback
                fallbackCopyText(linkText);
            });
    } 
    // Method 2: For Telegram WebView
    else if (window.TelegramWebviewProxy) {
        try {
            window.TelegramWebviewProxy.postEvent('clipboard_text_received', { data: linkText });
            showToast('✅ Referral link copied!');
        } catch(e) {
            fallbackCopyText(linkText);
        }
    }
    // Method 3: Fallback
    else {
        fallbackCopyText(linkText);
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
            showToast('✅ Referral link copied! Share with friends to earn $0.50 each.');
        } else {
            // Last resort - show the link
            prompt('Copy this referral link:', text);
            showToast('📋 Copy the link manually to share');
        }
    } catch (err) {
        console.error('Fallback copy error:', err);
        // Show the link in a prompt as last resort
        prompt('Copy this referral link:', text);
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
    if (!confirm(`Confirm withdrawal of $${amount.toFixed(2)} via ${method}?\n\nAccount: ${accountDetails}`)) {
        return;
    }
    
    try {
        // Create withdrawal request
        await db.collection('withdrawals').add({
            userId: currentUser.id.toString(),
            username: currentUser.username || currentUser.first_name,
            firstName: currentUser.first_name || '',
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

// Show withdrawal history (placeholder)
function showWithdrawalHistory() {
    showToast('📊 Withdrawal history coming soon!');
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
    
    // Remove after 4 seconds
    setTimeout(() => {
        if (toast.parentNode) {
            toast.remove();
        }
    }, 4000);
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

// Periodic UI update
setInterval(() => {
    if (userData) {
        updateAdWindowStatus();
        // Reload referral count periodically
        loadReferralCount().then(() => {
            document.getElementById('referralCount').textContent = userData.referralCount || 0;
            const modalCount = document.getElementById('referralCountModal');
            if (modalCount) {
                modalCount.textContent = userData.referralCount || 0;
            }
        });
    }
}, 60000); // Update every minute