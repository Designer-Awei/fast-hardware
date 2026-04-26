/**
 * Fast Hardware - 个人中心 / 账号设置
 */

/** localStorage：我的项目卡片摘要（按账号 ownerKey，不含整页 HTML） */
const FH_LS_MY_PROJECTS_SUMMARIES = 'fh.account.myProjectsSummaries.v1';
/** localStorage：创客集市已通过列表卡片摘要（按 ownerKey + 搜索/排序 cacheKey） */
const FH_LS_MARKETPLACE_APPROVED_SUMMARIES = 'fh.account.marketplaceApprovedSummaries.v1';
/** 兼容旧版整页 HTML 缓存（读出后不再写回） */
const FH_LS_MY_PROJECTS_HTML_LEGACY = 'fh.account.myProjectsHtml.v1';
/** 兼容旧版集市已通过全量 posts 缓存 */
const FH_LS_MARKETPLACE_APPROVED_LEGACY = 'fh.account.marketplaceApproved.v1';

class AccountCenterManager {
    constructor() {
        this.authState = {
            isAuthenticated: false,
            email: '',
            id: '',
            displayName: '',
            role: 'free',
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
        /** @type {Array<Record<string, unknown>>} 当前筛选下与已发布列表一并展示的共享备份卡片数据 */
        this.marketplaceSharedCardsForGrid = [];
        /** @type {string} 最近一次已通过列表对应的 cacheKey（query::sortBy） */
        this._marketplaceLastApprovedCacheKey = '';
        this.marketplacePendingPosts = [];
        this.marketplaceHasLoaded = false;
        this.marketplaceListCacheState = {
            approved: {
                key: '',
                ts: 0
            },
            pending: {
                key: 'admin',
                ts: 0
            }
        };
        this.marketplaceListStaleMs = 5 * 60 * 1000;
        /** @type {Map<string, { success: boolean, detail?: Record<string, unknown>, error?: string }>} */
        this.marketplacePostDetailCache = new Map();
        /** @type {{ postId: string, reopenPending: boolean } | null} */
        this.marketplaceDetailReviewSession = null;
        /** @type {boolean} */
        this.marketplaceDetailReviewMode = false;
        /** @type {string} 当前集市详情模态对应的帖子 ID（删帖时用于判断是否关闭模态） */
        this.marketplaceDetailOpenPostId = '';
        /** @type {Set<string>} 点赞/收藏写入中的锁，避免连点产生竞态 */
        this.marketplaceInteractPending = new Set();
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
        this.profileSaveBtn = document.getElementById('account-profile-save-btn');
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
        this.marketplaceHomeBtn = document.getElementById('marketplace-home-btn');
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
        this.marketplacePublishStatusMap = new Map();
        this.uploadingProjectPaths = new Set();
        this.revokingProjectPaths = new Set();
        this.lastProjectStoragePath = '';
        this.myProjectsCacheOwnerKey = '';
        /** @type {Array<Record<string, unknown>> | null} 与磁盘摘要同步的卡片摘要（用于首屏与持久化） */
        this.myProjectsSummaries = null;
        this.myProjectsHasLoaded = false;
        this.myProjectsCacheDirty = true;
        /** 本会话内「我的项目」是否已完成首次后台全量同步 */
        this._sessionMyProjectsInitialSyncDone = false;
        /** @type {Promise<void> | null} */
        this._sessionMyProjectsInitialSyncPromise = null;
        /** 本会话内创客集市已通过列表是否已完成首次后台全量同步 */
        this._sessionMarketplaceInitialSyncDone = false;
        /** @type {Promise<void> | null} */
        this._sessionMarketplaceInitialSyncPromise = null;
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
            await this.executeMarketplaceSearchAction();
        });
        this.marketplaceSearchInput?.addEventListener('keydown', async (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                await this.executeMarketplaceSearchAction();
            }
        });
        this.marketplaceHomeBtn?.addEventListener('click', async () => {
            if (this.marketplaceSearchInput) {
                this.marketplaceSearchInput.value = '';
            }
            await this.executeMarketplaceSearchAction();
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
            const limit = 79;
            const raw = String(this.marketplacePublishDescriptionInput?.value || '');
            if (raw.length > limit && this.marketplacePublishDescriptionInput) {
                this.marketplacePublishDescriptionInput.value = raw.slice(0, limit);
            }
            this.renderMarketplacePublishPreviewCard();
        });
        document.getElementById('close-marketplace-post-detail-modal')?.addEventListener('click', () => {
            this.closeMarketplaceDetailModal();
        });
        this.marketplaceDetailModal?.querySelector('[data-close-marketplace-post-detail-modal]')?.addEventListener('click', () => {
            this.closeMarketplaceDetailModal();
        });
        this.marketplaceGrid?.addEventListener('click', async (event) => {
            const sharedRemixBtn = event.target?.closest?.('[data-marketplace-backup-remix]');
            if (sharedRemixBtn) {
                const projectKey = String(sharedRemixBtn.getAttribute('data-project-key') || '').trim();
                await this.openSharedBackupByProjectKey(projectKey, sharedRemixBtn);
                return;
            }
            const adminDeleteBtn = event.target?.closest?.('[data-marketplace-admin-delete]');
            if (adminDeleteBtn) {
                event.stopPropagation();
                const delPostId = String(adminDeleteBtn.getAttribute('data-post-id') || '').trim();
                await this.confirmAndDeleteMarketplacePublishedPost(delPostId);
                return;
            }
            const actionBtn = event.target?.closest?.('[data-marketplace-interact]');
            if (actionBtn) {
                const postId = String(actionBtn.getAttribute('data-post-id') || '').trim();
                const action = String(actionBtn.getAttribute('data-marketplace-interact') || '').trim();
                if (action === 'remix') {
                    return;
                }
                await this.interactMarketplacePost(postId, action, actionBtn);
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
            const copyProjectKeyBtn = event.target?.closest?.('[data-project-key-copy]');
            if (copyProjectKeyBtn) {
                const projectKey = String(copyProjectKeyBtn.getAttribute('data-project-key') || '').trim();
                await this.copyProjectKeyToClipboard(projectKey);
                return;
            }
            const shareBtn = event.target?.closest?.('[data-project-share]');
            if (shareBtn) {
                if (shareBtn.disabled) {
                    this.showNotification('当前为免费版，发布到创客集市功能受限。', 'warning');
                    return;
                }
                const projectPath = String(shareBtn.getAttribute('data-project-path') || '').trim();
                const projectUuid = String(shareBtn.getAttribute('data-project-uuid') || '').trim();
                const projectName = String(shareBtn.getAttribute('data-project-name') || '').trim() || '当前项目';
                const projectDescription = String(shareBtn.getAttribute('data-project-description') || '').trim();
                this.openMarketplacePublishModal(projectPath, projectName, projectDescription, projectUuid);
                return;
            }
            const backupBtn = event.target?.closest?.('[data-project-backup]');
            if (backupBtn) {
                if (backupBtn.disabled) {
                    this.showNotification('当前为免费版，云端备份上传功能受限。', 'warning');
                    return;
                }
                const projectPath = String(backupBtn.getAttribute('data-project-path') || '').trim();
                const projectUuid = String(backupBtn.getAttribute('data-project-uuid') || '').trim();
                const projectName = String(backupBtn.getAttribute('data-project-name') || '').trim();
                await this.uploadProjectBackup(projectPath, projectName, projectUuid);
                return;
            }
            const revokeBtn = event.target?.closest?.('[data-project-backup-delete]');
            if (revokeBtn) {
                const projectPath = String(revokeBtn.getAttribute('data-project-path') || '').trim();
                const projectUuid = String(revokeBtn.getAttribute('data-project-uuid') || '').trim();
                const projectName = String(revokeBtn.getAttribute('data-project-name') || '').trim();
                await this.deleteProjectBackup(projectPath, projectName, projectUuid);
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
                if (downloadBtn.disabled) {
                    this.showNotification('当前为免费版，从云端恢复备份功能受限。', 'warning');
                    return;
                }
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
        window.electronAPI?.onSupabaseMarketplaceChanged?.(async (payload) => {
            this.invalidateMarketplaceApprovedClientCache();
            if (!this.authState?.isAuthenticated) {
                return;
            }
            const changedType = String(payload?.type || '').trim().toLowerCase();
            if (['review', 'publish', 'delete-approved'].includes(changedType)) {
                await this.resyncMyProjectsPublishStatusesOnly();
            }
            if (this.currentSubTab === 'community-management') {
                await this.refreshMarketplacePendingPosts();
            }
        });

        document.addEventListener('tabSwitched', async (e) => {
            const tabName = e?.detail?.tabName;
            if (tabName === 'personal-center') {
                await this.refreshAuthState();
                if (this.currentSubTab === 'my-projects') {
                    await this.presentMyProjectsTab();
                }
                if (this.currentSubTab === 'permission-management' && this.isPermissionManagementViewer()) {
                    await this.refreshPermissionManagement();
                }
            }
            if (tabName === 'maker-marketplace') {
                await this.presentMakerMarketplaceTab();
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
            await this.presentMyProjectsTab();
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
            await this.refreshPermissionManagement();
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
        const prevOwnerKey = String(this.myProjectsCacheOwnerKey || '');
        const state = await window.electronAPI.getSupabaseAuthState();
        console.log('[account-center] refreshAuthState', {
            isAuthenticated: Boolean(state?.isAuthenticated),
            userId: String(state?.id || ''),
            email: String(state?.email || ''),
            prevOwnerKey
        });
        const nextOwnerKey = Boolean(state?.isAuthenticated)
            ? String(state?.id || state?.email || 'authenticated').trim().toLowerCase()
            : 'anonymous';
        /** 构造后首次同步：prev 为空字符串时不视为换账号，避免误删 localStorage 摘要导致首屏无缓存 */
        const ownerKeyInitialized = Boolean(prevOwnerKey);
        if (ownerKeyInitialized && prevOwnerKey !== nextOwnerKey) {
            /** 从匿名态登录时保留磁盘摘要，仅清内存；登出或换账号仍删盘 */
            const clearDiskCache = !(prevOwnerKey === 'anonymous' && nextOwnerKey !== 'anonymous');
            console.log('[account-center] owner changed -> reset caches', {
                prevOwnerKey,
                nextOwnerKey,
                clearDiskCache
            });
            this.resetMyProjectsCacheState(clearDiskCache);
            this.resetMarketplaceViewState(clearDiskCache);
        }
        this.myProjectsCacheOwnerKey = nextOwnerKey;
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
     * 登录身份切换时清空“我的项目”相关缓存与派生映射，避免沿用旧账号数据。
     * @param {boolean} [clearDiskCache=true] 为 false 时保留 localStorage 摘要（如从匿名登录后立即首屏读盘）。
     * @returns {void}
     */
    resetMyProjectsCacheState(clearDiskCache = true) {
        this.projectBackupMap = new Map();
        this.marketplacePublishStatusMap = new Map();
        this.myProjectsSummaries = null;
        this.myProjectsHasLoaded = false;
        this.myProjectsCacheDirty = true;
        this._sessionMyProjectsInitialSyncDone = false;
        this._sessionMyProjectsInitialSyncPromise = null;
        this.uploadingProjectPaths.clear();
        this.revokingProjectPaths.clear();
        if (!clearDiskCache) {
            return;
        }
        try {
            localStorage.removeItem(FH_LS_MY_PROJECTS_SUMMARIES);
            localStorage.removeItem(FH_LS_MY_PROJECTS_HTML_LEGACY);
        } catch {
            /* ignore */
        }
    }

    /**
     * 登录身份切换时重置创客集市视图状态，避免沿用“需登录”旧视图缓存。
     * @param {boolean} [clearDiskCache=true] 为 false 时保留已通过列表的 localStorage 摘要。
     * @returns {void}
     */
    resetMarketplaceViewState(clearDiskCache = true) {
        this.marketplacePosts = [];
        this.marketplaceSharedCardsForGrid = [];
        this._marketplaceLastApprovedCacheKey = '';
        this.marketplacePendingPosts = [];
        this.marketplaceHasLoaded = false;
        this._sessionMarketplaceInitialSyncDone = false;
        this._sessionMarketplaceInitialSyncPromise = null;
        this.invalidateMarketplaceApprovedClientCache();
        if (!clearDiskCache) {
            return;
        }
        try {
            localStorage.removeItem(FH_LS_MARKETPLACE_APPROVED_SUMMARIES);
            localStorage.removeItem(FH_LS_MARKETPLACE_APPROVED_LEGACY);
        } catch {
            /* ignore */
        }
    }

    /**
     * @returns {Promise<void>}
     */
    async handleDisplayNameSave() {
        if (this.profileSaveBtn?.classList.contains('is-uploading')) {
            return;
        }
        if (!window.electronAPI?.supabaseUpdateProfile) {
            this.showNotification('当前环境不支持昵称更新。', 'warning');
            return;
        }
        const displayName = String(this.profileNameInput?.value || '').trim();
        if (!displayName) {
            this.showNotification('昵称不能为空。', 'warning');
            return;
        }
        this.setProfileSaveButtonLoading(true);
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
        } finally {
            this.setProfileSaveButtonLoading(false);
        }
    }

    /**
     * 编辑资料弹窗“保存资料”按钮加载态（进度扫描 + 中心转圈 + 防抖禁用）。
     * @param {boolean} loading
     * @returns {void}
     */
    setProfileSaveButtonLoading(loading) {
        if (!this.profileSaveBtn) {
            return;
        }
        const busy = Boolean(loading);
        this.profileSaveBtn.classList.toggle('is-uploading', busy);
        this.profileSaveBtn.setAttribute('aria-busy', busy ? 'true' : 'false');
        this.profileSaveBtn.disabled = busy;
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
        const canViewPermissionManagement = this.isPermissionManagementViewer();
        this.permissionTabBtn?.classList.toggle('is-hidden', !canViewPermissionManagement);
        this.permissionTabPanel?.classList.toggle('is-hidden', !canViewPermissionManagement);
        if (!canViewPermissionManagement && this.currentSubTab === 'permission-management') {
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
     * 判断是否为“登录态可能过期/未同步”类错误（用于生产环境冷启动后的一次性重试）。
     * @param {string} message
     * @returns {boolean}
     */
    isAuthStateLikelyStaleError(message) {
        const text = String(message || '').trim().toLowerCase();
        if (!text) return false;
        return (
            text.includes('未登录') ||
            text.includes('jwt') ||
            text.includes('token') ||
            text.includes('session') ||
            text.includes('auth')
        );
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
        if (key === 'free') return '免费用户';
        if (key === 'anonymous' || key === '') return '匿名用户';
        return String(role || '用户');
    }

    /**
     * 是否具备完整账号能力（非免费版）：云端备份上传、集市发布、按项目编号检索共享备份等。
     * @returns {boolean}
     */
    isFullAccountRole() {
        const roleKey = String(this.authState?.role || '').toLowerCase();
        return roleKey === 'user' || roleKey === 'admin' || roleKey === 'super_admin';
    }

    /**
     * 是否可进入「权限管理」页（管理员或超级管理员）。
     * @returns {boolean}
     */
    isPermissionManagementViewer() {
        const roleKey = String(this.authState?.role || '').toLowerCase();
        return roleKey === 'admin' || roleKey === 'super_admin';
    }

    /**
     * 是否具备完整角色升降权（仅超级管理员可设 admin、改管理员账号）。
     * @returns {boolean}
     */
    isSuperPermissionManager() {
        return String(this.authState?.role || '').toLowerCase() === 'super_admin';
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
     * 「我的项目」首屏：磁盘摘要立即渲染；本会话仅在后台静默全量同步一次。
     * @returns {Promise<void>}
     */
    async presentMyProjectsTab() {
        if (!window.electronAPI?.getSettings || !window.electronAPI?.readDirectory || !this.projectsGrid) {
            return;
        }
        await this.refreshAuthState();
        if (!this.authState?.isAuthenticated) {
            this.projectsGrid.innerHTML = '<div class="account-empty-state">请先登录后查看我的项目。</div>';
            return;
        }
        this.tryRestoreMyProjectsSummariesFromLocalStorage();
        if (Array.isArray(this.myProjectsSummaries) && this.myProjectsSummaries.length) {
            await this.renderMyProjectsFromSummaries(this.myProjectsSummaries);
        }
        void this.ensureMyProjectsSessionInitialBackgroundSync();
    }

    /**
     * 本会话首次进入「我的项目」时在后台静默全量同步一次（目录扫描 + 备份/发布态）。
     * @returns {Promise<void>}
     */
    async ensureMyProjectsSessionInitialBackgroundSync() {
        if (this._sessionMyProjectsInitialSyncDone) {
            return;
        }
        if (this._sessionMyProjectsInitialSyncPromise) {
            await this._sessionMyProjectsInitialSyncPromise;
            return;
        }
        this._sessionMyProjectsInitialSyncPromise = (async () => {
            try {
                await this.runMyProjectsFullScanFromDisk({ showLoading: false });
                this._sessionMyProjectsInitialSyncDone = true;
            } finally {
                this._sessionMyProjectsInitialSyncPromise = null;
            }
        })();
        await this._sessionMyProjectsInitialSyncPromise;
    }

    /**
     * 手动全量重扫（如从云端恢复备份后目录结构变化）。
     * @param {{ showLoading?: boolean }} [options]
     * @returns {Promise<void>}
     */
    async refreshMyProjectsFullRescan(options = {}) {
        await this.runMyProjectsFullScanFromDisk(options);
    }

    /**
     * 从 localStorage 恢复「我的项目」卡片摘要（仅 ownerKey 匹配）。
     * @returns {boolean}
     */
    tryRestoreMyProjectsSummariesFromLocalStorage() {
        if (Array.isArray(this.myProjectsSummaries) && this.myProjectsSummaries.length) {
            return true;
        }
        const ownerKey = String(this.myProjectsCacheOwnerKey || '').trim();
        if (!ownerKey || ownerKey === 'anonymous') {
            return false;
        }
        try {
            const raw = localStorage.getItem(FH_LS_MY_PROJECTS_SUMMARIES);
            if (!raw) {
                return false;
            }
            const parsed = JSON.parse(raw);
            if (String(parsed?.ownerKey || '') !== ownerKey) {
                return false;
            }
            const items = Array.isArray(parsed?.items) ? parsed.items : [];
            this.myProjectsSummaries = items;
            this.myProjectsHasLoaded = items.length > 0;
            this.myProjectsCacheDirty = false;
            return items.length > 0;
        } catch {
            return false;
        }
    }

    /**
     * 持久化「我的项目」卡片摘要（非整页 HTML）。
     * @returns {void}
     */
    persistMyProjectsSummariesToLocalStorage() {
        const ownerKey = String(this.myProjectsCacheOwnerKey || '').trim();
        if (!ownerKey || ownerKey === 'anonymous') {
            return;
        }
        const items = Array.isArray(this.myProjectsSummaries) ? this.myProjectsSummaries : [];
        try {
            localStorage.setItem(
                FH_LS_MY_PROJECTS_SUMMARIES,
                JSON.stringify({
                    ownerKey,
                    items,
                    ts: Date.now()
                })
            );
        } catch {
            /* quota 等忽略 */
        }
    }

    /**
     * @param {Record<string, unknown>} s
     * @returns {Record<string, unknown>}
     */
    summaryToMyProjectViewModel(s) {
        const isCloudOnly = Boolean(s.isCloudOnly);
        const pathKey = this.normalizeProjectPath(String(s.path || ''));
        const uuidKey = this.normalizeProjectUuid(String(s.projectUuid || ''));
        const projectName = String(s.projectName || '').trim() || '未命名';
        const description = String(s.description || '').trim();
        const componentCount = Number(s.componentCount || 0);
        const connectionCount = Number(s.connectionCount || 0);
        const lastModified = String(s.lastModified || '').trim();
        const timeText = lastModified
            ? new Date(lastModified).toLocaleString('zh-CN', { hour12: false })
            : '未记录';
        const hasBackup = Boolean(s.hasBackup && String(s.backupAt || '').trim());
        const projectKeyText = String(s.projectKey || '').trim() || '暂无project_key';
        const backupText = hasBackup
            ? `备份状态：已备份 - ${this.escapeHtml(this.formatDateTime(String(s.backupAt || '')))}`
            : '备份状态：无备份';
        const backupBtnText = hasBackup ? '更新备份' : '上传备份';
        const backupIcon = hasBackup ? 'refresh' : 'upload-cloud';
        const revokeDisabled = hasBackup ? '' : 'disabled';
        const tierFull = this.isFullAccountRole();
        const backupButtonDisabled = isCloudOnly || !tierFull ? 'disabled' : '';
        const shareButtonDisabled = tierFull ? '' : 'disabled';
        const cloudDownloadDisabled = tierFull ? '' : 'disabled';
        let backupUploadTitle = '上传或更新云端备份';
        if (isCloudOnly) {
            backupUploadTitle = '仅云端备份条目无法从本机覆盖上传';
        } else if (!tierFull) {
            backupUploadTitle = '当前为免费版，云端备份上传不可用';
        }
        const openButtonDisabled = isCloudOnly ? 'disabled' : '';
        const publishKey = String(s.publishStatusKey || 'unpublished').toLowerCase();
        const publishStatus =
            publishKey === 'approved'
                ? { key: 'approved', text: '已发布' }
                : publishKey === 'pending'
                  ? { key: 'pending', text: '待审核' }
                  : publishKey === 'rejected'
                    ? { key: 'rejected', text: '已拒绝' }
                    : { key: 'unpublished', text: '未发布' };
        return {
            isCloudOnly,
            pathKey,
            uuidKey,
            projectName,
            description,
            componentCount,
            connectionCount,
            timeText,
            hasBackup,
            projectKeyText,
            backupText,
            backupBtnText,
            backupIcon,
            revokeDisabled,
            backupButtonDisabled,
            shareButtonDisabled,
            cloudDownloadDisabled,
            backupUploadTitle,
            openButtonDisabled,
            publishStatus,
            projectKeyForDownload: String(s.projectKey || '').trim()
        };
    }

    /**
     * @param {Record<string, unknown>} vm
     * @returns {string}
     */
    buildMyProjectCardHtmlFromViewModel(vm) {
        const isCloudOnly = Boolean(vm.isCloudOnly);
        const pathKey = String(vm.pathKey || '');
        const uuidKey = String(vm.uuidKey || '');
        const projectName = String(vm.projectName || '');
        const description = String(vm.description || '');
        const publishStatus = /** @type {{ key: string, text: string }} */ (vm.publishStatus || {
            key: 'unpublished',
            text: '未发布'
        });
        return `
                    <article
                        class="my-project-card ${isCloudOnly ? 'my-project-card-cloud-only' : ''}"
                        data-project-path="${this.escapeHtml(pathKey)}"
                        data-project-uuid="${this.escapeHtml(uuidKey)}"
                    >
                        <div class="my-project-card-thumb">
                            <button
                                type="button"
                                class="my-project-card-share-btn"
                                data-project-share="1"
                                data-project-name="${this.escapeHtml(projectName)}"
                                data-project-description="${this.escapeHtml(description)}"
                                data-project-path="${this.escapeHtml(pathKey)}"
                                data-project-uuid="${this.escapeHtml(uuidKey)}"
                                title="${vm.shareButtonDisabled ? '当前为免费版，发布到创客集市不可用' : '发布到创客集市'}"
                                aria-label="${vm.shareButtonDisabled ? '当前为免费版，发布到创客集市不可用' : '发布到创客集市'}"
                                ${vm.shareButtonDisabled || ''}
                            >
                                <img src="" alt="" width="22" height="22" data-icon="share-2">
                            </button>
                            <strong>${this.escapeHtml(projectName)}</strong>
                            <div class="my-project-card-thumb-meta-row">
                                <span>${Number(vm.componentCount || 0)} 个元件 · ${Number(vm.connectionCount || 0)} 条连线</span>
                                <span class="my-project-card-publish-status my-project-card-publish-status--${publishStatus.key}">
                                    <span class="my-project-card-publish-status-dot" aria-hidden="true"></span>
                                    <span>${this.escapeHtml(publishStatus.text)}</span>
                                </span>
                            </div>
                        </div>
                        <div class="my-project-card-body">
                            <h4>${vm.backupText}</h4>
                            <p>描述：${this.escapeHtml(description)}</p>
                            <div class="my-project-card-project-key-line">
                                <span class="my-project-card-project-key-label">项目编号：</span>
                                <span class="my-project-card-project-key-value">${this.escapeHtml(String(vm.projectKeyText || ''))}</span>
                                ${vm.hasBackup ? `
                                <button
                                    type="button"
                                    class="inline-icon-button my-project-card-project-key-copy-btn"
                                    data-project-key-copy="1"
                                    data-project-key="${this.escapeHtml(String(vm.projectKeyText || ''))}"
                                    title="复制项目编号"
                                    aria-label="复制项目编号"
                                >
                                    <img src="" alt="" width="14" height="14" data-icon="copy">
                                </button>
                                ` : ''}
                            </div>
                            <div class="my-project-card-meta">
                                <span>更新时间：${this.escapeHtml(String(vm.timeText || ''))}</span>
                            </div>
                            <div class="my-project-card-actions">
                                <button
                                    type="button"
                                    class="my-project-card-backup-btn"
                                    data-project-backup="1"
                                    data-project-name="${this.escapeHtml(projectName)}"
                                    data-project-path="${this.escapeHtml(pathKey)}"
                                    data-project-uuid="${this.escapeHtml(uuidKey)}"
                                    title="${this.escapeHtml(String(vm.backupUploadTitle || '上传或更新云端备份'))}"
                                    aria-label="${this.escapeHtml(String(vm.backupUploadTitle || '上传或更新云端备份'))}"
                                    ${vm.backupButtonDisabled || ''}
                                >
                                    <img src="" alt="" width="18" height="18" data-icon="${this.escapeHtml(String(vm.backupIcon || 'upload-cloud'))}">
                                    <span class="my-project-card-btn-label">${this.escapeHtml(String(vm.backupBtnText || ''))}</span>
                                    <span class="my-project-card-btn-spinner" aria-hidden="true"></span>
                                </button>
                                <button
                                    type="button"
                                    class="my-project-card-revoke-btn"
                                    data-project-backup-delete="1"
                                    data-project-name="${this.escapeHtml(projectName)}"
                                    data-project-path="${this.escapeHtml(pathKey)}"
                                    data-project-uuid="${this.escapeHtml(uuidKey)}"
                                    ${vm.revokeDisabled || ''}
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
                                    data-project-key="${this.escapeHtml(String(vm.projectKeyForDownload || ''))}"
                                    data-project-name="${this.escapeHtml(projectName)}"
                                    title="${vm.cloudDownloadDisabled ? '当前为免费版，从云端恢复备份不可用' : '在项目存储根目录下从 project.bundle.json 反序列化并创建项目文件夹'}"
                                    ${vm.cloudDownloadDisabled || ''}
                                >
                                    <img src="" alt="" width="18" height="18" data-icon="download">
                                    <span>下载备份</span>
                                </button>
                                ` : `
                                <button
                                    type="button"
                                    class="my-project-card-open-btn"
                                    data-project-open="1"
                                    data-project-path="${this.escapeHtml(pathKey)}"
                                    ${vm.openButtonDisabled || ''}
                                >
                                    <img src="" alt="" width="18" height="18" data-icon="folder-open">
                                    <span>打开项目</span>
                                </button>
                                `}
                            </div>
                        </div>
                    </article>
                `;
    }

    /**
     * @param {Array<Record<string, unknown>>} summaries
     * @returns {void}
     */
    applyMyProjectsMapsFromSummaries(summaries) {
        this.projectBackupMap = new Map();
        this.marketplacePublishStatusMap = new Map();
        for (const raw of summaries || []) {
            const s = raw && typeof raw === 'object' ? raw : {};
            const pathKey = this.normalizeProjectPath(String(s.path || ''));
            const uuidKey = this.normalizeProjectUuid(String(s.projectUuid || ''));
            const publishKey = String(s.publishStatusKey || 'unpublished').toLowerCase();
            if (pathKey) {
                this.marketplacePublishStatusMap.set(pathKey, publishKey);
            }
            if (uuidKey) {
                this.marketplacePublishStatusMap.set(`uuid:${uuidKey}`, publishKey);
            }
            if (s.hasBackup && String(s.backupAt || '').trim()) {
                const info = {
                    backupAt: String(s.backupAt || ''),
                    fileCount: Number(s.fileCount || 0),
                    projectName: String(s.projectName || ''),
                    projectKey: String(s.projectKey || ''),
                    lastModified: String(s.lastModified || ''),
                    projectPath: pathKey,
                    projectUuid: uuidKey
                };
                if (pathKey) {
                    this.projectBackupMap.set(pathKey, info);
                }
                if (uuidKey) {
                    this.projectBackupMap.set(`uuid:${uuidKey}`, info);
                }
                const nameKey = String(s.projectName || '').trim().toLowerCase();
                if (nameKey && !this.projectBackupMap.has(nameKey)) {
                    this.projectBackupMap.set(nameKey, info);
                }
            }
        }
    }

    /**
     * @param {Array<Record<string, unknown>>} summaries
     * @returns {Promise<void>}
     */
    async renderMyProjectsFromSummaries(summaries) {
        if (!this.projectsGrid) {
            return;
        }
        const list = Array.isArray(summaries) ? summaries : [];
        this.applyMyProjectsMapsFromSummaries(list);
        this.projectsGrid.innerHTML = list
            .map((s) => this.buildMyProjectCardHtmlFromViewModel(this.summaryToMyProjectViewModel(s)))
            .join('');
        if (window.mainApp && typeof window.mainApp.initializeIconPaths === 'function') {
            await window.mainApp.initializeIconPaths();
        }
        await this.initializeIconsForScope(this.projectsGrid);
    }

    /**
     * 由全量扫描结果生成卡片摘要列表。
     * @param {Array<Record<string, unknown>>} allCards
     * @returns {Array<Record<string, unknown>>}
     */
    buildMyProjectsSummariesFromAllCards(allCards) {
        const list = Array.isArray(allCards) ? allCards : [];
        return list.map((project) => {
            const pathKey = this.normalizeProjectPath(project.path);
            const uuidKey = this.normalizeProjectUuid(project.projectUuid);
            const backupInfo =
                (uuidKey && this.projectBackupMap.get(`uuid:${uuidKey}`)) || this.projectBackupMap.get(pathKey) || null;
            const hasBackup = Boolean(backupInfo?.backupAt);
            const projectKey = String(backupInfo?.projectKey || project.projectKey || '').trim();
            const ps = this.getMyProjectPublishStatus(project.path, project.projectUuid);
            return {
                path: pathKey,
                projectUuid: uuidKey,
                projectName: String(project.projectName || ''),
                description: String(project.description || ''),
                componentCount: Number(project.componentCount || 0),
                connectionCount: Number(project.connectionCount || 0),
                lastModified: String(project.lastModified || ''),
                isCloudOnly: Boolean(project.isCloudOnly),
                projectKey,
                hasBackup,
                backupAt: String(backupInfo?.backupAt || ''),
                fileCount: Number(backupInfo?.fileCount || 0),
                publishStatusKey: ps.key
            };
        });
    }

    /**
     * 目录扫描 + 云端备份/发布态，刷新网格并写入摘要缓存。
     * @param {{ showLoading?: boolean }} [options]
     * @returns {Promise<void>}
     */
    async runMyProjectsFullScanFromDisk(options = {}) {
        if (!window.electronAPI?.getSettings || !window.electronAPI?.readDirectory || !this.projectsGrid) {
            return;
        }
        const showLoading = Boolean(options?.showLoading);
        if (!this.authState?.isAuthenticated) {
            return;
        }
        const hasSummaryPaint = Array.isArray(this.myProjectsSummaries) && this.myProjectsSummaries.length;
        if (showLoading && !hasSummaryPaint && this.projectsGrid) {
            await this.renderAccountLoadingState(this.projectsGrid);
        }
        const storagePath = String((await window.electronAPI.getSettings('storagePath')) || '').trim();
        this.lastProjectStoragePath = storagePath;
        if (!storagePath) {
            this.myProjectsSummaries = [];
            this.renderProjectsEmpty('请先在系统设置中配置项目文件夹路径。', { cacheResult: true });
            this.persistMyProjectsSummariesToLocalStorage();
            return;
        }

        const result = await window.electronAPI.readDirectory(storagePath);
        if (!result?.success) {
            this.renderProjectsEmpty(result?.error || '读取项目目录失败。', { cacheResult: false });
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
                    projectUuid: this.normalizeProjectUuid(String(config?.uuid || '')),
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
                    projectUuid: '',
                    projectName: dir.name,
                    description: '未找到标准项目配置，暂按普通项目文件夹展示。',
                    componentCount: 0,
                    connectionCount: 0,
                    lastModified: ''
                });
            }
        }

        if (!cards.length) {
            this.myProjectsSummaries = [];
            this.renderProjectsEmpty('当前项目目录下还没有可展示的本地项目。', { cacheResult: true });
            this.persistMyProjectsSummariesToLocalStorage();
            return;
        }
        const localProjectRefs = cards.map((item) => ({
            projectPath: String(item?.path || ''),
            projectUuid: String(item?.projectUuid || '')
        }));
        this.projectBackupMap = await this.fetchProjectBackupMap(localProjectRefs);
        const allBackupsMap = await this.fetchProjectBackupMap([]);
        const backupMapForCloudOnly = allBackupsMap.size ? allBackupsMap : this.projectBackupMap;
        const cloudOnlyCards = this.buildCloudOnlyBackupCards(cards, backupMapForCloudOnly);
        const allCards = [...cards, ...cloudOnlyCards];
        this.marketplacePublishStatusMap = await this.fetchMarketplacePublishStatusMap(localProjectRefs);

        this.myProjectsSummaries = this.buildMyProjectsSummariesFromAllCards(allCards);
        await this.renderMyProjectsFromSummaries(this.myProjectsSummaries);
        this.myProjectsHasLoaded = true;
        this.myProjectsCacheDirty = false;
        this.persistMyProjectsSummariesToLocalStorage();
    }

    /**
     * 合并单项目备份映射后刷新该卡片与摘要（上传/更新备份成功）。
     * @param {string} projectPath
     * @param {string} projectUuid
     * @returns {Promise<void>}
     */
    async mergeMyProjectBackupAfterUpload(projectPath, projectUuid = '') {
        const normalizedPath = this.normalizeProjectPath(projectPath);
        const normalizedUuid = this.normalizeProjectUuid(projectUuid);
        const slice = await this.fetchProjectBackupMap([
            { projectPath: normalizedPath, projectUuid: normalizedUuid }
        ]);
        for (const [k, v] of slice.entries()) {
            this.projectBackupMap.set(k, v);
        }
        const backupInfo =
            (normalizedUuid && this.projectBackupMap.get(`uuid:${normalizedUuid}`)) ||
            this.projectBackupMap.get(normalizedPath) ||
            null;
        if (!backupInfo?.backupAt) {
            await this.refreshMyProjectsFullRescan({ showLoading: false });
            return;
        }
        const list = Array.isArray(this.myProjectsSummaries) ? this.myProjectsSummaries : [];
        const idx = list.findIndex(
            (row) =>
                this.normalizeProjectPath(String(row?.path || '')) === normalizedPath ||
                (normalizedUuid && this.normalizeProjectUuid(String(row?.projectUuid || '')) === normalizedUuid)
        );
        if (idx < 0) {
            await this.refreshMyProjectsFullRescan({ showLoading: false });
            return;
        }
        if (backupInfo?.backupAt) {
            list[idx] = {
                ...list[idx],
                hasBackup: true,
                backupAt: String(backupInfo.backupAt || ''),
                projectKey: String(backupInfo.projectKey || list[idx].projectKey || ''),
                fileCount: Number(backupInfo.fileCount || 0)
            };
        }
        if (this.projectsGrid) {
            const vm = this.summaryToMyProjectViewModel(list[idx]);
            const sel = normalizedUuid
                ? `[data-project-uuid="${this.escapeHtmlAttribute(normalizedUuid)}"]`
                : `[data-project-path="${this.escapeHtmlAttribute(normalizedPath)}"]`;
            const el = this.projectsGrid.querySelector(sel);
            if (el?.parentNode) {
                const wrap = document.createElement('div');
                wrap.innerHTML = this.buildMyProjectCardHtmlFromViewModel(vm).trim();
                const next = wrap.firstElementChild;
                if (next) {
                    el.replaceWith(next);
                    await this.initializeIconsForScope(this.projectsGrid);
                }
            }
        }
        this.persistMyProjectsSummariesToLocalStorage();
    }

    /**
     * 撤销备份后更新映射、卡片与摘要。
     * @param {string} projectPath
     * @param {string} projectUuid
     * @returns {Promise<void>}
     */
    async applyMyProjectBackupAfterRevoke(projectPath, projectUuid = '') {
        const normalizedPath = this.normalizeProjectPath(projectPath);
        const normalizedUuid = this.normalizeProjectUuid(projectUuid);
        const keysToDelete = new Set([normalizedPath, normalizedUuid ? `uuid:${normalizedUuid}` : ''].filter(Boolean));
        for (const k of keysToDelete) {
            this.projectBackupMap.delete(k);
        }
        const list = Array.isArray(this.myProjectsSummaries) ? this.myProjectsSummaries : [];
        const idx = list.findIndex(
            (row) =>
                this.normalizeProjectPath(String(row?.path || '')) === normalizedPath ||
                (normalizedUuid && this.normalizeProjectUuid(String(row?.projectUuid || '')) === normalizedUuid)
        );
        if (idx < 0) {
            await this.refreshMyProjectsFullRescan({ showLoading: false });
            return;
        }
        list[idx] = {
            ...list[idx],
            hasBackup: false,
            backupAt: '',
            projectKey: '',
            fileCount: 0
        };
        if (this.projectsGrid) {
            const vm = this.summaryToMyProjectViewModel(list[idx]);
            const sel = normalizedUuid
                ? `[data-project-uuid="${this.escapeHtmlAttribute(normalizedUuid)}"]`
                : `[data-project-path="${this.escapeHtmlAttribute(normalizedPath)}"]`;
            const el = this.projectsGrid.querySelector(sel);
            if (el?.parentNode) {
                const wrap = document.createElement('div');
                wrap.innerHTML = this.buildMyProjectCardHtmlFromViewModel(vm).trim();
                const next = wrap.firstElementChild;
                if (next) {
                    el.replaceWith(next);
                    await this.initializeIconsForScope(this.projectsGrid);
                }
            }
        }
        this.persistMyProjectsSummariesToLocalStorage();
    }

    /**
     * 仅根据当前摘要重新拉取集市发布态并更新卡片（无目录全量扫描）。
     * @returns {Promise<void>}
     */
    async resyncMyProjectsPublishStatusesOnly() {
        const list = Array.isArray(this.myProjectsSummaries) ? this.myProjectsSummaries : [];
        const refs = list
            .filter((s) => !s.isCloudOnly && this.normalizeProjectPath(String(s.path || '')))
            .map((s) => ({
                projectPath: this.normalizeProjectPath(String(s.path || '')),
                projectUuid: this.normalizeProjectUuid(String(s.projectUuid || ''))
            }));
        if (!refs.length) {
            return;
        }
        this.marketplacePublishStatusMap = await this.fetchMarketplacePublishStatusMap(refs);
        let changed = false;
        for (let i = 0; i < list.length; i += 1) {
            const s = list[i];
            if (s.isCloudOnly) {
                continue;
            }
            const ps = this.getMyProjectPublishStatus(String(s.path || ''), String(s.projectUuid || ''));
            if (String(s.publishStatusKey || '') !== ps.key) {
                list[i] = { ...s, publishStatusKey: ps.key };
                this.patchMyProjectPublishStatus(String(s.path || ''), String(s.projectUuid || ''), ps.key);
                changed = true;
            }
        }
        if (changed) {
            this.persistMyProjectsSummariesToLocalStorage();
        }
    }

    /**
     * 批量查询“我的项目”在创客集市中的发布状态。
     * @param {Array<string|{ projectPath?: string, projectUuid?: string }>} projectRefs
     * @returns {Promise<Map<string, 'unpublished'|'pending'|'approved'>>}
     */
    async fetchMarketplacePublishStatusMap(projectRefs) {
        const map = new Map();
        if (!window.electronAPI?.supabaseGetMarketplacePublishStatuses) {
            return map;
        }
        const refs = Array.isArray(projectRefs)
            ? projectRefs
                .map((item) =>
                    typeof item === 'string'
                        ? {
                              projectPath: this.normalizeProjectPath(item),
                              projectUuid: ''
                          }
                        : {
                              projectPath: this.normalizeProjectPath(item?.projectPath || ''),
                              projectUuid: this.normalizeProjectUuid(item?.projectUuid || '')
                          }
                )
                .filter((item) => item.projectPath || item.projectUuid)
            : [];
        if (!refs.length) {
            return map;
        }
        console.log('[account-center] fetchMarketplacePublishStatusMap:req', {
            pathCount: refs.length,
            samplePaths: refs.slice(0, 3)
        });
        try {
            let result = await window.electronAPI.supabaseGetMarketplacePublishStatuses({ projectRefs: refs });
            console.log('[account-center] fetchMarketplacePublishStatusMap:resp', {
                success: Boolean(result?.success),
                statusesCount: Array.isArray(result?.statuses) ? result.statuses.length : 0,
                error: String(result?.error || '')
            });
            if (
                !result?.success &&
                this.isAuthStateLikelyStaleError(result?.error) &&
                this.authState?.isAuthenticated
            ) {
                await this.refreshAuthState();
                result = await window.electronAPI.supabaseGetMarketplacePublishStatuses({ projectRefs: refs });
                console.log('[account-center] fetchMarketplacePublishStatusMap:retry-resp', {
                    success: Boolean(result?.success),
                    statusesCount: Array.isArray(result?.statuses) ? result.statuses.length : 0,
                    error: String(result?.error || '')
                });
            }
            if (!result?.success || !Array.isArray(result.statuses)) {
                if (this.authState?.isAuthenticated && result?.error) {
                    this.showNotification(`发布状态读取失败：${this.localizeAuthMessage(String(result.error))}`, 'warning');
                }
                return map;
            }
            result.statuses.forEach((item) => {
                const pathKey = this.normalizeProjectPath(String(item?.projectPath || ''));
                if (!pathKey) return;
                const raw = String(item?.status || '').trim().toLowerCase();
                const status =
                    raw === 'approved'
                        ? 'approved'
                        : raw === 'pending'
                          ? 'pending'
                          : raw === 'rejected'
                            ? 'rejected'
                            : 'unpublished';
                map.set(pathKey, status);
                const uuidKey = this.normalizeProjectUuid(String(item?.projectUuid || ''));
                if (uuidKey) {
                    map.set(`uuid:${uuidKey}`, status);
                }
            });
        } catch (error) {
            if (this.authState?.isAuthenticated) {
                const msg = this.localizeAuthMessage(String(error?.message || error || ''));
                this.showNotification(`发布状态读取失败：${msg}`, 'warning');
            }
            return map;
        }
        return map;
    }

    /**
     * @param {string} projectPath
     * @returns {{ key: 'unpublished'|'pending'|'approved'|'rejected', text: string }}
     */
    getMyProjectPublishStatus(projectPath, projectUuid = '') {
        const normalizedPath = this.normalizeProjectPath(projectPath);
        const uuidKey = this.normalizeProjectUuid(projectUuid);
        const raw = String(
            (uuidKey && this.marketplacePublishStatusMap.get(`uuid:${uuidKey}`)) ||
                this.marketplacePublishStatusMap.get(normalizedPath) ||
                ''
        )
            .trim()
            .toLowerCase();
        if (raw === 'approved') {
            return { key: 'approved', text: '已发布' };
        }
        if (raw === 'pending') {
            return { key: 'pending', text: '待审核' };
        }
        if (raw === 'rejected') {
            return { key: 'rejected', text: '已拒绝' };
        }
        return { key: 'unpublished', text: '未发布' };
    }

    /**
     * 发布成功后，对“我的项目”卡片发布状态进行增量热更新。
     * @param {string} projectPath
     * @param {string} projectUuid
     * @param {'unpublished'|'pending'|'approved'|'rejected'} status
     * @returns {void}
     */
    patchMyProjectPublishStatus(projectPath, projectUuid = '', status = 'pending') {
        const nextStatus =
            status === 'approved'
                ? 'approved'
                : status === 'pending'
                  ? 'pending'
                  : status === 'rejected'
                    ? 'rejected'
                    : 'unpublished';
        const normalizedPath = this.normalizeProjectPath(projectPath || '');
        const uuidKey = this.normalizeProjectUuid(projectUuid || '');
        if (uuidKey) {
            this.marketplacePublishStatusMap.set(`uuid:${uuidKey}`, nextStatus);
        }
        if (normalizedPath) {
            this.marketplacePublishStatusMap.set(normalizedPath, nextStatus);
        }
        if (!this.projectsGrid) {
            return;
        }
        const selectors = [];
        if (uuidKey) {
            selectors.push(`[data-project-uuid="${this.escapeHtmlAttribute(uuidKey)}"]`);
        }
        if (normalizedPath) {
            selectors.push(`[data-project-path="${this.escapeHtmlAttribute(normalizedPath)}"]`);
        }
        if (!selectors.length) {
            return;
        }
        const card = this.projectsGrid.querySelector(selectors.join(', '));
        if (!card) {
            return;
        }
        const statusNode = card.querySelector('.my-project-card-publish-status');
        const textNode = statusNode?.querySelector('span:last-child');
        if (!statusNode || !textNode) {
            return;
        }
        const statusMeta =
            nextStatus === 'approved'
                ? { key: 'approved', text: '已发布' }
                : nextStatus === 'pending'
                  ? { key: 'pending', text: '待审核' }
                  : nextStatus === 'rejected'
                    ? { key: 'rejected', text: '已拒绝' }
                    : { key: 'unpublished', text: '未发布' };
        statusNode.classList.remove(
            'my-project-card-publish-status--unpublished',
            'my-project-card-publish-status--pending',
            'my-project-card-publish-status--approved',
            'my-project-card-publish-status--rejected'
        );
        statusNode.classList.add(`my-project-card-publish-status--${statusMeta.key}`);
        textNode.textContent = statusMeta.text;
        const list = Array.isArray(this.myProjectsSummaries) ? this.myProjectsSummaries : [];
        const idx = list.findIndex(
            (row) =>
                this.normalizeProjectPath(String(row?.path || '')) === normalizedPath ||
                (uuidKey && this.normalizeProjectUuid(String(row?.projectUuid || '')) === uuidKey)
        );
        if (idx >= 0) {
            list[idx] = { ...list[idx], publishStatusKey: nextStatus };
            this.persistMyProjectsSummariesToLocalStorage();
        }
        this.myProjectsHasLoaded = true;
        this.myProjectsCacheDirty = false;
    }

    /**
     * @param {string} message
     * @param {{ cacheResult?: boolean }} [options]
     */
    renderProjectsEmpty(message, options = {}) {
        if (!this.projectsGrid) {
            return;
        }
        this.projectsGrid.innerHTML = `<div class="account-empty-state">${this.escapeHtml(message)}</div>`;
        if (options?.cacheResult === false) {
            this.myProjectsCacheDirty = true;
            return;
        }
        this.myProjectsSummaries = [];
        this.persistMyProjectsSummariesToLocalStorage();
        this.myProjectsHasLoaded = true;
        this.myProjectsCacheDirty = false;
    }

    /**
     * 渲染统一的账户页居中加载态（旋转刷新图标）。
     * @param {HTMLElement | null} container
     * @returns {Promise<void>}
     */
    async renderAccountLoadingState(container) {
        if (!container) {
            return;
        }
        container.innerHTML = `
            <div class="account-loading-state" role="status" aria-live="polite" aria-label="正在加载">
                <img src="" alt="" data-icon="refresh">
            </div>
        `;
        await this.initializeIconsForScope(container);
    }

    /**
     * @param {Array<string|{ projectPath?: string, projectUuid?: string }>} projectRefs
     * @returns {Promise<Map<string, { backupAt: string, fileCount: number }>>}
     */
    async fetchProjectBackupMap(projectRefs) {
        if (!window.electronAPI?.supabaseListProjectBackups) {
            return new Map();
        }
        try {
            const refs = Array.isArray(projectRefs)
                ? projectRefs
                    .map((item) =>
                        typeof item === 'string'
                            ? {
                                  projectPath: this.normalizeProjectPath(item),
                                  projectUuid: ''
                              }
                            : {
                                  projectPath: this.normalizeProjectPath(item?.projectPath || ''),
                                  projectUuid: this.normalizeProjectUuid(item?.projectUuid || '')
                              }
                    )
                    .filter((item) => item.projectPath || item.projectUuid)
                : [];
            console.log('[account-center] fetchProjectBackupMap:req', {
                pathCount: refs.length
            });
            let result = await window.electronAPI.supabaseListProjectBackups(refs.length ? { projectRefs: refs } : {});
            console.log('[account-center] fetchProjectBackupMap:resp', {
                success: Boolean(result?.success),
                backupsCount: Array.isArray(result?.backups) ? result.backups.length : 0,
                error: String(result?.error || '')
            });
            if (
                !result?.success &&
                this.isAuthStateLikelyStaleError(result?.error) &&
                this.authState?.isAuthenticated
            ) {
                await this.refreshAuthState();
                result = await window.electronAPI.supabaseListProjectBackups(refs.length ? { projectRefs: refs } : {});
                console.log('[account-center] fetchProjectBackupMap:retry-resp', {
                    success: Boolean(result?.success),
                    backupsCount: Array.isArray(result?.backups) ? result.backups.length : 0,
                    error: String(result?.error || '')
                });
            }
            if (!result?.success || !Array.isArray(result.backups)) {
                if (this.authState?.isAuthenticated && result?.error) {
                    this.showNotification(`备份状态读取失败：${this.localizeAuthMessage(String(result.error))}`, 'warning');
                }
                return new Map();
            }
            const map = new Map();
            for (const item of result.backups) {
                const normalizedPath = this.normalizeProjectPath(item?.projectPath);
                const normalizedUuid = this.normalizeProjectUuid(String(item?.projectUuid || ''));
                const nameKey = String(item?.projectName || '').trim().toLowerCase();
                const backupInfo = {
                    backupAt: String(item?.backupAt || ''),
                    fileCount: Number(item?.fileCount || 0),
                    projectName: String(item?.projectName || '').trim(),
                    projectKey: String(item?.projectKey || '').trim(),
                    lastModified: String(item?.lastModified || '').trim(),
                    projectPath: normalizedPath,
                    projectUuid: normalizedUuid
                };
                if (normalizedPath) {
                    map.set(normalizedPath, backupInfo);
                }
                if (normalizedUuid) {
                    map.set(`uuid:${normalizedUuid}`, backupInfo);
                }
                if (nameKey && !map.has(nameKey)) {
                    map.set(nameKey, backupInfo);
                }
            }
            return map;
        } catch (error) {
            if (this.authState?.isAuthenticated) {
                const msg = this.localizeAuthMessage(String(error?.message || error || ''));
                this.showNotification(`备份状态读取失败：${msg}`, 'warning');
            }
            return new Map();
        }
    }

    /**
     * @param {Array<{ projectName: string, path: string }>} localCards
     * @param {Map<string, any>} [backupMap]
     * @returns {Array<{ folderName: string, path: string, projectName: string, description: string, componentCount: number, connectionCount: number, lastModified: string, projectKey?: string, isCloudOnly: boolean }>}
     */
    buildCloudOnlyBackupCards(localCards, backupMap = this.projectBackupMap) {
        const localNameSet = new Set(
            localCards
                .map((item) => String(item?.projectName || '').trim().toLowerCase())
                .filter(Boolean)
        );
        const cloudCards = [];
        const seenProjectKeys = new Set();
        for (const backupInfo of backupMap.values()) {
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
     * @param {string} [projectUuid]
     * @returns {Promise<void>}
     */
    async uploadProjectBackup(projectPath, projectName, projectUuid = '') {
        if (!this.ensureBackupOperationAllowed()) {
            return;
        }
        if (!this.isFullAccountRole()) {
            this.showNotification('当前为免费版，云端备份上传功能受限。', 'warning');
            return;
        }
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
        const normalizedUuid = this.normalizeProjectUuid(projectUuid);
        this.uploadingProjectPaths.add(normalizedPath);
        this.setBackupButtonLoading(normalizedPath, true);
        const existing =
            (normalizedUuid && this.projectBackupMap.get(`uuid:${normalizedUuid}`)) ||
            this.projectBackupMap.get(normalizedPath) ||
            this.projectBackupMap.get(String(projectName || '').trim().toLowerCase());
        this.showNotification(existing?.backupAt ? '正在更新备份，请稍候...' : '正在上传备份，请稍候...', 'info');
        try {
            const result = await window.electronAPI.supabaseUploadProjectBackup({
                projectPath: normalizedPath,
                projectUuid: normalizedUuid || undefined,
                projectName: String(projectName || '').trim() || undefined
            });
            if (!result?.success) {
                this.showNotification(this.formatResultError(result, '上传备份失败，请稍后重试。'), 'error');
                return;
            }
            this.showNotification(String(result?.message || '项目备份上传成功。'), 'success');
            await this.mergeMyProjectBackupAfterUpload(normalizedPath, normalizedUuid);
        } finally {
            this.uploadingProjectPaths.delete(normalizedPath);
            this.setBackupButtonLoading(normalizedPath, false);
        }
    }

    /**
     * @param {string} projectPath
     * @param {string} projectName
     * @param {string} [projectUuid]
     * @returns {Promise<void>}
     */
    async deleteProjectBackup(projectPath, projectName, projectUuid = '') {
        if (!this.ensureBackupOperationAllowed()) {
            return;
        }
        const normalizedPath = this.normalizeProjectPath(projectPath);
        if (!normalizedPath) {
            this.showNotification('项目路径无效，无法撤销备份。', 'warning');
            return;
        }
        const normalizedUuid = this.normalizeProjectUuid(projectUuid);
        const existing =
            (normalizedUuid && this.projectBackupMap.get(`uuid:${normalizedUuid}`)) ||
            this.projectBackupMap.get(normalizedPath) ||
            this.projectBackupMap.get(String(projectName || '').trim().toLowerCase());
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
            const result = await window.electronAPI.supabaseDeleteProjectBackup({
                projectPath: normalizedPath,
                projectUuid: normalizedUuid || undefined
            });
            if (!result?.success) {
                this.showNotification(this.formatResultError(result, '撤销备份失败，请稍后重试。'), 'error');
                return;
            }
            this.showNotification(String(result?.message || '已撤销当前项目备份。'), 'success');
            await this.applyMyProjectBackupAfterRevoke(normalizedPath, normalizedUuid);
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
        if (!this.isFullAccountRole()) {
            this.showNotification('当前为免费版，从云端恢复备份功能受限。', 'warning');
            return;
        }
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
        await this.refreshMyProjectsFullRescan({ showLoading: false });
    }

    /**
     * 备份相关操作（上传/更新/撤销）的统一登录态校验。
     * @returns {boolean}
     */
    ensureBackupOperationAllowed() {
        if (this.authState?.isAuthenticated) {
            return true;
        }
        this.showNotification('请先登录后再对备份进行操作。', 'warning');
        return false;
    }

    /**
     * 复制项目编号到剪贴板（复用 settings 模态的邀请码复制体验）。
     * @param {string} projectKey
     * @returns {Promise<void>}
     */
    async copyProjectKeyToClipboard(projectKey) {
        const value = String(projectKey || '').trim();
        if (!value || value === '暂无project_key') {
            this.showNotification('当前项目暂无可复制的项目编号，请先上传备份。', 'info');
            return;
        }
        try {
            if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
                throw new Error('clipboard_unavailable');
            }
            await navigator.clipboard.writeText(value);
            this.showNotification('项目编号已复制。', 'success');
        } catch {
            try {
                const textarea = document.createElement('textarea');
                textarea.value = value;
                textarea.setAttribute('readonly', 'readonly');
                textarea.style.position = 'fixed';
                textarea.style.opacity = '0';
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
                this.showNotification('项目编号已复制。', 'success');
            } catch {
                this.showNotification('复制失败，请手动复制项目编号。', 'error');
            }
        }
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
     * @param {string} value
     * @returns {string}
     */
    normalizeProjectUuid(value) {
        const v = String(value || '').trim().toLowerCase();
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v) ? v : '';
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
        if (!this.isPermissionManagementViewer()) {
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
            setText('permission-free-count', Number(stats.freeCount || 0));
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
        const viewerSuper = this.isSuperPermissionManager();
        this.permissionUsersTbody.innerHTML = this.permissionUsers.map((user) => {
            const roleKey = String(user?.role || 'free').toLowerCase();
            const roleClass = roleKey.replace(/_/g, '-');
            const roleLabel = this.mapRoleLabel(roleKey);
            const createdText = this.formatDateTime(String(user?.createdAt || '')) || '-';
            const email = this.escapeHtml(String(user?.email || '-'));
            const displayName = this.escapeHtml(String(user?.displayName || '-') || '-');
            const userId = this.escapeHtml(String(user?.id || ''));
            const busy = this.permissionUpdatingUserIds.has(String(user?.id || ''));
            const d = busy ? 'disabled' : '';
            /** @type {string} */
            let actionButtons = '';
            if (roleKey === 'super_admin') {
                actionButtons = '<span style="color:#8b2b52;font-size:12px;">超级管理员不可在此变更</span>';
            } else if (roleKey === 'admin') {
                actionButtons = viewerSuper
                    ? `
                <button type="button" class="permission-action-btn" data-permission-role-update="1" data-user-id="${userId}" data-user-email="${email}" data-target-role="user" ${d}>设为用户</button>
                <button type="button" class="permission-action-btn" data-permission-role-update="1" data-user-id="${userId}" data-user-email="${email}" data-target-role="free" ${d}>设为免费用户</button>
                `
                    : '<span style="color:#6c7894;font-size:12px;">无权变更其他管理员</span>';
            } else if (roleKey === 'user') {
                actionButtons = viewerSuper
                    ? `
                <button type="button" class="permission-action-btn" data-permission-role-update="1" data-user-id="${userId}" data-user-email="${email}" data-target-role="admin" ${d}>设为管理员</button>
                <button type="button" class="permission-action-btn" data-permission-role-update="1" data-user-id="${userId}" data-user-email="${email}" data-target-role="free" ${d}>设为免费用户</button>
                `
                    : `
                <button type="button" class="permission-action-btn" data-permission-role-update="1" data-user-id="${userId}" data-user-email="${email}" data-target-role="free" ${d}>设为免费用户</button>
                `;
            } else if (roleKey === 'free') {
                actionButtons = viewerSuper
                    ? `
                <button type="button" class="permission-action-btn" data-permission-role-update="1" data-user-id="${userId}" data-user-email="${email}" data-target-role="admin" ${d}>设为管理员</button>
                <button type="button" class="permission-action-btn" data-permission-role-update="1" data-user-id="${userId}" data-user-email="${email}" data-target-role="user" ${d}>设为用户</button>
                `
                    : `
                <button type="button" class="permission-action-btn" data-permission-role-update="1" data-user-id="${userId}" data-user-email="${email}" data-target-role="user" ${d}>设为用户</button>
                `;
            } else {
                actionButtons = viewerSuper
                    ? `
                <button type="button" class="permission-action-btn" data-permission-role-update="1" data-user-id="${userId}" data-user-email="${email}" data-target-role="admin" ${d}>设为管理员</button>
                <button type="button" class="permission-action-btn" data-permission-role-update="1" data-user-id="${userId}" data-user-email="${email}" data-target-role="user" ${d}>设为用户</button>
                `
                    : `
                <button type="button" class="permission-action-btn" data-permission-role-update="1" data-user-id="${userId}" data-user-email="${email}" data-target-role="user" ${d}>设为用户</button>
                `;
            }
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
     * 管理员或超级管理员修改用户角色（管理员仅可在 free / user 间切换）。
     * @param {string} userId
     * @param {string} role
     * @param {string} email
     * @returns {Promise<void>}
     */
    async handlePermissionRoleUpdate(userId, role, email) {
        const normalizedUserId = String(userId || '').trim();
        const targetRole = String(role || '').trim().toLowerCase();
        if (!normalizedUserId || !['free', 'user', 'admin'].includes(targetRole)) {
            return;
        }
        const viewerKey = String(this.authState?.role || '').toLowerCase();
        if (viewerKey === 'admin' && !['free', 'user'].includes(targetRole)) {
            this.showNotification('管理员仅可在「普通用户」与「免费用户」之间切换。', 'warning');
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
     * @param {string} [projectUuid]
     * @returns {void}
     */
    openMarketplacePublishModal(projectPath, projectName, description, projectUuid = '') {
        if (!this.authState?.isAuthenticated) {
            this.showNotification('请先登录后再发布到创客集市。', 'warning');
            this.switchMainTab('personal-center');
            this.switchSubTab('account-settings');
            return;
        }
        if (!this.isFullAccountRole()) {
            this.showNotification('当前为免费版，发布到创客集市功能受限。', 'warning');
            return;
        }
        this.marketplacePublishContext = {
            projectPath: String(projectPath || '').trim(),
            projectUuid: this.normalizeProjectUuid(projectUuid),
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
        const authorName = this.getMarketplaceAuthorLabel(this.authState?.displayName || this.authState?.email || '');
        this.marketplacePublishPreview.innerHTML = `
            <article class="marketplace-card">
                <div class="marketplace-card-head">
                    <strong>${this.escapeHtml(this.marketplacePublishContext.projectName)}</strong>
                    <span>发布时间：待审核通过后写入</span>
                </div>
                <div class="marketplace-card-body">
                    <p class="marketplace-card-desc">项目描述：${this.escapeHtml(finalDescription)}</p>
                    <p class="marketplace-card-meta">项目作者：${this.escapeHtml(authorName)}</p>
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
     * 统一计算创客集市卡片的“项目作者”展示文案。
     * @param {string} rawName
     * @returns {string}
     */
    getMarketplaceAuthorLabel(rawName) {
        const name = String(rawName || '').trim();
        return name || '未知发布者';
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
     * @param {boolean} loading
     * @returns {void}
     */
    setMarketplaceSearchButtonLoading(loading) {
        if (!this.marketplaceSearchBtn) {
            return;
        }
        const busy = Boolean(loading);
        this.marketplaceSearchBtn.setAttribute('aria-busy', busy ? 'true' : 'false');
        this.marketplaceSearchBtn.classList.toggle('is-uploading', busy);
    }

    /**
     * 统一处理“搜索 / 回到首页”动作，复用搜索按钮加载态。
     * @returns {Promise<void>}
     */
    async executeMarketplaceSearchAction() {
        this.setMarketplaceSearchButtonLoading(true);
        try {
            await this.refreshMarketplaceApprovedPosts({
                allowNetworkFetch: true,
                showLoading: false,
                userInitiatedSearch: true
            });
        } finally {
            this.setMarketplaceSearchButtonLoading(false);
        }
    }

    /**
     * @param {'approved'|'pending'} type
     * @param {string} key
     * @returns {boolean}
     */
    isMarketplaceListCacheFresh(type, key) {
        const state = this.marketplaceListCacheState?.[type];
        if (!state) {
            return false;
        }
        if (String(state.key || '') !== String(key || '')) {
            return false;
        }
        const ts = Number(state.ts || 0);
        if (!Number.isFinite(ts) || ts <= 0) {
            return false;
        }
        return Date.now() - ts < this.marketplaceListStaleMs;
    }

    /**
     * @param {'approved'|'pending'} type
     * @param {string} key
     * @returns {void}
     */
    touchMarketplaceListCache(type, key) {
        if (!this.marketplaceListCacheState?.[type]) {
            return;
        }
        this.marketplaceListCacheState[type].key = String(key || '');
        this.marketplaceListCacheState[type].ts = Date.now();
    }

    /**
     * 仅失效已通过集市的内存 TTL 与详情缓存，不删磁盘摘要、不触发列表拉取。
     * @returns {void}
     */
    invalidateMarketplaceApprovedClientCache() {
        this.marketplaceListCacheState.approved.ts = 0;
        this.marketplacePostDetailCache.clear();
    }

    /**
     * 待审列表等需整体失效时使用（含 pending TTL）。
     * @returns {void}
     */
    invalidateMarketplaceCaches() {
        this.invalidateMarketplaceApprovedClientCache();
        this.marketplaceListCacheState.pending.ts = 0;
    }

    /**
     * 供 CSS 属性选择器使用的转义（优先 CSS.escape）。
     * @param {string} value
     * @returns {string}
     */
    cssEscapeSelectorValue(value) {
        const s = String(value || '');
        if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
            return CSS.escape(s);
        }
        return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    }

    /**
     * 仅保留卡片展示所需字段，降低 localStorage 体积。
     * @param {Record<string, unknown>} post
     * @returns {Record<string, unknown>}
     */
    slimMarketplaceApprovedPostForStorage(post) {
        const p = post && typeof post === 'object' ? post : {};
        return {
            id: String(p.id || ''),
            project_name: p.project_name,
            description: p.description,
            published_at: p.published_at,
            author_name: p.author_name,
            likes_count: p.likes_count,
            favorites_count: p.favorites_count,
            remixes_count: p.remixes_count,
            viewer_liked: Boolean(p.viewer_liked),
            viewer_favorited: Boolean(p.viewer_favorited)
        };
    }

    /**
     * @param {Record<string, unknown>} row
     * @returns {Record<string, unknown>}
     */
    slimSharedBackupCardForStorage(row) {
        const r = row && typeof row === 'object' ? row : {};
        return {
            projectKey: String(r.projectKey || '').trim(),
            projectName: String(r.projectName || '').trim(),
            backupAt: String(r.backupAt || ''),
            authorName: String(r.authorName || '')
        };
    }

    /**
     * 创客集市首屏：磁盘摘要 + 可选共享备份条；本会话仅后台静默拉取当前筛选下列表一次。
     * @returns {Promise<void>}
     */
    async presentMakerMarketplaceTab() {
        if (!this.marketplaceGrid || !window.electronAPI?.supabaseListMarketplaceApprovedPosts) {
            return;
        }
        await this.refreshAuthState();
        if (!this.authState?.isAuthenticated) {
            this.marketplaceGrid.innerHTML = '<div class="account-empty-state">请先登录后查看创客集市。</div>';
            this.marketplaceHasLoaded = true;
            return;
        }
        const query = String(this.marketplaceSearchInput?.value || '').trim();
        const sortBy = String(this.marketplaceSortSelect?.value || 'likes').trim();
        const approvedCacheKey = `${query}::${sortBy}`;
        const sharedBackupQuery = String(query || '').trim().toLowerCase();
        const needSharedBackupSearch = /^[a-f0-9]{24}$/.test(sharedBackupQuery);
        /** @type {Array<Record<string, unknown>>} */
        let sharedCards = [];
        if (needSharedBackupSearch && this.isFullAccountRole() && window.electronAPI?.supabaseSearchSharedBackupProjectsByKey) {
            const shared = await window.electronAPI.supabaseSearchSharedBackupProjectsByKey({
                projectKey: sharedBackupQuery
            });
            if (shared?.success && Array.isArray(shared.projects)) {
                sharedCards = shared.projects;
            }
        }
        if (
            this._sessionMarketplaceInitialSyncDone &&
            String(this._marketplaceLastApprovedCacheKey || '') === approvedCacheKey &&
            Array.isArray(this.marketplacePosts)
        ) {
            await this.syncMarketplaceApprovedGridDom(
                sharedCards.length ? sharedCards : this.marketplaceSharedCardsForGrid,
                this.marketplacePosts
            );
            this.marketplaceHasLoaded = true;
            return;
        }
        this.tryRestoreMarketplaceApprovedFromLocalStorage(approvedCacheKey);
        const sharedForDom = sharedCards.length ? sharedCards : this.marketplaceSharedCardsForGrid;
        await this.syncMarketplaceApprovedGridDom(
            sharedForDom,
            Array.isArray(this.marketplacePosts) ? this.marketplacePosts : []
        );
        this.marketplaceHasLoaded = true;
        void this.ensureMarketplaceSessionInitialBackgroundSync(approvedCacheKey, sharedCards);
    }

    /**
     * 本会话首次进入创客集市已通过区时，在后台静默拉取当前搜索/排序下列表一次。
     * @param {string} approvedCacheKey
     * @param {Array<Record<string, unknown>>} sharedCardsFromSearch
     * @returns {Promise<void>}
     */
    async ensureMarketplaceSessionInitialBackgroundSync(approvedCacheKey, sharedCardsFromSearch) {
        if (this._sessionMarketplaceInitialSyncDone) {
            return;
        }
        if (this._sessionMarketplaceInitialSyncPromise) {
            await this._sessionMarketplaceInitialSyncPromise;
            return;
        }
        this._sessionMarketplaceInitialSyncPromise = (async () => {
            try {
                await this.refreshMarketplaceApprovedPosts({
                    allowNetworkFetch: true,
                    showLoading: false,
                    preloadedSharedCards: sharedCardsFromSearch
                });
                this._sessionMarketplaceInitialSyncDone = true;
            } finally {
                this._sessionMarketplaceInitialSyncPromise = null;
            }
        })();
        await this._sessionMarketplaceInitialSyncPromise;
    }

    /**
     * 从 localStorage 恢复创客集市已通过列表摘要（ownerKey + cacheKey 一致）。
     * @param {string} approvedCacheKey
     * @returns {boolean}
     */
    tryRestoreMarketplaceApprovedFromLocalStorage(approvedCacheKey) {
        const ownerKey = String(this.myProjectsCacheOwnerKey || '').trim();
        if (!ownerKey || ownerKey === 'anonymous') {
            return false;
        }
        const key = String(approvedCacheKey || '').trim();
        if (!key) {
            return false;
        }
        try {
            let raw = localStorage.getItem(FH_LS_MARKETPLACE_APPROVED_SUMMARIES);
            if (!raw) {
                raw = localStorage.getItem(FH_LS_MARKETPLACE_APPROVED_LEGACY);
                if (!raw) {
                    return false;
                }
                const leg = JSON.parse(raw);
                if (String(leg?.ownerKey || '') !== ownerKey || String(leg?.cacheKey || '') !== key) {
                    return false;
                }
                const posts = Array.isArray(leg?.posts) ? leg.posts : [];
                this.marketplacePosts = posts.map((p) => this.slimMarketplaceApprovedPostForStorage(p));
                this.marketplaceSharedCardsForGrid = [];
                return true;
            }
            const parsed = JSON.parse(raw);
            if (String(parsed?.ownerKey || '') !== ownerKey || String(parsed?.cacheKey || '') !== key) {
                return false;
            }
            const posts = Array.isArray(parsed?.posts) ? parsed.posts : [];
            this.marketplacePosts = posts.map((p) => this.slimMarketplaceApprovedPostForStorage(p));
            const shared = Array.isArray(parsed?.sharedCards) ? parsed.sharedCards : [];
            this.marketplaceSharedCardsForGrid = shared.map((s) => this.slimSharedBackupCardForStorage(s));
            return true;
        } catch {
            return false;
        }
    }

    /**
     * 持久化创客集市已通过列表摘要（卡片字段 + 可选共享备份条）。
     * @param {string} approvedCacheKey
     * @returns {void}
     */
    persistMarketplaceApprovedToLocalStorage(approvedCacheKey) {
        const ownerKey = String(this.myProjectsCacheOwnerKey || '').trim();
        if (!ownerKey || ownerKey === 'anonymous') {
            return;
        }
        const key = String(approvedCacheKey || '').trim();
        try {
            const posts = (Array.isArray(this.marketplacePosts) ? this.marketplacePosts : []).map((p) =>
                this.slimMarketplaceApprovedPostForStorage(p)
            );
            const sharedCards = (Array.isArray(this.marketplaceSharedCardsForGrid) ? this.marketplaceSharedCardsForGrid : []).map(
                (s) => this.slimSharedBackupCardForStorage(s)
            );
            localStorage.setItem(
                FH_LS_MARKETPLACE_APPROVED_SUMMARIES,
                JSON.stringify({
                    ownerKey,
                    cacheKey: key,
                    posts,
                    sharedCards,
                    ts: Date.now()
                })
            );
        } catch {
            /* ignore */
        }
    }

    /**
     * 当前搜索框 + 排序组成的已通过列表缓存键。
     * @returns {string}
     */
    getCurrentMarketplaceApprovedCacheKey() {
        const query = String(this.marketplaceSearchInput?.value || '').trim();
        const sortBy = String(this.marketplaceSortSelect?.value || 'likes').trim();
        return `${query}::${sortBy}`;
    }

    /**
     * 已通过列表内存变更后写回 localStorage，供下次冷启动首屏与开发环境一致。
     * @returns {void}
     */
    persistMarketplaceApprovedCacheIfPossible() {
        if (!this.authState?.isAuthenticated || !this.marketplaceGrid) {
            return;
        }
        this.persistMarketplaceApprovedToLocalStorage(this.getCurrentMarketplaceApprovedCacheKey());
    }

    /**
     * 超级管理员删除等：从内存与 DOM 移除单条已发布记录并写回摘要缓存（不拉全量列表）。
     * @param {string} postId
     * @param {string} approvedCacheKey
     * @returns {Promise<void>}
     */
    async removeMarketplaceApprovedPostLocally(postId, approvedCacheKey) {
        const id = String(postId || '').trim();
        if (!id || !Array.isArray(this.marketplacePosts)) {
            return;
        }
        this.marketplacePosts = this.marketplacePosts.filter((p) => String(p?.id || '').trim() !== id);
        if (this.marketplaceGrid) {
            const el = this.marketplaceGrid.querySelector(`[data-marketplace-post-id="${this.cssEscapeSelectorValue(id)}"]`);
            el?.remove();
        }
        this.persistMarketplaceApprovedToLocalStorage(approvedCacheKey);
        await this.initializeIconsForScope(this.marketplaceGrid);
    }

    /**
     * 就地更新已发布集市卡片 DOM（避免整表 innerHTML 闪烁）。
     * @param {HTMLElement} el
     * @param {Record<string, unknown>} post
     * @returns {void}
     */
    patchApprovedMarketplaceCardElement(el, post) {
        const title = String(post.project_name || '').trim();
        const desc = `项目描述：${String(post.description || '').trim() || '暂无描述'}`;
        const author = `项目作者：${this.getMarketplaceAuthorLabel(String(post.author_name || ''))}`;
        const headStrong = el.querySelector('.marketplace-card-head strong');
        if (headStrong) {
            headStrong.textContent = title;
        }
        const headSpans = el.querySelectorAll('.marketplace-card-head > span');
        const timeSpan = headSpans.length ? headSpans[headSpans.length - 1] : null;
        if (timeSpan) {
            timeSpan.textContent = `发布时间：${this.formatDateTime(String(post.published_at || ''))}`;
        }
        const descEl = el.querySelector('.marketplace-card-desc');
        if (descEl) {
            descEl.textContent = desc;
        }
        const metaEl = el.querySelector('.marketplace-card-meta');
        if (metaEl) {
            metaEl.textContent = author;
        }
        const counts = el.querySelectorAll('.marketplace-card-actions .marketplace-card-interact-count');
        if (counts[0]) {
            counts[0].textContent = String(Number(post.likes_count || 0));
        }
        if (counts[1]) {
            counts[1].textContent = String(Number(post.favorites_count || 0));
        }
        if (counts[2]) {
            counts[2].textContent = String(Number(post.remixes_count || 0));
        }
        const liked = Boolean(post.viewer_liked);
        const favorited = Boolean(post.viewer_favorited);
        const likeBtn = el.querySelector('[data-marketplace-interact="like"]');
        if (likeBtn) {
            likeBtn.classList.toggle('is-active', liked);
            likeBtn.setAttribute('data-viewer-active', liked ? '1' : '0');
            const img = likeBtn.querySelector('img[data-icon]');
            if (img) {
                img.dataset.icon = liked ? 'thumbs-up-filled' : 'thumbs-up';
            }
        }
        const favBtn = el.querySelector('[data-marketplace-interact="favorite"]');
        if (favBtn) {
            favBtn.classList.toggle('is-active', favorited);
            favBtn.setAttribute('data-viewer-active', favorited ? '1' : '0');
            const img = favBtn.querySelector('img[data-icon]');
            if (img) {
                img.dataset.icon = favorited ? 'star-filled' : 'star';
            }
        }
    }

    /**
     * 将共享备份条与已发布卡片同步到 DOM（增量：增删改、保持顺序）。
     * @param {Array<Record<string, unknown>>} sharedCards
     * @param {Array<Record<string, unknown>>} nextPosts
     * @returns {Promise<void>}
     */
    async syncMarketplaceApprovedGridDom(sharedCards, nextPosts) {
        if (!this.marketplaceGrid) {
            return;
        }
        const grid = this.marketplaceGrid;
        // 清空「未找到 / 加载中 / 请先登录」等占位，避免与增量插入的卡片叠在一起
        grid.querySelectorAll(':scope > .account-empty-state').forEach((n) => n.remove());
        grid.querySelectorAll(':scope > .account-loading-state').forEach((n) => n.remove());
        grid.querySelectorAll('.marketplace-card--shared-backup').forEach((n) => n.remove());
        const sharedHtml = (Array.isArray(sharedCards) ? sharedCards : [])
            .map((item) => this.renderSharedBackupMarketplaceCardHtml(item))
            .join('');
        if (sharedHtml) {
            const wrap = document.createElement('div');
            wrap.innerHTML = sharedHtml;
            const nodes = [...wrap.children];
            nodes.reverse().forEach((ch) => grid.insertBefore(ch, grid.firstChild));
        }
        const list = Array.isArray(nextPosts) ? nextPosts : [];
        const nextIdSet = new Set(list.map((p) => String(p?.id || '').trim()).filter(Boolean));
        grid.querySelectorAll('[data-marketplace-post-id]').forEach((node) => {
            const pid = String(node.getAttribute('data-marketplace-post-id') || '').trim();
            if (!nextIdSet.has(pid)) {
                node.remove();
            }
        });
        const fragment = document.createDocumentFragment();
        for (const post of list) {
            const pid = String(post?.id || '').trim();
            if (!pid) {
                continue;
            }
            const sel = `[data-marketplace-post-id="${this.cssEscapeSelectorValue(pid)}"]`;
            let el = /** @type {HTMLElement | null} */ (grid.querySelector(sel));
            if (!el) {
                const wrap = document.createElement('div');
                wrap.innerHTML = this.renderApprovedMarketplaceCardHtml(post).trim();
                el = /** @type {HTMLElement | null} */ (wrap.firstElementChild);
                if (!el) {
                    continue;
                }
            } else {
                this.patchApprovedMarketplaceCardElement(el, post);
            }
            fragment.appendChild(el);
        }
        grid.appendChild(fragment);
        await this.initializeIconsForScope(grid);
    }

    /**
     * @returns {Promise<void>}
     */
    async confirmMarketplacePublish() {
        if (this.marketplacePublishConfirmBtn?.classList.contains('is-uploading')) {
            return;
        }
        if (!this.isFullAccountRole()) {
            this.showNotification('当前为免费版，发布到创客集市功能受限。', 'warning');
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
                projectUuid: this.marketplacePublishContext.projectUuid || undefined,
                projectName: this.marketplacePublishContext.projectName,
                description
            });
            if (!result?.success) {
                this.showNotification(this.formatResultError(result, '发布失败，请稍后重试。'), 'error');
                return;
            }
            const savedPath = String(this.marketplacePublishContext.projectPath || '');
            const savedUuid = String(this.marketplacePublishContext.projectUuid || '');
            this.showNotification(String(result?.message || '发布成功，等待审核。'), 'success');
            this.closeMarketplacePublishModal();
            this.patchMyProjectPublishStatus(savedPath, savedUuid, 'pending');
            this.invalidateMarketplaceApprovedClientCache();
            await this.refreshMarketplacePendingPosts();
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
        const pendingCacheKey = 'admin';
        if (this.isMarketplaceListCacheFresh('pending', pendingCacheKey) && Array.isArray(this.marketplacePendingPosts)) {
            if (this.communityPendingContainer) {
                this.communityPendingContainer.innerHTML = this.renderPendingMarketplaceCards();
            }
            return;
        }
        const result = await window.electronAPI.supabaseListMarketplacePendingPosts();
        if (!result?.success) {
            this.showNotification(this.formatResultError(result, '读取待审核列表失败。'), 'error');
            return;
        }
        this.marketplacePendingPosts = Array.isArray(result?.posts) ? result.posts : [];
        this.touchMarketplaceListCache('pending', pendingCacheKey);
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
                    <article class="marketplace-card marketplace-card--pending-review marketplace-card--selectable" data-pending-post-id="${this.escapeHtml(String(post.id || ''))}">
                        <div class="marketplace-card-head">
                            <strong>${this.escapeHtml(String(post.project_name || ''))}</strong>
                            <span>提交时间：${this.escapeHtml(this.formatDateTime(String(post.created_at || '')))}</span>
                        </div>
                        <div class="marketplace-card-body">
                            <p class="marketplace-card-desc">项目描述：${this.escapeHtml(String(post.description || '').trim() || '暂无描述')}</p>
                            <p class="marketplace-card-meta">项目作者：${this.escapeHtml(this.getMarketplaceAuthorLabel(String(post.author_name || '')))}</p>
                            <div class="marketplace-card-actions"><span class="marketplace-icon-btn">待审核</span></div>
                        </div>
                    </article>
                `).join('')}
            </div>
        `;
    }

    /**
     * 渲染单张已发布集市卡片 HTML（含超级管理员删除入口）。
     * @param {{ id?: string, project_name?: string, description?: string, published_at?: string, author_name?: string, likes_count?: number, favorites_count?: number, remixes_count?: number, viewer_liked?: boolean, viewer_favorited?: boolean }} post
     * @returns {string}
     */
    renderApprovedMarketplaceCardHtml(post) {
        const id = this.escapeHtml(String(post.id || ''));
        const isSuperAdmin = String(this.authState?.role || '').toLowerCase() === 'super_admin';
        const deleteBtn = isSuperAdmin
            ? `<button type="button" class="marketplace-card-delete-btn" data-marketplace-admin-delete="1" data-post-id="${id}" title="删除项目" aria-label="删除已发布项目"><img src="" alt="" data-icon="trash-2"></button>`
            : '';
        const liked = Boolean(post.viewer_liked);
        const favorited = Boolean(post.viewer_favorited);
        const likeIcon = liked ? 'thumbs-up-filled' : 'thumbs-up';
        const favIcon = favorited ? 'star-filled' : 'star';
        return `
            <article class="marketplace-card marketplace-card--selectable" data-marketplace-post-id="${id}">
                <div class="marketplace-card-head">
                    ${deleteBtn}
                    <strong>${this.escapeHtml(String(post.project_name || ''))}</strong>
                    <span>发布时间：${this.escapeHtml(this.formatDateTime(String(post.published_at || '')))}</span>
                </div>
                <div class="marketplace-card-body">
                    <p class="marketplace-card-desc">项目描述：${this.escapeHtml(String(post.description || '').trim() || '暂无描述')}</p>
                    <p class="marketplace-card-meta">项目作者：${this.escapeHtml(this.getMarketplaceAuthorLabel(String(post.author_name || '')))}</p>
                    <div class="marketplace-card-actions">
                        <div class="marketplace-card-interact-inline">
                            <button type="button" class="marketplace-card-interact-icon-only${liked ? ' is-active' : ''}" data-marketplace-interact="like" data-post-id="${id}" data-viewer-active="${liked ? '1' : '0'}" aria-label="点赞" title="点赞">
                                <img src="" alt="" data-icon="${likeIcon}">
                            </button>
                            <span class="marketplace-card-interact-count">${Number(post.likes_count || 0)}</span>
                        </div>
                        <div class="marketplace-card-interact-inline">
                            <button type="button" class="marketplace-card-interact-icon-only marketplace-card-interact-icon-only--fav${favorited ? ' is-active' : ''}" data-marketplace-interact="favorite" data-post-id="${id}" data-viewer-active="${favorited ? '1' : '0'}" aria-label="收藏" title="收藏">
                                <img src="" alt="" data-icon="${favIcon}">
                            </button>
                            <span class="marketplace-card-interact-count">${Number(post.favorites_count || 0)}</span>
                        </div>
                        <div class="marketplace-card-interact-inline marketplace-card-interact-inline--readonly" aria-label="复刻次数">
                            <span class="marketplace-card-interact-icon-only marketplace-card-interact-icon-only--readonly" aria-hidden="true">
                                <img src="" alt="" data-icon="git-branch">
                            </span>
                            <span class="marketplace-card-interact-count marketplace-card-remix-count">${Number(post.remixes_count || 0)}</span>
                        </div>
                    </div>
                </div>
            </article>
        `;
    }

    /**
     * 通过项目编号命中的共享备份卡片（用于快速复用，不展示点赞/收藏/复刻计数）。
     * @param {{ projectKey?: string, projectName?: string, backupAt?: string, authorName?: string }} project
     * @returns {string}
     */
    renderSharedBackupMarketplaceCardHtml(project) {
        const projectKey = this.escapeHtml(String(project.projectKey || '').trim());
        const authorName = this.getMarketplaceAuthorLabel(String(project.authorName || ''));
        return `
            <article class="marketplace-card marketplace-card--shared-backup">
                <div class="marketplace-card-head">
                    <strong>${this.escapeHtml(String(project.projectName || '共享备份项目'))}</strong>
                </div>
                <div class="marketplace-card-body">
                    <p class="marketplace-card-meta">项目作者：${this.escapeHtml(authorName)}</p>
                    <p class="marketplace-card-meta">备份时间：${this.escapeHtml(this.formatDateTime(String(project.backupAt || '')))}</p>
                    <div class="marketplace-card-actions">
                        <button
                            type="button"
                            class="btn btn-secondary marketplace-detail-remix-open-btn"
                            data-marketplace-backup-remix="1"
                            data-project-key="${projectKey}"
                        >
                            <img src="" alt="" data-icon="git-branch">
                            <span class="marketplace-btn-label">复刻</span>
                            <span class="marketplace-btn-spinner" aria-hidden="true"></span>
                        </button>
                    </div>
                </div>
            </article>
        `;
    }

    /**
     * 创客集市：存在搜索词但已发布列表与共享备份均无命中时，提示、清空搜索并重新加载首页列表。
     * @param {string} queryRaw 当前搜索框内容（与 API 使用的 query 一致）
     * @returns {Promise<boolean>} 已处理则 true（调用方应 return），无搜索词则 false
     */
    async handleMarketplaceEmptySearchReturnHome(queryRaw) {
        const query = String(queryRaw || '').trim();
        if (!query || !this.marketplaceGrid) {
            return false;
        }
        const safeQ = this.escapeHtml(query);
        this.marketplaceGrid.innerHTML = `<div class="account-empty-state">未找到与「${safeQ}」相关的项目。正在返回创客集市首页…</div>`;
        if (this.marketplaceSearchInput) {
            this.marketplaceSearchInput.value = '';
        }
        this.showNotification(`未找到与「${query}」相关的创客集市项目，已为你返回首页列表。`, 'info');
        await this.refreshMarketplaceApprovedPosts({ allowNetworkFetch: true, showLoading: false });
        return true;
    }

    /**
     * @param {{
     *   showLoading?: boolean,
     *   allowNetworkFetch?: boolean,
     *   preloadedSharedCards?: Array<Record<string, unknown>>,
     *   userInitiatedSearch?: boolean
     * }} [options]
     * @returns {Promise<void>}
     */
    async refreshMarketplaceApprovedPosts(options = {}) {
        if (!this.marketplaceGrid || !window.electronAPI?.supabaseListMarketplaceApprovedPosts) {
            return;
        }
        const allowNetworkFetch = Boolean(options?.allowNetworkFetch);
        if (Boolean(options?.showLoading)) {
            await this.renderAccountLoadingState(this.marketplaceGrid);
        }
        if (!this.authState?.isAuthenticated) {
            this.marketplaceGrid.innerHTML = '<div class="account-empty-state">请先登录后查看创客集市。</div>';
            this.marketplaceHasLoaded = true;
            return;
        }
        const query = String(this.marketplaceSearchInput?.value || '').trim();
        const sortBy = String(this.marketplaceSortSelect?.value || 'likes').trim();
        const approvedCacheKey = `${query}::${sortBy}`;
        const sharedBackupQuery = String(query || '').trim().toLowerCase();
        const needSharedBackupSearch = /^[a-f0-9]{24}$/.test(sharedBackupQuery);
        const tierFull = this.isFullAccountRole();

        /** @type {Array<Record<string, unknown>>} */
        let sharedCards = Array.isArray(options?.preloadedSharedCards) ? [...options.preloadedSharedCards] : [];
        if (
            needSharedBackupSearch &&
            tierFull &&
            !sharedCards.length &&
            window.electronAPI?.supabaseSearchSharedBackupProjectsByKey
        ) {
            const shared = await window.electronAPI.supabaseSearchSharedBackupProjectsByKey({
                projectKey: sharedBackupQuery
            });
            if (shared?.success && Array.isArray(shared.projects)) {
                sharedCards = shared.projects;
            }
        }

        if (!allowNetworkFetch) {
            const sharedForDom = sharedCards.length ? sharedCards : this.marketplaceSharedCardsForGrid;
            await this.syncMarketplaceApprovedGridDom(sharedForDom, this.marketplacePosts);
            this.marketplaceHasLoaded = true;
            return;
        }

        this.marketplaceListCacheState.approved.ts = 0;

        const result = await window.electronAPI.supabaseListMarketplaceApprovedPosts({ query, sortBy });
        if (!result?.success) {
            this.marketplaceGrid.innerHTML = `<div class="account-empty-state">${this.escapeHtml(this.formatResultError(result, '读取创客集市失败。'))}</div>`;
            this.marketplaceHasLoaded = true;
            return;
        }
        this.marketplacePosts = Array.isArray(result?.posts) ? result.posts : [];
        this.marketplaceSharedCardsForGrid = needSharedBackupSearch ? sharedCards : [];
        this._marketplaceLastApprovedCacheKey = approvedCacheKey;
        this.touchMarketplaceListCache('approved', approvedCacheKey);
        if (!this.marketplacePosts.length && !sharedCards.length) {
            // 免费用户按 24 位 project_key 检索共享备份被禁止：不应走「未找到」占位与二次通知，直接清空搜索并拉首页
            if (needSharedBackupSearch && !tierFull) {
                if (this.marketplaceSearchInput) {
                    this.marketplaceSearchInput.value = '';
                }
                if (Boolean(options?.userInitiatedSearch)) {
                    this.showNotification(
                        '当前为免费版，无法通过项目编号在集市检索共享备份，已为你返回首页列表。',
                        'info'
                    );
                }
                await this.refreshMarketplaceApprovedPosts({ allowNetworkFetch: true, showLoading: false });
                this.marketplaceHasLoaded = true;
                return;
            }
            if (await this.handleMarketplaceEmptySearchReturnHome(query)) {
                this.marketplaceHasLoaded = true;
                return;
            }
            this.marketplaceGrid.innerHTML = '';
            this.marketplaceHasLoaded = true;
            this.persistMarketplaceApprovedToLocalStorage(approvedCacheKey);
            return;
        }
        await this.syncMarketplaceApprovedGridDom(sharedCards, this.marketplacePosts);
        this.persistMarketplaceApprovedToLocalStorage(approvedCacheKey);
        this.marketplaceHasLoaded = true;
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
     * 待审 / 已发布卡片打开详情时的加载态（与 `.marketplace-card--selectable` 配套）。
     * @param {string} postId
     * @param {boolean} loading
     * @returns {void}
     */
    setMarketplaceSelectableCardLoading(postId, loading) {
        const id = String(postId || '').trim();
        if (!id) {
            return;
        }
        const pendingCard = this.communityPendingContainer?.querySelector(`[data-pending-post-id="${id}"]`);
        const approvedCard = this.marketplaceGrid?.querySelector(`[data-marketplace-post-id="${id}"]`);
        pendingCard?.classList.toggle('is-opening', Boolean(loading));
        approvedCard?.classList.toggle('is-opening', Boolean(loading));
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
        const useCardLoading = !fromSessionReopen && !hasCachedDetail;
        if (useCardLoading) {
            this.setMarketplaceSelectableCardLoading(postId, true);
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
                this.setMarketplaceSelectableCardLoading(postId, false);
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
        /** 与拉取详情的 postId 一致，避免 detail.id 与入口参数不一致时重复开签 */
        const bundleOpenPostId = String(postId || '').trim() || String(detail.id || '').trim();
        this.marketplaceDetailOpenPostId = bundleOpenPostId;
        if (this.marketplaceDetailTitle) {
            this.marketplaceDetailTitle.textContent = String(detail.projectName || '项目预览');
        }
        if (this.marketplaceDetailDescription) {
            const authorName = this.getMarketplaceAuthorLabel(String(detail.authorName || ''));
            const description = String(detail.description || '').trim() || '暂无描述';
            this.marketplaceDetailDescription.textContent = `项目作者：${authorName}\n项目描述：${description}`;
        }
        this.drawMarketplacePreviewPlaceholder('加载预览中…');
        if (this.marketplaceDetailActions) {
            this.marketplaceDetailActions.innerHTML = '';
            this.marketplaceDetailActions.className = reviewMode
                ? 'marketplace-modal-actions marketplace-detail-actions marketplace-detail-actions--review'
                : 'marketplace-modal-actions marketplace-detail-actions marketplace-detail-actions--approved';
            if (reviewMode) {
                const openCircuitBtn = document.createElement('button');
                openCircuitBtn.type = 'button';
                openCircuitBtn.className = 'btn btn-secondary marketplace-detail-remix-open-btn';
                openCircuitBtn.setAttribute('data-marketplace-open-canvas', '1');
                openCircuitBtn.innerHTML =
                    '<img src="" alt="" data-icon="git-branch"><span class="marketplace-btn-label">查看细节</span><span class="marketplace-btn-spinner" aria-hidden="true"></span>';
                openCircuitBtn.addEventListener('click', async () => {
                    await this.openMarketplaceDetailInCanvas(bundleOpenPostId, openCircuitBtn);
                });
                this.marketplaceDetailActions.appendChild(openCircuitBtn);
                const rejectBtn = document.createElement('button');
                rejectBtn.type = 'button';
                rejectBtn.className =
                    'btn marketplace-publish-btn marketplace-review-btn--reject marketplace-detail-review-decision-btn';
                rejectBtn.innerHTML =
                    '<span class="marketplace-btn-label">拒绝</span><span class="marketplace-btn-spinner" aria-hidden="true"></span>';
                rejectBtn.addEventListener('click', async () => {
                    await this.reviewMarketplacePost(postId, 'reject', '', rejectBtn);
                });
                const approveBtn = document.createElement('button');
                approveBtn.type = 'button';
                approveBtn.className =
                    'btn btn-primary marketplace-publish-btn marketplace-detail-review-decision-btn';
                approveBtn.innerHTML =
                    '<span class="marketplace-btn-label">通过</span><span class="marketplace-btn-spinner" aria-hidden="true"></span>';
                approveBtn.addEventListener('click', async () => {
                    await this.reviewMarketplacePost(postId, 'approve', '', approveBtn);
                });
                const reviewRow = document.createElement('div');
                reviewRow.className = 'marketplace-detail-review-row';
                reviewRow.appendChild(rejectBtn);
                reviewRow.appendChild(approveBtn);
                this.marketplaceDetailActions.appendChild(reviewRow);
            } else {
                const viewerLike = Boolean(detail.viewerLiked);
                const viewerFav = Boolean(detail.viewerFavorited);
                const inner = document.createElement('div');
                inner.className = 'marketplace-detail-actions-inner';
                const left = document.createElement('div');
                left.className = 'marketplace-detail-actions-left';
                const likeBtn = document.createElement('button');
                likeBtn.type = 'button';
                likeBtn.className = `marketplace-modal-interact-icon-btn marketplace-modal-interact-icon-btn--like${viewerLike ? ' is-active' : ''}`;
                likeBtn.setAttribute('data-viewer-active', viewerLike ? '1' : '0');
                likeBtn.setAttribute('data-marketplace-interact', 'like');
                likeBtn.setAttribute('data-post-id', bundleOpenPostId);
                likeBtn.setAttribute('aria-label', '点赞');
                likeBtn.setAttribute('title', '点赞');
                likeBtn.innerHTML = `<img src="" alt="" data-icon="${viewerLike ? 'thumbs-up-filled' : 'thumbs-up'}">`;
                likeBtn.addEventListener('click', async () => {
                    await this.interactMarketplacePost(bundleOpenPostId, 'like', likeBtn);
                });
                const favoriteBtn = document.createElement('button');
                favoriteBtn.type = 'button';
                favoriteBtn.className = `marketplace-modal-interact-icon-btn marketplace-modal-interact-icon-btn--fav${viewerFav ? ' is-active' : ''}`;
                favoriteBtn.setAttribute('data-viewer-active', viewerFav ? '1' : '0');
                favoriteBtn.setAttribute('data-marketplace-interact', 'favorite');
                favoriteBtn.setAttribute('data-post-id', bundleOpenPostId);
                favoriteBtn.setAttribute('aria-label', '收藏');
                favoriteBtn.setAttribute('title', '收藏');
                favoriteBtn.innerHTML = `<img src="" alt="" data-icon="${viewerFav ? 'star-filled' : 'star'}">`;
                favoriteBtn.addEventListener('click', async () => {
                    await this.interactMarketplacePost(bundleOpenPostId, 'favorite', favoriteBtn);
                });
                left.appendChild(likeBtn);
                left.appendChild(favoriteBtn);
                inner.appendChild(left);
                const remixBtn = document.createElement('button');
                remixBtn.type = 'button';
                remixBtn.className = 'btn btn-secondary marketplace-detail-remix-open-btn';
                remixBtn.setAttribute('data-marketplace-open-canvas', '1');
                remixBtn.innerHTML =
                    '<img src="" alt="" data-icon="git-branch"><span class="marketplace-btn-label">复刻</span><span class="marketplace-btn-spinner" aria-hidden="true"></span>';
                remixBtn.addEventListener('click', async () => {
                    await this.openMarketplaceDetailInCanvas(bundleOpenPostId, remixBtn, { recordRemix: true });
                });
                inner.appendChild(remixBtn);
                this.marketplaceDetailActions.appendChild(inner);
            }
            void this.initializeIconsForScope(this.marketplaceDetailActions);
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
        this.marketplaceDetailOpenPostId = '';
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
     * @param {HTMLButtonElement | null} [triggerButton] 用于加载态的触发按钮（避免多按钮时误选）
     * @param {{ recordRemix?: boolean }} [options]
     * @returns {Promise<void>}
     */
    async openMarketplaceDetailInCanvas(postId, triggerButton = null, options = {}) {
        if (!postId) {
            return;
        }
        const trigger =
            triggerButton ||
            this.marketplaceDetailActions?.querySelector('[data-marketplace-open-canvas="1"]');
        if (!window.electronAPI?.supabaseGetMarketplaceProjectBundle) {
            this.showNotification('当前环境不支持查看细节。', 'warning');
            return;
        }
        trigger?.classList.add('is-uploading');
        try {
            if (Boolean(options?.recordRemix)) {
                await this.recordMarketplaceRemix(postId);
            }
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
            trigger?.classList.remove('is-uploading');
        }
    }

    /**
     * 记录一次复刻互动（同一用户同一项目仅计一次）；仅做局部计数补丁，不整页刷新。
     * @param {string} postId
     * @returns {Promise<void>}
     */
    async recordMarketplaceRemix(postId) {
        const id = String(postId || '').trim();
        if (!id || !window.electronAPI?.supabaseInteractMarketplacePost) {
            return;
        }
        const result = await window.electronAPI.supabaseInteractMarketplacePost({ postId: id, action: 'remix' });
        if (!result?.success) {
            return;
        }
        const delta = Number(result?.delta || 0);
        if (!delta) {
            return;
        }
        this.applyMarketplaceRemixVisualDelta(id, delta);
        this.patchMarketplacePostInMemory(id, (row) => ({
            ...row,
            remixes_count: Math.max(0, Number(row?.remixes_count || 0) + delta)
        }));
        this.marketplacePostDetailCache.delete(id);
    }

    /**
     * 按项目编号拉取共享备份并在电路页以内存态打开（无需先下载文件）。
     * @param {string} projectKey
     * @param {HTMLElement | null} triggerButton
     * @returns {Promise<void>}
     */
    async openSharedBackupByProjectKey(projectKey, triggerButton = null) {
        const key = String(projectKey || '').trim().toLowerCase();
        if (!key) {
            return;
        }
        if (!this.isFullAccountRole()) {
            this.showNotification('当前为免费版，无法通过项目编号复刻共享备份。', 'warning');
            return;
        }
        if (!window.electronAPI?.supabaseGetSharedBackupBundleByProjectKey) {
            this.showNotification('当前环境不支持按项目编号复刻。', 'warning');
            return;
        }
        triggerButton?.classList.add('is-uploading');
        try {
            const result = await window.electronAPI.supabaseGetSharedBackupBundleByProjectKey({ projectKey: key });
            if (!result?.success || !result?.bundle) {
                this.showNotification(this.formatResultError(result, '读取共享备份失败。'), 'error');
                return;
            }
            if (!window.mainApp || typeof window.mainApp.openProjectFromMarketplaceBundle !== 'function') {
                return;
            }
            await window.mainApp.switchTab('circuit-design');
            await window.mainApp.openProjectFromMarketplaceBundle({
                postId: `shared-backup-${key}`,
                bundle: result.bundle
            });
        } catch (err) {
            const msg = err && typeof err === 'object' && 'message' in err ? String(err.message) : String(err);
            this.showNotification(`复刻失败：${msg}`, 'error');
        } finally {
            triggerButton?.classList.remove('is-uploading');
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
            this.invalidateMarketplaceCaches();
            if (this.marketplaceDetailReviewSession?.postId === postId) {
                this.marketplaceDetailReviewSession = null;
            }
            this.closeMarketplaceDetailModal();
            await this.refreshMarketplacePendingPosts();
            await this.refreshMarketplaceApprovedPosts({ allowNetworkFetch: true, showLoading: false });
            await this.resyncMyProjectsPublishStatusesOnly();
        } finally {
            this.marketplaceDetailActions?.classList.remove('is-reviewing');
            clickedBtn?.classList.remove('is-uploading');
        }
    }

    /**
     * 更新点赞/收藏按钮的实心描边图标与激活态（依赖 `initializeIconsForScope`）。
     * @param {HTMLElement | null} btn
     * @param {'like'|'favorite'} action
     * @param {boolean} active
     * @returns {Promise<void>}
     */
    async setMarketplaceLikeFavoriteButtonVisual(btn, action, active) {
        if (!btn) {
            return;
        }
        const filled = action === 'like' ? 'thumbs-up-filled' : 'star-filled';
        const outline = action === 'like' ? 'thumbs-up' : 'star';
        btn.setAttribute('data-viewer-active', active ? '1' : '0');
        btn.classList.toggle('is-active', Boolean(active));
        const img = btn.querySelector('img[data-icon]');
        if (img) {
            img.dataset.icon = active ? filled : outline;
            await this.initializeIconsForScope(btn);
        }
    }

    /**
     * 同步某帖在「列表卡片 + 详情模态」的点赞/收藏图标与计数。
     * @param {string} postId
     * @param {'like'|'favorite'} action
     * @param {boolean} active
     * @param {number} delta
     * @returns {Promise<void>}
     */
    async applyMarketplaceInteractVisualDelta(postId, action, active, delta) {
        const id = String(postId || '').trim();
        if (!id) {
            return;
        }
        const selector = `[data-marketplace-interact="${action}"][data-post-id="${id}"]`;
        const buttons = document.querySelectorAll(selector);
        for (const btn of buttons) {
            await this.setMarketplaceLikeFavoriteButtonVisual(btn, action, active);
            const countEl =
                btn.querySelector('.marketplace-card-interact-count') ||
                btn.parentElement?.querySelector('.marketplace-card-interact-count');
            if (countEl && Number.isFinite(delta) && delta !== 0) {
                const current = Number(String(countEl.textContent || '0').trim() || '0');
                countEl.textContent = String(Math.max(0, current + delta));
            }
        }
    }

    /**
     * 在内存列表中合并一条帖子的互动字段（乐观更新后与本地缓存一致）。
     * @param {string} postId
     * @param {(row: Record<string, unknown>) => Record<string, unknown>} updater
     * @returns {void}
     */
    patchMarketplacePostInMemory(postId, updater) {
        const id = String(postId || '').trim();
        if (!id || !Array.isArray(this.marketplacePosts)) {
            return;
        }
        const idx = this.marketplacePosts.findIndex((p) => String(p?.id || '') === id);
        if (idx < 0) {
            return;
        }
        this.marketplacePosts[idx] = updater(this.marketplacePosts[idx]);
        this.persistMarketplaceApprovedCacheIfPossible();
    }

    /**
     * 仅更新复刻计数的局部 UI（避免整页刷新）。
     * @param {string} postId
     * @param {number} delta
     * @returns {void}
     */
    applyMarketplaceRemixVisualDelta(postId, delta) {
        const id = String(postId || '').trim();
        if (!id || !delta) {
            return;
        }
        const card = this.marketplaceGrid?.querySelector?.(`[data-marketplace-post-id="${this.escapeHtml(id)}"]`);
        if (card) {
            const countEl = card.querySelector('.marketplace-card-remix-count');
            if (countEl) {
                const current = Number(String(countEl.textContent || '0').trim() || '0');
                countEl.textContent = String(Math.max(0, current + delta));
            }
        }
    }

    /**
     * 点赞/收藏：先切换 UI，再在后台写库；失败则回滚图标与计数，支持再次点击撤销。
     * @param {string} postId
     * @param {'like'|'favorite'} action
     * @param {HTMLElement | null} sourceBtn
     * @returns {Promise<void>}
     */
    async optimisticInteractLikeFavorite(postId, action, sourceBtn) {
        if (!postId || !sourceBtn || !window.electronAPI?.supabaseInteractMarketplacePost) {
            return;
        }
        const key = `${String(postId)}::${action}`;
        if (this.marketplaceInteractPending.has(key)) {
            return;
        }
        const currentActive = sourceBtn.getAttribute('data-viewer-active') === '1';
        const nextActive = !currentActive;
        const optimisticDelta = nextActive ? 1 : -1;
        this.marketplaceInteractPending.add(key);
        await this.applyMarketplaceInteractVisualDelta(postId, action, nextActive, optimisticDelta);
        this.patchMarketplacePostInMemory(postId, (row) => {
            const next = { ...row };
            if (action === 'like') {
                next.viewer_liked = nextActive;
                next.likes_count = Math.max(0, Number(row.likes_count || 0) + optimisticDelta);
            } else {
                next.viewer_favorited = nextActive;
                next.favorites_count = Math.max(0, Number(row.favorites_count || 0) + optimisticDelta);
            }
            return next;
        });
        this.marketplacePostDetailCache.delete(postId);
        void (async () => {
            try {
                const result = await window.electronAPI.supabaseInteractMarketplacePost({ postId, action });
                if (!result?.success) {
                    await this.applyMarketplaceInteractVisualDelta(postId, action, currentActive, -optimisticDelta);
                    this.patchMarketplacePostInMemory(postId, (row) => {
                        const next = { ...row };
                        if (action === 'like') {
                            next.viewer_liked = currentActive;
                            next.likes_count = Math.max(0, Number(row.likes_count || 0) - optimisticDelta);
                        } else {
                            next.viewer_favorited = currentActive;
                            next.favorites_count = Math.max(0, Number(row.favorites_count || 0) - optimisticDelta);
                        }
                        return next;
                    });
                    this.showNotification(this.formatResultError(result, '操作失败。'), 'error');
                    return;
                }
                const serverDelta = Number(result?.delta || 0);
                const serverActive = Boolean(result?.toggled);
                if (serverDelta !== optimisticDelta || serverActive !== nextActive) {
                    await this.applyMarketplaceInteractVisualDelta(
                        postId,
                        action,
                        serverActive,
                        serverDelta - optimisticDelta
                    );
                    this.patchMarketplacePostInMemory(postId, (row) => {
                        const next = { ...row };
                        if (action === 'like') {
                            next.viewer_liked = serverActive;
                            next.likes_count = Math.max(0, Number(row.likes_count || 0) + (serverDelta - optimisticDelta));
                        } else {
                            next.viewer_favorited = serverActive;
                            next.favorites_count = Math.max(0, Number(row.favorites_count || 0) + (serverDelta - optimisticDelta));
                        }
                        return next;
                    });
                }
                this.marketplacePostDetailCache.delete(postId);
            } catch (err) {
                await this.applyMarketplaceInteractVisualDelta(postId, action, currentActive, -optimisticDelta);
                this.patchMarketplacePostInMemory(postId, (row) => {
                    const next = { ...row };
                    if (action === 'like') {
                        next.viewer_liked = currentActive;
                        next.likes_count = Math.max(0, Number(row.likes_count || 0) - optimisticDelta);
                    } else {
                        next.viewer_favorited = currentActive;
                        next.favorites_count = Math.max(0, Number(row.favorites_count || 0) - optimisticDelta);
                    }
                    return next;
                });
                const msg = err && typeof err === 'object' && 'message' in err ? String(err.message) : String(err);
                this.showNotification(`操作失败：${msg}`, 'error');
            } finally {
                this.marketplaceInteractPending.delete(key);
            }
        })();
    }

    /**
     * 复刻：局部乐观 + 后台确认，避免每次复刻后全量刷新列表。
     * @param {string} postId
     * @returns {Promise<void>}
     */
    async optimisticInteractRemix(postId) {
        if (!postId || !window.electronAPI?.supabaseInteractMarketplacePost) {
            return;
        }
        const key = `${String(postId)}::remix`;
        if (this.marketplaceInteractPending.has(key)) {
            return;
        }
        const optimisticDelta = 1;
        this.marketplaceInteractPending.add(key);
        this.applyMarketplaceRemixVisualDelta(postId, optimisticDelta);
        this.patchMarketplacePostInMemory(postId, (row) => ({
            ...row,
            remixes_count: Math.max(0, Number(row?.remixes_count || 0) + optimisticDelta)
        }));
        try {
            const result = await window.electronAPI.supabaseInteractMarketplacePost({ postId, action: 'remix' });
            if (!result?.success) {
                this.applyMarketplaceRemixVisualDelta(postId, -optimisticDelta);
                this.patchMarketplacePostInMemory(postId, (row) => ({
                    ...row,
                    remixes_count: Math.max(0, Number(row?.remixes_count || 0) - optimisticDelta)
                }));
                this.showNotification(this.formatResultError(result, '互动失败。'), 'error');
                return;
            }
            const serverDelta = Number(result?.delta || 1);
            if (serverDelta !== optimisticDelta) {
                const adjust = serverDelta - optimisticDelta;
                this.applyMarketplaceRemixVisualDelta(postId, adjust);
                this.patchMarketplacePostInMemory(postId, (row) => ({
                    ...row,
                    remixes_count: Math.max(0, Number(row?.remixes_count || 0) + adjust)
                }));
            }
            this.marketplacePostDetailCache.delete(postId);
        } catch (err) {
            this.applyMarketplaceRemixVisualDelta(postId, -optimisticDelta);
            this.patchMarketplacePostInMemory(postId, (row) => ({
                ...row,
                remixes_count: Math.max(0, Number(row?.remixes_count || 0) - optimisticDelta)
            }));
            const msg = err && typeof err === 'object' && 'message' in err ? String(err.message) : String(err);
            this.showNotification(`操作失败：${msg}`, 'error');
        } finally {
            this.marketplaceInteractPending.delete(key);
        }
    }

    /**
     * @param {string} postId
     * @param {'like'|'favorite'|'remix'} action
     * @param {HTMLElement | null} [sourceButton] 点赞/收藏时传入被点击按钮以做乐观 UI
     * @returns {Promise<void>}
     */
    async interactMarketplacePost(postId, action, sourceButton = null) {
        if (!window.electronAPI?.supabaseInteractMarketplacePost) {
            return;
        }
        if (action === 'like' || action === 'favorite') {
            await this.optimisticInteractLikeFavorite(postId, action, sourceButton);
            return;
        }
        await this.optimisticInteractRemix(postId);
    }

    /**
     * 超级管理员：确认后删除已发布集市项目（主进程会删 Storage 与 DB）。
     * @param {string} postId
     * @returns {Promise<void>}
     */
    async confirmAndDeleteMarketplacePublishedPost(postId) {
        const id = String(postId || '').trim();
        if (!id) {
            return;
        }
        await this.refreshAuthState();
        const ok = window.confirm(
            '确定从创客集市永久删除该项目吗？将删除公开存储中的文件与数据库记录，且不可恢复。'
        );
        if (!ok) {
            return;
        }
        if (!window.electronAPI?.supabaseDeleteMarketplaceApprovedPost) {
            this.showNotification('当前环境不支持删除操作。', 'warning');
            return;
        }
        const result = await window.electronAPI.supabaseDeleteMarketplaceApprovedPost({ postId: id });
        if (!result?.success) {
            this.showNotification(this.formatResultError(result, '删除失败。'), 'error');
            return;
        }
        this.showNotification(String(result?.message || '已删除。'), 'success');
        this.marketplacePostDetailCache.delete(id);
        if (this.marketplaceDetailOpenPostId === id) {
            this.closeMarketplaceDetailModal();
        }
        this.invalidateMarketplaceApprovedClientCache();
        const query = String(this.marketplaceSearchInput?.value || '').trim();
        const sortBy = String(this.marketplaceSortSelect?.value || 'likes').trim();
        const approvedCacheKey = `${query}::${sortBy}`;
        await this.removeMarketplaceApprovedPostLocally(id, approvedCacheKey);
        if (this.authState?.isAuthenticated && this.myProjectsHasLoaded) {
            await this.resyncMyProjectsPublishStatusesOnly();
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
     * 将字符串转为可安全嵌入 CSS 属性选择器双引号内的片段（用于 querySelector）。
     * @param {string} value
     * @returns {string}
     */
    escapeHtmlAttribute(value) {
        return String(value || '')
            .replace(/\\/g, '\\\\')
            .replace(/"/g, '\\"');
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
