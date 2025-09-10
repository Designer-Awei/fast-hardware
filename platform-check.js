#!/usr/bin/env node

/**
 * Fast Hardware - 平台兼容性检测工具
 * 用于检测当前环境是否满足开发和运行要求
 */

const os = require('os');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class PlatformChecker {
    constructor() {
        this.platform = os.platform();
        this.arch = os.arch();
        this.nodeVersion = process.version;
        this.npmVersion = this.getNpmVersion();
        this.results = {
            platform: this.platform,
            arch: this.arch,
            nodeVersion: this.nodeVersion,
            npmVersion: this.npmVersion,
            checks: {},
            recommendations: []
        };
    }

    /**
     * 获取npm版本
     */
    getNpmVersion() {
        try {
            return execSync('npm --version', { encoding: 'utf8' }).trim();
        } catch (error) {
            return 'N/A';
        }
    }

    /**
     * 检查Node.js版本
     */
    checkNodeVersion() {
        const version = this.nodeVersion.replace('v', '').split('.')[0];
        const minVersion = 16;

        if (parseInt(version) >= minVersion) {
            this.results.checks.nodeVersion = { status: '✅', message: `Node.js ${this.nodeVersion} 版本符合要求` };
        } else {
            this.results.checks.nodeVersion = { status: '❌', message: `Node.js ${this.nodeVersion} 版本过低，需要 >= 16.0.0` };
            this.results.recommendations.push('请升级Node.js到16.0.0或更高版本');
        }
    }

    /**
     * 检查npm版本
     */
    checkNpmVersion() {
        if (this.npmVersion === 'N/A') {
            this.results.checks.npmVersion = { status: '❌', message: '无法检测npm版本' };
            this.results.recommendations.push('请确保npm已正确安装');
            return;
        }

        const version = this.npmVersion.split('.')[0];
        const minVersion = 7;

        if (parseInt(version) >= minVersion) {
            this.results.checks.npmVersion = { status: '✅', message: `npm ${this.npmVersion} 版本符合要求` };
        } else {
            this.results.checks.npmVersion = { status: '⚠️', message: `npm ${this.npmVersion} 版本较旧，建议升级到最新版本` };
            this.results.recommendations.push('建议升级npm到最新版本以获得更好的性能和安全性');
        }
    }

    /**
     * 检查Git
     */
    checkGit() {
        try {
            const version = execSync('git --version', { encoding: 'utf8' }).trim();
            this.results.checks.git = { status: '✅', message: version };
        } catch (error) {
            this.results.checks.git = { status: '❌', message: 'Git未安装或不在PATH中' };
            this.results.recommendations.push('请安装Git用于版本控制');
        }
    }

    /**
     * 检查Electron依赖
     */
    checkElectronDeps() {
        const packagePath = path.join(__dirname, 'package.json');
        const nodeModulesPath = path.join(__dirname, 'node_modules');

        if (!fs.existsSync(packagePath)) {
            this.results.checks.packageJson = { status: '❌', message: 'package.json文件不存在' };
            return;
        }

        try {
            const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
            const hasElectron = packageJson.devDependencies && packageJson.devDependencies.electron;

            if (hasElectron) {
                this.results.checks.electronDep = { status: '✅', message: `Electron ${packageJson.devDependencies.electron} 已配置` };
            } else {
                this.results.checks.electronDep = { status: '❌', message: 'package.json中未找到Electron依赖' };
                this.results.recommendations.push('请在package.json中添加Electron依赖');
            }

            if (fs.existsSync(nodeModulesPath)) {
                this.results.checks.nodeModules = { status: '✅', message: 'node_modules目录存在' };
            } else {
                this.results.checks.nodeModules = { status: '⚠️', message: 'node_modules目录不存在，需要运行npm install' };
                this.results.recommendations.push('请运行npm install安装依赖');
            }
        } catch (error) {
            this.results.checks.packageJson = { status: '❌', message: 'package.json文件格式错误' };
            this.results.recommendations.push('请检查package.json文件的格式');
        }
    }

    /**
     * 检查构建工具
     */
    checkBuildTools() {
        // 检查electron-builder
        try {
            execSync('npx electron-builder --version', { stdio: 'pipe' });
            this.results.checks.electronBuilder = { status: '✅', message: 'electron-builder可用' };
        } catch (error) {
            this.results.checks.electronBuilder = { status: '⚠️', message: 'electron-builder不可用，将在首次使用时安装' };
        }

        // 检查平台特定的构建要求
        if (this.platform === 'win32') {
            // Windows特定的检查
            this.checkWindowsBuildTools();
        } else if (this.platform === 'darwin') {
            // macOS特定的检查
            this.checkMacBuildTools();
        } else if (this.platform === 'linux') {
            // Linux特定的检查
            this.checkLinuxBuildTools();
        }
    }

    /**
     * 检查Windows构建工具
     */
    checkWindowsBuildTools() {
        // 检查Visual Studio Build Tools或其他C++编译器
        try {
            execSync('where cl', { stdio: 'pipe' });
            this.results.checks.buildTools = { status: '✅', message: 'Visual C++ Build Tools已安装' };
        } catch (error) {
            this.results.checks.buildTools = { status: '⚠️', message: '未检测到Visual C++ Build Tools' };
            this.results.recommendations.push('建议安装Visual Studio Build Tools以获得更好的Electron构建性能');
        }
    }

    /**
     * 检查macOS构建工具
     */
    checkMacBuildTools() {
        // 检查Xcode Command Line Tools
        try {
            execSync('xcode-select -p', { stdio: 'pipe' });
            this.results.checks.buildTools = { status: '✅', message: 'Xcode Command Line Tools已安装' };
        } catch (error) {
            this.results.checks.buildTools = { status: '⚠️', message: 'Xcode Command Line Tools未安装' };
            this.results.recommendations.push('请运行: xcode-select --install 安装Xcode Command Line Tools');
        }
    }

    /**
     * 检查Linux构建工具
     */
    checkLinuxBuildTools() {
        // 检查gcc和make
        try {
            execSync('gcc --version', { stdio: 'pipe' });
            execSync('make --version', { stdio: 'pipe' });
            this.results.checks.buildTools = { status: '✅', message: 'GCC和Make已安装' };
        } catch (error) {
            this.results.checks.buildTools = { status: '⚠️', message: 'GCC或Make未安装' };
            this.results.recommendations.push('请安装GCC和Make: sudo apt-get install build-essential (Ubuntu/Debian)');
        }
    }

    /**
     * 检查项目文件完整性
     */
    checkProjectIntegrity() {
        const requiredFiles = [
            'main.js',
            'index.html',
            'package.json',
            'README.md'
        ];

        const optionalFiles = [
            'preload.js',
            'cross-platform-runner.js'
        ];

        let missingRequired = [];
        let missingOptional = [];

        requiredFiles.forEach(file => {
            if (!fs.existsSync(path.join(__dirname, file))) {
                missingRequired.push(file);
            }
        });

        optionalFiles.forEach(file => {
            if (!fs.existsSync(path.join(__dirname, file))) {
                missingOptional.push(file);
            }
        });

        if (missingRequired.length > 0) {
            this.results.checks.requiredFiles = { status: '❌', message: `缺少必需文件: ${missingRequired.join(', ')}` };
            this.results.recommendations.push('项目文件不完整，请检查Git仓库');
        } else {
            this.results.checks.requiredFiles = { status: '✅', message: '所有必需文件都存在' };
        }

        if (missingOptional.length > 0) {
            this.results.checks.optionalFiles = { status: '⚠️', message: `缺少可选文件: ${missingOptional.join(', ')}` };
            this.results.recommendations.push('某些功能可能受限，建议补充缺失的可选文件');
        }
    }

    /**
     * 运行所有检查
     */
    async runAllChecks() {
        console.log('🔍 Fast Hardware 平台兼容性检测');
        console.log('=' .repeat(50));

        this.checkNodeVersion();
        this.checkNpmVersion();
        this.checkGit();
        this.checkElectronDeps();
        this.checkBuildTools();
        this.checkProjectIntegrity();

        this.displayResults();
    }

    /**
     * 显示检测结果
     */
    displayResults() {
        console.log('\n📊 检测结果:');
        console.log('-'.repeat(50));

        // 显示基本信息
        console.log(`🖥️  操作系统: ${this.platform} (${this.arch})`);
        console.log(`📦 Node.js: ${this.nodeVersion}`);
        console.log(`📦 npm: ${this.npmVersion}`);
        console.log('');

        // 显示检查结果
        Object.entries(this.results.checks).forEach(([key, result]) => {
            console.log(`${result.status} ${this.formatCheckName(key)}: ${result.message}`);
        });

        // 显示建议
        if (this.results.recommendations.length > 0) {
            console.log('\n💡 建议:');
            console.log('-'.repeat(50));
            this.results.recommendations.forEach(rec => {
                console.log(`• ${rec}`);
            });
        }

        // 显示总结
        const errorCount = Object.values(this.results.checks).filter(r => r.status === '❌').length;
        const warningCount = Object.values(this.results.checks).filter(r => r.status === '⚠️').length;

        console.log('\n🎯 总结:');
        console.log('-'.repeat(50));

        if (errorCount === 0 && warningCount === 0) {
            console.log('✅ 环境完全符合要求，可以开始开发！');
        } else if (errorCount === 0) {
            console.log('⚠️  环境基本可用，但有一些警告需要注意');
        } else {
            console.log('❌ 存在错误需要解决后才能正常开发');
        }

        console.log('');
    }

    /**
     * 格式化检查项名称
     */
    formatCheckName(key) {
        const nameMap = {
            nodeVersion: 'Node.js版本',
            npmVersion: 'npm版本',
            git: 'Git版本控制',
            electronDep: 'Electron依赖',
            nodeModules: 'Node模块',
            electronBuilder: 'Electron构建器',
            buildTools: '构建工具',
            requiredFiles: '必需文件',
            optionalFiles: '可选文件',
            packageJson: '包配置文件'
        };

        return nameMap[key] || key;
    }
}

// 如果直接运行此脚本
if (require.main === module) {
    const checker = new PlatformChecker();
    checker.runAllChecks().catch(error => {
        console.error('❌ 检测过程中发生错误:', error.message);
        process.exit(1);
    });
}

module.exports = PlatformChecker;
