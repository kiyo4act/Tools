// FanboxEnumerator/script.js
document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const inputMethodRadios = document.querySelectorAll('input[name="inputMethod"]');
    const urlInputSection = document.getElementById('urlInputSection');
    const manualInputSection = document.getElementById('manualInputSection');

    const proxySelectEl = document.getElementById('proxySelectEl');
    const creatorIdInputEl = document.getElementById('creatorIdInputEl');
    const fullUrlInputEl = document.getElementById('fullUrlInputEl');
    const fetchAndParseBtnEl = document.getElementById('fetchAndParseBtnEl');
    const urlLoaderEl = document.getElementById('urlLoaderEl');
    const urlStatusEl = document.getElementById('urlStatusEl');

    const htmlInputEl = document.getElementById('htmlInputEl');
    const parseHtmlBtnEl = document.getElementById('parseHtmlBtnEl');
    const parseStatusEl = document.getElementById('parseStatusEl');

    const controlsAndPreviewSection = document.getElementById('controlsAndPreviewSection');
    const planFilterContainer = document.getElementById('planFilterContainer');
    const startDateAfterEl = document.getElementById('startDateAfterEl');
    const startDateBeforeEl = document.getElementById('startDateBeforeEl');
    const durationMonthsOverEl = document.getElementById('durationMonthsOverEl');
    const applyFiltersBtnEl = document.getElementById('applyFiltersBtnEl');
    const resetFiltersBtnEl = document.getElementById('resetFiltersBtnEl');

    const rowCountEl = document.getElementById('rowCountEl');
    const previewTableEl = document.getElementById('previewTableEl');
    const previewTableBodyEl = document.getElementById('previewTableBodyEl');

    const exportFormatEl = document.getElementById('exportFormatEl');
    const downloadBtnEl = document.getElementById('downloadBtnEl');

    const updateHistoryToggleBtnEl = document.getElementById('updateHistoryToggleBtnEl');
    const updateHistoryContentEl = document.getElementById('updateHistoryContentEl');

    // --- State Variables ---
    let rawSupportersData = []; // Array of supporter objects from HTML
    let filteredSupportersData = [];
    let currentSort = { column: 'start_date', order: 'desc' }; // Default sort by start_date descending

    // --- Proxies (same as LyricPrinter) ---
    const proxies = [
        { name: "Proxy 1 (codetabs)", idName: "codetabs", buildUrl: (targetUrl) => `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(targetUrl)}` },
        { name: "Proxy 2 (allorigins)", idName: "allorigins", buildUrl: (targetUrl) => `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}` }
    ];

    function populateProxies() {
        proxies.forEach((proxy, index) => {
            const option = document.createElement('option');
            option.value = proxy.idName; // Use idName as value for query param consistency
            option.textContent = proxy.name;
            proxySelectEl.appendChild(option);
        });
        proxySelectEl.value = "codetabs"; // Default to codetabs
    }

    // --- Input Method Toggle ---
    inputMethodRadios.forEach(radio => {
        radio.addEventListener('change', (event) => {
            if (event.target.value === 'url') {
                urlInputSection.style.display = 'block';
                manualInputSection.style.display = 'none';
            } else {
                urlInputSection.style.display = 'none';
                manualInputSection.style.display = 'block';
            }
             gtag('event', 'select_input_method', { 'event_category': 'ui_interaction', 'input_method': event.target.value });
        });
    });

    // --- Accordion Toggle ---
    function setupAccordionToggle(toggleButton, contentElement, defaultOpen = false) {
        if (toggleButton && contentElement) {
            if (defaultOpen) {
                contentElement.classList.add('open');
                toggleButton.classList.add('open');
                 if(toggleButton.querySelector('.accordion-icon')) toggleButton.querySelector('.accordion-icon').textContent = '▲';
            } else {
                 if(toggleButton.querySelector('.accordion-icon')) toggleButton.querySelector('.accordion-icon').textContent = '▼';
            }
            toggleButton.addEventListener('click', () => {
                const isOpen = contentElement.classList.toggle('open');
                toggleButton.classList.toggle('open', isOpen);
                const icon = toggleButton.querySelector('.accordion-icon');
                if (icon) {
                    icon.textContent = isOpen ? '▲' : '▼';
                }
                gtag('event', `toggle_${contentElement.id.replace('ContentEl', '')}`, { 'event_category': 'ui_interaction', 'action': isOpen ? 'open' : 'close' });
            });
        }
    }
    setupAccordionToggle(updateHistoryToggleBtnEl, updateHistoryContentEl, false);


    // --- HTML Fetching and Parsing ---
    async function fetchFanboxHtml(url) {
        urlLoaderEl.style.display = 'inline-block';
        urlStatusEl.textContent = 'HTMLを読み込み中...';
        urlStatusEl.className = 'status-message';
        fetchAndParseBtnEl.disabled = true;

        const selectedProxyIdName = proxySelectEl.value;
        const selectedProxy = proxies.find(p => p.idName === selectedProxyIdName) || proxies[0];
        const proxyUrl = selectedProxy.buildUrl(url);

        gtag('event', 'fetch_html_attempt', { 'event_category': 'data_source', 'proxy_used': selectedProxy.idName, 'target_url': url.substring(0,100) });

        try {
            const response = await fetch(proxyUrl);
            if (!response.ok) {
                throw new Error(`HTTPエラー ${response.status}. プロキシ (${selectedProxy.name}) または対象サイトの問題の可能性があります。`);
            }
            const htmlText = await response.text();
            urlStatusEl.textContent = 'HTML読み込み成功。解析を開始します...';
            urlStatusEl.className = 'status-message success';
            gtag('event', 'fetch_html_success', { 'event_category': 'data_source', 'proxy_used': selectedProxy.idName });
            return htmlText;
        } catch (error) {
            console.error('Fetch error:', error);
            urlStatusEl.textContent = `HTML取得失敗: ${error.message}. 手動入力をお試しください。`;
            urlStatusEl.className = 'status-message error';
            gtag('event', 'fetch_html_failure', { 'event_category': 'data_source', 'proxy_used': selectedProxy.idName, 'error_message': error.message.substring(0,100) });
            return null;
        } finally {
            urlLoaderEl.style.display = 'none';
            fetchAndParseBtnEl.disabled = false;
        }
    }

    function parseFanboxHtml(htmlString) {
        parseStatusEl.textContent = 'HTMLを解析中...';
        parseStatusEl.className = 'status-message';
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(htmlString, 'text/html');
            const supporters = [];
            // IMPORTANT: The selectors below are based on the provided 'relationships.html'
            // and might need adjustment if FANBOX's HTML structure changes.
            const tableBody = doc.querySelector('div.commonStyles__Table-sc-1f3w2vz-0.dRWCLG');
            if (!tableBody) {
                 parseStatusEl.textContent = '支援者テーブルの主要コンテナが見つかりません。HTML構造が変更された可能性があります。';
                 parseStatusEl.className = 'status-message error';
                 gtag('event', 'parse_html_error', { 'event_category': 'data_processing', 'error_message': 'Table container not found' });
                 return [];
            }

            const rowElements = Array.from(tableBody.children).filter(child => child.matches('div.commonStyles__Tr-sc-1f3w2vz-1'));


            if (rowElements.length <= 1 && htmlString.includes("ファン一覧")) { // <=1 because first might be header
                 parseStatusEl.textContent = 'HTMLは読み込めましたが、支援者データが見つかりませんでした。ページの構造が変更されたか、支援者がいない可能性があります。';
                 parseStatusEl.className = 'status-message error';
                 gtag('event', 'parse_html_warning', { 'event_category': 'data_processing', 'message': 'No supporter data rows found' });
                 return [];
            }
             if (!htmlString.includes("ファン一覧") && !htmlString.includes("fanbox.cc/manage/relationships")) {
                 parseStatusEl.textContent = '指定されたHTMLはFanboxの支援者一覧ページではないようです。';
                 parseStatusEl.className = 'status-message error';
                 gtag('event', 'parse_html_error', { 'event_category': 'data_processing', 'error_message': 'Not a relationships page' });
                 return [];
            }


            rowElements.forEach((row, index) => {
                if (row.querySelector('div.LabelWithSortButton__Wrapper-sc-m597y7-0')) { // Heuristic to identify header row
                    return; 
                }

                const cells = row.querySelectorAll('div.commonStyles__Td-sc-1f3w2vz-2.gOXCUW');
                if (cells.length >= 4) { // Name, Plan, Start Date, Memo
                    const userWrapperAnchor = cells[0]?.querySelector('a.Row__UserWrapper-sc-1xb9lq9-1');
                    const supporterNameEl = userWrapperAnchor?.querySelector('div.commonStyles__TextEllipsis-sc-1f3w2vz-3.bqBOcj');
                    const supporterName = supporterNameEl?.textContent.trim() || '名前不明';
                    
                    let userId = 'ID不明';
                    const userLink = userWrapperAnchor?.getAttribute('href');
                    if (userLink) {
                        const match = userLink.match(/\/manage\/relationships\/(\d+)/);
                        if (match && match[1]) {
                            userId = match[1];
                        }
                    }

                    const planNameEl = cells[1]?.querySelector('div.commonStyles__TextEllipsis-sc-1f3w2vz-3.bqBOcj');
                    const planName = planNameEl?.textContent.trim() || 'プラン不明';
                    
                    const startDate = cells[2]?.textContent.trim() || '開始日不明';
                    
                    const memoEl = cells[3]?.querySelector('div.commonStyles__TextEllipsis-sc-1f3w2vz-3.bqBOcj');
                    const memo = memoEl?.textContent.trim() || '';

                    supporters.push({
                        supporter_name: supporterName,
                        user_id: userId,
                        plan_name: planName,
                        start_date: startDate,
                        memo: memo
                    });
                }
            });
            
            if (supporters.length > 0) {
                parseStatusEl.textContent = `解析完了: ${supporters.length}件の支援者情報を抽出しました。`;
                parseStatusEl.className = 'status-message success';
            } else if (rowElements.length > 1) { 
                 parseStatusEl.textContent = '支援者リストの行は認識できましたが、データ抽出に失敗しました。セレクタの調整が必要です。';
                 parseStatusEl.className = 'status-message error';
            }
            
            gtag('event', 'parse_html_complete', { 'event_category': 'data_processing', 'supporter_count': supporters.length });
            return supporters;
        } catch (error) {
            console.error('Parsing error:', error);
            parseStatusEl.textContent = `HTML解析エラー: ${error.message}`;
            parseStatusEl.className = 'status-message error';
            gtag('event', 'parse_html_error', { 'event_category': 'data_processing', 'error_message': error.message.substring(0,100) });
            return [];
        }
    }


    async function handleFetchAndParse() {
        let targetUrl = fullUrlInputEl.value.trim();
        const creatorId = creatorIdInputEl.value.trim();

        if (!targetUrl && creatorId) {
            if (!/^[a-zA-Z0-9._-]+$/.test(creatorId)) { // Allow dots and hyphens in creator ID
                urlStatusEl.textContent = 'クリエイターIDの形式が無効です。英数字、アンダースコア(_)、ハイフン(-)、ドット(.)が使用できます。';
                urlStatusEl.className = 'status-message error';
                return;
            }
            targetUrl = `https://${creatorId}.fanbox.cc/manage/relationships`;
        } else if (targetUrl && creatorId) {
             console.warn("クリエイターIDとフルURLの両方が入力されています。フルURLを優先します。");
             creatorIdInputEl.value = ''; 
        }


        if (!targetUrl) {
            urlStatusEl.textContent = 'クリエイターIDまたはフルURLを入力してください。';
            urlStatusEl.className = 'status-message error';
            return;
        }

        try {
            const urlObj = new URL(targetUrl);
            if (!urlObj.hostname.endsWith('.fanbox.cc') || urlObj.pathname !== '/manage/relationships') {
                 urlStatusEl.textContent = '無効なFANBOX支援者一覧URL形式です。https://CREATOR_ID.fanbox.cc/manage/relationships の形式である必要があります。';
                 urlStatusEl.className = 'status-message error';
                 return;
            }
        } catch (e) {
            urlStatusEl.textContent = '無効なURL形式です。';
            urlStatusEl.className = 'status-message error';
            return;
        }

        const htmlString = await fetchFanboxHtml(targetUrl);
        processParsedData(htmlString);
    }

    function handleManualParse() {
        const htmlString = htmlInputEl.value;
        if (!htmlString.trim()) {
            parseStatusEl.textContent = 'HTMLソースを入力してください。';
            parseStatusEl.className = 'status-message error';
            return;
        }
        processParsedData(htmlString);
    }
    
    function processParsedData(htmlString) {
        if (htmlString) {
            rawSupportersData = parseFanboxHtml(htmlString);
            if (rawSupportersData.length > 0) {
                filteredSupportersData = [...rawSupportersData];
                populatePlanFilter();
                applyAllFiltersAndRender(); 
                controlsAndPreviewSection.style.display = 'block';
                downloadBtnEl.disabled = false;
            } else {
                controlsAndPreviewSection.style.display = 'none';
                downloadBtnEl.disabled = true;
                previewTableBodyEl.innerHTML = '';
                rowCountEl.textContent = '0';
            }
        } else {
            controlsAndPreviewSection.style.display = 'none';
            downloadBtnEl.disabled = true;
            previewTableBodyEl.innerHTML = '';
            rowCountEl.textContent = '0';
        }
    }


    fetchAndParseBtnEl.addEventListener('click', handleFetchAndParse);
    parseHtmlBtnEl.addEventListener('click', handleManualParse);

    // --- Filtering and Sorting ---
    function populatePlanFilter() {
        planFilterContainer.innerHTML = '';
        const plans = [...new Set(rawSupportersData.map(s => s.plan_name))].sort();
        if (plans.length === 0) {
            planFilterContainer.innerHTML = '<p>利用可能なプランがありません。</p>';
            return;
        }
        plans.forEach(plan => {
            const id = `plan-${plan.replace(/[^a-zA-Z0-9]/g, '-')}`; // Sanitize plan name for ID
            const div = document.createElement('div');
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = plan;
            checkbox.id = id;
            checkbox.checked = true;
            checkbox.addEventListener('change', applyAllFiltersAndRender);
            
            const label = document.createElement('label');
            label.htmlFor = id;
            label.appendChild(checkbox);
            label.appendChild(document.createTextNode(` ${plan}`));
            
            div.appendChild(label);
            planFilterContainer.appendChild(div);
        });
    }

    function getSelectedPlans() {
        const selected = [];
        planFilterContainer.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => {
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
        // Only filter by plan if not all plans are selected or if no plans are selected (which means filter out everything)
        if (selectedPlans.length < allAvailablePlans.length) {
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
        gtag('event', 'apply_filters', { 'event_category': 'data_manipulation', 'filter_count': filteredSupportersData.length });
    }

    function resetFilters() {
        planFilterContainer.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = true);
        startDateAfterEl.value = '';
        startDateBeforeEl.value = '';
        durationMonthsOverEl.value = '';
        currentSort = { column: 'start_date', order: 'desc' }; 
        updateSortIndicators();
        applyAllFiltersAndRender();
        gtag('event', 'reset_filters', { 'event_category': 'data_manipulation' });
    }

    applyFiltersBtnEl.addEventListener('click', applyAllFiltersAndRender);
    resetFiltersBtnEl.addEventListener('click', resetFilters);
    
    planFilterContainer.addEventListener('change', (event) => { // Event delegation for plan checkboxes
        if (event.target.type === 'checkbox') {
            applyAllFiltersAndRender();
        }
    });
    startDateAfterEl.addEventListener('change', applyAllFiltersAndRender);
    startDateBeforeEl.addEventListener('change', applyAllFiltersAndRender);
    durationMonthsOverEl.addEventListener('input', applyAllFiltersAndRender);


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
            gtag('event', 'sort_table', { 'event_category': 'data_manipulation', 'sort_column': currentSort.column, 'sort_order': currentSort.order });
        });
    });


    // --- Table Rendering ---
    function renderTable() {
        previewTableBodyEl.innerHTML = ''; 
        rowCountEl.textContent = filteredSupportersData.length;

        if (filteredSupportersData.length === 0) {
            const tr = previewTableBodyEl.insertRow();
            const td = tr.insertCell();
            td.colSpan = 5; 
            td.textContent = '表示するデータがありません。フィルター条件を確認してください。';
            td.style.textAlign = 'center';
            td.style.padding = '20px';
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
    function downloadData(filename, content, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    downloadBtnEl.addEventListener('click', () => {
        if (filteredSupportersData.length === 0) {
            parseStatusEl.textContent = 'エクスポートするデータがありません。';
            parseStatusEl.className = 'status-message error';
            setTimeout(() => { parseStatusEl.textContent = ''; parseStatusEl.className = 'status-message';}, 3000);
            return;
        }

        const format = exportFormatEl.value;
        const date = new Date();
        const timestamp = `${date.getFullYear()}${(date.getMonth() + 1).toString().padStart(2, '0')}${date.getDate().toString().padStart(2, '0')}_${date.getHours().toString().padStart(2, '0')}${date.getMinutes().toString().padStart(2, '0')}`;
        let filename = `fanbox_supporters_${timestamp}`;
        let content;
        let mimeType;

        gtag('event', 'download_data', { 'event_category': 'export', 'export_format': format, 'item_count': filteredSupportersData.length });

        if (format === 'csv') {
            filename += '.csv';
            mimeType = 'text/csv;charset=utf-8;';
            let csvContent = '\uFEFF'; 
            csvContent += '"支援者名","ユーザーID","プラン名","支援開始日","メモ"\n';
            filteredSupportersData.forEach(s => {
                const name = s.supporter_name ? s.supporter_name.replace(/"/g, '""') : '';
                const userId = s.user_id || '';
                const plan = s.plan_name ? s.plan_name.replace(/"/g, '""') : '';
                const startDate = s.start_date || '';
                const memo = s.memo ? s.memo.replace(/"/g, '""') : '';
                csvContent += `"${name}","${userId}","${plan}","${startDate}","${memo}"\n`;
            });
            content = csvContent;
        } else if (format === 'json') {
            filename += '.json';
            mimeType = 'application/json;charset=utf-8;';
            content = JSON.stringify(filteredSupportersData, null, 2);
        }

        downloadData(filename, content, mimeType);
    });
    
    // --- URL Query Parameter Processing ---
    async function processUrlQueryParameters() {
        const params = new URLSearchParams(window.location.search);
        let targetFanboxUrl = params.get('url');
        const creatorIdParam = params.get('creator_id');
        
        if (!targetFanboxUrl && creatorIdParam) {
            if (!/^[a-zA-Z0-9._-]+$/.test(creatorIdParam)) {
                urlStatusEl.textContent = 'URLクエリパラメータのクリエイターID形式が無効です。';
                urlStatusEl.className = 'status-message error';
                return;
            }
            targetFanboxUrl = `https://${creatorIdParam}.fanbox.cc/manage/relationships`;
        }
        
        if (!targetFanboxUrl) return; 

        try {
            const urlObj = new URL(targetFanboxUrl);
             if (!urlObj.hostname.endsWith('.fanbox.cc') || urlObj.pathname !== '/manage/relationships') {
                console.error('Query Param: Invalid FANBOX URL format.');
                urlStatusEl.textContent = 'URLクエリパラメータのFANBOX URL形式が無効です。';
                urlStatusEl.className = 'status-message error';
                return;
            }
            fullUrlInputEl.value = targetFanboxUrl;
            if (creatorIdParam) creatorIdInputEl.value = creatorIdParam; 
            document.querySelector('input[name="inputMethod"][value="url"]').checked = true; 
            urlInputSection.style.display = 'block';
            manualInputSection.style.display = 'none';

        } catch (e) {
            console.error('Query Param: Invalid URL.', e);
            urlStatusEl.textContent = 'URLクエリパラメータのURLが無効です。';
            urlStatusEl.className = 'status-message error';
            return;
        }

        const proxyIdQuery = params.get('proxy_id');
        if (proxyIdQuery && proxies.some(p => p.idName === proxyIdQuery)) {
            proxySelectEl.value = proxyIdQuery;
        }

        const htmlString = await fetchFanboxHtml(targetFanboxUrl);
        if (!htmlString) return; 
        
        rawSupportersData = parseFanboxHtml(htmlString);
        if (rawSupportersData.length === 0) {
            controlsAndPreviewSection.style.display = 'none';
            downloadBtnEl.disabled = true;
            return;
        }
        
        filteredSupportersData = [...rawSupportersData];
        populatePlanFilter(); 
        controlsAndPreviewSection.style.display = 'block';
        downloadBtnEl.disabled = false;

        const filterPlanQuery = params.get('filter_plan');
        if (filterPlanQuery) {
            const plansToFilter = filterPlanQuery.split(',').map(p => p.trim());
            planFilterContainer.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                cb.checked = plansToFilter.includes(cb.value);
            });
        }

        const startDateAfterQuery = params.get('filter_start_date_after');
        if (startDateAfterQuery) startDateAfterEl.value = startDateAfterQuery;

        const startDateBeforeQuery = params.get('filter_start_date_before');
        if (startDateBeforeQuery) startDateBeforeEl.value = startDateBeforeQuery;
        
        const durationMonthsQuery = params.get('filter_duration_months_over');
        if (durationMonthsQuery) durationMonthsOverEl.value = durationMonthsQuery;

        const sortByQuery = params.get('sort_by');
        const sortOrderQuery = params.get('sort_order') || 'asc'; 
        if (sortByQuery && ['supporter_name', 'user_id', 'plan_name', 'start_date', 'memo'].includes(sortByQuery)) {
            currentSort.column = sortByQuery;
            currentSort.order = (sortOrderQuery === 'desc') ? 'desc' : 'asc';
        }
        
        updateSortIndicators(); 
        applyAllFiltersAndRender(); 

        const downloadFormat = params.get('format');
        const autoDownload = params.get('download') === 'true';

        if (autoDownload && (downloadFormat === 'csv' || downloadFormat === 'json')) {
            exportFormatEl.value = downloadFormat;
            setTimeout(() => { 
                 if (filteredSupportersData.length > 0) { 
                    downloadBtnEl.click();
                 } else {
                    console.warn("Auto-download skipped: No data after filtering/parsing from URL query.");
                    parseStatusEl.textContent = "自動ダウンロードがスキップされました: フィルタリング/解析後にデータがありません。";
                    parseStatusEl.className = 'status-message error';
                 }
            }, 100);
        }
    }

    // --- Initialization ---
    populateProxies();
    updateSortIndicators(); 
    processUrlQueryParameters(); 
});
