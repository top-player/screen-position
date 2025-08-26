// popup.js - Popup界面逻辑处理

document.addEventListener('DOMContentLoaded', function() {
    const toggleCoordinateDisplayBtn = document.getElementById('toggleCoordinateDisplay');
    const resolutionSelect = document.getElementById('resolutionSelect');
    const resolutionInfo = document.getElementById('resolutionInfo');
    const statusDiv = document.getElementById('status');
    
    // 默认分辨率设置（服务器默认分辨率）
    const SERVER_RESOLUTION = { width: 1920, height: 1080 };
    
    // 分辨率配置
    const RESOLUTIONS = {
        '1920x1080': { width: 1920, height: 1080, name: '1080p' },
        '2560x1440': { width: 2560, height: 1440, name: '2K' },
        '3840x2160': { width: 3840, height: 2160, name: '4K' }
    };
    
    // 显示状态消息
    function showStatus(message, type = 'success') {
        statusDiv.textContent = message;
        statusDiv.className = `status ${type}`;
        statusDiv.style.display = 'block';
        
        setTimeout(() => {
            statusDiv.style.display = 'none';
        }, 3000);
    }
    
    // 获取当前标签页
    function getCurrentTab() {
        return new Promise((resolve) => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                resolve(tabs[0]);
            });
        });
    }
    
    // 计算从当前分辨率转换到1080p服务器分辨率的坐标
    function calculateScaledCoordinates(originalX, originalY, currentResolution) {
        const scaleX = SERVER_RESOLUTION.width / currentResolution.width;
        const scaleY = SERVER_RESOLUTION.height / currentResolution.height;
        
        return {
            x: Math.round(originalX * scaleX),
            y: Math.round(originalY * scaleY),
            scaleX: scaleX,
            scaleY: scaleY
        };
    }
    
    // 更新分辨率信息显示
    function updateResolutionInfo() {
        const selectedResolution = resolutionSelect.value;
        const resolution = RESOLUTIONS[selectedResolution];
        
        if (selectedResolution === '1920x1080') {
            resolutionInfo.innerHTML = `
                当前屏幕分辨率：${SERVER_RESOLUTION.width}x${SERVER_RESOLUTION.height}，无需转换
            `;
        } else {
            const scaleX = (SERVER_RESOLUTION.width / resolution.width).toFixed(2);
            const scaleY = (SERVER_RESOLUTION.height / resolution.height).toFixed(2);
            resolutionInfo.innerHTML = `
                当前屏幕分辨率：${resolution.width}x${resolution.height} (${resolution.name})<br>
                转换到1080p服务器：缩放比例 ${scaleX}x (${resolution.width}→1920, ${resolution.height}→1080)
            `;
        }
    }
    
    // 切换实时坐标显示
    toggleCoordinateDisplayBtn.addEventListener('click', async function() {
        try {
            const tab = await getCurrentTab();
            
            chrome.tabs.sendMessage(tab.id, {
                action: "toggleCoordinateDisplay"
            }, (response) => {
                if (chrome.runtime.lastError) {
                    showStatus('无法连接到页面，请刷新页面后重试', 'error');
                    return;
                }
                
                if (response && response.success) {
                    const isEnabled = response.displayEnabled;
                    toggleCoordinateDisplayBtn.textContent = isEnabled ? '关闭实时坐标显示' : '开启实时坐标显示';
                    showStatus(isEnabled ? '实时坐标显示已开启' : '实时坐标显示已关闭');
                } else {
                    showStatus('切换坐标显示失败', 'error');
                }
            });
        } catch (error) {
            console.error('切换坐标显示失败:', error);
            showStatus('切换坐标显示失败', 'error');
        }
    });
    
    // 页面加载时检查坐标显示状态
    async function checkDisplayStatus() {
        try {
            const tab = await getCurrentTab();
            
            chrome.tabs.sendMessage(tab.id, {
                action: "getCoordinateDisplayStatus"
            }, (response) => {
                if (chrome.runtime.lastError) {
                    // 如果连接失败，显示默认状态
                    toggleCoordinateDisplayBtn.textContent = '开启实时坐标显示';
                    return;
                }
                if (response && response.success) {
                    const isEnabled = response.displayEnabled;
                    toggleCoordinateDisplayBtn.textContent = isEnabled ? '关闭实时坐标显示' : '开启实时坐标显示';
                } else {
                    toggleCoordinateDisplayBtn.textContent = '开启实时坐标显示';
                }
            });
        } catch (error) {
            console.error('检查显示状态失败:', error);
            toggleCoordinateDisplayBtn.textContent = '开启实时坐标显示';
        }
    }
    
    // 初始化时检查状态
    checkDisplayStatus();
    
    // 分辨率选择事件监听
    resolutionSelect.addEventListener('change', async function() {
        const selectedResolution = resolutionSelect.value;
        
        // 保存用户选择的分辨率
        chrome.storage.local.set({ selectedResolution: selectedResolution });
        
        // 更新分辨率信息显示
        updateResolutionInfo();
        
        // 通知content script更新分辨率
        try {
            const tab = await getCurrentTab();
            chrome.tabs.sendMessage(tab.id, {
                action: "updateResolution",
                resolution: selectedResolution
            });
        } catch (error) {
            console.error('通知分辨率更新失败:', error);
        }
    });
    
    // 初始化分辨率设置
    chrome.storage.local.get(['selectedResolution'], (result) => {
        const savedResolution = result.selectedResolution || '1920x1080';
        resolutionSelect.value = savedResolution;
        updateResolutionInfo();
    });
});