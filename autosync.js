// autosync.js - SIMPLE DEBUG VERSION
console.log('🔧 autosync.js loaded successfully!');

class AutoSync {
    constructor() {
        console.log('🚀 AutoSync constructor called');
        this.isOnline = navigator.onLine;
        this.syncInProgress = false;
        
        this.init();
    }

    init() {
        console.log('✅ AutoSync init() called');
        
        // Create visible UI elements immediately
        this.createUIElements();
        
        // Set up basic event listeners
        this.setupEventListeners();
        
        // Update UI
        this.updateUI();
        
        console.log('🎉 AutoSync fully initialized!');
    }

    createUIElements() {
        console.log('🎨 Creating AutoSync UI elements...');
        
        // Create sync button if it doesn't exist
        if (!document.getElementById('syncButton')) {
            const syncButton = document.createElement('button');
            syncButton.id = 'syncButton';
            syncButton.className = 'settings-btn';
            syncButton.innerHTML = '🔄 Sync Now';
            syncButton.onclick = () => this.forceSync();
            syncButton.style.background = '#28a745';
            
            // Add to header controls
            const headerControls = document.querySelector('.header-controls');
            if (headerControls) {
                headerControls.appendChild(syncButton);
                console.log('✅ Sync button added to header');
            } else {
                console.error('❌ Header controls not found');
            }
        }

        // Create sync indicator if it doesn't exist
        if (!document.getElementById('syncIndicator')) {
            const syncIndicator = document.createElement('div');
            syncIndicator.id = 'syncIndicator';
            syncIndicator.className = 'sync-indicator';
            syncIndicator.title = 'Sync Status';
            syncIndicator.style.cssText = `
                width: 12px;
                height: 12px;
                border-radius: 50%;
                background: #28a745;
                border: 2px solid white;
                box-shadow: 0 0 5px rgba(0,0,0,0.3);
            `;
            
            const headerControls = document.querySelector('.header-controls');
            if (headerControls) {
                headerControls.appendChild(syncIndicator);
                console.log('✅ Sync indicator added to header');
            }
        }

        // Create status bar if it doesn't exist
        if (!document.getElementById('syncStatusBar')) {
            const statusBar = document.createElement('div');
            statusBar.id = 'syncStatusBar';
            statusBar.style.cssText = `
                background: #e3f2fd;
                border: 1px solid #90caf9;
                border-radius: 6px;
                padding: 10px 15px;
                margin: 15px 0;
                display: flex;
                justify-content: space-between;
                align-items: center;
                font-size: 0.9em;
            `;
            statusBar.innerHTML = `
                <span id="syncStatusText">AutoSync: Ready</span>
                <span id="lastSyncTime">Last sync: Never</span>
            `;
            
            // Insert after header but before form
            const header = document.querySelector('header');
            const form = document.getElementById('eventForm');
            if (header && form) {
                header.parentNode.insertBefore(statusBar, form);
                console.log('✅ Status bar added to page');
            } else {
                console.error('❌ Could not find header or form for status bar placement');
            }
        }
    }

    setupEventListeners() {
        console.log('📡 Setting up event listeners...');
        
        // Network status
        window.addEventListener('online', () => {
            console.log('🌐 Online event fired');
            this.isOnline = true;
            this.updateUI();
            this.showToast('🟢 Back online!', 'success');
        });
        
        window.addEventListener('offline', () => {
            console.log('🌐 Offline event fired');
            this.isOnline = false;
            this.updateUI();
            this.showToast('🔴 Offline - Changes saved locally', 'warning');
        });
    }

    updateUI() {
        console.log('🎨 Updating UI...');
        
        const indicator = document.getElementById('syncIndicator');
        const button = document.getElementById('syncButton');
        const statusText = document.getElementById('syncStatusText');
        
        if (indicator) {
            if (!this.isOnline) {
                indicator.style.background = '#dc3545';
                indicator.title = 'Offline';
            } else if (this.syncInProgress) {
                indicator.style.background = '#ffc107';
                indicator.title = 'Syncing...';
            } else {
                indicator.style.background = '#28a745';
                indicator.title = 'Online - Ready to sync';
            }
        }
        
        if (statusText) {
            if (!this.isOnline) {
                statusText.textContent = '🔴 Offline - Changes saved locally';
            } else if (this.syncInProgress) {
                statusText.textContent = '🔄 Syncing changes...';
            } else {
                statusText.textContent = '✅ Online - Ready to sync';
            }
        }
        
        if (button) {
            button.disabled = this.syncInProgress || !this.isOnline;
        }
    }

    async forceSync() {
        console.log('🎯 Manual sync triggered');
        
        if (!this.isOnline) {
            this.showToast('🔴 Cannot sync - You are offline', 'error');
            return;
        }
        
        this.syncInProgress = true;
        this.updateUI();
        this.showToast('🔄 Syncing...', 'info');
        
        // Simulate sync process
        setTimeout(() => {
            this.syncInProgress = false;
            this.updateUI();
            this.showToast('✅ Sync complete!', 'success');
            console.log('✅ Sync simulation complete');
        }, 2000);
    }

    showToast(message, type = 'info') {
        console.log(`📢 Toast [${type}]: ${message}`);
        if (typeof showToast === 'function') {
            showToast(message, type);
        } else {
            // Fallback: use alert for debugging
            alert(`[${type.toUpperCase()}] ${message}`);
        }
    }
}

// Global autoSync instance
let autoSync;

function initializeAutoSync() {
    console.log('🔧 initializeAutoSync() function called');
    
    if (typeof AutoSync !== 'undefined') {
        console.log('✅ AutoSync class is defined, creating instance...');
        autoSync = new AutoSync();
        console.log('🎉 AutoSync instance created:', autoSync);
        
        // Make it globally available for debugging
        window.autoSync = autoSync;
        
        return autoSync;
    } else {
        console.error('❌ AutoSync class is not defined!');
        return null;
    }
}

// Test if the file is loaded
console.log('✅ autosync.js completely loaded and ready');
