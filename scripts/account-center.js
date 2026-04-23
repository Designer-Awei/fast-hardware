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
        this.googleOauthBtn = document.getElementById('account-google-oauth-btn');
        this.avatarTrigger = document.getElementById('account-profile-avatar-trigger');
        this.editProfileBtn = document.getElementById('account-edit-profile-btn');
        this.profileNameInput = document.getElementById('account-profile-name-input');
        this.profileModal = document.getElementById('account-profile-modal');
        this.avatarFileInput = document.getElementById('account-avatar-file-input');
        this.avatarModal = document.getElementById('account-avatar-modal');
        this.avatarCanvas = document.getElementById('account-avatar-crop-canvas');
        this.avatarZoomRange = document.getElementById('account-avatar-zoom-range');
        this.avatarSaveBtn = document.getElementById('account-avatar-save-btn');
        this.loginOnlySection = document.getElementById('account-login-only');
        this.passwordInput = document.getElementById('account-password-input');
        this.passwordVisibilityToggle = document.getElementById('account-password-visibility-toggle');
        this.projectsGrid = document.getElementById('my-projects-grid');
        this.communityTabBtn = document.getElementById('community-management-tab-btn');
        this.communityTabPanel = document.getElementById('community-management-sub-tab');
        this.docModal = document.getElementById('account-doc-modal');
        this.docModalTitle = document.getElementById('account-doc-modal-title');
        this.docModalBody = document.getElementById('account-doc-modal-body');
        this.avatarCropState = null;
        this.projectBackupMap = new Map();
        this.uploadingProjectPaths = new Set();
        this.revokingProjectPaths = new Set();
        this.lastProjectStoragePath = '';
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
        this.googleOauthBtn?.addEventListener('click', async () => {
            await this.handleOAuthSignIn('google');
        });
        this.avatarTrigger?.addEventListener('click', () => {
            this.avatarFileInput?.click();
        });
        this.avatarTrigger?.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                this.avatarFileInput?.click();
            }
        });
        this.editProfileBtn?.addEventListener('click', () => {
            this.openProfileModal();
        });
        document.getElementById('account-profile-cancel-btn')?.addEventListener('click', () => {
            this.closeProfileModal();
        });
        document.getElementById('close-account-profile-modal')?.addEventListener('click', () => {
            this.closeProfileModal();
        });
        this.profileModal?.querySelector('[data-close-account-profile-modal]')?.addEventListener('click', () => {
            this.closeProfileModal();
        });
        document.getElementById('account-profile-save-btn')?.addEventListener('click', async () => {
            await this.handleDisplayNameSave();
        });
        this.profileNameInput?.addEventListener('keydown', async (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                await this.handleDisplayNameSave();
            }
        });
        this.avatarFileInput?.addEventListener('change', async (event) => {
            await this.handleAvatarFilePicked(event);
        });
        this.avatarZoomRange?.addEventListener('input', () => {
            this.updateAvatarScaleFromSlider();
        });
        this.avatarSaveBtn?.addEventListener('click', async () => {
            await this.handleAvatarSave();
        });
        document.getElementById('close-account-avatar-modal')?.addEventListener('click', () => {
            this.closeAvatarModal();
        });
        document.getElementById('account-avatar-cancel-btn')?.addEventListener('click', () => {
            this.closeAvatarModal();
        });
        this.avatarModal?.querySelector('[data-close-account-avatar-modal]')?.addEventListener('click', () => {
            this.closeAvatarModal();
        });

        document.getElementById('account-sign-out-btn')?.addEventListener('click', async () => {
            await this.signOut();
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
        this.bindAvatarCanvasDragEvents();

        document.querySelectorAll('.account-sub-tab-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                const tabName = String(btn.dataset.accountSubTab || '').trim();
                if (tabName) {
                    this.switchSubTab(tabName);
                }
            });
        });

        this.projectsGrid?.addEventListener('click', async (event) => {
            const shareBtn = event.target?.closest?.('[data-project-share]');
            if (shareBtn) {
                const projectName = String(shareBtn.getAttribute('data-project-name') || '').trim() || '当前项目';
                this.showNotification(`分享功能预留中：${projectName}`, 'info');
                return;
            }
            const backupBtn = event.target?.closest?.('[data-project-backup]');
            if (backupBtn) {
                const projectPath = String(backupBtn.getAttribute('data-project-path') || '').trim();
                const projectName = String(backupBtn.getAttribute('data-project-name') || '').trim();
                await this.uploadProjectBackup(projectPath, projectName);
                return;
            }
            const revokeBtn = event.target?.closest?.('[data-project-backup-delete]');
            if (revokeBtn) {
                const projectPath = String(revokeBtn.getAttribute('data-project-path') || '').trim();
                const projectName = String(revokeBtn.getAttribute('data-project-name') || '').trim();
                await this.deleteProjectBackup(projectPath, projectName);
                return;
            }
            const openBtn = event.target?.closest?.('[data-project-open]');
            if (openBtn) {
                const projectPath = String(openBtn.getAttribute('data-project-path') || '').trim();
                await this.openProjectFromCard(projectPath);
                return;
            }
            const downloadBtn = event.target?.closest?.('[data-project-backup-download]');
            if (downloadBtn) {
                const projectKey = String(downloadBtn.getAttribute('data-project-key') || '').trim();
                const projectName = String(downloadBtn.getAttribute('data-project-name') || '').trim();
                await this.downloadProjectBackup(projectKey, projectName);
            }
        });
        window.electronAPI?.onSupabaseAuthCallback?.(async (payload) => {
            const message = this.localizeAuthMessage(String(payload?.message || '').trim());
            if (message) {
                this.setFeedback(message, !payload?.success);
                this.showNotification(message, payload?.success ? 'success' : 'error');
            }
            await this.refreshAuthState();
            this.switchMainTab('personal-center');
            this.switchSubTab('account-settings');
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
            const errorMessage = this.formatResultError(result, '操作失败，请稍后重试。');
            this.setFeedback(errorMessage, true);
            this.showNotification(errorMessage, 'error');
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
     * @param {'google'|'github'} provider
     * @returns {Promise<void>}
     */
    async handleOAuthSignIn(provider) {
        if (!window.electronAPI?.supabaseSignInWithOAuth) {
            this.setFeedback('当前 Electron API 不可用，无法发起第三方登录。', true);
            return;
        }
        if (!this.agreementCheckbox?.checked) {
            this.setFeedback('请先勾选并同意用户协议与隐私政策。', true);
            return;
        }
        this.setFeedback('正在打开浏览器，请完成第三方登录...', false);
        const result = await window.electronAPI.supabaseSignInWithOAuth({
            provider,
            rememberMe: Boolean(this.rememberCheckbox?.checked)
        });
        if (!result?.success) {
            const errorMessage = this.formatResultError(result, '第三方登录启动失败。');
            this.setFeedback(errorMessage, true);
            this.showNotification(errorMessage, 'error');
            return;
        }
        const message = String(result?.message || '已打开浏览器，请完成第三方登录。').trim();
        this.setFeedback(message, false);
        this.showNotification(message, 'info');
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
     * @returns {Promise<void>}
     */
    async handleDisplayNameSave() {
        if (!window.electronAPI?.supabaseUpdateProfile) {
            this.showNotification('当前环境不支持昵称更新。', 'warning');
            return;
        }
        const displayName = String(this.profileNameInput?.value || '').trim();
        if (!displayName) {
            this.showNotification('昵称不能为空。', 'warning');
            return;
        }
        try {
            const result = await window.electronAPI.supabaseUpdateProfile({ displayName });
            if (!result?.success) {
                const errorMessage = this.formatResultError(result, '昵称更新失败，请稍后重试。');
                this.showNotification(errorMessage, 'error');
                return;
            }
            this.showNotification(String(result?.message || '昵称已更新。'), 'success');
            this.closeProfileModal();
            await this.refreshAuthState();
        } catch (error) {
            const message = this.localizeAuthMessage(String(error?.message || error || ''));
            this.showNotification(message || '昵称更新失败，请稍后重试。', 'error');
        }
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
        if (this.avatarTrigger) {
            this.avatarTrigger.style.pointerEvents = isAuthenticated ? 'auto' : 'none';
            this.avatarTrigger.setAttribute('aria-disabled', isAuthenticated ? 'false' : 'true');
            this.avatarTrigger.title = isAuthenticated ? '编辑头像' : '登录后可编辑头像';
        }

        const displayNameText = isAuthenticated ? name : '未登录';
        const displayEmailText = isAuthenticated ? this.authState.email : '登录后可查看完整账号信息';
        const roleLabel = isAuthenticated ? this.mapRoleLabel(this.authState.role) : '匿名用户';
        const roleText = `角色：${roleLabel}`;
        const statusText = isAuthenticated ? '已登录' : '未登录';
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
        setText('account-role-value', isAuthenticated ? roleLabel : '未登录');
        if (this.profileNameInput) {
            this.profileNameInput.value = isAuthenticated ? displayNameText : '';
            this.profileNameInput.disabled = !isAuthenticated;
        }
        this.applyAvatarState(isAuthenticated ? this.authState.avatarUrl : '', fallback);

        const signOutBtn = document.getElementById('account-sign-out-btn');
        if (signOutBtn) {
            signOutBtn.disabled = !isAuthenticated;
        }
        if (this.editProfileBtn) {
            this.editProfileBtn.disabled = !isAuthenticated;
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
            google: 'Google 账号',
            github: 'GitHub 账号',
            gitee: 'Gitee 账号'
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
            this.showNotification(this.formatResultError(result, '退出登录失败。'), 'error');
            return;
        }
        if (!silent) {
            this.showNotification('已退出登录。', 'success');
        }
        this.agreementCheckbox && (this.agreementCheckbox.checked = false);
        this.setAuthMode('login');
        this.closeAvatarModal();
        this.closeProfileModal();
        await this.refreshAuthState();
    }

    /**
     * @returns {void}
     */
    openProfileModal() {
        if (!this.authState.isAuthenticated) {
            return;
        }
        if (this.profileNameInput) {
            this.profileNameInput.value = this.authState.displayName || this.authState.email || '';
            this.profileNameInput.focus();
            this.profileNameInput.select();
        }
        this.profileModal?.classList.add('show');
    }

    /**
     * @returns {void}
     */
    closeProfileModal() {
        this.profileModal?.classList.remove('show');
    }

    /**
     * @param {string} avatarUrl
     * @param {string} fallback
     */
    applyAvatarState(avatarUrl, fallback) {
        const navFallback = document.getElementById('nav-avatar-fallback');
        const profileAvatarEl = document.getElementById('account-profile-avatar');
        const safeUrl = String(avatarUrl || '').trim();
        const hasAvatar = safeUrl.length > 0;
        if (navFallback) {
            navFallback.textContent = fallback;
            navFallback.style.backgroundImage = hasAvatar ? `url("${safeUrl}")` : '';
            navFallback.style.color = hasAvatar ? 'transparent' : '';
            navFallback.style.textIndent = hasAvatar ? '-9999px' : '';
        }
        if (profileAvatarEl) {
            profileAvatarEl.textContent = fallback;
            profileAvatarEl.style.backgroundImage = hasAvatar ? `url("${safeUrl}")` : '';
            profileAvatarEl.style.backgroundSize = hasAvatar ? 'cover' : '';
            profileAvatarEl.style.backgroundPosition = hasAvatar ? 'center' : '';
            profileAvatarEl.style.color = hasAvatar ? 'transparent' : '';
            profileAvatarEl.style.textIndent = hasAvatar ? '-9999px' : '';
        }
    }

    /**
     * @returns {void}
     */
    bindAvatarCanvasDragEvents() {
        if (!this.avatarCanvas) {
            return;
        }
        let isDragging = false;
        let lastX = 0;
        let lastY = 0;
        this.avatarCanvas.addEventListener('pointerdown', (event) => {
            if (!this.avatarCropState) {
                return;
            }
            isDragging = true;
            lastX = event.clientX;
            lastY = event.clientY;
            this.avatarCanvas.classList.add('is-dragging');
            this.avatarCanvas.setPointerCapture(event.pointerId);
        });
        this.avatarCanvas.addEventListener('pointermove', (event) => {
            if (!isDragging || !this.avatarCropState) {
                return;
            }
            const dx = event.clientX - lastX;
            const dy = event.clientY - lastY;
            lastX = event.clientX;
            lastY = event.clientY;
            this.avatarCropState.offsetX += dx;
            this.avatarCropState.offsetY += dy;
            this.clampAvatarOffset();
            this.drawAvatarCropCanvas();
        });
        const release = (event) => {
            if (isDragging) {
                isDragging = false;
                this.avatarCanvas.classList.remove('is-dragging');
                if (typeof event.pointerId === 'number') {
                    this.avatarCanvas.releasePointerCapture(event.pointerId);
                }
            }
        };
        this.avatarCanvas.addEventListener('pointerup', release);
        this.avatarCanvas.addEventListener('pointercancel', release);
    }

    /**
     * @param {Event} event
     * @returns {Promise<void>}
     */
    async handleAvatarFilePicked(event) {
        const file = event?.target?.files?.[0];
        if (!file) {
            return;
        }
        if (file.size > 1024 * 1024) {
            this.showNotification('头像文件需小于 1MB。', 'warning');
            event.target.value = '';
            return;
        }
        if (!String(file.type || '').startsWith('image/')) {
            this.showNotification('请选择图片文件。', 'warning');
            event.target.value = '';
            return;
        }
        const dataUrl = await this.readFileAsDataUrl(file);
        const image = await this.loadImage(dataUrl);
        this.avatarCropState = {
            image,
            minScale: Math.max(280 / image.naturalWidth, 280 / image.naturalHeight),
            scale: 1,
            offsetX: 0,
            offsetY: 0
        };
        this.avatarCropState.scale = this.avatarCropState.minScale;
        this.syncAvatarSlider();
        this.clampAvatarOffset();
        this.openAvatarModal();
        this.drawAvatarCropCanvas();
        event.target.value = '';
    }

    /**
     * @returns {void}
     */
    openAvatarModal() {
        this.avatarModal?.classList.add('show');
    }

    /**
     * @returns {void}
     */
    closeAvatarModal() {
        this.avatarModal?.classList.remove('show');
        this.avatarCropState = null;
    }

    /**
     * @returns {void}
     */
    syncAvatarSlider() {
        if (!this.avatarZoomRange || !this.avatarCropState) {
            return;
        }
        this.avatarZoomRange.min = String(this.avatarCropState.minScale);
        this.avatarZoomRange.max = String(Math.max(this.avatarCropState.minScale, this.avatarCropState.minScale * 3));
        this.avatarZoomRange.value = String(this.avatarCropState.scale);
    }

    /**
     * @returns {void}
     */
    updateAvatarScaleFromSlider() {
        if (!this.avatarCropState || !this.avatarZoomRange) {
            return;
        }
        const value = Number(this.avatarZoomRange.value || this.avatarCropState.minScale);
        this.avatarCropState.scale = Math.max(this.avatarCropState.minScale, value);
        this.clampAvatarOffset();
        this.drawAvatarCropCanvas();
    }

    /**
     * @returns {void}
     */
    clampAvatarOffset() {
        if (!this.avatarCropState) {
            return;
        }
        const cropSize = 280;
        const imageWidth = this.avatarCropState.image.naturalWidth * this.avatarCropState.scale;
        const imageHeight = this.avatarCropState.image.naturalHeight * this.avatarCropState.scale;
        const limitX = Math.max(0, (imageWidth - cropSize) / 2);
        const limitY = Math.max(0, (imageHeight - cropSize) / 2);
        this.avatarCropState.offsetX = Math.min(limitX, Math.max(-limitX, this.avatarCropState.offsetX));
        this.avatarCropState.offsetY = Math.min(limitY, Math.max(-limitY, this.avatarCropState.offsetY));
    }

    /**
     * @returns {void}
     */
    drawAvatarCropCanvas() {
        if (!this.avatarCanvas || !this.avatarCropState) {
            return;
        }
        const ctx = this.avatarCanvas.getContext('2d');
        if (!ctx) {
            return;
        }
        const cropSize = 280;
        const imageWidth = this.avatarCropState.image.naturalWidth * this.avatarCropState.scale;
        const imageHeight = this.avatarCropState.image.naturalHeight * this.avatarCropState.scale;
        const x = (cropSize - imageWidth) / 2 + this.avatarCropState.offsetX;
        const y = (cropSize - imageHeight) / 2 + this.avatarCropState.offsetY;
        ctx.clearRect(0, 0, cropSize, cropSize);
        ctx.drawImage(this.avatarCropState.image, x, y, imageWidth, imageHeight);
    }

    /**
     * @returns {Promise<void>}
     */
    async handleAvatarSave() {
        if (!window.electronAPI?.supabaseUploadAvatar) {
            this.showNotification('当前环境不支持头像上传。', 'warning');
            return;
        }
        if (!this.avatarCanvas || !this.avatarCropState) {
            return;
        }
        const dataUrl = this.avatarCanvas.toDataURL('image/webp', 0.92);
        if (this.estimateDataUrlSize(dataUrl) > 1024 * 1024) {
            this.showNotification('裁剪后的头像仍大于 1MB，请缩小图片后重试。', 'warning');
            return;
        }
        this.avatarSaveBtn && (this.avatarSaveBtn.disabled = true);
        try {
            const result = await window.electronAPI.supabaseUploadAvatar({ dataUrl });
            if (!result?.success) {
                this.showNotification(this.formatResultError(result, '头像上传失败，请稍后重试。'), 'error');
                return;
            }
            this.showNotification(String(result?.message || '头像更新成功。'), 'success');
            this.closeAvatarModal();
            await this.refreshAuthState();
        } catch (error) {
            const message = this.localizeAuthMessage(String(error?.message || error || ''));
            this.showNotification(message || '头像上传失败，请稍后重试。', 'error');
        } finally {
            this.avatarSaveBtn && (this.avatarSaveBtn.disabled = false);
        }
    }

    /**
     * @param {File} file
     * @returns {Promise<string>}
     */
    readFileAsDataUrl(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = () => reject(new Error('读取图片失败，请重试。'));
            reader.readAsDataURL(file);
        });
    }

    /**
     * @param {string} dataUrl
     * @returns {Promise<HTMLImageElement>}
     */
    loadImage(dataUrl) {
        return new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = () => reject(new Error('加载图片失败，请重试。'));
            image.src = dataUrl;
        });
    }

    /**
     * @param {string} dataUrl
     * @returns {number}
     */
    estimateDataUrlSize(dataUrl) {
        const base64 = String(dataUrl || '').split(',')[1] || '';
        return Math.floor((base64.length * 3) / 4);
    }

    /**
     * @param {{ error?: string }} result
     * @param {string} fallback
     * @returns {string}
     */
    formatResultError(result, fallback) {
        const message = String(result?.error || '').trim();
        if (!message) {
            return fallback;
        }
        return this.localizeAuthMessage(message);
    }

    /**
     * @param {string} message
     * @returns {string}
     */
    localizeAuthMessage(message) {
        const text = String(message || '').trim();
        const lower = text.toLowerCase();
        if (!text) return '操作失败，请稍后重试。';
        if (lower.includes('no handler registered')) {
            return '主进程未加载头像上传接口，请完全退出应用后重新启动再试。';
        }
        if (lower.includes('invalid login credentials')) return '邮箱或密码错误，请重新输入。';
        if (lower.includes('email not confirmed')) return '邮箱尚未验证，请先完成邮箱验证。';
        if (lower.includes('user already registered')) return '该邮箱已注册，请直接登录。';
        if (lower.includes('network') || lower.includes('fetch')) return '网络异常，请检查网络后重试。';
        if (lower.includes('jwt') || lower.includes('token')) return '登录状态已失效，请重新登录。';
        if (lower.includes('row-level security') || lower.includes('permission')) return '权限不足，当前操作被拒绝。';
        return text;
    }

    /**
     * @param {string} role
     * @returns {string}
     */
    mapRoleLabel(role) {
        const key = String(role || '').toLowerCase();
        if (key === 'admin') return '管理员';
        if (key === 'user') return '普通用户';
        if (key === 'anonymous' || key === '') return '匿名用户';
        return String(role || '用户');
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
        this.lastProjectStoragePath = storagePath;
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
        this.projectBackupMap = await this.fetchProjectBackupMap(cards.map((item) => item.path));
        const cloudOnlyCards = this.buildCloudOnlyBackupCards(cards);

        this.projectsGrid.innerHTML = [...cards, ...cloudOnlyCards]
            .map((project) => {
                const isCloudOnly = Boolean(project.isCloudOnly);
                const timeText = project.lastModified
                    ? new Date(project.lastModified).toLocaleString('zh-CN', { hour12: false })
                    : '未记录';
                const backupInfo = this.projectBackupMap.get(this.normalizeProjectPath(project.path)) || null;
                const hasBackup = Boolean(backupInfo?.backupAt);
                const backupText = hasBackup
                    ? `备份状态：已备份 - ${this.escapeHtml(this.formatDateTime(backupInfo.backupAt))}`
                    : '备份状态：无备份';
                const backupBtnText = hasBackup ? '更新备份' : '上传备份';
                const backupIcon = hasBackup ? 'refresh' : 'upload-cloud';
                const revokeDisabled = hasBackup ? '' : 'disabled';
                const backupButtonDisabled = isCloudOnly ? 'disabled' : '';
                const openButtonDisabled = isCloudOnly ? 'disabled' : '';
                return `
                    <article class="my-project-card ${isCloudOnly ? 'my-project-card-cloud-only' : ''}">
                        <div class="my-project-card-thumb">
                            <button
                                type="button"
                                class="my-project-card-share-btn"
                                data-project-share="1"
                                data-project-name="${this.escapeHtml(project.projectName)}"
                                title="分享（预留）"
                                aria-label="分享（预留）"
                            >
                                <img src="" alt="" width="22" height="22" data-icon="share-2">
                            </button>
                            <strong>${this.escapeHtml(project.projectName)}</strong>
                            <span>${project.componentCount} 个元件 · ${project.connectionCount} 条连线</span>
                        </div>
                        <div class="my-project-card-body">
                            <h4>${backupText}</h4>
                            <p>描述：${this.escapeHtml(project.description)}</p>
                            <div class="my-project-card-meta">
                                <span>更新时间：${this.escapeHtml(timeText)}</span>
                            </div>
                            <div class="my-project-card-actions">
                                <button
                                    type="button"
                                    class="my-project-card-backup-btn"
                                    data-project-backup="1"
                                    data-project-name="${this.escapeHtml(project.projectName)}"
                                    data-project-path="${this.escapeHtml(project.path)}"
                                    ${backupButtonDisabled}
                                >
                                    <img src="" alt="" width="18" height="18" data-icon="${backupIcon}">
                                    <span class="my-project-card-btn-label">${backupBtnText}</span>
                                    <span class="my-project-card-btn-spinner" aria-hidden="true"></span>
                                </button>
                                <button
                                    type="button"
                                    class="my-project-card-revoke-btn"
                                    data-project-backup-delete="1"
                                    data-project-name="${this.escapeHtml(project.projectName)}"
                                    data-project-path="${this.escapeHtml(project.path)}"
                                    ${revokeDisabled}
                                >
                                    <img src="" alt="" width="18" height="18" data-icon="trash-2">
                                    <span class="my-project-card-btn-label">撤销备份</span>
                                    <span class="my-project-card-btn-spinner" aria-hidden="true"></span>
                                </button>
                                ${isCloudOnly ? `
                                <button
                                    type="button"
                                    class="my-project-card-download-btn"
                                    data-project-backup-download="1"
                                    data-project-key="${this.escapeHtml(String(project.projectKey || ''))}"
                                    data-project-name="${this.escapeHtml(project.projectName)}"
                                >
                                    <img src="" alt="" width="18" height="18" data-icon="download">
                                    <span>下载备份</span>
                                </button>
                                ` : `
                                <button
                                    type="button"
                                    class="my-project-card-open-btn"
                                    data-project-open="1"
                                    data-project-path="${this.escapeHtml(project.path)}"
                                    ${openButtonDisabled}
                                >
                                    <img src="" alt="" width="18" height="18" data-icon="folder-open">
                                    <span>打开项目</span>
                                </button>
                                `}
                            </div>
                        </div>
                    </article>
                `;
            })
            .join('');
        if (window.mainApp && typeof window.mainApp.initializeIconPaths === 'function') {
            await window.mainApp.initializeIconPaths();
        }
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
     * @param {string[]} projectPaths
     * @returns {Promise<Map<string, { backupAt: string, fileCount: number }>>}
     */
    async fetchProjectBackupMap(projectPaths) {
        if (!window.electronAPI?.supabaseListProjectBackups) {
            return new Map();
        }
        try {
            const normalizedPaths = Array.isArray(projectPaths)
                ? projectPaths.map((item) => this.normalizeProjectPath(item)).filter(Boolean)
                : [];
            const result = await window.electronAPI.supabaseListProjectBackups(
                normalizedPaths.length ? { projectPaths: normalizedPaths } : {}
            );
            if (!result?.success || !Array.isArray(result.backups)) {
                return new Map();
            }
            const map = new Map();
            for (const item of result.backups) {
                const normalizedPath = this.normalizeProjectPath(item?.projectPath);
                const nameKey = String(item?.projectName || '').trim().toLowerCase();
                const backupInfo = {
                    backupAt: String(item?.backupAt || ''),
                    fileCount: Number(item?.fileCount || 0),
                    projectName: String(item?.projectName || '').trim(),
                    projectKey: String(item?.projectKey || '').trim(),
                    lastModified: String(item?.lastModified || '').trim(),
                    projectPath: normalizedPath
                };
                if (normalizedPath) {
                    map.set(normalizedPath, backupInfo);
                }
                if (nameKey && !map.has(nameKey)) {
                    map.set(nameKey, backupInfo);
                }
            }
            return map;
        } catch {
            return new Map();
        }
    }

    /**
     * @param {Array<{ projectName: string, path: string }>} localCards
     * @returns {Array<{ folderName: string, path: string, projectName: string, description: string, componentCount: number, connectionCount: number, lastModified: string, projectKey?: string, isCloudOnly: boolean }>}
     */
    buildCloudOnlyBackupCards(localCards) {
        const localNameSet = new Set(
            localCards
                .map((item) => String(item?.projectName || '').trim().toLowerCase())
                .filter(Boolean)
        );
        const cloudCards = [];
        const seenProjectKeys = new Set();
        for (const backupInfo of this.projectBackupMap.values()) {
            const projectName = String(backupInfo?.projectName || '').trim();
            const projectKey = String(backupInfo?.projectKey || '').trim();
            if (!projectName || !projectKey || seenProjectKeys.has(projectKey)) {
                continue;
            }
            seenProjectKeys.add(projectKey);
            if (localNameSet.has(projectName.toLowerCase())) {
                continue;
            }
            cloudCards.push({
                folderName: projectName,
                path: '',
                projectName,
                description: '本地项目缺失，仅保留云端备份，可下载恢复到本地项目目录。',
                componentCount: 0,
                connectionCount: 0,
                lastModified: String(backupInfo?.backupAt || ''),
                projectKey,
                isCloudOnly: true
            });
        }
        return cloudCards;
    }

    /**
     * @param {string} projectPath
     * @param {string} projectName
     * @returns {Promise<void>}
     */
    async uploadProjectBackup(projectPath, projectName) {
        const normalizedPath = this.normalizeProjectPath(projectPath);
        if (!normalizedPath) {
            this.showNotification('项目路径无效，无法上传备份。', 'warning');
            return;
        }
        if (!window.electronAPI?.supabaseUploadProjectBackup) {
            this.showNotification('当前环境不支持上传备份。', 'warning');
            return;
        }
        if (this.uploadingProjectPaths.has(normalizedPath)) {
            return;
        }
        this.uploadingProjectPaths.add(normalizedPath);
        this.setBackupButtonLoading(normalizedPath, true);
        const existing = this.projectBackupMap.get(normalizedPath) || this.projectBackupMap.get(String(projectName || '').trim().toLowerCase());
        this.showNotification(existing?.backupAt ? '正在更新备份，请稍候...' : '正在上传备份，请稍候...', 'info');
        try {
            const result = await window.electronAPI.supabaseUploadProjectBackup({
                projectPath: normalizedPath,
                projectName: String(projectName || '').trim() || undefined
            });
            if (!result?.success) {
                this.showNotification(this.formatResultError(result, '上传备份失败，请稍后重试。'), 'error');
                return;
            }
            this.showNotification(String(result?.message || '项目备份上传成功。'), 'success');
            await this.refreshMyProjects();
        } finally {
            this.uploadingProjectPaths.delete(normalizedPath);
            this.setBackupButtonLoading(normalizedPath, false);
        }
    }

    /**
     * @param {string} projectPath
     * @param {string} projectName
     * @returns {Promise<void>}
     */
    async deleteProjectBackup(projectPath, projectName) {
        const normalizedPath = this.normalizeProjectPath(projectPath);
        if (!normalizedPath) {
            this.showNotification('项目路径无效，无法撤销备份。', 'warning');
            return;
        }
        const existing = this.projectBackupMap.get(normalizedPath) || this.projectBackupMap.get(String(projectName || '').trim().toLowerCase());
        if (!existing?.backupAt) {
            this.showNotification('当前项目暂无云端备份。', 'info');
            return;
        }
        if (!window.electronAPI?.supabaseDeleteProjectBackup) {
            this.showNotification('当前环境不支持撤销备份。', 'warning');
            return;
        }
        const confirmed = window.confirm(`确认撤销「${projectName || '当前项目'}」的云端备份吗？该操作不可恢复。`);
        if (!confirmed) {
            return;
        }
        if (this.revokingProjectPaths.has(normalizedPath)) {
            return;
        }
        this.revokingProjectPaths.add(normalizedPath);
        this.setRevokeButtonLoading(normalizedPath, true);
        this.showNotification('正在撤销云端备份，请稍候...', 'info');
        try {
            const result = await window.electronAPI.supabaseDeleteProjectBackup({ projectPath: normalizedPath });
            if (!result?.success) {
                this.showNotification(this.formatResultError(result, '撤销备份失败，请稍后重试。'), 'error');
                return;
            }
            this.showNotification(String(result?.message || '已撤销当前项目备份。'), 'success');
            await this.refreshMyProjects();
        } finally {
            this.revokingProjectPaths.delete(normalizedPath);
            this.setRevokeButtonLoading(normalizedPath, false);
        }
    }

    /**
     * @param {string} projectKey
     * @param {string} projectName
     * @returns {Promise<void>}
     */
    async downloadProjectBackup(projectKey, projectName) {
        if (!window.electronAPI?.supabaseDownloadProjectBackup) {
            this.showNotification('当前环境不支持下载备份。', 'warning');
            return;
        }
        if (!this.lastProjectStoragePath) {
            this.showNotification('未配置项目存储路径，无法下载备份。', 'warning');
            return;
        }
        const normalizedKey = String(projectKey || '').trim();
        if (!normalizedKey) {
            this.showNotification('备份标识无效，无法下载。', 'warning');
            return;
        }
        this.showNotification('正在下载云端备份，请稍候...', 'info');
        const result = await window.electronAPI.supabaseDownloadProjectBackup({
            projectKey: normalizedKey,
            projectName: String(projectName || '').trim(),
            storagePath: this.lastProjectStoragePath
        });
        if (!result?.success) {
            this.showNotification(this.formatResultError(result, '下载备份失败，请稍后重试。'), 'error');
            return;
        }
        this.showNotification(String(result?.message || '云端备份已下载到本地。'), 'success');
        await this.refreshMyProjects();
    }

    /**
     * @param {string} projectPath
     * @param {boolean} loading
     * @returns {void}
     */
    setBackupButtonLoading(projectPath, loading) {
        if (!this.projectsGrid) {
            return;
        }
        const targetPath = this.normalizeProjectPath(projectPath);
        const buttons = this.projectsGrid.querySelectorAll('[data-project-backup="1"]');
        const button = Array.from(buttons).find((item) =>
            this.normalizeProjectPath(item.getAttribute('data-project-path') || '') === targetPath
        );
        if (!button) {
            return;
        }
        button.disabled = loading;
        button.classList.toggle('is-uploading', loading);
    }

    /**
     * 撤销备份按钮加载态（与上传备份相同的转圈与背景进度条）。
     * 结束加载时按当前 `projectBackupMap` 恢复 `disabled`，避免在 `refreshMyProjects` 之后把 `disabled=false` 写死覆盖正确状态。
     * @param {string} projectPath
     * @param {boolean} loading
     * @returns {void}
     */
    setRevokeButtonLoading(projectPath, loading) {
        if (!this.projectsGrid) {
            return;
        }
        const targetPath = this.normalizeProjectPath(projectPath);
        const buttons = this.projectsGrid.querySelectorAll('[data-project-backup-delete="1"]');
        const button = Array.from(buttons).find((item) =>
            this.normalizeProjectPath(item.getAttribute('data-project-path') || '') === targetPath
        );
        if (!button) {
            return;
        }
        if (loading) {
            button.disabled = true;
            button.classList.add('is-uploading');
            return;
        }
        button.classList.remove('is-uploading');
        const btnPath = this.normalizeProjectPath(button.getAttribute('data-project-path') || '');
        const nameKey = String(button.getAttribute('data-project-name') || '').trim().toLowerCase();
        const backupInfo =
            (btnPath && this.projectBackupMap.get(btnPath)) ||
            (nameKey ? this.projectBackupMap.get(nameKey) : null) ||
            null;
        const hasBackup = Boolean(backupInfo?.backupAt);
        button.disabled = !hasBackup;
    }

    /**
     * @param {string} value
     * @returns {string}
     */
    formatDateTime(value) {
        const raw = String(value || '').trim();
        if (!raw) return '';
        const date = new Date(raw);
        if (Number.isNaN(date.getTime())) {
            return raw;
        }
        return date.toLocaleString('zh-CN', { hour12: false });
    }

    /**
     * @param {string} value
     * @returns {string}
     */
    normalizeProjectPath(value) {
        return String(value || '').trim().replace(/\\/g, '/');
    }

    /**
     * @param {string} projectPath
     * @returns {Promise<void>}
     */
    async openProjectFromCard(projectPath) {
        const normalizedPath = String(projectPath || '').trim();
        if (!normalizedPath) {
            this.showNotification('项目路径无效，无法打开。', 'warning');
            return;
        }
        if (!window.mainApp || typeof window.mainApp.openProjectByPath !== 'function') {
            this.showNotification('当前环境不支持从卡片直接打开项目。', 'warning');
            return;
        }
        try {
            await window.mainApp.openProjectByPath(normalizedPath);
        } catch (error) {
            this.showNotification(`打开项目失败：${error?.message || error}`, 'error');
        }
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
