// 全局变量
let games = [];
let currentLang = 'en';
let filteredGames = [];

// 轮播相关变量
let carouselGames = [];
let currentSlide = 0;
let carouselInterval = null;
let isCarouselPlaying = true;
let touchStartX = 0;
let touchEndX = 0;

// DOM 元素
const gamesGrid = document.getElementById('gamesGrid');
const searchInput = document.getElementById('searchInput');
const langToggle = document.getElementById('langToggle');
const loading = document.getElementById('loading');
const noResults = document.getElementById('noResults');
const filterTags = document.querySelectorAll('.filter-tag');
const categoryLinks = document.querySelectorAll('[data-category]');

// 轮播相关DOM元素
const carouselTrack = document.getElementById('carouselTrack');
const carouselDots = document.getElementById('carouselDots');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');

// 多语言文本
const translations = {
    zh: {
        searchPlaceholder: '搜索游戏...',
        loading: '加载游戏中...',
        noResults: '没有找到相关游戏',
        playGame: '开始游戏',
        difficulty: '难度',
        playCount: '游玩次数',
        rating: '评分',
        allGames: '全部游戏',
        logic: '逻辑推理',
        math: '数学计算',
        memory: '记忆训练',
        strategy: '策略思维',
        spatial: '空间想象',
        wordGames: '文字游戏',
        dailyRecommended: '每日推荐',
        dailyRecommendedDesc: '精选优质游戏，每日更新'
    },
    en: {
        searchPlaceholder: 'Search games...',
        loading: 'Loading games...',
        noResults: 'No games found',
        playGame: 'Play Game',
        difficulty: 'Difficulty',
        playCount: 'Play Count',
        rating: 'Rating',
        allGames: 'All Games',
        logic: 'Logic',
        math: 'Math',
        memory: 'Memory',
        strategy: 'Strategy',
        spatial: 'Spatial',
        wordGames: 'Word Games',
        dailyRecommended: 'Daily Picks',
        dailyRecommendedDesc: 'Handpicked quality games, updated daily'
    }
};

// 初始化应用
async function initApp() {
    try {
        detectLanguage();
        await loadGames();
        generateDynamicTags();
        setupEventListeners();
        renderGames(games);
        initCarousel();
        hideLoading();
    } catch (error) {
        console.error('Failed to initialize app:', error);
        hideLoading();
        showNoResults();
    }
}

// 动态生成分类标签
function generateDynamicTags() {
    const tagContainer = document.querySelector('.flex.flex-wrap.gap-2.justify-center');
    if (!tagContainer) return;
    
    // 获取所有唯一的分类
    const categories = new Set();
    const tags = new Set();
    
    games.forEach(game => {
        const category = currentLang === 'zh' ? game.category : game.category_en;
        const gameTags = currentLang === 'zh' ? game.tags : game.tags_en;
        
        categories.add(category);
        gameTags.forEach(tag => tags.add(tag));
    });
    
    // 清空现有标签（保留"全部"标签）
    const allTag = tagContainer.querySelector('[data-tag="all"]');
    tagContainer.innerHTML = '';
    tagContainer.appendChild(allTag);
    
    // 添加分类标签
    const sortedCategories = Array.from(categories).sort();
    sortedCategories.forEach(category => {
        const button = document.createElement('button');
        button.className = 'filter-tag px-4 py-2 text-sm font-medium rounded-full border transition-colors text-slate-600 border-slate-200 hover:border-primary';
        button.setAttribute('data-tag', category);
        button.textContent = category;
        tagContainer.appendChild(button);
    });
    
    // 重新获取所有标签元素并设置事件监听
    const newFilterTags = document.querySelectorAll('.filter-tag');
    newFilterTags.forEach(tag => {
        tag.addEventListener('click', () => handleTagFilter(tag));
    });
    
    // 初始化标签样式
    initTagStyles();
}

// 加载游戏数据
async function loadGames() {
    try {
        const response = await fetch('data/games.json');
        if (!response.ok) {
            throw new Error('Failed to load games data');
        }
        games = await response.json();
        filteredGames = [...games];
        // 随机选取轮播游戏
        const shuffledGames = [...games].sort(() => Math.random() - 0.5);
        carouselGames = shuffledGames.slice(0, 5); // 随机选取5个游戏用于轮播
    } catch (error) {
        console.error('Error loading games:', error);
        throw error;
    }
}

// 设置事件监听器
function setupEventListeners() {
    // 搜索功能
    searchInput.addEventListener('input', handleSearch);
    
    // 语言切换
    langToggle.addEventListener('click', toggleLanguage);
    
    // 标签过滤事件监听器现在在generateDynamicTags函数中设置
    
    // 分类导航
    categoryLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            handleCategoryFilter(link.dataset.category);
        });
    });
    
    // 轮播控制
    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            pauseCarousel();
            goToSlide(currentSlide - 1);
            setTimeout(() => resumeCarousel(), 2000); // 2秒后恢复自动播放
        });
    }
    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            pauseCarousel();
            goToSlide(currentSlide + 1);
            setTimeout(() => resumeCarousel(), 2000); // 2秒后恢复自动播放
        });
    }
    
    // 轮播触摸支持
    if (carouselTrack) {
        carouselTrack.addEventListener('touchstart', handleTouchStart, { passive: true });
        carouselTrack.addEventListener('touchend', handleTouchEnd, { passive: true });
        
        // 鼠标悬停暂停自动播放
        carouselTrack.addEventListener('mouseenter', pauseCarousel);
        carouselTrack.addEventListener('mouseleave', resumeCarousel);
    }
    
    // 轮播容器鼠标悬停事件
    const carouselContainer = document.querySelector('.carousel-container');
    if (carouselContainer) {
        carouselContainer.addEventListener('mouseenter', pauseCarousel);
        carouselContainer.addEventListener('mouseleave', resumeCarousel);
    }
}

// 渲染游戏卡片
function renderGames(gamesToRender) {
    if (gamesToRender.length === 0) {
        showNoResults();
        return;
    }
    
    hideNoResults();
    
    const gameCards = gamesToRender.map(game => createGameCard(game)).join('');
    gamesGrid.innerHTML = gameCards;
    
    // 添加卡片点击事件
    setupGameCardEvents();
}

// 创建游戏卡片HTML
function createGameCard(game) {
    const title = currentLang === 'zh' ? game.title : game.title_en;
    const description = currentLang === 'zh' ? game.description : game.description_en;
    const category = currentLang === 'zh' ? game.category : game.category_en;
    const difficulty = currentLang === 'zh' ? game.difficulty : game.difficulty_en;
    const tags = currentLang === 'zh' ? game.tags : game.tags_en;
    
    return `
        <div class="game-card bg-white rounded-lg border border-slate-200 shadow-sm hover:shadow-md transition-all duration-300 cursor-pointer group" data-game-id="${game.id}">
            <div class="aspect-video rounded-t-lg overflow-hidden">
                <img src="${game.thumbnail}" alt="${title}" class="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-300" onerror="this.src='img/placeholder.jpg'">
            </div>
            <div class="p-6">
                <div class="flex justify-between items-start mb-2">
                    <h3 class="text-lg font-semibold text-slate-800 group-hover:text-primary transition-colors">${title}</h3>
                    <span class="text-xs px-2 py-1 bg-slate-100 text-slate-600 rounded-full">${category}</span>
                </div>
                <p class="text-slate-600 text-sm mb-4 line-clamp-2">${description}</p>
                <div class="flex flex-wrap gap-1 mb-4">
                    ${tags.map(tag => `<span class="text-xs px-2 py-1 bg-primary/10 text-primary rounded-full">${tag}</span>`).join('')}
                </div>
                <div class="flex justify-between items-center text-xs text-slate-500 mb-4">
                    <span>${translations[currentLang].difficulty}: ${difficulty}</span>
                    <span>${translations[currentLang].playCount}: ${game.playCount}</span>
                    <span>${translations[currentLang].rating}: ⭐${game.rating}</span>
                </div>
                <button class="w-full bg-primary hover:bg-primary-dark text-white font-medium py-2 px-4 rounded-md transition-colors">
                    ${translations[currentLang].playGame}
                </button>
            </div>
        </div>
    `;
}

// 设置游戏卡片事件
function setupGameCardEvents() {
    const gameCards = document.querySelectorAll('.game-card');
    gameCards.forEach(card => {
        card.addEventListener('click', (e) => {
            if (e.target.tagName === 'BUTTON') {
                const gameId = card.dataset.gameId;
                playGame(gameId);
            }
        });
    });
}

// 播放游戏
function playGame(gameId) {
    const game = games.find(g => g.id == gameId);
    if (game) {
        // 跳转到游戏页面
        window.location.href = `game.html?id=${gameId}`;
    }
}

// 搜索处理
function handleSearch() {
    const query = searchInput.value.toLowerCase().trim();
    
    if (query === '') {
        filteredGames = [...games];
    } else {
        filteredGames = games.filter(game => {
            const title = currentLang === 'zh' ? game.title : game.title_en;
            const description = currentLang === 'zh' ? game.description : game.description_en;
            const category = currentLang === 'zh' ? game.category : game.category_en;
            const tags = currentLang === 'zh' ? game.tags : game.tags_en;
            const difficulty = currentLang === 'zh' ? game.difficulty : game.difficulty_en;
            
            // 搜索标题、描述、分类、标签和难度
            const titleMatch = title.toLowerCase().includes(query);
            const descMatch = description.toLowerCase().includes(query);
            const categoryMatch = category.toLowerCase().includes(query);
            const tagMatch = tags.some(tag => tag.toLowerCase().includes(query));
            const difficultyMatch = difficulty.toLowerCase().includes(query);
            
            return titleMatch || descMatch || categoryMatch || tagMatch || difficultyMatch;
        });
    }
    
    renderGames(filteredGames);
    hideNoResults();
    
    if (filteredGames.length === 0 && query !== '') {
        showNoResults();
    }
}

// 标签过滤处理
function handleTagFilter(clickedTag) {
    // 更新标签样式
    filterTags.forEach(tag => {
        tag.classList.remove('active');
        tag.classList.add('text-slate-600', 'border-slate-200', 'hover:border-primary');
        tag.classList.remove('text-primary', 'border-primary', 'bg-primary/5');
    });
    
    clickedTag.classList.add('active');
    clickedTag.classList.remove('text-slate-600', 'border-slate-200', 'hover:border-primary');
    clickedTag.classList.add('text-primary', 'border-primary', 'bg-primary/5');
    
    const tagValue = clickedTag.dataset.tag;
    
    if (tagValue === 'all') {
        filteredGames = [...games];
    } else {
        filteredGames = games.filter(game => {
            const category = currentLang === 'zh' ? game.category : game.category_en;
            const tags = currentLang === 'zh' ? game.tags : game.tags_en;
            
            // 检查分类匹配
            const categoryMatch = category.toLowerCase().includes(tagValue.toLowerCase());
            
            // 检查标签匹配
            const tagMatch = tags.some(tag => tag.toLowerCase().includes(tagValue.toLowerCase()));
            
            return categoryMatch || tagMatch;
        });
    }
    
    renderGames(filteredGames);
    hideNoResults();
    
    if (filteredGames.length === 0) {
        showNoResults();
    }
}

// 分类过滤处理
function handleCategoryFilter(category) {
    if (category === 'all') {
        filteredGames = [...games];
    } else {
        filteredGames = games.filter(game => {
            const gameCategory = currentLang === 'zh' ? game.category : game.category_en;
            return gameCategory === category;
        });
    }
    
    renderGames(filteredGames);
    
    // 重置标签过滤
    resetTagFilters();
}

// 重置标签过滤
function resetTagFilters() {
    filterTags.forEach(tag => {
        tag.classList.remove('active');
        tag.classList.add('text-slate-600', 'border-slate-200', 'hover:border-primary');
        tag.classList.remove('text-primary', 'border-primary', 'bg-primary/5');
    });
    
    // 激活"全部"标签
    const allTag = document.querySelector('[data-tag="all"]');
    if (allTag) {
        allTag.classList.add('active');
        allTag.classList.remove('text-slate-600', 'border-slate-200', 'hover:border-primary');
        allTag.classList.add('text-primary', 'border-primary', 'bg-primary/5');
    }
}

// 语言切换
function toggleLanguage() {
    currentLang = currentLang === 'zh' ? 'en' : 'zh';
    // 持久化语言到本地存储，供游戏页复用
    try { localStorage.setItem('language', currentLang); } catch (e) {}
    updateLanguage();
    renderGames(filteredGames);
}

// 新增：检测语言设置，默认英文
function detectLanguage() {
    // Always default to English on first load
    currentLang = 'en';
}

// 更新语言显示
function updateLanguage() {
    // 设置<html lang>
    document.documentElement.lang = currentLang === 'zh' ? 'zh' : 'en';
    // 更新按钮文本
    const langText = document.getElementById('langText');
    if (langText) {
        langText.textContent = currentLang === 'zh' ? 'EN' : '中文';
    }
    
    // 更新搜索框占位符
    searchInput.placeholder = translations[currentLang].searchPlaceholder;
    
    // 更新页面标题
    document.title = currentLang === 'zh' ? 'CurioMinds - 益智游戏站' : 'CurioMinds - Puzzle Game Hub';
    
    // 更新导航链接
    const navLinks = {
        'all': translations[currentLang].allGames,
        '逻辑推理': translations[currentLang].logic,
        '数学计算': translations[currentLang].math,
        '记忆训练': translations[currentLang].memory,
        '策略思维': translations[currentLang].strategy
    };
    
    categoryLinks.forEach(link => {
        const category = link.dataset.category;
        if (navLinks[category]) {
            link.textContent = navLinks[category];
        }
    });
    
    // 更新Hero区域
    const heroTitle = document.querySelector('main h2');
    const heroDesc = document.querySelector('main p');
    if (heroTitle && heroDesc) {
        heroTitle.textContent = currentLang === 'zh' ? '挑战你的大脑' : 'Challenge Your Brain';
        heroDesc.textContent = currentLang === 'zh' ? 
            '探索各种益智游戏，提升逻辑思维、数学能力和记忆力' : 
            'Explore various puzzle games to improve logical thinking, math skills and memory';
    }
    
    // 更新加载与无结果文案
    const loadingText = document.querySelector('#loading p');
    if (loadingText) loadingText.textContent = translations[currentLang].loading;
    const noResultsText = document.querySelector('#noResults p');
    if (noResultsText) noResultsText.textContent = translations[currentLang].noResults;
    
    // 更新标签
    const tagTexts = {
        'all': currentLang === 'zh' ? '全部' : 'All',
        '数字': currentLang === 'zh' ? '数字' : 'Numbers',
        '逻辑': currentLang === 'zh' ? '逻辑' : 'Logic',
        '记忆': currentLang === 'zh' ? '记忆' : 'Memory',
        '策略': currentLang === 'zh' ? '策略' : 'Strategy',
        '空间': currentLang === 'zh' ? '空间' : 'Spatial'
    };
    
    filterTags.forEach(tag => {
        const tagValue = tag.dataset.tag;
        if (tagTexts[tagValue]) {
            tag.textContent = tagTexts[tagValue];
        }
    });
    
    // 更新每日推荐标题和描述
    const dailyTitle = document.querySelector('section h3');
    const dailyDesc = document.querySelector('section h3 + p');
    if (dailyTitle && dailyDesc) {
        dailyTitle.textContent = translations[currentLang].dailyRecommended;
        dailyDesc.textContent = translations[currentLang].dailyRecommendedDesc;
    }
    
    // 重新渲染轮播内容
    if (carouselGames.length > 0) {
        renderCarousel();
        createCarouselDots();
    }
    
    // 重新生成分类标签
    generateDynamicTags();
}

// 显示/隐藏加载状态
function hideLoading() {
    loading.classList.add('hidden');
}

function showLoading() {
    loading.classList.remove('hidden');
}

// 显示/隐藏无结果状态
function showNoResults() {
    noResults.classList.remove('hidden');
    gamesGrid.innerHTML = '';
}

function hideNoResults() {
    noResults.classList.add('hidden');
}

// 初始化标签样式
function initTagStyles() {
    filterTags.forEach(tag => {
        if (tag.dataset.tag === 'all') {
            tag.classList.add('active', 'text-primary', 'border-primary', 'bg-primary/5');
        } else {
            tag.classList.add('text-slate-600', 'border-slate-200', 'hover:border-primary');
        }
    });
}

// 轮播功能函数
function initCarousel() {
    if (!carouselGames.length || !carouselTrack) return;
    
    renderCarousel();
    createCarouselDots();
    startAutoPlay();
    updateCarouselNavigation();
}

function renderCarousel() {
    if (!carouselTrack) return;
    
    carouselTrack.innerHTML = carouselGames.map(game => {
        const title = currentLang === 'zh' ? game.title : game.title_en;
        const description = currentLang === 'zh' ? game.description : game.description_en;
        const category = currentLang === 'zh' ? game.category : game.category_en;
        const difficulty = currentLang === 'zh' ? game.difficulty : game.difficulty_en;
        
        return `
            <div class="carousel-slide flex-shrink-0 w-full">
                <div class="flex flex-col md:flex-row items-center p-6 md:p-8">
                    <div class="w-full md:w-1/2 mb-6 md:mb-0 md:pr-8">
                        <div class="relative group cursor-pointer" onclick="playGame(${game.id})">
                            <img src="${game.thumbnail}" alt="${title}" 
                                 class="w-full h-48 md:h-64 object-cover rounded-lg shadow-md group-hover:shadow-xl transition-shadow duration-300"
                                 onerror="this.src='img/placeholder.jpg'">
                            <div class="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors duration-300 rounded-lg flex items-center justify-center">
                                <div class="bg-white/90 group-hover:bg-white text-primary rounded-full p-4 transform group-hover:scale-110 transition-all duration-300">
                                    <svg class="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M8 5v14l11-7z"/>
                                    </svg>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="w-full md:w-1/2 text-center md:text-left">
                        <div class="mb-3">
                            <span class="inline-block px-3 py-1 text-xs font-medium bg-primary/10 text-primary rounded-full">
                                ${category}
                            </span>
                            ${game.dailyRecommended ? `<span class="inline-block ml-2 px-3 py-1 text-xs font-medium bg-orange-100 text-orange-600 rounded-full">${translations[currentLang].dailyRecommended}</span>` : ''}
                        </div>
                        <h4 class="text-2xl md:text-3xl font-bold text-slate-800 mb-3">${title}</h4>
                        <p class="text-slate-600 mb-4 leading-relaxed">${description}</p>
                        <div class="flex flex-wrap items-center justify-center md:justify-start gap-4 mb-6">
                            <div class="flex items-center text-sm text-slate-500">
                                <span class="font-medium">${translations[currentLang].difficulty}:</span>
                                <span class="ml-1">${difficulty}</span>
                            </div>
                            <div class="flex items-center text-sm text-slate-500">
                                <span class="font-medium">${translations[currentLang].rating}:</span>
                                <div class="flex items-center ml-1">
                                    <span class="text-yellow-500">★</span>
                                    <span class="ml-1">${game.rating}</span>
                                </div>
                            </div>
                            <div class="flex items-center text-sm text-slate-500">
                                <span class="font-medium">${translations[currentLang].playCount}:</span>
                                <span class="ml-1">${game.playCount}</span>
                            </div>
                        </div>
                        <button onclick="playGame(${game.id})" 
                                class="bg-primary hover:bg-primary-dark text-white px-6 py-3 rounded-lg font-medium transition-colors duration-200 transform hover:scale-105">
                            ${translations[currentLang].playGame}
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function createCarouselDots() {
    if (!carouselDots || !carouselGames.length) return;
    
    carouselDots.innerHTML = carouselGames.map((_, index) => 
        `<button class="carousel-dot w-3 h-3 rounded-full transition-all duration-200 ${
            index === currentSlide ? 'bg-primary' : 'bg-slate-300 hover:bg-slate-400'
        }" data-slide="${index}"></button>`
    ).join('');
    
    // 添加点击事件
    const dots = carouselDots.querySelectorAll('.carousel-dot');
    dots.forEach((dot, index) => {
        dot.addEventListener('click', () => {
            pauseCarousel();
            goToSlide(index);
            setTimeout(() => resumeCarousel(), 2000); // 2秒后恢复自动播放
        });
    });
}

function goToSlide(slideIndex) {
    if (!carouselGames.length) return;
    
    // 循环处理
    if (slideIndex >= carouselGames.length) {
        currentSlide = 0;
    } else if (slideIndex < 0) {
        currentSlide = carouselGames.length - 1;
    } else {
        currentSlide = slideIndex;
    }
    
    updateCarouselPosition();
    updateCarouselDots();
    updateCarouselNavigation();
}

function updateCarouselPosition() {
    if (!carouselTrack) return;
    
    const translateX = -currentSlide * 100;
    carouselTrack.style.transform = `translateX(${translateX}%)`;
    
    // 添加平滑过渡效果
    carouselTrack.style.transition = 'transform 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
}

function updateCarouselDots() {
    if (!carouselDots) return;
    
    const dots = carouselDots.querySelectorAll('.carousel-dot');
    dots.forEach((dot, index) => {
        if (index === currentSlide) {
            dot.className = 'carousel-dot w-3 h-3 rounded-full transition-all duration-200 bg-primary';
        } else {
            dot.className = 'carousel-dot w-3 h-3 rounded-full transition-all duration-200 bg-slate-300 hover:bg-slate-400';
        }
    });
}

function updateCarouselNavigation() {
    // 显示/隐藏导航按钮
    const carouselContainer = document.querySelector('.carousel-container');
    if (carouselContainer && carouselGames.length > 1) {
        carouselContainer.parentElement.classList.add('group');
    }
}

function startAutoPlay() {
    if (carouselGames.length <= 1) return;
    
    // 清除现有定时器
    if (carouselInterval) {
        clearInterval(carouselInterval);
    }
    
    carouselInterval = setInterval(() => {
        if (isCarouselPlaying) {
            goToSlide(currentSlide + 1);
        }
    }, 4000); // 4秒自动切换，更快一些
}

function pauseCarousel() {
    isCarouselPlaying = false;
}

function resumeCarousel() {
    isCarouselPlaying = true;
}

function stopCarousel() {
    if (carouselInterval) {
        clearInterval(carouselInterval);
        carouselInterval = null;
    }
}

// 触摸事件处理
function handleTouchStart(e) {
    touchStartX = e.touches[0].clientX;
}

function handleTouchEnd(e) {
    touchEndX = e.changedTouches[0].clientX;
    handleSwipe();
}

function handleSwipe() {
    const swipeThreshold = 50;
    const diff = touchStartX - touchEndX;
    
    if (Math.abs(diff) > swipeThreshold) {
        if (diff > 0) {
            // 向左滑动，下一张
            goToSlide(currentSlide + 1);
        } else {
            // 向右滑动，上一张
            goToSlide(currentSlide - 1);
        }
    }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    // 先检测语言并应用，确保默认英文显示
    detectLanguage();
    updateLanguage();
    
    initTagStyles();
    initApp();
});

// 添加CSS样式（用于文本截断）
const style = document.createElement('style');
style.textContent = `
    .line-clamp-2 {
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
    }
`;