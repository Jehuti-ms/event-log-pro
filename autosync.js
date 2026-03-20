// ============================================
// AUTO-SYNC ENHANCEMENTS - REAL-TIME DEVICE SYNC
// ============================================

console.log('🚨 AUTO-SYNC: Loading...');

class AutoSyncManager {
    constructor() {
        this.isEnabled = true;
        this.debounceTimer = null;
        this.lastSyncTime = null;
        this.syncInterval = null;
        this.isSyncing = false;
        this.pendingChanges = false;
        this.realtimeListener = null;
        this.currentEventId = null;
        
        this.init();
    }

    init() {
        console.log('🎯 AUTO-SYNC: Initializing...');
        
        // Wait for auth and Firebase to be ready
        this.waitForAuth().then(() => {
            this.setupEventListeners();
            this.setupPeriodicSync();
            this.createSyncStatusIndicator();
            this.setupRealtimeListener();
            this.setupNetworkListeners();
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

    setupRealtimeListener() {
        console.log('🔄 Setting up real-time listener...');
        
        // Listen for currentEventId changes
        const checkEventChange = () => {
            const eventIdInput = document.getElementById('eventId');
            const newEventId = eventIdInput ? eventIdInput.value : null;
            
            if (newEventId !== this.currentEventId && newEventId) {
                this.currentEventId = newEventId;
                this.subscribeToEventUpdates(newEventId);
            }
        };
        
        // Check periodically for event changes
        setInterval(checkEventChange, 2000);
        
        // Also listen for URL changes
        let currentUrl = window.location.href;
        setInterval(() => {
            if (window.location.href !== currentUrl) {
                currentUrl = window.location.href;
                checkEventChange();
            }
        }, 1000);
    }

    async subscribeToEventUpdates(eventId) {
        if (!eventId) return;
        
        console.log(`🔔 Subscribing to updates for event: ${eventId}`);
        
        // Clean up previous listener
        if (this.realtimeListener && typeof this.realtimeListener === 'function') {
            try {
                this.realtimeListener();
            } catch (e) {
                console.warn('Error cleaning up listener:', e);
            }
        }
        
        // Set up real-time listener for this event
        if (window.firebaseDb && window.firebaseFirestore) {
            const { collection, query, where, onSnapshot } = window.firebaseFirestore;
            
            try {
                // Listen for event changes
                const eventsRef = collection(window.firebaseDb, 'events');
                const eventQuery = query(eventsRef, where('eventId', '==', eventId));
                
                this.realtimeListener = onSnapshot(eventQuery, (snapshot) => {
                    if (!snapshot.empty) {
                        const eventData = snapshot.docs[0].data();
                        console.log('📡 Real-time event update received');
                        this.handleRemoteUpdate(eventData);
                    }
                }, (error) => {
                    console.error('Event listener error:', error);
                });
                
                // Listen for student changes for this event
                const studentsRef = collection(window.firebaseDb, 'students');
                const studentsQuery = query(studentsRef, where('eventId', '==', eventId));
                
                const studentUnsubscribe = onSnapshot(studentsQuery, (snapshot) => {
                    const students = [];
                    snapshot.forEach(doc => {
                        students.push(doc.data());
                    });
                    console.log('📡 Real-time student update received:', students.length, 'students');
                    this.handleRemoteStudentUpdate(students);
                });
                
                // Store both unsubscribe functions
                const originalUnsubscribe = this.realtimeListener;
                this.realtimeListener = () => {
                    originalUnsubscribe();
                    studentUnsubscribe();
                };
                
            } catch (error) {
                console.error('Failed to set up real-time listeners:', error);
            }
        }
    }

    handleRemoteUpdate(eventData) {
        // Check if we're currently editing or if this update came from local save
        if (this.isSyncing) {
            console.log('⏸️ Skipping remote update - local sync in progress');
            return;
        }
        
        console.log('🔄 Applying remote event update');
        
        // Update UI with remote data
        const eventNameInput = document.getElementById('eventName');
        const eventDateInput = document.getElementById('eventDate');
        const eventVenueInput = document.getElementById('eventVenue');
        const departureTimeInput = document.getElementById('departureTime');
        const returnTimeInput = document.getElementById('returnTime');
        const vehicleInput = document.getElementById('vehicle');
        const companyInput = document.getElementById('company');
        const accompanyingInput = document.getElementById('accompanying');
        
        if (eventNameInput && eventData.eventName) eventNameInput.value = eventData.eventName;
        if (eventDateInput && eventData.eventDate) eventDateInput.value = eventData.eventDate;
        if (eventVenueInput && eventData.venue) eventVenueInput.value = eventData.venue;
        if (departureTimeInput && eventData.departure) departureTimeInput.value = eventData.departure;
        if (returnTimeInput && eventData.returnTime) returnTimeInput.value = eventData.returnTime;
        if (vehicleInput && eventData.vehicle) vehicleInput.value = eventData.vehicle;
        if (companyInput && eventData.company) companyInput.value = eventData.company;
        if (accompanyingInput && eventData.accompanying) accompanyingInput.value = eventData.accompanying;
        
        // Update counts
        if (window.updateCounts) {
            setTimeout(() => window.updateCounts(), 100);
        }
        
        this.showSyncStatus('success', 'Synced from cloud');
    }

    handleRemoteStudentUpdate(remoteStudents) {
        if (this.isSyncing) {
            console.log('⏸️ Skipping remote student update - local sync in progress');
            return;
        }
        
        console.log('🔄 Applying remote student update');
        
        // Check if local data matches remote data
        const localStudents = this.getLocalStudents();
        
        // Simple comparison - if lengths are different, update
        if (localStudents.length !== remoteStudents.length) {
            this.updateStudentTableFromRemote(remoteStudents);
        } else {
            // Check if any data is different
            let hasChanges = false;
            for (let i = 0; i < localStudents.length; i++) {
                if (JSON.stringify(localStudents[i]) !== JSON.stringify(remoteStudents[i])) {
                    hasChanges = true;
                    break;
                }
            }
            
            if (hasChanges) {
                this.updateStudentTableFromRemote(remoteStudents);
            }
        }
    }

    getLocalStudents() {
        const students = [];
        const rows = document.querySelectorAll('#studentTable tbody tr');
        
        rows.forEach(row => {
            const cells = row.cells;
            const nameInput = cells[1]?.querySelector('input');
            if (nameInput && nameInput.value.trim()) {
                students.push({
                    name: nameInput.value,
                    form: cells[2]?.querySelector('input')?.value || '',
                    contact: cells[3]?.querySelector('input')?.value || '',
                    illness: cells[4]?.querySelector('.student-illness')?.value || 'None',
                    otherIllness: cells[4]?.querySelector('.illness-other')?.value || '',
                    takingMedication: cells[5]?.querySelector('.medication-checkbox')?.checked || false,
                    medicationDetails: cells[5]?.querySelector('.medication-details')?.value || '',
                    permission: cells[6]?.querySelector('input')?.checked || false,
                    present: cells[7]?.querySelector('input')?.checked || false
                });
            }
        });
        
        return students;
    }

    updateStudentTableFromRemote(remoteStudents) {
        const tbody = document.querySelector('#studentTable tbody');
        if (!tbody) return;
        
        // Temporarily disable event listeners to prevent feedback loop
        this.isSyncing = true;
        
        // Clear existing rows
        tbody.innerHTML = '';
        
        // Add rows from remote data
        remoteStudents.forEach((student, index) => {
            const row = tbody.insertRow();
            const rowNum = index + 1;
            
            const showIllnessOther = student.illness === 'Other (specify)';
            const showMedication = student.takingMedication === true;
            
            row.innerHTML = `
                <td>${rowNum}</td>
                <td><input type="text" name="studentName[]" value="${this.escapeHtml(student.name || '')}"></td>
                <td><input type="text" name="form[]" value="${this.escapeHtml(student.form || '')}"></td>
                <td><input type="text" name="contact[]" value="${this.escapeHtml(student.contact || '')}"></td>
                <td>
                    <select name="illness[]" class="student-illness">
                        <option value="None" ${student.illness === 'None' ? 'selected' : ''}>None</option>
                        <option value="Asthma" ${student.illness === 'Asthma' ? 'selected' : ''}>Asthma</option>
                        <option value="Allergies – Mild" ${student.illness === 'Allergies – Mild' ? 'selected' : ''}>Allergies – Mild</option>
                        <option value="Allergies – Severe / Anaphylaxis" ${student.illness === 'Allergies – Severe / Anaphylaxis' ? 'selected' : ''}>Allergies – Severe / Anaphylaxis</option>
                        <option value="Epilepsy / Seizure disorder" ${student.illness === 'Epilepsy / Seizure disorder' ? 'selected' : ''}>Epilepsy / Seizure disorder</option>
                        <option value="Diabetes" ${student.illness === 'Diabetes' ? 'selected' : ''}>Diabetes</option>
                        <option value="Heart condition" ${student.illness === 'Heart condition' ? 'selected' : ''}>Heart condition</option>
                        <option value="Other (specify)" ${student.illness === 'Other (specify)' ? 'selected' : ''}>Other (specify)</option>
                    </select>
                    <input type="text" name="illnessOther[]" class="illness-other" placeholder="Describe other illness" value="${this.escapeHtml(student.otherIllness || '')}" style="display:${showIllnessOther ? 'block' : 'none'}; margin-top: 5px; width: 100%;">
                </td>
                <td>
                    <input type="checkbox" name="medication[]" class="medication-checkbox" ${student.takingMedication ? 'checked' : ''}>
                    <input type="text" name="medicationDetails[]" class="medication-details" placeholder="Medication name/details" value="${this.escapeHtml(student.medicationDetails || '')}" style="display:${showMedication ? 'block' : 'none'}; margin-top: 5px; width: 100%;">
                </td>
                <td><input type="checkbox" name="permission[]" ${student.permission ? 'checked' : ''}></td>
                <td><input type="checkbox" name="present[]" ${student.present ? 'checked' : ''}></td>
                <td><button type="button" class="delete-row">✖</button></td>
            `;
            
            // Add event listeners
            const illnessSelect = row.querySelector('.student-illness');
            const medicationCheckbox = row.querySelector('.medication-checkbox');
            
            if (illnessSelect) {
                illnessSelect.addEventListener('change', () => this.handleIllnessChange(illnessSelect));
            }
            if (medicationCheckbox) {
                medicationCheckbox.addEventListener('change', () => this.handleMedicationChange(medicationCheckbox));
            }
        });
        
        // Reattach delete button listeners
        this.attachDeleteListeners();
        
        // Update counts
        if (window.updateCounts) {
            setTimeout(() => window.updateCounts(), 100);
        }
        
        // Re-enable sync after a short delay
        setTimeout(() => {
            this.isSyncing = false;
        }, 500);
        
        this.showSyncStatus('success', 'Synced from another device');
    }

    escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    handleIllnessChange(select) {
        const row = select.closest('tr');
        const otherInput = row.querySelector('.illness-other');
        
        if (select.value === 'Other (specify)') {
            otherInput.style.display = 'block';
        } else {
            otherInput.style.display = 'none';
            otherInput.value = '';
        }
        
        this.debouncedSync();
    }

    handleMedicationChange(checkbox) {
        const row = checkbox.closest('tr');
        const medicationInput = row.querySelector('.medication-details');
        
        if (checkbox.checked) {
            medicationInput.style.display = 'block';
        } else {
            medicationInput.style.display = 'none';
            medicationInput.value = '';
        }
        
        this.debouncedSync();
    }

    attachDeleteListeners() {
        document.querySelectorAll('.delete-row').forEach(button => {
            button.removeEventListener('click', this.deleteHandler);
            this.deleteHandler = () => this.handleDeleteRow(button);
            button.addEventListener('click', this.deleteHandler);
        });
    }

    handleDeleteRow(button) {
        const tbody = document.querySelector('#studentTable tbody');
        if (tbody && tbody.rows.length <= 1) {
            this.showToast('At least one student row must remain', 'error');
            return;
        }
        
        button.closest('tr').remove();
        this.renumberRows();
        this.debouncedSync();
    }

    renumberRows() {
        const rows = document.querySelectorAll('#studentTable tbody tr');
        rows.forEach((row, index) => {
            row.cells[0].textContent = index + 1;
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
            
            studentTable.addEventListener('change', (e) => {
                if (e.target.matches('input[type="checkbox"], select')) {
                    this.debouncedSync();
                }
            });

            // Listen for new rows being added
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    if (mutation.addedNodes.length > 0) {
                        this.debouncedSync();
                    }
                });
            });
            const tbody = studentTable.querySelector('tbody');
            if (tbody) {
                observer.observe(tbody, { childList: true });
            }
        }

        // Listen for event form changes
        const eventForm = document.getElementById('eventForm');
        if (eventForm) {
            eventForm.addEventListener('input', (e) => {
                if (e.target.matches('input, select, textarea')) {
                    this.debouncedSync();
                }
            });
        }

        // Listen for event ID changes
        const eventIdInput = document.getElementById('eventId');
        if (eventIdInput) {
            eventIdInput.addEventListener('change', () => {
                this.currentEventId = eventIdInput.value;
                this.subscribeToEventUpdates(this.currentEventId);
            });
        }

        // Listen for accompanying teachers input
        const accompanyingInput = document.getElementById('accompanying');
        if (accompanyingInput) {
            accompanyingInput.addEventListener('input', () => {
                if (window.updateCounts) window.updateCounts();
                this.debouncedSync();
            });
        }

        console.log('✅ AUTO-SYNC: Event listeners set up');
    }

    setupNetworkListeners() {
        // Handle online/offline status
        window.addEventListener('online', () => {
            console.log('🌐 Network online');
            this.showSyncStatus('idle', 'Connected');
            this.performSync(); // Sync when coming back online
        });
        
        window.addEventListener('offline', () => {
            console.log('⚠️ Network offline');
            this.showSyncStatus('idle', 'Offline mode');
        });
        
        // Listen for beforeunload to save pending changes
        window.addEventListener('beforeunload', (e) => {
            if (this.pendingChanges) {
                e.preventDefault();
                e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
                return e.returnValue;
            }
        });
    }

    debouncedSync() {
        if (!this.isEnabled) return;
        
        this.pendingChanges = true;
        
        // Clear existing timer
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }

        // Show syncing status
        this.showSyncStatus('syncing', 'Saving...');

        // Set new timer (1 second delay for faster sync)
        this.debounceTimer = setTimeout(() => {
            this.performSync();
        }, 1000);
    }

    async performSync() {
        if (!this.isEnabled) return;
        if (this.isSyncing) {
            console.log('⏸️ Sync already in progress, skipping...');
            return;
        }
        
        try {
            this.isSyncing = true;
            console.log('🔄 AUTO-SYNC: Performing sync...');
            
            // Check if we have a current event
            const eventId = document.getElementById('eventId')?.value;
            if (!eventId) {
                console.log('⏸️ No event selected, skipping sync');
                this.isSyncing = false;
                return;
            }
            
            // Check if we have a save function
            if (typeof window.saveEvent === 'function') {
                // Temporarily disable remote updates during local save
                const wasSyncing = this.isSyncing;
                this.isSyncing = true;
                
                await window.saveEvent();
                
                this.isSyncing = wasSyncing;
                this.showSyncStatus('success', 'Synced');
                this.lastSyncTime = new Date();
                this.updateLastSyncTime();
                this.pendingChanges = false;
            } else if (typeof window.saveEventToFirebase === 'function') {
                // Use direct Firebase save if available
                const eventData = window.collectFormData ? window.collectFormData() : null;
                if (eventData && eventData.eventName && eventData.eventDate) {
                    const result = await window.saveEventToFirebase(eventData);
                    if (result.success) {
                        this.showSyncStatus('success', 'Synced');
                        this.lastSyncTime = new Date();
                        this.updateLastSyncTime();
                        this.pendingChanges = false;
                    } else {
                        throw new Error(result.error);
                    }
                }
            } else {
                console.warn('❌ AUTO-SYNC: No save function found');
                this.showSyncStatus('error', 'Sync failed');
            }
        } catch (error) {
            console.error('❌ AUTO-SYNC: Sync failed:', error);
            this.showSyncStatus('error', 'Sync failed');
        } finally {
            this.isSyncing = false;
        }
    }

    setupPeriodicSync() {
        // Auto-sync every 30 seconds for cross-device sync
        this.syncInterval = setInterval(() => {
            if (this.isEnabled && document.visibilityState === 'visible' && !this.isSyncing) {
                console.log('⏰ AUTO-SYNC: Periodic sync');
                this.performSync();
            }
        }, 30000); // 30 seconds
    }

    createSyncStatusIndicator() {
        // Create sync status element
        const statusElement = document.createElement('div');
        statusElement.id = 'autoSyncStatus';
        statusElement.innerHTML = `
            <div style="position: fixed; bottom: 20px; right: 20px; background: #333; color: white; padding: 10px 15px; border-radius: 8px; font-size: 12px; z-index: 10000; box-shadow: 0 2px 10px rgba(0,0,0,0.3); display: none; align-items: center; gap: 8px;">
                <span id="syncStatusIcon">⚡</span>
                <span id="syncStatusText">Auto-sync ON</span>
                <span id="lastSyncTime" style="font-size: 10px; opacity: 0.8;"></span>
                <button id="toggleAutoSync" style="background: none; border: 1px solid #666; color: white; border-radius: 4px; padding: 2px 6px; font-size: 10px; cursor: pointer;">ON</button>
            </div>
        `;
        document.body.appendChild(statusElement);

        // Add CSS for status indicator
        const statusCSS = `
            #autoSyncStatus { transition: all 0.3s ease; }
            #autoSyncStatus.syncing { background: #f59e0b !important; }
            #autoSyncStatus.success { background: #10b981 !important; animation: fadeOut 2s ease forwards; }
            #autoSyncStatus.error { background: #ef4444 !important; animation: fadeOut 2s ease forwards; }
            #autoSyncStatus.idle { background: #6b7280 !important; }
            
            @keyframes fadeOut {
                0% { opacity: 1; }
                70% { opacity: 1; }
                100% { opacity: 0; visibility: hidden; }
            }
            
            .sync-pulse {
                animation: syncPulse 1s infinite;
            }
            
            @keyframes syncPulse {
                0% { opacity: 1; }
                50% { opacity: 0.5; }
                100% { opacity: 1; }
            }
            
            @keyframes pulse {
                0% { transform: scale(1); opacity: 1; }
                50% { transform: scale(1.2); opacity: 0.7; }
                100% { transform: scale(1); opacity: 1; }
            }
        `;
        const style = document.createElement('style');
        style.textContent = statusCSS;
        document.head.appendChild(style);

        // Toggle auto-sync
        const toggleBtn = document.getElementById('toggleAutoSync');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                this.isEnabled = !this.isEnabled;
                toggleBtn.textContent = this.isEnabled ? 'ON' : 'OFF';
                this.showSyncStatus(this.isEnabled ? 'idle' : 'idle');
                if (this.isEnabled) {
                    this.showToast('Auto-sync enabled', 'success');
                } else {
                    this.showToast('Auto-sync disabled', 'info');
                }
            });
        }

        this.showSyncStatus('idle', 'Auto-sync ready');
        console.log('✅ AUTO-SYNC: Status indicator created');
    }

    showSyncStatus(status, customText = null) {
        const statusElement = document.getElementById('autoSyncStatus');
        const statusIcon = document.getElementById('syncStatusIcon');
        const statusText = document.getElementById('syncStatusText');
        
        if (!statusElement) return;

        // Remove previous animations
        statusElement.style.animation = '';
        
        switch (status) {
            case 'syncing':
                statusElement.style.background = '#f59e0b';
                statusIcon.textContent = '⏳';
                statusIcon.style.animation = 'syncPulse 1s infinite';
                statusText.textContent = customText || 'Saving...';
                statusElement.style.display = 'flex';
                break;
            case 'success':
                statusElement.style.background = '#10b981';
                statusIcon.textContent = '✅';
                statusIcon.style.animation = '';
                statusText.textContent = customText || 'Synced';
                statusElement.style.display = 'flex';
                // Auto-hide after 2 seconds
                setTimeout(() => {
                    if (statusElement.style.display !== 'none') {
                        statusElement.style.display = 'none';
                    }
                }, 2000);
                break;
            case 'error':
                statusElement.style.background = '#ef4444';
                statusIcon.textContent = '❌';
                statusIcon.style.animation = '';
                statusText.textContent = customText || 'Sync failed';
                statusElement.style.display = 'flex';
                setTimeout(() => {
                    if (statusElement.style.display !== 'none') {
                        statusElement.style.display = 'none';
                    }
                }, 3000);
                break;
            case 'idle':
                statusElement.style.background = '#6b7280';
                statusIcon.textContent = this.isEnabled ? '⚡' : '⭕';
                statusIcon.style.animation = '';
                statusText.textContent = customText || (this.isEnabled ? 'Auto-sync ON' : 'Auto-sync OFF');
                statusElement.style.display = 'flex';
                // Auto-hide after 3 seconds for idle
                setTimeout(() => {
                    if (statusElement.style.display !== 'none' && !this.pendingChanges) {
                        statusElement.style.display = 'none';
                    }
                }, 3000);
                break;
        }
    }

    updateLastSyncTime() {
        const lastSyncElement = document.getElementById('lastSyncTime');
        if (lastSyncElement && this.lastSyncTime) {
            const timeString = this.lastSyncTime.toLocaleTimeString();
            lastSyncElement.textContent = `Last: ${timeString}`;
        }
    }

    showToast(message, type = 'info') {
        if (window.showToast) {
            window.showToast(message, type);
        } else {
            console.log(`[${type.toUpperCase()}] ${message}`);
        }
    }

    // Public method to manually trigger sync
    forceSync() {
        this.pendingChanges = true;
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
        if (this.realtimeListener && typeof this.realtimeListener === 'function') {
            this.realtimeListener();
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
    window.autoSyncManager = autoSyncManager;
}

// Export for global access
window.autoSyncManager = autoSyncManager;
window.initializeAutoSync = initializeAutoSync;
window.forceAutoSync = () => {
    if (autoSyncManager) {
        autoSyncManager.forceSync();
    }
};

// Start when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeAutoSync);
} else {
    initializeAutoSync();
}

console.log('🚨 AUTO-SYNC: Script loaded successfully!');
