/**
 * Fast Hardware - 个人中心 / 账号设置
 */

class AccountCenterManager {
    constructor() {
        this.authState = {
            isAuthenticated: false,
            email: '',
            id: '',
            displayName: '',
            role: 'user',
            provider: 'email',
            avatarUrl: ''
        };
        this.authMode = 'login';
        this.currentSubTab = 'account-settings';
        this.init();
    }

    /**
     * 初始化个人中心。
     * @returns {Promise<void>}
     */
    async init() {
        this.cacheElements();
        this.bindEvents();
        this.setAuthMode('login');
        await this.refreshAuthState();
    }

    /**
     * 缓存常用 DOM。
     */
    cacheElements() {
        this.avatarBtn = document.getElementById('nav-account-avatar');
        this.avatarFallback = document.getElementById('nav-avatar-fallback');
        this.authScreen = document.getElementById('account-auth-screen');
        this.authenticatedView = document.getElementById('account-authenticated-view');
        this.registerOnlyGroup = document.getElementById('account-register-only-group');
        this.feedbackEl = document.getElementById('account-auth-feedback');
        this.submitBtn = document.getElementById('account-submit-btn');
        this.agreementCheckbox = document.getElementById('account-agreement-checkbox');
        this.rememberCheckbox = document.getElementById('account-remember-checkbox');
        this.loginOnlySection = document.getElementById('account-login-only');
        this.passwordInput = document.getElementById('account-password-input');
        this.passwordVisibilityToggle = document.getElementById('account-password-visibility-toggle');
        this.projectsGrid = document.getElementById('my-projects-grid');
        this.storagePathEl = document.getElementById('my-projects-storage-path');
        this.communityTabBtn = document.getElementById('community-management-tab-btn');
        this.communityTabPanel = document.getElementById('community-management-sub-tab');
        this.docModal = document.getElementById('account-doc-modal');
        this.docModalTitle = document.getElementById('account-doc-modal-title');
        this.docModalBody = document.getElementById('account-doc-modal-body');
    }

    /**
     * 绑定事件。
     */
    bindEvents() {
        this.avatarBtn?.addEventListener('click', () => {
            this.switchMainTab('personal-center');
            this.switchSubTab('account-settings');
        });

        document.getElementById('account-login-mode-btn')?.addEventListener('click', () => {
            this.setAuthMode('login');
        });
        document.getElementById('account-register-mode-btn')?.addEventListener('click', () => {
            this.setAuthMode('register');
        });
        this.submitBtn?.addEventListener('click', async () => {
            await this.handleAuthAction(this.authMode);
        });
        this.passwordVisibilityToggle?.addEventListener('click', async () => {
            await this.togglePasswordVisibility();
        });

        document.getElementById('account-sign-out-btn')?.addEventListener('click', async () => {
            await this.signOut();
        });
        document.getElementById('account-switch-user-btn')?.addEventListener('click', async () => {
            await this.signOut(true);
            this.setAuthMode('login');
        });

        document.querySelectorAll('.account-doc-link').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const docName = String(btn.dataset.accountDoc || '').trim();
                if (docName) {
                    await this.openAccountDocument(docName);
                }
            });
        });
        document.getElementById('close-account-doc-modal')?.addEventListener('click', () => {
            this.closeAccountDocumentModal();
        });
        this.docModal?.querySelector('[data-close-account-doc-modal]')?.addEventListener('click', () => {
            this.closeAccountDocumentModal();
        });

        document.querySelectorAll('.account-sub-tab-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                const tabName = String(btn.dataset.accountSubTab || '').trim();
                if (tabName) {
                    this.switchSubTab(tabName);
                }
            });
        });

        document.getElementById('refresh-my-projects-btn')?.addEventListener('click', async () => {
            await this.refreshMyProjects();
        });

        document.addEventListener('tabSwitched', async (e) => {
            const tabName = e?.detail?.tabName;
            if (tabName === 'personal-center') {
                await this.refreshAuthState();
                if (this.currentSubTab === 'my-projects') {
                    await this.refreshMyProjects();
                }
            }
        });
    }

    /**
     * @param {'login'|'register'} mode
     */
    setAuthMode(mode) {
        this.authMode = mode;
        document.getElementById('account-login-mode-btn')?.classList.toggle('active', mode === 'login');
        document.getElementById('account-register-mode-btn')?.classList.toggle('active', mode === 'register');
        this.registerOnlyGroup?.classList.toggle('is-hidden', mode !== 'register');
        this.loginOnlySection?.classList.toggle('is-hidden', mode === 'register');
        if (this.submitBtn) {
            this.submitBtn.textContent = mode === 'register' ? '注册' : '登录';
        }
        this.setFeedback(
            mode === 'register'
                ? '注册成功后会自动登录，并在软件内提示注册成功。'
                : '登录后即可继续查看个人中心与创作数据。',
            false
        );
        this.resetPasswordVisibility();
    }

    /**
     * @param {string} tabName
     */
    switchMainTab(tabName) {
        if (window.mainApp && typeof window.mainApp.switchTab === 'function') {
            window.mainApp.switchTab(tabName);
        }
    }

    /**
     * @param {string} subTabName
     * @returns {Promise<void>}
     */
    async switchSubTab(subTabName) {
        this.currentSubTab = subTabName;
        document.querySelectorAll('.account-sub-tab-btn').forEach((btn) => {
            btn.classList.toggle('active', btn.dataset.accountSubTab === subTabName);
        });
        document.querySelectorAll('.account-sub-tab-content').forEach((panel) => {
            panel.classList.toggle('active', panel.id === `${subTabName}-sub-tab`);
        });
        if (subTabName === 'my-projects') {
            await this.refreshMyProjects();
        }
    }

    /**
     * @returns {{ displayName: string, email: string, password: string, rememberMe: boolean }}
     */
    collectAuthPayload() {
        return {
            displayName: String(document.getElementById('account-display-name-input')?.value || '').trim(),
            email: String(document.getElementById('account-email-input')?.value || '').trim(),
            password: String(document.getElementById('account-password-input')?.value || ''),
            rememberMe: Boolean(this.rememberCheckbox?.checked)
        };
    }

    /**
     * @param {'login'|'register'} action
     * @returns {Promise<void>}
     */
    async handleAuthAction(action) {
        if (!window.electronAPI) {
            this.setFeedback('当前 Electron API 不可用，无法进行账号操作。', true);
            return;
        }
        if (!this.agreementCheckbox?.checked) {
            this.setFeedback('请先勾选并同意用户协议与隐私政策。', true);
            return;
        }

        const payload = this.collectAuthPayload();
        if (!payload.email || !payload.password) {
            this.setFeedback('请输入邮箱与密码。', true);
            return;
        }
        if (payload.password.length < 6) {
            this.setFeedback('密码至少需要 6 位。', true);
            return;
        }

        this.setFeedback(action === 'register' ? '正在注册...' : '正在登录...', false);

        const result = action === 'register'
            ? await window.electronAPI.supabaseSignUpWithPassword(payload)
            : await window.electronAPI.supabaseSignInWithPassword(payload);

        if (!result?.success) {
            this.setFeedback(result?.error || '操作失败，请稍后重试。', true);
            this.showNotification(result?.error || '账号操作失败', 'error');
            return;
        }

        const successMsg = result?.message || (action === 'register' ? '账号已创建。' : '登录成功。');
        this.setFeedback(successMsg, false);
        this.showNotification(successMsg, 'success');

        if (action === 'login' || result?.state?.isAuthenticated) {
            this.clearPasswordInput();
        }

        await this.refreshAuthState();
    }

    /**
     * 清理密码输入框，避免敏感信息残留。
     */
    clearPasswordInput() {
        if (this.passwordInput) {
            this.passwordInput.value = '';
        }
        this.resetPasswordVisibility();
    }

    /**
     * 切换密码可见性。
     * @returns {Promise<void>}
     */
    async togglePasswordVisibility() {
        if (!this.passwordInput || !this.passwordVisibilityToggle) {
            return;
        }
        const isVisible = this.passwordInput.type === 'text';
        this.passwordInput.type = isVisible ? 'password' : 'text';
        await this.updateVisibilityToggleIcon(isVisible ? 'eye-off' : 'eye');
        this.passwordVisibilityToggle.setAttribute('aria-label', isVisible ? '显示密码' : '隐藏密码');
        this.passwordVisibilityToggle.setAttribute('title', isVisible ? '显示密码' : '隐藏密码');
    }

    /**
     * 更新密码显隐按钮图标。
     * @param {'eye'|'eye-off'} iconName
     * @returns {Promise<void>}
     */
    async updateVisibilityToggleIcon(iconName) {
        const iconImage = this.passwordVisibilityToggle?.querySelector('img[data-icon]');
        if (!iconImage) {
            return;
        }
        iconImage.dataset.icon = iconName;
        if (!window.electronAPI?.getAssetsPath) {
            return;
        }
        try {
            const assetsPath = await window.electronAPI.getAssetsPath();
            iconImage.src = `file://${assetsPath}/icon-${iconName}.svg`;
        } catch (error) {
            console.error('更新密码显隐图标失败:', error);
        }
    }

    /**
     * 恢复密码输入框为默认隐藏状态。
     */
    resetPasswordVisibility() {
        if (!this.passwordInput || !this.passwordVisibilityToggle) {
            return;
        }
        this.passwordInput.type = 'password';
        this.updateVisibilityToggleIcon('eye-off');
        this.passwordVisibilityToggle.setAttribute('aria-label', '显示密码');
        this.passwordVisibilityToggle.setAttribute('title', '显示密码');
    }

    /**
     * @param {string} message
     * @param {boolean} isError
     */
    setFeedback(message, isError) {
        if (!this.feedbackEl) {
            return;
        }
        this.feedbackEl.textContent = message;
        this.feedbackEl.style.color = isError ? '#c0392b' : '#66718c';
    }

    /**
     * @returns {Promise<void>}
     */
    async refreshAuthState() {
        if (!window.electronAPI?.getSupabaseAuthState) {
            return;
        }
        const state = await window.electronAPI.getSupabaseAuthState();
        this.authState = {
            isAuthenticated: Boolean(state?.isAuthenticated),
            email: String(state?.email || ''),
            id: String(state?.id || ''),
            displayName: String(state?.displayName || ''),
            role: String(state?.role || 'user'),
            provider: String(state?.provider || 'email'),
            avatarUrl: String(state?.avatarUrl || '')
        };
        this.renderAuthState();
    }

    /**
     * 渲染当前登录态。
     */
    renderAuthState() {
        const name = this.authState.displayName || this.authState.email || '未登录';
        const fallback = this.buildAvatarFallback(name);
        const isAuthenticated = this.authState.isAuthenticated;
        const isAdmin = this.authState.role === 'admin';

        this.avatarBtn?.classList.toggle('logged-in', isAuthenticated);
        if (this.avatarFallback) {
            this.avatarFallback.textContent = fallback;
        }
        const profileAvatarEl = document.getElementById('account-profile-avatar');
        if (profileAvatarEl) {
            profileAvatarEl.textContent = fallback;
        }
        this.authScreen?.classList.toggle('is-hidden', isAuthenticated);
        this.authenticatedView?.classList.toggle('is-hidden', !isAuthenticated);

        const displayNameText = isAuthenticated ? name : '未登录';
        const displayEmailText = isAuthenticated ? this.authState.email : '登录后可查看完整账号信息';
        const roleText = `角色：${isAuthenticated ? this.authState.role : '匿名用户'}`;
        const statusText = isAuthenticated ? 'authenticated' : 'anonymous';
        const providerText = this.getProviderDisplayName(this.authState.provider);

        const setText = (id, value) => {
            const el = document.getElementById(id);
            if (el) {
                el.textContent = value;
            }
        };

        setText('account-display-name', displayNameText);
        setText('account-display-email', displayEmailText);
        setText('account-display-role', roleText);
        setText('supabase-auth-status', statusText);
        setText('account-provider-value', providerText);
        setText('account-email-value', isAuthenticated ? this.authState.email : '-');
        setText('account-name-value', isAuthenticated ? displayNameText : '-');
        setText('account-role-value', isAuthenticated ? this.authState.role : 'anonymous');

        const signOutBtn = document.getElementById('account-sign-out-btn');
        if (signOutBtn) {
            signOutBtn.disabled = !isAuthenticated;
        }

        this.communityTabBtn?.classList.toggle('is-hidden', !isAdmin);
        this.communityTabPanel?.classList.toggle('is-hidden', !isAdmin);
        if (!isAdmin && this.currentSubTab === 'community-management') {
            this.switchSubTab('account-settings');
        }
    }

    /**
     * @param {string} provider
     * @returns {string}
     */
    getProviderDisplayName(provider) {
        const map = {
            email: '邮箱账号',
            github: 'GitHub',
            gitee: 'Gitee'
        };
        return map[String(provider || '').toLowerCase()] || '邮箱账号';
    }

    /**
     * @param {string} name
     * @returns {string}
     */
    buildAvatarFallback(name) {
        const trimmed = String(name || '').trim();
        if (!trimmed) {
            return 'FH';
        }
        const parts = trimmed.split(/\s+/).filter(Boolean);
        if (parts.length >= 2) {
            return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
        }
        return trimmed.slice(0, 2).toUpperCase();
    }

    /**
     * @param {boolean} [silent=false]
     * @returns {Promise<void>}
     */
    async signOut(silent = false) {
        if (!window.electronAPI?.supabaseSignOut) {
            return;
        }
        const result = await window.electronAPI.supabaseSignOut();
        if (!result?.success) {
            this.showNotification(result?.error || '退出登录失败', 'error');
            return;
        }
        if (!silent) {
            this.showNotification('已退出登录。', 'success');
        }
        this.agreementCheckbox && (this.agreementCheckbox.checked = false);
        this.setAuthMode('login');
        await this.refreshAuthState();
    }

    /**
     * 打开协议文档。
     * @param {'user-agreement'|'privacy-policy'} docName
     * @returns {Promise<void>}
     */
    async openAccountDocument(docName) {
        if (!window.electronAPI?.getAssetsPath || !window.electronAPI?.loadFile) {
            this.showNotification('当前环境无法加载协议文档。', 'warning');
            return;
        }
        try {
            const assetsPath = await window.electronAPI.getAssetsPath();
            const metaMap = {
                'user-agreement': {
                    title: '用户协议',
                    fileName: 'user-agreement.md'
                },
                'privacy-policy': {
                    title: '隐私政策',
                    fileName: 'privacy-policy.md'
                }
            };
            const meta = metaMap[docName];
            if (!meta) {
                return;
            }
            const targetPath = `${String(assetsPath || '').replace(/[\\/]+$/, '')}\\${meta.fileName}`;
            const raw = await window.electronAPI.loadFile(targetPath);
            if (this.docModalTitle) {
                this.docModalTitle.textContent = meta.title;
            }
            if (this.docModalBody) {
                const html = typeof window.marked?.parse === 'function'
                    ? window.marked.parse(raw)
                    : `<pre>${this.escapeHtml(raw)}</pre>`;
                this.docModalBody.innerHTML = html;
            }
            this.docModal?.classList.add('show');
        } catch (error) {
            this.showNotification(`协议文档加载失败：${error?.message || error}`, 'error');
        }
    }

    /**
     * 关闭协议文档模态窗。
     */
    closeAccountDocumentModal() {
        this.docModal?.classList.remove('show');
    }

    /**
     * 读取本地项目列表。
     * @returns {Promise<void>}
     */
    async refreshMyProjects() {
        if (!window.electronAPI?.getSettings || !window.electronAPI?.readDirectory) {
            return;
        }
        const storagePath = String((await window.electronAPI.getSettings('storagePath')) || '').trim();
        if (this.storagePathEl) {
            this.storagePathEl.textContent = storagePath || '未配置项目文件夹';
            this.storagePathEl.title = storagePath;
        }
        if (!storagePath) {
            this.renderProjectsEmpty('请先在系统设置中配置项目文件夹路径。');
            return;
        }

        const result = await window.electronAPI.readDirectory(storagePath);
        if (!result?.success) {
            this.renderProjectsEmpty(result?.error || '读取项目目录失败。');
            return;
        }

        const cards = [];
        for (const dir of result.directories || []) {
            const configPath = `${dir.path}\\circuit_config.json`;
            try {
                const raw = await window.electronAPI.loadFile(configPath);
                const config = JSON.parse(raw);
                cards.push({
                    folderName: dir.name,
                    path: dir.path,
                    projectName: String(config?.projectName || dir.name),
                    description: String(config?.description || '本地硬件方案项目').trim(),
                    componentCount: Array.isArray(config?.components) ? config.components.length : 0,
                    connectionCount: Array.isArray(config?.connections) ? config.connections.length : 0,
                    lastModified: String(config?.lastModified || config?.createdAt || '').trim()
                });
            } catch {
                cards.push({
                    folderName: dir.name,
                    path: dir.path,
                    projectName: dir.name,
                    description: '未找到标准项目配置，暂按普通项目文件夹展示。',
                    componentCount: 0,
                    connectionCount: 0,
                    lastModified: ''
                });
            }
        }

        if (!cards.length) {
            this.renderProjectsEmpty('当前项目目录下还没有可展示的本地项目。');
            return;
        }

        this.projectsGrid.innerHTML = cards
            .map((project) => {
                const timeText = project.lastModified
                    ? new Date(project.lastModified).toLocaleString('zh-CN', { hour12: false })
                    : '未记录';
                return `
                    <article class="my-project-card">
                        <div class="my-project-card-thumb">
                            <span>本地方案</span>
                            <strong>${this.escapeHtml(project.projectName)}</strong>
                            <span>${project.componentCount} 个元件 · ${project.connectionCount} 条连线</span>
                        </div>
                        <div class="my-project-card-body">
                            <h4>${this.escapeHtml(project.projectName)}</h4>
                            <p>${this.escapeHtml(project.description)}</p>
                            <div class="my-project-card-meta">
                                <span>目录：${this.escapeHtml(project.folderName)}</span>
                                <span>更新时间：${this.escapeHtml(timeText)}</span>
                            </div>
                        </div>
                    </article>
                `;
            })
            .join('');
    }

    /**
     * @param {string} message
     */
    renderProjectsEmpty(message) {
        if (!this.projectsGrid) {
            return;
        }
        this.projectsGrid.innerHTML = `<div class="account-empty-state">${this.escapeHtml(message)}</div>`;
    }

    /**
     * @param {string} text
     * @returns {string}
     */
    escapeHtml(text) {
        return String(text || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /**
     * @param {string} message
     * @param {'info'|'success'|'warning'|'error'} [type='info']
     */
    showNotification(message, type = 'info') {
        if (window.mainApp && typeof window.mainApp.showNotification === 'function') {
            window.mainApp.showNotification(message, type);
            return;
        }
        console.log(`[account-center][${type}] ${message}`);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.accountCenterManager = new AccountCenterManager();
});
