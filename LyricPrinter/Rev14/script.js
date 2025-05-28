document.addEventListener('DOMContentLoaded', () => {
    const htmlInputEl = document.getElementById('htmlInputEl');
    const generatePreviewBtnEl = document.getElementById('generatePreviewBtnEl');
    const downloadHtmlBtnEl = document.getElementById('downloadHtmlBtnEl');
    const printBtnEl = document.getElementById('printBtnEl');
    const outputFrameEl = document.getElementById('outputFrameEl');
    const fontSizeSliderEl = document.getElementById('fontSizeSliderEl');
    const fontSizeValueDisplayEl = document.getElementById('fontSizeValueDisplayEl');
    const addHeaderOnPageBreakEl = document.getElementById('addHeaderOnPageBreakEl'); // New checkbox
    const urlInputEl = document.getElementById('urlInputEl');
    const fetchUrlBtnEl = document.getElementById('fetchUrlBtnEl');
    const urlStatusEl = document.getElementById('urlStatusEl');
    const urlLoaderEl = document.getElementById('urlLoaderEl');
    const historyListEl = document.getElementById('historyListEl');
    const proxySelectEl = document.getElementById('proxySelectEl');
    const historyToggleBtnEl = document.getElementById('historyToggleBtnEl');
    const historyContentEl = document.getElementById('historyContentEl');
    const updateHistoryToggleBtnEl = document.getElementById('updateHistoryToggleBtnEl');
    const updateHistoryContentEl = document.getElementById('updateHistoryContentEl');

    let songInfo = {};
    let originalLyricsLines = [];
    let normalLineBreakStates = [];
    let pageBreakAfterLineStates = [];
    let addSpaceOnBrRemovalStates = [];

    const MAX_HISTORY_ITEMS = 15;
    const HISTORY_STORAGE_KEY = 'lyricsToolUrlHistory_v2';

    const proxies = [
        { name: "Proxy 1 (codetabs)", idName: "codetabs", buildUrl: (targetUrl) => `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(targetUrl)}` },
        { name: "Proxy 2 (allorigins)", idName: "allorigins", buildUrl: (targetUrl) => `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}` }
    ];

    function populateProxies() {
        proxies.forEach((proxy, index) => {
            const option = document.createElement('option');
            option.value = index;
            option.textContent = proxy.name;
            proxySelectEl.appendChild(option);
        });
        proxySelectEl.value = "0";
    }

    fontSizeValueDisplayEl.textContent = fontSizeSliderEl.value;

    fontSizeSliderEl.addEventListener('input', (event) => {
        const newSize = event.target.value;
        fontSizeValueDisplayEl.textContent = newSize;
        if (typeof gtag === 'function') {
            gtag('event', 'font_size_adjusted', {
                'event_category': 'controls', 'event_label': 'lyrics_font_size', 'value': parseInt(newSize)
            });
        }
        // Update preview if it exists
        if (outputFrameEl.contentDocument && outputFrameEl.contentDocument.body && outputFrameEl.contentDocument.body.innerHTML) {
            displayFullPreview(); // Re-render preview to apply font size and header option
        }
    });

    // Listener for the new checkbox
    if (addHeaderOnPageBreakEl) {
        addHeaderOnPageBreakEl.addEventListener('change', () => {
            if (typeof gtag === 'function') {
                gtag('event', 'toggle_header_on_page_break', {
                    'event_category': 'controls',
                    'event_label': addHeaderOnPageBreakEl.checked ? 'enable' : 'disable'
                });
            }
            // Update preview if it exists
            if (outputFrameEl.contentDocument && outputFrameEl.contentDocument.body && outputFrameEl.contentDocument.body.innerHTML) {
                displayFullPreview(); // Re-render preview to apply header option
            }
        });
    }


    // Accordion toggle logic - ensure this targets the correct elements
    function setupAccordionToggle(toggleButton, contentElement) {
        if (toggleButton && contentElement) {
            toggleButton.addEventListener('click', () => {
                const isOpen = contentElement.classList.toggle('open');
                toggleButton.classList.toggle('open', isOpen); // Sync button state
                // GA4 Event
                const eventName = contentElement.id === 'historyContentEl' ? 'toggle_history_view' : 'toggle_update_history_view';
                if (typeof gtag === 'function') {
                    gtag('event', eventName, {
                        'event_category': 'ui_interaction',
                        'event_label': isOpen ? 'open' : 'close'
                    });
                }
            });
        }
    }

    setupAccordionToggle(historyToggleBtnEl, historyContentEl);
    setupAccordionToggle(updateHistoryToggleBtnEl, updateHistoryContentEl);


    fetchUrlBtnEl.addEventListener('click', async () => {
        const targetUrl = urlInputEl.value.trim();
        if (!targetUrl) {
            urlStatusEl.textContent = 'URLを入力してください。';
            urlStatusEl.className = 'status-message error'; return;
        }
        try {
            const urlObject = new URL(targetUrl);
            if (urlObject.hostname !== 'utaten.com' && urlObject.hostname !== 'www.utaten.com') {
                urlStatusEl.textContent = 'utaten.com のURLのみ有効です。';
                urlStatusEl.className = 'status-message error'; return;
            }
        } catch (e) {
            urlStatusEl.textContent = '無効なURL形式です。';
            urlStatusEl.className = 'status-message error'; return;
        }
        urlLoaderEl.style.display = 'inline-block';
        urlStatusEl.textContent = '読み込み中...';
        urlStatusEl.className = 'status-message';
        fetchUrlBtnEl.disabled = true;

        const selectedProxyIndex = parseInt(proxySelectEl.value);
        const selectedProxy = proxies[selectedProxyIndex];
        const proxyUrl = selectedProxy.buildUrl(targetUrl);

        if (typeof gtag === 'function') {
            gtag('event', 'fetch_url_attempt', {
                'event_category': 'lyrics_source', 'event_label': targetUrl.substring(0, 100), 'proxy_used': selectedProxy.idName
            });
        }

        try {
            const response = await fetch(proxyUrl);
            if (!response.ok) {
                const errorMsg = `HTTPエラー ${response.status}. プロキシ (${selectedProxy.name}) または対象サイトの問題の可能性があります。`;
                if (typeof gtag === 'function') {
                    gtag('event', 'fetch_url_outcome', {
                        'event_category': 'lyrics_source', 'event_label': 'failure',
                        'proxy_used': selectedProxy.idName, 'error_details': `status_${response.status}`
                    });
                }
                throw new Error(errorMsg);
            }
            const htmlText = await response.text();
            htmlInputEl.value = htmlText;

            const tempParser = new DOMParser();
            const tempDoc = tempParser.parseFromString(htmlText, 'text/html');
            const title = (tempDoc.querySelector('h2.newLyricTitle__main')?.textContent.replace('歌詞', '').trim()) || "タイトル不明";
            const artist = (tempDoc.querySelector('div.lyricData__main h3 a')?.textContent.trim()) || "アーティスト不明";

            if (title && title !== "タイトル不明") {
                addToHistory(targetUrl, title, artist);
            }
            if (typeof gtag === 'function') {
                gtag('event', 'fetch_url_outcome', {
                    'event_category': 'lyrics_source', 'event_label': 'success',
                    'proxy_used': selectedProxy.idName, 'song_title': title.substring(0,100)
                });
            }

            urlStatusEl.textContent = 'HTML読み込み成功。自動的に整形・プレビューします。';
            urlStatusEl.className = 'status-message success';
            generatePreviewBtnEl.click();
        } catch (error) {
            console.error('Fetch error:', error);
            urlStatusEl.textContent = `URL取得失敗: ${error.message}. 手動コピー＆ペーストしてください。`;
            urlStatusEl.className = 'status-message error';
            if (typeof gtag === 'function') {
                gtag('event', 'fetch_url_outcome', {
                    'event_category': 'lyrics_source', 'event_label': 'failure',
                    'proxy_used': selectedProxy.idName, 'error_details': error.message.substring(0,100)
                });
            }
        } finally {
            urlLoaderEl.style.display = 'none';
            fetchUrlBtnEl.disabled = false;
        }
    });

    generatePreviewBtnEl.addEventListener('click', () => {
        const rawHtml = htmlInputEl.value;
        if (!rawHtml.trim()) {
            urlStatusEl.textContent = '歌詞ページのHTMLを入力してください。';
            urlStatusEl.className = 'status-message error';
            return;
        }
        const parser = new DOMParser();
        const doc = parser.parseFromString(rawHtml, 'text/html');

        songInfo.title = (doc.querySelector('h2.newLyricTitle__main')?.textContent.replace('歌詞', '').trim()) || "タイトル不明";
        songInfo.artist = (doc.querySelector('div.lyricData__main h3 a')?.textContent.trim()) || "アーティスト不明";
        songInfo.releaseDate = (doc.querySelector('dd.newLyricWork__date')?.textContent.replace('リリース', '').trim()) || "リリース日不明";

        let lyricist = "作詞者不明"; let composer = "作曲者不明";
        doc.querySelectorAll('dl.newLyricWork dt.newLyricWork__title').forEach(dt => {
            const dd = dt.nextElementSibling;
            if (dd) {
                const text = (dd.querySelector('a') || dd).textContent.trim();
                if (dt.textContent.trim() === '作詞') lyricist = text || "作詞者不明";
                if (dt.textContent.trim() === '作曲') composer = text || "作曲者不明";
            }
        });
        songInfo.lyricist = lyricist; songInfo.composer = composer;

        let rawLyricsHtml = doc.querySelector('div.hiragana')?.innerHTML || "<p>歌詞が見つかりません。</p>";
        rawLyricsHtml = rawLyricsHtml.replace(/<span class="ruby"><span class="rb">([^<]+)<\/span><span class="rt">([^<]+)<\/span><\/span>/g, '<ruby>$1<rt>$2</rt></ruby>');

        originalLyricsLines = rawLyricsHtml.split(/<br\s*\/?>/i).map(line => line.trim());
        normalLineBreakStates = Array(originalLyricsLines.length - 1).fill(true);
        pageBreakAfterLineStates = Array(originalLyricsLines.length -1).fill(false);
        addSpaceOnBrRemovalStates = Array(originalLyricsLines.length - 1).fill(false);

        if (typeof gtag === 'function') {
            gtag('event', 'generate_preview', {
                'event_category': 'core_action', 'event_label': songInfo.title ? songInfo.title.substring(0,100) : 'unknown_title'
            });
        }

        displayFullPreview();
        downloadHtmlBtnEl.disabled = false;
        printBtnEl.disabled = false;
    });

    function getHeaderHtmlForPreview() {
        if (!addHeaderOnPageBreakEl.checked) return ''; // Return empty if option is off
        return `<div class="repeated-header-info-preview"><h1>${songInfo.title || 'タイトル不明'}</h1><p>アーティスト: ${songInfo.artist || 'アーティスト不明'}</p></div>`;
    }

    function displayFullPreview() {
        const currentFontSize = fontSizeSliderEl.value;
        let lyricsHtmlForPreview = '';

        originalLyricsLines.forEach((line, index) => {
            if (index > 0 && pageBreakAfterLineStates[index - 1]) {
                lyricsHtmlForPreview += getHeaderHtmlForPreview(); // Use the function here
            }
            lyricsHtmlForPreview += `<span class="lyric-line-content">${line}</span>`;


            if (index < originalLyricsLines.length - 1) {
                const isEffectivelyEmptyLine = line.replace(/<[^>]+>/g, '').trim() === '';

                if (isEffectivelyEmptyLine) {
                    if (pageBreakAfterLineStates[index]) {
                        lyricsHtmlForPreview += `<button class="control-btn remove-pb-btn" data-line-index="${index}">改ページ削除</button>`;
                    } else {
                        lyricsHtmlForPreview += `<button class="control-btn add-pb-btn" data-line-index="${index}">改ページ追加</button>`;
                    }
                }

                if (normalLineBreakStates[index]) {
                    lyricsHtmlForPreview += `<button class="control-btn remove-br-btn" data-line-index="${index}">改行削除</button>`;
                    lyricsHtmlForPreview += `<br data-br-index="${index}">`;
                } else {
                    lyricsHtmlForPreview += `<button class="control-btn restore-br-btn" data-line-index="${index}">改行追加</button>`;
                    if (addSpaceOnBrRemovalStates[index]) {
                        lyricsHtmlForPreview += `<button class="control-btn toggle-space-btn" data-line-index="${index}" data-action="remove_space">空白削除</button>`;
                        lyricsHtmlForPreview += `<span class="br-placeholder space-added" data-br-index="${index}"> </span>`;
                    } else {
                        lyricsHtmlForPreview += `<button class="control-btn toggle-space-btn" data-line-index="${index}" data-action="add_space">空白追加</button>`;
                        lyricsHtmlForPreview += `<span class="br-placeholder no-space" data-br-index="${index}"></span>`;
                    }
                }
                if (pageBreakAfterLineStates[index] && !isEffectivelyEmptyLine) {
                    lyricsHtmlForPreview += `<div class="page-break-preview-indicator">-- 改ページ指示箇所 --</div>`;
                }
            }
        });

        const previewContent = `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title>${songInfo.title} - プレビュー</title><style>
            body { font-family: 'MS Mincho', 'Hiragino Mincho ProN', Meiryo, sans-serif; margin: 10px; font-size: 12pt; }
            h1 { font-size: 18pt; text-align: center; margin-bottom: 10px; font-weight: bold; }
            .song-info { text-align: right; margin-bottom: 20px; font-size: 9pt; } .song-info p { margin: 2px 0; }
            .lyrics { margin-top: 15px; text-align: left; font-size: ${currentFontSize}pt; line-height: 2.2; }
            ruby { display: ruby; ruby-position: over !important; line-height: initial; }
            ruby rt { font-size: 0.55em; opacity: 0.95; user-select: none; }
            .lyric-line-content { display: inline; }
            button.control-btn { padding:1px 4px; font-size:0.75em; margin-left:5px; background-color:#6c757d; color:white; border:none; border-radius:3px; cursor:pointer; vertical-align: baseline;}
            button.control-btn:hover { background-color:#5a6268; }
            .br-placeholder.no-space { /* Empty */ }
            .br-placeholder.space-added::before { content: " "; white-space: pre; }
            .page-break-preview-indicator { text-align:center; color:blue; font-size:0.8em; border-top:1px dashed blue; margin: 5px 0; padding: 2px 0; user-select: none;}
            .repeated-header-info-preview { font-size: ${Math.max(8, parseInt(currentFontSize) - 4)}pt; color: #555; border: 1px dashed #ccc; padding: 5px; margin: 10px 0; background-color: #f9f9f9; }
            .repeated-header-info-preview h1 { font-size: 1.2em; margin:0 0 5px 0; text-align: left; font-weight: bold;}
            .repeated-header-info-preview p { font-size: 0.9em; margin: 0; text-align: left;}
        </style></head><body><h1>${songInfo.title}</h1><div class="song-info"><p>アーティスト: ${songInfo.artist}</p><p>作詞: ${songInfo.lyricist}</p><p>作曲: ${songInfo.composer}</p><p>リリース日: ${songInfo.releaseDate}</p></div><div class="lyrics">${lyricsHtmlForPreview}</div></body></html>`;

        const iframeDoc = outputFrameEl.contentDocument || outputFrameEl.contentWindow.document;
        iframeDoc.open();
        iframeDoc.write(previewContent);
        iframeDoc.close();

        setTimeout(() => {
            if (iframeDoc.body) {
                attachControlListeners(iframeDoc);
            }
        }, 100);
    }

    function attachControlListeners(iframeDoc) {
        if (!iframeDoc || !iframeDoc.body) return;
        iframeDoc.querySelectorAll('.remove-br-btn').forEach(b => b.onclick = () => toggleNormalBreak(parseInt(b.dataset.lineIndex), false));
        iframeDoc.querySelectorAll('.restore-br-btn').forEach(b => b.onclick = () => toggleNormalBreak(parseInt(b.dataset.lineIndex), true));
        iframeDoc.querySelectorAll('.add-pb-btn').forEach(b => b.onclick = () => togglePageBreak(parseInt(b.dataset.lineIndex), true));
        iframeDoc.querySelectorAll('.remove-pb-btn').forEach(b => b.onclick = () => togglePageBreak(parseInt(b.dataset.lineIndex), false));
        iframeDoc.querySelectorAll('.toggle-space-btn').forEach(button => {
            button.onclick = () => {
                const index = parseInt(button.dataset.lineIndex);
                toggleSpaceState(index, button.dataset.action === "add_space");
            };
        });
    }

    function toggleNormalBreak(index, showBr) {
        if (index >= 0 && index < normalLineBreakStates.length) {
            normalLineBreakStates[index] = showBr;
            displayFullPreview();
        }
    }
    function togglePageBreak(index, addPb) {
            if (index >= 0 && index < pageBreakAfterLineStates.length) {
            pageBreakAfterLineStates[index] = addPb;
            displayFullPreview();
        }
    }
    function toggleSpaceState(index, addSpace) {
        if (index >= 0 && index < addSpaceOnBrRemovalStates.length) {
            addSpaceOnBrRemovalStates[index] = addSpace;
            displayFullPreview();
        }
    }

    function getHeaderHtmlForFinalOutput() {
        if (!addHeaderOnPageBreakEl.checked) return ''; // Return empty if option is off
        return `<div class="repeated-header-info"><h1>${songInfo.title || 'タイトル不明'}</h1><div class="song-info"><p>アーティスト: ${songInfo.artist || 'アーティスト不明'}</p><p>作詞: ${songInfo.lyricist || '作詞者不明'}</p><p>作曲: ${songInfo.composer || '作曲者不明'}</p><p>リリース日: ${songInfo.releaseDate || 'リリース日不明'}</p></div></div>`;
    }

    function generateFinalHtmlForOutput() {
        const currentFontSize = fontSizeSliderEl.value;
        let lyricsHtmlOutput = '';

        originalLyricsLines.forEach((line, index) => {
            if (index > 0 && pageBreakAfterLineStates[index - 1]) {
                lyricsHtmlOutput += getHeaderHtmlForFinalOutput(); // Use the function here
            }
            lyricsHtmlOutput += line;

            if (index < normalLineBreakStates.length) {
                if (normalLineBreakStates[index]) {
                    lyricsHtmlOutput += '<br>';
                } else {
                    if (addSpaceOnBrRemovalStates[index]) {
                        lyricsHtmlOutput += ' ';
                    }
                }
            }
            if (index < pageBreakAfterLineStates.length && pageBreakAfterLineStates[index]) {
                lyricsHtmlOutput += '<div class="print-page-break-element"></div>';
            }
        });

        return `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title>${songInfo.title} - 歌詞</title><style>
            body { font-family: 'MS Mincho', 'Hiragino Mincho ProN', Meiryo, sans-serif; margin: 20mm; font-size: 12pt; background-color: #fff; color: #000; }
            h1 { font-size: 20pt; text-align: center; margin-bottom: 15px; font-weight: bold; }
            .song-info { text-align: right; margin-bottom: 25px; font-size: 10pt; } .song-info p { margin: 3px 0; }
            .lyrics { margin-top: 20px; text-align: left; font-size: ${currentFontSize}pt; line-height: 2.2; column-count: 1; }
            ruby { display: ruby; ruby-position: over !important; line-height: initial; }
            ruby rt { font-size: 0.55em; opacity: 0.95; user-select: none; }
            .repeated-header-info { margin-bottom: 15px; }
            .repeated-header-info h1 { font-size: 16pt; text-align: center; margin-bottom: 8px; font-weight: bold; }
            .repeated-header-info .song-info { text-align: right; margin-bottom: 10px; font-size: 9pt; }
            .repeated-header-info .song-info p { margin: 2px 0; }
            @media print {
                body { margin: 15mm; font-size: 11pt; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                h1 { font-size: 18pt; }
                .song-info { font-size: 9pt; }
                .lyrics { font-size: ${Math.max(8, parseInt(currentFontSize) - 1)}pt; line-height: 2.0; }
                .repeated-header-info h1 { font-size: 14pt; }
                .repeated-header-info .song-info { font-size: 8pt; }
                .print-page-break-element {
                    page-break-after: always !important;
                    display: block !important; height: 0 !important; line-height: 0 !important; font-size: 0 !important;
                    margin: 0 !important; padding: 0 !important; border: none !important;
                    visibility: visible !important; content: "";
                }
            }
            .print-page-break-element { display: none; }
        </style></head><body><h1>${songInfo.title}</h1><div class="song-info"><p>アーティスト: ${songInfo.artist}</p><p>作詞: ${songInfo.lyricist}</p><p>作曲: ${songInfo.composer}</p><p>リリース日: ${songInfo.releaseDate}</p></div><div class="lyrics">${lyricsHtmlOutput}</div></body></html>`;
    }

    function getHistory() {
        const historyJson = localStorage.getItem(HISTORY_STORAGE_KEY);
        try {
            const parsed = JSON.parse(historyJson);
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) { return []; }
    }
    function saveHistory(history) {
        localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
    }
    function addToHistory(url, title, artist) {
        if (!url || !title || title === "タイトル不明") return;
        let history = getHistory();
        history = history.filter(item => item.url !== url);
        history.unshift({ url: url, title: title, artist: artist || "不明" });
        if (history.length > MAX_HISTORY_ITEMS) {
            history = history.slice(0, MAX_HISTORY_ITEMS);
        }
        saveHistory(history);
        renderHistory();
        if (typeof gtag === 'function') {
            gtag('event', 'add_to_history', {
                'event_category': 'history_interaction', 'event_label': title.substring(0,100)
            });
        }
    }
    function deleteHistoryItem(urlToDelete) {
        let history = getHistory();
        history = history.filter(item => item.url !== urlToDelete);
        saveHistory(history);
        renderHistory();
        if (typeof gtag === 'function') {
            gtag('event', 'delete_from_history', {
                'event_category': 'history_interaction', 'event_label': urlToDelete.substring(0,100)
            });
        }
    }
    function renderHistory() {
        if (!historyListEl) return;
        historyListEl.innerHTML = '';
        const history = getHistory();
        if (history.length === 0) {
            const li = document.createElement('li');
            li.textContent = '履歴はありません。';
            li.style.cssText = 'font-style: italic; color: #777; text-align: center; padding: 10px 0;';
            historyListEl.appendChild(li);
            return;
        }
        history.forEach((item) => {
            const li = document.createElement('li');

            const textContentDiv = document.createElement('div');
            textContentDiv.className = 'history-item-text-content';
            textContentDiv.onclick = () => {
                urlInputEl.value = item.url;
                if (typeof gtag === 'function') {
                    gtag('event', 'load_from_history', {
                        'event_category': 'history_interaction', 'event_label': item.title.substring(0,100)
                    });
                }
                fetchUrlBtnEl.click();
            };


            const titleArtistSpan = document.createElement('span');
            titleArtistSpan.className = 'history-item-title-artist';
            titleArtistSpan.textContent = `${item.title}：${item.artist || '不明'}`;
            titleArtistSpan.title = `クリックして再読み込み: ${item.title}`;

            const externalUrlLink = document.createElement('a');
            externalUrlLink.href = item.url;
            externalUrlLink.className = 'history-item-external-url';
            externalUrlLink.target = '_blank';
            externalUrlLink.textContent = `(${item.url})`;
            externalUrlLink.title = `元のページを開く: ${item.url}`;
            externalUrlLink.onclick = (e) => {
                e.stopPropagation();
                if (typeof gtag === 'function') {
                    gtag('event', 'open_external_from_history', {
                        'event_category': 'history_interaction', 'event_label': item.url.substring(0,100)
                    });
                }
            };

            textContentDiv.appendChild(titleArtistSpan);
            textContentDiv.appendChild(externalUrlLink);

            const deleteBtn = document.createElement('button');
            deleteBtn.textContent = '削除';
            deleteBtn.classList.add('history-delete-btn');
            deleteBtn.dataset.url = item.url;
            deleteBtn.onclick = (e) => {
                e.stopPropagation();
                deleteHistoryItem(item.url);
            };

            li.appendChild(textContentDiv);
            li.appendChild(deleteBtn);
            historyListEl.appendChild(li);
        });
    }

    downloadHtmlBtnEl.addEventListener('click', () => {
        if (!songInfo.title) {
            urlStatusEl.textContent = '先に「整形を初期化」を実行してください。';
            urlStatusEl.className = 'status-message error';
            return;
        }
        const finalHtmlContent = generateFinalHtmlForOutput();
        if (typeof gtag === 'function') {
            gtag('event', 'download_html', {
                'event_category': 'core_action', 'event_label': songInfo.title ? songInfo.title.substring(0,100) : 'unknown_title'
            });
        }
        let filename = (songInfo.title && songInfo.title !== "タイトル不明") ? songInfo.title.replace(/[\\/*?:"<>|]/g, "_") + ".html" : "lyrics_formatted.html";
        const blob = new Blob([finalHtmlContent], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click();
        document.body.removeChild(a); URL.revokeObjectURL(url);
    });

    printBtnEl.addEventListener('click', () => {
        if (!songInfo.title) {
            urlStatusEl.textContent = '先に「整形を初期化」を実行してください。';
            urlStatusEl.className = 'status-message error';
            return;
        }
        const finalHtmlContent = generateFinalHtmlForOutput();
        if (typeof gtag === 'function') {
            gtag('event', 'print_html', {
                'event_category': 'core_action', 'event_label': songInfo.title ? songInfo.title.substring(0,100) : 'unknown_title'
            });
        }
        const printWindow = window.open('', '_blank', 'width=800,height=600');
        if (!printWindow) {
            urlStatusEl.textContent = "印刷ウィンドウを開けませんでした。ポップアップブロッカーを確認してください。";
            urlStatusEl.className = 'status-message error';
            return;
        }
        printWindow.document.open();
        printWindow.document.write(finalHtmlContent);
        printWindow.document.close();

        const attemptPrint = () => {
            try {
                if (!printWindow || printWindow.closed) { return; }
                if (printWindow.document.readyState === "complete") {
                    printWindow.focus(); printWindow.print();
                } else { setTimeout(attemptPrint, 200); }
            } catch (e) { console.error("Error during print attempt:", e); }
        };
        if (printWindow.document.readyState === "complete") { attemptPrint(); }
        else { printWindow.onload = attemptPrint; setTimeout(attemptPrint, 700); }
    });

    // Initial setup on page load
    populateProxies();
    renderHistory();
});
