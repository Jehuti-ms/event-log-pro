// app.js - COMPLETE FIREBASE-ONLY VERSION WITH PROPER IMPORTS
console.log('📦 Firebase App.js loaded');

// Import Firebase functions (these will be available from the module in index.html)
// Note: These are actually imported in the HTML, so we reference them via window.firebase
let collection, getDocs, query, where, orderBy, addDoc, setDoc, deleteDoc, doc, serverTimestamp;

// Global variables
let currentEventId = null;
let isEditMode = false;
let allEvents = [];
let isAuthenticated = false;

// Initialize Firebase references when available
function initFirebaseRefs() {
    if (window.firebaseFirestore) {
        collection = window.firebaseFirestore.collection;
        getDocs = window.firebaseFirestore.getDocs;
        query = window.firebaseFirestore.query;
        where = window.firebaseFirestore.where;
        orderBy = window.firebaseFirestore.orderBy;
        addDoc = window.firebaseFirestore.addDoc;
        setDoc = window.firebaseFirestore.setDoc;
        deleteDoc = window.firebaseFirestore.deleteDoc;
        doc = window.firebaseFirestore.doc;
        serverTimestamp = window.firebaseFirestore.serverTimestamp;
        console.log('✅ Firebase Firestore functions initialized');
        return true;
    }
    return false;
}

// ============================================
// FIREBASE SERVICE FUNCTIONS
// ============================================

async function generateEventId() {
    try {
        if (!initFirebaseRefs()) {
            console.warn('Firebase not ready yet');
            const year = new Date().getFullYear();
            return `${year}-001`;
        }
        
        const year = new Date().getFullYear();
        const eventsRef = collection(window.firebaseDb, 'events');
        const q = query(
            eventsRef, 
            where('eventId', '>=', `${year}-`), 
            where('eventId', '<', `${year}-~`)
        );
        
        const snapshot = await getDocs(q);
        let maxNum = 0;
        
        snapshot.forEach(doc => {
            const eventId = doc.data().eventId;
            if (eventId && typeof eventId === 'string') {
                const parts = eventId.split('-');
                if (parts.length === 2 && parts[0] === year.toString()) {
                    const num = parseInt(parts[1]);
                    if (!isNaN(num) && num > maxNum) {
                        maxNum = num;
                    }
                }
            }
        });
        
        const nextNum = (maxNum + 1).toString().padStart(3, '0');
        return `${year}-${nextNum}`;
    } catch (error) {
        console.error('Error generating event ID:', error);
        const year = new Date().getFullYear();
        return `${year}-001`;
    }
}

async function loadAllEvents() {
    try {
        if (!initFirebaseRefs()) {
            console.warn('Firebase not ready yet');
            return [];
        }
        
        const eventsRef = collection(window.firebaseDb, 'events');
        const q = query(eventsRef, orderBy('lastModified', 'desc'));
        const snapshot = await getDocs(q);
        
        const events = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            events.push({
                id: doc.id,
                eventId: data.eventId,
                eventName: data.eventName,
                eventDate: data.eventDate,
                venue: data.venue,
                lastModified: data.lastModified?.toDate?.()?.toLocaleString() || data.lastModified
            });
        });
        
        return events;
    } catch (error) {
        console.error('Error getting events:', error);
        return [];
    }
}

async function loadEventData(eventId) {
    try {
        if (!initFirebaseRefs()) {
            console.warn('Firebase not ready yet');
            return null;
        }
        
        // Get event by eventId field
        const eventsRef = collection(window.firebaseDb, 'events');
        const q = query(eventsRef, where('eventId', '==', eventId));
        const snapshot = await getDocs(q);
        
        if (snapshot.empty) {
            return null;
        }
        
        const eventDoc = snapshot.docs[0];
        const eventData = eventDoc.data();
        
        // Get students for this event
        const studentsRef = collection(window.firebaseDb, 'students');
        const studentsQuery = query(studentsRef, where('eventId', '==', eventId));
        const studentsSnapshot = await getDocs(studentsQuery);
        
        const students = [];
        studentsSnapshot.forEach(doc => {
            const data = doc.data();
            students.push({
                name: data.name,
                form: data.form,
                contact: data.contact,
                illness: data.illness,
                otherIllness: data.otherIllness || '',
                takingMedication: data.takingMedication || false,
                medicationDetails: data.medicationDetails || '',
                permission: data.permission || false,
                present: data.present || false
            });
        });
        
        return {
            eventId: eventData.eventId,
            eventName: eventData.eventName,
            eventDate: eventData.eventDate,
            venue: eventData.venue,
            departure: eventData.departure,
            returnTime: eventData.returnTime,
            vehicle: eventData.vehicle,
            company: eventData.company,
            accompanying: eventData.accompanying,
            students: students
        };
    } catch (error) {
        console.error('Error loading event data:', error);
        return null;
    }
}

async function saveEventToFirebase(eventData) {
    try {
        if (!initFirebaseRefs()) {
            throw new Error('Firebase not ready');
        }
        
        const { eventId } = eventData;
        const eventsRef = collection(window.firebaseDb, 'events');
        const studentsRef = collection(window.firebaseDb, 'students');
        
        // Calculate counts
        const accompanyingTeachers = eventData.accompanying 
            ? eventData.accompanying.split(',').filter(t => t.trim()).length 
            : 0;
        const studentsCount = eventData.students.filter(s => s.name && s.name.trim()).length;
        
        // Check if event exists
        const eventQuery = query(eventsRef, where('eventId', '==', eventId));
        const eventSnapshot = await getDocs(eventQuery);
        
        let eventDocRef;
        if (!eventSnapshot.empty) {
            eventDocRef = eventSnapshot.docs[0].ref;
        } else {
            eventDocRef = doc(eventsRef);
        }
        
        // Save event
        await setDoc(eventDocRef, {
            eventId,
            eventName: eventData.eventName,
            eventDate: eventData.eventDate,
            venue: eventData.venue || '',
            departure: eventData.departure || '',
            returnTime: eventData.returnTime || '',
            vehicle: eventData.vehicle || '',
            company: eventData.company || '',
            accompanying: eventData.accompanying || '',
            teachersCount: accompanyingTeachers,
            studentsCount,
            lastModified: serverTimestamp()
        }, { merge: true });
        
        // Delete existing students for this event
        const studentsQuery = query(studentsRef, where('eventId', '==', eventId));
        const studentsSnapshot = await getDocs(studentsQuery);
        
        const deletePromises = [];
        studentsSnapshot.forEach(doc => {
            deletePromises.push(deleteDoc(doc.ref));
        });
        await Promise.all(deletePromises);
        
        // Save new students
        let studentNo = 1;
        const savePromises = [];
        eventData.students.forEach(student => {
            if (student.name && student.name.trim()) {
                const studentRef = doc(studentsRef);
                savePromises.push(setDoc(studentRef, {
                    studentNo,
                    name: student.name,
                    form: student.form || '',
                    contact: student.contact || '',
                    illness: student.illness || 'None',
                    otherIllness: student.otherIllness || '',
                    takingMedication: student.takingMedication || false,
                    medicationDetails: student.medicationDetails || '',
                    permission: student.permission || false,
                    present: student.present || false,
                    eventId
                }));
                studentNo++;
            }
        });
        await Promise.all(savePromises);
        
        return { success: true };
    } catch (error) {
        console.error('Error saving to Firebase:', error);
        return { success: false, error: error.message };
    }
}

async function deleteEventFromFirebase(eventId) {
    try {
        if (!initFirebaseRefs()) {
            throw new Error('Firebase not ready');
        }
        
        const eventsRef = collection(window.firebaseDb, 'events');
        const studentsRef = collection(window.firebaseDb, 'students');
        
        // Delete event
        const eventQuery = query(eventsRef, where('eventId', '==', eventId));
        const eventSnapshot = await getDocs(eventQuery);
        
        const deletePromises = [];
        eventSnapshot.forEach(doc => {
            deletePromises.push(deleteDoc(doc.ref));
        });
        
        // Delete students for this event
        const studentsQuery = query(studentsRef, where('eventId', '==', eventId));
        const studentsSnapshot = await getDocs(studentsQuery);
        studentsSnapshot.forEach(doc => {
            deletePromises.push(deleteDoc(doc.ref));
        });
        
        await Promise.all(deletePromises);
        return { success: true };
    } catch (error) {
        console.error('Error deleting from Firebase:', error);
        return { success: false, error: error.message };
    }
}

// ============================================
// UI FUNCTIONS
// ============================================

window.generateNewEventId = async function() {
    const eventId = await generateEventId();
    document.getElementById('eventId').value = eventId;
    document.getElementById('eventIdDisplay').textContent = `Event ID: ${eventId}`;
    currentEventId = eventId;
};

// Rename internal function
async function fetchNewEventId() {
    try {
        if (!initFirebaseRefs()) {
            console.warn('Firebase not ready yet');
            const year = new Date().getFullYear();
            return `${year}-001`;
        }
        
        const year = new Date().getFullYear();
        const eventsRef = collection(window.firebaseDb, 'events');
        const q = query(
            eventsRef, 
            where('eventId', '>=', `${year}-`), 
            where('eventId', '<', `${year}-~`)
        );
        
        const snapshot = await getDocs(q);
        let maxNum = 0;
        
        snapshot.forEach(doc => {
            const eventId = doc.data().eventId;
            if (eventId && typeof eventId === 'string') {
                const parts = eventId.split('-');
                if (parts.length === 2 && parts[0] === year.toString()) {
                    const num = parseInt(parts[1]);
                    if (!isNaN(num) && num > maxNum) {
                        maxNum = num;
                    }
                }
            }
        });
        
        const nextNum = (maxNum + 1).toString().padStart(3, '0');
        return `${year}-${nextNum}`;
    } catch (error) {
        console.error('Error generating event ID:', error);
        const year = new Date().getFullYear();
        return `${year}-001`;
    }
}

// Update window.generateNewEventId
window.generateNewEventId = async function() {
    const eventId = await fetchNewEventId();
    document.getElementById('eventId').value = eventId;
    document.getElementById('eventIdDisplay').textContent = `Event ID: ${eventId}`;
    currentEventId = eventId;
};

// Update window.loadAllEvents to use fetchAllEvents
window.loadAllEvents = async function() {
    console.log('Loading all events...');
    const events = await fetchAllEvents();
    allEvents = events;
    populateEventDropdown();
    console.log('Loaded events:', events.length);
};

window.loadSelectedEvent = function() {
    const select = document.getElementById('eventSelect');
    const eventId = select.value;
    if (eventId) loadEvent(eventId);
};

window.promptLoadEvent = function() {
    const eventId = prompt('Enter Event ID to load:');
    if (eventId) loadEvent(eventId.trim());
};

window.loadEvent = async function(eventId) {
    showSpinner('Loading event...');
    const event = await loadEventData(eventId);
    hideSpinner();
    
    if (!event) {
        showToast('Event not found', 'error');
        return;
    }
    
    // Populate form
    document.getElementById('eventId').value = event.eventId;
    document.getElementById('eventIdDisplay').textContent = `Event ID: ${event.eventId}`;
    document.getElementById('eventName').value = event.eventName || '';
    document.getElementById('eventDate').value = event.eventDate || '';
    document.getElementById('eventVenue').value = event.venue || '';
    document.getElementById('departureTime').value = event.departure || '';
    document.getElementById('returnTime').value = event.returnTime || '';
    document.getElementById('vehicle').value = event.vehicle || '';
    document.getElementById('company').value = event.company || '';
    document.getElementById('accompanying').value = event.accompanying || '';
    
    // Clear and populate student table
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
};

window.saveEvent = async function() {
    const eventData = collectFormData();
    
    if (!eventData.eventName || !eventData.eventDate) {
        showToast('Event Name and Date are required', 'error');
        return;
    }
    
    showSpinner('Saving event...');
    const result = await saveEventToFirebase(eventData);
    hideSpinner();
    
    if (result.success) {
        showToast('Event saved successfully!', 'success');
        await loadAllEvents();
        isEditMode = false;
        
        // Update sync status
        if (window.updateSyncStatus) {
            window.updateSyncStatus('online', 'Connected');
        }
    } else {
        showToast('Error saving event: ' + (result.error || 'Unknown error'), 'error');
    }
};

window.deleteEvent = async function() {
    if (!currentEventId) {
        showToast('No event selected', 'error');
        return;
    }
    
    if (!confirm('Are you sure you want to delete this event?')) {
        return;
    }
    
    showSpinner('Deleting event...');
    const result = await deleteEventFromFirebase(currentEventId);
    hideSpinner();
    
    if (result.success) {
        showToast('Event deleted successfully!', 'success');
        await loadAllEvents();
        resetForm();
    } else {
        showToast('Error deleting event: ' + (result.error || 'Unknown error'), 'error');
    }
};

window.newEvent = function() {
    if (confirm('Create a new event? Any unsaved changes will be lost.')) {
        resetForm();
        showToast('Ready to create a new event!', 'success');
    }
};

window.editEvent = function() {
    if (!currentEventId) {
        promptLoadEvent();
        return;
    }
    isEditMode = true;
    showToast('Editing mode enabled. Make changes and click Save Event.', 'success');
};

window.generateReport = function() {
    if (!currentEventId) {
        showToast('Please save the event before generating a report', 'error');
        return;
    }
    
    const eventData = collectFormData();
    const reportWindow = window.open('', '_blank');
    reportWindow.document.write(`
        <html>
        <head>
            <title>Event Report - ${eventData.eventName}</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 40px; }
                h1 { color: #667eea; }
                table { border-collapse: collapse; width: 100%; margin-top: 20px; }
                th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                th { background-color: #667eea; color: white; }
                .summary { background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0; }
            </style>
        </head>
        <body>
            <h1>Event Report: ${eventData.eventName}</h1>
            <div class="summary">
                <h3>Event Details</h3>
                <p><strong>Event ID:</strong> ${eventData.eventId}</p>
                <p><strong>Date:</strong> ${eventData.eventDate}</p>
                <p><strong>Venue:</strong> ${eventData.venue}</p>
                <p><strong>Departure:</strong> ${eventData.departure}</p>
                <p><strong>Return:</strong> ${eventData.returnTime}</p>
                <p><strong>Vehicle:</strong> ${eventData.vehicle}</p>
                <p><strong>Company:</strong> ${eventData.company}</p>
                <p><strong>Accompanying Teachers:</strong> ${eventData.accompanying}</p>
            </div>
            
            <h3>Student List</h3>
            <table>
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Name</th>
                        <th>Form</th>
                        <th>Contact</th>
                        <th>Medical</th>
                        <th>Medication</th>
                        <th>Permission</th>
                        <th>Present</th>
                    </tr>
                </thead>
                <tbody>
                    ${eventData.students.map((s, i) => `
                        <tr>
                            <td>${i + 1}</td>
                            <td>${s.name}</td>
                            <td>${s.form}</td>
                            <td>${s.contact}</td>
                            <td>${s.illness} ${s.otherIllness ? ': ' + s.otherIllness : ''}</td>
                            <td>${s.takingMedication ? s.medicationDetails : 'No'}</td>
                            <td>${s.permission ? 'Yes' : 'No'}</td>
                            <td>${s.present ? 'Yes' : 'No'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            
            <p style="margin-top: 30px;">Generated on: ${new Date().toLocaleString()}</p>
        </body>
        </html>
    `);
    reportWindow.document.close();
};

// ============================================
// STUDENT TABLE FUNCTIONS
// ============================================

window.addStudentRow = function(studentData = null, index = null) {
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
        <td><input type="checkbox" name="permission[]" ${studentData?.permission === true ? 'checked' : ''}></td>
        <td><input type="checkbox" name="present[]" ${studentData?.present === true ? 'checked' : ''}></td>
        <td><button type="button" class="delete-row">✖</button></td>
    `;
    
    // Add event listeners
    const illnessSelect = row.querySelector('.student-illness');
    const medicationCheckbox = row.querySelector('.medication-checkbox');
    
    illnessSelect.addEventListener('change', function() {
        handleIllnessChange(this);
    });
    
    medicationCheckbox.addEventListener('change', function() {
        handleMedicationChange(this);
    });
    
    renumberRows();
    updateCounts();
};

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
        otherInput.focus();
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
        medicationInput.focus();
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
        accompanyingCount = accompanyingValue.split(',').filter(name => name.trim() !== '').length;
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
    
    // Update counter badge
    const badge = document.getElementById('studentCountBadge');
    if (badge) {
        badge.textContent = `${totalStudents} student${totalStudents !== 1 ? 's' : ''}`;
    }
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
}

// ============================================
// UI HELPER FUNCTIONS
// ============================================

function showSpinner(message = 'Loading...') {
    const spinner = document.getElementById('spinner');
    const spinnerText = document.getElementById('spinnerText');
    if (spinner) {
        spinner.classList.add('active');
        if (spinnerText) spinnerText.textContent = message;
    }
}

function hideSpinner() {
    const spinner = document.getElementById('spinner');
    if (spinner) {
        spinner.classList.remove('active');
    }
}

function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    if (toast) {
        toast.textContent = message;
        toast.className = `toast show ${type}`;
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }
}

// ============================================
// AUTH STATE MANAGEMENT - FIXED
// ============================================

function updateUIBasedOnAuth(user) {
    const landingPage = document.getElementById('landingPage');
    const mainContainer = document.getElementById('mainContainer');
    const authButton = document.getElementById('authButton');
    const userMenu = document.getElementById('userMenu');
    const userName = document.getElementById('userName');
    
    if (user) {
        // User is signed in
        isAuthenticated = true;
        localStorage.setItem('isAuthenticated', 'true');
        
        if (landingPage) landingPage.classList.add('hidden');
        if (mainContainer) mainContainer.classList.add('active');
        
        // Update auth button
        if (authButton) {
            authButton.innerHTML = `👤 ${user.displayName || user.email || 'User'}`;
            authButton.onclick = (e) => {
                e.stopPropagation();
                if (userMenu) {
                    userMenu.classList.toggle('show');
                }
            };
        }
        
        if (userName) {
            userName.textContent = user.displayName || user.email || 'User';
        }
        
        // Try to initialize Firebase refs and then load data
        const tryInitialize = () => {
            if (initFirebaseRefs()) {
                console.log('📊 Firebase ready, initializing app data...');
                window.generateNewEventId();
                window.loadAllEvents();  // Use window. to call the global function
                updateCounts();
                
                // Update sync status
                if (window.updateSyncStatus) {
                    window.updateSyncStatus('online', `Connected as ${user.email}`);
                }
            } else {
                console.log('⏳ Firebase not ready yet, retrying in 500ms...');
                setTimeout(tryInitialize, 500);
            }
        };
        
        // Start trying to initialize
        setTimeout(tryInitialize, 500);
    } else {
        // User is signed out
        isAuthenticated = false;
        localStorage.removeItem('isAuthenticated');
        
        if (landingPage) landingPage.classList.remove('hidden');
        if (mainContainer) mainContainer.classList.remove('active');
        
        if (authButton) {
            authButton.innerHTML = '🔐 Login';
            authButton.onclick = () => window.location.href = 'auth.html';
        }
        
        if (userMenu) {
            userMenu.classList.remove('show');
        }
        
        // Update sync status
        if (window.updateSyncStatus) {
            window.updateSyncStatus('offline', 'Not connected');
        }
    }
}

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 DOM Content Loaded - Starting initialization');
    
    // Set up click outside to close user menu
    document.addEventListener('click', function(event) {
        const userMenu = document.getElementById('userMenu');
        const authButton = document.getElementById('authButton');
        if (userMenu && authButton && !authButton.contains(event.target) && !userMenu.contains(event.target)) {
            userMenu.classList.remove('show');
        }
    });
    
    // Initialize student table features
    setTimeout(() => {
        initializeStudentTable();
    }, 1000);
    
    // Set up event listeners
    setupEventListeners();
});

function setupEventListeners() {
    // Accompanying teachers input
    const accompanyingInput = document.getElementById('accompanying');
    if (accompanyingInput) {
        accompanyingInput.addEventListener('input', updateCounts);
    }
    
    // Delete row buttons (delegation)
    const tableBody = document.querySelector('#studentTable tbody');
    if (tableBody) {
        tableBody.addEventListener('click', (e) => {
            if (e.target.classList.contains('delete-row')) {
                deleteStudentRow(e.target);
            }
        });
    }
    
    // Dark mode toggle
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

function initializeStudentTable() {
    console.log('✅ Student table features initialized');
    
    // Make headers sticky
    const thead = document.querySelector('#studentTable thead');
    if (thead) {
        const thElements = thead.querySelectorAll('th');
        thElements.forEach(th => {
            th.style.position = 'sticky';
            th.style.top = '0';
            th.style.zIndex = '10';
            th.style.background = '#f0f2f5';
        });
    }
    
    // Connect search functionality
    const searchInput = document.getElementById('studentSearch');
    if (searchInput) {
        searchInput.addEventListener('input', function(e) {
            const term = e.target.value.toLowerCase().trim();
            const rows = document.querySelectorAll('#studentTable tbody tr');
            
            rows.forEach(row => {
                const name = row.cells[1]?.querySelector('input')?.value.toLowerCase() || '';
                const form = row.cells[2]?.querySelector('input')?.value.toLowerCase() || '';
                const contact = row.cells[3]?.querySelector('input')?.value.toLowerCase() || '';
                
                const matches = name.includes(term) || form.includes(term) || contact.includes(term) || term === '';
                row.style.display = matches ? '' : 'none';
            });
            
            updateCounts();
        });
        console.log('✅ Student search initialized');
    }
}

// Make functions globally available
window.collectFormData = collectFormData;
window.updateCounts = updateCounts;
window.showToast = showToast;
window.showSpinner = showSpinner;
window.hideSpinner = hideSpinner;
window.updateUIBasedOnAuth = updateUIBasedOnAuth;

console.log('✅ Firebase App.js loaded successfully');
