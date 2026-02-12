// 数据模型

// 成员模型
class Member {
    constructor(name = '', className = '', power = 0, notes = '') {
        this.id = this.generateId();
        this.name = name;
        this.class = className;
        this.power = power;
        this.notes = notes;
        this.isLeader = false;
        this.isEye = false;
        this.isExpert = false;
        this.isDataGood = false;
        this.isLocked = false;
        this.assignedTeamId = null;
        this.battleHistory = []; // 帮战历史数据
        this.squadIndex = null; // 所在小队索引（1-5）
        this.slotIndex = null; // 所在槽位索引（1-6）
    }

    generateId() {
        return 'member_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    getTagsDisplay() {
        const tags = [];
        if (this.isLeader) tags.push('👑');
        if (this.isEye) tags.push('👁️');
        if (this.isExpert) tags.push('🎮');
        if (this.isDataGood) tags.push('📊');
        return tags.join(' ');
    }

    getPriorityScore() {
        // 优先级：总战力 > 操作手标记 > 数据优异标记
        // 使用大数值确保优先级顺序：战力(最大可能值) > 操作手(1000000) > 数据好(100000)
        let score = this.power; // 总战力作为基础分数
        if (this.isExpert) score += 1000000; // 操作手标记
        if (this.isDataGood) score += 100000; // 数据优异标记
        return score;
    }

    static fromJSON(json) {
        const member = new Member(json.name, json.class, json.power, json.notes);
        Object.assign(member, json);
        // 确保battleHistory存在
        if (!member.battleHistory) {
            member.battleHistory = [];
        }
        return member;
    }
}

// 团队模型
class Team {
    constructor(name = '新团队', maxMembers = 30, roleTemplateId = null) {
        this.id = this.generateId();
        this.name = name;
        this.maxMembers = maxMembers;
        this.roleTemplateId = roleTemplateId;
        this.members = [];
    }

    generateId() {
        return 'team_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    get currentCount() {
        return this.members.length;
    }

    get isFull() {
        return this.currentCount >= this.maxMembers;
    }

    get remainingSlots() {
        return Math.max(0, this.maxMembers - this.currentCount);
    }

    getLeader() {
        return this.members.find(m => m.isLeader);
    }

    getClassDistribution() {
        const distribution = {};
        this.members.forEach(member => {
            distribution[member.class] = (distribution[member.class] || 0) + 1;
        });
        return distribution;
    }

    addMember(member) {
        if (this.isFull) return false;
        if (this.members.find(m => m.id === member.id)) return false;
        
        member.assignedTeamId = this.id;
        this.members.push(member);
        return true;
    }

    removeMember(member) {
        const index = this.members.findIndex(m => m.id === member.id);
        if (index === -1) return false;
        
        member.assignedTeamId = null;
        this.members.splice(index, 1);
        return true;
    }

    static fromJSON(json) {
        const team = new Team(json.name, json.maxMembers, json.roleTemplateId);
        team.id = json.id;
        team.members = json.members.map(m => Member.fromJSON(m));
        return team;
    }
}

// 职责模板模型
class RoleTemplate {
    constructor(name, classDistribution = {}, isHighPressure = false) {
        this.id = this.generateId();
        this.name = name;
        this.classDistribution = classDistribution;
        this.totalMembers = Object.values(classDistribution).reduce((sum, val) => sum + val, 0);
        this.isHighPressure = isHighPressure;
    }

    generateId() {
        return 'template_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    getClassGaps(currentDistribution) {
        const gaps = {};
        Object.keys(this.classDistribution).forEach(className => {
            const current = currentDistribution[className] || 0;
            const target = this.classDistribution[className];
            const gap = target - current;
            if (gap > 0) {
                gaps[className] = gap;
            }
        });
        return gaps;
    }

    static createDefaultTemplates() {
        return [
            new RoleTemplate('主攻团', {
                '神相': 4,
                '玄机': 4,
                '素问': 6,
                '铁衣': 3,
                '血河': 3,
                '九灵': 3,
                '龙吟': 1,
                '碎梦': 1,
                '补位': 5
            }, true),
            
            new RoleTemplate('防守团', {
                '铁衣': 3,
                '血河': 3,
                '素问': 4,
                '神相': 3,
                '玄机': 3,
                '九灵': 4,
                '补位': 10
            }, false),
            
            new RoleTemplate('机动团', {
                '玄机': 5,
                '神相': 4,
                '九灵': 3,
                '潮光': 2,
                '云瑶': 2,
                '补位': 8
            }, true),
            
            new RoleTemplate('辅攻团', {
                '神相': 3,
                '玄机': 3,
                '素问': 4,
                '铁衣': 3,
                '血河': 3,
                '九灵': 3,
                '龙吟': 2,
                '碎梦': 2,
                '补位': 7
            }, true),
            
            new RoleTemplate('打野团', {
                '玄机': 4,
                '神相': 3,
                '九灵': 2,
                '碎梦': 2,
                '补位': 1
            }, true),
            
            new RoleTemplate('中路团', {
                '素问': 4,
                '铁衣': 3,
                '血河': 3,
                '神相': 4,
                '玄机': 4,
                '补位': 6
            }, false)
        ];
    }

    static fromJSON(json) {
        const template = new RoleTemplate(json.name, json.classDistribution, json.isHighPressure);
        template.id = json.id;
        template.totalMembers = json.totalMembers;
        return template;
    }
}

// 职业颜色映射
const ClassColorMap = {
    '神相': 'shenxiang',
    '玄机': 'xuanji',
    '素问': 'suwen',
    '铁衣': 'tieyi',
    '血河': 'xuehe',
    '九灵': 'jiuling',
    '龙吟': 'longyin',
    '碎梦': 'suimeng',
    '潮光': 'chaoguang',
    '云瑶': 'yunyao',
    '鸿音': 'hongyin',
    '荒羽': 'huangyu',
    '沧澜': 'canglan',
    '补位': 'buwei'
};

// 职业名称标准化映射
const ClassNameMap = {
    // 全称
    '神相': '神相', '玄机': '玄机', '素问': '素问', '铁衣': '铁衣', '血河': '血河',
    '九灵': '九灵', '龙吟': '龙吟', '碎梦': '碎梦', '潮光': '潮光', '云瑶': '云瑶',
    '鸿音': '鸿音', '荒羽': '荒羽', '沧澜': '沧澜', // 新增职业
    // 简称
    '神': '神相', '玄': '玄机', '素': '素问', '铁': '铁衣', '血': '血河',
    '九': '九灵', '龙': '龙吟', '碎': '碎梦', '潮': '潮光', '云': '云瑶',
    '鸿': '鸿音', '荒': '荒羽', '沧': '沧澜',
    // 拼音首字母
    'sx': '神相', 'xj': '玄机', 'sw': '素问', 'ty': '铁衣', 'xh': '血河',
    'jl': '九灵', 'ly': '龙吟', 'sm': '碎梦', 'cg': '潮光', 'yy': '云瑶',
    'hy': '鸿音', 'huangyu': '荒羽', 'cl': '沧澜',
    // 拼音全拼
    'shenxiang': '神相', 'xuanji': '玄机', 'suwen': '素问', 'tieyi': '铁衣', 'xuehe': '血河',
    'jiuling': '九灵', 'longyin': '龙吟', 'suimeng': '碎梦', 'chaoguang': '潮光', 'yunyao': '云瑶',
    'hongyin': '鸿音', 'huangyu': '荒羽', 'canglan': '沧澜'
};

function normalizeClassName(className) {
    if (!className || !className.trim()) return '补位';
    
    const normalized = className.trim();
    const normalizedLower = normalized.toLowerCase();
    
    // 精确匹配（先匹配原始大小写，再匹配小写）
    if (ClassNameMap[normalized]) {
        return ClassNameMap[normalized];
    }
    if (ClassNameMap[normalizedLower]) {
        return ClassNameMap[normalizedLower];
    }
    
    // 模糊匹配（优先匹配较长的键，避免误匹配）
    const sortedKeys = Object.keys(ClassNameMap).sort((a, b) => b.length - a.length);
    for (const key of sortedKeys) {
        if (normalizedLower.includes(key.toLowerCase()) || key.toLowerCase().includes(normalizedLower)) {
            return ClassNameMap[key];
        }
    }
    
    return '补位';
}

function parsePower(powerStr) {
    if (!powerStr) return 0;
    
    const str = powerStr.toString().trim().toLowerCase();
    
    // 直接解析整数
    const directParse = parseInt(str);
    if (!isNaN(directParse) && str === directParse.toString()) {
        return directParse;
    }
    
    // 处理 "2.8w" 格式
    const wMatch = str.match(/(\d+\.?\d*)\s*w/);
    if (wMatch) {
        return Math.floor(parseFloat(wMatch[1]) * 10000);
    }
    
    // 处理 "2.8k" 格式
    const kMatch = str.match(/(\d+\.?\d*)\s*k/);
    if (kMatch) {
        return Math.floor(parseFloat(kMatch[1]) * 1000);
    }
    
    // 提取所有数字
    const digits = str.replace(/\D/g, '');
    if (digits) {
        return parseInt(digits) || 0;
    }
    
    return 0;
}

