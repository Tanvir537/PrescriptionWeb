// API function to search medicines from backend
async function searchMedicines(query) {
    try {
        const response = await fetch(`http://127.0.0.1:3001/api/medicines/search?q=${query}`);
        const medicines = await response.json();
        return medicines;
    } catch (error) {
        console.error('Error searching medicines:', error);
        return [];
    }
}

// Global state
let prescriptionItems = [];
let selectedMedicine = null;
let expandedItems = new Set();

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    // Set current date
    const today = new Date();
    const formattedDate = today.toLocaleDateString('en-GB', { day: 'numeric', month: 'numeric', year: 'numeric' });
    document.getElementById('currentDate').textContent = formattedDate;
    
    // Sync Reg No. input with display
    const regNoInput = document.getElementById('regNoInput');
    const regNoDisplay = document.getElementById('regNoDisplay');
    regNoInput.addEventListener('input', () => {
        regNoDisplay.textContent = regNoInput.value;
    });
    
    // Setup search functionality
    setupMedicineSearch();
    
    // Load dashboard stats on initial load
    loadDashboardStats();

    // Add event listener for the add to prescription button
    document.getElementById('addToPrescriptionBtn').addEventListener('click', addToPrescription);
    document.getElementById('addAdviceToPrescriptionBtn').addEventListener('click', addAdviceToPrescription);
    
    // Close modal when clicking outside
    const modal = document.getElementById('templateEditorModal');
    if (modal) {
        modal.addEventListener('click', function(event) {
            if (event.target === modal) {
                closeTemplateEditor();
            }
        });
    }
});

function setupMedicineSearch() {
    const searchInput = document.getElementById('medicineSearchInput');
    const suggestionsContainer = document.getElementById('suggestionsContainer');
    const suggestionsSection = document.getElementById('suggestionsSection');
    const suggestionButtons = document.getElementById('suggestionButtons');

    searchInput.addEventListener('input', async function() {
        const query = searchInput.value.trim().toLowerCase();
        if (query.length < 2) {
            suggestionsContainer.classList.remove('show');
            suggestionsSection.style.display = 'none';
            return;
        }

        // Get medicines from API instead of hardcoded array
        const medicines = await searchMedicines(query);

        if (medicines.length > 0) {
            suggestionsSection.style.display = 'block';
            suggestionButtons.innerHTML = '';
            const uniqueBrandNames = new Set();

            const maxSuggestions = Math.min(medicines.length, 16);
            for (let i = 0; i < maxSuggestions; i++) {
                const medicine = medicines[i];
                // Use first brand name for button
                const brandName = medicine.brand_names[0];

                if (!uniqueBrandNames.has(brandName)) {
                    uniqueBrandNames.add(brandName);
                    const button = document.createElement('button');
                    button.className = 'suggestion-item';
                    button.textContent = brandName;
                    button.onclick = function() {
                        selectMedicine(brandName, medicine);
                    };
                    suggestionButtons.appendChild(button);
                }
            }
        } else {
            suggestionsSection.style.display = 'none';
        }
    });

    searchInput.addEventListener('keydown', async function(e) {
        if (e.key === 'Enter') {
            const query = searchInput.value.trim();
            if (query.length > 0) {
                const medicines = await searchMedicines(query);
                if (medicines.length > 0) {
                    // Find an exact match for the brand name
                    const exactMatch = medicines.find(med => med.brand_names.some(b => b.toLowerCase() === query.toLowerCase()));
                    if (exactMatch) {
                        selectMedicine(exactMatch.brand_names.find(b => b.toLowerCase() === query.toLowerCase()), exactMatch);
                    } else {
                        // If no exact match, select the first suggestion
                        selectMedicine(medicines[0].brand_names[0], medicines[0]);
                    }
                }
            }
        }
    });

    // Hide suggestions when clicking outside
    document.addEventListener('click', function(e) {
        if (!searchInput.contains(e.target) && !suggestionsContainer.contains(e.target)) {
            suggestionsContainer.classList.remove('show');
            suggestionsSection.style.display = 'none';
        }
    });
}

async function selectMedicine(brandName, medicine) {
    try {
        const response = await fetch(`http://127.0.0.1:3001/api/medicines/details/${medicine.generic_name}`);
        const medicineDetails = await response.json();
        showMedicationForm(medicineDetails, brandName);
    } catch (error) {
        console.error('Error fetching medicine details:', error);
    }
}

function showMedicationForm(medicineDetails, brandName) {
    selectedMedicine = {
        medicine: medicineDetails,
        brand: brandName
    };
    // Clear search
    document.getElementById('medicineSearchInput').value = '';
    document.getElementById('suggestionsSection').style.display = 'none';

    // Show medication form
    document.getElementById('medicationForm').style.display = 'grid';
    document.getElementById('addToPrescriptionBtn').style.display = 'block';

    // Show medication instructions section
    document.getElementById('medicationInstructionsSection').style.display = 'block';

    // Populate brand select
    const brandSelect = document.getElementById('brandSelect');
    brandSelect.innerHTML = '<option value="">Select Brand</option>';
    const brandNames = medicineDetails.brand_names;
    for (const brand of brandNames) {
        const option = document.createElement('option');
        option.value = brand;
        option.textContent = brand;
        if (brand === brandName) {
            option.selected = true;
        }
        brandSelect.appendChild(option);
    }

    // Populate generic select
    const genericSelect = document.getElementById('genericSelect');
    genericSelect.innerHTML = '<option value="">Select Generic</option>';
    const genericOption = document.createElement('option');
    genericOption.value = medicineDetails.generic_name;
    genericOption.textContent = medicineDetails.generic_name;
    genericOption.selected = true;
    genericSelect.appendChild(genericOption);


    // Populate form select
    const formSelect = document.getElementById('formSelect');
    formSelect.innerHTML = '<option value="">Select Form</option>';
    // Use forms_and_strengths to get unique dosage forms
    const forms = [...new Set(medicineDetails.forms_and_strengths.map(item => item.dosage_form))];
    for (const form of forms) {
        const option = document.createElement('option');
        option.value = form;
        option.textContent = form;
        formSelect.appendChild(option);
    }

    // Update strength options based on the selected form
    updateStrengthOptions();

    // Show medicine info
    document.getElementById('medicineInfo').style.display = 'block';
    document.getElementById('medicineIndication').textContent = medicineDetails.indication || 'N/A';
    document.getElementById('medicineContraindication').textContent = medicineDetails.contraindication || 'N/A';
    document.getElementById('medicineSideEffects').textContent = medicineDetails.side_effects || 'N/A';

    // Handle brand change
    brandSelect.addEventListener('change', function() {
        if (brandSelect.value) {
            selectMedicine(brandSelect.value, { generic_name: medicineDetails.generic_name });
        }
    });

    // Handle generic change
    genericSelect.addEventListener('change', function() {
        if (genericSelect.value) {
            // Find first brand for this generic
            const genericMed = medicineDetails;
            if (genericMed) {
                selectMedicine(genericMed.brand_names[0], { generic_name: genericMed.generic_name });
            }
        }
    });

    // Handle dosage form change
    formSelect.addEventListener('change', function() {
        // Update strength options based on selected form
        updateStrengthOptions();
    });

    // Handle custom dosage
    const dosageSelect = document.getElementById('dosageSelect');
    const customDosage = document.getElementById('customDosage');
    dosageSelect.addEventListener('change', function() {
        if (dosageSelect.value === 'Custom') {
            customDosage.style.display = 'block';
        } else {
            customDosage.style.display = 'none';
        }
    });

    // Handle custom timing
    const timingSelect = document.getElementById('timingSelect');
    const customTiming = document.getElementById('customTiming');
    timingSelect.addEventListener('change', function() {
        if (timingSelect.value === 'Custom') {
            customTiming.style.display = 'block';
        } else {
            customTiming.style.display = 'none';
        }
    });

    // Handle custom duration
    const durationSelect = document.getElementById('durationSelect');
    const customDuration = document.getElementById('customDuration');
    durationSelect.addEventListener('change', function() {
        if (durationSelect.value === 'Custom') {
            customDuration.style.display = 'block';
        } else {
            customDuration.style.display = 'none';
        }
    });
}

function updateStrengthOptions() {
    if (!selectedMedicine || !selectedMedicine.medicine.forms_and_strengths) return;

    const formSelect = document.getElementById('formSelect');
    const strengthSelect = document.getElementById('strengthSelect');
    const selectedForm = formSelect.value;

    strengthSelect.innerHTML = '<option value="">Select Strength</option>';

    const formStrengths = selectedMedicine.medicine.forms_and_strengths.find(item => item.dosage_form === selectedForm);

    if (formStrengths) {
        for (const strength of formStrengths.strengths) {
            const option = document.createElement('option');
            option.value = strength;
            option.textContent = strength;
            strengthSelect.appendChild(option);
        }
    }
}

function showMedicationTab(tabName) {
    // Hide all tabs content
    document.getElementById('medicationTabContent').style.display = 'none';
    document.getElementById('adviceTabContent').style.display = 'none';
    
    // Remove active class from all tabs
    document.getElementById('medicationTab').classList.remove('active');
    document.getElementById('adviceTab').classList.remove('active');
    
    // Show selected tab content
    if (tabName === 'medication') {
        document.getElementById('medicationTabContent').style.display = 'block';
        document.getElementById('medicationTab').classList.add('active');
    } else if (tabName === 'advice') {
        document.getElementById('adviceTabContent').style.display = 'block';
        document.getElementById('adviceTab').classList.add('active');
    }
}

// ========== TEMPLATE MANAGEMENT FUNCTIONS ==========

function showTemplateEditor(template = null) {
    const modal = document.getElementById('templateEditorModal');
    const title = document.getElementById('templateEditorTitle');
    
    if (template) {
        title.textContent = 'Edit Template';
        document.getElementById('templateId').value = template.id;
        document.getElementById('templateName').value = template.name;
        document.getElementById('templateContent').value = JSON.stringify(template.templateData, null, 2);
    } else {
        title.textContent = 'Create New Template';
        document.getElementById('templateForm').reset();
        document.getElementById('templateId').value = '';
        
        // Set default template structure
        const defaultTemplate = {
            prescriptionItems: [],
            advice: "",
            patientDetails: {
                name: "",
                age: "",
                gender: "",
                regNo: ""
            },
            chiefComplaints: "",
            drugHistory: "",
            investigation: "",
            diagnosis: "",
            followup: ""
        };
        document.getElementById('templateContent').value = JSON.stringify(defaultTemplate, null, 2);
    }
    
    modal.style.display = 'block';
}

function closeTemplateEditor() {
    document.getElementById('templateEditorModal').style.display = 'none';
}

// Renamed this function to avoid conflict with existing saveTemplate
async function saveTemplateForm(event) {
    event.preventDefault();
    
    const id = document.getElementById('templateId').value;
    const name = document.getElementById('templateName').value.trim();
    const content = document.getElementById('templateContent').value.trim();
    
    if (!name) {
        showNotification('Please enter a template name', 'error');
        return;
    }
    
    try {
        let templateData;
        try {
            templateData = JSON.parse(content);
        } catch (e) {
            showNotification('Invalid JSON format in template content', 'error');
            return;
        }
        
        const url = id ? `http://127.0.0.1:3001/api/templates/${id}` : 'http://127.0.0.1:3001/api/templates';
        const method = id ? 'PUT' : 'POST';
        
        const response = await fetch(url, {
            method: method,
            headers: { 
                'Content-Type': 'application/json' 
            },
            body: JSON.stringify({ 
                name: name, 
                templateData: templateData 
            })
        });
        
        if (response.ok) {
            showNotification(`Template ${id ? 'updated' : 'created'} successfully`);
            closeTemplateEditor();
            loadAllTemplates(); // Reload the template list
        } else {
            throw new Error('Failed to save template');
        }
    } catch (error) {
        console.error('Error saving template:', error);
        showNotification('Error saving template', 'error');
    }
}

function editTemplate(template) {
    showTemplateEditor(template);
}

// Renamed this function to avoid conflict
async function loadAllTemplates() {
    try {
        const response = await fetch('http://127.0.0.1:3001/api/templates');
        const templates = await response.json();
        
        const templateList = document.getElementById('templateList');
        templateList.innerHTML = '';
        
        if (templates.length === 0) {
            templateList.innerHTML = `
                <div class="no-templates">
                    <p>No templates found. Create your first template!</p>
                </div>
            `;
            return;
        }
        
        templates.forEach(template => {
            const templateCard = document.createElement('div');
            templateCard.className = 'template-card';
            templateCard.innerHTML = `
                <div class="template-header">
                    <h3 class="template-name">${template.name}</h3>
                    <div class="template-date">${new Date().toLocaleDateString()}</div>
                </div>
                <div class="template-preview">
                    <p><strong>Medications:</strong> ${template.templateData.prescriptionItems?.length || 0}</p>
                    <p><strong>Advice:</strong> ${template.templateData.advice ? 'Yes' : 'No'}</p>
                </div>
                <div class="template-actions">
                    <button class="template-btn load-btn" onclick="loadTemplateData(${template.id})">
                        <i class="fas fa-download"></i> Load
                    </button>
                    <button class="template-btn edit-btn" onclick="editTemplate(${JSON.stringify(template).replace(/"/g, '&quot;')})">
                        <i class="fas fa-edit"></i> Edit
                    </button>
                    <button class="template-btn delete-btn" onclick="deleteTemplateItem(${template.id})">
                        <i class="fas fa-trash"></i> Delete
                    </button>
                </div>
            `;
            templateList.appendChild(templateCard);
        });
    } catch (error) {
        console.error('Error loading templates:', error);
        showNotification('Error loading templates', 'error');
    }
}

// Update the existing loadTemplateData function to handle template loading
async function loadTemplateData(templateId) {
    try {
        const response = await fetch('http://127.0.0.1:3001/api/templates');
        const templates = await response.json();
        const template = templates.find(t => t.id === templateId);
        
        if (template) {
            // Load template data into the prescription form
            if (template.templateData.patientDetails) {
                document.getElementById('patientName').value = template.templateData.patientDetails.name || '';
                document.getElementById('patientAge').value = template.templateData.patientDetails.age || '';
                document.getElementById('patientGender').value = template.templateData.patientDetails.gender || '';
                document.getElementById('regNoInput').value = template.templateData.patientDetails.regNo || '';
                document.getElementById('regNoDisplay').textContent = template.templateData.patientDetails.regNo || '';
            }
            
            document.getElementById('chiefComplaints').value = template.templateData.chiefComplaints || '';
            document.getElementById('drugHistory').value = template.templateData.drugHistory || '';
            document.getElementById('investigationEntry').value = template.templateData.investigation || '';
            document.getElementById('diagnosis').value = template.templateData.diagnosis || '';
            document.getElementById('adviceEntry').value = template.templateData.advice || '';
            document.getElementById('followupEntry').value = template.templateData.followup || '';
            
            // Load prescription items
            if (template.templateData.prescriptionItems && template.templateData.prescriptionItems.length > 0) {
                prescriptionItems = template.templateData.prescriptionItems;
                renderPrescriptionList();
            }
            
            // Navigate to prescription page
            navigateTo('prescription', document.querySelector('.nav-item[onclick*="prescription"]'));
            showNotification(`Loaded template: ${template.name}`);
        } else {
            showNotification('Template not found', 'error');
        }
    } catch (error) {
        console.error('Error loading template:', error);
        showNotification('Error loading template', 'error');
    }
}

// Renamed this function to avoid conflict
async function deleteTemplateItem(templateId) {
    if (!confirm('Are you sure you want to delete this template? This action cannot be undone.')) {
        return;
    }
    
    try {
        const response = await fetch(`http://127.0.0.1:3001/api/templates/${templateId}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            showNotification('Template deleted successfully');
            loadAllTemplates(); // Refresh the template list
        } else {
            showNotification('Error deleting template', 'error');
        }
    } catch (error) {
        console.error('Error deleting template:', error);
        showNotification('Error deleting template', 'error');
    }
}

// ========== EXISTING FUNCTIONS (KEEP THESE AS IS) ==========

function addToPrescription() {
    if (!selectedMedicine) return;
    
    const brandSelect = document.getElementById('brandSelect');
    const genericSelect = document.getElementById('genericSelect');
    const formSelect = document.getElementById('formSelect');
    const strengthSelect = document.getElementById('strengthSelect');
    const dosageSelect = document.getElementById('dosageSelect');
    const customDosage = document.getElementById('customDosage');
    const timingSelect = document.getElementById('timingSelect');
    const customTiming = document.getElementById('customTiming');
    const durationSelect = document.getElementById('durationSelect');
    const customDuration = document.getElementById('customDuration');
    const medicationInstructions = document.getElementById('medicationInstructions');

    const dosage = dosageSelect.value === 'Custom' ? customDosage.value : dosageSelect.value;
    const timing = timingSelect.value === 'Custom' ? customTiming.value : timingSelect.value;
    const duration = durationSelect.value === 'Custom' ? customDuration.value : durationSelect.value;

    const prescriptionItem = {
        id: Date.now(),
        brand: brandSelect.value,
        generic: genericSelect.value,
        form: formSelect.value,
        strength: strengthSelect.value,
        dosage: dosage,
        timing: timing,
        duration: duration,
        instructions: medicationInstructions.value,
        medicine: selectedMedicine.medicine,
        isAdvice: false
    };

    prescriptionItems.push(prescriptionItem);
    renderPrescriptionList();

    // Reset form
    document.getElementById('medicationForm').style.display = 'none';
    document.getElementById('addToPrescriptionBtn').style.display = 'none';
    document.getElementById('medicineSearchInput').value = '';
    document.getElementById('medicationInstructionsSection').style.display = 'none';
    document.getElementById('medicineInfo').style.display = 'none';

    showNotification(`Added ${prescriptionItem.brand} to prescription!`);
}

function addAdviceToPrescription() {
    const prescriptionAdvice = document.getElementById('prescriptionAdvice').value.trim();
    if (!prescriptionAdvice) return;
    
    const prescriptionItem = {
        id: Date.now(),
        advice: prescriptionAdvice,
        isAdvice: true
    };
    prescriptionItems.push(prescriptionItem);
    renderPrescriptionList();
    
    // Reset form
    document.getElementById('prescriptionAdvice').value = '';
    showNotification('Advice added to prescription!');
}

function renderPrescriptionList() {
    const container = document.getElementById('prescriptionItems');
    if (prescriptionItems.length === 0) {
        container.innerHTML = '<p style="text-align: center; padding: 20px; color: #777;">No medications added yet.</p>';
        return;
    }
    
    container.innerHTML = '';
    for (let i = 0; i < prescriptionItems.length; i++) {
        const item = prescriptionItems[i];
        const isExpanded = expandedItems.has(item.id);
        const itemElement = document.createElement('div');
        itemElement.className = `prescription-item ${isExpanded ? 'expanded' : ''}`;

        // Header
        const headerElement = document.createElement('div');
        headerElement.className = 'prescription-item-header';
        headerElement.onclick = () => togglePrescriptionItem(item.id);
        const titleElement = document.createElement('h3');
        if (item.isAdvice) {
            titleElement.textContent = 'Prescription Advice';
        } else {
            titleElement.textContent = `${item.form}. ${item.brand} ${item.strength}`;
        }
        headerElement.appendChild(titleElement);

        // Actions
        const actionsElement = document.createElement('div');
        actionsElement.className = 'prescription-item-actions';
        
        // Move up button
        const moveUpBtn = document.createElement('button');
        moveUpBtn.className = 'action-btn move-up-btn';
        moveUpBtn.innerHTML = '↑';
        moveUpBtn.disabled = i === 0;
        moveUpBtn.title = 'Move up';
        moveUpBtn.onclick = () => movePrescriptionItem(i, -1);
        actionsElement.appendChild(moveUpBtn);
        
        // Move down button
        const moveDownBtn = document.createElement('button');
        moveDownBtn.className = 'action-btn move-down-btn';
        moveDownBtn.innerHTML = '↓';
        moveDownBtn.disabled = i === prescriptionItems.length - 1;
        moveDownBtn.title = 'Move down';
        moveDownBtn.onclick = () => movePrescriptionItem(i, 1);
        actionsElement.appendChild(moveDownBtn);
        
        // Delete button
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'action-btn delete-btn';
        deleteBtn.innerHTML = '✖';
        deleteBtn.title = 'Delete';
        deleteBtn.onclick = () => deletePrescriptionItem(i);
        actionsElement.appendChild(deleteBtn);

        headerElement.appendChild(actionsElement);
        itemElement.appendChild(headerElement);

        // Content
        const contentElement = document.createElement('div');
        contentElement.className = 'prescription-item-content';
        if (item.isAdvice) {
            // For advice items, just show advice text
            const adviceElement = document.createElement('div');
            adviceElement.className = 'prescription-instructions';
            adviceElement.innerHTML = `<label>Advice:</label> <textarea readonly>${item.advice}</textarea>`;
            contentElement.appendChild(adviceElement);
        } else {
            // For medication items, show all details
            const detailsElement = document.createElement('div');
            detailsElement.className = 'prescription-details';
            
            // Brand
            const brandElement = document.createElement('div');
            brandElement.innerHTML = `<label>Brand:</label> <input type="text" value="${item.brand}" readonly>`;
            detailsElement.appendChild(brandElement);
            
            // Generic
            const genericElement = document.createElement('div');
            genericElement.innerHTML = `<label>Generic:</label> <input type="text" value="${item.generic}" readonly>`;
            detailsElement.appendChild(genericElement);
            
            // Strength
            const strengthElement = document.createElement('div');
            strengthElement.innerHTML = `<label>Strength:</label> <input type="text" value="${item.strength}" readonly>`;
            detailsElement.appendChild(strengthElement);
            
            // Form
            const formElement = document.createElement('div');
            formElement.innerHTML = `<label>Form:</label> <input type="text" value="${item.form}" readonly>`;
            detailsElement.appendChild(formElement);
            
            // Dosage
            const dosageElement = document.createElement('div');
            dosageElement.innerHTML = `<label>Dosage:</label> <input type="text" value="${item.dosage}" readonly>`;
            detailsElement.appendChild(dosageElement);
            
            // Timing
            const timingElement = document.createElement('div');
            timingElement.innerHTML = `<label>Timing:</label> <input type="text" value="${item.timing}" readonly>`;
            detailsElement.appendChild(timingElement);
            
            // Duration
            const durationElement = document.createElement('div');
            durationElement.innerHTML = `<label>Duration:</label> <input type="text" value="${item.duration}" readonly>`;
            detailsElement.appendChild(durationElement);
            
            // Instructions
            const instructionsElement = document.createElement('div');
            instructionsElement.className = 'prescription-instructions';
            instructionsElement.innerHTML = `<label>Instructions:</label> <textarea readonly>${item.instructions || ''}</textarea>`;
            detailsElement.appendChild(instructionsElement);
            
            contentElement.appendChild(detailsElement);
        }
        itemElement.appendChild(contentElement);
        container.appendChild(itemElement);
    }
}

function togglePrescriptionItem(id) {
    if (expandedItems.has(id)) {
        expandedItems.delete(id);
    } else {
        expandedItems.add(id);
    }
    renderPrescriptionList();
    updateToggleButton();
}

function toggleAllPrescriptions() {
    const allExpanded = expandedItems.size === prescriptionItems.length;
    if (allExpanded) {
        expandedItems.clear();
    } else {
        prescriptionItems.forEach(item => expandedItems.add(item.id));
    }
    renderPrescriptionList();
    updateToggleButton();
}

function updateToggleButton() {
    const toggleBtn = document.getElementById('toggleAllBtn');
    const allExpanded = expandedItems.size === prescriptionItems.length;
    toggleBtn.textContent = allExpanded ? '⊟ Collapse All' : '⊞ Expand All';
}

function movePrescriptionItem(index, direction) {
    const newIndex = index + direction;
    if (newIndex >= 0 && newIndex < prescriptionItems.length) {
        const item = prescriptionItems[index];
        prescriptionItems.splice(index, 1);
        prescriptionItems.splice(newIndex, 0, item);
        renderPrescriptionList();
    }
}

function deletePrescriptionItem(index) {
    prescriptionItems.splice(index, 1);
    renderPrescriptionList();
    showNotification('Medication removed from prescription');
}

function toggleSidebar() {
    const sidebar = document.getElementById('collapsibleSidebar');
    const toggleIcon = document.getElementById('toggleIcon');
    sidebar.classList.toggle('expanded');
    if (sidebar.classList.contains('expanded')) {
        toggleIcon.textContent = '✕';
    } else {
        toggleIcon.textContent = '☰';
    }
}

function navigateTo(page, element) {
    // Hide all pages
    document.querySelectorAll('.page-container').forEach(p => {
        p.classList.remove('active');
    });
    
    // Show selected page
    document.getElementById(`${page}-page`).classList.add('active');
    
    // Remove active class from all nav items
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    
    // Add active class to clicked item
    element.classList.add('active');
    
    // Show notification for navigation
    showNotification(`Navigated to ${page.charAt(0).toUpperCase() + page.slice(1).replace('-', ' ')}`, 'success');
    
    // Load dashboard statistics when navigating to dashboard
    if (page === 'dashboard') {
        loadDashboardStats();
    } else if (page === 'previous-prescription') {
        loadPreviousPrescriptions();
    } else if (page === 'templates') {
        loadAllTemplates(); // Use the renamed function
    }
}

function showNotification(message, type = 'success') {
    const notificationEl = document.getElementById('notification');
    notificationEl.textContent = message;
    notificationEl.className = 'notification ' + type;
    notificationEl.classList.add('show');
    setTimeout(() => {
        notificationEl.classList.remove('show');
    }, 3000);
}

// Keep the original saveTemplate function (for saving current prescription as template)
async function saveTemplate() {
    const templateName = prompt('Enter a name for this template:');
    if (!templateName) {
        showNotification('Template name cannot be empty', 'warning');
        return;
    }

    const templateData = {
        prescriptionItems: prescriptionItems,
        advice: document.getElementById('adviceEntry').value,
        patientDetails: {
            name: document.getElementById('patientName').value,
            age: document.getElementById('patientAge').value,
            gender: document.getElementById('patientGender').value,
            regNo: document.getElementById('regNoInput').value
        },
        chiefComplaints: document.getElementById('chiefComplaints').value,
        drugHistory: document.getElementById('drugHistory').value,
        investigation: document.getElementById('investigationEntry').value,
        diagnosis: document.getElementById('diagnosis').value,
        followup: document.getElementById('followupEntry').value
    };

    try {
        const response = await fetch('http://127.0.0.1:3001/api/templates', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                name: templateName,
                templateData: templateData
            })
        });

        if (response.ok) {
            showNotification('Template saved successfully');
            loadAllTemplates(); // Refresh the template list
        } else {
            showNotification('Error saving template', 'error');
        }
    } catch (error) {
        console.error('Error saving template:', error);
        showNotification('Error saving template', 'error');
    }
}

// Keep the original loadTemplate function (simple version)
async function loadTemplate() {
    try {
        const response = await fetch('http://127.0.0.1:3001/api/templates');
        const templates = await response.json();
        
        if (templates.length === 0) {
            showNotification('No templates available', 'warning');
            return;
        }
        
        // Simple template selection - you can enhance this with a modal
        const templateNames = templates.map(t => t.name);
        const selectedName = prompt(`Available templates:\n${templateNames.join('\n')}\n\nEnter template name to load:`);
        
        if (selectedName) {
            const template = templates.find(t => t.name === selectedName);
            if (template) {
                loadTemplateData(template.id);
            } else {
                showNotification('Template not found', 'error');
            }
        }
    } catch (error) {
        console.error('Error loading templates:', error);
        showNotification('Error loading templates', 'error');
    }
}

// Keep the original deleteTemplate function (simple version)
async function deleteTemplate(templateId) {
    if (!confirm('Are you sure you want to delete this template?')) {
        return;
    }

    try {
        const response = await fetch(`http://127.0.0.1:3001/api/templates/${templateId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            showNotification('Template deleted successfully');
            loadAllTemplates(); // Refresh the template list
        } else {
            showNotification('Error deleting template', 'error');
        }
    } catch (error) {
        console.error('Error deleting template:', error);
        showNotification('Error deleting template', 'error');
    }
}

function generatePrintablePrescription() {
    // Expand all prescription items for printing
    prescriptionItems.forEach(item => expandedItems.add(item.id));
    renderPrescriptionList();
    
    // Trigger print dialog
    window.print();
    showNotification('Print dialog opened');
}

function searchPrescriptions() {
    // Get filter values
    const patientName = document.getElementById('filterPatientName').value.toLowerCase();
    const dateFrom = document.getElementById('filterDateFrom').value;
    const dateTo = document.getElementById('filterDateTo').value;
    const regNo = document.getElementById('filterRegNo').value.toLowerCase();
    
    // Filter table rows (simplified for demo)
    const rows = document.querySelectorAll('#prescriptionTableBody tr');
    rows.forEach(row => {
        const cells = row.getElementsByTagName('td');
        const rowPatientName = cells[2].textContent.toLowerCase();
        const rowRegNo = cells[1].textContent.toLowerCase();
        const rowDate = cells[0].textContent;
        let showRow = true;
        if (patientName && !rowPatientName.includes(patientName)) {
            showRow = false;
        }
        if (regNo && !rowRegNo.includes(regNo)) {
            showRow = false;
        }
        row.style.display = showRow ? '' : 'none';
    });
    
    showNotification('Prescriptions filtered');
}

// New function to load dashboard statistics from backend
async function loadDashboardStats() {
    try {
        const response = await fetch('http://127.0.0.1:3001/api/dashboard/stats');
        const stats = await response.json();
        
        // Update dashboard cards with real data
        updateDashboardCards(stats);
    } catch (error) {
        console.error('Error loading dashboard stats:', error);
    }
}

// New function to update dashboard cards
function updateDashboardCards(stats) {
    const statCards = document.querySelectorAll('.stat-value');
    const statsArray = [stats.prescriptionsToday, stats.totalPatients, stats.pendingReviews, stats.medicationsPrescribed];
    
    statCards.forEach((card, index) => {
        if (statsArray[index] !== undefined) {
            card.textContent = statsArray[index];
        }
    });
}

// New function to load all previous prescriptions from backend
async function loadPreviousPrescriptions() {
    try {
        const response = await fetch('http://127.0.0.1:3001/api/prescriptions');
        const result = await response.json();
        
        if (response.ok) {
            const prescriptions = result.data;
            const tableBody = document.getElementById('prescriptionTableBody');
            tableBody.innerHTML = ''; // Clear existing rows
            
            if (prescriptions.length === 0) {
                tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center;">No previous prescriptions found.</td></tr>';
                return;
            }

            prescriptions.forEach(p => {
                const row = tableBody.insertRow();
                row.insertCell().textContent = p.date;
                row.insertCell().textContent = p.prescriptionNo;
                row.insertCell().textContent = p.patientName;
                row.insertCell().textContent = p.diagnosis;
                row.insertCell().textContent = p.medications ? p.medications.length : 0; 
                const actionsCell = row.insertCell();
                const viewBtn = document.createElement('button');
                viewBtn.className = 'view-btn';
                viewBtn.textContent = 'View';
                viewBtn.onclick = () => viewPrescription(p.id);
                actionsCell.appendChild(viewBtn);
            });
        } else {
            showNotification('Error loading previous prescriptions', 'error');
        }
    } catch (error) {
        console.error('Error loading previous prescriptions:', error);
        showNotification('Error loading previous prescriptions', 'error');
    }
}

// Modify viewPrescription to fetch and display details
async function viewPrescription(id) {
    try {
        const response = await fetch(`http://127.0.0.1:3001/api/prescriptions/${id}`);
        const result = await response.json();

        if (response.ok) {
            const prescriptionData = result.data;
            
            // Navigate to prescription page
            navigateTo('prescription', document.querySelector('.nav-item[onclick*="prescription"]'));
            
            // Populate form fields with fetched data
            populatePrescriptionForm(prescriptionData);
            showNotification(`Loaded prescription #${id}`, 'success');
        } else {
            showNotification('Error loading prescription details', 'error');
        }
    } catch (error) {
        console.error('Error loading prescription details:', error);
        showNotification('Error loading prescription details', 'error');
    }
}

// FIXED: Complete the populatePrescriptionForm function
function populatePrescriptionForm(data) {
    // Patient Details
    document.getElementById('patientName').value = data.patientDetails?.name || '';
    document.getElementById('patientAge').value = data.patientDetails?.age || '';
    document.getElementById('patientGender').value = data.patientDetails?.gender || '';
    document.getElementById('regNoInput').value = data.patientDetails?.regNo || '';
    document.getElementById('regNoDisplay').textContent = data.patientDetails?.regNo || '';

    // Chief Complaints
    document.getElementById('chiefComplaints').value = data.chiefComplaints || '';

    // History Of
    // Clear all checkboxes first
    document.querySelectorAll('input[name="history"]').forEach(checkbox => checkbox.checked = false);
    if (data.historyOf) {
        if (data.historyOf.HTN) document.querySelector('input[name="history"][value="HTN"]').checked = true;
        if (data.historyOf.DM) document.querySelector('input[name="history"][value="DM"]').checked = true;
        if (data.historyOf.IHD) document.querySelector('input[name="history"][value="IHD"]').checked = true;
        if (data.historyOf.BA) document.querySelector('input[name="history"][value="BA"]').checked = true;
        if (data.historyOf.CKD) document.querySelector('input[name="history"][value="CKD"]').checked = true;
        document.getElementById('historyOthers').value = data.historyOf.others || '';
    }

    // Drug History
    document.getElementById('drugHistory').value = data.drugHistory || '';

    // On Examination
    if (data.onExamination) {
        document.getElementById('bpSys').value = data.onExamination.bpSys || '';
        document.getElementById('bpDia').value = data.onExamination.bpDia || '';
        document.getElementById('pulse').value = data.onExamination.pulse || '';
        document.getElementById('temp').value = data.onExamination.temp || '';
        document.getElementById('spo2').value = data.onExamination.spo2 || '';
        document.getElementById('rr').value = data.onExamination.rr || '';
        document.getElementById('oeOthers').value = data.onExamination.others || '';
    }

    // Investigation
    document.getElementById('investigationEntry').value = data.investigation || '';

    // Diagnosis
    document.getElementById('diagnosis').value = data.diagnosis || '';

    // Advice
    document.getElementById('adviceEntry').value = data.advice || '';

    // Follow-up
    document.getElementById('followupEntry').value = data.followup || '';

    // Prescription Items
    prescriptionItems = data.prescriptionItems || [];
    renderPrescriptionList();
}

// Remove duplicate functions that were causing conflicts
// (The duplicate loadTemplateById, loadTemplateData, and deleteTemplate functions are removed)

function saveProfile() {
    showNotification('Profile saved successfully', 'success');
}

async function savePrescriptionToBackend() {
    // Collect all form data
    const formData = {
        patientDetails: {
            name: document.getElementById('patientName').value,
            age: document.getElementById('patientAge').value,
            gender: document.getElementById('patientGender').value,
            regNo: document.getElementById('regNoInput').value,
            date: document.getElementById('currentDate').textContent
        },
        chiefComplaints: document.getElementById('chiefComplaints').value,
        historyOf: {
            HTN: document.querySelector('input[name="history"][value="HTN"]').checked,
            DM: document.querySelector('input[name="history"][value="DM"]').checked,
            IHD: document.querySelector('input[name="history"][value="IHD"]').checked,
            BA: document.querySelector('input[name="history"][value="BA"]').checked,
            CKD: document.querySelector('input[name="history"][value="CKD"]').checked,
            others: document.getElementById('historyOthers').value
        },
        drugHistory: document.getElementById('drugHistory').value,
        onExamination: {
            bpSys: document.getElementById('bpSys').value,
            bpDia: document.getElementById('bpDia').value,
            pulse: document.getElementById('pulse').value,
            temp: document.getElementById('temp').value,
            spo2: document.getElementById('spo2').value,
            rr: document.getElementById('rr').value,
            others: document.getElementById('oeOthers').value
        },
        investigation: document.getElementById('investigationEntry').value,
        diagnosis: document.getElementById('diagnosis').value,
        advice: document.getElementById('adviceEntry').value,
        followup: document.getElementById('followupEntry').value,
        prescriptionItems: prescriptionItems
    };
    
    console.log(formData); // Add this line for debugging
    try {
        const response = await fetch('http://127.0.0.1:3001/api/prescriptions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(formData)
        });
        
        const result = await response.json();
        
        if (response.ok) {
            showNotification('Prescription saved successfully!');
            // Clear form after saving
            clearPrescriptionForm();
        } else {
            showNotification('Error saving prescription', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showNotification('Error saving prescription', 'error');
    }
}

function clearPrescriptionForm() {
    // Clear all form fields
    document.getElementById('patientName').value = '';
    document.getElementById('patientAge').value = '';
    document.getElementById('patientGender').value = '';
    document.getElementById('regNoInput').value = '1299'; // Next reg number
    document.getElementById('regNoDisplay').textContent = '1299';
    document.getElementById('chiefComplaints').value = '';
    document.getElementById('drugHistory').value = '';
    document.getElementById('investigationEntry').value = '';
    document.getElementById('diagnosis').value = '';
    document.getElementById('adviceEntry').value = '';
    document.getElementById('followupEntry').value = '';
    
    // Clear prescription items
    prescriptionItems = [];
    renderPrescriptionList();
}