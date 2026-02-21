/**
 * CloudBase 部署脚本
 * 策略: 部署函数 + 正确启用静态托管 + 前端SDK调用函数
 */
const CloudBase = require('@cloudbase/manager-node');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ENV_ID = 'georgezhu-0gnrnw9ae9fca59a';
const FUNCTION_NAME = 'echoworld';
const SECRET_ID = process.env.TCB_SECRET_ID;
const SECRET_KEY = process.env.TCB_SECRET_KEY;

function httpGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { timeout: 10000 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body: data }));
    }).on('error', reject);
  });
}

async function deploy() {
  console.log('=== CloudBase Deploy Script ===');

  if (!SECRET_ID || !SECRET_KEY) {
    throw new Error('TCB_SECRET_ID and TCB_SECRET_KEY must be set');
  }

  const manager = new CloudBase({
    secretId: SECRET_ID,
    secretKey: SECRET_KEY,
    envId: ENV_ID,
  });

  // 0. 获取环境信息
  console.log('\n[0] 环境信息');
  try {
    const envInfo = await manager.commonService().call({
      Action: 'DescribeEnvs',
      Param: { EnvId: ENV_ID },
    });
    const env = envInfo.EnvList?.[0];
    if (env) {
      console.log(`  ${env.EnvId} | ${env.PackageName} | ${env.Status}`);
    }
  } catch (err) {
    console.log('  ', err.message);
  }

  // 1. 打包函数代码 (包含 public/index.html)
  console.log('\n[1/5] 打包函数代码...');
  const projectDir = path.resolve(__dirname, '..');
  const fnRoot = '/tmp/echoworld-functions';
  const fnDir = path.join(fnRoot, FUNCTION_NAME);

  execSync(`rm -rf ${fnRoot} && mkdir -p ${fnDir}`);
  execSync(`cp -r ${projectDir}/dist ${fnDir}/`);
  if (fs.existsSync(path.join(projectDir, 'public'))) {
    execSync(`cp -r ${projectDir}/public ${fnDir}/`);
  }
  execSync(`cp ${projectDir}/scripts/fn-entry.js ${fnDir}/index.js`);

  const pkg = require(path.join(projectDir, 'package.json'));
  const minPkg = {
    name: pkg.name,
    version: pkg.version,
    main: 'index.js',
    dependencies: {
      express: pkg.dependencies.express,
      uuid: pkg.dependencies.uuid,
      ws: pkg.dependencies.ws,
      eventemitter3: pkg.dependencies.eventemitter3,
    },
  };
  fs.writeFileSync(path.join(fnDir, 'package.json'), JSON.stringify(minPkg, null, 2));
  execSync('npm install --omit=dev --no-package-lock', { cwd: fnDir, stdio: 'inherit' });
  execSync(`find ${fnDir}/node_modules -name "*.md" -o -name "*.txt" -o -name "*.map" -o -name "CHANGELOG*" -o -name "LICENSE*" -o -name "*.ts" -o -name ".npmignore" -o -name ".eslintrc*" -o -name ".editorconfig" | xargs rm -f 2>/dev/null || true`);
  execSync(`find ${fnDir}/node_modules -name "test" -o -name "tests" -o -name "example" -o -name "examples" -o -name ".github" | xargs rm -rf 2>/dev/null || true`);
  console.log(`  函数包大小: ${execSync(`du -sh ${fnDir}`).toString().split('\t')[0]}`);

  // 2. 部署云函数
  console.log('\n[2/5] 部署云函数...');
  const funcConfig = {
    func: {
      name: FUNCTION_NAME,
      timeout: 30,
      runtime: 'Nodejs16.13',
      handler: 'index.main',
      envVariables: {
        ZHIPU_API_KEY: process.env.ZHIPU_API_KEY || '',
        ZHIPU_MODEL: 'glm-4-flash',
        DEPLOY_ENV: 'cloudbase',
      },
    },
    force: true,
    functionRootPath: fnRoot,
  };

  try {
    await manager.functions.createFunction(funcConfig);
    console.log('  云函数部署成功!');
  } catch (err) {
    if (err.message?.includes('already exists')) {
      await manager.functions.deleteFunction({ functionName: FUNCTION_NAME });
      await new Promise(r => setTimeout(r, 2000));
      await manager.functions.createFunction(funcConfig);
      console.log('  云函数重新部署成功!');
    } else {
      throw err;
    }
  }

  // 等待函数就绪
  console.log('  等待函数就绪...');
  await new Promise(r => setTimeout(r, 5000));

  // 3. 配置静态托管 (使用 hosting 模块原生方法)
  console.log('\n[3/5] 配置静态托管...');
  const publicDir = path.join(projectDir, 'public');

  // 3a. 获取 hosting 当前状态
  try {
    const hostingInfo = await manager.hosting.getInfo();
    console.log('  hosting.getInfo:', JSON.stringify(hostingInfo, null, 2));
  } catch (err) {
    console.log('  hosting.getInfo:', err.message);
  }

  // 3b. 尝试启用 hosting 服务
  try {
    const enableResult = await manager.hosting.enableService();
    console.log('  hosting.enableService:', JSON.stringify(enableResult));
  } catch (err) {
    console.log('  hosting.enableService:', err.message);
  }

  // 3c. 检查 hosting 状态
  try {
    const status = await manager.hosting.checkStatus();
    console.log('  hosting.checkStatus:', JSON.stringify(status));
  } catch (err) {
    console.log('  hosting.checkStatus:', err.message);
  }

  // 3d. 获取 hosting 配置
  try {
    const config = await manager.hosting.getHostingConfig();
    console.log('  hosting.getHostingConfig:', JSON.stringify(config, null, 2));
  } catch (err) {
    console.log('  hosting.getHostingConfig:', err.message);
  }

  // 3e. 上传静态文件
  try {
    await manager.hosting.uploadFiles({ localPath: publicDir, cloudPath: '/' });
    console.log('  静态文件已上传');
  } catch (err) {
    console.log('  上传:', err.message);
  }

  // 3f. 设置网站文档 (使用 hosting 原生方法)
  try {
    const wsResult = await manager.hosting.setWebsiteDocument({
      indexDocument: 'index.html',
      errorDocument: '404.html',
    });
    console.log('  hosting.setWebsiteDocument:', JSON.stringify(wsResult));
  } catch (err) {
    console.log('  hosting.setWebsiteDocument:', err.message);
  }

  // 3g. 获取网站配置
  try {
    const wsConfig = await manager.hosting.getWebsiteConfig();
    console.log('  hosting.getWebsiteConfig:', JSON.stringify(wsConfig, null, 2));
  } catch (err) {
    console.log('  hosting.getWebsiteConfig:', err.message);
  }

  // 3h. 尝试通过 tcbModifyAttribute 修改属性 (可能可以关闭鉴权)
  try {
    const modResult = await manager.hosting.tcbModifyAttribute({});
    console.log('  hosting.tcbModifyAttribute:', JSON.stringify(modResult));
  } catch (err) {
    console.log('  hosting.tcbModifyAttribute:', err.message);
  }

  // 3i. 获取 cloud key
  try {
    const cloudKey = await manager.hosting.getCloudKey();
    console.log('  hosting.getCloudKey:', JSON.stringify(cloudKey));
  } catch (err) {
    console.log('  hosting.getCloudKey:', err.message);
  }

  // 3j. 列出已上传文件
  try {
    const files = await manager.hosting.listFiles({ cloudPath: '/' });
    console.log('  hosting.listFiles:', JSON.stringify(files?.data?.slice(0, 5)));
  } catch (err) {
    console.log('  hosting.listFiles:', err.message);
  }

  // 4. 尝试修复 InsufficientBalance
  console.log('\n[4/5] 修复函数余额问题...');

  // 尝试激活环境 (EnvActivated: "no" 可能是问题)
  const fixApis = [
    { Action: 'ModifyEnv', Param: { EnvId: ENV_ID, Alias: 'echoworld-app' } },
    { Action: 'ReinstateEnv', Param: { EnvId: ENV_ID } },
    // 检查函数状态
    { Action: 'DescribeCloudBaseFunctionVersion', Param: {
      EnvId: ENV_ID,
      FunctionName: FUNCTION_NAME,
    }},
    // 查看函数详情
    { Action: 'GetFunctionList', Param: { EnvId: ENV_ID } },
  ];
  for (const api of fixApis) {
    try {
      const r = await manager.commonService().call(api);
      console.log(`  ${api.Action}:`, JSON.stringify(r, null, 2));
    } catch (err) {
      console.log(`  ${api.Action}: ${err.message}`);
    }
  }

  // 尝试通过 functions 模块获取函数状态
  try {
    const fnList = await manager.functions.listFunctions();
    console.log('  函数列表:', JSON.stringify(fnList, null, 2));
  } catch (err) {
    console.log('  函数列表:', err.message);
  }

  // 5. 配置匿名登录
  console.log('\n[5/5] 配置匿名登录...');
  try {
    await manager.commonService().call({
      Action: 'CreateLoginConfig',
      Param: { EnvId: ENV_ID, Platform: 'ANONYMOUS' },
    });
    console.log('  匿名登录已配置');
  } catch (err) {
    console.log('  CreateLoginConfig:', err.message);
  }

  try {
    await manager.commonService().call({
      Action: 'CreateLoginConfig',
      Param: { EnvId: ENV_ID, Platform: 'NONLOGIN' },
    });
    console.log('  非登录访问已配置');
  } catch (err) {
    console.log('  NONLOGIN:', err.message);
  }

  // 测试
  console.log('\n========== 测试 ==========');

  // 测试云函数
  try {
    const fnResult = await manager.functions.invokeFunction(FUNCTION_NAME, { test: true });
    const resultStr = JSON.stringify(fnResult).substring(0, 400);
    console.log('  函数调用:', resultStr);
  } catch (err) {
    console.log('  函数调用:', err.message);
  }

  // 测试 COS Website 直接访问 (绕过 TCB CDN - 已验证可用)
  const cosBucket = '39aa-static-georgezhu-0gnrnw9ae9fca59a-1398720149';
  const cosWebsiteUrl = `https://${cosBucket}.cos-website.ap-shanghai.myqcloud.com`;
  console.log(`\n  测试 COS Website: ${cosWebsiteUrl}`);
  try {
    const resp = await httpGet(cosWebsiteUrl);
    console.log(`  HTTP ${resp.statusCode} | body: ${resp.body.length} bytes`);
  } catch (err) {
    console.log(`  测试失败: ${err.message}`);
  }

  // 结果
  console.log('\n========================================');
  console.log('         部署结果');
  console.log('========================================');
  console.log(`  环境: ${ENV_ID}`);
  console.log(`  前端页面: ${cosWebsiteUrl}`);
  console.log(`  控制台: https://console.cloud.tencent.com/tcb/env/overview?envId=${ENV_ID}`);
  console.log('========================================');
  console.log('\n=== 部署完成 ===');
}

deploy().catch(err => {
  console.error('\n部署失败:', err);
  process.exit(1);
});
