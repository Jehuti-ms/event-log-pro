// app.js - COMPLETE FIREBASE-ONLY VERSION WITH ALL FIXES
console.log('📦 Firebase App.js loaded');

// Import Firebase functions (these will be available from the module in index.html)
// Note: These are actually imported in the HTML, so we reference them via window.firebase
let collection, getDocs, query, where, orderBy, setDoc, deleteDoc, doc, serverTimestamp;

// Global variables
let currentEventId = null;
let isEditMode = false;
let allEvents = [];
let isAuthenticated = false;

// Auto-save variables
let autoSaveTimeout = null;
const AUTO_SAVE_DELAY = 2000; // 2 seconds delay after last change
let isSaving = false;
let pendingChanges = false;

// Track initialization state
let appInitialized = false;

// Initialize Firebase references when available
function initFirebaseRefs() {
    if (window.firebaseFirestore) {
        collection = window.firebaseFirestore.collection;
        getDocs = window.firebaseFirestore.getDocs;
        query = window.firebaseFirestore.query;
        where = window.firebaseFirestore.where;
        orderBy = window.firebaseFirestore.orderBy;
        setDoc = window.firebaseFirestore.setDoc;
        deleteDoc = window.firebaseFirestore.deleteDoc;
        doc = window.firebaseFirestore.doc;
        serverTimestamp = window.firebaseFirestore.serverTimestamp;
        console.log('✅ Firebase Firestore functions initialized');
        return true;
    } else {
        console.warn('⏳ Waiting for Firebase Firestore to be ready...');
        return false;
    }
}

// ============================================
// FIREBASE SERVICE FUNCTIONS (Internal)
// ============================================

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

async function fetchAllEvents() {
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

async function fetchEventData(eventId) {
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
            lastModified: serverTimestamp(),
            createdBy: window.firebaseAuth?.currentUser?.email || 'unknown'
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
// UI FUNCTIONS (Global)
// ============================================

window.generateNewEventId = async function() {
    const eventId = await fetchNewEventId();
    document.getElementById('eventId').value = eventId;
    document.getElementById('eventIdDisplay').textContent = `Event ID: ${eventId}`;
    currentEventId = eventId;
};

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
    if (eventId) window.loadEvent(eventId);
};

window.promptLoadEvent = function() {
    const eventId = prompt('Enter Event ID to load:');
    if (eventId) window.loadEvent(eventId.trim());
};

window.loadEvent = async function(eventId) {
    window.showSpinner('Loading event...');
    const event = await fetchEventData(eventId);
    window.hideSpinner();
    
    if (!event) {
        window.showToast('Event not found', 'error');
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
            window.addStudentRow(student, index + 1);
        });
    } else {
        window.addStudentRow();
    }
    
    currentEventId = event.eventId;
    isEditMode = true;
    updateCounts();
    window.showToast('Event loaded successfully', 'success');
};

window.saveEvent = async function() {
    // Clear any pending auto-save
    if (autoSaveTimeout) {
        clearTimeout(autoSaveTimeout);
        autoSaveTimeout = null;
    }
    
    const eventData = collectFormData();
    
    if (!eventData.eventName || !eventData.eventDate) {
        window.showToast('Event Name and Date are required', 'error');
        return;
    }
    
    window.showSpinner('Saving event...');
    const result = await saveEventToFirebase(eventData);
    window.hideSpinner();
    
    if (result.success) {
        window.showToast('Event saved successfully!', 'success');
        await window.loadAllEvents();
        isEditMode = false;
        pendingChanges = false;
        showAutoSaveIndicator('idle');
        
        // Update sync status
        if (window.updateSyncStatus) {
            window.updateSyncStatus('online', 'Connected');
        }
    } else {
        window.showToast('Error saving event: ' + (result.error || 'Unknown error'), 'error');
    }
};

window.deleteEvent = async function() {
    if (!currentEventId) {
        window.showToast('No event selected', 'error');
        return;
    }
    
    if (!confirm('Are you sure you want to delete this event?')) {
        return;
    }
    
    window.showSpinner('Deleting event...');
    const result = await deleteEventFromFirebase(currentEventId);
    window.hideSpinner();
    
    if (result.success) {
        window.showToast('Event deleted successfully!', 'success');
        await window.loadAllEvents();
        resetForm();
    } else {
        window.showToast('Error deleting event: ' + (result.error || 'Unknown error'), 'error');
    }
};

window.newEvent = function() {
    if (confirm('Create a new event? Any unsaved changes will be lost.')) {
        resetForm();
        window.showToast('Ready to create a new event!', 'success');
    }
};

window.editEvent = function() {
    if (!currentEventId) {
        window.promptLoadEvent();
        return;
    }
    isEditMode = true;
    window.showToast('Editing mode enabled. Make changes and click Save Event.', 'success');
};

window.generateReport = function() {
    if (!currentEventId) {
        window.showToast('Please save the event before generating a report', 'error');
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

// ============================================================================
// FLOATING ACTION BUTTON (FAB) FUNCTIONS
// ============================================================================

window.toggleFabMenu = function() {
    const container = document.getElementById('fabContainer');
    if (!container) return;
    
    container.classList.toggle('active');
    
    // Change button icon
    const fabButton = document.getElementById('fabButton');
    if (fabButton) {
        if (container.classList.contains('active')) {
            fabButton.textContent = '✕';
            fabButton.style.transform = 'rotate(90deg)';
        } else {
            fabButton.textContent = '+';
            fabButton.style.transform = 'rotate(0deg)';
        }
    }
};

window.hideFabMenu = function() {
    const container = document.getElementById('fabContainer');
    if (!container) return;
    
    container.classList.remove('active');
    
    const fabButton = document.getElementById('fabButton');
    if (fabButton) {
        fabButton.textContent = '+';
        fabButton.style.transform = 'rotate(0deg)';
    }
};

window.scrollToStudentForm = function() {
    // Scroll to the student form section
    const studentForm = document.querySelector('#students .section-card:first-of-type');
    if (studentForm) {
        studentForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
        
        // Highlight the form briefly
        studentForm.style.transition = 'box-shadow 0.3s ease';
        studentForm.style.boxShadow = '0 0 0 4px #2ecc71, 0 4px 12px rgba(46,204,113,0.4)';
        setTimeout(() => {
            studentForm.style.boxShadow = '';
        }, 1500);
        
        // Focus on the first input
        setTimeout(() => {
            const firstNameInput = document.getElementById('studentName');
            if (firstNameInput) firstNameInput.focus();
        }, 500);
    }
};

// Close FAB menu when clicking outside
document.addEventListener('click', function(event) {
    const fabContainer = document.getElementById('fabContainer');
    const fabButton = document.getElementById('fabButton');
    
    if (fabContainer && fabButton && 
        !fabContainer.contains(event.target) && 
        fabContainer.classList.contains('active')) {
        hideFabMenu();
    }
});

// Hide FAB menu on scroll
let fabScrollTimeout;
window.addEventListener('scroll', function() {
    const fabContainer = document.getElementById('fabContainer');
    if (fabContainer && fabContainer.classList.contains('active')) {
        // Clear previous timeout
        if (fabScrollTimeout) clearTimeout(fabScrollTimeout);
        
        // Hide menu after scrolling stops
        fabScrollTimeout = setTimeout(() => {
            hideFabMenu();
        }, 500);
    }
});

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
        window.showToast('At least one student row must remain', 'error');
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
    
    // Count ALL students regardless of search filter
    rows.forEach(row => {
        const nameInput = row.cells[1].querySelector('input');
        if (nameInput.value.trim()) {
            totalStudents++;
            
            // Count present and permission regardless of filter
            if (row.cells[7].querySelector('input').checked) {
                presentCount++;
            }
            
            if (row.cells[6].querySelector('input').checked) {
                permissionCount++;
            }
        }
    });
    
    const totalPeople = totalStudents + accompanyingCount;
    
    // Update stats displays
    document.getElementById('totalStudents').textContent = totalStudents;
    document.getElementById('numTeachers').textContent = accompanyingCount;
    document.getElementById('presentCount').textContent = presentCount;
    document.getElementById('permissionCount').textContent = permissionCount;
    document.getElementById('totalPeople').textContent = totalPeople;
    
    // Update counter badge (always show total)
    const badge = document.getElementById('studentCountBadge');
    if (badge) {
        badge.textContent = `${totalStudents} student${totalStudents !== 1 ? 's' : ''}`;
    }
    
    // Update the counter at the bottom of the table
    const counter = document.getElementById('studentCounter');
    if (counter) {
        const searchInput = document.getElementById('studentSearch');
        const searchTerm = searchInput ? searchInput.value.trim() : '';
        
        // Count visible students for the "showing" message
        let visibleStudents = 0;
        rows.forEach(row => {
            if (row.style.display !== 'none') {
                const nameInput = row.cells[1].querySelector('input');
                if (nameInput.value.trim()) {
                    visibleStudents++;
                }
            }
        });
        
        if (searchTerm) {
            counter.textContent = `Showing: ${visibleStudents} of ${totalStudents} students`;
        } else {
            counter.textContent = `Total Students: ${totalStudents}`;
        }
    }
}

function resetForm() {
    document.getElementById('eventForm').reset();
    document.getElementById('eventId').value = '';
    document.getElementById('eventIdDisplay').textContent = 'Event ID: (new)';
    
    const tbody = document.querySelector('#studentTable tbody');
    tbody.innerHTML = '';
    window.addStudentRow();
    
    currentEventId = null;
    isEditMode = false;
    
    window.generateNewEventId();
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

window.showSpinner = function(message = 'Loading...') {
    const spinner = document.getElementById('spinner');
    const spinnerText = document.getElementById('spinnerText');
    if (spinner) {
        spinner.classList.add('active');
        if (spinnerText) spinnerText.textContent = message;
    }
};

window.hideSpinner = function() {
    const spinner = document.getElementById('spinner');
    if (spinner) {
        spinner.classList.remove('active');
    }
};

window.showToast = function(message, type = 'info') {
    const toast = document.getElementById('toast');
    if (toast) {
        toast.textContent = message;
        toast.className = `toast show ${type}`;
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }
};

// ============================================
// AUTO-SAVE FUNCTIONALITY
// ============================================

function initAutoSave() {
    console.log('🔄 Initializing auto-save...');
    
    const tableBody = document.querySelector('#studentTable tbody');
    if (!tableBody) {
        console.warn('⚠️ Table body not found for auto-save');
        return;
    }
    
    // Listen for changes in the table
    tableBody.addEventListener('input', function(e) {
        if (e.target.matches('input[type="text"], input[type="checkbox"], select')) {
            handleTableChange();
        }
    });
    
    tableBody.addEventListener('change', function(e) {
        if (e.target.matches('input[type="checkbox"], select')) {
            handleTableChange();
        }
    });
    
    // Listen for row additions/deletions
    const observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            if (mutation.type === 'childList') {
                handleTableChange();
            }
        });
    });
    
    observer.observe(tableBody, {
        childList: true,
        subtree: true
    });
    
    console.log('✅ Auto-save initialized');
}

function handleTableChange() {
    // Mark that there are pending changes
    pendingChanges = true;
    
    // Clear any existing timeout
    if (autoSaveTimeout) {
        clearTimeout(autoSaveTimeout);
    }
    
    // Show auto-save indicator
    showAutoSaveIndicator('pending');
    
    // Set new timeout
    autoSaveTimeout = setTimeout(() => {
        performAutoSave();
    }, AUTO_SAVE_DELAY);
}

async function performAutoSave() {
    // Prevent multiple simultaneous saves
    if (isSaving) {
        console.log('⏳ Auto-save already in progress, waiting...');
        setTimeout(performAutoSave, 500);
        return;
    }
    
    // Check if there are actually changes to save
    if (!pendingChanges) {
        console.log('📝 No pending changes to save');
        return;
    }
    
    // Check if we have a current event
    if (!currentEventId) {
        console.log('📝 No event selected, auto-save skipped');
        pendingChanges = false;
        showAutoSaveIndicator('idle');
        return;
    }
    
    try {
        isSaving = true;
        showAutoSaveIndicator('saving');
        
        console.log('💾 Auto-saving changes...');
        
        // Collect current form data
        const eventData = collectFormData();
        
        // Validate required fields
        if (!eventData.eventName || !eventData.eventDate) {
            console.log('⚠️ Auto-save skipped: missing required fields');
            showAutoSaveIndicator('idle');
            isSaving = false;
            pendingChanges = false;
            return;
        }
        
        // Save to Firebase
        const result = await saveEventToFirebase(eventData);
        
        if (result.success) {
            console.log('✅ Auto-save successful');
            pendingChanges = false;
            showAutoSaveIndicator('saved');
            
            // Update last sync time
            if (window.updateSyncStatus) {
                window.updateSyncStatus('online', 'Auto-saved');
            }
        } else {
            console.error('❌ Auto-save failed:', result.error);
            showAutoSaveIndicator('error');
            
            // Show error toast
            window.showToast('Auto-save failed: ' + result.error, 'error');
        }
    } catch (error) {
        console.error('❌ Auto-save error:', error);
        showAutoSaveIndicator('error');
        window.showToast('Auto-save error: ' + error.message, 'error');
    } finally {
        isSaving = false;
        autoSaveTimeout = null;
        
        // Hide indicator after 2 seconds if no new changes
        setTimeout(() => {
            if (!pendingChanges) {
                showAutoSaveIndicator('idle');
            }
        }, 2000);
    }
}

function showAutoSaveIndicator(status) {
    const indicator = document.getElementById('autoSaveIndicator');
    if (!indicator) return;
    
    // Remove all status classes
    indicator.classList.remove('pending', 'saving', 'saved', 'error');
    
    switch(status) {
        case 'pending':
            indicator.innerHTML = '✏️ Unsaved changes...';
            indicator.classList.add('pending');
            indicator.style.display = 'inline-block';
            break;
        case 'saving':
            indicator.innerHTML = '💾 Saving...';
            indicator.classList.add('saving');
            indicator.style.display = 'inline-block';
            break;
        case 'saved':
            indicator.innerHTML = '✅ All changes saved';
            indicator.classList.add('saved');
            indicator.style.display = 'inline-block';
            break;
        case 'error':
            indicator.innerHTML = '❌ Save failed';
            indicator.classList.add('error');
            indicator.style.display = 'inline-block';
            break;
        case 'idle':
            indicator.style.display = 'none';
            break;
    }
}

window.forceAutoSave = async function() {
    if (autoSaveTimeout) {
        clearTimeout(autoSaveTimeout);
        autoSaveTimeout = null;
    }
    pendingChanges = true;
    await performAutoSave();
};

// ============================================
// DARK MODE TOGGLE - FIXED
// ============================================

function initDarkMode() {
    console.log('🎨 Initializing dark mode...');
    
    const darkModeToggle = document.getElementById('darkModeToggle');
    
    if (!darkModeToggle) {
        console.warn('⚠️ Dark mode toggle not found');
        return;
    }
    
    // Load saved theme
    const savedTheme = localStorage.getItem('theme') || 'light';
    console.log('📦 Saved theme:', savedTheme);
    
    // Apply theme
    if (savedTheme === 'dark') {
        document.body.classList.add('dark');
        darkModeToggle.checked = true;
    } else {
        document.body.classList.remove('dark');
        darkModeToggle.checked = false;
    }
    
    // Remove any existing listeners by cloning and replacing
    const newToggle = darkModeToggle.cloneNode(true);
    darkModeToggle.parentNode.replaceChild(newToggle, darkModeToggle);
    
    // Add new listener
    newToggle.addEventListener('change', function(e) {
        if (this.checked) {
            document.body.classList.add('dark');
            localStorage.setItem('theme', 'dark');
            console.log('🌓 Dark mode enabled');
        } else {
            document.body.classList.remove('dark');
            localStorage.setItem('theme', 'light');
            console.log('☀️ Light mode enabled');
        }
    });
    
    console.log('✅ Dark mode initialized');
}

// ============================================
// CLICK OUTSIDE HANDLER
// ============================================

function setupClickOutside() {
    document.addEventListener('click', function(event) {
        const userMenu = document.getElementById('userMenu');
        const authButton = document.getElementById('authButton');
        
        if (userMenu && authButton && 
            !authButton.contains(event.target) && 
            !userMenu.contains(event.target)) {
            userMenu.classList.remove('show');
        }
    });
}

// ============================================
// STUDENT TABLE INITIALIZATION - FIXED (NO INLINE STYLES)
// ============================================

function initializeStudentTable() {
    console.log('✅ Student table features initialized');
    
    // Don't apply inline styles - let CSS handle it
    // Just connect search functionality
    
    const searchInput = document.getElementById('studentSearch');
    if (searchInput) {
        // Remove any existing listeners
        const newSearchInput = searchInput.cloneNode(true);
        searchInput.parentNode.replaceChild(newSearchInput, searchInput);
        
        newSearchInput.addEventListener('input', function(e) {
            const term = e.target.value.toLowerCase().trim();
            const rows = document.querySelectorAll('#studentTable tbody tr');
            
            let visibleCount = 0;
            rows.forEach(row => {
                const name = row.cells[1]?.querySelector('input')?.value.toLowerCase() || '';
                const form = row.cells[2]?.querySelector('input')?.value.toLowerCase() || '';
                const contact = row.cells[3]?.querySelector('input')?.value.toLowerCase() || '';
                
                const matches = name.includes(term) || form.includes(term) || contact.includes(term) || term === '';
                row.style.display = matches ? '' : 'none';
                if (matches) visibleCount++;
            });
            
            updateCounts();
            console.log(`🔍 Search: ${visibleCount} visible students`);
        });
        
        console.log('✅ Student search initialized');
    } else {
        console.warn('⚠️ Search input not found');
    }
    
    // Initial counter update
    updateCounts();
    
    // Auto-update counter on changes
    const tableBody = document.querySelector('#studentTable tbody');
    if (tableBody) {
        const observer = new MutationObserver(() => {
            setTimeout(updateCounts, 100);
        });
        observer.observe(tableBody, { childList: true, subtree: true });
    }
}

// ============================================
// EVENT LISTENERS
// ============================================

function setupEventListeners() {
    console.log('🔗 Setting up event listeners...');
    
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
}

// ============================================
// AUTH STATE MANAGEMENT
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
                window.loadAllEvents();
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
// INITIALIZATION - SINGLE SOURCE OF TRUTH
// ============================================

document.addEventListener('DOMContentLoaded', function() {
    // Prevent multiple initializations
    if (appInitialized) {
        console.log('⚠️ App already initialized, skipping...');
        return;
    }
    
    console.log('🚀 DOM Content Loaded - Starting initialization');
    appInitialized = true;
    
    // Initialize dark mode first
    initDarkMode();
    
    // Set up click outside to close user menu
    setupClickOutside();
    
    // Initialize auto-save
    initAutoSave();
    
    // Initialize student table features after a short delay
    setTimeout(() => {
        initializeStudentTable();
    }, 500);
    
    // Set up event listeners
    setupEventListeners();
    
    console.log('✅ App initialization complete');
});

// ============================================
// CLEAR SEARCH
// ============================================

window.clearSearch = function() {
    const searchInput = document.getElementById('studentSearch');
    if (searchInput) {
        searchInput.value = '';
        const rows = document.querySelectorAll('#studentTable tbody tr');
        rows.forEach(row => row.style.display = '');
        updateCounts();
        console.log('🧹 Search cleared');
    }
};

// ============================================================================
// GENERATE REPORT WITH PRINT AND EMAIL - FIXED
// ============================================================================

window.generateReport = function() {
    if (!currentEventId) {
        window.showToast('Please save the event before generating a report', 'error');
        return;
    }
    
    try {
        const eventData = collectFormData();
        
        // Calculate summary statistics
        const totalStudents = eventData.students.filter(s => s.name && s.name.trim()).length;
        const presentCount = eventData.students.filter(s => s.present).length;
        const permissionCount = eventData.students.filter(s => s.permission).length;
        const medicalCount = eventData.students.filter(s => s.illness !== 'None' && s.illness).length;
        const medicationCount = eventData.students.filter(s => s.takingMedication).length;
        
        // Escape strings for safe inclusion in HTML
        const escapeHtml = (str) => {
            if (!str) return '';
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        };
        
        const safeEventName = escapeHtml(eventData.eventName);
        const safeEventId = escapeHtml(eventData.eventId);
        const safeEventDate = escapeHtml(eventData.eventDate);
        const safeVenue = escapeHtml(eventData.venue || 'N/A');
        const safeDeparture = escapeHtml(eventData.departure || 'N/A');
        const safeReturn = escapeHtml(eventData.returnTime || 'N/A');
        const safeVehicle = escapeHtml(eventData.vehicle || 'N/A');
        const safeCompany = escapeHtml(eventData.company || 'N/A');
        const safeAccompanying = escapeHtml(eventData.accompanying || 'None');
        
        // Create report HTML
        const reportHTML = `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Event Report - ${safeEventName}</title>
                <style>
                    * {
                        margin: 0;
                        padding: 0;
                        box-sizing: border-box;
                    }
                    
                    body {
                        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                        background: #f4f6f9;
                        padding: 30px 20px;
                        line-height: 1.6;
                        color: #333;
                    }
                    
                    .report-container {
                        max-width: 1200px;
                        margin: 0 auto;
                        background: white;
                        border-radius: 16px;
                        box-shadow: 0 10px 30px rgba(0,0,0,0.1);
                        overflow: hidden;
                    }
                    
                    .report-header {
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        color: white;
                        padding: 30px 40px;
                    }
                    
                    .report-header h1 {
                        font-size: 2.2em;
                        margin-bottom: 10px;
                    }
                    
                    .report-header p {
                        opacity: 0.9;
                        font-size: 1.1em;
                    }
                    
                    .report-section {
                        padding: 30px 40px;
                        border-bottom: 1px solid #e9ecef;
                    }
                    
                    .report-section:last-child {
                        border-bottom: none;
                    }
                    
                    .section-title {
                        color: #2c3e50;
                        font-size: 1.5em;
                        margin-bottom: 20px;
                        padding-bottom: 10px;
                        border-bottom: 2px solid #667eea;
                    }
                    
                    .event-details {
                        display: grid;
                        grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
                        gap: 20px;
                        background: #f8f9fa;
                        padding: 25px;
                        border-radius: 12px;
                    }
                    
                    .detail-item {
                        display: flex;
                        flex-direction: column;
                    }
                    
                    .detail-label {
                        font-size: 0.9em;
                        color: #6c757d;
                        margin-bottom: 5px;
                        text-transform: uppercase;
                        letter-spacing: 0.5px;
                    }
                    
                    .detail-value {
                        font-size: 1.2em;
                        font-weight: 600;
                        color: #2c3e50;
                    }
                    
                    .stats-grid {
                        display: grid;
                        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
                        gap: 20px;
                    }
                    
                    .stat-card {
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        color: white;
                        padding: 25px;
                        border-radius: 12px;
                        text-align: center;
                        box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);
                    }
                    
                    .stat-value {
                        font-size: 2.5em;
                        font-weight: 700;
                        margin-bottom: 5px;
                    }
                    
                    .stat-label {
                        font-size: 0.9em;
                        opacity: 0.9;
                        text-transform: uppercase;
                        letter-spacing: 0.5px;
                    }
                    
                    .student-table {
                        width: 100%;
                        border-collapse: collapse;
                        margin-top: 20px;
                    }
                    
                    .student-table th {
                        background: #667eea;
                        color: white;
                        font-weight: 600;
                        padding: 12px 15px;
                        text-align: left;
                        font-size: 0.9em;
                        text-transform: uppercase;
                        letter-spacing: 0.5px;
                    }
                    
                    .student-table td {
                        padding: 12px 15px;
                        border-bottom: 1px solid #e9ecef;
                        color: #4a5568;
                    }
                    
                    .student-table tbody tr:hover {
                        background: #f8f9fa;
                    }
                    
                    .badge {
                        display: inline-block;
                        padding: 4px 10px;
                        border-radius: 20px;
                        font-size: 0.85em;
                        font-weight: 600;
                    }
                    
                    .badge-success {
                        background: #d4edda;
                        color: #155724;
                    }
                    
                    .badge-danger {
                        background: #f8d7da;
                        color: #721c24;
                    }
                    
                    .badge-warning {
                        background: #fff3cd;
                        color: #856404;
                    }
                    
                    .badge-info {
                        background: #d1ecf1;
                        color: #0c5460;
                    }
                    
                    .action-buttons {
                        position: fixed;
                        right: 30px;
                        bottom: 30px;
                        display: flex;
                        flex-direction: column;
                        gap: 15px;
                        z-index: 1000;
                    }
                    
                    .action-button {
                        padding: 15px 25px;
                        border: none;
                        border-radius: 50px;
                        font-size: 16px;
                        font-weight: 600;
                        cursor: pointer;
                        box-shadow: 0 4px 15px rgba(0,0,0,0.2);
                        transition: all 0.3s ease;
                        display: flex;
                        align-items: center;
                        gap: 10px;
                        color: white;
                    }
                    
                    .print-button {
                        background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
                    }
                    
                    .email-button {
                        background: linear-gradient(135deg, #007bff 0%, #0056b3 100%);
                    }
                    
                    .action-button:hover {
                        transform: translateY(-3px);
                        box-shadow: 0 6px 20px rgba(0,0,0,0.25);
                    }
                    
                    @media print {
                        .action-buttons {
                            display: none;
                        }
                        
                        body {
                            background: white;
                            padding: 0;
                        }
                        
                        .report-container {
                            box-shadow: none;
                            border-radius: 0;
                        }
                        
                        .report-header {
                            background: #667eea !important;
                            -webkit-print-color-adjust: exact;
                            print-color-adjust: exact;
                        }
                        
                        .stat-card {
                            -webkit-print-color-adjust: exact;
                            print-color-adjust: exact;
                        }
                        
                        .student-table th {
                            background: #667eea !important;
                            -webkit-print-color-adjust: exact;
                            print-color-adjust: exact;
                        }
                    }
                    
                    @media (max-width: 768px) {
                        .report-header {
                            padding: 20px;
                        }
                        
                        .report-section {
                            padding: 20px;
                        }
                        
                        .stats-grid {
                            grid-template-columns: 1fr 1fr;
                        }
                        
                        .action-buttons {
                            right: 15px;
                            bottom: 15px;
                        }
                        
                        .action-button {
                            padding: 12px 20px;
                            font-size: 14px;
                        }
                    }
                </style>
            </head>
            <body>
                <div class="report-container">
                    <div class="report-header">
                        <h1>🎓 Event Report: ${safeEventName}</h1>
                        <p>Generated on ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}</p>
                    </div>
                    
                    <div class="report-section">
                        <h2 class="section-title">📋 Event Details</h2>
                        <div class="event-details">
                            <div class="detail-item">
                                <span class="detail-label">Event ID</span>
                                <span class="detail-value">${safeEventId}</span>
                            </div>
                            <div class="detail-item">
                                <span class="detail-label">Event Name</span>
                                <span class="detail-value">${safeEventName}</span>
                            </div>
                            <div class="detail-item">
                                <span class="detail-label">Date</span>
                                <span class="detail-value">${safeEventDate}</span>
                            </div>
                            <div class="detail-item">
                                <span class="detail-label">Venue</span>
                                <span class="detail-value">${safeVenue}</span>
                            </div>
                            <div class="detail-item">
                                <span class="detail-label">Departure Time</span>
                                <span class="detail-value">${safeDeparture}</span>
                            </div>
                            <div class="detail-item">
                                <span class="detail-label">Return Time</span>
                                <span class="detail-value">${safeReturn}</span>
                            </div>
                            <div class="detail-item">
                                <span class="detail-label">Vehicle</span>
                                <span class="detail-value">${safeVehicle}</span>
                            </div>
                            <div class="detail-item">
                                <span class="detail-label">Company</span>
                                <span class="detail-value">${safeCompany}</span>
                            </div>
                            <div class="detail-item">
                                <span class="detail-label">Accompanying Teachers</span>
                                <span class="detail-value">${safeAccompanying}</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="report-section">
                        <h2 class="section-title">📊 Summary Statistics</h2>
                        <div class="stats-grid">
                            <div class="stat-card">
                                <div class="stat-value">${totalStudents}</div>
                                <div class="stat-label">Total Students</div>
                            </div>
                            <div class="stat-card">
                                <div class="stat-value">${presentCount}</div>
                                <div class="stat-label">Present</div>
                            </div>
                            <div class="stat-card">
                                <div class="stat-value">${permissionCount}</div>
                                <div class="stat-label">Permission Slips</div>
                            </div>
                            <div class="stat-card">
                                <div class="stat-value">${medicalCount}</div>
                                <div class="stat-label">Medical Cases</div>
                            </div>
                            <div class="stat-card">
                                <div class="stat-value">${medicationCount}</div>
                                <div class="stat-label">On Medication</div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="report-section">
                        <h2 class="section-title">👥 Student List</h2>
                        <table class="student-table">
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
                                ${eventData.students.map((student, index) => {
                                    if (!student.name || !student.name.trim()) return '';
                                    const safeName = escapeHtml(student.name);
                                    const safeForm = escapeHtml(student.form || 'N/A');
                                    const safeContact = escapeHtml(student.contact || 'N/A');
                                    const safeIllness = escapeHtml(student.illness || 'None');
                                    const safeOtherIllness = escapeHtml(student.otherIllness || '');
                                    const safeMedication = escapeHtml(student.medicationDetails || '');
                                    
                                    return `
                                        <tr>
                                            <td>${index + 1}</td>
                                            <td><strong>${safeName}</strong></td>
                                            <td>${safeForm}</td>
                                            <td>${safeContact}</td>
                                            <td>
                                                ${student.illness !== 'None' ? 
                                                    `<span class="badge badge-warning">${safeIllness}${student.otherIllness ? ': ' + safeOtherIllness : ''}</span>` : 
                                                    '<span class="badge badge-success">None</span>'}
                                            </td>
                                            <td>
                                                ${student.takingMedication ? 
                                                    `<span class="badge badge-info">${safeMedication || 'Yes'}</span>` : 
                                                    '<span class="badge badge-success">No</span>'}
                                            </td>
                                            <td>
                                                ${student.permission ? 
                                                    '<span class="badge badge-success">✓ Yes</span>' : 
                                                    '<span class="badge badge-danger">✗ No</span>'}
                                            </td>
                                            <td>
                                                ${student.present ? 
                                                    '<span class="badge badge-success">✓ Present</span>' : 
                                                    '<span class="badge badge-danger">✗ Absent</span>'}
                                            </td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                    
                    <div class="report-section">
                        <p style="text-align: center; color: #6c757d; font-size: 0.9em;">
                            Report generated by Event Log Pro • ${new Date().toLocaleString()}
                        </p>
                    </div>
                </div>
                
                <div class="action-buttons">
                    <button class="action-button print-button" onclick="window.print()">
                        🖨️ Print Report
                    </button>
                    <button class="action-button email-button" onclick="sendEmailReport()">
                        📧 Email Report
                    </button>
                </div>
                
                <script>
                    function sendEmailReport() {
                        const subject = encodeURIComponent('Event Report: ${safeEventName}');
                        const body = encodeURIComponent(
                            'Event Report\\n\\n' +
                            'Event: ${safeEventName}\\n' +
                            'Date: ${safeEventDate}\\n' +
                            'Venue: ${safeVenue}\\n' +
                            'Total Students: ${totalStudents}\\n' +
                            'Present: ${presentCount}\\n\\n' +
                            'Please find the attached report for more details.\\n\\n' +
                            'Generated by Event Log Pro'
                        );
                        
                        // Open default email client
                        window.location.href = 'mailto:?subject=' + subject + '&body=' + body;
                        
                        // Provide option to download as HTML
                        setTimeout(() => {
                            if (confirm('Would you like to download this report as an HTML file to attach to your email?')) {
                                downloadReport();
                            }
                        }, 1000);
                    }
                    
                    function downloadReport() {
                        const reportContent = document.documentElement.outerHTML;
                        const blob = new Blob([reportContent], { type: 'text/html' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = 'event_report_${safeEventId}.html';
                        a.click();
                        URL.revokeObjectURL(url);
                    }
                </script>
            </body>
            </html>
        `;
        
        // Open report in new window
        const reportWindow = window.open('', '_blank');
        reportWindow.document.write(reportHTML);
        reportWindow.document.close();
        
    } catch (error) {
        console.error('Error generating report:', error);
        window.showToast('Error generating report: ' + error.message, 'error');
    }
};

// Make functions globally available
window.collectFormData = collectFormData;
window.updateCounts = updateCounts;
window.updateUIBasedOnAuth = updateUIBasedOnAuth;
window.deleteStudentRow = deleteStudentRow;
window.renumberRows = renumberRows;
window.handleIllnessChange = handleIllnessChange;
window.handleMedicationChange = handleMedicationChange;
window.resetForm = resetForm;
window.populateEventDropdown = populateEventDropdown;

console.log('✅ Firebase App.js loaded successfully');
