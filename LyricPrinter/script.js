document.addEventListener('DOMContentLoaded', () => {
    const htmlInputEl = document.getElementById('htmlInputEl');
    const generatePreviewBtnEl = document.getElementById('generatePreviewBtnEl');
    const downloadHtmlBtnEl = document.getElementById('downloadHtmlBtnEl');
    const printBtnEl = document.getElementById('printBtnEl');
    const outputFrameEl = document.getElementById('outputFrameEl');
    const fontSizeSliderEl = document.getElementById('fontSizeSliderEl');
    const fontSizeValueDisplayEl = document.getElementById('fontSizeValueDisplayEl');
    const urlInputEl = document.getElementById('urlInputEl');
    const fetchUrlBtnEl = document.getElementById('fetchUrlBtnEl');
    const urlStatusEl = document.getElementById('urlStatusEl');
    const urlLoaderEl = document.getElementById('urlLoaderEl');
    const historyListEl = document.getElementById('historyListEl');
    const proxySelectEl = document.getElementById('proxySelectEl');
    const historyToggleBtnEl = document.getElementById('historyToggleBtnEl'); 
    const historyContentEl = document.getElementById('historyContentEl'); 
    const updateHistoryToggleBtnEl = document.getElementById('updateHistoryToggleBtnEl'); // 更新履歴用
    const updateHistoryContentEl = document.getElementById('updateHistoryContentEl'); // 更新履歴用


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
        if (outputFrameEl.contentDocument && outputFrameEl.contentDocument.body && outputFrameEl.contentDocument.body.innerHTML) {
            const iframeDoc = outputFrameEl.contentDocument;
            const lyricsEl = iframeDoc.querySelector('.lyrics');
            if (lyricsEl) { lyricsEl.style.fontSize = newSize + 'pt'; }
        }
    });
    
    if (historyToggleBtnEl) {
        historyToggleBtnEl.addEventListener('click', () => {
            historyContentEl.classList.toggle('open');
            historyToggleBtnEl.classList.toggle('open');
            if (typeof gtag === 'function') {
                gtag('event', 'toggle_history_view', {
                    'event_category': 'ui_interaction', 'event_label': historyContentEl.classList.contains('open') ? 'open' : 'close'
                });
            }
        });
    }
    // 更新履歴アコーディオンの制御
    if (updateHistoryToggleBtnEl) {
        updateHistoryToggleBtnEl.addEventListener('click', () => {
            updateHistoryContentEl.classList.toggle('open');
            updateHistoryToggleBtnEl.classList.toggle('open');
             if (typeof gtag === 'function') {
                gtag('event', 'toggle_update_history_view', {
                    'event_category': 'ui_interaction',
                    'event_label': updateHistoryContentEl.classList.contains('open') ? 'open' : 'close'
                });
            }
        });
    }


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
                const errorMsg = `HTTPエラー <span class="math-inline">\{response\.status\}\. プロキシ \(</span>{selectedProxy.name}) または対象サイトの問題の可能性があります。`;
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
        if (!rawHtml.trim()) { alert('歌詞ページのHTMLを入力してください。'); return; }
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

    function displayFullPreview() {
        const currentFontSize = fontSizeSliderEl.value;
        let lyricsHtmlForPreview = '';
        originalLyricsLines.forEach((line, index) => {
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
                if (pageBreakAfterLineStates[index]) {
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
            .br-placeholder.space-added::before { content: " "; white-
