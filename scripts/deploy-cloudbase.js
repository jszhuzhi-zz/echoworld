/**
 * CloudBase 部署脚本
 * 部署云函数 + 静态托管前端
 * 前端通过 CloudBase JS SDK 调用云函数，绕过 HTTP 服务限制
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
const STATIC_DOMAIN = 'georgezhu-0gnrnw9ae9fca59a-1398720149.tcloudbaseapp.com';

function httpGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { timeout: 10000 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
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
  console.log('\n[0] 获取环境信息...');
  let planName = '';
  try {
    const envInfo = await manager.commonService().call({
      Action: 'DescribeEnvs',
      Param: { EnvId: ENV_ID },
    });
    if (envInfo && envInfo.EnvList && envInfo.EnvList[0]) {
      const env = envInfo.EnvList[0];
      planName = env.PackageName || '';
      console.log(`  环境: ${env.EnvId} 状态: ${env.Status}`);
      console.log(`  套餐: ${planName}`);
    }
  } catch (err) {
    console.log('  获取环境信息:', err.message);
  }

  // 1. 配置匿名登录 (前端 SDK 需要)
  console.log('\n[1/5] 配置匿名登录...');

  // Try multiple API formats to enable anonymous login
  const loginApis = [
    { Action: 'CreateLoginConfig', Param: { EnvId: ENV_ID, Platform: 'ANONYMOUS', PlatformId: 'anonymous', Status: 'ENABLE' } },
    { Action: 'CreateLoginConfig', Param: { EnvId: ENV_ID, Platform: 'ANONYMOUS' } },
    { Action: 'ModifyCloudBaseGWPrivilege', Param: { EnvId: ENV_ID, EnableService: true } },
  ];

  for (const api of loginApis) {
    try {
      const result = await manager.commonService().call(api);
      console.log(`  ${api.Action} 成功:`, JSON.stringify(result));
    } catch (err) {
      console.log(`  ${api.Action}: ${err.message}`);
    }
  }

  // Check what login methods are available
  try {
    const loginConfigs = await manager.commonService().call({
      Action: 'DescribeLoginConfigs',
      Param: { EnvId: ENV_ID },
    });
    console.log('  登录配置:', JSON.stringify(loginConfigs, null, 2));
  } catch (err) {
    console.log('  DescribeLoginConfigs:', err.message);
  }

  // Check security rules for functions
  try {
    const secRules = await manager.commonService().call({
      Action: 'DescribeSmsQuotas',
      Param: { EnvId: ENV_ID },
    });
    console.log('  安全规则:', JSON.stringify(secRules, null, 2));
  } catch (err) {
    // Not critical
  }

  // Check auth domains (already configured from environment setup)
  try {
    const authDomains = await manager.commonService().call({
      Action: 'DescribeAuthDomains',
      Param: { EnvId: ENV_ID },
    });
    const domainList = authDomains.Domains || [];
    console.log(`  授权域名 (${domainList.length}个):`);
    for (const d of domainList) {
      console.log(`    ${d.Domain} (${d.Type}, ${d.Status})`);
    }
  } catch (err) {
    console.log('  DescribeAuthDomains:', err.message);
  }

  // 2. 打包函数代码
  console.log('\n[2/5] 打包函数代码...');
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

  const totalSize = execSync(`du -sh ${fnDir}`).toString().split('\t')[0];
  console.log(`  函数包大小: ${totalSize}`);

  // 3. 部署云函数
  console.log('\n[3/5] 部署云函数...');
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

  console.log('  使用 COS 上传方式...');
  try {
    await manager.functions.createFunction(funcConfig);
    console.log('  云函数部署成功!');
  } catch (err) {
    if (err.message && err.message.includes('already exists')) {
      console.log('  函数已存在，尝试更新...');
      try {
        await manager.functions.deleteFunction({ functionName: FUNCTION_NAME });
        console.log('  旧函数已删除');
        await new Promise(r => setTimeout(r, 2000));
        await manager.functions.createFunction(funcConfig);
        console.log('  云函数重新创建成功!');
      } catch (err2) {
        console.error('  重新创建失败:', err2.message);
        throw err2;
      }
    } else {
      console.error('  部署失败:', err.message);
      throw err;
    }
  }

  // 4. 部署静态托管 (前端面板)
  console.log('\n[4/5] 部署静态托管...');
  const publicDir = path.join(projectDir, 'public');

  try {
    // Try using hosting module
    if (manager.hosting && typeof manager.hosting.uploadFiles === 'function') {
      console.log('  使用 hosting.uploadFiles()...');
      await manager.hosting.uploadFiles({
        localPath: publicDir,
        cloudPath: '/',
      });
      console.log('  静态文件已上传');
    } else if (manager.hosting && typeof manager.hosting.deployFiles === 'function') {
      console.log('  使用 hosting.deployFiles()...');
      await manager.hosting.deployFiles({
        localPath: publicDir,
        cloudPath: '/',
      });
      console.log('  静态文件已部署');
    } else {
      // Try common service to upload to hosting
      console.log('  hosting 模块不可用，尝试其他方式...');
      console.log('  manager.hosting methods:', manager.hosting ? Object.keys(manager.hosting) : 'N/A');

      // List available methods on the hosting module
      if (manager.hosting) {
        const proto = Object.getPrototypeOf(manager.hosting);
        const methods = Object.getOwnPropertyNames(proto).filter(n => n !== 'constructor');
        console.log('  hosting prototype methods:', methods);
      }

      // Try calling hosting deploy via different method names
      const methodNames = ['uploadFiles', 'deployFiles', 'upload', 'deploy', 'uploadLocalFiles'];
      for (const method of methodNames) {
        if (manager.hosting && typeof manager.hosting[method] === 'function') {
          console.log(`  尝试 hosting.${method}()...`);
          try {
            await manager.hosting[method]({
              localPath: publicDir,
              cloudPath: '/',
            });
            console.log(`  hosting.${method}() 成功!`);
            break;
          } catch (e) {
            console.log(`  hosting.${method}(): ${e.message}`);
          }
        }
      }
    }
  } catch (err) {
    console.log('  静态托管部署:', err.message);
  }

  // Also try uploading via storage (COS) as fallback
  try {
    console.log('  检查静态托管状态...');
    const hostingInfo = await manager.commonService().call({
      Action: 'DescribeStaticStore',
      Param: { EnvId: ENV_ID },
    });
    console.log('  静态托管:', JSON.stringify(hostingInfo, null, 2));
  } catch (err) {
    console.log('  DescribeStaticStore:', err.message);
  }

  // 5. 配置 HTTP 访问 & 创建路由
  console.log('\n[5/5] 配置 HTTP 访问...');
  let httpEnabled = false;

  try {
    await manager.access.switchAuth(true);
    httpEnabled = true;
    console.log('  HTTP 访问服务已开通!');
  } catch (err) {
    console.log('  switchAuth:', err.message);
  }

  try {
    await manager.access.createAccess({
      path: '/echoworld',
      name: FUNCTION_NAME,
      type: 1,
      auth: false,
    });
    console.log('  路由 /echoworld -> echoworld 创建成功');
  } catch (err) {
    if (err.message && (err.message.includes('bindPath already') || err.message.includes('api created'))) {
      console.log('  路由 /echoworld 已配置');
    } else {
      console.log('  创建路由:', err.message);
    }
  }

  // 获取最终状态
  console.log('\n========================================');
  console.log('         部署结果');
  console.log('========================================');

  const fnList = await manager.functions.listFunctions().catch(() => null);
  if (fnList && fnList.Functions) {
    console.log('\n云函数:');
    for (const fn of fnList.Functions) {
      console.log(`  ${fn.FunctionName} | ${fn.Runtime} | ${fn.Status}`);
    }
  }

  // List uploaded hosting files
  try {
    if (manager.hosting && typeof manager.hosting.listFiles === 'function') {
      const files = await manager.hosting.listFiles();
      console.log('\n静态托管文件:', JSON.stringify(files, null, 2));
    }
  } catch (err) {
    console.log('  列出文件:', err.message);
  }

  // Test static hosting URL (with retries for CDN propagation)
  const staticUrl = `https://${STATIC_DOMAIN}`;
  console.log(`\n测试静态托管: ${staticUrl}`);
  for (let i = 0; i < 3; i++) {
    if (i > 0) {
      console.log(`  等待 ${i * 5} 秒后重试...`);
      await new Promise(r => setTimeout(r, i * 5000));
    }
    try {
      const resp = await httpGet(staticUrl);
      console.log(`  [尝试${i + 1}] HTTP ${resp.statusCode} (body length: ${resp.body.length})`);
      if (resp.body.length > 0) {
        console.log(`  Body preview: ${resp.body.substring(0, 300)}`);
      }
      if (resp.statusCode === 200) break;
    } catch (err) {
      console.log(`  [尝试${i + 1}] 测试失败: ${err.message}`);
    }
  }
  // Also test index.html explicitly
  try {
    const resp2 = await httpGet(`${staticUrl}/index.html`);
    console.log(`  /index.html: HTTP ${resp2.statusCode} (body length: ${resp2.body.length})`);
  } catch (err) {
    console.log(`  /index.html 测试: ${err.message}`);
  }

  // Test HTTP access URL
  let domain = '';
  try {
    const domainResult = await manager.access.getDomainList();
    domain = domainResult.DefaultDomain || '';
    httpEnabled = domainResult.EnableService === true;
  } catch (err) {}

  const httpUrl = `https://${domain || ENV_ID + '.service.tcloudbase.com'}/echoworld`;
  console.log(`\nHTTP 服务: ${httpEnabled ? '✓ 已开通' : '✗ 未开通'}`);

  console.log('\n========================================');
  console.log('  访问地址:');
  console.log(`  静态托管: https://${STATIC_DOMAIN}`);
  if (httpEnabled) {
    console.log(`  HTTP 访问: ${httpUrl}`);
  }
  console.log('========================================');

  console.log(`\n控制台: https://console.cloud.tencent.com/tcb/env/overview?envId=${ENV_ID}`);
  console.log('\n=== 部署完成 ===');
}

deploy().catch(err => {
  console.error('\n部署失败:', err);
  process.exit(1);
});
