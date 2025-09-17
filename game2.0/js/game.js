// 游戏页面JavaScript
let currentGame = null;
let currentLang = 'en';

// DOM元素
const gameTitle = document.getElementById('gameTitle');
const gameDescription = document.getElementById('gameDescription');
const gameCategory = document.getElementById('gameCategory');
const gameRating = document.getElementById('gameRating');
const gameLoading = document.getElementById('gameLoading');
const gameContainer = document.getElementById('gameContainer');
const gameFrame = document.getElementById('gameFrame');
const gameError = document.getElementById('gameError');
const fullscreenBtn = document.getElementById('fullscreenBtn');
const fullscreenInstructions = document.getElementById('fullscreenInstructions');

// 翻译对象
const translations = {
    zh: {
        loading: '游戏加载中...',
        gameNotFound: '游戏未找到',
        gameNotFoundDesc: '抱歉，无法加载请求的游戏。',
        backToGames: '返回游戏列表',
        rating: '评分',
        fullscreenControls: '全屏控制：',
        fullscreenInstr1: '• 点击全屏按钮或按 F11 进入全屏',
        fullscreenInstr2: '• 按 ESC 或 F11 退出全屏',
        fullscreenInstr3: '• 按 ESC 返回游戏列表',
        back: '返回',
        home: '首页'
    },
    en: {
        loading: 'Loading game...',
        gameNotFound: 'Game Not Found',
        gameNotFoundDesc: 'Sorry, the requested game could not be loaded.',
        backToGames: 'Back to Games',
        rating: 'Rating',
        fullscreenControls: 'Fullscreen Controls:',
        fullscreenInstr1: '• Click the fullscreen button or press F11 to enter fullscreen',
        fullscreenInstr2: '• Press ESC or F11 to exit fullscreen',
        fullscreenInstr3: '• Press ESC to return to game list',
        back: 'Back',
        home: 'Home'
    }
};

// 初始化页面
async function initGamePage() {
    // 获取URL参数
    const urlParams = new URLSearchParams(window.location.search);
    const gameId = urlParams.get('id');
    
    if (!gameId) {
        showError();
        return;
    }
    
    try {
        // 加载游戏数据
        const response = await fetch('data/games.json');
        const games = await response.json();
        
        // 查找指定游戏
        currentGame = games.find(game => game.id == gameId);
        
        if (!currentGame) {
            showError();
            return;
        }
        
        // 检测语言设置
        detectLanguage();
        
        // 渲染游戏信息
        renderGameInfo();
        
        // 加载游戏iframe
        loadGameFrame();
        
    } catch (error) {
        console.error('Error loading game:', error);
        showError();
    }
}

// 检测语言设置
function detectLanguage() {
    // 从localStorage获取语言设置
    const savedLang = localStorage.getItem('language');
    if (savedLang) {
        currentLang = savedLang;
    } else {
        // 默认英文
        currentLang = 'en';
    }
    updateLanguage();
}

// 切换语言
function toggleLanguage() {
    currentLang = currentLang === 'zh' ? 'en' : 'zh';
    localStorage.setItem('language', currentLang);
    updateLanguage();
    renderGameInfo();
}

// 更新语言显示
function updateLanguage() {
    // 更新语言切换按钮文本
    const langText = document.getElementById('langText');
    if (langText) {
        langText.textContent = currentLang === 'zh' ? 'EN' : '中文';
    }
    
    // 更新导航按钮文本
    const backText = document.getElementById('backText');
    const homeText = document.getElementById('homeText');
    
    if (backText) {
        backText.textContent = translations[currentLang].back;
    }
    
    if (homeText) {
        homeText.textContent = translations[currentLang].home;
    }
    
    // 更新加载文本
    const loadingText = document.querySelector('#gameLoading p');
    if (loadingText) {
        loadingText.textContent = translations[currentLang].loading;
    }
    
    // 更新错误页面文本
    updateErrorPageLanguage();
}

// 更新错误页面语言
function updateErrorPageLanguage() {
    const errorTitle = document.querySelector('#gameError h3');
    const errorDesc = document.querySelector('#gameError p');
    const errorBtn = document.querySelector('#gameError a');
    
    if (errorTitle) {
        errorTitle.textContent = translations[currentLang].gameNotFound;
    }
    
    if (errorDesc) {
        errorDesc.textContent = translations[currentLang].gameNotFoundDesc;
    }
    
    if (errorBtn) {
        errorBtn.textContent = translations[currentLang].backToGames;
    }
}

// 渲染游戏信息
function renderGameInfo() {
    if (!currentGame) return;
    
    const title = currentLang === 'zh' ? currentGame.title : currentGame.title_en;
    const description = currentLang === 'zh' ? currentGame.description : currentGame.description_en;
    const category = currentLang === 'zh' ? currentGame.category : currentGame.category_en;
    
    gameTitle.textContent = title;
    gameDescription.textContent = description;
    gameCategory.textContent = category;
    gameRating.innerHTML = `★ ${currentGame.rating}`;
    
    // 更新页面标题
    document.title = `${title} - CurioMinds`;
    
    // 更新SEO meta标签
    updateSEOTags(currentGame, title, description, category);
    
    // 更新全屏说明文本
    updateFullscreenInstructions();
}

// 更新SEO meta标签
function updateSEOTags(game, title, description, category) {
    // 更新页面标题
    document.title = `${title} - ${category} | CurioMinds`;
    
    // 更新meta description
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
        metaDesc.setAttribute('content', `Play ${title} - ${description} | CurioMinds brain training games.`);
    }
    
    // 更新Open Graph标签
    const ogTitle = document.querySelector('meta[property="og:title"]');
    const ogDesc = document.querySelector('meta[property="og:description"]');
    const ogUrl = document.querySelector('meta[property="og:url"]');
    const ogImage = document.querySelector('meta[property="og:image"]');
    
    if (ogTitle) ogTitle.setAttribute('content', `${title} - ${category} | CurioMinds`);
    if (ogDesc) ogDesc.setAttribute('content', `Play ${title} - ${description}`);
    if (ogUrl) ogUrl.setAttribute('content', `https://curiominds.com/game.html?id=${game.id}`);
    if (ogImage && game.thumbnail) ogImage.setAttribute('content', `https://curiominds.com/${game.thumbnail}`);
    
    // 更新Twitter标签
    const twitterTitle = document.querySelector('meta[name="twitter:title"]');
    const twitterDesc = document.querySelector('meta[name="twitter:description"]');
    const twitterUrl = document.querySelector('meta[name="twitter:url"]');
    const twitterImage = document.querySelector('meta[name="twitter:image"]');
    
    if (twitterTitle) twitterTitle.setAttribute('content', `${title} - ${category} | CurioMinds`);
    if (twitterDesc) twitterDesc.setAttribute('content', `Play ${title} - ${description}`);
    if (twitterUrl) twitterUrl.setAttribute('content', `https://curiominds.com/game.html?id=${game.id}`);
    if (twitterImage && game.thumbnail) twitterImage.setAttribute('content', `https://curiominds.com/${game.thumbnail}`);
    
    // 更新canonical URL
    const canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) canonical.setAttribute('href', `https://curiominds.com/game.html?id=${game.id}`);
}

// 加载游戏iframe
function loadGameFrame() {
    if (!currentGame || !currentGame.iframe) {
        showError();
        return;
    }
    
    // 设置iframe源
    gameFrame.src = currentGame.iframe;
    
    // 监听iframe加载事件
    gameFrame.onload = function() {
        hideLoading();
        showGame();
    };
    
    gameFrame.onerror = function() {
        showError();
    };
    
    // 设置超时处理
    setTimeout(() => {
        if (gameLoading.style.display !== 'none') {
            hideLoading();
            showGame();
        }
    }, 10000); // 10秒超时
}

// 显示游戏
function showGame() {
    gameContainer.classList.remove('hidden');
    gameLoading.classList.add('hidden');
    gameError.classList.add('hidden');
    
    // 显示全屏说明
    if (fullscreenInstructions) {
        fullscreenInstructions.classList.remove('hidden');
    }
}

// 隐藏加载状态
function hideLoading() {
    gameLoading.classList.add('hidden');
}

// 显示错误状态
function showError() {
    gameLoading.classList.add('hidden');
    gameContainer.classList.add('hidden');
    gameError.classList.remove('hidden');
    
    // 更新错误信息文本
    const errorTitle = gameError.querySelector('h3');
    const errorDesc = gameError.querySelector('p');
    const errorBtn = gameError.querySelector('a');
    
    if (errorTitle) errorTitle.textContent = translations[currentLang].gameNotFound;
    if (errorDesc) errorDesc.textContent = translations[currentLang].gameNotFoundDesc;
    if (errorBtn) errorBtn.textContent = translations[currentLang].backToGames;
}

// 更新全屏说明文本
function updateFullscreenInstructions() {
    if (!fullscreenInstructions) return;
    
    const title = fullscreenInstructions.querySelector('h4');
    const instructions = fullscreenInstructions.querySelectorAll('li');
    
    if (title) title.textContent = translations[currentLang].fullscreenControls;
    if (instructions[0]) instructions[0].innerHTML = translations[currentLang].fullscreenInstr1.replace('F11', '<kbd class="px-1 py-0.5 bg-blue-200 rounded text-xs">F11</kbd>');
    if (instructions[1]) instructions[1].innerHTML = translations[currentLang].fullscreenInstr2.replace(/ESC|F11/g, match => `<kbd class="px-1 py-0.5 bg-blue-200 rounded text-xs">${match}</kbd>`);
    if (instructions[2]) instructions[2].innerHTML = translations[currentLang].fullscreenInstr3.replace('ESC', '<kbd class="px-1 py-0.5 bg-blue-200 rounded text-xs">ESC</kbd>');
}

// 切换全屏模式
function toggleFullscreen() {
    if (!gameFrame) return;
    
    if (!document.fullscreenElement) {
        // 进入全屏
        if (gameFrame.requestFullscreen) {
            gameFrame.requestFullscreen();
        } else if (gameFrame.webkitRequestFullscreen) {
            gameFrame.webkitRequestFullscreen();
        } else if (gameFrame.msRequestFullscreen) {
            gameFrame.msRequestFullscreen();
        }
    } else {
        // 退出全屏
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        } else if (document.msExitFullscreen) {
            document.msExitFullscreen();
        }
    }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
    initGamePage();
    
    // 绑定全屏按钮事件
    if (fullscreenBtn) {
        fullscreenBtn.addEventListener('click', toggleFullscreen);
    }
    
    // 监听全屏状态变化
    document.addEventListener('fullscreenchange', updateFullscreenButton);
    document.addEventListener('webkitfullscreenchange', updateFullscreenButton);
    document.addEventListener('msfullscreenchange', updateFullscreenButton);
});

// 更新全屏按钮图标
function updateFullscreenButton() {
    if (!fullscreenBtn) return;
    
    const isFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement);
    const svg = fullscreenBtn.querySelector('svg path');
    
    if (svg) {
        if (isFullscreen) {
            // 退出全屏图标
            svg.setAttribute('d', 'M8 3v3a2 2 0 01-2 2H3m18 0h-3a2 2 0 01-2-2V3m0 18v-3a2 2 0 012-2h3M3 16h3a2 2 0 012 2v3');
            fullscreenBtn.title = 'Exit Fullscreen (ESC)';
        } else {
            // 进入全屏图标
            svg.setAttribute('d', 'M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4');
            fullscreenBtn.title = 'Toggle Fullscreen (F11)';
        }
    }
}

// 处理页面可见性变化（优化性能）
document.addEventListener('visibilitychange', function() {
    if (document.hidden) {
        // 页面隐藏时暂停游戏（如果支持）
        if (gameFrame && gameFrame.contentWindow) {
            try {
                gameFrame.contentWindow.postMessage({action: 'pause'}, '*');
            } catch (e) {
                // 忽略跨域错误
            }
        }
    } else {
        // 页面显示时恢复游戏（如果支持）
        if (gameFrame && gameFrame.contentWindow) {
            try {
                gameFrame.contentWindow.postMessage({action: 'resume'}, '*');
            } catch (e) {
                // 忽略跨域错误
            }
        }
    }
});

// 处理窗口大小变化
window.addEventListener('resize', function() {
    // 可以在这里添加响应式处理逻辑
});

// 键盘快捷键
document.addEventListener('keydown', function(e) {
    // ESC键返回首页
    if (e.key === 'Escape') {
        window.location.href = 'index.html';
    }
    
    // F11键全屏
    if (e.key === 'F11') {
        e.preventDefault();
        toggleFullscreen();
    }
});