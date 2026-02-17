/**
 * CloudBase 部署脚本
 * 使用 @cloudbase/manager-node SDK 部署云函数到腾讯云开发
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

  // 1. 打包函数代码
  console.log('\n[1/4] 打包函数代码...');
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

  // 2. 部署云函数
  console.log('\n[2/4] 部署云函数...');
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

  // 3. 开通 HTTP 访问服务 & 创建路由
  console.log('\n[3/4] 配置 HTTP 访问...');
  let httpEnabled = false;

  try {
    await manager.access.switchAuth(true);
    httpEnabled = true;
    console.log('  HTTP 访问服务已开通');
  } catch (err) {
    console.log('  HTTP 服务开通失败:', err.message);
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

  // 4. 获取部署结果
  console.log('\n[4/4] 获取部署结果...');
  const fnList = await manager.functions.listFunctions().catch(() => null);

  console.log('\n========================================');
  console.log('         部署结果');
  console.log('========================================');

  if (fnList && fnList.Functions) {
    console.log('\n云函数:');
    for (const fn of fnList.Functions) {
      console.log(`  ${fn.FunctionName} | ${fn.Runtime} | ${fn.Status}`);
    }
  }

  try {
    const gwList = await manager.access.getAccessList();
    console.log('\nHTTP 路由:');
    if (gwList && gwList.APISet) {
      for (const api of gwList.APISet) {
        console.log(`  ${api.Path} -> ${api.Name}`);
      }
    }
    httpEnabled = gwList.EnableService === true;
  } catch (err) {}

  let domain = '';
  try {
    const domainResult = await manager.access.getDomainList();
    domain = domainResult.DefaultDomain || '';
    httpEnabled = domainResult.EnableService === true;
  } catch (err) {}

  console.log(`\nHTTP 服务: ${httpEnabled ? '✓ 已开通' : '✗ 未开通'}`);

  if (httpEnabled && domain) {
    console.log(`\n========================================`);
    console.log(`  访问地址: https://${domain}/echoworld`);
    console.log(`  API: https://${domain}/echoworld/api/world`);
    console.log(`========================================`);
  } else {
    console.log(`\n========================================`);
    console.log(`  云函数已部署成功，但 HTTP 服务未开通。`);
    console.log(`  当前套餐: ${planName} (体验版不支持 HTTP 访问服务)`);
    console.log('');
    console.log(`  开通方式:`);
    console.log(`  1. 访问 CloudBase 控制台:`);
    console.log(`     https://console.cloud.tencent.com/tcb/env/access?envId=${ENV_ID}`);
    console.log(`  2. 在「HTTP 访问服务」页面，点击开通`);
    console.log(`     (可能需要升级套餐为按量计费/包年包月)`);
    console.log(`  3. 开通后访问地址为:`);
    console.log(`     https://${domain || ENV_ID + '.service.tcloudbase.com'}/echoworld`);
    console.log(`========================================`);
  }

  console.log(`\n控制台: https://console.cloud.tencent.com/tcb/env/access?envId=${ENV_ID}`);
  console.log('\n=== 部署完成 ===');
}

deploy().catch(err => {
  console.error('\n部署失败:', err);
  process.exit(1);
});
