// FanboxEnumerator/_src/popup.js

// --- DOM Elements ---
const extractBtn = document.getElementById('extractBtn');
const statusMessageEl = document.getElementById('statusMessage');
const loadingIndicatorEl = document.getElementById('loadingIndicator');
const controlsSectionEl = document.getElementById('controlsSection');
const planFilterContainerEl = document.getElementById('planFilterContainer');
const startDateAfterEl = document.getElementById('startDateAfter');
const startDateBeforeEl = document.getElementById('startDateBefore');
const durationMonthsOverEl = document.getElementById('durationMonthsOver');
const applyFiltersBtnEl = document.getElementById('applyFiltersBtn');
const resetFiltersBtnEl = document.getElementById('resetFiltersBtn');
const rowCountEl = document.getElementById('rowCount');
const previewTableBodyEl = document.getElementById('previewTableBody');
const previewTableEl = document.getElementById('previewTable'); // For sort listeners
const exportFormatEl = document.getElementById('exportFormat');
const downloadBtnEl = document.getElementById('downloadBtn');

// --- State Variables ---
let rawSupportersData = [];
let filteredSupportersData = [];
let currentSort = { column: 'start_date', order: 'desc' }; // Default sort
const GA_MEASUREMENT_ID = 'G-WWQTE7VWKG'; // Your GA4 Measurement ID

// --- GA4 Event Function ---
function gtag_event(eventName, params) {
  if (typeof gtag === 'function') {
    gtag('event', eventName, {
      ...params,
      // 'event_category': 'engagement', // Example category
      // 'event_label': params.label || eventName, // Example label
      // 'value': params.value
      'send_to': GA_MEASUREMENT_ID
    });
  } else {
    console.log(`GA4 event (gtag not loaded): ${eventName}`, params);
  }
}


// --- Helper Functions ---
function showStatus(message, type = 'info') { // type: 'info', 'success', 'error'
    statusMessageEl.textContent = message;
    statusMessageEl.className = `status ${type}`;
}

function showLoading(show) {
    loadingIndicatorEl.style.display = show ? 'block' : 'none';
    extractBtn.disabled = show;
}

// --- Main Logic ---
extractBtn.addEventListener('click', async () => {
    showLoading(true);
    showStatus('FANBOXのタブから情報を抽出中...', 'info');
    controlsSectionEl.style.display = 'none';
    downloadBtnEl.disabled = true;
    previewTableBodyEl.innerHTML = '';
    rowCountEl.textContent = '0';
    rawSupportersData = [];
    filteredSupportersData = [];

    gtag_event('click_extract_button');

    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        if (!tab.url || !tab.url.match(/https:\/\/.*\.fanbox\.cc\/manage\/relationships/)) {
            showStatus('FANBOXの支援者一覧ページを開いてから実行してください。', 'error');
            gtag_event('extract_error', { 'error_type': 'not_fanbox_relationships_page' });
            showLoading(false);
            return;
        }

        const response = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            function: scrapeSupporterDataFromPage, // This function will be defined in content_script.js
                                                 // or injected directly if content_script.js is not used for this.
                                                 // For simplicity here, we'll assume it's available.
        });

        if (chrome.runtime.lastError) {
            console.error("Script execution error:", chrome.runtime.lastError.message);
            showStatus(`スクリプト実行エラー: ${chrome.runtime.lastError.message}`, 'error');
            gtag_event('extract_error', { 'error_type': 'script_execution_error', 'error_message': chrome.runtime.lastError.message.substring(0,100) });
            showLoading(false);
            return;
        }


        if (response && response[0] && response[0].result) {
            rawSupportersData = response[0].result;
            if (rawSupportersData.length > 0) {
                filteredSupportersData = [...rawSupportersData];
                showStatus(`支援者 ${rawSupportersData.length} 件の情報を抽出しました。`, 'success');
                controlsSectionEl.style.display = 'block';
                downloadBtnEl.disabled = false;
                populatePlanFilter();
                applyAllFiltersAndRender(); // Initial render with default sort
                gtag_event('extract_success', { 'supporter_count': rawSupportersData.length });
            } else {
                showStatus('ページから支援者情報が見つかりませんでした。ページ構造が変更された可能性があります。', 'error');
                gtag_event('extract_warning', { 'message': 'no_supporters_found_on_page' });
            }
        } else {
            showStatus('ページからの情報抽出に失敗しました。コンソールログを確認してください。', 'error');
            gtag_event('extract_error', { 'error_type': 'no_response_from_script' });
        }
    } catch (error) {
        console.error('Extraction error:', error);
        showStatus(`エラーが発生しました: ${error.message}`, 'error');
        gtag_event('extract_error', { 'error_type': 'catch_block', 'error_message': error.message.substring(0,100) });
    } finally {
        showLoading(false);
    }
});

// This function would be injected by chrome.scripting.executeScript
// It needs to be self-contained or rely on functions also injected.
// For now, this is a placeholder for what content_script.js will primarily do.
function scrapeSupporterDataFromPage() {
    // This function will actually run in the context of the Fanbox page.
    // It needs to match the parsing logic from the previous HTML tool's script.js
    // For now, we'll send a message to content_script.js to do the work and get a response.
    // This is a more robust way for extensions.
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: "scrapeData" }, (response) => {
            if (chrome.runtime.lastError) {
                // Handle error, e.g., if content script isn't ready or doesn't respond
                console.error("Error sending message to content script:", chrome.runtime.lastError.message);
                resolve({ error: chrome.runtime.lastError.message });
                return;
            }
            if (response && response.data) {
                resolve(response.data);
            } else if (response && response.error) {
                resolve({ error: response.error });
            } else {
                resolve({ error: "Unknown error or no data from content script" });
            }
        });
    });
}


// --- Filtering and Sorting Logic (similar to the web tool) ---
function populatePlanFilter() {
    planFilterContainerEl.innerHTML = '';
    const plans = [...new Set(rawSupportersData.map(s => s.plan_name))].sort();
    if (plans.length === 0) {
        planFilterContainerEl.innerHTML = '<p>利用可能なプランがありません。</p>';
        return;
    }
    plans.forEach(plan => {
        const id = `plan-${plan.replace(/[^a-zA-Z0-9]/g, '-')}`;
        const div = document.createElement('div');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = plan;
        checkbox.id = id;
        checkbox.checked = true;
        
        const label = document.createElement('label');
        label.htmlFor = id;
        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(` ${plan}`));
        
        div.appendChild(label);
        planFilterContainerEl.appendChild(div);
    });
}

function getSelectedPlans() {
    const selected = [];
    planFilterContainerEl.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => {
        selected.push(cb.value);
    });
    return selected;
}

function parseDate(dateString) {
    if (!dateString || typeof dateString !== 'string') return null;
    const match = dateString.match(/(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/);
    if (match) {
        return new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
    }
    return null;
}

function applyAllFiltersAndRender() {
    let dataToFilter = [...rawSupportersData];

    const selectedPlans = getSelectedPlans();
    const allAvailablePlans = [...new Set(rawSupportersData.map(s => s.plan_name))];
     if (selectedPlans.length < allAvailablePlans.length && allAvailablePlans.length > 0) {
        dataToFilter = dataToFilter.filter(s => selectedPlans.includes(s.plan_name));
    }

    const startDateAfter = startDateAfterEl.value ? new Date(startDateAfterEl.value) : null;
    if (startDateAfter) {
        startDateAfter.setHours(0, 0, 0, 0);
        dataToFilter = dataToFilter.filter(s => {
            const supporterStartDate = parseDate(s.start_date);
            return supporterStartDate && supporterStartDate >= startDateAfter;
        });
    }

    const startDateBefore = startDateBeforeEl.value ? new Date(startDateBeforeEl.value) : null;
    if (startDateBefore) {
        startDateBefore.setHours(23, 59, 59, 999);
        dataToFilter = dataToFilter.filter(s => {
            const supporterStartDate = parseDate(s.start_date);
            return supporterStartDate && supporterStartDate <= startDateBefore;
        });
    }
    
    const durationMonthsInput = durationMonthsOverEl.value.trim();
    if (durationMonthsInput !== "") {
        const durationMonths = parseInt(durationMonthsInput);
        if (!isNaN(durationMonths) && durationMonths >= 0) {
            const today = new Date();
            today.setHours(0,0,0,0); 
            dataToFilter = dataToFilter.filter(s => {
                const supporterStartDate = parseDate(s.start_date);
                if (!supporterStartDate) return false;
                supporterStartDate.setHours(0,0,0,0); 

                let monthsDiff = (today.getFullYear() - supporterStartDate.getFullYear()) * 12;
                monthsDiff -= supporterStartDate.getMonth();
                monthsDiff += today.getMonth();
                
                if (today.getDate() < supporterStartDate.getDate()) {
                    monthsDiff--;
                }
                return monthsDiff >= durationMonths;
            });
        }
    }

    filteredSupportersData = dataToFilter;
    applySort(); 
    renderTable();
    gtag_event('apply_filters_popup', { 'filter_count': filteredSupportersData.length });
}

function resetFilters() {
    planFilterContainerEl.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = true);
    startDateAfterEl.value = '';
    startDateBeforeEl.value = '';
    durationMonthsOverEl.value = '';
    currentSort = { column: 'start_date', order: 'desc' }; 
    updateSortIndicators();
    applyAllFiltersAndRender();
    gtag_event('reset_filters_popup');
}

if(applyFiltersBtnEl) applyFiltersBtnEl.addEventListener('click', applyAllFiltersAndRender);
if(resetFiltersBtnEl) resetFiltersBtnEl.addEventListener('click', resetFilters);

// Auto-apply for checkboxes for immediate feedback
if(planFilterContainerEl) {
    planFilterContainerEl.addEventListener('change', (event) => {
        if (event.target.type === 'checkbox') {
            applyAllFiltersAndRender();
        }
    });
}


function applySort() {
    if (!currentSort.column) return;
    filteredSupportersData.sort((a, b) => {
        let valA = a[currentSort.column];
        let valB = b[currentSort.column];
        if (currentSort.column === 'start_date') {
            valA = parseDate(valA);
            valB = parseDate(valB);
            if (valA === null && valB === null) return 0;
            if (valA === null) return currentSort.order === 'asc' ? 1 : -1; 
            if (valB === null) return currentSort.order === 'asc' ? -1 : 1; 
        } else if (currentSort.column === 'user_id') {
            const numA = parseInt(valA);
            const numB = parseInt(valB);
            if (!isNaN(numA) && !isNaN(numB)) {
                valA = numA;
                valB = numB;
            }
        }
        if (valA < valB) return currentSort.order === 'asc' ? -1 : 1;
        if (valA > valB) return currentSort.order === 'asc' ? 1 : -1;
        return 0;
    });
}

function updateSortIndicators() {
    if (!previewTableEl) return;
    previewTableEl.querySelectorAll('th .sort-indicator').forEach(span => span.textContent = '');
    if (currentSort.column) {
        const currentTh = previewTableEl.querySelector(`th[data-sort="${currentSort.column}"]`);
        if (currentTh) {
            const indicator = currentTh.querySelector('.sort-indicator');
            if (indicator) {
                indicator.textContent = currentSort.order === 'asc' ? '▲' : '▼';
            }
        }
    }
}
updateSortIndicators(); // Set initial indicator

if (previewTableEl) {
    previewTableEl.querySelectorAll('th').forEach(th => {
        th.addEventListener('click', () => {
            const sortKey = th.dataset.sort;
            if (!sortKey) return;
            if (currentSort.column === sortKey) {
                currentSort.order = currentSort.order === 'asc' ? 'desc' : 'asc';
            } else {
                currentSort.column = sortKey;
                currentSort.order = 'asc'; 
            }
            updateSortIndicators();
            applySort(); 
            renderTable(); 
            gtag_event('sort_table_popup', { 'sort_column': currentSort.column, 'sort_order': currentSort.order });
        });
    });
}

function renderTable() {
    if (!previewTableBodyEl || !rowCountEl) return;
    previewTableBodyEl.innerHTML = ''; 
    rowCountEl.textContent = filteredSupportersData.length;
    if (filteredSupportersData.length === 0) {
        const tr = previewTableBodyEl.insertRow();
        const td = tr.insertCell();
        td.colSpan = 5; 
        td.textContent = '表示するデータがありません。';
        td.style.textAlign = 'center';
        td.style.padding = '15px';
        return;
    }
    filteredSupportersData.forEach(supporter => {
        const tr = previewTableBodyEl.insertRow();
        tr.insertCell().textContent = supporter.supporter_name;
        tr.insertCell().textContent = supporter.user_id;
        tr.insertCell().textContent = supporter.plan_name;
        tr.insertCell().textContent = supporter.start_date;
        tr.insertCell().textContent = supporter.memo;
    });
}

// --- Data Export ---
function downloadFile(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    gtag_event('download_file_success', { 'filename': filename.substring(0,50), 'format': mimeType });
}

if(downloadBtnEl) {
    downloadBtnEl.addEventListener('click', () => {
        if (filteredSupportersData.length === 0) {
            showStatus('エクスポートするデータがありません。', 'error');
            return;
        }
        const format = exportFormatEl.value;
        const date = new Date();
        const timestamp = `${date.getFullYear()}${(date.getMonth() + 1).toString().padStart(2, '0')}${date.getDate().toString().padStart(2, '0')}_${date.getHours().toString().padStart(2, '0')}${date.getMinutes().toString().padStart(2, '0')}`;
        let filename = `fanbox_supporters_${timestamp}`;
        let content;
        let mimeType;

        gtag_event('click_download_button', { 'export_format': format, 'item_count': filteredSupportersData.length });

        if (format === 'csv') {
            filename += '.csv';
            mimeType = 'text/csv;charset=utf-8;';
            let csvContent = '\uFEFF'; 
            csvContent += '"支援者名","ユーザーID","プラン名","支援開始日","メモ"\n';
            filteredSupportersData.forEach(s => {
                const name = s.supporter_name ? s.supporter_name.replace(/"/g, '""') : '';
                const userId = s.user_id || '';
                const plan = s.plan_name ? s.plan_name.replace(/"/g, '""') : '';
                const startDateVal = s.start_date || '';
                const memo = s.memo ? s.memo.replace(/"/g, '""') : '';
                csvContent += `"${name}","${userId}","${plan}","${startDateVal}","${memo}"\n`;
            });
            content = csvContent;
        } else if (format === 'json') {
            filename += '.json';
            mimeType = 'application/json;charset=utf-8;';
            content = JSON.stringify(filteredSupportersData, null, 2);
        }
        downloadFile(filename, content, mimeType);
    });
}

// Load saved filter/sort settings on popup open (optional enhancement)
// chrome.storage.local.get(['fanboxEnumFilters', 'fanboxEnumSort'], (result) => {
//     if (result.fanboxEnumSort) {
//         currentSort = result.fanboxEnumSort;
//         updateSortIndicators();
//     }
//     // Apply filters if needed, then render
// });

// Save settings on change (optional enhancement)
// function saveSettings() {
//     chrome.storage.local.set({ fanboxEnumSort: currentSort /*, fanboxEnumFilters: currentFilters */ });
// }
// applyFiltersBtnEl.addEventListener('click', () => { applyAllFiltersAndRender(); saveSettings(); });
// resetFiltersBtnEl.addEventListener('click', () => { resetFilters(); saveSettings(); });
// previewTableEl.querySelectorAll('th').forEach(th => th.addEventListener('click', () => { ... saveSettings(); }));

});
