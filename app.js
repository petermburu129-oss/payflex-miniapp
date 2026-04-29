// Telegram Web App initialization
const tg = window.Telegram.WebApp;
tg.expand();

// User data
let currentUser = null;
let userData = null;
let adsWatchedInWindow = 0;
let adWatchWindowStart = null;
let lastAdWatchTime = null;
let referralCount = 0;

// Smart Links
const SMARTLINKS = {
    watchAd: "https://omg10.com/4/8627792",
    tasks: [
        "https://omg10.com/4/8629588",
        "https://omg10.com/4/10942086",
        "https://omg10.com/4/10942064",
        "https://omg10.com/4/10942063",
        "https://omg10.com/4/10942065",
        "https://omg10.com/4/10942067",
        "https://omg10.com/4/10942066",
        "https://omg10.com/4/10286779",
        "https://omg10.com/4/10921529",
        "https://omg10.com/4/10286778",
    ],
    telegram: "https://t.me/+TCJNKW2sFFc2YWY0",
    youtube: "https://www.youtube.com/@hummingbirdtvke2255"
};

const MAX_ADS_PER_WINDOW = 10;
const AD_WINDOW_HOURS = 3;

// Initialize app
async function initApp() {
    try {
        console.log('🚀 Initializing PayFlex app...');
        
        const initData = tg.initDataUnsafe;
        console.log('📱 Full init data:', JSON.stringify(initData, null, 2));
        
        if (initData && initData.user) {
            currentUser = initData.user;
            console.log('👤 Current user ID:', currentUser.id);
            console.log('👤 Current user:', currentUser.first_name, currentUser.username);
            
            // CHECK FOR REFERRAL IN TELEGRAM START PARAMETER
            let referralCode = null;
            
            // Method 1: Check startapp parameter from Telegram
            if (initData.start_param) {
                referralCode = initData.start_param;
                console.log('🔗 Found Telegram start_param:', referralCode);
            }
            
            // Method 2: Check URL parameters (fallback)
            if (!referralCode) {
                const urlParams = new URLSearchParams(window.location.search);
                referralCode = urlParams.get('startapp') || urlParams.get('start') || urlParams.get('ref');
                if (referralCode) {
                    console.log('🔗 Found URL parameter:', referralCode);
                }
            }
            
            // Method 3: Check the full URL
            if (!referralCode) {
                const fullUrl = window.location.href;
                console.log('📍 Full URL:', fullUrl);
                const match = fullUrl.match(/startapp=([^&]+)/);
                if (match) {
                    referralCode = match[1];
                    console.log('🔗 Extracted from URL:', referralCode);
                }
            }
            
            if (!referralCode) {
                console.log('ℹ️ No referral code detected');
            }
            
            await loadUserData(referralCode);
            await updateReferralCount();
            updateUI();
            startTaskTimers();
            startAdWindowTimer();
            setupReferralListener();
            
            console.log('✅ App initialized successfully');
        } else {
            console.error('❌ No user data. Full init data:', initData);
            showToast('Please open this app from Telegram');
        }
    } catch (error) {
        console.error('❌ Initialization error:', error);
        showToast('Error initializing app');
    }
}

// Set up real-time listener for referrals
function setupReferralListener() {
    if (!currentUser) return;
    
    console.log('👂 Setting up referral listener for user:', currentUser.id);
    
    db.collection('referrals')
        .where('referrerId', '==', currentUser.id.toString())
        .onSnapshot((snapshot) => {
            const count = snapshot.size;
            console.log(`📊 Referral listener update: ${count} referrals`);
            
            referralCount = count;
            
            // Update UI
            const referralCountEl = document.getElementById('referralCount');
            if (referralCountEl) {
                referralCountEl.textContent = count;
            }
            const modalCount = document.getElementById('referralCountModal');
            if (modalCount) {
                modalCount.textContent = count;
            }
            
            // Update in database if different
            if (userData && userData.referralCount !== count) {
                userData.referralCount = count;
                db.collection('users').doc(currentUser.id.toString()).update({
                    referralCount: count
                }).catch(err => console.error('Error updating referral count:', err));
            }
        }, (error) => {
            console.error('❌ Referral listener error:', error);
        });
}

// Load user data from Firebase
async function loadUserData(referralCode) {
    try {
        console.log('📂 Loading user data for ID:', currentUser.id);
        const userRef = db.collection('users').doc(currentUser.id.toString());
        const doc = await userRef.get();
        
        if (doc.exists) {
            userData = doc.data();
            console.log('✅ Existing user loaded');
            console.log('   Referral code:', userData.referralCode);
            console.log('   Referral count:', userData.referralCount);
            console.log('   Already referred by:', userData.referredBy);
            referralCount = userData.referralCount || 0;
            
            // If this user hasn't been referred yet and has a referral code
            if (!userData.referredBy && referralCode) {
                console.log('🔗 Existing user clicking referral link:', referralCode);
                await processReferral(referralCode);
            }
        } else {
            console.log('🆕 Creating new user...');
            const newReferralCode = generateReferralCode();
            
            userData = {
                telegramId: currentUser.id,
                username: currentUser.username || '',
                firstName: currentUser.first_name || '',
                balance: 0,
                totalAdsWatched: 0,
                referralCount: 0,
                referralCode: newReferralCode,
                referredBy: null,
                tasksCompleted: {},
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            
            // Process referral if code exists
            if (referralCode && referralCode.length > 0) {
                console.log('🔗 Processing referral code for new user:', referralCode);
                await processReferral(referralCode);
            } else {
                console.log('ℹ️ No referral code found for new user');
            }
            
            await userRef.set(userData);
            console.log('✅ New user created with code:', newReferralCode);
            referralCount = 0;
        }
        
        await loadAdTrackingData();
    } catch (error) {
        console.error('❌ Error loading user data:', error);
        throw error;
    }
}

// Update referral count from referrals collection
async function updateReferralCount() {
    try {
        console.log('🔄 Counting referrals for user:', currentUser.id);
        
        const snapshot = await db.collection('referrals')
            .where('referrerId', '==', currentUser.id.toString())
            .get();
        
        const actualCount = snapshot.size;
        console.log(`📊 Actual referral count from DB: ${actualCount}`);
        
        referralCount = actualCount;
        
        // Update UI
        document.getElementById('referralCount').textContent = actualCount;
        const modalCount = document.getElementById('referralCountModal');
        if (modalCount) {
            modalCount.textContent = actualCount;
        }
        
        // Update stored count if different
        if (userData.referralCount !== actualCount) {
            userData.referralCount = actualCount;
            await db.collection('users').doc(currentUser.id.toString()).update({
                referralCount: actualCount
            });
            console.log('✅ Updated referral count in database to:', actualCount);
        }
        
        return actualCount;
    } catch (error) {
        console.error('❌ Error counting referrals:', error);
        return 0;
    }
}

// Generate referral code
function generateReferralCode() {
    const code = 'PAYFLEX' + Math.random().toString(36).substring(2, 8).toUpperCase();
    console.log('🎫 Generated new referral code:', code);
    return code;
}

// Process referral
async function processReferral(refCode) {
    try {
        console.log('🔄 Processing referral code:', refCode);
        
        // Prevent self-referral
        if (userData.referralCode === refCode) {
            console.log('❌ Self-referral blocked (own code)');
            return;
        }
        
        // Find the referrer by their referral code
        const usersRef = db.collection('users');
        const snapshot = await usersRef
            .where('referralCode', '==', refCode)
            .limit(1)
            .get();
        
        if (snapshot.empty) {
            console.log('❌ No user found with referral code:', refCode);
            return;
        }
        
        const referrerDoc = snapshot.docs[0];
        const referrerId = referrerDoc.id;
        const referrerData = referrerDoc.data();
        
        console.log('👤 Referrer found:', referrerData.firstName, '@' + referrerData.username);
        console.log('   Referrer ID:', referrerId);
        
        // Prevent self-referral by ID
        if (referrerId === currentUser.id.toString()) {
            console.log('❌ Self-referral blocked (same ID)');
            return;
        }
        
        // Check if current user was already referred
        const existingReferral = await db.collection('referrals')
            .where('referredId', '==', currentUser.id.toString())
            .limit(1)
            .get();
        
        if (!existingReferral.empty) {
            console.log('❌ Current user was already referred');
            return;
        }
        
        // CREATE THE REFERRAL RECORD
        const referralId = `${referrerId}_${currentUser.id}`;
        console.log('📝 Creating referral record:', referralId);
        
        await db.collection('referrals').doc(referralId).set({
            referrerId: referrerId,
            referredId: currentUser.id.toString(),
            referredUsername: currentUser.username || '',
            referredFirstName: currentUser.first_name || '',
            referrerUsername: referrerData.username || '',
            referrerFirstName: referrerData.firstName || '',
            reward: 0.5,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            status: 'completed'
        });
        
        console.log('✅ Referral record created in database');
        
        // Update referrer's balance and count
        const newCount = (referrerData.referralCount || 0) + 1;
        await db.collection('users').doc(referrerId).update({
            balance: firebase.firestore.FieldValue.increment(0.5),
            referralCount: newCount
        });
        
        console.log(`✅ Referrer updated: ${referrerData.firstName} now has ${newCount} referrals and +$0.50`);
        
        // Mark current user as referred
        userData.referredBy = referrerId;
        await db.collection('users').doc(currentUser.id.toString()).update({
            referredBy: referrerId
        });
        
        console.log('✅ Current user marked as referred by:', referrerId);
        
        showToast('🎉 Welcome! You were referred by ' + (referrerData.firstName || 'someone') + '!');
        
    } catch (error) {
        console.error('❌ Error processing referral:', error);
        console.error('   Error details:', JSON.stringify(error));
    }
}

// Load ad tracking data
async function loadAdTrackingData() {
    try {
        const now = firebase.firestore.Timestamp.now();
        const windowStart = new Date(now.toDate().getTime() - (AD_WINDOW_HOURS * 60 * 60 * 1000));
        
        const adsRef = db.collection('users').doc(currentUser.id.toString())
            .collection('adViews');
        
        const snapshot = await adsRef
            .where('timestamp', '>=', firebase.firestore.Timestamp.fromDate(windowStart))
            .orderBy('timestamp', 'desc')
            .get();
        
        if (!snapshot.empty) {
            adsWatchedInWindow = snapshot.size;
            const earliestAd = snapshot.docs[snapshot.size - 1].data();
            adWatchWindowStart = earliestAd.timestamp.toDate();
            lastAdWatchTime = snapshot.docs[0].data().timestamp.toDate();
        }
        
        console.log(`📺 Ads watched in window: ${adsWatchedInWindow}`);
    } catch (error) {
        console.error('Error loading ad tracking:', error);
    }
}

function startAdWindowTimer() {
    updateAdWindowStatus();
    setInterval(updateAdWindowStatus, 30000);
}

function updateAdWindowStatus() {
    if (!adWatchWindowStart) return;
    
    const now = new Date();
    const windowEnd = new Date(adWatchWindowStart.getTime() + (AD_WINDOW_HOURS * 60 * 60 * 1000));
    
    if (now >= windowEnd) {
        adsWatchedInWindow = 0;
        adWatchWindowStart = null;
    }
    
    updateAdWatchButton();
}

function updateAdWatchButton() {
    const btn = document.getElementById('watchAdBtn');
    if (!btn) return;
    
    const now = new Date();
    
    if (adWatchWindowStart && adsWatchedInWindow >= MAX_ADS_PER_WINDOW) {
        const windowEnd = new Date(adWatchWindowStart.getTime() + (AD_WINDOW_HOURS * 60 * 60 * 1000));
        
        if (now < windowEnd) {
            btn.disabled = true;
            const remainingMs = windowEnd - now;
            const remainingHours = Math.floor(remainingMs / (1000 * 60 * 60));
            const remainingMinutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
            btn.innerHTML = `<span class="btn-icon">⏰</span> Reset in ${remainingHours}h ${remainingMinutes}m`;
            return;
        } else {
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
    
    if (adWatchWindowStart) {
        const remaining = MAX_ADS_PER_WINDOW - adsWatchedInWindow;
        btn.innerHTML = `<span class="btn-icon">📺</span> Watch Ad ($0.05) - ${remaining} left`;
    } else {
        btn.innerHTML = '<span class="btn-icon">📺</span> Watch Ad ($0.05)';
    }
}

function updateUI() {
    if (!userData) return;
    
    document.getElementById('balance').textContent = `$${userData.balance.toFixed(2)}`;
    document.getElementById('adsWatched').textContent = userData.totalAdsWatched || 0;
    
    const displayCount = referralCount || userData.referralCount || 0;
    document.getElementById('referralCount').textContent = displayCount;
    
    const progress = Math.min((userData.balance / 5) * 100, 100);
    document.getElementById('withdrawalProgress').style.width = `${progress}%`;
    document.getElementById('progressText').textContent = 
        `$${userData.balance.toFixed(2)} / $5.00`;
    
    updateAdWatchButton();
}

async function watchAd() {
    try {
        const btn = document.getElementById('watchAdBtn');
        if (btn.disabled) return;
        
        const now = new Date();
        
        if (!adWatchWindowStart) {
            adWatchWindowStart = now;
            adsWatchedInWindow = 0;
        } else {
            const windowEnd = new Date(adWatchWindowStart.getTime() + (AD_WINDOW_HOURS * 60 * 60 * 1000));
            if (now >= windowEnd) {
                adWatchWindowStart = now;
                adsWatchedInWindow = 0;
            }
        }
        
        if (adsWatchedInWindow >= MAX_ADS_PER_WINDOW) {
            showToast(`You can watch ${MAX_ADS_PER_WINDOW} ads every ${AD_WINDOW_HOURS} hours`);
            return;
        }
        
        btn.disabled = true;
        btn.innerHTML = '<span class="btn-icon">⏳</span> Processing...';
        
        await db.collection('users').doc(currentUser.id.toString())
            .collection('adViews').doc().set({
                timestamp: firebase.firestore.Timestamp.now(),
                reward: 0.05,
                windowStart: firebase.firestore.Timestamp.fromDate(adWatchWindowStart)
            });
        
        await db.collection('users').doc(currentUser.id.toString()).update({
            balance: firebase.firestore.FieldValue.increment(0.05),
            totalAdsWatched: firebase.firestore.FieldValue.increment(1)
        });
        
        window.open(SMARTLINKS.watchAd, '_blank');
        
        userData.balance += 0.05;
        userData.totalAdsWatched += 1;
        adsWatchedInWindow += 1;
        lastAdWatchTime = now;
        
        updateUI();
        showToast(`+$0.05 earned! (${MAX_ADS_PER_WINDOW - adsWatchedInWindow} ads remaining)`);
        
        setTimeout(() => {
            btn.disabled = false;
            updateAdWatchButton();
        }, 3000);
        
    } catch (error) {
        console.error('Error watching ad:', error);
        showToast('Error processing reward');
        document.getElementById('watchAdBtn').disabled = false;
        updateAdWatchButton();
    }
}

async function completeTask(taskId, taskName) {
    console.log(`📋 Task ${taskId}: ${taskName}`);
    
    try {
        if (!taskId || taskId < 1 || taskId > 12) {
            showToast('Invalid task');
            return;
        }
        
        const btn = document.getElementById(`task-btn-${taskId}`);
        if (!btn || btn.disabled) {
            showToast('Task already completed today!');
            return;
        }
        
        if (!userData || !currentUser) {
            showToast('Please wait...');
            return;
        }
        
        const today = new Date().toDateString();
        const taskKey = `${taskId}_${today}`;
        
        if (userData.tasksCompleted && userData.tasksCompleted[taskKey]) {
            showToast('Task already completed today!');
            return;
        }
        
        btn.disabled = true;
        btn.textContent = 'Processing...';
        
        let linkToOpen;
        if (taskId <= 10) {
            linkToOpen = SMARTLINKS.tasks[taskId - 1];
        } else if (taskId === 11) {
            linkToOpen = SMARTLINKS.telegram;
        } else if (taskId === 12) {
            linkToOpen = SMARTLINKS.youtube;
        }
        
        if (!linkToOpen) {
            btn.disabled = false;
            btn.textContent = 'Start';
            return;
        }
        
        window.open(linkToOpen, '_blank');
        
        if (!userData.tasksCompleted) {
            userData.tasksCompleted = {};
        }
        
        const completionData = {
            completedAt: new Date().toISOString(),
            taskName: taskName
        };
        
        userData.tasksCompleted[taskKey] = completionData;
        
        await db.collection('users').doc(currentUser.id.toString()).update({
            balance: firebase.firestore.FieldValue.increment(0.10),
            [`tasksCompleted.${taskKey}`]: completionData
        });
        
        userData.balance += 0.10;
        updateUI();
        showToast('+$0.10 earned!');
        startTaskTimer(taskId, taskKey);
        
    } catch (error) {
        console.error('Error:', error);
        showToast('Error completing task');
        const btn = document.getElementById(`task-btn-${taskId}`);
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Start';
        }
    }
}

function startTaskTimers() {
    const today = new Date().toDateString();
    for (let i = 1; i <= 12; i++) {
        const taskKey = `${i}_${today}`;
        if (userData.tasksCompleted && userData.tasksCompleted[taskKey]) {
            startTaskTimer(i, taskKey);
        }
    }
}

function startTaskTimer(taskId, taskKey, completedTime = null) {
    const btn = document.getElementById(`task-btn-${taskId}`);
    const timerSpan = document.getElementById(`timer-${taskId}`);
    if (!btn || !timerSpan) return;
    
    btn.disabled = true;
    const completionTimestamp = completedTime || 
        (userData.tasksCompleted && userData.tasksCompleted[taskKey] ? 
            new Date(userData.tasksCompleted[taskKey].completedAt) : new Date());
    
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
        btn.disabled = false;
        btn.textContent = 'Start';
        timerSpan.textContent = '';
        return;
    }
    
    const hours = Math.floor(timeLeft / (1000 * 60 * 60));
    const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);
    
    btn.textContent = 'Completed';
    timerSpan.textContent = `⏰ ${hours}h ${minutes}m ${seconds}s`;
    timerSpan.style.color = '#ff9800';
    
    setTimeout(() => updateTaskTimerDisplay(taskId, completionTimestamp), 1000);
}

function generateTasks() {
    const tasksList = document.getElementById('tasksList');
    const tasks = [
        'Complete Offer 1', 'Complete Offer 2', 'Complete Offer 3',
        'Complete Offer 4', 'Complete Offer 5', 'Complete Offer 6',
        'Complete Offer 7', 'Complete Offer 8', 'Complete Offer 9',
        'Complete Offer 10', '📢 Join Telegram Channel', '▶️ Subscribe to YouTube'
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
            <button class="task-btn" id="task-btn-${taskId}" onclick="completeTask(${taskId}, '${task.replace(/'/g, "\\'")}')">
                Start
            </button>
        `;
        tasksList.appendChild(taskItem);
    });
}

function showTab(tab) {
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
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

function updateInviteModal() {
    if (!userData || !userData.referralCode) {
        document.getElementById('referralLink').value = 'Loading... Please wait...';
        return;
    }
    
    const referralLink = `https://t.me/PayFlexEarnBot?start=${userData.referralCode}`;
    document.getElementById('referralLink').value = referralLink;
    
    const count = referralCount || userData.referralCount || 0;
    document.getElementById('referralCountModal').textContent = count;
    document.getElementById('referralCount').textContent = count;
    
    // ADD THIS LINE for earnings
    const earnings = (count * 0.50).toFixed(2);
    const earningsElement = document.getElementById('referralEarnings');
    if (earningsElement) {
        earningsElement.textContent = `$${earnings}`;
    }
}

function copyReferralLink() {
    const linkInput = document.getElementById('referralLink');
    const linkText = linkInput.value;
    
    console.log('📋 Copying link:', linkText);
    
    if (!linkText || linkText === '') {
        showToast('❌ No link to copy. Please wait...');
        return;
    }
    
    // Try modern clipboard API
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(linkText)
            .then(() => {
                showToast('✅ Referral link copied!');
                console.log('✅ Copied successfully');
            })
            .catch((err) => {
                console.log('Clipboard error, trying fallback:', err);
                fallbackCopyText(linkText);
            });
    } else {
        fallbackCopyText(linkText);
    }
}

function fallbackCopyText(text) {
    const linkInput = document.getElementById('referralLink');
    
    // Select the text
    linkInput.select();
    linkInput.setSelectionRange(0, 99999);
    linkInput.focus();
    
    try {
        const successful = document.execCommand('copy');
        if (successful) {
            showToast('✅ Referral link copied!');
        } else {
            showToast('📋 Please manually copy the link');
        }
    } catch (err) {
        console.error('Fallback failed:', err);
        showToast('📋 Link: ' + text);
    }
}
function fallbackCopyText(text) {
    const linkInput = document.getElementById('referralLink');
    linkInput.select();
    linkInput.setSelectionRange(0, 99999);
    try {
        document.execCommand('copy');
        showToast('✅ Referral link copied!');
    } catch (err) {
        prompt('Copy this link:', text);
    }
}

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
        showToast('⚠️ Invalid amount');
        return;
    }
    
    if (!confirm(`Confirm withdrawal of $${amount.toFixed(2)} via ${method}?`)) return;
    
    try {
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
        
        await db.collection('users').doc(currentUser.id.toString()).update({
            balance: firebase.firestore.FieldValue.increment(-amount)
        });
        
        userData.balance -= amount;
        updateUI();
        closeModal('withdrawalModal');
        document.getElementById('withdrawalForm').reset();
        showToast('✅ Withdrawal requested!');
    } catch (error) {
        console.error('Withdrawal error:', error);
        showToast('❌ Error');
    }
}

function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

function showToast(message) {
    const existingToast = document.querySelector('.toast');
    if (existingToast) existingToast.remove();
    
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        if (toast.parentNode) toast.remove();
    }, 4000);
}

// Event Listeners
document.getElementById('watchAdBtn').addEventListener('click', watchAd);
document.getElementById('withdrawBtn').addEventListener('click', () => {
    if (userData.balance < 5) {
        showToast('⚠️ You need $5.00 minimum to withdraw');
    } else {
        document.getElementById('withdrawalModal').style.display = 'flex';
    }
});
document.getElementById('withdrawalForm').addEventListener('submit', requestWithdrawal);

window.addEventListener('click', (event) => {
    if (event.target.classList.contains('modal')) {
        event.target.style.display = 'none';
    }
});

window.onload = () => {
    initApp();
    generateTasks();
};