/**
 * CloudBase 部署脚本
 * 策略: 创建按量计费环境 → 部署函数 → 开通HTTP → 提供访问链接
 */
const CloudBase = require('@cloudbase/manager-node');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const OLD_ENV_ID = 'georgezhu-0gnrnw9ae9fca59a';
const FUNCTION_NAME = 'echoworld';
const SECRET_ID = process.env.TCB_SECRET_ID;
const SECRET_KEY = process.env.TCB_SECRET_KEY;

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

  // 0. 检查现有环境
  console.log('\n[0] 检查现有环境...');
  const oldManager = new CloudBase({
    secretId: SECRET_ID,
    secretKey: SECRET_KEY,
    envId: OLD_ENV_ID,
  });

  let allEnvs = [];
  let targetEnvId = null;
  let targetManager = null;

  try {
    const envInfo = await oldManager.commonService().call({
      Action: 'DescribeEnvs',
      Param: {},
    });
    allEnvs = envInfo.EnvList || [];
    console.log(`  现有环境数: ${allEnvs.length}`);
    for (const env of allEnvs) {
      console.log(`  - ${env.EnvId} | ${env.PackageName} | ${env.PayMode} | ${env.Status}`);
    }

    // 查找是否已有按量计费环境
    const postpayEnv = allEnvs.find(e =>
      e.PayMode === 'postpay' || e.PayMode === 'postpayment' ||
      e.PackageName !== '体验版'
    );
    if (postpayEnv) {
      console.log(`  找到非体验版环境: ${postpayEnv.EnvId} (${postpayEnv.PackageName})`);
      targetEnvId = postpayEnv.EnvId;
    }
  } catch (err) {
    console.log('  查询环境:', err.message);
  }

  // 1. 如果没有按量计费环境，尝试创建
  if (!targetEnvId) {
    console.log('\n[1] 尝试创建按量计费环境...');
    const newEnvAlias = 'echoworld-app';

    // Try different CreatePostpayPackage parameter combinations
    const attempts = [
      { Source: 'qcloud', FreeQuota: 'basic', Alias: newEnvAlias },
      { Source: 'qcloud', FreeQuota: 'free', Alias: newEnvAlias },
      { Source: 'qcloud', Alias: newEnvAlias },
      { FreeQuota: 'basic', Alias: newEnvAlias },
    ];

    for (let i = 0; i < attempts.length; i++) {
      try {
        console.log(`  尝试 #${i + 1}:`, JSON.stringify(attempts[i]));
        const result = await oldManager.commonService().call({
          Action: 'CreatePostpayPackage',
          Param: attempts[i],
        });
        console.log('  创建成功:', JSON.stringify(result));
        if (result.EnvId) {
          targetEnvId = result.EnvId;
        } else if (result.TranId) {
          console.log('  交易ID:', result.TranId);
          // Wait for environment creation
          console.log('  等待环境创建...');
          await new Promise(r => setTimeout(r, 10000));
          // Re-check environments
          const envInfo2 = await oldManager.commonService().call({
            Action: 'DescribeEnvs',
            Param: {},
          });
          const newEnv = (envInfo2.EnvList || []).find(e => !allEnvs.some(o => o.EnvId === e.EnvId));
          if (newEnv) {
            targetEnvId = newEnv.EnvId;
            console.log('  新环境ID:', targetEnvId);
          }
        }
        break;
      } catch (err) {
        console.log(`  尝试 #${i + 1} 失败:`, err.message);
      }
    }
  }

  // 如果创建新环境失败，回退到旧环境
  if (!targetEnvId) {
    console.log('\n  无法创建新环境，使用旧环境:', OLD_ENV_ID);
    targetEnvId = OLD_ENV_ID;
  }

  console.log(`\n  目标环境: ${targetEnvId}`);

  targetManager = new CloudBase({
    secretId: SECRET_ID,
    secretKey: SECRET_KEY,
    envId: targetEnvId,
  });

  // 2. 打包函数代码
  console.log('\n[2/4] 打包函数代码...');
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
  console.log('\n[3/4] 部署云函数...');
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
    await targetManager.functions.createFunction(funcConfig);
    console.log('  云函数部署成功!');
  } catch (err) {
    if (err.message && err.message.includes('already exists')) {
      console.log('  函数已存在，尝试更新...');
      try {
        await targetManager.functions.deleteFunction({ functionName: FUNCTION_NAME });
        await new Promise(r => setTimeout(r, 2000));
        await targetManager.functions.createFunction(funcConfig);
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

  // 4. 开通 HTTP 访问 & 创建路由
  console.log('\n[4/4] 配置 HTTP 访问...');
  let httpEnabled = false;

  try {
    await targetManager.access.switchAuth(true);
    httpEnabled = true;
    console.log('  HTTP 服务已开通!');
  } catch (err) {
    console.log('  switchAuth:', err.message);
  }

  try {
    await targetManager.access.createAccess({
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

  // 也部署到静态托管
  try {
    const publicDir = path.join(projectDir, 'public');
    if (targetManager.hosting && typeof targetManager.hosting.uploadFiles === 'function') {
      await targetManager.hosting.uploadFiles({
        localPath: publicDir,
        cloudPath: '/',
      });
      console.log('  静态文件已上传');
    }
  } catch (err) {
    console.log('  静态托管:', err.message);
  }

  // 获取结果
  console.log('\n========================================');
  console.log('         部署结果');
  console.log('========================================');

  const fnList = await targetManager.functions.listFunctions().catch(() => null);
  if (fnList && fnList.Functions) {
    console.log('\n云函数:');
    for (const fn of fnList.Functions) {
      console.log(`  ${fn.FunctionName} | ${fn.Runtime} | ${fn.Status}`);
    }
  }

  let domain = '';
  try {
    const domainResult = await targetManager.access.getDomainList();
    domain = domainResult.DefaultDomain || '';
    httpEnabled = domainResult.EnableService === true;
    console.log('\n域名信息:', JSON.stringify(domainResult, null, 2));
  } catch (err) {}

  try {
    const gwList = await targetManager.access.getAccessList();
    console.log('\nHTTP 路由:');
    if (gwList && gwList.APISet) {
      for (const api of gwList.APISet) {
        console.log(`  ${api.Path} -> ${api.Name}`);
      }
    }
    console.log('  EnableService:', gwList.EnableService);
  } catch (err) {}

  // 获取静态托管域名
  let staticDomain = '';
  try {
    const envInfo = await targetManager.commonService().call({
      Action: 'DescribeEnvs',
      Param: { EnvId: targetEnvId },
    });
    if (envInfo.EnvList && envInfo.EnvList[0] && envInfo.EnvList[0].StaticStorages) {
      staticDomain = envInfo.EnvList[0].StaticStorages[0]?.StaticDomain || '';
    }
  } catch (err) {}

  const httpUrl = `https://${domain || targetEnvId + '.service.tcloudbase.com'}/echoworld`;

  // 测试 URL
  if (httpEnabled) {
    console.log(`\n测试: ${httpUrl}`);
    try {
      const resp = await httpGet(httpUrl);
      console.log(`  HTTP ${resp.statusCode}: ${resp.body.substring(0, 200)}`);
    } catch (err) {
      console.log(`  测试失败: ${err.message}`);
    }

    const apiUrl = `${httpUrl}/api/world/time`;
    console.log(`测试 API: ${apiUrl}`);
    try {
      const resp = await httpGet(apiUrl);
      console.log(`  HTTP ${resp.statusCode}: ${resp.body.substring(0, 200)}`);
    } catch (err) {
      console.log(`  API 测试失败: ${err.message}`);
    }
  }

  console.log('\n========================================');
  console.log(`  环境ID: ${targetEnvId}`);
  console.log(`  HTTP 服务: ${httpEnabled ? '✓ 已开通' : '✗ 未开通'}`);
  if (httpEnabled && domain) {
    console.log(`\n  ✓ 访问地址: https://${domain}/echoworld`);
    console.log(`  ✓ API地址: https://${domain}/echoworld/api/world`);
  }
  if (staticDomain) {
    console.log(`  静态托管: https://${staticDomain}`);
  }
  if (!httpEnabled) {
    console.log(`\n  HTTP 服务未开通，请在控制台手动开通:`);
    console.log(`  https://console.cloud.tencent.com/tcb/env/access?envId=${targetEnvId}`);
  }
  console.log('========================================');

  console.log(`\n控制台: https://console.cloud.tencent.com/tcb/env/overview?envId=${targetEnvId}`);
  console.log('\n=== 部署完成 ===');
}

deploy().catch(err => {
  console.error('\n部署失败:', err);
  process.exit(1);
});
