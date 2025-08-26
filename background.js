// background.js - Service Worker for Chrome Extension

// 插件安装或启动时的初始化
chrome.runtime.onInstalled.addListener(() => {
  // 设置默认实时坐标显示为关闭状态
  chrome.storage.local.get(['coordinateDisplayEnabled'], (result) => {
    if (result.coordinateDisplayEnabled === undefined) {
      // 首次安装，设置为关闭状态
      chrome.storage.local.set({ coordinateDisplayEnabled: false });
    }
  });
});

// 监听来自content script的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // 在Manifest V3中，Service Worker无法直接访问clipboard API
  // 所有复制操作都在content script中处理
  if (request.action === "log") {
    console.log(request.message);
    sendResponse({ success: true });
  }
  
  return true;
});

// 处理插件图标点击事件（可选）
chrome.action.onClicked.addListener((tab) => {
  // 可以在这里添加额外的功能
  console.log("插件图标被点击");
});