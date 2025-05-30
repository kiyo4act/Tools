// FanboxEnumerator/_src/content_script.js

/**
 * Parses the FANBOX relationships page HTML to extract supporter data.
 * This function is executed in the context of the web page.
 * @returns {Array<Object>|{error: string}} Array of supporter objects or an error object.
 */
function extractDataFromDOM() {
    try {
        const supporters = [];
        // Selector based on provided relationships.html and common FANBOX structure.
        // This is the most fragile part and likely to need updates if FANBOX changes its HTML.
        const tableBody = document.querySelector('div.commonStyles__Table-sc-1f3w2vz-0.dRWCLG');

        if (!tableBody) {
            console.warn('[FanboxEnumerator] Supporter table container not found. HTML structure might have changed.');
            return { error: '支援者テーブルの主要コンテナが見つかりませんでした。' };
        }

        // Get all direct div children of tableBody, these should be the rows
        const rowElements = Array.from(tableBody.children).filter(child => child.matches('div.commonStyles__Tr-sc-1f3w2vz-1'));

        if (rowElements.length === 0) {
             console.warn('[FanboxEnumerator] No supporter rows found in the table.');
            // It's possible the page is loaded but has no supporters, or the selector is wrong.
            // Check if it's a valid page but just empty.
            if (document.title.includes("ファン一覧")) {
                 return { error: '支援者データ行が見つかりませんでした。支援者がいないか、ページの読み込みが不完全な可能性があります。' };
            }
            return { error: '支援者データ行が見つかりませんでした。' };
        }

        rowElements.forEach((row) => {
            // Skip header row (heuristic: check for header-specific class or content)
            if (row.querySelector('div.LabelWithSortButton__Wrapper-sc-m597y7-0')) {
                return; // This is likely the header row, skip it.
            }

            const cells = row.querySelectorAll('div.commonStyles__Td-sc-1f3w2vz-2.gOXCUW');
            if (cells.length >= 4) { // Expecting Name, Plan, Start Date, Memo
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
            } else {
                // console.warn('[FanboxEnumerator] A row did not have enough cells:', row);
            }
        });

        if (supporters.length === 0 && rowElements.length > 1) {
            // Had rows but couldn't extract data from them, likely cell selectors are wrong
            return { error: '支援者リストの行は認識できましたが、詳細データの抽出に失敗しました。HTML構造が変更された可能性があります。' };
        }

        return supporters;

    } catch (e) {
        console.error('[FanboxEnumerator] Error during DOM scraping:', e);
        return { error: `DOM解析中にエラーが発生しました: ${e.message}` };
    }
}


/**
 * Listen for messages from the popup script.
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "scrapeData") {
        console.log("[FanboxEnumerator Content Script] Received scrapeData request from popup.");
        const data = extractDataFromDOM();
        if (data.error) {
            console.error("[FanboxEnumerator Content Script] Error extracting data:", data.error);
            sendResponse({ error: data.error });
        } else {
            console.log("[FanboxEnumerator Content Script] Successfully extracted data:", data);
            sendResponse({ data: data });
        }
        return true; // Indicates that the response is sent asynchronously (though not strictly needed here)
    }
});

console.log("[FanboxEnumerator] Content script loaded and listening.");
