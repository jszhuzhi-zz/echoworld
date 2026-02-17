/**
 * CloudBase 部署脚本
 * 使用 @cloudbase/manager-node SDK 直接部署，绕过 CLI 的 webpack 限制
 */
const CloudBase = require('@cloudbase/manager-node');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ENV_ID = 'georgezhu-0gnrnw9ae9fca59a';
const FUNCTION_NAME = 'echoworld';
const SECRET_ID = process.env.TCB_SECRET_ID;
const SECRET_KEY = process.env.TCB_SECRET_KEY;

async function deploy() {
  console.log('=== CloudBase Deploy Script ===');

  if (!SECRET_ID || !SECRET_KEY) {
    throw new Error('TCB_SECRET_ID and TCB_SECRET_KEY must be set');
  }

  // 初始化 Manager
  const manager = new CloudBase({
    secretId: SECRET_ID,
    secretKey: SECRET_KEY,
    envId: ENV_ID,
  });

  // 1. 打包函数代码为 zip
  console.log('\n[1/5] 打包函数代码...');
  const distDir = path.resolve(__dirname, '..');
  const zipPath = '/tmp/echoworld-fn.zip';

  // 创建临时函数目录
  const fnDir = '/tmp/echoworld-fn';
  execSync(`rm -rf ${fnDir} && mkdir -p ${fnDir}`);

  // 复制 dist、package.json、public 目录
  execSync(`cp -r ${distDir}/dist ${fnDir}/`);
  execSync(`cp ${distDir}/package.json ${fnDir}/`);
  execSync(`cp ${distDir}/package-lock.json ${fnDir}/`);
  if (fs.existsSync(path.join(distDir, 'public'))) {
    execSync(`cp -r ${distDir}/public ${fnDir}/`);
  }

  // 在函数目录安装生产依赖
  execSync('npm ci --omit=dev', { cwd: fnDir, stdio: 'inherit' });

  // 创建 zip
  execSync(`cd ${fnDir} && zip -r ${zipPath} . -x "*.ts" "*.map"`, { stdio: 'inherit' });
  const zipBuffer = fs.readFileSync(zipPath);
  const base64Code = zipBuffer.toString('base64');
  console.log(`  ZIP 大小: ${(zipBuffer.length / 1024 / 1024).toFixed(2)} MB`);

  // 2. 创建或更新云函数
  console.log('\n[2/5] 部署云函数...');
  try {
    await manager.functions.createFunction({
      func: {
        name: FUNCTION_NAME,
        timeout: 30,
        runtime: 'Nodejs16.13',
        handler: 'dist/index.main_handler',
        envVariables: {
          ZHIPU_API_KEY: process.env.ZHIPU_API_KEY || '',
          ZHIPU_MODEL: 'glm-4-flash',
          TENCENTCLOUD_RUNENV: 'SCF',
        },
      },
      force: true,
      base64Code: base64Code,
    });
    console.log('  云函数创建/更新成功');
  } catch (err) {
    console.log('  创建失败，尝试更新代码...', err.message);
    try {
      await manager.functions.updateFunctionCode({
        func: { name: FUNCTION_NAME },
        base64Code: base64Code,
      });
      console.log('  云函数代码更新成功');
    } catch (err2) {
      console.error('  更新也失败:', err2.message);
      throw err2;
    }
  }

  // 3. 尝试开通 HTTP 访问服务
  console.log('\n[3/5] 开通 HTTP 访问服务...');
  try {
    const gwResult = await manager.commonService().call({
      Action: 'DescribeCloudBaseGWService',
      Param: { ServiceId: ENV_ID, EnvId: ENV_ID },
    });
    console.log('  HTTP 服务状态:', JSON.stringify(gwResult).substring(0, 200));
  } catch (err) {
    console.log('  查询 HTTP 服务状态失败:', err.message);
    // 尝试开通
    try {
      await manager.commonService().call({
        Action: 'EstablishCloudBaseRunServer',
        Param: { EnvId: ENV_ID },
      });
      console.log('  HTTP 服务开通请求已发送');
    } catch (err2) {
      console.log('  开通请求失败:', err2.message);
    }
  }

  // 4. 创建 HTTP 触发器（网关路由）
  console.log('\n[4/5] 创建 HTTP 访问路由...');
  try {
    await manager.commonService().call({
      Action: 'CreateCloudBaseGWAPI',
      Param: {
        ServiceId: ENV_ID,
        EnvId: ENV_ID,
        Path: '/echoworld',
        Type: 1, // 云函数
        Name: FUNCTION_NAME,
      },
    });
    console.log('  HTTP 路由 /echoworld -> echoworld 创建成功');
  } catch (err) {
    console.log('  创建路由:', err.message);
  }

  // 5. 获取访问域名
  console.log('\n[5/5] 获取访问信息...');
  try {
    const domainResult = await manager.commonService().call({
      Action: 'DescribeCloudBaseBuildService',
      Param: { EnvId: ENV_ID },
    });
    console.log('  域名信息:', JSON.stringify(domainResult).substring(0, 500));
  } catch (err) {
    console.log('  获取域名:', err.message);
  }

  // 输出结果
  const fnList = await manager.functions.listFunctions().catch(() => ({ Functions: [] }));
  console.log('\n=== 部署结果 ===');
  console.log('云函数列表:');
  if (fnList && fnList.Functions) {
    for (const fn of fnList.Functions) {
      console.log(`  - ${fn.FunctionName} (${fn.Runtime})`);
    }
  }
  console.log(`\n默认访问地址: https://${ENV_ID}.service.tcloudbase.com/echoworld`);
  console.log('腾讯云控制台: https://console.cloud.tencent.com/tcb/env/access?envId=' + ENV_ID);
  console.log('\n=== 部署完成 ===');
}

deploy().catch(err => {
  console.error('部署失败:', err);
  process.exit(1);
});
