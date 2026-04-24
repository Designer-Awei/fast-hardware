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
        this.permissionUsers = [];
        this.permissionSearchQuery = '';
        this.permissionListLoading = false;
        this.permissionUpdatingUserIds = new Set();
        this.marketplacePublishContext = null;
        this.marketplacePosts = [];
        this.marketplacePendingPosts = [];
        /** @type {Map<string, { success: boolean, detail?: Record<string, unknown>, error?: string }>} */
        this.marketplacePostDetailCache = new Map();
        /** @type {{ postId: string, reopenPending: boolean } | null} */
        this.marketplaceDetailReviewSession = null;
        /** @type {boolean} */
        this.marketplaceDetailReviewMode = false;
        /** @type {any} */
        this._marketplacePreviewCanvasMgr = null;
        /** @type {ResizeObserver | null} */
        this._marketplacePreviewResizeObs = null;
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
        this.communityPendingContainer = document.getElementById('community-pending-container');
        this.permissionTabBtn = document.getElementById('permission-management-tab-btn');
        this.permissionTabPanel = document.getElementById('permission-management-sub-tab');
        this.permissionSearchInput = document.getElementById('permission-user-search-input');
        this.permissionSearchBtn = document.getElementById('permission-user-search-btn');
        this.permissionUsersTbody = document.getElementById('permission-users-tbody');
        this.marketplaceGrid = document.getElementById('marketplace-grid');
        this.marketplaceSearchInput = document.getElementById('marketplace-search-input');
        this.marketplaceSortSelect = document.getElementById('marketplace-sort-select');
        this.marketplaceSearchBtn = document.getElementById('marketplace-search-btn');
        this.marketplacePublishModal = document.getElementById('marketplace-publish-modal');
        this.marketplacePublishDescriptionInput = document.getElementById('marketplace-publish-description');
        this.marketplacePublishPreview = document.getElementById('marketplace-publish-preview');
        this.marketplaceDetailModal = document.getElementById('marketplace-post-detail-modal');
        this.marketplaceDetailTitle = document.getElementById('marketplace-detail-title');
        this.marketplaceDetailDescription = document.getElementById('marketplace-detail-description');
        this.marketplaceDetailPreviewCanvas = document.getElementById('marketplace-detail-preview-canvas');
        this.marketplaceDetailPreviewWrap = document.getElementById('marketplace-detail-preview-wrap');
        this.marketplaceDetailActions = document.getElementById('marketplace-detail-actions');
        this.marketplacePublishConfirmBtn = document.getElementById('confirm-marketplace-publish-btn');
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
        this.permissionSearchBtn?.addEventListener('click', async () => {
            this.permissionSearchQuery = String(this.permissionSearchInput?.value || '').trim();
            await this.refreshPermissionUsers();
        });
        this.permissionSearchInput?.addEventListener('keydown', async (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                this.permissionSearchQuery = String(this.permissionSearchInput?.value || '').trim();
                await this.refreshPermissionUsers();
            }
        });
        this.permissionUsersTbody?.addEventListener('click', async (event) => {
            const trigger = event.target?.closest?.('[data-permission-role-update]');
            if (!trigger) {
                return;
            }
            const userId = String(trigger.getAttribute('data-user-id') || '').trim();
            const role = String(trigger.getAttribute('data-target-role') || '').trim();
            const email = String(trigger.getAttribute('data-user-email') || '').trim();
            await this.handlePermissionRoleUpdate(userId, role, email);
        });
        this.marketplaceSearchBtn?.addEventListener('click', async () => {
            await this.refreshMarketplaceApprovedPosts();
        });
        this.marketplaceSearchInput?.addEventListener('keydown', async (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                await this.refreshMarketplaceApprovedPosts();
            }
        });
        document.getElementById('close-marketplace-publish-modal')?.addEventListener('click', () => {
            this.closeMarketplacePublishModal();
        });
        document.getElementById('cancel-marketplace-publish-btn')?.addEventListener('click', () => {
            this.closeMarketplacePublishModal();
        });
        this.marketplacePublishModal?.querySelector('[data-close-marketplace-publish-modal]')?.addEventListener('click', () => {
            this.closeMarketplacePublishModal();
        });
        document.getElementById('confirm-marketplace-publish-btn')?.addEventListener('click', async () => {
            await this.confirmMarketplacePublish();
        });
        this.marketplacePublishDescriptionInput?.addEventListener('input', () => {
            this.renderMarketplacePublishPreviewCard();
        });
        document.getElementById('close-marketplace-post-detail-modal')?.addEventListener('click', () => {
            this.closeMarketplaceDetailModal();
        });
        this.marketplaceDetailModal?.querySelector('[data-close-marketplace-post-detail-modal]')?.addEventListener('click', () => {
            this.closeMarketplaceDetailModal();
        });
        this.marketplaceGrid?.addEventListener('click', async (event) => {
            const actionBtn = event.target?.closest?.('[data-marketplace-interact]');
            if (actionBtn) {
                const postId = String(actionBtn.getAttribute('data-post-id') || '').trim();
                const action = String(actionBtn.getAttribute('data-marketplace-interact') || '').trim();
                await this.interactMarketplacePost(postId, action);
                return;
            }
            const card = event.target?.closest?.('[data-marketplace-post-id]');
            if (card) {
                await this.openMarketplacePostDetail(String(card.getAttribute('data-marketplace-post-id') || '').trim(), false);
            }
        });
        this.communityTabPanel?.addEventListener('click', async (event) => {
            const card = event.target?.closest?.('[data-pending-post-id]');
            if (card) {
                await this.openMarketplacePostDetail(String(card.getAttribute('data-pending-post-id') || '').trim(), true);
            }
        });

        this.projectsGrid?.addEventListener('click', async (event) => {
            const shareBtn = event.target?.closest?.('[data-project-share]');
            if (shareBtn) {
                const projectPath = String(shareBtn.getAttribute('data-project-path') || '').trim();
                const projectName = String(shareBtn.getAttribute('data-project-name') || '').trim() || '当前项目';
                const projectDescription = String(shareBtn.getAttribute('data-project-description') || '').trim();
                this.openMarketplacePublishModal(projectPath, projectName, projectDescription);
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
            if (tabName === 'maker-marketplace') {
                await this.refreshMarketplaceApprovedPosts();
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
        if (subTabName === 'community-management') {
            await this.refreshMarketplacePendingPosts();
            const sess = this.marketplaceDetailReviewSession;
            if (sess?.reopenPending && sess.postId) {
                const stillPending = this.marketplacePendingPosts.some(
                    (p) => String(p.id || '') === String(sess.postId)
                );
                if (stillPending) {
                    const alreadyOpen = Boolean(this.marketplaceDetailModal?.classList.contains('show'));
                    if (!alreadyOpen) {
                        await this.openMarketplacePostDetail(String(sess.postId), true, { fromSessionReopen: true });
                    }
                } else {
                    this.marketplaceDetailReviewSession = null;
                    this.showNotification('原待审项目已不在列表中，审核会话已结束。', 'info');
                }
            }
        }
        if (subTabName === 'permission-management') {
            await this.refreshPermissionStats();
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
        const roleKey = String(this.authState.role || '').toLowerCase();
        const isAdmin = roleKey === 'admin' || roleKey === 'super_admin';
        const isSuperAdmin = roleKey === 'super_admin';

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
        this.permissionTabBtn?.classList.toggle('is-hidden', !isSuperAdmin);
        this.permissionTabPanel?.classList.toggle('is-hidden', !isSuperAdmin);
        if (!isSuperAdmin && this.currentSubTab === 'permission-management') {
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
        if (key === 'super_admin') return '超级管理员';
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
        // 拉取账号下全部云备份，才能列出「本地已删、仅云端有备份」的项目卡片
        this.projectBackupMap = await this.fetchProjectBackupMap([]);
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
                                data-project-description="${this.escapeHtml(project.description)}"
                                data-project-path="${this.escapeHtml(project.path)}"
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
                                    title="在项目存储根目录下从 bundle 反序列化并创建项目文件夹"
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
                description: '本地项目缺失，仅保留云端备份。可在下方将备份反序列化并恢复到「系统设置」中的项目存储目录。',
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
     * 将云端 bundle 反序列化到「系统设置」中的项目存储根目录下，重建完整项目文件夹。
     * @param {string} projectKey
     * @param {string} projectName
     * @returns {Promise<void>}
     */
    async downloadProjectBackup(projectKey, projectName) {
        if (!window.electronAPI?.supabaseDownloadProjectBackup) {
            this.showNotification('当前环境不支持恢复备份。', 'warning');
            return;
        }
        const storagePath = String((await window.electronAPI.getSettings('storagePath')) || '').trim();
        this.lastProjectStoragePath = storagePath;
        if (!storagePath) {
            this.showNotification('未配置项目存储路径，无法恢复到本地。请先在系统设置中配置项目文件夹路径。', 'warning');
            return;
        }
        const normalizedKey = String(projectKey || '').trim();
        if (!normalizedKey) {
            this.showNotification('备份标识无效，无法恢复。', 'warning');
            return;
        }
        this.showNotification('正在从云端反序列化并写入项目目录，请稍候...', 'info');
        const result = await window.electronAPI.supabaseDownloadProjectBackup({
            projectKey: normalizedKey,
            projectName: String(projectName || '').trim(),
            storagePath
        });
        if (!result?.success) {
            this.showNotification(this.formatResultError(result, '恢复到本地失败，请稍后重试。'), 'error');
            return;
        }
        this.showNotification(
            String(result?.message || '已从备份在项目存储目录下恢复项目文件夹。'),
            'success'
        );
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
     * 刷新权限管理页（统计 + 用户列表）。
     * @returns {Promise<void>}
     */
    async refreshPermissionManagement() {
        const roleKey = String(this.authState?.role || '').toLowerCase();
        if (roleKey !== 'super_admin') {
            return;
        }
        await this.refreshPermissionStats();
        await this.refreshPermissionUsers();
    }

    /**
     * 刷新权限管理统计。
     * @returns {Promise<void>}
     */
    async refreshPermissionStats() {
        if (!window.electronAPI?.supabaseGetPermissionManagementStats) {
            return;
        }
        try {
            const result = await window.electronAPI.supabaseGetPermissionManagementStats();
            if (!result?.success) {
                this.showNotification(this.formatResultError(result, '读取权限统计失败。'), 'error');
                return;
            }
            const stats = result?.stats || {};
            const setText = (id, value) => {
                const el = document.getElementById(id);
                if (el) {
                    el.textContent = String(value);
                }
            };
            setText('permission-total-users', Number(stats.totalUsers || 0));
            setText('permission-admin-count', Number(stats.adminCount || 0));
            setText('permission-super-admin-count', Number(stats.superAdminCount || 0));
        } catch (error) {
            this.showNotification(this.localizeAuthMessage(String(error?.message || error || '读取权限统计失败。')) || '读取权限统计失败。', 'error');
        }
    }

    /**
     * 刷新权限管理用户列表。
     * @returns {Promise<void>}
     */
    async refreshPermissionUsers() {
        if (!this.permissionUsersTbody || !window.electronAPI?.supabaseListUsersForPermissionManagement) {
            return;
        }
        this.permissionListLoading = true;
        this.renderPermissionUsersTable();
        try {
            try {
                const result = await window.electronAPI.supabaseListUsersForPermissionManagement({
                    query: this.permissionSearchQuery,
                    page: 1,
                    pageSize: 50
                });
                if (!result?.success) {
                    this.showNotification(this.formatResultError(result, '读取用户列表失败。'), 'error');
                    this.permissionUsers = [];
                    this.renderPermissionUsersTable();
                    return;
                }
                this.permissionUsers = Array.isArray(result?.users) ? result.users : [];
                this.renderPermissionUsersTable();
            } catch (error) {
                this.permissionUsers = [];
                this.showNotification(this.localizeAuthMessage(String(error?.message || error || '读取用户列表失败。')) || '读取用户列表失败。', 'error');
            }
        } finally {
            this.permissionListLoading = false;
            this.renderPermissionUsersTable();
        }
    }

    /**
     * 渲染权限管理用户表格。
     * @returns {void}
     */
    renderPermissionUsersTable() {
        if (!this.permissionUsersTbody) {
            return;
        }
        if (this.permissionListLoading) {
            this.permissionUsersTbody.innerHTML = '<tr><td colspan="5" class="permission-table-empty">正在加载用户列表...</td></tr>';
            return;
        }
        if (!this.permissionUsers.length) {
            this.permissionUsersTbody.innerHTML = '<tr><td colspan="5" class="permission-table-empty">未搜索到匹配账号</td></tr>';
            return;
        }
        this.permissionUsersTbody.innerHTML = this.permissionUsers.map((user) => {
            const roleKey = String(user?.role || 'user').toLowerCase();
            const roleClass = roleKey.replace(/_/g, '-');
            const roleLabel = this.mapRoleLabel(roleKey);
            const createdText = this.formatDateTime(String(user?.createdAt || '')) || '-';
            const email = this.escapeHtml(String(user?.email || '-'));
            const displayName = this.escapeHtml(String(user?.displayName || '-') || '-');
            const userId = this.escapeHtml(String(user?.id || ''));
            const disablePromote = roleKey === 'admin' || roleKey === 'super_admin' || this.permissionUpdatingUserIds.has(String(user?.id || ''));
            const disableDemote = roleKey === 'user' || roleKey === 'super_admin' || this.permissionUpdatingUserIds.has(String(user?.id || ''));
            const actionButtons = roleKey === 'super_admin'
                ? '<span style="color:#8b2b52;font-size:12px;">超级管理员不可在此变更</span>'
                : `
                <button type="button" class="permission-action-btn" data-permission-role-update="1" data-user-id="${userId}" data-user-email="${email}" data-target-role="admin" ${disablePromote ? 'disabled' : ''}>设为管理员</button>
                <button type="button" class="permission-action-btn" data-permission-role-update="1" data-user-id="${userId}" data-user-email="${email}" data-target-role="user" ${disableDemote ? 'disabled' : ''}>设为用户</button>
                `;
            return `
                <tr>
                    <td>${email}</td>
                    <td>${displayName}</td>
                    <td><span class="permission-role-chip role-${this.escapeHtml(roleClass)}">${this.escapeHtml(roleLabel)}</span></td>
                    <td>${this.escapeHtml(createdText)}</td>
                    <td>${actionButtons}</td>
                </tr>
            `;
        }).join('');
    }

    /**
     * 超级管理员修改用户角色。
     * @param {string} userId
     * @param {string} role
     * @param {string} email
     * @returns {Promise<void>}
     */
    async handlePermissionRoleUpdate(userId, role, email) {
        const normalizedUserId = String(userId || '').trim();
        const targetRole = String(role || '').trim().toLowerCase();
        if (!normalizedUserId || !['user', 'admin'].includes(targetRole)) {
            return;
        }
        if (!window.electronAPI?.supabaseUpdateUserRoleBySuperAdmin) {
            this.showNotification('当前环境不支持角色管理。', 'warning');
            return;
        }
        if (this.permissionUpdatingUserIds.has(normalizedUserId)) {
            return;
        }
        const confirmed = window.confirm(`确认将 ${email || '该账号'} 设置为 ${this.mapRoleLabel(targetRole)} 吗？`);
        if (!confirmed) {
            return;
        }
        this.permissionUpdatingUserIds.add(normalizedUserId);
        this.renderPermissionUsersTable();
        try {
            const result = await window.electronAPI.supabaseUpdateUserRoleBySuperAdmin({
                userId: normalizedUserId,
                role: targetRole
            });
            if (!result?.success) {
                this.showNotification(this.formatResultError(result, '角色更新失败。'), 'error');
                return;
            }
            this.showNotification(String(result?.message || '角色更新成功。'), 'success');
            await this.refreshPermissionManagement();
            await this.refreshAuthState();
        } finally {
            this.permissionUpdatingUserIds.delete(normalizedUserId);
            this.renderPermissionUsersTable();
        }
    }

    /**
     * @param {string} projectPath
     * @param {string} projectName
     * @param {string} description
     * @returns {void}
     */
    openMarketplacePublishModal(projectPath, projectName, description) {
        if (!this.authState?.isAuthenticated) {
            this.showNotification('请先登录后再发布到创客集市。', 'warning');
            this.switchMainTab('personal-center');
            this.switchSubTab('account-settings');
            return;
        }
        this.marketplacePublishContext = {
            projectPath: String(projectPath || '').trim(),
            projectName: String(projectName || '').trim() || '未命名项目',
            defaultDescription: String(description || '').trim()
        };
        if (this.marketplacePublishDescriptionInput) {
            this.marketplacePublishDescriptionInput.value = this.marketplacePublishContext.defaultDescription;
        }
        this.renderMarketplacePublishPreviewCard();
        this.marketplacePublishModal?.classList.add('show');
    }

    /**
     * @returns {void}
     */
    closeMarketplacePublishModal() {
        this.marketplacePublishModal?.classList.remove('show');
        this.setMarketplacePublishButtonLoading(false);
        this.marketplacePublishContext = null;
    }

    /**
     * 预览描述优先使用输入框内容，输入为空时回退到项目默认描述。
     * @returns {void}
     */
    renderMarketplacePublishPreviewCard() {
        if (!this.marketplacePublishPreview || !this.marketplacePublishContext) {
            return;
        }
        const inputDescription = String(this.marketplacePublishDescriptionInput?.value || '').trim();
        const fallbackDescription = String(this.marketplacePublishContext.defaultDescription || '').trim();
        const finalDescription = inputDescription || fallbackDescription || '暂无描述';
        this.marketplacePublishPreview.innerHTML = `
            <article class="marketplace-card">
                <div class="marketplace-card-head">
                    <strong>${this.escapeHtml(this.marketplacePublishContext.projectName)}</strong>
                    <span>发布时间：待审核通过后写入</span>
                </div>
                <div class="marketplace-card-body">
                    <p class="marketplace-card-desc">${this.escapeHtml(finalDescription)}</p>
                    <div class="marketplace-card-actions">
                        <span class="marketplace-icon-btn"><img src="" alt="" data-icon="thumbs-up">0</span>
                        <span class="marketplace-icon-btn"><img src="" alt="" data-icon="star">0</span>
                        <span class="marketplace-icon-btn"><img src="" alt="" data-icon="git-branch">0</span>
                    </div>
                </div>
            </article>
        `;
        this.initializeIconsForScope(this.marketplacePublishPreview);
    }

    /**
     * @param {boolean} loading
     * @returns {void}
     */
    setMarketplacePublishButtonLoading(loading) {
        if (!this.marketplacePublishConfirmBtn) {
            return;
        }
        this.marketplacePublishConfirmBtn.setAttribute('aria-busy', loading ? 'true' : 'false');
        this.marketplacePublishConfirmBtn.classList.toggle('is-uploading', loading);
    }

    /**
     * @returns {Promise<void>}
     */
    async confirmMarketplacePublish() {
        if (this.marketplacePublishConfirmBtn?.classList.contains('is-uploading')) {
            return;
        }
        if (!this.marketplacePublishContext?.projectPath) {
            this.showNotification('缺少项目路径，无法发布。', 'warning');
            return;
        }
        if (!window.electronAPI?.supabasePublishMarketplacePost) {
            this.showNotification('当前环境不支持项目发布。', 'warning');
            return;
        }
        const inputDescription = String(this.marketplacePublishDescriptionInput?.value || '').trim();
        const description = inputDescription || String(this.marketplacePublishContext.defaultDescription || '').trim();
        this.setMarketplacePublishButtonLoading(true);
        try {
            const result = await window.electronAPI.supabasePublishMarketplacePost({
                projectPath: this.marketplacePublishContext.projectPath,
                projectName: this.marketplacePublishContext.projectName,
                description
            });
            if (!result?.success) {
                this.showNotification(this.formatResultError(result, '发布失败，请稍后重试。'), 'error');
                return;
            }
            this.showNotification(String(result?.message || '发布成功，等待审核。'), 'success');
            this.closeMarketplacePublishModal();
            await this.refreshMarketplacePendingPosts();
            await this.refreshMarketplaceApprovedPosts();
        } finally {
            this.setMarketplacePublishButtonLoading(false);
        }
    }

    /**
     * @returns {Promise<void>}
     */
    async refreshMarketplacePendingPosts() {
        if (!window.electronAPI?.supabaseListMarketplacePendingPosts || !this.communityTabPanel) {
            return;
        }
        const roleKey = String(this.authState?.role || '').toLowerCase();
        if (roleKey !== 'admin' && roleKey !== 'super_admin') {
            return;
        }
        const result = await window.electronAPI.supabaseListMarketplacePendingPosts();
        if (!result?.success) {
            this.showNotification(this.formatResultError(result, '读取待审核列表失败。'), 'error');
            return;
        }
        this.marketplacePendingPosts = Array.isArray(result?.posts) ? result.posts : [];
        if (this.communityPendingContainer) {
            this.communityPendingContainer.innerHTML = this.renderPendingMarketplaceCards();
        }
    }

    /**
     * @returns {string}
     */
    renderPendingMarketplaceCards() {
        if (!this.marketplacePendingPosts.length) {
            return '<div class="account-empty-state">暂无待审核项目。</div>';
        }
        return `
            <div class="marketplace-grid">
                ${this.marketplacePendingPosts.map((post) => `
                    <article class="marketplace-card marketplace-card--pending-review" data-pending-post-id="${this.escapeHtml(String(post.id || ''))}">
                        <div class="marketplace-card-head">
                            <strong>${this.escapeHtml(String(post.project_name || ''))}</strong>
                            <span>提交时间：${this.escapeHtml(this.formatDateTime(String(post.created_at || '')))}</span>
                        </div>
                        <div class="marketplace-card-body">
                            <p class="marketplace-card-desc">${this.escapeHtml(String(post.description || ''))}</p>
                            <div class="marketplace-card-actions"><span class="marketplace-icon-btn">待审核</span></div>
                        </div>
                    </article>
                `).join('')}
            </div>
        `;
    }

    /**
     * @returns {Promise<void>}
     */
    async refreshMarketplaceApprovedPosts() {
        if (!this.marketplaceGrid || !window.electronAPI?.supabaseListMarketplaceApprovedPosts) {
            return;
        }
        if (!this.authState?.isAuthenticated) {
            this.marketplaceGrid.innerHTML = '<div class="account-empty-state">请先登录后查看创客集市。</div>';
            return;
        }
        const query = String(this.marketplaceSearchInput?.value || '').trim();
        const sortBy = String(this.marketplaceSortSelect?.value || 'likes').trim();
        const result = await window.electronAPI.supabaseListMarketplaceApprovedPosts({ query, sortBy });
        if (!result?.success) {
            this.marketplaceGrid.innerHTML = `<div class="account-empty-state">${this.escapeHtml(this.formatResultError(result, '读取创客集市失败。'))}</div>`;
            return;
        }
        this.marketplacePosts = Array.isArray(result?.posts) ? result.posts : [];
        if (!this.marketplacePosts.length) {
            this.marketplaceGrid.innerHTML = '<div class="account-empty-state">暂无已发布项目。</div>';
            return;
        }
        this.marketplaceGrid.innerHTML = this.marketplacePosts.map((post) => `
            <article class="marketplace-card" data-marketplace-post-id="${this.escapeHtml(String(post.id || ''))}">
                <div class="marketplace-card-head">
                    <strong>${this.escapeHtml(String(post.project_name || ''))}</strong>
                    <span>发布时间：${this.escapeHtml(this.formatDateTime(String(post.published_at || '')))}</span>
                </div>
                <div class="marketplace-card-body">
                    <p class="marketplace-card-desc">${this.escapeHtml(String(post.description || ''))}</p>
                    <div class="marketplace-card-actions">
                        <button type="button" class="marketplace-icon-btn" data-marketplace-interact="like" data-post-id="${this.escapeHtml(String(post.id || ''))}"><img src="" alt="" data-icon="thumbs-up">${Number(post.likes_count || 0)}</button>
                        <button type="button" class="marketplace-icon-btn" data-marketplace-interact="favorite" data-post-id="${this.escapeHtml(String(post.id || ''))}"><img src="" alt="" data-icon="star">${Number(post.favorites_count || 0)}</button>
                        <button type="button" class="marketplace-icon-btn" data-marketplace-interact="remix" data-post-id="${this.escapeHtml(String(post.id || ''))}"><img src="" alt="" data-icon="git-branch">${Number(post.remixes_count || 0)}</button>
                    </div>
                </div>
            </article>
        `).join('');
        this.initializeIconsForScope(this.marketplaceGrid);
    }

    /**
     * 对动态渲染区域补充 data-icon 路径解析。
     * @param {ParentNode} scope
     * @returns {Promise<void>}
     */
    async initializeIconsForScope(scope) {
        if (!scope || !window.electronAPI?.getAssetsPath) {
            return;
        }
        if (!this.assetsPathCache) {
            this.assetsPathCache = await window.electronAPI.getAssetsPath();
        }
        const iconImages = scope.querySelectorAll?.('img[data-icon]');
        iconImages?.forEach?.((img) => {
            const iconName = String(img?.dataset?.icon || '').trim();
            if (!iconName) return;
            img.src = `file://${this.assetsPathCache}/icon-${iconName}.svg`;
        });
    }

    /**
     * 待审卡片打开模态时的加载态（遮罩 + 禁用点击）。
     * @param {string} postId
     * @param {boolean} loading
     * @returns {void}
     */
    setPendingReviewCardLoading(postId, loading) {
        if (!this.communityPendingContainer || !postId) {
            return;
        }
        const card = this.communityPendingContainer.querySelector(`[data-pending-post-id="${postId}"]`);
        card?.classList.toggle('is-opening', Boolean(loading));
    }

    /**
     * @param {string} postId
     * @param {boolean} reviewMode
     * @param {{ fromSessionReopen?: boolean }} [options]
     * @returns {Promise<void>}
     */
    async openMarketplacePostDetail(postId, reviewMode, options = {}) {
        const fromSessionReopen = Boolean(options?.fromSessionReopen);
        if (!postId || !window.electronAPI?.supabaseGetMarketplacePostDetail) {
            return;
        }
        const hasCachedDetail = Boolean(this.marketplacePostDetailCache.get(postId)?.success);
        const useCardLoading = Boolean(reviewMode) && !fromSessionReopen && !hasCachedDetail;
        if (useCardLoading) {
            this.setPendingReviewCardLoading(postId, true);
        }
        try {
            let result = this.marketplacePostDetailCache.get(postId);
            if (!result?.success) {
                result = await window.electronAPI.supabaseGetMarketplacePostDetail({ postId });
                if (result?.success) {
                    this.marketplacePostDetailCache.set(postId, result);
                }
            }
            if (!result?.success) {
                this.showNotification(this.formatResultError(result, '读取项目详情失败。'), 'error');
                return;
            }
            this.marketplaceDetailReviewMode = Boolean(reviewMode);
            const detail = result.detail || {};
            this.populateMarketplaceDetailModal(detail, postId, reviewMode);
            this.marketplaceDetailModal?.classList.add('show');
            await this.loadMarketplaceModalPreviewCanvas(String(postId || '').trim() || String(detail.id || '').trim());
        } finally {
            if (useCardLoading) {
                this.setPendingReviewCardLoading(postId, false);
            }
        }
    }

    /**
     * 填充集市项目详情模态（标题、预览、操作区）。
     * @param {Record<string, unknown>} detail
     * @param {string} postId
     * @param {boolean} reviewMode
     * @returns {void}
     */
    populateMarketplaceDetailModal(detail, postId, reviewMode) {
        this.teardownMarketplacePreviewCanvas();
        if (this.marketplaceDetailTitle) {
            this.marketplaceDetailTitle.textContent = String(detail.projectName || '项目预览');
        }
        if (this.marketplaceDetailDescription) {
            this.marketplaceDetailDescription.textContent = String(detail.description || '');
        }
        this.drawMarketplacePreviewPlaceholder('加载预览中…');
        if (this.marketplaceDetailActions) {
            this.marketplaceDetailActions.innerHTML = '';
            /** 与拉取详情的 postId 一致，避免 detail.id 与入口参数不一致时重复开签 */
            const bundleOpenPostId = String(postId || '').trim() || String(detail.id || '').trim();
            const detailBtn = document.createElement('button');
            detailBtn.type = 'button';
            detailBtn.className = 'btn btn-secondary marketplace-detail-open-btn';
            detailBtn.innerHTML =
                '<span class="marketplace-btn-label">查看细节</span><span class="marketplace-btn-spinner" aria-hidden="true"></span>';
            detailBtn.setAttribute('data-marketplace-open-detail', '1');
            detailBtn.addEventListener('click', async () => {
                await this.openMarketplaceDetailInCanvas(bundleOpenPostId);
            });
            this.marketplaceDetailActions.appendChild(detailBtn);
            if (reviewMode) {
                const rejectBtn = document.createElement('button');
                rejectBtn.type = 'button';
                rejectBtn.className = 'btn marketplace-publish-btn marketplace-review-btn--reject';
                rejectBtn.innerHTML =
                    '<span class="marketplace-btn-label">拒绝</span><span class="marketplace-btn-spinner" aria-hidden="true"></span>';
                rejectBtn.addEventListener('click', async () => {
                    await this.reviewMarketplacePost(postId, 'reject', '', rejectBtn);
                });
                const approveBtn = document.createElement('button');
                approveBtn.type = 'button';
                approveBtn.className = 'btn btn-primary marketplace-publish-btn';
                approveBtn.innerHTML =
                    '<span class="marketplace-btn-label">通过</span><span class="marketplace-btn-spinner" aria-hidden="true"></span>';
                approveBtn.addEventListener('click', async () => {
                    await this.reviewMarketplacePost(postId, 'approve', '', approveBtn);
                });
                this.marketplaceDetailActions.appendChild(rejectBtn);
                this.marketplaceDetailActions.appendChild(approveBtn);
            } else {
                ['like', 'favorite', 'remix'].forEach((action) => {
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'btn btn-secondary';
                    btn.textContent = action === 'like' ? '点赞' : action === 'favorite' ? '收藏' : '复刻';
                    btn.addEventListener('click', async () => {
                        await this.interactMarketplacePost(postId, action);
                    });
                    this.marketplaceDetailActions.appendChild(btn);
                });
            }
        }
    }

    /**
     * @returns {void}
     */
    closeMarketplaceDetailModal() {
        this.marketplaceDetailModal?.classList.remove('show');
        this.teardownMarketplacePreviewCanvas();
        this.marketplaceDetailReviewSession = null;
        this.marketplaceDetailReviewMode = false;
    }

    /**
     * 在详情模态的 canvas 上绘制占位文案（拉取 bundle 前或失败时）。
     * @param {string} message
     * @returns {void}
     */
    drawMarketplacePreviewPlaceholder(message) {
        const canvas = this.marketplaceDetailPreviewCanvas;
        if (!canvas) {
            return;
        }
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            return;
        }
        const W = canvas.width || 420;
        const H = canvas.height || 260;
        ctx.fillStyle = '#f1f4fb';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#7a869c';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(message || ''), W / 2, H / 2);
        ctx.textAlign = 'start';
    }

    /**
     * 关闭模态时销毁预览用 CanvasManager，避免监听泄漏。
     * @returns {void}
     */
    teardownMarketplacePreviewCanvas() {
        if (this._marketplacePreviewResizeObs) {
            try {
                this._marketplacePreviewResizeObs.disconnect();
            } catch {
                /* ignore */
            }
            this._marketplacePreviewResizeObs = null;
        }
        if (this._marketplacePreviewCanvasMgr && typeof this._marketplacePreviewCanvasMgr.destroyReadOnlyPreview === 'function') {
            this._marketplacePreviewCanvasMgr.destroyReadOnlyPreview();
        }
        this._marketplacePreviewCanvasMgr = null;
    }

    /**
     * 懒创建集市详情内的只读画布实例（与主电路同一 CanvasManager 类）。
     * @returns {boolean}
     */
    ensureMarketplacePreviewCanvasManager() {
        if (this._marketplacePreviewCanvasMgr) {
            return true;
        }
        const el = this.marketplaceDetailPreviewCanvas;
        if (!el || typeof window.CanvasManager !== 'function') {
            return false;
        }
        this._marketplacePreviewCanvasMgr = new window.CanvasManager({
            canvasElement: el,
            isReadOnlyPreview: true
        });
        const wrap = this.marketplaceDetailPreviewWrap || el.parentElement;
        if (wrap && typeof ResizeObserver === 'function' && !this._marketplacePreviewResizeObs) {
            this._marketplacePreviewResizeObs = new ResizeObserver(() => {
                if (this._marketplacePreviewCanvasMgr && typeof this._marketplacePreviewCanvasMgr.resizeCanvas === 'function') {
                    this._marketplacePreviewCanvasMgr.resizeCanvas();
                }
            });
            this._marketplacePreviewResizeObs.observe(wrap);
        }
        return true;
    }

    /**
     * 拉取与「查看细节」相同的 bundle，用主程序渲染管线绘制到模态内预览画布。
     * @param {string} postId
     * @returns {Promise<void>}
     */
    async loadMarketplaceModalPreviewCanvas(postId) {
        const id = String(postId || '').trim();
        if (!id) {
            return;
        }
        if (!window.electronAPI?.supabaseGetMarketplaceProjectBundle) {
            this.drawMarketplacePreviewPlaceholder('当前环境无法加载预览');
            return;
        }
        await new Promise((r) => requestAnimationFrame(() => r()));
        if (!this.ensureMarketplacePreviewCanvasManager()) {
            this.drawMarketplacePreviewPlaceholder('画布引擎未就绪，请稍后重试');
            return;
        }
        await new Promise((r) => setTimeout(r, 40));
        const mgr = this._marketplacePreviewCanvasMgr;
        try {
            const bundleResult = await window.electronAPI.supabaseGetMarketplaceProjectBundle({ postId: id });
            if (!bundleResult?.success || !bundleResult?.bundle) {
                this.drawMarketplacePreviewPlaceholder(
                    this.formatResultError(bundleResult, '无法加载项目包，预览不可用。')
                );
                return;
            }
            const main = window.mainApp;
            if (!main || typeof main.buildProjectDataFromMarketplaceBundle !== 'function') {
                this.drawMarketplacePreviewPlaceholder('应用未就绪');
                return;
            }
            const projectData = main.buildProjectDataFromMarketplaceBundle(bundleResult.bundle, id);
            if (typeof main.renderProjectToCanvasManager !== 'function') {
                this.drawMarketplacePreviewPlaceholder('渲染接口不可用');
                return;
            }
            await main.renderProjectToCanvasManager(mgr, projectData);
            await new Promise((r) => requestAnimationFrame(() => r()));
            if (mgr.canvas && mgr.canvas.parentElement) {
                mgr.resizeCanvas();
            }
            await new Promise((r) => requestAnimationFrame(() => r()));
            if (typeof mgr.resetView === 'function') {
                mgr.resetView();
            }
            mgr.forceRender();
        } catch (err) {
            const msg = err && typeof err === 'object' && 'message' in err ? String(err.message) : String(err);
            this.drawMarketplacePreviewPlaceholder(`预览失败：${msg}`);
        }
    }

    /**
     * 从 Storage 拉取单文件 bundle，在内存中反序列化并由电路页打开（不写 temp）。
     * 审核态下保留会话以便返回后继续操作。
     * @param {string} postId
     * @returns {Promise<void>}
     */
    async openMarketplaceDetailInCanvas(postId) {
        if (!postId) {
            return;
        }
        const detailBtn = this.marketplaceDetailActions?.querySelector('[data-marketplace-open-detail]');
        if (!window.electronAPI?.supabaseGetMarketplaceProjectBundle) {
            this.showNotification('当前环境不支持查看细节。', 'warning');
            return;
        }
        detailBtn?.classList.add('is-uploading');
        try {
            const bundleResult = await window.electronAPI.supabaseGetMarketplaceProjectBundle({ postId });
            if (!bundleResult?.success || !bundleResult?.bundle) {
                this.showNotification(this.formatResultError(bundleResult, '读取项目包失败。'), 'error');
                return;
            }
            if (!window.mainApp || typeof window.mainApp.openProjectFromMarketplaceBundle !== 'function') {
                return;
            }
            await window.mainApp.switchTab('circuit-design');
            await window.mainApp.openProjectFromMarketplaceBundle({
                postId: String(postId),
                bundle: bundleResult.bundle
            });
            if (this.marketplaceDetailReviewMode) {
                this.marketplaceDetailReviewSession = {
                    postId: String(postId),
                    reopenPending: true
                };
            }
            this.marketplaceDetailModal?.classList.remove('show');
        } catch (err) {
            const msg = err && typeof err === 'object' && 'message' in err ? String(err.message) : String(err);
            this.showNotification(`打开项目失败：${msg}`, 'error');
        } finally {
            detailBtn?.classList.remove('is-uploading');
        }
    }

    /**
     * @param {string} postId
     * @param {'approve'|'reject'} action
     * @param {string} [rejectReason]
     * @param {HTMLButtonElement | null} [clickedBtn]
     * @returns {Promise<void>}
     */
    async reviewMarketplacePost(postId, action, rejectReason = '', clickedBtn = null) {
        if (!window.electronAPI?.supabaseReviewMarketplacePost) {
            return;
        }
        this.marketplaceDetailActions?.classList.add('is-reviewing');
        clickedBtn?.classList.add('is-uploading');
        try {
            const result = await window.electronAPI.supabaseReviewMarketplacePost({ postId, action, rejectReason });
            if (!result?.success) {
                this.showNotification(this.formatResultError(result, '审核操作失败。'), 'error');
                return;
            }
            this.showNotification(String(result?.message || '审核完成。'), 'success');
            this.marketplacePostDetailCache.delete(postId);
            if (this.marketplaceDetailReviewSession?.postId === postId) {
                this.marketplaceDetailReviewSession = null;
            }
            this.closeMarketplaceDetailModal();
            await this.refreshMarketplacePendingPosts();
            await this.refreshMarketplaceApprovedPosts();
        } finally {
            this.marketplaceDetailActions?.classList.remove('is-reviewing');
            clickedBtn?.classList.remove('is-uploading');
        }
    }

    /**
     * @param {string} postId
     * @param {'like'|'favorite'|'remix'} action
     * @returns {Promise<void>}
     */
    async interactMarketplacePost(postId, action) {
        if (!window.electronAPI?.supabaseInteractMarketplacePost) return;
        const result = await window.electronAPI.supabaseInteractMarketplacePost({ postId, action });
        if (!result?.success) {
            this.showNotification(this.formatResultError(result, '互动失败。'), 'error');
            return;
        }
        await this.refreshMarketplaceApprovedPosts();
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
