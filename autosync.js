// autosync.js
class AutoSync {
    constructor() {
        this.isOnline = navigator.onLine;
        this.syncInterval = 30000; // 30 seconds
        this.retryCount = 0;
        this.maxRetries = 3;
        this.syncInProgress = false;
        this.pendingChanges = [];
        this.lastSyncTime = localStorage.getItem('lastSyncTime');
        
        this.init();
    }

    init() {
        console.log('🚀 AutoSync initializing...');
        
        // Set up event listeners
        this.setupEventListeners();
        
        // Start sync interval
        this.startSyncInterval();
        
        // Initial UI update
        this.updateUI();
        
        // Initial sync check
        setTimeout(() => this.checkAndSync(), 2000);
        
        console.log('✅ AutoSync initialized');
    }

    setupEventListeners() {
        // Network status
        window.addEventListener('online', () => this.handleOnline());
        window.addEventListener('offline', () => this.handleOffline());
        
        // Form changes
        this.setupFormListeners();
        
        // Page visibility (for background sync)
        document.addEventListener('visibilitychange', () => this.handleVisibilityChange());
        
        // Before unload (save on exit)
        window.addEventListener('beforeunload', (e) => this.handleBeforeUnload(e));
    }

    setupFormListeners() {
        const form = document.getElementById('eventForm');
        if (!form) {
            console.log('⚠️ Form not found, retrying in 1 second...');
            setTimeout(() => this.setupFormListeners(), 1000);
            return;
        }

        console.log('✅ Setting up form listeners...');

        // Monitor all form inputs for changes
        const inputs = form.querySelectorAll('input, select, textarea');
        inputs.forEach(input => {
            input.addEventListener('input', () => this.handleFormChange());
            input.addEventListener('change', () => this.handleFormChange());
        });

        // Monitor student table changes
        const studentTable = document.getElementById('studentTable');
        if (studentTable) {
            studentTable.addEventListener('input', () => this.handleFormChange());
            studentTable.addEventListener('change', () => this.handleFormChange());
        }

        console.log(`✅ Monitoring ${inputs.length} form elements for changes`);
    }

    handleFormChange() {
        if (this.syncInProgress) return;
        
        console.log('📝 Form changed, scheduling sync...');
        const formData = this.collectFormData();
        if (this.hasChanges(formData)) {
            this.scheduleSync('form_change');
        }
    }

    handleOnline() {
        this.isOnline = true;
        this.showNetworkStatus('🟢 Back online - Syncing changes...', 'online');
        this.updateUI();
        this.checkAndSync();
    }

    handleOffline() {
        this.isOnline = false;
        this.showNetworkStatus('🔴 Offline - Changes will sync when back online', 'offline');
        this.updateUI();
    }

    handleVisibilityChange() {
        if (!document.hidden && this.isOnline) {
            console.log('👀 Page visible, checking for sync...');
            this.checkAndSync();
        }
    }

    handleBeforeUnload(e) {
        if (this.pendingChanges.length > 0 || this.syncInProgress) {
            e.preventDefault();
            e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
            return e.returnValue;
        }
    }

    hasChanges(newData) {
        const lastData = this.getLastSavedData();
        return JSON.stringify(newData) !== JSON.stringify(lastData);
    }

    collectFormData() {
        // Use the existing form data collection logic
        if (typeof collectFormData === 'function') {
            return collectFormData();
        }
        
        // Fallback basic collection
        const data = {
            eventId: document.getElementById('eventId')?.value,
            eventName: document.getElementById('eventName')?.value,
            eventDate: document.getElementById('eventDate')?.value,
            venue: document.getElementById('eventVenue')?.value,
            lastModified: new Date().toISOString()
        };
        
        console.log('📦 Collected form data:', data);
        return data;
    }

    getLastSavedData() {
        return JSON.parse(localStorage.getItem('lastSavedData') || '{}');
    }

    setLastSavedData(data) {
        localStorage.setItem('lastSavedData', JSON.stringify(data));
    }

    scheduleSync(reason = 'scheduled') {
        console.log(`⏰ Scheduling sync: ${reason}`);
        
        // Debounce rapid changes
        clearTimeout(this.syncTimeout);
        this.syncTimeout = setTimeout(() => {
            this.checkAndSync();
        }, 2000); // 2 second debounce
    }

    async checkAndSync() {
        if (!this.isOnline) {
            console.log('🌐 Offline, skipping sync');
            this.updateUI();
            return false;
        }

        if (this.syncInProgress) {
            console.log('🔄 Sync already in progress');
            return false;
        }

        const formData = this.collectFormData();
        
        if (!this.hasChanges(formData) && this.pendingChanges.length === 0) {
            console.log('✅ No changes to sync');
            return false;
        }

        console.log('🔄 Changes detected, starting sync...');
        return await this.performSync(formData);
    }

    async performSync(formData, force = false) {
        if (this.syncInProgress && !force) {
            console.log('📦 Queueing change...');
            this.pendingChanges.push(formData);
            return false;
        }

        this.syncInProgress = true;
        this.updateUI();

        try {
            console.log('💾 Saving to local storage...');
            // Save to localStorage first (offline backup)
            this.saveToLocalStorage(formData);
            
            // If no event ID or new event, don't sync to server yet
            if (!formData.eventId || formData.eventId.includes('new') || !isEditMode) {
                console.log('🆕 New event, skipping server sync');
                this.handleLocalSave(formData);
                return true;
            }

            console.log('🌐 Syncing to server...');
            // Sync to server
            const result = await this.syncToServer(formData);
            
            if (result.success) {
                this.handleSyncSuccess(formData);
            } else {
                this.handleSyncError(formData, result.error);
            }
            
            return result.success;
        } catch (error) {
            this.handleSyncError(formData, error.message);
            return false;
        } finally {
            this.syncInProgress = false;
            this.updateUI();
            this.processPendingChanges();
        }
    }

    saveToLocalStorage(formData) {
        const timestamp = new Date().toISOString();
        const backup = {
            data: formData,
            timestamp: timestamp,
            eventId: formData.eventId || 'draft'
        };
        
        localStorage.setItem('eventDraft', JSON.stringify(backup));
        localStorage.setItem('lastBackupTime', timestamp);
        
        console.log('💾 Local backup saved:', backup);
    }

    async syncToServer(formData) {
        if (!isEditMode) {
            return { success: true, message: 'Not in edit mode' };
        }

        console.log('📤 Sending to server...');
        const action = 'updateEvent';
        const result = await apiCall(action, { eventData: formData });
        
        console.log('📥 Server response:', result);
        return result;
    }

    handleLocalSave(formData) {
        this.setLastSavedData(formData);
        this.lastSyncTime = new Date();
        this.showSyncStatus('Saved locally', 'success');
        this.updateUI();
    }

    handleSyncSuccess(formData) {
        this.setLastSavedData(formData);
        this.lastSyncTime = new Date();
        localStorage.setItem('lastSyncTime', this.lastSyncTime.toISOString());
        this.retryCount = 0;
        this.pendingChanges = [];
        
        this.showSyncStatus('Synced successfully', 'success');
        this.updateUI();
        
        console.log('✅ Sync successful:', this.lastSyncTime);
    }

    handleSyncError(formData, error) {
        this.retryCount++;
        
        // Save to pending changes for retry
        this.pendingChanges.push(formData);
        
        this.showSyncStatus(`Sync failed (${this.retryCount}/${this.maxRetries})`, 'error');
        this.updateUI();
        
        console.error('❌ Sync error:', error);
        
        // Schedule retry with exponential backoff
        if (this.retryCount <= this.maxRetries) {
            const backoffTime = Math.min(1000 * Math.pow(2, this.retryCount), 30000);
            console.log(`⏰ Retrying in ${backoffTime}ms...`);
            setTimeout(() => this.retrySync(), backoffTime);
        } else {
            this.showToast('❌ Sync failed after multiple attempts', 'error');
        }
    }

    async retrySync() {
        if (this.pendingChanges.length > 0 && this.isOnline) {
            const latestData = this.pendingChanges[this.pendingChanges.length - 1];
            await this.performSync(latestData, true);
        }
    }

    processPendingChanges() {
        if (this.pendingChanges.length > 0 && !this.syncInProgress && this.isOnline) {
            const nextChange = this.pendingChanges.shift();
            this.performSync(nextChange, true);
        }
    }

    updateUI() {
        const indicator = document.getElementById('syncIndicator');
        const button = document.getElementById('syncButton');
        const statusBar = document.getElementById('syncStatusBar');
        const statusText = document.getElementById('syncStatusText');
        const lastSync = document.getElementById('lastSyncTime');

        if (!indicator || !button || !statusBar || !statusText) {
            console.log('⚠️ UI elements not found');
            return;
        }

        // Update sync indicator
        if (!this.isOnline) {
            indicator.className = 'sync-indicator offline';
            indicator.title = 'Offline';
        } else if (this.syncInProgress) {
            indicator.className = 'sync-indicator syncing';
            indicator.title = 'Syncing...';
        } else if (this.pendingChanges.length > 0) {
            indicator.className = 'sync-indicator error';
            indicator.title = 'Pending changes';
        } else {
            indicator.className = 'sync-indicator success';
            indicator.title = 'Synced';
        }

        // Update button
        button.disabled = this.syncInProgress || !this.isOnline;
        if (this.syncInProgress) {
            button.classList.add('syncing');
            button.innerHTML = '🔄 Syncing...';
        } else {
            button.classList.remove('syncing');
            button.innerHTML = '🔄 Sync Now';
        }

        // Update status bar
        statusBar.className = 'sync-status-bar';
        if (!this.isOnline) {
            statusBar.classList.add('error');
            statusText.textContent = '🔴 Offline - Changes saved locally';
        } else if (this.syncInProgress) {
            statusBar.classList.add('syncing');
            statusText.textContent = '🔄 Syncing changes...';
        } else if (this.pendingChanges.length > 0) {
            statusBar.classList.add('error');
            statusText.textContent = `⚠️ ${this.pendingChanges.length} pending change(s) - Retrying...`;
        } else {
            statusBar.classList.add('success');
            statusText.textContent = '✅ All changes synced';
        }

        // Update last sync time
        if (lastSync && this.lastSyncTime) {
            const time = new Date(this.lastSyncTime);
            lastSync.textContent = `Last sync: ${time.toLocaleTimeString()}`;
        }
    }

    showSyncStatus(message, type = 'info') {
        const statusText = document.getElementById('syncStatusText');
        if (statusText) {
            statusText.textContent = message;
        }
        console.log(`📢 Sync Status: ${message}`);
    }

    showNetworkStatus(message, type) {
        // Remove existing status
        const existing = document.getElementById('networkStatus');
        if (existing) {
            existing.remove();
        }

        const status = document.createElement('div');
        status.id = 'networkStatus';
        status.className = `network-status ${type}`;
        status.textContent = message;
        
        document.body.appendChild(status);

        // Auto-hide after 3 seconds
        setTimeout(() => {
            if (status.parentNode) {
                status.remove();
            }
        }, 3000);
    }

    startSyncInterval() {
        this.syncIntervalId = setInterval(() => {
            if (this.isOnline && !this.syncInProgress) {
                console.log('⏰ Interval sync check...');
                this.checkAndSync();
            }
        }, this.syncInterval);
    }

    stopSyncInterval() {
        if (this.syncIntervalId) {
            clearInterval(this.syncIntervalId);
        }
    }

    // Public methods
    async forceSync() {
        console.log('🎯 Manual sync triggered');
        if (!this.isOnline) {
            this.showToast('🔴 Cannot sync - You are offline', 'error');
            return false;
        }
        
        this.showToast('🔄 Manual sync started...', 'info');
        return await this.checkAndSync();
    }

    getStatus() {
        return {
            isOnline: this.isOnline,
            isSyncing: this.syncInProgress,
            lastSync: this.lastSyncTime,
            pendingChanges: this.pendingChanges.length,
            retryCount: this.retryCount
        };
    }

    destroy() {
        this.stopSyncInterval();
        console.log('🛑 AutoSync destroyed');
    }
}

// Global autoSync instance
let autoSync;

function initializeAutoSync() {
    if (typeof AutoSync !== 'undefined') {
        autoSync = new AutoSync();
        
        // Check for recovery on startup
        setTimeout(async () => {
            const backupData = await autoSync.recoverFromLocalStorage();
            if (backupData && !currentEventId) {
                autoSync.showRecoveryPrompt(backupData);
            }
        }, 1000);
        
        return autoSync;
    }
}

// Recovery methods (add to class)
AutoSync.prototype.recoverFromLocalStorage = async function() {
    const draft = localStorage.getItem('eventDraft');
    if (!draft) return null;

    try {
        const backup = JSON.parse(draft);
        const now = new Date();
        const backupTime = new Date(backup.timestamp);
        const hoursDiff = (now - backupTime) / (1000 * 60 * 60);

        if (hoursDiff > 24) {
            localStorage.removeItem('eventDraft');
            return null;
        }

        return backup.data;
    } catch (error) {
        console.error('Recovery error:', error);
        return null;
    }
};

AutoSync.prototype.showRecoveryPrompt = function(backupData) {
    if (confirm('We found unsaved changes from your last session. Would you like to restore them?')) {
        this.restoreData(backupData);
    } else {
        localStorage.removeItem('eventDraft');
    }
};

AutoSync.prototype.restoreData = function(backupData) {
    if (backupData.eventId) {
        document.getElementById('eventId').value = backupData.eventId;
        document.getElementById('eventIdDisplay').textContent = `Event ID: ${backupData.eventId}`;
    }
    
    if (backupData.eventName) {
        document.getElementById('eventName').value = backupData.eventName;
    }
    
    this.showToast('Data restored from backup', 'success');
};

AutoSync.prototype.showToast = function(message, type = 'info') {
    if (typeof showToast === 'function') {
        showToast(message, type);
    } else {
        console.log(`Toast [${type}]:`, message);
    }
};
