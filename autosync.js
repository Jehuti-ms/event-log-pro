// ============================================
// AUTO-SYNC ENHANCEMENTS
// ============================================

console.log('🚨 AUTO-SYNC: Loading...');

class AutoSyncManager {
    constructor() {
        this.isEnabled = true;
        this.debounceTimer = null;
        this.lastSyncTime = null;
        this.syncInterval = null;
        
        this.init();
    }

    init() {
        console.log('🎯 AUTO-SYNC: Initializing...');
        
        // Wait for main container to be ready
        this.waitForAuth().then(() => {
            this.setupEventListeners();
            this.setupPeriodicSync();
            this.createSyncStatusIndicator();
            console.log('✅ AUTO-SYNC: Initialized successfully');
        });
    }

    waitForAuth() {
        return new Promise((resolve) => {
            const checkAuth = () => {
                const mainContainer = document.getElementById('mainContainer');
                const landingPage = document.getElementById('landingPage');
                
                if (mainContainer && mainContainer.style.display !== 'none' && 
                    landingPage && landingPage.style.display === 'none') {
                    resolve();
                } else {
                    setTimeout(checkAuth, 500);
                }
            };
            checkAuth();
        });
    }

    setupEventListeners() {
        // Listen for input changes in student table
        const studentTable = document.getElementById('studentTable');
        if (studentTable) {
            studentTable.addEventListener('input', (e) => {
                if (e.target.matches('input, select, textarea')) {
                    this.debouncedSync();
                }
            });

            // Listen for new rows being added
            const observer = new MutationObserver((mutations) => {
                let shouldSync = false;
                mutations.forEach((mutation) => {
                    if (mutation.addedNodes.length > 0) {
                        shouldSync = true;
                    }
                });
                if (shouldSync) {
                    this.debouncedSync();
                }
            });
            observer.observe(studentTable.querySelector('tbody'), { childList: true });
        }

        // Listen for event form changes
        const eventForm = document.querySelector('form');
        if (eventForm) {
            eventForm.addEventListener('input', (e) => {
                this.debouncedSync();
            });
        }

        // Listen for URL changes (event selection)
        let currentUrl = window.location.href;
        setInterval(() => {
            if (window.location.href !== currentUrl) {
                currentUrl = window.location.href;
                this.debouncedSync();
            }
        }, 1000);

        console.log('✅ AUTO-SYNC: Event listeners set up');
    }

    debouncedSync() {
        if (!this.isEnabled) return;

        // Clear existing timer
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }

        // Show syncing status
        this.showSyncStatus('syncing');

        // Set new timer (1.5 second delay)
        this.debounceTimer = setTimeout(() => {
            this.performSync();
        }, 1500);
    }

    async performSync() {
        try {
            console.log('🔄 AUTO-SYNC: Performing sync...');
            
            // Get the sync function from your existing code
            const syncFunction = window.saveEventData || window.syncEventData;
            
            if (typeof syncFunction === 'function') {
                await syncFunction();
                this.showSyncStatus('success');
                this.lastSyncTime = new Date();
                this.updateLastSyncTime();
            } else {
                console.warn('❌ AUTO-SYNC: No sync function found');
                this.showSyncStatus('error');
            }
        } catch (error) {
            console.error('❌ AUTO-SYNC: Sync failed:', error);
            this.showSyncStatus('error');
        }
    }

    setupPeriodicSync() {
        // Auto-sync every 2 minutes as backup
        this.syncInterval = setInterval(() => {
            if (this.isEnabled && document.visibilityState === 'visible') {
                console.log('⏰ AUTO-SYNC: Periodic sync');
                this.performSync();
            }
        }, 120000); // 2 minutes
    }

    createSyncStatusIndicator() {
        // Create sync status element
        const statusElement = document.createElement('div');
        statusElement.id = 'autoSyncStatus';
        statusElement.innerHTML = `
            <div style="position: fixed; bottom: 20px; right: 20px; background: #333; color: white; padding: 10px 15px; border-radius: 8px; font-size: 12px; z-index: 10000; box-shadow: 0 2px 10px rgba(0,0,0,0.3); display: none; align-items: center; gap: 8px;">
                <span id="syncStatusIcon">⚡</span>
                <span id="syncStatusText">Syncing...</span>
                <span id="lastSyncTime" style="font-size: 10px; opacity: 0.8;"></span>
                <button id="toggleAutoSync" style="background: none; border: 1px solid #666; color: white; border-radius: 4px; padding: 2px 6px; font-size: 10px; cursor: pointer;">OFF</button>
            </div>
        `;
        document.body.appendChild(statusElement);

        // Add CSS for status indicator
        const statusCSS = `
            #autoSyncStatus.syncing { background: #f59e0b; }
            #autoSyncStatus.success { background: #10b981; }
            #autoSyncStatus.error { background: #ef4444; }
            #autoSyncStatus.idle { background: #6b7280; }
            
            .sync-pulse {
                animation: pulse 2s infinite;
            }
            
            @keyframes pulse {
                0% { opacity: 1; }
                50% { opacity: 0.5; }
                100% { opacity: 1; }
            }
        `;
        const style = document.createElement('style');
        style.textContent = statusCSS;
        document.head.appendChild(style);

        // Toggle auto-sync
        document.getElementById('toggleAutoSync').addEventListener('click', () => {
            this.isEnabled = !this.isEnabled;
            this.updateToggleButton();
            this.showSyncStatus(this.isEnabled ? 'idle' : 'disabled');
        });

        this.updateToggleButton();
        this.showSyncStatus('idle');

        console.log('✅ AUTO-SYNC: Status indicator created');
    }

    showSyncStatus(status) {
        const statusElement = document.getElementById('autoSyncStatus');
        const statusIcon = document.getElementById('syncStatusIcon');
        const statusText = document.getElementById('syncStatusText');
        
        if (!statusElement) return;

        // Remove all classes
        statusElement.className = '';
        
        switch (status) {
            case 'syncing':
                statusElement.classList.add('syncing');
                statusIcon.textContent = '⏳';
                statusText.textContent = 'Auto-saving...';
                statusIcon.classList.add('sync-pulse');
                break;
            case 'success':
                statusElement.classList.add('success');
                statusIcon.textContent = '✅';
                statusText.textContent = 'Auto-saved';
                statusIcon.classList.remove('sync-pulse');
                break;
            case 'error':
                statusElement.classList.add('error');
                statusIcon.textContent = '❌';
                statusText.textContent = 'Sync failed';
                statusIcon.classList.remove('sync-pulse');
                break;
            case 'idle':
                statusElement.classList.add('idle');
                statusIcon.textContent = '⚡';
                statusText.textContent = 'Auto-sync ON';
                statusIcon.classList.remove('sync-pulse');
                break;
            case 'disabled':
                statusElement.classList.add('idle');
                statusIcon.textContent = '⭕';
                statusText.textContent = 'Auto-sync OFF';
                statusIcon.classList.remove('sync-pulse');
                break;
        }

        // Show the element
        statusElement.style.display = 'flex';
        
        // Hide after 3 seconds (except for syncing)
        if (status !== 'syncing') {
            setTimeout(() => {
                if (statusElement.className === status) {
                    statusElement.style.display = 'none';
                }
            }, 3000);
        }
    }

    updateToggleButton() {
        const toggleButton = document.getElementById('toggleAutoSync');
        if (toggleButton) {
            toggleButton.textContent = this.isEnabled ? 'ON' : 'OFF';
        }
    }

    updateLastSyncTime() {
        const lastSyncElement = document.getElementById('lastSyncTime');
        if (lastSyncElement && this.lastSyncTime) {
            const timeString = this.lastSyncTime.toLocaleTimeString();
            lastSyncElement.textContent = `Last: ${timeString}`;
        }
    }

    // Public method to manually trigger sync
    forceSync() {
        this.performSync();
    }

    // Cleanup method
    destroy() {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
        }
        console.log('🧹 AUTO-SYNC: Cleaned up');
    }
}

// Initialize auto-sync
let autoSyncManager;

function initializeAutoSync() {
    if (!autoSyncManager) {
        autoSyncManager = new AutoSyncManager();
    }
}

// Export for global access
window.autoSyncManager = autoSyncManager;
window.initializeAutoSync = initializeAutoSync;

// Start when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeAutoSync);
} else {
    initializeAutoSync();
}

console.log('🚨 AUTO-SYNC: Script loaded successfully!');
