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
let currentTemplateId = null;

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
        document.getElementById('templateName').value = template.name || '';
        
        // Load template data into form fields
        const templateData = template.templateData || {};
        
        // Patient Details
        document.getElementById('templatePatientName').value = templateData.patientDetails?.name || '';
        document.getElementById('templatePatientAge').value = templateData.patientDetails?.age || '';
        document.getElementById('templatePatientGender').value = templateData.patientDetails?.gender || '';
        document.getElementById('templatePatientRegNo').value = templateData.patientDetails?.regNo || '';
        
        // Medical Information
        document.getElementById('templateChiefComplaints').value = templateData.chiefComplaints || '';
        document.getElementById('templateDrugHistory').value = templateData.drugHistory || '';
        document.getElementById('templateInvestigation').value = templateData.investigation || '';
        document.getElementById('templateDiagnosis').value = templateData.diagnosis || '';
        
        // Advice & Follow-up
        document.getElementById('templateAdvice').value = templateData.advice || '';
        document.getElementById('templateFollowup').value = templateData.followup || '';
        
        // Prescription Items
        loadTemplatePrescriptionItems(templateData.prescriptionItems || []);
    } else {
        title.textContent = 'Create New Template';
        document.getElementById('templateForm').reset();
        document.getElementById('templateId').value = '';
        loadTemplatePrescriptionItems([]);
    }
    
    modal.style.display = 'block';
}

function loadTemplatePrescriptionItems(items) {
    const container = document.getElementById('templatePrescriptionItems');
    
    if (!items || items.length === 0) {
        container.innerHTML = '<p class="no-items">No prescription items in template</p>';
        return;
    }
    
    container.innerHTML = '';
    items.forEach(item => {
        const itemElement = document.createElement('div');
        itemElement.className = `prescription-item-preview ${item.isAdvice ? 'advice' : 'medication'}`;
        
        if (item.isAdvice) {
            itemElement.innerHTML = `
                <strong>📋 Advice:</strong> ${item.advice || ''}
            `;
        } else {
            itemElement.innerHTML = `
                <strong>💊 ${item.brand || item.generic || 'Medication'}:</strong> 
                ${item.dosage || ''} ${item.timing || ''} ${item.duration || ''}
            `;
        }
        
        container.appendChild(itemElement);
    });
}

function includeCurrentPrescription() {
    loadTemplatePrescriptionItems(prescriptionItems);
    showNotification('Current prescription items included in template');
}

// Updated save function for template form
async function saveTemplateForm(event) {
    event.preventDefault();
    
    const id = document.getElementById('templateId').value;
    const name = document.getElementById('templateName').value.trim();
    
    if (!name) {
        showNotification('Please enter a template name', 'error');
        return;
    }
    
    try {
        // Get current prescription items from the preview
        const prescriptionItems = [];
        const previewItems = document.getElementById('templatePrescriptionItems').children;
        
        // For now, we'll use the current prescription items
        // In a more advanced version, you'd want to store the actual item data
        const currentPrescriptionItems = prescriptionItems; // This uses the global prescriptionItems
        
        const templateData = {
            prescriptionItems: currentPrescriptionItems,
            advice: document.getElementById('templateAdvice').value,
            patientDetails: {
                name: document.getElementById('templatePatientName').value,
                age: document.getElementById('templatePatientAge').value,
                gender: document.getElementById('templatePatientGender').value,
                regNo: document.getElementById('templatePatientRegNo').value
            },
            chiefComplaints: document.getElementById('templateChiefComplaints').value,
            drugHistory: document.getElementById('templateDrugHistory').value,
            investigation: document.getElementById('templateInvestigation').value,
            diagnosis: document.getElementById('templateDiagnosis').value,
            followup: document.getElementById('templateFollowup').value
        };
        
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
            loadAllTemplates();
        } else {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to save template');
        }
    } catch (error) {
        console.error('Error saving template:', error);
        showNotification('Error saving template: ' + error.message, 'error');
    }
}

function closeTemplateEditor() {
    document.getElementById('templateEditorModal').style.display = 'none';
}

// Load all templates
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
            const templateData = template.templateData || {};
            const prescriptionItems = Array.isArray(templateData.prescriptionItems) ? templateData.prescriptionItems : [];
            
            const templateCard = document.createElement('div');
            templateCard.className = 'template-card';
            templateCard.innerHTML = `
                <div class="template-header">
                    <h3 class="template-name">${template.name}</h3>
                    <div class="template-date">${new Date(template.createdAt).toLocaleDateString()}</div>
                </div>
                <div class="template-preview">
                    <p><strong>Patient:</strong> ${templateData.patientDetails?.name || 'Not set'}</p>
                    <p><strong>Diagnosis:</strong> ${templateData.diagnosis ? 'Yes' : 'No'}</p>
                    <p><strong>Medications:</strong> ${prescriptionItems.length} items</p>
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
        const response = await fetch(`http://127.0.0.1:3001/api/templates/${templateId}`);
        const template = await response.json();
        
        if (template && template.templateData) {
            const templateData = template.templateData;
            
            // Load template data into the prescription form
            if (templateData.patientDetails) {
                document.getElementById('patientName').value = templateData.patientDetails.name || '';
                document.getElementById('patientAge').value = templateData.patientDetails.age || '';
                document.getElementById('patientGender').value = templateData.patientDetails.gender || '';
                document.getElementById('regNoInput').value = templateData.patientDetails.regNo || '';
                document.getElementById('regNoDisplay').textContent = templateData.patientDetails.regNo || '';
            }
            
            document.getElementById('chiefComplaints').value = templateData.chiefComplaints || '';
            document.getElementById('drugHistory').value = templateData.drugHistory || '';
            document.getElementById('investigationEntry').value = templateData.investigation || '';
            document.getElementById('diagnosis').value = templateData.diagnosis || '';
            document.getElementById('adviceEntry').value = templateData.advice || '';
            document.getElementById('followupEntry').value = templateData.followup || '';
            
            // Load prescription items
            if (templateData.prescriptionItems && Array.isArray(templateData.prescriptionItems)) {
                prescriptionItems = templateData.prescriptionItems.map(item => ({
                    ...item,
                    id: item.id || Date.now() + Math.random() // Ensure each item has an ID
                }));
                renderPrescriptionList();
            }
            
            // Navigate to prescription page
            navigateTo('prescription', document.querySelector('.nav-item[onclick*="prescription"]'));
            showNotification(`Loaded template: ${template.name}`);
        } else {
            showNotification('Template not found or invalid format', 'error');
        }
    } catch (error) {
        console.error('Error loading template:', error);
        showNotification('Error loading template', 'error');
    }
}

function editTemplate(template) {
    showTemplateEditor(template);
}

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

// ========== TEMPLATE SELECTION & PRINTING SYSTEM ==========

// Function to show template selection modal for printing
function showPrintTemplateModal() {
    // Create modal for template selection
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 2000;
    `;
    
    modal.innerHTML = `
        <div style="background: white; padding: 20px; border-radius: 8px; width: 90%; max-width: 500px;">
            <h3 style="margin-bottom: 15px;">Select Template for Printing</h3>
            <div id="printTemplateList" style="max-height: 300px; overflow-y: auto; margin-bottom: 15px;">
                <p>Loading templates...</p>
            </div>
            <div style="display: flex; gap: 10px; justify-content: flex-end;">
                <button onclick="this.closest('div').closest('div').remove()" 
                        style="padding: 8px 16px; background: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer;">
                    Cancel
                </button>
                <button onclick="generatePrintablePrescriptionWithTemplate()" 
                        style="padding: 8px 16px; background: #27ae60; color: white; border: none; border-radius: 4px; cursor: pointer;">
                    Print with Selected Template
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Load templates for selection
    loadPrintTemplates();
}

// Load templates for printing selection
async function loadPrintTemplates() {
    try {
        const response = await fetch('http://127.0.0.1:3001/api/templates');
        const templates = await response.json();
        
        const templateList = document.getElementById('printTemplateList');
        templateList.innerHTML = '';
        
        if (templates.length === 0) {
            templateList.innerHTML = '<p>No templates available. Please create a template first.</p>';
            return;
        }
        
        templates.forEach(template => {
            const templateItem = document.createElement('div');
            templateItem.style.cssText = `
                padding: 10px;
                border: 1px solid #ddd;
                border-radius: 4px;
                margin-bottom: 8px;
                cursor: pointer;
                transition: background 0.2s;
            `;
            
            templateItem.innerHTML = `
                <div style="display: flex; align-items: center; gap: 10px;">
                    <input type="radio" name="printTemplate" value="${template.id}" 
                           ${currentTemplateId === template.id ? 'checked' : ''} 
                           onchange="currentTemplateId = this.value">
                    <div>
                        <strong>${template.name}</strong>
                        <div style="font-size: 12px; color: #666;">
                            Created: ${new Date(template.createdAt).toLocaleDateString()}
                        </div>
                    </div>
                </div>
            `;
            
            templateList.appendChild(templateItem);
        });
        
        // Set first template as default if none selected
        if (!currentTemplateId && templates.length > 0) {
            currentTemplateId = templates[0].id;
            templateList.querySelector('input[type="radio"]').checked = true;
        }
    } catch (error) {
        console.error('Error loading templates for printing:', error);
        document.getElementById('printTemplateList').innerHTML = '<p>Error loading templates</p>';
    }
}

// Generate printable prescription with selected template
async function generatePrintablePrescriptionWithTemplate() {
    if (!currentTemplateId) {
        showNotification('Please select a template first', 'error');
        return;
    }
    
    try {
        // Get the selected template
        const templateResponse = await fetch(`http://127.0.0.1:3001/api/templates/${currentTemplateId}`);
        const template = await templateResponse.json();
        
        if (!template || !template.templateData) {
            showNotification('Error loading template data', 'error');
            return;
        }
        
        // Generate the prescription HTML with template design
        const prescriptionHTML = generatePrescriptionHTML(template.templateData);
        
        // Open print window
        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Prescription</title>
                <style>
                    body { 
                        font-family: Arial, sans-serif; 
                        margin: 0;
                        padding: 20px;
                        color: #333;
                    }
                    .prescription-container {
                        max-width: 800px;
                        margin: 0 auto;
                        border: 1px solid #ccc;
                        padding: 20px;
                        position: relative;
                    }
                    .header { 
                        text-align: center; 
                        border-bottom: 2px solid #2c3e50;
                        padding-bottom: 15px;
                        margin-bottom: 20px;
                    }
                    .doctor-info {
                        margin-bottom: 10px;
                    }
                    .patient-info {
                        display: grid;
                        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
                        gap: 10px;
                        margin-bottom: 20px;
                        padding: 10px;
                        background: #f8f9fa;
                        border-radius: 4px;
                    }
                    .patient-field {
                        display: flex;
                        flex-direction: column;
                    }
                    .patient-field label {
                        font-size: 12px;
                        color: #666;
                        margin-bottom: 2px;
                    }
                    .rx-symbol {
                        text-align: center;
                        font-size: 24px;
                        margin: 20px 0;
                        color: #2c3e50;
                    }
                    .medication-section {
                        margin: 20px 0;
                    }
                    .medication-item {
                        margin-bottom: 15px;
                        padding-bottom: 10px;
                        border-bottom: 1px solid #eee;
                    }
                    .med-name {
                        font-weight: bold;
                        color: #2c3e50;
                        margin-bottom: 5px;
                    }
                    .med-details {
                        font-size: 14px;
                        color: #666;
                    }
                    .advice-section, .followup-section {
                        margin: 20px 0;
                        padding: 15px;
                        background: #f8f9fa;
                        border-radius: 4px;
                    }
                    .section-title {
                        font-weight: bold;
                        margin-bottom: 10px;
                        color: #2c3e50;
                    }
                    .footer {
                        margin-top: 30px;
                        padding-top: 15px;
                        border-top: 1px solid #ccc;
                        text-align: center;
                        font-size: 12px;
                        color: #666;
                    }
                    @media print {
                        body { padding: 0; }
                        .prescription-container { 
                            border: none; 
                            padding: 0;
                            max-width: 100%;
                        }
                    }
                </style>
            </head>
            <body>
                ${prescriptionHTML}
            </body>
            </html>
        `);
        
        printWindow.document.close();
        
        // Wait for content to load then print
        setTimeout(() => {
            printWindow.print();
            // Don't close the window immediately to allow user to cancel print
        }, 500);
        
        // Close the template selection modal
        document.querySelector('.modal')?.remove();
        
    } catch (error) {
        console.error('Error generating printable prescription:', error);
        showNotification('Error generating printable prescription', 'error');
    }
}

// Generate prescription HTML based on template data
function generatePrescriptionHTML(templateData) {
    const today = new Date();
    const formattedDate = today.toLocaleDateString('en-GB');
    
    return `
        <div class="prescription-container">
            <div class="header">
                <div class="doctor-info">
                    <h2>${templateData.patientDetails?.name || 'Dr. John Smith'}</h2>
                    <p>${templateData.patientDetails?.regNo || 'MBBS, MD - Cardiology'}</p>
                    <p>License No: ${templateData.patientDetails?.regNo || 'MED12345'}</p>
                </div>
            </div>
            
            <div class="patient-info">
                <div class="patient-field">
                    <label>Patient Name</label>
                    <span>${document.getElementById('patientName').value || 'Not specified'}</span>
                </div>
                <div class="patient-field">
                    <label>Age</label>
                    <span>${document.getElementById('patientAge').value || 'Not specified'}</span>
                </div>
                <div class="patient-field">
                    <label>Gender</label>
                    <span>${document.getElementById('patientGender').value || 'Not specified'}</span>
                </div>
                <div class="patient-field">
                    <label>Date</label>
                    <span>${formattedDate}</span>
                </div>
            </div>
            
            ${templateData.chiefComplaints ? `
                <div class="advice-section">
                    <div class="section-title">Chief Complaints</div>
                    <p>${templateData.chiefComplaints}</p>
                </div>
            ` : ''}
            
            ${templateData.diagnosis ? `
                <div class="advice-section">
                    <div class="section-title">Diagnosis</div>
                    <p>${templateData.diagnosis}</p>
                </div>
            ` : ''}
            
            <div class="rx-symbol">℞</div>
            
            <div class="medication-section">
                <div class="section-title">Medications</div>
                ${prescriptionItems.map(item => {
                    if (item.isAdvice) {
                        return `
                            <div class="medication-item">
                                <div class="med-name">Advice</div>
                                <div class="med-details">${item.advice || ''}</div>
                            </div>
                        `;
                    } else {
                        return `
                            <div class="medication-item">
                                <div class="med-name">${item.brand} ${item.strength} (${item.form})</div>
                                <div class="med-details">
                                    ${item.dosage} | ${item.timing} | ${item.duration}
                                    ${item.instructions ? ` | ${item.instructions}` : ''}
                                </div>
                            </div>
                        `;
                    }
                }).join('')}
            </div>
            
            ${templateData.advice ? `
                <div class="advice-section">
                    <div class="section-title">Advice</div>
                    <p>${templateData.advice}</p>
                </div>
            ` : ''}
            
            ${templateData.followup ? `
                <div class="followup-section">
                    <div class="section-title">Follow-up</div>
                    <p>${templateData.followup}</p>
                </div>
            ` : ''}
            
            <div class="footer">
                <p>${templateData.patientDetails?.name || 'Dr. John Smith'} | ${templateData.patientDetails?.regNo || '123 Medical Center, City'}</p>
                <p>Contact: +1 234 567 8900 | Email: doctor@hospital.com</p>
            </div>
        </div>
    `;
}

// Update the existing generatePrintablePrescription function
function generatePrintablePrescription() {
    showPrintTemplateModal();
}

// ========== EXISTING FUNCTIONS ==========

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
        loadAllTemplates();
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
        prescriptionItems: prescriptionItems.map(item => ({
            id: item.id,
            brand: item.brand || '',
            generic: item.generic || '',
            form: item.form || '',
            strength: item.strength || '',
            dosage: item.dosage || '',
            timing: item.timing || '',
            duration: item.duration || '',
            instructions: item.instructions || '',
            isAdvice: item.isAdvice || false,
            advice: item.advice || ''
        })),
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