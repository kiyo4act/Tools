// FanboxEnumerator/_src/content_script.js
console.log("[FanboxEnumerator Content Script] SUCCESSFULLY LOADED and EXECUTING. (v1.2.4)"); // Version bump for clarity

/**
 * Parses the FANBOX relationships page HTML to extract supporter data.
 */
function extractDataFromDOM() {
    console.log("[FanboxEnumerator Content Script] extractDataFromDOM() called.");
    try {
        const supporters = [];
        const tableContainerSelector = 'div[class*="TableContainer__Container-"], div.commonStyles__Table-sc-1f3w2vz-0';
        const tableBody = document.querySelector(tableContainerSelector);

        if (!tableBody) {
            const errText = '支援者テーブルの主要コンテナが見つかりません。HTML構造が大幅に変更された可能性があります。';
            console.warn(`[FanboxEnumerator Content Script] ${errText}`);
            return { error: errText, data: [] };
        }
        // console.log("[FanboxEnumerator Content Script] Table container found:", tableBody);

        const rowSelector = 'div[class*="commonStyles__Tr-"]';
        const rowElements = Array.from(tableBody.querySelectorAll(rowSelector));
        // console.log(`[FanboxEnumerator Content Script] Found ${rowElements.length} potential row elements using selector: ${rowSelector}`);

        if (rowElements.length === 0 && document.body.innerHTML.includes("ファン一覧")) {
             const errText = 'HTMLは読み込めましたが、支援者データ行が見つかりませんでした。';
             console.warn(`[FanboxEnumerator Content Script] ${errText}`);
            return { error: errText, data: [] };
        }

        rowElements.forEach((row, rowIndex) => {
            if (row.querySelector('div[class*="Header__Th-"]') || row.querySelector('div[class*="LabelWithSortButton__Wrapper-"]')) {
                // console.log(`[FanboxEnumerator Content Script] Row ${rowIndex} skipped (likely header).`);
                return;
            }
            // console.log(`[FanboxEnumerator Content Script] Processing data row ${rowIndex}.`);

            const cellSelector = 'div[class*="commonStyles__Td-"]';
            const cells = row.querySelectorAll(cellSelector);

            if (cells.length >= 3) {
                let supporterName = '名前不明';
                let userId = 'ID不明';
                let planName = 'プラン不明';
                let startDate = '開始日不明';
                let memo = '';

                const userCell = cells[0];
                const userWrapperAnchor = userCell?.querySelector('a[href*="/manage/relationships/"]');
                if (userWrapperAnchor) {
                    let nameElement = userWrapperAnchor.querySelector('div[class*="TextEllipsis__Text-"]');
                    if (!nameElement) nameElement = userWrapperAnchor.querySelector('div'); // Fallback to any div
                    supporterName = nameElement?.textContent.trim() || userWrapperAnchor.textContent.trim() || '名前不明';

                    const userLink = userWrapperAnchor.getAttribute('href');
                    if (userLink) {
                        const match = userLink.match(/\/manage\/relationships\/(\d+)/);
                        if (match && match[1]) userId = match[1];
                    }
                } else {
                    const potentialNameEl = userCell?.querySelector('div[class*="TextEllipsis__Text-"]') || userCell?.querySelector('div');
                    supporterName = potentialNameEl?.textContent.trim() || userCell?.textContent.trim().split('\n')[0] || '名前不明';
                }

                const planCell = cells[1];
                const planNameEl = planCell?.querySelector('div[class*="TextEllipsis__Text-"]') || planCell?.querySelector('div');
                planName = planNameEl?.textContent.trim() || planCell?.textContent.trim() || 'プラン不明';

                const startDateCell = cells[2];
                startDate = startDateCell?.textContent.trim() || '開始日不明';

                if (cells.length >= 4) {
                    const memoCell = cells[3];
                    const memoEl = memoCell?.querySelector('div[class*="TextEllipsis__Text-"]') || memoCell?.querySelector('div');
                    memo = memoEl?.textContent.trim() || memoCell?.textContent.trim() || '';
                }

                if (supporterName !== '名前不明' || planName !== 'プラン不明' || startDate !== '開始日不明') {
                    supporters.push({
                        supporter_name: supporterName,
                        user_id: userId,
                        plan_name: planName,
                        start_date: startDate,
                        memo: memo
                    });
                }
            }
        });

        if (supporters.length === 0 && rowElements.length > 1) {
            const errText = '支援者リストの行は認識できましたが、詳細データの抽出に失敗しました。HTML構造が変更されたか、詳細情報のセレクタが正しくない可能性があります。';
            console.warn(`[FanboxEnumerator Content Script] ${errText}`);
            return { error: errText, data: [] };
        }
        console.log("[FanboxEnumerator Content Script] Extraction complete. Supporters found:", supporters.length);
        return supporters;

    } catch (e) {
        const errorMsg = `DOM解析中に予期せぬエラーが発生しました: ${e.message}`;
        console.error('[FanboxEnumerator Content Script] Error during DOM scraping:', e);
        return { error: errorMsg, data: [] };
    }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("[FanboxEnumerator Content Script] Message received:", request);
    if (request.action === "scrapeData") {
        const result = extractDataFromDOM();
        if (typeof result === 'object' && result !== null && 'error' in result) {
            sendResponse({ error: result.error, data: result.data || [] });
        } else {
            sendResponse({ data: result });
        }
    } else if (request.action === "getHTML") {
        console.log("[FanboxEnumerator Content Script] Received getHTML request.");
        try {
            const htmlContent = document.documentElement.outerHTML;
            sendResponse({ html: htmlContent });
        } catch (e) {
            console.error("[FanboxEnumerator Content Script] Error getting outerHTML:", e);
            sendResponse({ error: `HTML取得エラー: ${e.message}` });
        }
    }
    return true;
});
