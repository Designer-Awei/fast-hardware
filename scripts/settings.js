/**
 * Fast Hardware - 设置页面脚本
 * 处理设置页面的所有交互功能
 */

class SettingsManager {
    constructor() {
        this.init();
    }

    /**
     * 初始化设置页面
     */
    init() {
        this.bindEvents();
        this.loadSettings();
    }

    /**
     * 绑定事件监听器
     */
    bindEvents() {

        // 联系作者按钮
        const contactAuthorBtn = document.getElementById('contact-author');
        if (contactAuthorBtn) {
            contactAuthorBtn.addEventListener('click', () => {
                this.openAuthorWebsite();
            });
        }

        // 更改存储路径按钮
        const changeStorageBtn = document.getElementById('change-storage-path');
        if (changeStorageBtn) {
            changeStorageBtn.addEventListener('click', () => {
                this.changeStoragePath();
            });
        }

        // 更改元件库路径按钮
        const changeComponentLibBtn = document.getElementById('change-component-lib-path');
        if (changeComponentLibBtn) {
            changeComponentLibBtn.addEventListener('click', () => {
                this.changeComponentLibPath();
            });
        }

        // 配置API密钥按钮
        const configureApiBtn = document.getElementById('configure-api-key');
        if (configureApiBtn) {
            configureApiBtn.addEventListener('click', () => {
                this.configureApiKey();
            });
        }
    }

    /**
     * 加载设置数据
     */
    loadSettings() {
        // 加载存储路径设置
        this.loadStoragePath();

        // 加载元件库路径设置
        this.loadComponentLibPath();

        // 加载API密钥状态
        this.loadApiKeyStatus();
    }


    /**
     * 打开作者网站（在外部浏览器中）
     */
    openAuthorWebsite() {
        // 使用Electron的shell模块在外部浏览器中打开
        if (window.electronAPI && window.electronAPI.openExternal) {
            window.electronAPI.openExternal('https://www.design2002.xyz');
        } else {
            // 降级方案：使用window.open
            window.open('https://www.design2002.xyz', '_blank');
        }

        // 显示成功提示
        this.showNotification('正在打开作者网站...', 'info');
    }

    /**
     * 更改存储路径
     */
    changeStoragePath() {
        if (window.electronAPI && window.electronAPI.selectDirectory) {
            window.electronAPI.selectDirectory()
                .then(result => {
                    if (result && !result.canceled && result.filePaths && result.filePaths.length > 0) {
                        const selectedPath = result.filePaths[0];
                        this.saveStoragePath(selectedPath);
                        this.updateStoragePathDisplay(selectedPath);
                        this.showNotification('存储路径已更新', 'success');
                    }
                })
                .catch(error => {
                    console.error('选择目录失败:', error);
                    this.showNotification('选择目录失败，请重试', 'error');
                });
        } else {
            this.showNotification('目录选择功能不可用', 'warning');
        }
    }

    /**
     * 配置API密钥
     */
    configureApiKey() {
        // 创建API密钥输入对话框
        const modal = this.createApiKeyModal();
        document.body.appendChild(modal);

        // 显示模态框
        setTimeout(() => {
            modal.classList.add('show');
        }, 10);

        // 加载当前存储的API密钥并填充到输入框
        this.loadCurrentApiKeyForModal(modal);
    }

    /**
     * 创建API密钥输入模态框
     */
    createApiKeyModal() {
        const modal = document.createElement('div');
        modal.className = 'settings-modal';
        modal.innerHTML = `
            <div class="settings-modal-backdrop"></div>
            <div class="settings-modal-content">
                <div class="settings-modal-header">
                    <h3>配置 SiliconFlow API 密钥</h3>
                    <button class="settings-modal-close" id="api-key-modal-close">&times;</button>
                </div>
                <div class="settings-modal-body">
                    <div class="form-group">
                        <label for="api-key-input">API 密钥</label>
                        <div class="input-with-icon">
                            <input type="text" id="api-key-input" placeholder="请输入您的 SiliconFlow API 密钥" />
                            <button type="button" class="visibility-toggle" id="visibility-toggle">
                                <span class="eye-icon">👁️</span>
                            </button>
                        </div>
                        <small class="form-hint">
                            您的API密钥将安全地存储在本地，不会上传到任何服务器。
                            <a href="#" id="get-api-key-link">获取API密钥</a>
                        </small>
                    </div>
                </div>
                <div class="settings-modal-footer">
                    <button class="settings-btn secondary" id="api-key-modal-cancel">取消</button>
                    <button class="settings-btn primary" id="api-key-modal-save">保存</button>
                </div>
            </div>
        `;

        // 绑定模态框事件
        const closeBtn = modal.querySelector('#api-key-modal-close');
        const cancelBtn = modal.querySelector('#api-key-modal-cancel');
        const saveBtn = modal.querySelector('#api-key-modal-save');
        const backdrop = modal.querySelector('.settings-modal-backdrop');
        const getApiKeyLink = modal.querySelector('#get-api-key-link');
        const visibilityToggle = modal.querySelector('#visibility-toggle');
        const apiKeyInput = modal.querySelector('#api-key-input');
        const eyeIcon = modal.querySelector('.eye-icon');

        const closeModal = () => {
            modal.classList.remove('show');
            setTimeout(() => {
                document.body.removeChild(modal);
            }, 300);
        };

        closeBtn.addEventListener('click', closeModal);
        cancelBtn.addEventListener('click', closeModal);
        backdrop.addEventListener('click', closeModal);

        getApiKeyLink.addEventListener('click', (e) => {
            e.preventDefault();
            if (window.electronAPI && window.electronAPI.openExternal) {
                window.electronAPI.openExternal('https://siliconflow.cn/');
            } else {
                window.open('https://siliconflow.cn/', '_blank');
            }
        });

        // 可见性切换功能
        visibilityToggle.addEventListener('click', () => {
            const isVisible = apiKeyInput.type === 'text';
            apiKeyInput.type = isVisible ? 'password' : 'text';
            eyeIcon.textContent = isVisible ? '🙈' : '👁️';
            visibilityToggle.setAttribute('aria-label', isVisible ? '隐藏API密钥' : '显示API密钥');
        });

        saveBtn.addEventListener('click', () => {
            const apiKey = modal.querySelector('#api-key-input').value.trim();
            if (apiKey) {
                // 显示保存中状态
                saveBtn.disabled = true;
                saveBtn.textContent = '保存中...';

                this.saveApiKey(apiKey)
                    .then(() => {
                        this.updateApiKeyStatus(true);
                        this.showNotification('API密钥已保存到env.local文件', 'success');
                        closeModal();
                    })
                    .catch(error => {
                        console.error('保存失败:', error);
                        this.showNotification('保存失败，请重试', 'error');
                        // 恢复按钮状态
                        saveBtn.disabled = false;
                        saveBtn.textContent = '保存';
                    });
            } else {
                this.showNotification('请输入有效的API密钥', 'error');
            }
        });

        return modal;
    }

    /**
     * 加载存储路径设置
     */
    loadStoragePath() {
        if (window.electronAPI && window.electronAPI.getSettings) {
            window.electronAPI.getSettings('storagePath')
                .then(path => {
                    if (path) {
                        this.updateStoragePathDisplay(path);
                    }
                })
                .catch(error => {
                    console.error('加载存储路径失败:', error);
                });
        }
    }

    /**
     * 保存存储路径
     */
    saveStoragePath(path) {
        if (window.electronAPI && window.electronAPI.saveSettings) {
            window.electronAPI.saveSettings('storagePath', path)
                .catch(error => {
                    console.error('保存存储路径失败:', error);
                });
        }
    }

    /**
     * 更新存储路径显示
     */
    updateStoragePathDisplay(path) {
        const inputElement = document.getElementById('storage-path-display');
        if (inputElement) {
            inputElement.value = path || '';
            inputElement.placeholder = path ? '' : '请选择项目文件夹';
        }
    }

    /**
     * 加载元件库路径设置
     */
    loadComponentLibPath() {
        if (window.electronAPI && window.electronAPI.getSettings) {
            window.electronAPI.getSettings('componentLibPath')
                .then(path => {
                    if (path) {
                        this.updateComponentLibPathDisplay(path);
                    }
                })
                .catch(error => {
                    console.error('加载元件库路径失败:', error);
                });
        }
    }

    /**
     * 保存元件库路径
     */
    saveComponentLibPath(path) {
        if (window.electronAPI && window.electronAPI.saveSettings) {
            window.electronAPI.saveSettings('componentLibPath', path)
                .catch(error => {
                    console.error('保存元件库路径失败:', error);
                });
        }
    }

    /**
     * 更新元件库路径显示
     */
    updateComponentLibPathDisplay(path) {
        const inputElement = document.getElementById('component-lib-path-display');
        if (inputElement) {
            inputElement.value = path || '';
            inputElement.placeholder = path ? '' : '请选择元件库文件夹';
        }
    }

    /**
     * 更改元件库路径
     */
    async changeComponentLibPath() {
        if (window.electronAPI && window.electronAPI.selectDirectory) {
            window.electronAPI.selectDirectory()
                .then(result => {
                    if (result && !result.canceled && result.filePaths && result.filePaths.length > 0) {
                        const selectedPath = result.filePaths[0];
                        this.saveComponentLibPath(selectedPath);
                        this.updateComponentLibPathDisplay(selectedPath);
                        this.showNotification('元件库路径已更新', 'success');
                    }
                })
                .catch(error => {
                    console.error('选择元件库文件夹失败:', error);
                    this.showNotification('选择元件库文件夹失败，请重试', 'error');
                });
        } else {
            this.showNotification('目录选择功能不可用', 'warning');
        }
    }


    /**
     * 加载API密钥状态
     */
    loadApiKeyStatus() {
        if (window.electronAPI && window.electronAPI.loadApiKey) {
            window.electronAPI.loadApiKey()
                .then(result => {
                    if (result.success) {
                        const hasApiKey = result.apiKey && result.apiKey.length > 0;
                        this.updateApiKeyStatus(hasApiKey);
                    } else {
                        console.error('加载API密钥失败:', result.error);
                        this.updateApiKeyStatus(false);
                    }
                })
                .catch(error => {
                    console.error('加载API密钥状态失败:', error);
                    this.updateApiKeyStatus(false);
                });
        } else {
            console.warn('API密钥加载功能不可用');
            this.updateApiKeyStatus(false);
        }
    }

    /**
     * 为模态框加载当前存储的API密钥
     */
    loadCurrentApiKeyForModal(modal) {
        if (window.electronAPI && window.electronAPI.loadApiKey) {
            const apiKeyInput = modal.querySelector('#api-key-input');
            const visibilityToggle = modal.querySelector('#visibility-toggle');
            const eyeIcon = modal.querySelector('.eye-icon');

            if (!apiKeyInput) return;

            window.electronAPI.loadApiKey()
                .then(result => {
                    if (result.success && result.apiKey) {
                        // 填充当前存储的API密钥到输入框
                        apiKeyInput.value = result.apiKey;

                        // 确保输入框处于可见状态（type="text"）
                        apiKeyInput.type = 'text';

                        // 更新可见性按钮的图标和状态
                        if (eyeIcon) {
                            eyeIcon.textContent = '👁️';
                        }
                        if (visibilityToggle) {
                            visibilityToggle.setAttribute('aria-label', '隐藏API密钥');
                        }
                    } else {
                        // 没有存储的密钥，保持输入框为空
                        apiKeyInput.value = '';
                        apiKeyInput.type = 'text'; // 默认可见

                        if (eyeIcon) {
                            eyeIcon.textContent = '👁️';
                        }
                        if (visibilityToggle) {
                            visibilityToggle.setAttribute('aria-label', '显示API密钥');
                        }
                    }
                })
                .catch(error => {
                    console.error('为模态框加载API密钥失败:', error);
                    // 出错时保持输入框为空
                    apiKeyInput.value = '';
                    apiKeyInput.type = 'text';

                    if (eyeIcon) {
                        eyeIcon.textContent = '👁️';
                    }
                    if (visibilityToggle) {
                        visibilityToggle.setAttribute('aria-label', '显示API密钥');
                    }
                });
        }
    }

    /**
     * 保存API密钥
     */
    saveApiKey(apiKey) {
        if (window.electronAPI && window.electronAPI.saveApiKey) {
            return window.electronAPI.saveApiKey(apiKey)
                .then(result => {
                    if (result.success) {
                        console.log('API密钥已保存到env.local文件');
                    } else {
                        console.error('保存API密钥失败:', result.error);
                        throw new Error(result.error);
                    }
                })
                .catch(error => {
                    console.error('保存API密钥失败:', error);
                    throw error;
                });
        } else {
            return Promise.reject(new Error('保存API不可用'));
        }
    }

    /**
     * 更新API密钥状态显示
     */
    updateApiKeyStatus(hasApiKey) {
        const statusContainer = document.getElementById('api-key-status');
        if (!statusContainer) return;

        const badge = statusContainer.querySelector('.status-badge');
        const text = statusContainer.querySelector('.status-text');

        if (hasApiKey) {
            badge.className = 'status-badge status-set';
            badge.innerHTML = '<span class="status-dot"></span>已配置';
            text.textContent = 'API密钥已配置，可以使用AI功能';
        } else {
            badge.className = 'status-badge status-unset';
            badge.innerHTML = '<span class="status-dot"></span>未配置';
            text.textContent = '需要API密钥才能使用AI功能';
        }
    }

    /**
     * 显示通知
     */
    showNotification(message, type = 'info', duration = 3000) {
        // 使用全局的showNotification函数
        if (window.showNotification) {
            window.showNotification(message, type, duration);
        }
    }
}

// 初始化设置管理器
const settingsManager = new SettingsManager();

// 导出全局变量
window.SettingsManager = SettingsManager;
window.settingsManager = settingsManager;
