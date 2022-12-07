console.log(`hello from pop-up js`);
console.log(chrome.runtime.getURL(`hello_popup.html`));

const url = `http://google.com`;

// utility - pause execution for the given time t
const waitForTime = (t) => {
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve();
        }, t);
    });
};

// utility - wait until a Chrome Tab to be loaded
const waitTabUntilLoaded = (tab) => {
    return new Promise(async (resolve, reject) => {
        while (true) {
            console.log(`tab.status = ${tab.status}`);

            if (tab.status == `complete`) {
                resolve(tab);
                return;
            }

            await waitForTime(200);
        }
    });
};

// utility - get webpage title
function getTitle() {
    return document.title;
}

// utility - get webpage content
function getContent() {
    const el = document.querySelector(`*`);
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNode(el);
    selection.removeAllRanges();
    selection.addRange(range);
    return window.getSelection().toString();
}

// get all the bookmarks from Chrome Bookmark Manager
const getAllBookmarks = () => {
    const bmsList = [];

    const flattenBms = (bms) => {
        for (let i = 0; i < bms.length; i++) {
            if (bms[i].children && bms[i].children.length > 0) {
                flattenBms(bms[i].children);
            }
            else {
                if (bms[i].url) {
                    bmsList.push({
                        title: bms[i].title,
                        url: bms[i].url
                    })
                }
            }
        }
    };

    return new Promise(async (resolve, reject) => {
        chrome.bookmarks.getTree((bms) => {
            flattenBms(bms);
            resolve(bmsList);
        });
    });
}

// open a webpage and get page title and capture page content
const processPage = (url) => {
    return new Promise(async (resolve, reject) => {
        await chrome.tabs.create({ url: url });

        const indexPageWhenLoaded = async (tabId, info, tab) => {
            console.log(`indexPageWhenLoaded: info.status = ${info.status}`);
            if (info.status === 'complete') {
                console.log(`info.status = ${info.status}`);
                console.log(tab);
        
                chrome.scripting.executeScript(
                    {
                        target: { tabId: tabId, allFrames: false },
                        func: getContent,
                    },
                    (injectionResult) => {
                        if (injectionResult && injectionResult.length > 0) {
                            resolve(injectionResult[0].result);
                        }
                        else {
                            reject(`failed to capture content from ${url}`);
                        }

                        chrome.tabs.onUpdated.removeListener(indexPageWhenLoaded);
                        chrome.tabs.onRemoved.removeListener(handleCloseTab);
                        chrome.tabs.remove(tabId);
                    });
            }
        };

        const handleCloseTab = async (tabId, info) => {
            console.log(`tab has been closed`);

            reject(`tab has been closed ${url}`);

            chrome.tabs.onUpdated.removeListener(indexPageWhenLoaded);
            chrome.tabs.onRemoved.removeListener(handleCloseTab);
        };

        chrome.tabs.onUpdated.addListener(indexPageWhenLoaded);
        chrome.tabs.onRemoved.addListener(handleCloseTab);
    });
};

// main - index all existing bookmarks
const indexBookmarks = async () => {
    console.log(`reading bookmarks`);

    const bmsList = await getAllBookmarks();

    for (let i = 0; i < bmsList.length; i++) {
        try {
            const content = await processPage(bmsList[i].url);
            bmsList[i]['content'] = content;
    
            document.querySelector(`#label_index_progress`).innerHTML = `${i + 1} / ${bmsList.length}`;
        } catch (e)  {
            console.log(e);
            console.log(`skipping bmList i = ${i}; bmsList[i].url = ${bmsList[i].url}`);
        }

        await waitForTime(200);
    }

    console.log(bmsList);

    chrome.runtime.sendMessage({ req: "bms", bms: bmsList }, function (response) {
        console.log(response.farewell);
    });
};

// listeners
(async () => {
    console.log(`bm_indexer.js started!`);

    document.querySelector(`#btn_start_index`).onclick = async () => {
        console.log(`starting index`);

        document.querySelectorAll(`#hint_done`).forEach(e => e.style.display = `none`);
        document.querySelectorAll(`#hint_in_progress`).forEach(e => e.style.display = `block`);

        await indexBookmarks();

        document.querySelectorAll(`#hint_in_progress`).forEach(e => e.style.display = `none`);
        document.querySelectorAll(`#hint_done`).forEach(e => e.style.display = `block`);
    };
})();