/**
 * Fast Hardware - 设置页面脚本
 * 处理设置页面的所有交互功能
 */

class SettingsManager {
    constructor() {
        this.updateState = null;
        this.releaseNotes = [];
        this.init();
    }

    /**
     * 初始化设置页面
     */
    init() {
        this.bindEvents();
        this.loadSettings();
        this.bindUpdateEvents();
    }

    /**
     * 绑定事件监听器
     */
    bindEvents() {

        const contactGithubBtn = document.getElementById('contact-github');
        contactGithubBtn?.addEventListener('click', () => {
            this.openContactLink('https://github.com/Designer-Awei', '正在打开 GitHub...');
        });

        const contactXiaohongshuBtn = document.getElementById('contact-xiaohongshu');
        contactXiaohongshuBtn?.addEventListener('click', () => {
            this.openContactLink('https://xhslink.com/m/4moYxbDWzju', '正在打开小红书...');
        });

        const contactEmailBtn = document.getElementById('contact-email');
        contactEmailBtn?.addEventListener('click', () => {
            this.openContactLink('mailto:1974379701@qq.com', '正在打开默认邮件客户端...');
        });

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

        const downloadUpdateBtn = document.getElementById('download-update-btn');
        if (downloadUpdateBtn) {
            downloadUpdateBtn.addEventListener('click', () => {
                this.downloadUpdate();
            });
        }

        const installUpdateBtn = document.getElementById('install-update-btn');
        if (installUpdateBtn) {
            installUpdateBtn.addEventListener('click', () => {
                this.installUpdate();
            });
        }

        const viewUpdateLogBtn = document.getElementById('view-update-log-btn');
        if (viewUpdateLogBtn) {
            viewUpdateLogBtn.addEventListener('click', () => {
                this.openUpdateLog();
            });
        }

        const autoCheckToggle = document.getElementById('auto-check-updates-toggle');
        if (autoCheckToggle) {
            autoCheckToggle.addEventListener('change', (event) => {
                this.saveAutoCheckUpdates(event.target.checked);
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

        // 加载版本与更新状态
        this.loadVersionInfo();
        this.loadAutoCheckUpdates();
        this.refreshUpdateState();
    }

    /**
     * 绑定自动更新状态事件
     */
    bindUpdateEvents() {
        if (window.electronAPI && window.electronAPI.onUpdateStatus) {
            window.electronAPI.onUpdateStatus((payload) => {
                this.applyUpdateState(payload);
            });
        }
    }


    /**
     * 打开联系链接
     * @param {string} url - 外部链接
     * @param {string} message - 提示文案
     */
    openContactLink(url, message) {
        // 使用Electron的shell模块在外部浏览器中打开
        if (window.electronAPI && window.electronAPI.openExternal) {
            window.electronAPI.openExternal(url);
        } else {
            // 降级方案：使用window.open
            window.open(url, '_blank');
        }

        // 显示成功提示
        this.showNotification(message, 'info');
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
     * 加载应用更新日志数据
     * @returns {Promise<Array<{version: string, date: string, sections: Array<{title: string, items?: string[], summary?: string}>}>>} 更新日志列表
     */
    async loadReleaseNotes() {
        if (this.releaseNotes.length > 0) {
            return this.releaseNotes;
        }

        if (!window.electronAPI || !window.electronAPI.getAssetsPath || !window.electronAPI.loadFile) {
            throw new Error('更新日志读取能力不可用');
        }

        const assetsPath = await window.electronAPI.getAssetsPath();
        const releaseNotesPath = `${assetsPath}/update.txt`;
        const content = await window.electronAPI.loadFile(releaseNotesPath);
        const parsedNotes = JSON.parse(content);
        if (!Array.isArray(parsedNotes)) {
            throw new Error('更新日志格式错误');
        }

        this.releaseNotes = parsedNotes;
        return this.releaseNotes;
    }

    /**
     * 打开更新日志弹窗
     */
    async openUpdateLog() {
        const existingModal = document.querySelector('.update-log-modal');
        if (existingModal) {
            existingModal.classList.add('show');
            return;
        }

        try {
            await this.loadReleaseNotes();
            const modal = this.createUpdateLogModal();
            document.body.appendChild(modal);
            setTimeout(() => {
                modal.classList.add('show');
            }, 10);
        } catch (error) {
            console.error('加载更新日志失败:', error);
            this.showNotification('加载更新日志失败，请检查 update.txt', 'error');
        }
    }

    /**
     * 创建更新日志弹窗
     * @returns {HTMLElement} 更新日志弹窗
     */
    createUpdateLogModal() {
        const modal = document.createElement('div');
        modal.className = 'settings-modal update-log-modal';
        modal.innerHTML = `
            <div class="settings-modal-backdrop"></div>
            <div class="settings-modal-content">
                <div class="settings-modal-header">
                    <h3>更新日志</h3>
                    <button class="settings-modal-close" id="update-log-modal-close">&times;</button>
                </div>
                <div class="settings-modal-body">
                    <div class="update-log-list">
                        ${this.renderUpdateLogHtml()}
                    </div>
                </div>
            </div>
        `;

        const closeBtn = modal.querySelector('#update-log-modal-close');
        const backdrop = modal.querySelector('.settings-modal-backdrop');
        const closeModal = () => {
            modal.classList.remove('show');
            setTimeout(() => {
                if (modal.parentNode) {
                    document.body.removeChild(modal);
                }
            }, 300);
        };

        closeBtn?.addEventListener('click', closeModal);
        backdrop?.addEventListener('click', closeModal);
        return modal;
    }

    /**
     * 渲染更新日志 HTML
     * @returns {string} 更新日志 HTML 字符串
     */
    renderUpdateLogHtml() {
        if (!Array.isArray(this.releaseNotes) || this.releaseNotes.length === 0) {
            return `
                <article class="update-log-version">
                    <p class="update-log-summary">当前暂无可展示的更新日志。</p>
                </article>
            `;
        }

        return this.releaseNotes.map((entry) => {
            const sectionsHtml = entry.sections.map((section) => {
                const contentHtml = Array.isArray(section.items)
                    ? `<ul class="update-log-items">${section.items.map((item) => `<li>${item}</li>`).join('')}</ul>`
                    : `<p class="update-log-summary">${section.summary || ''}</p>`;

                return `
                    <section class="update-log-section">
                        <h4 class="update-log-section-title">${section.title}</h4>
                        ${contentHtml}
                    </section>
                `;
            }).join('');

            return `
                <article class="update-log-version">
                    <div class="update-log-version-header">
                        <h4 class="update-log-version-title">v${entry.version}</h4>
                        <span class="update-log-version-date">${entry.date}</span>
                    </div>
                    ${sectionsHtml}
                </article>
            `;
        }).join('');
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
                            <input type="password" id="api-key-input" placeholder="请输入您的 SiliconFlow API 密钥" />
                            <button type="button" class="visibility-toggle" id="visibility-toggle" title="显示API密钥" aria-label="显示API密钥">
                                <span class="eye-icon"><img src="" alt="显示或隐藏密钥" width="20" height="20" data-icon="eye"></span>
                            </button>
                        </div>
                        <small class="form-hint">
                            您的API密钥将安全地存储在本地，不会上传到任何服务器。
                            <a href="#" id="get-api-key-link">获取API密钥</a>
                            <br />
                            <span class="invite-code-line">
                                注册 SiliconFlow 时可使用作者邀请码
                                <span class="invite-code-inline">
                                    <strong id="invite-code-text">2RuIa96A</strong>
                                    <button type="button" class="inline-icon-button" id="copy-invite-code" title="复制邀请码" aria-label="复制邀请码">
                                        <img src="" alt="复制邀请码" width="14" height="14" data-icon="copy">
                                    </button>
                                </span>
                            </span>
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
        const copyInviteCodeBtn = modal.querySelector('#copy-invite-code');
        const visibilityToggle = modal.querySelector('#visibility-toggle');
        const apiKeyInput = modal.querySelector('#api-key-input');

        this.initializeScopedIconPaths(modal);

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

        copyInviteCodeBtn?.addEventListener('click', async () => {
            await this.copyInviteCode('2RuIa96A');
        });

        // 可见性切换功能
        visibilityToggle.addEventListener('click', () => {
            const isVisible = apiKeyInput.type === 'text';
            apiKeyInput.type = isVisible ? 'password' : 'text';
            this.updateVisibilityToggleIcon(visibilityToggle, isVisible ? 'eye-off' : 'eye');
            visibilityToggle.setAttribute('aria-label', isVisible ? '显示API密钥' : '隐藏API密钥');
            visibilityToggle.setAttribute('title', isVisible ? '显示API密钥' : '隐藏API密钥');
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
     * 初始化指定容器内的图标路径
     * @param {HTMLElement} container - 需要初始化图标的容器
     */
    async initializeScopedIconPaths(container) {
        if (!container || !window.electronAPI || !window.electronAPI.getAssetsPath) {
            return;
        }

        try {
            const assetsPath = await window.electronAPI.getAssetsPath();
            const iconImages = container.querySelectorAll('img[data-icon]');
            iconImages.forEach((img) => {
                const iconName = `icon-${img.dataset.icon}.svg`;
                img.src = `file://${assetsPath}/${iconName}`;
            });
        } catch (error) {
            console.error('初始化局部图标路径失败:', error);
        }
    }

    /**
     * 复制邀请码到剪贴板
     * @param {string} inviteCode - 邀请码
     * @returns {Promise<void>}
     */
    async copyInviteCode(inviteCode) {
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(inviteCode);
            } else {
                this.copyTextWithFallback(inviteCode);
            }
            this.showNotification('邀请码已复制', 'success');
        } catch (error) {
            console.error('复制邀请码失败:', error);
            try {
                this.copyTextWithFallback(inviteCode);
                this.showNotification('邀请码已复制', 'success');
            } catch (fallbackError) {
                console.error('降级复制邀请码失败:', fallbackError);
                this.showNotification('复制失败，请手动复制邀请码', 'error');
            }
        }
    }

    /**
     * 使用兼容方案复制文本
     * @param {string} text - 待复制文本
     */
    copyTextWithFallback(text) {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', 'readonly');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        textarea.style.pointerEvents = 'none';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
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
     * 加载版本信息
     */
    loadVersionInfo() {
        if (window.electronAPI && window.electronAPI.getAppVersion) {
            window.electronAPI.getAppVersion()
                .then((version) => {
                    const currentVersionEl = document.getElementById('update-current-version');
                    const aboutVersionEl = document.getElementById('about-version-text');
                    if (currentVersionEl) {
                        currentVersionEl.textContent = `v${version}`;
                    }
                    if (aboutVersionEl) {
                        aboutVersionEl.textContent = `Fast Hardware v${version}`;
                    }
                })
                .catch((error) => {
                    console.error('加载版本信息失败:', error);
                });
        }
    }

    /**
     * 加载自动检查更新开关状态
     */
    loadAutoCheckUpdates() {
        const autoCheckToggle = document.getElementById('auto-check-updates-toggle');
        if (!autoCheckToggle || !window.electronAPI || !window.electronAPI.getSettings) return;

        window.electronAPI.getSettings('autoCheckUpdates')
            .then((value) => {
                autoCheckToggle.checked = value !== 'false';
            })
            .catch((error) => {
                console.error('加载自动检查更新设置失败:', error);
                autoCheckToggle.checked = true;
            });
    }

    /**
     * 保存自动检查更新设置
     * @param {boolean} enabled - 是否启用
     */
    saveAutoCheckUpdates(enabled) {
        if (!window.electronAPI || !window.electronAPI.saveSettings) return;

        window.electronAPI.saveSettings('autoCheckUpdates', enabled ? 'true' : 'false')
            .then(() => {
                const message = enabled ? '已开启启动自动检查更新' : '已关闭启动自动检查更新';
                this.showNotification(message, 'success');
            })
            .catch((error) => {
                console.error('保存自动检查更新设置失败:', error);
                this.showNotification('保存自动更新设置失败', 'error');
            });
    }

    /**
     * 刷新自动更新状态
     */
    refreshUpdateState() {
        if (!window.electronAPI || !window.electronAPI.getUpdateState) return;

        window.electronAPI.getUpdateState()
            .then((state) => {
                this.applyUpdateState(state);
            })
            .catch((error) => {
                console.error('获取更新状态失败:', error);
            });
    }

    /**
     * 下载更新
     */
    downloadUpdate() {
        if (!window.electronAPI || !window.electronAPI.downloadUpdate) return;

        this.showNotification('开始下载更新...', 'info');
        window.electronAPI.downloadUpdate()
            .then((result) => {
                if (!result.success && result.message) {
                    this.showNotification(result.message, 'error');
                }
            })
            .catch((error) => {
                console.error('下载更新失败:', error);
                this.showNotification('下载更新失败', 'error');
            });
    }

    /**
     * 安装更新
     */
    installUpdate() {
        if (!window.electronAPI || !window.electronAPI.installUpdate) return;

        window.electronAPI.installUpdate()
            .then((result) => {
                if (!result.success && result.message) {
                    this.showNotification(result.message, 'warning');
                }
            })
            .catch((error) => {
                console.error('安装更新失败:', error);
                this.showNotification('安装更新失败', 'error');
            });
    }

    /**
     * 应用更新状态到设置页
     * @param {Object} state - 更新状态
     */
    applyUpdateState(state) {
        this.updateState = state || {};

        const latestVersionEl = document.getElementById('update-latest-version');
        const statusTextEl = document.getElementById('update-status-text');
        const downloadBtn = document.getElementById('download-update-btn');
        const installBtn = document.getElementById('install-update-btn');
        const autoToggle = document.getElementById('auto-check-updates-toggle');

        if (latestVersionEl) {
            latestVersionEl.textContent = state.latestVersion ? `v${state.latestVersion}` : '未检查';
        }

        if (statusTextEl) {
            statusTextEl.textContent = state.message || '启动后将根据开关设置自动检查更新';
        }

        if (autoToggle && typeof state.autoCheckEnabled === 'boolean') {
            autoToggle.checked = state.autoCheckEnabled;
        }

        if (downloadBtn) {
            downloadBtn.style.display = state.status === 'available' ? 'inline-flex' : 'none';
            downloadBtn.disabled = state.status === 'downloading';
        }

        if (installBtn) {
            installBtn.style.display = state.status === 'downloaded' ? 'inline-flex' : 'none';
        }
    }

    /**
     * 为模态框加载当前存储的API密钥
     */
    loadCurrentApiKeyForModal(modal) {
        if (window.electronAPI && window.electronAPI.loadApiKey) {
            const apiKeyInput = modal.querySelector('#api-key-input');
            const visibilityToggle = modal.querySelector('#visibility-toggle');
            if (!apiKeyInput) return;

            window.electronAPI.loadApiKey()
                .then(result => {
                    if (result.success && result.apiKey) {
                        // 填充当前存储的API密钥到输入框
                        apiKeyInput.value = result.apiKey;

                        // 默认保持密钥隐藏
                        apiKeyInput.type = 'password';

                        if (visibilityToggle) {
                            this.updateVisibilityToggleIcon(visibilityToggle, 'eye-off');
                            visibilityToggle.setAttribute('aria-label', '显示API密钥');
                            visibilityToggle.setAttribute('title', '显示API密钥');
                        }
                    } else {
                        // 没有存储的密钥，保持输入框为空
                        apiKeyInput.value = '';
                        apiKeyInput.type = 'password';

                        if (visibilityToggle) {
                            this.updateVisibilityToggleIcon(visibilityToggle, 'eye-off');
                            visibilityToggle.setAttribute('aria-label', '显示API密钥');
                            visibilityToggle.setAttribute('title', '显示API密钥');
                        }
                    }
                })
                .catch(error => {
                    console.error('为模态框加载API密钥失败:', error);
                    // 出错时保持输入框为空
                    apiKeyInput.value = '';
                    apiKeyInput.type = 'password';

                    if (visibilityToggle) {
                        this.updateVisibilityToggleIcon(visibilityToggle, 'eye-off');
                        visibilityToggle.setAttribute('aria-label', '显示API密钥');
                        visibilityToggle.setAttribute('title', '显示API密钥');
                    }
                });
        }
    }

    /**
     * 更新密钥显隐按钮图标
     * @param {HTMLElement} toggleButton - 显隐按钮
     * @param {string} iconName - 图标名称
     */
    async updateVisibilityToggleIcon(toggleButton, iconName) {
        if (!toggleButton) {
            return;
        }

        const iconImage = toggleButton.querySelector('img[data-icon]');
        if (!iconImage) {
            return;
        }

        iconImage.dataset.icon = iconName;

        if (!window.electronAPI || !window.electronAPI.getAssetsPath) {
            return;
        }

        try {
            const assetsPath = await window.electronAPI.getAssetsPath();
            iconImage.src = `file://${assetsPath}/icon-${iconName}.svg`;
        } catch (error) {
            console.error('更新显隐按钮图标失败:', error);
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
