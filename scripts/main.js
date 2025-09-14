/**
 * Fast Hardware - 主应用脚本
 * 处理应用初始化、标签页切换等核心功能
 */

// 应用状态管理
class FastHardwareApp {
    constructor() {
        this.currentTab = 'circuit-design';
        this.currentSubTab = 'preview';

        // 项目状态跟踪
        this.currentProject = null; // 当前打开的项目路径
        this.isProjectModified = false; // 项目是否被修改

        this.init();
    }

    /**
     * 初始化应用
     */
    init() {
        this.bindEvents();
        this.initializeUI();
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

        // 更新按钮状态
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

        // 更新内容区域
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(`${tabName}-tab`).classList.add('active');

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
            console.log('开始加载项目...');

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

                // 渲染项目到画布
                await this.renderProjectToCanvas(projectData);

                // 设置当前项目状态
                this.currentProject = projectPath;
                this.isProjectModified = false;

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
            if (!canvasState || canvasState.components.length === 0) {
                this.showNotification('当前画布为空，请先添加元件', 'warning');
                return;
            }

            if (this.currentProject) {
                // 已打开项目：直接更新配置文件
                console.log('更新已打开的项目:', this.currentProject);
                await this.updateExistingProject(this.currentProject, canvasState);
                this.isProjectModified = false;
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

            // 更新固件代码
            await this.updateProjectCode(projectPath, canvasState);

            console.log('项目配置文件更新完成');
        } catch (error) {
            console.error('更新项目失败:', error);
            throw error;
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
            const codeContent = this.generateArduinoCode(canvasState, projectName);

            // 检查是否存在与项目名称一致的.ino文件
            const projectCodePath = `${projectPath}/${projectName}.ino`;
            const defaultCodePath = `${projectPath}/generated_code.ino`;

            // 优先使用项目名称作为文件名
            let targetCodePath = projectCodePath;

            // 如果项目名称的.ino文件不存在，则检查是否有其他.ino文件
            try {
                await window.electronAPI.loadFile(projectCodePath);
                // 如果能读取到，说明文件存在，使用项目名称
            } catch (error) {
                // 项目名称的.ino文件不存在，检查是否有其他.ino文件
                try {
                    await window.electronAPI.loadFile(defaultCodePath);
                    // 如果默认文件存在，继续使用默认文件名
                    targetCodePath = defaultCodePath;
                } catch (error2) {
                    // 都没有找到，使用项目名称创建新文件
                    targetCodePath = projectCodePath;
                }
            }

            // 保存到.ino文件
            await window.electronAPI.saveFile(targetCodePath, codeContent);
            console.log(`固件代码保存到: ${targetCodePath}`);

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
            console.log('开始读取项目配置:', projectPath);
            const circuitConfigPath = `${projectPath}/circuit_config.json`;

            // 读取circuit_config.json文件
            console.log('读取配置文件:', circuitConfigPath);
            const configContent = await window.electronAPI.loadFile(circuitConfigPath);
            console.log('配置文件内容长度:', configContent.length);
            const projectData = JSON.parse(configContent);
            console.log('解析后的项目数据:', {
                projectName: projectData.projectName,
                componentsCount: projectData.components?.length || 0,
                connectionsCount: projectData.connections?.length || 0
            });

            // 读取元件文件
            const componentsPath = `${projectPath}/components`;
            console.log('读取元件文件夹:', componentsPath);
            for (const component of projectData.components) {
                console.log('读取元件:', component.componentFile, '位置配置:', component.position);
                const componentPath = `${componentsPath}/${component.componentFile}`;
                const componentContent = await window.electronAPI.loadFile(componentPath);
                component.data = JSON.parse(componentContent);
                console.log('元件数据加载完成:', component.data.name, '尺寸:', component.data.dimensions);
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
            console.log('开始渲染项目到画布...');
            console.log('项目数据:', {
                componentsCount: projectData.components?.length || 0,
                connectionsCount: projectData.connections?.length || 0,
                hasCanvasData: !!projectData.canvas
            });

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

            console.log('canvasManager已就绪，开始渲染...');

            // 清空当前画布
            console.log('清空画布元件...');
            window.canvasManager.clearComponents();

            // 设置画布状态
            if (projectData.canvas) {
                console.log('设置画布状态:', projectData.canvas);
            }

            // 渲染元件
            if (projectData.components && projectData.components.length > 0) {
                console.log('开始渲染元件，数量:', projectData.components.length);
                for (const component of projectData.components) {
                        console.log('渲染元件:', {
                            name: component.data?.name,
                            position: component.position,
                            positionType: Array.isArray(component.position) ? 'array' : 'object',
                            hasData: !!component.data,
                            componentFile: component.componentFile
                        });

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
                console.log('渲染连线:', projectData.connections.length, '条');
                for (const connection of projectData.connections) {
                    console.log('渲染连线:', connection.id, '从', connection.source.instanceId, '到', connection.target.instanceId);
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
}

// 全局应用实例
let app;

// DOM加载完成后初始化应用
document.addEventListener('DOMContentLoaded', () => {
    app = new FastHardwareApp();
});

// 导出全局函数供其他脚本使用
window.FastHardwareApp = FastHardwareApp;
window.showNotification = (message, type, duration) => {
    if (app) {
        app.showNotification(message, type, duration);
    }
};
