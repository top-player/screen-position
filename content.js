// content.js - Content Script for Coordinate Detection

// 检查页面环境是否适合运行插件
function isValidEnvironment() {
  // 检查是否在禁止的页面上
  const forbiddenUrls = [
    'chrome://',
    'chrome-extension://',
    'moz-extension://',
    'edge://',
    'about:',
    'data:',
    'javascript:'
  ];
  
  const currentUrl = window.location.href;
  const isForbidden = forbiddenUrls.some(url => currentUrl.startsWith(url));
  
  if (isForbidden) {
    console.log('坐标插件: 当前页面不支持插件运行');
    return false;
  }
  
  // 检查基本 DOM 环境
  if (!document || !document.body) {
    console.log('坐标插件: DOM 环境未准备就绪');
    return false;
  }
  
  return true;
}

// 检查扩展权限是否可用
function checkExtensionPermissions() {
  try {
    // 检查基本的 chrome API 是否可用
    if (typeof chrome === 'undefined') {
      console.warn('坐标插件: Chrome API 不可用');
      return false;
    }
    
    // 检查 storage 权限
    if (!chrome.storage || !chrome.storage.local) {
      console.warn('坐标插件: Storage 权限不可用');
      return false;
    }
    
    // 检查 runtime 是否可用
    if (!chrome.runtime) {
      console.warn('坐标插件: Runtime API 不可用');
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('坐标插件: 权限检查失败:', error);
    return false;
  }
}

// 初始化检查
if (!isValidEnvironment()) {
  console.log('坐标插件: 环境检查失败，插件将不会加载');
  // 早期退出，不加载插件功能
} else if (!checkExtensionPermissions()) {
  console.log('坐标插件: 权限检查失败，使用限制模式');
  // 继续加载，但使用限制功能
} else {
  console.log('坐标插件: 环境和权限检查通过');
}

// 统一的位置保存函数，处理所有存储错误
function savePosition(position, context = 'position') {
  // 首先检查环境是否适合
  if (!isValidEnvironment()) {
    console.log(`坐标插件: 环境不适合，跳过保存 ${context}`);
    return;
  }
  
  // 检查 Chrome 扩展上下文是否有效
  const isExtensionContextValid = () => {
    try {
      return chrome && chrome.storage && chrome.storage.local && !chrome.runtime.lastError;
    } catch (e) {
      return false;
    }
  };
  
  // 尝试使用 Chrome Storage
  if (isExtensionContextValid()) {
    try {
      chrome.storage.local.set({ displayPosition: position }, () => {
        if (chrome.runtime.lastError) {
          console.warn(`Chrome storage failed for ${context}:`, chrome.runtime.lastError.message);
          // 降级到 localStorage
          fallbackToLocalStorage(position, context);
        } else {
          console.log(`Position saved to Chrome storage: ${context}`);
        }
      });
    } catch (error) {
      console.warn(`Chrome storage error for ${context}:`, error.message || error);
      fallbackToLocalStorage(position, context);
    }
  } else {
    console.warn(`Extension context invalid for ${context}, using localStorage`);
    fallbackToLocalStorage(position, context);
  }
}

// 降级到 localStorage
function fallbackToLocalStorage(position, context) {
  try {
    const positionData = {
      position: position,
      timestamp: Date.now(),
      context: context
    };
    localStorage.setItem('coordinateDisplayPosition', JSON.stringify(positionData));
    console.log(`Position saved to localStorage: ${context}`);
  } catch (localStorageError) {
    console.error(`All storage methods failed for ${context}:`, localStorageError);
    // 即使所有存储都失败，插件仍然可以正常工作，只是不能保存状态
  }
}

// 统一的位置加载函数
function loadPosition(callback) {
  const isExtensionContextValid = () => {
    try {
      return chrome && chrome.storage && chrome.storage.local;
    } catch (e) {
      return false;
    }
  };
  
  if (isExtensionContextValid()) {
    try {
      chrome.storage.local.get(['displayPosition'], (result) => {
        if (chrome.runtime.lastError) {
          console.warn('Chrome storage load failed:', chrome.runtime.lastError);
          loadFromLocalStorage(callback);
        } else {
          const position = result.displayPosition || getDefaultPosition();
          callback(position);
        }
      });
    } catch (error) {
      console.warn('Chrome storage load error:', error);
      loadFromLocalStorage(callback);
    }
  } else {
    console.warn('Extension context invalid, loading from localStorage');
    loadFromLocalStorage(callback);
  }
}

// 从 localStorage 加载位置
function loadFromLocalStorage(callback) {
  try {
    const savedData = localStorage.getItem('coordinateDisplayPosition');
    if (savedData) {
      const parsedData = JSON.parse(savedData);
      // 兼容旧格式
      const position = parsedData.position || parsedData;
      callback(position);
    } else {
      callback(getDefaultPosition());
    }
  } catch (error) {
    console.warn('localStorage load failed:', error);
    callback(getDefaultPosition());
  }
}

// 获取默认位置
function getDefaultPosition() {
  return {
    top: 10,
    left: Math.max(10, window.innerWidth - 160)
  };
}

// 全局变量存储最后一次鼠标位置
let lastMousePosition = { x: 0, y: 0 };
let coordinateDisplay = null;
let isCoordinateDisplayEnabled = false;
let currentResolution = '1920x1080'; // 默认分辨率

// 拖动相关变量
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let initialDisplayX = 0;
let initialDisplayY = 0;
let dragTimeout = null;
let clickCount = 0;

// 默认分辨率设置（服务器默认分辨率）
const SERVER_RESOLUTION = { width: 1920, height: 1080 };

// 分辨率配置
const RESOLUTIONS = {
  '1920x1080': { width: 1920, height: 1080, name: '1080p' },
  '2560x1440': { width: 2560, height: 1440, name: '2K' },
  '3840x2160': { width: 3840, height: 2160, name: '4K' }
};

// 计算从当前分辨率转换到1080p服务器分辨率的坐标
function calculateScaledCoordinates(originalX, originalY, currentResolution) {
  const resolution = RESOLUTIONS[currentResolution];
  if (!resolution) return { x: originalX, y: originalY };
  
  // 从当前分辨率转换到1080p服务器分辨率
  const scaleX = SERVER_RESOLUTION.width / resolution.width;
  const scaleY = SERVER_RESOLUTION.height / resolution.height;
  
  return {
    x: Math.round(originalX * scaleX),
    y: Math.round(originalY * scaleY),
    original: { x: originalX, y: originalY },
    scale: { x: scaleX, y: scaleY },
    resolution: resolution
  };
}

// 创建实时坐标显示器
function createCoordinateDisplay() {
  if (coordinateDisplay) return;
  
  coordinateDisplay = document.createElement('div');
  coordinateDisplay.id = 'coordinate-realtime-display';
  // 使用统一的位置加载函数
  loadPosition((savedPosition) => {
    applyDisplayStyles(savedPosition);
  });

  function applyDisplayStyles(position) {
    // 确保位置在屏幕范围内
    const safeTop = Math.max(10, Math.min(position.top, window.innerHeight - 100));
    const safeLeft = Math.max(10, Math.min(position.left, window.innerWidth - 160));
    
    coordinateDisplay.style.cssText = `
      position: fixed !important;
      top: ${safeTop}px !important;
      left: ${safeLeft}px !important;
      background: rgba(0, 0, 0, 0.85) !important;
      color: white !important;
      padding: 8px 12px !important;
      border-radius: 6px !important;
      font-size: 14px !important;
      font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace !important;
      z-index: 2147483647 !important;
      pointer-events: auto !important;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3) !important;
      border: 1px solid rgba(255, 255, 255, 0.2) !important;
      backdrop-filter: blur(8px) !important;
      user-select: none !important;
      line-height: 1.4 !important;
      min-width: 140px !important;
      text-align: center !important;
      cursor: move !important;
      transition: opacity 0.3s ease, transform 0.2s ease !important;
    `;
  }
  
  coordinateDisplay.innerHTML = `
    <div style="font-weight: bold; margin-bottom: 4px; cursor: move;">🎯 视窗坐标</div>
    <div id="realtime-coords" style="font-size: 14px; color: #4CAF50; margin-bottom: 2px;">X: 0, Y: 0</div>
    <div id="resolution-info" style="font-size: 10px; color: #FFC107; opacity: 0.9;">1080p (原始)</div>
  `;
  
  // 添加拖动事件监听器
  addDragListeners(coordinateDisplay);
  
  // 添加鼠标悬停效果
  coordinateDisplay.addEventListener('mouseenter', () => {
    coordinateDisplay.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.4)';
    coordinateDisplay.style.transform = 'scale(1.02)';
  });
  
  coordinateDisplay.addEventListener('mouseleave', () => {
    if (!isDragging) {
      coordinateDisplay.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)';
      coordinateDisplay.style.transform = 'scale(1)';
    }
  });
  
  // 双击重置到默认位置
  coordinateDisplay.addEventListener('dblclick', (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    // 取消任何进行中的拖动
    isDragging = false;
    if (dragTimeout) {
      clearTimeout(dragTimeout);
      dragTimeout = null;
    }
    
    // 重置透明度
    coordinateDisplay.style.opacity = '1';
    
    // 计算默认位置，确保不会超出屏幕范围
    const defaultTop = 10;
    const defaultLeft = Math.max(10, window.innerWidth - 160);
    const defaultPosition = { top: defaultTop, left: defaultLeft };
    
    coordinateDisplay.style.top = defaultPosition.top + 'px';
    coordinateDisplay.style.left = defaultPosition.left + 'px';
    
    // 显示重置反馈
    coordinateDisplay.style.transform = 'scale(1.1)';
    setTimeout(() => {
      coordinateDisplay.style.transform = 'scale(1)';
    }, 200);
    
    // 保存位置，使用多层错误处理
    savePosition(defaultPosition, 'default reset');
  });
  
  // 添加单击计数器来检测双击
  coordinateDisplay.addEventListener('mousedown', (e) => {
    clickCount++;
    setTimeout(() => {
      clickCount = 0; // 300ms后重置点击计数
    }, 300);
  });
  
  document.body.appendChild(coordinateDisplay);
  isCoordinateDisplayEnabled = true;
}

// 移除实时坐标显示器
function removeCoordinateDisplay() {
  if (coordinateDisplay && coordinateDisplay.parentNode) {
    coordinateDisplay.parentNode.removeChild(coordinateDisplay);
    coordinateDisplay = null;
    isCoordinateDisplayEnabled = false;
  }
}

// 添加拖动事件监听器
function addDragListeners(element) {
  element.addEventListener('mousedown', startDrag);
  document.addEventListener('mousemove', drag);
  document.addEventListener('mouseup', endDrag);
  
  // 添加触摸事件支持（移动设备）
  element.addEventListener('touchstart', startDragTouch);
  document.addEventListener('touchmove', dragTouch);
  document.addEventListener('touchend', endDrag);
}

// 开始拖动（鼠标）
function startDrag(e) {
  // 清除之前的拖动延时
  if (dragTimeout) {
    clearTimeout(dragTimeout);
    dragTimeout = null;
  }
  
  // 延迟启动拖动，避免与双击冲突
  dragTimeout = setTimeout(() => {
    if (clickCount < 2) { // 只有在不是双击的情况下才开始拖动
      isDragging = true;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      
      const rect = coordinateDisplay.getBoundingClientRect();
      initialDisplayX = rect.left;
      initialDisplayY = rect.top;
      
      coordinateDisplay.style.opacity = '0.8';
    }
  }, 200); // 200ms延迟，给双击检测留时间
  
  e.preventDefault();
}

// 开始拖动（触摸）
function startDragTouch(e) {
  // 清除之前的拖动延时
  if (dragTimeout) {
    clearTimeout(dragTimeout);
    dragTimeout = null;
  }
  
  // 延迟启动拖动，避免与双击冲突
  dragTimeout = setTimeout(() => {
    if (clickCount < 2) { // 只有在不是双击的情况下才开始拖动
      isDragging = true;
      const touch = e.touches[0];
      dragStartX = touch.clientX;
      dragStartY = touch.clientY;
      
      const rect = coordinateDisplay.getBoundingClientRect();
      initialDisplayX = rect.left;
      initialDisplayY = rect.top;
      
      coordinateDisplay.style.opacity = '0.8';
    }
  }, 200);
  
  e.preventDefault();
}

// 拖动中（鼠标）
function drag(e) {
  if (!isDragging || !coordinateDisplay) return;
  
  const deltaX = e.clientX - dragStartX;
  const deltaY = e.clientY - dragStartY;
  
  let newLeft = initialDisplayX + deltaX;
  let newTop = initialDisplayY + deltaY;
  
  // 边界限制
  const displayRect = coordinateDisplay.getBoundingClientRect();
  const maxLeft = window.innerWidth - displayRect.width;
  const maxTop = window.innerHeight - displayRect.height;
  
  newLeft = Math.max(0, Math.min(newLeft, maxLeft));
  newTop = Math.max(0, Math.min(newTop, maxTop));
  
  coordinateDisplay.style.left = newLeft + 'px';
  coordinateDisplay.style.top = newTop + 'px';
}

// 拖动中（触摸）
function dragTouch(e) {
  if (!isDragging || !coordinateDisplay) return;
  
  const touch = e.touches[0];
  const deltaX = touch.clientX - dragStartX;
  const deltaY = touch.clientY - dragStartY;
  
  let newLeft = initialDisplayX + deltaX;
  let newTop = initialDisplayY + deltaY;
  
  // 边界限制
  const displayRect = coordinateDisplay.getBoundingClientRect();
  const maxLeft = window.innerWidth - displayRect.width;
  const maxTop = window.innerHeight - displayRect.height;
  
  newLeft = Math.max(0, Math.min(newLeft, maxLeft));
  newTop = Math.max(0, Math.min(newTop, maxTop));
  
  coordinateDisplay.style.left = newLeft + 'px';
  coordinateDisplay.style.top = newTop + 'px';
  
  e.preventDefault();
}

// 结束拖动
function endDrag(e) {
  // 清除拖动延时
  if (dragTimeout) {
    clearTimeout(dragTimeout);
    dragTimeout = null;
  }
  
  if (!isDragging) return;
  
  isDragging = false;
  
  if (coordinateDisplay) {
    coordinateDisplay.style.opacity = '1';
    
    // 保存当前位置到存储中
    const rect = coordinateDisplay.getBoundingClientRect();
    const position = {
      top: rect.top,
      left: rect.left
    };
    
    savePosition(position, 'drag end');
  }
}

// 监听窗口大小变化，调整显示器位置
window.addEventListener('resize', () => {
  if (!coordinateDisplay) return;
  
  const rect = coordinateDisplay.getBoundingClientRect();
  const maxLeft = window.innerWidth - rect.width;
  const maxTop = window.innerHeight - rect.height;
  
  let newLeft = Math.max(0, Math.min(rect.left, maxLeft));
  let newTop = Math.max(0, Math.min(rect.top, maxTop));
  
  if (newLeft !== rect.left || newTop !== rect.top) {
    coordinateDisplay.style.left = newLeft + 'px';
    coordinateDisplay.style.top = newTop + 'px';
    
    // 保存调整后的位置
    savePosition({ top: newTop, left: newLeft }, 'window resize');
  }
});

// 更新坐标显示
function updateCoordinateDisplay(x, y) {
  if (coordinateDisplay) {
    const coordsElement = coordinateDisplay.querySelector('#realtime-coords');
    const resolutionInfoElement = coordinateDisplay.querySelector('#resolution-info');
    
    if (coordsElement && resolutionInfoElement) {
      // 计算转换后的坐标
      const scaled = calculateScaledCoordinates(x, y, currentResolution);
      
      if (currentResolution === '1920x1080') {
        // 1080p分辨率，不需转换
        coordsElement.textContent = `X: ${x}, Y: ${y}`;
        resolutionInfoElement.textContent = `${scaled.resolution.name} (无需转换)`;
      } else {
        // 显示转换到1080p服务器的坐标
        coordsElement.textContent = `X: ${scaled.x}, Y: ${scaled.y}`;
        resolutionInfoElement.textContent = `${scaled.resolution.name}→1080p (实际: ${x}, ${y})`;
      }
    }
  }
}

// 统一的显示状态保存函数
function saveDisplayState(enabled, context = 'display state') {
  const isExtensionContextValid = () => {
    try {
      return chrome && chrome.storage && chrome.storage.local;
    } catch (e) {
      return false;
    }
  };
  
  if (isExtensionContextValid()) {
    try {
      chrome.storage.local.set({ coordinateDisplayEnabled: enabled }, () => {
        if (chrome.runtime.lastError) {
          console.warn(`Chrome storage failed for ${context}:`, chrome.runtime.lastError);
          try {
            localStorage.setItem('coordinateDisplayEnabled', enabled.toString());
          } catch (localStorageError) {
            console.warn('Failed to save display state to localStorage:', localStorageError);
          }
        }
      });
    } catch (error) {
      console.warn(`Chrome storage error for ${context}:`, error);
      try {
        localStorage.setItem('coordinateDisplayEnabled', enabled.toString());
      } catch (localStorageError) {
        console.warn('Failed to save display state to localStorage:', localStorageError);
      }
    }
  } else {
    try {
      localStorage.setItem('coordinateDisplayEnabled', enabled.toString());
    } catch (localStorageError) {
      console.warn('Failed to save display state to localStorage:', localStorageError);
    }
  }
}

// 统一的分辨率保存函数
function saveResolution(resolution, context = 'resolution') {
  const isExtensionContextValid = () => {
    try {
      return chrome && chrome.storage && chrome.storage.local;
    } catch (e) {
      return false;
    }
  };
  
  if (isExtensionContextValid()) {
    try {
      chrome.storage.local.set({ selectedResolution: resolution }, () => {
        if (chrome.runtime.lastError) {
          console.warn(`Chrome storage failed for ${context}:`, chrome.runtime.lastError);
          try {
            localStorage.setItem('selectedResolution', resolution);
          } catch (localStorageError) {
            console.warn('Failed to save resolution to localStorage:', localStorageError);
          }
        }
      });
    } catch (error) {
      console.warn(`Chrome storage error for ${context}:`, error);
      try {
        localStorage.setItem('selectedResolution', resolution);
      } catch (localStorageError) {
        console.warn('Failed to save resolution to localStorage:', localStorageError);
      }
    }
  } else {
    try {
      localStorage.setItem('selectedResolution', resolution);
    } catch (localStorageError) {
      console.warn('Failed to save resolution to localStorage:', localStorageError);
    }
  }
}


// 切换坐标显示器
function toggleCoordinateDisplay() {
  if (isCoordinateDisplayEnabled) {
    removeCoordinateDisplay();
    // 保存关闭状态到全局存储
    saveDisplayState(false, 'toggle off');
  } else {
    createCoordinateDisplay();
    // 保存开启状态到全局存储
    saveDisplayState(true, 'toggle on');
  }
  return isCoordinateDisplayEnabled;
}

// 监听鼠标移动事件，实时更新坐标
document.addEventListener('mousemove', (event) => {
  // 如果正在拖动坐标显示器，则不更新坐标
  if (isDragging) return;
  
  // 使用clientX和clientY获取视窗坐标（不包含滚动距离）
  lastMousePosition.x = event.clientX;
  lastMousePosition.y = event.clientY;
  
  // 更新实时坐标显示
  if (isCoordinateDisplayEnabled) {
    updateCoordinateDisplay(lastMousePosition.x, lastMousePosition.y);
  }
});

// 监听来自background script的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // 处理切换实时坐标显示的请求
  if (request.action === "toggleCoordinateDisplay") {
    const isEnabled = toggleCoordinateDisplay();
    sendResponse({ success: true, displayEnabled: isEnabled });
  }
  
  // 处理获取坐标显示状态的请求
  else if (request.action === "getCoordinateDisplayStatus") {
    // 从存储中获取真实状态
    chrome.storage.local.get(['coordinateDisplayEnabled'], (result) => {
      const actualStatus = result.coordinateDisplayEnabled === true;
      sendResponse({ success: true, displayEnabled: actualStatus });
    });
    return true; // 表示将异步发送响应
  }
  
  // 处理分辨率更新的请求
  else if (request.action === "updateResolution") {
    currentResolution = request.resolution;
    // 保存到存储中
    saveResolution(currentResolution, 'update resolution');
    // 立即更新坐标显示
    if (isCoordinateDisplayEnabled) {
      updateCoordinateDisplay(lastMousePosition.x, lastMousePosition.y);
    }
    sendResponse({ success: true });
  }
});

console.log("坐标获取插件已加载完成");

// 页面加载完成后检查存储的设置
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
      loadCoordinateDisplaySetting();
    }, 500); // 延迟500ms确保页面完全加载
  });
} else {
  // 如果页面已经加载完成，直接检查设置
  setTimeout(() => {
    loadCoordinateDisplaySetting();
  }, 500);
}

// 从存储中加载坐标显示设置
function loadCoordinateDisplaySetting() {
  try {
    chrome.storage.local.get(['coordinateDisplayEnabled', 'selectedResolution'], (result) => {
      // 加载分辨率设置
      currentResolution = result.selectedResolution || '1920x1080';
      
      // 加载显示设置
      if (result.coordinateDisplayEnabled === true) {
        createCoordinateDisplay();
      }
    });
  } catch (error) {
    console.warn('Failed to load settings from chrome storage, trying localStorage:', error);
    // 使用 localStorage 作为备选
    try {
      const displayEnabled = localStorage.getItem('coordinateDisplayEnabled') === 'true';
      const selectedResolution = localStorage.getItem('selectedResolution') || '1920x1080';
      
      currentResolution = selectedResolution;
      
      if (displayEnabled) {
        createCoordinateDisplay();
      }
    } catch (localStorageError) {
      console.warn('Failed to load settings from localStorage:', localStorageError);
      // 使用默认设置
      currentResolution = '1920x1080';
    }
  }
}