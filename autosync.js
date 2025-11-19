// ============================================
// AUTOSYNC SYSTEM - autosync.js
// ============================================

class AutoSync {
    constructor() {
        this.isOnline = navigator.onLine;
        this.syncInterval = 30000; // 30 seconds
        this.retryCount = 0;
        this.maxRetries = 3;
        this.syncInProgress = false;
        this.pendingChanges = [];
        this.lastSyncTime = null;
        
        this.init();
    }

    init() {
        // Set up event listeners
        this.setupEventListeners();
        
        // Start sync interval
        this.startSyncInterval();
        
        // Initial sync check
        this.checkAndSync();
        
        console.log('AutoSync initialized');
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
        if (!form) return;

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
    }

    handleFormChange() {
        if (this.syncInProgress) return;
        
        const formData = this.collectFormData();
        if (this.hasChanges(formData)) {
            this.scheduleSync('form_change');
        }
    }

    handleOnline() {
        this.isOnline = true;
        this.showToast('🟢 Back online - Syncing changes...', 'success');
        this.checkAndSync();
    }

    handleOffline() {
        this.isOnline = false;
        this.showToast('🔴 Offline - Changes will sync when back online', 'warning');
    }

    handleVisibilityChange() {
        if (!document.hidden && this.isOnline) {
            // Page became visible, check for sync
            this.checkAndSync();
        }
    }

    handleBeforeUnload(e) {
        if (this.pendingChanges.length > 0) {
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
        // Reuse the existing form data collection logic
        if (typeof collectFormData === 'function') {
            return collectFormData();
        }
        
        // Fallback basic collection
        return {
            eventId: document.getElementById('eventId')?.value,
            eventName: document.getElementById('eventName')?.value,
            eventDate: document.getElementById('eventDate')?.value,
            lastModified: new Date().toISOString()
        };
    }

    getLastSavedData() {
        return JSON.parse(localStorage.getItem('lastSavedData') || '{}');
    }

    setLastSavedData(data) {
        localStorage.setItem('lastSavedData', JSON.stringify(data));
    }

    scheduleSync(reason = 'scheduled') {
        console.log(`Scheduling sync: ${reason}`);
        
        // Debounce rapid changes
        clearTimeout(this.syncTimeout);
        this.syncTimeout = setTimeout(() => {
            this.checkAndSync();
        }, 2000); // 2 second debounce
    }

    async checkAndSync() {
        if (!this.isOnline || this.syncInProgress) {
            return false;
        }

        const formData = this.collectFormData();
        
        if (!this.hasChanges(formData) && this.pendingChanges.length === 0) {
            return false;
        }

        return await this.performSync(formData);
    }

    async performSync(formData, force = false) {
        if (this.syncInProgress && !force) {
            console.log('Sync already in progress, queuing...');
            this.pendingChanges.push(formData);
            return false;
        }

        this.syncInProgress = true;
        this.showSyncStatus('Syncing...');

        try {
            // Save to localStorage first (offline backup)
            this.saveToLocalStorage(formData);
            
            // If no event ID or new event, don't sync to server yet
            if (!formData.eventId || formData.eventId.includes('new') || !isEditMode) {
                console.log('New event, skipping server sync until saved');
                this.syncInProgress = false;
                this.showSyncStatus('Saved locally');
                return true;
            }

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
        
        console.log('Saved to local storage:', backup);
    }

    async syncToServer(formData) {
        if (!isEditMode) {
            return { success: true, message: 'Not in edit mode' };
        }

        const action = 'updateEvent';
        const result = await apiCall(action, { eventData: formData });
        
        return result;
    }

    handleSyncSuccess(formData) {
        this.setLastSavedData(formData);
        this.lastSyncTime = new Date();
        this.retryCount = 0;
        this.pendingChanges = [];
        
        this.showSyncStatus('Synced ' + this.formatTime(this.lastSyncTime));
        this.updateSyncIndicator('success');
        
        console.log('Sync successful:', this.lastSyncTime);
    }

    handleSyncError(formData, error) {
        this.retryCount++;
        
        // Save to pending changes for retry
        this.pendingChanges.push(formData);
        
        this.showSyncStatus('Sync failed - Retrying...', 'error');
        this.updateSyncIndicator('error');
        
        console.error('Sync error:', error);
        
        // Schedule retry with exponential backoff
        if (this.retryCount <= this.maxRetries) {
            const backoffTime = Math.min(1000 * Math.pow(2, this.retryCount), 30000);
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

    startSyncInterval() {
        this.syncIntervalId = setInterval(() => {
            if (this.isOnline && !this.syncInProgress) {
                this.checkAndSync();
            }
        }, this.syncInterval);
    }

    stopSyncInterval() {
        if (this.syncIntervalId) {
            clearInterval(this.syncIntervalId);
        }
    }

    // Recovery methods
    async recoverFromLocalStorage() {
        const draft = localStorage.getItem('eventDraft');
        if (!draft) return null;

        try {
            const backup = JSON.parse(draft);
            const now = new Date();
            const backupTime = new Date(backup.timestamp);
            const hoursDiff = (now - backupTime) / (1000 * 60 * 60);

            // Only recover backups from last 24 hours
            if (hoursDiff > 24) {
                localStorage.removeItem('eventDraft');
                return null;
            }

            return backup.data;
        } catch (error) {
            console.error('Recovery error:', error);
            return null;
        }
    }

    showRecoveryPrompt(backupData) {
        if (confirm('We found unsaved changes from your last session. Would you like to restore them?')) {
            this.restoreData(backupData);
        } else {
            localStorage.removeItem('eventDraft');
        }
    }

    restoreData(backupData) {
        // Implement based on your form structure
        if (backupData.eventId) {
            document.getElementById('eventId').value = backupData.eventId;
            document.getElementById('eventIdDisplay').textContent = `Event ID: ${backupData.eventId}`;
        }
        
        if (backupData.eventName) {
            document.getElementById('eventName').value = backupData.eventName;
        }
        
        // Add more field restoration as needed
        this.showToast('Data restored from backup', 'success');
    }

    // UI Methods
    showSyncStatus(message, type = 'info') {
        // Update a status element in your UI
        const statusElement = document.getElementById('syncStatus') || this.createSyncStatusElement();
        
        statusElement.textContent = message;
        statusElement.className = `sync-status ${type}`;
        
        // Auto-hide success messages after 3 seconds
        if (type === 'success') {
            setTimeout(() => {
                if (statusElement.textContent === message) {
                    statusElement.textContent = '';
                }
            }, 3000);
        }
    }

    createSyncStatusElement() {
        const statusElement = document.createElement('div');
        statusElement.id = 'syncStatus';
        statusElement.style.cssText = `
            position: fixed;
            bottom: 10px;
            left: 10px;
            background: #333;
            color: white;
            padding: 5px 10px;
            border-radius: 4px;
            font-size: 12px;
            z-index: 10000;
            max-width: 200px;
        `;
        
        document.body.appendChild(statusElement);
        return statusElement;
    }

    updateSyncIndicator(status) {
        const indicator = document.getElementById('syncIndicator') || this.createSyncIndicator();
        
        indicator.className = `sync-indicator ${status}`;
        indicator.title = status === 'success' ? 'Synced' : 
                         status === 'error' ? 'Sync failed' : 
                         status === 'syncing' ? 'Syncing...' : 'Offline';
    }

    createSyncIndicator() {
        const indicator = document.createElement('div');
        indicator.id = 'syncIndicator';
        indicator.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            width: 12px;
            height: 12px;
            border-radius: 50%;
            z-index: 10000;
            border: 2px solid white;
            box-shadow: 0 0 5px rgba(0,0,0,0.5);
        `;
        
        document.body.appendChild(indicator);
        return indicator;
    }

    showToast(message, type = 'info') {
        if (typeof showToast === 'function') {
            showToast(message, type);
        } else {
            console.log(`Toast [${type}]:`, message);
        }
    }

    formatTime(date) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    // Public methods
    forceSync() {
        return this.checkAndSync();
    }

    getSyncStatus() {
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
        window.removeEventListener('online', this.handleOnline);
        window.removeEventListener('offline', this.handleOffline);
    }
}

// ============================================
// AUTOSYNC INTEGRATION
// ============================================

// Initialize autosync when app loads
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

// Add to your existing DOMContentLoaded event
document.addEventListener('DOMContentLoaded', () => {
    // ... your existing initialization code ...
    
    // Initialize autosync
    initializeAutoSync();
});

// Add CSS for sync indicators
const syncStyles = `
.sync-status {
    transition: all 0.3s ease;
}

.sync-status.success {
    background: #28a745 !important;
}

.sync-status.error {
    background: #dc3545 !important;
}

.sync-status.info {
    background: #17a2b8 !important;
}

.sync-indicator {
    transition: background-color 0.3s ease;
}

.sync-indicator.success {
    background: #28a745;
}

.sync-indicator.error {
    background: #dc3545;
    animation: pulse 2s infinite;
}

.sync-indicator.syncing {
    background: #ffc107;
    animation: spin 1s linear infinite;
}

.sync-indicator.offline {
    background: #6c757d;
}

@keyframes pulse {
    0% { opacity: 1; }
    50% { opacity: 0.5; }
    100% { opacity: 1; }
}

@keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
}

.offline-warning {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    background: #dc3545;
    color: white;
    text-align: center;
    padding: 10px;
    z-index: 10001;
    animation: slideDown 0.3s ease-out;
}

@keyframes slideDown {
    from { transform: translateY(-100%); }
    to { transform: translateY(0); }
}
`;

// Inject styles
const styleSheet = document.createElement('style');
styleSheet.textContent = syncStyles;
document.head.appendChild(styleSheet);
