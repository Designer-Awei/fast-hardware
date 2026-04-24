/**
 * Fast Hardware - 项目标签页管理
 * 管理多个项目的切换、创建、保存和关闭
 */

class ProjectTabsManager {
    constructor(app) {
        this.app = app; // FastHardwareApp 实例引用
        this.projects = []; // 所有打开的项目列表
        this.activeProjectId = null; // 当前活动项目ID
        this.projectIdCounter = 0; // 项目ID计数器
        
        this.init();
    }

    /**
     * 规范化项目路径用于比对（Windows 下路径按不区分大小写处理）。
     * @param {string} rawPath
     * @returns {string}
     */
    normalizeProjectPathKey(rawPath) {
        const normalized = String(rawPath || '').trim().replace(/\\/g, '/');
        return normalized.toLowerCase();
    }

    /**
     * 初始化项目标签页管理器
     */
    init() {
        console.debug('📂 项目标签页管理器初始化');
        this.bindEvents();
        if (this.projects.length === 0) {
            this.createNewProject({ name: '未命名项目', silent: true });
        }
    }

    /**
     * 绑定事件监听器
     */
    bindEvents() {
        // 监听新建项目按钮
        const newProjectBtn = document.getElementById('new-project');
        if (newProjectBtn) {
            newProjectBtn.addEventListener('click', () => {
                this.createNewProject();
            });
        }
    }

    /**
     * 创建新项目
     * @param {Object} options - 项目选项
     * @returns {Object} 新建的项目对象
     */
    createNewProject(options = {}) {
        // 在创建新项目前，先保存当前项目的画布状态
        this.saveCurrentCanvasState();
        
        const projectId = this.generateProjectId();
        const projectName = options.name || `未命名项目${projectId}`;
        
        // 获取画布的默认位置（左下角）
        const defaultView = this.getDefaultCanvasView();
        const defaultPanX = defaultView.panX;
        const defaultPanY = defaultView.panY;
        
        const newProject = {
            id: projectId,
            name: projectName,
            path: null, // 新建项目暂时没有路径，保存时才会指定
            isModified: false,
            isSaved: false,
            isUnnamedDefault: projectName === '未命名项目',
            canvasData: {
                components: [],
                connections: [],
                zoom: 1.0,
                panX: defaultPanX, // 使用画布默认位置（左下角）
                panY: defaultPanY  // 使用画布默认位置（左下角）
            },
            createdAt: new Date().toISOString()
        };

        // 添加到项目列表
        this.projects.push(newProject);

        // 创建标签页UI
        this.addProjectTab(newProject);

        // 切换到新项目（会自动清空画布并恢复新项目的空状态）
        this.switchProject(projectId);

        console.log(`✅ 新建项目: ${projectName} (ID: ${projectId}), 默认位置: (${defaultPanX}, ${defaultPanY})`);
        if (!options.silent) {
            this.app.showNotification(`新建项目: ${projectName}`, 'success');
        }

        return newProject;
    }

    /**
     * 添加已存在的项目（从加载项目时调用）
     * @param {Object} projectData - 项目数据
     * @returns {Object} 项目对象
     */
    async addExistingProject(projectData) {
        // 在添加新项目前，先保存当前项目的画布状态
        this.saveCurrentCanvasState();
        
        const projectId = this.generateProjectId();
        const defaultView = this.getDefaultCanvasView();
        
        const postKey =
            projectData && typeof projectData.marketplacePostId === 'string'
                ? String(projectData.marketplacePostId).trim().toLowerCase()
                : '';
        const project = {
            id: projectId,
            name: projectData.projectName || '未命名项目',
            path: projectData.path,
            /** 与集市帖 id 一致（小写），用于防重复打开同一待审/已发布内存项目 */
            marketplacePostId: postKey || undefined,
            isModified: false,
            isSaved: true,
            // 保存完整的projectData供渲染使用
            projectData: projectData,
            // 单独保存画布数据（视图状态）
            canvasData: {
                components: [],
                connections: [],
                zoom: 1.0,
                panX: defaultView.panX,
                panY: defaultView.panY
            },
            createdAt: projectData.createdAt || new Date().toISOString()
        };

        // 添加到项目列表
        this.projects.push(project);

        // 创建标签页UI
        this.addProjectTab(project);

        // 切换到该项目
        await this.switchProject(projectId);

        console.log(`✅ 添加已存在项目: ${project.name} (ID: ${projectId})`);

        return project;
    }

    /**
     * 按路径查找已打开项目，避免重复打开同一项目标签。
     * @param {string} projectPath
     * @returns {Object|null}
     */
    findProjectByPath(projectPath) {
        const targetKey = this.normalizeProjectPathKey(projectPath);
        if (!targetKey) {
            return null;
        }
        return this.projects.find((project) =>
            this.normalizeProjectPathKey(project?.path || '') === targetKey
        ) || null;
    }

    /**
     * 按集市帖 id 查找已打开的内存会话项目（与 findProjectByPath 互补，避免 path 未写入或与 projectData 不一致时重复开签）。
     * @param {string} postId
     * @returns {Object|null}
     */
    findOpenMarketplaceSessionByPostId(postId) {
        const key = String(postId || '').trim().toLowerCase();
        if (!key) {
            return null;
        }
        const wantPathKey = this.normalizeProjectPathKey(`marketplace-session://${key}`);
        return (
            this.projects.find((project) => {
                if (this.normalizeProjectPathKey(project?.path || '') === wantPathKey) {
                    return true;
                }
                const pd = project?.projectData && typeof project.projectData === 'object' ? project.projectData : null;
                if (pd && this.normalizeProjectPathKey(String(pd.path || '')) === wantPathKey) {
                    return true;
                }
                const sid = String(project.marketplacePostId ?? pd?.marketplacePostId ?? '')
                    .trim()
                    .toLowerCase();
                if (sid && sid === key) {
                    return true;
                }
                const rawPath = String(project?.path || '').trim();
                const m = /^marketplace-session:\/\/(.+)$/i.exec(rawPath);
                if (m && String(m[1]).trim().toLowerCase() === key) {
                    return true;
                }
                return false;
            }) || null
        );
    }

    /**
     * 添加项目标签页UI
     * @param {Object} project - 项目对象
     */
    addProjectTab(project) {
        const tabsContainer = document.getElementById('project-tabs-container');
        if (!tabsContainer) {
            console.error('❌ 项目标签页容器未找到');
            return;
        }

        // 创建标签页元素
        const tab = document.createElement('div');
        tab.className = 'project-tab';
        tab.dataset.projectId = project.id;
        
        // 项目名称
        const nameSpan = document.createElement('span');
        nameSpan.className = 'project-tab-name';
        nameSpan.textContent = project.name;
        
        // 修改标识（未保存的变更）
        const modifiedIndicator = document.createElement('span');
        modifiedIndicator.className = 'project-tab-modified';
        modifiedIndicator.textContent = '●';
        modifiedIndicator.style.display = 'none';
        
        // 关闭按钮
        const closeBtn = document.createElement('button');
        closeBtn.className = 'project-tab-close';
        closeBtn.textContent = '×';
        closeBtn.title = '关闭项目';
        
        // 组装标签页
        tab.appendChild(nameSpan);
        tab.appendChild(modifiedIndicator);
        tab.appendChild(closeBtn);
        
        // 绑定事件
        tab.addEventListener('click', (e) => {
            if (e.target !== closeBtn) {
                this.switchProject(project.id);
            }
        });
        
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.closeProject(project.id);
        });
        
        // 添加到容器
        tabsContainer.appendChild(tab);
    }

    /**
     * 切换到指定项目
     * @param {number} projectId - 项目ID
     */
    async switchProject(projectId) {
        const project = this.projects.find(p => p.id === projectId);
        if (!project) {
            console.error(`❌ 项目未找到: ${projectId}`);
            return;
        }

        // 如果当前有活动项目，保存其画布状态
        if (this.activeProjectId !== null && this.activeProjectId !== projectId) {
            this.saveCurrentCanvasState();
        }

        // 更新活动项目
        this.activeProjectId = projectId;

        // 更新标签页UI
        this.updateTabsUI();

        // 恢复项目画布状态
        await this.restoreCanvasState(project);

        // 更新应用状态
        this.app.currentProject = project.path;
        this.app.isProjectModified = project.isModified;

        console.log(`🔄 切换到项目: ${project.name} (ID: ${projectId})`);
        document.dispatchEvent(
            new CustomEvent('fh-project-switched', {
                detail: {
                    projectId: project.id,
                    project
                }
            })
        );
    }

    /**
     * 获取画布默认视图（与 CanvasManager.resetView 保持一致）。
     * @returns {{ zoom: number, panX: number, panY: number }}
     */
    getDefaultCanvasView() {
        const panX = 50;
        const panY = window.canvasInstance?.canvas ? window.canvasInstance.canvas.height - 50 : 550;
        return {
            zoom: 1.0,
            panX,
            panY
        };
    }

    /**
     * 关闭项目
     * @param {number} projectId - 项目ID
     */
    async closeProject(projectId) {
        const project = this.projects.find(p => p.id === projectId);
        if (!project) {
            console.error(`❌ 项目未找到: ${projectId}`);
            return;
        }

        // 如果项目有未保存的更改，提示用户
        if (project.isModified) {
            const confirmed = await this.confirmCloseWithUnsavedChanges(project);
            if (!confirmed) {
                return;
            }
        }

        // 从项目列表中移除
        const index = this.projects.findIndex(p => p.id === projectId);
        if (index > -1) {
            this.projects.splice(index, 1);
        }

        // 移除标签页UI
        const tab = document.querySelector(`[data-project-id="${projectId}"]`);
        if (tab) {
            tab.remove();
        }

        // 如果关闭的是当前活动项目
        if (this.activeProjectId === projectId) {
            // 切换到其他项目或清空画布
            if (this.projects.length > 0) {
                this.switchProject(this.projects[0].id);
            } else {
                this.createNewProject({ name: '未命名项目', silent: true });
            }
        }

        console.log(`✅ 关闭项目: ${project.name} (ID: ${projectId})`);
        this.app.showNotification(`已关闭项目: ${project.name}`, 'info');
    }

    /**
     * 确认关闭包含未保存更改的项目
     * @param {Object} project - 项目对象
     * @returns {Promise<boolean>}
     */
    confirmCloseWithUnsavedChanges(project) {
        return new Promise((resolve) => {
            const confirmed = confirm(
                `项目 "${project.name}" 有未保存的更改。\n是否确定要关闭？`
            );
            resolve(confirmed);
        });
    }

    /**
     * 保存当前画布状态到活动项目
     */
    saveCurrentCanvasState() {
        if (this.activeProjectId === null) return;

        const activeProject = this.projects.find(p => p.id === this.activeProjectId);
        if (!activeProject) return;

        if (window.canvasInstance) {
            // 深拷贝画布状态，确保不共享引用
            activeProject.canvasData = {
                components: JSON.parse(JSON.stringify(window.canvasInstance.components || [])),
                connections: JSON.parse(JSON.stringify(window.canvasInstance.connections || [])),
                zoom: window.canvasInstance.scale || 1.0,
                panX: window.canvasInstance.offsetX || 0,
                panY: window.canvasInstance.offsetY || 0
            };
            if (typeof window.canvasInstance.getCodeEditorStateForProject === 'function') {
                activeProject.codeEditorState = window.canvasInstance.getCodeEditorStateForProject();
            }
            
            console.log(`💾 保存画布状态到项目: ${activeProject.name}, 元件数: ${activeProject.canvasData.components.length}, 连线数: ${activeProject.canvasData.connections.length}`);
        }
    }

    /**
     * 恢复项目的画布状态
     * @param {Object} project - 项目对象
     */
    async restoreCanvasState(project) {
        if (!window.canvasInstance) {
            console.error('❌ 画布实例未找到');
            return;
        }

        try {
            // 清空当前画布
            window.canvasInstance.clearComponents();
            
            const hasInMemoryCanvas =
                !!project.canvasData &&
                ((Array.isArray(project.canvasData.components) && project.canvasData.components.length > 0) ||
                    (Array.isArray(project.canvasData.connections) && project.canvasData.connections.length > 0));

            // 已保存项目：若当前已有内存快照，优先恢复内存（避免覆盖未保存改动）
            if (project.isSaved && project.path && window.app && project.projectData && !hasInMemoryCanvas) {
                console.log(`🔄 恢复已保存项目: ${project.name} from ${project.path}`);
                
                // 临时禁用画布修改标记
                const originalMarkFunction = window.canvasInstance.markProjectAsModified;
                window.canvasInstance.markProjectAsModified = () => {}; // 暂时禁用
                
                // 使用完整的projectData渲染
                await window.app.renderProjectToCanvas(project.projectData);
                
                // 恢复画布视图状态（如果之前有保存）
                if (project.canvasData.components && project.canvasData.components.length > 0) {
                    // 如果有保存的画布状态，使用保存的视图位置
                    window.canvasInstance.scale = project.canvasData.zoom || 1.0;
                    window.canvasInstance.offsetX = project.canvasData.panX || 50;
                    window.canvasInstance.offsetY = project.canvasData.panY || this.getDefaultCanvasView().panY;
                } else {
                    // 首次打开，使用默认视图位置
                    const defaultView = this.getDefaultCanvasView();
                    window.canvasInstance.scale = defaultView.zoom;
                    window.canvasInstance.offsetX = defaultView.panX;
                    window.canvasInstance.offsetY = defaultView.panY;
                }
                
                window.canvasInstance.draw();
                
                // 恢复标记函数
                window.canvasInstance.markProjectAsModified = originalMarkFunction;
                
            } else {
                // 新建/未保存，或已保存但有未保存内存改动：恢复内存状态
                console.log(`🔄 恢复项目画布状态: ${project.name}, 元件数: ${project.canvasData.components?.length || 0}, 连线数: ${project.canvasData.connections?.length || 0}`);
                
                // 深拷贝恢复元件和连线，避免共享引用
                if (project.canvasData.components && project.canvasData.components.length > 0) {
                    window.canvasInstance.components = JSON.parse(JSON.stringify(project.canvasData.components));
                }
                if (project.canvasData.connections && project.canvasData.connections.length > 0) {
                    window.canvasInstance.connections = JSON.parse(JSON.stringify(project.canvasData.connections));
                }

                // 恢复视图状态
                const defaultView = this.getDefaultCanvasView();
                window.canvasInstance.scale = project.canvasData.zoom || defaultView.zoom;
                window.canvasInstance.offsetX = project.canvasData.panX || defaultView.panX;
                window.canvasInstance.offsetY = project.canvasData.panY || defaultView.panY;

                // 重新渲染
                window.canvasInstance.draw();
            }
            if (typeof window.canvasInstance.restoreCodeEditorStateForProject === 'function') {
                window.canvasInstance.restoreCodeEditorStateForProject(project.codeEditorState || null);
            }

            console.log(`✅ 画布状态恢复完成: ${project.name}`);
        } catch (error) {
            console.error('❌ 恢复画布状态失败:', error);
        }
    }

    /**
     * 清空画布
     */
    clearCanvas() {
        if (window.canvasInstance) {
            window.canvasInstance.clearComponents();
        }
    }

    /**
     * 更新标签页UI状态
     */
    updateTabsUI() {
        const tabs = document.querySelectorAll('.project-tab');
        tabs.forEach(tab => {
            const projectId = parseInt(tab.dataset.projectId);
            const isActive = projectId === this.activeProjectId;
            
            if (isActive) {
                tab.classList.add('active');
            } else {
                tab.classList.remove('active');
            }
        });
    }

    /**
     * 标记项目为已修改
     * @param {number} projectId - 项目ID
     */
    markProjectAsModified(projectId) {
        const project = this.projects.find(p => p.id === projectId);
        if (!project) return;

        project.isModified = true;

        // 更新UI显示修改标识
        const tab = document.querySelector(`[data-project-id="${projectId}"]`);
        if (tab) {
            const indicator = tab.querySelector('.project-tab-modified');
            if (indicator) {
                indicator.style.display = 'inline';
            }
        }

        // 更新应用状态
        if (projectId === this.activeProjectId) {
            this.app.isProjectModified = true;
        }
    }

    /**
     * 标记项目为已保存
     * @param {number} projectId - 项目ID
     */
    markProjectAsSaved(projectId) {
        const project = this.projects.find(p => p.id === projectId);
        if (!project) return;

        project.isModified = false;
        project.isSaved = true;

        // 更新UI隐藏修改标识
        const tab = document.querySelector(`[data-project-id="${projectId}"]`);
        if (tab) {
            const indicator = tab.querySelector('.project-tab-modified');
            if (indicator) {
                indicator.style.display = 'none';
            }
        }

        // 更新应用状态
        if (projectId === this.activeProjectId) {
            this.app.isProjectModified = false;
        }
    }

    /**
     * 更新项目名称
     * @param {number} projectId - 项目ID
     * @param {string} newName - 新名称
     */
    updateProjectName(projectId, newName) {
        const project = this.projects.find(p => p.id === projectId);
        if (!project) return;

        project.name = newName;

        // 更新标签页UI
        const tab = document.querySelector(`[data-project-id="${projectId}"]`);
        if (tab) {
            const nameSpan = tab.querySelector('.project-tab-name');
            if (nameSpan) {
                nameSpan.textContent = newName;
            }
        }

        console.log(`✏️ 更新项目名称: ${newName} (ID: ${projectId})`);
    }

    /**
     * 更新项目路径
     * @param {number} projectId - 项目ID
     * @param {string} path - 项目路径
     */
    updateProjectPath(projectId, path) {
        const project = this.projects.find(p => p.id === projectId);
        if (!project) return;

        project.path = path;
        project.isSaved = true;

        // 更新应用状态
        if (projectId === this.activeProjectId) {
            this.app.currentProject = path;
        }

        console.log(`📁 更新项目路径: ${path} (ID: ${projectId})`);
    }

    /**
     * 获取当前活动项目
     * @returns {Object|null} 活动项目对象
     */
    getActiveProject() {
        if (this.activeProjectId === null) return null;
        return this.projects.find(p => p.id === this.activeProjectId);
    }

    /**
     * 生成项目ID
     * @returns {number} 项目ID
     */
    generateProjectId() {
        return ++this.projectIdCounter;
    }
}

// 导出类供其他模块使用
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ProjectTabsManager;
}

