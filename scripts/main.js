/**
 * Fast Hardware - 主应用脚本
 * 处理应用初始化、标签页切换等核心功能
 */

const STARTUP_DEBUG_ENABLED = Boolean(
    window.electronAPI &&
    typeof window.electronAPI.isStartupDebugEnabled === 'function' &&
    window.electronAPI.isStartupDebugEnabled()
);

const RENDER_START_TIME = performance.now();

/**
 * 记录渲染进程启动阶段日志，便于排查首屏闪烁问题
 * @param {string} stage - 启动阶段
 * @param {Record<string, unknown>} [extra={}] - 附加信息
 */
function logRenderStartup(stage, extra = {}) {
    if (!STARTUP_DEBUG_ENABLED) {
        return;
    }
    const elapsedMs = Math.round(performance.now() - RENDER_START_TIME);
    console.log(`[startup][renderer][+${elapsedMs}ms] ${stage}`, extra);
}

/**
 * 获取当前页面主题与首屏背景信息
 * @returns {Record<string, unknown>} 页面视觉状态
 */
function getRenderVisualState() {
    const body = document.body;
    const html = document.documentElement;
    const bodyStyle = body ? window.getComputedStyle(body) : null;
    return {
        readyState: document.readyState,
        prefersDark: window.matchMedia('(prefers-color-scheme: dark)').matches,
        bodyBackgroundColor: bodyStyle ? bodyStyle.backgroundColor : null,
        bodyColor: bodyStyle ? bodyStyle.color : null,
        bodyClassName: body ? body.className : '',
        htmlClassName: html ? html.className : '',
        visibilityState: document.visibilityState
    };
}

// 应用状态管理
class FastHardwareApp {
    constructor() {
        this.currentTab = 'circuit-design';
        this.currentSubTab = 'preview';

        // 项目状态跟踪
        this.currentProject = null; // 当前打开的项目路径
        this.isProjectModified = false; // 项目是否被修改

        // 项目标签管理器
        this.projectTabsManager = null;
        this.updateBannerState = null;
        this.updateBannerDismissed = false;
        this.updateBannerHideTimer = null;

        this.init();
    }

    /**
     * 初始化应用
     */
    async init() {
        logRenderStartup('FastHardwareApp.init:start', getRenderVisualState());
        this.bindEvents();
        this.initializeUI();
        this.initializeWindowTitle();
        this.bindUpdateBannerEvents();
        this.bindUpdateStatusEvents();
        await this.initializeIconPaths();
        
        // 初始化项目标签管理器
        this.projectTabsManager = new ProjectTabsManager(this);
        this.refreshUpdateBannerState();
        logRenderStartup('FastHardwareApp.init:end', getRenderVisualState());
    }

    /**
     * 初始化窗口标题版本号
     */
    initializeWindowTitle() {
        if (window.electronAPI && window.electronAPI.getAppVersion) {
            window.electronAPI.getAppVersion()
                .then((version) => {
                    document.title = `Fast Hardware v${version} —— 智能硬件开发助手`;
                })
                .catch((error) => {
                    console.error('初始化窗口标题失败:', error);
                });
        }
    }

    /**
     * 绑定事件监听器
     */
    bindEvents() {
        // 一级标签页切换
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tabName = e.target.dataset.tab;
                this.switchTab(tabName);
            });
        });

        // 二级标签页切换
        document.querySelectorAll('.sub-tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const subTabName = e.target.dataset.subTab;
                this.switchSubTab(subTabName);
            });
        });

        // 窗口大小改变（防抖处理，避免频繁触发）
        let resizeTimeout;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                this.handleResize();
            }, 200);
        });

        // 导航栏按钮事件
        document.getElementById('load-project')?.addEventListener('click', () => {
            this.loadProject();
        });

        document.getElementById('save-project')?.addEventListener('click', () => {
            this.saveProject();
        });

        // 键盘快捷键
        document.addEventListener('keydown', (e) => {
            this.handleKeydown(e);
        });
    }

    /**
     * 初始化UI组件
     */
    initializeUI() {
        // 设置默认激活的标签页
        this.switchTab(this.currentTab);
        this.switchSubTab(this.currentSubTab);

        // 初始化其他UI组件
        this.initializeNotifications();
    }

    /**
     * 切换一级标签页
     * @param {string} tabName - 标签页名称
     */
    switchTab(tabName) {
        console.debug('切换标签页:', tabName);

        // 更新按钮状态
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        const targetBtn = document.querySelector(`[data-tab="${tabName}"]`);
        if (targetBtn) {
            targetBtn.classList.add('active');
        } else {
            console.error('未找到标签按钮:', tabName);
        }

        // 更新内容区域
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        const targetContent = document.getElementById(`${tabName}-tab`);
        if (targetContent) {
            targetContent.classList.add('active');
            
            // 切换到电路设计标签时，重绘画布
            if (tabName === 'circuit-design' && window.canvasInstance) {
                // 延迟一帧确保DOM完全渲染
                requestAnimationFrame(() => {
                    window.canvasInstance.resizeCanvas();
                    window.canvasInstance.draw();
                    logRenderStartup('canvas:redraw');
                });
            }
        } else {
            console.error('未找到标签内容:', `${tabName}-tab`);
        }

        // 更新当前标签页状态
        this.currentTab = tabName;

        // 触发标签页切换事件
        this.onTabSwitched(tabName);
    }

    /**
     * 切换二级标签页
     * @param {string} subTabName - 二级标签页名称
     */
    switchSubTab(subTabName) {

        // 更新按钮状态
        document.querySelectorAll('.sub-tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-sub-tab="${subTabName}"]`).classList.add('active');

        // 更新内容区域
        document.querySelectorAll('.sub-tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(`${subTabName}-sub-tab`).classList.add('active');

        // 更新当前二级标签页状态
        this.currentSubTab = subTabName;

        // 触发二级标签页切换事件
        this.onSubTabSwitched(subTabName);
    }

    /**
     * 处理窗口大小改变
     */
    handleResize() {
        // 重新计算画布大小等
    }

    /**
     * 处理键盘快捷键
     * @param {KeyboardEvent} e - 键盘事件
     */
    handleKeydown(e) {
        // Ctrl+S 保存快捷键
        if (e.ctrlKey && e.key === 's') {
            e.preventDefault();
            this.saveProject();
        }

        // Ctrl+O 打开项目快捷键
        if (e.ctrlKey && e.key === 'o') {
            e.preventDefault();
            this.loadProject();
        }

        // Tab 键切换标签页
        if (e.key === 'Tab' && !e.ctrlKey) {
            e.preventDefault();
            this.switchToNextTab();
        }
    }

    /**
     * 保存项目
     */
    saveProject() {
        console.log('保存项目...');
        // TODO: 实现保存逻辑
        this.showNotification('项目保存功能开发中...', 'warning');
    }

    /**
     * 加载项目
     */
    loadProject() {
        console.log('加载项目...');
        // TODO: 实现加载逻辑
        this.showNotification('项目加载功能开发中...', 'warning');
    }

    /**
     * 切换到下一个标签页
     */
    switchToNextTab() {
        const tabs = ['circuit-design', 'component-lib', 'settings'];
        const currentIndex = tabs.indexOf(this.currentTab);
        const nextIndex = (currentIndex + 1) % tabs.length;
        this.switchTab(tabs[nextIndex]);
    }

    /**
     * 标签页切换回调
     * @param {string} tabName - 标签页名称
     */
    onTabSwitched(tabName) {
        // 触发自定义事件，让其他模块知道标签页切换了
        const event = new CustomEvent('tabSwitched', {
            detail: { tabName }
        });
        document.dispatchEvent(event);
    }

    /**
     * 二级标签页切换回调
     * @param {string} subTabName - 二级标签页名称
     */
    onSubTabSwitched(subTabName) {
        // 触发自定义事件，让其他模块知道二级标签页切换了
        const event = new CustomEvent('subTabSwitched', {
            detail: { subTabName }
        });
        document.dispatchEvent(event);
    }

    /**
     * 初始化通知系统
     */
    initializeNotifications() {
        // 创建通知容器
        const notificationContainer = document.createElement('div');
        notificationContainer.id = 'notification-container';
        document.body.appendChild(notificationContainer);
    }

    /**
     * 绑定顶部更新通知栏事件
     */
    bindUpdateBannerEvents() {
        const actionBtn = document.getElementById('update-banner-action');
        const closeBtn = document.getElementById('update-banner-close');

        actionBtn?.addEventListener('click', async () => {
            if (!this.updateBannerState || !window.electronAPI) {
                return;
            }

            if (this.updateBannerState.status === 'available') {
                await window.electronAPI.downloadUpdate();
            } else if (this.updateBannerState.status === 'downloaded') {
                await window.electronAPI.installUpdate();
            } else if (this.updateBannerState.status === 'error') {
                await window.electronAPI.checkForUpdates(true);
            }
        });

        closeBtn?.addEventListener('click', () => {
            this.updateBannerDismissed = true;
            this.renderUpdateBanner();
        });
    }

    /**
     * 绑定自动更新状态事件
     */
    bindUpdateStatusEvents() {
        if (window.electronAPI && window.electronAPI.onUpdateStatus) {
            window.electronAPI.onUpdateStatus((payload) => {
                this.updateBannerState = payload;
                this.updateBannerDismissed = false;
                this.renderUpdateBanner();
            });
        }
    }

    /**
     * 刷新当前更新状态
     */
    refreshUpdateBannerState() {
        if (window.electronAPI && window.electronAPI.getUpdateState) {
            window.electronAPI.getUpdateState()
                .then((state) => {
                    this.updateBannerState = state;
                    this.renderUpdateBanner();
                })
                .catch((error) => {
                    console.error('获取更新状态失败:', error);
                });
        }
    }

    /**
     * 渲染顶部更新通知栏
     */
    renderUpdateBanner() {
        const banner = document.getElementById('update-banner');
        const text = document.getElementById('update-banner-text');
        const actionBtn = document.getElementById('update-banner-action');
        const closeBtn = document.getElementById('update-banner-close');
        if (!banner || !text || !actionBtn || !closeBtn || !this.updateBannerState) {
            return;
        }

        if (this.updateBannerHideTimer) {
            clearTimeout(this.updateBannerHideTimer);
            this.updateBannerHideTimer = null;
        }

        if (this.updateBannerDismissed) {
            banner.classList.add('hidden');
            return;
        }

        const { status, latestVersion, message } = this.updateBannerState;
        const persistentStatuses = ['available', 'downloading', 'downloaded'];
        const transientStatuses = ['up-to-date', 'idle', 'error'];
        const shouldShow = persistentStatuses.includes(status) || transientStatuses.includes(status);

        if (!shouldShow) {
            banner.classList.add('hidden');
            return;
        }

        banner.classList.remove('hidden');

        if (status === 'available') {
            text.textContent = `发现新版本 v${latestVersion}，可立即下载更新`;
            actionBtn.textContent = '下载更新';
            actionBtn.disabled = false;
            actionBtn.style.display = 'inline-flex';
            closeBtn.style.display = 'inline-flex';
        } else if (status === 'downloading') {
            text.textContent = message || '正在下载更新...';
            actionBtn.textContent = '下载中';
            actionBtn.disabled = true;
            actionBtn.style.display = 'inline-flex';
            closeBtn.style.display = 'inline-flex';
        } else if (status === 'downloaded') {
            text.textContent = `新版本 v${latestVersion} 已下载完成，点击安装并重启`;
            actionBtn.textContent = '立即安装';
            actionBtn.disabled = false;
            actionBtn.style.display = 'inline-flex';
            closeBtn.style.display = 'inline-flex';
        } else if (status === 'up-to-date') {
            text.textContent = message || '当前无需更新，已是最新版本';
            actionBtn.style.display = 'none';
            closeBtn.style.display = 'none';
            this.scheduleUpdateBannerAutoHide();
        } else if (status === 'idle') {
            text.textContent = message || '本次未执行更新操作';
            actionBtn.style.display = 'none';
            closeBtn.style.display = 'none';
            this.scheduleUpdateBannerAutoHide();
        } else if (status === 'error') {
            text.textContent = message || '更新检查失败，请稍后重试';
            actionBtn.style.display = 'none';
            closeBtn.style.display = 'none';
            this.scheduleUpdateBannerAutoHide();
        }
    }

    /**
     * 为顶部更新通知栏安排自动隐藏
     */
    scheduleUpdateBannerAutoHide() {
        this.updateBannerHideTimer = setTimeout(() => {
            this.updateBannerDismissed = true;
            this.renderUpdateBanner();
        }, 10000);
    }

    /**
     * 显示通知
     * @param {string} message - 通知消息
     * @param {string} type - 通知类型 (success, error, warning, info)
     * @param {number} duration - 显示时长(毫秒)
     */
    showNotification(message, type = 'info', duration = 3000) {
        const container = document.getElementById('notification-container');
        if (!container) return;

        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;

        container.appendChild(notification);

        // 触发动画
        setTimeout(() => {
            notification.classList.add('show');
        }, 100);

        // 自动移除
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                container.removeChild(notification);
            }, 300);
        }, duration);
    }

    /**
     * 加载项目
     */
    async loadProject() {
        try {

            // 获取项目存储路径
            const storagePath = await this.getProjectStoragePath();
            if (!storagePath) {
                this.showNotification('未设置项目存储路径，请先在设置中配置', 'error');
                return;
            }

            // 打开项目文件夹选择对话框
            const result = await window.electronAPI.selectDirectory();
            if (!result.canceled && result.filePaths.length > 0) {
                const projectPath = result.filePaths[0];

                // 验证项目文件夹
                const validation = await this.validateProjectFolder(projectPath);
                if (!validation.valid) {
                    this.showNotification(validation.message, 'error');
                    return;
                }

                // 读取项目配置文件
                const projectData = await this.loadProjectConfig(projectPath);

                // 添加路径信息
                projectData.path = projectPath;

                // 添加到项目标签管理器（如果已初始化）
                if (this.projectTabsManager) {
                    this.projectTabsManager.addExistingProject(projectData);
                } else {
                    // 如果项目标签管理器还未初始化，直接渲染到画布
                    await this.renderProjectToCanvas(projectData);
                    this.currentProject = projectPath;
                    this.isProjectModified = false;
                }

                // 清理代码编辑器的缓存，确保加载新项目的代码
                if (window.canvasInstance) {
                    window.canvasInstance.lastSavedCodeContent = null;
                    window.canvasInstance.currentCodePath = null;
                }

                console.log('📂 项目加载完成，设置当前项目:', this.currentProject);
                this.showNotification('项目加载成功！', 'success');
            }
        } catch (error) {
            console.error('加载项目失败:', error);
            this.showNotification('项目加载失败: ' + error.message, 'error');
        }
    }

    /**
     * 保存项目
     */
    async saveProject() {
        try {
            console.log('开始保存项目...');

            // 获取当前画布状态
            const canvasState = this.getCurrentCanvasState();
            // 移除画布元件校验，允许空画布保存项目

            if (this.currentProject) {
                // 已打开项目：直接更新配置文件
                console.log('更新已打开的项目:', this.currentProject);
                await this.updateExistingProject(this.currentProject, canvasState);
                this.isProjectModified = false;
                
                // 标记项目标签为已保存
                if (this.projectTabsManager) {
                    const activeProject = this.projectTabsManager.getActiveProject();
                    if (activeProject) {
                        this.projectTabsManager.markProjectAsSaved(activeProject.id);
                    }
                }
                
                this.showNotification('项目更新成功！', 'success');
            } else {
                // 新项目：显示对话框进行保存
                console.log('创建新项目...');

                // 显示项目信息输入对话框
                const projectInfo = await this.showProjectInfoDialog();
                if (!projectInfo) {
                    return; // 用户取消
                }

                // 获取存储路径
                const storagePath = await this.getProjectStoragePath();
                if (!storagePath) {
                    this.showNotification('未设置项目存储路径，请先在设置中配置', 'error');
                    return;
                }

                // 创建项目文件夹
                const projectPath = `${storagePath}/${projectInfo.name}`;
                await this.createProjectFolder(projectPath, canvasState, projectInfo);

                // 设置为当前项目
                this.currentProject = projectPath;
                this.isProjectModified = false;

                // 更新项目标签管理器
                if (this.projectTabsManager) {
                    const activeProject = this.projectTabsManager.getActiveProject();
                    if (activeProject) {
                        this.projectTabsManager.updateProjectName(activeProject.id, projectInfo.name);
                        this.projectTabsManager.updateProjectPath(activeProject.id, projectPath);
                        this.projectTabsManager.markProjectAsSaved(activeProject.id);
                    }
                }

                this.showNotification('项目保存成功！', 'success');
            }
        } catch (error) {
            console.error('保存项目失败:', error);
            this.showNotification('项目保存失败: ' + error.message, 'error');
        }
    }

    /**
     * 更新已打开的项目
     * @param {string} projectPath - 项目路径
     * @param {Object} canvasState - 画布状态
     */
    async updateExistingProject(projectPath, canvasState) {
        try {
            console.log('更新项目配置文件:', projectPath);

            // 生成circuit_config.json内容
            const circuitConfig = this.generateCircuitConfig(canvasState);

            // 保存circuit_config.json
            const configPath = `${projectPath}/circuit_config.json`;
            await window.electronAPI.saveFile(configPath, JSON.stringify(circuitConfig, null, 2));

            // 同步元件文件到项目文件夹
            await this.syncComponentFiles(projectPath, canvasState);

            // 更新固件代码
            await this.updateProjectCode(projectPath, canvasState);

            console.log('项目配置文件更新完成');
        } catch (error) {
            console.error('更新项目失败:', error);
            throw error;
        }
    }

    /**
     * 同步元件文件到项目文件夹
     * @param {string} projectPath - 项目路径
     * @param {Object} canvasState - 画布状态
     */
    async syncComponentFiles(projectPath, canvasState) {
        try {
            console.log('开始同步元件文件...');

            const componentsPath = `${projectPath}/components`;

            // 确保components文件夹存在
            try {
                await window.electronAPI.saveFile(componentsPath, '', true);
            } catch (error) {
                console.log('components文件夹已存在');
            }

            // 获取画布上的元件ID集合
            const canvasComponentIds = new Set();
            canvasState.components.forEach(component => {
                if (component.data && component.data.id) {
                    canvasComponentIds.add(component.data.id);
                }
            });

            console.log('画布上的元件数量:', canvasComponentIds.size);

            // 读取项目components文件夹中的现有元件文件
            const dirResult = await window.electronAPI.readDirectory(componentsPath);
            const existingComponentIds = new Set();

            if (dirResult.success) {
                dirResult.files.forEach(file => {
                    if (file.name.endsWith('.json')) {
                        // 从文件名提取元件ID (移除.json扩展名)
                        const componentId = file.name.replace('.json', '');
                        existingComponentIds.add(componentId);
                    }
                });
            }

            console.log('项目文件夹中的元件数量:', existingComponentIds.size);

            // 找出需要新增的元件 (在画布上但不在项目文件夹中)
            const componentsToAdd = [];
            for (const componentId of canvasComponentIds) {
                if (!existingComponentIds.has(componentId)) {
                    // 找到对应的元件数据
                    const component = canvasState.components.find(c => c.data && c.data.id === componentId);
                    if (component) {
                        componentsToAdd.push(component);
                    }
                }
            }

            // 找出需要删除的元件 (在项目文件夹中但不在画布上)
            const componentsToRemove = [];
            for (const componentId of existingComponentIds) {
                if (!canvasComponentIds.has(componentId)) {
                    componentsToRemove.push(componentId);
                }
            }

            console.log(`需要新增 ${componentsToAdd.length} 个元件，删除 ${componentsToRemove.length} 个元件`);

            // 复制新增的元件文件
            for (const component of componentsToAdd) {
                if (component.data && component.data.id) {
                    try {
                        // 从系统元件库读取原始元件文件
                        const sourcePath = `data/system-components/standard/${component.data.id}.json`;
                        let componentContent;

                        try {
                            // 先尝试从standard目录读取
                            componentContent = await window.electronAPI.loadFile(sourcePath);
                        } catch (error) {
                            // 如果standard目录没有找到，尝试custom目录
                            const customPath = `data/system-components/custom/${component.data.id}.json`;
                            componentContent = await window.electronAPI.loadFile(customPath);
                        }

                        // 保存到项目的components目录
                        const componentFileName = `${component.data.id}.json`;
                        const componentPath = `${componentsPath}/${componentFileName}`;
                        await window.electronAPI.saveFile(componentPath, componentContent);

                        console.log(`✅ 元件 ${component.data.name} 已添加到项目`);
                    } catch (error) {
                        console.error(`❌ 复制元件 ${component.data.name} 失败:`, error);
                        // 如果无法从系统库读取，则保存当前数据作为备用
                        const componentFileName = `${component.data.id}.json`;
                        const componentPath = `${componentsPath}/${componentFileName}`;
                        await window.electronAPI.saveFile(componentPath, JSON.stringify(component.data, null, 2));
                        console.log(`⚠️  元件 ${component.data.name} 使用备用数据保存`);
                    }
                }
            }

            // 删除不需要的元件文件
            for (const componentId of componentsToRemove) {
                try {
                    const componentFileName = `${componentId}.json`;
                    const componentPath = `${componentsPath}/${componentFileName}`;

                    // 直接删除元件文件
                    await window.electronAPI.deleteFile(componentPath);
                    console.log(`🗑️ 元件 ${componentId} 已从项目文件夹删除`);

                } catch (error) {
                    console.error(`❌ 删除元件文件 ${componentId} 时出错:`, error);
                    // 继续处理其他文件，不因单个文件失败而中断整个同步过程
                }
            }

            console.log('元件文件同步完成');

        } catch (error) {
            console.error('同步元件文件失败:', error);
            throw new Error('同步元件文件失败: ' + error.message);
        }
    }

    /**
     * 生成circuit_config.json内容
     * @param {Object} canvasState - 画布状态
     * @returns {Object} circuit_config.json格式的对象
     */
    generateCircuitConfig(canvasState) {
        const components = canvasState.components.map(component => {
            // 将元件方向转换为orientation字符串
            const directionToOrientation = {
                'up': 'up',
                'down': 'down',
                'left': 'left',
                'right': 'right'
            };
            const orientation = directionToOrientation[component.direction] || 'up';

            return {
                componentFile: `${component.data.id}.json`,
                instanceId: component.id,
                position: [component.position.x, component.position.y],
                orientation: orientation,
                properties: {
                    customLabel: component.data.name,
                    ...component.properties
                }
            };
        });

        const connections = canvasState.connections.map(connection => ({
            id: connection.id,
            source: {
                instanceId: connection.source.instanceId || connection.source.componentId,
                pinId: connection.source.pinId,
                pinName: connection.source.pinName
            },
            target: {
                instanceId: connection.target.instanceId || connection.target.componentId,
                pinId: connection.target.pinId,
                pinName: connection.target.pinName
            },
            wireType: connection.wireType,
            path: connection.path,
            style: connection.style,
            metadata: {
                createdAt: new Date().toISOString(),
                connectionType: connection.wireType
            }
        }));

        return {
            projectName: canvasState.projectName || "未命名项目",
            description: canvasState.description || "通过Fast Hardware创建的电路设计",
            version: "1.0.0",
            createdAt: new Date().toISOString(),
            lastModified: new Date().toISOString(),
            components: components,
            connections: connections,
            canvas: canvasState.canvas
        };
    }

    /**
     * 更新项目固件代码
     * @param {string} projectPath - 项目路径
     * @param {Object} canvasState - 画布状态
     */
    async updateProjectCode(projectPath, canvasState) {
        try {
            // 读取现有的circuit_config.json获取项目名称
            let projectName = "未命名项目";
            try {
                const configPath = `${projectPath}/circuit_config.json`;
                const configContent = await window.electronAPI.loadFile(configPath);
                const config = JSON.parse(configContent);
                projectName = config.projectName || projectName;
            } catch (error) {
                console.warn('无法读取项目配置，使用默认项目名称');
            }

            // 生成基础的Arduino代码模板
            const generatedCodeContent = this.generateArduinoCode(canvasState, projectName);

            // 检查是否存在与项目名称一致的.ino文件
            const projectCodePath = `${projectPath}/${projectName}.ino`;
            const defaultCodePath = `${projectPath}/generated_code.ino`;

            // 优先使用项目名称作为文件名
            let targetCodePath = projectCodePath;

            // 检查是否已经有用户编辑过的代码
            let existingCodeContent = null;
            let hasUserEditedCode = false;

            try {
                // 尝试读取现有代码文件
                existingCodeContent = await window.electronAPI.loadFile(projectCodePath);
                targetCodePath = projectCodePath;

                // 检查现有代码是否与自动生成的模板不同
                // 简单比较：如果现有代码不包含模板的特征注释，说明是用户编辑过的
                hasUserEditedCode = !existingCodeContent.includes(`// ${projectName} - Fast Hardware生成的Arduino代码`);

            } catch (error) {
                // 项目名称的.ino文件不存在，检查是否有其他.ino文件
                try {
                    existingCodeContent = await window.electronAPI.loadFile(defaultCodePath);
                    targetCodePath = defaultCodePath;

                    // 检查现有代码是否与自动生成的模板不同
                    hasUserEditedCode = !existingCodeContent.includes(`// ${projectName} - Fast Hardware生成的Arduino代码`);

                } catch (error2) {
                    // 都没有找到，使用项目名称创建新文件
                    targetCodePath = projectCodePath;
                    hasUserEditedCode = false;
                }
            }

            // 只有在没有用户编辑过的代码时才覆盖，否则保留用户编辑的内容
            if (!hasUserEditedCode) {
                // 保存自动生成的代码到.ino文件
                await window.electronAPI.saveFile(targetCodePath, generatedCodeContent);
                console.log(`固件代码保存到: ${targetCodePath} (自动生成)`);
            } else {
                console.log(`固件代码保留用户编辑内容: ${targetCodePath} (跳过自动生成)`);
            }

            console.log('固件代码更新完成');
        } catch (error) {
            console.error('更新固件代码失败:', error);
            // 不抛出错误，因为代码生成失败不应该阻止配置保存
        }
    }

    /**
     * 生成Arduino代码
     * @param {Object} canvasState - 画布状态
     * @param {string} projectName - 项目名称
     * @returns {string} Arduino代码
     */
    generateArduinoCode(canvasState, projectName = "未命名项目") {
        let code = `// ${projectName} - Fast Hardware生成的Arduino代码
// 项目: ${projectName}
// 生成时间: ${new Date().toISOString()}

`;

        // 添加引脚定义
        code += `// 引脚定义
`;

        canvasState.components.forEach(component => {
            if (component.data.category === 'microcontroller') {
                code += `// ${component.data.name} 引脚定义\n`;
            }
        });

        // 添加基础setup和loop函数
        code += `
void setup() {
  // 初始化代码
  Serial.begin(9600);
}

void loop() {
  // 主循环代码
  delay(100);
}
`;

        return code;
    }

    /**
     * 获取项目存储路径
     */
    async getProjectStoragePath() {
        try {
            const result = await window.electronAPI.getSettings('storagePath');
            return result;
        } catch (error) {
            console.error('获取存储路径失败:', error);
            return null;
        }
    }

    /**
     * 验证项目文件夹
     */
    async validateProjectFolder(projectPath) {
        try {
            // 这里需要实现文件存在性检查
            // 暂时返回成功，实际实现中需要检查文件系统
            return { valid: true };
        } catch (error) {
            return {
                valid: false,
                message: '项目文件夹验证失败: ' + error.message
            };
        }
    }

    /**
     * 加载项目配置
     */
    async loadProjectConfig(projectPath) {
        try {
            console.log('读取项目配置:', projectPath);
            const circuitConfigPath = `${projectPath}/circuit_config.json`;

            // 读取circuit_config.json文件
            const configContent = await window.electronAPI.loadFile(circuitConfigPath);
            const projectData = JSON.parse(configContent);

            // 读取元件文件
            const componentsPath = `${projectPath}/components`;
            console.log('读取元件文件夹:', componentsPath);
            for (const component of projectData.components) {
                const componentPath = `${componentsPath}/${component.componentFile}`;
                const componentContent = await window.electronAPI.loadFile(componentPath);
                component.data = JSON.parse(componentContent);
            }

            console.log('项目配置读取完成');
            return projectData;
        } catch (error) {
            console.error('读取项目配置失败:', error);
            throw new Error('读取项目配置失败: ' + error.message);
        }
    }

    /**
     * 渲染项目到画布
     */
    async renderProjectToCanvas(projectData) {
        try {
            console.log('渲染项目到画布...');

            // 等待canvasManager初始化完成
            let attempts = 0;
            const maxAttempts = 50; // 最多等待5秒

            while (!window.canvasManager && attempts < maxAttempts) {
                console.log('等待canvasManager初始化...');
                await new Promise(resolve => setTimeout(resolve, 100));
                attempts++;
            }

            if (!window.canvasManager) {
                console.error('canvasManager初始化超时!');
                throw new Error('画布管理器初始化失败，请刷新页面重试');
            }

            // 清空当前画布
            window.canvasManager.clearComponents();

            // 渲染元件
            if (projectData.components && projectData.components.length > 0) {
                console.log(`渲染 ${projectData.components.length} 个元件`);
                for (const component of projectData.components) {
                    if (component.data) {
                        // position是数组格式[x, y]，需要分别传递
                        const x = component.position[0];
                        const y = component.position[1];
                        // 使用circuit_config.json中的instanceId作为元件ID，确保连线能正确引用
                        // 传入orientation参数，确保元件朝向正确
                        const orientation = component.orientation || 'up';
                        window.canvasManager.addComponent(component.data, x, y, component.instanceId, orientation);
                    } else {
                        console.warn('元件缺少数据:', component);
                    }
                }
            } else {
                console.warn('没有元件需要渲染');
            }

            // 渲染连线
            if (projectData.connections && projectData.connections.length > 0) {
                console.log(`渲染 ${projectData.connections.length} 条连线`);
                for (const connection of projectData.connections) {
                    window.canvasManager.addConnection(connection);
                }
            } else {
                console.log('没有连线需要渲染');
            }

            console.log('项目渲染完成');

            // 强制重新渲染画布（添加延时确保所有连线都已添加）
            if (window.canvasManager) {
                // 立即渲染一次
                window.canvasManager.forceRender();
                // 延时再次渲染，确保异步操作完成
                setTimeout(() => {
                    window.canvasManager.forceRender();
                }, 100);
            }
        } catch (error) {
            console.error('渲染项目失败:', error);
            throw new Error('渲染项目失败: ' + error.message);
        }
    }

    /**
     * 获取当前画布状态
     */
    getCurrentCanvasState() {
        if (!window.canvasManager) {
            return null;
        }

        const components = window.canvasManager.getComponents();
        const connections = window.canvasManager.connections || [];

        return {
            projectName: this.currentProject ? this.getProjectNameFromPath(this.currentProject) : null,
            description: null,
            components: components,
            connections: connections,
            canvas: {
                zoom: window.canvasManager.scale || 1.0,
                panX: window.canvasManager.offsetX || 0,
                panY: window.canvasManager.offsetY || 0,
                gridSize: 10,
                showGrid: true
            }
        };
    }

    /**
     * 从项目路径中提取项目名称
     * @param {string} projectPath - 项目路径
     * @returns {string} 项目名称
     */
    getProjectNameFromPath(projectPath) {
        // 从路径中提取文件夹名称作为项目名称
        const pathParts = projectPath.split(/[/\\]/);
        const folderName = pathParts[pathParts.length - 1];

        // 对于模板项目，直接返回文件夹名称
        // 项目名称会从配置文件中读取
        return folderName;
    }

    /**
     * 显示项目信息输入对话框
     */
    async showProjectInfoDialog() {
        return new Promise((resolve) => {
            // 清理可能存在的旧模态框
            const existingModal = document.querySelector('.settings-modal');
            if (existingModal) {
                document.body.removeChild(existingModal);
            }

            // 创建模态框
            const modal = document.createElement('div');
            modal.className = 'settings-modal';
            modal.innerHTML = `
                <div class="settings-modal-backdrop"></div>
                <div class="settings-modal-content">
                    <div class="settings-modal-header">
                        <h3>保存项目</h3>
                        <button class="settings-modal-close">&times;</button>
                    </div>
                    <div class="settings-modal-body">
                        <div class="form-group">
                            <label for="project-name">项目名称 *</label>
                            <input type="text" id="project-name" placeholder="请输入项目名称" required />
                        </div>
                        <div class="form-group">
                            <label for="project-description">项目描述</label>
                            <textarea id="project-description" placeholder="请输入项目描述（可选）" rows="3"></textarea>
                        </div>
                    </div>
                    <div class="settings-modal-footer">
                        <button class="settings-btn secondary" id="cancel-save">取消</button>
                        <button class="settings-btn primary" id="confirm-save">保存</button>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);

            // 显示模态框
            setTimeout(() => {
                modal.classList.add('show');
            }, 10);

            // 绑定事件
            const closeModal = () => {
                modal.classList.remove('show');
                setTimeout(() => {
                    document.body.removeChild(modal);
                }, 300);
                resolve(null);
            };

            modal.querySelector('.settings-modal-close').addEventListener('click', closeModal);
            modal.querySelector('.settings-modal-backdrop').addEventListener('click', closeModal);
            modal.querySelector('#cancel-save').addEventListener('click', closeModal);

            modal.querySelector('#confirm-save').addEventListener('click', () => {
                const name = modal.querySelector('#project-name').value.trim();
                const description = modal.querySelector('#project-description').value.trim();

                if (!name) {
                    this.showNotification('请输入项目名称', 'error');
                    return;
                }

                modal.classList.remove('show');
                setTimeout(() => {
                    document.body.removeChild(modal);
                }, 300);

                resolve({
                    name: name,
                    description: description || ''
                });
            });
        });
    }

    /**
     * 创建项目文件夹
     */
    async createProjectFolder(projectPath, canvasState, projectInfo) {
        try {
            // 确保项目根目录存在
            await window.electronAPI.saveFile(projectPath, '', true); // 创建项目根目录

            // 创建components文件夹
            const componentsPath = `${projectPath}/components`;
            await window.electronAPI.saveFile(componentsPath, '', true); // 创建目录

            // 保存元件文件 - 从系统元件库复制
            for (const component of canvasState.components) {
                if (component.data && component.data.id) {
                    try {
                        // 从系统元件库读取原始元件文件
                        const sourcePath = `data/system-components/standard/${component.data.id}.json`;
                        let componentContent;

                        try {
                            // 先尝试从standard目录读取
                            componentContent = await window.electronAPI.loadFile(sourcePath);
                        } catch (error) {
                            // 如果standard目录没有找到，尝试custom目录
                            const customPath = `data/system-components/custom/${component.data.id}.json`;
                            componentContent = await window.electronAPI.loadFile(customPath);
                        }

                        // 保存到项目的components目录
                        const componentFileName = `${component.data.id}.json`;
                        const componentPath = `${componentsPath}/${componentFileName}`;
                        await window.electronAPI.saveFile(componentPath, componentContent);

                        console.log(`元件 ${component.data.name} 已复制到项目`);
                    } catch (error) {
                        console.error(`复制元件 ${component.data.name} 失败:`, error);
                        // 如果无法从系统库读取，则保存当前数据作为备用
                        const componentFileName = `${component.data.id}.json`;
                        const componentPath = `${componentsPath}/${componentFileName}`;
                        await window.electronAPI.saveFile(componentPath, JSON.stringify(component.data, null, 2));
                    }
                }
            }

            // 创建circuit_config.json
            const circuitConfig = this.generateCircuitConfig(canvasState);
            // 更新项目名称和描述
            circuitConfig.projectName = projectInfo.name;
            circuitConfig.description = projectInfo.description;

            const configPath = `${projectPath}/circuit_config.json`;
            await window.electronAPI.saveFile(configPath, JSON.stringify(circuitConfig, null, 2));

            // 生成Arduino代码文件，使用项目名称作为文件名
            const codeContent = this.generateArduinoCode(canvasState, projectInfo.name);
            const codePath = `${projectPath}/${projectInfo.name}.ino`;
            await window.electronAPI.saveFile(codePath, codeContent);

            console.log('项目文件夹创建完成:', projectPath);
        } catch (error) {
            console.error('创建项目文件夹失败:', error);
            throw new Error('创建项目文件夹失败: ' + error.message);
        }
    }


    /**
     * 初始化图标路径
     * 在生产环境下，assets文件夹在程序根目录，需要设置正确的路径
     */
    async initializeIconPaths() {
        try {
            // 获取正确的assets路径
            const assetsPath = await window.electronAPI.getAssetsPath();

            // 查找所有带有data-icon属性的img标签
            const iconImages = document.querySelectorAll('img[data-icon]');
            iconImages.forEach(img => {
                const iconName = `icon-${img.dataset.icon}.svg`;
                const fullPath = `file://${assetsPath}/${iconName}`;
                img.src = fullPath;
            });

            // 同时处理可能遗漏的旧格式路径
            const oldIconImages = document.querySelectorAll('img[src^="assets/icon-"]');
            oldIconImages.forEach(img => {
                if (img.src && img.src.includes('app.asar/assets/')) {
                    const iconName = img.src.split('/').pop(); // 获取icon文件名
                    const fullPath = `file://${assetsPath}/${iconName}`;
                    img.src = fullPath;
                }
            });

            logRenderStartup('iconPaths:ready', { assetsPath });
        } catch (error) {
            console.error('初始化图标路径失败:', error);
        }
    }
}

// 全局应用实例
let app;

if (STARTUP_DEBUG_ENABLED) {
    document.addEventListener('readystatechange', () => {
        logRenderStartup(`document.readystatechange:${document.readyState}`, getRenderVisualState());
    });

    window.addEventListener('load', () => {
        logRenderStartup('window.load', getRenderVisualState());
    });

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (event) => {
        logRenderStartup('prefers-color-scheme:change', {
            matches: event.matches
        });
    });
}

// DOM加载完成后初始化应用
document.addEventListener('DOMContentLoaded', () => {
    logRenderStartup('DOMContentLoaded:before-app-init', getRenderVisualState());
    app = new FastHardwareApp();
    window.app = app; // 设置全局引用供其他脚本使用
    window.mainApp = app; // 向后兼容

    if (STARTUP_DEBUG_ENABLED) {
        let frameCount = 0;
        const logAnimationFrame = () => {
            frameCount += 1;
            logRenderStartup(`requestAnimationFrame:${frameCount}`, getRenderVisualState());
            if (frameCount < 3) {
                requestAnimationFrame(logAnimationFrame);
            }
        };
        requestAnimationFrame(logAnimationFrame);

        const observer = new MutationObserver((mutations) => {
            const interestingMutation = mutations.some((mutation) => {
                return mutation.type === 'attributes' &&
                    (mutation.attributeName === 'class' || mutation.attributeName === 'style');
            });
            if (interestingMutation) {
                logRenderStartup('MutationObserver:class-or-style-changed', getRenderVisualState());
            }
        });

        if (document.documentElement) {
            observer.observe(document.documentElement, {
                attributes: true,
                subtree: true,
                attributeFilter: ['class', 'style']
            });
        }

        // 仅保留启动早期的 DOM 变更日志，避免正常交互阶段持续刷屏。
        setTimeout(() => {
            observer.disconnect();
            logRenderStartup('MutationObserver:stopped');
        }, 4000);
    }

    logRenderStartup('DOMContentLoaded:after-app-init', getRenderVisualState());
});

// 导出全局函数供其他脚本使用
window.FastHardwareApp = FastHardwareApp;
window.showNotification = (message, type, duration) => {
    if (app) {
        app.showNotification(message, type, duration);
    }
};
