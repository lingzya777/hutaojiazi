// 主应用逻辑

class App {
    constructor() {
        this.teams = [];
        this.allMembers = [];
        this.templates = [];
        this.selectedTeam = null;
        this.selectedMember = null;
        this.draggedMember = null;
        this.draggedMemberOriginalTeam = null; // 记录拖拽成员的原团队
        this.draggedMemberDropped = false; // 标记是否成功拖放到目标位置
        this.squadsPerTeam = 5; // 每个团队默认5个小队
        this.membersPerSquad = 6; // 每个小队6人
        this.memberSearchText = '';
        this.memberClassFilter = '';
        this.memberSortBy = 'priority'; // 'priority' 或 'power'
        this.positionHistoryStack = []; // 位置历史堆栈（用于恢复上一步）
        this.pendingMembers = []; // 待调区成员
        
        this.init();
    }

    init() {
        this.loadData();
        this.loadPositionHistoryStack();
        this.bindEvents();
        this.checkDataFreshness();
        this.updateAddTeamButton();
        this.refreshUI();
    }
    
    loadPositionHistoryStack() {
        this.positionHistoryStack = Persistence.loadPositionHistoryStack();
        console.log('[位置历史] 加载历史堆栈，共', this.positionHistoryStack.length, '步');
    }
    
    savePositionHistory() {
        try {
            // 保存当前位置到历史堆栈
            const currentState = {
                timestamp: new Date().toISOString(),
                teams: this.teams.map(team => ({
                    id: team.id,
                    name: team.name,
                    maxMembers: team.maxMembers,
                    roleTemplateId: team.roleTemplateId,
                    members: team.members.map(member => ({
                        id: member.id,
                        name: member.name,
                        squadIndex: member.squadIndex,
                        slotIndex: member.slotIndex,
                        assignedTeamId: member.assignedTeamId
                    }))
                }))
            };
            
            this.positionHistoryStack.push(currentState);
            Persistence.savePositionHistoryStack(this.positionHistoryStack);
            
            // 同时保存为最新历史（用于恢复历史建团）
            Persistence.savePositionHistory(currentState);
            
            console.log('[位置历史] 已保存位置历史，当前堆栈大小:', this.positionHistoryStack.length);
        } catch (error) {
            console.error('[位置历史] 保存失败:', error);
        }
    }
    
    restorePreviousStep() {
        if (this.positionHistoryStack.length < 2) {
            alert('没有可恢复的上一步记录');
            return;
        }
        
        if (!confirm('确定要恢复到上一步吗？当前操作将被撤销。')) {
            return;
        }
        
        // 移除当前状态
        this.positionHistoryStack.pop();
        // 获取上一步状态
        const previousState = this.positionHistoryStack[this.positionHistoryStack.length - 1];
        
        if (!previousState) {
            alert('无法恢复上一步');
            return;
        }
        
        // 恢复状态
        this.restoreFromHistory(previousState);
        Persistence.savePositionHistoryStack(this.positionHistoryStack);
        
        alert('✅ 已恢复到上一步');
    }
    
    restoreFromHistory(historyState) {
        if (!historyState || !historyState.teams) {
            alert('历史记录无效');
            return;
        }
        
        // 清除所有成员的分配
        this.allMembers.forEach(member => {
            member.assignedTeamId = null;
            member.squadIndex = null;
            member.slotIndex = null;
        });
        
        // 重建团队
        this.teams = [];
        
        historyState.teams.forEach(historyTeam => {
            const team = new Team(historyTeam.name, historyTeam.maxMembers, historyTeam.roleTemplateId);
            team.id = historyTeam.id;
            this.teams.push(team);
            
            // 恢复成员位置
            historyTeam.members.forEach(historyMember => {
                const member = this.allMembers.find(m => m.id === historyMember.id);
                if (member) {
                    team.addMember(member);
                    member.assignedTeamId = team.id;
                    member.squadIndex = historyMember.squadIndex;
                    member.slotIndex = historyMember.slotIndex;
                }
            });
        });
        
        this.saveData();
        this.refreshUI();
    }
    
    restoreHistoryTeam() {
        const history = Persistence.loadPositionHistory();
        if (!history || !history.teams || history.teams.length === 0) {
            alert('没有可恢复的历史建团记录');
            return;
        }
        
        const date = new Date(history.timestamp);
        if (!confirm(`确定要恢复 ${date.toLocaleString('zh-CN')} 的建团记录吗？\n\n这将覆盖当前的团队配置。`)) {
            return;
        }
        
        this.restoreFromHistory(history);
        alert('✅ 历史建团记录已恢复！');
    }

    checkDataFreshness() {
        // 检查数据是否为本日导入
        if (!Persistence.isDataImportedToday()) {
            const hasMembers = this.allMembers.length > 0;
            if (hasMembers) {
                const lastImportDate = Persistence.getLastImportDate();
                const dateText = lastImportDate ? `最后导入日期：${lastImportDate}` : '未检测到导入记录';
                this.showDataWarning(dateText);
            } else {
                this.showDataWarning('暂无成员数据');
            }
        }
    }

    showDataWarning(dateInfo) {
        // 创建强提醒模态框
        const modal = document.createElement('div');
        modal.className = 'modal show';
        modal.id = 'dataWarningModal';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 500px; background: linear-gradient(135deg, #ff6b6b 0%, #ee5a6f 100%); border: 3px solid #ff4757;">
                <div class="modal-header" style="background: rgba(255, 255, 255, 0.1); border-bottom: 2px solid rgba(255, 255, 255, 0.3);">
                    <h3 style="color: white; margin: 0; font-size: 20px; display: flex; align-items: center; gap: 10px;">
                        <span style="font-size: 28px;">⚠️</span>
                        <span>数据更新提醒</span>
                    </h3>
                    <button class="modal-close" id="dataWarningClose" style="color: white; font-size: 24px;">&times;</button>
                </div>
                <div class="modal-body" style="padding: 25px; background: white;">
                    <div style="font-size: 16px; line-height: 1.8; color: #333;">
                        <p style="margin: 0 0 15px 0; font-weight: 600; color: #ff4757;">
                            ⚠️ 成员数据不是今日导入！
                        </p>
                        <p style="margin: 0 0 10px 0; color: #666;">
                            ${dateInfo}
                        </p>
                        <p style="margin: 0; color: #666; font-size: 14px;">
                            为了确保帮战数据的准确性，建议每日导入最新的成员数据。
                        </p>
                    </div>
                </div>
                <div class="modal-footer" style="background: rgba(255, 255, 255, 0.1); padding: 15px; display: flex; gap: 10px; justify-content: flex-end;">
                    <button class="btn btn-secondary" id="btnIgnoreWarning" style="background: rgba(255, 255, 255, 0.3); color: white; border: 1px solid rgba(255, 255, 255, 0.5);">
                        稍后提醒
                    </button>
                    <button class="btn btn-primary" id="btnImportNow" style="background: white; color: #ff4757; font-weight: 600; border: none;">
                        📥 立即导入数据
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // 添加事件监听
        document.getElementById('dataWarningClose').addEventListener('click', () => {
            modal.remove();
        });
        
        document.getElementById('btnIgnoreWarning').addEventListener('click', () => {
            modal.remove();
        });
        
        document.getElementById('btnImportNow').addEventListener('click', () => {
            modal.remove();
            this.handleImport();
        });
        
        // 点击背景关闭
        modal.addEventListener('click', (e) => {
            if (e.target.id === 'dataWarningModal') {
                modal.remove();
            }
        });
        
        // 添加动画效果
        setTimeout(() => {
            modal.style.opacity = '0';
            modal.style.transition = 'opacity 0.3s ease';
            setTimeout(() => {
                modal.style.opacity = '1';
            }, 10);
        }, 10);
    }

    loadData() {
        // 刷新后清除团队，成员归回成员池
        this.teams = [];
        // 清除所有成员的团队分配
        this.allMembers = Persistence.loadMembers();
        this.allMembers.forEach(member => {
            member.assignedTeamId = null;
            member.squadIndex = null;
            member.slotIndex = null;
        });
        this.templates = Persistence.loadTemplates();
        // 加载待调区成员（根据ID查找成员对象）
        const pendingMemberIds = Persistence.loadPendingMembers() || [];
        this.pendingMembers = pendingMemberIds.map(id => this.allMembers.find(m => m.id === id)).filter(m => m);
        console.log('[加载数据] 已清除团队，成员归回成员池，待调区成员数:', this.pendingMembers.length);
    }

    saveData() {
        try {
            Persistence.saveTeams(this.teams);
            Persistence.saveMembers(this.allMembers);
            Persistence.saveTemplates(this.templates);
            // 保存位置历史（如果方法存在）
            if (typeof this.savePositionHistory === 'function') {
                this.savePositionHistory();
            }
        } catch (error) {
            console.error('[保存数据] 保存失败:', error);
        }
    }

    bindEvents() {
        // 工具栏按钮
        document.getElementById('btnImport').addEventListener('click', () => this.handleImport());
        document.getElementById('btnAddTeam').addEventListener('click', () => this.handleAddTeam());
        document.getElementById('btnAddTeamTab').addEventListener('click', () => this.handleAddTeam());
        
        // 创建团队选择对话框
        document.getElementById('createTeamModalClose').addEventListener('click', () => this.closeCreateTeamModal());
        document.getElementById('btnCancelCreateTeam').addEventListener('click', () => this.closeCreateTeamModal());
        document.getElementById('btnCreate4Teams').addEventListener('click', () => this.create4Teams());
        document.getElementById('btnCreate5Teams').addEventListener('click', () => this.create5Teams());
        document.getElementById('btnCreateCustom').addEventListener('click', () => this.createCustomTeam());
        document.getElementById('btnAllocate').addEventListener('click', () => this.handleAllocate());
        
        // 智能分配设置对话框
        document.getElementById('allocateSettingsClose').addEventListener('click', () => this.closeAllocateSettingsModal());
        document.getElementById('btnCancelAllocateSettings').addEventListener('click', () => this.closeAllocateSettingsModal());
        document.getElementById('btnConfirmAllocate').addEventListener('click', () => this.confirmAllocate());
        document.getElementById('btnHistory').addEventListener('click', () => this.showImportHistory());
        
        // 导入历史对话框
        document.getElementById('historyModalClose').addEventListener('click', () => {
            document.getElementById('importHistoryModal').classList.remove('show');
        });
        document.getElementById('btnCloseHistory').addEventListener('click', () => {
            document.getElementById('importHistoryModal').classList.remove('show');
        });
        document.getElementById('btnClearHistory').addEventListener('click', () => {
            if (confirm('⚠️ 警告：确定要清空所有导入历史记录吗？\n\n此操作将：\n- 清空所有导入历史记录\n- 清空所有成员数据\n- 清空所有帮战数据\n- 清空所有团队数据\n\n此操作不可恢复！')) {
                // 清空导入历史
                Persistence.clearImportHistory();
                
                // 清空成员数据
                this.allMembers = [];
                Persistence.saveMembers(this.allMembers);
                
                // 清空帮战数据
                Persistence.saveBattleData({});
                
                // 清空团队数据
                this.teams = [];
                this.selectedTeam = null;
                Persistence.saveTeams(this.teams);
                
                // 清空待调区
                this.pendingMembers = [];
                Persistence.savePendingMembers(this.pendingMembers);
                
                // 清空位置历史
                Persistence.clearPositionHistory();
                this.positionHistoryStack = [];
                
                // 清空成员数据导入时间
                Persistence.saveMemberDataTime(0);
                Persistence.saveLastImportDate('');
                
                // 刷新界面
                this.refreshUI();
                this.showImportHistory();
                
                alert('✅ 所有数据已清空！');
            }
        });
        document.getElementById('importHistoryModal').addEventListener('click', (e) => {
            if (e.target.id === 'importHistoryModal') {
                document.getElementById('importHistoryModal').classList.remove('show');
            }
        });
        
        // 导入类型选择对话框
        document.getElementById('importTypeClose').addEventListener('click', () => {
            document.getElementById('importTypeModal').classList.remove('show');
        });
        document.getElementById('btnCancelImport').addEventListener('click', () => {
            document.getElementById('importTypeModal').classList.remove('show');
        });
        document.getElementById('btnImportMembers').addEventListener('click', () => {
            document.getElementById('importTypeModal').classList.remove('show');
            document.getElementById('fileInput').click();
        });
        document.getElementById('btnImportBattle').addEventListener('click', () => {
            document.getElementById('importTypeModal').classList.remove('show');
            document.getElementById('fileInputBattle').click();
        });
        document.getElementById('importTypeModal').addEventListener('click', (e) => {
            if (e.target.id === 'importTypeModal') {
                document.getElementById('importTypeModal').classList.remove('show');
            }
        });
        
        // 文件输入
        document.getElementById('fileInput').addEventListener('change', (e) => this.handleFileSelect(e, 'members'));
        document.getElementById('fileInputBattle').addEventListener('change', (e) => this.handleFileSelect(e, 'battle'));
        
        // 帮会选择对话框
        document.getElementById('guildSelectClose').addEventListener('click', () => {
            document.getElementById('guildSelectModal').classList.remove('show');
        });
        
        document.getElementById('btnCancelGuildSelect').addEventListener('click', () => {
            document.getElementById('guildSelectModal').classList.remove('show');
        });
        
        document.getElementById('guildSelectModal').addEventListener('click', (e) => {
            if (e.target.id === 'guildSelectModal') {
                document.getElementById('guildSelectModal').classList.remove('show');
            }
        });
        
        // 帮战数据对话框
        document.getElementById('battleDataClose').addEventListener('click', () => {
            document.getElementById('battleDataModal').classList.remove('show');
        });
        
        document.getElementById('btnCloseBattleData').addEventListener('click', () => {
            document.getElementById('battleDataModal').classList.remove('show');
        });
        
        // 成员池筛选和搜索
        document.getElementById('memberSearchInput').addEventListener('input', (e) => {
            this.memberSearchText = e.target.value.trim();
            this.refreshMembers();
        });
        
        document.getElementById('memberClassFilter').addEventListener('change', (e) => {
            this.memberClassFilter = e.target.value;
            // 职业筛选后默认按战力排序
            if (this.memberClassFilter) {
                this.memberSortBy = 'power';
            }
            this.refreshMembers();
        });
        
        document.getElementById('btnSortByPower').addEventListener('click', () => {
            this.memberSortBy = this.memberSortBy === 'power' ? 'priority' : 'power';
            this.refreshMembers();
        });
        
        // 团队编辑对话框
        document.getElementById('modalClose').addEventListener('click', () => this.closeTeamModal());
        document.getElementById('btnCancelTeam').addEventListener('click', () => this.closeTeamModal());
        document.getElementById('btnSaveTeam').addEventListener('click', () => this.saveTeam());
        document.getElementById('templateSelect').addEventListener('change', () => this.updateTemplateDetail());
        
        // 成员标记对话框
        document.getElementById('tagModalClose').addEventListener('click', () => this.closeTagModal());
        document.getElementById('btnCancelTag').addEventListener('click', () => this.closeTagModal());
        document.getElementById('btnSaveTag').addEventListener('click', () => this.saveMemberTag());
        
        // 点击模态框外部关闭
        document.getElementById('teamEditModal').addEventListener('click', (e) => {
            if (e.target.id === 'teamEditModal') this.closeTeamModal();
        });
        document.getElementById('memberTagModal').addEventListener('click', (e) => {
            if (e.target.id === 'memberTagModal') this.closeTagModal();
        });
        
        document.getElementById('battleDataModal').addEventListener('click', (e) => {
            if (e.target.id === 'battleDataModal') {
                document.getElementById('battleDataModal').classList.remove('show');
            }
        });
    }

    refreshUI() {
        this.refreshTeamsTabs();
        this.refreshMembers();
        this.refreshTeamDetail();
        this.updateCounts();
        this.updateAddTeamButton();
    }

    updateCounts() {
        document.getElementById('teamCount').textContent = `${this.teams.length}/5`;
        // 更新所有团队标签页的人数显示
        this.updateAllTeamTabCounts();
        // 成员数量在refreshMembers中更新
    }

    updateAllTeamTabCounts() {
        // 更新所有团队标签页的人数显示
        this.teams.forEach(team => {
            // 方法1：通过data-team-id查找
            const countSpan = document.querySelector(`.team-tab-count[data-team-id="${team.id}"]`);
            if (countSpan) {
                countSpan.textContent = `${team.currentCount}/${team.maxMembers}`;
            } else {
                // 方法2：通过父元素的data-team-id查找
                const tab = document.querySelector(`.team-tab[data-team-id="${team.id}"]`);
                if (tab) {
                    const countSpan = tab.querySelector('.team-tab-count');
                    if (countSpan) {
                        countSpan.textContent = `${team.currentCount}/${team.maxMembers}`;
                    }
                }
            }
        });
    }

    updateTeamTabCount(countSpan, team) {
        if (countSpan && team) {
            countSpan.textContent = `${team.currentCount}/${team.maxMembers}`;
        }
    }

    refreshTeamsTabs() {
        const tabsContainer = document.getElementById('teamsTabsList');
        const contentContainer = document.getElementById('teamsTabsContent');
        
        tabsContainer.innerHTML = '';
        contentContainer.innerHTML = '';
        
        if (this.teams.length === 0) {
            contentContainer.innerHTML = '<div class="empty-state"><p>请添加团队开始使用</p></div>';
            return;
        }
        
        // 如果没有选中的团队，默认选中第一个
        if (!this.selectedTeam || !this.teams.find(t => t.id === this.selectedTeam.id)) {
            this.selectedTeam = this.teams[0];
        }
        
        // 创建标签页
        this.teams.forEach(team => {
            const tab = this.createTeamTab(team);
            tabsContainer.appendChild(tab);
            
            const content = this.createTeamDetailContent(team);
            contentContainer.appendChild(content);
        });
        
        // 确保所有标签页的人数显示是最新的
        this.updateAllTeamTabCounts();
    }

    createTeamTab(team) {
        const tab = document.createElement('div');
        const isActive = this.selectedTeam?.id === team.id;
        tab.className = 'team-tab' + (isActive ? ' active' : '');
        tab.dataset.teamId = team.id;
        
        const nameSpan = document.createElement('span');
        nameSpan.className = 'team-tab-name';
        nameSpan.textContent = team.name;
        
        const countSpan = document.createElement('span');
        countSpan.className = 'team-tab-count';
        countSpan.dataset.teamId = team.id; // 添加标识，方便更新
        countSpan.textContent = `${team.currentCount}/${team.maxMembers}`;
        
        const closeBtn = document.createElement('button');
        closeBtn.className = 'team-tab-close';
        closeBtn.innerHTML = '×';
        closeBtn.title = '关闭';
        closeBtn.onclick = (e) => {
            this.deleteTeam(team.id);
            e.stopPropagation();
        };
        
        tab.appendChild(nameSpan);
        tab.appendChild(countSpan);
        tab.appendChild(closeBtn);
        
        // 单击切换团队
        tab.addEventListener('click', (e) => {
            if (!e.target.closest('.team-tab-close') && !e.target.closest('.team-tab-name-input')) {
                this.selectTeam(team);
            }
        });
        
        // 双击编辑团队名
        tab.addEventListener('dblclick', (e) => {
            if (e.target.closest('.team-tab-close')) return;
            this.editTeamNameInline(tab, team, nameSpan);
        });
        
        // 拖拽到标签页时切换团队
        tab.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            // 检查是否有拖拽的成员（从draggedMember或dataTransfer）
            let hasDraggedMember = false;
            if (this.draggedMember) {
                hasDraggedMember = true;
            } else {
                // 尝试从dataTransfer获取
                try {
                    if (e.dataTransfer.types && e.dataTransfer.types.includes('text/plain')) {
                        hasDraggedMember = true;
                    }
                } catch (err) {
                    // 忽略错误
                }
            }
            
            if (hasDraggedMember) {
                tab.style.background = 'rgba(100, 149, 237, 0.2)';
                tab.style.borderBottomColor = 'var(--primary-color)';
                // 自动切换到该团队
                if (this.selectedTeam?.id !== team.id) {
                    this.selectTeam(team);
                }
            }
        });
        
        tab.addEventListener('dragleave', (e) => {
            if (!tab.contains(e.relatedTarget)) {
                tab.style.background = '';
                tab.style.borderBottomColor = '';
            }
        });
        
        tab.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            tab.style.background = '';
            tab.style.borderBottomColor = '';
            
            // 获取拖拽的成员
            let draggedMember = this.draggedMember;
            if (!draggedMember) {
                const memberId = e.dataTransfer.getData('text/plain');
                if (memberId) {
                    draggedMember = this.allMembers.find(m => m.id === memberId);
                }
            }
            
            if (draggedMember) {
                // 切换到该团队
                this.selectTeam(team);
                // 将成员添加到该团队（不指定位置，让系统自动分配）
                if (draggedMember.assignedTeamId !== team.id) {
                    // 找到原团队
                    const oldTeam = this.teams.find(t => t.id === draggedMember.assignedTeamId);
                    let memberToSwap = null; // 用于替换的成员
                    
                    // 如果目标团队已满，需要先移除一个成员（替换逻辑）
                    if (team.isFull) {
                        // 移除优先级最低的未锁定成员
                        const membersToRemove = team.members.filter(m => !m.isLocked && m.id !== draggedMember.id);
                        if (membersToRemove.length > 0) {
                            // 移除优先级最低的成员
                            membersToRemove.sort((a, b) => a.getPriorityScore() - b.getPriorityScore());
                            memberToSwap = membersToRemove[0];
                            const removed = team.removeMember(memberToSwap);
                            if (!removed) {
                                console.error('无法从目标团队移除成员:', memberToSwap.name);
                                return;
                            }
                            memberToSwap.squadIndex = null;
                            memberToSwap.slotIndex = null;
                            console.log('[跨团替换] 从目标团队移除成员:', memberToSwap.name, '准备替换到原团队');
                        } else {
                            alert('目标团队已满且所有成员都已锁定，无法替换');
                            return;
                        }
                    }
                    
                    // 从原团队移除成员（必须在添加前移除，避免重复）
                    if (oldTeam) {
                        const removed = oldTeam.removeMember(draggedMember);
                        if (!removed) {
                            console.error('无法从原团队移除成员:', draggedMember.name);
                            // 如果移除失败，将被替换的成员加回目标团队
                            if (memberToSwap) {
                                team.addMember(memberToSwap);
                                this.updateAllTeamTabCounts();
                            }
                            return;
                        }
                        // 清除原位置信息
                        draggedMember.squadIndex = null;
                        draggedMember.slotIndex = null;
                        console.log('[跨团替换] 从原团队移除成员:', draggedMember.name, '准备添加到目标团队');
                    }
                    
                    // 添加到新团队
                    if (team.addMember(draggedMember)) {
                        // 标记已成功拖放
                        this.draggedMemberDropped = true;
                        console.log('[跨团替换] 成员已添加到目标团队:', draggedMember.name, '->', team.name);
                        
                        // 清除位置信息，让系统重新分配
                        draggedMember.squadIndex = null;
                        draggedMember.slotIndex = null;
                        
                        // 如果进行了替换，将被替换的成员添加到原团队（即使原团队已满也要尝试）
                        if (memberToSwap && oldTeam) {
                            // 如果原团队已满，需要先移除一个成员
                            if (oldTeam.isFull) {
                                // 移除优先级最低的未锁定成员
                                const oldTeamMembersToRemove = oldTeam.members.filter(m => !m.isLocked && m.id !== memberToSwap.id);
                                if (oldTeamMembersToRemove.length > 0) {
                                    oldTeamMembersToRemove.sort((a, b) => a.getPriorityScore() - b.getPriorityScore());
                                    const oldTeamMemberToSwap = oldTeamMembersToRemove[0];
                                    const removed = oldTeam.removeMember(oldTeamMemberToSwap);
                                    if (removed) {
                                        oldTeamMemberToSwap.squadIndex = null;
                                        oldTeamMemberToSwap.slotIndex = null;
                                        oldTeamMemberToSwap.assignedTeamId = null;
                                        console.log('[跨团替换] 原团队已满，移除成员:', oldTeamMemberToSwap.name, '回到成员池');
                                    }
                                } else {
                                    // 原团队所有成员都锁定，无法替换
                                    console.warn('[跨团替换] 原团队已满且所有成员都锁定，被替换成员将留在成员池:', memberToSwap.name);
                                    memberToSwap.assignedTeamId = null;
                                    this.updateAllTeamTabCounts();
                                    this.saveData();
                                    this.refreshUI();
                                    return;
                                }
                            }
                            
                            // 将被替换的成员添加到原团队
                            if (oldTeam.addMember(memberToSwap)) {
                                memberToSwap.squadIndex = null;
                                memberToSwap.slotIndex = null;
                                console.log('[跨团替换] 被替换成员已添加到原团队:', memberToSwap.name, '->', oldTeam.name);
                            } else {
                                // 如果添加失败（理论上不应该发生，因为我们已经处理了满员情况）
                                console.error('[跨团替换] 无法将被替换成员添加到原团队:', memberToSwap.name);
                                memberToSwap.assignedTeamId = null;
                            }
                        } else if (memberToSwap && !oldTeam) {
                            // 如果draggedMember原本不在任何团队，被替换的成员回到成员池
                            memberToSwap.assignedTeamId = null;
                            console.log('[跨团替换] 原成员不在团队中，被替换成员回到成员池:', memberToSwap.name);
                        }
                        
                        this.saveData();
                        // 立即更新所有团队标签页的人数显示
                        this.updateAllTeamTabCounts();
                        this.refreshUI();
                        console.log('[跨团替换] 替换完成:', draggedMember.name, '<->', memberToSwap?.name || '无');
                    } else {
                        alert('无法添加成员到团队');
                        // 如果添加失败，尝试恢复原状态
                        if (oldTeam) {
                            oldTeam.addMember(draggedMember);
                        }
                        if (memberToSwap) {
                            team.addMember(memberToSwap);
                        }
                        this.updateAllTeamTabCounts();
                    }
                } else {
                    // 如果成员已经在目标团队，不做处理
                    console.log('[拖拽] 成员已在目标团队:', draggedMember.name);
                }
            }
        });
        
        return tab;
    }

    editTeamNameInline(tab, team, nameSpan) {
        // 创建输入框
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'team-tab-name-input';
        input.value = team.name;
        input.style.cssText = `
            border: 2px solid var(--primary-color);
            border-radius: 4px;
            padding: 4px 8px;
            font-size: 14px;
            font-weight: 600;
            width: 100%;
            background: white;
            outline: none;
        `;
        
        // 替换名称显示
        nameSpan.style.display = 'none';
        tab.insertBefore(input, nameSpan);
        input.focus();
        input.select();
        
        // 保存函数
        const saveName = () => {
            const newName = input.value.trim();
            if (newName && newName !== team.name) {
                team.name = newName;
                nameSpan.textContent = newName;
                this.saveData();
                this.refreshUI();
            } else {
                nameSpan.textContent = team.name;
            }
            input.remove();
            nameSpan.style.display = '';
        };
        
        // 回车保存
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                saveName();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                input.remove();
                nameSpan.style.display = '';
            }
        });
        
        // 失去焦点保存
        input.addEventListener('blur', saveName);
        
        // 点击外部保存
        const clickHandler = (e) => {
            if (!tab.contains(e.target)) {
                saveName();
                document.removeEventListener('click', clickHandler);
            }
        };
        setTimeout(() => {
            document.addEventListener('click', clickHandler);
        }, 0);
    }

    createTeamDetailContent(team) {
        const content = document.createElement('div');
        const isActive = this.selectedTeam?.id === team.id;
        content.className = 'team-detail-content' + (isActive ? ' active' : '');
        content.dataset.teamId = team.id;
        
        const template = this.templates.find(t => t.id === team.roleTemplateId);
        const currentDist = team.getClassDistribution();
        
        // 统计上场总人数和各职业数量
        const totalMembers = team.currentCount;
        const classStats = Object.entries(currentDist)
            .filter(([className, count]) => count > 0)
            .sort((a, b) => b[1] - a[1])
            .map(([className, count]) => `${className}×${count}`)
            .join(' ');
        
        let html = `
            <div class="team-detail-info">
                <h3>${team.name}</h3>
                <p>人数: ${team.currentCount} / ${team.maxMembers}</p>
                ${template ? `<p>职责模板: ${template.name}</p>` : '<p>未设置模板</p>'}
                <div style="margin-top: 15px; padding: 10px; background: #f0f7ff; border-radius: 6px; border-left: 4px solid var(--primary-color);">
                    <div style="font-size: 13px; font-weight: 600; color: var(--text-primary); margin-bottom: 8px;">📊 上场统计</div>
                    <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 5px;">
                        <strong>总人数：</strong>${totalMembers}人
                    </div>
                    <div style="font-size: 12px; color: var(--text-secondary);">
                        <strong>职业分布：</strong>${classStats || '暂无'}
                    </div>
                </div>
                <div style="margin-top: 15px; display: flex; gap: 10px;">
                    <button class="btn btn-primary" onclick="app.editTeam('${team.id}')">✏️ 编辑团队</button>
                    <button class="btn btn-success" onclick="app.exportTeam('${team.id}')">📥 导出配比并保存</button>
                    <button class="btn btn-info" onclick="app.showHistoryTeams()" style="margin-left: 8px;">📚 历史配比</button>
                </div>
            </div>
        `;
        
        if (template) {
            html += '<div class="template-progress">';
            const entries = Object.entries(template.classDistribution).sort((a, b) => b[1] - a[1]);
            
            entries.forEach(([className, target]) => {
                const current = currentDist[className] || 0;
                const gap = target - current;
                const percentage = target > 0 ? (current / target * 100) : 0;
                
                html += `
                    <div class="template-progress-item">
                        <div class="template-progress-header">
                            <span class="template-progress-label">${className}: ${current} / ${target}</span>
                            ${gap > 0 ? `<span class="template-progress-gap">缺口: ${gap}</span>` : ''}
                        </div>
                        <div class="progress-bar-container">
                            <div class="progress-bar" style="width: ${Math.min(percentage, 100)}%"></div>
                        </div>
                    </div>
                `;
            });
            
            html += '</div>';
        }
        
        // 待调区域
        html += `
            <div class="pending-area" style="margin-top: 15px; margin-bottom: 15px; padding: 15px; background: #f9f9f9; border: 2px dashed var(--border-color); border-radius: 8px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <h4 style="margin: 0; font-size: 14px; color: var(--text-primary);">🔄 待调区域（可拖动成员卡片到这里，切换团队时调整）</h4>
                    <button class="btn btn-secondary btn-sm" onclick="app.clearPendingMembers()" style="padding: 4px 8px; font-size: 12px;">清空</button>
                </div>
                <div id="pendingMembersGrid-${team.id}" class="pending-members-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 8px; min-height: 60px;">
                    <!-- 待调成员将动态插入这里 -->
                </div>
            </div>
        `;
        
        // 小队布局
        html += '<div class="squads-container">';
        html += '<div class="squads-sidebar">';
        for (let i = 1; i <= this.squadsPerTeam; i++) {
            html += `<div class="squad-sidebar-item" data-squad="${i}">${i}</div>`;
        }
        html += '</div>';
        
        html += '<div class="squads-columns">';
        for (let i = 1; i <= this.squadsPerTeam; i++) {
            const squadMembers = this.getSquadMembers(team, i);
            html += `<div class="squad-column" data-squad="${i}" data-team-id="${team.id}">`;
            html += `<div class="squad-column-header">${i}小队</div>`;
            
            // 创建一个槽位映射，确保按槽位顺序显示
            const slotMap = {};
            squadMembers.forEach(member => {
                if (member && member.slotIndex) {
                    const slot = member.slotIndex;
                    // 如果槽位已被占用，确保使用正确的成员
                    if (!slotMap[slot] || slotMap[slot].id !== member.id) {
                        slotMap[slot] = member;
                    }
                }
            });
            
            for (let slot = 1; slot <= this.membersPerSquad; slot++) {
                const member = slotMap[slot];
                html += `<div class="squad-slot" data-slot="${slot}" data-squad="${i}">`;
                
                if (member) {
                    const classColor = ClassColorMap[member.class] || 'buwei';
                    html += `
                        <div class="squad-member-card class-${classColor}" draggable="true" data-member-id="${member.id}">
                            <div class="squad-member-name">${member.name}</div>
                            <div class="squad-member-tags">${member.getTagsDisplay()}</div>
                            <div class="squad-member-info">
                                <span class="squad-member-class">${member.class}</span>
                                <span class="squad-member-power">${(member.power / 10000).toFixed(1)}w</span>
                            </div>
                            <button class="squad-member-remove" onclick="app.removeMemberFromTeam('${member.id}'); event.stopPropagation();">×</button>
                        </div>
                    `;
                } else {
                    html += `<div class="squad-slot-empty">槽位 ${slot}</div>`;
                }
                
                html += '</div>';
            }
            
            html += '</div>';
        }
        html += '</div>';
        html += '</div>';
        
        content.innerHTML = html;
        
        // 设置拖放事件（确保每次刷新都重新绑定）
        this.setupSquadDragDrop(content, team);
        
        // 设置待调区域拖放事件
        this.setupPendingAreaDragDrop(content, team);
        
        // 刷新待调区域显示
        this.refreshPendingMembers(team);
        
        // 确保所有成员卡片都设置了draggable属性
        setTimeout(() => {
            content.querySelectorAll('.squad-member-card').forEach(card => {
                if (!card.hasAttribute('draggable')) {
                    card.setAttribute('draggable', 'true');
                }
            });
            // 重新绑定拖拽事件（防止刷新后失效）
            this.setupSquadDragDrop(content, team);
            this.setupPendingAreaDragDrop(content, team);
        }, 100);
        
        return content;
    }
    
    setupPendingAreaDragDrop(content, team) {
        const pendingGrid = content.querySelector(`#pendingMembersGrid-${team.id}`);
        if (!pendingGrid) return;
        
        // 允许拖入待调区
        pendingGrid.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'move';
            pendingGrid.style.borderColor = 'var(--primary-color)';
            pendingGrid.style.background = 'rgba(100, 149, 237, 0.1)';
        });
        
        pendingGrid.addEventListener('dragleave', (e) => {
            if (!pendingGrid.contains(e.relatedTarget)) {
                pendingGrid.style.borderColor = '';
                pendingGrid.style.background = '';
            }
        });
        
        pendingGrid.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            pendingGrid.style.borderColor = '';
            pendingGrid.style.background = '';
            
            let member = this.draggedMember;
            if (!member) {
                const memberId = e.dataTransfer.getData('text/plain');
                if (memberId) {
                    member = this.allMembers.find(m => m.id === memberId);
                }
            }
            
            if (member) {
                // 标记已成功拖放
                this.draggedMemberDropped = true;
                
                // 从原团队移除
                if (member.assignedTeamId) {
                    const oldTeam = this.teams.find(t => t.id === member.assignedTeamId);
                    if (oldTeam) {
                        oldTeam.removeMember(member);
                        member.assignedTeamId = null;
                        member.squadIndex = null;
                        member.slotIndex = null;
                    }
                }
                
                // 添加到待调区（如果还没有）
                if (!this.pendingMembers.find(m => m.id === member.id)) {
                    this.pendingMembers.push(member);
                    console.log('[待调区] 添加成员:', member.name, '待调区总数:', this.pendingMembers.length);
                }
                
                // 保存待调区成员（使用ID数组）
                const pendingMemberIds = this.pendingMembers.map(m => m.id);
                Persistence.savePendingMembers(pendingMemberIds);
                
                // 保存数据
                this.saveData();
                
                // 刷新界面（不调用refreshUI，避免重新加载数据）
                this.refreshPendingMembers(team);
                this.updateAllTeamTabCounts();
                this.refreshMembers(); // 只刷新成员池，不刷新整个UI
                console.log('[待调区] 成员已保存，待调区总数:', this.pendingMembers.length);
            }
        });
    }
    
    refreshPendingMembers(team) {
        const pendingGrid = document.querySelector(`#pendingMembersGrid-${team.id}`);
        if (!pendingGrid) return;
        
        // 显示所有待调成员（不区分团队，因为待调区是全局的）
        pendingGrid.innerHTML = '';
        
        // 过滤掉无效的成员（可能已被删除）
        const validPendingMembers = this.pendingMembers.filter(m => m && this.allMembers.find(am => am.id === m.id));
        
        if (validPendingMembers.length === 0) {
            pendingGrid.innerHTML = '<div style="text-align: center; color: #999; padding: 20px; grid-column: 1 / -1;">拖放成员卡片到这里进入待调区</div>';
            return;
        }
        
        validPendingMembers.forEach(member => {
            const card = this.createPendingMemberCard(member, team);
            pendingGrid.appendChild(card);
        });
    }
    
    createPendingMemberCard(member, team) {
        const card = document.createElement('div');
        card.className = 'member-card-squad pending-member-card';
        card.dataset.memberId = member.id;
        card.draggable = true;
        
        const classColor = ClassColorMap[member.class] || 'buwei';
        card.classList.add(`class-${classColor}`);
        
        card.innerHTML = `
            <div class="squad-member-name">${member.name}</div>
            <div class="squad-member-tags">${member.getTagsDisplay()}</div>
            <div class="squad-member-info">
                <span class="squad-member-class">${member.class}</span>
                <span class="squad-member-power">${(member.power / 10000).toFixed(1)}w</span>
            </div>
        `;
        
        // 拖拽事件
        card.addEventListener('dragstart', (e) => {
            this.draggedMember = member;
            card.style.opacity = '0.5';
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', member.id);
        });
        
        card.addEventListener('dragend', () => {
            card.style.opacity = '1';
            this.draggedMember = null;
        });
        
        // 双击添加到当前团队
        card.addEventListener('dblclick', () => {
            if (team && !team.isFull) {
                team.addMember(member);
                this.pendingMembers = this.pendingMembers.filter(m => m.id !== member.id);
                Persistence.savePendingMembers(this.pendingMembers);
                member.assignedTeamId = team.id;
                this.savePositionHistory();
                this.saveData();
                this.refreshUI();
            }
        });
        
        return card;
    }
    
    clearPendingMembers() {
        if (this.pendingMembers.length === 0) {
            return;
        }
        
        if (confirm(`确定要清空待调区吗？当前有 ${this.pendingMembers.length} 名成员在待调区。`)) {
            this.pendingMembers = [];
            Persistence.savePendingMembers(this.pendingMembers);
            this.savePositionHistory();
            this.refreshUI();
        }
    }

    getSquadMembers(team, squadIndex) {
        // 确保只获取真正属于该团队的成员（双重验证）
        const validTeamMembers = team.members.filter(m => {
            // 验证1：assignedTeamId必须匹配
            if (m.assignedTeamId !== team.id) return false;
            // 验证2：成员确实在team.members数组中
            const index = team.members.findIndex(tm => tm.id === m.id);
            if (index === -1) return false;
            return true;
        });
        
        // 获取所有属于该小队的成员（有位置信息且squadIndex匹配）
        const squadMembers = validTeamMembers.filter(m => 
            m.squadIndex === squadIndex && 
            m.slotIndex !== null && 
            m.slotIndex !== undefined
        );
        
        // 获取所有没有位置信息的成员（属于该团队但还没有分配到小队）
        const membersWithoutPosition = validTeamMembers.filter(m => 
            (!m.squadIndex || m.squadIndex === null || m.slotIndex === null || m.slotIndex === undefined)
        );
        
        // 按槽位排序已有位置的成员
        squadMembers.sort((a, b) => (a.slotIndex || 999) - (b.slotIndex || 999));
        
        // 找出已占用的槽位
        const occupiedSlots = new Set(squadMembers.map(m => m.slotIndex));
        
        // 为没有位置信息的成员分配空槽位
        const availableSlots = [];
        for (let i = 1; i <= this.membersPerSquad; i++) {
            if (!occupiedSlots.has(i)) {
                availableSlots.push(i);
            }
        }
        
        // 按优先级排序未分配位置的成员
        membersWithoutPosition.sort((a, b) => b.getPriorityScore() - a.getPriorityScore());
        
        // 为未分配位置的成员分配空槽位
        membersWithoutPosition.slice(0, availableSlots.length).forEach((member, index) => {
            member.squadIndex = squadIndex;
            member.slotIndex = availableSlots[index];
            squadMembers.push(member);
        });
        
        // 按槽位排序返回
        squadMembers.sort((a, b) => (a.slotIndex || 999) - (b.slotIndex || 999));
        return squadMembers;
    }

    setupSquadDragDrop(content, team) {
        // 移除旧的事件监听器（通过克隆元素）
        const oldSlots = content.querySelectorAll('.squad-slot');
        const oldCards = content.querySelectorAll('.squad-member-card');
        
        // 重新绑定槽位拖放事件（包括空槽位和已有成员的槽位）
        content.querySelectorAll('.squad-slot').forEach(slot => {
            // 移除旧的事件监听器
            const newSlot = slot.cloneNode(true);
            slot.parentNode.replaceChild(newSlot, slot);
        });
        
        // 重新获取所有槽位
        content.querySelectorAll('.squad-slot').forEach(slot => {
            slot.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.stopPropagation();
                e.dataTransfer.dropEffect = 'move';
                slot.style.borderColor = 'var(--primary-color)';
                slot.style.background = 'rgba(100, 149, 237, 0.1)';
            });
            
            slot.addEventListener('dragleave', (e) => {
                // 只有当离开槽位本身时才清除样式（不包括子元素）
                if (!slot.contains(e.relatedTarget)) {
                    slot.style.borderColor = '';
                    slot.style.background = '';
                }
            });
            
            slot.addEventListener('drop', (e) => {
                e.preventDefault();
                e.stopPropagation();
                slot.style.borderColor = '';
                slot.style.background = '';
                
                // 从dataTransfer或draggedMember获取成员信息
                let member = this.draggedMember;
                if (!member) {
                    const memberId = e.dataTransfer.getData('text/plain');
                    if (memberId) {
                        member = this.allMembers.find(m => m.id === memberId);
                    }
                }
                
                if (member) {
                    const squadIndex = parseInt(slot.dataset.squad);
                    const slotIndex = parseInt(slot.dataset.slot);
                    this.moveMemberToSlot(member, team, squadIndex, slotIndex);
                }
            });
        });
        
        // 重新绑定成员卡片拖拽事件
        content.querySelectorAll('.squad-member-card').forEach(card => {
            // 移除旧的事件监听器（通过克隆）
            const newCard = card.cloneNode(true);
            card.parentNode.replaceChild(newCard, card);
        });
        
        // 重新获取所有卡片并绑定事件
        content.querySelectorAll('.squad-member-card').forEach(card => {
            // 确保卡片可拖拽
            card.setAttribute('draggable', 'true');
            
            card.addEventListener('dragstart', (e) => {
                const memberId = card.dataset.memberId;
                if (!memberId) {
                    e.preventDefault();
                    return;
                }
                this.draggedMember = this.allMembers.find(m => m.id === memberId);
                if (!this.draggedMember) {
                    e.preventDefault();
                    return;
                }
                // 记录原团队
                this.draggedMemberOriginalTeam = this.draggedMember.assignedTeamId ? this.teams.find(t => t.id === this.draggedMember.assignedTeamId) : null;
                this.draggedMemberDropped = false; // 重置标记
                this.draggedFromSlot = card.closest('.squad-slot');
                card.style.opacity = '0.5';
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', memberId);
                console.log('[拖拽开始] 成员:', this.draggedMember.name, '原团队:', this.draggedMemberOriginalTeam?.name || '无');
            });
            
            card.addEventListener('dragend', (e) => {
                if (this.draggedMember) {
                    const cards = content.querySelectorAll('.squad-member-card');
                    cards.forEach(c => c.style.opacity = '1');
                }
                // 清理所有拖拽样式
                content.querySelectorAll('.squad-slot').forEach(slot => {
                    slot.style.borderColor = '';
                    slot.style.background = '';
                });
                content.querySelectorAll('.squad-member-card').forEach(c => {
                    c.style.transform = '';
                    c.style.boxShadow = '';
                });
                this.draggedMember = null;
                this.draggedFromSlot = null;
            });
            
            // 成员卡片也可以作为拖放目标
            card.addEventListener('dragover', (e) => {
                const memberId = card.dataset.memberId;
                let draggedMember = this.draggedMember;
                if (!draggedMember) {
                    const draggedId = e.dataTransfer.getData('text/plain');
                    if (draggedId) {
                        draggedMember = this.allMembers.find(m => m.id === draggedId);
                    }
                }
                
                if (draggedMember && memberId !== draggedMember.id) {
                    e.preventDefault();
                    e.stopPropagation();
                    e.dataTransfer.dropEffect = 'move';
                    card.style.transform = 'scale(1.05)';
                    card.style.boxShadow = '0 0 10px rgba(100, 149, 237, 0.5)';
                }
            });
            
            card.addEventListener('dragleave', (e) => {
                // 只有当离开卡片本身时才清除样式
                if (!card.contains(e.relatedTarget)) {
                    card.style.transform = '';
                    card.style.boxShadow = '';
                }
            });
            
            card.addEventListener('drop', (e) => {
                e.preventDefault();
                e.stopPropagation();
                card.style.transform = '';
                card.style.boxShadow = '';
                
                // 获取拖拽的成员
                let draggedMember = this.draggedMember;
                if (!draggedMember) {
                    const draggedId = e.dataTransfer.getData('text/plain');
                    if (draggedId) {
                        draggedMember = this.allMembers.find(m => m.id === draggedId);
                    }
                }
                
                if (draggedMember) {
                    const targetSlot = card.closest('.squad-slot');
                    const targetSquad = parseInt(targetSlot.dataset.squad);
                    const targetSlotIndex = parseInt(targetSlot.dataset.slot);
                    const targetMemberId = card.dataset.memberId;
                    const targetMember = this.allMembers.find(m => m.id === targetMemberId);
                    
                    // 如果源成员和目标成员都在同一个团队，交换位置
                    if (draggedMember.assignedTeamId === team.id && targetMember && targetMember.assignedTeamId === team.id) {
                        this.swapMembersInTeam(draggedMember, targetMember, team);
                    } else {
                        // 否则移动到目标位置
                        this.moveMemberToSlot(draggedMember, team, targetSquad, targetSlotIndex);
                    }
                }
            });
            
            card.addEventListener('click', (e) => {
                if (!e.target.closest('.squad-member-remove')) {
                    const memberId = card.dataset.memberId;
                    const member = this.allMembers.find(m => m.id === memberId);
                    if (member) {
                        this.showBattleData(member);
                    }
                }
            });
            
            card.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                const memberId = card.dataset.memberId;
                const member = this.allMembers.find(m => m.id === memberId);
                if (member) {
                    this.openTagModal(member);
                }
            });
        });
    }

    moveMemberToSlot(member, team, squadIndex, slotIndex) {
        // 标记已成功拖放
        this.draggedMemberDropped = true;
        
        // 如果成员不在该团队，先添加到团队
        if (member.assignedTeamId !== team.id) {
            // 如果成员在其他团队，先从原团队移除
            const oldTeam = this.teams.find(t => t.id === member.assignedTeamId);
            let memberToSwap = null; // 用于替换的成员
            
            // 如果目标团队已满，需要先移除一个成员（替换逻辑）
            if (team.isFull) {
                // 移除优先级最低的未锁定成员
                const membersToRemove = team.members.filter(m => !m.isLocked && m.id !== member.id);
                if (membersToRemove.length > 0) {
                    // 移除优先级最低的成员
                    membersToRemove.sort((a, b) => a.getPriorityScore() - b.getPriorityScore());
                    memberToSwap = membersToRemove[0];
                    const removed = team.removeMember(memberToSwap);
                    if (!removed) {
                        console.error('无法从目标团队移除成员:', memberToSwap.name);
                        return;
                    }
                    memberToSwap.squadIndex = null;
                    memberToSwap.slotIndex = null;
                    console.log('[跨团替换] 从目标团队移除成员:', memberToSwap.name, '准备替换到原团队');
                } else {
                    alert('目标团队已满且所有成员都已锁定，无法替换');
                    return;
                }
            }
            
            // 从原团队移除成员
            if (oldTeam) {
                const removed = oldTeam.removeMember(member);
                if (!removed) {
                    console.error('无法从原团队移除成员:', member.name);
                    // 如果移除失败，将被替换的成员加回目标团队
                    if (memberToSwap) {
                        team.addMember(memberToSwap);
                        this.updateAllTeamTabCounts();
                    }
                    return;
                }
                member.squadIndex = null;
                member.slotIndex = null;
                this.updateAllTeamTabCounts();
                console.log('[跨团替换] 从原团队移除成员:', member.name, '准备添加到目标团队');
            }
            
            // 添加到新团队
            if (team.addMember(member)) {
                console.log('[跨团替换] 成员已添加到目标团队:', member.name, '->', team.name);
                
                // 如果进行了替换，将被替换的成员添加到原团队（即使原团队已满也要尝试）
                if (memberToSwap && oldTeam) {
                    // 如果原团队已满，需要先移除一个成员
                    if (oldTeam.isFull) {
                        // 移除优先级最低的未锁定成员
                        const oldTeamMembersToRemove = oldTeam.members.filter(m => !m.isLocked && m.id !== memberToSwap.id);
                        if (oldTeamMembersToRemove.length > 0) {
                            oldTeamMembersToRemove.sort((a, b) => a.getPriorityScore() - b.getPriorityScore());
                            const oldTeamMemberToSwap = oldTeamMembersToRemove[0];
                            const removed = oldTeam.removeMember(oldTeamMemberToSwap);
                            if (removed) {
                                oldTeamMemberToSwap.squadIndex = null;
                                oldTeamMemberToSwap.slotIndex = null;
                                oldTeamMemberToSwap.assignedTeamId = null;
                                console.log('[跨团替换] 原团队已满，移除成员:', oldTeamMemberToSwap.name, '回到成员池');
                            }
                        } else {
                            // 原团队所有成员都锁定，无法替换
                            console.warn('[跨团替换] 原团队已满且所有成员都锁定，被替换成员将留在成员池:', memberToSwap.name);
                            memberToSwap.assignedTeamId = null;
                            // 不提前返回，继续执行设置位置信息
                        }
                    }
                    
                    // 将被替换的成员添加到原团队
                    if (oldTeam.addMember(memberToSwap)) {
                        memberToSwap.squadIndex = null;
                        memberToSwap.slotIndex = null;
                        console.log('[跨团替换] 被替换成员已添加到原团队:', memberToSwap.name, '->', oldTeam.name);
                    } else {
                        // 如果添加失败（理论上不应该发生，因为我们已经处理了满员情况）
                        console.error('[跨团替换] 无法将被替换成员添加到原团队:', memberToSwap.name);
                        memberToSwap.assignedTeamId = null;
                    }
                } else if (memberToSwap && !oldTeam) {
                    // 如果member原本不在任何团队，被替换的成员回到成员池
                    memberToSwap.assignedTeamId = null;
                    console.log('[跨团替换] 原成员不在团队中，被替换成员回到成员池:', memberToSwap.name);
                }
                
                console.log('[跨团替换] 替换完成:', member.name, '<->', memberToSwap?.name || '无');
            } else {
                alert('无法添加成员到团队');
                // 如果添加失败，尝试恢复原状态
                if (oldTeam) {
                    oldTeam.addMember(member);
                }
                if (memberToSwap) {
                    team.addMember(memberToSwap);
                }
                this.updateAllTeamTabCounts();
                return;
            }
        }
        
        // 检查目标槽位是否已有成员（只有在成员已经在团队中时才需要检查）
        if (member.assignedTeamId === team.id) {
            const existingMember = team.members.find(m => 
                m.id !== member.id && 
                m.assignedTeamId === team.id &&
                m.squadIndex === squadIndex && 
                m.slotIndex === slotIndex
            );
            
            // 保存原位置
            const oldSquad = member.squadIndex;
            const oldSlot = member.slotIndex;
            
            if (existingMember) {
                // 如果目标槽位有成员，交换位置
                member.squadIndex = squadIndex;
                member.slotIndex = slotIndex;
                
                // 交换原成员的位置
                if (oldSquad && oldSlot) {
                    existingMember.squadIndex = oldSquad;
                    existingMember.slotIndex = oldSlot;
                } else {
                    // 如果原成员没有位置，清除目标成员的位置（让它重新分配）
                    existingMember.squadIndex = null;
                    existingMember.slotIndex = null;
                }
            } else {
                // 目标槽位为空，直接移动
                member.squadIndex = squadIndex;
                member.slotIndex = slotIndex;
            }
        } else {
            // 如果成员刚被添加到团队，直接设置位置
            member.squadIndex = squadIndex;
            member.slotIndex = slotIndex;
        }
        
        this.saveData();
        this.updateAllTeamTabCounts();
        this.refreshUI();
    }

    swapMembersInTeam(member1, member2, team) {
        // 交换两个成员的位置信息
        if (member1.assignedTeamId !== team.id || member2.assignedTeamId !== team.id) {
            return;
        }
        
        // 确保两个成员都有位置信息
        if (!member1.squadIndex || !member1.slotIndex || !member2.squadIndex || !member2.slotIndex) {
            // 如果任一成员没有位置信息，不能交换，直接返回
            return;
        }
        
        const tempSquad = member1.squadIndex;
        const tempSlot = member1.slotIndex;
        
        member1.squadIndex = member2.squadIndex;
        member1.slotIndex = member2.slotIndex;
        
        member2.squadIndex = tempSquad;
        member2.slotIndex = tempSlot;
        
        this.saveData();
        this.refreshUI();
    }

    refreshMembers() {
        const container = document.getElementById('membersPool');
        container.innerHTML = '';
        
        // 更新职业筛选选项
        this.updateClassFilter();
        
        // 验证并修复数据一致性：确保所有成员的assignedTeamId与实际团队分配一致
        this.validateMemberAssignments();
        
        // 获取所有成员（包括已分配的），用于搜索
        let allSearchableMembers = this.allMembers.filter(m => !m.isEye);
        
        // 应用搜索筛选（如果有关键词，搜索所有成员包括在团的）
        if (this.memberSearchText) {
            const searchLower = this.memberSearchText.toLowerCase();
            allSearchableMembers = allSearchableMembers.filter(m => 
                m.name.toLowerCase().includes(searchLower) ||
                m.class.toLowerCase().includes(searchLower)
            );
        }
        
        // 应用职业筛选
        if (this.memberClassFilter) {
            allSearchableMembers = allSearchableMembers.filter(m => m.class === this.memberClassFilter);
        }
        
        // 分离未分配和已分配成员（待调区成员不算未分配）
        const unassigned = allSearchableMembers.filter(m => !m.assignedTeamId && !this.pendingMembers.find(pm => pm.id === m.id));
        const assigned = allSearchableMembers.filter(m => m.assignedTeamId);
        
        // 排序
        if (this.memberSortBy === 'power') {
            unassigned.sort((a, b) => b.power - a.power);
        } else {
            unassigned.sort((a, b) => b.getPriorityScore() - a.getPriorityScore());
        }
        
        // 更新排序按钮状态
        const sortBtn = document.getElementById('btnSortByPower');
        if (this.memberSortBy === 'power') {
            sortBtn.classList.add('active');
            sortBtn.textContent = '📊 战力 ↓';
        } else {
            sortBtn.classList.remove('active');
            sortBtn.textContent = '📊 战力';
        }
        
        // 眼位成员（不受筛选影响）
        const eyeMembers = this.allMembers.filter(m => m.isEye);
        
        // 显示未分配成员
        if (unassigned.length > 0) {
            const grid = document.createElement('div');
            grid.className = 'members-grid';
            
            unassigned.forEach(member => {
                const card = this.createMemberCard(member);
                grid.appendChild(card);
            });
            
            container.appendChild(grid);
        }
        
        // 显示已分配成员（仅在搜索时显示）
        if (assigned.length > 0 && this.memberSearchText) {
            const assignedSection = document.createElement('div');
            assignedSection.className = 'assigned-members-section';
            assignedSection.style.marginTop = '15px';
            assignedSection.innerHTML = '<h3 style="font-size: 14px; color: var(--text-secondary); margin-bottom: 10px;">📋 已分配成员（搜索结果）</h3>';
            
            const grid = document.createElement('div');
            grid.className = 'members-grid';
            
            assigned.forEach(member => {
                const card = this.createMemberCard(member, true); // 传入true表示是已分配成员
                // 添加已分配标记
                const assignedTeam = this.teams.find(t => t.id === member.assignedTeamId);
                if (assignedTeam) {
                    card.style.opacity = '0.7';
                    card.style.border = '2px dashed var(--text-secondary)';
                    card.title = `已分配至：${assignedTeam.name}`;
                }
                grid.appendChild(card);
            });
            
            assignedSection.appendChild(grid);
            container.appendChild(assignedSection);
        }
        
        // 显示眼位成员（不受筛选影响）
        if (eyeMembers.length > 0) {
            const eyeSection = document.createElement('div');
            eyeSection.className = 'eye-members-section';
            eyeSection.style.marginTop = '15px';
            eyeSection.innerHTML = '<h3 style="font-size: 14px; color: var(--text-secondary); margin-bottom: 10px;">👁️ 眼位成员（不占团名额）</h3>';
            
            const grid = document.createElement('div');
            grid.className = 'members-grid';
            
            eyeMembers.forEach(member => {
                const card = this.createMemberCard(member);
                grid.appendChild(card);
            });
            
            eyeSection.appendChild(grid);
            container.appendChild(eyeSection);
        }
        
        // 如果既没有未分配成员也没有眼位成员，且没有搜索筛选条件，显示空状态
        if (unassigned.length === 0 && assigned.length === 0 && eyeMembers.length === 0 && !this.memberSearchText && !this.memberClassFilter) {
            container.innerHTML = '<div class="empty-state"><p>暂无成员，请导入数据</p></div>';
        } else if (unassigned.length === 0 && assigned.length === 0 && eyeMembers.length === 0 && (this.memberSearchText || this.memberClassFilter)) {
            container.innerHTML = '<div class="empty-state"><p>未找到匹配的成员</p></div>';
        }
        
        // 更新成员数量显示
        const unassignedCount = this.allMembers.filter(m => !m.assignedTeamId && !m.isEye).length;
        document.getElementById('memberCount').textContent = unassignedCount;
        
        console.log('[成员池] 刷新完成，未分配成员数:', unassignedCount, '总成员数:', this.allMembers.length);
    }
    
    // 验证并修复成员分配的一致性
    validateMemberAssignments() {
        let fixedCount = 0;
        const fixedMembers = []; // 记录修复的成员，用于统一输出
        
        // 检查所有团队中的成员
        this.teams.forEach(team => {
            team.members.forEach(member => {
                // 确保成员的assignedTeamId正确
                if (member.assignedTeamId !== team.id) {
                    member.assignedTeamId = team.id;
                    fixedCount++;
                }
            });
        });
        
        // 检查所有成员的assignedTeamId是否指向存在的团队
        this.allMembers.forEach(member => {
            if (member.assignedTeamId) {
                const team = this.teams.find(t => t.id === member.assignedTeamId);
                if (!team) {
                    // 团队不存在，清除分配（静默修复）
                    fixedMembers.push(member.name);
                    member.assignedTeamId = null;
                    member.squadIndex = null;
                    member.slotIndex = null;
                    fixedCount++;
                } else {
                    // 验证成员是否真的在团队中
                    const inTeam = team.members.find(tm => tm.id === member.id);
                    if (!inTeam) {
                        // 成员不在团队中，清除分配（静默修复）
                        fixedMembers.push(member.name);
                        member.assignedTeamId = null;
                        member.squadIndex = null;
                        member.slotIndex = null;
                        fixedCount++;
                    }
                }
            }
        });
        
        if (fixedCount > 0) {
            // 统一输出修复信息，而不是每个成员都输出一次
            console.log(`[数据验证] 修复了 ${fixedCount} 个数据不一致问题${fixedMembers.length > 0 ? `，涉及成员：${fixedMembers.slice(0, 5).join('、')}${fixedMembers.length > 5 ? '等' : ''}` : ''}`);
            // 不自动保存，避免循环调用saveData导致的问题
            // 数据会在下次操作时自动保存
        }
    }

    updateClassFilter() {
        const classFilter = document.getElementById('memberClassFilter');
        const currentValue = classFilter.value;
        
        // 获取所有未分配成员的职业
        const unassigned = this.allMembers.filter(m => !m.assignedTeamId && !m.isEye);
        const classes = [...new Set(unassigned.map(m => m.class))].sort();
        
        // 保留"全部职业"选项
        classFilter.innerHTML = '<option value="">全部职业</option>';
        
        classes.forEach(className => {
            const option = document.createElement('option');
            option.value = className;
            option.textContent = className;
            classFilter.appendChild(option);
        });
        
        // 恢复之前的选择
        if (currentValue && classes.includes(currentValue)) {
            classFilter.value = currentValue;
        }
    }

    createMemberCard(member, isAssigned = false) {
        const card = document.createElement('div');
        card.className = 'member-card-squad';
        card.dataset.memberId = member.id;
        card.draggable = !member.isLocked;
        
        const classColor = ClassColorMap[member.class] || 'buwei';
        
        // 如果是已分配成员，显示团队名称
        let teamNameDisplay = '';
        if (isAssigned && member.assignedTeamId) {
            const assignedTeam = this.teams.find(t => t.id === member.assignedTeamId);
            if (assignedTeam) {
                teamNameDisplay = `<div style="font-size: 10px; color: rgba(255, 255, 255, 0.85); margin-top: 2px; text-shadow: 0 1px 1px rgba(0, 0, 0, 0.3);">📍 ${assignedTeam.name}</div>`;
            }
        }
        
        card.innerHTML = `
            <div class="squad-member-name">${member.name}</div>
            <div class="squad-member-tags">${member.getTagsDisplay()}</div>
            <div class="squad-member-info">
                <span class="squad-member-class">${member.class}</span>
                <span class="squad-member-power">${(member.power / 10000).toFixed(1)}w</span>
            </div>
            ${teamNameDisplay}
        `;
        
        // 添加职业颜色类
        card.classList.add(`class-${classColor}`);
        
        // 拖拽事件
        if (!member.isLocked) {
            card.addEventListener('dragstart', (e) => {
                this.draggedMember = member;
                // 记录原团队
                this.draggedMemberOriginalTeam = member.assignedTeamId ? this.teams.find(t => t.id === member.assignedTeamId) : null;
                this.draggedMemberDropped = false; // 重置标记
                card.style.opacity = '0.5';
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', member.id);
                console.log('[拖拽开始] 成员:', member.name, '原团队:', this.draggedMemberOriginalTeam?.name || '无');
            });
            
            card.addEventListener('dragend', (e) => {
                card.style.opacity = '1';
                
                // 如果没有成功拖放到目标位置，恢复原分配
                if (!this.draggedMemberDropped && this.draggedMemberOriginalTeam && this.draggedMember) {
                    // 检查成员是否还在原团队
                    const currentTeam = this.teams.find(t => t.id === this.draggedMember.assignedTeamId);
                    if (!currentTeam || currentTeam.id !== this.draggedMemberOriginalTeam.id) {
                        // 成员不在原团队，需要恢复
                        console.log('[拖拽结束] 未成功拖放，恢复原分配:', this.draggedMember.name, '->', this.draggedMemberOriginalTeam.name);
                        
                        // 从当前团队移除（如果存在）
                        if (currentTeam) {
                            currentTeam.removeMember(this.draggedMember);
                            this.draggedMember.squadIndex = null;
                            this.draggedMember.slotIndex = null;
                        }
                        
                        // 恢复到原团队
                        if (!this.draggedMemberOriginalTeam.isFull) {
                            this.draggedMemberOriginalTeam.addMember(this.draggedMember);
                            this.updateAllTeamTabCounts();
                            this.saveData();
                            this.refreshUI();
                        } else {
                            // 原团队已满，无法恢复
                            console.warn('[拖拽结束] 原团队已满，无法恢复:', this.draggedMemberOriginalTeam.name);
                            this.draggedMember.assignedTeamId = null;
                            this.draggedMember.squadIndex = null;
                            this.draggedMember.slotIndex = null;
                            this.updateAllTeamTabCounts();
                            this.saveData();
                            this.refreshUI();
                        }
                    }
                }
                
                // 重置拖拽状态
                this.draggedMember = null;
                this.draggedMemberOriginalTeam = null;
                this.draggedMemberDropped = false;
            });
        }
        
        // 单击查看帮战数据（仅在小队成员卡片中）
        // 成员池卡片不添加点击事件，避免与拖拽冲突
        
        // 双击标记
        card.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            this.openTagModal(member);
        });
        
        // 右键菜单（简单实现）
        card.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.openTagModal(member);
        });
        
        return card;
    }

    showBattleData(member) {
        const modal = document.getElementById('battleDataModal');
        const title = document.getElementById('battleDataTitle');
        const content = document.getElementById('battleDataContent');
        
        title.textContent = `${member.name} 的帮战数据`;
        
        if (!member.battleHistory || member.battleHistory.length === 0) {
            content.innerHTML = '<div class="empty-state"><p>暂无帮战数据</p><p style="margin-top: 10px; font-size: 12px; color: #999;">请导入帮战数据文件</p></div>';
        } else {
            // 按日期倒序排列
            const sortedHistory = [...member.battleHistory].sort((a, b) => {
                if (a.date && b.date) {
                    return new Date(b.date) - new Date(a.date);
                }
                return 0;
            });
            
            // 计算统计数据
            const totalKills = sortedHistory.reduce((sum, b) => sum + (b.kills || 0), 0);
            const totalAssists = sortedHistory.reduce((sum, b) => sum + (b.assists || 0), 0);
            const totalDamage = sortedHistory.reduce((sum, b) => sum + (b.damageToPlayer || 0), 0);
            const totalHealing = sortedHistory.reduce((sum, b) => sum + (b.healing || 0), 0);
            const totalDamageToBuilding = sortedHistory.reduce((sum, b) => sum + (b.damageToBuilding || 0), 0);
            const totalDamageTaken = sortedHistory.reduce((sum, b) => sum + (b.damageTaken || 0), 0);
            
            let html = `
                <div style="margin-bottom: 20px; padding: 15px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 8px; color: white;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                        <h3 style="margin: 0; font-size: 18px; display: flex; align-items: center; gap: 8px;">
                            <span>📊</span>
                            <span>数据概览</span>
                        </h3>
                        <div style="font-size: 14px; opacity: 0.9;">共 ${sortedHistory.length} 场</div>
                    </div>
                    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px;">
                        <div style="background: rgba(255, 255, 255, 0.15); padding: 12px; border-radius: 6px; backdrop-filter: blur(10px);">
                            <div style="font-size: 12px; opacity: 0.9; margin-bottom: 5px;">总击败</div>
                            <div style="font-size: 20px; font-weight: 600;">${totalKills}</div>
                        </div>
                        <div style="background: rgba(255, 255, 255, 0.15); padding: 12px; border-radius: 6px; backdrop-filter: blur(10px);">
                            <div style="font-size: 12px; opacity: 0.9; margin-bottom: 5px;">总助攻</div>
                            <div style="font-size: 20px; font-weight: 600;">${totalAssists}</div>
                        </div>
                        <div style="background: rgba(255, 255, 255, 0.15); padding: 12px; border-radius: 6px; backdrop-filter: blur(10px);">
                            <div style="font-size: 12px; opacity: 0.9; margin-bottom: 5px;">总伤害</div>
                            <div style="font-size: 20px; font-weight: 600;">${this.formatNumber(totalDamage)}</div>
                        </div>
                        <div style="background: rgba(255, 255, 255, 0.15); padding: 12px; border-radius: 6px; backdrop-filter: blur(10px);">
                            <div style="font-size: 12px; opacity: 0.9; margin-bottom: 5px;">总治疗</div>
                            <div style="font-size: 20px; font-weight: 600;">${this.formatNumber(totalHealing)}</div>
                        </div>
                        <div style="background: rgba(255, 255, 255, 0.15); padding: 12px; border-radius: 6px; backdrop-filter: blur(10px);">
                            <div style="font-size: 12px; opacity: 0.9; margin-bottom: 5px;">建筑伤害</div>
                            <div style="font-size: 20px; font-weight: 600;">${this.formatNumber(totalDamageToBuilding)}</div>
                        </div>
                        <div style="background: rgba(255, 255, 255, 0.15); padding: 12px; border-radius: 6px; backdrop-filter: blur(10px);">
                            <div style="font-size: 12px; opacity: 0.9; margin-bottom: 5px;">承受伤害</div>
                            <div style="font-size: 20px; font-weight: 600;">${this.formatNumber(totalDamageTaken)}</div>
                        </div>
                    </div>
                </div>
                <div class="battle-data-table" style="overflow-x: auto; margin-top: 20px;">
                    <table style="width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                        <thead style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white;">
                            <tr>
                                <th style="padding: 12px; text-align: left; font-weight: 600; font-size: 13px;">日期</th>
                                <th style="padding: 12px; text-align: left; font-weight: 600; font-size: 13px;">帮会</th>
                                <th style="padding: 12px; text-align: left; font-weight: 600; font-size: 13px;">团长</th>
                                <th style="padding: 12px; text-align: center; font-weight: 600; font-size: 13px;">击败</th>
                                <th style="padding: 12px; text-align: center; font-weight: 600; font-size: 13px;">助攻</th>
                                <th style="padding: 12px; text-align: center; font-weight: 600; font-size: 13px;">对玩家伤害</th>
                                <th style="padding: 12px; text-align: center; font-weight: 600; font-size: 13px;">对建筑伤害</th>
                                <th style="padding: 12px; text-align: center; font-weight: 600; font-size: 13px;">治疗值</th>
                                <th style="padding: 12px; text-align: center; font-weight: 600; font-size: 13px;">承受伤害</th>
                                <th style="padding: 12px; text-align: center; font-weight: 600; font-size: 13px;">重伤</th>
                                <th style="padding: 12px; text-align: center; font-weight: 600; font-size: 13px;">控制</th>
                            </tr>
                        </thead>
                        <tbody>
            `;
            
            // 计算每项数据的最大值（用于颜色映射）
            const maxKills = Math.max(...sortedHistory.map(b => b.kills || 0), 1);
            const maxAssists = Math.max(...sortedHistory.map(b => b.assists || 0), 1);
            const maxDamage = Math.max(...sortedHistory.map(b => b.damageToPlayer || 0), 1);
            const maxHealing = Math.max(...sortedHistory.map(b => b.healing || 0), 1);
            const maxDamageToBuilding = Math.max(...sortedHistory.map(b => b.damageToBuilding || 0), 1);
            
            sortedHistory.forEach((battle, index) => {
                // 计算颜色强度（0-1）
                const killsRatio = (battle.kills || 0) / maxKills;
                const assistsRatio = (battle.assists || 0) / maxAssists;
                const damageRatio = (battle.damageToPlayer || 0) / maxDamage;
                const healingRatio = (battle.healing || 0) / maxHealing;
                const buildingRatio = (battle.damageToBuilding || 0) / maxDamageToBuilding;
                
                // 生成颜色（绿色系，值越高越绿）
                const getColor = (ratio) => {
                    const r = Math.floor(255 - ratio * 100);
                    const g = Math.floor(200 + ratio * 55);
                    const b = Math.floor(200 - ratio * 100);
                    return `rgb(${r}, ${g}, ${b})`;
                };
                
                const killsColor = getColor(killsRatio);
                const assistsColor = getColor(assistsRatio);
                const damageColor = getColor(damageRatio);
                const healingColor = getColor(healingRatio);
                const buildingColor = getColor(buildingRatio);
                
                html += `
                    <tr class="battle-row" data-battle-index="${index}" data-battle-date="${battle.date || ''}" data-battle-team="${battle.team || ''}" style="border-bottom: 1px solid #eee; transition: background 0.2s;">
                        <td style="padding: 10px; font-size: 12px; color: #666;">${battle.date || '-'}</td>
                        <td style="padding: 10px; font-size: 12px; color: #666;">${battle.battleName || '-'}</td>
                        <td style="padding: 10px; font-size: 12px; color: #666;">${battle.team || '-'}</td>
                        <td style="padding: 10px; text-align: center; background: ${killsColor}; font-weight: 600; color: white; border-radius: 4px; font-size: 13px;">${battle.kills || 0}</td>
                        <td style="padding: 10px; text-align: center; background: ${assistsColor}; font-weight: 600; color: white; border-radius: 4px; font-size: 13px;">${battle.assists || 0}</td>
                        <td style="padding: 10px; text-align: center; background: ${damageColor}; font-weight: 600; color: white; border-radius: 4px; font-size: 13px;">${this.formatNumber(battle.damageToPlayer || 0)}</td>
                        <td style="padding: 10px; text-align: center; background: ${buildingColor}; font-weight: 600; color: white; border-radius: 4px; font-size: 13px;">${this.formatNumber(battle.damageToBuilding || 0)}</td>
                        <td style="padding: 10px; text-align: center; background: ${healingColor}; font-weight: 600; color: white; border-radius: 4px; font-size: 13px;">${this.formatNumber(battle.healing || 0)}</td>
                        <td style="padding: 10px; text-align: center; font-size: 12px; color: #666;">${this.formatNumber(battle.damageTaken || 0)}</td>
                        <td style="padding: 10px; text-align: center; font-size: 12px; color: #666;">${battle.deaths || 0}</td>
                        <td style="padding: 10px; text-align: center; font-size: 12px; color: #666;">${battle.control || 0}</td>
                    </tr>
                `;
            });
            
            html += `
                        </tbody>
                    </table>
                </div>
            `;
            
            content.innerHTML = html;
            
            // 添加悬停事件，显示同团数据
            content.querySelectorAll('.battle-row').forEach(row => {
                row.addEventListener('mouseenter', (e) => {
                    this.showTeamBattleTooltip(e, member, row);
                });
                row.addEventListener('mouseleave', () => {
                    this.hideTeamBattleTooltip();
                });
            });
        }
        
        modal.classList.add('show');
    }
    
    showTeamBattleTooltip(event, member, row) {
        const battleDate = row.dataset.battleDate;
        const battleTeam = row.dataset.battleTeam;
        
        if (!battleDate || !battleTeam) return;
        
        // 获取同团同场次的成员数据
        const battleData = Persistence.loadBattleData();
        if (!battleData || !battleData[battleDate]) return;
        
        const sameTeamMembers = battleData[battleDate].filter(b => b.team === battleTeam);
        if (sameTeamMembers.length === 0) return;
        
        // 创建工具提示
        const tooltip = document.createElement('div');
        tooltip.className = 'team-battle-tooltip';
        tooltip.style.cssText = `
            position: fixed;
            background: white;
            border: 2px solid var(--primary-color);
            border-radius: 8px;
            padding: 15px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.2);
            z-index: 10000;
            max-width: 600px;
            max-height: 400px;
            overflow-y: auto;
        `;
        
        // 按总伤害排序
        sameTeamMembers.sort((a, b) => {
            const aTotal = (a.damageToPlayer || 0) + (a.healing || 0) + (a.damageToBuilding || 0);
            const bTotal = (b.damageToPlayer || 0) + (b.healing || 0) + (b.damageToBuilding || 0);
            return bTotal - aTotal;
        });
        
        let tooltipHtml = `
            <div style="font-weight: 600; margin-bottom: 10px; font-size: 14px; color: var(--primary-color);">
                ${battleDate} - ${battleTeam} 同团数据
            </div>
            <div style="font-size: 12px; max-height: 300px; overflow-y: auto;">
                <table style="width: 100%; font-size: 11px; border-collapse: collapse;">
                    <thead>
                        <tr style="background: #f0f0f0;">
                            <th style="padding: 4px; text-align: left; border: 1px solid #ddd;">成员</th>
                            <th style="padding: 4px; text-align: center; border: 1px solid #ddd;">击败</th>
                            <th style="padding: 4px; text-align: center; border: 1px solid #ddd;">助攻</th>
                            <th style="padding: 4px; text-align: center; border: 1px solid #ddd;">伤害</th>
                            <th style="padding: 4px; text-align: center; border: 1px solid #ddd;">治疗</th>
                            <th style="padding: 4px; text-align: center; border: 1px solid #ddd;">建筑</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        
        sameTeamMembers.forEach(b => {
            const isCurrentMember = b.name === member.name;
            tooltipHtml += `
                <tr style="${isCurrentMember ? 'background: #fff3cd; font-weight: 600;' : ''}">
                    <td style="padding: 4px; border: 1px solid #ddd;">${b.name || '-'}</td>
                    <td style="padding: 4px; text-align: center; border: 1px solid #ddd;">${b.kills || 0}</td>
                    <td style="padding: 4px; text-align: center; border: 1px solid #ddd;">${b.assists || 0}</td>
                    <td style="padding: 4px; text-align: center; border: 1px solid #ddd;">${this.formatNumber(b.damageToPlayer || 0)}</td>
                    <td style="padding: 4px; text-align: center; border: 1px solid #ddd;">${this.formatNumber(b.healing || 0)}</td>
                    <td style="padding: 4px; text-align: center; border: 1px solid #ddd;">${this.formatNumber(b.damageToBuilding || 0)}</td>
                </tr>
            `;
        });
        
        tooltipHtml += `
                    </tbody>
                </table>
            </div>
        `;
        
        tooltip.innerHTML = tooltipHtml;
        document.body.appendChild(tooltip);
        
        // 定位工具提示
        const rect = row.getBoundingClientRect();
        tooltip.style.left = `${rect.right + 10}px`;
        tooltip.style.top = `${rect.top}px`;
        
        // 如果超出屏幕，调整位置
        setTimeout(() => {
            const tooltipRect = tooltip.getBoundingClientRect();
            if (tooltipRect.right > window.innerWidth) {
                tooltip.style.left = `${rect.left - tooltipRect.width - 10}px`;
            }
            if (tooltipRect.bottom > window.innerHeight) {
                tooltip.style.top = `${window.innerHeight - tooltipRect.height - 10}px`;
            }
        }, 0);
        
        // 保存工具提示引用
        this.currentTooltip = tooltip;
    }
    
    hideTeamBattleTooltip() {
        if (this.currentTooltip) {
            document.body.removeChild(this.currentTooltip);
            this.currentTooltip = null;
        }
    }

    formatNumber(num) {
        if (num >= 100000000) {
            return (num / 100000000).toFixed(2) + '亿';
        } else if (num >= 10000) {
            return (num / 10000).toFixed(2) + 'w';
        } else {
            return num.toString();
        }
    }

    showImportHistory() {
        const modal = document.getElementById('importHistoryModal');
        const listContainer = document.getElementById('importHistoryList');
        const countElement = document.getElementById('historyCount');
        
        const history = Persistence.getImportHistory();
        countElement.textContent = `共 ${history.length} 条记录`;
        
        if (history.length === 0) {
            listContainer.innerHTML = '<div class="empty-state"><p>暂无导入历史记录</p></div>';
        } else {
            let html = '<div class="history-list">';
            
            history.forEach(record => {
                const typeIcon = record.type === 'members' ? '👥' : '⚔️';
                const typeText = record.type === 'members' ? '成员数据' : '帮战数据';
                const dateTime = `${record.date} ${record.time || ''}`;
                
                let detailText = '';
                if (record.type === 'members') {
                    detailText = `导入 ${record.count} 名成员`;
                    if (record.duplicateCount > 0) {
                        detailText += `，跳过 ${record.duplicateCount} 名重复`;
                    }
                    if (record.totalMembers !== undefined) {
                        detailText += `，当前总数：${record.totalMembers}`;
                    }
                } else {
                    detailText = `导入 ${record.count} 条帮战数据`;
                    if (record.matchedCount !== undefined) {
                        detailText += `，匹配 ${record.matchedCount} 名成员`;
                    }
                    if (record.newMemberCount > 0) {
                        detailText += `，新建 ${record.newMemberCount} 名成员`;
                    }
                }
                
                html += `
                    <div class="history-item" data-record-id="${record.id}">
                        <div class="history-item-header">
                            <div class="history-item-icon">${typeIcon}</div>
                            <div class="history-item-info">
                                <div class="history-item-title">${typeText}</div>
                                <div class="history-item-meta">
                                    <span class="history-item-date">${dateTime}</span>
                                    <span class="history-item-file">${record.fileName || '未知文件'}</span>
                                </div>
                            </div>
                            <button class="btn btn-danger btn-sm history-delete-btn" 
                                    onclick="app.deleteHistoryRecord('${record.id}')" 
                                    title="删除此记录">
                                🗑️
                            </button>
                        </div>
                        <div class="history-item-detail">
                            ${detailText}
                        </div>
                    </div>
                `;
            });
            
            html += '</div>';
            listContainer.innerHTML = html;
        }
        
        modal.classList.add('show');
    }

    deleteHistoryRecord(recordId) {
        // 先获取要删除的记录信息
        const history = Persistence.getImportHistory();
        const record = history.find(r => String(r.id) === String(recordId));
        
        if (!record) {
            alert('未找到要删除的记录');
            return;
        }
        
        let confirmMsg = '确定要删除这条导入历史记录吗？';
        if (record.type === 'members') {
            confirmMsg = '⚠️ 警告：确定要删除这条成员数据导入记录吗？\n\n此操作将：\n- 删除导入历史记录\n- 清空所有成员数据\n- 清空所有团队数据（因为成员被清空）\n\n此操作不可恢复！';
        } else if (record.type === 'battle') {
            confirmMsg = '确定要删除这条帮战数据导入记录吗？\n\n此操作将删除该次导入的帮战数据。';
        }
        
        if (confirm(confirmMsg)) {
            // 删除导入历史记录
            if (Persistence.deleteImportHistory(recordId)) {
                // 如果是成员数据，同时清空成员数据和团队数据
                if (record.type === 'members') {
                    this.allMembers = [];
                    Persistence.saveMembers(this.allMembers);
                    
                    // 清空团队数据（因为成员被清空）
                    this.teams = [];
                    this.selectedTeam = null;
                    Persistence.saveTeams(this.teams);
                    
                    // 清空待调区
                    this.pendingMembers = [];
                    Persistence.savePendingMembers(this.pendingMembers);
                    
                    // 清空位置历史
                    Persistence.clearPositionHistory();
                    this.positionHistoryStack = [];
                    
                    // 清空成员数据导入时间
                    Persistence.saveMemberDataTime(0);
                    Persistence.saveLastImportDate('');
                    
                    // 刷新界面
                    this.refreshUI();
                } else if (record.type === 'battle') {
                    // 如果是帮战数据，清空帮战数据
                    Persistence.saveBattleData({});
                    
                    // 同时清空所有成员的帮战历史
                    this.allMembers.forEach(member => {
                        member.battleHistory = [];
                    });
                    Persistence.saveMembers(this.allMembers);
                    
                    // 刷新界面
                    this.refreshUI();
                }
                
                this.showImportHistory(); // 刷新列表
                alert('✅ 删除成功！');
            } else {
                alert('删除失败，请重试');
            }
        }
    }

    clearAllData() {
        // 开发测试用：清空所有数据
        const confirmMsg = '⚠️ 警告：此操作将清空所有数据！\n\n包括：\n- 所有成员数据\n- 所有团队数据\n- 所有模板数据\n- 所有导入历史\n\n此操作不可恢复！\n\n确定要继续吗？';
        
        if (confirm(confirmMsg)) {
            // 二次确认
            if (confirm('最后确认：真的要清空所有数据吗？')) {
                try {
                    // 清空所有 localStorage 数据
                    localStorage.removeItem(Persistence.STORAGE_KEY_MEMBERS);
                    localStorage.removeItem(Persistence.STORAGE_KEY_TEAMS);
                    localStorage.removeItem(Persistence.STORAGE_KEY_TEMPLATES);
                    localStorage.removeItem(Persistence.STORAGE_KEY_LAST_IMPORT_DATE);
                    localStorage.removeItem(Persistence.STORAGE_KEY_IMPORT_HISTORY);
                    localStorage.removeItem(Persistence.STORAGE_KEY_BATTLE_DATA);
                    localStorage.removeItem(Persistence.STORAGE_KEY_MEMBER_DATA_TIME);
                    localStorage.removeItem(Persistence.STORAGE_KEY_BATTLE_DATA);
                    localStorage.removeItem(Persistence.STORAGE_KEY_MEMBER_DATA_TIME);
                    
                    // 重置应用数据
                    this.teams = [];
                    this.allMembers = [];
                    this.templates = [];
                    this.selectedTeam = null;
                    this.selectedMember = null;
                    this.memberSearchText = '';
                    this.memberClassFilter = '';
                    
                    // 刷新界面
                    this.refreshUI();
                    
                    alert('✅ 所有数据已清空！');
                } catch (error) {
                    console.error('清空数据失败:', error);
                    alert('❌ 清空数据失败：' + error.message);
                }
            }
        }
    }

    refreshTeamDetail() {
        // 重新创建所有团队详情内容（因为小队布局需要重新计算）
        this.refreshTeamsTabs();
    }

    selectTeam(team) {
        this.selectedTeam = team;
        
        // 更新标签页状态
        document.querySelectorAll('.team-tab').forEach(tab => {
            if (tab.dataset.teamId === team.id) {
                tab.classList.add('active');
            } else {
                tab.classList.remove('active');
            }
        });
        
        // 更新内容区状态
        document.querySelectorAll('.team-detail-content').forEach(content => {
            if (content.dataset.teamId === team.id) {
                content.classList.add('active');
            } else {
                content.classList.remove('active');
            }
        });
    }

    handleImport() {
        // 显示导入类型选择对话框
        document.getElementById('importTypeModal').classList.add('show');
    }

    detectFileType(fileName) {
        const lowerName = fileName.toLowerCase();
        // 帮会联赛数据：包含 banghuiliansai 或 帮会联赛 或 帮战
        if (lowerName.includes('banghuiliansai') || lowerName.includes('帮会联赛') || lowerName.includes('帮战')) {
            return 'battle';
        }
        // 成员数据：包含 gerenxinxi 或 个人信息 或 成员
        if (lowerName.includes('gerenxinxi') || lowerName.includes('个人信息') || lowerName.includes('成员')) {
            return 'members';
        }
        // 默认根据文件内容判断（如果无法从文件名判断）
        return 'auto';
    }

    async handleFileSelect(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        try {
            // 根据文件名自动判断数据类型
            const fileType = this.detectFileType(file.name);
            
            if (fileType === 'battle') {
                // 导入帮战数据
                await this.importBattleData(file);
            } else if (fileType === 'members') {
                // 导入成员数据
                await this.importMemberData(file);
            } else {
                // 无法从文件名判断，尝试根据文件内容判断
                // 先尝试作为成员数据导入，如果失败再尝试帮战数据
                try {
                    await this.importMemberData(file);
                } catch (memberError) {
                    // 成员数据导入失败，尝试帮战数据
                    try {
                        await this.importBattleData(file);
                    } catch (battleError) {
                        throw new Error('无法识别文件类型，请确保文件名包含 "banghuiliansai"（帮战数据）或 "gerenxinxi"（成员数据）');
                    }
                }
            }
        } catch (error) {
            alert(`导入失败: ${error.message}\n\n提示：\n- 确保文件格式正确\n- 帮战数据文件名需包含 "banghuiliansai"\n- 成员数据文件名需包含 "gerenxinxi"`);
            console.error('导入错误详情:', error);
        }
        
        // 清空文件输入
        event.target.value = '';
    }

    async importMemberData(file) {
        let members = [];
        
        if (file.name.endsWith('.csv')) {
            members = await Importer.importCSV(file);
        } else {
            members = await Importer.importExcel(file);
        }
        
        if (members.length === 0) {
            alert('未找到有效数据。请检查文件格式：\n- Excel文件需要包含"名称"、"玩家"或"姓名"列\n- CSV文件需要包含表头');
            return;
        }
        
        // 检查是否已有成员数据，比较导入时间
        const currentTime = Date.now();
        const lastImportTime = Persistence.getMemberDataTime();
        
        if (lastImportTime > 0 && currentTime < lastImportTime) {
            // 如果当前文件时间更早，询问用户是否替换
            const shouldReplace = confirm(
                `检测到已有成员数据（导入时间：${new Date(lastImportTime).toLocaleString('zh-CN')}）\n\n` +
                `当前文件时间更早，是否替换为新的成员数据？\n\n` +
                `点击"确定"替换，点击"取消"保留现有数据`
            );
            
            if (!shouldReplace) {
                alert('已取消导入，保留现有成员数据');
                return;
            }
        }
        
        // 保存现有成员数据（用于保留分配信息和标记）
        const existingMembersMap = new Map();
        this.allMembers.forEach(m => {
            existingMembersMap.set(m.name, {
                assignedTeamId: m.assignedTeamId,
                squadIndex: m.squadIndex,
                slotIndex: m.slotIndex,
                isLeader: m.isLeader,
                isEye: m.isEye,
                isExpert: m.isExpert,
                isDataGood: m.isDataGood,
                isLocked: m.isLocked,
                battleHistory: m.battleHistory || []
            });
        });
        
        // 替换所有成员数据（只使用最新的一份）
        this.allMembers = members.map(m => {
            // 如果成员已存在，保留分配信息和标记
            const existing = existingMembersMap.get(m.name);
            if (existing) {
                m.assignedTeamId = existing.assignedTeamId;
                m.squadIndex = existing.squadIndex;
                m.slotIndex = existing.slotIndex;
                m.isLeader = existing.isLeader;
                m.isEye = existing.isEye;
                m.isExpert = existing.isExpert;
                m.isDataGood = existing.isDataGood;
                m.isLocked = existing.isLocked;
                // 保留帮战历史数据
                m.battleHistory = existing.battleHistory;
            }
            return m;
        });
        
        // 记录导入时间
        Persistence.saveMemberDataTime(currentTime);
        
        // 记录导入日期
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        Persistence.saveLastImportDate(today);
        
        // 记录导入历史
        const historyAdded = Persistence.addImportHistory({
            type: 'members',
            fileName: file.name,
            fileSize: file.size,
            date: today,
            time: new Date().toLocaleTimeString('zh-CN'),
            count: members.length,
            duplicateCount: 0,
            totalMembers: this.allMembers.length
        });
        
        if (!historyAdded) {
            console.warn('导入历史记录失败（可能是重复导入）');
        }
        
        this.saveData();
        this.refreshUI();
        
        alert(`成功导入 ${members.length} 名成员（已替换所有旧数据）`);
        
        // 导入后更新筛选选项
        this.updateClassFilter();
    }

    async importBattleData(file) {
        let battleDataList = [];
        
        if (file.name.endsWith('.csv')) {
            battleDataList = await Importer.importBattleCSV(file);
        } else {
            battleDataList = await Importer.importBattleExcel(file);
        }
        
        if (battleDataList.length === 0) {
            alert('未找到有效帮战数据。请检查文件格式：\n- 文件需要包含"玩家"列');
            return;
        }
        
        // 识别文件中的所有帮会
        const guilds = [...new Set(battleDataList.map(data => data.battleName).filter(name => name))];
        
        if (guilds.length > 1) {
            // 多个帮会，让用户选择
            this.showGuildSelectModal(file, battleDataList, guilds);
        } else {
            // 只有一个帮会或没有帮会信息，直接导入全部
            const selectedGuild = guilds.length === 1 ? guilds[0] : null;
            await this.processBattleDataImport(file, battleDataList, selectedGuild);
        }
    }
    
    async importBattleDataBatch(files) {
        if (files.length === 0) {
            alert('请选择至少一个文件');
            return;
        }
        
        console.log('[批量导入] 开始批量导入帮战数据，文件数:', files.length);
        
        let totalImported = 0;
        let totalSkipped = 0;
        let totalDuplicates = 0;
        const errors = [];
        
        // 加载现有的帮战数据，用于去重
        let battleDataMap = Persistence.loadBattleData();
        const existingBattleKeys = new Set(); // 用于快速查找重复数据
        
        // 构建现有数据的唯一键集合（玩家名+日期+帮会+团长）
        Object.values(battleDataMap).forEach(playerBattles => {
            playerBattles.forEach(battle => {
                const key = this.getBattleDataKey(battle);
                existingBattleKeys.add(key);
            });
        });
        
        // 遍历所有文件
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            console.log(`[批量导入] 处理文件 ${i + 1}/${files.length}: ${file.name}`);
            
            try {
                let battleDataList = [];
                
                if (file.name.endsWith('.csv')) {
                    battleDataList = await Importer.importBattleCSV(file);
                } else {
                    battleDataList = await Importer.importBattleExcel(file);
                }
                
                if (battleDataList.length === 0) {
                    errors.push(`${file.name}: 未找到有效数据`);
                    continue;
                }
                
                // 从文件名提取日期
                const fileDate = this.extractDateFromFileName(file.name);
                
                // 识别文件中的所有帮会
                const guilds = [...new Set(battleDataList.map(data => data.battleName).filter(name => name))];
                
                // 如果多个帮会，提示用户选择（批量导入时，对于多帮会文件，可以选择全部导入或跳过）
                if (guilds.length > 1) {
                    const shouldImportAll = confirm(
                        `文件 "${file.name}" 包含多个帮会数据：\n${guilds.join('、')}\n\n是否导入所有帮会数据？\n点击"确定"导入全部，点击"取消"跳过此文件。`
                    );
                    
                    if (!shouldImportAll) {
                        totalSkipped++;
                        continue;
                    }
                }
                
                // 处理每个帮会的数据
                for (const guild of guilds.length > 0 ? guilds : [null]) {
                    let filteredData = battleDataList;
                    if (guild) {
                        filteredData = battleDataList.filter(data => data.battleName === guild);
                    }
                    
                    // 去重处理
                    const { newData, duplicateCount } = this.filterDuplicateBattleData(
                        filteredData, 
                        existingBattleKeys, 
                        fileDate
                    );
                    
                    totalDuplicates += duplicateCount;
                    
                    if (newData.length === 0) {
                        console.log(`[批量导入] ${file.name} ${guild ? `(${guild})` : ''} 所有数据都是重复的，已跳过`);
                        continue;
                    }
                    
                    // 将帮战数据关联到成员
                    let matchedCount = 0;
                    
                    newData.forEach(battleData => {
                        const member = this.allMembers.find(m => m.name === battleData.playerName);
                        if (member) {
                            if (!member.battleHistory) {
                                member.battleHistory = [];
                            }
                            member.battleHistory.push(battleData);
                            matchedCount++;
                        }
                        
                        // 同时保存到帮战数据映射中
                        if (!battleDataMap[battleData.playerName]) {
                            battleDataMap[battleData.playerName] = [];
                        }
                        battleDataMap[battleData.playerName].push(battleData);
                        
                        // 添加到已存在集合中，避免后续重复
                        const key = this.getBattleDataKey(battleData);
                        existingBattleKeys.add(key);
                    });
                    
                    totalImported += newData.length;
                    
                    // 记录导入历史（批量导入时，每个文件单独记录）
                    const today = new Date().toISOString().split('T')[0];
                    const historyAdded = Persistence.addImportHistory({
                        type: 'battle',
                        fileName: file.name,
                        fileSize: file.size,
                        date: fileDate || today,
                        time: new Date().toLocaleTimeString('zh-CN'),
                        count: newData.length,
                        matchedCount: matchedCount,
                        duplicateCount: duplicateCount,
                        newMemberCount: 0,
                        guild: guild || '全部'
                    });
                    
                    console.log(`[批量导入] ${file.name} ${guild ? `(${guild})` : ''} 导入完成: 新增${newData.length}条, 重复${duplicateCount}条, 匹配${matchedCount}名成员`);
                }
            } catch (error) {
                console.error(`[批量导入] ${file.name} 导入失败:`, error);
                errors.push(`${file.name}: ${error.message}`);
            }
        }
        
        // 保存帮战数据到localStorage
        Persistence.saveBattleData(battleDataMap);
        
        // 保存成员数据（因为更新了battleHistory）
        this.saveData();
        this.refreshUI();
        
        // 显示导入结果
        let message = `✅ 批量导入完成！\n\n`;
        message += `成功导入: ${totalImported} 条数据\n`;
        message += `跳过重复: ${totalDuplicates} 条\n`;
        message += `跳过文件: ${totalSkipped} 个\n`;
        if (errors.length > 0) {
            message += `\n错误文件 (${errors.length} 个):\n${errors.slice(0, 5).join('\n')}${errors.length > 5 ? '\n...' : ''}`;
        }
        alert(message);
    }
    
    getBattleDataKey(battleData) {
        // 生成唯一键：玩家名+日期+帮会+团长
        // 用于判断是否为重复数据
        const date = battleData.date || '';
        const battleName = battleData.battleName || '';
        const team = battleData.team || '';
        const playerName = battleData.playerName || '';
        return `${playerName}|${date}|${battleName}|${team}`;
    }
    
    filterDuplicateBattleData(battleDataList, existingKeys, fileDate) {
        const newData = [];
        let duplicateCount = 0;
        
        battleDataList.forEach(battleData => {
            // 添加日期信息
            if (fileDate && !battleData.date) {
                battleData.date = fileDate;
            }
            
            // 检查是否重复
            const key = this.getBattleDataKey(battleData);
            if (existingKeys.has(key)) {
                duplicateCount++;
                console.log('[去重] 跳过重复数据:', key);
            } else {
                newData.push(battleData);
                existingKeys.add(key); // 添加到已存在集合中
            }
        });
        
        return { newData, duplicateCount };
    }

    showGuildSelectModal(file, battleDataList, guilds) {
        const modal = document.getElementById('guildSelectModal');
        const listContainer = document.getElementById('guildSelectList');
        
        listContainer.innerHTML = '';
        
        guilds.forEach(guild => {
            const count = battleDataList.filter(data => data.battleName === guild).length;
            const button = document.createElement('button');
            button.className = 'btn btn-primary';
            button.style.width = '100%';
            button.style.textAlign = 'left';
            button.style.padding = '12px 15px';
            button.innerHTML = `
                <div style="font-weight: 600; font-size: 16px; margin-bottom: 4px;">${guild}</div>
                <div style="font-size: 12px; color: rgba(255, 255, 255, 0.9);">${count} 条数据</div>
            `;
            button.addEventListener('click', async () => {
                modal.classList.remove('show');
                await this.processBattleDataImport(file, battleDataList, guild);
            });
            listContainer.appendChild(button);
        });
        
        modal.classList.add('show');
    }

    async processBattleDataImport(file, battleDataList, selectedGuild) {
        // 检查是否重复导入（帮战数据需要检查文件名+帮会+日期）
        const fileSize = file.size;
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        const history = Persistence.getImportHistory();
        const isDuplicate = history.some(h => 
            h.type === 'battle' &&
            h.fileName === file.name && 
            h.fileSize === fileSize &&
            h.date === today &&
            h.guild === (selectedGuild || '全部')
        );
        
        if (isDuplicate) {
            alert(`文件 "${file.name}" ${selectedGuild ? `（帮会：${selectedGuild}）` : ''} 今天已经导入过了，无法重复导入。\n\n如需重新导入，请删除导入历史记录后再试。`);
            return;
        }
        
        // 如果选择了帮会，只导入该帮会的数据
        let filteredData = battleDataList;
        if (selectedGuild) {
            filteredData = battleDataList.filter(data => data.battleName === selectedGuild);
        }
        
        if (filteredData.length === 0) {
            alert('所选帮会没有数据');
            return;
        }
        
        // 从文件名提取日期
        const fileDate = this.extractDateFromFileName(file.name);
        
        // 加载现有的帮战数据
        let battleDataMap = Persistence.loadBattleData();
        
        // 构建现有数据的唯一键集合（用于去重）
        const existingBattleKeys = new Set();
        Object.values(battleDataMap).forEach(playerBattles => {
            playerBattles.forEach(battle => {
                const key = this.getBattleDataKey(battle);
                existingBattleKeys.add(key);
            });
        });
        
        // 去重处理
        const { newData, duplicateCount } = this.filterDuplicateBattleData(
            filteredData, 
            existingBattleKeys, 
            fileDate
        );
        
        if (newData.length === 0) {
            alert(`所有数据都是重复的，已跳过导入。\n重复数据: ${duplicateCount} 条`);
            return;
        }
        
        // 将帮战数据关联到成员（仅更新现有成员的battleHistory，不创建新成员）
        let matchedCount = 0;
        
        newData.forEach(battleData => {
            const member = this.allMembers.find(m => m.name === battleData.playerName);
            if (member) {
                if (!member.battleHistory) {
                    member.battleHistory = [];
                }
                member.battleHistory.push(battleData);
                matchedCount++;
            }
            
            // 同时保存到帮战数据映射中（用于快速查找，不计入成员池）
            if (!battleDataMap[battleData.playerName]) {
                battleDataMap[battleData.playerName] = [];
            }
            battleDataMap[battleData.playerName].push(battleData);
            
            // 添加到已存在集合中，避免后续重复
            const key = this.getBattleDataKey(battleData);
            existingBattleKeys.add(key);
        });
        
        // 保存帮战数据到localStorage（单独存储，不计入成员池）
        Persistence.saveBattleData(battleDataMap);
        
        // 记录导入历史（帮战数据导入不更新成员数据导入日期）
        // today 变量已在上面声明，直接使用
        const historyAdded = Persistence.addImportHistory({
            type: 'battle',
            fileName: file.name,
            fileSize: file.size,
            date: today,
            time: new Date().toLocaleTimeString('zh-CN'),
            count: newData.length,
            matchedCount: matchedCount,
            duplicateCount: duplicateCount,
            newMemberCount: 0, // 不再创建新成员
            guild: selectedGuild || '全部'
        });
        
        if (!historyAdded) {
            console.warn('导入历史记录失败（可能是重复导入）');
        }
        
        this.saveData();
        this.refreshUI();
        
        let message = `✅ 导入完成！\n\n`;
        message += `成功导入: ${newData.length} 条数据\n`;
        if (duplicateCount > 0) {
            message += `跳过重复: ${duplicateCount} 条\n`;
        }
        message += `匹配成员: ${matchedCount} 名`;
        if (selectedGuild) {
            message += `\n帮会: ${selectedGuild}`;
        }
        message += `\n\n注意：帮战数据不计入成员池，仅用于查看历史数据`;
        alert(message);
    }

    extractDateFromFileName(fileName) {
        // 匹配格式：2025_12_05_20_21_50 或 2025-12-05
        const timePattern = /(\d{4})[_-](\d{1,2})[_-](\d{1,2})/;
        const match = fileName.match(timePattern);
        if (match) {
            const [, year, month, day] = match;
            return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        }
        return null;
    }

    handleAddTeam() {
        // 如果没有团队，显示创建团队选择对话框
        if (this.teams.length === 0) {
            this.openCreateTeamModal();
        } else {
            // 如果有团队，直接添加单个团队
            if (this.teams.length >= 5) {
                alert('最多只能创建5个团队');
                return;
            }
            
            this.openTeamModal();
        }
    }
    
    openCreateTeamModal() {
        const modal = document.getElementById('createTeamModal');
        modal.classList.add('show');
    }
    
    closeCreateTeamModal() {
        const modal = document.getElementById('createTeamModal');
        modal.classList.remove('show');
    }
    
    create4Teams() {
        this.closeCreateTeamModal();
        
        // 检查是否已有团队
        if (this.teams.length > 0) {
            alert('已有团队存在，无法使用快速创建功能');
            return;
        }
        
        // 创建4个团队：主攻、辅攻、防守、机动
        const teamConfigs = [
            { name: '主攻', templateName: '主攻团' },
            { name: '辅攻', templateName: '辅攻团' },
            { name: '防守', templateName: '防守团' },
            { name: '机动', templateName: '机动团' }
        ];
        
        teamConfigs.forEach(config => {
            const template = this.templates.find(t => t.name === config.templateName);
            const team = new Team(config.name, 30, template ? template.id : null);
            this.teams.push(team);
        });
        
        // 创建眼位团
        const eyeTeam = new Team('眼位团', 4, null);
        this.teams.push(eyeTeam);
        
        this.selectedTeam = this.teams[0];
        this.saveData();
        this.refreshUI();
    }
    
    create5Teams() {
        this.closeCreateTeamModal();
        
        // 检查是否已有团队
        if (this.teams.length > 0) {
            alert('已有团队存在，无法使用快速创建功能');
            return;
        }
        
        // 创建5个团队：进攻、中路、机动、防守、打野
        const teamConfigs = [
            { name: '进攻', templateName: '主攻团' },
            { name: '中路', templateName: '中路团' },
            { name: '机动', templateName: '机动团' },
            { name: '防守', templateName: '防守团' },
            { name: '打野', templateName: '打野团' }
        ];
        
        teamConfigs.forEach(config => {
            const template = this.templates.find(t => t.name === config.templateName);
            const team = new Team(config.name, 30, template ? template.id : null);
            this.teams.push(team);
        });
        
        // 创建眼位团
        const eyeTeam = new Team('眼位团', 4, null);
        this.teams.push(eyeTeam);
        
        this.selectedTeam = this.teams[0];
        this.saveData();
        this.refreshUI();
    }
    
    createCustomTeam() {
        this.closeCreateTeamModal();
        this.openTeamModal();
    }
    
    updateAddTeamButton() {
        const btnText = document.getElementById('btnAddTeamText');
        
        if (this.teams.length === 0) {
            btnText.textContent = '创建团队';
        } else {
            btnText.textContent = '添加团队';
        }
    }

    handleAllocate() {
        if (this.teams.length === 0) {
            alert('请先创建至少一个团队');
            return;
        }
        
        if (!this.selectedTeam) {
            alert('请先选择一个团队');
            return;
        }
        
        // 打开分配设置对话框
        this.openAllocateSettingsModal();
    }
    
    openAllocateSettingsModal() {
        const modal = document.getElementById('allocateSettingsModal');
        const maxMembersInput = document.getElementById('allocateMaxMembers');
        const suwenCountInput = document.getElementById('allocateSuwenCount');
        const leaderSearch = document.getElementById('allocateLeaderSearch');
        const leaderOptions = document.getElementById('allocateLeaderOptions');
        const leaderHidden = document.getElementById('allocateLeaderSelect');
        
        // 使用当前团队的人数上限作为默认值
        if (this.selectedTeam) {
            maxMembersInput.value = this.selectedTeam.maxMembers;
        }
        
        // 加载成员列表到团长搜索框
        leaderSearch.value = '';
        leaderHidden.value = '';
        leaderOptions.innerHTML = '';
        
        const availableMembers = this.allMembers.filter(m => !m.isEye && !m.isLocked);
        availableMembers.sort((a, b) => b.getPriorityScore() - a.getPriorityScore());
        
        // 创建datalist选项
        availableMembers.forEach(member => {
            const option = document.createElement('option');
            option.value = `${member.name} (${member.class})`;
            option.dataset.memberId = member.id;
            option.dataset.memberName = member.name;
            leaderOptions.appendChild(option);
        });
        
        // 如果成员已经是团长，默认显示
        const currentLeader = availableMembers.find(m => 
            m.isLeader && this.selectedTeam && this.selectedTeam.members.find(tm => tm.id === m.id)
        );
        if (currentLeader) {
            leaderSearch.value = `${currentLeader.name} (${currentLeader.class})`;
            leaderHidden.value = currentLeader.id;
        }
        
        // 移除旧的监听器（使用一次性事件处理，避免重复绑定）
        const handleSearchInput = (e) => {
            const searchValue = e.target.value.trim();
            if (!searchValue) {
                leaderHidden.value = '';
                return;
            }
            
            // 查找匹配的成员（完全匹配或部分匹配）
            const matchedMember = availableMembers.find(m => {
                const displayText = `${m.name} (${m.class})`;
                return displayText === searchValue || 
                       m.name.toLowerCase().includes(searchValue.toLowerCase()) ||
                       m.class.toLowerCase().includes(searchValue.toLowerCase());
            });
            
            if (matchedMember) {
                leaderHidden.value = matchedMember.id;
            } else {
                leaderHidden.value = '';
            }
        };
        
        const handleSearchChange = (e) => {
            const selectedValue = e.target.value;
            if (selectedValue) {
                const option = Array.from(leaderOptions.options).find(opt => opt.value === selectedValue);
                if (option && option.dataset.memberId) {
                    leaderHidden.value = option.dataset.memberId;
                }
            } else {
                leaderHidden.value = '';
            }
        };
        
        // 移除旧的事件监听器（如果存在）
        const newSearchInput = leaderSearch.cloneNode(true);
        leaderSearch.parentNode.replaceChild(newSearchInput, leaderSearch);
        
        // 重新获取元素并绑定事件
        const freshSearchInput = document.getElementById('allocateLeaderSearch');
        freshSearchInput.addEventListener('input', handleSearchInput);
        freshSearchInput.addEventListener('change', handleSearchChange);
        
        modal.classList.add('show');
    }
    
    closeAllocateSettingsModal() {
        const modal = document.getElementById('allocateSettingsModal');
        modal.classList.remove('show');
    }
    
    confirmAllocate() {
        try {
            console.log('[智能分配] 用户确认分配');
            
            const maxMembers = parseInt(document.getElementById('allocateMaxMembers').value) || 30;
            const suwenCount = parseInt(document.getElementById('allocateSuwenCount').value) || 0;
            const strategy = document.querySelector('input[name="allocateStrategy"]:checked').value;
            const leaderId = document.getElementById('allocateLeaderSelect').value || null;
            
            console.log('[智能分配] 分配参数:', { maxMembers, suwenCount, strategy, leaderId });
            
            if (maxMembers < 1) {
                alert('人数上限必须大于0');
                return;
            }
            
            if (suwenCount < 0) {
                alert('素问数量不能为负数');
                return;
            }
            
            if (suwenCount > maxMembers) {
                alert('素问数量不能超过人数上限');
                return;
            }
            
            // 更新团队人数上限
            this.selectedTeam.maxMembers = maxMembers;
            
            // 执行分配
            console.log('[智能分配] 调用分配算法...');
            Allocator.allocateSingleTeam(
                this.selectedTeam,
                this.allMembers,
                maxMembers,
                suwenCount,
                strategy,
                leaderId,
                this.squadsPerTeam,
                this.membersPerSquad
            );
            
            console.log('[智能分配] 分配完成，保存数据...');
            this.closeAllocateSettingsModal();
            this.saveData();
            this.refreshUI();
            console.log('[智能分配] 全部完成');
        } catch (error) {
            console.error('[智能分配] 分配过程中出现错误:', error);
            console.error('[智能分配] 错误堆栈:', error.stack);
            alert('分配过程中出现错误: ' + error.message + '\n\n请查看控制台获取详细信息');
            throw error;
        }
    }

    openTeamModal(team = null) {
        const modal = document.getElementById('teamEditModal');
        const title = document.getElementById('modalTitle');
        const nameInput = document.getElementById('teamNameInput');
        const maxInput = document.getElementById('maxMembersInput');
        const templateSelect = document.getElementById('templateSelect');
        
        if (team) {
            title.textContent = '编辑团队';
            nameInput.value = team.name;
            maxInput.value = team.maxMembers;
            this.editingTeam = team;
        } else {
            title.textContent = '添加团队';
            nameInput.value = `团队${this.teams.length + 1}`;
            maxInput.value = 30;
            this.editingTeam = null;
        }
        
        // 加载模板列表
        templateSelect.innerHTML = '<option value="">(无模板)</option>';
        this.templates.forEach(template => {
            const option = document.createElement('option');
            option.value = template.id;
            option.textContent = template.name;
            if (team && team.roleTemplateId === template.id) {
                option.selected = true;
            }
            templateSelect.appendChild(option);
        });
        
        this.updateTemplateDetail();
        modal.classList.add('show');
    }

    closeTeamModal() {
        document.getElementById('teamEditModal').classList.remove('show');
        this.editingTeam = null;
    }

    updateTemplateDetail() {
        const templateSelect = document.getElementById('templateSelect');
        const detailContainer = document.getElementById('templateDetail');
        const selectedId = templateSelect.value;
        
        if (!selectedId) {
            detailContainer.innerHTML = '<p style="color: #999; text-align: center;">未选择模板</p>';
            return;
        }
        
        const template = this.templates.find(t => t.id === selectedId);
        if (!template) return;
        
        let html = `<h4>模板: ${template.name} (共${template.totalMembers}人)</h4>`;
        const entries = Object.entries(template.classDistribution).sort((a, b) => b[1] - a[1]);
        
        entries.forEach(([className, count]) => {
            html += `<div class="template-detail-item">${className}: ${count}人</div>`;
        });
        
        detailContainer.innerHTML = html;
    }

    saveTeam() {
        const nameInput = document.getElementById('teamNameInput');
        const maxInput = document.getElementById('maxMembersInput');
        const templateSelect = document.getElementById('templateSelect');
        
        const name = nameInput.value.trim();
        if (!name) {
            alert('请输入团队名称');
            return;
        }
        
        const maxMembers = parseInt(maxInput.value) || 30;
        const templateId = templateSelect.value || null;
        
        if (this.editingTeam) {
            this.editingTeam.name = name;
            this.editingTeam.maxMembers = maxMembers;
            this.editingTeam.roleTemplateId = templateId;
        } else {
            const team = new Team(name, maxMembers, templateId);
            this.teams.push(team);
            this.selectedTeam = team;
            
            // 如果是首次创建团队，自动创建眼位团
            const hasEyeTeam = this.teams.some(t => t.name === '眼位团');
            if (!hasEyeTeam) {
                const eyeTeam = new Team('眼位团', 4, null);
                this.teams.push(eyeTeam);
            }
        }
        
        this.saveData();
        this.refreshUI();
        this.closeTeamModal();
    }

    editTeam(teamId) {
        const team = this.teams.find(t => t.id === teamId);
        if (team) {
            this.openTeamModal(team);
        }
    }

    deleteTeam(teamId) {
        if (!confirm('确定要删除这个团队吗？')) return;
        
        const team = this.teams.find(t => t.id === teamId);
        if (team) {
            console.log('[删除团队] 开始删除团队:', team.name, '成员数:', team.members.length);
            
            // 移除成员分配，清除所有位置信息
            team.members.forEach(m => {
                m.assignedTeamId = null;
                m.squadIndex = null;
                m.slotIndex = null;
                console.log('[删除团队] 释放成员:', m.name, '到成员池');
            });
            
            this.teams = this.teams.filter(t => t.id !== teamId);
            
            // 如果删除的是当前选中的团队，切换到其他团队
            if (this.selectedTeam?.id === teamId) {
                this.selectedTeam = this.teams.length > 0 ? this.teams[0] : null;
            }
            
            console.log('[删除团队] 团队已删除，当前团队数:', this.teams.length);
            console.log('[删除团队] 成员池成员数:', this.allMembers.filter(m => !m.assignedTeamId && !m.isEye).length);
            
            this.saveData();
            this.refreshUI();
        }
    }

    openTagModal(member) {
        const modal = document.getElementById('memberTagModal');
        const infoContainer = document.getElementById('memberInfo');
        const chkLeader = document.getElementById('chkLeader');
        const chkEye = document.getElementById('chkEye');
        const chkExpert = document.getElementById('chkExpert');
        const chkDataGood = document.getElementById('chkDataGood');
        const chkLocked = document.getElementById('chkLocked');
        
        this.editingMember = member;
        
        infoContainer.innerHTML = `
            <strong>${member.name}</strong> (${member.class}) - ${(member.power / 10000).toFixed(1)}w
        `;
        
        chkLeader.checked = member.isLeader;
        chkEye.checked = member.isEye;
        chkExpert.checked = member.isExpert;
        chkDataGood.checked = member.isDataGood;
        chkLocked.checked = member.isLocked;
        
        modal.classList.add('show');
    }

    closeTagModal() {
        document.getElementById('memberTagModal').classList.remove('show');
        this.editingMember = null;
    }

    saveMemberTag() {
        if (!this.editingMember) return;
        
        const chkLeader = document.getElementById('chkLeader');
        const chkEye = document.getElementById('chkEye');
        const chkExpert = document.getElementById('chkExpert');
        const chkDataGood = document.getElementById('chkDataGood');
        const chkLocked = document.getElementById('chkLocked');
        
        // 验证团长（每团只能有一个）
        if (chkLeader.checked && !this.editingMember.isLeader) {
            const currentTeam = this.editingMember.assignedTeamId ? 
                this.teams.find(t => t.id === this.editingMember.assignedTeamId) : null;
            
            if (currentTeam) {
                const existingLeader = currentTeam.getLeader();
                if (existingLeader && existingLeader.id !== this.editingMember.id) {
                    alert(`该团队已有团长: ${existingLeader.name}`);
                    return;
                }
            }
        }
        
        this.editingMember.isLeader = chkLeader.checked;
        this.editingMember.isEye = chkEye.checked;
        this.editingMember.isExpert = chkExpert.checked;
        this.editingMember.isDataGood = chkDataGood.checked;
        this.editingMember.isLocked = chkLocked.checked;
        
        this.saveData();
        this.refreshUI();
        this.closeTagModal();
    }

    assignMemberToTeam(member, team, targetSquad = null, targetSlot = null) {
        if (member.isLocked) {
            alert('该成员已锁定，无法重新分配');
            return;
        }
        
        // 从原团队移除
        const oldTeam = this.teams.find(t => t.members.find(m => m.id === member.id));
        if (oldTeam) {
            oldTeam.removeMember(member);
            // 清除位置信息
            member.squadIndex = null;
            member.slotIndex = null;
        }
        
        // 添加到新团队
        if (team.addMember(member)) {
            // 如果指定了目标小队和槽位，设置位置信息
            if (targetSquad && targetSlot) {
                // 检查目标槽位是否已有成员
                const existingMember = team.members.find(m => 
                    m.id !== member.id && 
                    m.squadIndex === targetSquad && 
                    m.slotIndex === targetSlot
                );
                
                if (existingMember) {
                    // 交换位置
                    const oldSquad = member.squadIndex;
                    const oldSlot = member.slotIndex;
                    member.squadIndex = targetSquad;
                    member.slotIndex = targetSlot;
                    existingMember.squadIndex = oldSquad;
                    existingMember.slotIndex = oldSlot;
                } else {
                    member.squadIndex = targetSquad;
                    member.slotIndex = targetSlot;
                }
            }
            
            this.saveData();
            this.refreshUI();
        } else {
            alert('团队已满或成员已在团队中');
        }
    }

    removeMemberFromTeam(memberId) {
        const member = this.allMembers.find(m => m.id === memberId);
        if (!member) return;
        
        const team = this.teams.find(t => t.members.find(m => m.id === memberId));
        if (team) {
            team.removeMember(member);
            // 清除位置信息
            member.squadIndex = null;
            member.slotIndex = null;
            this.saveData();
            // 立即更新团队人数显示
            this.updateAllTeamTabCounts();
            this.refreshUI();
        }
    }
    
    async exportTeam(teamId) {
        const team = this.teams.find(t => t.id === teamId);
        if (!team) {
            alert('团队不存在');
            return;
        }
        
        // 保存当前团队ID，用于后续操作
        this.exportingTeamId = teamId;
        this.exportingScope = 'current'; // 默认导出当前团
        
        // 显示导出选项对话框
        this.openExportOptionsModal();
    }
    
    openExportOptionsModal() {
        const modal = document.getElementById('exportOptionsModal');
        
        // 重置单选按钮
        const currentRadio = modal.querySelector('input[value="current"]');
        const allRadio = modal.querySelector('input[value="all"]');
        if (currentRadio) currentRadio.checked = true;
        if (allRadio) allRadio.checked = false;
        this.exportingScope = 'current';
        
        modal.classList.add('show');
        
        // 绑定事件（如果还没有绑定）
        if (!modal.dataset.bound) {
            modal.dataset.bound = 'true';
            
            document.getElementById('exportOptionsClose').addEventListener('click', () => {
                this.closeExportOptionsModal();
            });
            
            document.getElementById('btnCancelExport').addEventListener('click', () => {
                this.closeExportOptionsModal();
            });
            
            // 监听导出范围选择
            modal.querySelectorAll('input[name="exportScope"]').forEach(radio => {
                radio.addEventListener('change', (e) => {
                    this.exportingScope = e.target.value;
                });
            });
            
            document.getElementById('btnExportImage').addEventListener('click', async () => {
                await this.handleExportImage();
            });
            
            document.getElementById('btnCopyText').addEventListener('click', async () => {
                await this.handleCopyText();
            });
            
            modal.addEventListener('click', (e) => {
                if (e.target.id === 'exportOptionsModal') {
                    this.closeExportOptionsModal();
                }
            });
        }
    }
    
    closeExportOptionsModal() {
        const modal = document.getElementById('exportOptionsModal');
        modal.classList.remove('show');
    }
    
    async handleExportImage() {
        const teamsToExport = this.getTeamsToExport();
        if (teamsToExport.length === 0) {
            alert('没有可导出的团队');
            return;
        }
        
        this.closeExportOptionsModal();
        
        try {
            // 保存配比数据
            this.saveTeamHistoryData(teamsToExport);
            
            // 生成文字版本（用于备用）
            const textContent = this.generateTeamsTextExport(teamsToExport);
            
            // 生成并下载图片
            await this.generateTeamsImageExport(teamsToExport, textContent);
        } catch (error) {
            console.error('导出图片失败:', error);
            alert('导出图片失败: ' + error.message);
        }
    }
    
    async handleCopyText() {
        const teamsToExport = this.getTeamsToExport();
        if (teamsToExport.length === 0) {
            alert('没有可导出的团队');
            return;
        }
        
        try {
            // 保存配比数据
            this.saveTeamHistoryData(teamsToExport);
            
            // 生成文字版本
            const textContent = this.generateTeamsTextExport(teamsToExport);
            
            // 复制到剪贴板
            await navigator.clipboard.writeText(textContent);
            
            this.closeExportOptionsModal();
            alert('✅ 文本已复制到剪贴板，可以直接粘贴到微信！');
        } catch (error) {
            console.error('复制失败:', error);
            // 降级方案：使用传统方法
            try {
                const textArea = document.createElement('textarea');
                textArea.value = this.generateTeamsTextExport(teamsToExport);
                textArea.style.position = 'fixed';
                textArea.style.left = '-9999px';
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
                
                this.closeExportOptionsModal();
                alert('✅ 文本已复制到剪贴板，可以直接粘贴到微信！');
            } catch (fallbackError) {
                console.error('降级复制也失败:', fallbackError);
                const textContent = this.generateTeamsTextExport(teamsToExport);
                alert('复制失败，请手动复制文本。\n\n' + textContent);
            }
        }
    }
    
    getTeamsToExport() {
        if (this.exportingScope === 'all') {
            return [...this.teams];
        } else {
            const team = this.teams.find(t => t.id === this.exportingTeamId);
            return team ? [team] : [];
        }
    }
    
    saveTeamHistoryData(teams) {
        // 保存团队配比数据到历史记录
        const teamData = {
            name: teams.length === 1 ? teams[0].name : '全部团队',
            teams: teams.map(team => {
                // 构建成员数据
                const membersData = team.members.map(m => ({
                    id: m.id,
                    name: m.name,
                    class: m.class,
                    power: m.power,
                    squadIndex: m.squadIndex,
                    slotIndex: m.slotIndex,
                    isLeader: m.isLeader,
                    isExpert: m.isExpert,
                    isDataGood: m.isDataGood,
                    isLocked: m.isLocked
                }));
                
                // 构建小队数据（根据squadIndex和slotIndex重建）
                const squadsData = [];
                for (let i = 1; i <= this.squadsPerTeam; i++) {
                    const squadMembers = this.getSquadMembers(team, i);
                    squadsData.push({
                        members: squadMembers.map(m => ({
                            id: m.id,
                            name: m.name,
                            class: m.class,
                            power: m.power
                        }))
                    });
                }
                
                return {
                    id: team.id,
                    name: team.name,
                    maxMembers: team.maxMembers,
                    members: membersData,
                    squads: squadsData
                };
            })
        };
        
        const historyId = Persistence.saveTeamHistory(teamData);
        if (historyId) {
            console.log('[保存历史配比] 已保存配比数据，ID:', historyId);
        }
    }
    
    generateTeamsTextExport(teams) {
        let text = '';
        
        teams.forEach((team, index) => {
            if (index > 0) text += '\n\n';
            text += this.generateTeamTextExport(team);
        });
        
        return text;
    }
    
    async generateTeamsImageExport(teams, textContent) {
        // 对于多个团队，生成多个图片或合并为一个
        if (teams.length === 1) {
            await this.generateTeamImageExport(teams[0], textContent);
        } else {
            // 多个团队，逐个导出或合并
            for (const team of teams) {
                await this.generateTeamImageExport(team, this.generateTeamTextExport(team));
            }
        }
    }
    
    generateTeamTextExport(team) {
        const currentDist = team.getClassDistribution();
        const classStats = Object.entries(currentDist)
            .filter(([className, count]) => count > 0)
            .sort((a, b) => b[1] - a[1])
            .map(([className, count]) => `${className}×${count}`)
            .join('、');
        
        let text = `【${team.name}】配比信息\n`;
        text += `总人数：${team.currentCount}/${team.maxMembers}\n`;
        text += `职业分布：${classStats || '暂无'}\n\n`;
        
        // 按小队输出
        for (let i = 1; i <= this.squadsPerTeam; i++) {
            const squadMembers = this.getSquadMembers(team, i);
            if (squadMembers.length > 0) {
                text += `【${i}小队】\n`;
                squadMembers.sort((a, b) => (a.slotIndex || 999) - (b.slotIndex || 999));
                squadMembers.forEach((member, idx) => {
                    const slot = member.slotIndex || idx + 1;
                    const tags = member.getTagsDisplay();
                    text += `${slot}号位：${member.name}（${member.class}）${tags ? tags : ''} ${(member.power / 10000).toFixed(1)}w\n`;
                });
                text += '\n';
            }
        }
        
        return text;
    }
    
    async generateTeamImageExport(team, textContent) {
        // 创建导出用的临时容器
        const exportContainer = document.createElement('div');
        exportContainer.style.cssText = `
            position: absolute;
            left: -9999px;
            width: 800px;
            background: white;
            padding: 30px;
            font-family: 'Microsoft YaHei', Arial, sans-serif;
        `;
        
        const currentDist = team.getClassDistribution();
        const classStats = Object.entries(currentDist)
            .filter(([className, count]) => count > 0)
            .sort((a, b) => b[1] - a[1])
            .map(([className, count]) => `${className}×${count}`)
            .join('、');
        
        // 职业颜色映射（用于导出）
        const classColors = {
            '神相': '#3958a5',
            '玄机': '#b2a969',
            '素问': '#ffa9c6',
            '铁衣': '#d86f0a',
            '血河': '#aa2631',
            '九灵': '#a520ad',
            '龙吟': '#44b588',
            '碎梦': '#18b2e7',
            '潮光': '#84cbf7',
            '云瑶': '#dc3545',
            '鸿音': '#deb344',
            '荒羽': '#9f96ce',
            '沧澜': '#1E90FF',
            '补位': '#e0e0e0'
        };
        
        let html = `
            <style>
                .export-member-card {
                    margin-bottom: 5px;
                    padding: 8px 10px;
                    border-radius: 4px;
                    color: white;
                    font-size: 14px;
                    line-height: 1.5;
                }
            </style>
            <div style="border: 2px solid #333; border-radius: 8px; padding: 20px;">
                <h2 style="margin: 0 0 15px 0; color: #333; font-size: 24px;">${team.name}</h2>
                <div style="margin-bottom: 20px; padding: 15px; background: #f0f7ff; border-radius: 6px;">
                    <div style="font-size: 16px; margin-bottom: 8px;"><strong>总人数：</strong>${team.currentCount}/${team.maxMembers}</div>
                    <div style="font-size: 16px;"><strong>职业分布：</strong>${classStats || '暂无'}</div>
                </div>
                <div style="display: grid; grid-template-columns: repeat(${this.squadsPerTeam}, 1fr); gap: 15px;">
        `;
        
        // 按小队输出
        for (let i = 1; i <= this.squadsPerTeam; i++) {
            const squadMembers = this.getSquadMembers(team, i);
            squadMembers.sort((a, b) => (a.slotIndex || 999) - (b.slotIndex || 999));
            
            html += `
                <div style="border: 1px solid #ddd; border-radius: 6px; padding: 15px; background: #fafafa;">
                    <h3 style="margin: 0 0 10px 0; font-size: 18px; color: #333;">${i}小队</h3>
                    <div style="font-size: 14px; line-height: 1.8;">
            `;
            
            for (let slot = 1; slot <= this.membersPerSquad; slot++) {
                const member = squadMembers.find(m => m.slotIndex === slot);
                if (member) {
                    const tags = member.getTagsDisplay();
                    const memberColor = classColors[member.class] || classColors['补位'];
                    const textColor = member.class === '素问' || member.class === '鸿音' ? '#8b4c6b' : 'white';
                    html += `
                        <div class="export-member-card" style="background: ${memberColor}; color: ${textColor};">
                            <strong>${slot}号位：</strong>${member.name}（${member.class}）${tags ? tags : ''} ${(member.power / 10000).toFixed(1)}w
                        </div>
                    `;
                } else {
                    html += `
                        <div style="margin-bottom: 5px; padding: 8px 10px; background: #f5f5f5; border-radius: 4px; color: #999; font-size: 14px;">
                            <strong>${slot}号位：</strong>空
                        </div>
                    `;
                }
            }
            
            html += `
                    </div>
                </div>
            `;
        }
        
        html += `
                </div>
            </div>
        `;
        
        exportContainer.innerHTML = html;
        document.body.appendChild(exportContainer);
        
        try {
            // 检查html2canvas是否可用
            if (typeof html2canvas === 'undefined') {
                throw new Error('html2canvas库未加载，仅导出文字版本');
            }
            
            // 使用html2canvas生成图片
            const canvas = await html2canvas(exportContainer, {
                backgroundColor: '#ffffff',
                scale: 2,
                logging: false
            });
            
            // 下载图片
            const link = document.createElement('a');
            link.download = `${team.name}_配比_${new Date().toISOString().split('T')[0]}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
            
            alert('✅ 图片导出成功！');
        } catch (error) {
            console.error('生成图片失败:', error);
            alert('⚠️ 图片导出失败: ' + error.message + '\n\n请尝试使用"复制文本到微信"功能。');
        } finally {
            document.body.removeChild(exportContainer);
        }
    }
    
    showHistoryTeams() {
        const modal = document.getElementById('historyTeamsModal');
        const content = document.getElementById('historyTeamsContent');
        
        const history = Persistence.getTeamHistory();
        
        if (history.length === 0) {
            content.innerHTML = '<div class="empty-state"><p>暂无历史配比</p><p style="margin-top: 10px; font-size: 12px; color: #999;">导出配比时会自动保存</p></div>';
        } else {
            // 按时间倒序排列
            const sortedHistory = [...history].sort((a, b) => {
                if (a.saveTime && b.saveTime) {
                    return new Date(b.saveTime) - new Date(a.saveTime);
                }
                return 0;
            });
            
            let html = '<div style="display: flex; flex-direction: column; gap: 10px;">';
            
            sortedHistory.forEach(record => {
                html += `
                    <div class="history-team-item" style="border: 2px solid var(--border-color); border-radius: 8px; padding: 15px; background: white;">
                        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 10px;">
                            <div>
                                <div style="font-weight: 600; font-size: 16px; margin-bottom: 5px;">${record.name}</div>
                                <div style="font-size: 12px; color: #999;">${record.saveTimeDisplay || '未知时间'}</div>
                                <div style="font-size: 12px; color: #666; margin-top: 5px;">${record.teams?.length || 0} 个团队</div>
                            </div>
                            <div style="display: flex; gap: 8px;">
                                <button class="btn btn-primary" onclick="app.loadHistoryTeam('${record.id}')" style="padding: 6px 12px; font-size: 12px;">加载</button>
                                <button class="btn btn-danger" onclick="app.deleteHistoryTeam('${record.id}')" style="padding: 6px 12px; font-size: 12px;">删除</button>
                            </div>
                        </div>
                    </div>
                `;
            });
            
            html += '</div>';
            content.innerHTML = html;
        }
        
        // 绑定事件（如果还没有绑定）
        if (!modal.dataset.bound) {
            modal.dataset.bound = 'true';
            
            document.getElementById('historyTeamsClose').addEventListener('click', () => {
                modal.classList.remove('show');
            });
            
            document.getElementById('btnCancelHistoryTeams').addEventListener('click', () => {
                modal.classList.remove('show');
            });
            
            document.getElementById('btnClearHistoryTeams').addEventListener('click', () => {
                if (confirm('确定要清空所有历史配比吗？此操作不可恢复！')) {
                    Persistence.clearTeamHistory();
                    this.showHistoryTeams(); // 刷新列表
                    alert('✅ 已清空所有历史配比');
                }
            });
            
            modal.addEventListener('click', (e) => {
                if (e.target.id === 'historyTeamsModal') {
                    modal.classList.remove('show');
                }
            });
        }
        
        modal.classList.add('show');
    }
    
    loadHistoryTeam(historyId) {
        const history = Persistence.getTeamHistory();
        const record = history.find(h => String(h.id) === String(historyId));
        
        if (!record) {
            alert('历史配比不存在');
            return;
        }
        
        if (confirm(`确定要加载历史配比 "${record.name}" 吗？\n\n此操作将替换当前的团队配置！`)) {
            // 清除当前团队
            this.teams.forEach(team => {
                team.members.forEach(m => {
                    m.assignedTeamId = null;
                    m.squadIndex = null;
                    m.slotIndex = null;
                });
            });
            
            // 加载历史配比
            this.teams = [];
            
            record.teams.forEach(teamData => {
                const team = new Team(teamData.name, teamData.maxMembers);
                team.id = teamData.id;
                
                // 恢复成员分配
                teamData.members.forEach(memberData => {
                    const member = this.allMembers.find(m => m.id === memberData.id);
                    if (member) {
                        // 恢复成员属性
                        member.squadIndex = memberData.squadIndex;
                        member.slotIndex = memberData.slotIndex;
                        member.isLeader = memberData.isLeader || false;
                        member.isExpert = memberData.isExpert || false;
                        member.isDataGood = memberData.isDataGood || false;
                        member.isLocked = memberData.isLocked || false;
                        
                        // 添加到团队
                        team.addMember(member);
                        member.assignedTeamId = team.id;
                    }
                });
                
                this.teams.push(team);
            });
            
            // 保存并刷新
            this.saveData();
            this.refreshUI();
            
            // 关闭对话框
            document.getElementById('historyTeamsModal').classList.remove('show');
            
            alert(`✅ 已加载历史配比 "${record.name}"`);
        }
    }
    
    deleteHistoryTeam(historyId) {
        if (confirm('确定要删除这条历史配比吗？')) {
            if (Persistence.deleteTeamHistory(historyId)) {
                this.showHistoryTeams(); // 刷新列表
            } else {
                alert('删除失败，请重试');
            }
        }
    }
}

// 初始化应用
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new App();
});


