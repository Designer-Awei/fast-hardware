#!/usr/bin/env node

/**
 * Fast Hardware - 跨平台错误处理工具
 * 提供平台特定的错误诊断和解决方案建议
 */

const os = require('os');
const fs = require('fs');
const path = require('path');

class CrossPlatformErrorHandler {
    constructor() {
        this.platform = os.platform();
        this.arch = os.arch();
        this.nodeVersion = process.version;
    }

    /**
     * 处理npm安装错误
     */
    handleNpmInstallError(error) {
        const errorMessage = error.message || '';
        const solutions = [];

        // 网络连接错误
        if (errorMessage.includes('ETIMEDOUT') || errorMessage.includes('ENOTFOUND')) {
            solutions.push({
                type: 'network',
                title: '网络连接问题',
                description: '无法连接到npm镜像源，可能是网络问题或镜像源配置问题',
                solutions: this.getNetworkSolutions()
            });
        }

        // 权限错误
        if (errorMessage.includes('EACCES') || errorMessage.includes('EPERM')) {
            solutions.push({
                type: 'permission',
                title: '权限不足',
                description: '没有足够的权限访问文件系统',
                solutions: this.getPermissionSolutions()
            });
        }

        // 磁盘空间错误
        if (errorMessage.includes('ENOSPC')) {
            solutions.push({
                type: 'disk_space',
                title: '磁盘空间不足',
                description: '磁盘空间不足，无法完成安装',
                solutions: this.getDiskSpaceSolutions()
            });
        }

        // Electron特定错误
        if (errorMessage.includes('electron')) {
            solutions.push({
                type: 'electron',
                title: 'Electron安装问题',
                description: 'Electron二进制文件下载或安装失败',
                solutions: this.getElectronSolutions()
            });
        }

        return {
            error: error,
            platform: this.platform,
            solutions: solutions.length > 0 ? solutions : [this.getGenericSolution()]
        };
    }

    /**
     * 处理构建错误
     */
    handleBuildError(error) {
        const errorMessage = error.message || '';
        const solutions = [];

        // Windows特定错误
        if (this.platform === 'win32') {
            if (errorMessage.includes('cl.exe') || errorMessage.includes('MSBuild')) {
                solutions.push({
                    type: 'build_tools',
                    title: '缺少Visual C++构建工具',
                    description: 'Windows平台需要Visual Studio Build Tools来编译原生模块',
                    solutions: [
                        '安装Visual Studio Build Tools：',
                        '  1. 下载Visual Studio Installer',
                        '  2. 选择"使用 C++ 的桌面开发"工作负载',
                        '  3. 或者安装独立的Build Tools：',
                        '     npm install --global windows-build-tools',
                        '  4. 重启命令提示符后重试'
                    ]
                });
            }
        }

        // macOS特定错误
        if (this.platform === 'darwin') {
            if (errorMessage.includes('xcode') || errorMessage.includes('Command Line Tools')) {
                solutions.push({
                    type: 'xcode',
                    title: '缺少Xcode命令行工具',
                    description: 'macOS平台需要Xcode Command Line Tools来编译原生模块',
                    solutions: [
                        '安装Xcode Command Line Tools：',
                        '  1. 运行: xcode-select --install',
                        '  2. 或者从App Store安装完整Xcode',
                        '  3. 接受Xcode许可证: sudo xcodebuild -license accept'
                    ]
                });
            }
        }

        // Linux特定错误
        if (this.platform === 'linux') {
            if (errorMessage.includes('gcc') || errorMessage.includes('g++')) {
                solutions.push({
                    type: 'gcc',
                    title: '缺少GCC编译器',
                    description: 'Linux平台需要GCC来编译原生模块',
                    solutions: [
                        'Ubuntu/Debian:',
                        '  sudo apt-get update',
                        '  sudo apt-get install build-essential',
                        '',
                        'CentOS/RHEL/Fedora:',
                        '  sudo yum groupinstall "Development Tools"',
                        '  或者: sudo dnf groupinstall "Development Tools"'
                    ]
                });
            }
        }

        return {
            error: error,
            platform: this.platform,
            solutions: solutions.length > 0 ? solutions : [this.getGenericBuildSolution()]
        };
    }

    /**
     * 处理运行时错误
     */
    handleRuntimeError(error) {
        const errorMessage = error.message || '';
        const solutions = [];

        // 端口占用错误
        if (errorMessage.includes('EADDRINUSE') || errorMessage.includes('端口')) {
            solutions.push({
                type: 'port',
                title: '端口被占用',
                description: '应用程序尝试使用的端口已被其他程序占用',
                solutions: [
                    '查找占用端口的进程：',
                    `  ${this.getPortCheckCommand()}`,
                    '',
                    '终止占用进程或使用不同端口：',
                    '  设置环境变量: PORT=不同的端口号',
                    '  或者修改应用程序配置'
                ]
            });
        }

        // 模块找不到错误
        if (errorMessage.includes('Cannot find module') || errorMessage.includes('MODULE_NOT_FOUND')) {
            solutions.push({
                type: 'module',
                title: '模块未找到',
                description: '缺少必要的依赖模块或模块路径配置错误',
                solutions: [
                    '重新安装依赖：',
                    '  rm -rf node_modules package-lock.json',
                    '  npm install',
                    '',
                    '检查模块名称是否正确',
                    '确认package.json中的依赖配置'
                ]
            });
        }

        return {
            error: error,
            platform: this.platform,
            solutions: solutions.length > 0 ? solutions : [this.getGenericRuntimeSolution()]
        };
    }

    /**
     * 获取网络问题的解决方案
     */
    getNetworkSolutions() {
        const solutions = [
            '检查网络连接：',
            '  ping 8.8.8.8',
            '  ping registry.npmmirror.com',
            '',
            '配置国内镜像源：',
            '  npm config set registry https://registry.npmmirror.com',
            '',
            '使用cnpm：',
            '  npm install -g cnpm --registry=https://registry.npmmirror.com',
            '  cnpm install',
            '',
            '清除npm缓存：',
            '  npm cache clean --force'
        ];

        if (this.platform === 'win32') {
            solutions.push(
                '',
                'Windows特定：',
                '  检查代理设置：',
                '    netsh winhttp show proxy',
                '  重置代理：',
                '    netsh winhttp reset proxy'
            );
        }

        return solutions;
    }

    /**
     * 获取权限问题的解决方案
     */
    getPermissionSolutions() {
        if (this.platform === 'win32') {
            return [
                'Windows权限解决方案：',
                '  1. 以管理员身份运行命令提示符',
                '  2. 右键点击"以管理员身份运行"',
                '  3. 或者修改文件夹权限',
                '',
                '检查文件夹权限：',
                '  icacls "项目文件夹" /grant Users:F /t'
            ];
        } else {
            return [
                'Unix/Linux/macOS权限解决方案：',
                '  1. 使用sudo运行命令（谨慎使用）',
                '  2. 修改文件夹权限：',
                `     chown -R ${os.userInfo().username} 项目文件夹`,
                '     chmod -R 755 项目文件夹',
                '  3. 检查当前用户是否有写入权限'
            ];
        }
    }

    /**
     * 获取磁盘空间问题的解决方案
     */
    getDiskSpaceSolutions() {
        const solutions = [
            '检查磁盘空间：'
        ];

        if (this.platform === 'win32') {
            solutions.push(
                '  dir C:\\',
                '  或使用文件资源管理器查看'
            );
        } else {
            solutions.push(
                '  df -h',
                '  du -sh * （查看当前目录各文件夹大小）'
            );
        }

        solutions.push(
            '',
            '清理磁盘空间：',
            '  删除不必要的文件和缓存',
            '  清空回收站/垃圾桶',
            '  卸载不需要的应用程序'
        );

        return solutions;
    }

    /**
     * 获取Electron特定问题的解决方案
     */
    getElectronSolutions() {
        const solutions = [
            '设置Electron镜像源：',
            '  npm config set electron_mirror https://npmmirror.com/mirrors/electron/',
            '  或使用环境变量：',
            '  ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ npm install',
            '',
            '手动下载Electron：',
            '  访问: https://npmmirror.com/mirrors/electron/',
            '  下载对应版本的electron二进制文件',
            '  放置到: ~/.electron 或 %USERPROFILE%\\.electron',
            '',
            '使用cnpm安装：',
            '  cnpm install electron'
        ];

        return solutions;
    }

    /**
     * 获取通用解决方案
     */
    getGenericSolution() {
        return {
            type: 'generic',
            title: '通用错误处理',
            description: '发生了未识别的错误，请尝试以下通用解决方案',
            solutions: [
                '重新尝试操作',
                '检查错误日志的详细信息',
                '搜索错误信息获取更多帮助',
                '联系技术支持'
            ]
        };
    }

    /**
     * 获取通用构建错误解决方案
     */
    getGenericBuildSolution() {
        return {
            type: 'generic_build',
            title: '构建工具问题',
            description: '编译原生模块时出现问题',
            solutions: [
                '确保已安装必要的构建工具：',
                `  ${this.getBuildToolsCommand()}`,
                '',
                '清理并重新构建：',
                '  npm run clean',
                '  rm -rf node_modules',
                '  npm install',
                '',
                '使用预编译的二进制包：',
                '  npm install --build-from-source=false'
            ]
        };
    }

    /**
     * 获取通用运行时错误解决方案
     */
    getGenericRuntimeSolution() {
        return {
            type: 'generic_runtime',
            title: '运行时错误',
            description: '应用程序运行时出现问题',
            solutions: [
                '检查应用程序日志',
                '验证配置文件是否正确',
                '确认所有依赖都已正确安装',
                '尝试重启应用程序',
                '检查系统资源是否充足'
            ]
        };
    }

    /**
     * 获取端口检查命令
     */
    getPortCheckCommand() {
        if (this.platform === 'win32') {
            return 'netstat -ano | findstr :端口号';
        } else {
            return 'lsof -i :端口号  或  netstat -tulpn | grep :端口号';
        }
    }

    /**
     * 获取构建工具安装命令
     */
    getBuildToolsCommand() {
        if (this.platform === 'win32') {
            return 'npm install --global windows-build-tools';
        } else if (this.platform === 'darwin') {
            return 'xcode-select --install';
        } else {
            return 'sudo apt-get install build-essential  (Ubuntu/Debian)';
        }
    }

    /**
     * 格式化错误信息输出
     */
    formatErrorOutput(errorResult) {
        let output = '';

        output += '🚨 错误诊断报告\n';
        output += '='.repeat(50) + '\n\n';

        output += `📋 错误类型: ${errorResult.error.name || '未知错误'}\n`;
        output += `💻 操作系统: ${errorResult.platform} (${this.arch})\n`;
        output += `📦 Node.js版本: ${this.nodeVersion}\n\n`;

        output += `❌ 错误信息: ${errorResult.error.message}\n\n`;

        if (errorResult.solutions && errorResult.solutions.length > 0) {
            output += '💡 解决方案:\n';
            output += '-'.repeat(30) + '\n';

            errorResult.solutions.forEach((solution, index) => {
                output += `${index + 1}. ${solution.title}\n`;
                output += `   ${solution.description}\n\n`;
                output += `   解决步骤:\n`;

                solution.solutions.forEach(step => {
                    if (step.trim() === '') {
                        output += '\n';
                    } else {
                        output += `   ${step}\n`;
                    }
                });
                output += '\n';
            });
        }

        output += '🔄 如果问题持续存在，请:\n';
        output += '   1. 查看完整错误日志\n';
        output += '   2. 搜索错误信息获取更多帮助\n';
        output += '   3. 联系技术支持\n\n';

        output += '📞 技术支持:\n';
        output += '   GitHub Issues: https://github.com/your-repo/issues\n';
        output += '   邮件支持: support@example.com\n';

        return output;
    }
}

// 导出类
module.exports = CrossPlatformErrorHandler;

// 如果直接运行此脚本，显示使用说明
if (require.main === module) {
    const handler = new CrossPlatformErrorHandler();

    console.log('🔧 Fast Hardware - 跨平台错误处理工具');
    console.log('=' .repeat(50));
    console.log('');
    console.log('使用方法:');
    console.log('  const ErrorHandler = require("./error-handler");');
    console.log('  const handler = new ErrorHandler();');
    console.log('');
    console.log('可用方法:');
    console.log('  handler.handleNpmInstallError(error)  - 处理npm安装错误');
    console.log('  handler.handleBuildError(error)       - 处理构建错误');
    console.log('  handler.handleRuntimeError(error)     - 处理运行时错误');
    console.log('  handler.formatErrorOutput(result)     - 格式化错误输出');
    console.log('');
    console.log('示例:');
    console.log('  try {');
    console.log('    // 某些可能出错的操作');
    console.log('  } catch (error) {');
    console.log('    const result = handler.handleNpmInstallError(error);');
    console.log('    console.log(handler.formatErrorOutput(result));');
    console.log('  }');
}
