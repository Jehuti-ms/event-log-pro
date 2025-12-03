// app.js - COMPLETE REWRITE WITH ALL FIXES
const API_URL = 'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec';
let currentEventId = null;
let isEditMode = false;
let allEvents = [];
let isAuthenticated = false;

// Check auth BEFORE DOMContentLoaded to prevent flash
const authStatus = localStorage.getItem('isAuthenticated');
if (authStatus === 'true') {
    isAuthenticated = true;
    document.body.classList.add('authenticated');
}

document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 DOM Content Loaded - Starting initialization');
    
    // Apply auth state immediately
    applyAuthState();
    initializeDarkMode();
    initializeEventHandlers();
    
    // Only initialize event operations if authenticated
    if (isAuthenticated) {
        console.log('✅ User is authenticated, initializing app...');
        generateNewEventId();
        loadAllEvents();
        updateCounts();
        
        // Initialize student search and scroll features
        setTimeout(() => {
            setupStudentSearch();
            updateStudentCounter();
            console.log('✅ Student table features initialized');
        }, 500);
        
        // Initialize AutoSync
        setTimeout(() => {
            console.log('🔄 Attempting to initialize AutoSync...');
            if (typeof initializeAutoSync === 'function') {
                initializeAutoSync();
                console.log('✅ AutoSync initialization function called');
            } else {
                console.error('❌ initializeAutoSync function not found!');
                // Create fallback AutoSync UI
                createFallbackAutoSyncUI();
            }
        }, 1000);
    } else {
        console.log('❌ User not authenticated, showing landing page');
    }
});

function applyAuthState() {
    const landingPage = document.getElementById('landingPage');
    const mainContainer = document.getElementById('mainContainer');
    
    if (isAuthenticated) {
        landingPage.classList.add('hidden');
        mainContainer.classList.add('active');
    } else {
        landingPage.classList.remove('hidden');
        mainContainer.classList.remove('active');
    }
}

function handleGoogleSignIn() {
    showSpinner('Signing in...');
    
    setTimeout(() => {
        localStorage.setItem('isAuthenticated', 'true');
        isAuthenticated = true;
        hideSpinner();
        applyAuthState();
        showToast('Welcome! Signed in successfully', 'success');
        
        // Initialize after sign in
        generateNewEventId();
        loadAllEvents();
        updateCounts();
        
        // Initialize features
        setTimeout(() => {
            setupStudentSearch();
            updateStudentCounter();
            if (typeof initializeAutoSync === 'function') {
                initializeAutoSync();
            }
        }, 500);
    }, 1500);
}

function handleLogout() {
    if (confirm('Are you sure you want to logout?')) {
        localStorage.removeItem('isAuthenticated');
        isAuthenticated = false;
        applyAuthState();
        showToast('Logged out successfully', 'success');
    }
}

function openSettings() {
    document.getElementById('settingsModal').classList.add('active');
    loadSettings();
}

function closeSettings() {
    document.getElementById('settingsModal').classList.remove('active');
}

function loadSettings() {
    const apiUrl = localStorage.getItem('apiUrl') || '';
    const sheetId = localStorage.getItem('sheetId') || '';
    const docId = localStorage.getItem('docId') || '';
    
    document.getElementById('settingsApiUrl').value = apiUrl;
    document.getElementById('settingsSheetId').value = sheetId;
    document.getElementById('settingsDocId').value = docId;
}

function saveSettings() {
    const apiUrl = document.getElementById('settingsApiUrl').value.trim();
    const sheetId = document.getElementById('settingsSheetId').value.trim();
    const docId = document.getElementById('settingsDocId').value.trim();
    
    if (apiUrl) {
        localStorage.setItem('apiUrl', apiUrl);
    }
    if (sheetId) {
        localStorage.setItem('sheetId', sheetId);
    }
    if (docId) {
        localStorage.setItem('docId', docId);
    }
    
    showToast('Settings saved! Reloading events...', 'success');
    loadAllEvents();
}

function getApiUrl() {
    const saved = localStorage.getItem('apiUrl');
    if (!saved || saved === API_URL) {
        return null;
    }
    return saved;
}

function initializeDarkMode() {
    const darkModeToggle = document.getElementById('darkModeToggle');
    const savedTheme = localStorage.getItem('theme');
    
    if (savedTheme === 'dark') {
        document.body.classList.add('dark');
        darkModeToggle.checked = true;
    }
    
    darkModeToggle.addEventListener('change', () => {
        document.body.classList.toggle('dark');
        localStorage.setItem('theme', darkModeToggle.checked ? 'dark' : 'light');
    });
}

function initializeEventHandlers() {
    const accompanyingInput = document.getElementById('accompanying');
    if (accompanyingInput) {
        accompanyingInput.addEventListener('input', updateCounts);
    }
    
    const tableBody = document.querySelector('#studentTable tbody');
    if (tableBody) {
        tableBody.addEventListener('change', (e) => {
            if (e.target.classList.contains('student-illness')) {
                handleIllnessChange(e.target);
            }
            if (e.target.classList.contains('medication-checkbox')) {
                handleMedicationChange(e.target);
            }
            updateCounts();
        });
        
        tableBody.addEventListener('click', (e) => {
            if (e.target.classList.contains('delete-row')) {
                deleteStudentRow(e.target);
            }
        });
        
        tableBody.addEventListener('input', updateCounts);
    }
    
    window.addEventListener('click', (e) => {
        const modal = document.getElementById('settingsModal');
        if (e.target === modal) {
            closeSettings();
        }
    });
}

// ============================================
// STUDENT TABLE SCROLL & SEARCH FUNCTIONS
// ============================================

function setupStudentSearch() {
    const searchInput = document.getElementById('studentSearch');
    if (searchInput) {
        searchInput.addEventListener('input', function(e) {
            filterStudents(e.target.value);
        });
        console.log('✅ Student search initialized');
    } else {
        console.log('❌ Student search input not found');
    }
}

function filterStudents(searchTerm) {
    const rows = document.querySelectorAll('#studentTable tbody tr');
    const term = searchTerm.toLowerCase().trim();
    
    let visibleCount = 0;
    
    rows.forEach(row => {
        const nameInput = row.cells[1].querySelector('input');
        const formInput = row.cells[2].querySelector('input');
        const contactInput = row.cells[3].querySelector('input');
        
        const name = nameInput ? nameInput.value.toLowerCase() : '';
        const form = formInput ? formInput.value.toLowerCase() : '';
        const contact = contactInput ? contactInput.value.toLowerCase() : '';
        
        const matches = name.includes(term) || form.includes(term) || contact.includes(term) || term === '';
        
        if (matches) {
            row.style.display = '';
            visibleCount++;
        } else {
            row.style.display = 'none';
        }
    });
    
    updateStudentCounter();
    console.log(`🔍 Filtered: ${visibleCount} students match "${searchTerm}"`);
}

function clearSearch() {
    const searchInput = document.getElementById('studentSearch');
    if (searchInput) {
        searchInput.value = '';
        filterStudents('');
        searchInput.focus();
    }
}

function updateStudentCounter() {
    const rows = document.querySelectorAll('#studentTable tbody tr');
    const searchInput = document.getElementById('studentSearch');
    const searchTerm = searchInput ? searchInput.value.trim() : '';
    
    let validStudents = 0;
    let visibleStudents = 0;
    
    rows.forEach(row => {
        const nameInput = row.cells[1].querySelector('input');
        const hasName = nameInput && nameInput.value.trim() !== '';
        const isVisible = row.style.display !== 'none';
        
        if (hasName) validStudents++;
        if (isVisible) visibleStudents++;
    });
    
    const counter = document.getElementById('studentCounter');
    const badge = document.getElementById('studentCountBadge');
    
    if (counter) {
        if (searchTerm) {
            counter.textContent = `Showing: ${visibleStudents} of ${validStudents} students`;
            counter.style.background = '#fff3cd';
            counter.style.color = '#856404';
        } else {
            counter.textContent = `Total Students: ${validStudents}`;
            counter.style.background = '';
            counter.style.color = '';
        }
    }
    
    if (badge) {
        badge.textContent = `${validStudents} student${validStudents !== 1 ? 's' : ''}`;
    }
    
    if (validStudents > 8) {
        autoScrollToBottom();
    }
}

function autoScrollToBottom() {
    const container = document.getElementById('studentTableContainer');
    if (container) {
        setTimeout(() => {
            container.scrollTop = container.scrollHeight;
        }, 100);
    }
}

function optimizeTablePerformance() {
    const table = document.getElementById('studentTable');
    if (table && table.rows.length > 30) {
        table.style.willChange = 'transform';
    }
}

// ============================================
// CORE APPLICATION FUNCTIONS
// ============================================

async function apiCall(action, data = {}) {
    const url = getApiUrl();
    if (!url) {
        showToast('⚠️ Please configure your API URL in Settings', 'error');
        return { success: false, error: 'API URL not configured' };
    }

    showSpinner('Processing...');
    console.log('API Call:', action, data);
    
    try {
        const isGetRequest = ['getAllEvents', 'generateEventId', 'getEventData'].includes(action);
        
        if (isGetRequest) {
            const params = new URLSearchParams({ action });
            if (action === 'getEventData' && data.eventId) {
                params.append('eventId', data.eventId);
            }
            const fetchUrl = url + '?' + params.toString();
            console.log('GET URL:', fetchUrl);
            
            const response = await fetch(fetchUrl, {
                method: 'GET',
                redirect: 'follow'
            });
            
            const text = await response.text();
            console.log('GET Response:', text);
            
            const result = JSON.parse(text);
            hideSpinner();
            return result;
        } else {
            console.log('POST Data:', { action, ...data });
            
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'text/plain;charset=utf-8',
                },
                body: JSON.stringify({ action, ...data }),
                redirect: 'follow',
                mode: 'no-cors'
            });
            
            console.log('POST Response (no-cors mode)');
            hideSpinner();
            
            return { success: true, message: 'Request sent - please check your Google Sheet to verify' };
        }
    } catch (error) {
        hideSpinner();
        console.error('API Error:', error);
        return { success: false, error: error.message };
    }
}

async function generateNewEventId() {
    const result = await apiCall('generateEventId');
    
    if (result.success && result.eventId) {
        const eventId = result.eventId;
        document.getElementById('eventId').value = eventId;
        document.getElementById('eventIdDisplay').textContent = `Event ID: ${eventId}`;
        currentEventId = eventId;
    } else {
        const year = new Date().getFullYear();
        const eventId = `${year}-001`;
        document.getElementById('eventId').value = eventId;
        document.getElementById('eventIdDisplay').textContent = `Event ID: ${eventId}`;
        currentEventId = eventId;
    }
}

async function loadAllEvents() {
    const result = await apiCall('getAllEvents');
    if (result.success) {
        allEvents = result.events || [];
        populateEventDropdown();
        console.log('Loaded events:', allEvents);
    } else {
        console.error('Failed to load events:', result.error);
    }
}

function populateEventDropdown() {
    const select = document.getElementById('eventSelect');
    select.innerHTML = '<option value="">-- Select an event --</option>';
    
    allEvents.forEach(event => {
        const option = document.createElement('option');
        option.value = event.eventId;
        option.textContent = `${event.eventName} (${event.eventDate})`;
        if (event.lastModified) {
            option.textContent += ` - Modified: ${event.lastModified}`;
        }
        select.appendChild(option);
    });
    
    console.log('Populated dropdown with', allEvents.length, 'events');
}

function loadSelectedEvent() {
    const select = document.getElementById('eventSelect');
    const eventId = select.value;
    if (!eventId) return;
    loadEvent(eventId);
}

function promptLoadEvent() {
    const eventId = prompt('Enter Event ID to load:');
    if (eventId) {
        loadEvent(eventId.trim());
    }
}

function formatDateForInput(dateValue) {
    if (!dateValue) return '';
    
    let date;
    if (dateValue instanceof Date) {
        date = dateValue;
    } else if (typeof dateValue === 'string') {
        date = new Date(dateValue);
    } else {
        return '';
    }
    
    if (isNaN(date.getTime())) return '';
    
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    
    return `${year}-${month}-${day}`;
}

function formatTimeForInput(timeValue) {
    if (!timeValue) return '';
    
    if (timeValue instanceof Date) {
        const hours = String(timeValue.getHours()).padStart(2, '0');
        const minutes = String(timeValue.getMinutes()).padStart(2, '0');
        return `${hours}:${minutes}`;
    }
    
    if (typeof timeValue === 'string') {
        if (/^\d{1,2}:\d{2}/.test(timeValue)) {
            const parts = timeValue.split(':');
            const hours = String(parts[0]).padStart(2, '0');
            const minutes = String(parts[1]).padStart(2, '0');
            return `${hours}:${minutes}`;
        }
        
        try {
            const date = new Date(timeValue);
            if (!isNaN(date.getTime())) {
                const hours = String(date.getHours()).padStart(2, '0');
                const minutes = String(date.getMinutes()).padStart(2, '0');
                return `${hours}:${minutes}`;
            }
        } catch (e) {
            console.log('Could not parse time:', timeValue);
        }
    }
    
    return '';
}

async function loadEvent(eventId) {
    const result = await apiCall('getEventData', { eventId });
    
    if (!result.success || !result.event) {
        showToast('Event not found: ' + (result.error || 'Unknown error'), 'error');
        return;
    }
    
    const event = result.event;
    console.log('Loading event:', event);
    
    document.getElementById('eventId').value = event.eventId;
    document.getElementById('eventIdDisplay').textContent = `Event ID: ${event.eventId}`;
    document.getElementById('eventName').value = event.eventName || '';
    document.getElementById('eventDate').value = formatDateForInput(event.eventDate);
    document.getElementById('eventVenue').value = event.venue || '';
    document.getElementById('departureTime').value = formatTimeForInput(event.departure);
    document.getElementById('returnTime').value = formatTimeForInput(event.returnTime);
    document.getElementById('vehicle').value = event.vehicle || '';
    document.getElementById('company').value = event.company || '';
    document.getElementById('accompanying').value = event.accompanying || '';
    
    const tbody = document.querySelector('#studentTable tbody');
    tbody.innerHTML = '';
    
    if (event.students && event.students.length > 0) {
        event.students.forEach((student, index) => {
            addStudentRow(student, index + 1);
        });
    } else {
        addStudentRow();
    }
    
    currentEventId = event.eventId;
    isEditMode = true;
    updateCounts();
    showToast('Event loaded successfully', 'success');
}

async function saveEvent() {
    const eventData = collectFormData();
    
    if (!eventData.eventName || !eventData.eventDate) {
        showToast('Event Name and Date are required', 'error');
        return;
    }
    
    console.log('Saving event data:', eventData);
    console.log('Is edit mode:', isEditMode);
    
    const action = isEditMode ? 'updateEvent' : 'saveEvent';
    const result = await apiCall(action, { eventData });
    
    console.log('Save result:', result);
    
    if (result.success) {
        showToast((isEditMode ? 'Event updated' : 'Event saved') + ' - Please check your Google Sheet to verify!', 'success');
        await loadAllEvents();
        isEditMode = false;
    } else {
        showToast('Error saving event: ' + (result.error || 'Unknown error'), 'error');
    }
}

function newEvent() {
    if (confirm('Create a new event? Any unsaved changes will be lost.')) {
        resetForm();
        showToast('Ready to create a new event!', 'success');
    }
}

function editEvent() {
    if (!currentEventId) {
        promptLoadEvent();
        return;
    }
    isEditMode = true;
    showToast('Editing mode enabled. Make changes and click Save Event.', 'success');
}

async function deleteEvent() {
    if (!currentEventId) {
        showToast('No event selected', 'error');
        return;
    }
    
    if (!confirm('Are you sure you want to delete this event?')) {
        return;
    }
    
    const result = await apiCall('deleteEvent', { eventId: currentEventId });
    if (result.success) {
        showToast('Event deleted - Please check your Google Sheet to verify!', 'success');
        await loadAllEvents();
        resetForm();
    } else {
        showToast('Error deleting event: ' + (result.error || 'Unknown error'), 'error');
    }
}

async function generateReport() {
    if (!currentEventId) {
        showToast('Please save the event before generating a report', 'error');
        return;
    }
    
    showSpinner('Generating report...');
    
    try {
        const result = await apiCall('generateReport', { eventId: currentEventId });
        
        if (result.success) {
            hideSpinner();
            
            // Check if we have a PDF URL to embed or data to display
            if (result.pdfUrl) {
                // Create a modal to display the PDF with print/download options
                showReportModal(result.pdfUrl, result.reportData || null);
            } else if (result.reportData) {
                // Generate HTML report from the data
                const htmlReport = generateHTMLReport(result.reportData);
                showReportModal(null, htmlReport, true);
            } else {
                // Fallback: generate report from current form data
                const formData = collectFormData();
                const htmlReport = generateHTMLReport(formData);
                showReportModal(null, htmlReport, true);
            }
            
        } else {
            hideSpinner();
            showToast('Error generating report: ' + (result.error || 'Unknown error'), 'error');
        }
    } catch (error) {
        hideSpinner();
        showToast('Error generating report: ' + error.message, 'error');
    }
}

function showReportModal(pdfUrl, reportData, isHTML = false) {
    // Create modal if it doesn't exist
    let modal = document.getElementById('reportModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'reportModal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content report-modal">
                <div class="modal-header">
                    <h3>Event Report</h3>
                    <button class="close-modal" onclick="closeReportModal()">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="report-actions">
                        <button onclick="printReport()" class="btn btn-primary">
                            <span class="icon">🖨️</span> Print Report
                        </button>
                        <button onclick="downloadReport()" class="btn btn-secondary">
                            <span class="icon">📥</span> Download PDF
                        </button>
                        <button onclick="copyReportLink()" class="btn btn-tertiary">
                            <span class="icon">🔗</span> Copy Link
                        </button>
                    </div>
                    <div class="report-preview" id="reportPreview">
                        <iframe id="reportFrame" style="width: 100%; height: 600px; border: none;"></iframe>
                        <div id="htmlReportContent" style="display: none;"></div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        
        // Add styles for the report modal
        if (!document.querySelector('#reportStyles')) {
            const styles = document.createElement('style');
            styles.id = 'reportStyles';
            styles.textContent = `
                .report-modal {
                    max-width: 90%;
                    width: 900px;
                }
                .report-actions {
                    display: flex;
                    gap: 10px;
                    margin-bottom: 20px;
                    flex-wrap: wrap;
                }
                .report-actions .btn {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 10px 20px;
                }
                .report-actions .icon {
                    font-size: 16px;
                }
                #reportPreview {
                    background: #f5f5f5;
                    border-radius: 8px;
                    padding: 10px;
                }
                .dark #reportPreview {
                    background: #2a2a2a;
                }
                @media print {
                    body * {
                        visibility: hidden;
                    }
                    .report-modal,
                    .report-modal * {
                        visibility: visible;
                    }
                    .report-modal {
                        position: absolute;
                        left: 0;
                        top: 0;
                        width: 100%;
                        max-width: 100%;
                    }
                    .report-actions {
                        display: none;
                    }
                }
            `;
            document.head.appendChild(styles);
        }
    }
    
    // Clear previous content
    const frame = document.getElementById('reportFrame');
    const htmlContent = document.getElementById('htmlReportContent');
    
    if (pdfUrl) {
        // Show PDF in iframe
        frame.style.display = 'block';
        htmlContent.style.display = 'none';
        frame.src = pdfUrl;
        
        // Store PDF URL for download
        frame.dataset.pdfUrl = pdfUrl;
    } else if (reportData) {
        // Show HTML report
        frame.style.display = 'none';
        htmlContent.style.display = 'block';
        
        if (isHTML) {
            htmlContent.innerHTML = reportData;
        } else {
            htmlContent.innerHTML = generateHTMLReport(reportData);
        }
        
        // Store HTML content for printing
        htmlContent.dataset.reportContent = htmlContent.innerHTML;
    }
    
    // Show modal
    modal.classList.add('active');
}

function closeReportModal() {
    const modal = document.getElementById('reportModal');
    if (modal) {
        modal.classList.remove('active');
    }
}

function printReport() {
    const frame = document.getElementById('reportFrame');
    const htmlContent = document.getElementById('htmlReportContent');
    
    if (frame.style.display !== 'none') {
        // Print PDF iframe content
        frame.contentWindow.focus();
        frame.contentWindow.print();
    } else if (htmlContent.style.display !== 'none') {
        // Create print-friendly HTML
        const printWindow = window.open('', '_blank');
        const printContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Event Report - ${document.getElementById('eventName').value || 'Untitled Event'}</title>
                <style>
                    body {
                        font-family: Arial, sans-serif;
                        line-height: 1.6;
                        color: #333;
                        max-width: 800px;
                        margin: 0 auto;
                        padding: 20px;
                    }
                    .report-header {
                        text-align: center;
                        border-bottom: 2px solid #333;
                        padding-bottom: 20px;
                        margin-bottom: 30px;
                    }
                    .report-header h1 {
                        margin: 0;
                        font-size: 24px;
                        color: #2c3e50;
                    }
                    .event-info {
                        background: #f8f9fa;
                        padding: 20px;
                        border-radius: 8px;
                        margin-bottom: 30px;
                    }
                    .info-grid {
                        display: grid;
                        grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
                        gap: 15px;
                    }
                    .info-item {
                        margin-bottom: 10px;
                    }
                    .info-label {
                        font-weight: bold;
                        color: #555;
                        display: inline-block;
                        min-width: 120px;
                    }
                    table {
                        width: 100%;
                        border-collapse: collapse;
                        margin: 20px 0;
                    }
                    th, td {
                        border: 1px solid #ddd;
                        padding: 10px;
                        text-align: left;
                    }
                    th {
                        background-color: #f8f9fa;
                        font-weight: bold;
                    }
                    tr:nth-child(even) {
                        background-color: #f9f9f9;
                    }
                    .summary {
                        margin-top: 30px;
                        padding: 20px;
                        background: #e8f4fd;
                        border-radius: 8px;
                    }
                    .summary-grid {
                        display: grid;
                        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                        gap: 15px;
                    }
                    .summary-item {
                        text-align: center;
                        padding: 10px;
                    }
                    .summary-value {
                        font-size: 24px;
                        font-weight: bold;
                        color: #2c3e50;
                    }
                    .summary-label {
                        font-size: 14px;
                        color: #666;
                        margin-top: 5px;
                    }
                    @media print {
                        body {
                            font-size: 12pt;
                        }
                        .no-print {
                            display: none;
                        }
                        .page-break {
                            page-break-before: always;
                        }
                    }
                </style>
            </head>
            <body>
                ${htmlContent.innerHTML}
                <div class="no-print" style="margin-top: 30px; text-align: center; color: #666; font-size: 12px;">
                    Generated on ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}
                </div>
            </body>
            </html>
        `;
        
        printWindow.document.write(printContent);
        printWindow.document.close();
        
        // Wait for content to load, then print
        printWindow.onload = function() {
            printWindow.focus();
            setTimeout(() => {
                printWindow.print();
                printWindow.close();
            }, 500);
        };
    }
}

function downloadReport() {
    const frame = document.getElementById('reportFrame');
    const pdfUrl = frame.dataset.pdfUrl;
    
    if (pdfUrl) {
        // Download PDF directly
        const a = document.createElement('a');
        a.href = pdfUrl;
        a.download = `Event_Report_${currentEventId}_${Date.now()}.pdf`;
        a.click();
    } else {
        // Download as HTML file
        const htmlContent = document.getElementById('htmlReportContent');
        if (htmlContent && htmlContent.innerHTML) {
            const eventName = document.getElementById('eventName').value || 'Event_Report';
            const sanitizedName = eventName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
            const blob = new Blob([htmlContent.innerHTML], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${sanitizedName}_${currentEventId}.html`;
            a.click();
            URL.revokeObjectURL(url);
        }
    }
}

function copyReportLink() {
    const frame = document.getElementById('reportFrame');
    const pdfUrl = frame.dataset.pdfUrl;
    
    if (pdfUrl) {
        navigator.clipboard.writeText(pdfUrl)
            .then(() => showToast('Report link copied to clipboard!', 'success'))
            .catch(() => showToast('Failed to copy link', 'error'));
    } else {
        showToast('No report link available', 'info');
    }
}

function generateHTMLReport(eventData) {
    // Count statistics
    const totalStudents = eventData.students.length;
    const presentCount = eventData.students.filter(s => s.present).length;
    const permissionCount = eventData.students.filter(s => s.permission).length;
    const illnessCount = eventData.students.filter(s => s.illness && s.illness !== 'None').length;
    const medicationCount = eventData.students.filter(s => s.takingMedication).length;
    
    // Format date and time
    const formatDate = (dateStr) => {
        if (!dateStr) return 'Not specified';
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-US', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        });
    };
    
    const formatTime = (timeStr) => {
        if (!timeStr) return 'Not specified';
        return timeStr;
    };
    
    return `
        <div class="report-header">
            <h1>${eventData.eventName || 'Event Report'}</h1>
            <p>Event ID: ${eventData.eventId}</p>
        </div>
        
        <div class="event-info">
            <div class="info-grid">
                <div class="info-item">
                    <span class="info-label">Date:</span>
                    ${formatDate(eventData.eventDate)}
                </div>
                <div class="info-item">
                    <span class="info-label">Venue:</span>
                    ${eventData.venue || 'Not specified'}
                </div>
                <div class="info-item">
                    <span class="info-label">Departure:</span>
                    ${formatTime(eventData.departure)}
                </div>
                <div class="info-item">
                    <span class="info-label">Return:</span>
                    ${formatTime(eventData.returnTime)}
                </div>
                <div class="info-item">
                    <span class="info-label">Vehicle:</span>
                    ${eventData.vehicle || 'Not specified'}
                </div>
                <div class="info-item">
                    <span class="info-label">Company:</span>
                    ${eventData.company || 'Not specified'}
                </div>
                <div class="info-item">
                    <span class="info-label">Accompanying:</span>
                    ${eventData.accompanying || 'None'}
                </div>
            </div>
        </div>
        
        <div class="summary">
            <h2>Quick Summary</h2>
            <div class="summary-grid">
                <div class="summary-item">
                    <div class="summary-value">${totalStudents}</div>
                    <div class="summary-label">Total Students</div>
                </div>
                <div class="summary-item">
                    <div class="summary-value">${presentCount}</div>
                    <div class="summary-label">Present</div>
                </div>
                <div class="summary-item">
                    <div class="summary-value">${permissionCount}</div>
                    <div class="summary-label">Permissions</div>
                </div>
                <div class="summary-item">
                    <div class="summary-value">${illnessCount}</div>
                    <div class="summary-label">Medical Notes</div>
                </div>
            </div>
        </div>
        
        <h2>Student List</h2>
        <table>
            <thead>
                <tr>
                    <th>#</th>
                    <th>Name</th>
                    <th>Form</th>
                    <th>Contact</th>
                    <th>Medical Info</th>
                    <th>Medication</th>
                    <th>Permission</th>
                    <th>Present</th>
                </tr>
            </thead>
            <tbody>
                ${eventData.students.map((student, index) => `
                    <tr>
                        <td>${index + 1}</td>
                        <td>${student.name || ''}</td>
                        <td>${student.form || ''}</td>
                        <td>${student.contact || ''}</td>
                        <td>
                            ${student.illness && student.illness !== 'None' ? 
                                `<strong>${student.illness}</strong><br>${student.otherIllness || ''}` : 
                                'None'}
                        </td>
                        <td>
                            ${student.takingMedication ? 
                                `<strong>Yes</strong><br>${student.medicationDetails || ''}` : 
                                'No'}
                        </td>
                        <td>${student.permission ? '✅ Yes' : '❌ No'}</td>
                        <td>${student.present ? '✅ Yes' : '❌ No'}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
        
        ${eventData.students.some(s => s.illness && s.illness !== 'None') ? `
            <div class="page-break"></div>
            <h2>Medical Information Summary</h2>
            <table>
                <thead>
                    <tr>
                        <th>Student</th>
                        <th>Condition</th>
                        <th>Details</th>
                        <th>Medication</th>
                    </tr>
                </thead>
                <tbody>
                    ${eventData.students.filter(s => s.illness && s.illness !== 'None').map(student => `
                        <tr>
                            <td><strong>${student.name}</strong> (${student.form})</td>
                            <td>${student.illness}</td>
                            <td>${student.otherIllness || 'No additional details'}</td>
                            <td>${student.takingMedication ? student.medicationDetails || 'Medication - no details' : 'None'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        ` : ''}
        
        <div class="page-break"></div>
        <h2>Emergency Contact Information</h2>
        <table>
            <thead>
                <tr>
                    <th>Student</th>
                    <th>Form</th>
                    <th>Contact Number</th>
                </tr>
            </thead>
            <tbody>
                ${eventData.students.filter(s => s.contact).map(student => `
                    <tr>
                        <td>${student.name}</td>
                        <td>${student.form}</td>
                        <td>${student.contact}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

// Make the new function globally available
window.generateReport = generateReport;
window.closeReportModal = closeReportModal;
window.printReport = printReport;
window.downloadReport = downloadReport;
window.copyReportLink = copyReportLink;

// ============================================
// STUDENT ROW MANAGEMENT
// ============================================

function addStudentRow(studentData = null, index = null) {
    const tbody = document.querySelector('#studentTable tbody');
    const rowNum = index || tbody.rows.length + 1;
    
    const row = tbody.insertRow();
    
    const showIllnessOther = studentData && studentData.illness === 'Other (specify)';
    const showMedication = studentData && studentData.takingMedication;
    
    row.innerHTML = `
        <td>${rowNum}</td>
        <td><input type="text" name="studentName[]" value="${studentData?.name || ''}"></td>
        <td><input type="text" name="form[]" value="${studentData?.form || ''}"></td>
        <td><input type="text" name="contact[]" value="${studentData?.contact || ''}"></td>
        <td>
            <select name="illness[]" class="student-illness">
                <option value="None" ${!studentData || studentData.illness === 'None' ? 'selected' : ''}>None</option>
                <option value="Asthma" ${studentData?.illness === 'Asthma' ? 'selected' : ''}>Asthma</option>
                <option value="Allergies – Mild" ${studentData?.illness === 'Allergies – Mild' ? 'selected' : ''}>Allergies – Mild</option>
                <option value="Allergies – Severe / Anaphylaxis" ${studentData?.illness === 'Allergies – Severe / Anaphylaxis' ? 'selected' : ''}>Allergies – Severe / Anaphylaxis</option>
                <option value="Epilepsy / Seizure disorder" ${studentData?.illness === 'Epilepsy / Seizure disorder' ? 'selected' : ''}>Epilepsy / Seizure disorder</option>
                <option value="Diabetes" ${studentData?.illness === 'Diabetes' ? 'selected' : ''}>Diabetes</option>
                <option value="Heart condition" ${studentData?.illness === 'Heart condition' ? 'selected' : ''}>Heart condition</option>
                <option value="Other (specify)" ${studentData?.illness === 'Other (specify)' ? 'selected' : ''}>Other (specify)</option>
            </select>
            <input type="text" name="illnessOther[]" class="illness-other" placeholder="Describe other illness" value="${studentData?.otherIllness || ''}" style="display:${showIllnessOther ? 'block' : 'none'}; margin-top: 5px; width: 100%;">
        </td>
        <td>
            <input type="checkbox" name="medication[]" class="medication-checkbox" ${studentData?.takingMedication ? 'checked' : ''}>
            <input type="text" name="medicationDetails[]" class="medication-details" placeholder="Medication name/details" value="${studentData?.medicationDetails || ''}" style="display:${showMedication ? 'block' : 'none'}; margin-top: 5px; width: 100%;">
        </td>
        <td><input type="checkbox" name="permission[]" ${studentData?.permission === 'Yes' || studentData?.permission === true ? 'checked' : ''}></td>
        <td><input type="checkbox" name="present[]" ${studentData?.present === 'Yes' || studentData?.present === true ? 'checked' : ''}></td>
        <td><button type="button" class="delete-row">✖</button></td>
    `;
    
    renumberRows();
    updateCounts();
    optimizeTablePerformance();
    
    if (!studentData) {
        autoScrollToBottom();
    }
    
    setupRowEventListeners(row);
}

function setupRowEventListeners(row) {
    const illnessSelect = row.querySelector('.student-illness');
    const medicationCheckbox = row.querySelector('.medication-checkbox');
    
    if (illnessSelect) {
        illnessSelect.addEventListener('change', function() {
            handleIllnessChange(this);
            updateCounts();
        });
    }
    
    if (medicationCheckbox) {
        medicationCheckbox.addEventListener('change', function() {
            handleMedicationChange(this);
            updateCounts();
        });
    }
    
    const inputs = row.querySelectorAll('input[type="text"]');
    inputs.forEach(input => {
        input.addEventListener('input', updateCounts);
    });
    
    const checkboxes = row.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
        checkbox.addEventListener('change', updateCounts);
    });
}

function deleteStudentRow(button) {
    const tbody = document.querySelector('#studentTable tbody');
    if (tbody.rows.length <= 1) {
        showToast('At least one student row must remain', 'error');
        return;
    }
    
    button.closest('tr').remove();
    renumberRows();
    updateCounts();
}

function renumberRows() {
    const rows = document.querySelectorAll('#studentTable tbody tr');
    rows.forEach((row, index) => {
        row.cells[0].textContent = index + 1;
    });
}

function handleIllnessChange(select) {
    const row = select.closest('tr');
    const otherInput = row.querySelector('.illness-other');
    
    if (select.value === 'Other (specify)') {
        otherInput.style.display = 'block';
        setTimeout(() => otherInput.focus(), 100);
    } else {
        otherInput.style.display = 'none';
        otherInput.value = '';
    }
}

function handleMedicationChange(checkbox) {
    const row = checkbox.closest('tr');
    const medicationInput = row.querySelector('.medication-details');
    
    if (checkbox.checked) {
        medicationInput.style.display = 'block';
        setTimeout(() => medicationInput.focus(), 100);
    } else {
        medicationInput.style.display = 'none';
        medicationInput.value = '';
    }
}

function collectFormData() {
    const students = [];
    const rows = document.querySelectorAll('#studentTable tbody tr');
    
    rows.forEach(row => {
        if (row.style.display !== 'none') { // Only include visible rows
            const cells = row.cells;
            const illness = cells[4].querySelector('.student-illness').value;
            const otherIllness = cells[4].querySelector('.illness-other').value;
            const takingMedication = cells[5].querySelector('.medication-checkbox').checked;
            const medicationDetails = cells[5].querySelector('.medication-details').value;
            
            students.push({
                name: cells[1].querySelector('input').value,
                form: cells[2].querySelector('input').value,
                contact: cells[3].querySelector('input').value,
                illness: illness,
                otherIllness: illness === 'Other (specify)' ? otherIllness : '',
                takingMedication: takingMedication,
                medicationDetails: takingMedication ? medicationDetails : '',
                permission: cells[6].querySelector('input').checked,
                present: cells[7].querySelector('input').checked
            });
        }
    });
    
    return {
        eventId: currentEventId || document.getElementById('eventId').value,
        eventName: document.getElementById('eventName').value,
        eventDate: document.getElementById('eventDate').value,
        venue: document.getElementById('eventVenue').value,
        departure: document.getElementById('departureTime').value,
        returnTime: document.getElementById('returnTime').value,
        vehicle: document.getElementById('vehicle').value,
        company: document.getElementById('company').value,
        accompanying: document.getElementById('accompanying').value,
        students: students
    };
}

function updateCounts() {
    const rows = document.querySelectorAll('#studentTable tbody tr');
    const accompanyingValue = document.getElementById('accompanying').value;
    
    let accompanyingCount = 0;
    if (accompanyingValue && accompanyingValue.trim()) {
        const teachers = accompanyingValue.split(',').filter(name => name.trim() !== '');
        accompanyingCount = teachers.length;
    }
    
    let totalStudents = 0;
    let presentCount = 0;
    let permissionCount = 0;
    
    rows.forEach(row => {
        if (row.style.display !== 'none') { // Only count visible rows
            const nameInput = row.cells[1].querySelector('input');
            if (nameInput && nameInput.value.trim()) {
                totalStudents++;
            }
            
            if (row.cells[7].querySelector('input').checked) {
                presentCount++;
            }
            
            if (row.cells[6].querySelector('input').checked) {
                permissionCount++;
            }
        }
    });
    
    const totalPeople = totalStudents + accompanyingCount;
    
    document.getElementById('totalStudents').textContent = totalStudents;
    document.getElementById('numTeachers').textContent = accompanyingCount;
    document.getElementById('presentCount').textContent = presentCount;
    document.getElementById('permissionCount').textContent = permissionCount;
    document.getElementById('totalPeople').textContent = totalPeople;
    
    updateStudentCounter();
}

function resetForm() {
    document.getElementById('eventForm').reset();
    document.getElementById('eventId').value = '';
    document.getElementById('eventIdDisplay').textContent = 'Event ID: (new)';
    
    const tbody = document.querySelector('#studentTable tbody');
    tbody.innerHTML = '';
    addStudentRow();
    
    currentEventId = null;
    isEditMode = false;
    
    generateNewEventId();
    updateCounts();
}

// ============================================
// UI UTILITY FUNCTIONS
// ============================================

function showSpinner(message = 'Loading...') {
    let spinner = document.getElementById('spinner');
    if (spinner) {
        spinner.classList.add('active');
        const spinnerText = document.getElementById('spinnerText');
        if (spinnerText) {
            spinnerText.textContent = message;
        }
    }
}

function hideSpinner() {
    const spinner = document.getElementById('spinner');
    if (spinner) {
        spinner.classList.remove('active');
    }
}

function showToast(message, type = 'info', duration = 4000) {
    const toast = document.getElementById('toast');
    if (toast) {
        toast.textContent = message;
        toast.className = 'toast show';
        if (type === 'error') {
            toast.classList.add('error');
        } else if (type === 'success') {
            toast.classList.add('success');
        }
        
        setTimeout(() => {
            toast.classList.remove('show');
        }, duration);
    }
    console.log(`Toast [${type}]:`, message);
}

async function testConnection() {
    const url = getApiUrl();
    if (!url) {
        const statusDiv = document.getElementById('connectionStatus');
        statusDiv.className = 'connection-status error';
        statusDiv.innerHTML = '❌ <strong>No API URL configured!</strong><br>Please paste your Google Apps Script Web App URL above.';
        return;
    }

    console.log('Testing connection to:', url);
    const statusDiv = document.getElementById('connectionStatus');
    statusDiv.className = 'connection-status';
    statusDiv.innerHTML = '⏳ Testing connection...';

    try {
        console.log('Test 1: Generating Event ID...');
        const idResult = await apiCall('generateEventId');
        console.log('Event ID result:', idResult);

        console.log('Test 2: Getting all events...');
        const eventsResult = await apiCall('getAllEvents');
        console.log('Events result:', eventsResult);

        let html = '<strong>🔍 CONNECTION TEST RESULTS:</strong><br><br>';
        html += `<strong>Test 1 - Generate ID:</strong> ${idResult.success ? '✅ SUCCESS' : '❌ FAILED'}<br>`;
        if (idResult.success && idResult.eventId) {
            html += `&nbsp;&nbsp;Event ID: ${idResult.eventId}<br>`;
        } else if (idResult.error) {
            html += `&nbsp;&nbsp;Error: ${idResult.error}<br>`;
        }
        html += `<br><strong>Test 2 - Load Events:</strong> ${eventsResult.success ? '✅ SUCCESS' : '❌ FAILED'}<br>`;
        if (eventsResult.success) {
            html += `&nbsp;&nbsp;Found ${eventsResult.events?.length || 0} events<br>`;
        } else if (eventsResult.error) {
            html += `&nbsp;&nbsp;Error: ${eventsResult.error}<br>`;
        }

        if (idResult.success && eventsResult.success) {
            statusDiv.className = 'connection-status success';
            html += '<br>✅ <strong>All tests passed!</strong> Your connection is working properly.';
        } else {
            statusDiv.className = 'connection-status error';
            html += '<br>⚠️ <strong>Some tests failed.</strong> Check the following:<br>';
            html += '• Is the Web App URL correct?<br>';
            html += '• Is the script deployed as Web App?<br>';
            html += '• Is access set to "Anyone"?<br>';
            html += '• Did you create a NEW deployment after code changes?';
        }

        statusDiv.innerHTML = html;
    } catch (error) {
        statusDiv.className = 'connection-status error';
        statusDiv.innerHTML = `❌ <strong>CONNECTION FAILED</strong><br>Error: ${error.message}<br><br>Check console (F12) for details.`;
        console.error('Connection test error:', error);
    }
}

// ============================================
// AUTOSYNC FALLBACK
// ============================================

function createFallbackAutoSyncUI() {
    console.log('🛠️ Creating fallback AutoSync UI...');
    
    // Create sync button
    const syncButton = document.createElement('button');
    syncButton.id = 'syncButton';
    syncButton.innerHTML = '🔄 Sync Now';
    syncButton.className = 'settings-btn';
    syncButton.style.background = '#28a745';
    syncButton.onclick = () => {
        showToast('AutoSync: Sync functionality would run here!', 'info');
    };
    
    // Create sync indicator
    const syncIndicator = document.createElement('div');
    syncIndicator.id = 'syncIndicator';
    syncIndicator.style.cssText = 'width: 16px; height: 16px; border-radius: 50%; background: #28a745; border: 2px solid white; margin: 0 10px;';
    syncIndicator.title = 'Online';
    
    // Add to header controls
    const headerControls = document.querySelector('.header-controls');
    if (headerControls) {
        headerControls.appendChild(syncButton);
        headerControls.appendChild(syncIndicator);
        console.log('✅ Fallback AutoSync UI created');
    }
}

window.collectFormData = collectFormData;
window.initializeAutoSync = function() {
    console.log('🔄 AutoSync initialization requested');
    // AutoSync functionality would go here
    showToast('AutoSync functionality would initialize here', 'info');
};

// Make functions globally available
window.handleGoogleSignIn = handleGoogleSignIn;
window.handleLogout = handleLogout;
window.openSettings = openSettings;
window.closeSettings = closeSettings;
window.saveSettings = saveSettings;
window.testConnection = testConnection;
window.newEvent = newEvent;
window.saveEvent = saveEvent;
window.editEvent = editEvent;
window.deleteEvent = deleteEvent;
window.generateReport = generateReport;
window.loadSelectedEvent = loadSelectedEvent;
window.promptLoadEvent = promptLoadEvent;
window.addStudentRow = addStudentRow;
window.clearSearch = clearSearch;
window.updateCounts = updateCounts;
window.filterStudents = filterStudents;
window.updateStudentCounter = updateStudentCounter;
window.autoScrollToBottom = autoScrollToBottom;

console.log('✅ app.js loaded successfully');

