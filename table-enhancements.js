// ============================================
// PERMANENT STUDENT TABLE ENHANCEMENTS
// ============================================

console.log('🚨 TABLE ENHANCEMENTS: Loading...');

function initializeTableEnhancements() {
    console.log('🎯 TABLE ENHANCEMENTS: Initializing...');
    
    // Wait for table to exist
    const table = document.getElementById('studentTable');
    if (!table) {
        console.log('⏳ TABLE ENHANCEMENTS: Student table not found, retrying in 500ms...');
        setTimeout(initializeTableEnhancements, 500);
        return;
    }

    console.log('✅ TABLE ENHANCEMENTS: Student table found!');

    // Add CSS
    const enhancementCSS = `
        .search-container {
            margin-bottom: 15px;
            display: flex;
            gap: 10px;
            align-items: center;
        }
        .table-scroll-container {
            max-height: 500px;
            overflow-y: auto;
            overflow-x: auto;
            margin: 20px 0;
            border: 1px solid #ddd;
            border-radius: 8px;
            position: relative;
        }
        body.dark .table-scroll-container {
            border-color: #1f2a37;
            background: #121922;
        }
        .table-scroll-container thead th {
            position: sticky;
            top: 0;
            background: #f0f2f5;
            z-index: 10;
            border-bottom: 1px solid #ddd;
        }
        body.dark .table-scroll-container thead th {
            background: #162131;
            border-bottom-color: #1f2a37;
        }
        .student-counter {
            position: sticky;
            bottom: 0;
            background: #f8f9fa;
            padding: 10px;
            border-top: 1px solid #ddd;
            font-weight: bold;
            text-align: center;
            z-index: 5;
        }
        body.dark .student-counter {
            background: #0f1720;
            border-top-color: #1f2a37;
            color: #e5e7eb;
        }
        #studentCountBadge {
            font-size: 0.7em;
            background: #0078d7;
            color: white;
            padding: 2px 8px;
            border-radius: 12px;
            margin-left: 10px;
        }
        .search-container input:focus {
            outline: none;
            border-color: #0078d7;
            box-shadow: 0 0 0 2px rgba(0, 120, 215, 0.2);
        }
    `;
    
    // Only add CSS once
    if (!document.getElementById('tableEnhancementCSS')) {
        const style = document.createElement('style');
        style.id = 'tableEnhancementCSS';
        style.textContent = enhancementCSS;
        document.head.appendChild(style);
        console.log('✅ TABLE ENHANCEMENTS: CSS added');
    }

    // Create search bar (only once)
    if (!document.getElementById('studentSearch')) {
        const searchContainer = document.createElement('div');
        searchContainer.className = 'search-container';
        searchContainer.innerHTML = `
            <input type="text" id="studentSearch" placeholder="🔍 Search students by name, form, or contact..." style="padding: 10px 12px; border: 1px solid #ccc; border-radius: 6px; flex: 1; font-size: 14px;">
            <button onclick="clearSearch()" class="btn-secondary" style="padding: 10px 15px; white-space: nowrap;">Clear Search</button>
        `;
        
        const studentHeader = document.querySelector('h4');
        if (studentHeader) {
            studentHeader.parentNode.insertBefore(searchContainer, studentHeader.nextElementSibling);
            console.log('✅ TABLE ENHANCEMENTS: Search bar added');
        }
        
        document.getElementById('studentSearch').addEventListener('input', function(e) {
            filterStudents(e.target.value);
        });
    }

    // Create scroll container (only once)
    if (!document.getElementById('studentTableContainer')) {
        const scrollContainer = document.createElement('div');
        scrollContainer.id = 'studentTableContainer';
        scrollContainer.className = 'table-scroll-container';
        
        const tableParent = table.parentNode;
        tableParent.insertBefore(scrollContainer, table);
        scrollContainer.appendChild(table);
        
        // Add student counter
        const studentCounter = document.createElement('div');
        studentCounter.id = 'studentCounter';
        studentCounter.className = 'student-counter';
        studentCounter.textContent = 'Total Students: 0';
        scrollContainer.appendChild(studentCounter);
        
        console.log('✅ TABLE ENHANCEMENTS: Scroll container added');
    }

    // Create count badge (only once)
    if (!document.getElementById('studentCountBadge')) {
        const studentHeader = document.querySelector('h4');
        if (studentHeader && !studentHeader.querySelector('#studentCountBadge')) {
            const badge = document.createElement('span');
            badge.id = 'studentCountBadge';
            badge.textContent = '0 students';
            studentHeader.appendChild(badge);
            console.log('✅ TABLE ENHANCEMENTS: Count badge added');
        }
    }

    // Make headers sticky
    const thead = document.querySelector('#studentTable thead');
    if (thead) {
        const thElements = thead.querySelectorAll('th');
        thElements.forEach(th => {
            th.style.position = 'sticky';
            th.style.top = '0';
            th.style.zIndex = '10';
        });
    }

    // Initialize counter
    updateStudentCounter();
    
    // Set up auto-update observer
    const tableBody = document.querySelector('#studentTable tbody');
    if (tableBody) {
        const observer = new MutationObserver(() => {
            setTimeout(updateStudentCounter, 100);
        });
        observer.observe(tableBody, { childList: true, subtree: true });
        console.log('✅ TABLE ENHANCEMENTS: Mutation observer set up');
    }
    
    console.log('✅ TABLE ENHANCEMENTS: Initialization complete!');
}

function filterStudents(searchTerm) {
    const rows = document.querySelectorAll('#studentTable tbody tr');
    const term = searchTerm.toLowerCase().trim();
    let visibleCount = 0;
    
    rows.forEach(row => {
        const name = row.cells[1]?.querySelector('input')?.value.toLowerCase() || '';
        const form = row.cells[2]?.querySelector('input')?.value.toLowerCase() || '';
        const contact = row.cells[3]?.querySelector('input')?.value.toLowerCase() || '';
        
        const matches = name.includes(term) || form.includes(term) || contact.includes(term) || term === '';
        row.style.display = matches ? '' : 'none';
        if (matches) visibleCount++;
    });
    
    updateStudentCounter();
}

function updateStudentCounter() {
    const rows = document.querySelectorAll('#studentTable tbody tr');
    const searchInput = document.getElementById('studentSearch');
    const searchTerm = searchInput ? searchInput.value.trim() : '';
    
    let validStudents = 0;
    let visibleStudents = 0;
    
    rows.forEach(row => {
        if (row.style.display !== 'none') {
            const nameInput = row.cells[1]?.querySelector('input');
            const hasName = nameInput && nameInput.value.trim() !== '';
            
            if (hasName) {
                validStudents++;
                visibleStudents++;
            }
        }
    });
    
    const counter = document.getElementById('studentCounter');
    const badge = document.getElementById('studentCountBadge');
    
    if (counter) {
        counter.textContent = searchTerm ? 
            `Showing: ${visibleStudents} of ${validStudents} students` : 
            `Total Students: ${validStudents}`;
    }
    
    if (badge) {
        badge.textContent = `${validStudents} student${validStudents !== 1 ? 's' : ''}`;
    }
}

window.clearSearch = function() {
    const searchInput = document.getElementById('studentSearch');
    if (searchInput) {
        searchInput.value = '';
        filterStudents('');
    }
};

// Enhanced initialization that works with your auth flow
function initializeWithAuthCheck() {
    console.log('🔍 TABLE ENHANCEMENTS: Checking authentication status...');
    
    // Check if user is authenticated and main container is visible
    const mainContainer = document.getElementById('mainContainer');
    const landingPage = document.getElementById('landingPage');
    
    if (mainContainer && mainContainer.style.display !== 'none' && 
        landingPage && landingPage.style.display === 'none') {
        console.log('✅ TABLE ENHANCEMENTS: User authenticated, initializing...');
        initializeTableEnhancements();
    } else {
        console.log('⏳ TABLE ENHANCEMENTS: Waiting for authentication...');
        setTimeout(initializeWithAuthCheck, 1000);
    }
}

// Start initialization when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        console.log('📄 TABLE ENHANCEMENTS: DOM loaded, starting auth check...');
        setTimeout(initializeWithAuthCheck, 100);
    });
} else {
    console.log('⚡ TABLE ENHANCEMENTS: DOM already loaded, starting auth check...');
    setTimeout(initializeWithAuthCheck, 100);
}

// Also listen for URL changes (since your app uses URL parameters)
let currentUrl = window.location.href;
setInterval(() => {
    if (window.location.href !== currentUrl) {
        currentUrl = window.location.href;
        console.log('🔄 TABLE ENHANCEMENTS: URL changed, reinitializing...');
        setTimeout(initializeTableEnhancements, 1000);
    }
}, 500);

console.log('🚨 TABLE ENHANCEMENTS: Script loaded successfully!');
