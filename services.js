// 业务服务

// 数据导入服务
class Importer {
    static importExcel(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                    const jsonData = XLSX.utils.sheet_to_json(firstSheet);
                    
                    const members = Importer.parseData(jsonData);
                    resolve(members);
                } catch (error) {
                    reject(error);
                }
            };
            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
        });
    }

    static importCSV(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const text = e.target.result;
                    const lines = text.split('\n').filter(line => line.trim());
                    if (lines.length < 2) {
                        reject(new Error('CSV文件至少需要表头和一行数据'));
                        return;
                    }
                    
                    const headers = Importer.parseCSVLine(lines[0]);
                    const members = [];
                    
                    for (let i = 1; i < lines.length; i++) {
                        const fields = Importer.parseCSVLine(lines[i]);
                        if (fields.length === 0) continue;
                        
                        const member = Importer.parseRow(headers, fields);
                        if (member) members.push(member);
                    }
                    
                    resolve(members);
                } catch (error) {
                    reject(error);
                }
            };
            reader.onerror = reject;
            reader.readAsText(file, 'UTF-8');
        });
    }

    static parseCSVLine(line) {
        const fields = [];
        let currentField = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            
            if (char === '"') {
                if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
                    currentField += '"';
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (char === ',' && !inQuotes) {
                fields.push(currentField.trim());
                currentField = '';
            } else {
                currentField += char;
            }
        }
        
        fields.push(currentField.trim());
        return fields;
    }

    static parseData(jsonData) {
        if (!jsonData || jsonData.length === 0) return [];
        
        // 查找列索引
        const firstRow = jsonData[0];
        const keys = Object.keys(firstRow);
        
        // 扩展姓名列识别（支持：名称、玩家、姓名、名字、name、成员）
        const nameKey = keys.find(k => {
            const lowerKey = k.toLowerCase();
            return ['名称', '玩家', '姓名', '名字', 'name', '成员', '玩家名', '角色名'].some(keyword => 
                lowerKey === keyword.toLowerCase() || lowerKey.includes(keyword.toLowerCase())
            );
        });
        
        // 扩展职业列识别
        const classKey = keys.find(k => {
            const lowerKey = k.toLowerCase();
            return ['职业', 'class', '门派', '职业类型'].some(keyword => 
                lowerKey === keyword.toLowerCase() || lowerKey.includes(keyword.toLowerCase())
            );
        });
        
        // 扩展战力列识别（支持：总战力、战力、power、战斗力、战力值）
        const powerKey = keys.find(k => {
            const lowerKey = k.toLowerCase();
            return ['总战力', '战力', 'power', '战斗力', '战力值', '总战斗力'].some(keyword => 
                lowerKey === keyword.toLowerCase() || lowerKey.includes(keyword.toLowerCase())
            );
        });
        
        // 扩展备注列识别
        const notesKey = keys.find(k => {
            const lowerKey = k.toLowerCase();
            return ['备注', 'notes', '说明', '标记', '职位', '分堂'].some(keyword => 
                lowerKey === keyword.toLowerCase() || lowerKey.includes(keyword.toLowerCase())
            );
        });
        
        if (!nameKey) {
            // 尝试显示所有可用的列名，帮助用户了解文件格式
            const availableKeys = keys.join('、');
            throw new Error(`未找到姓名列。可用列名：${availableKeys}\n请确保文件包含"名称"、"玩家"或"姓名"列`);
        }
        
        const members = [];
        jsonData.forEach((row, index) => {
            const name = row[nameKey]?.toString().trim();
            if (!name) return;
            
            const className = classKey ? (row[classKey]?.toString().trim() || '') : '';
            const powerStr = powerKey ? (row[powerKey]?.toString().trim() || '0') : '0';
            
            // 备注可以包含多个字段
            let notes = '';
            if (notesKey) {
                notes = row[notesKey]?.toString().trim() || '';
            }
            // 如果有其他有用的列，也可以添加到备注
            if (classKey && row['分堂']) {
                notes = (notes ? notes + ' | ' : '') + '分堂:' + row['分堂'];
            }
            if (row['所在团长']) {
                notes = (notes ? notes + ' | ' : '') + '团长:' + row['所在团长'];
            }
            
            const normalizedClass = normalizeClassName(className);
            const power = parsePower(powerStr);
            
            members.push(new Member(name, normalizedClass, power, notes));
        });
        
        return members;
    }

    static importBattleCSV(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const text = e.target.result;
                    const lines = text.split('\n').filter(line => line.trim());
                    if (lines.length < 2) {
                        reject(new Error('CSV文件至少需要表头和一行数据'));
                        return;
                    }
                    
                    const headers = Importer.parseCSVLine(lines[0]);
                    const battleDataList = [];
                    
                    for (let i = 1; i < lines.length; i++) {
                        const fields = Importer.parseCSVLine(lines[i]);
                        if (fields.length === 0) continue;
                        
                        const battleData = Importer.parseBattleRow(headers, fields);
                        if (battleData) {
                            battleDataList.push(battleData);
                        }
                    }
                    
                    resolve(battleDataList);
                } catch (error) {
                    reject(error);
                }
            };
            reader.onerror = reject;
            reader.readAsText(file, 'UTF-8');
        });
    }

    static importBattleExcel(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                    const jsonData = XLSX.utils.sheet_to_json(firstSheet);
                    
                    const battleDataList = [];
                    jsonData.forEach(row => {
                        const battleData = Importer.parseBattleData(row);
                        if (battleData) {
                            battleDataList.push(battleData);
                        }
                    });
                    
                    resolve(battleDataList);
                } catch (error) {
                    reject(error);
                }
            };
            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
        });
    }

    static parseBattleRow(headers, fields) {
        // 查找玩家列
        const playerIndex = headers.findIndex(h => {
            const lowerH = h.toLowerCase();
            return ['玩家', '名称', '姓名', '名字', 'name', '成员'].some(keyword => 
                lowerH === keyword.toLowerCase() || lowerH.includes(keyword.toLowerCase())
            );
        });
        
        if (playerIndex === -1 || playerIndex >= fields.length) return null;
        
        const playerName = fields[playerIndex]?.trim();
        if (!playerName) return null;
        
        // 解析帮战数据
        const battleData = {
            playerName: playerName,
            class: this.findField(headers, fields, ['职业', 'class', '门派']) || '',
            battleName: this.findField(headers, fields, ['帮会名', '帮会', 'battleName']) || '',
            team: this.findField(headers, fields, ['所在团长', '团长', 'team']) || '',
            kills: this.parseIntField(headers, fields, ['击败', 'kills', '击杀']) || 0,
            assists: this.parseIntField(headers, fields, ['助攻', 'assists']) || 0,
            damageToPlayer: this.parseIntField(headers, fields, ['对玩家伤害', 'damageToPlayer', '玩家伤害']) || 0,
            damageToBuilding: this.parseIntField(headers, fields, ['对建筑伤害', 'damageToBuilding', '建筑伤害']) || 0,
            healing: this.parseIntField(headers, fields, ['治疗值', 'healing', '治疗']) || 0,
            damageTaken: this.parseIntField(headers, fields, ['承受伤害', 'damageTaken', '受到伤害']) || 0,
            deaths: this.parseIntField(headers, fields, ['重伤', 'deaths', '死亡']) || 0,
            control: this.parseIntField(headers, fields, ['控制', 'control']) || 0
        };
        
        return battleData;
    }

    static parseBattleData(row) {
        const playerName = this.findFieldInObject(row, ['玩家', '名称', '姓名', '名字', 'name', '成员']);
        if (!playerName) return null;
        
        return {
            playerName: playerName.toString().trim(),
            class: this.findFieldInObject(row, ['职业', 'class', '门派']) || '',
            battleName: this.findFieldInObject(row, ['帮会名', '帮会', 'battleName']) || '',
            team: this.findFieldInObject(row, ['所在团长', '团长', 'team']) || '',
            kills: this.parseIntFieldInObject(row, ['击败', 'kills', '击杀']) || 0,
            assists: this.parseIntFieldInObject(row, ['助攻', 'assists']) || 0,
            damageToPlayer: this.parseIntFieldInObject(row, ['对玩家伤害', 'damageToPlayer', '玩家伤害']) || 0,
            damageToBuilding: this.parseIntFieldInObject(row, ['对建筑伤害', 'damageToBuilding', '建筑伤害']) || 0,
            healing: this.parseIntFieldInObject(row, ['治疗值', 'healing', '治疗']) || 0,
            damageTaken: this.parseIntFieldInObject(row, ['承受伤害', 'damageTaken', '受到伤害']) || 0,
            deaths: this.parseIntFieldInObject(row, ['重伤', 'deaths', '死亡']) || 0,
            control: this.parseIntFieldInObject(row, ['控制', 'control']) || 0
        };
    }

    static findField(headers, fields, keywords) {
        const index = headers.findIndex(h => {
            const lowerH = h.toLowerCase();
            return keywords.some(keyword => 
                lowerH === keyword.toLowerCase() || lowerH.includes(keyword.toLowerCase())
            );
        });
        return index >= 0 && index < fields.length ? (fields[index]?.trim() || '') : '';
    }

    static parseIntField(headers, fields, keywords) {
        const value = this.findField(headers, fields, keywords);
        if (!value) return 0;
        // 移除逗号等分隔符
        const numStr = value.toString().replace(/,/g, '').trim();
        return parseInt(numStr) || 0;
    }

    static findFieldInObject(row, keywords) {
        const keys = Object.keys(row);
        const key = keys.find(k => {
            const lowerK = k.toLowerCase();
            return keywords.some(keyword => 
                lowerK === keyword.toLowerCase() || lowerK.includes(keyword.toLowerCase())
            );
        });
        return key ? row[key] : null;
    }

    static parseIntFieldInObject(row, keywords) {
        const value = this.findFieldInObject(row, keywords);
        if (!value) return 0;
        const numStr = value.toString().replace(/,/g, '').trim();
        return parseInt(numStr) || 0;
    }

    static parseRow(headers, fields) {
        // 扩展姓名列识别
        const nameIndex = headers.findIndex(h => {
            const lowerH = h.toLowerCase();
            return ['名称', '玩家', '姓名', '名字', 'name', '成员', '玩家名', '角色名'].some(keyword => 
                lowerH === keyword.toLowerCase() || lowerH.includes(keyword.toLowerCase())
            );
        });
        
        if (nameIndex === -1 || nameIndex >= fields.length) return null;
        
        const name = fields[nameIndex]?.trim();
        if (!name) return null;
        
        // 扩展职业列识别
        const classIndex = headers.findIndex(h => {
            const lowerH = h.toLowerCase();
            return ['职业', 'class', '门派', '职业类型'].some(keyword => 
                lowerH === keyword.toLowerCase() || lowerH.includes(keyword.toLowerCase())
            );
        });
        const className = classIndex >= 0 && classIndex < fields.length ? 
            (fields[classIndex]?.trim() || '') : '';
        
        // 扩展战力列识别
        const powerIndex = headers.findIndex(h => {
            const lowerH = h.toLowerCase();
            return ['总战力', '战力', 'power', '战斗力', '战力值', '总战斗力'].some(keyword => 
                lowerH === keyword.toLowerCase() || lowerH.includes(keyword.toLowerCase())
            );
        });
        const powerStr = powerIndex >= 0 && powerIndex < fields.length ? 
            (fields[powerIndex]?.trim() || '0') : '0';
        
        // 扩展备注列识别
        const notesIndex = headers.findIndex(h => {
            const lowerH = h.toLowerCase();
            return ['备注', 'notes', '说明', '标记', '职位', '分堂'].some(keyword => 
                lowerH === keyword.toLowerCase() || lowerH.includes(keyword.toLowerCase())
            );
        });
        let notes = notesIndex >= 0 && notesIndex < fields.length ? 
            (fields[notesIndex]?.trim() || '') : '';
        
        // 添加其他有用信息到备注
        const fentangIndex = headers.findIndex(h => h === '分堂');
        if (fentangIndex >= 0 && fentangIndex < fields.length && fields[fentangIndex]?.trim()) {
            notes = (notes ? notes + ' | ' : '') + '分堂:' + fields[fentangIndex].trim();
        }
        
        const tuanzhangIndex = headers.findIndex(h => h === '所在团长');
        if (tuanzhangIndex >= 0 && tuanzhangIndex < fields.length && fields[tuanzhangIndex]?.trim()) {
            notes = (notes ? notes + ' | ' : '') + '团长:' + fields[tuanzhangIndex].trim();
        }
        
        const normalizedClass = normalizeClassName(className);
        const power = parsePower(powerStr);
        
        return new Member(name, normalizedClass, power, notes);
    }
}

// 智能分配引擎
class Allocator {
    static allocate(teams, allMembers, templates) {
        // 眼位成员从分配池移除
        const eyeMembers = allMembers.filter(m => m.isEye);
        let allocatableMembers = allMembers.filter(m => !m.isEye && !m.isLocked);
        
        // 按优先级排序
        allocatableMembers.sort((a, b) => b.getPriorityScore() - a.getPriorityScore());
        
        // 构建模板字典
        const templateDict = {};
        templates.forEach(t => templateDict[t.id] = t);
        
        // 清空所有分配
        teams.forEach(team => {
            team.members.forEach(m => {
                m.assignedTeamId = null;
            });
            team.members = [];
        });
        
        // 按团顺序分配
        teams.forEach(team => {
            if (team.isFull) return;
            
            const template = team.roleTemplateId ? templateDict[team.roleTemplateId] : null;
            const currentDistribution = team.getClassDistribution();
            
            // 优先满足职业缺口
            if (template) {
                const gaps = template.getClassGaps(currentDistribution);
                const gapEntries = Object.entries(gaps).sort((a, b) => b[1] - a[1]);
                
                gapEntries.forEach(([className, gapValue]) => {
                    if (team.isFull) return;
                    
                    let candidates = allocatableMembers.filter(m => 
                        m.class === className && !m.assignedTeamId
                    );
                    
                    if (template.isHighPressure) {
                        candidates.sort((a, b) => b.getPriorityScore() - a.getPriorityScore());
                    }
                    
                    const toAssign = Math.min(gapValue, candidates.length);
                    for (let i = 0; i < toAssign && !team.isFull; i++) {
                        const member = candidates[i];
                        team.addMember(member);
                        allocatableMembers = allocatableMembers.filter(m => m.id !== member.id);
                    }
                });
            }
            
            // 填充剩余名额
            while (!team.isFull && allocatableMembers.length > 0) {
                const member = allocatableMembers.find(m => !m.assignedTeamId);
                if (!member) break;
                
                team.addMember(member);
                allocatableMembers = allocatableMembers.filter(m => m.id !== member.id);
            }
        });
    }

    static balanceTeam(team, template, allMembers) {
        if (!template) return;
        
        const currentDistribution = team.getClassDistribution();
        const gaps = template.getClassGaps(currentDistribution);
        
        // 移除未锁定成员
        const unlockedMembers = team.members.filter(m => !m.isLocked);
        unlockedMembers.forEach(m => team.removeMember(m));
        
        // 获取可用成员
        let availableMembers = allMembers.filter(m => 
            !m.isEye && !m.isLocked && !m.assignedTeamId
        );
        availableMembers.push(...unlockedMembers);
        
        // 按缺口重新分配
        const gapEntries = Object.entries(gaps).sort((a, b) => b[1] - a[1]);
        gapEntries.forEach(([className, gapValue]) => {
            if (team.isFull) return;
            
            const candidates = availableMembers
                .filter(m => m.class === className)
                .sort((a, b) => b.getPriorityScore() - a.getPriorityScore());
            
            const toAssign = Math.min(gapValue, candidates.length);
            for (let i = 0; i < toAssign && !team.isFull; i++) {
                const member = candidates[i];
                team.addMember(member);
                availableMembers = availableMembers.filter(m => m.id !== member.id);
            }
        });
        
        // 填充剩余名额
        while (!team.isFull && availableMembers.length > 0) {
            availableMembers.sort((a, b) => b.getPriorityScore() - a.getPriorityScore());
            const member = availableMembers[0];
            team.addMember(member);
            availableMembers = availableMembers.filter(m => m.id !== member.id);
        }
    }
    
    // 单团队智能分配
    static allocateSingleTeam(team, allMembers, maxMembers, suwenCount, strategy, leaderId, squadsPerTeam, membersPerSquad) {
        console.log('[智能分配] 开始分配', {
            teamName: team.name,
            maxMembers,
            suwenCount,
            strategy,
            leaderId,
            squadsPerTeam,
            membersPerSquad
        });
        
        // 定义近战和远程职业
        const meleeClasses = ['沧澜', '血河', '铁衣', '龙吟', '碎梦', '荒羽'];
        const rangedClasses = ['神相', '鸿音', '九灵', '云瑶', '潮光', '玄机']; // 注意：用户说的"九零"应该是"九灵"
        
        // 获取团长成员
        let leaderMember = null;
        if (leaderId) {
            leaderMember = allMembers.find(m => m.id === leaderId);
            if (leaderMember) {
                console.log('[智能分配] 设置团长:', leaderMember.name);
                // 清除其他成员的团长标记
                allMembers.forEach(m => {
                    if (m.id !== leaderMember.id) {
                        m.isLeader = false;
                    }
                });
                leaderMember.isLeader = true;
            } else {
                console.warn('[智能分配] 未找到指定的团长ID:', leaderId);
            }
        }
        
        // 计算分队配置（例如23人 -> 6665）
        const squadSizes = this.calculateSquadSizes(maxMembers, squadsPerTeam, membersPerSquad);
        const squadCount = squadSizes.length; // 小队数量
        console.log('[智能分配] 分队配置:', squadSizes, '共', squadCount, '个小队');
        
        // 移除未锁定成员（保留锁定成员）
        const lockedMembers = team.members.filter(m => m.isLocked);
        const unlockedMembers = team.members.filter(m => !m.isLocked);
        unlockedMembers.forEach(m => {
            team.removeMember(m);
            m.assignedTeamId = null;
            m.squadIndex = null;
            m.slotIndex = null;
        });
        
        // 获取可用成员池（排除眼位和已锁定且已分配的成员）
        let availableMembers = allMembers.filter(m => 
            !m.isEye && 
            !m.isLocked && 
            (m.assignedTeamId === null || m.assignedTeamId === team.id)
        );
        
        // 添加解锁的成员回池
        availableMembers.push(...unlockedMembers);
        // 去重
        availableMembers = availableMembers.filter((m, index, self) => 
            index === self.findIndex(t => t.id === m.id)
        );
        
        // 按优先级排序（总战力 > 操作手标记 > 数据优异标记）
        availableMembers.sort((a, b) => b.getPriorityScore() - a.getPriorityScore());
        console.log('[智能分配] 可用成员数:', availableMembers.length);
        
        // 1. 优先添加团长到团队（放在1队1号位）
        const isLeaderSuwen = leaderMember && leaderMember.class === '素问';
        if (leaderMember) {
            if (!team.members.find(m => m.id === leaderMember.id)) {
                team.addMember(leaderMember);
                leaderMember.squadIndex = 1; // 先标记为1队
                console.log('[智能分配] 添加团长到团队:', leaderMember.name, '职业:', leaderMember.class);
                if (isLeaderSuwen) {
                    console.log('[智能分配] 团长为素问，素问总数将-1');
                }
            }
        }
        
        // 2. 计算需要选择的成员数（总人数 - 团长 - 已锁定成员）
        const targetMemberCount = maxMembers - (leaderMember ? 1 : 0) - lockedMembers.length;
        console.log('[智能分配] 需要选择的成员数:', targetMemberCount, '(总人数:', maxMembers, '- 团长:', leaderMember ? 1 : 0, '- 锁定:', lockedMembers.length, ')');
        
        // 3. 按职业限制选择成员（每个职业最多选择squadCount个，除素问外）
        // 先选择素问（根据设置的素问数量，如果团长是素问则-1）
        let actualSuwenCount = suwenCount;
        if (isLeaderSuwen) {
            actualSuwenCount = Math.max(0, suwenCount - 1); // 团长是素问，素问总数-1
            console.log('[智能分配] 团长为素问，素问总数从', suwenCount, '调整为', actualSuwenCount);
        }
        
        const suwenMembers = availableMembers.filter(m => m.class === '素问' && m.id !== leaderId);
        suwenMembers.sort((a, b) => b.getPriorityScore() - a.getPriorityScore());
        const selectedSuwen = suwenMembers.slice(0, Math.min(actualSuwenCount, suwenMembers.length));
        console.log('[智能分配] 选择素问:', selectedSuwen.length, '名');
        
        // 按职业分组其他成员
        const membersByClass = {};
        availableMembers.forEach(member => {
            if (member.class !== '素问' && member.id !== leaderId) {
                if (!membersByClass[member.class]) {
                    membersByClass[member.class] = [];
                }
                membersByClass[member.class].push(member);
            }
        });
        
        // 每个职业最多选择squadCount个（除素问外）
        // 龙吟和碎梦降低上场比例（最多选择squadCount的一半，向上取整）
        // 在"来点近战"策略时，降低鸿音的上场比例
        const selectedMembers = [];
        Object.keys(membersByClass).forEach(className => {
            const classMembers = membersByClass[className].sort((a, b) => b.getPriorityScore() - a.getPriorityScore());
            let maxSelect = squadCount; // 每个职业最多选择小队数量个
            // 降低龙吟和碎梦的上场比例
            if (className === '龙吟' || className === '碎梦') {
                maxSelect = Math.ceil(squadCount / 2); // 最多选择小队数量的一半（向上取整）
                console.log('[智能分配] 职业', className, '降低上场比例，最多选择', maxSelect, '名');
            }
            // 在"来点近战"策略时，降低鸿音的上场比例
            if (className === '鸿音' && strategy === 'melee') {
                maxSelect = Math.ceil(squadCount / 2); // 最多选择小队数量的一半（向上取整）
                console.log('[智能分配] "来点近战"策略下，职业', className, '降低上场比例，最多选择', maxSelect, '名');
            }
            const selected = classMembers.slice(0, maxSelect);
            selectedMembers.push(...selected);
            console.log('[智能分配] 职业', className, '选择', selected.length, '名 (最多', maxSelect, '名)');
        });
        
        // 4. 根据策略筛选成员（近战/远程比例）
        let meleeRatio, rangedRatio;
        if (strategy === 'melee') {
            meleeRatio = 0.7;
            rangedRatio = 0.3;
        } else if (strategy === 'ranged') {
            meleeRatio = 0.3;
            rangedRatio = 0.7;
        } else if (strategy === 'balanced') {
            meleeRatio = 0.5;
            rangedRatio = 0.5;
        } else {
            // 默认平衡分配
            meleeRatio = 0.5;
            rangedRatio = 0.5;
        }
        
        // 分离近战和远程
        const selectedMelee = selectedMembers.filter(m => meleeClasses.includes(m.class));
        const selectedRanged = selectedMembers.filter(m => rangedClasses.includes(m.class));
        const selectedOther = selectedMembers.filter(m => 
            !meleeClasses.includes(m.class) && !rangedClasses.includes(m.class)
        );
        
        // 计算目标数量
        const remainingSlots = targetMemberCount - selectedSuwen.length;
        const targetMelee = Math.floor(remainingSlots * meleeRatio);
        const targetRanged = remainingSlots - targetMelee;
        
        console.log('[智能分配] 策略:', strategy, '目标近战:', targetMelee, '目标远程:', targetRanged);
        
        // 选择近战成员（根据策略应用限制）
        let finalMelee = [];
        if (strategy === 'ranged') {
            // "来点远程"策略：近战职业每个职业不超过2个
            const meleeByClass = {};
            selectedMelee.forEach(m => {
                if (!meleeByClass[m.class]) {
                    meleeByClass[m.class] = [];
                }
                meleeByClass[m.class].push(m);
            });
            
            // 优先分配九灵（如果九灵是近战的话，但九灵是远程，所以这里不需要特殊处理）
            // 每个近战职业最多2个
            Object.keys(meleeByClass).forEach(className => {
                const classMembers = meleeByClass[className].slice(0, 2); // 每个职业最多2个
                finalMelee.push(...classMembers);
            });
            // 按优先级排序并限制总数
            finalMelee.sort((a, b) => b.getPriorityScore() - a.getPriorityScore());
            finalMelee = finalMelee.slice(0, Math.min(targetMelee, finalMelee.length));
            console.log('[智能分配] "来点远程"策略：近战职业每个职业最多2个，已选择', finalMelee.length, '名');
        } else if (strategy === 'balanced') {
            // "平衡分配"策略：近战职业正常分配，无特殊限制
            finalMelee = selectedMelee.slice(0, Math.min(targetMelee, selectedMelee.length));
            console.log('[智能分配] "平衡分配"策略：近战职业已选择', finalMelee.length, '名');
        } else {
            // "来点近战"策略：近战职业正常分配
            finalMelee = selectedMelee.slice(0, Math.min(targetMelee, selectedMelee.length));
        }
        
        // 选择远程成员（根据策略应用限制）
        let finalRanged = [];
        if (strategy === 'melee') {
            // "来点近战"策略：远程职业每个职业不超过2个，九灵优先分配
            const rangedByClass = {};
            selectedRanged.forEach(m => {
                if (!rangedByClass[m.class]) {
                    rangedByClass[m.class] = [];
                }
                rangedByClass[m.class].push(m);
            });
            
            // 优先分配九灵
            const jiulingMembers = rangedByClass['九灵'] || [];
            const otherRangedClasses = Object.keys(rangedByClass).filter(c => c !== '九灵');
            
            // 先添加九灵成员（最多2个）
            finalRanged.push(...jiulingMembers.slice(0, 2));
            console.log('[智能分配] "来点近战"策略：优先分配九灵', finalRanged.length, '名');
            
            // 再添加其他远程职业（每个职业最多2个）
            otherRangedClasses.forEach(className => {
                const classMembers = rangedByClass[className].slice(0, 2); // 每个职业最多2个
                finalRanged.push(...classMembers);
            });
            
            // 按优先级排序并限制总数
            finalRanged.sort((a, b) => b.getPriorityScore() - a.getPriorityScore());
            finalRanged = finalRanged.slice(0, Math.min(targetRanged, finalRanged.length));
            console.log('[智能分配] "来点近战"策略：远程职业每个职业最多2个，已选择', finalRanged.length, '名');
        } else if (strategy === 'balanced') {
            // "平衡分配"策略：远程职业正常分配，但九灵优先
            const jiulingMembers = selectedRanged.filter(m => m.class === '九灵');
            const otherRanged = selectedRanged.filter(m => m.class !== '九灵');
            
            // 优先分配九灵
            finalRanged.push(...jiulingMembers);
            // 再分配其他远程职业
            finalRanged.push(...otherRanged);
            
            // 限制总数
            finalRanged = finalRanged.slice(0, Math.min(targetRanged, finalRanged.length));
            console.log('[智能分配] "平衡分配"策略：九灵优先分配，远程职业已选择', finalRanged.length, '名');
        } else {
            // "来点远程"策略：远程职业正常分配，但九灵优先
            const jiulingMembers = selectedRanged.filter(m => m.class === '九灵');
            const otherRanged = selectedRanged.filter(m => m.class !== '九灵');
            
            // 优先分配九灵
            finalRanged.push(...jiulingMembers);
            // 再分配其他远程职业
            finalRanged.push(...otherRanged);
            
            // 限制总数
            finalRanged = finalRanged.slice(0, Math.min(targetRanged, finalRanged.length));
            console.log('[智能分配] "来点远程"策略：九灵优先分配，已选择', finalRanged.length, '名');
        }
        
        // 选择其他成员填充剩余名额
        const remainingNeeded = targetMemberCount - selectedSuwen.length - finalMelee.length - finalRanged.length;
        const finalOther = selectedOther.slice(0, Math.min(remainingNeeded, selectedOther.length));
        
        // 5. 将所有选中的成员添加到团队
        const allSelectedMembers = [...selectedSuwen, ...finalMelee, ...finalRanged, ...finalOther];
        console.log('[智能分配] 最终选择成员:', {
            素问: selectedSuwen.length,
            近战: finalMelee.length,
            远程: finalRanged.length,
            其他: finalOther.length,
            总计: allSelectedMembers.length
        });
        
        allSelectedMembers.forEach(member => {
            if (!team.members.find(m => m.id === member.id)) {
                // 确保成员没有残留的位置信息
                if (member.assignedTeamId && member.assignedTeamId !== team.id) {
                    // 如果成员之前属于其他团队，清除位置信息
                    member.squadIndex = null;
                    member.slotIndex = null;
                    console.log('[智能分配] 清除成员', member.name, '的旧位置信息');
                }
                team.addMember(member);
            }
        });
        
        console.log('[智能分配] 团队当前人数:', team.members.length, '/', maxMembers);
        
        // 验证：确保所有团队成员都有正确的assignedTeamId
        const invalidMembers = team.members.filter(m => m.assignedTeamId !== team.id);
        if (invalidMembers.length > 0) {
            console.warn('[智能分配] 发现', invalidMembers.length, '个成员的assignedTeamId不正确，正在修复...');
            invalidMembers.forEach(m => {
                m.assignedTeamId = team.id;
            });
        }
        
        // 6. 智能分配素问（根据近战数量）
        const allSuwenInTeam = team.members.filter(m => m.class === '素问');
        console.log('[智能分配] 开始智能分配素问...');
        // 如果团长是素问，使用调整后的素问数量
        this.allocateSuwenIntelligently(team, allSuwenInTeam, squadSizes, actualSuwenCount);
        console.log('[智能分配] 素问分配完成，团队当前人数:', team.members.length);
        
        // 7. 将成员分配到小队（确保每个小队至少一个素问，小队长在1号位，素问在下置位）
        console.log('[智能分配] 开始分配成员到小队...');
        this.assignMembersToSquads(team, squadSizes, membersPerSquad, leaderMember, isLeaderSuwen);
        console.log('[智能分配] 分配完成，团队最终人数:', team.members.length);
    }
    
    // 智能分配素问（根据近战数量决定是否需要双奶，确保每个小队至少一个素问）
    static allocateSuwenIntelligently(team, suwenMembers, squadSizes, targetSuwenCount) {
        console.log('[素问分配] 开始智能分配素问', {
            suwenMembersCount: suwenMembers.length,
            targetSuwenCount,
            squadSizes
        });
        
        const meleeClasses = ['沧澜', '血河', '铁衣', '龙吟', '碎梦', '荒羽'];
        
        // 统计每个小队的成员情况
        const squads = squadSizes.map((size, idx) => {
            const squadMembers = team.members.filter(m => m.squadIndex === idx + 1);
            let meleeCount = 0;
            let suwenCount = 0;
            
            squadMembers.forEach(member => {
                if (meleeClasses.includes(member.class)) {
                    meleeCount++;
                }
                if (member.class === '素问') {
                    suwenCount++;
                }
            });
            
            return {
                index: idx + 1,
                size: size,
                members: squadMembers,
                meleeCount: meleeCount,
                suwenCount: suwenCount
            };
        });
        
        console.log('[素问分配] 各小队初始状态:', squads.map(s => ({
            index: s.index,
            meleeCount: s.meleeCount,
            suwenCount: s.suwenCount
        })));
        
        // 找出没有素问的小队
        const squadsWithoutSuwen = squads.filter(s => s.suwenCount === 0);
        console.log('[素问分配] 没有素问的小队数:', squadsWithoutSuwen.length);
        
        // 为没有素问的小队分配素问（优先从未分配的素问中分配）
        let suwenIndex = 0;
        const unassignedSuwen = suwenMembers.filter(m => {
            // 确保成员在团队中
            const existing = team.members.find(tm => tm.id === m.id);
            if (!existing) {
                // 如果成员不在团队中，先添加到团队
                if (!team.isFull) {
                    team.addMember(m);
                    console.log('[素问分配] 添加素问到团队:', m.name);
                }
                return true;
            }
            // 如果成员在团队中但还没有分配到小队
            return existing.squadIndex === null || existing.squadIndex === undefined;
        });
        
        console.log('[素问分配] 未分配的素问数:', unassignedSuwen.length);
        
        for (const squad of squadsWithoutSuwen) {
            if (suwenIndex >= unassignedSuwen.length) {
                // 如果没有未分配的素问，从治疗压力小的队伍抽调一个
                const squadsWithSuwen = squads.filter(s => s.suwenCount > 0 && s.index !== squad.index);
                if (squadsWithSuwen.length > 0) {
                    // 找到治疗压力最小的小队（近战少且素问多）
                    const sourceSquad = squadsWithSuwen.sort((a, b) => {
                        // 优先选择近战少的小队
                        if (a.meleeCount !== b.meleeCount) return a.meleeCount - b.meleeCount;
                        // 其次选择素问多的小队（有2个素问的优先）
                        return b.suwenCount - a.suwenCount;
                    })[0];
                    
                    if (sourceSquad && sourceSquad.suwenCount > 1) {
                        // 从源小队移除一个素问
                        const suwenToMove = sourceSquad.members.find(m => m.class === '素问');
                        if (suwenToMove) {
                            suwenToMove.squadIndex = squad.index;
                            sourceSquad.suwenCount--;
                            squad.suwenCount++;
                            // 更新统计
                            const sourceIdx = squads.findIndex(s => s.index === sourceSquad.index);
                            const targetIdx = squads.findIndex(s => s.index === squad.index);
                            if (sourceIdx >= 0) squads[sourceIdx].suwenCount = sourceSquad.suwenCount;
                            if (targetIdx >= 0) squads[targetIdx].suwenCount = squad.suwenCount;
                        }
                    }
                }
                break;
            }
            
            const member = unassignedSuwen[suwenIndex++];
            if (!team.members.find(m => m.id === member.id)) {
                team.addMember(member);
            }
            member.squadIndex = squad.index;
            squad.suwenCount++;
            // 更新统计
            const targetIdx = squads.findIndex(s => s.index === squad.index);
            if (targetIdx >= 0) squads[targetIdx].suwenCount = squad.suwenCount;
        }
        
        // 根据近战数量智能分配双素问
        // 近战越多，治疗压力越大，需要双奶
        const remainingUnassigned = unassignedSuwen.slice(suwenIndex);
        remainingUnassigned.forEach(member => {
            // 找到近战最多且素问最少的小队
            const bestSquad = squads
                .filter(s => s.members.length < s.size && s.suwenCount < 2)
                .sort((a, b) => {
                    // 优先近战多的小队（治疗压力大）
                    if (b.meleeCount !== a.meleeCount) return b.meleeCount - a.meleeCount;
                    // 其次素问少的小队
                    return a.suwenCount - b.suwenCount;
                })[0];
            
            if (bestSquad) {
                if (!team.members.find(m => m.id === member.id)) {
                    team.addMember(member);
                }
                member.squadIndex = bestSquad.index;
                bestSquad.suwenCount++;
                // 更新统计
                const bestIdx = squads.findIndex(s => s.index === bestSquad.index);
                if (bestIdx >= 0) squads[bestIdx].suwenCount = bestSquad.suwenCount;
            }
        });
        
        // 最终检查：确保每个小队至少有一个素问
        squads.forEach(squad => {
            if (squad.suwenCount === 0) {
                console.warn('[素问分配] 小队', squad.index, '没有素问，尝试抽调');
                // 从其他小队抽调一个素问
                const squadsWithSuwen = squads.filter(s => s.suwenCount > 0 && s.index !== squad.index);
                if (squadsWithSuwen.length > 0) {
                    const sourceSquad = squadsWithSuwen.sort((a, b) => {
                        // 优先选择近战少的小队
                        if (a.meleeCount !== b.meleeCount) return a.meleeCount - b.meleeCount;
                        // 其次选择素问多的小队
                        return b.suwenCount - a.suwenCount;
                    })[0];
                    
                    if (sourceSquad && sourceSquad.suwenCount > 1) {
                        const suwenToMove = sourceSquad.members.find(m => m.class === '素问');
                        if (suwenToMove) {
                            suwenToMove.squadIndex = squad.index;
                            sourceSquad.suwenCount--;
                            squad.suwenCount++;
                            console.log('[素问分配] 从小队', sourceSquad.index, '抽调素问', suwenToMove.name, '到小队', squad.index);
                        }
                    } else if (sourceSquad && sourceSquad.suwenCount === 1) {
                        // 如果源小队只有1个素问，但目标小队没有，且源小队近战少，则转移
                        if (sourceSquad.meleeCount < 2) {
                            const suwenToMove = sourceSquad.members.find(m => m.class === '素问');
                            if (suwenToMove) {
                                suwenToMove.squadIndex = squad.index;
                                sourceSquad.suwenCount--;
                                squad.suwenCount++;
                                console.log('[素问分配] 从治疗压力小的小队', sourceSquad.index, '转移素问', suwenToMove.name, '到小队', squad.index);
                            }
                        }
                    }
                } else {
                    console.error('[素问分配] 无法为小队', squad.index, '找到素问！');
                }
            }
        });
        
        console.log('[素问分配] 最终各小队素问数:', squads.map(s => ({
            index: s.index,
            suwenCount: s.suwenCount
        })));
    }
    
    // 计算分队配置（例如23人 -> [6,6,6,5]）
    static calculateSquadSizes(totalMembers, squadsPerTeam, membersPerSquad) {
        const squadSizes = [];
        let remaining = totalMembers;
        
        // 优先填满前几个小队
        for (let i = 0; i < squadsPerTeam && remaining > 0; i++) {
            const size = Math.min(membersPerSquad, remaining);
            squadSizes.push(size);
            remaining -= size;
        }
        
        return squadSizes;
    }
    
    // 分配素问到各小队（优先为近战职业多的队伍配置）
    static distributeSuwen(totalSuwen, squadSizes) {
        const suwenPerSquad = new Array(squadSizes.length).fill(0);
        
        if (totalSuwen === 0) return suwenPerSquad;
        
        // 优先为人数多的小队分配素问
        const squadIndices = squadSizes.map((size, idx) => ({ size, idx }))
            .sort((a, b) => b.size - a.size);
        
        let remaining = totalSuwen;
        for (const { idx } of squadIndices) {
            if (remaining <= 0) break;
            // 每个小队至少1个素问，人数多的可以2个
            const needed = squadSizes[idx] >= 6 ? 2 : 1;
            const assign = Math.min(needed, remaining);
            suwenPerSquad[idx] = assign;
            remaining -= assign;
        }
        
        return suwenPerSquad;
    }
    
    // 将成员分配到各小队（职业平均分配，尽量不重复，素问除外可双素问）
    // 小队长（近战）在1号位，素问在下置位，第一小队1号位为团长
    // 如果团长是素问，团长留在1号位，不移动到5、6号位
    static assignMembersToSquads(team, squadSizes, membersPerSquad, leaderMember, isLeaderSuwen = false) {
        console.log('[小队分配] 开始分配成员到小队', {
            teamMembers: team.members.length,
            squadSizes,
            hasLeader: !!leaderMember,
            isLeaderSuwen: isLeaderSuwen
        });
        
        // 定义近战职业（可担任小队长）
        const meleeClasses = ['沧澜', '血河', '铁衣', '龙吟', '碎梦', '荒羽'];
        
        // 分离已锁定成员和未锁定成员
        const lockedMembers = team.members.filter(m => m.isLocked);
        const unlockedMembers = team.members.filter(m => !m.isLocked);
        console.log('[小队分配] 已锁定成员:', lockedMembers.length, '未锁定成员:', unlockedMembers.length);
        
        // 清空所有未锁定成员的小队位置（但保留已预分配的素问的squadIndex）
        unlockedMembers.forEach(m => {
            // 如果成员已经有squadIndex（素问等预分配），只清空slotIndex
            if (m.squadIndex === null || m.squadIndex === undefined) {
                m.slotIndex = null;
            } else {
                // 保留squadIndex，但清空slotIndex以便重新分配
                m.slotIndex = null;
            }
        });
        
        // 按优先级排序未锁定成员
        unlockedMembers.sort((a, b) => b.getPriorityScore() - a.getPriorityScore());
        
        // 按职业分组成员（素问单独处理）
        const membersByClass = {};
        unlockedMembers.forEach(member => {
            if (!membersByClass[member.class]) {
                membersByClass[member.class] = [];
            }
            membersByClass[member.class].push(member);
        });
        
        // 初始化各小队的成员列表和职业统计
        const squads = squadSizes.map((size, idx) => ({
            index: idx + 1,
            size: size,
            members: [],
            classCount: {}, // 记录每个职业的数量
            hasLeader: false, // 是否有小队长（1号位）
            hasSuwen: false // 是否有素问
        }));
        
        // 先分配已锁定成员和预分配的素问
        lockedMembers.forEach(member => {
            if (member.squadIndex && member.squadIndex >= 1 && member.squadIndex <= squads.length) {
                const squad = squads[member.squadIndex - 1];
                if (squad.members.length < squad.size) {
                    squad.members.push(member);
                    squad.classCount[member.class] = (squad.classCount[member.class] || 0) + 1;
                    if (member.class === '素问') squad.hasSuwen = true;
                    if (meleeClasses.includes(member.class)) squad.hasLeader = true;
                }
            }
        });
        
        // 分配已预分配的素问
        unlockedMembers.filter(m => m.squadIndex !== null && m.squadIndex !== undefined && m.class === '素问').forEach(member => {
            const squad = squads[member.squadIndex - 1];
            if (squad.members.length < squad.size) {
                squad.members.push(member);
                squad.classCount[member.class] = (squad.classCount[member.class] || 0) + 1;
                squad.hasSuwen = true;
            }
        });
        
        // 分配团长到第一小队1号位
        if (leaderMember) {
            const firstSquad = squads[0];
            if (!firstSquad.members.find(m => m.id === leaderMember.id)) {
                firstSquad.members.unshift(leaderMember); // 插入到第一位
                firstSquad.classCount[leaderMember.class] = (firstSquad.classCount[leaderMember.class] || 0) + 1;
                if (meleeClasses.includes(leaderMember.class)) {
                    firstSquad.hasLeader = true;
                }
            }
        }
        
        // 按职业平均分配到各小队（先分配小队长，再分配其他成员，最后分配素问）
        // 1. 先为每个小队分配小队长（近战职业，1号位）
        const meleeMembersForLeader = [];
        ['铁衣', '沧澜', '血河', '龙吟', '碎梦', '荒羽'].forEach(className => {
            if (membersByClass[className]) {
                meleeMembersForLeader.push(...membersByClass[className]);
            }
        });
        
        // 去重并排序（排除团长）
        const uniqueMeleeForLeader = meleeMembersForLeader.filter((m, idx, self) => 
            idx === self.findIndex(t => t.id === m.id) &&
            (m.squadIndex === null || m.squadIndex === undefined) &&
            m.id !== leaderMember?.id
        );
        uniqueMeleeForLeader.sort((a, b) => b.getPriorityScore() - a.getPriorityScore());
        
        // 为每个小队分配小队长（如果还没有）
        squads.forEach((squad, squadIdx) => {
            if (!squad.hasLeader && uniqueMeleeForLeader.length > 0) {
                const leader = uniqueMeleeForLeader.shift();
                squad.members.unshift(leader); // 插入到第一位
                leader.squadIndex = squad.index;
                squad.classCount[leader.class] = (squad.classCount[leader.class] || 0) + 1;
                squad.hasLeader = true;
            }
        });
        
        // 2. 分配其他职业（除了素问）
        
        Object.keys(membersByClass).forEach(className => {
            if (className === '素问') return; // 素问稍后处理
            
            const classMembers = membersByClass[className].filter(m => 
                m.squadIndex === null || m.squadIndex === undefined
            );
            
            // 对每个职业的成员，平均分配到各小队
            classMembers.forEach((member, memberIdx) => {
                // 计算应该分配到哪个小队（轮询分配）
                let bestSquad = null;
                let bestScore = -1;
                
                for (let i = 0; i < squads.length; i++) {
                    const squad = squads[(memberIdx + i) % squads.length];
                    
                    // 检查小队是否已满
                    if (squad.members.length >= squad.size) continue;
                    
                    // 检查职业重复规则（除了近战可以当小队长）
                    const currentClassCount = squad.classCount[className] || 0;
                    if (meleeClasses.includes(className)) {
                        // 近战职业：如果已经有小队长了，尽量不重复
                        if (squad.hasLeader && currentClassCount >= 1) continue;
                    } else {
                        // 其他职业尽量不重复
                        if (currentClassCount >= 1) continue;
                    }
                    
                    // 计算分数：优先选择人数少且没有该职业的小队
                    const score = (squad.size - squad.members.length) * 100 - currentClassCount * 10;
                    if (score > bestScore) {
                        bestScore = score;
                        bestSquad = squad;
                    }
                }
                
                // 如果找不到完全符合条件的小队，选择第一个有空位的小队
                if (!bestSquad) {
                    for (const squad of squads) {
                        if (squad.members.length < squad.size) {
                            bestSquad = squad;
                            break;
                        }
                    }
                }
                
                // 分配到最佳小队
                if (bestSquad) {
                    bestSquad.members.push(member);
                    member.squadIndex = bestSquad.index;
                    bestSquad.classCount[className] = (bestSquad.classCount[className] || 0) + 1;
                    if (meleeClasses.includes(className)) {
                        bestSquad.hasLeader = true;
                    }
                }
            });
        });
        
        // 3. 最后分配素问（放在下置位）
        const suwenMembers = membersByClass['素问'] || [];
        const unassignedSuwen = suwenMembers.filter(m => 
            m.squadIndex === null || m.squadIndex === undefined
        );
        
        // 确保每个小队至少有一个素问
        squads.forEach(squad => {
            if (!squad.hasSuwen && unassignedSuwen.length > 0) {
                const suwen = unassignedSuwen.shift();
                squad.members.push(suwen); // 放在最后（下置位）
                suwen.squadIndex = squad.index;
                squad.classCount['素问'] = (squad.classCount['素问'] || 0) + 1;
                squad.hasSuwen = true;
            }
        });
        
        // 分配剩余的素问（根据近战数量决定是否需要双奶）
        unassignedSuwen.forEach(suwen => {
            // 找到近战最多且素问最少的小队
            const bestSquad = squads
                .filter(s => s.members.length < s.size && s.classCount['素问'] < 2)
                .sort((a, b) => {
                    // 优先近战多的小队（治疗压力大）
                    const aMeleeCount = a.members.filter(m => meleeClasses.includes(m.class)).length;
                    const bMeleeCount = b.members.filter(m => meleeClasses.includes(m.class)).length;
                    if (bMeleeCount !== aMeleeCount) return bMeleeCount - aMeleeCount;
                    // 其次素问少的小队
                    return (a.classCount['素问'] || 0) - (b.classCount['素问'] || 0);
                })[0];
            
            if (bestSquad) {
                bestSquad.members.push(suwen); // 放在最后（下置位）
                suwen.squadIndex = bestSquad.index;
                bestSquad.classCount['素问'] = (bestSquad.classCount['素问'] || 0) + 1;
            }
        });
        
        // 4. 为每个小队的成员分配槽位
        // 调整位置：素问到6号位（双奶队56号位），近战到1号位（1队1号位是团长）
        // 如果团长是素问，团长留在1号位，不移动到5、6号位
        squads.forEach(squad => {
            // 分离素问和其他成员
            // 如果团长是素问且在1队，需要特殊处理
            let suwenInSquad = squad.members.filter(m => m.class === '素问');
            let otherMembers = squad.members.filter(m => m.class !== '素问');
            
            // 如果团长是素问且在1队，从素问列表中分离出来
            let leaderSuwenInSquad = null;
            if (isLeaderSuwen && squad.index === 1 && leaderMember && squad.members.find(m => m.id === leaderMember.id)) {
                leaderSuwenInSquad = leaderMember;
                suwenInSquad = suwenInSquad.filter(m => m.id !== leaderMember.id);
                console.log('[小队分配] 1队团长为素问，团长留在1号位，不移动到5、6号位');
            }
            
            // 重新排序：近战在1号位（1队1号位是团长），其他成员在中间，素问在最后
            const meleeInSquad = otherMembers.filter(m => meleeClasses.includes(m.class));
            const nonMeleeInSquad = otherMembers.filter(m => !meleeClasses.includes(m.class));
            
            // 构建新的成员顺序
            const orderedMembers = [];
            
            // 1号位：如果是1队，放团长（无论团长是什么职业）；否则放随机近战
            if (squad.index === 1 && leaderMember && squad.members.find(m => m.id === leaderMember.id)) {
                orderedMembers.push(leaderMember);
                console.log('[小队分配] 1队1号位设置为团长:', leaderMember.name, '职业:', leaderMember.class);
            } else if (meleeInSquad.length > 0) {
                // 随机选择一个近战放在1号位
                const randomMelee = meleeInSquad[Math.floor(Math.random() * meleeInSquad.length)];
                orderedMembers.push(randomMelee);
                console.log('[小队分配] 小队', squad.index, '1号位设置为小队长:', randomMelee.name);
            }
            
            // 中间位置：其他成员（排除已放在1号位的）
            otherMembers.forEach(m => {
                if (!orderedMembers.find(om => om.id === m.id)) {
                    orderedMembers.push(m);
                }
            });
            
            // 最后位置：素问（6号位，双奶队56号位）
            // 注意：如果团长是素问，已经在1号位了，不在这里添加
            if (suwenInSquad.length === 1) {
                // 单奶：放在6号位
                orderedMembers.push(suwenInSquad[0]);
                console.log('[小队分配] 小队', squad.index, '单奶，素问放在6号位:', suwenInSquad[0].name);
            } else if (suwenInSquad.length === 2) {
                // 双奶：放在5号和6号位
                orderedMembers.push(...suwenInSquad);
                console.log('[小队分配] 小队', squad.index, '双奶，素问放在5、6号位:', suwenInSquad.map(s => s.name).join(', '));
            } else if (suwenInSquad.length > 2) {
                // 如果超过2个，只取前2个
                orderedMembers.push(...suwenInSquad.slice(0, 2));
                console.warn('[小队分配] 小队', squad.index, '素问超过2个，只保留前2个');
            }
            
            // 分配槽位
            orderedMembers.forEach((member, slotIdx) => {
                member.slotIndex = slotIdx + 1;
            });
            
            console.log('[小队分配] 小队', squad.index, '最终成员数:', orderedMembers.length, '成员:', orderedMembers.map(m => `${m.name}(${m.class})[${m.slotIndex}]`).join(', '));
        });
    }
}

// 数据持久化服务
class Persistence {
    static STORAGE_KEY_TEAMS = 'narakatactic_teams';
    static STORAGE_KEY_MEMBERS = 'narakatactic_members';
    static STORAGE_KEY_TEMPLATES = 'narakatactic_templates';
    static STORAGE_KEY_LAST_IMPORT_DATE = 'narakatactic_last_import_date';
    static STORAGE_KEY_IMPORT_HISTORY = 'narakatactic_import_history';
    static STORAGE_KEY_BATTLE_DATA = 'narakatactic_battle_data'; // 帮战数据单独存储
    static STORAGE_KEY_TEAM_HISTORY = 'narakatactic_team_history'; // 历史配比数据
    static STORAGE_KEY_MEMBER_DATA_TIME = 'narakatactic_member_data_time'; // 成员数据导入时间
    static STORAGE_KEY_POSITION_HISTORY = 'narakatactic_position_history'; // 位置历史记录
    static STORAGE_KEY_POSITION_HISTORY_STACK = 'narakatactic_position_history_stack'; // 位置历史堆栈（用于恢复上一步）
    static STORAGE_KEY_PENDING_MEMBERS = 'narakatactic_pending_members'; // 待调区成员
    static STORAGE_KEY_PENDING_MEMBERS = 'narakatactic_pending_members'; // 待调区成员

    static saveTeams(teams) {
        try {
            const data = teams.map(team => ({
                id: team.id,
                name: team.name,
                maxMembers: team.maxMembers,
                roleTemplateId: team.roleTemplateId,
                members: team.members.map(m => ({
                    id: m.id,
                    name: m.name,
                    class: m.class,
                    power: m.power,
                    notes: m.notes,
                    isLeader: m.isLeader,
                    isEye: m.isEye,
                    isExpert: m.isExpert,
                    isDataGood: m.isDataGood,
                    isLocked: m.isLocked,
                    assignedTeamId: m.assignedTeamId
                }))
            }));
            localStorage.setItem(this.STORAGE_KEY_TEAMS, JSON.stringify(data));
        } catch (error) {
            console.error('保存团队数据失败:', error);
        }
    }

    static loadTeams() {
        try {
            const data = localStorage.getItem(this.STORAGE_KEY_TEAMS);
            if (!data) return [];
            return JSON.parse(data).map(t => Team.fromJSON(t));
        } catch (error) {
            console.error('加载团队数据失败:', error);
            return [];
        }
    }

    static saveMembers(members) {
        try {
            const data = members.map(m => ({
                id: m.id,
                name: m.name,
                class: m.class,
                power: m.power,
                notes: m.notes,
                isLeader: m.isLeader,
                isEye: m.isEye,
                isExpert: m.isExpert,
                isDataGood: m.isDataGood,
                isLocked: m.isLocked,
                assignedTeamId: m.assignedTeamId,
                battleHistory: m.battleHistory || [],
                squadIndex: m.squadIndex || null,
                slotIndex: m.slotIndex || null
            }));
            localStorage.setItem(this.STORAGE_KEY_MEMBERS, JSON.stringify(data));
        } catch (error) {
            console.error('保存成员数据失败:', error);
        }
    }

    static saveLastImportDate(date) {
        try {
            localStorage.setItem(this.STORAGE_KEY_LAST_IMPORT_DATE, date);
        } catch (error) {
            console.error('保存导入日期失败:', error);
        }
    }

    static getLastImportDate() {
        try {
            return localStorage.getItem(this.STORAGE_KEY_LAST_IMPORT_DATE);
        } catch (error) {
            console.error('获取导入日期失败:', error);
            return null;
        }
    }

    static isDataImportedToday() {
        const lastImportDate = this.getLastImportDate();
        if (!lastImportDate) return false;
        
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        return lastImportDate === today;
    }

    static loadMembers() {
        try {
            const data = localStorage.getItem(this.STORAGE_KEY_MEMBERS);
            if (!data) return [];
            return JSON.parse(data).map(m => Member.fromJSON(m));
        } catch (error) {
            console.error('加载成员数据失败:', error);
            return [];
        }
    }

    static saveTemplates(templates) {
        try {
            const data = templates.map(t => ({
                id: t.id,
                name: t.name,
                classDistribution: t.classDistribution,
                totalMembers: t.totalMembers,
                isHighPressure: t.isHighPressure
            }));
            localStorage.setItem(this.STORAGE_KEY_TEMPLATES, JSON.stringify(data));
        } catch (error) {
            console.error('保存模板数据失败:', error);
        }
    }

    static loadTemplates() {
        try {
            const data = localStorage.getItem(this.STORAGE_KEY_TEMPLATES);
            if (data) {
                return JSON.parse(data).map(t => RoleTemplate.fromJSON(t));
            } else {
                const templates = RoleTemplate.createDefaultTemplates();
                this.saveTemplates(templates);
                return templates;
            }
        } catch (error) {
            console.error('加载模板数据失败:', error);
            return RoleTemplate.createDefaultTemplates();
        }
    }

    static addImportHistory(record) {
        try {
            const history = this.getImportHistory();
            
            // 检查是否重复导入（根据文件名和文件大小判断）
            const isDuplicate = history.some(h => 
                h.fileName === record.fileName && 
                h.fileSize === record.fileSize &&
                h.date === record.date
            );
            
            if (isDuplicate) {
                console.warn('检测到重复导入:', record.fileName);
                return false; // 返回false表示重复导入
            }
            
            // 添加时间戳作为唯一ID（使用更精确的时间戳避免重复）
            record.id = Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            record.timestamp = new Date().toISOString();
            history.unshift(record); // 最新的在前面
            // 只保留最近100条记录
            if (history.length > 100) {
                history.splice(100);
            }
            localStorage.setItem(this.STORAGE_KEY_IMPORT_HISTORY, JSON.stringify(history));
            console.log('导入历史已保存:', record); // 调试用
            return true; // 返回true表示成功添加
        } catch (error) {
            console.error('保存导入历史失败:', error);
            return false;
        }
    }
    
    static isFileImported(fileName, fileSize, date) {
        try {
            const history = this.getImportHistory();
            // 检查文件名和文件大小，以及日期（允许同一天内重复检查）
            return history.some(h => {
                const sameFile = h.fileName === fileName && h.fileSize === fileSize;
                const sameDate = h.date === date;
                return sameFile && sameDate;
            });
        } catch (error) {
            console.error('检查文件是否已导入失败:', error);
            return false;
        }
    }

    static getImportHistory() {
        try {
            const data = localStorage.getItem(this.STORAGE_KEY_IMPORT_HISTORY);
            if (!data) return [];
            const history = JSON.parse(data);
            // 确保返回的是数组
            return Array.isArray(history) ? history : [];
        } catch (error) {
            console.error('获取导入历史失败:', error);
            return [];
        }
    }
    
    // 兼容旧的方法名
    static loadImportHistory() {
        return this.getImportHistory();
    }

    static deleteImportHistory(recordId) {
        try {
            const history = this.getImportHistory();
            // 将 recordId 转换为字符串进行比较（因为可能是数字或字符串）
            const recordIdStr = String(recordId);
            const filtered = history.filter(r => String(r.id) !== recordIdStr);
            localStorage.setItem(this.STORAGE_KEY_IMPORT_HISTORY, JSON.stringify(filtered));
            console.log('[删除历史] 已删除记录:', recordId, '剩余记录数:', filtered.length);
            return true;
        } catch (error) {
            console.error('删除导入历史失败:', error);
            return false;
        }
    }

    static clearImportHistory() {
        try {
            localStorage.removeItem(this.STORAGE_KEY_IMPORT_HISTORY);
            return true;
        } catch (error) {
            console.error('清空导入历史失败:', error);
            return false;
        }
    }
    
    static clearAll() {
        try {
            localStorage.clear();
            return true;
        } catch (error) {
            console.error('清空所有数据失败:', error);
            return false;
        }
    }
    
    // 保存帮战数据（单独存储，不计入成员池）
    static saveBattleData(battleData) {
        try {
            localStorage.setItem(this.STORAGE_KEY_BATTLE_DATA, JSON.stringify(battleData));
        } catch (error) {
            console.error('保存帮战数据失败:', error);
        }
    }
    
    // 加载帮战数据
    static loadBattleData() {
        try {
            const data = localStorage.getItem(this.STORAGE_KEY_BATTLE_DATA);
            return data ? JSON.parse(data) : {};
        } catch (error) {
            console.error('加载帮战数据失败:', error);
            return {};
        }
    }
    
    // 保存成员数据导入时间
    static saveMemberDataTime(timestamp) {
        try {
            localStorage.setItem(this.STORAGE_KEY_MEMBER_DATA_TIME, timestamp.toString());
        } catch (error) {
            console.error('保存成员数据时间失败:', error);
        }
    }
    
    // 获取成员数据导入时间
    static getMemberDataTime() {
        try {
            const time = localStorage.getItem(this.STORAGE_KEY_MEMBER_DATA_TIME);
            return time ? parseInt(time) : 0;
        } catch (error) {
            console.error('获取成员数据时间失败:', error);
            return 0;
        }
    }
    
    // 位置历史记录
    static savePositionHistory(history) {
        try {
            localStorage.setItem(this.STORAGE_KEY_POSITION_HISTORY, JSON.stringify(history));
        } catch (error) {
            console.error('保存位置历史失败:', error);
        }
    }
    
    static loadPositionHistory() {
        try {
            const data = localStorage.getItem(this.STORAGE_KEY_POSITION_HISTORY);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            console.error('加载位置历史失败:', error);
            return null;
        }
    }
    
    // 位置历史堆栈（用于恢复上一步）
    static savePositionHistoryStack(stack) {
        try {
            // 只保留最近50步
            const limitedStack = stack.slice(-50);
            localStorage.setItem(this.STORAGE_KEY_POSITION_HISTORY_STACK, JSON.stringify(limitedStack));
        } catch (error) {
            console.error('保存位置历史堆栈失败:', error);
        }
    }
    
    static loadPositionHistoryStack() {
        try {
            const data = localStorage.getItem(this.STORAGE_KEY_POSITION_HISTORY_STACK);
            return data ? JSON.parse(data) : [];
        } catch (error) {
            console.error('加载位置历史堆栈失败:', error);
            return [];
        }
    }
    
    static clearPositionHistory() {
        try {
            localStorage.removeItem(this.STORAGE_KEY_POSITION_HISTORY);
            localStorage.removeItem(this.STORAGE_KEY_POSITION_HISTORY_STACK);
        } catch (error) {
            console.error('清空位置历史失败:', error);
        }
    }
    
    // 待调区成员
    static savePendingMembers(pendingMembers) {
        try {
            const data = pendingMembers.map(m => m.id);
            localStorage.setItem(this.STORAGE_KEY_PENDING_MEMBERS, JSON.stringify(data));
        } catch (error) {
            console.error('保存待调区成员失败:', error);
        }
    }
    
    static loadPendingMembers() {
        try {
            const data = localStorage.getItem(this.STORAGE_KEY_PENDING_MEMBERS);
            if (!data) return [];
            const memberIds = JSON.parse(data);
            // 注意：这里返回的是ID数组，需要在app.js中根据ID查找成员
            return memberIds;
        } catch (error) {
            console.error('加载待调区成员失败:', error);
            return [];
        }
    }
}

