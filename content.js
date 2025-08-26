// content.js - Content Script for Coordinate Detection

// 全局变量存储最后一次鼠标位置
let lastMousePosition = { x: 0, y: 0 };
let coordinateDisplay = null;
let isCoordinateDisplayEnabled = false;
let currentResolution = '1920x1080'; // 默认分辨率

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
  coordinateDisplay.style.cssText = `
    position: fixed !important;
    top: 10px !important;
    right: 10px !important;
    background: rgba(0, 0, 0, 0.85) !important;
    color: white !important;
    padding: 8px 12px !important;
    border-radius: 6px !important;
    font-size: 14px !important;
    font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace !important;
    z-index: 2147483647 !important;
    pointer-events: none !important;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3) !important;
    border: 1px solid rgba(255, 255, 255, 0.2) !important;
    backdrop-filter: blur(8px) !important;
    user-select: none !important;
    line-height: 1.4 !important;
    min-width: 140px !important;
    text-align: center !important;
  `;
  
  coordinateDisplay.innerHTML = `
    <div style="font-weight: bold; margin-bottom: 4px;">🎯 坐标跟踪</div>
    <div id="realtime-coords" style="font-size: 14px; color: #4CAF50; margin-bottom: 2px;">X: 0, Y: 0</div>
    <div id="resolution-info" style="font-size: 10px; color: #FFC107; opacity: 0.9;">1080p (原始)</div>
  `;
  
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

// 切换坐标显示器
function toggleCoordinateDisplay() {
  if (isCoordinateDisplayEnabled) {
    removeCoordinateDisplay();
    // 保存关闭状态到全局存储
    chrome.storage.local.set({ coordinateDisplayEnabled: false });
  } else {
    createCoordinateDisplay();
    // 保存开启状态到全局存储
    chrome.storage.local.set({ coordinateDisplayEnabled: true });
  }
  return isCoordinateDisplayEnabled;
}

// 监听鼠标移动事件，实时更新坐标
document.addEventListener('mousemove', (event) => {
  lastMousePosition.x = event.pageX;
  lastMousePosition.y = event.pageY;
  
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
    chrome.storage.local.set({ selectedResolution: currentResolution });
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
  chrome.storage.local.get(['coordinateDisplayEnabled', 'selectedResolution'], (result) => {
    // 加载分辨率设置
    currentResolution = result.selectedResolution || '1920x1080';
    
    // 加载显示设置
    if (result.coordinateDisplayEnabled === true) {
      createCoordinateDisplay();
    }
  });
}