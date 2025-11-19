// app.js
const API_URL = 'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec';
let currentEventId = null;
let isEditMode = false;
let allEvents = [];
let isAuthenticated = false;

// Check auth BEFORE DOMContentLoaded to prevent flash
const authStatus = localStorage.getItem('isAuthenticated');
if (authStatus === 'true') {
    isAuthenticated = true;
}

document.addEventListener('DOMContentLoaded', () => {
    console.log('Initializing app...');
    console.log('Landing page element:', document.getElementById('landingPage'));
    console.log('Main container element:', document.getElementById('mainContainer'));
    console.log('Auth status:', isAuthenticated);
    
    // Apply auth state immediately
    applyAuthState();
    initializeDarkMode();
    initializeEventHandlers();
    
    // Only initialize event operations if authenticated
    if (isAuthenticated) {
        generateNewEventId();
        loadAllEvents();
        updateCounts();
        initializeAutoSync();
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
        initializeAutoSync();
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
    
    const result = await apiCall('generateReport', { eventId: currentEventId });
    if (result.success) {
        showToast('Report generation started! Check your Google Drive.', 'success');
        if (result.pdfUrl) {
            window.open(result.pdfUrl, '_blank');
        }
    } else {
        showToast('Error generating report: ' + (result.error || 'Unknown error'), 'error');
    }
}

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
        const nameInput = row.cells[1].querySelector('input');
        if (nameInput.value.trim()) {
            totalStudents++;
        }
        
        if (row.cells[7].querySelector('input').checked) {
            presentCount++;
        }
        
        if (row.cells[6].querySelector('input').checked) {
            permissionCount++;
        }
    });
    
    const totalPeople = totalStudents + accompanyingCount;
    
    document.getElementById('totalStudents').textContent = totalStudents;
    document.getElementById('numTeachers').textContent = accompanyingCount;
    document.getElementById('presentCount').textContent = presentCount;
    document.getElementById('permissionCount').textContent = permissionCount;
    document.getElementById('totalPeople').textContent = totalPeople;
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
